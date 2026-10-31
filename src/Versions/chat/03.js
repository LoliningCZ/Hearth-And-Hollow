
import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==================================================
// HEARTH & HOLLOW — WORLD GENERATOR 0.2
// Rolling hills, green grass, rivers, pixel textures,
// medieval cottage, and a proper campfire.
// ==================================================

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c0bd');
scene.fog = new THREE.FogExp2('#a9c0bd', 0.008);

const camera = new THREE.PerspectiveCamera(
  42, innerWidth / innerHeight, 0.1, 250
);
camera.position.set(27, 30, 31);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 10;
controls.maxDistance = 85;
controls.maxPolarAngle = Math.PI * 0.44;

// ==================================================
// LIGHTING
// ==================================================

scene.add(new THREE.HemisphereLight('#e2eddb', '#596044', 2.1));

const sun = new THREE.DirectionalLight('#ffe2ad', 3.2);
sun.position.set(-30, 45, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -48;
sun.shadow.camera.right = 48;
sun.shadow.camera.top = 48;
sun.shadow.camera.bottom = -48;
sun.shadow.normalBias = 0.035;
scene.add(sun);

// ==================================================
// SEEDED RANDOMNESS
// ==================================================

let seed = 481516;

function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

function range(a, b) {
  return a + rand() * (b - a);
}

// ==================================================
// PROCEDURAL PIXEL TEXTURES
// Tiny canvases create deliberately chunky textures.
// ==================================================

function pixelTexture(colors, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * size * 0.8; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const s = rand() > 0.8 ? 2 : 1;
    ctx.fillRect(
      Math.floor(rand() * size),
      Math.floor(rand() * size),
      s, s
    );
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  return texture;
}

const textureSets = {
grass: [
  '#527640',
  '#5f8345',
  '#6d904b',
  '#456a38',
  '#789653',
  '#557a3f',
],
  dirt: ['#72553b', '#816342', '#96754e', '#654b34', '#a18155'],
  wood: ['#563a28', '#68462d', '#805438', '#936542'],
  roof: ['#87462f', '#9d5035', '#b3623d', '#753c2d'],
  stone: ['#77796e', '#88887b', '#62675e', '#9b9786'],
  leaves: ['#345b38', '#426a3d', '#507642', '#294c34'],
  sand: [
  '#c8b581',
  '#d6c394',
  '#b7a073',
  '#e0cf9e',
],
  water: ['#467e87', '#508b91', '#60979a', '#3c6e7b'],
  wall: ['#b39a70', '#c7ae80', '#a48a61', '#d2b88b'],
};

const textureCache = new Map();

function getTexture(name) {
  if (!textureCache.has(name)) {
    textureCache.set(
      name,
      pixelTexture(textureSets[name] || [name])
    );
  }
  return textureCache.get(name);
}

const materialCache = new Map();

function mat(name, options = {}) {
  const key = name + JSON.stringify(options);
  if (!materialCache.has(key)) {
    const isTexture = textureSets[name] !== undefined;
    materialCache.set(key, new THREE.MeshStandardMaterial({
      color: isTexture ? '#ffffff' : name,
      map: isTexture ? getTexture(name) : null,
      roughness: 1,
      flatShading: true,
      ...options,
    }));
  }
  return materialCache.get(key);
}

const geometryCache = new Map();

function boxGeometry(w, h, d) {
  const key = `${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}`;
  if (!geometryCache.has(key)) {
    geometryCache.set(key, new THREE.BoxGeometry(w, h, d));
  }
  return geometryCache.get(key);
}

function block(x, y, z, w, h, d, color, opts = {}) {
  const mesh = new THREE.Mesh(
    boxGeometry(w, h, d),
    mat(color, opts.material || {})
  );
  mesh.position.set(x, y, z);
  mesh.rotation.set(
    opts.rx || 0,
    opts.ry || 0,
    opts.rz || 0
  );
  mesh.castShadow = opts.castShadow ?? true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ==================================================
// WORLD SHAPE
// ==================================================

const WORLD_SIZE = 80;
const HALF = WORLD_SIZE / 2;

const houseX = -7;
const houseZ = 1;
const farmX = -10;
const farmZ = 6;

const pondX = 15;
const pondZ = -12;

// A winding river crossing the wilderness.
function riverX(z) {
  return 12 + Math.sin(z * 0.105) * 5
    + Math.sin(z * 0.22) * 1.5;
}

function riverDistance(x, z) {
  return Math.abs(x - riverX(z));
}

function riverWidth(z) {
  return 1.7 + Math.sin(z * 0.17) * 0.25;
}

function pondDistance(x, z) {
  return Math.sqrt(
    ((x - pondX) / 4.8) ** 2 +
    ((z - pondZ) / 3.5) ** 2
  );
}

function heightAt(x, z) {
  // Gentle, overlapping hills.
  let h =
    0.22 +
    Math.sin(x * 0.115) * 0.65 +
    Math.cos(z * 0.14) * 0.48 +
    Math.sin((x + z) * 0.085) * 0.4 +
    Math.cos((x - z) * 0.06) * 0.35;

  // Soften the terrain around the homestead.
  const homeDist = Math.hypot(x - houseX, z - houseZ);
  const flatten = THREE.MathUtils.clamp(
    (homeDist - 3) / 9, 0, 1
  );
  h *= flatten;

  // Flatten the riverbed below its banks.
  const rd = riverDistance(x, z);
  if (rd < riverWidth(z) + 1.5) {
    const blend = THREE.MathUtils.clamp(
      (rd - riverWidth(z)) / 1.5, 0, 1
    );
    h = THREE.MathUtils.lerp(-0.13, h, blend);
  }

  if (pondDistance(x, z) < 1.45) {
    h = THREE.MathUtils.lerp(
      -0.12, h,
      THREE.MathUtils.clamp((pondDistance(x, z) - 1) * 2, 0, 1)
    );
  }

  return h;
}

function onPath(x, z) {
  return Math.abs(x - (-4 + Math.sin(z * 0.12) * 4)) < 1.0;
}

function nearHome(x, z) {
  return Math.hypot(x - houseX, z - houseZ) < 5.8 ||
    Math.hypot(x - farmX, z - farmZ) < 4.5 ||
    onPath(x, z);
}

// ==================================================
// TERRAIN: GREEN, VARIED, AND MUCH LARGER
// ==================================================

const groundGeometry = new THREE.BoxGeometry(1, 1, 1);
const groundMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 1,
  flatShading: true,
  color: '#ffffff',
});

