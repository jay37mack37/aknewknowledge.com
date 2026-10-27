# Maze Runner — provenance

Static, client-side adaptation of the accepted single-player game
`pacman-fps` at commit `71796216b775c2f16862448f2db927bd8ea3c3ed`
(local repository `../pacman-fps`, MIT per its package.json), for the
`/play/` page of aknewknowledge.com.

- Unchanged copies: `src/audio.js`, `src/ghost_ai.js`, `src/game_state.js`,
  `src/maze.js`, `src/movement.js`, `vendor/three.module.js`, `vendor/three.core.js`.
- Adapted: `index.html` (brand copy, accessible names, CSP, pause/restart buttons),
  `style.css` (A Knew Knowledge palette and type), `src/main.js` (pause/restart
  buttons, focus management, live announcements, reduced motion, auto-pause on tab
  hide), `src/renderer.js` (brand colours, reduced-motion switch, wider vertical FOV on portrait phones so corridors stay readable),
  `src/camera.js` (optional head bob).
- Three.js r174, MIT licence: `vendor/LICENSE-three.txt` (the source repository did
  not vendor this file).
- Audio is synthesised at runtime with WebAudio; there are no audio, image or font
  asset files. The game makes no network requests; its CSP sets `connect-src 'none'`.
- Pac-Man is a trademark of Bandai Namco Entertainment Inc. This fan-made
  experiment is not affiliated with or endorsed by it.

## SHA-256 of files in this directory

```
e2f6ed836df33a5b577421bdc0db9f5372f8b1f53df94c395546406946e5d7db  index.html
aed7a51222a0f2a4df8d96a5d29394af473db3546f3e46338237eb43c0531dc7  style.css
a519513957ab3ee09171587d1d197214574800985ca3339f1bac205e72222c49  src/audio.js
6a218d6e16fb51bfa0a03e48f50e4855bb6d8c00724e40c85df83dcd08c3e864  src/camera.js
ede519121ca47eb6ae4ae3b684c447f63159bfd071c6bd10f2613bdf350b3f96  src/game_state.js
c26475fbe584487a49484e1263d6631e1c72e96b60b72d53313514f650540cc9  src/ghost_ai.js
281de18ad151e64a377e1aa4b27facd2f27b795d3a9e1f44b56f15803e8be805  src/main.js
9b45d97fe219a02dca5d8329fdc23e3839eaedff4e89f2c9f561e4056ca32fdb  src/maze.js
79819fb84d2fc70a5d476efe9395fc8c73a28fb1bc925380e4099b5b5bea093a  src/movement.js
5882d2f34b37f1b5ab7a3efacb89fe9d3bfbe363f3ae66a786535976a54b6fd7  src/renderer.js
bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601  vendor/LICENSE-three.txt
8af04b9919f19452d7e210db378a4be62f7952f3256739464c088a660d7d7c7f  vendor/three.core.js
8cd1b1ed9c81fb3e433615f5277f3feeebfb7404836b1fa22c282c02da26b080  vendor/three.module.js
```

## SHA-256 of the original files at 7179621 (before adaptation)

```
9842d52f1a03708a9921cc73468b4e1ddfb2c033f776e5e0ef4a0b41a4038adf  index.html
dba85fddffbec8e7637e66f413a6e40b3bbd9dc235cd407bd09a8bc755467f0e  style.css
a519513957ab3ee09171587d1d197214574800985ca3339f1bac205e72222c49  src/audio.js
2f2ed42ea8e721ebefa1045cd6666e402f17f5c5a6d34061b667fa3fe8e14c0e  src/camera.js
ede519121ca47eb6ae4ae3b684c447f63159bfd071c6bd10f2613bdf350b3f96  src/game_state.js
c26475fbe584487a49484e1263d6631e1c72e96b60b72d53313514f650540cc9  src/ghost_ai.js
d34f8b184192295a5fa2ef3e16e99d66dd32c67b791aaf9108b38c6b560a1505  src/main.js
9b45d97fe219a02dca5d8329fdc23e3839eaedff4e89f2c9f561e4056ca32fdb  src/maze.js
79819fb84d2fc70a5d476efe9395fc8c73a28fb1bc925380e4099b5b5bea093a  src/movement.js
34fa365073e213e5868b4219969b113206beb7866e770c628e82b727ca684f7d  src/renderer.js
8af04b9919f19452d7e210db378a4be62f7952f3256739464c088a660d7d7c7f  vendor/three.core.js
8cd1b1ed9c81fb3e433615f5277f3feeebfb7404836b1fa22c282c02da26b080  vendor/three.module.js
```
