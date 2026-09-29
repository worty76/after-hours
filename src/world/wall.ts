import * as THREE from 'three';
import { WorldEnv, WorldSystem } from '../core/world';
import { NODES, RIVER } from './layout';
import { coastRadius } from './terrain';
import { toon } from './materials';

/**
 * The great wall, still under construction. The ring is divided into segments;
 * builder villagers haul stones from the quarry to their gate, and each
 * delivery raises the current segment block by block. Gate openings stay low
 * so the defence trails remain walkable. When a segment is finished the
 * scaffold moves to the next one — the wall slowly closes, year after year.
 */

const GATES = ['rimW', 'rimE', 'rimN', 'rimS'] as const;
type Gate = (typeof GATES)[number];

const SEGMENTS = 36;
const BLOCKS_PER_SEGMENT = 16; // 4 courses × 4 stones
const WALL_INSET = 4.2; // wall radius = coastline - this
const STORE_KEY = 'petit-valley-wall-v1';

interface Segment {
  angle: number;
  progress: number; // 0..1
  maxProgress: number; // gate segments stay at foundation height
}

function rng01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export class WallSystem implements WorldSystem {
  readonly group = new THREE.Group();

  private readonly segments: Segment[] = [];
  private readonly blocks: THREE.InstancedMesh;
  private readonly scaffolds = new Map<Gate, THREE.Group>();
  private readonly dummy = new THREE.Object3D();
  private saveTimer = 3;

  constructor() {
    const segArc = (Math.PI * 2) / SEGMENTS;

    // where the river leaves the island — the wall leaves a water gate there
    const riverExit = Math.atan2(RIVER[RIVER.length - 1].z, RIVER[RIVER.length - 1].x);

    // segment setup; gate openings stay low so trails pass through
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i + 0.5) * segArc;
      let maxProgress = 1;
      for (const gate of GATES) {
        const ga = Math.atan2(NODES[gate].z, NODES[gate].x);
        let d = Math.abs(angle - ga);
        while (d > Math.PI) d = Math.PI * 2 - d;
        if (d < segArc * 1.05) maxProgress = 0.2;
      }
      // never build across the river
      let d = Math.abs(angle - riverExit);
      while (d > Math.PI) d = Math.PI * 2 - d;
      if (d < segArc * 1.4) maxProgress = 0;
      this.segments.push({ angle, progress: 0, maxProgress });
    }

    // stone blocks (2 courses × 4 stones per segment), laid along the arc
    this.blocks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      toon(0x9a9186),
      SEGMENTS * BLOCKS_PER_SEGMENT,
    );
    this.blocks.frustumCulled = false;
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.group.add(this.blocks);

    // the villagers' work persists: restore progress from previous visits
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as number[] | null;
      if (Array.isArray(saved)) {
        saved.forEach((p, i) => {
          if (this.segments[i]) {
            this.segments[i].progress = Math.min(this.segments[i].maxProgress, Math.max(0, p));
          }
        });
      }
    } catch {
      // blocked storage — start from bare stakes
    }

    for (let i = 0; i < SEGMENTS; i++) this.refreshSegment(i);

    // one scaffold per gate, parked at the segment under construction
    for (const gate of GATES) {
      const scaffold = new THREE.Group();
      const poleMat = toon(0x713f28);
      const plankMat = toon(0xb98c5c);
      for (const s of [-1, 1]) {
        const pole = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 0.14), poleMat);
        pole.position.set(s * 1.6, 1.6, 0);
        pole.castShadow = true;
        scaffold.add(pole);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 0.12), poleMat);
      bar.position.y = 3.0;
      scaffold.add(bar);
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.7), plankMat);
      plank.position.y = 2.3;
      plank.castShadow = true;
      scaffold.add(plank);
      this.scaffolds.set(gate, scaffold);
      this.group.add(scaffold);
      this.moveScaffold(gate);
    }
  }

  private wallRadius(angle: number): number {
    return coastRadius(angle) - WALL_INSET;
  }

  /** the next segment a gate's builders work on, moving outward from the gate */
  private currentSegment(gate: Gate): number {
    const gateAngle = Math.atan2(NODES[gate].z, NODES[gate].x);
    const segArc = (Math.PI * 2) / SEGMENTS;
    // normalize: atan2 goes negative on the western half of the ring
    const gateIdx = ((Math.round(gateAngle / segArc) % SEGMENTS) + SEGMENTS) % SEGMENTS;
    for (let step = 2; step <= SEGMENTS; step++) {
      const idx = (gateIdx + step) % SEGMENTS;
      if (this.segments[idx].progress < this.segments[idx].maxProgress) return idx;
    }
    return gateIdx; // the wall is complete — rest
  }

  private moveScaffold(gate: Gate): void {
    const seg = this.segments[this.currentSegment(gate)];
    const scaffold = this.scaffolds.get(gate)!;
    const r = this.wallRadius(seg.angle);
    scaffold.position.set(Math.cos(seg.angle) * r, 0, Math.sin(seg.angle) * r);
    scaffold.rotation.y = -seg.angle + Math.PI / 2;
  }

  private refreshSegment(i: number): void {
    const seg = this.segments[i];
    const segArc = (Math.PI * 2) / SEGMENTS;

    for (let b = 0; b < BLOCKS_PER_SEGMENT; b++) {
      const row = Math.floor(b / 4);
      const col = b % 4;
      const built = seg.progress >= (b + 1) / BLOCKS_PER_SEGMENT;
      if (built) {
        const ang = seg.angle + (col - 1.5) * (segArc / 4);
        const r = this.wallRadius(ang);
        this.dummy.position.set(Math.cos(ang) * r, 0.36 + row * 0.64, Math.sin(ang) * r);
        this.dummy.rotation.set(
          rng01(i * 17 + b) * 0.06 - 0.03,
          -ang + Math.PI / 2,
          rng01(i * 31 + b) * 0.08 - 0.04,
        );
        this.dummy.scale.set(1.85, 0.6, 0.95);
      } else {
        this.dummy.position.set(0, -50, 0);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(0.001);
      }
      this.dummy.updateMatrix();
      this.blocks.setMatrixAt(i * BLOCKS_PER_SEGMENT + b, this.dummy.matrix);
    }

    this.blocks.instanceMatrix.needsUpdate = true;
  }

  update(ctx: { dt: number; env: WorldEnv }): void {
    this.saveTimer -= ctx.dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 3;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.segments.map((s) => +s.progress.toFixed(3))));
      } catch {
        // storage unavailable — the wall just resets between visits
      }
    }
    for (const gate of GATES) {
      const pending = ctx.env.build[gate] ?? 0;
      if (pending <= 0) continue;
      ctx.env.build[gate] = 0;
      const idx = this.currentSegment(gate);
      const seg = this.segments[idx];
      const was = seg.progress;
      seg.progress = Math.min(seg.maxProgress, seg.progress + pending / BLOCKS_PER_SEGMENT);
      if (seg.progress !== was) {
        this.refreshSegment(idx);
        if (this.currentSegment(gate) !== idx) this.moveScaffold(gate);
      }
    }
  }
}
