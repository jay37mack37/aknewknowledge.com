export const CAMERA_MODE_FIRST_PERSON = 'FIRST_PERSON';
export const CAMERA_MODE_THIRD_PERSON = 'THIRD_PERSON';
export const CAMERA_MODE_THIRD_PERSON_FRONT = 'THIRD_PERSON_FRONT';

export const CAMERA_MODES = [
  CAMERA_MODE_FIRST_PERSON,
  CAMERA_MODE_THIRD_PERSON,
  CAMERA_MODE_THIRD_PERSON_FRONT
];

export function cycleCameraMode(currentMode) {
  if (currentMode === CAMERA_MODE_FIRST_PERSON) return CAMERA_MODE_THIRD_PERSON;
  if (currentMode === CAMERA_MODE_THIRD_PERSON) return CAMERA_MODE_THIRD_PERSON_FRONT;
  return CAMERA_MODE_FIRST_PERSON;
}

export function getCameraModeLabel(mode) {
  switch (mode) {
    case CAMERA_MODE_FIRST_PERSON:
      return 'VIEW: 1ST';
    case CAMERA_MODE_THIRD_PERSON:
      return 'VIEW: 3RD';
    case CAMERA_MODE_THIRD_PERSON_FRONT:
      return 'VIEW: FRONT';
    default:
      return 'VIEW: 1ST';
  }
}

export function getWallClampedCameraPosition(mode, player, maze, options = {}) {
  const {
    thirdPersonDistance = 2.2,
    thirdPersonHeight = 0.85,
    thirdPersonFrontHeight = 0.75,
    firstPersonHeight = 0.55,
    wallMargin = 0.25,
    stepSize = 0.05,
    minDistance = 0.95,
    pacmanY = 0.45,
    maxCameraHeight = 1.55,
    firstPersonPullback = 0
  } = options;

  const angle = player.currentAngle || 0;
  // Forward vector in 3D (angle 0 is North = -Z, angle PI/2 is East = +X)
  const fwdX = Math.sin(angle);
  const fwdZ = -Math.cos(angle);

  if (mode === CAMERA_MODE_FIRST_PERSON) {
    // Optional eye pull-back along the corridor: when Pac-Man stops at a dead end the
    // eye is then ~0.8 from the wall instead of ~0.5, so floor, trims and the wall
    // edges stay in view instead of one flat colour filling the screen.
    let eyeX = player.x;
    let eyeZ = player.y;
    if (firstPersonPullback > 0) {
      let d = firstPersonPullback;
      while (d > 0 && maze && maze.isWall(player.x - fwdX * (d + 0.12), player.y - fwdZ * (d + 0.12))) {
        d = Math.max(0, d - 0.04);
      }
      eyeX = player.x - fwdX * d;
      eyeZ = player.y - fwdZ * d;
    }
    return {
      x: eyeX,
      y: firstPersonHeight,
      z: eyeZ,
      lookAt: {
        x: player.x + fwdX * 5.0,
        y: firstPersonHeight,
        z: player.y + fwdZ * 5.0
      },
      distance: 0,
      mode
    };
  }

  let dirX = 0;
  let dirZ = 0;
  const baseCamY = mode === CAMERA_MODE_THIRD_PERSON ? thirdPersonHeight : thirdPersonFrontHeight;
  const lookAt = { x: player.x, y: pacmanY, z: player.y };

  if (mode === CAMERA_MODE_THIRD_PERSON) {
    // Camera is behind Pac-Man
    dirX = -fwdX;
    dirZ = -fwdZ;
  } else if (mode === CAMERA_MODE_THIRD_PERSON_FRONT) {
    // Camera is in front of Pac-Man looking back at face
    dirX = fwdX;
    dirZ = fwdZ;
  }

  let actualDistance = thirdPersonDistance;

  if (maze) {
    let currentD = 0;
    while (currentD <= thirdPersonDistance) {
      currentD += stepSize;
      const testX = player.x + dirX * currentD;
      const testZ = player.y + dirZ * currentD;
      if (maze.isWall(testX, testZ)) {
        actualDistance = Math.max(0, currentD - wallMargin);
        break;
      }
    }
  }

  let camX = player.x + dirX * actualDistance;
  let camZ = player.y + dirZ * actualDistance;

  if (maze && maze.isWall(camX, camZ)) {
    while (actualDistance > 0 && maze.isWall(camX, camZ)) {
      actualDistance = Math.max(0, actualDistance - 0.05);
      camX = player.x + dirX * actualDistance;
      camZ = player.y + dirZ * actualDistance;
    }
  }

  // Ensure a slight horizontal offset if safe so lookAt vector is never strictly vertical
  if (actualDistance < 0.08 && maze && !maze.isWall(player.x + dirX * 0.08, player.y + dirZ * 0.08)) {
    actualDistance = 0.08;
    camX = player.x + dirX * actualDistance;
    camZ = player.y + dirZ * actualDistance;
  }

  // Fallback height & tilt: if wall restricts horizontal distance such that 3D distance < minDistance,
  // raise the camera height to maintain minimum viewing distance and look down towards Pac-Man.
  let camY = baseCamY;
  const baseHeightDiff = baseCamY - pacmanY;
  const current3DDist = Math.hypot(actualDistance, baseHeightDiff);

  if (current3DDist < minDistance) {
    const neededHeightDiff = Math.sqrt(Math.max(0, minDistance * minDistance - actualDistance * actualDistance));
    camY = Math.min(maxCameraHeight, pacmanY + Math.max(baseHeightDiff, neededHeightDiff));
  }

  return {
    x: camX,
    y: camY,
    z: camZ,
    lookAt,
    distance: actualDistance,
    mode
  };
}

