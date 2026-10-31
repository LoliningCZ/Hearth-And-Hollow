
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --------------------------------------------------
// HEARTH & HOLLOW — WORLD GENERATOR v0.1
// --------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9b9b0');
scene.fog = new THREE.Fog('#a9b9b0', 30, 68);

const camera = new THREE.PerspectiveCamera(
  42,
  window.innerWidth / window.innerHeight,
  0.1,
  150
);
camera.position.set(23, 27, 25);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 12;
controls.maxDistance = 55;
controls.maxPolarAngle = Math.PI * 0.43;
controls.minPolarAngle = 0.25;

// --------------------------------------------------
// LIGHTING
// --------------------------------------------------

scene.add(new THREE.HemisphereLight('#e2eadb', '#635747', 2));

const sunlight = new THREE.DirectionalLight('#ffe3b0', 3);
sunlight.position.set(-15, 25, 12);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.left = -32;
sunlight.shadow.camera.right = 32;
sunlight.shadow.camera.top = 32;
sunlight.shadow.camera.bottom = -32;
sunlight.shadow.normalBias = 0.04;
scene.add(sunlight);

// --------------------------------------------------
// REPEATABLE RANDOM GENERATOR
// Same seed = same world every time.
// --------------------------------------------------

let seed = 481516;

function random() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function randomRange(min, max) {
  return min + random() * (max - min);
}

// --------------------------------------------------
// MATERIALS AND REUSABLE BLOCK GEOMETRIES
// --------------------------------------------------

const materials = new Map();
const geometries = new Map();

function material(color, extra = {}) {
  const key = color + JSON.stringify(extra);

  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshStandardMaterial({
        color,
        roughness: 1,
        flatShading: true,
        ...extra,
      })
    );
  }

  return materials.get(key);
}

function blockGeometry(w, h, d) {
  const key = `${w},${h},${d}`;

  if (!geometries.has(key)) {
    geometries.set(
      key,
      new THREE.BoxGeometry(w, h, d)
    );
  }

  return geometries.get(key);
}

function block(
  x, y, z,
  w, h, d,
  color,
  options = {}
) {
  const mesh = new THREE.Mesh(
    blockGeometry(w, h, d),
    material(color, options.material || {})
  );

  mesh.position.set(x, y, z);
  mesh.rotation.y = options.rotationY || 0;
  mesh.rotation.z = options.rotationZ || 0;
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

// --------------------------------------------------
// TERRAIN
// --------------------------------------------------

const WORLD_SIZE = 48;
const HALF = WORLD_SIZE / 2;

function heightAt(x, z) {
  return (
    0.16 +
    Math.sin(x * 0.28) * 0.12 +
    Math.cos(z * 0.24) * 0.10 +
    Math.sin((x + z) * 0.18) * 0.07
  );
}

// A winding path runs through the forest.
function pathX(z) {
  return -4 + Math.sin(z * 0.12) * 4;
}

function distanceToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;

  const t = lengthSq === 0
    ? 0
    : THREE.MathUtils.clamp(
        ((px - ax) * dx + (pz - az) * dz) / lengthSq,
        0,
        1
      );

  const x = ax + t * dx;
  const z = az + t * dz;

  return Math.hypot(px - x, pz - z);
}

function onPath(x, z) {
  // Main road
  if (Math.abs(x - pathX(z)) < 1.05) return true;

  // A short branch leads to the cottage.
  return distanceToSegment(x, z, -5, 2, pathX(2), 2) < 0.8;
}

const groundGeometry = new THREE.BoxGeometry(1, 0.2, 1);
const groundMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  flatShading: true,
});

const ground = new THREE.InstancedMesh(
  groundGeometry,
  groundMaterial,
  WORLD_SIZE * WORLD_SIZE
);

ground.receiveShadow = true;

const dummy = new THREE.Object3D();
const tileColor = new THREE.Color();
let tileIndex = 0;

const pondX = 11;
const pondZ = -7;

