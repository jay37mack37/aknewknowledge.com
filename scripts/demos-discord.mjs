#!/usr/bin/env node
// Discord side of the shared demo manifest.
//
//   node scripts/demos-discord.mjs [--out DIR] [--files]
//       Write one aKnewMod intent per demo (edit_forum_post when the manifest has a
//       thread_id, create_forum_post otherwise) plus edit_forum for the guidelines.
//       Apply each with aKnewMod:  moderator cli ... --json-file <intent>
//   node scripts/demos-discord.mjs --check READBACK.json
//       Compare a readback of the live forum ([{thread_id, name, content, tags, buttons}])
//       with the manifest. Exits 1 on drift.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { discordGuidelines, discordIntent, loadManifest } from './demos.mjs'

const args = process.argv.slice(2)
const m = loadManifest()
const flag = (k) => args.includes(k)
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined)

const intents = [
  { action: 'edit_forum', channel_id: m.forum.discord.channel_id, guidelines: discordGuidelines(m) },
  ...m.demos.map((d) => ({ id: d.id, ...discordIntent(m, d, { withFiles: flag('--files') }) })),
]

if (flag('--check')) {
  const live = JSON.parse(readFileSync(opt('--check'), 'utf8'))
  const byId = new Map(live.posts.map((p) => [p.thread_id, p]))
  const drift = []
  if (live.guidelines !== intents[0].guidelines) drift.push('forum guidelines')
  for (const it of intents.slice(1)) {
    const p = byId.get(it.thread_id)
    if (!p) { drift.push(`${it.id}: no live post`); continue }
    for (const k of ['name', 'content']) if (p[k] !== it[k]) drift.push(`${it.id}: ${k}`)
    if ([...p.tags].sort().join() !== [...it.tags].sort().join()) drift.push(`${it.id}: tags`)
    const btn = (bs) => bs.map((b) => `${b.emoji}|${b.label}|${b.url}`).join('\n')
    if (btn(p.buttons) !== btn(it.buttons)) drift.push(`${it.id}: buttons`)
  }
  const extra = live.posts.filter((p) => !intents.some((it) => it.thread_id === p.thread_id))
  for (const p of extra) drift.push(`live post not in manifest: ${p.name}`)
  console.log(drift.length ? `❌ drift:\n- ${drift.join('\n- ')}` : `✅ Discord #demos matches the manifest (${m.demos.length} demos)`)
  process.exit(drift.length ? 1 : 0)
}

const out = opt('--out')
if (out) {
  mkdirSync(out, { recursive: true })
  intents.forEach((it, i) => {
    const { id, ...intent } = it
    writeFileSync(join(out, `${String(i).padStart(2, '0')}-${id ?? 'forum'}.json`), JSON.stringify(intent, null, 2) + '\n')
  })
  console.log(`wrote ${intents.length} intents to ${out}`)
} else {
  console.log(JSON.stringify(intents, null, 2))
}
