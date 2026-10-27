// Maze Runner — A Knew Knowledge adaptation of pacman-fps@7179621 src/main.js.
// Game rules and simulation are unchanged. Additions: pause/restart buttons,
// focus management, live announcements, prefers-reduced-motion handling and
// keyboard activation of the touch buttons. No network access of any kind.
import {
  createGame,
  startGame,
  togglePause,
  updateGame,
  shouldAdvanceSimulation,
  STATE_TITLE,
  STATE_PLAYING,
  STATE_PAUSED,
  STATE_LEVEL_CLEAR,
  STATE_GAME_OVER
} from './game_state.js';
import { queueTurn } from './movement.js';
import { createRenderer } from './renderer.js';
import { createAudioController } from './audio.js';
import {
  cycleCameraMode,
  getCameraModeLabel,
  CAMERA_MODE_FIRST_PERSON
} from './camera.js';

// DOM Elements
const container = document.getElementById('game-container');
const screenFlash = document.getElementById('screen-flash');
const minimapCanvas = document.getElementById('minimap');
const hudScore = document.getElementById('hud-score');
const hudHigh = document.getElementById('hud-high');
const hudLevel = document.getElementById('hud-level');
const hudView = document.getElementById('hud-view');
const livesIcons = document.getElementById('lives-icons');
const powerTimerContainer = document.getElementById('power-timer-container');
const powerTimerBar = document.getElementById('power-timer-bar');
const announcer = document.getElementById('game-announcer');

const screenTitle = document.getElementById('screen-title');
const screenPause = document.getElementById('screen-pause');
const screenClear = document.getElementById('screen-clear');
const screenGameOver = document.getElementById('screen-gameover');
const gameoverScore = document.getElementById('gameover-score');

const btnStart = document.getElementById('btn-start');
const btnResume = document.getElementById('btn-resume');
const btnPauseRestart = document.getElementById('btn-pause-restart');
const btnRestart = document.getElementById('btn-restart');
const btnPause = document.getElementById('btn-pause');
const btnMute = document.getElementById('btn-mute');
const btnCamera = document.getElementById('btn-camera');

// Initialize Game, Audio, and Renderer
let storage = null;
try { storage = window.localStorage; } catch (e) { storage = null; }
const game = createGame({ storage });
const audio = createAudioController();
const renderer = createRenderer(container, minimapCanvas);
let currentCameraMode = CAMERA_MODE_FIRST_PERSON;

// Reduced motion: follow the OS / browser preference and keep following it.
const motionQuery = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const settings = { reducedMotion: Boolean(motionQuery && motionQuery.matches) };
function applyMotionPreference() {
  settings.reducedMotion = Boolean(motionQuery && motionQuery.matches);
  renderer.setReducedMotion(settings.reducedMotion);
  document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
}
applyMotionPreference();
if (motionQuery && typeof motionQuery.addEventListener === 'function') {
  motionQuery.addEventListener('change', applyMotionPreference);
}

function updateCameraView(mode) {
  currentCameraMode = mode;
  renderer.setCameraMode(currentCameraMode);
  if (hudView) {
    hudView.textContent = getCameraModeLabel(currentCameraMode);
  }
}

// Read-only inspection hooks (kept from the original build; used by browser tests).
window.game = game;
window.renderer = renderer;
window.updateCameraView = updateCameraView;
window.gameSettings = settings;

let currentLevelBuilt = 0;

function announce(text) {
  if (announcer) announcer.textContent = text;
}

function focusPlayfield() {
  if (container) container.focus({ preventScroll: true });
}

function setupGame() {
  startGame(game);
  currentLevelBuilt = game.level;
  renderer.buildMaze(game.maze);
  updateCameraView(currentCameraMode);
  updateLivesDisplay();
  hideAllScreens();
  focusPlayfield();
  announce('Game started. Level 1. Use the arrow keys or W A S D to move.');
}

function pauseOrResume() {
  if (game.state === STATE_PLAYING || game.state === STATE_PAUSED) {
    togglePause(game);
  }
}

