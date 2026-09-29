import * as THREE from 'three';
import { makeRng } from '../core/rng';

interface Puff {
  active: boolean;
  age: number;
  life: number;
  origin: THREE.Vector3;
  seed: number;
}

interface Chimney {
  pos: THREE.Vector3;
  offset: number; // per-house hearth schedule jitter
  timer: number;
}

const MAX_PUFFS = 120;
const WIND = new THREE.Vector3(0.55, 0, 0.18);

/** Pooled chimney smoke; hearths burn in the early morning and the evening. */
export class SmokeSystem {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly puffs: Puff[] = [];
  private readonly chimneys: Chimney[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor(chimneys: THREE.Vector3[]) {
    const rng = makeRng(9091);
    const geo = new THREE.SphereGeometry(0.24, 10, 8);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshToonMaterial({
        color: 0xeceae4,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
      MAX_PUFFS,
    );
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // instances move every frame; the cached bounding sphere would wrongly cull them
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);

    for (const pos of chimneys) {
      this.chimneys.push({ pos, offset: rng.range(-0.7, 0.7), timer: rng.range(0, 1) });
    }
    for (let i = 0; i < MAX_PUFFS; i++) {
      this.puffs.push({ active: false, age: 0, life: 3.5, origin: new THREE.Vector3(), seed: 0 });
    }
  }

  private lit(hours: number, offset: number): boolean {
    const h = (hours + offset + 24) % 24;
    return (h > 5.3 && h < 9.6) || (h > 16.6 && h < 21.6);
  }

  update(dt: number, hours: number): void {
    // spawn
    for (const ch of this.chimneys) {
      ch.timer -= dt;
      if (ch.timer <= 0) {
        ch.timer = 0.45 + Math.random() * 0.5;
        if (this.lit(hours, ch.offset)) {
          const puff = this.puffs.find((p) => !p.active);
          if (puff) {
            puff.active = true;
            puff.age = 0;
            puff.life = 3.2 + Math.random() * 1.2;
            puff.origin.set(ch.pos.x + Math.random() * 0.1, ch.pos.y, ch.pos.z + Math.random() * 0.1);
            puff.seed = Math.random() * 10;
          }
        }
      }
    }

    // simulate + write instance matrices
    let i = 0;
    for (const puff of this.puffs) {
      if (puff.active) {
        puff.age += dt;
        if (puff.age >= puff.life) puff.active = false;
      }
      if (!puff.active) {
        this.dummy.position.set(0, -50, 0);
        this.dummy.scale.setScalar(0.001);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        i++;
        continue;
      }
      const p = puff.age / puff.life;
      const rise = 3.4 * p;
      const sway = Math.sin(puff.age * 1.7 + puff.seed) * 0.22 * p;
      this.dummy.position.set(
        puff.origin.x + sway + WIND.x * p * p * 2.2,
        puff.origin.y + rise,
        puff.origin.z + WIND.z * p * p * 2.2,
      );
      const grow = 0.4 + p * 2.1;
      const fadeIn = p < 0.12 ? p / 0.12 : 1;
      const fadeOut = p > 0.72 ? (1 - p) / 0.28 : 1;
      this.dummy.scale.setScalar(grow * fadeIn * fadeOut);
      this.dummy.rotation.set(puff.seed + p, puff.seed * 2 + p * 1.4, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
