import { expect, test, type Page } from '@playwright/test'

test('panel reading gives the actual story large selectable text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/aknewcomic/')
  await page.getByRole('button', { name: 'Large text mode' }).click()
  await page.getByRole('button', { name: 'Read issue' }).click()
  await expect(page.getByRole('button', { name: 'Panel view' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#count')).toContainText('Page 1 of 15 · Panel 1 of')
  await expect(page.locator('.scene')).toBeVisible()
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.locator('#count')).toContainText('Panel 2 of')
  await expect(page.locator('.words')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.locator('#count')).toContainText('Panel 3 of')
  await expect(page.locator('.words').first()).toBeVisible()
  expect(await page.locator('.words').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28)
  await page.getByRole('button', { name: 'Whole page' }).click()
  await expect(page.locator('#transcript')).toContainText('I believe in you.')
})

test('comic cover has large unobstructed iPhone reading controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/aknewcomic/?mode=accessible')
  await expect(page.getByRole('button', { name: 'Large text mode' })).toHaveAttribute('aria-pressed', 'true')
  const read = page.getByRole('button', { name: 'Read issue', exact: false })
  await expect(read).toBeVisible()
  const box = await read.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(56)
  expect(await read.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20)
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(width.scroll).toBeLessThanOrEqual(width.client)
})

const pageCount = (n: number) => (n === 0 ? 'Cover · Issue #1' : `Page ${n} of 15`)

async function noSideways(page: Page) {
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(width.scroll).toBeLessThanOrEqual(width.client)
}

async function decoded(page: Page) {
  await expect(page.locator('#art')).toBeVisible()
  expect(await page.locator('#page').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
}

test('normal layout reads all sixteen full pages as art only', async ({ page, request }) => {
  const issue = await (await request.get('/aknewcomic/issue.json')).json()
  expect(issue.pages).toHaveLength(16)
  await page.goto('/aknewcomic/')
  for (let n = 0; n < 16; n++) {
    await expect(page.locator('#count')).toHaveText(pageCount(n))
    await expect(page.locator('#page')).toHaveAttribute('src', issue.pages[n].src)
    await decoded(page)
    await expect(page.locator('#transcript')).toBeHidden()
    await expect(page.locator('.words')).toHaveCount(0)
    await expect(page.locator('#view-controls')).toBeHidden()
    if (n < 15) await page.locator('#next').click()
  }
  await expect(page.getByRole('button', { name: 'Finished ✓' })).toBeDisabled()
  await expect(page.locator('#ending')).toBeVisible()
  await page.getByRole('button', { name: '← Back' }).click()
  await expect(page.locator('#count')).toHaveText('Page 14 of 15')
})

test('normal layout: edge taps turn, center enlarges, arrows and focus behave', async ({ page }) => {
  await page.goto('/aknewcomic/')
  await decoded(page)
  const art = page.locator('#art')
  const tap = async (fraction: number) => {
    const box = await art.boundingBox()
    if (!box) throw new Error('art not visible')
    await art.click({ position: { x: box.width * fraction, y: box.height / 2 } })
  }
  await tap(0.92)
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
  await decoded(page)
  await tap(0.92)
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await decoded(page)
  await tap(0.08)
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
  await decoded(page)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await tap(0.5)
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('#zoom-page')).toHaveAttribute('src', /pages\/01\.webp$/)
  await page.getByRole('button', { name: 'Actual size' }).click()
  await expect(page.locator('#zoom-scroll')).toHaveClass(/actual/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(art).toBeFocused()
  // Keyboard activation always enlarges instead of guessing an edge.
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close ✕' }).click()
  await expect(art).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await expect(page.locator('#story')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
  await page.reload()
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
})

test.describe('touch', () => {
  test.use({ hasTouch: true })

  test('swipes turn pages without opening zoom', async ({ page }) => {
    await page.goto('/aknewcomic/?mode=comic')
    await page.locator('#next').click()
    await decoded(page)
    const box = await page.locator('#art').boundingBox()
    if (!box) throw new Error('art not visible')
    const y = box.y + box.height / 2
    const cdp = await page.context().newCDPSession(page)
    const swipe = async (from: number, to: number) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] })
      for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + ((to - from) * step) / 6, y }] })
      // Lift after a short hold so Chromium does not start a fling that would swallow the later tap.
      await page.waitForTimeout(150)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    await swipe(box.x + box.width * 0.8, box.x + box.width * 0.2)
    await expect(page.locator('#count')).toHaveText('Page 2 of 15')
    await decoded(page)
    await swipe(box.x + box.width * 0.2, box.x + box.width * 0.8)
    await expect(page.locator('#count')).toHaveText('Page 1 of 15')
    await decoded(page)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    // Some browsers synthesize a click at the end of a swipe; it must not turn again or zoom.
    await page.locator('#art').evaluate((art) => {
      const box = art.getBoundingClientRect()
      const y = box.top + box.height / 2
      const point = (x: number) => new Touch({ identifier: 1, target: art, clientX: x, clientY: y })
      const start = point(box.left + box.width * 0.8)
      const end = point(box.left + box.width * 0.2)
      art.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }))
      art.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }))
      art.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: box.left + box.width / 2, clientY: y }))
    })
    await expect(page.locator('#count')).toHaveText('Page 2 of 15')
    await expect(page.getByRole('dialog')).not.toBeVisible()
    await decoded(page)
    // Wait out the short post-swipe click guard before a deliberate tap.
    await page.waitForTimeout(800)
    await page.locator('#art').tap()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})

