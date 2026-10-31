import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==================================================
// HEARTH & HOLLOW — WORLD GENERATOR 0.4
// A big island with real biomes, rivers, mountains,
// a proper cottage, farm and campfire — and a villager
// you can walk, run, jump and swim around with.
//
// Tip: add ?seed=1234 to the URL for a different world.
// ==================================================

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed')) || 481516;

const CELLS = 384;            // world is CELLS x CELLS tiles (was 80x80)
const HALF = CELLS / 2;
const CHUNK = 32;             // terrain is built in 32x32 chunks
const SEA = 0;                // sea level
const HOME = { x: 0, z: 0, y: 2.4 };

// ==================================================
// SMALL HELPERS
// ==================================================

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);
const range = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

// Deterministic per-tile hash (so tile colours don't depend on call order).
function hash2(i, j) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(SEED, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// hex string -> linear RGB array (vertex colours are read as linear by three.js)
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [
    srgbToLinear(((n >> 16) & 255) / 255),
    srgbToLinear(((n >> 8) & 255) / 255),
    srgbToLinear((n & 255) / 255),
  ];
}
function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// ==================================================
// NOISE
// ==================================================

function makeNoise(seed) {
  const r = mulberry32(seed);
  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];

  const gx = new Float32Array(8);
  const gy = new Float32Array(8);
  for (let i = 0; i < 8; i++) {
    gx[i] = Math.cos((i * Math.PI) / 4);
    gy[i] = Math.sin((i * Math.PI) / 4);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  return function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;

    const aa = p[p[X] + Y] & 7;
    const ab = p[p[X] + Y + 1] & 7;
    const ba = p[p[X + 1] + Y] & 7;
    const bb = p[p[X + 1] + Y + 1] & 7;

    const n00 = gx[aa] * xf + gy[aa] * yf;
    const n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1);
    const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);

    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4;
  };
}

const noise2 = makeNoise(SEED);

function fbm(x, y, octaves = 4) {
  let sum = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f + i * 17.3, y * f - i * 9.1) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

// ==================================================
// RENDERER, SCENE, CAMERA
// ==================================================

const SKY = '#a9d2ea';

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 110, 430);

const camera = new THREE.PerspectiveCamera(
  42, innerWidth / innerHeight, 0.5, 900
);

// Logarithmic depth keeps depth precision high at every distance, which
// removes z-fighting between nearly-flush surfaces (and the water line).
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// No tone mapping: ACES at 1.35 exposure was washing the greens out to brown.
renderer.toneMapping = THREE.NoToneMapping;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 3.5;
controls.maxDistance = 140;
controls.minPolarAngle = 0.12;
controls.maxPolarAngle = Math.PI * 0.49;
controls.enablePan = false;        // the camera follows the villager instead
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

// OrbitControls turns Shift/Ctrl + drag into "pan" -- which is disabled -- so
// holding Shift to sprint made the camera impossible to start rotating.
// Strip those modifier keys from the press before OrbitControls sees it.
addEventListener('pointerdown', (e) => {
  if (!e.isTrusted || e.target !== renderer.domElement) return;
  if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return;
  e.stopImmediatePropagation();
  renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', {
    pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
    button: e.button, buttons: e.buttons, clientX: e.clientX, clientY: e.clientY,
    altKey: e.altKey, shiftKey: false, ctrlKey: false, metaKey: false,
    bubbles: true, cancelable: true,
  }));
}, true);

// ==================================================
// LIGHTING (the sun follows the camera target so the
// shadow map always covers what you're looking at)
// ==================================================

scene.add(new THREE.HemisphereLight('#d9eeff', '#80905f', 1.5));

const SUN_OFFSET = new THREE.Vector3(-55, 80, 40);
const SHADOW_R = 64;        // shadow box half-size in world units
const SHADOW_MAP = 2048;
const sun = new THREE.DirectionalLight('#fff1d2', 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
sun.shadow.camera.left = -SHADOW_R;
sun.shadow.camera.right = SHADOW_R;
sun.shadow.camera.top = SHADOW_R;
sun.shadow.camera.bottom = -SHADOW_R;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 260;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.12;   // bigger normal bias = no shadow acne (the "moire" speckle)
sun.shadow.camera.updateProjectionMatrix();
scene.add(sun);
scene.add(sun.target);

// Light-space axes, used to snap the shadow box to whole shadow-map texels
// so shadows don't crawl/shimmer while you move.
const sunDir = SUN_OFFSET.clone().normalize();
const sunRight = new THREE.Vector3(0, 1, 0).cross(sunDir).normalize();
const sunUp = new THREE.Vector3().crossVectors(sunDir, sunRight);
const SHADOW_TEXEL = (SHADOW_R * 2) / SHADOW_MAP;

// Fade shadows out smoothly toward the edge of the shadow box instead of
// cutting them off in a visible rectangle. (Patches three's shadow shader;
// if the shader layout isn't what we expect it is left untouched.)
(function fadeShadowEdges() {
  try {
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
    const start = chunk.indexOf('float getShadow(');
    if (start < 0) return;
    const rest = chunk.slice(start);
    const m = /return\s+([^;]+);/.exec(rest);
    if (!m) return;
    const before = rest.slice(0, m.index);
    if (!before.includes('frustumTest') || !before.includes('shadowCoord')) return;
    const fade =
      '{ vec2 sfe = abs( shadowCoord.xy - 0.5 ) * 2.0;' +
      ' float sff = 1.0 - smoothstep( 0.7, 0.97, max( sfe.x, sfe.y ) );' +
      ' return mix( 1.0, ' + m[1] + ', sff ); }';
    THREE.ShaderChunk.shadowmap_pars_fragment =
      chunk.slice(0, start) + before + fade + rest.slice(m.index + m[0].length);
  } catch (e) {
    console.warn('Shadow edge fade not applied:', e);
  }
})();

// ==================================================
// PIXEL TEXTURES (for the buildings & water)
// UVs are scaled by real size, so every pixel is the
// same size on every face — no more stretched textures.
// ==================================================

const TILE = 1.6; // one 16px texture covers 1.6 world units => 0.1 units/pixel

function pixelTexture(kind, colors, size = 16, seedOffset = 0) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const r = mulberry32(1234 + seedOffset);
  const dark = colors[colors.length - 1];

  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * size * 0.9; i++) {
    ctx.fillStyle = colors[Math.floor(r() * (colors.length - 1))];
    ctx.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1, 1);
  }

  ctx.fillStyle = dark;
  if (kind === 'plank') {
    for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
    for (let row = 0; row < 4; row++) {
      ctx.fillRect((row * 7 + 3) % size, row * 4, 1, 4);
    }
  } else if (kind === 'shingle') {
    for (let row = 0; row < size / 4; row++) {
      ctx.fillRect(0, row * 4 + 3, size, 1);
      for (let x = (row % 2) * 2; x < size; x += 4) {
        ctx.fillRect(x, row * 4, 1, 3);
      }
    }
  } else if (kind === 'stone') {
    for (let row = 0; row < size / 4; row++) {
      ctx.fillRect(0, row * 4, size, 1);
      for (let x = (row % 2) * 4; x < size; x += 8) {
        ctx.fillRect(x, row * 4, 1, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.anisotropy = 4;
  if (kind === 'shingle') {
    tex.rotation = Math.PI / 2;
    tex.center.set(0.5, 0.5);
  }
  return tex;
}

function texMat(kind, colors, extra = {}) {
  return new THREE.MeshStandardMaterial({
    map: pixelTexture(kind, colors, 16, kind.length),
    roughness: 1,
    metalness: 0,
    ...extra,
  });
}

const M = {
  wood: texMat('plank', ['#7a5434', '#8a6240', '#6b4a2e', '#966c46', '#4d3320']),
  darkWood: texMat('plank', ['#4f3524', '#5d3f2b', '#432d1f', '#68472f', '#2f1f15']),
  wall: texMat('plaster', ['#d8c49a', '#cdb88b', '#e0cfa6', '#c4ad80', '#a89368']),
  roof: texMat('shingle', ['#a5522f', '#b45e37', '#93482b', '#c26b40', '#5e2e1d']),
  stone: texMat('stone', ['#8e9086', '#9b9c91', '#7e8077', '#a9a99c', '#575a52']),
  soil: texMat('plaster', ['#6b4a30', '#7a5636', '#5c3f29', '#86613d', '#3e2a1b']),
};

const flatCache = new Map();
function flat(hex, extra = {}) {
  const key = hex + JSON.stringify(extra);
  if (!flatCache.has(key)) {
    flatCache.set(key, new THREE.MeshStandardMaterial({
      color: hex, roughness: 1, metalness: 0, flatShading: true, ...extra,
    }));
  }
  return flatCache.get(key);
}

const glowMat = (hex, opacity = 1) => new THREE.MeshBasicMaterial({
  color: hex, transparent: opacity < 1, opacity,
});

// Box geometry whose UVs are scaled to world size.
const boxCache = new Map();
function texBox(w, h, d) {
  const key = [w, h, d].map((v) => v.toFixed(3)).join('_');
  let g = boxCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
    const faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, (uv.getX(i) * faces[f][0]) / TILE, (uv.getY(i) * faces[f][1]) / TILE);
      }
    }
    boxCache.set(key, g);
  }
  return g;
}

// ==================================================
// WORLD DATA
// ==================================================

const N = CELLS + 1;                       // vertices per side
const H = new Float32Array(N * N);         // height
const BIOME = new Uint8Array(N * N);       // biome id
const ROCK = new Float32Array(N * N);      // 0..1 how rocky
const SNOW = new Float32Array(N * N);      // 0..1 how snowy

const B = {
  MEADOW: 0, FOREST: 1, AUTUMN: 2, TAIGA: 3,
  TUNDRA: 4, DESERT: 5, SAVANNA: 6,
};
const BIOME_NAMES = [
  'Meadow', 'Oak Forest', 'Autumn Woods', 'Taiga',
  'Frozen Tundra', 'Desert', 'Savanna',
];

function biomeFrom(T, M, V) {
  if (T < -0.7) return B.TUNDRA;
  if (T < -0.3) return B.TAIGA;
  if (T > 0.3) return M < 0.0 ? B.DESERT : B.SAVANNA;
  if (M > 0.08) return V > 0.0 ? B.AUTUMN : B.FOREST;
  return B.MEADOW;
}

// Two winding rivers that flow all the way across the island.
const RIVERS = [
  { a: 46, f1: 0.022, p1: 0.0, A1: 26, f2: 0.057, p2: 1.3, A2: 9, w: 2.0 },
  { a: -80, f1: 0.03, p1: 2.0, A1: 18, f2: 0.071, p2: 0.4, A2: 6, w: 1.5 },
];
let riverEdge = 0;   // distance to nearest river bank (negative = inside)
let riverHalf = 0;   // half-width of that river
function riverInfo(x, z) {
  let best = 1e9;
  let bw = 2;
  for (const r of RIVERS) {
    const s1 = z * r.f1 + r.p1;
    const s2 = z * r.f2 + r.p2;
    const cx = r.a + Math.sin(s1) * r.A1 + Math.sin(s2) * r.A2;
    const slope = Math.cos(s1) * r.f1 * r.A1 + Math.cos(s2) * r.f2 * r.A2;
    const d = Math.abs(x - cx) / Math.sqrt(1 + slope * slope);
    const w = r.w + Math.sin(z * 0.05 + r.p1) * 0.7;
    if (d - w < best) {
      best = d - w;
      bw = w;
    }
  }
  riverEdge = best;
  riverHalf = bw;
}

// ==================================================
// GENERATE HEIGHT + BIOMES
// ==================================================

