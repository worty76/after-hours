import * as THREE from 'three';
import { PAL } from './materials';
import { STREAM } from './layout';

/**
 * The pond overflows into a little stream that runs to the cliff edge and
 * pours off as a waterfall — the classic floating-diorama silhouette, with
 * falling streaks for motion and a puff of mist where the water vanishes.
 */

const FALL_BOTTOM = -6.8;

interface SheetSample {
  r: number;
  y: number;
  w: number;
}

/** Profile of the falling sheet: arc over the grass lip, then accelerate down. */
function sheetAt(t: number): SheetSample {
  if (t < 0.25) {
    const u = t / 0.25;
    return { r: 28.7 + u * 1.5, y: 0.13 - u * 0.05, w: 1.1 };
  }
  const u = (t - 0.25) / 0.75;
  const ease = Math.pow(u, 1.35);
  return { r: 30.2 + u * 1.6, y: 0.08 - ease * (0.08 - FALL_BOTTOM), w: 1.1 + u * 0.8 };
}

export class WaterfallSystem {
  readonly group = new THREE.Group();

  private readonly streaks: THREE.InstancedMesh;
  private readonly mist: THREE.InstancedMesh;
  private readonly streakState: { p: number; speed: number; off: number }[] = [];
  private readonly mistState: { p: number; drift: number; off: number; seed: number }[] = [];
  private readonly dummy = new THREE.Object3D();

  private readonly angle: number;
  private readonly ux: number;
  private readonly uz: number;