function hideAllScreens() {
  screenTitle.classList.add('hidden');
  screenPause.classList.add('hidden');
  screenClear.classList.add('hidden');
  screenGameOver.classList.add('hidden');
}

let livesShown = -1;
function updateLivesDisplay() {
  if (livesShown === game.lives) return;
  livesShown = game.lives;
  livesIcons.replaceChildren();
  for (let i = 0; i < game.lives; i++) {
    const icon = document.createElement('div');
    icon.className = 'life-icon';
    livesIcons.appendChild(icon);
  }
}

// UI Event Listeners
btnStart.addEventListener('click', () => {
  audio.init();
  setupGame();
});

btnResume.addEventListener('click', () => {
  pauseOrResume();
});

btnPauseRestart.addEventListener('click', () => {
  setupGame();
});

btnRestart.addEventListener('click', () => {
  setupGame();
});

btnPause.addEventListener('click', () => {
  pauseOrResume();
});

btnMute.addEventListener('click', () => {
  const isMuted = audio.toggleMute();
  btnMute.textContent = isMuted ? 'Sound: off' : 'Sound: on';
  btnMute.setAttribute('aria-pressed', String(isMuted));
});

// Pause automatically when the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === STATE_PLAYING) togglePause(game);
});

const MOVE_KEYS = {
  KeyW: 'FORWARD', ArrowUp: 'FORWARD',
  KeyA: 'LEFT', ArrowLeft: 'LEFT',
  KeyD: 'RIGHT', ArrowRight: 'RIGHT',
  KeyS: 'BACK', ArrowDown: 'BACK'
};

// Keyboard Input Controls
window.addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const onButton = e.target instanceof HTMLElement && e.target.tagName === 'BUTTON';

  if (e.code === 'KeyP' || e.code === 'Escape') {
    audio.init();
    pauseOrResume();
    return;
  }

  if (e.code === 'KeyC' || e.code === 'KeyQ') {
    updateCameraView(cycleCameraMode(currentCameraMode));
    return;
  }

  if (e.code === 'Space' || e.code === 'Enter') {
    // Let a focused button handle its own activation.
    if (onButton) return;
    if (game.state === STATE_TITLE || game.state === STATE_GAME_OVER) {
      e.preventDefault();
      audio.init();
      setupGame();
      return;
    }
  }

  const command = MOVE_KEYS[e.code];
  if (!command) return;
  e.preventDefault();
  if (game.state !== STATE_PLAYING || !game.player) return;
  audio.init();
  queueTurn(game.player, command, game.maze);
});

// Touch / Mobile Virtual Controls
function bindTouchButton(id, command) {
  const el = document.getElementById(id);
  if (!el) return;
  const trigger = (e) => {
    e.preventDefault();
    audio.init();
    if (game.state === STATE_TITLE || game.state === STATE_GAME_OVER) {
      setupGame();
      return;
    }
    if (game.state === STATE_PLAYING && game.player) {
      queueTurn(game.player, command, game.maze);
    }
  };
  el.addEventListener('touchstart', trigger, { passive: false });
  el.addEventListener('mousedown', trigger);
  // Keyboard activation (Enter/Space on a focused button) produces a click with detail 0.
  el.addEventListener('click', (e) => { if (e.detail === 0) trigger(e); });
}

bindTouchButton('btn-fwd', 'FORWARD');
bindTouchButton('btn-left', 'LEFT');
bindTouchButton('btn-right', 'RIGHT');
bindTouchButton('btn-back', 'BACK');

if (btnCamera) {
  const triggerCam = (e) => {
    e.preventDefault();
    audio.init();
    updateCameraView(cycleCameraMode(currentCameraMode));
  };
  btnCamera.addEventListener('touchstart', triggerCam, { passive: false });
  btnCamera.addEventListener('mousedown', triggerCam);
  btnCamera.addEventListener('click', (e) => { if (e.detail === 0) triggerCam(e); });
}

