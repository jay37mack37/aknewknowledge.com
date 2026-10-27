/**
 * Serverless multiplayer transport.
 *
 * createP2PSocketClass() returns a WebSocket-compatible class that the existing
 * network client accepts as `WebSocketImpl`. Nothing in the game changes: the
 * first player in a room becomes the HOST and runs the same authoritative
 * room service (src/room_service.js) in their browser; the other players
 * reach it over WebRTC data channels. Peers find each other through a public
 * signaling mesh (injected `joinRoom`, e.g. trystero/nostr). Only WebRTC
 * offers/answers go through signaling; game traffic is peer-to-peer.
 *
 * Host election: a joining peer listens `discoveryMs` for a host announcement;
 * if none, it hosts. Two simultaneous hosts resolve to the older (since, id).
 * If the host leaves, the lowest remaining peer id takes over and everyone
 * transparently re-sends their join (the sim restarts for that room).
 */
import { createRoomService } from './room_service.js';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

// Guests are capped by the room service itself (4 players per room), so a
// host only accepts this many connected peers in total.
const MAX_PEERS = 8;
const MAX_MSG_CHARS = 4096;          // guest -> host (same cap as the WS server)
const MAX_SNAPSHOT_CHARS = 12288;    // host -> guest snapshots (4 players ~3.2 KB today)
const MAX_RECEIVE_BYTES = 32768;     // trystero reassembly cap (its default is 256 MiB)
const KICK_BAN_MS = 60000;           // a peer the room service kicked stays ignored this long
const HOST_SETTLE_MS = 15000;        // host conflicts are only resolved this soon after linking up
const MAX_CLOCK_SKEW_MS = 60000;