  constructor() {
    const ax = STREAM.a.x;
    const az = STREAM.a.z;
    const bx = STREAM.b.x;
    const bz = STREAM.b.z;
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const dx = (bx - ax) / len;
    const dz = (bz - az) / len;
    this.angle = Math.atan2(bz, bx);
    this.ux = Math.cos(this.angle);
    this.uz = Math.sin(this.angle);
    // perpendicular to the flow, used to width the ribbons and the sheet
    const px = -dz;
    const pz = dx;

    const waterMat = new THREE.MeshToonMaterial({
      color: PAL.water,
      transparent: true,
      opacity: 0.85,
    });

    // --- stream: wet bed + water surface, climbing gently onto the grass lip ---
    const samples = 14;
    for (const layer of [
      { mat: new THREE.MeshToonMaterial({ color: 0xb3946a }), width: 0.85, y: 0.028 },
      { mat: waterMat, width: 0.55, y: 0.06 },
    ]) {
      const verts: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        // slight bow outward so the stream doesn't look ruler-straight
        const bow = Math.sin(t * Math.PI) * 0.35;
        const cx = ax + (bx - ax) * t + this.ux * bow;
        const cz = az + (bz - az) * t + this.uz * bow;
        // climb onto the grass lip near the edge (lip top rises to ~0.12 at r 29)
        const r = Math.hypot(cx, cz);
        const climb = r > 28.4 ? Math.min(1, (r - 28.4) / 0.9) * 0.05 : 0;
        const y = layer.y + climb;
        const w = layer.width * (1 - t * 0.25);
        verts.push(cx + px * w, y, cz + pz * w);
        verts.push(cx - px * w, y, cz - pz * w);
        if (i < samples) {
          const o = i * 2;
          idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, layer.mat);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // --- the falling sheet ---
    const sheetVerts: number[] = [];
    const sheetIdx: number[] = [];
    const sheetSamples = 18;
    for (let i = 0; i <= sheetSamples; i++) {
      const t = i / sheetSamples;
      const s = sheetAt(t);
      const cx = this.ux * s.r;
      const cz = this.uz * s.r;
      const w = s.w;
      sheetVerts.push(cx + px * w, s.y, cz + pz * w);
      sheetVerts.push(cx - px * w, s.y, cz - pz * w);
      if (i < sheetSamples) {
        const o = i * 2;
        sheetIdx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      }
    }
    const sheetGeo = new THREE.BufferGeometry();
    sheetGeo.setAttribute('position', new THREE.Float32BufferAttribute(sheetVerts, 3));
    sheetGeo.setIndex(sheetIdx);
    sheetGeo.computeVertexNormals();
    const sheet = new THREE.Mesh(
      sheetGeo,
      new THREE.MeshBasicMaterial({
        color: 0xd8f0f6,
        transparent: true,
        opacity: 0.66,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.group.add(sheet);

    // --- crest foam blobs ---
    const foamMat = new THREE.MeshToonMaterial({ color: 0xf4fbfd });
    for (let i = 0; i < 5; i++) {
      const off = (i / 4 - 0.5) * 1.7;
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), foamMat);
      foam.scale.set(1, 0.45, 0.8);
      foam.position.set(
        this.ux * 29.5 + px * off,
        0.15,
        this.uz * 29.5 + pz * off,
      );
      this.group.add(foam);
    }

    // --- falling streaks (instanced, looping down the sheet) ---
    const streakGeo = new THREE.BoxGeometry(0.055, 0.85, 0.03);
    this.streaks = new THREE.InstancedMesh(
      streakGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
      14,
    );
    this.streaks.frustumCulled = false;
    for (let i = 0; i < 14; i++) {
      this.streakState.push({
        p: Math.random(),
        speed: 0.55 + Math.random() * 0.5,
        off: (Math.random() - 0.5) * 1.5,
      });
    }
    this.group.add(this.streaks);

    // --- mist where the water vanishes ---
    const mistGeo = new THREE.SphereGeometry(0.5, 8, 6);
    this.mist = new THREE.InstancedMesh(
      mistGeo,
      new THREE.MeshBasicMaterial({ color: 0xeef7fa, transparent: true, opacity: 0.32, depthWrite: false }),
      12,
    );
    this.mist.frustumCulled = false;
    for (let i = 0; i < 12; i++) {
      this.mistState.push({
        p: Math.random(),
        drift: 0.18 + Math.random() * 0.25,
        off: (Math.random() - 0.5) * 2.4,
        seed: Math.random() * 10,
      });
    }
    this.group.add(this.mist);
  }

  update(dt: number, elapsed: number): void {
    // streaks fall along the sheet profile and loop
    let i = 0;
    for (const s of this.streakState) {
      s.p += dt * s.speed;
      if (s.p > 1) {
        s.p = 0;
        s.off = (Math.random() - 0.5) * 1.5;
        s.speed = 0.55 + Math.random() * 0.5;
      }
      const prof = sheetAt(0.28 + s.p * 0.7);
      this.dummy.position.set(
        this.ux * prof.r + -this.uz * s.off,
        prof.y,
        this.uz * prof.r + this.ux * s.off,
      );
      this.dummy.rotation.set(0, -this.angle, 0.12);
      this.dummy.scale.set(1, 1 + Math.sin(s.p * 9) * 0.15, 1);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.streaks.instanceMatrix.needsUpdate = true;

    // mist puffs drift away from the base, pulsing as they go
    const baseR = 32.2;
    let j = 0;
    for (const m of this.mistState) {
      m.p += dt * m.drift;
      if (m.p > 1) {
        m.p = 0;
        m.off = (Math.random() - 0.5) * 2.4;
        m.seed = Math.random() * 10;
      }
      const r = baseR + m.p * 1.6;
      const y = FALL_BOTTOM + 0.5 + m.p * 1.2 + Math.sin(elapsed * 1.4 + m.seed) * 0.18;
      const grow = 0.5 + m.p * 1.3;
      const fade = m.p < 0.15 ? m.p / 0.15 : m.p > 0.7 ? (1 - m.p) / 0.3 : 1;
      this.dummy.position.set(
        this.ux * r + -this.uz * m.off,
        y,
        this.uz * r + this.ux * m.off,
      );
      this.dummy.scale.setScalar(grow * fade);
      this.dummy.rotation.set(0, m.seed, 0);
      this.dummy.updateMatrix();
      this.mist.setMatrixAt(j, this.dummy.matrix);
      j++;
    }
    this.mist.instanceMatrix.needsUpdate = true;
  }
}
