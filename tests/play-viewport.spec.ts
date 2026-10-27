import { expect, test } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'

// Review t_a5514177 / R1: on phones the whole game stage must fit inside the
// viewport, with the HUD and every touch control on screen together, and no
// page scrolling during play. Everything is measured with getBoundingClientRect
// and elementFromPoint; nothing here clicks or taps (Playwright would auto-scroll).

type Box = { l: number; t: number; r: number; b: number }

const VIEWPORTS = [
  { name: 'iPhone SE portrait', width: 375, height: 667 },
  { name: 'iPhone 13 portrait', width: 390, height: 664 },
  { name: 'Pixel 5 portrait', width: 393, height: 727 },
  { name: 'iPhone 13 landscape', width: 750, height: 342 },
]

const CONTROLS = ['#btn-fwd', '#btn-camera', '#btn-left', '#btn-back', '#btn-right', '#btn-pause', '#btn-mute']

async function startPlaying(page: Page): Promise<Frame> {
  await page.goto('/play/')
  await page.locator('#load-game').focus()
  await page.keyboard.press('Enter')
  const handle = await page.locator('#game-mount iframe').elementHandle()
  const frame = (await handle!.contentFrame())!
  await frame.waitForFunction(() => Boolean((window as any).game && (window as any).renderer))
  await expect(page.locator('#game-status')).toContainText('Game loaded')
  await expect(frame.locator('#btn-start')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => frame.evaluate(() => (window as any).game.state)).toBe('PLAYING')
  // Let layout and any focus-driven scroll settle.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  return frame
}

function stageInViewport(page: Page) {
  return page.evaluate(() => {
    const r = document.querySelector('#game-mount iframe')!.getBoundingClientRect()
    const vv = window.visualViewport!
    return {
      frame: { l: r.left, t: r.top, r: r.right, b: r.bottom },
      viewport: { w: vv.width, h: vv.height },
      scrollY: window.scrollY,
    }
  })
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

    test('game stage, HUD and every touch control fit on screen together without scrolling', async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile', 'phone layout check; runs once in the mobile project')
      const frame = await startPlaying(page)

      // (a) The whole iframe is inside the visual viewport.
      const stage = await stageInViewport(page)
      expect(stage.viewport.w).toBe(vp.width)
      expect(stage.viewport.h).toBe(vp.height)
      expect(stage.frame.t, 'iframe top').toBeGreaterThanOrEqual(-0.5)
      expect(stage.frame.l, 'iframe left').toBeGreaterThanOrEqual(-0.5)
      expect(stage.frame.b, 'iframe bottom').toBeLessThanOrEqual(stage.viewport.h + 0.5)
      expect(stage.frame.r, 'iframe right').toBeLessThanOrEqual(stage.viewport.w + 0.5)

      // Inside the game: HUD, minimap and every control are visible, inside the
      // game viewport, not covered by anything else and not overlapping each other.
      const layout = await frame.evaluate((controls) => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect()
          return { l: r.left, t: r.top, r: r.right, b: r.bottom }
        }
        const visible = (el: Element) => {
          const s = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0
        }
        const hit = (el: Element) => {
          const r = el.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return Boolean(top && (top === el || el.contains(top)))
        }
        const items: Record<string, { box: { l: number; t: number; r: number; b: number }; visible: boolean; hit: boolean }> = {}
        for (const sel of ['#hud .hud-group', '#minimap-wrapper', '.hud-view', ...controls]) {
          const el = document.querySelector(sel)!
          items[sel] = { box: box(el), visible: visible(el), hit: controls.includes(sel) ? hit(el) : true }
        }
        return { items, w: innerWidth, h: innerHeight, scrollY: scrollY }
      }, CONTROLS)

      const inside = (b: Box) => b.l >= -0.5 && b.t >= -0.5 && b.r <= layout.w + 0.5 && b.b <= layout.h + 0.5
      const overlap = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
      for (const [sel, item] of Object.entries(layout.items)) {
        expect(item.visible, `${sel} visible`).toBe(true)
        expect(inside(item.box), `${sel} inside game viewport ${JSON.stringify(item.box)}`).toBe(true)
        expect(item.hit, `${sel} is the topmost element at its centre`).toBe(true)
      }

      // (b) The VIEW label never sits under the minimap; the HUD panel stays clear of it too.
      const minimap = layout.items['#minimap-wrapper'].box
      expect(overlap(layout.items['.hud-view'].box, minimap), '.hud-view vs #minimap-wrapper').toBe(false)
      expect(overlap(layout.items['#hud .hud-group'].box, minimap), 'HUD vs #minimap-wrapper').toBe(false)

      // Controls do not overlap each other, the HUD or the minimap.
      const blocks = ['#hud .hud-group', '#minimap-wrapper', ...CONTROLS]
      for (let i = 0; i < blocks.length; i++) {
        for (let j = i + 1; j < blocks.length; j++) {
          expect(overlap(layout.items[blocks[i]].box, layout.items[blocks[j]].box), `${blocks[i]} vs ${blocks[j]}`).toBe(false)
        }
      }

      // No page scroll is needed or caused during play.
      await page.keyboard.press('ArrowDown')
      await page.waitForTimeout(600)
      const later = await stageInViewport(page)
      expect(later.scrollY).toBe(stage.scrollY)
      expect(later.frame.t).toBeGreaterThanOrEqual(-0.5)
      expect(later.frame.b).toBeLessThanOrEqual(later.viewport.h + 0.5)
      expect(await frame.evaluate(() => (window as any).game.state)).toBe('PLAYING')
    })
  })
}

test('the VIEW label stays clear of the minimap at every phone width up to 390px', async ({ page, browser, baseURL }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone layout check; runs once in the mobile project')
  const viewClear = (frame: Frame) => frame.evaluate(() => {
    const b = (s: string) => document.querySelector(s)!.getBoundingClientRect()
    const v = b('.hud-view'), m = b('#minimap-wrapper')
    return { w: innerWidth, overlap: v.left < m.right && m.left < v.right && v.top < m.bottom && m.top < v.bottom, v: [v.left, v.right], m: [m.left, m.right] }
  })
  const settle = () => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))

  // Embedded in /play/: the game is a little narrower than the page.
  await page.setViewportSize({ width: 320, height: 640 })
  const frame = await startPlaying(page)
  for (const width of [320, 340, 360, 375, 390]) {
    await page.setViewportSize({ width, height: 700 })
    await settle()
    const r = await viewClear(frame)
    const frameWidth = await page.evaluate(() => document.querySelector('#game-mount iframe')!.getBoundingClientRect().width)
    expect(r.w).toBe(Math.round(frameWidth))
    expect(r.overlap, `page ${width}px, game ${r.w}px: view ${r.v} minimap ${r.m}`).toBe(false)
  }

  // Standalone /play/game/: the game is the full page width. A fresh phone
  // context per width, because a mobile layout viewport does not shrink in place.
  for (const width of [320, 360, 375, 390]) {
    const context = await browser.newContext({ baseURL, viewport: { width, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
    const phone = await context.newPage()
    await phone.goto('/play/game/')
    await phone.waitForFunction(() => Boolean((window as any).game))
    await phone.locator('#btn-start').focus()
    await phone.keyboard.press('Enter')
    await expect.poll(() => phone.evaluate(() => (window as any).game.state)).toBe('PLAYING')
    const r = await viewClear(phone.mainFrame())
    expect(r.w).toBe(width)
    expect(r.overlap, `standalone ${width}px: view ${r.v} minimap ${r.m}`).toBe(false)
    await context.close()
  }
})
