import { createMaze } from './maze.js';
import {
  DIR_UP,
  DIR_RIGHT,
  DIR_DOWN,
  DIR_LEFT,
  queueTurn,
  updateMovement,
  updateAngle,
  turnAround
} from './movement.js';
import {
  createGhosts,
  updateGhostAI,
  triggerFrightened,
  eatGhost,
  GHOST_MODE_CHASE,
  GHOST_MODE_SCATTER,
  GHOST_MODE_FRIGHTENED,
  GHOST_MODE_EATEN,
  GHOST_MODE_IN_HOUSE
} from './ghost_ai.js';

export const PLAYER_SPAWNS = [
  { x: 12.5, y: 23.5 },
  { x: 14.5, y: 23.5 },
  { x: 11.5, y: 23.5 },
  { x: 15.5, y: 23.5 }
];

export const EMOTE_WHITELIST = [
  'WAKA WAKA!',
  'CHOMP TIME!',
  'LOOK OUT!'
];

export const MAX_INPUT_QUEUE = 5;
export const EMOTE_COOLDOWN = 2.0; // 2 seconds cooldown

export function normalizeTurnCommand(cmd) {
  if (typeof cmd !== 'string') return null;
  const upper = cmd.trim().toUpperCase();
  if (upper === 'UP') return 'FORWARD';
  if (upper === 'DOWN') return 'BACK';
  if (upper === 'FORWARD' || upper === 'BACK' || upper === 'LEFT' || upper === 'RIGHT') {
    return upper;
  }
  return null;
}

/**
 * Creates a pure server-authoritative multiplayer Pac-Man game simulation.
 */
