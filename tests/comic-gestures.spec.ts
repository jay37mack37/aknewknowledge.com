import { test, expect, type Page } from '@playwright/test'

const readerURL = '/preview/comics/reader/'

test('broad center tap advances instead of enlarging', async ({ page, isMobile }) => {
  await page.goto(readerURL)
  await expect(page.locator('#page')).toBeVisible()
  const area = page.locator('#story')
  const box = await area.boundingBox()
  if (!box) throw new Error('Reading area missing')
  const x = box.x + box.width * 0.6
  const y = Math.min(box.y + 220, 500)
  if (isMobile) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
  await expect(page.locator('#count')).toContainText('Page 1 of 15')
  await expect(page.locator('#zoom')).not.toBeVisible()
})

async function ready(page: Page) {
  await expect(page.locator('#page')).toBeVisible()
  await expect.poll(() => page.locator('#page').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
}

test.describe('trusted touch gestures', () => {
  test.use({ hasTouch: true })

  for (const large of [false, true]) {
    test(`one swipe, no turns for scroll, pinch, long press or drag-return (${large ? 'large' : 'normal'})`, async ({ page }) => {
      await page.goto(readerURL)
      if (large) await page.locator('#mode-toggle').click()
      await page.locator('#next').click()
      await ready(page)
      const session = await page.context().newCDPSession(page)
      const area = await page.locator('#story').boundingBox()
      if (!area) throw new Error('No reading area')
      const y = area.y + 160
      const x = area.x + area.width * 0.7
      const count = page.locator('#count')
      const start = await count.innerText()
      const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id?: number }[]) => session.send('Input.dispatchTouchEvent', { type, touchPoints: points })
      // A long press may open the browser context menu but must not navigate.
      await send('touchStart', [{ x, y }])
      await page.waitForTimeout(650)
      await send('touchEnd', [])
      await expect(count).toHaveText(start)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(800)
      // Excursion must be tracked, not only the final start/end delta.
      await send('touchStart', [{ x, y }])
      await send('touchMove', [{ x, y: y + 45 }])
      await send('touchMove', [{ x, y }])
      await send('touchEnd', [])
      await expect(count).toHaveText(start)
      await page.waitForTimeout(800)
      // Two fingers, including lifting one first, must never become a swipe.
      await send('touchStart', [{ x, y, id: 1 }, { x: x - 100, y, id: 2 }])
      await send('touchMove', [{ x: x + 20, y, id: 1 }, { x: x - 120, y, id: 2 }])
      await send('touchEnd', [{ x: x + 20, y, id: 1 }])
      await send('touchMove', [{ x: x - 100, y, id: 1 }])
      await send('touchEnd', [])
      await expect(count).toHaveText(start)
      // Reset browser viewport zoom between the native pinch and horizontal swipe.
      await page.reload()
      await ready(page)
      // Chromium restores page-scale asynchronously after navigation.
      await page.waitForTimeout(800)
      await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
      await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(1)
      const fresh = await page.locator('#story').boundingBox()
      if (!fresh) throw new Error('No reading area after reload')
      const swipeX = fresh.x + fresh.width * 0.7
      const swipeY = fresh.y + 160
      await send('touchStart', [{ x: swipeX, y: swipeY }])
      for (let step = 1; step <= 6; step++) await send('touchMove', [{ x: swipeX - step * 20, y: swipeY }])
      await page.waitForTimeout(150)
      await send('touchEnd', [])
      await expect(count).toContainText(large ? 'Panel 2 of' : 'Page 2 of 15')
      const after = await count.innerText()
      await page.locator('#story').dispatchEvent('click', { bubbles: true, detail: 1, clientX: x, clientY: y })
      await expect(count).toHaveText(after)
      await expect(page.locator('#zoom')).not.toBeVisible()
    })
  }
})


test('fit width, visual overview and clear saved-place restart work independently', async ({ page }) => {
  await page.goto('/aknewcomic/')
  await page.locator('#next').click()
  const original = await page.evaluate(() => JSON.stringify(localStorage))
  await page.goto(readerURL)
  await page.locator('#options-toggle').click()
  await page.locator('#fit-width').click()
  await expect(page.locator('body')).toHaveClass(/fit-width/)
  await page.locator('#overview-toggle').click()
  await expect(page.locator('#overview button')).toHaveCount(16)
  await page.locator('#overview button').nth(5).click()
  await expect(page.locator('#count')).toHaveText('Page 5 of 15')
  await page.reload()
  await expect(page.locator('#count')).toHaveText('Page 5 of 15')
  await expect(page.locator('body')).toHaveClass(/fit-width/)
  await page.locator('#options-toggle').click()
  await expect(page.locator('#saved-place')).toContainText('Saved here: Page 5 of 15')
  await page.locator('#restart').click()
  await expect(page.locator('#count')).toHaveText('Cover · Issue #1')
  const production = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.includes('.preview.')))))
  expect(production).toBe(original)
  await page.goto('/aknewcomic/')
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
})


