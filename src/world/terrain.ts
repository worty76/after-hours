import * as THREE from 'three';
import { makeRng, noise2 } from '../core/rng';
import { PAL } from './materials';
import { HILLS, TERRAIN_RADIUS } from './layout';

const GRASS_BASE = new THREE.Color(PAL.grassBase);
const GRASS_LIGHT = new THREE.Color(PAL.grassLight);
const GRASS_DARK = new THREE.Color(PAL.grassDark);
const FOREST_TINT = new THREE.Color(0x527c48);
const MEADOW_TINT = new THREE.Color(0x93c56f);
const ROCK_BANDS = PAL.cliff.map((c) => new THREE.Color(c));
const DIRT_EDGE = new THREE.Color(PAL.cliffLip);

/** Irregular coastline radius so the island is not a perfect disc. */
export function coastRadius(angle: number): number {
  const n1 = (noise2(Math.cos(angle) * 1.35 + 7.3, Math.sin(angle) * 1.35 + 2.9) - 0.5) * 3.2;
  const n2 = (noise2(Math.cos(angle) * 3.4 + 1.7, Math.sin(angle) * 3.4 + 8.1) - 0.5) * 1.4;
  return TERRAIN_RADIUS + n1 + n2;
}

/** large-scale colour zones: a darker pine forest north, a warm meadow east. */
function biomeTint(x: number, z: number, out: THREE.Color): void {
  const wobble = (noise2(x * 0.13, z * 0.13) - 0.5) * 0.7;
  const forestD = Math.hypot(x + 2, z - 25) / 15;
  const forest = THREE.MathUtils.clamp(1 - forestD + wobble, 0, 1);
  out.lerp(FOREST_TINT, forest * 0.45);
  const meadowD = Math.hypot(x - 18, z - 4) / 14;
  const meadow = THREE.MathUtils.clamp(1 - meadowD + wobble, 0, 1);
  out.lerp(MEADOW_TINT, meadow * 0.35);
}

function grassColor(x: number, z: number, out: THREE.Color): void {
  const n = noise2(x * 0.09, z * 0.09);
  const n2 = noise2(x * 0.35 + 40, z * 0.35);
  const n3 = noise2(x * 1.6 + 11, z * 1.6 + 5); // fine mottling
  out.copy(GRASS_BASE).lerp(n > 0.5 ? GRASS_LIGHT : GRASS_DARK, Math.abs(n - 0.5) * 1.5);
  out.lerp(GRASS_LIGHT, n2 * 0.16);
  out.offsetHSL(0, 0, (n3 - 0.5) * 0.05);
  biomeTint(x, z, out);
}

function rockColor(localY: number, height: number, jitter: number, out: THREE.Color): void {
  // strata bands from topsoil down to base rock
  const t = (localY + height / 2) / height; // 0 at bottom, 1 at top
  const band = Math.min(ROCK_BANDS.length - 1, Math.floor((1 - t) * 5.2));
  out.copy(ROCK_BANDS[band]);
  out.offsetHSL(0, 0, (jitter - 0.5) * 0.04);
  if (t > 0.93) out.lerp(DIRT_EDGE, 0.55); // thin dirt lip under the grass
}

/** Subtle painted grain so surfaces don't read as clean plastic. */
function makeGrainTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = makeRng(31415);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 236 + rng() * 19; // 236..255 — only ever darkens slightly
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  return tex;
}

