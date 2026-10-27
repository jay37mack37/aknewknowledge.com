/**
 * Transport-agnostic authoritative room service.
 *
 * The same code runs in two places:
 *  - server.js (Node): each WebSocket becomes a `conn`.
 *  - p2p_net.js (browser host): each WebRTC peer (and the host's own client)
 *    becomes a `conn`, so a player's browser can be the authoritative server.
 *
 * A `conn` is: { send(text), close(code, reason), terminate(), isOpen(), bufferedAmount? }.
 * `connect(conn)` returns { message(raw), close() } which the transport calls.
 */
import { createRoomManager } from './room_state.js';
import { createMultiplayerGame } from './multiplayer_game.js';

export const DEFAULT_SERVICE_LIMITS = Object.freeze({
  maxRooms: 10,               // concurrent rooms (each runs a 60 Hz sim)
  msgBurst: 60,               // token-bucket capacity (messages)
  msgPerSecond: 30,           // token-bucket refill rate
  joinTimeoutMs: 30000,       // close conns that never join a room
  idleMs: 300000,             // joined conns with no input/emote for this long are closed
  maxBufferedBytes: 262144    // slow readers above this are terminated (backpressure)
});

const unref = (t) => { if (t && typeof t.unref === 'function') t.unref(); return t; };

