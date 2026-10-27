import { expect, test } from '@playwright/test'
import type { Frame, Page, TestInfo } from '@playwright/test'

// Behaviour tests for the static /play/ page and the game under /play/game/.
// They run against `vite preview`, i.e. the built dist/ output that deploy.yml uploads.

type Snapshot = {
  state: string
  score: number
  lives: number
  x: number
  y: number
  dir: string
  pelletsRemaining: number
  initialPelletCount: number
}

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

async function snapshot(frame: Frame): Promise<Snapshot> {
  return frame.evaluate(() => {
    const g = (window as any).game
    return {
      state: g.state,
      score: g.score,
      lives: g.lives,
      x: g.player ? g.player.x : NaN,
      y: g.player ? g.player.y : NaN,
      dir: g.player ? g.player.dir.name : '',
      pelletsRemaining: g.maze ? g.maze.pelletsRemaining : -1,
      initialPelletCount: g.maze ? g.maze.initialPelletCount : -1,
    }
  })
}

async function openGame(page: Page): Promise<Frame> {
  await page.goto('/play/')
  const start = page.getByRole('button', { name: /Start the game/ })
  await start.focus()
  await page.keyboard.press('Enter')
  const frameEl = page.locator('#game-mount iframe')
  await expect(frameEl).toHaveAttribute('title', 'Maze Runner, a first-person 3D Pac-Man game')
  const frame = (await frameEl.elementHandle())!.contentFrame()
  const game = (await frame)!
  await game.waitForFunction(() => Boolean((window as any).game && (window as any).renderer))
  await expect(page.locator('#game-status')).toContainText('Game loaded')
  return game
}

async function enterMaze(page: Page, frame: Frame) {
  // Focus management: the shell moves focus to the game's start button.
  await expect(frame.locator('#btn-start')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await snapshot(frame)).state).toBe('PLAYING')
  await expect(frame.locator('#game-container')).toBeFocused()
}

function sameOrigin(info: TestInfo) {
  return new URL(info.project.use.baseURL ?? 'http://127.0.0.1:4173').origin
}

test('home links to /play/, page loads with no console errors and nothing loads until Start', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/')
  const card = page.locator('.play-card')
  await card.scrollIntoViewIfNeeded()
  await expect(card).toBeVisible()
  await card.getByRole('link', { name: /Play the maze/ }).click()
  await expect(page).toHaveURL(/\/play\/$/)
  await expect(page).toHaveTitle('Play | A Knew Knowledge')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A familiar maze.A different view.')
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /frame-src 'self'/)
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.locator('#how-to-play')).toContainText('P or Esc pauses')

  // Skip link and focus management on the shell.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main$/)

  const geometry = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }))
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  expect(errors).toEqual([])
})

test('game starts by keyboard with an accessible name, instructions and a live WebGL canvas', async ({ page }) => {
  const errors = watchErrors(page)
  const frame = await openGame(page)

  const playfield = frame.getByRole('application', { name: /Maze Runner, a first-person 3D Pac-Man game/ })
  await expect(playfield).toHaveAttribute('aria-describedby', 'game-instructions')
  await expect(frame.locator('#game-instructions')).toContainText('Pause / resume')
  await expect(frame.locator('#game-instructions')).toContainText('P / Esc')
  expect(await frame.evaluate(() => Boolean((window as any).renderer.renderer.getContext()))).toBe(true)
  await expect(frame.locator('#game-container canvas')).toHaveCount(1)

  expect((await snapshot(frame)).state).toBe('TITLE')
  // In-game controls stay out of the way of the title card.
  await expect(frame.locator('#btn-pause')).toBeHidden()
  await enterMaze(page, frame)
  await expect(frame.locator('#screen-title')).toBeHidden()
  await expect(frame.getByRole('button', { name: 'Pause' })).toBeVisible()
  await expect(frame.locator('#hud-score')).toBeVisible()
  await expect(frame.locator('#game-announcer')).toContainText('Game started')
  expect(errors).toEqual([])
})