const tileCount = WORLD_SIZE * WORLD_SIZE;
const ground = new THREE.InstancedMesh(
  groundGeometry, groundMaterial, tileCount
);

const dummy = new THREE.Object3D();
const color = new THREE.Color();
let index = 0;

const grassColors = [
  '#648b48',
  '#709650',
  '#5b8043',
  '#789b53',
  '#547842',
  '#83a45b',
  '#69894a',
];

for (let ix = 0; ix < WORLD_SIZE; ix++) {
  for (let iz = 0; iz < WORLD_SIZE; iz++) {
    const x = ix - HALF + 0.5;
    const z = iz - HALF + 0.5;
    const h = heightAt(x, z);
    const rd = riverDistance(x, z);
    const pd = pondDistance(x, z);

    const isWater =
      rd < riverWidth(z) * 0.72 || pd < 1.0;
    const isBank =
      (rd < riverWidth(z) + 1.0 && !isWater) ||
      (pd < 1.4 && !isWater);
    const isPath = onPath(x, z);

    // Tiles follow the hills instead of forming a flat plane.
    const tileHeight = isWater ? 0.2 : 0.32;
    const tileY = isWater ? 0.015 : h - tileHeight / 2;

    dummy.position.set(x, tileY, z);
    dummy.scale.set(1, tileHeight, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    ground.setMatrixAt(index, dummy.matrix);

    let hex;

    if (isWater) {
  hex = '#ffffff';
} else if (isBank) {
  hex = '#b8a174';
} else if (isPath) {
  hex = '#876744';
} else {
  hex = grassColors[
    Math.floor(rand() * grassColors.length)
  ];
}

    // Texture provides detail; instance color varies the terrain.
    color.set(hex);
    ground.setColorAt(index, color);
    index++;
  }
}

ground.instanceMatrix.needsUpdate = true;
ground.instanceColor.needsUpdate = true;
ground.receiveShadow = true;
scene.add(ground);

// Additional earthy path and bank tiles make transitions visible.
for (let i = 0; i < 500; i++) {
  const x = range(-HALF, HALF);
  const z = range(-HALF, HALF);
  const rd = riverDistance(x, z);
  const pd = pondDistance(x, z);
  const pathXHere = -4 + Math.sin(z * 0.12) * 4;

  const isBank =
    (rd > riverWidth(z) * 0.7 &&
      rd < riverWidth(z) + 1.1) ||
    (pd > 1 && pd < 1.5);

  const isPath = Math.abs(x - pathXHere) < 0.9;

  if (!isBank && !isPath) continue;
  if (Math.hypot(x - houseX, z - houseZ) < 2.8) continue;

  block(
    x, heightAt(x, z) + 0.015, z,
    range(0.25, 0.8), 0.025, range(0.25, 0.8),
    isPath ? 'dirt' : 'sand',
    { castShadow: false }
  );
}

// ==================================================
// WATER SURFACES
// ==================================================

function makeWater(x, z, w, d) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    mat('water', {
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.12, z);
  scene.add(mesh);
  return mesh;
}

// Pond
makeWater(pondX, pondZ, 9.2, 6.5);

// Continuous winding river with overlapping water segments.
for (let z = -HALF; z < HALF; z += 0.35) {
  const x = riverX(z);

  const nextX = riverX(z + 0.35);
  const angle = Math.atan2(nextX - x, 0.35);

  const water = makeWater(
    (x + nextX) / 2,
    z + 0.175,
    riverWidth(z) * 1.7,
    0.85
  );

  water.rotation.z = angle;
}

// Sandy riverbanks: broad, visible strips on both sides.
for (let z = -HALF; z < HALF; z += 0.65) {
  const x = riverX(z);
  const width = riverWidth(z);

  for (const side of [-1, 1]) {
    const bx = x + side * (width + 0.65);

    const sand = block(
      bx,
      heightAt(bx, z) + 0.025,
      z,
      1.15,
      0.045,
      0.85,
      'sand',
      { castShadow: false }
    );

    sand.rotation.y = Math.atan2(
      riverX(z + 0.5) - x,
      0.5
    );
  }
}

// ==================================================
// TREES
// ==================================================

function createTree(x, z) {
  const base = heightAt(x, z);
  const scale = range(0.8, 1.45);
  const pine = rand() > 0.45;

  block(
    x, base + 0.68 * scale, z,
    0.38 * scale, 1.36 * scale, 0.38 * scale,
    'wood'
  );

  if (pine) {
    for (let layer = 0; layer < 4; layer++) {
      const s = (2.0 - layer * 0.39) * scale;

      block(
        x, base + (1.2 + layer * 0.68) * scale, z,
        s, 1.05 * scale, s,
        'leaves'
      );
    }
  } else {
    block(
      x, base + 1.85 * scale, z,
      1.9 * scale, 1.45 * scale, 1.8 * scale,
      'leaves'
    );

    block(
      x - 0.5 * scale, base + 2.1 * scale,
      z + 0.2 * scale,
      0.95 * scale, 1.0 * scale, 1.0 * scale,
      'leaves'
    );

    block(
      x + 0.45 * scale, base + 2.2 * scale,
      z - 0.3 * scale,
      1.0 * scale, 0.9 * scale, 1.0 * scale,
      'leaves'
    );

    // Little color variations in the canopy.
    block(
  x + 0.15 * scale,
  base + 2.65 * scale,
  z + 0.15 * scale,
  0.7 * scale,
  0.55 * scale,
  0.7 * scale,
  'leaves'
);
  }
}

for (let i = 0; i < 340; i++) {
  const x = range(-HALF + 2, HALF - 2);
  const z = range(-HALF + 2, HALF - 2);

  if (nearHome(x, z)) continue;
  if (riverDistance(x, z) < riverWidth(z) + 2) continue;
  if (pondDistance(x, z) < 1.8) continue;

  createTree(x, z);
}

// ==================================================
// ROCKS
// ==================================================

for (let i = 0; i < 160; i++) {
  const x = range(-HALF + 1, HALF - 1);
  const z = range(-HALF + 1, HALF - 1);

  if (nearHome(x, z)) continue;
  if (riverDistance(x, z) < riverWidth(z) + 1.5) continue;

  const s = range(0.25, 0.85);

  block(
    x, heightAt(x, z) + s * 0.25, z,
    s, s * range(0.6, 1.1), s * range(0.7, 1.2),
    'stone'
  );
}

// River stones
for (let i = 0; i < 100; i++) {
  const z = range(-HALF, HALF);
  const side = rand() > 0.5 ? 1 : -1;
  const x = riverX(z) +
    side * range(riverWidth(z) * 0.7, riverWidth(z) + 1.5);

  const s = range(0.2, 0.5);

  block(
    x, 0.12, z,
    s, s * 0.65, s,
    'stone'
  );
}

// ==================================================
// BUSHES, FLOWERS, AND FALLEN LEAVES
// ==================================================

const flowerColors = [
  '#e4bf65', '#c96c62', '#d8d4b2', '#a99acb'
];

for (let i = 0; i < 300; i++) {
  const x = range(-HALF + 1, HALF - 1);
  const z = range(-HALF + 1, HALF - 1);

  if (nearHome(x, z)) continue;
  if (riverDistance(x, z) < riverWidth(z) + 1.5) continue;
  if (pondDistance(x, z) < 1.5) continue;

  const y = heightAt(x, z);

  if (rand() > 0.65) {
    // Tiny pixel flowers with a green stem.
    block(
      x, y + 0.16, z,
      0.07, 0.3, 0.07,
      '#628348',
      { castShadow: false }
    );

    block(
      x, y + 0.32, z,
      0.17, 0.13, 0.17,
      flowerColors[Math.floor(rand() * flowerColors.length)],
      { castShadow: false }
    );
  } else {
    // Low bush.
    block(
      x, y + 0.18, z,
      range(0.25, 0.5), 0.35, range(0.25, 0.5),
      'leaves',
      { castShadow: false }
    );
  }
}

// Fallen leaves are small, flat colored fragments.
for (let i = 0; i < 430; i++) {
  const x = range(-HALF + 1, HALF - 1);
  const z = range(-HALF + 1, HALF - 1);

  if (nearHome(x, z)) continue;
  if (riverDistance(x, z) < riverWidth(z) + 1.5) continue;
  if (pondDistance(x, z) < 1.4) continue;

  const y = heightAt(x, z) + 0.025;
  const leafColors = ['#9c8955', '#777d46', '#b08a51', '#697b47'];

  block(
    x, y, z,
    range(0.08, 0.18), 0.025, range(0.1, 0.2),
    leafColors[Math.floor(rand() * leafColors.length)],
    {
      castShadow: false,
      ry: rand() * Math.PI,
    }
  );
}

// ==================================================
// COTTAGE: STONE BASE AND PIXELATED TIMBER WALLS
// ==================================================

const houseY = heightAt(houseX, houseZ);

// Foundation
block(
  houseX, houseY + 0.18, houseZ,
  4.1, 0.36, 3.6, 'stone'
);

// Walls
// Build the front wall around two real window openings.
// The center of the wall remains solid.
const frontZ = houseZ + 1.575;

// Lower wall beneath both windows.
block(
  houseX,
  houseY + 0.57,
  frontZ,
  3.65, 0.44, 0.12,
  'wall'
);

// Upper wall above the windows.
block(
  houseX,
  houseY + 2.05,
  frontZ,
  3.65, 0.60, 0.12,
  'wall'
);

// Left and right wall sections.
for (const side of [-1, 1]) {
  block(
    houseX + side * 1.45,
    houseY + 1.35,
    frontZ,
    0.75, 1.12, 0.12,
    'wall'
  );
}

// Interior darkness, visible through the openings.
block(
  houseX,
  houseY + 1.35,
  houseZ + 1.20,
  3.25, 1.85, 0.10,
  '#352c25',
  { castShadow: false }
);

// Front timber framing
for (const offset of [-1.65, 0, 1.65]) {
  block(
    houseX + offset, houseY + 1.35, houseZ + 1.6,
    0.16, 2.0, 0.13, 'wood'
  );
}

block(
  houseX, houseY + 2.32, houseZ + 1.62,
  3.45, 0.16, 0.13, 'wood'
);

// GABLED ROOF
// Each half slopes from the ridge down to the outer wall.
// The slabs are rotated in opposite directions.

const roofMat = mat('roof');
const roofThickness = 0.28;
const roofWidth = 2.35;
const roofDepth = 3.9;
const roofAngle = 0.48;

function roofPanel(x, rotationZ) {
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(roofWidth, roofThickness, roofDepth),
    roofMat
  );

  panel.position.set(
    x,
    houseY + 2.62,
    houseZ
  );
  panel.rotation.z = rotationZ;
  panel.castShadow = true;
  panel.receiveShadow = true;
  scene.add(panel);
}

