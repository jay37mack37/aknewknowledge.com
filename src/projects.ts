import './style.css'
import './subpage.css'
import './projects.css'
import { setupSiteMenu } from './site-menu'

// /projects/ rows are rendered at build time from public/projects/projects.json
// (scripts/projects.mjs), so the full list works with JavaScript off.
// This file only adds search and filters, and keeps them in the URL so a view can be shared.
setupSiteMenu()
document.querySelector('#year')!.textContent = String(new Date().getFullYear())

const form = document.querySelector<HTMLFormElement>('#project-filters')
const rows = [...document.querySelectorAll<HTMLElement>('.project-row')]
const groups = [...document.querySelectorAll<HTMLElement>('.project-group')]
const jumpLinks = [...document.querySelectorAll<HTMLAnchorElement>('.projects-jump a')]
const results = document.querySelector<HTMLElement>('#project-results')
const empty = document.querySelector<HTMLElement>('#project-empty')

if (form && results && empty && rows.length) {
  const q = form.elements.namedItem('q') as HTMLInputElement
  const selects = (['status', 'category', 'era'] as const).map((name) => form.elements.namedItem(name) as HTMLSelectElement)
  const total = rows.length
  const words = (s: string) => s.toLowerCase().split(/\s+/).filter(Boolean)

  // Every typed word must appear somewhere in the row's name, aliases, summary, category, status or parent.
  const apply = (updateUrl: boolean) => {
    const terms = words(q.value)
    const [status, category, era] = selects.map((s) => s.value)
    let shown = 0
    for (const row of rows) {
      const hay = row.dataset.search ?? ''
      const match = (!status || row.dataset.status === status)
        && (!category || row.dataset.category === category)
        && (!era || row.dataset.era === era)
        && terms.every((t) => hay.includes(t))
      row.hidden = !match
      if (match) shown++
    }
    for (const group of groups) {
      const n = group.querySelectorAll('.project-row:not([hidden])').length
      group.hidden = n === 0
      const count = group.querySelector('.project-group-count')
      if (count) count.textContent = String(n)
    }
    for (const link of jumpLinks) {
      const group = document.querySelector<HTMLElement>(link.hash)
      link.closest('li')!.hidden = !!group?.hidden
      const count = link.querySelector('span')
      if (count && group) count.textContent = String(group.querySelectorAll('.project-row:not([hidden])').length)
    }
    empty.hidden = shown > 0
    results.textContent = shown === total ? `Showing all ${total} entries` : `Showing ${shown} of ${total} entries`

    if (updateUrl) {
      const params = new URLSearchParams()
      if (q.value.trim()) params.set('q', q.value.trim())
      selects.forEach((s) => { if (s.value) params.set(s.name, s.value) })
      const query = params.toString()
      history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
    }
  }

  // Restore a shared view; ignore values the select does not offer.
  const params = new URLSearchParams(location.search)
  q.value = params.get('q') ?? ''
  for (const s of selects) {
    const v = params.get(s.name) ?? ''
    s.value = [...s.options].some((o) => o.value === v) ? v : ''
  }

  form.hidden = false
  form.addEventListener('submit', (event) => event.preventDefault())
  form.addEventListener('input', () => apply(true))
  form.addEventListener('change', () => apply(true))
  // The reset event fires before the fields clear, so read them on the next tick.
  form.addEventListener('reset', () => setTimeout(() => { apply(true); q.focus() }))
  apply(false)
}