function pondDistance(x, z) {
  return Math.sqrt(
    ((x - pondX) / 4.4) ** 2 +
    ((z - pondZ) / 3.1) ** 2
  );
}

for (let ix = 0; ix < WORLD_SIZE; ix++) {
  for (let iz = 0; iz < WORLD_SIZE; iz++) {
    const x = ix - HALF + 0.5;
    const z = iz - HALF + 0.5;
    const h = heightAt(x, z);

    dummy.position.set(x, h - 0.1, z);
    dummy.updateMatrix();

    ground.setMatrixAt(tileIndex, dummy.matrix);

    const pondDist = pondDistance(x, z);
    const path = onPath(x, z);

    let color;

    if (pondDist < 1.35 && pondDist > 1.0) {
      color = random() > 0.5 ? '#b4a47c' : '#a99a72';
    } else if (path) {
      color = random() > 0.45 ? '#a38b66' : '#957d5b';
    } else {
      const colors = [
        '#536f45',
        '#5e7849',
        '#667f4e',
        '#587447',
        '#718652',
        '#4e6943',
      ];
      color = colors[Math.floor(random() * colors.length)];
    }

    tileColor.set(color);
    ground.setColorAt(tileIndex, tileColor);
    tileIndex++;
  }
}

ground.instanceMatrix.needsUpdate = true;
ground.instanceColor.needsUpdate = true;
scene.add(ground);

// --------------------------------------------------
// POND
// --------------------------------------------------

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(8.1, 5.7),
  material('#527e82', {
    roughness: 0.3,
    metalness: 0.1,
  })
);

water.rotation.x = -Math.PI / 2;
water.position.set(pondX, 0.30, pondZ);
water.receiveShadow = true;
scene.add(water);

// Little stones around the water.
for (let i = 0; i < 24; i++) {
  const angle = random() * Math.PI * 2;
  const radius = randomRange(3.7, 5.0);

  const x = pondX + Math.cos(angle) * radius;
  const z = pondZ + Math.sin(angle) * radius * 0.72;

  block(
    x,
    heightAt(x, z) + 0.12,
    z,
    randomRange(0.25, 0.55),
    randomRange(0.18, 0.38),
    randomRange(0.25, 0.5),
    random() > 0.5 ? '#827e70' : '#9d967e'
  );
}

// --------------------------------------------------
// TREES
// --------------------------------------------------

function createTree(x, z) {
  const base = heightAt(x, z);
  const pine = random() > 0.52;
  const scale = randomRange(0.8, 1.3);

  // Trunk
  block(
    x, base + 0.65 * scale, z,
    0.36 * scale,
    1.3 * scale,
    0.36 * scale,
    '#735035'
  );

  if (pine) {
    // Layered, voxel-like pine tree.
    const greens = ['#294b37', '#35593c', '#416642'];

    for (let layer = 0; layer < 3; layer++) {
      const size = (1.8 - layer * 0.42) * scale;
      const y = base + (1.25 + layer * 0.72) * scale;

      block(
        x, y, z,
        size, 1.05 * scale, size,
        greens[layer]
      );
    }
  } else {
    // Chunky broadleaf canopy.
    block(
      x, base + 1.75 * scale, z,
      1.8 * scale, 1.35 * scale, 1.8 * scale,
      random() > 0.5 ? '#416441' : '#4d7045'
    );

    block(
      x - 0.45 * scale,
      base + 2.15 * scale,
      z + 0.2 * scale,
      0.95 * scale, 0.95 * scale, 0.95 * scale,
      '#59784a'
    );

    block(
      x + 0.4 * scale,
      base + 2.05 * scale,
      z - 0.35 * scale,
      1.0 * scale, 1.0 * scale, 1.0 * scale,
      '#365a3b'
    );
  }
}

