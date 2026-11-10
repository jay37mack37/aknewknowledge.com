# AKnewComic final polish v2 blueprint

## Goal
Finish the existing owner-approved Issue #1 without redesigning it: consistently Black hero, cover-only title, and readable iPhone presentation.
Private chronological requirements are attached to canonical task t_ee5ddd96, never shipped with the website.

## Components and flow
Use AKnewGemini's existing locked Chromium client and shared rate guard for reference-conditioned Nano Banana edits, sequentially paced with checkpoints and no credential changes.
Preserve all 16 approved source images in the original art checkout.
Edit only hero skin throughout and remove interior mastheads, preserving original dialogue and layout.
Assemble final WebP, PDF and explicit reading metadata.
Extend existing static reader with a clean cover entry, large controls, a panel-focused mobile mode, and actual large selectable dialogue and scene descriptions.
Keep full-page artwork and zoom available.

### Owner redirect 2026-11-09: normal comic layout first
The default reader is a normal comic book site: first visit opens the cover, then each full story page as art only, with no transcript under it.
Controls are tidy and normal sized (about 40px, not 56px slabs); the page fits the viewport on desktop 1440x900 and phone 390x844.
Tapping the left or right edge of the page turns it, tapping the center enlarges it.
A horizontal swipe turns the page and the trailing synthesized click is ignored so it does not open zoom.
Arrow keys and small Prev/Next controls also turn pages.
One visible "Large text mode" toggle switches to the existing panel and transcript reader unchanged (28px+ story text, 56px controls, text sizing, panel/whole-page views) and switches back.
The chosen mode is stored under its own key `aknewcomic.issue01.reader.mode.v3`; the old v2 saved page/view/size key never selects a mode, so earlier visitors land in the new default layout.
Normal mode remembers its own page under `aknewcomic.issue01.reader.comic.v3`.
`?mode=accessible` (or `?mode=comic`) deep links pick and remember a mode; toggling clears the query so the choice sticks.
Zoom, PDF, schema guards, broken-asset recovery and focus behavior are shared by both modes.
Use original story script and visually verify every transcript against the actual edited page.

## Files allowed
- public/aknewcomic/index.html and reader assets within public/aknewcomic/.
- tests/comic.spec.ts and tests/comic-flow.spec.ts for real-browser checks.
- scripts/finalize-comic-v2.py for deterministic reviewed-asset assembly.
- .github/workflows/check.yml, reusing the existing PR30 pinned check/build workflow because live main protection requires a build check but main has no pull-request build trigger.
- docs/AKNEWCOMIC-FINAL-v2.md for public technical verification without private source quotes.
- This blueprint.
Art outputs and private receipts remain in the canonical task workspace until selected for publication.
No homepage changes unless the separately requested Fancy site removal is still needed and independently reviewed.

## Test plan
First run a real-browser regression that fails because readable text/panel mode are absent.
Redirect: first add and run one failing default-layout test (cover then full page art, no transcript, small controls) before production changes.
Existing accessibility tests keep their assertions and explicitly enter Large text mode.
New tests: full 16-page normal reading flow, edge taps, swipe without zoom, keyboard, zoom, toggling both ways, persistence, deep link, old v2 preferences ignored, no overflow at 320, 390 and desktop, small default control heights.
Verify every page decodes, all page assets exist, no interior mastheads, consistent dark-brown hero in all panels, unchanged story/approved style.
At 390x844 and 320px: no sideways document scroll, controls >=48px, readable HTML text >=24px, every scene/panel reachable, font sizing and persistence, cover-to-ending navigation, keyboard, zoom, reload, explicit load failures.
Run check, build and existing site tests.
Independent acceptance review covers current diffs and actual rendered flow, then final publication is read back from the existing URL and hashes compared.

## Rollback
Revert the final coherent website commit to redeploy the prior reader and assets.
Original art remains untouched and private output checkpoints are retained.
No gateway/browser restart, new privilege or new network exposure.

## Acceptance
- Cover plus fifteen story pages, Black hero consistent everywhere including artwork embedded in story covers.
- Exactly one external cover title, no story-page masthead clutter.
- Normal comic layout by default; actual low-vision-readable story on iPhone with large selectable text and panel-first artwork one toggle away; not merely larger navigation.
- Preserve jokes, story circle, approved style, physical props and callbacks.
- Private preview is verified at 127.0.0.1:4195; publication remains explicitly on hold for OpenClaw main.
- Page 11 hero faces and hands corrected while original Javell, margins and unaffected panels are preserved with masked compositing.
- Identity audit also corrected the matching glasses/light-face drift on page 12 and darkened page 9 skin without changing its original hair, pose or expressions.
- All affected full pages, panel crops and the PDF were rebuilt from the selected sources.
- Final all-panel identity sweep inventories every one of the sixty-one panels against the cover, including civilian and miniature hero appearances.
- Fourteen remaining mismatches on pages 1, 2, 3, 5 and 9 are corrected only within bounded hero regions; original lettering, Javell, props, expressions and all unaffected panels remain.
- Normal-mode cover caption aligns on the empty left side of its bar, separated from the unchanged 40px Read issue button by a browser-tested minimum 16px gap.
