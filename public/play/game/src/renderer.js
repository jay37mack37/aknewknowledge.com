import * as THREE from '../vendor/three.module.js';
import {
  TILE_WALL,
  TILE_PELLET,
  TILE_POWER_PELLET,
  TILE_GHOST_DOOR
} from './maze.js';
import {
  GHOST_MODE_FRIGHTENED,
  GHOST_MODE_EATEN
} from './ghost_ai.js';
import {
  STATE_PACMAN_DYING
} from './game_state.js';
import {
  CAMERA_MODE_FIRST_PERSON,
  createCameraState,
  updateCameraState
} from './camera.js';

export function createRenderer(container, minimapCanvas) {
  // A Knew Knowledge adaptation: honour prefers-reduced-motion (set from main.js).
  let reducedMotion = false;
  // 1. Three.js Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x101310, 0.055);

  // Portrait phones: keep >= ~57 degrees across so a corridor never reads as one flat wall.
  const fitFov = (aspect) => Math.min(100, Math.max(75, 2 * Math.atan(Math.tan(35 * Math.PI / 180) / Math.max(aspect, 0.1)) * 180 / Math.PI));
  const camera = new THREE.PerspectiveCamera(fitFov(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x101310);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  // Lights: Hemisphere light + PointLight following player
  const hemiLight = new THREE.HemisphereLight(0xf2f0e8, 0x171a17, 1.3);
  scene.add(hemiLight);

  const playerLight = new THREE.PointLight(0xf6f4ec, 2.6, 14, 1.1);
  scene.add(playerLight);

  // Minimap 2D Context
  const miniCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

  // Maze Mesh Group
  const mazeGroup = new THREE.Group();
  scene.add(mazeGroup);

  // Instanced Meshes & Collections
  let wallInstancedMesh = null;
  let wallTopTrimMesh = null;
  let wallBottomTrimMesh = null;
  let pelletInstancedMesh = null;
  const pelletData = new Map(); // key "x,y" => { index, sprite, x, z }
  const powerPelletMeshes = new Map();
  const ghostMeshes = {};
  let fruitMesh = null;
  let pacmanModel = null;
  let currentCameraMode = CAMERA_MODE_FIRST_PERSON;
  const cameraState = createCameraState();

  // Procedural Additive Glow Texture for Pellets
  function createGlowTexture(coreColor, edgeColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, coreColor);
    grad.addColorStop(0.35, edgeColor);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  const pelletGlowTex = createGlowTexture('rgba(255, 240, 140, 1.0)', 'rgba(255, 180, 40, 0.4)');
  const powerGlowTex = createGlowTexture('rgba(255, 255, 255, 1.0)', 'rgba(255, 220, 80, 0.6)');

  // Procedural Floor Grid Texture
  function createFloorGridTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#050a18';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  // Shared Materials
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x353b34,
    roughness: 0.55,
    metalness: 0.15,
    emissive: 0x181c17,
    emissiveIntensity: 0.7
  });

  const neonTrimMat = new THREE.MeshBasicMaterial({
    color: 0xd7ed58
  });

  const doorMat = new THREE.MeshBasicMaterial({
    color: 0xef7946
  });

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d0b,
    roughness: 0.85
  });

  const pelletOrbMat = new THREE.MeshBasicMaterial({
    color: 0xffea78
  });

  const powerPelletOrbMat = new THREE.MeshBasicMaterial({
    color: 0xffffff
  });

  const pelletSpriteMat = new THREE.SpriteMaterial({
    map: pelletGlowTex,
    color: 0xffe066,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const powerSpriteMat = new THREE.SpriteMaterial({
    map: powerGlowTex,
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  // Shared Geometries
  const wallGeo = new THREE.BoxGeometry(1.0, 1.8, 1.0);
  const wallTrimGeo = new THREE.BoxGeometry(1.02, 0.06, 1.02);
  const pelletOrbGeo = new THREE.SphereGeometry(0.045, 12, 12);
  const powerPelletOrbGeo = new THREE.SphereGeometry(0.14, 16, 16);
  const dummyMatrix = new THREE.Matrix4();
  const dummyObj = new THREE.Object3D();

  function buildMaze(maze) {
    // Clear previous mazeGroup
    while (mazeGroup.children.length > 0) {
      const obj = mazeGroup.children[0];
      mazeGroup.remove(obj);
    }
    pelletData.clear();
    powerPelletMeshes.clear();

    // 1. Subtle Floor Grid & Dark Ceiling
    const floorGridTex = createFloorGridTexture();
    floorGridTex.repeat.set(maze.width, maze.height);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorGridTex,
      roughness: 0.6,
      metalness: 0.2
    });
    const floorGeo = new THREE.PlaneGeometry(maze.width + 4, maze.height + 4);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(maze.width / 2, 0, maze.height / 2);
    mazeGroup.add(floor);

    const ceiling = new THREE.Mesh(floorGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(maze.width / 2, 1.8, maze.height / 2);
    mazeGroup.add(ceiling);

    // 2. Count elements for InstancedMesh allocation
    let wallCount = 0;
    let pelletCount = 0;
    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const tile = maze.tiles[y][x];
        if (tile === TILE_WALL) wallCount++;
        else if (tile === TILE_PELLET) pelletCount++;
      }
    }

    wallInstancedMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    wallTopTrimMesh = new THREE.InstancedMesh(wallTrimGeo, neonTrimMat, wallCount);
    wallBottomTrimMesh = new THREE.InstancedMesh(wallTrimGeo, neonTrimMat, wallCount);
    pelletInstancedMesh = new THREE.InstancedMesh(pelletOrbGeo, pelletOrbMat, pelletCount);
    pelletInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    let wallIdx = 0;
    let pelletIdx = 0;

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const tile = maze.tiles[y][x];
        const posX = x + 0.5;
        const posZ = y + 0.5;

        if (tile === TILE_WALL) {
          // Solid wall face (dark blue)
          dummyObj.position.set(posX, 0.9, posZ);
          dummyObj.scale.set(1, 1, 1);
          dummyObj.updateMatrix();
          wallInstancedMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          // Emissive neon top trim
          dummyObj.position.set(posX, 1.77, posZ);
          dummyObj.updateMatrix();
          wallTopTrimMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          // Emissive neon bottom trim
          dummyObj.position.set(posX, 0.03, posZ);
          dummyObj.updateMatrix();
          wallBottomTrimMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          wallIdx++;
        } else if (tile === TILE_GHOST_DOOR) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.2), doorMat);
          door.position.set(posX, 0.6, posZ);
          mazeGroup.add(door);
        } else if (tile === TILE_PELLET) {
          // Pellet sphere orb at chest height (y = 0.45)
          dummyObj.position.set(posX, 0.45, posZ);
          dummyObj.scale.set(1, 1, 1);
          dummyObj.updateMatrix();
          pelletInstancedMesh.setMatrixAt(pelletIdx, dummyObj.matrix);

          // Soft additive glow sprite halo
          const sprite = new THREE.Sprite(pelletSpriteMat);
          sprite.position.set(posX, 0.45, posZ);
          sprite.scale.set(0.3, 0.3, 1);
          mazeGroup.add(sprite);

          pelletData.set(`${x},${y}`, { index: pelletIdx, sprite, x: posX, z: posZ });
          pelletIdx++;
        } else if (tile === TILE_POWER_PELLET) {
          // Bigger pulsing power pellet at chest height
          const ppMesh = new THREE.Mesh(powerPelletOrbGeo, powerPelletOrbMat);
          ppMesh.position.set(posX, 0.45, posZ);
          mazeGroup.add(ppMesh);

          const ppSprite = new THREE.Sprite(powerSpriteMat);
          ppSprite.position.set(posX, 0.45, posZ);
          ppSprite.scale.set(0.85, 0.85, 1);
          mazeGroup.add(ppSprite);

          powerPelletMeshes.set(`${x},${y}`, { mesh: ppMesh, sprite: ppSprite });
        }
      }
    }

    wallInstancedMesh.instanceMatrix.needsUpdate = true;
    wallTopTrimMesh.instanceMatrix.needsUpdate = true;
    wallBottomTrimMesh.instanceMatrix.needsUpdate = true;
    pelletInstancedMesh.instanceMatrix.needsUpdate = true;

    mazeGroup.add(wallInstancedMesh);
    mazeGroup.add(wallTopTrimMesh);
    mazeGroup.add(wallBottomTrimMesh);
    mazeGroup.add(pelletInstancedMesh);
  }

  function createGhostModel(ghost) {
    const group = new THREE.Group();
    const ghostColor = new THREE.Color(ghost.color);

    // Emissive glowing ghost body
    const headGeo = new THREE.SphereGeometry(0.32, 20, 20, 0, Math.PI * 2, 0, Math.PI / 2);
    const bodyGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.35, 20, 1, true);
    const skirtGeo = new THREE.ConeGeometry(0.07, 0.12, 8);

    const ghostMat = new THREE.MeshStandardMaterial({
      color: ghostColor,
      roughness: 0.25,
      metalness: 0.1,
      emissive: ghostColor,
      emissiveIntensity: 0.85
    });

    const head = new THREE.Mesh(headGeo, ghostMat);
    head.position.y = 0.35;
    group.add(head);

    const body = new THREE.Mesh(bodyGeo, ghostMat);
    body.position.y = 0.175;
    group.add(body);

    // Skirt ripples
    const skirtParts = [];
    for (let i = 0; i < 5; i++) {
      const skirt = new THREE.Mesh(skirtGeo, ghostMat);
      const angle = (i / 5) * Math.PI * 2;
      skirt.position.set(Math.cos(angle) * 0.25, 0.04, Math.sin(angle) * 0.25);
      skirt.rotation.x = Math.PI;
      group.add(skirt);
      skirtParts.push(skirt);
    }

    // Eyes: White sclera + Pupils that look in movement direction
    const eyeGeo = new THREE.SphereGeometry(0.09, 12, 12);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilGeo = new THREE.SphereGeometry(0.045, 12, 12);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x002288 });

    const eyeGroup = new THREE.Group();
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.13, 0.36, -0.26);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.13, 0.36, -0.34);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.13, 0.36, -0.26);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.13, 0.36, -0.34);

    eyeGroup.add(leftEye, leftPupil, rightEye, rightPupil);
    group.add(eyeGroup);

    // Colored point light casting illumination from the ghost
    const light = new THREE.PointLight(ghostColor, 3.0, 9, 1.2);
    light.position.y = 0.45;
    group.add(light);

    scene.add(group);
    return { group, head, body, skirtParts, ghostMat, eyeGroup, leftPupil, rightPupil, pupilMat, light, baseColor: ghostColor };
  }

  function createFruitModel() {
    const group = new THREE.Group();
    const fruitGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const fruitMat = new THREE.MeshStandardMaterial({
      color: 0xff0044,
      emissive: 0xaa0022,
      emissiveIntensity: 0.6,
      roughness: 0.3
    });
    const fruit = new THREE.Mesh(fruitGeo, fruitMat);
    group.add(fruit);
    const light = new THREE.PointLight(0xff0044, 2.0, 5, 1.2);
    group.add(light);
    group.position.set(13.5, 0.45, 17.5);
    scene.add(group);
    return group;
  }

  function createPacmanModel() {
    const group = new THREE.Group();

    const pacMat = new THREE.MeshStandardMaterial({
      color: 0xffea00,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0
    });

    const upperGroup = new THREE.Group();
    const topGeo = new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const topMesh = new THREE.Mesh(topGeo, pacMat);
    const topDiskGeo = new THREE.CircleGeometry(0.35, 24);
    topDiskGeo.rotateX(Math.PI / 2);
    const topDisk = new THREE.Mesh(topDiskGeo, pacMat);
    upperGroup.add(topMesh, topDisk);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    leftEye.position.set(-0.16, 0.18, -0.22);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    rightEye.position.set(0.16, 0.18, -0.22);
    upperGroup.add(leftEye, rightEye);

    const lowerGroup = new THREE.Group();
    const botGeo = new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const botMesh = new THREE.Mesh(botGeo, pacMat);
    const botDiskGeo = new THREE.CircleGeometry(0.35, 24);
    botDiskGeo.rotateX(-Math.PI / 2);
    const botDisk = new THREE.Mesh(botDiskGeo, pacMat);
    lowerGroup.add(botMesh, botDisk);

    group.add(upperGroup, lowerGroup);
    group.visible = false;
    scene.add(group);

    return {
      group,
      upperGroup,
      lowerGroup,
      pacMat
    };
  }

  function update(game, time) {
    if (!game.maze || !game.player) return;

    if (!pacmanModel) {
      pacmanModel = createPacmanModel();
    }

    // 1. Camera positioning with wall clamping and smooth lerping
    const camResult = updateCameraState(cameraState, {
      mode: currentCameraMode,
      player: game.player,
      maze: game.maze,
      gameState: game.state,
      stateTimer: game.stateTimer,
      time,
      shake: !reducedMotion,
      bob: !reducedMotion
    });

    camera.position.set(camResult.position.x, camResult.position.y, camResult.position.z);
    camera.lookAt(camResult.lookAt.x, camResult.lookAt.y, camResult.lookAt.z);

    // Screen flash & camera roll shake on death
    const screenFlash = document.getElementById('screen-flash');
    if (game.state === STATE_PACMAN_DYING) {
      const shake = Math.max(0, 1.0 - game.stateTimer / 0.8) * 0.12;
      camera.rotation.z = reducedMotion ? 0 : (Math.random() - 0.5) * shake * 0.5;

      if (screenFlash) {
        screenFlash.classList.add('active');
        const flash = Math.max(0, 1.0 - game.stateTimer / 0.4);
        screenFlash.style.opacity = String(reducedMotion ? Math.min(0.35, flash) : flash);
      }
    } else {
      camera.rotation.z = 0;
      if (screenFlash) {
        screenFlash.classList.remove('active');
        screenFlash.style.opacity = '0';
      }
    }

    // Update player point light (illuminates player & surroundings)
    playerLight.position.set(game.player.x, 0.7, game.player.y);

    // Update Pac-Man 3D model in third-person modes
    if (currentCameraMode === CAMERA_MODE_FIRST_PERSON) {
      pacmanModel.group.visible = false;
    } else {
      const pacmanPos = new THREE.Vector3(game.player.x, 0.42, game.player.y);
      const camDist = camera.position.distanceTo(pacmanPos);
      const pacmanRadius = 0.35;

      if (camDist <= pacmanRadius) {
        // Inside Pac-Man's body radius: hide to avoid filling the screen
        pacmanModel.group.visible = false;
      } else {
        pacmanModel.group.visible = true;
        // Fade if camera is within 0.35 to 0.65 units of center
        const opacity = Math.min(1.0, Math.max(0.1, (camDist - pacmanRadius) / 0.30));
        pacmanModel.pacMat.opacity = opacity;

        pacmanModel.group.position.copy(pacmanPos);
        pacmanModel.group.rotation.y = -game.player.currentAngle;

        // Animated chomping mouth
        const chomp = (Math.sin(time * 14) + 1) * 0.5;
        pacmanModel.upperGroup.rotation.x = -chomp * 0.42;
        pacmanModel.lowerGroup.rotation.x = chomp * 0.42;
      }
    }

    // 2. Animate and remove eaten pellets
    let pelletUpdated = false;
    for (const [coord, data] of pelletData) {
      const [x, y] = coord.split(',').map(Number);
      if (game.maze.tiles[y][x] !== TILE_PELLET) {
        // Pellet eaten: shrink instance matrix to 0 and hide sprite
        dummyMatrix.makeScale(0, 0, 0);
        pelletInstancedMesh.setMatrixAt(data.index, dummyMatrix);
        data.sprite.visible = false;
        pelletData.delete(coord);
        pelletUpdated = true;
      }
    }
    if (pelletUpdated && pelletInstancedMesh) {
      pelletInstancedMesh.instanceMatrix.needsUpdate = true;
    }

    for (const [coord, pp] of powerPelletMeshes) {
      const [x, y] = coord.split(',').map(Number);
      if (game.maze.tiles[y][x] !== TILE_POWER_PELLET) {
        mazeGroup.remove(pp.mesh);
        mazeGroup.remove(pp.sprite);
        powerPelletMeshes.delete(coord);
      } else {
        // Power pellets bigger and pulsing
        const pulse = 1.0 + Math.sin(time * 8) * 0.28;
        pp.mesh.scale.set(pulse, pulse, pulse);
        pp.sprite.scale.set(0.85 * pulse, 0.85 * pulse, 1);
      }
    }

    // 3. Update ghosts: Emissive body, skirt, directional eyes, bob, colored point light
    if (game.ghosts) {
      for (let i = 0; i < game.ghosts.list.length; i++) {
        const ghost = game.ghosts.list[i];
        let gObj = ghostMeshes[ghost.name];
        if (!gObj) {
          gObj = createGhostModel(ghost);
          ghostMeshes[ghost.name] = gObj;
        }

        // Ghost bobbing animation
        const ghostBob = reducedMotion ? 0 : Math.sin(time * 5 + i * 1.5) * 0.06;
        gObj.group.position.set(ghost.x, 0.42 + ghostBob, ghost.y);

        // Fade out or hide ghost meshes closer than about 0.7 tiles to the camera
        const distToCam = Math.hypot(ghost.x - camera.position.x, ghost.y - camera.position.z);
        if (distToCam < 0.7) {
          gObj.group.visible = false;
        } else {
          gObj.group.visible = true;
        }

        // Ghost visual appearance based on mode
        if (ghost.mode === GHOST_MODE_EATEN) {
          gObj.head.visible = false;
          gObj.body.visible = false;
          for (const s of gObj.skirtParts) s.visible = false;
          gObj.light.color.setHex(0x3366cc);
          gObj.pupilMat.color.setHex(0x00aaff);
        } else if (ghost.mode === GHOST_MODE_FRIGHTENED) {
          gObj.head.visible = true;
          gObj.body.visible = true;
          for (const s of gObj.skirtParts) s.visible = true;
          const isFlashing = game.ghosts.frightenedTimer < 2.5 && Math.floor(time * 6) % 2 === 0;
          const frightColor = isFlashing ? 0xffffff : 0x1e50ff;
          gObj.ghostMat.color.setHex(frightColor);
          gObj.ghostMat.emissive.setHex(frightColor);
          gObj.ghostMat.emissiveIntensity = 0.9;
          gObj.light.color.setHex(frightColor);
          gObj.pupilMat.color.setHex(0xff7744);
        } else {
          gObj.head.visible = true;
          gObj.body.visible = true;
          for (const s of gObj.skirtParts) s.visible = true;
          gObj.ghostMat.color.copy(gObj.baseColor);
          gObj.ghostMat.emissive.copy(gObj.baseColor);
          gObj.ghostMat.emissiveIntensity = 0.85;
          gObj.light.color.copy(gObj.baseColor);
          gObj.pupilMat.color.setHex(0x002288);
        }

        // Orient ghost towards its movement direction
        if (ghost.dir) {
          gObj.group.rotation.y = -ghost.dir.angle;
          // Directional eye pupils shift
          const pupOffsetX = ghost.dir.dx * 0.025;
          const pupOffsetZ = ghost.dir.dy * 0.025;
          gObj.leftPupil.position.set(-0.13 + pupOffsetX, 0.36, -0.34 + pupOffsetZ);
          gObj.rightPupil.position.set(0.13 + pupOffsetX, 0.36, -0.34 + pupOffsetZ);
        }
      }
    }

    // 4. Update fruit
    if (game.fruit && game.fruit.active) {
      if (!fruitMesh) fruitMesh = createFruitModel();
      fruitMesh.visible = true;
      fruitMesh.rotation.y += 0.03;
      fruitMesh.position.y = 0.45 + (reducedMotion ? 0 : Math.sin(time * 4) * 0.08);
    } else if (fruitMesh) {
      fruitMesh.visible = false;
    }

    // 5. Render 3D Scene
    renderer.render(scene, camera);

    // 6. Render Minimap / Radar
    renderMinimap(game);
  }

  function renderMinimap(game) {
    if (!miniCtx || !game.maze || !game.player) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const scaleX = w / game.maze.width;
    const scaleY = h / game.maze.height;

    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = 'rgba(16, 19, 16, 0.9)';
    miniCtx.fillRect(0, 0, w, h);

    // Draw walls
    miniCtx.fillStyle = '#8a9a3c';
    for (let y = 0; y < game.maze.height; y++) {
      for (let x = 0; x < game.maze.width; x++) {
        if (game.maze.tiles[y][x] === TILE_WALL) {
          miniCtx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
        }
      }
    }

    // Draw pellets
    miniCtx.fillStyle = 'rgba(255, 220, 100, 0.7)';
    for (let y = 0; y < game.maze.height; y++) {
      for (let x = 0; x < game.maze.width; x++) {
        const t = game.maze.tiles[y][x];
        if (t === TILE_PELLET) {
          miniCtx.fillRect((x + 0.35) * scaleX, (y + 0.35) * scaleY, scaleX * 0.3, scaleY * 0.3);
        } else if (t === TILE_POWER_PELLET) {
          miniCtx.fillStyle = '#ffffff';
          miniCtx.beginPath();
          miniCtx.arc((x + 0.5) * scaleX, (y + 0.5) * scaleY, scaleX * 0.55, 0, Math.PI * 2);
          miniCtx.fill();
          miniCtx.fillStyle = 'rgba(255, 220, 100, 0.7)';
        }
      }
    }

    // Draw ghosts
    if (game.ghosts) {
      for (const ghost of game.ghosts.list) {
        miniCtx.fillStyle = ghost.mode === GHOST_MODE_FRIGHTENED ? '#00e5ff' : ghost.color;
        miniCtx.beginPath();
        miniCtx.arc((ghost.x) * scaleX, (ghost.y) * scaleY, scaleX * 0.7, 0, Math.PI * 2);
        miniCtx.fill();
      }
    }

    // Draw Player dot and FOV vision cone
    const px = game.player.x * scaleX;
    const py = game.player.y * scaleY;

    miniCtx.fillStyle = '#ffff00';
    miniCtx.beginPath();
    miniCtx.arc(px, py, scaleX * 0.8, 0, Math.PI * 2);
    miniCtx.fill();

    // Vision cone
    const playerAngle = game.player.currentAngle;
    const fovAngle = (75 * Math.PI) / 180;
    const coneLength = 26;

    miniCtx.fillStyle = 'rgba(255, 255, 0, 0.18)';
    miniCtx.beginPath();
    miniCtx.moveTo(px, py);
    miniCtx.arc(px, py, coneLength, playerAngle - fovAngle / 2, playerAngle + fovAngle / 2);
    miniCtx.closePath();
    miniCtx.fill();
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fitFov(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    renderer,
    buildMaze,
    update,
    resize,
    setCameraMode: (m) => { currentCameraMode = m; },
    getCameraMode: () => currentCameraMode,
    setReducedMotion: (v) => { reducedMotion = Boolean(v); },
    getReducedMotion: () => reducedMotion
  };
}