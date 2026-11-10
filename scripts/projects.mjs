// Projects and ideas directory. One public file (public/projects/projects.json)
// is validated and rendered into projects/index.html at dev and build time
// (vite.config.mjs), so the whole list works with JavaScript off.
// src/projects.ts only adds search and filters on top of this HTML.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const projectsPath = fileURLToPath(new URL('../public/projects/projects.json', import.meta.url))

// Display order and plain-text labels. Status is always shown as text, never colour alone.
export const STATUSES = {
  public: { label: 'Public', blurb: 'Live on this site or in public. Try it.' },
  'in-use': { label: 'In use', blurb: 'Running and used every day, mostly in private.' },
  building: { label: 'Building', blurb: 'Being built now, or partly built.' },
  paused: { label: 'Paused', blurb: 'Started, then paused or blocked.' },
  past: { label: 'Past', blurb: 'Finished, retired, merged into something else, or from before the suite.' },
  idea: { label: 'Idea', blurb: 'Not started yet, or barely started.' },
  unknown: { label: 'Unknown', blurb: 'Not enough evidence to say. We would rather say so than guess.' },
}
export const ERAS = { current: 'Current', past: 'Past', idea: 'Idea' }
export const CATEGORIES = [
  'AI assistants', 'Builder tools', 'Infrastructure', 'Discord and community', 'Markets research', 'Games',
  'Creative and media', 'Health and daily life', 'Home, family and belongings', 'Learning and skills',
  'Archives and backup', 'Making and DIY', 'Brand and business',
]

// Site pages a project may link to. Auth and private utility routes are deliberately absent.
const SITE_ROUTES = new Set(['/', '/play/', '/play/final/', '/play/online/', '/play/game/', '/play/afterhours/', '/demos/', '/aknewcomic/'])
const GITHUB = 'https://github.com/jay37mack37/'

