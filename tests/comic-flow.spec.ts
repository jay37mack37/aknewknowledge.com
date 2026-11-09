import { expect, test, type Page } from '@playwright/test'

// The panel and transcript reader is now Large text mode; these checks enter it explicitly.
async function enterLargeText(page: Page) {
  const toggle = page.getByRole('button', { name: 'Large text mode' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
}

test('default layout is a normal comic: cover, then full page art with no transcript', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/aknewcomic/')
  await expect(page.getByRole('button', { name: 'Large text mode' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('#count')).toHaveText('Cover · Issue #1')
  await page.getByRole('button', { name: 'Read issue' }).click()
  await expect(page.locator('#count')).toHaveText('Page 1 of 15')
  await expect(page.locator('#page')).toHaveAttribute('src', 'pages/01.webp')
  await expect(page.locator('#transcript')).toBeHidden()
  await expect(page.locator('#view-controls')).toBeHidden()
  for (const control of ['#prev', '#next', '#mode-toggle', '#options-toggle']) {
    const height = (await page.locator(control).boundingBox())?.height ?? 0
    expect(height).toBeGreaterThanOrEqual(32)
    expect(height).toBeLessThanOrEqual(48)
  }
})

test('every real panel reads in order from cover through the ending', async ({ page, request }) => {
  const issue = await (await request.get('/aknewcomic/issue.json')).json()
  expect(issue.schema).toBe('aknewcomic-issue/2')
  expect(issue.pages).toHaveLength(16)
  await page.goto('/aknewcomic/')
  await enterLargeText(page)
  await page.getByRole('button', { name: 'Read issue' }).click()
  let steps = 0
  for (let n = 1; n <= 15; n++) {
    const panels = issue.pages[n].panels
    expect(panels.length).toBeGreaterThan(0)
    for (let p = 0; p < panels.length; p++) {
      await expect(page.locator('#count')).toHaveText(`Page ${n} of 15 · Panel ${p + 1} of ${panels.length}`)
      await expect(page.locator('.scene')).toHaveText(panels[p].description)
      await expect(page.locator('#page')).toHaveJSProperty('complete', true)
      expect(await page.locator('#page').evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      await expect(page.locator('.words')).toHaveText(panels[p].dialogue.map((line: { text: string }) => line.text))
      steps++
      if (n !== 15 || p !== panels.length - 1) await page.getByRole('button', { name: 'Next →', exact: true }).click()
    }
  }
  expect(steps).toBeGreaterThanOrEqual(45)
  await expect(page.getByRole('button', { name: 'Finished ✓' })).toBeDisabled()
  await expect(page.locator('#ending')).toBeVisible()
  await page.getByRole('link', { name: 'AKnewComic cover' }).click()
  await expect(page.getByRole('button', { name: 'Read issue' })).toBeVisible()
})

test('large type, page choice, keyboard and zoom work across reloads', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/aknewcomic/')
  await enterLargeText(page)
  await page.getByRole('button', { name: 'Read issue' }).click()
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  for (let n = 0; n < 4; n++) await page.getByRole('button', { name: 'Larger story text' }).click()
  await page.getByRole('combobox', { name: 'Go to page' }).selectOption('5')
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await page.getByRole('button', { name: 'Whole page', exact: true }).click()
  await expect(page.locator('.words').first()).toHaveCSS('font-size', '44px')
  await page.reload()
  await expect(page.locator('#count')).toHaveText('Page 5 of 15')
  await expect(page.getByRole('button', { name: 'Whole page' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.words').first()).toHaveCSS('font-size', '44px')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy()
  for (const control of ['#prev', '#next', '#options-toggle', '#mode-toggle', '#page-view', '#panel-view']) {
    expect((await page.locator(control).boundingBox())?.height).toBeGreaterThanOrEqual(56)
  }
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#count')).toHaveText('Page 6 of 15')
  await page.getByRole('button', { name: 'Enlarge comic art' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Actual size' }).click()
  await expect(page.locator('#zoom-scroll')).toHaveClass(/actual/)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Enlarge comic art' })).toBeFocused()
})

test('broken images preserve the actual story text and navigation', async ({ page }) => {
  await page.route('**/panels/01-01.webp', (route) => route.abort())
  await page.goto('/aknewcomic/')
  await enterLargeText(page)
  await page.getByRole('button', { name: 'Read issue' }).click()
  await expect(page.locator('#status')).toContainText('This image could not load')
  await expect(page.locator('.scene')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next →', exact: true })).toBeEnabled()
})

test('partial panel metadata is rejected instead of opening a dead-end reader', async ({ page, request }) => {
  const issue = await (await request.get('/aknewcomic/issue.json')).json()
  delete issue.pages[9].panels
  await page.route('**/aknewcomic/issue.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(issue) }))
  await page.goto('/aknewcomic/')
  await expect(page.locator('#status')).toContainText('The comic could not open')
  await expect(page.locator('#next')).toBeDisabled()
})

test('keyboard page turns keep a meaningful focus target after zoom', async ({ page }) => {
  await page.goto('/aknewcomic/')
  await enterLargeText(page)
  await page.getByRole('button', { name: 'Read issue' }).click()
  await page.getByRole('button', { name: 'Whole page', exact: true }).click()
  await page.getByRole('button', { name: 'Enlarge comic art' }).click()
  await page.getByRole('button', { name: 'Close ✕' }).click()
  await expect(page.locator('#art')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('#story')).toBeFocused()
})

test('invalid issue metadata fails clearly with a PDF alternative', async ({ page }) => {
  await page.route('**/aknewcomic/issue.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"pages":[]}' }))
  await page.goto('/aknewcomic/')
  await expect(page.locator('#status')).toContainText('The comic could not open')
  await expect(page.locator('#next')).toBeDisabled()
  await page.getByRole('button', { name: 'Options', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Download Issue #1' })).toHaveAttribute('href', 'issue-01.pdf')
})
