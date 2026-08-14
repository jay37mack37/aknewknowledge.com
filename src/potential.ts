import './potential.css'

const menuToggle = document.querySelector<HTMLButtonElement>('.menu-toggle')!
const mobileMenu = document.querySelector<HTMLElement>('#mobile-menu')!
const header = document.querySelector<HTMLElement>('[data-header]')!

const setMenu = (open: boolean, returnFocus = false) => {
  menuToggle.setAttribute('aria-expanded', String(open))
  menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation')
  mobileMenu.hidden = !open
  mobileMenu.classList.toggle('open', open)
  document.body.classList.toggle('menu-open', open)

  if (open) {
    mobileMenu.querySelector<HTMLAnchorElement>('a')?.focus()
  } else if (returnFocus) {
    menuToggle.focus()
  }
}

menuToggle.addEventListener('click', () => {
  setMenu(menuToggle.getAttribute('aria-expanded') !== 'true')
})

mobileMenu.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => setMenu(false))
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuToggle.getAttribute('aria-expanded') === 'true') {
    setMenu(false, true)
  }
})

document.addEventListener('pointerdown', (event) => {
  if (menuToggle.getAttribute('aria-expanded') === 'true' && !header.contains(event.target as Node)) {
    setMenu(false)
  }
})

const desktopQuery = window.matchMedia('(min-width: 981px)')
desktopQuery.addEventListener('change', ({ matches }) => {
  if (matches) setMenu(false)
})

const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 24)
updateHeader()
window.addEventListener('scroll', updateHeader, { passive: true })

const formatTabs = [...document.querySelectorAll<HTMLButtonElement>('.format-tab')]
const formatPanels = [...document.querySelectorAll<HTMLElement>('.format-panel')]

const activateFormat = (tab: HTMLButtonElement, moveFocus = false) => {
  formatTabs.forEach((item) => {
    const active = item === tab
    item.classList.toggle('active', active)
    item.setAttribute('aria-selected', String(active))
    item.tabIndex = active ? 0 : -1
  })

  formatPanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab.dataset.format
  })

  if (moveFocus) tab.focus()
}

formatTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateFormat(tab))
  tab.addEventListener('keydown', (event) => {
    let nextIndex: number | undefined

    if (event.key === 'ArrowRight') nextIndex = (index + 1) % formatTabs.length
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + formatTabs.length) % formatTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = formatTabs.length - 1
    if (nextIndex === undefined) return

    event.preventDefault()
    activateFormat(formatTabs[nextIndex], true)
  })
})

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const reveals = [...document.querySelectorAll<HTMLElement>('.reveal')]

if (reducedMotion || !('IntersectionObserver' in window)) {
  reveals.forEach((element) => element.classList.add('is-visible'))
} else {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    })
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 })

  reveals.forEach((element) => revealObserver.observe(element))
}

document.querySelector('#year')!.textContent = String(new Date().getFullYear())