function generateTerrain() {
  for (let j = 0; j < N; j++) {
    const z = j - HALF;
    for (let i = 0; i < N; i++) {
      const x = i - HALF;
      const idx = j * N + i;
      const dHome = Math.hypot(x - HOME.x, z - HOME.z);

      // --- climate ---
      // Cold in the north, hot in the south, with noise bending the borders.
      // (The gradient guarantees every biome shows up whatever the seed.)
      let T = (fbm(x * 0.0075 + 200, z * 0.0075 - 130, 3) - 0.06) * 2.6 + (z / HALF) * 0.78;
      let Mo = (fbm(x * 0.0075 - 310, z * 0.0075 + 75, 3) + 0.1) * 3.4 + 0.08;
      const V = fbm(x * 0.014 + 55, z * 0.014 + 400, 2);
      const spawn = 1 - smoothstep(30, 85, dHome);   // spawn is always a meadow
      T = lerp(T, 0.02, spawn);
      Mo = lerp(Mo, 0.0, spawn);
      BIOME[idx] = biomeFrom(T, Mo, V);

      // --- base land ---
      const edgeN =
        (Math.hypot(x, z) / HALF) * 0.55 +
        (Math.max(Math.abs(x), Math.abs(z)) / HALF) * 0.45 +
        fbm(x * 0.018 + 40, z * 0.018 - 60, 3) * 0.16;   // ragged coastline
      const edge = smoothstep(0.7, 1.0, edgeN);

      const c = fbm(x * 0.0055 + 7.3, z * 0.0055 - 3.1, 5);
      let h = 3.4 + c * 12 + fbm(x * 0.03 - 4, z * 0.03 + 8, 3) * 2.4;

      riverInfo(x, z);

      // --- mountains (kept away from spawn and the rivers) ---
      const mm = smoothstep(0.02, 0.3, fbm(x * 0.0036 + 31, z * 0.0036 - 17, 3));
      let ridge = 1 - Math.min(1, Math.abs(fbm(x * 0.01 - 9, z * 0.01 + 5, 4)) * 2.2);
      ridge *= ridge;
      const rough = fbm(x * 0.05, z * 0.05, 3) * 1.8;
      const away = smoothstep(34, 70, dHome) * smoothstep(8, 26, riverEdge) * (1 - edge);
      h += mm * away * (ridge * 24 + 4 + rough * 2);

      // --- desert dunes ---
      const wD = smoothstep(0.35, 0.6, T) * (1 - smoothstep(-0.15, 0.05, Mo));
      h += wD * (fbm(x * 0.045 + 3, z * 0.03, 3) * 2.4 + 0.3);

      // --- rivers carve a channel below sea level ---
      let carve = 1 - smoothstep(0, 7, riverEdge);
      carve *= smoothstep(14, 30, dHome);
      const bed = SEA - 1.8 + smoothstep(-riverHalf, 0, riverEdge) * 1.1;
      h = lerp(h, bed, carve);

      // --- island edge sinks into the ocean ---
      h -= edge * 28;

      // --- flat, buildable homestead ---
      h = lerp(HOME.y, h, smoothstep(12, 26, dHome));

      H[idx] = Math.max(h, -14);
      // stash temperature for the second pass
      TEMP_TMP[idx] = T;
    }
  }

  // second pass: slopes -> rock, altitude -> rock / snow
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const idx = j * N + i;
      const h = H[idx];
      const hl = H[j * N + Math.max(i - 1, 0)];
      const hr = H[j * N + Math.min(i + 1, N - 1)];
      const hu = H[Math.max(j - 1, 0) * N + i];
      const hd = H[Math.min(j + 1, N - 1) * N + i];
      const slope = Math.max(Math.abs(h - hl), Math.abs(h - hr), Math.abs(h - hu), Math.abs(h - hd));

      const x = i - HALF;
      const z = j - HALF;
      const n = fbm(x * 0.09 + 5, z * 0.09 - 5, 2) * 2.5;
      const T = TEMP_TMP[idx];
      const snowLine = 15 + T * 7;
      const rockLine = snowLine - 5;

      let rock = Math.max(
        smoothstep(1.15, 2.0, slope),
        smoothstep(rockLine, rockLine + 4, h + n)
      );
      let snow = smoothstep(snowLine, snowLine + 3, h + n);
      snow *= 1 - 0.6 * smoothstep(1.2, 2.2, slope);
      if (h < SEA + 1) { rock = 0; snow = 0; }
      ROCK[idx] = rock;
      SNOW[idx] = snow;
    }
  }
}
const TEMP_TMP = new Float32Array(N * N);

// Exact ground height at any x,z (matches the triangles we render).
function groundY(x, z) {
  const fx = clamp(x + HALF, 0, CELLS - 0.0001);
  const fz = clamp(z + HALF, 0, CELLS - 0.0001);
  const i = Math.floor(fx);
  const j = Math.floor(fz);
  const u = fx - i;
  const v = fz - j;
  const a = H[j * N + i];
  const b = H[j * N + i + 1];
  const c = H[(j + 1) * N + i];
  const d = H[(j + 1) * N + i + 1];
  return u + v <= 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

const vertexAt = (x, z) =>
  clamp(Math.round(z + HALF), 0, N - 1) * N + clamp(Math.round(x + HALF), 0, N - 1);

// Dirt path from the front door winding south.
function pathX(z) {
  const t = clamp01((z - 3) / 12);
  return Math.sin((z - 3) * 0.07) * 6 * t;
}
function onPath(x, z, w = 1.1) {
  return z > 2.4 && z < 80 && Math.abs(x - pathX(z)) < w;
}

// Keep grass/flowers from poking through the cottage, farm and campfire.
function inYard(x, z) {
  return (
    (Math.abs(x - HOME.x) < 3.6 && Math.abs(z - HOME.z) < 3.4) ||
    (Math.abs(x - (HOME.x - 7)) < 3.2 && Math.abs(z - (HOME.z + 4.5)) < 2.7) ||
    Math.hypot(x - (HOME.x + 7), z - (HOME.z + 5.5)) < 3.2
  );
}

// ==================================================
// TILE COLOURS
// ==================================================

const GROUND = [
  ['#7fb552', '#74aa4a', '#88bd58', '#6da245'],   // meadow
  ['#4e8a3b', '#477f35', '#58943f', '#437a33'],   // oak forest
  ['#a3aa45', '#b99b3b', '#9aa23f', '#c1a547'],   // autumn
  ['#3f6f4c', '#37644a', '#477a52', '#5b5a3a'],   // taiga
  ['#e8f0f2', '#dde8ea', '#f4f8f9', '#d3e0e4'],   // tundra
  ['#e1c57b', '#d8ba6c', '#e9ce87', '#d1b068'],   // desert
  ['#bdae4f', '#c8b95c', '#aa9c46', '#b5a24a'],   // savanna
].map((list) => list.map(rgb));

const GROUND_AVG = GROUND.map((list) => [
  list.reduce((s, c) => s + c[0], 0) / list.length,
  list.reduce((s, c) => s + c[1], 0) / list.length,
  list.reduce((s, c) => s + c[2], 0) / list.length,
]);

const ROCK_COLORS = ['#8b8e86', '#7a7d76', '#9a9b92', '#6f726b'].map(rgb);
const SNOW_COLOR = rgb('#f3f7f8');
const SAND = ['#e6d59b', '#dccb8f', '#e9dba8'].map(rgb);
const GRAVEL = rgb('#9a9d98');
const SHALLOW = rgb('#cdbf8a');
const DEEP = rgb('#173f5a');
const DIRT = rgb('#8e7550');

const BLEND_OFFSETS = [
  [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4], [4, -4], [-4, 4],
];

function cellColor(i, j) {
  const k00 = j * N + i;
  const k10 = k00 + 1;
  const k01 = k00 + N;
  const k11 = k01 + 1;
  const hc = (H[k00] + H[k10] + H[k01] + H[k11]) * 0.25;
  const bC = BIOME[k00];

  // soft biome borders: average the neighbourhood's ground colour
  let r = GROUND_AVG[bC][0] * 2;
  let g = GROUND_AVG[bC][1] * 2;
  let b = GROUND_AVG[bC][2] * 2;
  let wsum = 2;
  for (let n = 0; n < BLEND_OFFSETS.length; n++) {
    const ii = clamp(i + BLEND_OFFSETS[n][0], 0, N - 1);
    const jj = clamp(j + BLEND_OFFSETS[n][1], 0, N - 1);
    const a = GROUND_AVG[BIOME[jj * N + ii]];
    r += a[0]; g += a[1]; b += a[2]; wsum++;
  }
  let col = [r / wsum, g / wsum, b / wsum];

  // per-tile pixel variation
  const pal = GROUND[bC];
  col = mixRgb(col, pal[Math.floor(hash2(i, j) * pal.length)], 0.55);
  const shade = 0.92 + hash2(i + 91, j - 37) * 0.16;

  const rock = (ROCK[k00] + ROCK[k10] + ROCK[k01] + ROCK[k11]) * 0.25;
  const snow = (SNOW[k00] + SNOW[k10] + SNOW[k01] + SNOW[k11]) * 0.25;
  if (rock > 0) {
    col = mixRgb(col, ROCK_COLORS[Math.floor(hash2(i - 7, j + 3) * ROCK_COLORS.length)], rock);
  }
  if (snow > 0) col = mixRgb(col, SNOW_COLOR, snow);

  // beaches
  if (hc < SEA + 1.2) {
    const beachW = 1 - smoothstep(SEA + 0.35, SEA + 1.2, hc);
    const sand = bC === B.TUNDRA || bC === B.TAIGA
      ? GRAVEL
      : SAND[Math.floor(hash2(i + 5, j + 5) * SAND.length)];
    col = mixRgb(col, sand, beachW);
  }

  // sea / river bed gets darker with depth
  if (hc < SEA + 0.2) {
    const depth = SEA - hc;
    const wet = smoothstep(-0.2, 0.5, depth);
    const under = mixRgb(SHALLOW, DEEP, smoothstep(0.3, 9, depth));
    col = mixRgb(col, under, wet);
  }

  // trampled dirt path
  const x = i - HALF + 0.5;
  const z = j - HALF + 0.5;
  if (hc > SEA + 0.4 && onPath(x, z)) col = mixRgb(col, DIRT, 0.88);

  return [col[0] * shade, col[1] * shade, col[2] * shade];
}

// ==================================================
// TERRAIN MESH — ONE CONTINUOUS SURFACE
// Shared corner heights mean no gaps, no overlapping
// water planes, nothing to see through.
// ==================================================

function buildTerrainMeshes() {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
  });
  const group = new THREE.Group();

  const chunksPerSide = CELLS / CHUNK;
  for (let cz = 0; cz < chunksPerSide; cz++) {
    for (let cx = 0; cx < chunksPerSide; cx++) {
      const pos = new Float32Array(CHUNK * CHUNK * 18);
      const nor = new Float32Array(CHUNK * CHUNK * 18);
      const col = new Float32Array(CHUNK * CHUNK * 18);
      let p = 0;

      const tri = (ax, ay, az, bx, by, bz, cx_, cy, cz_, color) => {
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
        const e2x = cx_ - ax, e2y = cy - ay, e2z = cz_ - az;
        let nx = e1y * e2z - e1z * e2y;
        let ny = e1z * e2x - e1x * e2z;
        let nz = e1x * e2y - e1y * e2x;
        const len = Math.hypot(nx, ny, nz) || 1;
        nx /= len; ny /= len; nz /= len;
        const pts = [ax, ay, az, bx, by, bz, cx_, cy, cz_];
        for (let v = 0; v < 3; v++) {
          pos[p] = pts[v * 3]; pos[p + 1] = pts[v * 3 + 1]; pos[p + 2] = pts[v * 3 + 2];
          nor[p] = nx; nor[p + 1] = ny; nor[p + 2] = nz;
          col[p] = color[0]; col[p + 1] = color[1]; col[p + 2] = color[2];
          p += 3;
        }
      };

      for (let jz = 0; jz < CHUNK; jz++) {
        for (let ix = 0; ix < CHUNK; ix++) {
          const i = cx * CHUNK + ix;
          const j = cz * CHUNK + jz;
          const x0 = i - HALF, x1 = x0 + 1;
          const z0 = j - HALF, z1 = z0 + 1;
          const ha = H[j * N + i];
          const hb = H[j * N + i + 1];
          const hc = H[(j + 1) * N + i];
          const hd = H[(j + 1) * N + i + 1];
          const color = cellColor(i, j);

          tri(x0, ha, z0, x0, hc, z1, x1, hb, z0, color);
          tri(x1, hb, z0, x0, hc, z1, x1, hd, z1, color);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
  scene.add(group);
}

// One big ocean plane at sea level. Rivers, lakes and the sea
// are just the parts of the terrain that dip below it.
const waterTexture = pixelTexture(
  'water', ['#ffffff', '#eaf6ff', '#d6edf8', '#c4e3f2', '#b3d7ea'], 16, 99
);
waterTexture.minFilter = THREE.LinearMipmapLinearFilter;
waterTexture.repeat.set(2600 / 8, 2600 / 8);

function buildWater() {
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshStandardMaterial({
      color: '#4fa8c9',
      map: waterTexture,
      transparent: true,
      opacity: 0.66,
      roughness: 0.25,
      metalness: 0,
      depthWrite: false,
    })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = SEA;
  water.renderOrder = 1;
  scene.add(water);
}

// ==================================================
// INSTANCED SCENERY
// Thousands of trees/plants as a handful of draw calls.
// Flat-shaded colours only — no stretched textures.
// ==================================================

// ==================================================
// COLLISION — circles (trees, rocks...) in a spatial hash,
// plus a few boxes (cottage walls, fences, furniture)
// ==================================================

const CGRID = 8;
const STEP_UP = 0.3;                 // things lower than this are simply stepped onto
const colGrid = new Map();
const colBoxes = [];

// `top` = world height of the object's top surface. Tall things (trees, walls)
// use a huge number so they always block; low things can be jumped on.
function addCircle(x, z, r, top = 1e9) {
  const key = (Math.floor(x / CGRID) + 512) * 1024 + (Math.floor(z / CGRID) + 512);
  let list = colGrid.get(key);
  if (!list) colGrid.set(key, (list = []));
  list.push([x, z, r, top]);
}
function addBox(x0, x1, z0, z1, top = 1e9) {
  colBoxes.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), top]);
}

