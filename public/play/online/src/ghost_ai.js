import {
  DIR_UP,
  DIR_RIGHT,
  DIR_DOWN,
  DIR_LEFT,
  turnAround
} from './movement.js';

export const GHOST_MODE_CHASE = 'CHASE';
export const GHOST_MODE_SCATTER = 'SCATTER';
export const GHOST_MODE_FRIGHTENED = 'FRIGHTENED';
export const GHOST_MODE_EATEN = 'EATEN';
export const GHOST_MODE_IN_HOUSE = 'IN_HOUSE';
export const GHOST_MODE_LEAVING_HOUSE = 'LEAVING_HOUSE';

export const WAVE_SCHEDULE = [
  { mode: GHOST_MODE_SCATTER, duration: 7 },
  { mode: GHOST_MODE_CHASE, duration: 20 },
  { mode: GHOST_MODE_SCATTER, duration: 7 },
  { mode: GHOST_MODE_CHASE, duration: 20 },
  { mode: GHOST_MODE_SCATTER, duration: 5 },
  { mode: GHOST_MODE_CHASE, duration: 20 },
  { mode: GHOST_MODE_SCATTER, duration: 5 },
  { mode: GHOST_MODE_CHASE, duration: Infinity }
];

export function createGhosts() {
  const blinky = {
    name: 'blinky',
    color: '#ff0033',
    x: 13.5,
    y: 11.5,
    dir: DIR_LEFT,
    mode: GHOST_MODE_SCATTER,
    scatterTarget: { x: 25, y: 0 },
    speed: 4.8,
    houseTimer: 0
  };

  const pinky = {
    name: 'pinky',
    color: '#ffb8ff',
    x: 13.5,
    y: 14.5,
    dir: DIR_UP,
    mode: GHOST_MODE_IN_HOUSE,
    scatterTarget: { x: 2, y: 0 },
    speed: 4.8,
    houseTimer: 1.0
  };

  const inky = {
    name: 'inky',
    color: '#00ffff',
    x: 11.5,
    y: 14.5,
    dir: DIR_UP,
    mode: GHOST_MODE_IN_HOUSE,
    scatterTarget: { x: 27, y: 30 },
    speed: 4.8,
    houseTimer: 3.5
  };

  const clyde = {
    name: 'clyde',
    color: '#ffb851',
    x: 15.5,
    y: 14.5,
    dir: DIR_UP,
    mode: GHOST_MODE_IN_HOUSE,
    scatterTarget: { x: 0, y: 30 },
    speed: 4.8,
    houseTimer: 6.0
  };

  return {
    blinky,
    pinky,
    inky,
    clyde,
    list: [blinky, pinky, inky, clyde],
    globalMode: GHOST_MODE_SCATTER,
    waveIndex: 0,
    waveTimer: 0,
    frightenedTimer: 0,
    ghostsEatenInSequence: 0
  };
}

export function getGhostTarget(ghost, player, blinky, currentGlobalMode) {
  if (ghost.mode === GHOST_MODE_EATEN) {
    return { x: 13, y: 12 }; // ghost door entrance
  }

  const effectiveMode = (ghost.mode === GHOST_MODE_FRIGHTENED)
    ? ghost.mode
    : currentGlobalMode;

  if (effectiveMode === GHOST_MODE_SCATTER) {
    return ghost.scatterTarget;
  }

  const px = Math.floor(player.x);
  const py = Math.floor(player.y);

  switch (ghost.name) {
    case 'blinky':
      return { x: px, y: py };

    case 'pinky': {
      const dx = player.dir ? player.dir.dx : 0;
      const dy = player.dir ? player.dir.dy : 0;
      return { x: px + 4 * dx, y: py + 4 * dy };
    }

    case 'inky': {
      const dx = player.dir ? player.dir.dx : 0;
      const dy = player.dir ? player.dir.dy : 0;
      const pivotX = px + 2 * dx;
      const pivotY = py + 2 * dy;
      const bx = Math.floor(blinky ? blinky.x : px);
      const by = Math.floor(blinky ? blinky.y : py);
      return {
        x: pivotX + (pivotX - bx),
        y: pivotY + (pivotY - by)
      };
    }

    case 'clyde': {
      const dist = Math.hypot(ghost.x - player.x, ghost.y - player.y);
      if (dist >= 8.0) {
        return { x: px, y: py };
      } else {
        return ghost.scatterTarget;
      }
    }

    default:
      return ghost.scatterTarget;
  }
}

