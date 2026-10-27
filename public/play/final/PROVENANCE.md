# Maze Runner: Final — provenance

Static, solo build of the final (post-multiplayer) Pac-Man client, from the local
repository `pacman-multiplayer`, branch `t_b0c3844c/final` at commit `09cfedf`
(MIT per its package.json), for `/play/final/` on aknewknowledge.com.

- The server's authoritative simulation (`src/multiplayer_game.js`) runs inside the
  page through `src/local_room.js`, a WebSocket-shaped in-memory room, so the same
  client plays solo on a static host. `<body data-mode="solo">` switches it on.
  Nothing is sent anywhere: the CSP sets `connect-src 'none'`. Online rooms will be
  served off-box (kanban t_c571eb4d); no port is opened at home.
- iPhone controls: swipe anywhere (`src/touch.js`) plus big on-screen arrows
  (pointer events, 64–84 px targets, safe-area aware).
- 3D fix: the blank-screen frames came from the eye sitting 0.5 tiles from a flat,
  untextured wall whenever Pac-Man stopped (worse on portrait phones, whose fixed 75°
  vertical FOV left ~38° across). Fixed with panelled wall textures plus an eye-level
  rail, a first-person eye pull-back, a portrait-aware FOV, and auto-cornering at
  plain corners.
- Three.js r174, MIT licence: `vendor/LICENSE-three.txt`.
- Pac-Man is a trademark of Bandai Namco Entertainment Inc. This fan-made
  experiment is not affiliated with or endorsed by it.

## SHA-256 of files in this directory

```
fcaf39608941ab41d7ac02301d9471fd3affcc5da9f3adb9601529d7eb181a85  index.html
28e2f94951b9569987449d4283b01ac5e7a872c3c291f92de56086524e989bc5  style.css
3802855962ce3c04b6edf207ca40f4768d8898e9e89b8e77e73c66b329c2f4d8  src/audio.js
8b8250f04d3674555c2496104ccee02e449cb6204afefd243d4a5f8ae0b3dcb6  src/camera.js
0b9ab6a49a13e43914c85827dc2c20050a58f00ccd19978a232336f64602bcd4  src/client_adapter.js
ede519121ca47eb6ae4ae3b684c447f63159bfd071c6bd10f2613bdf350b3f96  src/game_state.js
c26475fbe584487a49484e1263d6631e1c72e96b60b72d53313514f650540cc9  src/ghost_ai.js
0647b1a62a29a8966529673422736d21623f2025eae8d38f2bde3b74a3ed1702  src/local_room.js
c5b6368011a84f73da795e499ebeb78ea8ecb6e04c2752d5802fcca191a02def  src/main.js
c169a3759ae587542e06f6d968cbb285a2a6c5446c03cd97af4759751239e7d4  src/maze.js
65850e8c12d5c5ea2f5e9828833e89a284d80ef148e108be4e80a20a93aeac26  src/movement.js
84dfee593dd41780e74aa7c8fd4fad49a0782f209cbdacdce149acf82d0d5762  src/multiplayer_game.js
e296691c846ed7ce07b7ebc7e26f24d9b89e4a9fe034b5bad96cc0422d5219bc  src/network.js
2fbedc43285aef7bb714d7144025ff11723dd47d2863f1e18ea0d0bb7c3a8e58  src/renderer.js
e5776e3febad629af55f745a6c9a46b6b78ea2853d397e1aa51ebb3b6f300d23  src/touch.js
bfe119ea4fd413f5f7ca3fcd63adb0c4a073ed39daa2fe7d3e6b769e21272601  vendor/LICENSE-three.txt
8af04b9919f19452d7e210db378a4be62f7952f3256739464c088a660d7d7c7f  vendor/three.core.js
8cd1b1ed9c81fb3e433615f5277f3feeebfb7404836b1fa22c282c02da26b080  vendor/three.module.js
```
