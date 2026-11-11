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
The preview was independently accepted, merged through the main-owned release path, and read back live with matching hashes for all five files.
A real public 390px Chromium center-cover tap advanced to Page 1 without opening zoom.
Main authorized a separate production promotion step, including migration of the obsolete gesture-test contract and a new reviewed PR.
The migrated `tests/comic.spec.ts` now checks broad reading-area taps, center-forward, explicit Enlarge and native focus return, while retaining arrow keys, persistence, synthesized-click suppression and one-turn swipe assertions.
The two zoom-opening calls in `tests/comic-flow.spec.ts` now use Enter on the art button, preserving the existing keyboard/focus contract instead of incorrectly expecting a pointer tap to zoom.
No assertions are removed, tests skipped or protections weakened.
The production HTML is generated from the accepted candidate by removing only preview labels/base URL and changing runtime references to production-relative paths.
Candidate and production JS/CSS are byte-identical; pathname-based namespace detection keeps their preferences separate.
Public release remains main-owned after fresh exact-revision independent acceptance and exact-head CI.
No self-approval or worker merge.
Public readback must verify both hashes and the real reading flow.


## Owner-requested performance extension
After the preview was public, the owner approved its design and requested a large speed increase and immediate promotion of the finished reader.
The same writer owns this extension, including the responsive build, source-set sizing, thumbnail delivery, decode warming and the old test-contract migration.
The additional implementation paths are `scripts/comic-images.mjs`, `vite.config.mjs`, and dependency declarations generated by `npm install --save-dev --save-exact sharp@0.35.5`.
No approved originals, issue metadata, dialogue or PDF are edited.

### Image delivery
The build emits 180px thumbnails, 720px phone derivatives and 1200px larger-view derivatives from all 16 pages and 61 panels.
The current build verifies 385 derivative assets against the generated manifest's byte counts.
WebP uses quality 84 for reading and 65 for thumbnails.
AVIF uses quality 68 and is selected only where smaller than its WebP equivalent.
Unsupported AVIF decoding falls back to the WebP srcset, without dropping straight to full-resolution art.
The generated manifest includes original dimensions and tiny inline 24px placeholders.
Phone transfer density is capped at 720 pixels while metadata-based CSS preserves the approved rendered image dimensions.
Full-resolution `src` is retained for explicit Enlarge; the PDF is never prefetched.
Next two and previous one images are preloaded and `decode()` is called in the active page/panel sequence.
Warming starts after the visible image decodes so it does not compete with first paint; the image map is bounded to the current neighborhood.
The visual page overview uses 180px lazy thumbnails, not full comic pages.
Development checkouts without generated assets retain the original-image fallback; deployed builds include the manifest and all derivatives.

### Performance measurement
The benchmark uses fresh Chromium with iPhone 13 emulation at 390x844, cache disabled, Fast 4G with 40ms latency, 9Mbps download and 1.5Mbps upload.
First-visible timing ends after the full selected cover image decodes and two animation frames paint, not when the blur placeholder appears.
Wire bytes are the `loadingFinished` encoded length (headers plus body) of each request the page's own resource timing reports complete at that paint.
Neighbour images still in flight at paint are listed separately and not counted; requests started after paint are excluded.
LCP is read from the browser PerformanceObserver.
Page-turn measurements include input, image readiness, decode and paint after the neighborhood has warmed.
The baseline is the real public preview before optimization; the candidate is the locally served exact built runtime under the same explicit network throttle.
Origin/connection overhead differs, so live post-deployment measurement is required before claiming the final public budget.

#### Pre-release table (legacy byte row unreliable)
The byte row below summed CDP `Network.dataReceived` chunks, which is not a wire total.
Over HTTP/2 Chromium reports zero for many chunks: one public cold load summed 26,662 B against 185,890 B of completed requests.
Over local HTTP/1.1 the same sum drops response headers and adds partial bytes of in-flight neighbour prefetches.
The 3,116,668 and 220,022 figures are kept only as history and are not comparable to the corrected method.
The timing rows and the cover body sizes are reliable; the 3588ms baseline is the first fully decoded image and stays the reference.

| Metric | Public unoptimized preview | Optimized local candidate |
| --- | ---: | ---: |
| First decoded cover visible | 3588ms | 457ms |
| LCP | 3460ms | 392ms |
| Legacy dataReceived sum to first visible cover (unreliable) | 3,116,668 | 220,022 |
| Three warmed page turns | 111 / 381 / 150ms | 62 / 48 / 49ms |
| Cover image body | 1,923,468 bytes | 152,980 bytes (720px AVIF) |

#### Public production receipts (authoritative)
Two cold production runs after release, same device profile and throttle, fresh browser profile, cache cleared.
Wire bytes use the completed-request method above.

| Metric | Run 1 | Run 2 |
| --- | ---: | ---: |
| First decoded cover visible | 699ms | 630ms |
| LCP | 652ms | 564ms |
| Cover body (720px AVIF) | 152,980 B | 152,980 B |
| Cover on the wire | 153,237 B | 153,228 B |
| Completed wire bytes at first paint | 185,861 B | 185,885 B |

Each completed total covers the HTML, stylesheet, script, issue metadata, image manifest and cover; pages 1 and 2 were still in flight at paint in both runs and are not counted, even where part of a body had arrived.
The corrected local regression reads 185,657 B completed at paint, with the same two neighbours in flight.

Image decode exposed a real slow-swipe bug: moving horizontal gestures taking 500-800ms were incorrectly classified as long presses.
The runtime now uses input timestamps and distinguishes stationary holds from an already-moving swipe; the trusted-touch test deliberately pauses mid-swipe while retaining all long-press, scroll and pinch assertions.
Runtime asset URLs have a new query version so a browser does not reuse the old slow reader code under the website's ten-minute cache lifetime.
The regression suite enforces a decoded cover below 1000ms and below 350,000 completed wire bytes under this exact throttle.
It also fails if the cover's counted wire bytes fall below its own body size, and a recorded HTTP/2 fixture proves the legacy sum trips that check.
A separate regression checks that responsive source sets do not shrink the original rendered 366px-wide cover on a 390px phone.
The image-error interception patterns now cover both originals and derivatives, preserving the same recovery assertions.
Image readiness helpers wait for nonzero natural width and full opacity, since the new blur placeholder intentionally appears before decoding completes.
The side-by-side original/720px AVIF comparison preserves the smallest rotated dialogue and halftone detail at mobile reading width.

## Rollback
Revert the release commit with `git revert <release-commit>`.
No data migration or artwork changes; preview preferences are disposable and distinct.

## Acceptance evidence
Implementation and verification results are recorded on the task with exact revision, commands, screenshots and public readbacks.
Unverified deployment is never described as live.