function nearImportantArea(x, z) {
  // Keep the house and farm clearing open.
  if (Math.hypot(x + 5, z - 2) < 5.0) return true;
  if (Math.hypot(x + 8, z - 6) < 4.2) return true;

  // Leave a clear area around the pond.
  if (pondDistance(x, z) < 1.7) return true;

  // Keep the path readable.
  if (onPath(x, z)) return true;

  return false;
}

for (let i = 0; i < 185; i++) {
  const x = randomRange(-HALF + 1, HALF - 1);
  const z = randomRange(-HALF + 1, HALF - 1);

  if (!nearImportantArea(x, z)) {
    createTree(x, z);
  }
}

// --------------------------------------------------
// BUSHES AND ROCKS
// --------------------------------------------------

for (let i = 0; i < 75; i++) {
  const x = randomRange(-HALF + 1, HALF - 1);
  const z = randomRange(-HALF + 1, HALF - 1);

  if (nearImportantArea(x, z)) continue;

  const base = heightAt(x, z);
  const size = randomRange(0.35, 0.75);

  if (random() > 0.3) {
    block(
      x, base + size * 0.35, z,
      size, size * 0.7, size,
      random() > 0.5 ? '#526f3d' : '#687c46'
    );

    // Occasional berries.
    if (random() > 0.65) {
      block(
        x + 0.15, base + size * 0.6, z + 0.1,
        0.12, 0.12, 0.12,
        '#8f4140',
        { castShadow: false }
      );
    }
  } else {
    block(
      x, base + size * 0.25, z,
      size, size * 0.5, size * 0.8,
      random() > 0.5 ? '#777a70' : '#8d8b7e'
    );
  }
}

// --------------------------------------------------
// MEDIEVAL COTTAGE
// --------------------------------------------------

const houseX = -5;
const houseZ = 2;
const houseY = heightAt(houseX, houseZ);

// Stone foundation.
block(
  houseX, houseY + 0.18, houseZ,
  4.0, 0.36, 3.5, '#77766a'
);

// Timber walls.
block(
  houseX, houseY + 1.35, houseZ,
  3.5, 2.0, 3.0, '#b49a70'
);

// Dark timber frame.
for (const xOffset of [-1.55, 0, 1.55]) {
  block(
    houseX + xOffset, houseY + 1.35, houseZ + 1.53,
    0.16, 2.0, 0.13, '#543b2b'
  );
}

block(
  houseX, houseY + 2.3, houseZ + 1.54,
  3.3, 0.15, 0.13, '#543b2b'
);

// Gabled roof made from two chunky roof slabs.
block(
  houseX - 0.83, houseY + 2.45, houseZ,
  2.35, 0.28, 3.8, '#704631',
  { rotationZ: -0.48 }
);

block(
  houseX + 0.83, houseY + 2.45, houseZ,
  2.35, 0.28, 3.8, '#855338',
  { rotationZ: 0.48 }
);

// Roof ridge.
block(
  houseX, houseY + 3.0, houseZ,
  0.22, 0.22, 3.95, '#51382b'
);

// Door.
block(
  houseX, houseY + 0.82, houseZ + 1.57,
  0.8, 1.45, 0.13, '#493326'
);

// Small warm windows.
for (const offset of [-1.0, 1.0]) {
  block(
    houseX + offset,
    houseY + 1.45,
    houseZ + 1.6,
    0.42, 0.48, 0.12, '#d8a45b',
    {
      material: {
        emissive: '#c47b32',
        emissiveIntensity: 0.7,
      },
    }
  );
}

// Chimney.
block(
  houseX + 1.0, houseY + 3.05, houseZ - 0.7,
  0.48, 1.0, 0.48, '#777166'
);

// --------------------------------------------------
// SMALL FARM PLOT
// --------------------------------------------------

const farmX = -8;
const farmZ = 6;
const farmY = heightAt(farmX, farmZ);