// Privacy lint: a floor, not proof. Summaries are written by hand from private records;
// this catches the leaks that slip through copy and paste.
// Model and agent names match as standalone words only, so names the owner coined
// around them (AKnewGemini, aKnewCodex, AKnewGPT) stay legal.
const PRIVATE_PATTERNS = [
  ['IP address', /\b\d{1,3}(?:\.\d{1,3}){3}\b|\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){3,7}\b/i],
  ['local host or port', /\blocalhost\b|\b127\.0\.0\.1\b|:\d{2,5}\b/i],
  ['private network host', /\.ts\.net\b|\btailnet\b|\btail[0-9a-f]{4,}\b/i],
  ['private path', /(?:^|[\s(`'"])(?:\/home\/|\/srv\/|\/root\/|~\/|[A-Z]:\\)/],
  ['hidden config directory', /(?:^|[\s/(`'"])\.(?:hermes|openclaw|config|ssh|env)\b/i],
  ['board id', /\bt_[0-9a-f]{8}\b/i],
  ['numeric id', /\b\d{15,20}\b/],
  ['email address', /[\w.+-]+@[\w-]+\.[\w.]+/],
  // Secret values, not topics: "a local password manager" is a fine idea to list.
  ['secret value', /\b(?:password|passwd|token|secret|api[ _-]?key|bearer)\s*[:=]\s*\S+|\bsk-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b/i],
  ['model or agent name', /\b(?:claude|opus|sonnet|haiku|gpt(?:-?\d[\w.]*)?|chatgpt|openai|codex|gemini|openclaw|hermes|sol|fable|astra|yuxor|jules|copilot|grok|anthropic)\b/i],
]

// Original names the owner gave a project that contain a vendor product word. Exact strings
// only, so search still finds the old name while attribution text stays model-free.
export const ORIGINAL_NAMES = new Set(['ChatGPT Website 2.0'])

export function privacyProblem(text) {
  for (const [name, re] of PRIVATE_PATTERNS) if (re.test(text)) return name
  return null
}

export function loadProjects(path = projectsPath) {
  const d = JSON.parse(readFileSync(path, 'utf8'))
  validate(d)
  return d
}

export function validate(d) {
  const fail = (msg) => { throw new Error(`projects.json: ${msg}`) }
  if (d.schema !== 'aknew-projects/1') fail('schema must be aknew-projects/1')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.updated ?? '')) fail('updated must be YYYY-MM-DD')
  if (!Array.isArray(d.projects) || !d.projects.length) fail('projects must be a non-empty list')
  const ids = new Set(d.projects.map((p) => p.id))
  if (ids.size !== d.projects.length) fail('ids must be unique')
  for (const p of d.projects) {
    const where = p.id ?? '?'
    for (const k of ['id', 'name', 'status', 'category', 'era', 'summary']) if (typeof p[k] !== 'string' || !p[k].trim()) fail(`${where} is missing ${k}`)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.id)) fail(`${where} id must be kebab-case`)
    if (!(p.status in STATUSES)) fail(`${where} status ${p.status} is not one of ${Object.keys(STATUSES).join(', ')}`)
    if (!(p.era in ERAS)) fail(`${where} era ${p.era} is not one of ${Object.keys(ERAS).join(', ')}`)
    if (!CATEGORIES.includes(p.category)) fail(`${where} category ${p.category} is not listed in CATEGORIES`)
    if (p.parent != null && (!ids.has(p.parent) || p.parent === p.id)) fail(`${where} parent ${p.parent} is not another project id`)
    if (p.firstNoted != null && !/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(p.firstNoted)) fail(`${where} firstNoted must be YYYY or YYYY-MM`)
    if (p.aliases != null && (!Array.isArray(p.aliases) || p.aliases.some((a) => typeof a !== 'string' || !a.trim()))) fail(`${where} aliases must be non-empty strings`)
    for (const inc of p.includes ?? []) if (!inc?.name?.trim() || !inc?.summary?.trim()) fail(`${where} includes items need name and summary`)
    if (p.concepts != null && (!p.concepts.label || !Array.isArray(p.concepts.groups) || p.concepts.groups.some((g) => !g.label || !Array.isArray(g.items) || !g.items.length))) fail(`${where} concepts need a label and non-empty groups`)
    for (const l of p.links ?? []) {
      if (!l.label || !l.url) fail(`${where} link needs label and url`)
      if (!(SITE_ROUTES.has(l.url) || (l.url.startsWith(GITHUB) && /^https:\/\/github\.com\/jay37mack37\/[\w.-]+$/.test(l.url)))) fail(`${where} link ${l.url} is not an allowed site route or public repo`)
    }
    const strings = [p.name, p.summary, p.note, ...(p.aliases ?? []).filter((a) => !ORIGINAL_NAMES.has(a)), ...(p.links ?? []).map((l) => l.label),
      ...(p.includes ?? []).flatMap((i) => [i.name, i.summary]), p.concepts?.label, ...(p.concepts?.groups ?? []).flatMap((g) => [g.label, ...g.items])].filter(Boolean)
    for (const s of strings) {
      const problem = privacyProblem(s)
      if (problem) fail(`${where} has a ${problem} in "${s}"`)
    }
  }
}

// ---- rendering -----------------------------------------------------------------
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "2023-11" -> "November 2023"; "2023" stays "2023". */
export const monthName = (v) => (v.length === 7 ? `${MONTHS[Number(v.slice(5)) - 1]} ${v.slice(0, 4)}` : v)
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true })

/** Lowercased text the client-side search matches against. */
export function searchText(p, names) {
  // Merged projects stay findable by their own names through `includes`. AI-written concepts are not searched.
  return [p.name, ...(p.aliases ?? []), p.summary, p.note, ...(p.includes ?? []).flatMap((i) => [i.name, i.summary]), p.category, STATUSES[p.status].label, p.parent ? names.get(p.parent) : '']
    .filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ')
}

