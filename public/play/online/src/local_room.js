/**
 * LocalRoomSocket: a WebSocket-shaped transport that runs the authoritative
 * multiplayer simulation (multiplayer_game.js) inside the page.
 *
 * The client stack (network.js -> client_adapter.js -> renderer) is unchanged:
 * it still talks the same JSON protocol as server.js, but nothing leaves the
 * browser. This is how the static "final" build plays solo on a plain static
 * host (no server, no open ports). When an online server exists, main.js simply
 * uses the real WebSocket instead.
 */
import { createMultiplayerGame } from './multiplayer_game.js';

const PLAYER_COLOR = { hex: '#ffea00', name: 'YELLOW' };
const TICK_HZ = 60;
const SNAPSHOT_EVERY = 3; // 20 Hz, same cadence as server.js

function makeId() {
  const bytes = new Uint8Array(6);
  if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return 'p_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function cleanName(raw) {
  const s = String(raw || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20);
  return s || 'PAC-RUNNER';
}

export class LocalRoomSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static current = null;

  constructor(url, options = {}) {
    this.url = url;
    LocalRoomSocket.current = this;
    this.readyState = LocalRoomSocket.CONNECTING;
    this.bufferedAmount = 0;
    this._listeners = new Map();
    this._game = null;
    this._timer = null;
    this._clientId = 'local';
    this._player = null;
    this._roomId = null;
    this._gameFactory = options.gameFactory || (() => createMultiplayerGame({ autoCorner: true }));
    this._visibilityHandler = null;
    // Open asynchronously, like a real socket.
    setTimeout(() => {
      if (this.readyState !== LocalRoomSocket.CONNECTING) return;
      this.readyState = LocalRoomSocket.OPEN;
      this._emit('open', {});
    }, 0);
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    const set = this._listeners.get(type);
    if (set) set.delete(fn);
  }

  _emit(type, event) {
    const prop = this['on' + type];
    if (typeof prop === 'function') prop.call(this, event);
    const set = this._listeners.get(type);
    if (set) for (const fn of [...set]) fn.call(this, event);
  }

  _deliver(obj) {
    if (this.readyState !== LocalRoomSocket.OPEN) return;
    const data = JSON.stringify(obj);
    // Deliver on a microtask so handlers never run re-entrantly inside send().
    queueMicrotask(() => {
      if (this.readyState === LocalRoomSocket.OPEN) this._emit('message', { data });
    });
  }

  _error(code, message) {
    this._deliver({ type: 'error', code, message });
  }

  _startLoop() {
    if (this._timer) return;
    let tickCounter = 0;
    let last = performance.now();
    let acc = 0;
    const step = 1 / TICK_HZ;
    this._timer = setInterval(() => {
      const now = performance.now();
      // Clamp long gaps (backgrounded tab) so the world never fast-forwards.
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= step) {
        acc -= step;
        this._game.tick(step);
        tickCounter++;
        if (tickCounter % SNAPSHOT_EVERY === 0) {
          this._deliver({ type: 'game_snapshot', roomId: this._roomId, ...this._game.getSnapshot() });
        }
      }
    }, 1000 / TICK_HZ);
  }

  _stopLoop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  send(raw) {
    if (this.readyState !== LocalRoomSocket.OPEN) throw new Error('Socket is not open');
    let msg;
    try {
      msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      this._error('BAD_JSON', 'Message must be valid JSON');
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'join': {
        if (this._player) {
          this._error('ALREADY_JOINED', 'Client has already joined a room');
          return;
        }
        this._roomId = typeof msg.roomId === 'string' && msg.roomId ? msg.roomId.slice(0, 32) : 'solo';
        this._player = {
          id: makeId(),
          name: cleanName(msg.name),
          slot: 0,
          color: PLAYER_COLOR.hex,
          colorName: PLAYER_COLOR.name
        };
        this._game = this._gameFactory(this._roomId);
        this._game.addPlayer(this._clientId, { ...this._player });
        const roster = [{ ...this._player }];
        this._deliver({ type: 'joined', playerId: this._player.id, roomId: this._roomId, color: this._player.color, colorName: this._player.colorName, slot: 0, roster });
        this._startLoop();
        return;
      }
      case 'leave': {
        if (!this._player) {
          this._error('NOT_IN_ROOM', 'Not currently joined in any room');
          return;
        }
        this._stopLoop();
        this._game.removePlayer(this._clientId);
        const roomId = this._roomId;
        this._player = null;
        this._game = null;
        this._deliver({ type: 'left', roomId });
        return;
      }
      case 'ping':
        this._deliver({ type: 'pong', token: msg.token ?? null, serverTime: Date.now() });
        return;
      case 'input':
        if (this._game && msg.turn) this._game.queueInput(this._clientId, msg.turn);
        return;
      case 'emote': {
        if (!this._game) return;
        const res = this._game.sendEmote(this._clientId, msg.text);
        if (res.ok) this._deliver({ type: 'emote', roomId: this._roomId, playerId: this._player.id, name: this._player.name, text: res.text });
        return;
      }
      default:
        return;
    }
  }

  // Solo play can genuinely pause: freeze the simulation.
  pause() { this._stopLoop(); }
  resume() { if (this._game && this.readyState === LocalRoomSocket.OPEN) this._startLoop(); }
  get paused() { return !this._timer; }

  close() {
    if (this.readyState === LocalRoomSocket.CLOSED) return;
    this._stopLoop();
    this._game = null;
    this._player = null;
    this.readyState = LocalRoomSocket.CLOSED;
    setTimeout(() => this._emit('close', { code: 1000, reason: 'local close', wasClean: true }), 0);
  }

  terminate() { this.close(); }
}
