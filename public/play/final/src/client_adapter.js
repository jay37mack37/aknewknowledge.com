import {
  createMaze,
  TILE_WALL,
  TILE_PELLET,
  TILE_POWER_PELLET,
  TILE_EMPTY,
  TILE_GHOST_DOOR,
  TILE_GHOST_HOUSE
} from './maze.js';
import {
  DIR_UP,
  DIR_RIGHT,
  DIR_DOWN,
  DIR_LEFT
} from './movement.js';

export function rehydrateDirection(dirName) {
  if (!dirName) return DIR_LEFT;
  const upper = typeof dirName === 'string' ? dirName.toUpperCase() : (dirName.name || 'LEFT');
  if (upper === 'UP') return DIR_UP;
  if (upper === 'RIGHT') return DIR_RIGHT;
  if (upper === 'DOWN') return DIR_DOWN;
  if (upper === 'LEFT') return DIR_LEFT;
  return DIR_LEFT;
}

/**
 * Applies server snapshot pelletGrid directly in place to maze.tiles without reallocating arrays.
 * Non-pellet tiles (walls, ghost door, ghost house) are preserved.
 */
export function applyPelletGridToMaze(maze, pelletGrid) {
  if (!maze || !maze.tiles || !Array.isArray(pelletGrid)) {
    return { pelletsRemaining: maze ? maze.pelletsRemaining : 0 };
  }

  let pelletsCount = 0;
  const height = Math.min(maze.height, pelletGrid.length);

  for (let y = 0; y < height; y++) {
    const line = pelletGrid[y];
    const row = maze.tiles[y];
    const width = Math.min(maze.width, line.length);

    for (let x = 0; x < width; x++) {
      const cur = row[x];
      // Never overwrite walls, ghost door or ghost house
      if (cur === TILE_WALL || cur === TILE_GHOST_DOOR || cur === TILE_GHOST_HOUSE) {
        continue;
      }

      const char = line[x];
      if (char === '.') {
        row[x] = TILE_PELLET;
        pelletsCount++;
      } else if (char === 'o') {
        row[x] = TILE_POWER_PELLET;
        pelletsCount++;
      } else {
        row[x] = TILE_EMPTY;
      }
    }
  }

  maze.pelletsRemaining = pelletsCount;
  return { pelletsRemaining: pelletsCount };
}

/**
 * Interpolates angle finding shortest path around [-PI, PI] circle.
 */
export function interpolateAngle(fromAngle, toAngle, alpha) {
  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  let diff = toAngle - fromAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return fromAngle + diff * clampedAlpha;
}

/**
 * Interpolates position with distance threshold snap to prevent lerping across tunnel wraps or respawns.
 */
export function interpolatePosition(from, to, alpha, maxDistance = 2.0) {
  if (!from || !to) {
    const pt = to || from || { x: 0, y: 0 };
    return { x: pt.x, y: pt.y, snapped: false };
  }

  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  if (dist > maxDistance) {
    // Snap immediately without dragging across walls
    return { x: to.x, y: to.y, snapped: true };
  }

  const clampedAlpha = Math.max(0, Math.min(1, alpha));
  return {
    x: Number((from.x + (to.x - from.x) * clampedAlpha).toFixed(3)),
    y: Number((from.y + (to.y - from.y) * clampedAlpha).toFixed(3)),
    snapped: false
  };
}

/**
 * Resolves avatar visual layout for 3D meshes, nametags, and minimap rendering.
 * Pure function: calculates non-intrusive visual separation offsets and scaling
 * for live overlapping players stopped in the same corridor cell without altering
 * authoritative logical coordinates, and hides respawning avatars.
 *
 * @param {Array<Object>} players - List of player objects ({ id, x, y, respawning, slot, ... })
 * @param {Object} [maze] - Optional maze object with isWalkable(x, y)
 * @returns {Map<string, Object>} Map from playerId to layout descriptor
 */
