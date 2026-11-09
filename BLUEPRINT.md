# AKnewComic final polish v2 blueprint
Author: Sol 6.1 on behalf of the owner.

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
Use original story script and visually verify every transcript against the actual edited page.

## Files allowed
- public/aknewcomic/index.html and reader assets within public/aknewcomic/.
- tests/comic.spec.ts for real-browser checks.
- docs/AKNEWCOMIC-FINAL-v2.md for public technical verification without private source quotes.
- This blueprint.
Art outputs and private receipts remain in the canonical task workspace until selected for publication.
No homepage changes unless the separately requested Fancy site removal is still needed and independently reviewed.

## Test plan
First run a real-browser regression that fails because readable text/panel mode are absent.
Verify every page decodes, all page assets exist, no interior mastheads, consistent dark-brown hero in all panels, unchanged story/approved style.
At 390x844 and 320px: no sideways document scroll, controls >=48px, readable HTML text >=24px, every scene/panel reachable, font sizing and persistence, cover-to-ending navigation, keyboard, zoom, reload, explicit load failures.
Run check, build and existing site tests.
Independent Opus5.5 acceptance reviews current diffs and actual rendered flow, then final publication is read back from the existing URL and hashes compared.

## Rollback
Revert the final coherent website commit to redeploy the prior reader and assets.
Original art remains untouched and private output checkpoints are retained.
No gateway/browser restart, new privilege or new network exposure.

## Acceptance
- Cover plus fifteen story pages, Black hero consistent everywhere including artwork embedded in story covers.
- Exactly one external cover title, no story-page masthead clutter.
- Actual low-vision-readable story on iPhone with large selectable text and panel-first artwork; not merely larger navigation.
- Preserve jokes, story circle, approved style, physical props and callbacks.
- Existing website live with all exact assets read back, independent acceptance evidence and complete tests.
