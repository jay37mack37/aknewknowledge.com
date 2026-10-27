import './style.css'
import './play.css'

// Static shell for /play/. The game itself is plain static files under
// /play/game/ (same origin); nothing here talks to any server.
const start = document.querySelector<HTMLButtonElement>('#load-game')!
const stop = document.querySelector<HTMLButtonElement>('#stop-game')!
const placeholder = document.querySelector<HTMLElement>('#game-placeholder')!
const mount = document.querySelector<HTMLElement>('#game-mount')!
const status = document.querySelector<HTMLElement>('#game-status')!

const gameURL = new URL('game/index.html', new URL('./', location.href))

// Keep the whole game stage inside the viewport while it is open. The iframe is
// never taller than the viewport (see play.css), so 'nearest' fully reveals it.
function alignStage() {
  mount.querySelector('iframe')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
}
let alignQueued = 0
function queueAlign() {
  if (alignQueued) return
  alignQueued = requestAnimationFrame(() => {
    alignQueued = 0
    alignStage()
  })
}

start.addEventListener('click', () => {
  if (mount.childElementCount) return
  const frame = document.createElement('iframe')
  frame.title = 'Maze Runner, a first-person 3D Pac-Man game'
  frame.src = gameURL.pathname
  frame.allow = 'autoplay; fullscreen'
  frame.referrerPolicy = 'no-referrer'
  frame.addEventListener('load', () => {
    status.textContent = 'Game loaded. P or Esc pauses at any time; “Close game” returns you to this page.'
    frame.focus()
    try {
      frame.contentWindow?.document.querySelector<HTMLButtonElement>('#btn-start')?.focus()
    } catch {
      // Same-origin by construction; ignore if a browser blocks access.
    }
    // Focus moves can scroll the page; align the stage last.
    alignStage()
  }, { once: true })
  mount.append(frame)
  placeholder.hidden = true
  stop.hidden = false
  status.textContent = 'Loading the game…'
  frame.focus()
  alignStage()
  window.addEventListener('resize', queueAlign)
})

stop.addEventListener('click', () => {
  window.removeEventListener('resize', queueAlign)
  mount.replaceChildren()
  placeholder.hidden = false
  stop.hidden = true
  status.textContent = 'Game closed. Press Start to play again.'
  start.focus()
})