const colOut = { x: 0, z: 0 };
function resolveCollisions(x, z, r, feetY) {
  for (let it = 0; it < 3; it++) {
    const cx = Math.floor(x / CGRID);
    const cz = Math.floor(z / CGRID);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const list = colGrid.get((gx + 512) * 1024 + (gz + 512));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (feetY >= c[3] - STEP_UP) continue;       // we're above it: no push
          const dx = x - c[0];
          const dz = z - c[1];
          const rr = r + c[2];
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = rr - d;
            x += (dx / d) * push;
            z += (dz / d) * push;
          }
        }
      }
    }
    for (let i = 0; i < colBoxes.length; i++) {
      const b = colBoxes[i];
      if (feetY >= b[4] - STEP_UP) continue;
      const qx = clamp(x, b[0], b[1]);
      const qz = clamp(z, b[2], b[3]);
      const dx = x - qx;
      const dz = z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x += (dx / d) * (r - d);
        z += (dz / d) * (r - d);
      } else {                                   // centre is inside the box
        const l = x - b[0], rt = b[1] - x, t = z - b[2], bt = b[3] - z;
        const m = Math.min(l, rt, t, bt);
        if (m === l) x = b[0] - r;
        else if (m === rt) x = b[1] + r;
        else if (m === t) z = b[2] - r;
        else z = b[3] + r;
      }
    }
  }
  colOut.x = x;
  colOut.z = z;
  return colOut;
}

const dummy = new THREE.Object3D();
const instColor = new THREE.Color();
const instMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff', roughness: 1, metalness: 0, flatShading: true,
});

function makeBatch(geometry, castShadow = true) {
  let buf = new Float32Array(16 * 256);
  let colors = [];
  let n = 0;
  return {
    add(x, y, z, sx, sy, sz, ry = 0, hex = '#ffffff', rx = 0, rz = 0) {
      if ((n + 1) * 16 > buf.length) {
        const bigger = new Float32Array(buf.length * 2);
        bigger.set(buf);
        buf = bigger;
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(rx, ry, rz);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      dummy.matrix.toArray(buf, n * 16);
      colors.push(hex);
      n++;
    },
    get count() { return n; },
    finish() {
      if (n === 0) return;
      const mesh = new THREE.InstancedMesh(geometry, instMaterial, n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        m.fromArray(buf, i * 16);
        mesh.setMatrixAt(i, m);
        instColor.set(colors[i]);
        mesh.setColorAt(i, instColor);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;   // instances span the whole world
      scene.add(mesh);
    },
  };
}

const geo = {
  trunk: new THREE.CylinderGeometry(0.5, 0.65, 1, 6).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 7).translate(0, 0.5, 0),
  blob: new THREE.IcosahedronGeometry(0.5, 0),
  rock: new THREE.DodecahedronGeometry(0.5, 0),
  tuft: new THREE.ConeGeometry(0.5, 1, 3).translate(0, 0.5, 0),
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 7).translate(0, 0.5, 0),
};

const batch = {
  trunks: makeBatch(geo.trunk),
  cones: makeBatch(geo.cone),
  blobs: makeBatch(geo.blob),
  rocks: makeBatch(geo.rock),
  cactus: makeBatch(geo.cyl),
  tufts: makeBatch(geo.tuft, false),
  stems: makeBatch(geo.box, false),
  heads: makeBatch(geo.box, false),
  bushes: makeBatch(geo.blob, false),
};

const COLORS = {
  trunk: ['#6b4a2f', '#5e4029', '#775435'],
  birchTrunk: ['#e9e6dc', '#dedacd'],
  oak: ['#4c8f3a', '#5a9d42', '#3f7f34', '#69a94b'],
  birch: ['#8fbf55', '#9cc85d', '#7fae4c'],
  autumn: ['#d9741f', '#c9511f', '#e3a02b', '#b9402a', '#e8b83a'],
  pine: ['#2f5d3f', '#386b47', '#2a5238', '#41764f'],
  snowPine: ['#e6eff1', '#cfe0df', '#b8d1cb'],
  acacia: ['#a2a63f', '#8f9d3a', '#b3ad48'],
  cactus: ['#4f8b4a', '#5a9a52', '#467d43'],
  rock: ['#8b8e86', '#7a7d76', '#9a9b92'],
  sandRock: ['#c9a46a', '#b8935a', '#d4b27a'],
  iceRock: ['#a3a8aa', '#b4babc', '#92979a'],
  flowers: ['#f2d45c', '#e46c7a', '#f4f0e0', '#a98fe0', '#f29a52'],
  reeds: ['#6f8f3c', '#7d9c47', '#5f8034'],
};

const TUFT_COLORS = [
  ['#8fcb5a', '#7cbd4c', '#9ad464'],   // meadow
  ['#5e9c46', '#4f8c3c', '#68a64e'],   // forest
  ['#a8a23c', '#b9902f', '#c4a43a'],   // autumn
  ['#4c7d55', '#3f6f4b', '#58875c'],   // taiga
  ['#cfd8d6', '#e2eaea'],              // tundra
  ['#a58a4f', '#8f7a45'],              // desert (dry scrub)
  ['#cbb95a', '#b8a64a', '#d6c46a'],   // savanna
];
const TUFT_DENSITY = [0.5, 0.42, 0.38, 0.28, 0.07, 0.05, 0.55];
const FLOWER_DENSITY = [0.07, 0.012, 0.0, 0.0, 0.0, 0.0, 0.01];
const BUSH_DENSITY = [0.012, 0.05, 0.05, 0.03, 0.0, 0.0, 0.012];

// ---------- tree builders ----------

function oakTree(x, y, z, s, palette) {
  addCircle(x, z, 0.32 * s);
  const th = 1.7 * s;
  batch.trunks.add(x, y - 0.15, z, 0.5 * s, th + 0.15, 0.5 * s, rand() * 6, pick(COLORS.trunk));
  const cy = y + th + 0.5 * s;
  batch.blobs.add(x, cy, z, 3.0 * s, 2.5 * s, 3.0 * s, rand() * 6, pick(palette));
  for (let k = 0; k < 3; k++) {
    const a = rand() * Math.PI * 2;
    const r = (0.8 + rand() * 0.5) * s;
    batch.blobs.add(
      x + Math.cos(a) * r, cy + (rand() - 0.3) * 0.9 * s, z + Math.sin(a) * r,
      (1.7 + rand() * 0.7) * s, (1.5 + rand() * 0.5) * s, (1.7 + rand() * 0.7) * s,
      rand() * 6, pick(palette)
    );
  }
}

function birchTree(x, y, z, s, palette) {
  addCircle(x, z, 0.24 * s);
  const th = 2.9 * s;
  batch.trunks.add(x, y - 0.1, z, 0.34 * s, th, 0.34 * s, 0, pick(COLORS.birchTrunk));
  const cy = y + th;
  batch.blobs.add(x, cy + 0.3 * s, z, 1.9 * s, 2.4 * s, 1.9 * s, rand() * 6, pick(palette));
  batch.blobs.add(x + 0.3 * s, cy - 0.5 * s, z - 0.2 * s, 1.5 * s, 1.5 * s, 1.5 * s, rand() * 6, pick(palette));
}

function pineTree(x, y, z, s, palette) {
  addCircle(x, z, 0.3 * s);
  const th = 1.2 * s;
  batch.trunks.add(x, y - 0.1, z, 0.42 * s, th + 0.1, 0.42 * s, 0, pick(COLORS.trunk));
  for (let layer = 0; layer < 4; layer++) {
    const w = (3.1 - layer * 0.62) * s;
    batch.cones.add(
      x, y + th * 0.6 + layer * 1.05 * s, z,
      w, 1.9 * s, w, rand() * 6, pick(palette)
    );
  }
}

function acaciaTree(x, y, z, s) {
  addCircle(x, z, 0.28 * s);
  const th = 2.6 * s;
  batch.trunks.add(x, y - 0.1, z, 0.36 * s, th + 0.1, 0.36 * s, 0, '#6b4f35', 0, 0.06);
  batch.blobs.add(x, y + th + 0.2 * s, z, 4.2 * s, 0.95 * s, 4.2 * s, rand() * 6, pick(COLORS.acacia));
  batch.blobs.add(x + 0.5 * s, y + th + 0.55 * s, z - 0.3 * s, 2.4 * s, 0.7 * s, 2.4 * s, rand() * 6, pick(COLORS.acacia));
}

function cactusPlant(x, y, z, s) {
  addCircle(x, z, 0.32 * s);
  const col = pick(COLORS.cactus);
  const h = (1.5 + rand() * 1.3) * s;
  batch.cactus.add(x, y - 0.05, z, 0.55 * s, h, 0.55 * s, 0, col);
  if (rand() > 0.35) {
    const dir = rand() > 0.5 ? 1 : -1;
    const ay = y + h * (0.35 + rand() * 0.2);
    batch.cactus.add(x + dir * 0.28 * s, ay, z, 0.4 * s, 0.5 * s, 0.4 * s, 0, col, 0, Math.PI / 2 * -dir);
    batch.cactus.add(x + dir * 0.55 * s, ay - 0.05, z, 0.38 * s, 0.7 * s * (0.8 + rand() * 0.6), 0.38 * s, 0, col);
  }
}

function slopeAt(x, z) {
  const dx = groundY(x + 1, z) - groundY(x - 1, z);
  const dz = groundY(x, z + 1) - groundY(x, z - 1);
  return Math.hypot(dx, dz) * 0.5;
}

function boulder(x, y, z, s, palette) {
  const sink = s * (0.05 + slopeAt(x, z) * 0.45);   // steeper ground => buried deeper
  const cy = y + s * 0.2 - sink;
  const sx = s * range(0.9, 1.5);
  const sy = s * range(0.6, 1.0);
  const sz = s * range(0.9, 1.4);
  addCircle(x, z, 0.45 * Math.max(sx, sz), cy + sy * 0.45);   // low rocks can be hopped onto
  batch.rocks.add(x, cy, z, sx, sy, sz, rand() * 6, pick(palette), rand() * 0.4, rand() * 0.4);
}

// ---------- scatter everything across the world ----------

