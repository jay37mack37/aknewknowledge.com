export const DIR_UP = { name: 'UP', dx: 0, dy: -1, angle: 0 };
export const DIR_RIGHT = { name: 'RIGHT', dx: 1, dy: 0, angle: Math.PI / 2 };
export const DIR_DOWN = { name: 'DOWN', dx: 0, dy: 1, angle: Math.PI };
export const DIR_LEFT = { name: 'LEFT', dx: -1, dy: 0, angle: -Math.PI / 2 };

export const DIRECTIONS = [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];

export function turnLeft(dir) {
  if (dir === DIR_UP) return DIR_LEFT;
  if (dir === DIR_LEFT) return DIR_DOWN;
  if (dir === DIR_DOWN) return DIR_RIGHT;
  if (dir === DIR_RIGHT) return DIR_UP;
  return dir;
}

export function turnRight(dir) {
  if (dir === DIR_UP) return DIR_RIGHT;
  if (dir === DIR_RIGHT) return DIR_DOWN;
  if (dir === DIR_DOWN) return DIR_LEFT;
  if (dir === DIR_LEFT) return DIR_UP;
  return dir;
}

export function turnAround(dir) {
  if (dir === DIR_UP) return DIR_DOWN;
  if (dir === DIR_DOWN) return DIR_UP;
  if (dir === DIR_LEFT) return DIR_RIGHT;
  if (dir === DIR_RIGHT) return DIR_LEFT;
  return dir;
}

export function createPlayer(spawn = { x: 13.5, y: 23.5 }) {
  return {
    x: spawn.x,
    y: spawn.y,
    dir: DIR_LEFT,
    currentAngle: -Math.PI / 2,
    targetAngle: -Math.PI / 2,
    bufferedTurn: null,
    speed: 5.0,
    isMoving: true,
    radius: 0.35
  };
}

export function queueTurn(player, command, maze) {
  if (command === 'FORWARD') {
    player.isMoving = true;
    return;
  }

  if (command === 'BACK') {
    // Immediate 180 turnaround
    const newDir = turnAround(player.dir);
    player.dir = newDir;
    player.targetAngle = newDir.angle;
    player.bufferedTurn = null;
    player.isMoving = true;
    return;
  }

  if (command === 'LEFT' || command === 'RIGHT') {
    player.bufferedTurn = command;
    player.isMoving = true;

    // Check if we can turn immediately if already centered
    const targetDir = command === 'LEFT' ? turnLeft(player.dir) : turnRight(player.dir);
    const tileX = Math.floor(player.x);
    const tileY = Math.floor(player.y);
    const centerX = tileX + 0.5;
    const centerY = tileY + 0.5;

    if (Math.abs(player.x - centerX) < 0.25 && Math.abs(player.y - centerY) < 0.25) {
      const nextTileX = tileX + targetDir.dx;
      const nextTileY = tileY + targetDir.dy;
      if (maze.isWalkable(nextTileX, nextTileY)) {
        player.x = centerX;
        player.y = centerY;
        player.dir = targetDir;
        player.targetAngle = targetDir.angle;
        player.bufferedTurn = null;
      }
    }
  }
}

export function updateAngle(player, dt) {
  let diff = player.targetAngle - player.currentAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;

  const rotSpeed = 10.0;
  const maxStep = rotSpeed * dt;
  if (Math.abs(diff) <= maxStep) {
    player.currentAngle = player.targetAngle;
  } else {
    player.currentAngle += Math.sign(diff) * maxStep;
  }
}

// Auto-cornering (opt-in per player): at a plain corner, where the only way on is a
// single 90-degree turn, keep moving round it instead of stopping nose-to-wall.
// T-junctions still stop and wait for the player's choice.
function tryAutoCorner(player, tileX, tileY, maze) {
  if (!player.autoCorner) return false;
  const options = [turnLeft(player.dir), turnRight(player.dir)]
    .filter((d) => maze.isWalkable(tileX + d.dx, tileY + d.dy));
  if (options.length !== 1) return false;
  player.dir = options[0];
  player.targetAngle = options[0].angle;
  return true;
}

