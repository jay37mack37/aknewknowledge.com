# Projects and ideas directory blueprint

## Goal
Publish one honest, searchable list of every A Knew Knowledge project and idea, current, past and not yet started, at `/projects/`.
The owner wants all of it public, including ideas, the comic and the Threader work; the list holds 150+ entries and keeps growing.
Every entry says in plain text what state it is in (Public, In use, Building, Paused, Past, Idea, Unknown), so nothing claims to be live when it is not.

## Components and flow
- `public/projects/projects.json`: the one public data file (`aknew-projects/1`). Curated, sanitized summaries only; private research records never ship.
- `scripts/projects.mjs`: `loadProjects`, `validate` (schema, unique ids, parent ids exist, allowed statuses and categories, link rules, privacy lint), render helpers and `fillPage`. Same shape as `scripts/demos.mjs`, kept independent of it.
- `projects/index.html`: main-site chrome (header, mobile menu, footer, skip link, CSP) with `<!--PROJECTS_*-->` slots filled at dev and build time by a vite `transformIndexHtml` plugin, exactly like `/demos/`.
- Content is static HTML grouped by status with a jump list and counts, so the full directory, every summary and every link work with JavaScript off.
- `src/projects.ts`: progressive enhancement only. Reveals a search box and filters (status, category, era), hides non-matching rows and empty groups, announces the result count in a polite live region, and mirrors the filter in the URL query (`?q=&status=&category=&era=`) so a filtered view can be shared. No network; CSP stays `script-src 'self'`.
- Search matches the public name, original names and aliases, summary, note, included sub-projects, category, status and parent project.
- Records folded into another entry (for example early trading bots inside the legacy bundle) stay visible and searchable on that entry as an "Includes" list with their own names and a one-line relationship, so no past project disappears.
- AI-written concept lists (one entry has forty generated game pitches) render as a collapsed sub-list labelled as generated concepts; they are neither counted nor search hits.
- Optional `firstNoted` (YYYY or YYYY-MM) shows the earliest month an entry appears in our records; it is not a start date.
- Navigation: "Projects" joins the header and mobile nav on home, `/play/`, `/demos/` and `/projects/`; footer "Projects" points to `/projects/`; home "What we build" gets a "See every project" link; `/projects/` joins `sitemap.xml`.

### Privacy lint (fails the build)
Blocks private infrastructure and identity leaks in every string: IP literals, localhost and ports, tailnet hosts, home or server paths (`/home/`, `/srv/`, `~/`), hidden config directories, board ids (`t_` plus 8 hex), long numeric ids, email addresses, secret-looking words (password, token, api key, secret), and standalone AI model or agent names.
Project names the owner coined that contain a vendor word (for example AKnewGemini or aKnewCodex) are allowed because the rule matches standalone words only; this replaces the earlier blanket keyword filter that would have rejected legitimate project names.
Secret detection looks for secret values (`password=...`, token prefixes), not topics, so an idea like a local password manager is listed.
An exact-string allowlist (`ORIGINAL_NAMES`) keeps an owner's original project name searchable as an alias when it contains a vendor product word; it never applies to summaries or notes.
Links may only be site-relative paths that exist in the build or `https://github.com/jay37mack37/` public repositories. Auth routes are never linked.
The lint has known-bad fixtures in `tests/projects.spec.ts`; each must throw. The lint is a floor, not proof; summaries are written by hand from the research records.

## Files allowed
- `BLUEPRINT.md` (this file)
- `public/projects/projects.json` (new)
- `scripts/projects.mjs` (new)
- `projects/index.html` (new)
- `src/projects.ts`, `src/projects.css` (new)
- `vite.config.mjs` (add the `/projects/` input and slot plugin)
- `src/main.ts`, `demos/index.html`, `play/index.html` (nav "Projects", footer target, home "See every project" link)
- `src/style.css` (only if the eight-item desktop nav needs a tighter gap to fit)
- `public/sitemap.xml` (add `/projects/`)
- `tests/projects.spec.ts` (new)
Untouched: `/potential/`, comic, games, Threader pages, demos manifest, workflows, existing tests.

## Test plan
- RED first: `tests/projects.spec.ts` run before any production file exists fails on `/projects/` (404).
- The page mirrors `projects.json`: total count, per-status group counts, every entry id, name, status label, summary, aliases.
- With JavaScript disabled every entry, summary and link is present and the filter controls stay hidden.
- Search finds entries by public name and by original alias, and shows a "no matches" message for nonsense; status, category and era filters combine; reset restores the full list; the URL query restores the same view on reload.
- Every site-relative link returns 200; external links use `rel="noopener noreferrer"`.
- No console errors; no horizontal overflow at 320, 390, 844x390 landscape and 1440.
- "Projects" is reachable from home, `/play/` and `/demos/` in both navs, `aria-current="page"` on `/projects/`, footer link targets `/projects/`, desktop nav does not wrap at 901, 1024, 1180, 1440.
- Privacy lint known-bad fixtures each throw; legitimate coined names and the original-name allowlist pass.
- Every included sub-project name finds its parent entry through search; generated concepts are labelled and are not search hits.
- `npm run check`, `npm run build` and the full Playwright suite (desktop and mobile projects) stay green; screenshots at 320, 390 and 1440 plus a no-JS capture are kept as evidence outside the repo.

## Rollback
`git revert` the single commit. The route is additive; no data, settings, permissions or deployment configuration change.

## Acceptance
- `/projects/` lists every entry in `public/projects/projects.json` with an honest text status, readable on a 320px phone and usable with JavaScript off.
- Search and filters narrow 150+ entries quickly and announce results to screen readers.
- Existing pages, tests and routes behave as before apart from the added nav and footer links.
- Independent review and publication are owned outside this change; until the site is read back live, the directory is "merged, not live" at best.