function scatterWorld() {
  // Trees & big things
  const STEP = 2.2;
  for (let gz = -HALF + 3; gz < HALF - 3; gz += STEP) {
    for (let gx = -HALF + 3; gx < HALF - 3; gx += STEP) {
      const x = gx + rand() * STEP;
      const z = gz + rand() * STEP;
      const y = groundY(x, z);
      if (y < SEA + 0.9) continue;

      const k = vertexAt(x, z);
      const b = BIOME[k];
      const rock = ROCK[k];
      const snow = SNOW[k];
      const dHome = Math.hypot(x - HOME.x, z - HOME.z);
      if (dHome < 13) continue;
      if (onPath(x, z, 2.8)) continue;

      // glades and thickets
      const clump = clamp(fbm(x * 0.045 + 90, z * 0.045 - 40, 2) * 1.8 + 0.8, 0.05, 1.6);
      const roll = rand();

      // bare mountain: only boulders and a few stubborn pines
      if (rock > 0.45) {
        if (roll < (snow > 0.5 ? 0.03 : 0.12)) boulder(x, y, z, range(0.6, 1.6), b === B.DESERT ? COLORS.sandRock : COLORS.rock);
        else if (roll < 0.15 && snow < 0.3 && y < 14) pineTree(x, y, z, range(0.8, 1.1), COLORS.pine);
        continue;
      }

      const s = range(0.85, 1.35);
      switch (b) {
        case B.MEADOW:
          if (roll < 0.05 * clump) oakTree(x, y, z, s, COLORS.oak);
          else if (roll < 0.052 * clump + 0.012) boulder(x, y, z, range(0.5, 1.1), COLORS.rock);
          break;
        case B.FOREST:
          if (roll < 0.7 * clump) {
            if (rand() < 0.22) birchTree(x, y, z, s, COLORS.birch);
            else oakTree(x, y, z, s, COLORS.oak);
          } else if (roll > 0.99) boulder(x, y, z, range(0.5, 1.2), COLORS.rock);
          break;
        case B.AUTUMN:
          if (roll < 0.65 * clump) {
            if (rand() < 0.3) birchTree(x, y, z, s, COLORS.autumn);
            else oakTree(x, y, z, s, COLORS.autumn);
          }
          break;
        case B.TAIGA:
          if (roll < 0.75 * clump) pineTree(x, y, z, s * 1.1, COLORS.pine);
          else if (roll > 0.985) boulder(x, y, z, range(0.6, 1.4), COLORS.rock);
          break;
        case B.TUNDRA:
          if (roll < 0.07 * clump) pineTree(x, y, z, s * 0.9, COLORS.snowPine);
          else if (roll > 0.975) boulder(x, y, z, range(0.5, 1.5), COLORS.iceRock);
          break;
        case B.DESERT:
          if (roll < 0.045) cactusPlant(x, y, z, s);
          else if (roll > 0.975) boulder(x, y, z, range(0.6, 1.8), COLORS.sandRock);
          break;
        case B.SAVANNA:
          if (roll < 0.05 * clump) acaciaTree(x, y, z, s);
          else if (roll > 0.99) boulder(x, y, z, range(0.5, 1.3), COLORS.sandRock);
          break;
      }
    }
  }

  // Ground cover: tufts, flowers, bushes, reeds
  const STEP2 = 1.15;
  for (let gz = -HALF + 2; gz < HALF - 2; gz += STEP2) {
    for (let gx = -HALF + 2; gx < HALF - 2; gx += STEP2) {
      const x = gx + rand() * STEP2;
      const z = gz + rand() * STEP2;
      const y = groundY(x, z);
      if (y < SEA - 0.35) continue;

      const k = vertexAt(x, z);
      const b = BIOME[k];
      const roll = rand();

      // reeds in shallow water at the edge of lakes & rivers
      if (y < SEA + 0.45) {
        if (b !== B.DESERT && b !== B.TUNDRA && roll < 0.22) {
          const hgt = range(1.0, 1.8);
          batch.stems.add(x, y, z, 0.06, hgt, 0.06, 0, pick(COLORS.reeds));
          if (rand() > 0.5) batch.heads.add(x, y + hgt - 0.1, z, 0.11, 0.32, 0.11, 0, '#5b3d26');
        }
        continue;
      }
      if (ROCK[k] > 0.4 || SNOW[k] > 0.4) continue;
      if (y < SEA + 1.1) continue;                 // keep beaches clean
      if (onPath(x, z, 1.3) || inYard(x, z)) continue;

      if (roll < TUFT_DENSITY[b]) {
        const w = range(0.3, 0.5);
        batch.tufts.add(x, y - 0.02, z, w, range(0.35, 0.8), w, rand() * 6, pick(TUFT_COLORS[b]));
      } else if (roll < TUFT_DENSITY[b] + FLOWER_DENSITY[b]) {
        const hgt = range(0.3, 0.5);
        batch.stems.add(x, y - 0.02, z, 0.05, hgt, 0.05, 0, '#5f8a45');
        batch.heads.add(x, y + hgt - 0.02, z, 0.17, 0.14, 0.17, rand() * 3, pick(COLORS.flowers));
      } else if (roll < TUFT_DENSITY[b] + FLOWER_DENSITY[b] + BUSH_DENSITY[b]) {
        if (Math.hypot(x - HOME.x, z - HOME.z) < 11) continue;
        const s = range(0.7, 1.5);
        const pal = b === B.AUTUMN ? COLORS.autumn : b === B.TAIGA ? COLORS.pine : COLORS.oak;
        batch.bushes.add(x, y + 0.2 * s, z, s, s * 0.7, s, rand() * 6, pick(pal));
      }
    }
  }

  for (const key of Object.keys(batch)) batch[key].finish();
}

// ==================================================
// COTTAGE — rebuilt from scratch
// Stone foundation, half-timbered walls with real
// window/door openings, an overhanging gable roof that
// actually meets the walls, chimney, furniture inside.
// ==================================================

// Split a wall of length L / height H into boxes around openings.
function wallRects(L, Hh, openings) {
  const ops = openings.slice().sort((a, b) => a.u0 - b.u0);
  const rects = [];
  let cursor = -L / 2;
  for (const o of ops) {
    if (o.u0 > cursor) rects.push({ u0: cursor, u1: o.u0, v0: 0, v1: Hh });
    if (o.v0 > 0) rects.push({ u0: o.u0, u1: o.u1, v0: 0, v1: o.v0 });
    if (o.v1 < Hh) rects.push({ u0: o.u0, u1: o.u1, v0: o.v1, v1: Hh });
    cursor = o.u1;
  }
  if (cursor < L / 2) rects.push({ u0: cursor, u1: L / 2, v0: 0, v1: Hh });
  return rects;
}

const smoke = [];
const roofParts = [];     // fade out while the villager is indoors
const roofMats = [];      // their own materials, so only the roof fades
const hearthFlames = [];
const door = { pivot: null, angle: 0, dir: 1, x: 0, z: 0 };
let fireplaceLight = null;
let houseLight = null;

