import { distPointSegment, makeRng, Rng } from '../core/rng';

/** A point on the ground plane (x, z). y is always ~0 for the flat village area. */
export interface Pt {
  x: number;
  z: number;
}

export const NODES: Record<string, Pt> = {
  // ring road, radius 11, nodes every 45°
  r0: { x: 11, z: 0 },
  r1: { x: 7.78, z: 7.78 },
  r2: { x: 0, z: 11 },
  r3: { x: -7.78, z: 7.78 },
  r4: { x: -11, z: 0 },
  r5: { x: -7.78, z: -7.78 },
  r6: { x: 0, z: -11 },
  r7: { x: 7.78, z: -7.78 },

  // house doors (in front of each house, facing the ring)
  d0: { x: 12.4, z: 5.1 },
  d1: { x: 5.7, z: 13.8 },
  d2: { x: -5.0, z: 11.9 },
  t: { x: -13.3, z: 5.5 }, // bell tower door
  d4: { x: -11.9, z: -5.0 },
  d5: { x: -5.7, z: -13.8 },
  d6: { x: 5.0, z: -11.9 },
  d7: { x: 13.8, z: -5.7 },

  // plaza (well at the centre, corners on the diagonals)
  w: { x: 0, z: 0 },
  pc45: { x: 3.25, z: 3.25 },
  pc135: { x: -3.25, z: 3.25 },
  pc225: { x: -3.25, z: -3.25 },
  pc315: { x: 3.25, z: -3.25 },

  // market stalls (front of each stall)
  sn1: { x: 5.0, z: 2.9 },
  sn2: { x: -5.0, z: 2.9 },
  sn3: { x: 0, z: -5.8 },

  // blacksmith anvil
  an: { x: -4.6, z: -4.6 },

  // pond + bench on its bank
  pn: { x: -13.5, z: 10.8 },
  bn: { x: -17.8, z: 12.6 },

  // field lane (east side)
  fn1: { x: 20.5, z: -1.8 },
  fn2: { x: 21.5, z: -5 },
  fn3: { x: 18.5, z: -8.5 },
  fn4: { x: 15, z: -12 },
};

export const EDGES: [string, string][] = [
  // ring road
  ['r0', 'r1'],
  ['r1', 'r2'],
  ['r2', 'r3'],
  ['r3', 'r4'],
  ['r4', 'r5'],
  ['r5', 'r6'],
  ['r6', 'r7'],
  ['r7', 'r0'],
  // house doors connect to both neighbouring ring nodes
  ['d0', 'r0'], ['d0', 'r1'],
  ['d1', 'r1'], ['d1', 'r2'],
  ['d2', 'r2'], ['d2', 'r3'],
  ['t', 'r3'], ['t', 'r4'],
  ['d4', 'r4'], ['d4', 'r5'],
  ['d5', 'r5'], ['d5', 'r6'],
  ['d6', 'r6'], ['d6', 'r7'],
  ['d7', 'r7'], ['d7', 'r0'],
  // plaza spokes
  ['w', 'pc45'], ['w', 'pc135'], ['w', 'pc225'], ['w', 'pc315'],
  ['pc45', 'r1'], ['pc135', 'r3'], ['pc225', 'r5'], ['pc315', 'r7'],
  // stalls + anvil
  ['sn1', 'pc45'], ['sn2', 'pc135'], ['sn3', 'pc225'], ['sn3', 'pc315'],
  ['an', 'pc225'],
  // pond lane
  ['pn', 'r3'], ['bn', 'pn'],
  // field lane
  ['r0', 'fn1'], ['fn1', 'fn2'], ['fn2', 'fn3'], ['fn3', 'fn4'], ['fn4', 'r7'],
];

export interface HouseDef {
  id: string;
  doorNode: string;
  pos: Pt;
  /** rotation so the door face (+z of the group) points toward the village centre */
  rotY: number;
  width: number;
  depth: number;
  wallColor: number;
  roofColor: number;
  ridgeAlongX: boolean;
  chimney: Pt; // world position of the chimney top
}

const WALLS = [0xf2e3c9, 0xe8d0b0, 0xdfc9a8, 0xf5efe2, 0xeedcc3, 0xe3c39e];
const ROOFS = [0xc96f4a, 0xa85643, 0xb8763f, 0x8d6b52, 0xb35b3e, 0xc27b4e];