// State transitions drive focus and announcements.
let lastState = game.state;
document.body.dataset.state = game.state;
function onStateChange(from, to) {
  document.body.dataset.state = to;
  btnPause.setAttribute('aria-pressed', String(to === STATE_PAUSED));
  btnPause.textContent = to === STATE_PAUSED ? 'Resume' : 'Pause';
  if (to === STATE_PAUSED) {
    announce(`Paused. Score ${game.score}.`);
    btnResume.focus({ preventScroll: true });
  } else if (to === STATE_PLAYING && from === STATE_PAUSED) {
    announce('Resumed.');
    focusPlayfield();
  } else if (to === STATE_LEVEL_CLEAR) {
    announce(`Level ${game.level} clear. Score ${game.score}.`);
  } else if (to === STATE_GAME_OVER) {
    announce(`Game over. Final score ${game.score}. Press Enter to play again.`);
    btnRestart.focus({ preventScroll: true });
  }
}

// Main Game Animation Loop
let lastTime = performance.now();

function animate(time) {
  requestAnimationFrame(animate);

  const delta = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  if (shouldAdvanceSimulation(game.state)) {
    updateGame(game, delta);

    // Check if level was cleared and rebuilt
    if (game.level !== currentLevelBuilt && game.maze) {
      currentLevelBuilt = game.level;
      renderer.buildMaze(game.maze);
    }

    // Process sound events
    if (game.soundEvents.length > 0) {
      for (const ev of game.soundEvents) {
        if (ev === 'waka') audio.playWaka();
        else if (ev === 'power') audio.playPowerPellet();
        else if (ev === 'eat_ghost') audio.playEatGhost();
        else if (ev === 'die') {
          audio.playDie();
          if (screenFlash) {
            screenFlash.classList.add('active');
            setTimeout(() => screenFlash.classList.remove('active'), 350);
          }
          if (container && !settings.reducedMotion) {
            container.classList.add('shake');
            setTimeout(() => container.classList.remove('shake'), 450);
          }
          if (game.lives > 0) announce(`Caught. ${game.lives} ${game.lives === 1 ? 'life' : 'lives'} left.`);
        }
        else if (ev === 'fruit') audio.playFruit();
        else if (ev === 'clear') audio.playClear();
      }
      game.soundEvents = [];
    }

    // Proximity sound calculation
    if (game.ghosts && game.player) {
      let nearestDist = Infinity;
      let relAngle = 0;
      for (const ghost of game.ghosts.list) {
        const dist = Math.hypot(ghost.x - game.player.x, ghost.y - game.player.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          const ghostAngle = Math.atan2(ghost.y - game.player.y, ghost.x - game.player.x);
          relAngle = ghostAngle - game.player.currentAngle;
        }
      }
      audio.updateProximitySound(nearestDist, relAngle);
    }
  }

  // Update HUD text
  hudScore.textContent = String(game.score);
  hudHigh.textContent = String(game.highScore);
  hudLevel.textContent = String(game.level);
  updateLivesDisplay();

  // Update frightened power pellet progress bar
  if (game.ghosts && game.ghosts.frightenedTimer > 0) {
    powerTimerContainer.style.display = 'block';
    const pct = Math.max(0, Math.min(100, (game.ghosts.frightenedTimer / 7.0) * 100));
    powerTimerBar.style.width = `${pct}%`;
  } else {
    powerTimerContainer.style.display = 'none';
  }

  // Screen overlays handling
  if (game.state === STATE_TITLE) {
    screenTitle.classList.remove('hidden');
    screenPause.classList.add('hidden');
    screenClear.classList.add('hidden');
    screenGameOver.classList.add('hidden');
  } else if (game.state === STATE_PAUSED) {
    screenPause.classList.remove('hidden');
  } else if (game.state === STATE_LEVEL_CLEAR) {
    screenClear.classList.remove('hidden');
  } else if (game.state === STATE_GAME_OVER) {
    screenGameOver.classList.remove('hidden');
    gameoverScore.textContent = String(game.score);
  } else {
    hideAllScreens();
  }

  // Focus/announcements run after overlays are shown, so focus targets are visible.
  if (game.state !== lastState) {
    const from = lastState;
    lastState = game.state;
    onStateChange(from, game.state);
  }

  // Render 3D view and 2D radar
  renderer.update(game, time * 0.001);
}

// Start render loop
requestAnimationFrame(animate);
