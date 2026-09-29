import * as THREE from 'three';

/**
 * Central visual identity: soft cel-shaded (NPR) look inspired by
 * traindiorama.netlify.app — a hand-stepped tone ramp via MeshToonMaterial,
 * a muted hand-picked palette, and additive glow sprites for night lights.
 */

// ---- tone ramp (crisp 4-step cel shading, like hand-set step() bands) ----
const ramp = new THREE.DataTexture(new Uint8Array([104, 158, 212, 255]), 4, 1, THREE.RedFormat);
ramp.needsUpdate = true;
ramp.minFilter = THREE.NearestFilter;
ramp.magFilter = THREE.NearestFilter;

export interface ToonOpts {
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  vertexColors?: boolean;
  side?: THREE.Side;
}

const cache = new Map<string, THREE.MeshToonMaterial>();

/** Shared toon material, cached per color so lights stay uniform across props. */
export function toon(color: number, opts: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `${color}-${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshToonMaterial({
    color,
    gradientMap: ramp,
    ...opts,
  });
  cache.set(key, mat);
  return mat;
}

// ---- palette ----
export const PAL = {
  grassLight: 0x86b96f,
  grassBase: 0x6ea45e,
  grassDark: 0x5d8f4e,
  dirtPath: 0xd9b98a,
  dirtPathAlt: 0xcfb083,
  plaza: 0xdcc39a,
  cliff: [0xa08a74, 0x8a7663, 0x75634f, 0x93826c] as const,
  cliffLip: 0x6d5843,
  sand: 0xd9c08c,

  walls: [0xf2e4c8, 0xecd9b8, 0xe4cba7, 0xf6efdd, 0xf0dcbf, 0xe9d3ac] as const,
  roofs: [0xc8483c, 0xb8493b, 0xb47943, 0x8d6b52, 0xa45238, 0xc25c39] as const,
  woodDark: 0x713f28,
  woodMid: 0x9a6b43,
  woodLight: 0xb98c5c,
  stone: 0xa39b8f,
  stoneDark: 0x8a8175,
  iron: 0x4a4a52,
  brick: 0xa56a4e,

  foliage: [0x5e9c62, 0x4f8a5a, 0x6faa58, 0x57975c] as const,
  foliageAutumn: [0xd6ad48, 0xc98a3a] as const,
  trunk: 0x8a6248,
  pine: 0x4f8a5a,

  flowerColors: [0xf5f1e6, 0xe88aa0, 0xe8c85a, 0xb48ae0, 0xe87a5a] as const,

  water: 0x58a8b8,

  skin: [0xf0c9a2, 0xe2b48c, 0xcf9a6e, 0xa06a42] as const,
  shirts: [0xc8483c, 0x5e7fa3, 0x6f9e5a, 0xb55d5d, 0xd6ad48, 0x7a6aa0, 0x49847d, 0xc9803f] as const,
  pants: [0x5a4632, 0x3e4a5a, 0x6b5540, 0x4a4038] as const,
  hair: [0x3a2418, 0x713f28, 0xb47943, 0x8a8175, 0x2b2320] as const,

  glowWarm: 0xffcf7a,
  sheepWool: 0xf2eee2,
  sheepFace: 0x4a4038,
  chickenWhite: 0xf2eee2,
  chickenBrown: 0xc98a5a,
  duckBody: 0x8a6f4f,
  duckHead: 0x3f7a4a,
  dogFur: 0xb47943,
} as const;

// ---- additive glow sprites for night lights ----
let glowTexture: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

export interface GlowSprite {
  sprite: THREE.Sprite;
  base: number; // full-on opacity
}

/** Soft additive halo for windows and lanterns at night. */
export function makeGlow(color: number, scale: number, base = 0.85): GlowSprite {
  const mat = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(scale);
  return { sprite, base };
}

// ---- speech bubble ----
let bubbleTexture: THREE.CanvasTexture | null = null;

function getBubbleTexture(): THREE.CanvasTexture {
  if (bubbleTexture) return bubbleTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(250, 243, 227, 0.96)';
  ctx.strokeStyle = 'rgba(74, 59, 44, 0.85)';
  ctx.lineWidth = 6;
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(24, r);
  ctx.arcTo(24 + 80, 0 + 0, 24 + 80, 0 + r + 8, r); // rounded top corners
  ctx.rect(20, 8, 88, 56);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(56, 62);
  ctx.lineTo(50, 82);
  ctx.lineTo(72, 62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#8a755d';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(46 + i * 18, 36, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
  bubbleTexture = new THREE.CanvasTexture(c);
  return bubbleTexture;
}

export function makeSpeechBubble(): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getBubbleTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  sprite.scale.set(0.95, 0.72, 1);
  sprite.visible = false;
  return sprite;
}

// ---- soft contact-shadow blob (grounds characters like hand-placed minis) ----
let blobTexture: THREE.CanvasTexture | null = null;

function getBlobTexture(): THREE.CanvasTexture {
  if (blobTexture) return blobTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(20,26,16,0.55)');
  grad.addColorStop(0.55, 'rgba(20,26,16,0.3)');
  grad.addColorStop(1, 'rgba(20,26,16,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

const blobGeo = new THREE.PlaneGeometry(1, 1);

/** A flat, soft dark ellipse to place under a character or small prop. */
export function makeBlobShadow(radius: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    blobGeo,
    new THREE.MeshBasicMaterial({
      map: getBlobTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.setScalar(radius * 2);
  mesh.renderOrder = 1;
  return mesh;
}
