// Shared header menu for the main-site design system (home page and /play/).
// Expects .site-header > .menu-button + .mobile-nav, as rendered by main.ts.

export const menuIcon = (open: boolean) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${open ? '<path d="m6 6 12 12M18 6 6 18"/>' : '<path d="M4 7h16M4 12h16M4 17h16"/>'}</svg>`

export function setupSiteMenu() {
  const menuButton = document.querySelector<HTMLButtonElement>('.menu-button')
  const mobileNav = document.querySelector<HTMLElement>('.mobile-nav')
  const siteHeader = document.querySelector<HTMLElement>('.site-header')
  if (!menuButton || !mobileNav || !siteHeader) return

  const setMenu = (open: boolean, returnFocus = false) => {
    menuButton.setAttribute('aria-expanded', String(open))
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation')
    menuButton.innerHTML = menuIcon(open)
    mobileNav.hidden = !open
    mobileNav.classList.toggle('open', open)
    document.body.classList.toggle('menu-open', open)

    if (open) mobileNav.querySelector<HTMLAnchorElement>('a')?.focus()
    if (!open && returnFocus) menuButton.focus()
  }

  menuButton.addEventListener('click', () => {
    setMenu(menuButton.getAttribute('aria-expanded') !== 'true')
  })

  mobileNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)))

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') setMenu(false, true)
  })

  document.addEventListener('pointerdown', (event) => {
    if (menuButton.getAttribute('aria-expanded') === 'true' && !siteHeader.contains(event.target as Node)) setMenu(false)
  })

  window.matchMedia('(min-width: 901px)').addEventListener('change', ({ matches }) => {
    if (matches) setMenu(false)
  })
}

// Thumbnails that may not be published yet (e.g. a build that lands later)
// fall back to a sibling screenshot instead of showing a broken image.
export function setupImageFallbacks() {
  document.querySelectorAll<HTMLImageElement>('img[data-fallback]').forEach((img) => {
    const swap = () => {
      const fallback = img.dataset.fallback
      if (!fallback || img.src.endsWith(fallback)) return
      img.src = fallback
    }
    if (img.complete && img.naturalWidth === 0) swap()
    else img.addEventListener('error', swap, { once: true })
  })
}
