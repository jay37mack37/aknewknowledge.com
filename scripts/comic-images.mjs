import sharp from 'sharp'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Derivatives are build outputs only. Approved originals and issue text stay untouched.
export function comicImages(root) {
  return {
    name: 'aknew-comic-responsive-v2',
    apply: 'build',
    async generateBundle() {
      const directory = path.join(root, 'public/aknewcomic')
      const issue = JSON.parse(await readFile(path.join(directory, 'issue.json'), 'utf8'))
      const sources = issue.pages.flatMap((page) => [page.src, ...(page.panels || []).map((panel) => panel.src)])
      const manifest = { schema: 'aknewcomic-images/2', images: {} }
      for (const source of sources) {
        const original = await readFile(path.join(directory, source))
        const { width, height } = await sharp(original).metadata()
        const stem = source.replace(/\.webp$/, '')
        const placeholder = await sharp(original).resize({ width: 24 }).webp({ quality: 20 }).toBuffer()
        const image = { width, height, placeholder: `data:image/webp;base64,${placeholder.toString('base64')}`, variants: [], webp: [] }
        for (const target of [180, 720, 1200]) {
          const actualWidth = Math.min(width, target)
          const resized = sharp(original).resize({ width: actualWidth, withoutEnlargement: true })
          const webp = await resized.clone().webp({ quality: target === 180 ? 65 : 84, effort: 5 }).toBuffer()
          const webpPath = `responsive/${stem}-${target}.webp`
          this.emitFile({ type: 'asset', fileName: `aknewcomic/${webpPath}`, source: webp })
          image.webp.push({ width: actualWidth, src: webpPath, bytes: webp.length })
          // Thumbnails prioritize low encoding cost and universal WebP support.
          const avif = target === 180 ? null : await resized.clone().avif({ quality: 68, effort: 3 }).toBuffer()
          if (avif && avif.length < webp.length) {
            const avifPath = `responsive/${stem}-${target}.avif`
            this.emitFile({ type: 'asset', fileName: `aknewcomic/${avifPath}`, source: avif })
            image.variants.push({ width: actualWidth, src: avifPath, bytes: avif.length })
          } else image.variants.push({ width: actualWidth, src: webpPath, bytes: webp.length })
        }
        manifest.images[source] = image
      }
      this.emitFile({ type: 'asset', fileName: 'aknewcomic/responsive/manifest.json', source: JSON.stringify(manifest) })
    },
  }
}
