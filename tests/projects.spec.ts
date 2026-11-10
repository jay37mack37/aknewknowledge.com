import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

// /projects/ must mirror public/projects/projects.json, work without JavaScript,
// and keep the privacy lint honest (known-bad fixtures must each be rejected).
const data = JSON.parse(readFileSync(new URL('../public/projects/projects.json', import.meta.url), 'utf8'))
type Project = { id: string, name: string, status: string, category: string, era: string, summary: string, aliases?: string[], parent?: string, links?: { label: string, url: string }[], note?: string, firstNoted?: string, includes?: { name: string, summary: string }[], concepts?: { label: string, groups: { label: string, items: string[] }[] } }
const projects: Project[] = data.projects
const STATUS_LABEL: Record<string, string> = { public: 'Public', 'in-use': 'In use', building: 'Building', paused: 'Paused', past: 'Past', idea: 'Idea', unknown: 'Unknown' }
const countOf = (status: string) => projects.filter((p) => p.status === status).length

const names = new Map(projects.map((p) => [p.id, p.name]))
// Same fields the page searches: name, aliases, summary, note, category, status, parent name.
const hay = (p: Project) => [p.name, ...(p.aliases ?? []), p.summary, p.note, ...(p.includes ?? []).flatMap((i) => [i.name, i.summary]), p.category, STATUS_LABEL[p.status], p.parent ? names.get(p.parent) : ''].filter(Boolean).join(' ').toLowerCase()

const noOverflow = async (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)

test('projects page renders every entry from projects.json, grouped by status', async ({ page, request }) => {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  const res = await page.goto('/projects/')
  expect(res?.status()).toBe(200)
  await expect(page).toHaveTitle('Projects and ideas | A Knew Knowledge')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://aknewknowledge.com/projects/')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  expect(projects.length).toBeGreaterThanOrEqual(150)
  await expect(page.locator('.project-row')).toHaveCount(projects.length)
  await expect(page.locator('.projects-total')).toHaveText(String(projects.length))

  for (const [status, label] of Object.entries(STATUS_LABEL)) {
    const n = countOf(status)
    const group = page.locator(`section#status-${status}`)
    if (!n) { await expect(group).toHaveCount(0); continue }
    await expect(group.getByRole('heading', { level: 2 })).toContainText(label)
    await expect(group.getByRole('heading', { level: 2 })).toContainText(String(n))
    await expect(group.locator('.project-row')).toHaveCount(n)
    await expect(page.locator('.projects-jump').getByRole('link', { name: new RegExp(`^${label}\\b.*${n}`) })).toHaveAttribute('href', `#status-${status}`)
  }

  // Every entry: name, visible text status, summary, aliases, parent link.
  const rows = await page.locator('.project-row').evaluateAll((els) => els.map((el) => ({
    id: el.id,
    name: el.querySelector('h3')?.textContent?.trim(),
    status: el.querySelector('.project-status')?.textContent?.trim(),
    text: el.textContent?.replace(/\s+/g, ' ') ?? '',
    parent: el.querySelector('.project-parent a')?.getAttribute('href') ?? null,
  })))
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const p of projects) {
    const r = byId.get(p.id)
    expect(r, p.id).toBeTruthy()
    expect(r!.name).toBe(p.name)
    expect(r!.status).toBe(STATUS_LABEL[p.status])
    expect(r!.text).toContain(p.summary)
    for (const a of p.aliases ?? []) expect(r!.text).toContain(a)
    if (p.note) expect(r!.text).toContain(p.note)
    for (const i of p.includes ?? []) expect(r!.text).toContain(`${i.name}: ${i.summary}`)
    for (const g of p.concepts?.groups ?? []) for (const item of g.items) expect(r!.text).toContain(item)
    if (p.firstNoted) expect(r!.text).toContain(`First noted ${p.firstNoted.length === 7 ? new Date(`${p.firstNoted}-15`).toLocaleString('en-US', { month: 'long', year: 'numeric' }) : p.firstNoted}`)
    expect(r!.parent).toBe(p.parent ? `#${p.parent}` : null)
  }

  // Links: site-relative ones resolve, external ones are safe.
  for (const p of projects) for (const l of p.links ?? []) {
    const a = page.locator(`#${p.id} .project-links a`, { hasText: l.label })
    await expect(a).toHaveAttribute('href', l.url)
    if (l.url.startsWith('/')) expect((await request.get(l.url)).status(), l.url).toBe(200)
    else await expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  }
  expect((await request.get('/projects/projects.json')).status()).toBe(200)
  expect(await noOverflow(page)).toBe(true)
  expect(errors).toEqual([])
})

