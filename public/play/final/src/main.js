import {
  createRenderer
} from './renderer.js';
import {
  createMaze
} from './maze.js';
import {
  createClientAdapter,
  createMultiplayerController
} from './client_adapter.js';
import {
  createNetworkClient
} from './network.js';
import {
  getCameraModeLabel
} from './camera.js';
import {
  createAudioController
} from './audio.js';
import { LocalRoomSocket } from './local_room.js';
import { attachSwipe } from './touch.js';

// Solo mode: the static site build sets <body data-mode="solo">. The same
// authoritative simulation then runs in the page (LocalRoomSocket) instead of on
// a server, so the game plays on any static host with nothing exposed.
const SOLO = typeof document !== 'undefined' && document.body && document.body.dataset.mode === 'solo';

// Whitelist of allowed emote phrases (matching server)
const EMOTE_WHITELIST = [
  'WAKA WAKA!',
  'CHOMP TIME!',
  'LOOK OUT!'
];
let emoteIndex = 0;

// Generate short safe room ID (e.g., "room-482")
function generateDefaultRoomId() {
  const rand = Math.floor(100 + Math.random() * 900);
  return `room-${rand}`;
}

// Parse query string for room: ?room=...
function getInitialRoomId() {
  try {
    const params = new URLSearchParams(window.location.search);
    const rm = params.get('room');
    if (rm && /^[a-zA-Z0-9_-]{1,32}$/.test(rm)) {
      return rm;
    }
  } catch (e) {
    // Ignore
  }
  return generateDefaultRoomId();
}

function updateShareUrlInput(roomId) {
  const shareInput = document.getElementById('lobby-share-url');
  if (!shareInput) return;
  const origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
  const pathname = window.location.pathname || '/';
  shareInput.value = `${origin}${pathname}?room=${encodeURIComponent(roomId)}`;
}