export function createP2PSocketClass(deps) {
  const {
    joinRoom,
    selfId,
    appId = 'aknew-pacman-3d-v1',
    roomConfig = {},
    discoveryMs = 3500,
    now = () => Date.now(),
    serviceLimits = { maxRooms: 1 },
    log = () => {}
  } = deps;
  if (typeof joinRoom !== 'function' || !selfId) throw new Error('p2p: joinRoom and selfId are required');

  const older = (a, b) => (a.since !== b.since ? a.since < b.since : a.id < b.id);

  class P2PSocket {
    static CONNECTING = CONNECTING;
    static OPEN = OPEN;
    static CLOSING = CLOSING;
    static CLOSED = CLOSED;

    constructor(url) {
      this.url = url;
      this.readyState = CONNECTING;
      this.bufferedAmount = 0;
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      this._listeners = { open: new Set(), close: new Set(), error: new Set(), message: new Set() };
      this._room = null;
      this._roomId = null;
      this._hostId = null;        // peer id of the host, or selfId when we host
      this._hostSince = 0;
      this._service = null;       // room service when hosting
      this._localHandle = null;   // our own client's handle into the service
      this._peerHandles = new Map();
      this._queue = [];
      this._lastJoin = null;
      this._discoveryTimer = null;
      this._failTimer = null;
      this._banned = new Map();   // peerId -> ban expiry (host side)
      this._linkedAt = 0;         // when we last started following/hosting
      setTimeout(() => {
        if (this.readyState !== CONNECTING) return;
        this.readyState = OPEN;
        this._emit('open', {});
      }, 0);
    }

    get role() { return this._hostId === null ? 'searching' : this._hostId === selfId ? 'host' : 'guest'; }

    addEventListener(type, fn) { if (this._listeners[type]) this._listeners[type].add(fn); }
    removeEventListener(type, fn) { if (this._listeners[type]) this._listeners[type].delete(fn); }

    _emit(type, ev) {
      const prop = this['on' + type];
      if (typeof prop === 'function') { try { prop.call(this, ev); } catch (e) { console.error(e); } }
      for (const fn of this._listeners[type]) { try { fn.call(this, ev); } catch (e) { console.error(e); } }
    }

    _deliver(text) {
      if (this.readyState !== OPEN) return;
      this._emit('message', { data: text });
    }

    _deliverError(code, message) {
      this._deliver(JSON.stringify({ type: 'error', code, message }));
    }

    send(text) {
      if (this.readyState !== OPEN) throw new Error('P2PSocket is not open');
      let msg = null;
      try { msg = JSON.parse(text); } catch (_) { /* let the service reject it */ }
      if (msg && msg.type === 'join') {
        this._lastJoin = text;
        if (!this._room) this._start(String(msg.roomId || 'waka'));
      }
      this._route(text);
    }

    _route(text) {
      if (this._hostId === null) { this._queue.push(text); return; }
      if (this._hostId === selfId) { if (this._localHandle) this._localHandle.message(text); return; }
      this._data.send(text, { target: this._hostId }).catch(() => {});
    }

    _flush() {
      const q = this._queue;
      this._queue = [];
      for (const t of q) this._route(t);
    }

    _start(roomId) {
      this._roomId = roomId;
      const room = joinRoom({ appId, maxReceiveBytes: MAX_RECEIVE_BYTES, ...roomConfig }, `room-${roomId}`, {
        onJoinError: (d) => log('join error', d && d.error)
      });
      this._room = room;
      this._ctl = room.makeAction('ctl');
      this._data = room.makeAction('d');

      this._ctl.onMessage = (m, ctx) => this._onCtl(m, ctx.peerId);
      this._data.onMessage = (m, ctx) => this._onData(m, ctx.peerId);
      room.onPeerJoin = (peerId) => {
        log('peer join', peerId);
        if (this.readyState === OPEN && this._hostId === selfId) this._announce(peerId);
      };
      room.onPeerLeave = (peerId) => this._onPeerLeave(peerId);

      this._scheduleDiscovery();
      // If no host appears and we also cannot host (should not happen), surface it.
      this._failTimer = setTimeout(() => {
        if (this._hostId === null && this.readyState === OPEN) {
          this._deliverError('P2P_UNREACHABLE', 'Could not reach the room. Check your connection and try again.');
        }
      }, discoveryMs * 4);
    }

    _scheduleDiscovery() {
      clearTimeout(this._discoveryTimer);
      // Small jitter keeps two simultaneous first players from both hosting.
      const wait = discoveryMs + Math.floor(Math.random() * discoveryMs * 0.15);
      this._discoveryTimer = setTimeout(() => {
        if (this._hostId === null && this.readyState === OPEN) this._becomeHost();
      }, wait);
    }

    _announce(target) {
      if (this._hostId !== selfId) return;
      const payload = { t: 'host', since: this._hostSince };
      this._ctl.send(payload, target ? { target } : undefined).catch(() => {});
    }

    _becomeHost(since) {
      clearTimeout(this._discoveryTimer);
      this._hostId = selfId;
      this._hostSince = since || now();
      this._linkedAt = now();
      this._service = createRoomService({ limits: serviceLimits });
      const self = this;
      const localConn = {
        send: (text) => self._deliver(text),
        close: () => self._deliverError('KICKED', 'Disconnected by room rules'),
        terminate: () => {},
        isOpen: () => self.readyState === OPEN
      };
      this._localHandle = this._service.connect(localConn);
      log('hosting room', this._roomId);
      this._announce();
      if (this._queue.length === 0 && this._lastJoin) this._queue.push(this._lastJoin);
      this._flush();
    }

    _stopHosting() {
      for (const h of this._peerHandles.values()) h.close();
      this._peerHandles.clear();
      if (this._localHandle) this._localHandle.close();
      this._localHandle = null;
      if (this._service) this._service.shutdown();
      this._service = null;
    }

    _followHost(peerId, since) {
      const wasHost = this._hostId === selfId;
      const changed = this._hostId !== peerId;
      if (wasHost) this._stopHosting();
      clearTimeout(this._discoveryTimer);
      this._hostId = peerId;
      this._hostSince = since;
      this._linkedAt = now();
      log('following host', peerId);
      if (changed && this._lastJoin) {
        // Re-join on the (new) host; anything else queued is stale.
        this._queue = [this._lastJoin];
      }
      this._flush();
    }

    _onCtl(m, peerId) {
      if (this.readyState !== OPEN) return;
      if (!m || typeof m !== 'object' || m.t !== 'host' || !Number.isFinite(m.since)) return;
      if (m.since > now() + MAX_CLOCK_SKEW_MS) return;
      // Once linked to a live host, only the initial race may move us: a late
      // "I'm older" announcement (e.g. forged since:0) cannot hijack the room.
      const settled = this._hostId !== null && this._hostId !== peerId
        && now() - this._linkedAt > HOST_SETTLE_MS;
      if (settled) {
        if (this._hostId === selfId) this._announce(peerId);
        return;
      }
      const them = { since: m.since, id: peerId };
      if (this._hostId === selfId) {
        if (older(them, { since: this._hostSince, id: selfId })) this._followHost(peerId, m.since);
        else this._announce(peerId);
        return;
      }
      if (this._hostId === null || this._hostId === peerId
          || older(them, { since: this._hostSince, id: this._hostId })) {
        this._followHost(peerId, m.since);
      }
    }

    _onData(m, peerId) {
      if (this.readyState !== OPEN) return;
      if (typeof m !== 'string') return;
      if (this._hostId === selfId) {
        if (m.length > MAX_MSG_CHARS) return;
        const until = this._banned.get(peerId);
        if (until !== undefined) {
          if (now() < until) return;
          this._banned.delete(peerId);
        }
        let h = this._peerHandles.get(peerId);
        if (!h) {
          if (this._peerHandles.size >= MAX_PEERS) return;
          const self = this;
          const conn = {
            send: (text) => self._data.send(text, { target: peerId }).catch(() => {}),
            close: () => {
              // Called by the room service when it kicks this peer (rate limit,
              // join/idle timeout): drop it and ignore it for a while so a fresh
              // handle cannot reset its token bucket.
              const ph = self._peerHandles.get(peerId);
              if (ph) { ph.close(); self._peerHandles.delete(peerId); }
              if (self._banned.size > 256) self._banned.clear();
              self._banned.set(peerId, now() + KICK_BAN_MS);
            },
            terminate: () => conn.close(),
            isOpen: () => self.readyState === OPEN && self._peerHandles.has(peerId)
          };
          h = this._service.connect(conn);
          this._peerHandles.set(peerId, h);
        }
        h.message(m);
      } else if (peerId === this._hostId) {
        if (m.length > MAX_SNAPSHOT_CHARS) return;
        this._deliver(m);
      }
    }

    _onPeerLeave(peerId) {
      if (this.readyState !== OPEN || !this._room) return;
      log('peer leave', peerId);
      const h = this._peerHandles.get(peerId);
      if (h) { h.close(); this._peerHandles.delete(peerId); }
      if (peerId !== this._hostId) return;
      // Host gone: lowest remaining id hosts; others wait for its announcement.
      this._hostId = null;
      const ids = Object.keys(this._room.getPeers()).filter((id) => id !== peerId).concat(selfId).sort();
      if (ids[0] === selfId) this._becomeHost();
      else this._scheduleDiscovery();
      if (this._lastJoin) this._queue = [this._lastJoin];
    }

    close(code = 1000, reason = '') {
      if (this.readyState === CLOSED) return;
      this.readyState = CLOSED;
      clearTimeout(this._discoveryTimer);
      clearTimeout(this._failTimer);
      this._stopHosting();
      if (this._room) { try { this._room.leave(); } catch (_) { /* ignore */ } }
      this._room = null;
      this._emit('close', { code, reason });
    }
  }

  return P2PSocket;
}
