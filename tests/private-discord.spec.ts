import { readFileSync, readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// v2: public pages must not invite visitors into the private guild.
const invite = /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)/i
const join = /join\s+(?:the\s+)?(?:discord\s+community|community|a knew knowledge)|same demos, live in discord/i
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const textFiles = (dir: string) => readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(?:html|js|json|ts|mjs)$/.test(path))
  .map((path) => `${dir}/${path}`)

test('affected source and all shipped text assets have no private-guild invitations', () => {
  const files = [
    ...textFiles('src'), 'index.html', 'potential/index.html', 'demos/index.html',
    'scripts/demos.mjs', 'public/demos/manifest.json', ...textFiles('dist'),
  ]
  const violations = files.filter((path) => invite.test(read(path)) || join.test(read(path)))
  expect(violations, 'Remove invitations at source, not only from the visible DOM').toEqual([])
})

for (const path of ['/', '/demos/', '/potential/']) {
  test(`${path} renders without private-guild links or join CTAs`, async ({ page, request }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.goto(path)
    await expect(page.locator('h1')).toBeVisible()
    expect((await request.get(path)).status()).toBe(200)
    expect(await page.locator('a[href]').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).not.toEqual(expect.arrayContaining([expect.stringMatching(invite)]))
    expect(await page.locator('body').innerText()).not.toMatch(join)
    // Includes hidden controls and JSON-LD, not just currently visible links.
    expect(await page.content()).not.toMatch(invite)
    await expect(page.locator('.discord-card, .footer-discord, .demos-discord')).toHaveCount(0)
    if (path !== '/demos/') {
      await page.locator('#community').scrollIntoViewIfNeeded()
      await expect(page.locator('#community h2')).toBeVisible()
      await expect(page.locator('#community a[href="https://github.com/jay37mack37"]').first()).toBeVisible()
    } else {
      await expect(page.locator('.demo-card')).toHaveCount(JSON.parse(read('public/demos/manifest.json')).demos.length)
      await page.locator('.demo-card').last().scrollIntoViewIfNeeded()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(errors).toEqual([])
    await testInfo.attach('private-guild-removal', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' })
  })
}

test('public manifest omits invitations but keeps the internal demo publishing records', async ({ request }) => {
  const response = await request.get('/demos/manifest.json')
  expect(response.status()).toBe(200)
  const text = await response.text()
  expect(text).not.toMatch(invite)
  const manifest = JSON.parse(text)
  expect(manifest.forum.discord).not.toHaveProperty('invite')
  expect(manifest.forum.discord.channel_id).toMatch(/^\d+$/)
  expect(manifest.forum.discord.url).toContain('/channels/')
  for (const demo of manifest.demos) {
    expect(demo.discord.thread_id).toMatch(/^\d+$/)
    expect(demo.play.url).toMatch(/^https:\/\/aknewknowledge\.com\/play\//)
    expect((await request.get(new URL(demo.play.url).pathname)).status()).toBe(200)
  }
})
