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
  await expect(page.getByRole('link', { name: /Join A Knew Knowledge on Discord/i })).toHaveAttribute('href', 'https://discord.gg/zaUzpeBv6')
  await expect(page.getByRole('img', { name: /Cover of A Knew Knowledge/i })).toBeVisible()

  await page.getByRole('tab', { name: /Listen/ }).click()
  await expect(page.getByRole('link', { name: /Apple Books/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Google Play/ })).toBeVisible()

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