// Dark soil beds.
for (let row = 0; row < 3; row++) {
  const z = farmZ + (row - 1) * 1.0;

  block(
    farmX, farmY + 0.08, z,
    4.0, 0.12, 0.78, '#614b35',
    { castShadow: false }
  );

  // Young crops, planted in rows.
  for (let col = 0; col < 7; col++) {
    const x = farmX - 1.55 + col * 0.52;

    block(
      x,
      farmY + 0.30,
      z,
      0.16, 0.42, 0.16,
      row === 1 ? '#82964d' : '#648447',
      { castShadow: false }
    );
  }
}

// Wooden fence around the farm.
for (let i = 0; i < 7; i++) {
  const x = farmX - 2.25 + i * 0.75;

  for (const z of [farmZ - 1.85, farmZ + 1.85]) {
    block(
      x, farmY + 0.45, z,
      0.12, 0.9, 0.12, '#78573a'
    );
  }
}

for (let i = 0; i < 5; i++) {
  const z = farmZ - 1.5 + i * 0.75;

  for (const x of [farmX - 2.25, farmX + 2.25]) {
    block(
      x, farmY + 0.45, z,
      0.12, 0.9, 0.12, '#78573a'
    );
  }
}

// Fence rails.
for (const z of [farmZ - 1.85, farmZ + 1.85]) {
  block(
    farmX, farmY + 0.45, z,
    4.5, 0.12, 0.12, '#99734c'
  );
  block(
    farmX, farmY + 0.78, z,
    4.5, 0.12, 0.12, '#99734c'
  );
}

for (const x of [farmX - 2.25, farmX + 2.25]) {
  block(
    x, farmY + 0.45, farmZ,
    0.12, 0.12, 3.7, '#99734c'
  );
  block(
    x, farmY + 0.78, farmZ,
    0.12, 0.12, 3.7, '#99734c'
  );
}

// --------------------------------------------------
// CAMPFIRE
// --------------------------------------------------

const fireX = -1;
const fireZ = 3;
const fireY = heightAt(fireX, fireZ);

block(fireX - 0.25, fireY + 0.08, fireZ, 0.9, 0.16, 0.18, '#665342');
block(fireX + 0.25, fireY + 0.08, fireZ, 0.9, 0.16, 0.18, '#665342', {
  rotationY: Math.PI / 2,
});

// Stylized fire.
block(
  fireX, fireY + 0.36, fireZ,
  0.25, 0.55, 0.25, '#d86c32',
  { rotationZ: 0.15 }
);

block(
  fireX, fireY + 0.33, fireZ,
  0.15, 0.38, 0.15, '#f2bd56'
);

const fireLight = new THREE.PointLight('#ff9b4a', 9, 12);
fireLight.position.set(fireX, fireY + 1.1, fireZ);
scene.add(fireLight);

// --------------------------------------------------
// ATMOSPHERE: GRASS TUFTS
// --------------------------------------------------

for (let i = 0; i < 260; i++) {
  const x = randomRange(-HALF + 1, HALF - 1);
  const z = randomRange(-HALF + 1, HALF - 1);

  if (nearImportantArea(x, z)) continue;
  if (pondDistance(x, z) < 1.5) continue;

  const base = heightAt(x, z);

  block(
    x, base + 0.12, z,
    0.09, 0.24, 0.09,
    random() > 0.5 ? '#91a05b' : '#788d4e',
    { castShadow: false }
  );
}

// --------------------------------------------------
// SIMPLE HUD
// --------------------------------------------------

const hud = document.createElement('div');
hud.className = 'game-hud';
hud.innerHTML = `
  <div class="game-title">HEARTH <span>&</span> HOLLOW</div>
  <div class="game-subtitle">THE FRONTIER · EARLY PROTOTYPE</div>
  <div class="game-controls">
    <span>DRAG</span> Rotate view
    <span>SCROLL</span> Zoom
    <span>SHIFT + DRAG</span> Pan
  </div>
  <div class="game-version">WORLD GENERATION v0.1</div>
`;
document.body.appendChild(hud);

// --------------------------------------------------
// RESIZE + RENDER
// --------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});