function buildCottage() {
  const g = new THREE.Group();
  g.position.set(HOME.x, HOME.y, HOME.z);
  scene.add(g);

  const part = (w, h, d, x, y, z, material, opts = {}) => {
    const m = new THREE.Mesh(texBox(w, h, d), material);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    if (opts.rz) m.rotation.z = opts.rz;
    m.castShadow = opts.cast ?? true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  const W = 4.6;        // outer width  (x)
  const D = 3.8;        // outer depth  (z)
  const T = 0.22;       // wall thickness
  const WH = 2.5;       // wall height
  const yf = 0.5;       // floor level above ground
  const yb = yf;        // wall bottom
  const yt = yb + WH;   // wall top

  // --- foundation & step ---
  part(W + 0.5, 1.2, D + 0.5, 0, -0.1, 0, M.stone);
  part(1.9, 0.26, 0.65, 0, 0.13, (D + 0.5) / 2 + 0.32, M.stone);

  // --- interior floor, rug ---
  part(W - T * 2, 0.08, D - T * 2, 0, yf + 0.04, 0, M.wood, { cast: false });
  part(1.9, 0.03, 1.3, 0.2, yf + 0.1, 0.5, flat('#7a3b34'), { cast: false });
  part(1.5, 0.03, 0.9, 0.2, yf + 0.12, 0.5, flat('#c9a24a'), { cast: false });

  // --- walls ---
  const winY0 = 0.95, winY1 = 1.85;
  const winW = 0.9;
  const winX = 1.3;
  const doorW = 1.0, doorH = 1.95;

  // front (+z) and back (-z) walls run along x
  const frontOps = [
    { u0: -doorW / 2, u1: doorW / 2, v0: 0, v1: doorH },
    { u0: -winX - winW / 2, u1: -winX + winW / 2, v0: winY0, v1: winY1 },
    { u0: winX - winW / 2, u1: winX + winW / 2, v0: winY0, v1: winY1 },
  ];
  for (const r of wallRects(W, WH, frontOps)) {
    part(r.u1 - r.u0, r.v1 - r.v0, T, (r.u0 + r.u1) / 2, yb + (r.v0 + r.v1) / 2, D / 2 - T / 2, M.wall);
  }
  const backOps = [{ u0: -0.45, u1: 0.45, v0: winY0, v1: winY1 }];
  for (const r of wallRects(W, WH, backOps)) {
    part(r.u1 - r.u0, r.v1 - r.v0, T, (r.u0 + r.u1) / 2, yb + (r.v0 + r.v1) / 2, -D / 2 + T / 2, M.wall);
  }

  // side walls run along z (between front and back walls)
  const SL = D - T * 2;
  const leftOps = [{ u0: -0.5, u1: 0.5, v0: winY0, v1: winY1 }];
  for (const r of wallRects(SL, WH, leftOps)) {
    part(T, r.v1 - r.v0, r.u1 - r.u0, -W / 2 + T / 2, yb + (r.v0 + r.v1) / 2, (r.u0 + r.u1) / 2, M.wall);
  }
  part(T, WH, SL, W / 2 - T / 2, yb + WH / 2, 0, M.wall);   // right wall (chimney side)

  // --- timber framing: corner posts, top & bottom plates ---
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      part(0.34, WH + 0.2, 0.34, sx * (W / 2 - 0.1), yb + WH / 2 + 0.05, sz * (D / 2 - 0.1), M.darkWood);
    }
  }
  // (every piece sits at its own depth/height so no two faces share a plane)
  for (const sz of [-1, 1]) {
    part(W - 0.04, 0.22, 0.28, 0, yt - 0.05, sz * (D / 2 - 0.1), M.darkWood);
    part(W - 0.04, 0.2, 0.24, 0, yb + 0.1, sz * (D / 2 - 0.08), M.darkWood);
  }
  for (const sx of [-1, 1]) {
    part(0.28, 0.17, D - 0.02, sx * (W / 2 - 0.1), yt - 0.055, 0, M.darkWood);
    part(0.24, 0.18, D - 0.02, sx * (W / 2 - 0.08), yb + 0.09, 0, M.darkWood);
  }
  // extra studs on the back and right walls
  for (const x of [-1.5, 1.5]) part(0.14, WH - 0.4, 0.1, x, yb + WH / 2, -D / 2 - 0.02, M.darkWood);
  for (const z of [-1.1, 1.1]) part(0.1, WH - 0.4, 0.14, W / 2 + 0.02, yb + WH / 2, z, M.darkWood);

  // --- door ---
  const doorZ = D / 2 - 0.03;
  part(0.12, doorH + 0.1, 0.22, -doorW / 2 - 0.04, yf + doorH / 2, D / 2 - 0.05, M.darkWood);
  part(0.12, doorH + 0.1, 0.22, doorW / 2 + 0.04, yf + doorH / 2, D / 2 - 0.05, M.darkWood);
  part(doorW + 0.4, 0.18, 0.26, 0, yf + doorH + 0.07, D / 2 - 0.05, M.darkWood);
  part(doorW + 0.3, 0.1, 0.3, 0, yf + 0.05, D / 2 + 0.05, M.stone, { cast: false });

  const pivot = new THREE.Group();
  pivot.position.set(-doorW / 2 + 0.02, yf + 0.12 + (doorH - 0.14) / 2, doorZ);
  pivot.rotation.y = 0;                           // closed; it swings open when the villager walks up
  g.add(pivot);
  door.pivot = pivot;
  door.x = HOME.x;
  door.z = HOME.z + doorZ;
  const leaf = new THREE.Mesh(texBox(doorW - 0.04, doorH - 0.14, 0.07), M.wood);
  leaf.position.set((doorW - 0.04) / 2, 0, 0);
  leaf.castShadow = true;
  pivot.add(leaf);
  const handle = new THREE.Mesh(texBox(0.06, 0.06, 0.12), flat('#2b2622'));
  handle.position.set(doorW - 0.2, -0.05, 0);
  pivot.add(handle);
  for (const hy of [-0.6, 0.6]) {
    const hinge = new THREE.Mesh(texBox(0.34, 0.07, 0.09), flat('#2b2622'));
    hinge.position.set(0.18, hy, 0);
    pivot.add(hinge);
  }

  // --- windows ---
  const glass = glowMat('#ffd49a', 0.6);

  function windowFront(cx, flowers) {
    const cy = yf + (winY0 + winY1) / 2;
    const wz = D / 2 - T / 2;
    const gl = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.06, winY1 - winY0 - 0.06, 0.03), glass);
    gl.position.set(cx, cy, wz);
    g.add(gl);
    const fz = D / 2 + 0.02;
    part(0.08, winY1 - winY0 + 0.08, 0.14, cx - winW / 2 - 0.02, cy, fz, M.darkWood);
    part(0.08, winY1 - winY0 + 0.08, 0.14, cx + winW / 2 + 0.02, cy, fz, M.darkWood);
    part(winW + 0.2, 0.08, 0.18, cx, cy + (winY1 - winY0) / 2 + 0.02, fz, M.darkWood);
    part(winW + 0.3, 0.08, 0.3, cx, cy - (winY1 - winY0) / 2 - 0.02, D / 2 + 0.1, M.wood);
    part(0.05, winY1 - winY0, 0.06, cx, cy, fz + 0.02, M.darkWood);
    part(winW, 0.05, 0.04, cx, cy, fz + 0.015, M.darkWood);
    if (flowers) {
      part(winW + 0.1, 0.2, 0.26, cx, cy - (winY1 - winY0) / 2 - 0.22, D / 2 + 0.2, M.wood);
      const cols = ['#e46c7a', '#f2d45c', '#f4f0e0', '#e46c7a', '#a98fe0'];
      for (let k = 0; k < 5; k++) {
        part(0.14, 0.2, 0.14, cx - 0.36 + k * 0.18, cy - (winY1 - winY0) / 2 - 0.02, D / 2 + 0.2,
          flat(k % 2 ? '#5f8a45' : cols[k]), { cast: false });
      }
    }
  }
  windowFront(-winX, true);
  windowFront(winX, false);

  // side + back windows (rotated copies of the same idea)
  function windowSide(axis, sign) {
    const cy = yf + (winY0 + winY1) / 2;
    if (axis === 'x') {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, winY1 - winY0 - 0.06, 0.94), glass);
      gl.position.set(sign * (W / 2 - T / 2), cy, 0);
      g.add(gl);
      for (const dz of [-0.5, 0.5]) part(0.14, winY1 - winY0 + 0.08, 0.08, sign * (W / 2 + 0.02), cy, dz, M.darkWood);
      part(0.18, 0.08, 1.2, sign * (W / 2 + 0.02), cy + (winY1 - winY0) / 2 + 0.02, 0, M.darkWood);
      part(0.3, 0.08, 1.2, sign * (W / 2 + 0.1), cy - (winY1 - winY0) / 2 - 0.02, 0, M.wood);
    } else {
      const gl = new THREE.Mesh(new THREE.BoxGeometry(0.84, winY1 - winY0 - 0.06, 0.03), glass);
      gl.position.set(0, cy, sign * (D / 2 - T / 2));
      g.add(gl);
      for (const dx of [-0.46, 0.46]) part(0.08, winY1 - winY0 + 0.08, 0.14, dx, cy, sign * (D / 2 + 0.02), M.darkWood);
      part(1.1, 0.08, 0.18, 0, cy + (winY1 - winY0) / 2 + 0.02, sign * (D / 2 + 0.02), M.darkWood);
      part(1.2, 0.08, 0.3, 0, cy - (winY1 - winY0) / 2 - 0.02, sign * (D / 2 + 0.1), M.wood);
    }
  }
  windowSide('x', -1);
  windowSide('z', -1);

  // --- gable roof ---
  const halfSpan = W / 2 + 0.6;
  const tanA = 0.62;
  const ang = Math.atan(tanA);
  const eaveY = yt - 0.2;
  const slabLen = Math.hypot(halfSpan, halfSpan * tanA) + 0.1;
  const thick = 0.14;
  const RD = D + 0.9;
  const roofMat = M.roof.clone();
  const roofDark = M.darkWood.clone();
  const roofFlat = flat('#2a211b').clone();
  roofMats.length = 0;
  roofMats.push(roofMat, roofDark, roofFlat);
  roofParts.length = 0;

  for (const s of [-1, 1]) {
    const nx = Math.sin(ang) * s;
    const ny = Math.cos(ang);
    // the two halves differ by 3cm in depth so their end faces never share a plane
    const m = new THREE.Mesh(texBox(slabLen, thick, RD + (s > 0 ? 0.03 : 0)), roofMat);
    m.position.set(s * halfSpan / 2 - nx * thick / 2, eaveY + halfSpan * tanA / 2 - ny * thick / 2, 0);
    m.rotation.z = -s * ang;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    roofParts.push(m);
  }
  roofParts.push(part(0.3, 0.16, RD + 0.04, 0, eaveY + halfSpan * tanA + 0.02, 0, roofDark));

  // gable end triangles, filled with the wall material
  const peak = eaveY + halfSpan * tanA - thick / Math.cos(ang) - yt;
  const gableGeo = new THREE.BufferGeometry();
  gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-W / 2, 0, 0, W / 2, 0, 0, 0, peak, 0], 3));
  gableGeo.setAttribute('uv', new THREE.Float32BufferAttribute(
    [(-W / 2) / TILE, 0, (W / 2) / TILE, 0, 0, peak / TILE], 2));
  gableGeo.setIndex([0, 1, 2]);
  gableGeo.computeVertexNormals();
  const gableMat = M.wall.clone();
  gableMat.side = THREE.DoubleSide;
  roofMats.push(gableMat);
  for (const m of roofMats) m.transparent = true;   // so the roof can glide to near-invisible
  for (const sz of [-1, 1]) {
    const tri = new THREE.Mesh(gableGeo, gableMat);
    tri.position.set(0, yt, sz * (D / 2 - 0.06));
    tri.castShadow = true;
    g.add(tri);
    roofParts.push(tri);
  }
  // little attic vent
  roofParts.push(part(0.5, 0.5, 0.06, 0, yt + 0.62, D / 2 + 0.0, roofDark));
  roofParts.push(part(0.34, 0.34, 0.07, 0, yt + 0.62, D / 2 + 0.01, roofFlat, { cast: false }));

  // --- chimney ---
  const cxp = W / 2 + 0.38;
  const topY = yt + 2.1;
  part(0.9, topY + 0.7, 0.9, cxp, (topY - 0.7) / 2, -0.4, M.stone);
  part(1.06, 0.16, 1.06, cxp, topY + 0.08, -0.4, M.stone);
  part(0.5, 0.05, 0.5, cxp, topY + 0.17, -0.4, flat('#1d1a18'), { cast: false });

  smoke.length = 0;
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: '#dfe3e6', transparent: true, opacity: 0.5, depthWrite: false });
    const puff = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    puff.userData = { i, x: HOME.x + cxp, y: HOME.y + topY + 0.3, z: HOME.z - 0.4 };
    scene.add(puff);
    smoke.push(puff);
  }

  // --- interior ---
  const iz = -D / 2 + T;
  part(1.05, 0.3, 2.0, -1.55, yf + 0.23, iz + 1.1, M.wood);                       // bed frame
  part(0.95, 0.14, 1.9, -1.55, yf + 0.45, iz + 1.1, flat('#b9503f'), { cast: false });
  part(0.75, 0.1, 0.38, -1.55, yf + 0.54, iz + 0.38, flat('#ece3cd'), { cast: false });
  part(1.1, 0.07, 0.75, 0.85, yf + 0.8, iz + 0.65, M.wood);                       // table
  for (const lx of [0.4, 1.3]) for (const lz of [iz + 0.35, iz + 0.95]) {
    part(0.08, 0.77, 0.08, lx, yf + 0.4, lz, M.darkWood);
  }
  part(0.34, 0.38, 0.34, 0.2, yf + 0.27, iz + 1.4, M.wood);                       // stools
  part(0.34, 0.38, 0.34, 0.8, yf + 0.27, iz + 1.6, M.wood);
  // shelves either side of the back window (they used to cover it)
  part(1.2, 0.06, 0.3, 1.4, yf + 1.55, iz + 0.15, M.wood);
  for (const [jx, c] of [[0.95, '#6d9fb0'], [1.25, '#c9a24a'], [1.55, '#b9503f'], [1.85, '#7ea65b']]) {
    part(0.16, 0.24, 0.16, jx, yf + 1.7, iz + 0.15, flat(c), { cast: false });
  }
  part(0.9, 0.06, 0.3, -1.45, yf + 1.55, iz + 0.15, M.wood);
  for (const [bx, c, h] of [[-1.8, '#7a3b34', 0.22], [-1.72, '#3f6a8a', 0.26], [-1.64, '#c9a24a', 0.2]]) {
    part(0.07, h, 0.17, bx, yf + 1.58 + h / 2, iz + 0.15, flat(c), { cast: false });   // books
  }
  part(0.07, 0.16, 0.07, -1.15, yf + 1.66, iz + 0.15, flat('#efe6c8'), { cast: false });   // candle
  part(0.05, 0.07, 0.05, -1.15, yf + 1.78, iz + 0.15, glowMat('#ffcf5a'));

  // --- fireplace on the chimney wall: stone surround, mantel, logs and flames ---
  const fpx = W / 2 - T;          // inner face of the right wall
  const fz0 = -0.4;               // lines up with the chimney outside
  part(0.62, 0.1, 1.45, fpx - 0.31, yf + 0.13, fz0, M.stone);                          // hearth slab
  for (const dz of [-0.46, 0.46]) {
    part(0.42, 1.05, 0.22, fpx - 0.21, yf + 0.605, fz0 + dz, M.stone);                  // pillars
  }
  part(0.46, 0.2, 1.3, fpx - 0.23, yf + 1.23, fz0, M.stone);                           // lintel
  part(0.4, 1.17, 1.0, fpx - 0.2, yf + 1.915, fz0, M.stone);                           // chimney breast
  part(0.5, 0.06, 1.45, fpx - 0.25, yf + 1.36, fz0, M.wood);                           // mantel shelf
  part(0.04, 0.95, 0.7, fpx - 0.03, yf + 0.655, fz0, flat('#1d1a18'), { cast: false }); // soot-black back
  part(0.4, 0.04, 0.6, fpx - 0.4, yf + 0.2, fz0, glowMat('#ff6a1f'));                  // ember bed
  part(0.55, 0.1, 0.1, fpx - 0.35, yf + 0.27, fz0 - 0.08, M.darkWood, { ry: 0.45 });   // logs
  part(0.55, 0.1, 0.1, fpx - 0.35, yf + 0.36, fz0 + 0.08, M.darkWood, { ry: -0.5 });
  hearthFlames.length = 0;
  const fOuter = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 5), glowMat('#ff7a1f'));
  fOuter.position.set(fpx - 0.35, yf + 0.5, fz0);
  g.add(fOuter);
  const fInner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 5), glowMat('#ffd05a'));
  fInner.position.set(fpx - 0.35, yf + 0.42, fz0);
  g.add(fInner);
  hearthFlames.push(fOuter, fInner);
  fireplaceLight = new THREE.PointLight('#ff8a3a', 7, 5, 2);
  fireplaceLight.position.set(fpx - 0.45, yf + 0.55, fz0);
  g.add(fireplaceLight);

  houseLight = new THREE.PointLight('#ffb36b', 9, 8, 2);
  houseLight.position.set(0, yf + 1.7, 0.2);
  g.add(houseLight);

  // --- outside details ---
  // woodpile
  // logs run along z, stacked side-by-side in x and in rows; lengths differ
  // so end faces never line up with their neighbours
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 4 - row; k++) {
      const len = 1.3 + (((k * 7 + row * 3) % 5) * 0.05);
      const zOff = (((k + row * 2) % 3) - 1) * 0.05;
      part(0.3, 0.3, len, -W / 2 - 1.05 + (k + row * 0.5 - 1.5) * 0.32, 0.16 + row * 0.28, -0.4 + zOff, M.wood);
    }
  }
  // barrel
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.9, 10), M.wood);
  barrel.position.set(W / 2 + 0.4, 0.45, D / 2 + 0.55);
  barrel.castShadow = true;
  g.add(barrel);
  // lantern post by the step
  part(0.1, 1.5, 0.1, 1.5, 0.75, D / 2 + 0.95, M.darkWood);
  part(0.35, 0.05, 0.05, 1.67, 1.45, D / 2 + 0.95, M.darkWood);
  part(0.2, 0.26, 0.2, 1.83, 1.28, D / 2 + 0.95, glowMat('#ffcf7a'));

  // ---- colliders (house-local coords -> world) ----
  const hx = HOME.x;
  const hz = HOME.z;
  const box = (x0, x1, z0, z1, top) => addBox(hx + x0, hx + x1, hz + z0, hz + z1, top);
  box(-2.55, 2.55, -2.15, -1.68);       // back wall + foundation
  box(-2.55, -2.08, -2.15, 2.15);       // left wall
  box(2.08, 2.55, -2.15, 2.15);         // right wall
  box(-2.55, -doorW / 2, 1.68, 2.15);   // front wall, left of the door
  box(doorW / 2, 2.55, 1.68, 2.15);     // front wall, right of the door
  box(2.2, 3.15, -0.9, 0.1);            // chimney
  box(-3.95, -2.7, -1.1, 0.3, HOME.y + 0.9);   // woodpile (hop on top)
  addCircle(hx + W / 2 + 0.4, hz + D / 2 + 0.55, 0.4, HOME.y + 0.9);   // barrel
  addCircle(hx + 1.5, hz + D / 2 + 0.95, 0.12);          // lantern post
  box(-2.07, -1.02, -1.58, 0.42, HOME.y + 1.05);   // bed
  box(0.3, 1.4, -1.4, -0.65, HOME.y + 1.34);       // table
  box(1.46, 2.08, -1.12, 0.33);                    // fireplace (tall: never stand in it)
  addCircle(hx + 0.2, hz - 0.28, 0.22, HOME.y + 0.96);   // stools
  addCircle(hx + 0.8, hz - 0.08, 0.22, HOME.y + 0.96);
}

