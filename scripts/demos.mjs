// Shared demo renderer. One manifest (public/demos/manifest.json) drives both:
//   * the site's /demos/ page (renderDemosHtml, injected at build time by vite.config.mjs)
//   * the Discord #demos forum posts (discordPost / aKnewMod intents, scripts/demos-discord.mjs)
// Keep every surface's wording here so Discord and the site never drift.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const manifestPath = fileURLToPath(new URL('../public/demos/manifest.json', import.meta.url))
export const SITE = 'https://aknewknowledge.com'

export function loadManifest(path = manifestPath) {
  const m = JSON.parse(readFileSync(path, 'utf8'))
  validate(m)
  return m
}

export function validate(m) {
  const fail = (msg) => { throw new Error(`demos manifest: ${msg}`) }
  if (m.version !== 1) fail('version must be 1')
  if (!Array.isArray(m.demos) || !m.demos.length) fail('demos must be a non-empty list')
  const ids = new Set()
  for (const d of m.demos) {
    for (const k of ['id', 'emoji', 'title', 'subtitle', 'lead', 'how', 'play', 'image']) if (!d[k]) fail(`${d.id ?? '?'} is missing ${k}`)
    if (!/^[a-z0-9-]+$/.test(d.id) || ids.has(d.id)) fail(`id ${d.id} must be unique kebab-case`)
    ids.add(d.id)
    if (!d.play.url.startsWith('https://')) fail(`${d.id} play.url must be https`)
    if (d.tags?.length > 5) fail(`${d.id} has more than 5 tags`)
    for (const t of d.tags ?? []) if (!(t in m.tags)) fail(`${d.id} tag ${t} is not in manifest.tags`)
    if (!d.image.alt) fail(`${d.id} image needs alt text`)
    if (postName(d).length > 100) fail(`${d.id} post name is over Discord's 100 chars`)
  }
}

// ---- shared wording -------------------------------------------------------
export const MADE_BY = '🗣️ Made by talking to AI'
export const postName = (d) => `${d.emoji} ${d.title} · ${d.subtitle}`
export const footerParts = (d) => [MADE_BY, ...(d.credits ?? []), ...(d.status ? [d.status] : [])]

// ---- Discord ---------------------------------------------------------------
export function discordContent(d) {
  return `**${d.lead}** ${d.how}\n-# ${footerParts(d).join(' · ')}`
}

export function discordGuidelines(m) {
  return `🎮 **${m.forum.title}**\n${m.forum.how}\n${m.forum.byline}`
}

export function discordButtons(d) {
  return [
    { label: d.play.label, emoji: '▶️', url: d.play.url },
    { label: 'All demos', emoji: '🌐', url: `${SITE}/demos/#${d.id}` },
  ]
}

/** aKnewMod intent that makes the Discord post match the manifest. */
export function discordIntent(m, d, { withFiles = false } = {}) {
  const base = { name: postName(d), content: discordContent(d), tags: d.tags ?? [], buttons: discordButtons(d) }
  if (d.discord?.thread_id) {
    return { action: 'edit_forum_post', thread_id: d.discord.thread_id, ...base, ...(withFiles && d.discord.file ? { files: [d.discord.file] } : {}) }
  }
  return { action: 'create_forum_post', channel_id: m.forum.discord.channel_id, ...base, ...(d.discord?.file ? { files: [d.discord.file] } : {}) }
}

// ---- site ------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
/** Escape, then allow the one bit of Discord markdown we use: **bold**. */
export const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Discord's ▶️ emoji renders as a coloured tile; on the site use the text-style glyph.
  .replace(/▶\uFE0F/g, '<span class="glyph" aria-hidden="true">▶\uFE0E</span>')
const sitePath = (url) => (url.startsWith(SITE) ? url.slice(SITE.length) || '/' : url)

export function renderCard(m, d, i) {
  const n = String(i + 1).padStart(2, '0')
  const tags = (d.tags ?? []).map((t) => `<li><span aria-hidden="true">${m.tags[t]}</span> ${esc(t)}</li>`).join('')
  const credits = footerParts(d).filter((p) => p !== d.status).map(esc).join(' · ')
  return `
      <article class="demo-card" id="${esc(d.id)}" aria-labelledby="${esc(d.id)}-title">
        <a class="demo-shot" href="${esc(sitePath(d.play.url))}" tabindex="-1">
          <img src="${esc(d.image.src)}" width="${d.image.width}" height="${d.image.height}" alt="${esc(d.image.alt)}" loading="${i ? 'lazy' : 'eager'}" decoding="async">
          <span class="demo-index">${n}</span>
        </a>
        <div class="demo-body">
          <ul class="demo-tags" aria-label="Tags">${tags}</ul>
          <h2 id="${esc(d.id)}-title"><span class="demo-emoji" aria-hidden="true">${d.emoji}</span> ${esc(d.title)} <em><span class="sr-sep">· </span>${esc(d.subtitle)}</em></h2>
          <p class="demo-lead"><strong>${inline(d.lead)}</strong> ${inline(d.how)}</p>
          <p class="demo-credits">${credits}</p>
          <div class="demo-actions">
            <a class="demo-play" href="${esc(sitePath(d.play.url))}"><span class="demo-play-icon" aria-hidden="true">▶\uFE0E</span> ${esc(d.play.label)}</a>
            ${d.status ? `<span class="demo-status">${esc(d.status)}</span>` : ''}
          </div>
        </div>
      </article>`
}

export function renderDemosHtml(m) {
  return m.demos.map((d, i) => renderCard(m, d, i)).join('')
}

/** Placeholder -> HTML for demos/index.html. */
export function pageSlots(m) {
  const t = m.forum.title
  const cut = t.lastIndexOf(' by ')
  return {
    DEMOS_COUNT: String(m.demos.length).padStart(2, '0'),
    DEMOS_TITLE_A: esc(cut > 0 ? t.slice(0, cut) : t),
    DEMOS_TITLE_B: esc(cut > 0 ? t.slice(cut + 1) : ''),
    DEMOS_HOW: inline(m.forum.how),
    DEMOS_BYLINE: esc(m.forum.byline),
    DEMOS_INVITE: esc(m.forum.discord.invite),
    DEMOS_CARDS: renderDemosHtml(m),
  }
}

export function fillPage(html, m) {
  const slots = pageSlots(m)
  const out = html.replace(/<!--(DEMOS_[A-Z_]+)-->/g, (all, k) => {
    if (!(k in slots)) throw new Error(`demos page: unknown slot ${k}`)
    return slots[k]
  })
  return out
}
