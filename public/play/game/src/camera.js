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
    maxCameraHeight = 1.55
  } = options;

  const angle = player.currentAngle || 0;
  // Forward vector in 3D (angle 0 is North = -Z, angle PI/2 is East = +X)
  const fwdX = Math.sin(angle);
  const fwdZ = -Math.cos(angle);

  if (mode === CAMERA_MODE_FIRST_PERSON) {
    return {
      x: player.x,
      y: firstPersonHeight,
      z: player.y,
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

export function hasClearLineOfSight(x0, y0, x1, y1, maze, stepSize = 0.1) {
  if (!maze) return true;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-4) return true;
  const steps = Math.ceil(dist / stepSize);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const curX = x0 + dx * t;
    const curY = y0 + dy * t;
    if (maze.isWall(curX, curY)) {
      return false;
    }
  }
  return true;
}

export function createCameraState() {
  return {
    position: { x: 0, y: 0, z: 0 },
    lookAt: { x: 0, y: 0, z: 0 },
    initialized: false,
    lastPlayer: null,
    lastPlayerPos: null,
    lastGameState: null
  };
}

export function updateCameraState(cameraState, options = {}) {
  const {
    mode = CAMERA_MODE_FIRST_PERSON,
    player,
    maze,
    gameState = null,
    stateTimer = 0,
    time = 0,
    lerpSpeed = 0.18,
    reset = false,
    shake = true,
    bob = true
  } = options;

  if (!player) {
    return {
      position: { ...cameraState.position },
      lookAt: { ...cameraState.lookAt },
      mode
    };
  }

  const targetCam = getWallClampedCameraPosition(mode, player, maze, options);
  const targetPos = { x: targetCam.x, y: targetCam.y, z: targetCam.z };
  const targetLook = { x: targetCam.lookAt.x, y: targetCam.lookAt.y, z: targetCam.lookAt.z };

  if (bob && mode === CAMERA_MODE_FIRST_PERSON && player.isMoving && time != null) {
    targetPos.y += Math.sin(time * 12) * 0.025;
  }

  const isRespawnStateChange = (
    (cameraState.lastGameState === 'PACMAN_DYING' || cameraState.lastGameState === 'LEVEL_CLEAR') &&
    gameState === 'PLAYING'
  );
  const isPlayerJump = cameraState.lastPlayerPos && (
    Math.hypot(player.x - cameraState.lastPlayerPos.x, player.y - cameraState.lastPlayerPos.y) > 5.0
  );
  const isNewPlayerInstance = cameraState.lastPlayer && cameraState.lastPlayer !== player;

  const shouldSnap = (
    !cameraState.initialized ||
    reset ||
    isRespawnStateChange ||
    isPlayerJump ||
    isNewPlayerInstance
  );

  if (shouldSnap) {
    cameraState.position.x = targetPos.x;
    cameraState.position.y = targetPos.y;
    cameraState.position.z = targetPos.z;
    cameraState.lookAt.x = targetLook.x;
    cameraState.lookAt.y = targetLook.y;
    cameraState.lookAt.z = targetLook.z;
    cameraState.initialized = true;
  } else {
    const candidateX = cameraState.position.x + (targetPos.x - cameraState.position.x) * lerpSpeed;
    const candidateY = cameraState.position.y + (targetPos.y - cameraState.position.y) * lerpSpeed;
    const candidateZ = cameraState.position.z + (targetPos.z - cameraState.position.z) * lerpSpeed;

    const candidateBlocked = maze && (
      maze.isWall(candidateX, candidateZ) ||
      !hasClearLineOfSight(player.x, player.y, candidateX, candidateZ, maze)
    );

    if (candidateBlocked) {
      cameraState.position.x = targetPos.x;
      cameraState.position.y = targetPos.y;
      cameraState.position.z = targetPos.z;
      cameraState.lookAt.x = targetLook.x;
      cameraState.lookAt.y = targetLook.y;
      cameraState.lookAt.z = targetLook.z;
    } else {
      cameraState.position.x = candidateX;
      cameraState.position.y = candidateY;
      cameraState.position.z = candidateZ;
      cameraState.lookAt.x += (targetLook.x - cameraState.lookAt.x) * lerpSpeed;
      cameraState.lookAt.y += (targetLook.y - cameraState.lookAt.y) * lerpSpeed;
      cameraState.lookAt.z += (targetLook.z - cameraState.lookAt.z) * lerpSpeed;
    }
  }

  cameraState.lastPlayer = player;
  cameraState.lastPlayerPos = { x: player.x, y: player.y };
  cameraState.lastGameState = gameState;

  let finalX = cameraState.position.x;
  let finalY = cameraState.position.y;
  let finalZ = cameraState.position.z;

  if (shake && gameState === 'PACMAN_DYING' && stateTimer < 0.8) {
    const shakeIntensity = Math.max(0, 1.0 - stateTimer / 0.8) * 0.12;
    if (shakeIntensity > 0) {
      const rand = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
      const offsetX = (rand() - 0.5) * shakeIntensity;
      const offsetY = (rand() - 0.5) * shakeIntensity;
      const testX = finalX + offsetX;
      const wallBlocked = maze && maze.isWall(testX, finalZ);
      const losBlocked = maze && !hasClearLineOfSight(player.x, player.y, testX, finalZ, maze);
      if (!wallBlocked && !losBlocked) {
        finalX = testX;
      }
      finalY += offsetY;
    }
  }

  return {
    position: { x: finalX, y: finalY, z: finalZ },
    lookAt: { ...cameraState.lookAt },
    mode
  };
}