test('the full directory works with JavaScript disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/projects/')
  await expect(page.locator('.project-row')).toHaveCount(projects.length)
  await expect(page.locator('.project-row:visible')).toHaveCount(projects.length)
  // Filters need script, so they stay hidden instead of showing dead controls.
  await expect(page.locator('#project-filters')).toBeHidden()
  await expect(page.getByRole('link', { name: /Read AKnewComic Issue 1/ })).toHaveAttribute('href', '/aknewcomic/')
  expect(await noOverflow(page)).toBe(true)
  await context.close()
})

test('search by name or original alias, filters combine, and the URL keeps the view', async ({ page }) => {
  await page.goto('/projects/')
  const search = page.getByRole('searchbox', { name: 'Search projects and ideas' })
  const status = page.getByLabel('Status', { exact: true })
  const category = page.getByLabel('Category', { exact: true })
  const era = page.getByLabel('When', { exact: true })
  const visible = page.locator('.project-row:visible')
  const summary = page.locator('#project-results')

  await expect(search).toBeVisible()
  await expect(summary).toHaveText(`Showing all ${projects.length} entries`)

  // An original name that only appears as an alias still finds the project.
  await search.fill('livescribe')
  await expect(visible).toHaveCount(1)
  await expect(visible.first()).toHaveAttribute('id', 'aknewscribe')
  await expect(summary).toHaveText('Showing 1 of ' + projects.length + ' entries')
  await expect(page).toHaveURL(/\?q=livescribe$/)

  // Case-insensitive name search.
  await search.fill('pac-man')
  const pac = projects.filter((p) => hay(p).includes('pac-man'))
  expect(pac.length).toBeGreaterThan(1)
  await expect(visible).toHaveCount(pac.length)

  await search.fill('zzzz-nothing-here')
  await expect(visible).toHaveCount(0)
  await expect(page.getByText('No projects match. Try fewer words or reset the filters.')).toBeVisible()

  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(visible).toHaveCount(projects.length)
  await expect(search).toHaveValue('')

  await status.selectOption('idea')
  await expect(visible).toHaveCount(countOf('idea'))
  await expect(page.locator('section#status-building')).toBeHidden()

  const cat = 'Games'
  await category.selectOption(cat)
  const both = projects.filter((p) => p.status === 'idea' && p.category === cat)
  await expect(visible).toHaveCount(both.length)

  await status.selectOption('')
  await category.selectOption('')
  await era.selectOption('past')
  await expect(visible).toHaveCount(projects.filter((p) => p.era === 'past').length)

  // The query restores the same filtered view on reload (shareable).
  await page.goto('/projects/?status=public&q=maze')
  const expected = projects.filter((p) => p.status === 'public' && hay(p).includes('maze'))
  expect(expected.length).toBeGreaterThan(0)
  await expect(visible).toHaveCount(expected.length)
  await expect(search).toHaveValue('maze')
  await expect(status).toHaveValue('public')
})

test('projects is reachable from every main-site page and marked current', async ({ page, isMobile }) => {
  for (const from of ['/', '/play/', '/demos/']) {
    await page.goto(from)
    if (isMobile) {
      await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Projects', exact: true }).click()
    } else {
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Projects', exact: true }).click()
    }
    await expect(page).toHaveURL(/\/projects\/$/)
  }
  for (const nav of ['Primary navigation', 'Mobile navigation']) {
    await expect(page.getByRole('navigation', { name: nav, includeHidden: true }).getByRole('link', { name: 'Projects', exact: true, includeHidden: true })).toHaveAttribute('aria-current', 'page')
  }
  for (const from of ['/', '/play/', '/demos/', '/projects/']) {
    await page.goto(from)
    await expect(page.locator('footer .footer-links').getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('href', '/projects/')
  }
  await page.goto('/')
  await expect(page.locator('#work').getByRole('link', { name: /See every project/ })).toHaveAttribute('href', '/projects/')
})

test('desktop nav fits on one line with Projects added', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop nav only')
  for (const width of [901, 1024, 1180, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/projects/']) {
      await page.goto(path)
      const tops = await page.locator('.desktop-nav a').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
      expect(new Set(tops).size, `${path} @ ${width}`).toBe(1)
      const nav = await page.locator('.desktop-nav').boundingBox()
      const actions = await page.locator('.header-actions').boundingBox()
      const brand = await page.locator('.site-header .brand').boundingBox()
      // No overlap. Between 901 and ~980px the brand wordmark wraps to two lines, as it already did on main with seven links.
      expect(nav!.x, `${path} @ ${width}`).toBeGreaterThanOrEqual(brand!.x + brand!.width - 0.5)
      expect(nav!.x + nav!.width, `${path} @ ${width}`).toBeLessThanOrEqual(actions!.x + actions!.width)
      expect(await noOverflow(page)).toBe(true)
    }
  }
})

