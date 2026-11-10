import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { fillPage, loadManifest, manifestPath } from './scripts/demos.mjs'
import { fillPage as fillProjects, loadProjects, projectsPath } from './scripts/projects.mjs'

const root = fileURLToPath(new URL('.', import.meta.url))

// /demos/ is generated from public/demos/manifest.json, the same manifest that
// drives the Discord #demos posts (npm run demos:discord).
const demosPage = {
  name: 'aknew-demos-manifest',
  configureServer(server) { server.watcher.add(manifestPath) },
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (!ctx.path.startsWith('/demos/')) return html
      return fillPage(html, loadManifest())
    },
  },
}

// /projects/ is generated from public/projects/projects.json; loadProjects() validates it
// (schema and privacy lint) and fails the build on a bad entry.
const projectsPage = {
  name: 'aknew-projects-directory',
  configureServer(server) { server.watcher.add(projectsPath) },
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (!ctx.path.startsWith('/projects/')) return html
      return fillProjects(html, loadProjects())
    },
  },
}

export default defineConfig({
  plugins: [demosPage, projectsPage],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        potential: fileURLToPath(new URL('potential/index.html', import.meta.url)),
        play: fileURLToPath(new URL('play/index.html', import.meta.url)),
        demos: fileURLToPath(new URL('demos/index.html', import.meta.url)),
        projects: fileURLToPath(new URL('projects/index.html', import.meta.url)),
      },
    },
  },
  root,
})