for (const large of [false, true]) {
  test(`broad zones, boundaries, keyboard and explicit enlargement (${large ? 'large' : 'normal'})`, async ({ page, isMobile }) => {
    await page.goto(readerURL)
    if (large) await page.locator('#mode-toggle').click()
    const tap = async (fraction: number) => {
      await ready(page)
      const box = await page.locator('#story').boundingBox()
      if (!box) throw new Error('No reading area')
      const x = box.x + box.width * fraction
      const y = box.y + 160
      if (isMobile) await page.touchscreen.tap(x, y)
      else await page.mouse.click(x, y)
    }
    await tap(0.05)
    await expect(page.locator('#count')).toHaveText('Cover · Issue #1')
    await expect(page.locator('#zoom')).not.toBeVisible()
    await tap(0.6)
    await expect(page.locator('#count')).toContainText('Page 1 of 15')
    await tap(0.6)
    await expect(page.locator('#count')).toContainText(large ? 'Panel 2 of' : 'Page 2 of 15')
    await tap(0.32)
    await expect(page.locator('#count')).toContainText(large ? 'Panel 1 of' : 'Page 1 of 15')
    await tap(0.34)
    await expect(page.locator('#count')).toContainText(large ? 'Panel 2 of' : 'Page 2 of 15')
    const count = await page.locator('#count').innerText()
    await page.locator('#enlarge').click()
    await expect(page.locator('#zoom')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#count')).toHaveText(count)
    await page.locator('#fit').click()
    await expect(page.locator('#zoom-scroll')).toHaveClass(/actual/)
    await page.locator('#close').click()
    await expect(page.locator('#zoom')).not.toBeVisible()
    await page.locator('#art').focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#zoom')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#count')).not.toHaveText(count)
    await expect(page.locator('#story')).toBeFocused()
    await page.locator('#options-toggle').click()
    await page.locator('#page-select').selectOption('15')
    if (large) await page.locator('#page-view').click()
    await expect(page.locator('#next')).toBeDisabled()
    await page.locator('#options-toggle').click()
    await tap(0.9)
    await expect(page.locator('#count')).toHaveText('Page 15 of 15')
    await expect(page.locator('#zoom')).not.toBeVisible()
  })
}

test('native vertical scroll leaves the saved page unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto(readerURL)
  await page.locator('#next').click()
  await page.locator('#options-toggle').click()
  await page.locator('#fit-width').click()
  await page.locator('#options-toggle').click()
  await ready(page)
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setTouchEmulationEnabled', { enabled: true })
  const before = await page.locator('#count').innerText()
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 450 }] })
  for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 450 - step * 25 }] })
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50)
  await expect(page.locator('#count')).toHaveText(before)
})

test('candidate layout and diagrams are readable at phone widths', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/preview/comics/')
    await expect(page.getByRole('heading', { name: 'More story. Less aiming.' })).toBeVisible()
    await expect(page.locator('svg')).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Open the normal reader' })).toHaveAttribute('href', '/aknewcomic/')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`preview-${width}.png`), fullPage: true })
    await page.getByRole('link', { name: 'Try the preview reader' }).click()
    await ready(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`reader-${width}.png`), fullPage: true })
    await page.locator('#mode-toggle').click()
    await page.locator('#next').click()
    await ready(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`large-${width}.png`), fullPage: true })
    await page.locator('#mode-toggle').click()
    await page.locator('#options-toggle').click()
    await page.locator('#overview-toggle').click()
    await page.screenshot({ path: testInfo.outputPath(`overview-${width}.png`), fullPage: true })
  }
  expect(errors).toEqual([])
})

test('candidate metadata and image failures keep the reader recoverable', async ({ page }) => {
  await page.route('**/pages/01.webp', (route) => route.abort())
  await page.goto(readerURL)
  await page.locator('#next').click()
  await expect(page.locator('#status')).toContainText('This image could not load')
  await expect(page.locator('#next')).toBeEnabled()
  await page.locator('#mode-toggle').click()
  await expect(page.locator('#transcript')).toBeVisible()
  await page.route('**/aknewcomic/issue.json', (route) => route.fulfill({ contentType: 'application/json', body: '{}' }))
  await page.reload()
  await expect(page.locator('#status')).toContainText('The comic could not open')
  await expect(page.locator('#next')).toBeDisabled()
  await page.locator('#options-toggle').click()
  await expect(page.locator('.download')).toHaveAttribute('href', 'issue-01.pdf')
})
