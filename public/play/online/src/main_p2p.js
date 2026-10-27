// Entry point for serverless (static) hosting: install the WebRTC transport,
// then boot the normal game. Signaling uses public Nostr relays via trystero.
import { joinRoom, selfId } from '../vendor/trystero.js';
import { createP2PSocketClass } from './p2p_net.js';

globalThis.__PACMAN_WS_IMPL__ = createP2PSocketClass({
  joinRoom,
  selfId,
  log: (...a) => { if (globalThis.__PACMAN_P2P_DEBUG__) console.log('[p2p]', ...a); }
});

await import('./main.js');