test('player moves on keyboard input and on touch input', async ({ page }, info) => {
  const errors = watchErrors(page)
  const frame = await openGame(page)
  await enterMaze(page, frame)

  // The player spawns heading LEFT. Turning around must flip direction and reverse travel.
  await page.waitForTimeout(250)
  const before = await snapshot(frame)
  expect(before.dir).toBe('LEFT')
  await page.keyboard.press('ArrowDown')
  const turned = await snapshot(frame)
  expect(turned.dir).toBe('RIGHT')
  // Poll on game progress rather than a fixed sleep, so a slow (loaded) host only waits longer.
  await expect.poll(async () => (await snapshot(frame)).x).toBeGreaterThan(turned.x + 0.5)
  expect((await snapshot(frame)).state).toBe('PLAYING')

  // Same check with the other key binding.
  await page.keyboard.press('s')
  expect((await snapshot(frame)).dir).toBe('LEFT')

  if (info.project.name === 'mobile') {
    const touchBack = frame.getByRole('button', { name: 'Turn around' })
    await expect(frame.getByRole('group', { name: 'Touch controls' })).toBeVisible()
    await touchBack.tap()
    const tapped = await snapshot(frame)
    expect(tapped.dir).toBe('RIGHT')
    await expect.poll(async () => (await snapshot(frame)).x).toBeGreaterThan(tapped.x + 0.3)
  } else {
    await expect(frame.getByRole('group', { name: 'Touch controls' })).toBeHidden()
  }
  expect(errors).toEqual([])
})

test('eating pellets increases the score and the HUD shows it', async ({ page }) => {
  const errors = watchErrors(page)
  const frame = await openGame(page)
  await enterMaze(page, frame)
  const start = await snapshot(frame)
  // The player is already moving along a pellet row, so only a couple of pellets can be gone.
  expect(start.score).toBeLessThanOrEqual(30)
  expect(start.score).toBe((start.initialPelletCount - start.pelletsRemaining) * 10)

  // Wait on game progress, not wall-clock speed: the game caps each frame's delta at 0.1 s, so
  // under SwiftShader on a loaded host (few fps) simulated time runs slower than real time.
  // Three more pellets is ~1 s of game time; the generous timeout only matters when frames crawl.
  await expect
    .poll(async () => (await snapshot(frame)).score, { timeout: 30_000, intervals: [100, 250, 500] })
    .toBeGreaterThanOrEqual(start.score + 30)
  const later = await snapshot(frame)
  expect(later.pelletsRemaining).toBeLessThan(start.pelletsRemaining)
  // 10 points per pellet; nothing else can score in the first seconds.
  expect(later.score).toBe((start.initialPelletCount - later.pelletsRemaining) * 10)
  await expect.poll(async () => Number(await frame.locator('#hud-score').textContent()), { timeout: 15_000 }).toBeGreaterThanOrEqual(30)
  expect(errors).toEqual([])
})

test('pause freezes the game, resume continues, restart resets', async ({ page }, info) => {
  const errors = watchErrors(page)
  const frame = await openGame(page)
  await enterMaze(page, frame)
  await page.waitForTimeout(400)

  // Pause by keyboard.
  await page.keyboard.press('p')
  await expect.poll(async () => (await snapshot(frame)).state).toBe('PAUSED')
  await expect(frame.locator('#screen-pause')).toBeVisible()
  await expect(frame.getByRole('button', { name: 'Resume' }).first()).toBeVisible()
  await expect(frame.locator('#btn-resume')).toBeFocused()
  await expect(frame.locator('#btn-pause')).toHaveAttribute('aria-pressed', 'true')
  const frozen = await snapshot(frame)
  await page.waitForTimeout(700)
  const stillFrozen = await snapshot(frame)
  expect(stillFrozen.x).toBe(frozen.x)
  expect(stillFrozen.y).toBe(frozen.y)
  expect(stillFrozen.score).toBe(frozen.score)

  // Resume with Escape: focus returns to the playfield and the player moves again.
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await snapshot(frame)).state).toBe('PLAYING')
  await expect(frame.locator('#screen-pause')).toBeHidden()
  await expect(frame.locator('#game-container')).toBeFocused()
  await expect.poll(async () => {
    const s = await snapshot(frame)
    return Math.abs(s.x - frozen.x) + Math.abs(s.y - frozen.y)
  }).toBeGreaterThan(0.3)

  // Pause with the on-screen button (tap on touch devices), then restart.
  await page.waitForTimeout(300)
  const pauseButton = frame.locator('#btn-pause')
  if (info.project.name === 'mobile') await pauseButton.tap()
  else await pauseButton.click()
  await expect.poll(async () => (await snapshot(frame)).state).toBe('PAUSED')
  const beforeRestart = await snapshot(frame)
  expect(beforeRestart.score).toBeGreaterThan(0)
  await frame.getByRole('button', { name: 'Restart' }).click()
  await expect.poll(async () => (await snapshot(frame)).state).toBe('PLAYING')
  const restarted = await snapshot(frame)
  expect(restarted.score).toBeLessThanOrEqual(10)
  expect(restarted.lives).toBe(3)
  expect(restarted.pelletsRemaining).toBeGreaterThanOrEqual(restarted.initialPelletCount - 1)
  await expect(frame.locator('#screen-pause')).toBeHidden()

  // Closing the game returns focus to the shell's Start button.
  await page.getByRole('button', { name: 'Close game' }).click()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Start the game/ })).toBeFocused()
  expect(errors).toEqual([])
})

