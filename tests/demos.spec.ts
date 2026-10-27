import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// /demos/ must mirror public/demos/manifest.json exactly (the same manifest feeds Discord #demos).
const manifest = JSON.parse(readFileSync(new URL('../public/demos/manifest.json', import.meta.url), 'utf8'))
const SITE = 'https://aknewknowledge.com'

test('demos page renders every manifest demo with a working play link', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/demos/')
  await expect(page).toHaveTitle('Demos | A Knew Knowledge')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(manifest.forum.title.replace(' by', 'by'))
  const cards = page.locator('.demo-card')
  await expect(cards).toHaveCount(manifest.demos.length)

  for (const [i, d] of manifest.demos.entries()) {
    const card = cards.nth(i)
    await expect(card).toHaveAttribute('id', d.id)
    await expect(card.getByRole('heading', { level: 2 })).toContainText(d.title)
    await expect(card).toContainText(d.lead)
    await expect(card).toContainText(d.status)
    for (const t of d.tags) await expect(card.locator('.demo-tags')).toContainText(t)
    const img = card.getByRole('img', { name: d.image.alt })
    await expect(img).toBeVisible()
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0 || el.loading === 'lazy')).toBe(true)
    const play = card.getByRole('link', { name: new RegExp(d.play.label) })
    const href = d.play.url.slice(SITE.length)
    await expect(play).toHaveAttribute('href', href)
    expect((await request.get(href)).status()).toBe(200)
    expect((await request.get(d.image.src)).status()).toBe(200)
  }
  expect((await request.get('/demos/manifest.json')).status()).toBe(200)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(errors).toEqual([])
})

test('demos is linked from the main nav and the play page', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Demos' }).click()
  } else {
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Demos' }).click()
  }
  await expect(page).toHaveURL(/\/demos\/$/)
  await page.goto('/play/')
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Demos' }).click()
  } else {
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Demos' }).click()
  }
  await expect(page).toHaveURL(/\/demos\/$/)
  await expect(page.getByRole('navigation', { name: 'Demos navigation' }).getByRole('link', { name: 'Demos' })).toHaveAttribute('aria-current', 'page')
})