export function triggerFrightened(ghosts, duration = 7.0) {
  ghosts.frightenedTimer = duration;
  ghosts.ghostsEatenInSequence = 0;

  for (const ghost of ghosts.list) {
    if (ghost.mode !== GHOST_MODE_EATEN && ghost.mode !== GHOST_MODE_IN_HOUSE) {
      ghost.mode = GHOST_MODE_FRIGHTENED;
      ghost.dir = turnAround(ghost.dir);
    }
  }
}

export function eatGhost(ghost, ghosts) {
  if (ghost.mode !== GHOST_MODE_FRIGHTENED) return 0;
  ghost.mode = GHOST_MODE_EATEN;
  ghosts.ghostsEatenInSequence = (ghosts.ghostsEatenInSequence || 0) + 1;
  const points = Math.min(1600, 200 * Math.pow(2, ghosts.ghostsEatenInSequence - 1));
  return points;
}

export function updateGhostAI(ghosts, player, dt, maze) {
  // Update wave timers
  if (ghosts.frightenedTimer > 0) {
    ghosts.frightenedTimer -= dt;
    if (ghosts.frightenedTimer <= 0) {
      ghosts.frightenedTimer = 0;
      for (const ghost of ghosts.list) {
        if (ghost.mode === GHOST_MODE_FRIGHTENED) {
          ghost.mode = ghosts.globalMode;
        }
      }
    }
  } else {
    const wave = WAVE_SCHEDULE[ghosts.waveIndex];
    if (wave && wave.duration !== Infinity) {
      ghosts.waveTimer += dt;
      if (ghosts.waveTimer >= wave.duration) {
        ghosts.waveTimer = 0;
        ghosts.waveIndex = Math.min(ghosts.waveIndex + 1, WAVE_SCHEDULE.length - 1);
        ghosts.globalMode = WAVE_SCHEDULE[ghosts.waveIndex].mode;
        for (const ghost of ghosts.list) {
          if (ghost.mode === GHOST_MODE_CHASE || ghost.mode === GHOST_MODE_SCATTER) {
            ghost.mode = ghosts.globalMode;
            ghost.dir = turnAround(ghost.dir);
          }
        }
      }
    }
  }

  // Update each ghost
  for (const ghost of ghosts.list) {
    updateSingleGhost(ghost, ghosts, player, dt, maze);
  }
}