export function resolveAvatarVisualLayout(players, maze = null) {
  const result = new Map();
  if (!Array.isArray(players) || players.length === 0) {
    return result;
  }

  const validPlayers = players.filter(p => p && p.id);

  // 1. Mark respawning players as hidden
  const livePlayers = [];
  for (const p of validPlayers) {
    if (p.respawning) {
      result.set(p.id, {
        id: p.id,
        visible: false,
        respawning: true,
        x: p.x,
        y: 0.42,
        z: p.y,
        offsetX: 0,
        offsetZ: 0,
        scale: 1.0,
        nametagOffsetY: 0.75,
        overlapCount: 1,
        clusterIndex: 0,
        minimap: {
          visible: false,
          isOverlapping: false,
          ringIndex: 0,
          ringCount: 1
        }
      });
    } else {
      livePlayers.push(p);
    }
  }

  if (livePlayers.length === 0) {
    return result;
  }

  // 2. Cluster live players by proximity (dist < 0.60)
  const OVERLAP_DISTANCE = 0.60;
  const visited = new Set();
  const clusters = [];

  for (let i = 0; i < livePlayers.length; i++) {
    const p1 = livePlayers[i];
    if (visited.has(p1.id)) continue;

    const cluster = [p1];
    visited.add(p1.id);

    const queue = [p1];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (let j = 0; j < livePlayers.length; j++) {
        const p2 = livePlayers[j];
        if (!visited.has(p2.id)) {
          const d = Math.hypot(p2.x - cur.x, p2.y - cur.y);
          if (d < OVERLAP_DISTANCE) {
            visited.add(p2.id);
            cluster.push(p2);
            queue.push(p2);
          }
        }
      }
    }

    cluster.sort((a, b) => {
      const sA = a.slot !== undefined ? a.slot : 0;
      const sB = b.slot !== undefined ? b.slot : 0;
      if (sA !== sB) return sA - sB;
      return String(a.id).localeCompare(String(b.id));
    });
    clusters.push(cluster);
  }

  // 3. Compute layout per cluster
  for (const cluster of clusters) {
    const count = cluster.length;
    if (count === 1) {
      const p = cluster[0];
      result.set(p.id, {
        id: p.id,
        visible: true,
        respawning: false,
        x: p.x,
        y: 0.42,
        z: p.y,
        offsetX: 0,
        offsetZ: 0,
        scale: 1.0,
        nametagOffsetY: 0.75,
        overlapCount: 1,
        clusterIndex: 0,
        minimap: {
          visible: true,
          isOverlapping: false,
          ringIndex: 0,
          ringCount: 1
        }
      });
      continue;
    }

    let avgX = 0;
    let avgY = 0;
    for (const p of cluster) {
      avgX += p.x;
      avgY += p.y;
    }
    avgX /= count;
    avgY /= count;

    const tileX = Math.floor(avgX);
    const tileY = Math.floor(avgY);

    let isH = true;
    let isV = false;
    if (maze && typeof maze.isWalkable === 'function') {
      const walkLeft = maze.isWalkable(tileX - 1, tileY);
      const walkRight = maze.isWalkable(tileX + 1, tileY);
      const walkUp = maze.isWalkable(tileX, tileY - 1);
      const walkDown = maze.isWalkable(tileX, tileY + 1);
      isH = Boolean(walkLeft || walkRight);
      isV = Boolean(walkUp || walkDown);
    }

    const scale = 0.82;

    for (let idx = 0; idx < count; idx++) {
      const p = cluster[idx];
      let offX = 0;
      let offZ = 0;

      if (count === 2) {
        const sign = idx === 0 ? -1 : 1;
        if (isH && !isV) {
          offX = sign * 0.22;
          offZ = sign * 0.08;
        } else if (isV && !isH) {
          offX = sign * 0.08;
          offZ = sign * 0.22;
        } else {
          offX = sign * 0.18;
          offZ = sign * 0.18;
        }
      } else if (count === 3) {
        const offsets = [-0.25, 0, 0.25];
        const lat = [-0.08, 0.08, -0.08];
        if (isH && !isV) {
          offX = offsets[idx];
          offZ = lat[idx];
        } else if (isV && !isH) {
          offX = lat[idx];
          offZ = offsets[idx];
        } else {
          const angles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];
          offX = Math.cos(angles[idx]) * 0.20;
          offZ = Math.sin(angles[idx]) * 0.20;
        }
      } else {
        const corners = [
          [-0.18, -0.18],
          [0.18, -0.18],
          [-0.18, 0.18],
          [0.18, 0.18]
        ];
        const c = corners[idx % 4];
        offX = c[0];
        offZ = c[1];
      }

      const nametagOffsetY = 0.75 + idx * 0.28;

      result.set(p.id, {
        id: p.id,
        visible: true,
        respawning: false,
        x: Number((p.x + offX).toFixed(3)),
        y: Number((0.42 * scale).toFixed(3)),
        z: Number((p.y + offZ).toFixed(3)),
        offsetX: offX,
        offsetZ: offZ,
        scale,
        nametagOffsetY,
        overlapCount: count,
        clusterIndex: idx,
        minimap: {
          visible: true,
          isOverlapping: true,
          ringIndex: idx,
          ringCount: count
        }
      });
    }
  }

  return result;
}