// Both roof halves slope DOWN from the central ridge.
roofPanel(houseX - 0.8, roofAngle);
roofPanel(houseX + 0.8, -roofAngle);

// Ridge beam
block(
  houseX, houseY + 3.15, houseZ,
  0.2, 0.2, 4.0, 'wood'
);

// Door
block(
  houseX, houseY + 0.82, houseZ + 1.62,
  0.78, 1.42, 0.13, '#493326'
);

// Windows
// Window frames and dark, see-through openings.
for (const offset of [-1.0, 1.0]) {
  const wx = houseX + offset;
  const wy = houseY + 1.48;
  const wz = houseZ + 1.67;

  // Dark interior behind the opening.
  block(
    wx, wy, wz - 0.18,
    0.34, 0.39, 0.025,
    '#302c26',
    { castShadow: false }
  );

  // Wooden frame.
  for (const dx of [-0.22, 0.22]) {
    block(
      wx + dx, wy, wz,
      0.055, 0.52, 0.10,
      'wood'
    );
  }

  for (const dy of [-0.25, 0.25]) {
    block(
      wx, wy + dy, wz,
      0.48, 0.055, 0.10,
      'wood'
    );
  }

  // Crossbar.
  block(
    wx, wy, wz + 0.03,
    0.42, 0.045, 0.06,
    'wood'
  );
}