// ==================================================
// FARM PLOT
// ==================================================

function buildFarm(fx, fz) {
  const g = new THREE.Group();
  const y = groundY(fx, fz);
  g.position.set(fx, y, fz);
  scene.add(g);

  const part = (w, h, d, x, yy, z, material, cast = true) => {
    const m = new THREE.Mesh(texBox(w, h, d), material);
    m.position.set(x, yy, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  for (let row = 0; row < 3; row++) {
    const z = (row - 1) * 0.95;
    part(4.0, 0.16, 0.76, 0, 0.06, z, M.soil, false);
    for (let col = 0; col < 7; col++) {
      const x = -1.55 + col * 0.52;
      if (row === 0) part(0.12, 0.5, 0.12, x, 0.4, z, flat('#8aa84a'), false);
      else if (row === 1) {
        part(0.14, 0.7, 0.14, x, 0.5, z, flat('#c9b24a'), false);
        part(0.2, 0.2, 0.2, x, 0.88, z, flat('#d8c25a'), false);
      } else part(0.3, 0.26, 0.3, x, 0.27, z, flat('#df7a24'), false);
    }
  }

  // fence with a gate gap on the south side
  const post = (x, z) => part(0.13, 0.9, 0.13, x, 0.4, z, M.darkWood);
  for (let i = 0; i <= 6; i++) {
    const x = -2.25 + i * 0.75;
    post(x, -1.8);
    if (Math.abs(x) > 0.5) post(x, 1.8);
  }
  for (let i = 1; i < 5; i++) {
    post(-2.25, -1.8 + i * 0.72);
    post(2.25, -1.8 + i * 0.72);
  }
  for (const yy of [0.35, 0.7]) {
    part(4.5, 0.09, 0.09, 0, yy, -1.8, M.wood);
    part(1.75, 0.09, 0.09, -1.4, yy, 1.8, M.wood);
    part(1.75, 0.09, 0.09, 1.4, yy, 1.8, M.wood);
    part(0.09, 0.09, 3.6, -2.25, yy, 0, M.wood);
    part(0.09, 0.09, 3.6, 2.25, yy, 0, M.wood);
  }

  // fence colliders (with the gate gap on the south side)
  const fenceTop = y + 0.8;            // low enough to jump over (or onto)
  addBox(fx - 2.35, fx + 2.35, fz - 1.9, fz - 1.7, fenceTop);
  addBox(fx - 2.35, fx - 2.15, fz - 1.9, fz + 1.9, fenceTop);
  addBox(fx + 2.15, fx + 2.35, fz - 1.9, fz + 1.9, fenceTop);
  addBox(fx - 2.35, fx - 0.5, fz + 1.7, fz + 1.9, fenceTop);
  addBox(fx + 0.5, fx + 2.35, fz + 1.7, fz + 1.9, fenceTop);
  addCircle(fx + 1.3, fz - 0.05, 0.15);   // scarecrow

  // scarecrow
  part(0.1, 1.7, 0.1, 1.3, 0.85, -0.05, M.darkWood);
  part(1.1, 0.08, 0.08, 1.3, 1.25, -0.05, M.darkWood);
  part(0.32, 0.32, 0.32, 1.3, 1.78, -0.05, flat('#d9c58f'));
  part(0.55, 0.06, 0.55, 1.3, 1.97, -0.05, flat('#5a3c24'));
  part(0.3, 0.22, 0.3, 1.3, 2.1, -0.05, flat('#5a3c24'));
  part(0.5, 0.5, 0.16, 1.3, 1.0, -0.05, flat('#8c4a3a'));
}

// ==================================================
// CAMPFIRE
// ==================================================

let fireLight;
let flameOuter;
let flameInner;
const embers = [];

function buildCampfire(fx, fz) {
  const y = groundY(fx, fz);
  const g = new THREE.Group();
  g.position.set(fx, y, fz);
  scene.add(g);

  const add = (w, h, d, x, yy, z, material, ry = 0) => {
    const m = new THREE.Mesh(texBox(w, h, d), material);
    m.position.set(x, yy, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  addCircle(fx, fz, 0.6);                        // the fire itself (the stone ring is low enough to step over)
  for (const [sx, sz] of [[-1.9, 0.6], [1.7, 1.2], [0.2, -2.0]]) {
    addCircle(fx + sx, fz + sz, 0.45, groundY(fx + sx, fz + sz) + 0.44);   // log seats: jump onto them
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    add(0.3, 0.22, 0.3, Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7, M.stone, a);
  }
  add(1.2, 0.18, 0.2, 0, 0.2, 0, M.darkWood, 0.55);
  add(1.1, 0.16, 0.2, 0, 0.3, 0, M.darkWood, -0.55);
  add(1.0, 0.14, 0.2, 0, 0.14, 0, M.darkWood, 1.9);

  // log seats
  for (const [sx, sz, ry] of [[-1.9, 0.6, 0.3], [1.7, 1.2, -0.5], [0.2, -2.0, 1.4]]) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.5, 8), M.wood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = ry;
    log.position.set(sx, 0.22, sz);
    log.castShadow = true;
    g.add(log);
  }

  flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.0, 5), glowMat('#d9561f'));
  flameOuter.position.set(0, 0.75, 0);
  g.add(flameOuter);
  flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.65, 5), glowMat('#ffc85a'));
  flameInner.position.set(0, 0.62, 0);
  g.add(flameInner);

  for (let i = 0; i < 5; i++) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), glowMat('#ffb14a'));
    e.userData = { seed: i * 1.7 };
    g.add(e);
    embers.push(e);
  }

  fireLight = new THREE.PointLight('#ff9a47', 40, 22, 2);
  fireLight.position.set(0, 1.2, 0);
  g.add(fireLight);
}

// ==================================================
// PLAYER — a low-poly villager
// Tapered, faceted boxes (flat-shaded) in the spirit of
// chunky low-poly characters: big head, square eyes,
// vest over a tunic, kerchief, belt, boots, straw hat.
// ==================================================

const C = {
  skin: '#e8956a', skinD: '#d4805a', hair: '#4a2f22',
  tunic: '#e4dabd', tunicD: '#d1c5a4', vest: '#5f7a3a',
  kerchief: '#b8452f', belt: '#4a3222', buckle: '#d9b44a', pouch: '#7a5434',
  trouser: '#6b5238', patch: '#9a8456', boot: '#4a3222', bootCuff: '#6b4a30', sole: '#2a1d15',
  eyeW: '#f6f3ea', pupil: '#25252b', straw: '#d8b85c', band: '#8a3b2d', button: '#3a2a1f',
};

function hash3(x, y, z) {
  const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

// Box with optional taper (bottom/top width + depth) and slight vertex jitter,
// which gives flat shading that faceted, hand-modelled look.
function taper(wBot, wTop, h, dBot, dTop, seg = 1, jitter = 0) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    if (jitter > 0) {
      const corner = (Math.abs(x) > 0.499) + (Math.abs(y) > 0.499) + (Math.abs(z) > 0.499);
      if (corner < 3) {
        const ox = x, oy = y, oz = z;
        x += (hash3(ox, oy, oz) - 0.5) * jitter;
        y += (hash3(oy, oz, ox + 3) - 0.5) * jitter;
        z += (hash3(oz, ox + 7, oy) - 0.5) * jitter;
      }
    }
    const t = y + 0.5;
    p.setXYZ(i, x * lerp(wBot, wTop, t), y * h, z * lerp(dBot, dTop, t));
  }
  g.computeVertexNormals();
  return g;
}

const player = {
  group: null, hips: null, head: null, hat: null,
  legL: null, legR: null, armL: null, armR: null, foreL: null, foreR: null,
  vx: 0, vz: 0, vy: 0,
  heading: 0, speed: 0, phase: 0,
  grounded: true, swimming: false, climbing: false, climbHold: 0, surfSpeed: 0, r: 0.28,
};