export function createRoomService(options = {}) {
  const limits = { ...DEFAULT_SERVICE_LIMITS, ...(options.limits || {}) };
  const roomManager = options.roomManager || createRoomManager();
  const now = options.now || (() => Date.now());

  // Room ID -> Set of conns
  const roomConns = new Map();
  // Room ID -> { game, interval }
  const roomGames = new Map();
  // conn -> { clientId, roomId, player }
  const connMeta = new Map();

  function overBuffer(conn) {
    return typeof conn.bufferedAmount === 'number' && conn.bufferedAmount > limits.maxBufferedBytes;
  }

  function sendJson(conn, obj) {
    if (!conn.isOpen()) return;
    if (overBuffer(conn)) { conn.terminate(); return; }
    conn.send(JSON.stringify(obj));
  }

  function broadcastToRoom(roomId, message, exclude = null) {
    const conns = roomConns.get(roomId);
    if (!conns) return;
    const data = JSON.stringify(message);
    for (const c of conns) {
      if (c === exclude || !c.isOpen()) continue;
      if (overBuffer(c)) { c.terminate(); continue; }
      c.send(data);
    }
  }

  function removeClientFromRoomGame(roomId, clientId) {
    const rg = roomGames.get(roomId);
    if (rg) rg.game.removePlayer(clientId);
  }

  function checkAndCleanEmptyRoom(roomId) {
    const conns = roomConns.get(roomId);
    if (!conns || conns.size === 0) {
      roomConns.delete(roomId);
      const rg = roomGames.get(roomId);
      if (rg) {
        clearInterval(rg.interval);
        roomGames.delete(roomId);
      }
    }
  }

  function cleanup(conn) {
    const meta = connMeta.get(conn);
    if (!meta) return;
    connMeta.delete(conn);
    if (!meta.roomId) return;
    const roomId = meta.roomId;
    if (roomConns.has(roomId)) roomConns.get(roomId).delete(conn);
    removeClientFromRoomGame(roomId, meta.clientId);
    checkAndCleanEmptyRoom(roomId);
    const res = roomManager.leaveRoom(meta.clientId);
    if (res.ok && !res.roomDeleted && res.roster.length > 0) {
      broadcastToRoom(res.roomId, {
        type: 'roster_update',
        roomId: res.roomId,
        roster: res.roster,
        left: res.player ? res.player.id : null
      });
    }
  }

  function notInRoom(conn) {
    sendJson(conn, { type: 'error', code: 'NOT_IN_ROOM', message: 'Not currently joined in any room' });
  }

  function connect(conn) {
    const clientId = `client_${Math.random().toString(36).slice(2, 10)}`;
    connMeta.set(conn, { clientId, roomId: null, player: null });
    let closed = false;

    const joinTimer = unref(setTimeout(() => {
      const m = connMeta.get(conn);
      if (m && !m.roomId) conn.close(1008, 'join timeout');
    }, limits.joinTimeoutMs));

    let lastActivity = now();
    const idleTimer = unref(setInterval(() => {
      if (now() - lastActivity > limits.idleMs) conn.close(1000, 'idle');
    }, Math.min(limits.idleMs, 60000)));

    let tokens = limits.msgBurst;
    let lastRefill = now();

    function handleJoin(meta, msg) {
      if (!meta.roomId && typeof msg.roomId === 'string' && !roomConns.has(msg.roomId)
          && roomConns.size >= limits.maxRooms) {
        sendJson(conn, { type: 'error', code: 'SERVER_FULL', message: 'Too many active rooms right now, try again soon' });
        return;
      }
      const res = roomManager.joinRoom(meta.clientId, { roomId: msg.roomId, name: msg.name });
      if (!res.ok) {
        sendJson(conn, { type: 'error', code: res.error, message: res.message });
        return;
      }
      meta.roomId = res.roomId;
      meta.player = res.player;
      if (!roomConns.has(res.roomId)) roomConns.set(res.roomId, new Set());
      roomConns.get(res.roomId).add(conn);

      let roomGame = roomGames.get(res.roomId);
      if (!roomGame) {
        const game = options.roomGameFactory ? options.roomGameFactory(res.roomId) : createMultiplayerGame();
        let tickCounter = 0;
        const interval = setInterval(() => {
          try {
            game.tick(1 / 60);
            tickCounter++;
            if (tickCounter % 3 === 0) {
              broadcastToRoom(res.roomId, { type: 'game_snapshot', roomId: res.roomId, ...game.getSnapshot() });
            }
          } catch (err) {
            console.error(`Simulation tick error in room ${res.roomId}:`, err);
          }
        }, 1000 / 60);
        roomGame = { game, interval };
        roomGames.set(res.roomId, roomGame);
      }

      roomGame.game.addPlayer(meta.clientId, {
        id: res.player.id,
        name: res.player.name,
        slot: res.player.slot,
        color: res.player.color,
        colorName: res.player.colorName
      });

      sendJson(conn, {
        type: 'joined',
        playerId: res.player.id,
        roomId: res.roomId,
        color: res.player.color,
        colorName: res.player.colorName,
        slot: res.player.slot,
        roster: res.roster
      });
      broadcastToRoom(res.roomId, { type: 'roster_update', roomId: res.roomId, roster: res.roster, joined: res.player }, conn);
    }

    function handleLeave(meta) {
      if (!meta.roomId) return notInRoom(conn);
      const roomId = meta.roomId;
      const res = roomManager.leaveRoom(meta.clientId);
      if (roomConns.has(roomId)) roomConns.get(roomId).delete(conn);
      removeClientFromRoomGame(roomId, meta.clientId);
      checkAndCleanEmptyRoom(roomId);
      meta.roomId = null;
      meta.player = null;
      if (res.ok) {
        sendJson(conn, { type: 'left', roomId: res.roomId });
        if (!res.roomDeleted && res.roster.length > 0) {
          broadcastToRoom(res.roomId, { type: 'roster_update', roomId: res.roomId, roster: res.roster, left: res.player ? res.player.id : null });
        }
      }
    }

    function message(rawData) {
      if (closed) return;
      const t = now();
      tokens = Math.min(limits.msgBurst, tokens + ((t - lastRefill) / 1000) * limits.msgPerSecond);
      lastRefill = t;
      if (tokens < 1) {
        conn.close(1008, 'rate limit');
        return;
      }
      tokens -= 1;

      let msg;
      try {
        msg = JSON.parse(typeof rawData === 'string' ? rawData : rawData.toString());
      } catch (_) {
        sendJson(conn, { type: 'error', code: 'INVALID_MESSAGE', message: 'Malformed JSON payload' });
        return;
      }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
        sendJson(conn, { type: 'error', code: 'INVALID_MESSAGE', message: 'Message must be a valid JSON object with a string type property' });
        return;
      }
      const meta = connMeta.get(conn);
      if (!meta) return;

      switch (msg.type) {
        case 'join':
          return handleJoin(meta, msg);
        case 'leave':
          return handleLeave(meta);
        case 'ping': {
          const tok = msg.token;
          const okTok = (typeof tok === 'number' && Number.isFinite(tok)) || (typeof tok === 'string' && tok.length <= 32);
          return sendJson(conn, { type: 'pong', token: okTok ? tok : null, serverTime: now() });
        }
        case 'position': case 'score': case 'power': case 'collision':
          return sendJson(conn, {
            type: 'error',
            code: 'UNAUTHORIZED_CLAIM',
            message: 'Client-authoritative claims (position, score, power, collision) are not allowed'
          });
        case 'input': {
          if (!meta.roomId) return notInRoom(conn);
          lastActivity = now();
          const rg = roomGames.get(meta.roomId);
          if (rg && msg.turn) rg.game.queueInput(meta.clientId, msg.turn);
          return;
        }
        case 'emote': {
          if (!meta.roomId) return notInRoom(conn);
          lastActivity = now();
          const rg = roomGames.get(meta.roomId);
          if (!rg) return;
          const emoteRes = rg.game.sendEmote(meta.clientId, msg.text);
          if (emoteRes.ok) {
            broadcastToRoom(meta.roomId, {
              type: 'emote',
              roomId: meta.roomId,
              playerId: meta.player ? meta.player.id : null,
              name: meta.player ? meta.player.name : null,
              text: emoteRes.text
            });
          } else {
            sendJson(conn, {
              type: 'error',
              code: 'EMOTE_REJECTED',
              message: emoteRes.reason === 'COOLDOWN' ? 'Emote cooldown active' : 'Invalid emote text'
            });
          }
          return;
        }
        default:
          return sendJson(conn, { type: 'error', code: 'UNKNOWN_TYPE', message: `Unknown message type: ${String(msg.type).slice(0, 32)}` });
      }
    }

    function close() {
      if (closed) return;
      closed = true;
      clearTimeout(joinTimer);
      clearInterval(idleTimer);
      cleanup(conn);
    }

    return { message, close };
  }

  function shutdown() {
    for (const rg of roomGames.values()) clearInterval(rg.interval);
    roomGames.clear();
    roomConns.clear();
    connMeta.clear();
  }

  return { connect, shutdown, roomManager, limits, get roomCount() { return roomConns.size; } };
}
