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
  CAMERA_MODE_FIRST_PERSON,
  CAMERA_MODE_THIRD_PERSON,
  CAMERA_MODE_THIRD_PERSON_FRONT,
  cycleCameraMode,
  getCameraModeLabel,
  getWallClampedCameraPosition,
  stepSmoothCameraPosition
} from './camera.js';
import { resolveAvatarVisualLayout } from './client_adapter.js';

export function createRenderer(container, minimapCanvas) {
  // 1. Three.js Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x061025, 0.055);

  // Portrait phones are tall and narrow: a fixed 75-degree vertical FOV leaves only
  // ~38 degrees across, so a corridor reads as one flat wall. Widen the vertical FOV
  // on narrow screens to keep at least ~57 degrees of horizontal view.
  const fitFov = (aspect) => {
    const minHorizontal = 70 * Math.PI / 180;
    const needed = 2 * Math.atan(Math.tan(minHorizontal / 2) / Math.max(aspect, 0.1)) * 180 / Math.PI;
    return Math.min(100, Math.max(75, needed));
  };
  const camera = new THREE.PerspectiveCamera(fitFov(window.innerWidth / window.innerHeight), window.innerWidth / window.innerHeight, 0.08, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x061025);
  container.appendChild(renderer.domElement);

  // Lights: Hemisphere light + PointLight following local player
  const hemiLight = new THREE.HemisphereLight(0x3366cc, 0x0a1428, 1.5);
  scene.add(hemiLight);

  const playerLight = new THREE.PointLight(0xaaddff, 2.8, 14, 1.1);
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
  const playerMeshes = new Map(); // playerId => mesh data
  let fruitMesh = null;

  // Camera state
  let currentCameraMode = CAMERA_MODE_FIRST_PERSON;
  const currentCameraPos = new THREE.Vector3();
  const currentLookAt = new THREE.Vector3();
  let cameraInitialized = false;

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
  // Wall panels: a flat navy box reads as "nothing rendered" when the camera is
  // right up against a dead end (the old blank-screen bug). A panel texture with
  // seams plus a glowing eye-level rail keeps every wall face readable up close.
  function createWallPanelTextures() {
    const w = 128, h = 230; // 1.0 x 1.8 face aspect
    const base = document.createElement('canvas');
    base.width = w; base.height = h;
    const b = base.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#13306a');
    grad.addColorStop(0.55, '#0c224a');
    grad.addColorStop(1, '#081a3a');
    b.fillStyle = grad;
    b.fillRect(0, 0, w, h);
    b.strokeStyle = 'rgba(120, 190, 255, 0.35)';
    b.lineWidth = 3;
    b.strokeRect(1.5, 1.5, w - 3, h - 3);
    b.strokeStyle = 'rgba(120, 190, 255, 0.18)';
    b.lineWidth = 2;
    for (const y of [h * 0.22, h * 0.5]) { b.beginPath(); b.moveTo(6, y); b.lineTo(w - 6, y); b.stroke(); }

    const glow = document.createElement('canvas');
    glow.width = w; glow.height = h;
    const g = glow.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    // Eye-level neon rail (camera height 0.55 of 1.8 => ~69% down the texture)
    const railY = Math.round(h * (1 - 0.55 / 1.8));
    const rail = g.createLinearGradient(0, railY - 5, 0, railY + 5);
    rail.addColorStop(0, 'rgba(0,229,255,0)');
    rail.addColorStop(0.5, 'rgba(0,229,255,0.6)');
    rail.addColorStop(1, 'rgba(0,229,255,0)');
    g.fillStyle = rail;
    g.fillRect(0, railY - 5, w, 10);
    g.fillStyle = 'rgba(0,229,255,0.55)';
    g.fillRect(0, 0, 3, h);
    g.fillRect(w - 3, 0, 3, h);

    const map = new THREE.CanvasTexture(base);
    const emissiveMap = new THREE.CanvasTexture(glow);
    for (const t of [map, emissiveMap]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
    return { map, emissiveMap };
  }

  const wallTextures = createWallPanelTextures();
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallTextures.map,
    roughness: 0.45,
    metalness: 0.25,
    emissive: 0xffffff,
    emissiveMap: wallTextures.emissiveMap,
    emissiveIntensity: 0.55
  });

  const neonTrimMat = new THREE.MeshBasicMaterial({
    color: 0x00ffff
  });

  const doorMat = new THREE.MeshBasicMaterial({
    color: 0xff007f
  });

  const ceilingMat = new THREE.MeshStandardMaterial({
    color: 0x030712,
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
    while (mazeGroup.children.length > 0) {
      const obj = mazeGroup.children[0];
      mazeGroup.remove(obj);
    }
    pelletData.clear();
    powerPelletMeshes.clear();

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
          dummyObj.position.set(posX, 0.9, posZ);
          dummyObj.scale.set(1, 1, 1);
          dummyObj.updateMatrix();
          wallInstancedMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          dummyObj.position.set(posX, 1.77, posZ);
          dummyObj.updateMatrix();
          wallTopTrimMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          dummyObj.position.set(posX, 0.03, posZ);
          dummyObj.updateMatrix();
          wallBottomTrimMesh.setMatrixAt(wallIdx, dummyObj.matrix);

          wallIdx++;
        } else if (tile === TILE_GHOST_DOOR) {
          const door = new THREE.Mesh(new THREE.BoxGeometry(1, 0.4, 0.2), doorMat);
          door.position.set(posX, 0.6, posZ);
          mazeGroup.add(door);
        } else if (tile === TILE_PELLET) {
          dummyObj.position.set(posX, 0.45, posZ);
          dummyObj.scale.set(1, 1, 1);
          dummyObj.updateMatrix();
          pelletInstancedMesh.setMatrixAt(pelletIdx, dummyObj.matrix);

          const sprite = new THREE.Sprite(pelletSpriteMat);
          sprite.position.set(posX, 0.45, posZ);
          sprite.scale.set(0.3, 0.3, 1);
          mazeGroup.add(sprite);

          pelletData.set(`${x},${y}`, { index: pelletIdx, sprite, x: posX, z: posZ });
          pelletIdx++;
        } else if (tile === TILE_POWER_PELLET) {
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

    const skirtParts = [];
    for (let i = 0; i < 5; i++) {
      const skirt = new THREE.Mesh(skirtGeo, ghostMat);
      const angle = (i / 5) * Math.PI * 2;
      skirt.position.set(Math.cos(angle) * 0.25, 0.04, Math.sin(angle) * 0.25);
      skirt.rotation.x = Math.PI;
      group.add(skirt);
      skirtParts.push(skirt);
    }

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

  // Safe CanvasTexture text nametag (no HTML / innerHTML, not through walls)
  function createNametagTexture(name, colorStr) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = 'rgba(5, 12, 30, 0.85)';
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(8, 8, 240, 48, 8);
    } else {
      ctx.fillRect(8, 8, 240, 48);
    }
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = colorStr || '#00e5ff';
    ctx.stroke();
    ctx.font = 'bold 22px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colorStr || '#ffffff';
    const safeText = String(name || 'Player').slice(0, 20);
    ctx.fillText(safeText, 128, 32);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  // Creates 3D Chomping Pac-Man sphere model with eyes, aura, and shield
  function createPlayerModel(playerData) {
    const group = new THREE.Group();
    const baseColor = new THREE.Color(playerData.color || '#ffff00');

    const pacMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: 0.5,
      roughness: 0.25,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1.0
    });

    // Upper mouth hemisphere
    const upperGroup = new THREE.Group();
    const topGeo = new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const topMesh = new THREE.Mesh(topGeo, pacMat);
    const topDiskGeo = new THREE.CircleGeometry(0.35, 24);
    topDiskGeo.rotateX(Math.PI / 2);
    const topDisk = new THREE.Mesh(topDiskGeo, pacMat);
    upperGroup.add(topMesh, topDisk);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    leftEye.position.set(-0.16, 0.18, -0.22);
    const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
    rightEye.position.set(0.16, 0.18, -0.22);
    upperGroup.add(leftEye, rightEye);

    // Lower mouth hemisphere
    const lowerGroup = new THREE.Group();
    const botGeo = new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const botMesh = new THREE.Mesh(botGeo, pacMat);
    const botDiskGeo = new THREE.CircleGeometry(0.35, 24);
    botDiskGeo.rotateX(-Math.PI / 2);
    const botDisk = new THREE.Mesh(botDiskGeo, pacMat);
    lowerGroup.add(botMesh, botDisk);

    group.add(upperGroup, lowerGroup);

    // Soft supercharge aura pulsating on charged players
    const auraGeo = new THREE.SphereGeometry(0.48, 16, 16);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.visible = false;
    group.add(auraMesh);

    // Shield indication (spawn immunity)
    const shieldGeo = new THREE.SphereGeometry(0.50, 16, 16);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.visible = false;
    group.add(shieldMesh);

    // Nametag: depthTest: true guarantees NOT visible through walls
    const nametagMat = new THREE.SpriteMaterial({
      map: createNametagTexture(playerData.name, playerData.color),
      depthTest: true
    });
    const nametagSprite = new THREE.Sprite(nametagMat);
    nametagSprite.position.set(0, 0.75, 0);
    nametagSprite.scale.set(1.2, 0.3, 1);
    group.add(nametagSprite);

    scene.add(group);

    return {
      id: playerData.id,
      name: playerData.name,
      color: playerData.color,
      group,
      upperGroup,
      lowerGroup,
      pacMat,
      auraMesh,
      auraMat,
      shieldMesh,
      nametagSprite,
      nametagMat
    };
  }

  function update(game, time) {
    if (!game.maze || !game.player) return;

    // 1. Camera positioning with wall clamping and smooth lerping
    // Stopped at a wall (T-junction): step the eye further back so the junction,
    // floor and both openings are in view instead of one wall panel.
    const stopped = game.player.isMoving === false;
    const targetCam = getWallClampedCameraPosition(currentCameraMode, game.player, game.maze, { firstPersonPullback: stopped ? 0.62 : 0.32 });
    const targetPos = new THREE.Vector3(targetCam.x, targetCam.y, targetCam.z);
    const targetLook = new THREE.Vector3(targetCam.lookAt.x, targetCam.lookAt.y, targetCam.lookAt.z);

    // Gentle head bob when moving in first person
    if (currentCameraMode === CAMERA_MODE_FIRST_PERSON && game.player.isMoving) {
      targetPos.y += Math.sin(time * 12) * 0.025;
    }

    if (!cameraInitialized) {
      currentCameraPos.copy(targetPos);
      currentLookAt.copy(targetLook);
      cameraInitialized = true;
    } else {
      const safePos = stepSmoothCameraPosition(currentCameraPos, targetPos, game.maze, {
        lerpSpeed: 0.18,
        maxDistance: 2.0
      });
      if (safePos.snapped) {
        currentCameraPos.set(safePos.x, safePos.y, safePos.z);
        currentLookAt.copy(targetLook);
      } else {
        currentCameraPos.set(safePos.x, safePos.y, safePos.z);
        currentLookAt.lerp(targetLook, 0.18);
      }
    }

    camera.position.copy(currentCameraPos);
    camera.lookAt(currentLookAt);

    // Victim screen shake effect using local rotateZ only (never Euler z after lookAt)
    if (game.screenShake) {
      const shake = 0.08;
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      camera.rotateZ((Math.random() - 0.5) * shake * 0.5);
    }

    // Update player point light (illuminates surroundings)
    playerLight.position.set(game.player.x, 0.7, game.player.y);

    // 2. Animate and remove eaten pellets
    let pelletUpdated = false;
    for (const [coord, data] of pelletData) {
      const [x, y] = coord.split(',').map(Number);
      if (game.maze.tiles[y][x] !== TILE_PELLET) {
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
        const pulse = 1.0 + Math.sin(time * 8) * 0.28;
        pp.mesh.scale.set(pulse, pulse, pulse);
        pp.sprite.scale.set(0.85 * pulse, 0.85 * pulse, 1);
      }
    }

    // 3. Update player 3D models (Local + Remote Players)
    const activePlayerIds = new Set();
    const allPlayersList = [game.player, ...(game.players || [])];
    const avatarLayouts = resolveAvatarVisualLayout(allPlayersList, game.maze);

    for (const p of allPlayersList) {
      if (!p || !p.id) continue;
      activePlayerIds.add(p.id);

      let pModel = playerMeshes.get(p.id);
      if (!pModel) {
        pModel = createPlayerModel(p);
        playerMeshes.set(p.id, pModel);
      }

      const layout = avatarLayouts.get(p.id);

      // Hide avatars while respawning or if layout marked invisible
      if (!layout || !layout.visible || p.respawning) {
        pModel.group.visible = false;
        pModel.nametagSprite.visible = false;
        continue;
      }

      const isLocal = (p.id === game.player.id);

      // Visibility logic:
      // Local player: hidden in 1st person, shown in 3rd/front
      // Remote player: visible unless within 0.7 tiles of camera
      if (isLocal) {
        if (currentCameraMode === CAMERA_MODE_FIRST_PERSON) {
          pModel.group.visible = false;
        } else {
          const pacmanPos = new THREE.Vector3(layout.x, layout.y, layout.z);
          const camDist = camera.position.distanceTo(pacmanPos);
          if (camDist <= 0.35) {
            pModel.group.visible = false;
          } else {
            pModel.group.visible = true;
            const opacity = Math.min(1.0, Math.max(0.1, (camDist - 0.35) / 0.30));
            pModel.pacMat.opacity = opacity;
          }
        }
        pModel.nametagSprite.visible = false; // Don't block local 3rd-person view with own nametag
      } else {
        const distToCam = Math.hypot(layout.x - camera.position.x, layout.z - camera.position.z);
        if (distToCam < 0.7) {
          pModel.group.visible = false;
        } else {
          pModel.group.visible = true;
          pModel.nametagSprite.visible = true;
          const opacity = Math.min(1.0, Math.max(0.2, (distToCam - 0.7) / 0.5));
          pModel.pacMat.opacity = opacity;
        }
      }

      if (pModel.group.visible) {
        // Bobbing & visual layout positioning (applies corridor separation and scaling)
        const bob = p.isMoving ? Math.sin(time * 12 + p.slot * 2) * 0.025 : 0;
        pModel.group.position.set(layout.x, layout.y + bob, layout.z);
        pModel.group.scale.set(layout.scale, layout.scale, layout.scale);
        pModel.group.rotation.y = -p.currentAngle;

        // Distinct stacked nametag positioning to avoid text overlap / Z-fighting
        pModel.nametagSprite.position.set(0, layout.nametagOffsetY, 0);

        // Chomping mouth animation facing movement (mouth opens at front -Z right under eyes)
        const chomp = (Math.sin(time * 14 + p.slot) + 1) * 0.5;
        pModel.upperGroup.rotation.x = chomp * 0.42;
        pModel.lowerGroup.rotation.x = -chomp * 0.42;

        // Supercharge aura indication
        if (p.supercharged) {
          pModel.auraMesh.visible = true;
          const auraScale = 1.0 + Math.sin(time * 10) * 0.15;
          pModel.auraMesh.scale.set(auraScale, auraScale, auraScale);
          pModel.auraMat.opacity = 0.35 + Math.sin(time * 10) * 0.15;
        } else {
          pModel.auraMesh.visible = false;
        }

        // Shield indication
        if (p.shieldTimer > 0) {
          pModel.shieldMesh.visible = true;
          pModel.shieldMesh.rotation.y += 0.04;
        } else {
          pModel.shieldMesh.visible = false;
        }
      }
    }

    // Remove left players' meshes
    for (const [id, pModel] of playerMeshes.entries()) {
      if (!activePlayerIds.has(id)) {
        scene.remove(pModel.group);
        playerMeshes.delete(id);
      }
    }

    // 4. Update ghosts
    if (game.ghosts && game.ghosts.list) {
      for (let i = 0; i < game.ghosts.list.length; i++) {
        const ghost = game.ghosts.list[i];
        let gObj = ghostMeshes[ghost.name];
        if (!gObj) {
          gObj = createGhostModel(ghost);
          ghostMeshes[ghost.name] = gObj;
        }

        const ghostBob = Math.sin(time * 5 + i * 1.5) * 0.06;
        gObj.group.position.set(ghost.x, 0.42 + ghostBob, ghost.y);

        const distToCam = Math.hypot(ghost.x - camera.position.x, ghost.y - camera.position.z);
        if (distToCam < 0.7) {
          gObj.group.visible = false;
        } else {
          gObj.group.visible = true;
        }

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

        if (ghost.dir) {
          gObj.group.rotation.y = -ghost.dir.angle;
          const pupOffsetX = ghost.dir.dx * 0.025;
          const pupOffsetZ = ghost.dir.dy * 0.025;
          gObj.leftPupil.position.set(-0.13 + pupOffsetX, 0.36, -0.34 + pupOffsetZ);
          gObj.rightPupil.position.set(0.13 + pupOffsetX, 0.36, -0.34 + pupOffsetZ);
        }
      }
    }

    // 5. Update fruit
    if (game.fruit && game.fruit.active) {
      if (!fruitMesh) fruitMesh = createFruitModel();
      fruitMesh.visible = true;
      fruitMesh.rotation.y += 0.03;
      fruitMesh.position.y = 0.45 + Math.sin(time * 4) * 0.08;
    } else if (fruitMesh) {
      fruitMesh.visible = false;
    }

    // 6. Render 3D Scene
    renderer.render(scene, camera);

    // 7. Render Minimap / Radar
    renderMinimap(game);
  }

  function renderMinimap(game) {
    if (!miniCtx || !game.maze || !game.player) return;
    const w = minimapCanvas.width;
    const h = minimapCanvas.height;
    const scaleX = w / game.maze.width;
    const scaleY = h / game.maze.height;

    miniCtx.clearRect(0, 0, w, h);
    miniCtx.fillStyle = 'rgba(5, 8, 20, 0.85)';
    miniCtx.fillRect(0, 0, w, h);

    // Walls
    miniCtx.fillStyle = '#0055aa';
    for (let y = 0; y < game.maze.height; y++) {
      for (let x = 0; x < game.maze.width; x++) {
        if (game.maze.tiles[y][x] === TILE_WALL) {
          miniCtx.fillRect(x * scaleX, y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
        }
      }
    }

    // Pellets
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

    // Fruit
    if (game.fruit && game.fruit.active) {
      miniCtx.fillStyle = '#ff0055';
      miniCtx.beginPath();
      miniCtx.arc(game.fruit.x * scaleX, game.fruit.y * scaleY, scaleX * 0.6, 0, Math.PI * 2);
      miniCtx.fill();
    }

    // Ghosts
    if (game.ghosts && game.ghosts.list) {
      for (const ghost of game.ghosts.list) {
        miniCtx.fillStyle = ghost.mode === GHOST_MODE_FRIGHTENED ? '#00e5ff' : ghost.color;
        miniCtx.beginPath();
        miniCtx.arc(ghost.x * scaleX, ghost.y * scaleY, scaleX * 0.7, 0, Math.PI * 2);
        miniCtx.fill();
      }
    }

    // Remote & Local Players on Minimap via avatarLayouts
    const allPlayersMinimap = [game.player, ...(game.players || [])];
    const minimapLayouts = resolveAvatarVisualLayout(allPlayersMinimap, game.maze);

    for (const p of allPlayersMinimap) {
      if (!p || !p.id) continue;
      const layout = minimapLayouts.get(p.id);
      if (!layout || !layout.visible || p.respawning) continue;

      const px = p.x * scaleX;
      const py = p.y * scaleY;
      const isLocal = (p.id === game.player.id);
      const playerColor = p.color || (isLocal ? '#ffff00' : '#00e5ff');

      if (layout.minimap && layout.minimap.isOverlapping) {
        // Concentric colored rings for overlapping players
        if (layout.minimap.ringIndex === 0) {
          miniCtx.fillStyle = playerColor;
          miniCtx.beginPath();
          miniCtx.arc(px, py, scaleX * 0.55, 0, Math.PI * 2);
          miniCtx.fill();
        } else {
          miniCtx.strokeStyle = playerColor;
          miniCtx.lineWidth = 2.0;
          miniCtx.beginPath();
          miniCtx.arc(px, py, scaleX * (0.55 + layout.minimap.ringIndex * 0.35), 0, Math.PI * 2);
          miniCtx.stroke();
        }
      } else {
        miniCtx.fillStyle = playerColor;
        miniCtx.beginPath();
        miniCtx.arc(px, py, scaleX * (isLocal ? 0.85 : 0.75), 0, Math.PI * 2);
        miniCtx.fill();
      }

      // Small direction pointer
      if (typeof p.currentAngle === 'number') {
        miniCtx.strokeStyle = isLocal ? '#ffffaa' : '#ffffff';
        miniCtx.lineWidth = 1.5;
        miniCtx.beginPath();
        miniCtx.moveTo(px, py);
        miniCtx.lineTo(px + Math.sin(p.currentAngle) * 8, py - Math.cos(p.currentAngle) * 8);
        miniCtx.stroke();
      }
    }

    // Local Vision cone (if not respawning)
    if (!game.player.respawning && typeof game.player.currentAngle === 'number') {
      const px = game.player.x * scaleX;
      const py = game.player.y * scaleY;
      const playerAngle = game.player.currentAngle;
      const fovAngle = (75 * Math.PI) / 180;
      const coneLength = 26;
      miniCtx.fillStyle = 'rgba(255, 255, 0, 0.22)';
      miniCtx.beginPath();
      miniCtx.moveTo(px, py);
      miniCtx.arc(px, py, coneLength, playerAngle - fovAngle / 2, playerAngle + fovAngle / 2);
      miniCtx.closePath();
      miniCtx.fill();
    }
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fitFov(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  function countMeshes() {
    let total = 0;
    scene.traverse(() => { total++; });
    return {
      walls: wallInstancedMesh ? wallInstancedMesh.count : 0,
      pelletSprites: pelletData.size,
      powerPellets: powerPelletMeshes.size,
      ghosts: Object.keys(ghostMeshes).length,
      players: playerMeshes.size,
      totalNodes: total
    };
  }

  return {
    scene,
    camera,
    renderer,
    playerMeshes,
    ghostMeshes,
    buildMaze,
    update,
    resize,
    countMeshes,
    resetCamera: () => { cameraInitialized = false; },
    setCameraMode: (m) => {
      if (currentCameraMode !== m) {
        currentCameraMode = m;
        cameraInitialized = false;
      }
    },
    getCameraMode: () => currentCameraMode,
    cycleCamera: () => {
      currentCameraMode = cycleCameraMode(currentCameraMode);
      cameraInitialized = false;
      return currentCameraMode;
    }
  };
}