// Bootstrapping
window.addEventListener('DOMContentLoaded', () => {
  const gameContainer = document.getElementById('game-container');
  const minimapCanvas = document.getElementById('minimap');
  const screenFlash = document.getElementById('screen-flash');
  const toastContainer = document.getElementById('toast-container');

  // Screens & overlays
  const screenLobby = document.getElementById('screen-lobby');
  const screenHelp = document.getElementById('screen-help');
  const hud = document.getElementById('hud');
  const minimapWrapper = document.getElementById('minimap-wrapper');

  // Lobby elements
  const lobbyNameInput = document.getElementById('lobby-name');
  const lobbyRoomInput = document.getElementById('lobby-room');
  const btnCopyUrl = document.getElementById('btn-copy-url');
  const lobbyStatus = document.getElementById('lobby-status');
  const btnEnterRoom = document.getElementById('btn-enter-room');

  // HUD elements
  const hudScore = document.getElementById('hud-score');
  const hudHigh = document.getElementById('hud-high');
  const hudLevel = document.getElementById('hud-level');
  const hudRoom = document.getElementById('hud-room');
  const hudPing = document.getElementById('hud-ping');
  const hudCamMode = document.getElementById('hud-cam-mode');
  const hudBtnEmote = document.getElementById('hud-btn-emote');
  const btnLeave = document.getElementById('btn-leave');
  const hudScoreboard = document.getElementById('hud-scoreboard');
  const powerTimerContainer = document.getElementById('power-timer-container');
  const powerTimerBar = document.getElementById('power-timer-bar');

  // Audio controller
  const audio = createAudioController();
  const btnMute = document.getElementById('btn-mute');

  // Mobile controls
  const btnFwd = document.getElementById('btn-fwd');
  const btnBack = document.getElementById('btn-back');
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnCam = document.getElementById('btn-cam');
  const btnTouchEmote = document.getElementById('btn-touch-emote');

  // Help button
  const btnHelpResume = document.getElementById('btn-help-resume');

  // Initialize adapter & 3D renderer
  const maze = createMaze();
  const adapter = createClientAdapter({ maze });
  const renderer = createRenderer(gameContainer, minimapCanvas);
  renderer.buildMaze(maze);

  // Network client & controller
  const client = createNetworkClient(SOLO ? { WebSocketImpl: LocalRoomSocket } : {});
  let currentPingRtt = null;

  // Local UI state
  let inLobby = true;
  let isHelpOpen = false;
  let lastScoreboardKey = '';

  const controller = createMultiplayerController({
    client,
    adapter,
    connectTimeoutMs: 5000,
    onLobbyStatus: (text, type) => {
      if (SOLO && type === 'connecting') text = 'Starting…';
      setLobbyStatus(text, type);
      if (controller.inLobby && type === 'error') {
        btnEnterRoom.disabled = false;
      }
    },
    onViewChange: (view) => {
      if (view === 'game') {
        hideLobbyView();
      } else if (view === 'lobby') {
        showLobbyView();
      }
    },
    onJoined: (info) => {
      if (hudRoom) hudRoom.textContent = info.roomId;
    },
    onEmote: (data) => {
      audio.playEmote();
    },
    onToast: (msg) => {
      showToast(msg);
    },
    onPingUpdate: (rtt) => {
      currentPingRtt = rtt;
      if (hudPing) hudPing.textContent = `PING: ${currentPingRtt}ms`;
    }
  });
  controller.init();

  document.body.classList.add('in-lobby');
  if (SOLO) {
    document.body.classList.add('solo');
    btnEnterRoom.textContent = 'PLAY';
    setLobbyStatus('Solo · runs right in your browser');
  }

  // Default room setup
  const initialRoom = getInitialRoomId();
  lobbyRoomInput.value = initialRoom;
  updateShareUrlInput(initialRoom);

  // Restore codename if available
  try {
    const savedName = localStorage.getItem('pacman_player_name');
    if (savedName) lobbyNameInput.value = savedName.slice(0, 20);
  } catch (e) {
    // Ignore
  }

  function showToast(text, duration = 3000) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  function setLobbyStatus(text, type = 'normal') {
    if (!lobbyStatus) return;
    lobbyStatus.textContent = text;
    lobbyStatus.className = 'lobby-status' + (type !== 'normal' ? ' ' + type : '');
  }

  function sendTurnIntent(turnDirection) {
    if (inLobby || !client || client.getReadyState() !== 1) return;
    client.send({
      type: 'input',
      turn: turnDirection
    });
  }

  function triggerEmoteCycle() {
    if (inLobby || !client || client.getReadyState() !== 1) return;
    audio.init();
    const phrase = EMOTE_WHITELIST[emoteIndex % EMOTE_WHITELIST.length];
    emoteIndex++;
    client.send({
      type: 'emote',
      text: phrase
    });
  }

  function updateScoreboardDOM(allPlayersMap, localId) {
    if (!hudScoreboard) return;
    const sortedPlayers = Array.from(allPlayersMap.values()).sort((a, b) => (b.score || 0) - (a.score || 0));
    const key = sortedPlayers.map(p => `${p.id}:${p.score}:${p.supercharged}:${Boolean(p.shieldTimer > 0)}:${p.respawning}`).join('|');
    if (key === lastScoreboardKey) return; // Prevent rebuilding DOM every frame
    lastScoreboardKey = key;

    hudScoreboard.innerHTML = '';
    for (const p of sortedPlayers) {
      const row = document.createElement('div');
      row.className = 'scoreboard-row';

      const info = document.createElement('div');
      info.className = 'scoreboard-player-info';

      const dot = document.createElement('span');
      dot.className = 'scoreboard-dot';
      dot.style.backgroundColor = p.color || '#ffff00';
      dot.style.color = p.color || '#ffff00';

      const name = document.createElement('span');
      name.className = 'scoreboard-name';
      name.textContent = (p.name || 'Player') + (p.id === localId ? ' (YOU)' : '');
      if (p.id === localId) name.style.color = '#00e5ff';

      info.appendChild(dot);
      info.appendChild(name);

      const stats = document.createElement('div');
      stats.className = 'scoreboard-stats';

      const score = document.createElement('span');
      score.className = 'scoreboard-score';
      score.textContent = String(p.score || 0);
      stats.appendChild(score);

      if (p.respawning) {
        const tag = document.createElement('span');
        tag.className = 'status-tag status-tag-respawn';
        tag.textContent = 'RESPAWN';
        stats.appendChild(tag);
      } else if (p.supercharged) {
        const tag = document.createElement('span');
        tag.className = 'status-tag status-tag-charged';
        tag.textContent = 'CHARGED';
        stats.appendChild(tag);
      } else if (p.shieldTimer > 0) {
        const tag = document.createElement('span');
        tag.className = 'status-tag status-tag-shield';
        tag.textContent = 'SHIELD';
        stats.appendChild(tag);
      }

      row.appendChild(info);
      row.appendChild(stats);
      hudScoreboard.appendChild(row);
    }
  }

  function connectAndJoinRoom() {
    const name = (lobbyNameInput.value || '').trim() || 'PAC-RUNNER';
    let roomId = (lobbyRoomInput.value || '').trim();
    if (!roomId) roomId = 'waka';

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(roomId)) {
      setLobbyStatus('Room must be 1-32 alphanumeric characters, dash or underscore', 'error');
      return;
    }

    try {
      localStorage.setItem('pacman_player_name', name);
    } catch (e) {
      // Ignore
    }

    audio.init();
    btnEnterRoom.disabled = true;

    controller.connectAndJoin(roomId, name).then(res => {
      if (!res || !res.ok) {
        btnEnterRoom.disabled = false;
      }
    }).catch(() => {
      btnEnterRoom.disabled = false;
    });
  }

  function showLobbyView() {
    inLobby = true;
    document.body.classList.add('in-lobby');
    if (isHelpOpen) setHelpOverlay(false);
    screenLobby.classList.remove('hidden');
    hud.classList.add('hidden');
    minimapWrapper.classList.add('hidden');
    btnEnterRoom.disabled = false;
    adapter.reset();
    if (renderer.resetCamera) renderer.resetCamera();
  }

  function hideLobbyView() {
    inLobby = false;
    document.body.classList.remove('in-lobby');
    screenLobby.classList.add('hidden');
    hud.classList.remove('hidden');
    minimapWrapper.classList.remove('hidden');
    btnEnterRoom.disabled = false;
    // The PLAY button just vanished: hand keyboard focus to Pause instead of dropping it on <body>.
    const pauseBtn = document.getElementById('btn-pause');
    const active = document.activeElement;
    if (pauseBtn && (!active || active === document.body || screenLobby.contains(active))) {
      pauseBtn.focus({ preventScroll: true });
    }
  }

  function leaveRoom() {
    controller.leave();
  }

  // Event listeners for Lobby
  btnEnterRoom.addEventListener('click', connectAndJoinRoom);

  lobbyRoomInput.addEventListener('input', () => {
    updateShareUrlInput(lobbyRoomInput.value.trim());
  });

  lobbyRoomInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      connectAndJoinRoom();
    }
  });

  lobbyNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      connectAndJoinRoom();
    }
  });

  btnCopyUrl.addEventListener('click', async () => {
    const shareInput = document.getElementById('lobby-share-url');
    if (!shareInput) return;
    shareInput.select();
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareInput.value);
        copied = true;
      }
    } catch (e) {
      // Fallback below
    }
    if (!copied) {
      try {
        document.execCommand('copy');
        copied = true;
      } catch (e) {
        // Ignore
      }
    }
    btnCopyUrl.textContent = copied ? 'COPIED!' : 'SELECTED';
    setTimeout(() => {
      btnCopyUrl.textContent = 'COPY';
    }, 2000);
  });

  // HUD Actions
  const btnShareRoom = document.getElementById('btn-share-room');
  if (btnShareRoom) {
    btnShareRoom.addEventListener('click', async (e) => {
      e.stopPropagation();
      btnShareRoom.blur(); // Never retain keyboard focus to avoid disrupting gameplay controls
      const roomId = adapter.roomId || getInitialRoomId();
      const origin = window.location.origin;
      const pathname = window.location.pathname;
      const shareUrl = `${origin}${pathname}?room=${encodeURIComponent(roomId)}`;
      let copied = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        }
      } catch (err) {}
      if (!copied) {
        try {
          const dummy = document.createElement('textarea');
          dummy.value = shareUrl;
          dummy.style.position = 'fixed';
          dummy.style.opacity = '0';
          document.body.appendChild(dummy);
          dummy.select();
          document.execCommand('copy');
          document.body.removeChild(dummy);
          copied = true;
        } catch (err) {}
      }
      showToast('Room link copied to clipboard!');
      btnShareRoom.textContent = copied ? 'COPIED!' : 'SELECTED';
      setTimeout(() => {
        btnShareRoom.textContent = 'SHARE';
      }, 2000);
    });
  }

  btnLeave.addEventListener('click', leaveRoom);

  hudCamMode.addEventListener('click', () => {
    const newMode = renderer.cycleCamera();
    hudCamMode.textContent = getCameraModeLabel(newMode);
  });

  hudBtnEmote.addEventListener('click', triggerEmoteCycle);

  // Mobile controls: big on-screen arrows (pointerdown = instant, no 300 ms
  // click delay, one event for touch, pen and mouse) plus swipe anywhere.
  const pad = [
    [btnFwd, 'FORWARD'],
    [btnBack, 'BACK'],
    [btnLeft, 'LEFT'],
    [btnRight, 'RIGHT']
  ];
  for (const [btn, turn] of pad) {
    if (!btn) continue;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.init();
      btn.classList.add('pressed');
      sendTurnIntent(turn);
    });
    const release = () => btn.classList.remove('pressed');
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    // Keyboard / switch access: Enter or Space on a focused arrow.
    btn.addEventListener('click', (e) => { if (e.detail === 0) sendTurnIntent(turn); });
  }

  attachSwipe(gameContainer, (turn) => {
    if (inLobby || isHelpOpen) return;
    audio.init();
    sendTurnIntent(turn);
    const btn = pad.find(([, t]) => t === turn)?.[0];
    if (btn) {
      btn.classList.add('pressed');
      setTimeout(() => btn.classList.remove('pressed'), 140);
    }
  });

  btnCam.addEventListener('click', (e) => {
    if (e.detail !== 0) btnCam.blur(); // blur only after a pointer tap; keyboard users keep focus
    const newMode = renderer.cycleCamera();
    hudCamMode.textContent = getCameraModeLabel(newMode);
  });

  btnTouchEmote.addEventListener('click', triggerEmoteCycle);

  btnMute.addEventListener('click', (e) => {
    const muted = audio.toggleMute();
    btnMute.setAttribute('aria-pressed', String(!muted));
    btnMute.classList.toggle('muted', muted);
    if (e.detail !== 0) btnMute.blur();
  });

  // Help Overlay
  let helpOpener = null;
  const behindDialog = ['hud', 'mobile-controls', 'minimap-wrapper', 'game-container']
    .map((id) => document.getElementById(id)).filter(Boolean);

  function setHelpOverlay(open) {
    if (open === isHelpOpen) return;
    isHelpOpen = open;
    if (open) helpOpener = document.activeElement;
    screenHelp.classList.toggle('hidden', !open);
    // Modal: everything under the overlay leaves the tab order and the a11y tree.
    for (const el of behindDialog) el.inert = open;
    // Solo play really pauses; online play keeps running (shared match).
    if (SOLO && LocalRoomSocket.current) {
      if (open) LocalRoomSocket.current.pause();
      else LocalRoomSocket.current.resume();
    }
    if (open) btnHelpResume.focus({ preventScroll: true });
    else if (helpOpener && helpOpener !== document.body && document.contains(helpOpener) && !inLobby) {
      helpOpener.focus({ preventScroll: true });
    } else if (!inLobby && btnPause) {
      btnPause.focus({ preventScroll: true });
    }
  }

  function toggleHelpOverlay() {
    if (inLobby && !isHelpOpen) return;
    setHelpOverlay(!isHelpOpen);
  }

  document.addEventListener('visibilitychange', () => {
    if (SOLO && document.hidden && !inLobby && !isHelpOpen) setHelpOverlay(true);
  });

  const btnPause = document.getElementById('btn-pause');
  if (btnPause) btnPause.addEventListener('click', () => setHelpOverlay(true));

  btnHelpResume.addEventListener('click', toggleHelpOverlay);

  // Keyboard Handling: ignores input/textarea to allow clean lobby typing
  window.addEventListener('keydown', (e) => {
    const targetTag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') {
      return; // Do not intercept typing in inputs
    }

    if (e.repeat) return; // Prevent key repeat floods

    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      toggleHelpOverlay();
      return;
    }

    if (inLobby) return;

    if (e.key === 'c' || e.key === 'C' || e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      const newMode = renderer.cycleCamera();
      hudCamMode.textContent = getCameraModeLabel(newMode);
      return;
    }

    if (e.key === 't' || e.key === 'T') {
      e.preventDefault();
      triggerEmoteCycle();
      return;
    }

    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        sendTurnIntent('FORWARD');
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        sendTurnIntent('BACK');
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        sendTurnIntent('LEFT');
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        sendTurnIntent('RIGHT');
        break;
    }
  });

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    controller.leave();
  });

  // Read-only QA Debug handles on window
  window.game = adapter;
  window.renderer = renderer;
  window.multiplayer = {
    get playerId() { return adapter.localPlayerId; },
    get roomId() { return adapter.roomId; },
    get latestSnapshot() { return adapter.latestSnapshot; },
    get client() { return client; },
    get controller() { return controller; },
    get countMeshes() { return renderer.countMeshes(); }
  };

  // Main Render Loop (Does NOT simulate game physics locally!)
  function renderLoop(now) {
    requestAnimationFrame(renderLoop);
    const timeSec = now * 0.001;

    // Check level progression: rebuild maze meshes and restore pellet geometry
    if (adapter.hasLevelChanged && adapter.hasLevelChanged()) {
      renderer.buildMaze(adapter.maze);
    }

    // Interpolate local and remote entities for smooth 60fps rendering from 20Hz snapshots
    if (!inLobby && adapter.latestSnapshot) {
      const interp = adapter.interpolateEntities(now, 100);
      if (interp) {
        if (adapter.player && interp.player) {
          adapter.player.x = interp.player.x;
          adapter.player.y = interp.player.y;
          adapter.player.currentAngle = interp.player.angle;
        }
        if (interp.players && adapter.players) {
          const remoteMap = new Map(interp.players.map(p => [p.id, p]));
          for (const p of adapter.players) {
            const smooth = remoteMap.get(p.id);
            if (smooth) {
              p.x = smooth.x;
              p.y = smooth.y;
              p.currentAngle = smooth.angle;
            }
          }
        }
        if (interp.ghosts && adapter.ghosts && adapter.ghosts.list) {
          const ghostMap = new Map(interp.ghosts.map(g => [g.name, g]));
          for (const g of adapter.ghosts.list) {
            const smoothG = ghostMap.get(g.name);
            if (smoothG) {
              g.x = smoothG.x;
              g.y = smoothG.y;
            }
          }
        }
      }
    }

    // Play queued sound events
    if (adapter.soundEvents.length > 0) {
      for (const snd of adapter.soundEvents) {
        if (snd === 'waka') audio.playWaka();
        else if (snd === 'power') audio.playPowerPellet();
        else if (snd === 'eat_ghost') audio.playEatGhost();
        else if (snd === 'die') audio.playDie();
        else if (snd === 'fruit') audio.playFruit();
        else if (snd === 'clear') audio.playClear();
      }
      adapter.soundEvents = [];
    }

    // Victim screen flash & shake visual effects
    if (adapter.screenFlash && screenFlash) {
      screenFlash.classList.add('active');
      setTimeout(() => {
        screenFlash.classList.remove('active');
      }, 300);
    }
    if (adapter.screenShake && gameContainer) {
      gameContainer.classList.add('shake');
      setTimeout(() => {
        gameContainer.classList.remove('shake');
      }, 450);
    }

    // Update HUD text values
    if (hudScore) hudScore.textContent = String(adapter.score);
    if (hudHigh) hudHigh.textContent = String(adapter.highScore);
    if (hudLevel) hudLevel.textContent = String(adapter.level);

    // Power timer bar
    if (adapter.player && adapter.player.powerTimer > 0) {
      powerTimerContainer.style.display = 'block';
      const maxPowerDur = Math.max(2.0, 7.0 - ((adapter.level || 1) - 1) * 0.6);
      const pct = Math.max(0, Math.min(100, (adapter.player.powerTimer / maxPowerDur) * 100));
      powerTimerBar.style.width = `${pct}%`;
    } else {
      powerTimerContainer.style.display = 'none';
    }

    // Live Scoreboard
    if (!inLobby && adapter.allPlayers) {
      updateScoreboardDOM(adapter.allPlayers, adapter.localPlayerId);
    }

    // 3D Render & Minimap
    renderer.update(adapter, timeSec);
    adapter.clearVisualEffects();
  }

  requestAnimationFrame(renderLoop);
});
