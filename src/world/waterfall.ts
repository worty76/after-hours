import * as THREE from 'three';
import { PAL } from './materials';
import { RIVER } from './layout';

/**
 * The pond overflows into a river that meanders across the island and pours
 * off the far rim as a waterfall — with falling streaks for motion and a puff
 * of mist where the water vanishes into the sky.
 */

const FALL_BOTTOM = -7.5;

interface WaterfallSystemOptions {
  /** profile height of the falling sheet */
  fallDepth?: number;
}

export class WaterfallSystem {
  readonly group = new THREE.Group();

  private readonly streaks: THREE.InstancedMesh;
  private readonly mist: THREE.InstancedMesh;
  private readonly streakState: { p: number; speed: number; off: number }[] = [];
  private readonly mistState: { p: number; drift: number; off: number; seed: number }[] = [];
  private readonly dummy = new THREE.Object3D();

  // waterfall crest frame: position + outward direction
  private readonly crest = new THREE.Vector2();
  private readonly dir = new THREE.Vector2();
  private readonly perp = new THREE.Vector2();
  private readonly fallDepth: number;

  constructor(opts: WaterfallSystemOptions = {}) {
    this.fallDepth = opts.fallDepth ?? FALL_BOTTOM;

    const waterMat = new THREE.MeshToonMaterial({
      color: PAL.water,
      transparent: true,
      opacity: 0.85,
    });
    const bedMat = new THREE.MeshToonMaterial({ color: 0xb3946a });

    // bowed centreline: each river point gets a gentle sideways wobble so the
    // flow doesn't read as a polyline of straight runs
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i < RIVER.length; i++) {
      const p = new THREE.Vector2(RIVER[i].x, RIVER[i].z);
      const prev = new THREE.Vector2(RIVER[Math.max(0, i - 1)].x, RIVER[Math.max(0, i - 1)].z);
      const next = new THREE.Vector2(RIVER[Math.min(RIVER.length - 1, i + 1)].x, RIVER[Math.min(RIVER.length - 1, i + 1)].z);
      const d = next.clone().sub(prev);
      const len = d.length() || 1;
      const bow = Math.sin(i * 2.3) * 0.4;
      p.x += (-d.y / len) * bow;
      p.y += (d.x / len) * bow;
      pts.push(p);
    }

