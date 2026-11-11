import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Local promotion only. Review, merge, CI and deployment remain release-owner gates.
const root = fileURLToPath(new URL('../', import.meta.url))
const candidate = 'public/preview/comics/reader/'
const production = 'public/aknewcomic/'
const files = ['index.html', 'reader-v2.js', 'reader-v2.css']
const sha = (text) => createHash('sha256').update(text).digest('hex')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const args = process.argv.slice(2)
const promote = args[0] === '--promote'
const verify = args[0] === '--verify-url'
if (args.length && !promote && !verify && args[0] !== '--check') throw new Error('Use --check, --promote <reviewed-head>, or --verify-url <site-origin>')

const originals = Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(path.join(root, candidate, file), 'utf8')])))
const promoted = { ...originals }
promoted['index.html'] = promoted['index.html']
  .replace('<base href="/aknewcomic/">\n  ', '')
  .replace('<title>Preview · ', '<title>')
  .replace(/  <aside class="preview-note">[^\n]*<\/aside>\n/, '')
  .replaceAll('/preview/comics/reader/reader-v2.', 'reader-v2.')
if (promoted['index.html'].includes('/preview/')) throw new Error('Promotion still contains preview navigation')
const manifest = { schema: 'aknewcomic-release/2', revision: git('rev-parse', 'HEAD'), preview: {}, production: {} }
for (const file of files) {
  manifest.preview[file] = sha(originals[file])
  manifest.production[file] = sha(promoted[file])
}

if (promote) {
  if (args.length !== 2 || !/^[a-f0-9]{40}$/.test(args[1]) || args[1] !== manifest.revision) throw new Error('Promotion requires the exact independently reviewed HEAD')
  if (git('status', '--porcelain')) throw new Error('Promotion requires a clean worktree')
  for (const file of files) await writeFile(path.join(root, production, file), promoted[file])
  console.log('Promoted the three reviewed reader files locally. Not merged or deployed.')
} else if (verify) {
  const url = new URL(args[1])
  if (url.protocol !== 'https:' || url.origin !== 'https://aknewknowledge.com' || url.pathname !== '/') throw new Error('Readback is limited to the existing website origin')
  // Serial public GETs only; no auth, cookies or writes.
  for (const [kind, prefix] of [['preview', 'preview/comics/reader/'], ['production', 'aknewcomic/']]) {
    for (const file of files) {
      const response = await fetch(new URL(prefix + file, url), { cache: 'no-store' })
      if (!response.ok) throw new Error(`Readback failed: ${kind}/${file} ${response.status}`)
      if (sha(await response.text()) !== manifest[kind][file]) throw new Error(`Readback revision mismatch: ${kind}/${file}`)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  console.log('Exact preview and production asset readbacks match this candidate.')
}
console.log(JSON.stringify(manifest, null, 2))