/**
 * Pure client snapshot adapter.
 */
export function createClientAdapter(options = {}) {
  const maze = options.maze || createMaze();
  let localPlayerId = null;
  let roomId = null;

  let currentLevel = 1;
  let levelChangedFlag = false;
  let localScore = 0;
  let highScore = 0;

  let player = null;
  let players = [];
  const allPlayersMap = new Map();

  const ghosts = {
    list: [],
    blinky: null,
    pinky: null,
    inky: null,
    clyde: null,
    frightenedTimer: 0
  };

  let fruit = null;
  let soundEvents = [];
  let screenFlash = false;
  let screenShake = false;

  let lastProcessedEventId = null;
  let latestSnapshot = null;
  let previousSnapshot = null;
  const snapshotBuffer = [];

  function setLocalPlayer(pId, rId) {
    localPlayerId = pId;
    roomId = rId;
  }

  function clearVisualEffects() {
    screenFlash = false;
    screenShake = false;
  }

  function applySnapshot(snapshot) {
    if (!snapshot) return;

    previousSnapshot = latestSnapshot;
    latestSnapshot = snapshot;
    snapshotBuffer.push({
      snapshot,
      clientTime: typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
    });
    if (snapshotBuffer.length > 20) {
      snapshotBuffer.splice(0, snapshotBuffer.length - 20);
    }

    // 1. Level progression check: if level incremented, mark levelChangedFlag, reset maze layout
    if (snapshot.level !== currentLevel) {
      currentLevel = snapshot.level;
      levelChangedFlag = true;
      if (typeof maze.reset === 'function') {
        maze.reset();
      } else {
        const fresh = createMaze();
        for (let y = 0; y < maze.height; y++) {
          for (let x = 0; x < maze.width; x++) {
            maze.tiles[y][x] = fresh.tiles[y][x];
          }
        }
      }
    }

    // 2. In-place pellet update
    if (snapshot.pelletGrid) {
      applyPelletGridToMaze(maze, snapshot.pelletGrid);
    }

    // 3. Players roster rehydration & mapping
    players = [];
    allPlayersMap.clear();
    player = null;

    if (Array.isArray(snapshot.players)) {
      for (const p of snapshot.players) {
        const rehydrated = {
          ...p,
          dir: rehydrateDirection(p.dir),
          currentAngle: typeof p.angle === 'number' ? p.angle : -Math.PI / 2,
          targetAngle: typeof p.angle === 'number' ? p.angle : -Math.PI / 2
        };

        allPlayersMap.set(rehydrated.id, rehydrated);

        if (localPlayerId && rehydrated.id === localPlayerId) {
          player = rehydrated;
          localScore = rehydrated.score || 0;
          if (localScore > highScore) highScore = localScore;
        } else {
          players.push(rehydrated);
        }
      }
    }

    // 4. Ghost entities
    ghosts.list = [];
    let maxPowerTimer = 0;
    for (const p of allPlayersMap.values()) {
      if (p.powerTimer > maxPowerTimer) {
        maxPowerTimer = p.powerTimer;
      }
    }

    if (Array.isArray(snapshot.ghosts)) {
      for (const g of snapshot.ghosts) {
        const rehydratedG = {
          ...g,
          dir: rehydrateDirection(g.dir)
        };
        ghosts.list.push(rehydratedG);
        if (g.name === 'blinky') ghosts.blinky = rehydratedG;
        else if (g.name === 'pinky') ghosts.pinky = rehydratedG;
        else if (g.name === 'inky') ghosts.inky = rehydratedG;
        else if (g.name === 'clyde') ghosts.clyde = rehydratedG;
      }
    }

    // Frightened timer normalized from active frightened ghost or max player powerTimer
    const hasFrightenedGhost = ghosts.list.some(g => g.mode === 'FRIGHTENED');
    ghosts.frightenedTimer = hasFrightenedGhost ? maxPowerTimer : 0;

    // 5. Fruit
    fruit = snapshot.fruit ? { ...snapshot.fruit, active: true } : null;

    // 6. Sound & Screen Events (Process once by event id; late joins ignore backlog)
    if (Array.isArray(snapshot.events)) {
      if (lastProcessedEventId === null) {
        // First snapshot received: mark latest event without replaying past sounds
        let maxId = 0;
        for (const ev of snapshot.events) {
          if (ev.id > maxId) maxId = ev.id;
        }
        lastProcessedEventId = maxId;
      } else {
        for (const ev of snapshot.events) {
          if (ev.id <= lastProcessedEventId) continue;
          lastProcessedEventId = ev.id;

          if (ev.type === 'waka') {
            if (localPlayerId && ev.playerId === localPlayerId) {
              soundEvents.push('waka');
            }
          } else if (ev.type === 'power') {
            soundEvents.push('power');
          } else if (ev.type === 'eat_ghost') {
            soundEvents.push('eat_ghost');
          } else if (ev.type === 'fruit_eaten') {
            soundEvents.push('fruit');
          } else if (ev.type === 'level_clear') {
            soundEvents.push('clear');
          } else if (ev.type === 'ghost_hit') {
            if (localPlayerId && ev.playerId === localPlayerId) {
              soundEvents.push('die');
              screenFlash = true;
              screenShake = true;
            }
          } else if (ev.type === 'pvp_tag') {
            if (localPlayerId && ev.victimId === localPlayerId) {
              soundEvents.push('die');
              screenFlash = true;
              screenShake = true;
            } else if (localPlayerId && ev.attackerId === localPlayerId) {
              soundEvents.push('eat_ghost');
            }
          }
        }
      }
    }
  }

  function interpolateEntities(renderTime, bufferDelayMs = 100) {
    if (snapshotBuffer.length === 0) return { player: null, players: [], ghosts: [] };
    if (snapshotBuffer.length === 1) {
      const s = snapshotBuffer[0].snapshot;
      const allP = (s.players || []).map(p => ({
        id: p.id,
        x: p.x,
        y: p.y,
        angle: typeof p.angle === 'number' ? p.angle : 0,
        isMoving: p.isMoving,
        supercharged: p.supercharged,
        shieldTimer: p.shieldTimer,
        respawning: p.respawning
      }));
      const ghostsList = (s.ghosts || []).map(g => ({
        name: g.name,
        x: g.x,
        y: g.y,
        mode: g.mode,
        color: g.color
      }));
      return {
        player: localPlayerId ? allP.find(p => p.id === localPlayerId) || null : null,
        players: localPlayerId ? allP.filter(p => p.id !== localPlayerId) : allP,
        ghosts: ghostsList
      };
    }

    const targetTime = renderTime - bufferDelayMs;

    let s0 = snapshotBuffer[0];
    let s1 = snapshotBuffer[snapshotBuffer.length - 1];

    for (let i = 0; i < snapshotBuffer.length - 1; i++) {
      if (snapshotBuffer[i].clientTime <= targetTime && snapshotBuffer[i + 1].clientTime >= targetTime) {
        s0 = snapshotBuffer[i];
        s1 = snapshotBuffer[i + 1];
        break;
      }
    }

    const timeDiff = s1.clientTime - s0.clientTime;
    const alpha = timeDiff > 0 ? Math.min(1.0, Math.max(0.0, (targetTime - s0.clientTime) / timeDiff)) : 1.0;

    // Interpolate players
    const s0PlayerMap = new Map((s0.snapshot.players || []).map(p => [p.id, p]));
    const interpPlayers = (s1.snapshot.players || []).map(p1 => {
      const p0 = s0PlayerMap.get(p1.id) || p1;
      const pos = interpolatePosition(p0, p1, alpha);
      const angle = interpolateAngle(
        typeof p0.angle === 'number' ? p0.angle : 0,
        typeof p1.angle === 'number' ? p1.angle : 0,
        alpha
      );
      return {
        id: p1.id,
        x: pos.x,
        y: pos.y,
        angle,
        isMoving: p1.isMoving,
        supercharged: p1.supercharged,
        shieldTimer: p1.shieldTimer,
        respawning: p1.respawning
      };
    });

    // Interpolate ghosts
    const s0GhostMap = new Map((s0.snapshot.ghosts || []).map(g => [g.name, g]));
    const interpGhosts = (s1.snapshot.ghosts || []).map(g1 => {
      const g0 = s0GhostMap.get(g1.name) || g1;
      const pos = interpolatePosition(g0, g1, alpha);
      return {
        name: g1.name,
        x: pos.x,
        y: pos.y,
        mode: g1.mode,
        color: g1.color
      };
    });

    const localP = localPlayerId ? interpPlayers.find(p => p.id === localPlayerId) || null : null;
    const remoteP = localPlayerId ? interpPlayers.filter(p => p.id !== localPlayerId) : interpPlayers;

    return { player: localP, players: remoteP, ghosts: interpGhosts };
  }

  function interpolateRemoteEntities(renderTime, bufferDelayMs = 100) {
    const res = interpolateEntities(renderTime, bufferDelayMs);
    return { players: res.players, ghosts: res.ghosts };
  }

  function reset() {
    player = null;
    players = [];
    allPlayersMap.clear();
    ghosts.list = [];
    ghosts.blinky = null;
    ghosts.pinky = null;
    ghosts.inky = null;
    ghosts.clyde = null;
    ghosts.frightenedTimer = 0;
    fruit = null;
    soundEvents = [];
    screenFlash = false;
    screenShake = false;
    lastProcessedEventId = null;
    latestSnapshot = null;
    previousSnapshot = null;
    snapshotBuffer.length = 0;
    localPlayerId = null;
    roomId = null;
    currentLevel = 1;
    levelChangedFlag = false;
    localScore = 0;
  }

  return {
    maze,
    get player() { return player; },
    get players() { return players; },
    get allPlayers() { return allPlayersMap; },
    get ghosts() { return ghosts; },
    get fruit() { return fruit; },
    get level() { return currentLevel; },
    hasLevelChanged: () => {
      const changed = levelChangedFlag;
      levelChangedFlag = false;
      return changed;
    },
    get score() { return localScore; },
    get highScore() { return highScore; },
    get soundEvents() { return soundEvents; },
    set soundEvents(v) { soundEvents = v; },
    get screenFlash() { return screenFlash; },
    get screenShake() { return screenShake; },
    get latestSnapshot() { return latestSnapshot; },
    get previousSnapshot() { return previousSnapshot; },
    get lastProcessedEventId() { return lastProcessedEventId; },
    get localPlayerId() { return localPlayerId; },
    get roomId() { return roomId; },
    setLocalPlayer,
    clearVisualEffects,
    applySnapshot,
    interpolateEntities,
    interpolateRemoteEntities,
    reset
  };
}