test('no sideways scroll at phone, landscape and desktop sizes', async ({ page }) => {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/projects/?q=aknew')
    expect(await noOverflow(page), `${width}x${height}`).toBe(true)
    await page.goto('/projects/')
    expect(await noOverflow(page), `${width}x${height}`).toBe(true)
  }
})

test('privacy lint rejects private details and keeps coined project names', async () => {
  const { validate } = await import('../scripts/projects.mjs')
  const good = () => structuredClone(data)
  expect(() => validate(good())).not.toThrow()

  const bad: [string, (p: Project) => void][] = [
    ['IPv4 address', (p) => { p.summary = 'Runs on 192.168.1.20 at home.' }],
    ['localhost port', (p) => { p.summary = 'Preview at localhost:4195.' }],
    ['tailnet host', (p) => { p.summary = 'See box.tail1234.ts.net for it.' }],
    ['home path', (p) => { p.summary = 'Lives in /home/someone/projects.' }],
    ['server path', (p) => { p.note = 'Repo at /srv/threader/projects/x.' }],
    ['tilde path', (p) => { p.summary = 'Copied to ~/Workspaces/x.' }],
    ['hidden config dir', (p) => { p.summary = 'Config in .hermes/profiles.' }],
    ['board id', (p) => { p.note = 'Tracked on t_9df49d96.' }],
    ['snowflake id', (p) => { p.summary = 'Channel 1564590978705129604.' }],
    ['email', (p) => { p.summary = 'Mail someone@example.com.' }],
    ['secret value', (p) => { p.summary = 'Uses api_key=abc123 for access.' }],
    ['token string', (p) => { p.note = 'Push with ghp_abcdefghijklmnopqrstuvwxyz0123.' }],
    ['model name', (p) => { p.summary = 'Written by Claude.' }],
    ['agent name in alias', (p) => { p.aliases = ['OpenClaw Android'] }],
    ['bad link host', (p) => { p.links = [{ label: 'Repo', url: 'https://example.com/x' }] }],
    ['auth route link', (p) => { p.links = [{ label: 'Sign in', url: '/threader/' }] }],
    ['unknown status', (p) => { p.status = 'live' }],
    ['bad first-noted date', (p) => { p.firstNoted = 'Nov 2023' }],
  ]
  for (const [name, mutate] of bad) {
    const d = good()
    mutate(d.projects[0])
    expect(() => validate(d), name).toThrow()
  }
  const dupe = good()
  dupe.projects[1].id = dupe.projects[0].id
  expect(() => validate(dupe), 'duplicate id').toThrow()
  const orphan = good()
  orphan.projects[1].parent = 'no-such-project'
  expect(() => validate(orphan), 'unknown parent').toThrow()

  // Names the owner coined around a vendor word stay legal.
  const coined = good()
  coined.projects[0].aliases = ['AKnewGemini', 'aKnewCodex', 'AKnewGPT', 'aKnewChatgpt']
  coined.projects[0].summary = 'A local password manager and safer tokens of thanks.'
  const named = good()
  named.projects[0].aliases = ['ChatGPT Website 2.0']
  expect(() => validate(named), 'allowlisted original name').not.toThrow()
  named.projects[0].summary = 'ChatGPT Website 2.0 was written by ChatGPT.'
  expect(() => validate(named), 'allowlist is for exact alias strings only').toThrow()
  const inc = good()
  inc.projects[0].includes = [{ name: 'Old bot', summary: 'Lived at /srv/x.' }]
  expect(() => validate(inc), 'private path inside includes').toThrow()
  expect(() => validate(coined)).not.toThrow()
})

test('merged projects stay findable by their own historical names', async ({ page }) => {
  await page.goto('/projects/')
  const search = page.getByRole('searchbox', { name: 'Search projects and ideas' })
  const visible = page.locator('.project-row:visible')
  const merged = projects.flatMap((p) => (p.includes ?? []).map((i) => [i.name, p.id] as const))
  expect(merged.length).toBeGreaterThanOrEqual(6)
  for (const [name, id] of [...merged, ['VWAP reversion', 'aknewtrading-legacy'] as const]) {
    await search.fill(name)
    await expect(visible.filter({ has: page.locator(`[id="${id}-name"]`) }), name).toHaveCount(1)
    await expect(page.locator(`#${id} .project-includes`)).toBeVisible()
  }
  // AI-written concepts are shown as one labelled sub-list, not as projects, and are not search hits.
  const withConcepts = projects.filter((p) => p.concepts)
  expect(withConcepts).toHaveLength(1)
  await search.fill('Midnight Crew')
  await expect(visible).toHaveCount(0)
  await search.fill('')
  const details = page.locator(`#${withConcepts[0].id} details.project-concepts`)
  await expect(details.locator('summary')).toContainText('not separate projects')
  await details.locator('summary').click()
  await expect(details.getByText('Midnight Crew', { exact: true })).toBeVisible()
})