export function stepMovement(player, dt, maze) {
  if (!player.isMoving) return;

  let remainingDist = player.speed * dt;
  const maxIterations = 10;
  let iterations = 0;

  while (remainingDist > 0.0001 && iterations < maxIterations) {
    iterations++;
    const isTunnel = Math.floor(player.y) === 14;

    // Check wall collision if already exactly at center
    const tileX = Math.floor(player.x);
    const tileY = Math.floor(player.y);
    const centerX = tileX + 0.5;
    const centerY = tileY + 0.5;

    if (Math.abs(player.x - centerX) < 0.0001 && Math.abs(player.y - centerY) < 0.0001) {
      // Check turn at center
      if (player.bufferedTurn) {
        const targetDir = player.bufferedTurn === 'LEFT' ? turnLeft(player.dir) : turnRight(player.dir);
        if (maze.isWalkable(tileX + targetDir.dx, tileY + targetDir.dy)) {
          player.dir = targetDir;
          player.targetAngle = targetDir.angle;
          player.bufferedTurn = null;
        }
      }

      // Check if forward is blocked
      if (!maze.isWalkable(tileX + player.dir.dx, tileY + player.dir.dy)) {
        if (!tryAutoCorner(player, tileX, tileY, maze)) {
          player.isMoving = false;
          break;
        }
      }
    }

    // Find next center target ahead in current direction
    let targetX = player.x;
    let targetY = player.y;

    if (player.dir.dx !== 0) {
      targetY = centerY;
      if (player.dir.dx > 0) {
        targetX = Math.floor(player.x - 0.5) + 1.5;
      } else {
        targetX = Math.ceil(player.x + 0.5) - 1.5;
      }
    } else {
      targetX = centerX;
      if (player.dir.dy > 0) {
        targetY = Math.floor(player.y - 0.5) + 1.5;
      } else {
        targetY = Math.ceil(player.y + 0.5) - 1.5;
      }
    }

    let distToTarget = player.dir.dx !== 0
      ? Math.abs(targetX - player.x)
      : Math.abs(targetY - player.y);

    if (distToTarget < 0.0001) {
      // Advance target by 1 unit
      if (player.dir.dx !== 0) targetX += player.dir.dx;
      else targetY += player.dir.dy;
      distToTarget = 1.0;
    }

    const moveDist = Math.min(remainingDist, distToTarget);
    player.x += player.dir.dx * moveDist;
    player.y += player.dir.dy * moveDist;
    remainingDist -= moveDist;

    if (moveDist >= distToTarget - 0.0001) {
      player.x = targetX;
      player.y = targetY;

      // In tunnel row, wrap if past ends
      if (isTunnel) {
        if (player.x < 0) player.x += maze.width;
        else if (player.x >= maze.width) player.x -= maze.width;
      }

      const newTileX = Math.floor(player.x);
      const newTileY = Math.floor(player.y);

      // Handle buffered turn at this reached intersection
      if (player.bufferedTurn) {
        const targetDir = player.bufferedTurn === 'LEFT' ? turnLeft(player.dir) : turnRight(player.dir);
        if (maze.isWalkable(newTileX + targetDir.dx, newTileY + targetDir.dy)) {
          player.dir = targetDir;
          player.targetAngle = targetDir.angle;
          player.bufferedTurn = null;
          continue;
        }
      }

      // Check forward blocked
      if (!maze.isWalkable(newTileX + player.dir.dx, newTileY + player.dir.dy)) {
        if (tryAutoCorner(player, newTileX, newTileY, maze)) continue;
        player.isMoving = false;
        break;
      }
    }
  }

  // Tunnel wrap check
  if (Math.floor(player.y) === 14) {
    if (player.x < 0) player.x += maze.width;
    else if (player.x >= maze.width) player.x -= maze.width;
  }
}

export function updateMovement(player, dt, maze, options = {}) {
  const { fixedStep = null, maxDt = null } = options;
  if (!player.isMoving) return;

  const clampedDt = maxDt !== null ? Math.min(Math.max(dt, 0), maxDt) : Math.max(dt, 0);

  if (fixedStep) {
    player.accumulator = (player.accumulator || 0) + clampedDt;
    while (player.accumulator >= fixedStep - 1e-6) {
      stepMovement(player, fixedStep, maze);
      player.accumulator -= fixedStep;
    }
  } else {
    stepMovement(player, clampedDt, maze);
  }
}