export function renderRow(p, names) {
  const status = STATUSES[p.status]
  const aliases = p.aliases?.length ? `<p class="project-aliases"><span>Also called</span> ${p.aliases.map(esc).join(', ')}</p>` : ''
  const parent = p.parent ? `<p class="project-parent">Part of <a href="#${esc(p.parent)}">${esc(names.get(p.parent))}</a></p>` : ''
  const note = p.note ? `<p class="project-note">${esc(p.note)}</p>` : ''
  const includes = p.includes?.length
    ? `<div class="project-includes"><p class="project-includes-title">Includes</p><ul role="list">${p.includes.map((i) => `<li><strong>${esc(i.name)}</strong>: ${esc(i.summary)}</li>`).join('')}</ul></div>`
    : ''
  const concepts = p.concepts
    ? `<details class="project-concepts"><summary>${esc(p.concepts.label)}</summary>${p.concepts.groups.map((g) => `<p class="project-concepts-group">${esc(g.label)} (${g.items.length})</p><ul role="list">${g.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`).join('')}</details>`
    : ''
  const first = p.firstNoted ? `<p class="project-first">First noted <time datetime="${esc(p.firstNoted)}">${esc(monthName(p.firstNoted))}</time></p>` : ''
  const links = p.links?.length
    ? `<ul class="project-links" role="list">${p.links.map((l) => {
      const ext = !l.url.startsWith('/')
      return `<li><a href="${esc(l.url)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)}<span aria-hidden="true">${ext ? ' ↗' : ' →'}</span>${ext ? '<span class="visually-hidden"> (opens in a new tab)</span>' : ''}</a></li>`
    }).join('')}</ul>`
    : ''
  return `
          <li class="project-row" id="${esc(p.id)}" data-status="${esc(p.status)}" data-category="${esc(p.category)}" data-era="${esc(p.era)}" data-search="${esc(searchText(p, names))}">
            <article aria-labelledby="${esc(p.id)}-name">
              <div class="project-head">
                <h3 id="${esc(p.id)}-name">${esc(p.name)}</h3>
                <p class="project-meta"><span class="project-status status-${esc(p.status)}">${esc(status.label)}</span><span class="project-category">${esc(p.category)}</span></p>
              </div>
              <p class="project-summary">${esc(p.summary)}</p>
              ${note}${includes}${concepts}${aliases}${parent}${first}${links}
            </article>
          </li>`
}

export function renderGroups(d) {
  const names = new Map(d.projects.map((p) => [p.id, p.name]))
  return Object.entries(STATUSES).map(([key, s]) => {
    const list = d.projects.filter((p) => p.status === key).sort(byName)
    if (!list.length) return ''
    return `
      <section class="project-group" id="status-${key}" aria-labelledby="status-${key}-title" data-group="${key}">
        <div class="project-group-head">
          <h2 id="status-${key}-title">${esc(s.label)} <span class="project-group-count">${list.length}</span></h2>
          <p>${esc(s.blurb)}</p>
        </div>
        <ul class="project-list" role="list">${list.map((p) => renderRow(p, names)).join('')}
        </ul>
      </section>`
  }).join('')
}

export function renderJump(d) {
  return Object.entries(STATUSES).map(([key, s]) => {
    const n = d.projects.filter((p) => p.status === key).length
    return n ? `<li><a href="#status-${key}">${esc(s.label)} <span>${n}</span></a></li>` : ''
  }).join('')
}

const option = (value, label, n) => `<option value="${esc(value)}">${esc(label)} (${n})</option>`
export function renderOptions(d) {
  const count = (k, v) => d.projects.filter((p) => p[k] === v).length
  return {
    status: Object.entries(STATUSES).filter(([k]) => count('status', k)).map(([k, s]) => option(k, s.label, count('status', k))).join(''),
    category: CATEGORIES.filter((c) => count('category', c)).map((c) => option(c, c, count('category', c))).join(''),
    era: Object.entries(ERAS).filter(([k]) => count('era', k)).map(([k, l]) => option(k, l, count('era', k))).join(''),
  }
}

export function pageSlots(d) {
  const opts = renderOptions(d)
  return {
    PROJECTS_TOTAL: String(d.projects.length),
    PROJECTS_UPDATED: esc(d.updated),
    PROJECTS_JUMP: renderJump(d),
    PROJECTS_STATUS_OPTIONS: opts.status,
    PROJECTS_CATEGORY_OPTIONS: opts.category,
    PROJECTS_ERA_OPTIONS: opts.era,
    PROJECTS_GROUPS: renderGroups(d),
  }
}

export function fillPage(html, d) {
  const slots = pageSlots(d)
  return html.replace(/<!--(PROJECTS_[A-Z_]+)-->/g, (all, k) => {
    if (!(k in slots)) throw new Error(`projects page: unknown slot ${k}`)
    return slots[k]
  })
}