function buildPlayer() {
  const group = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.5;
  group.add(hips);

  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mk = (geo, color, parent, x, y, z, rot) => {
    const m = new THREE.Mesh(geo, flat(color));
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot.x || 0, rot.y || 0, rot.z || 0);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const Yh = (y) => y - 0.5;          // height above the feet -> relative to hips

  // ---- torso: linen tunic, open leather-green vest, belt ----
  mk(taper(0.44, 0.54, 0.52, 0.30, 0.32, 2, 0.04), C.tunic, hips, 0, Yh(0.76), 0);
  mk(taper(0.50, 0.46, 0.14, 0.34, 0.30), C.tunicD, hips, 0, Yh(0.45), 0);          // tunic hem
  mk(taper(0.48, 0.58, 0.42, 0.34, 0.36), C.vest, hips, 0, Yh(0.77), 0);
  mk(box(0.11, 0.42, 0.024), C.tunic, hips, 0, Yh(0.77), 0.184);                    // shirt showing in the vest opening
  mk(box(0.035, 0.035, 0.012), C.button, hips, 0, Yh(0.86), 0.2);
  mk(box(0.035, 0.035, 0.012), C.button, hips, 0, Yh(0.70), 0.2);
  mk(box(0.55, 0.07, 0.39), C.belt, hips, 0, Yh(0.58), 0);
  mk(box(0.09, 0.08, 0.02), C.buckle, hips, 0, Yh(0.58), 0.2);
  mk(box(0.13, 0.15, 0.08), C.pouch, hips, 0.29, Yh(0.52), 0.06);

  // ---- neck + kerchief ----
  mk(box(0.15, 0.08, 0.15), C.skin, hips, 0, Yh(1.04), 0);
  mk(taper(0.30, 0.34, 0.1, 0.26, 0.30), C.kerchief, hips, 0, Yh(1.025), 0);
  mk(box(0.08, 0.08, 0.04), C.kerchief, hips, 0, Yh(0.985), 0.17, { z: 0.785 });

  // ---- head ----
  const HY = 1.02;                    // neck pivot height
  const head = new THREE.Group();
  head.position.set(0, Yh(HY), 0);
  hips.add(head);

  mk(taper(0.50, 0.64, 0.56, 0.46, 0.56, 2, 0.05), C.skin, head, 0, 1.32 - HY, 0);
  for (const s of [-1, 1]) {
    mk(box(0.16, 0.12, 0.04), C.eyeW, head, s * 0.15, 1.36 - HY, 0.26);              // eye whites
    mk(box(0.07, 0.10, 0.04), C.pupil, head, s * 0.12, 1.36 - HY, 0.275);            // pupils, looking inward
    mk(box(0.07, 0.15, 0.10), C.skinD, head, s * 0.31, 1.30 - HY, 0);                // ears
    mk(box(0.05, 0.14, 0.07), C.hair, head, s * 0.295, 1.42 - HY, 0.02);            // sideburns
  }
  // hair cap: its top must stay INSIDE the hat brim's thickness (1.65-1.69), otherwise its corners
  // poke up through the brim around the round crown and look like the head showing through the hat
  mk(taper(0.66, 0.68, 0.18, 0.60, 0.60), C.hair, head, 0, 1.565 - HY, 0);           // hair cap
  mk(box(0.62, 0.38, 0.10), C.hair, head, 0, 1.42 - HY, -0.27);                      // back of the hair
  mk(box(0.60, 0.08, 0.06), C.hair, head, 0, 1.555 - HY, 0.287);                     // fringe

  // straw hat (toggle with H)
  const hat = new THREE.Group();
  hat.position.set(0, 1.67 - HY, 0);
  hat.rotation.z = 0.05;
  head.add(hat);
  const cyl = (rt, rb, h, color, y) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 10), flat(color));
    m.position.y = y;
    m.castShadow = true;
    hat.add(m);
  };
  cyl(0.56, 0.56, 0.035, C.straw, 0);          // brim
  cyl(0.30, 0.34, 0.23, C.straw, 0.105);       // crown
  cyl(0.355, 0.355, 0.045, C.band, 0.03);      // hat band

  // ---- arms: rolled linen sleeves, bare forearms ----
  const makeArm = (s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.31, Yh(0.95), 0);
    hips.add(arm);
    mk(box(0.16, 0.26, 0.17), C.tunic, arm, 0, -0.12, 0);
    mk(box(0.18, 0.05, 0.19), C.tunicD, arm, 0, -0.25, 0);
    const fore = new THREE.Group();
    fore.position.set(0, -0.25, 0);
    arm.add(fore);
    mk(box(0.13, 0.21, 0.14), C.skin, fore, 0, -0.105, 0);
    mk(box(0.12, 0.11, 0.12), C.skin, fore, 0, -0.25, 0);
    return { arm, fore };
  };
  const aL = makeArm(-1);
  const aR = makeArm(1);

  // ---- legs: patched trousers, leather boots ----
  const makeLeg = (s, patch) => {
    const leg = new THREE.Group();
    leg.position.set(s * 0.125, 0, 0);
    hips.add(leg);
    mk(box(0.17, 0.36, 0.19), C.trouser, leg, 0, -0.19, 0);
    if (patch) mk(box(0.11, 0.1, 0.02), C.patch, leg, 0, -0.2, 0.1);
    mk(box(0.19, 0.17, 0.30), C.boot, leg, 0, -0.415, 0.04);
    mk(box(0.2, 0.04, 0.2), C.bootCuff, leg, 0, -0.34, 0);
    mk(box(0.21, 0.03, 0.33), C.sole, leg, 0, -0.485, 0.04);
    return leg;
  };

  Object.assign(player, {
    group, hips, head, hat,
    armL: aL.arm, foreL: aL.fore, armR: aR.arm, foreR: aR.fore,
    legL: makeLeg(-1, true), legR: makeLeg(1, false),
  });

  scene.add(group);

  // spawn on the path in front of the cottage, facing the camera
  const sx = 0.4;
  const sz = 6.4;
  group.position.set(sx, surfaceY(sx, sz), sz);
  player.heading = Math.atan2(0.6, 0.8);
  group.rotation.y = player.heading;
}

// ---------- walkable surface (terrain + doorstep + cottage floor) ----------

function surfaceY(x, z) {
  const lx = x - HOME.x;
  const lz = z - HOME.z;
  if (Math.abs(lx) < 2.08 && Math.abs(lz) < 1.68) return HOME.y + 0.58;          // cottage floor
  if (Math.abs(lx) < 0.5 && lz >= 1.68 && lz < 2.15) return HOME.y + 0.6;        // threshold
  const y = groundY(x, z);
  if (Math.abs(lx) < 0.95 && lz >= 2.15 && lz < 2.8) return Math.max(y, HOME.y + 0.26);   // front step
  return y;
}

// ---------- movement ----------

const EDGE_GRAB = 0.14;       // forgiveness: you can land with your centre just past the edge
const WALK_SPEED = 4.6;
const SPRINT_SPEED = 8.4;
const CLIMB_START = 0.95;     // slope where walking turns into climbing (~43 degrees)
const CLIMB_MAX = 3.3;        // steeper than this is a sheer cliff

// Height of whatever he can stand on at (x, z): terrain, doorstep, cottage floor,
// or the top of a low object (fence, rock, log, bed...) that is within reach.
function supportY(x, z, feetY) {
  let y = surfaceY(x, z);
  const reach = feetY + STEP_UP + 0.05;
  const cx = Math.floor(x / CGRID);
  const cz = Math.floor(z / CGRID);
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const list = colGrid.get((gx + 512) * 1024 + (gz + 512));
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c[3] > 1e8 || c[3] > reach || c[3] <= y) continue;
        const dx = x - c[0];
        const dz = z - c[1];
        if (dx * dx + dz * dz < (c[2] + EDGE_GRAB) * (c[2] + EDGE_GRAB)) y = c[3];
      }
    }
  }
  for (let i = 0; i < colBoxes.length; i++) {
    const b = colBoxes[i];
    if (b[4] > 1e8 || b[4] > reach || b[4] <= y) continue;
    if (x >= b[0] - EDGE_GRAB && x <= b[1] + EDGE_GRAB && z >= b[2] - EDGE_GRAB && z <= b[3] + EDGE_GRAB) y = b[4];
  }
  return y;
}

// The cottage roof is a ceiling: no more heads through the eaves.
const ROOF = { halfSpan: 2.9, tanA: 0.62, eaveY: 2.8, thick: 0.14, halfD: 2.4 };
const ROOF_COS = Math.cos(Math.atan(ROOF.tanA));
function roofUnderside(x, z) {
  const lx = Math.abs(x - HOME.x);
  const lz = Math.abs(z - HOME.z);
  if (lx > ROOF.halfSpan || lz > ROOF.halfD) return Infinity;
  return HOME.y + ROOF.eaveY + (ROOF.halfSpan - lx) * ROOF.tanA - ROOF.thick / ROOF_COS;
}

function headHeight() {
  return player.hat && player.hat.visible ? 1.95 : 1.72;
}

function tryMove(dx, dz) {
  const pos = player.group.position;
  const c = resolveCollisions(pos.x + dx, pos.z + dz, player.r, pos.y);
  const nx = c.x;
  const nz = c.z;

  // The roof's eaves are solid: you can't slide sideways into them with your head
  // inside the roof. (You can only get under once you've dropped low enough.)
  const under = roofUnderside(nx, nz);
  if (under < Infinity && pos.y + headHeight() > under - 0.02 && pos.y < under + 0.35) return false;

  if (player.grounded && !player.swimming) {
    const sOld = supportY(pos.x, pos.z, pos.y);
    const sNew = supportY(nx, nz, pos.y);
    const dist = Math.hypot(nx - pos.x, nz - pos.z);
    const slope = dist > 1e-5 ? (groundY(nx, nz) - groundY(pos.x, pos.z)) / dist : 0;
    if (sNew - sOld > 0.5 || slope > CLIMB_MAX + 0.6) return false;   // a sheer face
  }
  pos.x = nx;
  pos.z = nz;
  return true;
}

function updatePlayer(dt, t) {
  const p = player;
  const pos = p.group.position;

  // input, relative to the camera
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  rightV.set(-forward.z, 0, forward.x);
  move.set(0, 0, 0);
  if (keys.has('KeyW') || keys.has('ArrowUp')) move.add(forward);
  if (keys.has('KeyS') || keys.has('ArrowDown')) move.sub(forward);
  if (keys.has('KeyD') || keys.has('ArrowRight')) move.add(rightV);
  if (keys.has('KeyA') || keys.has('ArrowLeft')) move.sub(rightV);
  const wants = move.lengthSq() > 0;
  if (wants) move.normalize();

  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const depth = SEA - surfaceY(pos.x, pos.z);        // > 0 when the ground is under water
  p.swimming = depth > 0.6;

  // how steep is the ground in front of us? (steep = slower, and he starts to climb)
  const vmag = Math.hypot(p.vx, p.vz);
  let slopeAhead = 0;
  if (vmag > 0.5) {
    const ax = p.vx / vmag;
    const az = p.vz / vmag;
    slopeAhead = (groundY(pos.x + ax * 0.7, pos.z + az * 0.7) - groundY(pos.x, pos.z)) / 0.7;
  }
  const climbing = p.grounded && !p.swimming && slopeAhead > 1.25;
  p.climbHold += ((climbing ? 1 : 0) - p.climbHold) * (1 - Math.exp(-dt * 6));
  p.climbing = p.climbHold > 0.5;

  // Speed is measured ALONG the ground: on a slope the horizontal part has to shrink,
  // otherwise climbing at 64 degrees would move him along the surface twice as fast
  // as walking. The steeper it gets, the slower the climb; no sprinting up cliffs.
  const steep = smoothstep(0.6, 2.6, slopeAhead);            // 0 on flat ground .. 1 on a near-vertical face
  let maxSpeed = wants ? (sprint ? lerp(SPRINT_SPEED, WALK_SPEED, clamp01(steep * 3)) : WALK_SPEED) : 0;
  if (p.swimming) maxSpeed *= 0.5;
  else if (depth > 0.05) maxSpeed *= 0.8;            // wading
  if (slopeAhead > 0) {
    maxSpeed *= lerp(1, 0.35, steep);                             // up to 65% slower on near-vertical faces
    maxSpeed /= Math.sqrt(1 + slopeAhead * slopeAhead);           // horizontal part of a fixed surface speed
  }
  p.surfSpeed = p.speed * Math.sqrt(1 + Math.max(0, slopeAhead) * Math.max(0, slopeAhead));

  const accel = p.grounded || p.swimming ? 14 : 3;
  const a = 1 - Math.exp(-dt * accel);
  p.vx += (move.x * maxSpeed - p.vx) * a;
  p.vz += (move.z * maxSpeed - p.vz) * a;

  // hard cap: no direction can ever be faster than another
  if (wants) {
    const hv = Math.hypot(p.vx, p.vz);
    if (hv > maxSpeed) {
      p.vx *= maxSpeed / hv;
      p.vz *= maxSpeed / hv;
    }
  }

  // horizontal move with collision + sliding
  const ox = pos.x;
  const oz = pos.z;
  const mx = p.vx * dt;
  const mz = p.vz * dt;
  if (!tryMove(mx, mz)) {
    if (!tryMove(mx, 0)) tryMove(0, mz);
  }
  const lim = HALF - 6;
  pos.x = clamp(pos.x, -lim, lim);
  pos.z = clamp(pos.z, -lim, lim);

  const moved = Math.hypot(pos.x - ox, pos.z - oz) / Math.max(dt, 1e-4);
  p.speed += (moved - p.speed) * (1 - Math.exp(-dt * 12));

  // face the direction of travel
  if (Math.hypot(p.vx, p.vz) > 0.5) {
    const target = Math.atan2(p.vx, p.vz);
    const d = Math.atan2(Math.sin(target - p.heading), Math.cos(target - p.heading));
    p.heading += d * (1 - Math.exp(-dt * 14));
  }
  p.group.rotation.y = p.heading;

  // vertical: ground following, jumping, swimming
  const surf = supportY(pos.x, pos.z, pos.y);
  if (p.swimming) {
    const target = SEA - 0.42 + Math.sin(t * 2.2) * 0.03;
    pos.y += (target - pos.y) * (1 - Math.exp(-dt * 8));
    p.vy = 0;
    p.grounded = false;
  } else if (p.grounded) {
    if (keys.has('Space')) {
      p.vy = 7.4;
      p.grounded = false;
    } else {
      const diff = surf - pos.y;
      if (diff < -0.5) {                        // walked off a ledge
        p.grounded = false;
        p.vy = 0;
      } else {
        pos.y += diff * (1 - Math.exp(-dt * (diff > 0 ? 24 : 18)));
      }
    }
  }
  if (!p.grounded && !p.swimming) {
    p.vy -= 22 * dt;
    pos.y += p.vy * dt;
    if (pos.y <= surf && p.vy <= 0) {
      pos.y = surf;
      p.vy = 0;
      p.grounded = true;
    }
  }

  // ceiling: the cottage roof stops his head
  const headH = headHeight();
  const under = roofUnderside(pos.x, pos.z);
  if (pos.y + headH * 0.55 < under && pos.y > under - headH) {
    pos.y = under - headH;
    if (p.vy > 0) p.vy = 0;
  }
}