// Chimney
block(
  houseX + 1.0, houseY + 3.2, houseZ - 0.65,
  0.5, 1.0, 0.5, 'stone'
);

// ==================================================
// FARM PLOT
// ==================================================

const farmY = heightAt(farmX, farmZ);

// Soil rows
for (let row = 0; row < 3; row++) {
  const z = farmZ + (row - 1) * 0.95;

  block(
    farmX, farmY + 0.07, z,
    4.0, 0.12, 0.76, 'dirt',
    { castShadow: false }
  );

  for (let col = 0; col < 7; col++) {
    const x = farmX - 1.55 + col * 0.52;

    block(
      x, farmY + 0.3, z,
      0.13, 0.4, 0.13,
      row === 1 ? '#91a04d' : '#658447',
      { castShadow: false }
    );
  }
}

// Fence posts
for (let i = 0; i < 7; i++) {
  const x = farmX - 2.25 + i * 0.75;

  for (const z of [farmZ - 1.8, farmZ + 1.8]) {
    block(x, farmY + 0.43, z, 0.12, 0.86, 0.12, 'wood');
  }
}

for (let i = 0; i < 5; i++) {
  const z = farmZ - 1.4 + i * 0.7;

  for (const x of [farmX - 2.25, farmX + 2.25]) {
    block(x, farmY + 0.43, z, 0.12, 0.86, 0.12, 'wood');
  }
}