export function createMultiplayerGame(options = {}) {
  const maze = options.maze || createMaze();
  const ghosts = options.ghosts || createGhosts();
  const spawns = options.spawns || PLAYER_SPAWNS;
  let level = options.level || 1;
  const autoCorner = options.autoCorner === true;

  // Map of clientId -> player object
  const players = new Map();

  let tickCount = 0;
  let gameTime = 0;
  let pelletsEatenThisLevel = 0;
  let fruit = null;
  let eventSeq = 1;
  const events = [];

  function recordEvent(eventData) {
    events.push({
      id: eventSeq++,
      ...eventData
    });
    if (events.length > 50) {
      events.splice(0, events.length - 50);
    }
  }

  function spawnFruit() {
    const points = level === 1 ? 100 : (level === 2 ? 300 : 500);
    const fruitType = level === 1 ? 'cherry' : (level === 2 ? 'strawberry' : 'apple');
    fruit = {
      active: true,
      x: 13.5,
      y: 17.5,
      points,
      type: fruitType,
      timer: 10.0
    };
    recordEvent({ type: 'fruit_spawn', fruitType, points });
  }

  function addPlayer(clientId, playerMeta = {}) {
    const slot = playerMeta.slot !== undefined ? playerMeta.slot : players.size;
    const spawn = spawns[slot % spawns.length] || { x: 13.5, y: 23.5 };

    const player = {
      id: playerMeta.id || `p_${clientId}`,
      clientId,
      name: playerMeta.name || 'Pac-Player',
      slot,
      color: playerMeta.color || '#ffff00',
      colorName: playerMeta.colorName || 'Neon Yellow',
      spawn: { x: spawn.x, y: spawn.y },
      x: spawn.x,
      y: spawn.y,
      dir: DIR_LEFT,
      currentAngle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
      bufferedTurn: null,
      speed: 5.0 + Math.min(1.5, (level - 1) * 0.2),
      isMoving: true,
      radius: 0.35,
      score: 0,
      deaths: 0,
      alive: true,
      respawning: false,
      respawnTimer: 0,
      shieldTimer: 0,
      supercharged: false,
      powerTimer: 0,
      inputQueue: [],
      taggedVictims: new Set(),
      lastEmoteTime: -100,
      autoCorner
    };

    players.set(clientId, player);
    recordEvent({ type: 'player_joined', playerId: player.id, name: player.name, slot });
    return player;
  }

  function removePlayer(clientId) {
    const player = players.get(clientId);
    if (player) {
      players.delete(clientId);
      recordEvent({ type: 'player_left', playerId: player.id });
      return player;
    }
    return null;
  }

  function getPlayer(clientId) {
    return players.get(clientId) || null;
  }

  function getPlayerById(playerId) {
    for (const p of players.values()) {
      if (p.id === playerId) return p;
    }
    return null;
  }

  function queueInput(clientId, command) {
    const player = players.get(clientId);
    if (!player) return false;

    const normalized = normalizeTurnCommand(command);
    if (!normalized) return false;

    if (player.inputQueue.length >= MAX_INPUT_QUEUE) {
      return false; // Queue cap reached
    }

    player.inputQueue.push(normalized);
    return true;
  }

  function sendEmote(clientId, text) {
    const player = players.get(clientId);
    if (!player) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    if (!EMOTE_WHITELIST.includes(text)) {
      return { ok: false, reason: 'INVALID_TEXT' };
    }

    if (gameTime - player.lastEmoteTime < EMOTE_COOLDOWN) {
      return { ok: false, reason: 'COOLDOWN' };
    }

    player.lastEmoteTime = gameTime;
    recordEvent({
      type: 'emote',
      playerId: player.id,
      name: player.name,
      text
    });

    return { ok: true, text };
  }

  function getNearestLivingPlayer(ghost) {
    let nearest = null;
    let minDistSq = Infinity;

    for (const player of players.values()) {
      if (player.respawning) continue;
      const distSq = (player.x - ghost.x) ** 2 + (player.y - ghost.y) ** 2;
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = player;
      }
    }

    return nearest || { x: 13.5, y: 23.5, dir: DIR_LEFT };
  }

  function tick(dt) {
    tickCount++;
    gameTime += dt;

    // 1. Process player movement, inputs, and timers
    for (const player of players.values()) {
      if (player.respawning) {
        player.respawnTimer -= dt;
        if (player.respawnTimer <= 0) {
          player.respawning = false;
          player.respawnTimer = 0;
          player.x = player.spawn.x;
          player.y = player.spawn.y;
          player.dir = DIR_LEFT;
          player.currentAngle = -Math.PI / 2;
          player.targetAngle = -Math.PI / 2;
          player.bufferedTurn = null;
          player.isMoving = true;
          player.shieldTimer = 2.0;
          player.supercharged = false;
          player.powerTimer = 0;
          player.speed = 5.0 + Math.min(1.5, (level - 1) * 0.2);
          player.taggedVictims.clear();
          recordEvent({ type: 'player_respawn', playerId: player.id });
        }
        continue; // Cannot move while respawning
      }

      // Shield timer
      if (player.shieldTimer > 0) {
        player.shieldTimer = Math.max(0, player.shieldTimer - dt);
      }

      // Power timer
      if (player.powerTimer > 0) {
        player.powerTimer = Math.max(0, player.powerTimer - dt);
        if (player.powerTimer <= 0) {
          player.supercharged = false;
          player.speed = 5.0 + Math.min(1.5, (level - 1) * 0.2);
          player.taggedVictims.clear();
        }
      }

      // Process queued turn commands
      if (player.inputQueue.length > 0) {
        const nextCmd = player.inputQueue.shift();
        queueTurn(player, nextCmd, maze);
      }

      // Advance movement and angle
      updateMovement(player, dt, maze);
      updateAngle(player, dt);

      // Pellet consumption (atomic once-only check per tick)
      const pelletResult = maze.eatPellet(player.x, player.y);
      if (pelletResult) {
        player.score += pelletResult.points;
        pelletsEatenThisLevel++;

        if (pelletResult.type === 'power') {
          const powerDur = Math.max(2.0, 7.0 - (level - 1) * 0.6);
          const baseSpeed = 5.0 + Math.min(1.5, (level - 1) * 0.2);
          player.supercharged = true;
          player.powerTimer = powerDur;
          player.speed = Number((baseSpeed * 1.16).toFixed(2));
          player.taggedVictims.clear();
          triggerFrightened(ghosts, powerDur);
          recordEvent({ type: 'power', playerId: player.id, points: 50 });
        } else {
          recordEvent({ type: 'waka', playerId: player.id, points: 10 });
        }

        if (pelletsEatenThisLevel === 70 || pelletsEatenThisLevel === 170) {
          spawnFruit();
        }
      }

      // Fruit collection
      if (fruit && fruit.active) {
        const distToFruit = Math.hypot(player.x - fruit.x, player.y - fruit.y);
        if (distToFruit < 0.6) {
          player.score += fruit.points;
          recordEvent({ type: 'fruit_eaten', playerId: player.id, points: fruit.points, fruitType: fruit.type });
          fruit.active = false;
        }
      }
    }

    // 2. Fruit timer
    if (fruit && fruit.active) {
      fruit.timer -= dt;
      if (fruit.timer <= 0) {
        fruit.active = false;
      }
    }

    // 3. PvP Tagging: supercharged player tags non-supercharged rival
    const playerList = Array.from(players.values());
    for (let i = 0; i < playerList.length; i++) {
      const pA = playerList[i];
      if (!pA.supercharged || pA.respawning) continue;

      for (let j = 0; j < playerList.length; j++) {
        if (i === j) continue;
        const pB = playerList[j];

        // Target must not be supercharged, must not be respawning, must not have shield
        if (pB.supercharged || pB.respawning || pB.shieldTimer > 0) continue;

        // Exactly once per supercharge period against this rival
        if (pA.taggedVictims.has(pB.id)) continue;

        const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
        if (dist < 0.65) {
          pA.taggedVictims.add(pB.id);
          pA.score += 500;
          pB.deaths = (pB.deaths || 0) + 1;
          pB.respawning = true;
          pB.respawnTimer = 1.0;
          pB.isMoving = false;
          pB.supercharged = false;
          pB.powerTimer = 0;
          recordEvent({
            type: 'pvp_tag',
            attackerId: pA.id,
            victimId: pB.id,
            points: 500
          });
        }
      }
    }

    // 4. Update Ghost AI targeting nearest living player
    const primaryTarget = getNearestLivingPlayer(ghosts.blinky);
    updateGhostAI(ghosts, primaryTarget, dt, maze);

    // 5. Ghost Collisions with living players
    for (const player of players.values()) {
      if (player.respawning) continue;

      for (const ghost of ghosts.list) {
        const dist = Math.hypot(player.x - ghost.x, player.y - ghost.y);
        if (dist < 0.65) {
          if (ghost.mode === GHOST_MODE_FRIGHTENED) {
            if (player.supercharged) {
              const pts = eatGhost(ghost, ghosts);
              player.score += pts;
              recordEvent({
                type: 'eat_ghost',
                playerId: player.id,
                ghost: ghost.name,
                points: pts
              });
            }
          } else if (ghost.mode === GHOST_MODE_CHASE || ghost.mode === GHOST_MODE_SCATTER) {
            if (player.shieldTimer <= 0 && !player.supercharged) {
              // Ghost caught player! Without freezing the entire match
              player.deaths = (player.deaths || 0) + 1;
              player.respawning = true;
              player.respawnTimer = 1.0;
              player.isMoving = false;
              player.supercharged = false;
              player.powerTimer = 0;
              recordEvent({
                type: 'ghost_hit',
                playerId: player.id,
                ghost: ghost.name
              });
              break; // Don't get hit by multiple ghosts on same tick
            }
          }
        }
      }
    }

    // 6. Level clear check
    if (maze.pelletsRemaining <= 0) {
      level += 1;

      // Mutate maze tiles in place or use reset method
      if (typeof maze.reset === 'function') {
        maze.reset();
      } else {
        const newMaze = createMaze();
        for (let y = 0; y < maze.height; y++) {
          for (let x = 0; x < maze.width; x++) {
            maze.tiles[y][x] = newMaze.tiles[y][x];
          }
        }
        maze.pelletsRemaining = newMaze.pelletsRemaining;
      }

      pelletsEatenThisLevel = 0;
      fruit = null;

      const playerBaseSpeed = 5.0 + Math.min(1.5, (level - 1) * 0.2);
      const ghostBaseSpeed = 4.8 + Math.min(1.8, (level - 1) * 0.25);

      // Reset players to their starting spawns and base speeds
      for (const p of players.values()) {
        p.x = p.spawn.x;
        p.y = p.spawn.y;
        p.dir = DIR_LEFT;
        p.currentAngle = -Math.PI / 2;
        p.targetAngle = -Math.PI / 2;
        p.bufferedTurn = null;
        p.isMoving = true;
        p.speed = playerBaseSpeed;
        p.respawning = false;
        p.respawnTimer = 0;
        p.shieldTimer = 0;
        p.supercharged = false;
        p.powerTimer = 0;
        p.taggedVictims.clear();
        p.inputQueue = [];
      }

      // Reset ghosts to their initial spawns, speeds, and states
      ghosts.globalMode = GHOST_MODE_SCATTER;
      ghosts.waveIndex = 0;
      ghosts.waveTimer = 0;
      ghosts.frightenedTimer = 0;
      ghosts.ghostsEatenInSequence = 0;

      for (const g of ghosts.list) {
        g.speed = ghostBaseSpeed;
      }

      ghosts.blinky.x = 13.5;
      ghosts.blinky.y = 11.5;
      ghosts.blinky.dir = DIR_LEFT;
      ghosts.blinky.mode = GHOST_MODE_SCATTER;
      ghosts.blinky.houseTimer = 0;

      ghosts.pinky.x = 13.5;
      ghosts.pinky.y = 14.5;
      ghosts.pinky.dir = DIR_UP;
      ghosts.pinky.mode = GHOST_MODE_IN_HOUSE;
      ghosts.pinky.houseTimer = 1.0;

      ghosts.inky.x = 11.5;
      ghosts.inky.y = 14.5;
      ghosts.inky.dir = DIR_UP;
      ghosts.inky.mode = GHOST_MODE_IN_HOUSE;
      ghosts.inky.houseTimer = 3.5;

      ghosts.clyde.x = 15.5;
      ghosts.clyde.y = 14.5;
      ghosts.clyde.dir = DIR_UP;
      ghosts.clyde.mode = GHOST_MODE_IN_HOUSE;
      ghosts.clyde.houseTimer = 6.0;

      recordEvent({ type: 'level_clear', level });
    }
  }

  function getSnapshot() {
    return {
      tick: tickCount,
      timestamp: Date.now(),
      level,
      pelletsRemaining: maze.pelletsRemaining,
      pelletGrid: maze.tiles.map(row =>
        row.map(t => (t === 2 ? '.' : t === 3 ? 'o' : ' ')).join('')
      ),
      players: Array.from(players.values()).map(p => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: p.color,
        colorName: p.colorName,
        x: Number(p.x.toFixed(3)),
        y: Number(p.y.toFixed(3)),
        dir: p.dir ? p.dir.name : 'LEFT',
        angle: Number(p.currentAngle.toFixed(3)),
        speed: p.speed,
        isMoving: p.isMoving,
        score: p.score,
        deaths: p.deaths,
        supercharged: p.supercharged,
        powerTimer: Number(p.powerTimer.toFixed(2)),
        shieldTimer: Number(p.shieldTimer.toFixed(2)),
        respawning: p.respawning
      })),
      ghosts: ghosts.list.map(g => ({
        name: g.name,
        color: g.color,
        x: Number(g.x.toFixed(3)),
        y: Number(g.y.toFixed(3)),
        dir: g.dir ? g.dir.name : 'LEFT',
        mode: g.mode
      })),
      fruit: fruit && fruit.active ? {
        x: fruit.x,
        y: fruit.y,
        points: fruit.points,
        type: fruit.type,
        timer: Number(fruit.timer.toFixed(1))
      } : null,
      events: events.slice(-10)
    };
  }

  return {
    maze,
    ghosts,
    get level() { return level; },
    set level(v) { level = v; },
    get tickCount() { return tickCount; },
    get gameTime() { return gameTime; },
    get fruit() { return fruit; },
    set fruit(v) { fruit = v; },
    addPlayer,
    removePlayer,
    getPlayer,
    getPlayerById,
    getNearestLivingPlayer,
    queueInput,
    sendEmote,
    tick,
    getSnapshot
  };
}