// ---------- animation ----------

const pose = {
  legL: 0, legR: 0, armL: 0, armR: 0, foreL: -0.15, foreR: -0.15,
  lean: 0, hipY: 0.5, headYaw: 0, headPitch: 0,
};

function animatePlayer(dt, t) {
  const p = player;
  const spd = p.speed;
  const target = {
    legL: 0, legR: 0, armL: 0, armR: 0, foreL: -0.15, foreR: -0.15,
    lean: 0, hipY: 0.5, headYaw: 0, headPitch: 0,
  };

  if (p.swimming) {
    p.phase += dt * (4 + spd * 1.2);
    const s = Math.sin(p.phase);
    target.lean = 0.9;
    target.headPitch = -0.8;
    target.armL = -1.9 + s * 1.1;
    target.armR = -1.9 - s * 1.1;
    target.foreL = target.foreR = -0.2;
    target.legL = Math.sin(p.phase * 2) * 0.35;
    target.legR = -Math.sin(p.phase * 2) * 0.35;
    target.hipY = 0.5;
  } else if (!p.grounded) {
    target.legL = 0.55;
    target.legR = -0.35;
    target.armL = target.armR = -0.9;
    target.foreL = target.foreR = -0.5;
    target.lean = 0.08;
  } else if (p.climbing && spd > 0.15) {
    p.phase += dt * (1.5 + p.surfSpeed * 0.8);          // cadence follows speed along the slope
    const s = Math.sin(p.phase);
    target.lean = 0.38;                                   // lean into the slope
    target.armL = -2.35 + s * 0.45;                       // reach up and grab
    target.armR = -2.35 - s * 0.45;
    target.foreL = target.foreR = -0.35;
    target.legL = -0.55 + s * 0.55;                       // high knee steps
    target.legR = -0.55 - s * 0.55;
    target.hipY = 0.46;
    target.headPitch = -0.25;
  } else if (spd > 0.3) {
    p.phase += dt * (3.2 + spd * 1.15);
    const amp = clamp(spd / 5, 0, 1.2);
    const legAmp = 0.6 * amp;
    const s = Math.sin(p.phase);
    target.legL = s * legAmp;
    target.legR = -s * legAmp;
    target.armL = -s * amp * 0.8;
    target.armR = s * amp * 0.8;
    target.foreL = -(0.2 + amp * 0.5 * Math.max(0, s));
    target.foreR = -(0.2 + amp * 0.5 * Math.max(0, -s));
    target.hipY = 0.5 - 0.5 * (1 - Math.cos(legAmp * Math.abs(s)));   // feet stay planted
    target.lean = 0.12 * amp;
  } else {
    target.armL = Math.sin(t * 1.6) * 0.04;
    target.armR = -Math.sin(t * 1.6) * 0.04;
    target.headYaw = Math.sin(t * 0.6) * 0.25;
    target.headPitch = Math.sin(t * 0.9) * 0.04;
    target.hipY = 0.5 + Math.sin(t * 2) * 0.006;                       // breathing
  }

  const k = 1 - Math.exp(-dt * 16);
  for (const key of Object.keys(pose)) pose[key] += (target[key] - pose[key]) * k;

  player.legL.rotation.x = pose.legL;
  player.legR.rotation.x = pose.legR;
  player.armL.rotation.x = pose.armL;
  player.armR.rotation.x = pose.armR;
  player.foreL.rotation.x = pose.foreL;
  player.foreR.rotation.x = pose.foreR;
  player.hips.rotation.x = pose.lean;
  player.hips.position.y = pose.hipY;
  player.head.rotation.y = pose.headYaw;
  player.head.rotation.x = pose.headPitch;
}

// ==================================================
// BUILD EVERYTHING
// ==================================================

function showLoading(text) {
  const el = document.createElement('div');
  el.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:#1b2a28;color:#efe6c8;font:600 18px/1.4 monospace;letter-spacing:.12em;z-index:99;';
  el.textContent = text;
  document.body.appendChild(el);
  return el;
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));

async function buildWorld() {
  const overlay = showLoading('GROWING THE WORLD…');
  await nextFrame();
  try {
    generateTerrain();
    buildTerrainMeshes();
    buildWater();
    scatterWorld();
    buildCottage();
    buildFarm(HOME.x - 7, HOME.z + 4.5);
    buildCampfire(HOME.x + 7, HOME.z + 5.5);
    buildPlayer();
    overlay.remove();
  } catch (err) {
    console.error(err);
    overlay.textContent = 'World generation failed: ' + err.message;
    return;
  }

  // camera starts just behind the villager
  const sp = player.group.position;
  controls.target.set(sp.x, sp.y + 1.15, sp.z);
  camera.position.set(sp.x + 8, sp.y + 6.5, sp.z + 11);
  controls.update();

  renderer.setAnimationLoop(frame);
}

// ==================================================
// HUD
// ==================================================

const hud = document.createElement('div');
hud.className = 'game-hud';
hud.innerHTML = `
  <div class="game-title">HEARTH <span>&</span> HOLLOW</div>
  <div class="game-subtitle">THE FRONTIER · EARLY PROTOTYPE</div>
  <div class="game-controls">
    <span>WASD</span> Move
    <span>SHIFT</span> Run
    <span>SPACE</span> Jump
    <span>DRAG</span> Rotate view
    <span>SCROLL</span> Zoom
    <span>H</span> Hat
  </div>
  <div class="game-version">WORLD GENERATION v0.4 · <span id="biome-label"></span></div>
`;
document.body.appendChild(hud);
const biomeLabel = hud.querySelector('#biome-label');
let lastBiomeText = '';

// ==================================================
// INPUT, RESIZE, RENDER LOOP
// ==================================================

const keys = new Set();
const BLOCKED_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
addEventListener('keydown', (e) => {
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (e.code === 'KeyH' && !e.repeat && player.hat) player.hat.visible = !player.hat.visible;
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const forward = new THREE.Vector3();
const rightV = new THREE.Vector3();
const move = new THREE.Vector3();
const shadowCenter = new THREE.Vector3();
const clock = new THREE.Clock();
let roofOpacity = 1;
const ROOF_GHOST = 0.07;     // how visible the roof stays while he's indoors

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const t = clock.elapsedTime;

  updatePlayer(dt, t);
  animatePlayer(dt, t);

  // The camera follows the villager; orbiting and zooming still work around them.
  const pos = player.group.position;
  const lookY = pos.y + (player.swimming ? 0.9 : 1.15);
  const kxz = 1 - Math.exp(-dt * 14);
  const ky = 1 - Math.exp(-dt * 7);
  const dx = (pos.x - controls.target.x) * kxz;
  const dy = (lookY - controls.target.y) * ky;
  const dz = (pos.z - controls.target.z) * kxz;
  controls.target.x += dx;
  controls.target.y += dy;
  controls.target.z += dz;
  camera.position.x += dx;
  camera.position.y += dy;
  camera.position.z += dz;
  controls.update();

  // never let the camera sink into a hill
  const floor = Math.max(groundY(camera.position.x, camera.position.z), SEA) + 0.7;
  if (camera.position.y < floor) camera.position.y = floor;

  // The door swings open as he walks up to it (away from him), and closes behind him.
  if (door.pivot) {
    const ddx = pos.x - door.x;
    const ddz = pos.z - door.z;
    const near = Math.hypot(ddx, ddz) < 1.7 && Math.abs(pos.y - (HOME.y + 0.6)) < 2.2;
    if (near && Math.abs(door.angle) < 0.08) door.dir = ddz > 0 ? 1 : -1;   // from outside: swing inward
    const goal = near ? 1.55 * door.dir : 0;
    door.angle += (goal - door.angle) * (1 - Math.exp(-dt * 7));
    door.pivot.rotation.y = door.angle;
  }

  // The roof glides to a faint ghost (7%) while he's indoors, and back again.
  const inside =
    Math.abs(pos.x - HOME.x) < 2.3 && Math.abs(pos.z - HOME.z) < 1.9 && pos.y > HOME.y + 0.4;
  const roofGoal = inside ? ROOF_GHOST : 1;
  if (Math.abs(roofGoal - roofOpacity) > 0.002) {
    roofOpacity += (roofGoal - roofOpacity) * (1 - Math.exp(-dt * 9));
    if (Math.abs(roofGoal - roofOpacity) <= 0.002) roofOpacity = roofGoal;
    // depthWrite stays ON: if the slabs stopped writing depth while fading, the
    // gable and attic vent (nearer the camera) would get painted over them.
    for (const m of roofMats) m.opacity = roofOpacity;
    for (const part of roofParts) part.castShadow = roofOpacity > 0.5;   // let the sun in
  }

  // shadows follow the villager, snapped to whole shadow-map texels
  shadowCenter.set(controls.target.x, controls.target.y, controls.target.z);
  const sa = shadowCenter.dot(sunRight);
  const sb = shadowCenter.dot(sunUp);
  shadowCenter.addScaledVector(sunRight, Math.round(sa / SHADOW_TEXEL) * SHADOW_TEXEL - sa);
  shadowCenter.addScaledVector(sunUp, Math.round(sb / SHADOW_TEXEL) * SHADOW_TEXEL - sb);
  sun.target.position.copy(shadowCenter);
  sun.position.copy(shadowCenter).add(SUN_OFFSET);

  // biome readout
  const label = BIOME_NAMES[BIOME[vertexAt(pos.x, pos.z)]];
  if (label !== lastBiomeText) {
    lastBiomeText = label;
    biomeLabel.textContent = label.toUpperCase();
  }

  // fireplace
  for (let i = 0; i < hearthFlames.length; i++) {
    hearthFlames[i].scale.y = 1 + Math.sin(t * (9 + i * 2.3) + i) * 0.18;
    hearthFlames[i].rotation.y = t * (1.4 + i);
  }
  if (fireplaceLight) fireplaceLight.intensity = 6.5 + Math.sin(t * 9) * 0.8 + Math.sin(t * 15.7) * 0.4;

  // fire
  if (fireLight) {
    fireLight.intensity = 36 + Math.sin(t * 8) * 4 + Math.sin(t * 13.3) * 2;
    flameOuter.scale.y = 1 + Math.sin(t * 9) * 0.14;
    flameOuter.rotation.y = t * 1.5;
    flameInner.scale.y = 1 + Math.cos(t * 12) * 0.12;
    flameInner.rotation.y = -t * 2;
    for (const e of embers) {
      const k = (t * 0.6 + e.userData.seed) % 1;
      e.position.set(Math.sin(e.userData.seed * 3 + t) * 0.25 * k, 0.6 + k * 1.6, Math.cos(e.userData.seed * 2 + t) * 0.25 * k);
      e.scale.setScalar(1 - k);
    }
  }

  // chimney smoke
  for (const puff of smoke) {
    const k = (t * 0.18 + puff.userData.i / smoke.length) % 1;
    puff.position.set(puff.userData.x + k * 1.6, puff.userData.y + k * 4, puff.userData.z + Math.sin(k * 6 + puff.userData.i) * 0.3);
    puff.scale.setScalar(0.3 + k * 1.1);
    puff.rotation.y = k * 3;
    puff.material.opacity = (1 - k) * 0.5;
  }
  if (houseLight) houseLight.intensity = 8.5 + Math.sin(t * 7) * 0.6;

  // drifting water
  waterTexture.offset.x = t * 0.004;
  waterTexture.offset.y = t * 0.0025;

  renderer.render(scene, camera);
}

buildWorld();