function houseAt(id: string, angleDeg: number, radius: number, rng: Rng): HouseDef {
  const a = (angleDeg * Math.PI) / 180;
  const pos = { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
  const rotY = Math.atan2(-pos.x, -pos.z); // door faces the centre
  const width = rng.range(3.1, 4.1);
  const depth = rng.range(2.9, 3.7);
  // chimney sits on the roof, offset toward one gable end
  const ridgeAlongX = rng.chance(0.5);
  const cx = pos.x + Math.cos(a) * (ridgeAlongX ? -0.8 : -0.8);
  const cz = pos.z + Math.sin(a) * (ridgeAlongX ? -0.8 : -0.8);
  return {
    id,
    doorNode: `d${id.slice(1)}`,
    pos,
    rotY,
    width,
    depth,
    wallColor: rng.pick(WALLS),
    roofColor: rng.pick(ROOFS),
    ridgeAlongX,
    chimney: { x: cx, z: cz },
  };
}

const rng = makeRng(20260929);

export const HOUSES: HouseDef[] = [
  houseAt('h0', 22.5, 17, rng),
  houseAt('h1', 67.5, 18.5, rng),
  houseAt('h2', 112.5, 16.5, rng),
  houseAt('h4', 202.5, 16.5, rng),
  houseAt('h5', 247.5, 18.5, rng),
  houseAt('h6', 292.5, 16.5, rng),
  houseAt('h7', 337.5, 18.5, rng),
];

export const TOWER: Pt = { x: Math.cos((157.5 * Math.PI) / 180) * 18, z: Math.sin((157.5 * Math.PI) / 180) * 18 };

export const POND = { center: { x: -13.5, z: 15 } as Pt, radius: 3.9 };

export interface FieldDef {
  pos: Pt;
  rotY: number;
}

export const FIELDS: FieldDef[] = [
  { pos: { x: 22, z: -2.5 }, rotY: -0.4 },
  { pos: { x: 22.5, z: -5.5 }, rotY: 0.25 },
  { pos: { x: 20, z: -9.5 }, rotY: -0.2 },
  { pos: { x: 17, z: -13.5 }, rotY: 0.45 },
];

export const STALLS: FieldDef[] = [
  { pos: { x: 6.4, z: 3.7 }, rotY: Math.PI + Math.PI / 6 },
  { pos: { x: -6.4, z: 3.7 }, rotY: Math.PI - Math.PI / 6 },
  { pos: { x: 0, z: -7.4 }, rotY: 0 },
];

export const LAMPS: Pt[] = [
  { x: 6.7, z: 1.2 },
  { x: -1.2, z: 6.7 },
  { x: -6.7, z: -1.2 },
  { x: 1.2, z: -6.7 },
];

/** Indices into LAMPS that get a real point light (perf: at most two). */
export const LAMP_LIGHT_INDICES = [1, 3];

export const ANVIL: Pt = { x: -5.6, z: -3.4 };

export const BENCH: Pt = { x: -18.2, z: 15.2 };

/** Grazing patch for the sheep flock (kept clear of trees). */
export const SHEEP_MEADOW = { center: { x: 17.5, z: 2.2 } as Pt, radius: 3.4 };

/** Chicken coop by Tomas & Elif's house. */
export const COOP: Pt = { x: 14.2, z: 9.3 };

/** Wooden dock jutting into the pond — the fisher's spot. */
export const DOCK = {
  base: { x: -13.5, z: 11.4 } as Pt,
  end: { x: -13.5, z: 13.4 } as Pt,
  width: 0.85,
};

/** Small bordered flower beds in the house gardens. */
export const FLOWER_BEDS: { pos: Pt; rotY: number }[] = [
  { pos: { x: 10.4, z: 8.6 }, rotY: 0.5 },
  { pos: { x: -2.6, z: 9.4 }, rotY: -0.3 },
  { pos: { x: 2.8, z: -9.6 }, rotY: 0.15 },
  { pos: { x: -9.9, z: -6.4 }, rotY: -0.55 },
  { pos: { x: 9.0, z: -3.0 }, rotY: 0.9 },
];

/** Stream from the pond to the rim, where it becomes a waterfall. */
export const STREAM = {
  a: { x: -15.9, z: 17.7 } as Pt, // pond outflow
  b: { x: -19.9, z: 22.1 } as Pt, // crest at the cliff edge
};

/** Soft decorative hills on the diorama rim. */
export interface HillDef {
  pos: Pt;
  radius: number;
  height: number;
}

export const HILLS: HillDef[] = [
  { pos: { x: -4.3, z: 24.6 }, radius: 5, height: 1.3 },
  { pos: { x: -23.5, z: -9 }, radius: 5.5, height: 1.1 },
  { pos: { x: 20, z: 15.5 }, radius: 4.4, height: 1.4 },
  { pos: { x: 23, z: -10.5 }, radius: 4.2, height: 0.9 },
];

/** Ground height including decorative hills (props avoid them, trees may sit on them).
 *  Profile matches the ellipsoidal mounds built in terrain.ts. */
export function groundY(x: number, z: number): number {
  let y = 0;
  for (const h of HILLS) {
    const d = Math.hypot(x - h.pos.x, z - h.pos.z) / h.radius;
    if (d < 1) {
      y = Math.max(y, h.height * Math.sqrt(1 - d * d));
    }
  }
  return y;
}

export const TERRAIN_RADIUS = 30;
export const PLAZA_RADIUS = 6.3;

/** True if a scatter candidate is clear of roads, buildings, water and props. */
export function isClearForTree(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r > 26.5) return false;
  if (Math.hypot(x, z) < PLAZA_RADIUS + 1.4) return false;
  if (Math.hypot(x - POND.center.x, z - POND.center.z) < POND.radius + 1.6) return false;
  for (const h of HOUSES) {
    if (Math.hypot(x - h.pos.x, z - h.pos.z) < 4.6) return false;
  }
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 5.2) return false;
  for (const f of FIELDS) {
    if (Math.hypot(x - f.pos.x, z - f.pos.z) < 3.9) return false;
  }
  for (const s of STALLS) {
    if (Math.hypot(x - s.pos.x, z - s.pos.z) < 2.2) return false;
  }
  for (const l of LAMPS) {
    if (Math.hypot(x - l.x, z - l.z) < 1.4) return false;
  }
  if (Math.hypot(x - ANVIL.x, z - ANVIL.z) < 1.6) return false;
  if (Math.hypot(x - BENCH.x, z - BENCH.z) < 1.6) return false;
  if (Math.hypot(x - SHEEP_MEADOW.center.x, z - SHEEP_MEADOW.center.z) < SHEEP_MEADOW.radius + 1.2) return false;
  if (Math.hypot(x - COOP.x, z - COOP.z) < 2.2) return false;
  for (const bed of FLOWER_BEDS) {
    if (Math.hypot(x - bed.pos.x, z - bed.pos.z) < 1.7) return false;
  }
  if (distPointSegment(x, z, STREAM.a.x, STREAM.a.z, STREAM.b.x, STREAM.b.z) < 2.4) return false;
  if (Math.hypot(x - STREAM.b.x, z - STREAM.b.z) < 3.2) return false;
  for (const id of Object.keys(NODES)) {
    const n = NODES[id];
    if (Math.hypot(x - n.x, z - n.z) < 2.4) return false;
  }
  for (const [a, b] of EDGES) {
    const na = NODES[a];
    const nb = NODES[b];
    if (distPointSegment(x, z, na.x, na.z, nb.x, nb.z) < 2.1) return false;
  }
  return true;
}