// Fence rails
for (const z of [farmZ - 1.8, farmZ + 1.8]) {
  for (const y of [farmY + 0.4, farmY + 0.7]) {
    block(farmX, y, z, 4.5, 0.1, 0.1, 'wood');
  }
}

for (const x of [farmX - 2.25, farmX + 2.25]) {
  for (const y of [farmY + 0.4, farmY + 0.7]) {
    block(x, y, farmZ, 0.1, 0.1, 3.6, 'wood');
  }
}

// ==================================================
// PROPER CAMPFIRE
// Crossed logs, stones, layered flames, warm light.
// ==================================================

const fireX = -1;
const fireZ = 3;
const fireY = heightAt(fireX, fireZ);

// Ring of stones
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  block(
    fireX + Math.cos(a) * 0.65,
    fireY + 0.1,
    fireZ + Math.sin(a) * 0.65,
    0.28, 0.2, 0.28, 'stone'
  );
}

// Logs, crossing over one another
block(
  fireX, fireY + 0.18, fireZ,
  1.2, 0.18, 0.2, 'wood',
  { ry: 0.55 }
);

block(
  fireX, fireY + 0.26, fireZ,
  1.05, 0.16, 0.2, 'wood',
  { ry: -0.55 }
);

// Layered flames
const flameOuter = new THREE.Mesh(
  new THREE.ConeGeometry(0.34, 0.95, 5),
  new THREE.MeshBasicMaterial({ color: '#d45a27' })
);
flameOuter.position.set(fireX, fireY + 0.7, fireZ);
flameOuter.rotation.y = 0.4;
scene.add(flameOuter);

const flameInner = new THREE.Mesh(
  new THREE.ConeGeometry(0.2, 0.62, 5),
  new THREE.MeshBasicMaterial({ color: '#ffca61' })
);
flameInner.position.set(fireX, fireY + 0.59, fireZ);
flameInner.rotation.y = -0.3;
scene.add(flameInner);

const fireLight = new THREE.PointLight('#ff9a47', 14, 16);
fireLight.position.set(fireX, fireY + 1.2, fireZ);
scene.add(fireLight);

// ==================================================
// SIMPLE HUD
// ==================================================

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
  <div class="game-version">WORLD GENERATION v0.2</div>
`;
document.body.appendChild(hud);

// ==================================================
// RESIZE AND RENDER
// ==================================================

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();

  // Gentle firelight variation.
  fireLight.intensity = 12 + Math.sin(performance.now() * 0.008) * 2;
  flameOuter.scale.y = 1 + Math.sin(performance.now() * 0.009) * 0.12;
  flameInner.scale.y = 1 + Math.cos(performance.now() * 0.012) * 0.1;

  renderer.render(scene, camera);
});