/**
 * Safely advances smooth camera position toward targetPos.
 * Detects large jumps (respawn, mode switch, tunnel wrap), unsafe in-wall positions,
 * or wall-intersecting lerp paths and snaps immediately to the safe targetPos.
 */
export function stepSmoothCameraPosition(currentPos, targetPos, maze, options = {}) {
  const {
    lerpSpeed = 0.18,
    maxDistance = 2.0,
    segmentSteps = 5
  } = options;

  if (!currentPos || !targetPos) {
    const pt = targetPos || currentPos || { x: 0, y: 0, z: 0 };
    return { x: pt.x, y: pt.y, z: pt.z, snapped: true };
  }

  // 1. Detect large distance jump (mode switch, respawn, tunnel wrap)
  const dist = Math.hypot(targetPos.x - currentPos.x, targetPos.z - currentPos.z);
  if (dist > maxDistance) {
    return { x: targetPos.x, y: targetPos.y, z: targetPos.z, snapped: true };
  }

  // 2. Detect unsafe current position (camera currently inside a wall)
  if (maze && typeof maze.isWall === 'function' && maze.isWall(currentPos.x, currentPos.z)) {
    return { x: targetPos.x, y: targetPos.y, z: targetPos.z, snapped: true };
  }

  // 3. Compute tentative lerped position
  const nextX = currentPos.x + (targetPos.x - currentPos.x) * lerpSpeed;
  const nextY = currentPos.y + (targetPos.y - currentPos.y) * lerpSpeed;
  const nextZ = currentPos.z + (targetPos.z - currentPos.z) * lerpSpeed;

  // 4. If next position is inside a wall, snap directly to safe target
  if (maze && typeof maze.isWall === 'function' && maze.isWall(nextX, nextZ)) {
    return { x: targetPos.x, y: targetPos.y, z: targetPos.z, snapped: true };
  }

  // 5. Segment check: verify path between currentPos and next position does not penetrate walls
  if (maze && typeof maze.isWall === 'function' && segmentSteps > 0) {
    for (let i = 1; i < segmentSteps; i++) {
      const frac = i / segmentSteps;
      const testX = currentPos.x + (nextX - currentPos.x) * frac;
      const testZ = currentPos.z + (nextZ - currentPos.z) * frac;
      if (maze.isWall(testX, testZ)) {
        return { x: targetPos.x, y: targetPos.y, z: targetPos.z, snapped: true };
      }
    }
  }

  return {
    x: Number(nextX.toFixed(3)),
    y: Number(nextY.toFixed(3)),
    z: Number(nextZ.toFixed(3)),
    snapped: false
  };
}