    // --- river bed + water ribbons along the centreline, widening downstream ---
    for (const layer of [
      { mat: bedMat, width0: 1.5, width1: 2.4, y: 0.028 },
      { mat: waterMat, width0: 1.0, width1: 1.8, y: 0.06 },
    ]) {
      const verts: number[] = [];
      const idx: number[] = [];
      let cursor = 0;
      const last = pts.length - 1;
      for (let i = 0; i < last; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const d = b.clone().sub(a);
        const segLen = d.length() || 1;
        const nx = -d.y / segLen;
        const nz = d.x / segLen;
        const samples = Math.max(4, Math.ceil(segLen / 1.2));
        let prevPair = -1;
        for (let s = 0; s <= samples; s++) {
          const t = (i + s / samples) / last;
          const isSeam = s === 0 && i > 0; // reuse the previous segment's last pair
          let pairIdx: number;
          if (isSeam) {
            pairIdx = cursor - 2;
          } else {
            pairIdx = cursor;
            const p = a.clone().lerp(b, s / samples);
            const w = (layer.width0 + (layer.width1 - layer.width0) * t) / 2;
            // order matters: (+n, -n) keeps the top face wound counter-clockwise
            verts.push(p.x + nx * w, layer.y, p.y + nz * w);
            verts.push(p.x - nx * w, layer.y, p.y - nz * w);
            cursor += 2;
          }
          if (prevPair >= 0) {
            idx.push(prevPair, pairIdx, prevPair + 1, prevPair + 1, pairIdx, pairIdx + 1);
          }
          prevPair = pairIdx;
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

    // --- waterfall crest frame at the river's end ---
    const end = new THREE.Vector2(RIVER[RIVER.length - 1].x, RIVER[RIVER.length - 1].z);
    const prev = new THREE.Vector2(RIVER[RIVER.length - 2].x, RIVER[RIVER.length - 2].z);
    this.dir.copy(end).sub(prev).normalize();
    this.perp.set(-this.dir.y, this.dir.x);
    this.crest.copy(end);

    // --- the falling sheet: arc over the lip, then accelerate down ---
    const sheetVerts: number[] = [];
    const sheetIdx: number[] = [];
    const sheetSamples = 18;
    for (let i = 0; i <= sheetSamples; i++) {
      const t = i / sheetSamples;
      const s = this.sheetAt(t);
      const cx = this.crest.x + this.dir.x * s.f;
      const cz = this.crest.y + this.dir.y * s.f;
      const w = s.w;
      sheetVerts.push(cx + this.perp.x * w, s.y, cz + this.perp.y * w);
      sheetVerts.push(cx - this.perp.x * w, s.y, cz - this.perp.y * w);
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
      const off = (i / 4 - 0.5) * 2.6;
      const foam = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), foamMat);
      foam.scale.set(1, 0.45, 0.8);
      foam.position.set(
        this.crest.x + this.perp.x * off + this.dir.x * 0.4,
        0.15,
        this.crest.y + this.perp.y * off + this.dir.y * 0.4,
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
        off: (Math.random() - 0.5) * 2.2,
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
        off: (Math.random() - 0.5) * 3.2,
        seed: Math.random() * 10,
      });
    }
    this.group.add(this.mist);
  }

  /** distance forward / height / half-width along the falling sheet */
  private sheetAt(t: number): { f: number; y: number; w: number } {
    if (t < 0.25) {
      const u = t / 0.25;
      return { f: u * 1.5, y: 0.13 - u * 0.05, w: 1.3 };
    }
    const u = (t - 0.25) / 0.75;
    const ease = Math.pow(u, 1.35);
    return {
      f: 1.5 + u * 1.6,
      y: 0.08 - ease * (0.08 - this.fallDepth),
      w: 1.3 + u * 0.9,
    };
  }

  update(dt: number, elapsed: number): void {
    // streaks fall along the sheet profile and loop
    let i = 0;
    for (const s of this.streakState) {
      s.p += dt * s.speed;
      if (s.p > 1) {
        s.p = 0;
        s.off = (Math.random() - 0.5) * 2.2;
        s.speed = 0.55 + Math.random() * 0.5;
      }
      const prof = this.sheetAt(0.28 + s.p * 0.7);
      this.dummy.position.set(
        this.crest.x + this.dir.x * prof.f + this.perp.x * s.off,
        prof.y,
        this.crest.y + this.dir.y * prof.f + this.perp.y * s.off,
      );
      const angle = Math.atan2(this.dir.x, this.dir.y);
      this.dummy.rotation.set(0, angle, 0.12);
      this.dummy.scale.set(1, 1 + Math.sin(s.p * 9) * 0.15, 1);
      this.dummy.updateMatrix();
      this.streaks.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.streaks.instanceMatrix.needsUpdate = true;

    // mist puffs drift away from the base, pulsing as they go
    let j = 0;
    for (const m of this.mistState) {
      m.p += dt * m.drift;
      if (m.p > 1) {
        m.p = 0;
        m.off = (Math.random() - 0.5) * 3.2;
        m.seed = Math.random() * 10;
      }
      const f = 3.1 + m.p * 1.6;
      const y = this.fallDepth + 0.5 + m.p * 1.2 + Math.sin(elapsed * 1.4 + m.seed) * 0.18;
      const grow = 0.5 + m.p * 1.3;
      const fade = m.p < 0.15 ? m.p / 0.15 : m.p > 0.7 ? (1 - m.p) / 0.3 : 1;
      this.dummy.position.set(
        this.crest.x + this.dir.x * f + this.perp.x * m.off,
        y,
        this.crest.y + this.dir.y * f + this.perp.y * m.off,
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