function updateSingleGhost(ghost, ghosts, player, dt, maze) {
  // Handle house timers
  if (ghost.mode === GHOST_MODE_IN_HOUSE) {
    ghost.houseTimer -= dt;
    if (ghost.houseTimer <= 0) {
      ghost.mode = GHOST_MODE_LEAVING_HOUSE;
    } else {
      return;
    }
  }

  if (ghost.mode === GHOST_MODE_LEAVING_HOUSE) {
    const targetX = 13.5;
    const targetY = 11.5;
    if (Math.abs(ghost.x - targetX) > 0.05) {
      ghost.x += Math.sign(targetX - ghost.x) * ghost.speed * dt;
    } else if (ghost.y > targetY + 0.05) {
      ghost.x = targetX;
      ghost.y -= ghost.speed * dt;
    } else {
      ghost.x = 13.5;
      ghost.y = 11.5;
      ghost.dir = DIR_LEFT;
      ghost.mode = ghosts.globalMode;
    }
    return;
  }

  if (ghost.mode === GHOST_MODE_EATEN) {
    const doorX = 13.5;
    const doorY = 12.5;
    const distToDoor = Math.hypot(ghost.x - doorX, ghost.y - doorY);
    if (distToDoor < 0.6) {
      ghost.x = 13.5;
      ghost.y = 14.5;
      ghost.mode = GHOST_MODE_LEAVING_HOUSE;
      return;
    }
  }

  const speedMultiplier = ghost.mode === GHOST_MODE_EATEN ? 2.0 : (ghost.mode === GHOST_MODE_FRIGHTENED ? 0.6 : 1.0);
  let remainingDist = ghost.speed * speedMultiplier * dt;
  const maxIterations = 5;
  let iters = 0;

  while (remainingDist > 0.0001 && iters < maxIterations) {
    iters++;
    const tileX = Math.floor(ghost.x);
    const tileY = Math.floor(ghost.y);
    const centerX = tileX + 0.5;
    const centerY = tileY + 0.5;

    // If ghost is already centered at intersection, make direction decision first
    if (Math.abs(ghost.x - centerX) < 0.0001 && Math.abs(ghost.y - centerY) < 0.0001) {
      const target = getGhostTarget(ghost, player, ghosts.blinky, ghosts.globalMode);
      ghost.dir = pickNextDirection(ghost, tileX, tileY, target, maze);
    }

    let targetX = centerX;
    let targetY = centerY;

    if (ghost.dir.dx !== 0) {
      targetY = centerY;
      targetX = ghost.dir.dx > 0 ? (Math.floor(ghost.x - 0.5) + 1.5) : (Math.ceil(ghost.x + 0.5) - 1.5);
    } else {
      targetX = centerX;
      targetY = ghost.dir.dy > 0 ? (Math.floor(ghost.y - 0.5) + 1.5) : (Math.ceil(ghost.y + 0.5) - 1.5);
    }

    let distToCenter = ghost.dir.dx !== 0 ? Math.abs(targetX - ghost.x) : Math.abs(targetY - ghost.y);
    if (distToCenter < 0.0001) {
      if (ghost.dir.dx !== 0) targetX += ghost.dir.dx;
      else targetY += ghost.dir.dy;
      distToCenter = 1.0;
    }

    const moveDist = Math.min(remainingDist, distToCenter);
    ghost.x += ghost.dir.dx * moveDist;
    ghost.y += ghost.dir.dy * moveDist;
    remainingDist -= moveDist;

    if (moveDist >= distToCenter - 0.0001) {
      ghost.x = targetX;
      ghost.y = targetY;

      // Tunnel wrap
      if (Math.floor(ghost.y) === 14) {
        if (ghost.x < 0) ghost.x += maze.width;
        else if (ghost.x >= maze.width) ghost.x -= maze.width;
      }

      const curTileX = Math.floor(ghost.x);
      const curTileY = Math.floor(ghost.y);
      const target = getGhostTarget(ghost, player, ghosts.blinky, ghosts.globalMode);
      ghost.dir = pickNextDirection(ghost, curTileX, curTileY, target, maze);
    }
  }

  if (Math.floor(ghost.y) === 14) {
    if (ghost.x < 0) ghost.x += maze.width;
    else if (ghost.x >= maze.width) ghost.x -= maze.width;
  }
}

function pickNextDirection(ghost, tileX, tileY, target, maze) {
  const dirs = [DIR_UP, DIR_LEFT, DIR_DOWN, DIR_RIGHT];
  const opposite = turnAround(ghost.dir);
  const canPassDoor = ghost.mode === GHOST_MODE_EATEN;

  const validDirs = [];
  for (const d of dirs) {
    if (d === opposite) continue;
    const nx = tileX + d.dx;
    const ny = tileY + d.dy;
    if (maze.isWalkable(nx, ny, { isGhost: true, canPassDoor })) {
      validDirs.push(d);
    }
  }

  if (validDirs.length === 0) {
    return opposite;
  }

  if (ghost.mode === GHOST_MODE_FRIGHTENED) {
    const idx = Math.floor(Math.random() * validDirs.length);
    return validDirs[idx];
  }

  let bestDir = validDirs[0];
  let bestDistSq = Infinity;

  for (const d of validDirs) {
    const nx = tileX + d.dx;
    const ny = tileY + d.dy;
    const distSq = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestDir = d;
    }
  }

  return bestDir;
}
