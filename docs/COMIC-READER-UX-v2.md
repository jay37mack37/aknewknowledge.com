# AKnewComic v2 mobile reader blueprint

## Intent and scope
Make the reading surface a large, predictable page-turn target without changing the approved comic, dialogue, normal default or optional Large text mode.
The preview lives at `/preview/comics/`, with an independent candidate reader at `/preview/comics/reader/`.
Only the task's named files are in scope.
This document is the scoped blueprint; the root BLUEPRINT.md belongs to the separate projects directory feature and is not edited.

## Reproduction before runtime edits
A real Chromium iPhone 13 browser visited the public normal reader and tapped 60% across the reading area.
The count remained `Cover · Issue #1` and zoom opened instead of advancing to Page 1.
The standalone Playwright command exited 1; a before screenshot is retained in task evidence.
The existing runtime binds normal navigation to the outer 30% of the image button, not the reading area, and Large text always enlarges.

## Bounded research and reuse decision
Research uses primary reader documentation and GitHub discovery, not downloads or copied third-party code.
- Mihon documents configurable tap zones, screen/width fitting, page numbering, native pinch/zoom and separate long-tap actions: https://mihon.app/docs/guides/reader-settings
- Komga fit-to-screen discussion confirms that screen and width fitting solve different reading needs: https://github.com/gotson/komga/issues/145
- Komga zoom/width discussion: https://github.com/gotson/komga/discussions/1596
Searches: `site.mihon.app reader navigation tap zones webtoon`; `site.github.com komga webreader fit width thumbnail navigation`.
The search provider's paid route was unavailable; results came through its disclosed keyless fallback.
These are inspiration, not a claim that every comic reader uses this owner's preferred zones.
Reuse our existing move/show, metadata validation, panel transcript, native dialog, PDF, keyboard and local persistence.
Add only broad left-third/back and remaining/forward targets, an explicit Enlarge control, fit-width, visual page overview and restart/resume clarity.
No new libraries, account/library features, copied source, analytics, network services or permissions.
Licensing: no upstream code is incorporated; only interaction patterns are adapted.

## Components and data flow
- Preview landing: compact visual before/after diagrams and links explicitly separating the candidate and normal reader.
- Independent candidate HTML, JS and CSS under `public/preview/comics/reader/`.
- Candidate reads the same immutable `/aknewcomic/issue.json`, pages, panels and PDF using an HTML base URL, without copying or editing art/dialogue.
- Preview preference keys are separate from existing production keys, including fit choice; production preferences are neither read nor written.
- Broad `#story` pointer taps turn left below one third, forward otherwise, in either mode.
- Existing art button keyboard activation still enlarges; a separate visible Enlarge button handles pointer enlargement.
- Touch tracking records maximum excursion, elapsed time, multi-touch, scroll and browser zoom. Only a short stationary tap or one horizontal swipe may turn.
- Browser vertical scroll, pinch zoom, selection/long press, control events and modal events must not turn.
- Options contains fit screen/width, a lazy thumbnail grid, page selection, current saved position and Restart issue.
- Release script compares/checks candidate identity and promotes only the three approved production files. It never pushes, approves, merges or deploys.

## Test plan
1. Live red center-tap repro before runtime edits.
2. Candidate center and blank-margin targets, left third and boundaries, buttons/keyboard, both reader modes and panel/page views.
3. Trusted CDP touch swipe, vertical scroll, pinch, long press and drag/return; verify one turn and no synthesized click turn.
4. Native zoom/close/focus, fit choice, thumbnails, restart/resume, preference isolation, image errors and no horizontal overflow.
5. Run check, build and the whole existing suite against unchanged production plus candidate regressions.
6. Capture mobile browser screenshots at narrow phone widths and independently inspect them.
7. Independent exact-revision acceptance on the served required review model, required CI on PR head, and main-owned review/release.
8. Public preview and production readback must match the accepted asset identities, not merely return HTTP 200.

## Release boundaries
Existing production tests assert the old center-enlarges interaction.
They remain unchanged while validating preview isolation; promoting the new interaction requires main to authorize migration of those obsolete assertions, rather than weakening them or silently exceeding this card's file scope.
No self-approval or branch-protection changes.
Public release is main-owned; no worker publication without the reviewed release handoff.

## Rollback
Revert the release commit with `git revert <release-commit>`.
No data migration or artwork changes; preview preferences are disposable and distinct.

## Acceptance evidence
Implementation and verification results are recorded on the task with exact revision, commands, screenshots and public readbacks.
Unverified deployment is never described as live.