test('Large text mode toggles both ways, persists, deep links and ignores old v2 preferences', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('aknewcomic.issue01.reader.final.v2', JSON.stringify({ pageIndex: 5, panelIndex: 2, view: 'panel', textSize: 40 }))
    }
  })
  await page.goto('/aknewcomic/')
  const toggle = page.getByRole('button', { name: 'Large text mode' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#count')).toHaveText('Cover · Issue #1')
  await page.locator('#next').click()
  await page.locator('#next').click()
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toBeFocused()
  await expect(page.locator('#count')).toHaveText(/^Page 2 of 15 · Panel 1 of \d+$/)
  await expect(page.locator('.scene')).toBeVisible()
  await expect(page.locator('.scene')).toHaveCSS('font-size', '36px')
  expect((await page.locator('#next').boundingBox())?.height).toBeGreaterThanOrEqual(56)
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#count')).toHaveText(/^Page 2 of 15 · Panel 1 of/)
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await expect(page.locator('#transcript')).toBeHidden()
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await page.goto('/aknewcomic/?mode=accessible')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#transcript')).toBeVisible()
  await toggle.click()
  await expect(page).toHaveURL(/\/aknewcomic\/$/)
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
})

test('normal layout fits without sideways scroll and keeps small tidy controls', async ({ page }) => {
  for (const [width, height] of [[320, 700], [390, 844], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/aknewcomic/')
    await decoded(page)
    await noSideways(page)
    await page.locator('#next').click()
    await decoded(page)
    await noSideways(page)
    for (const control of ['#prev', '#next', '#mode-toggle', '#options-toggle']) {
      const box = await page.locator(control).boundingBox()
      expect(box?.height).toBeGreaterThanOrEqual(32)
      expect(box?.height).toBeLessThanOrEqual(48)
    }
    const art = await page.locator('#page').boundingBox()
    const bar = await page.locator('.reading-bar').boundingBox()
    expect(art && bar && art.y + art.height).toBeLessThanOrEqual((bar?.y ?? 0) + 1)
    expect(art?.x).toBeGreaterThanOrEqual(0)
    expect((art?.x ?? 0) + (art?.width ?? 0)).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await expect(page.locator('#size-row')).toBeHidden()
    await expect(page.getByRole('link', { name: 'Download Issue #1' })).toHaveAttribute('href', 'issue-01.pdf')
    await noSideways(page)
  }
})

test('normal layout broken page art keeps navigation and points to Large text mode', async ({ page }) => {
  await page.route('**/pages/01.webp', (route) => route.abort())
  await page.goto('/aknewcomic/')
  await page.locator('#next').click()
  await expect(page.locator('#status')).toContainText('This image could not load')
  await expect(page.locator('#status')).toContainText('Large text mode')
  await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Next →', exact: true }).click()
  await expect(page.locator('#count')).toHaveText('Page 2 of 15')
  await decoded(page)
})
