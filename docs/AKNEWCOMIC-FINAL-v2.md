# AKnewComic Issue #1: final reader v2

Authored by Sol 6.1 on behalf of the owner.

## Intent
Make the existing illustrated friendship comic comfortable to read on a phone without changing its approved story or vintage art direction.
The finished issue has one cover and fifteen story pages.
The main caped hero and his friend both have brown skin throughout the selected artwork.
Interior chapter mastheads are removed; titles printed on fictional comic props remain part of the story.

## Reader
Panel view is the default and follows the actual artwork's reading order through sixty-one panels.
Every panel includes a concise scene description and selectable dialogue, attributed to the visible speaker.
The red-caped character is labeled Hero; the character in the gray hoodie is Javell.
Wordless panels intentionally contain no invented dialogue.
Whole-page view preserves the original composition and shows that page's complete readable text beneath it.
Artwork can also open in an enlarged, scrollable dialog.

Story lettering defaults to 28px and adjusts from 24px to 44px.
Interactive controls are at least 56px high.
Reading position, view and text size are saved locally when browser storage is available.
No account, analytics, external font, tracking script or server-side reading history is used.
The PDF contains the same cover and fifteen cropped story pages.

## Asset contract
`issue.json` uses schema `aknewcomic-issue/2`.
There are exactly sixteen entries in `pages`.
Each entry has a local `pages/*.webp` source and a label.
The cover also has a descriptive string.
Each story page has a non-empty `panels` array.
Each panel contains a local `panels/*.webp` source, a description, and a dialogue array of speaker/text objects.
The reader rejects incomplete or invalid metadata instead of opening a dead-end issue.
Missing images leave readable text and navigation available.
All manifest strings render through textContent, not HTML injection.

## Reproduction
The deterministic asset builder is `scripts/finalize-comic-v2.py`.
It takes explicit artwork, reviewed panel-metadata and output directories; it does not call an image provider or access private conversation archives.
Original source art and private provenance are not shipped with this website.

```sh
python3 -I scripts/finalize-comic-v2.py --art-dir ART --panel-file REVIEWED-PANELS.json --output public/aknewcomic --receipt ASSET-RECEIPT.json
npm run check
npm run build
npx playwright test tests/comic.spec.ts tests/comic-flow.spec.ts --workers=1
npx playwright test tests/site.spec.ts tests/demos.spec.ts tests/play.spec.ts --workers=1
```

## Verified before publication
- Sixteen unique source images decoded at their actual resolution.
- Sixty-one cropped panels assembled from measured final-image borders.
- Sixteen reader browser tests passed across desktop and mobile projects.
- Twenty-eight existing website, arcade and demo tests passed.
- Every panel traversed in order from the cover through the ending.
- Narrow 320px layout checked at maximum text size, with no document overflow.
- Keyboard focus, zoom, page selection, reload persistence, broken images and incomplete-manifest failures checked.
- Actual iPhone-width screenshots captured with 28px story text and 56px navigation.

Independent acceptance and publication readback are recorded separately after their completion.

## Rollback
Revert the final reader commit and let the existing website deployment restore the previous reader and assets.
No gateway, browser account, credential, permission or public-host configuration changes are part of this release.