/** The diorama chunk: a grass-topped island with stratified cliff sides. */
export function buildTerrain(): THREE.Group {
  const group = new THREE.Group();
  const height = 6;
  const geo = new THREE.CylinderGeometry(TERRAIN_RADIUS, TERRAIN_RADIUS - 2.5, height, 120, 5);
  geo.translate(0, -height / 2, 0); // top surface at y = 0

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const normal = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = normal.getY(i);
    const r = Math.hypot(x, z) || 1;
    const angle = Math.atan2(z, x);
    if (ny > 0.9) {
      grassColor(x, z, c);
      // pull the top rim in/out along the coastline
      if (r > TERRAIN_RADIUS - 1.2) {
        const coast = coastRadius(angle);
        pos.setX(i, (x / r) * coast);
        pos.setZ(i, (z / r) * coast);
      }
    } else {
      const jitter = noise2(angle * 4 + 10, y * 1.4);
      rockColor(y, height, jitter, c);
      // the wall flares from the narrow base out to the wavy coastline
      const t = THREE.MathUtils.clamp((y + height) / height, 0, 1);
      const target = THREE.MathUtils.lerp(TERRAIN_RADIUS - 2.5, coastRadius(angle), Math.pow(t, 0.6));
      pos.setX(i, (x / r) * target);
      pos.setZ(i, (z / r) * target);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshToonMaterial({ vertexColors: true, map: makeGrainTexture() }),
  );
  terrain.receiveShadow = true;
  group.add(terrain);

  // grass lip overhanging the wavy coast — the "cut turf" diorama edge
  const steps = 140;
  const lipVerts: number[] = [];
  const lipIdx: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const coast = coastRadius(a);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // inner edge sits on the grass, outer edge droops over the cliff
    lipVerts.push(ca * (coast - 0.55), 0.1, sa * (coast - 0.55));
    lipVerts.push(ca * (coast + 0.42), -0.32, sa * (coast + 0.42));
    if (i < steps) {
      const o = i * 2;
      const p = ((i + 1) % (steps + 1)) * 2;
      lipIdx.push(o, p, o + 1, o + 1, p, p + 1);
      lipIdx.push(o + 1, p, p + 1, o + 1, p + 1, o);
    }
  }
  const lipGeo = new THREE.BufferGeometry();
  lipGeo.setAttribute('position', new THREE.Float32BufferAttribute(lipVerts, 3));
  lipGeo.setIndex(lipIdx);
  lipGeo.computeVertexNormals();
  const lip = new THREE.Mesh(
    lipGeo,
    new THREE.MeshToonMaterial({ color: 0x67a057, side: THREE.DoubleSide }),
  );
  lip.castShadow = true;
  lip.receiveShadow = true;
  group.add(lip);

  // soft rolling mounds on the rim so the skyline is not a perfect circle
  const moundMat = new THREE.MeshToonMaterial({ color: PAL.grassLight });
  const moundGeo = new THREE.SphereGeometry(1, 20, 14);
  for (const h of HILLS) {
    const mound = new THREE.Mesh(moundGeo, moundMat);
    mound.position.set(h.pos.x, 0, h.pos.z);
    mound.scale.set(h.radius, h.height, h.radius);
    mound.castShadow = true;
    mound.receiveShadow = true;
    group.add(mound);
  }

  // rocks embedded in the cliff face, a few big outcrops
  const rng = makeRng(555);
  const cliffRockGeo = new THREE.DodecahedronGeometry(0.5, 0);
  const cliffRocks = new THREE.InstancedMesh(
    cliffRockGeo,
    new THREE.MeshToonMaterial({ color: 0x93846f }),
    30,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, Math.PI * 2);
    const y = rng.range(-4.8, -0.7);
    const embed = rng.range(0.1, 0.55);
    const scale = i % 6 === 0 ? rng.range(1.8, 2.8) : rng.range(0.5, 1.4);
    dummy.position.set(Math.cos(a) * (coastRadius(a) - 0.7 + embed), y, Math.sin(a) * (coastRadius(a) - 0.7 + embed));
    dummy.rotation.set(rng.range(0, 3), a + rng.range(-0.4, 0.4), rng.range(0, 3));
    dummy.scale.set(scale, scale * rng.range(0.5, 0.85), scale * rng.range(0.8, 1.2));
    dummy.updateMatrix();
    cliffRocks.setMatrixAt(i, dummy.matrix);
  }
  cliffRocks.castShadow = true;
  cliffRocks.receiveShadow = true;
  group.add(cliffRocks);

  return group;
}