test('reduced-motion preference is honoured and followed live', async ({ page }) => {
  const errors = watchErrors(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const frame = await openGame(page)
  expect(await frame.evaluate(() => (window as any).gameSettings.reducedMotion)).toBe(true)
  expect(await frame.evaluate(() => (window as any).renderer.getReducedMotion())).toBe(true)
  await expect(frame.locator('html')).toHaveAttribute('data-reduced-motion', 'true')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => frame.evaluate(() => (window as any).renderer.getReducedMotion())).toBe(false)
  expect(errors).toEqual([])
})

test('every asset resolves same-origin under the Pages base path, with no backend calls', async ({ page, request }, info) => {
  const errors = watchErrors(page)
  const origin = sameOrigin(info)
  const requests: string[] = []
  const failures: string[] = []
  page.on('request', (req) => requests.push(req.url()))
  page.on('requestfailed', (req) => failures.push(`${req.url()} ${req.failure()?.errorText}`))
  page.on('response', (res) => {
    if (res.status() >= 400) failures.push(`${res.url()} ${res.status()}`)
  })
  page.on('websocket', (ws) => failures.push(`websocket ${ws.url()}`))

  const frame = await openGame(page)
  await enterMaze(page, frame)
  await page.waitForTimeout(300)

  const paths = requests.map((url) => new URL(url)).filter((u) => u.protocol !== 'data:' && u.protocol !== 'blob:')
  for (const u of paths) expect(u.origin, u.href).toBe(origin)
  const seen = new Set(paths.map((u) => u.pathname))
  for (const p of [
    '/play/',
    '/play/game/index.html',
    '/play/game/style.css',
    '/play/game/src/main.js',
    '/play/game/src/renderer.js',
    '/play/game/src/game_state.js',
    '/play/game/vendor/three.module.js',
    '/play/game/vendor/three.core.js',
  ]) expect(seen.has(p), p).toBe(true)
  expect([...seen].some((p) => /^\/assets\/play-[\w-]+\.js$/.test(p)), 'built shell bundle under /assets/').toBe(true)
  expect(failures).toEqual([])

  // Static files that ship with the game, and the directory URL form GitHub Pages serves.
  for (const p of ['/play/game/', '/play/game/vendor/LICENSE-three.txt', '/play/game/PROVENANCE.md', '/favicon.svg']) {
    expect((await request.get(p)).status(), p).toBe(200)
  }
  const mainJs = await request.get('/play/game/src/main.js')
  expect(mainJs.headers()['content-type']).toMatch(/javascript/)
  const body = await mainJs.text()
  expect(body).not.toMatch(/WebSocket|fetch\(|100\.\d+\.\d+\.\d+|ts\.net/)

  // The game also works when opened on its own at the directory URL.
  await page.goto('/play/game/')
  await page.waitForFunction(() => Boolean((window as any).game))
  await page.getByRole('button', { name: 'Enter the maze' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).game.state)).toBe('PLAYING')
  expect(failures).toEqual([])
  expect(errors).toEqual([])
})
