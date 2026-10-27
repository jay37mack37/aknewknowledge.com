import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// /play/ is the arcade hub in the main-site design system; each build plays full-screen
// on its own page. These run against `vite preview` (the built dist/ that deploys).

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

async function noHorizontalOverflow(page: Page) {
  const g = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }))
  expect(g.scroll).toBeLessThanOrEqual(g.width)
}

test('arcade hub lists all three builds plus Online in the site design and links each one', async ({ page, request }) => {
  const errors = watchErrors(page)
  await page.goto('/play/')
  await expect(page).toHaveTitle('Play | A Knew Knowledge')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Three builds.One maze.')
  // Same header component as the home page, with Play marked current.
  await expect(page.locator('.site-header .brand')).toBeVisible()
  const builds = page.locator('.build-card')
  await expect(builds).toHaveCount(4)
  for (const [name, href] of [
    ['Play Maze Runner: Final', '/play/final/'],
    ['Play Maze Runner Online', '/play/online/'],
    ['Play online with friends', '/play/online/'],
    ['Play Maze Runner', '/play/game/'],
    ['Play AFTERHOURS', '/play/afterhours/'],
  ] as const) {
    const link = page.getByRole('link', { name, exact: true })
    await expect(link).toHaveAttribute('href', href)
    expect((await request.get(href)).status()).toBe(200)
  }
  // Thumbnails all load (no broken images).
  const broken = await page.$$eval('.build-shot img', (imgs) => imgs.filter((i) => !(i as HTMLImageElement).complete || (i as HTMLImageElement).naturalWidth === 0).length)
  expect(broken).toBe(0)
  await noHorizontalOverflow(page)
  expect(errors).toEqual([])
})

test('/play/ reflows at 320px with nothing clipped', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/play/')
  const over = await page.$$eval('main *', (els) => els.filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5 && getComputedStyle(e).position !== 'absolute').map((e) => e.className || e.tagName).slice(0, 5))
  expect(over).toEqual([])
  await noHorizontalOverflow(page)
})

test('Fancy site button sits in the header (or mobile menu) of home and /play/', async ({ page, isMobile }) => {
  for (const path of ['/', '/play/']) {
    await page.goto(path)
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      const link = page.locator('#mobile-nav').getByRole('link', { name: /Fancy site/ })
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/potential/')
      // The pill is also visible next to the menu button on phones.
      await expect(page.locator('.header-actions .fancy-link')).toBeVisible()
    } else {
      const link = page.locator('.header-actions .fancy-link')
      await expect(link).toBeVisible()
      await expect(link).toHaveAttribute('href', '/potential/')
    }
  }
})

test('home Arcade card and the fancy site both link the game demo', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('.play-card')
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByRole('link', { name: /Play all three/ })).toHaveAttribute('href', '/play/')

  await page.goto('/potential/')
  const arcade = page.locator('.project-play')
  await arcade.scrollIntoViewIfNeeded()
  await expect(arcade.getByRole('heading', { level: 3 })).toContainText('Three builds.')
  await arcade.getByRole('link', { name: /Play the arcade/ }).click()
  await expect(page).toHaveURL(/\/play\/$/)
})

test('final build plays solo: keyboard, arrows and swipe all steer, no network, no errors', async ({ page, isMobile }, info) => {
  const errors = watchErrors(page)
  const offOrigin: string[] = []
  const origin = new URL(info.project.use.baseURL ?? 'http://127.0.0.1:4173').origin
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) offOrigin.push(u) })
  await page.goto('/play/final/')
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'solo')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /connect-src 'none'/)
  const play = page.getByRole('button', { name: 'PLAY' })
  await expect(play).toBeVisible()
  await play.click()
  await expect(page.locator('#hud')).toBeVisible()
  await page.waitForFunction(() => (window as any).game?.player && (window as any).game.latestSnapshot)
  expect(await page.evaluate(() => Boolean((window as any).renderer.renderer.getContext()))).toBe(true)

  const pos = () => page.evaluate(() => { const p = (window as any).game.player; return `${p.x.toFixed(2)},${p.y.toFixed(2)}` })
  // The runner moves on its own; score climbs as it eats pellets.
  await expect.poll(() => page.evaluate(() => (window as any).game.score), { timeout: 30_000 }).toBeGreaterThan(0)

  if (isMobile) {
    const up = page.getByRole('button', { name: 'Keep going' })
    await expect(up).toBeVisible()
    const box = (await up.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(64)
    for (const name of ['Turn left', 'Turn right', 'Turn around']) await expect(page.getByRole('button', { name })).toBeVisible()
    // Turn around by arrow, then by swipe: the facing angle flips each time.
    const angle = () => page.evaluate(() => (window as any).game.player.currentAngle)
    // Retried because a ghost can catch the idle runner (respawn ignores input briefly).
    const flips = async (act: () => Promise<void>) => {
      await expect(async () => {
        const a = await angle()
        await act()
        await expect.poll(async () => Math.cos((await angle()) - a), { timeout: 1_500 }).toBeLessThan(-0.8)
      }).toPass({ timeout: 20_000 })
    }
    await flips(() => page.getByRole('button', { name: 'Turn around' }).tap())
    // A long swipe (150px, many move events) is still exactly one turn-around.
    await flips(() => page.evaluate(() => {
      const el = document.getElementById('game-container')!
      const o = { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true }
      el.dispatchEvent(new PointerEvent('pointerdown', { ...o, clientX: 200, clientY: 250 }))
      for (let y = 260; y <= 400; y += 10) window.dispatchEvent(new PointerEvent('pointermove', { ...o, clientX: 200, clientY: y }))
      window.dispatchEvent(new PointerEvent('pointerup', { ...o, clientX: 200, clientY: 400 }))
    }))
  } else {
    await expect(page.locator('#mobile-controls')).toBeHidden()
    const before = await pos()
    await page.keyboard.press('ArrowDown')
    await expect.poll(pos, { timeout: 10_000 }).not.toBe(before)
  }

  // Pause really pauses in solo mode.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('dialog', { name: 'PAUSED' })).toBeVisible()
  // Modal: focus starts on RESUME and Tab never reaches the controls behind the overlay.
  await expect(page.getByRole('button', { name: 'RESUME' })).toBeFocused()
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('#hud, #mobile-controls')))).toBe(false)
  }
  await page.getByRole('button', { name: 'RESUME' }).focus()
  await page.waitForTimeout(400) // let interpolation settle on the last snapshot
  const frozen = await pos()
  await page.waitForTimeout(600)
  expect(await pos()).toBe(frozen)
  await page.getByRole('button', { name: 'RESUME' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  await noHorizontalOverflow(page)
  expect(offOrigin).toEqual([])
  expect(errors).toEqual([])
})

test('earlier builds still load and render', async ({ page }) => {
  for (const path of ['/play/game/', '/play/afterhours/']) {
    const errors = watchErrors(page)
    const res = await page.goto(path)
    expect(res!.status()).toBe(200)
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  }
})