/**
 * Multiplayer Controller seam.
 * Manages single-registration event lifecycle, join/rejoin, error handling, and ping heartbeat.
 */
export function createMultiplayerController(options = {}) {
  const {
    client,
    adapter,
    connectTimeoutMs = 5000,
    joinTimeoutMs = 6000,
    getWsUrl = () => {
      if (typeof window !== 'undefined' && window.location) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
      }
      return 'ws://localhost:8732';
    },
    onLobbyStatus = () => {},
    onViewChange = () => {}, // 'lobby' | 'game'
    onJoined = () => {},
    onToast = () => {},
    onEmote = () => {},
    onPingUpdate = () => {}
  } = options;

  let initialized = false;
  let inLobby = true;
  let isConnecting = false;
  let hasExplicitError = false;
  let pendingName = 'PAC-RUNNER';
  let pingIntervalId = null;
  let lastPingToken = 0;
  let lastPingSentTime = 0;
  let joinDeadlineTimer = null;

  function stopJoinDeadline() {
    if (joinDeadlineTimer) {
      clearTimeout(joinDeadlineTimer);
      joinDeadlineTimer = null;
    }
  }

  function startJoinDeadline() {
    stopJoinDeadline();
    if (typeof setTimeout === 'function') {
      joinDeadlineTimer = setTimeout(() => {
        if (inLobby) {
          isConnecting = false;
          stopPingHeartbeat();
          if (client) client.disconnect();
          adapter.reset();
          onLobbyStatus('Join timed out. Server did not respond.', 'error');
        }
      }, joinTimeoutMs);
      if (joinDeadlineTimer && typeof joinDeadlineTimer.unref === 'function') {
        joinDeadlineTimer.unref();
      }
    }
  }

  function stopPingHeartbeat() {
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
  }

  function startPingHeartbeat() {
    stopPingHeartbeat();
    if (typeof setInterval === 'function') {
      pingIntervalId = setInterval(() => {
        if (client && client.getReadyState() === 1) {
          lastPingToken++;
          lastPingSentTime = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          client.send({ type: 'ping', token: lastPingToken });
        }
      }, 2000);
      if (pingIntervalId && typeof pingIntervalId.unref === 'function') {
        pingIntervalId.unref();
      }
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;

    client.on('open', () => {
      // Handled via connect promise resolution
    });

    client.on('joined', (data) => {
      hasExplicitError = false;
      // Handle REAL server payload: { type: 'joined', playerId, roomId, color, colorName, slot, roster }
      // with fallback to { player: { id, name, color } }
      const playerId = data.playerId || (data.player && data.player.id);
      const roomId = data.roomId;
      const color = data.color || (data.player && data.player.color) || '#ffff00';
      const colorName = data.colorName || (data.player && data.player.colorName) || 'Yellow';
      const playerName = (data.roster && Array.isArray(data.roster) && data.roster.find(p => p.id === playerId)?.name)
        || data.name
        || (data.player && data.player.name)
        || pendingName;

      adapter.setLocalPlayer(playerId, roomId);
      onLobbyStatus(`Joined as ${playerName} (${colorName || color})`, 'normal');
      onJoined({ playerId, roomId, color, colorName, name: playerName });
      startPingHeartbeat();
    });

    client.on('pong', (data) => {
      if (data && data.token === lastPingToken) {
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
        const rtt = Math.round(now - lastPingSentTime);
        onPingUpdate(rtt);
      }
    });

    client.on('roster_update', (data) => {
      // Updates handled via snapshots
    });

    client.on('emote', (data) => {
      if (typeof onEmote === 'function') {
        onEmote(data);
      }
      onToast(`${data.name || 'Player'}: ${data.text}`);
    });

    client.on('error', (err) => {
      const code = err && (err.code || err.error);
      const msg = (err && (err.message || err.code)) ? (err.message || err.code) : 'Server error';

      if (code === 'EMOTE_REJECTED') {
        // Non-fatal error: show toast notification but keep client connected and in match
        onToast(msg);
        return;
      }

      isConnecting = false;
      stopPingHeartbeat();
      stopJoinDeadline();
      hasExplicitError = true;
      client.disconnect();
      onLobbyStatus(msg, 'error');
      if (!inLobby) {
        inLobby = true;
        adapter.reset();
        onViewChange('lobby');
      }
    });

    client.on('close', (event) => {
      isConnecting = false;
      stopPingHeartbeat();
      stopJoinDeadline();
      if (!inLobby) {
        inLobby = true;
        adapter.reset();
        onViewChange('lobby');
        onLobbyStatus('Disconnected from server. Click Enter to reconnect.', 'error');
      } else if (!hasExplicitError) {
        onLobbyStatus('Connection closed', 'error');
      }
      hasExplicitError = false;
    });

    client.on('game_snapshot', (snapshot) => {
      adapter.applySnapshot(snapshot);
      if (inLobby && adapter.player) {
        inLobby = false;
        isConnecting = false;
        stopJoinDeadline();
        onViewChange('game');
      }
    });
  }

  async function connectAndJoin(roomId, name) {
    init();

    const cleanName = (name || '').trim() || 'PAC-RUNNER';
    let cleanRoomId = (roomId || '').trim();
    if (!cleanRoomId) cleanRoomId = 'waka';

    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(cleanRoomId)) {
      onLobbyStatus('Room must be 1-32 alphanumeric characters, dash or underscore', 'error');
      return { ok: false, error: 'INVALID_ROOM' };
    }

    pendingName = cleanName;
    hasExplicitError = false;
    stopPingHeartbeat();
    stopJoinDeadline();
    client.disconnect();

    isConnecting = true;
    onLobbyStatus('Connecting to multiplayer server...', 'connecting');

    const wsUrl = getWsUrl();

    try {
      await client.connect(wsUrl, { timeoutMs: connectTimeoutMs });
    } catch (err) {
      isConnecting = false;
      client.disconnect();
      const msg = err && err.message ? err.message : 'Connection failed';
      onLobbyStatus(msg, 'error');
      return { ok: false, error: err };
    }

    onLobbyStatus(`Joining room: ${cleanRoomId}...`, 'connecting');
    startJoinDeadline();
    const sent = client.join(cleanRoomId, cleanName);
    return { ok: sent };
  }

  function leave() {
    stopPingHeartbeat();
    stopJoinDeadline();
    if (client) {
      client.leave();
      client.disconnect();
    }
    inLobby = true;
    isConnecting = false;
    adapter.reset();
    onViewChange('lobby');
    onLobbyStatus('Left room. Ready to rejoin.', 'normal');
  }

  return {
    init,
    connectAndJoin,
    leave,
    get inLobby() { return inLobby; },
    get isConnecting() { return isConnecting; }
  };
}
