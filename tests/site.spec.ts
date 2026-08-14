import { expect, test } from '@playwright/test'

test('renders the complete landing page and interactive links', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')

  await expect(page).toHaveTitle(/A Knew Knowledge/)
  await expect(page.getByRole('heading', { name: /Some knowledge is not learned/i })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'A Knew Knowledge' })).toBeVisible()
  const discordLink = page.getByRole('link', { name: /Join A Knew Knowledge on Discord/i })
  await expect(discordLink).toHaveAttribute('href', 'https://discord.gg/zaUzpeBv6')
  await expect(discordLink.locator('.discord-logo')).toBeVisible()
  await expect(page.getByRole('img', { name: /Cover of A Knew Knowledge/i })).toBeVisible()
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://aknewknowledge.com/AknewLogo.png')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('link', { name: /Thalia/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Hoopla/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Smashwords/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Fable/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Jarrod Womack/ })).toHaveAttribute('href', 'mailto:jarrod.womack@aknewknowledge.com')
  await expect(page.getByRole('link', { name: /Javell Samuel/ })).toHaveAttribute('href', 'mailto:javellsamuel@aknewknowledge.com')

  const readTab = page.getByRole('tab', { name: /Read/ })
  const listenTab = page.getByRole('tab', { name: /Listen/ })
  const readPanel = page.getByRole('tabpanel', { name: /Read/ })
  const listenPanel = page.getByRole('tabpanel', { name: /Listen/ })

  await expect(readPanel).toBeVisible()
  await expect(listenPanel).toBeHidden()
  await listenTab.click()
  await expect(readTab).toHaveAttribute('aria-selected', 'false')
  await expect(listenTab).toHaveAttribute('aria-selected', 'true')
  await expect(readPanel).toBeHidden()
  await expect(listenPanel).toBeVisible()
  await expect(page.getByRole('link', { name: /Apple Books/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Google Play/ })).toBeVisible()

  await listenTab.press('ArrowLeft')
  await expect(readPanel).toBeVisible()
  await expect(listenPanel).toBeHidden()
  await expect(readTab).toBeFocused()

  expect(errors).toEqual([])
})

test('mobile navigation opens and page has no horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')

  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'The Book' }).click()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')

  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

test('the potential concept is complete, interactive, and directly addressable', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/potential/')

  await expect(page).toHaveURL(/\/potential\/$/)
  await expect(page).toHaveTitle('A Knew Knowledge | Ideas for a Conscious Future')
  await expect(page.getByRole('heading', { name: /Remember differently/i })).toBeVisible()
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://aknewknowledge.com/potential/')
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://aknewknowledge.com/potential/')
  await expect(page.getByRole('img', { name: /Cover of A Knew Knowledge/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Jarrod Womack/ })).toHaveAttribute('href', 'mailto:jarrod.womack@aknewknowledge.com')
  await expect(page.getByRole('link', { name: /Javell Samuel/ })).toHaveAttribute('href', 'mailto:javellsamuel@aknewknowledge.com')

  const readTab = page.getByRole('tab', { name: /Read/ })
  const listenTab = page.getByRole('tab', { name: /Listen/ })
  await expect(page.getByRole('tabpanel', { name: /Read/ })).toBeVisible()
  await listenTab.click()
  await expect(readTab).toHaveAttribute('aria-selected', 'false')
  await expect(page.getByRole('tabpanel', { name: /Listen/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Apple Books/ })).toBeVisible()

  expect(errors).toEqual([])
})

test('the potential concept navigation works without mobile overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/potential/')

  const menu = page.getByRole('button', { name: 'Open navigation' })
  await menu.click()
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible()
  await page.keyboard.press('Escape')
  const closedMenu = page.getByRole('button', { name: 'Open navigation' })
  await expect(closedMenu).toHaveAttribute('aria-expanded', 'false')
  await expect(closedMenu).toBeFocused()

  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
})

test('all major sections remain visible at a constrained viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')

  for (const selector of ['#mission', '#book', '#work', '#community', '#contact']) {
    const section = page.locator(selector)
    await section.scrollIntoViewIfNeeded()
    await expect(section).toBeVisible()
    await expect(section).not.toHaveCSS('overflow', 'clip')
    await expect(section.locator('h2').first()).toBeVisible()
  }

  const hiddenReveals = await page.locator('.reveal').evaluateAll((elements) =>
    elements.filter((element) => getComputedStyle(element).opacity === '0').length,
  )
  expect(hiddenReveals).toBe(0)
})