/** Looser clearance for small stuff (rocks, bushes, grass tufts). */
export function isClearForSmall(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  if (r > 26.5) return false;
  if (r < PLAZA_RADIUS + 0.6) return false;
  if (Math.hypot(x - POND.center.x, z - POND.center.z) < POND.radius + 0.7) return false;
  for (const h of HOUSES) {
    if (Math.hypot(x - h.pos.x, z - h.pos.z) < 3.1) return false;
  }
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 3.6) return false;
  for (const f of FIELDS) {
    if (Math.hypot(x - f.pos.x, z - f.pos.z) < 2.9) return false;
  }
  for (const s of STALLS) {
    if (Math.hypot(x - s.pos.x, z - s.pos.z) < 1.9) return false;
  }
  for (const l of LAMPS) {
    if (Math.hypot(x - l.x, z - l.z) < 0.9) return false;
  }
  if (Math.hypot(x - SHEEP_MEADOW.center.x, z - SHEEP_MEADOW.center.z) < SHEEP_MEADOW.radius - 0.4) return false;
  if (Math.hypot(x - COOP.x, z - COOP.z) < 1.6) return false;
  for (const bed of FLOWER_BEDS) {
    if (Math.hypot(x - bed.pos.x, z - bed.pos.z) < 1.4) return false;
  }
  if (distPointSegment(x, z, STREAM.a.x, STREAM.a.z, STREAM.b.x, STREAM.b.z) < 1.5) return false;
  for (const id of Object.keys(NODES)) {
    const n = NODES[id];
    if (Math.hypot(x - n.x, z - n.z) < 1.1) return false;
  }
  for (const [a, b] of EDGES) {
    const na = NODES[a];
    const nb = NODES[b];
    if (distPointSegment(x, z, na.x, na.z, nb.x, nb.z) < 0.95) return false;
  }
  return true;
}

export interface ScatterSpot {
  x: number;
  z: number;
  y: number;
  s: number; // random 0..1 for colour/scale variation
}

function scatter(count: number, minR: number, clear: (x: number, z: number) => boolean): ScatterSpot[] {
  const rng2 = makeRng(777 + count);
  const spots: ScatterSpot[] = [];
  let guard = 0;
  while (spots.length < count && guard < count * 60) {
    guard++;
    const a = rng2() * Math.PI * 2;
    const r = Math.sqrt(rng2.range(minR * minR, 26.5 * 26.5));
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (!clear(x, z)) continue;
    spots.push({ x, z, y: groundY(x, z), s: rng2() });
  }
  return spots;
}

export const TREE_SPOTS = scatter(90, 12.5, isClearForTree);
export const BUSH_SPOTS = scatter(70, 8, isClearForSmall);
export const ROCK_SPOTS = scatter(26, 7, isClearForSmall);
export const CLOVER_SPOTS = scatter(150, 6.8, isClearForSmall);
export const FLOWER_SPOTS = scatter(110, 6.8, isClearForSmall);
