import * as THREE from 'three';
import { makeRng, Rng } from '../core/rng';
import { Threat } from '../core/world';
import { BENCH, DOCK, FIELDS, HOUSES, NODES, POND, STALLS } from '../world/layout';
import { findPath, nearestNode, nodePos } from '../world/nav';
import { makeBlobShadow, makeSpeechBubble, PAL, toon } from '../world/materials';
import { VILLAGER_SEEDS, VillagerSeed } from '../content/villagers';

const RIM_NODES = ['rimW', 'rimE', 'rimN', 'rimS'];

/** the rim lookout nearest to a world position */
function nearestRimNode(x: number, z: number): string {
  let best = RIM_NODES[0];
  let bestD = Infinity;
  for (const id of RIM_NODES) {
    const n = NODES[id];
    const d = (n.x - x) ** 2 + (n.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

type Activity = 'sleep' | 'home' | 'work' | 'market' | 'roam' | 'fetch';

interface ScheduleEntry {
  start: number;
  end: number;
  act: Activity;
}

export interface VillagerDef {
  name: string;
  role: 'farmer' | 'baker' | 'merchant' | 'smith' | 'fisher' | 'priest' | 'shepherd' | 'elder' | 'child' | 'miller' | 'builder' | 'guard';
  houseIndex: number;
  /** sleep/wake anchor node (e.g. the priest lives in the bell tower) */
  homeNode?: string;
  workNode: string | null;
  /** builders: which rim gate's wall section they supply */
  gate?: string;
  /** guards: day or night shift at their rim post */
  shift?: 'day' | 'night';
  /** exact standing spot for work (behind a stall, among the crops), if any */
  workSpot: { x: number; z: number } | null;
  roamNodes: string[];
  scale: number;
  speed: number;
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  hat: 'straw' | 'none';
  prop: 'can' | 'rod' | 'stick' | 'cane' | 'spear' | 'none';
  fetchesWater: boolean;
  schedule: ScheduleEntry[];
}

const SKINS = PAL.skin;
const SHIRTS = PAL.shirts;
const PANTS = PAL.pants;
const HAIRS = PAL.hair;

function workerSchedule(rng: Rng, fetches: boolean): ScheduleEntry[] {
  const wake = 6 + rng() * 1.2;
  const bed = 21 + rng() * 1.4;
  const lunchOut = rng() < 0.4;
  const entries: ScheduleEntry[] = [
    { start: 0, end: wake, act: 'sleep' },
    { start: wake, end: wake + 0.4, act: 'home' },
  ];
  if (fetches) {
    entries.push({ start: wake + 0.4, end: 8.4, act: 'fetch' });
    entries.push({ start: 8.4, end: 12, act: 'work' });
  } else {
    entries.push({ start: wake + 0.4, end: 12, act: 'work' });
  }
  entries.push(
    { start: 12, end: 13, act: lunchOut ? 'market' : 'home' },
    { start: 13, end: 17.5, act: 'work' },
    { start: 17.5, end: bed - 0.8, act: 'market' },
    { start: bed - 0.8, end: bed, act: 'home' },
    { start: bed, end: 24, act: 'sleep' },
  );
  return entries;
}

function priestSchedule(): ScheduleEntry[] {
  return [
    { start: 0, end: 5.8, act: 'sleep' },
    { start: 5.8, end: 6.1, act: 'home' },
    { start: 6.1, end: 8.5, act: 'work' }, // morning bells
    { start: 8.5, end: 10, act: 'home' },
    { start: 10, end: 12, act: 'work' },
    { start: 12, end: 14, act: 'home' },
    { start: 14, end: 18, act: 'work' },
    { start: 18, end: 20, act: 'market' },
    { start: 20, end: 20.8, act: 'home' },
    { start: 20.8, end: 24, act: 'sleep' },
  ];
}

function elderSchedule(): ScheduleEntry[] {
  return [
    { start: 0, end: 7.4, act: 'sleep' },
    { start: 7.4, end: 8.4, act: 'home' },
    { start: 8.4, end: 11.5, act: 'work' }, // the bench by the pond
    { start: 11.5, end: 12.6, act: 'market' },
    { start: 12.6, end: 17, act: 'work' },
    { start: 17, end: 20.5, act: 'home' },
    { start: 20.5, end: 24, act: 'sleep' },
  ];
}

/** the watch never ends: guards stand at their rim post around the clock */
function guardSchedule(): ScheduleEntry[] {
  return [{ start: 0, end: 24, act: 'work' }];
}

function childSchedule(rng: Rng): ScheduleEntry[] {
  const wake = 7.4 + rng() * 0.8;
  return [
    { start: 0, end: wake, act: 'sleep' },
    { start: wake, end: wake + 0.4, act: 'home' },
    { start: wake + 0.4, end: 11.5, act: 'roam' },
    { start: 11.5, end: 13, act: 'home' },
    { start: 13, end: 17.5, act: 'roam' },
    { start: 17.5, end: 19.8, act: 'home' },
    { start: 19.8, end: 24, act: 'sleep' },
  ];
}

function makeDefs(): VillagerDef[] {
  return VILLAGER_SEEDS.map(makeDef);
}

/** Expand a data seed into a full definition (schedule, colors, props). */
export function makeDef(seed: VillagerSeed): VillagerDef {
  // per-name stream: deterministic per character, varied between characters
  let hash = 0;
  for (let i = 0; i < seed.name.length; i++) hash = (hash * 31 + seed.name.charCodeAt(i)) | 0;
  const rng = makeRng(hash >>> 0);
  const stallSpot = (i: number): { x: number; z: number } => {
    const s = STALLS[i].pos;
    const len = Math.hypot(s.x, s.z) || 1;
    return { x: s.x + (s.x / len) * 0.75, z: s.z + (s.z / len) * 0.75 }; // behind the counter
  };
  const fieldSpot = (i: number): { x: number; z: number } => ({ x: FIELDS[i].pos.x, z: FIELDS[i].pos.z });

  // named places a seed's workSpot can refer to (code owns geometry, data names it)
  const NAMED_SPOTS: Record<string, { x: number; z: number }> = {
    dock: { x: DOCK.end.x, z: DOCK.end.z },
    bench: { x: BENCH.x, z: BENCH.z },
  };

  const { role } = seed;
  const schedule =
    role === 'priest'
      ? priestSchedule()
      : role === 'elder'
        ? elderSchedule()
        : role === 'child'
          ? childSchedule(rng)
          : role === 'guard'
            ? guardSchedule()
            : workerSchedule(rng, role !== 'fisher' && role !== 'shepherd');
  return {
    ...seed,
    workSpot:
      seed.workSpot !== undefined
        ? typeof seed.workSpot === 'string'
          ? (NAMED_SPOTS[seed.workSpot] ?? null)
          : seed.workSpot
        : seed.stallIndex !== undefined
          ? stallSpot(seed.stallIndex)
          : seed.fieldIndex !== undefined
            ? fieldSpot(seed.fieldIndex)
            : null,
    roamNodes: role === 'child' ? ['w', 'pc45', 'pc315', 'pn', 'sn1'] : [],
    scale: role === 'child' ? 0.74 : role === 'elder' ? 0.92 : 1,
    speed: role === 'child' ? 2.3 : role === 'elder' ? 1.1 : rng.range(1.5, 1.9),
    skin: rng.pick(SKINS),
    shirt: role === 'guard' ? 0x5e7fa3 : rng.pick(SHIRTS),
    pants: role === 'guard' ? 0x3e4a5a : rng.pick(PANTS),
    hair: rng.pick(HAIRS),
    hat: role === 'farmer' || role === 'shepherd' ? ('straw' as const) : ('none' as const),
    prop:
      role === 'farmer'
        ? ('can' as const)
        : role === 'fisher'
          ? ('rod' as const)
          : role === 'shepherd'
            ? ('stick' as const)
            : role === 'elder'
              ? ('cane' as const)
              : role === 'guard'
                ? ('spear' as const)
                : ('none' as const),
    fetchesWater: role === 'farmer' || role === 'merchant' || role === 'baker' || role === 'smith',
    schedule,
  } satisfies VillagerDef;
}

interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  lean: number;
  bodyY: number;
}

const REST_POSE: Pose = { legL: 0, legR: 0, armL: 0, armR: 0, lean: 0, bodyY: 0 };

function buildMesh(def: VillagerDef): {
  group: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  body: THREE.Group;
  headGrp: THREE.Group;
  prop: THREE.Object3D | null;
  yoke: THREE.Group;
  bubble: THREE.Sprite;
  carriedStone: THREE.Mesh | null;
} {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const rng = makeRng(hashStr(def.name + ':mesh')); // per-character look details

  const skinMat = toon(def.skin);
  const shirtMat = toon(def.shirt);
  const pantsMat = toon(def.pants);
  const hairMat = toon(def.hair);
  const woodMat = toon(PAL.woodMid);

  // short chibi legs with little shoes, pivot at the hip
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.16, 3, 8);
  legGeo.translate(0, -0.14, 0);
  const shoeGeo = new THREE.SphereGeometry(0.078, 8, 6);
  const shoeMat = toon(0x4a3a2e);
  const makeLeg = (side: -1 | 1) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.11, 0.34, 0);
    leg.add(new THREE.Mesh(legGeo, pantsMat));
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(0, -0.37, 0.045);
    shoe.scale.set(1, 0.55, 1.45);
    shoe.castShadow = true;
    leg.add(shoe);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);
  body.add(legL, legR);

  // egg-shaped body with a leather belt
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 12), shirtMat);
  torso.position.y = 0.6;
  torso.scale.set(1, 1.12, 0.88);
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.252, 0.268, 0.075, 12), toon(0x5a4632));
  belt.position.y = 0.47;
  body.add(belt);
  // some villagers wear a skirt
  if (def.role !== 'guard' && rng.chance(0.45)) {
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.245, 0.37, 0.36, 12),
      toon(new THREE.Color(def.shirt).multiplyScalar(0.85).getHex()),
    );
    skirt.position.y = 0.4;
    skirt.castShadow = true;
    body.add(skirt);
  }

  // arms pivot at the shoulders, with little hands at the ends
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.14, 3, 6);
  armGeo.translate(0, -0.12, 0);
  const handGeo = new THREE.SphereGeometry(0.062, 8, 6);
  const makeArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.27, 0.84, 0);
    arm.add(new THREE.Mesh(armGeo, shirtMat));
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(0, -0.3, 0.01);
    arm.add(hand);
    return arm;
  };
  const armL = makeArm(-1);
  const armR = makeArm(1);
  body.add(armL, armR);

  // big head with a proper little face
  const headGrp = new THREE.Group();
  headGrp.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), skinMat);
  headGrp.add(head);
  const eyeMat = toon(0x2b2320);
  const glintMat = toon(0xffffff);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.033, 8, 6), eyeMat);
    eye.position.set(s * 0.1, 0.02, 0.252);
    headGrp.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), glintMat);
    glint.position.set(s * 0.1 + 0.014, 0.036, 0.272);
    headGrp.add(glint);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), toon(new THREE.Color(def.skin).offsetHSL(0, 0, -0.07).getHex()));
  nose.position.set(0, -0.03, 0.268);
  headGrp.add(nose);
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 5), toon(0x6b4238));
  mouth.position.set(0, -0.115, 0.245);
  mouth.scale.set(1.15, 0.5, 0.5);
  headGrp.add(mouth);
  const blushMat = toon(0xe89a84);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 5), blushMat);
    cheek.position.set(s * 0.145, -0.07, 0.205);
    cheek.scale.set(1, 0.55, 0.35);
    headGrp.add(cheek);
  }
  // hair: a base cap plus one of a few styles per villager
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.295, 16, 14), hairMat);
  hair.position.set(0, 0.06, -0.02);
  hair.scale.set(1, 0.85, 1);
  headGrp.add(hair);
  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.29, 12, 8), hairMat);
  fringe.position.set(0, 0.17, 0.1);
  fringe.scale.set(1.02, 0.52, 0.58);
  headGrp.add(fringe);
  const hairStyle = rng.int(0, 3);
  if (hairStyle === 1) {
    // long back hair
    const back = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), hairMat);
    back.position.set(0, -0.08, -0.12);
    back.scale.set(1.05, 1.25, 1.0);
    headGrp.add(back);
  } else if (hairStyle === 2) {
    // ponytail
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hairMat);
    tail.position.set(0, 0.0, -0.3);
    tail.scale.set(0.8, 1.5, 0.8);
    headGrp.add(tail);
  } else if (hairStyle === 3) {
    // two buns
    for (const s of [-1, 1]) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), hairMat);
      bun.position.set(s * 0.22, 0.16, -0.16);
      headGrp.add(bun);
    }
  }
  body.add(headGrp);

  // the skyland watch: helmet, spear and round shield
  if (def.role === 'guard') {
    const steel = toon(0x9aa4ad);
    const steelDark = toon(0x6e767e);
    const helmet = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.245, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel);
    helmet.add(dome);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.035, 12), steelDark);
    brim.position.y = 0.005;
    helmet.add(brim);
    helmet.position.y = 0.2;
    helmet.rotation.z = 0.05;
    headGrp.add(helmet);

    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.7, 5), woodMat);
    shaft.geometry.translate(0, 0.6, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), steel);
    tip.position.y = 1.48;
    spear.add(shaft, tip);
    spear.rotation.x = 0.06;
    spear.position.set(0.02, -0.28, 0.04);
    armR.add(spear);

    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12), steel);
    shield.rotation.z = Math.PI / 2;
    shield.position.set(-0.06, -0.22, 0);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), steelDark);
    boss.position.x = -0.05;
    shield.add(boss);
    armL.add(shield);
  }

  if (def.hat === 'straw') {
    const hat = new THREE.Group();
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.045, 12), woodMat);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.15, 12), woodMat);
    top.position.y = 0.1;
    hat.add(brim, top);
    hat.position.y = 0.24;
    hat.rotation.z = 0.08;
    headGrp.add(hat);
  }

  // held props attach to a hand and point forward
  let prop: THREE.Object3D | null = null;
  if (def.prop === 'can') {
    prop = new THREE.Group();
    const canMat = toon(0x7a9e3f);
    const canBody = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.14, 8), canMat);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.22, 5), canMat);
    spout.position.set(0.1, 0.05, 0.05);
    spout.rotation.z = -0.9;
    prop.add(canBody, spout);
    prop.position.set(0, -0.28, 0.08);
    armR.add(prop);
  } else if (def.prop !== 'none') {
    const length = def.prop === 'rod' ? 1.25 : 0.8;
    const held = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, length, 5), woodMat);
    held.geometry.translate(0, def.prop === 'rod' ? 0.45 : 0.28, 0);
    held.rotation.x = def.prop === 'rod' ? 1.15 : 0.35;
    held.position.set(0, -0.28, 0.05);
    (def.prop === 'cane' ? armR : armL).add(held);
    prop = held;
  }

  // shoulder yoke with two buckets, worn during the morning water trip
  const yoke = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.045, 0.05), woodMat);
  bar.position.y = 1.0;
  yoke.add(bar);
  for (const s of [-1, 1]) {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4), toon(0xd9cba8));
    string.position.set(s * 0.3, 0.9, 0);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.12, 8), toon(PAL.woodDark));
    bucket.position.set(s * 0.3, 0.77, 0);
    yoke.add(string, bucket);
  }
  yoke.visible = false;
  body.add(yoke);

  // speech bubble for chats
  const bubble = makeSpeechBubble();
  bubble.position.set(0, 1.95, 0);
  group.add(bubble);

  // builders carry a stone between the quarry and the wall
  let carriedStone: THREE.Mesh | null = null;
  if (def.role === 'builder') {
    carriedStone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.17, 0), toon(0x8a8175));
    carriedStone.position.set(0, 0.95, 0.3);
    carriedStone.visible = false;
    body.add(carriedStone);
  }

  // soft contact shadow grounds the figure
  const blob = makeBlobShadow(0.42);
  blob.position.y = 0.03;
  group.add(blob);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  group.scale.setScalar(def.scale);
  return { group, legL, legR, armL, armR, body, headGrp, prop, yoke, bubble, carriedStone };
}

export class Villager {
  readonly def: VillagerDef;
  readonly group: THREE.Group;
  readonly doorNode: string;

  private readonly legL: THREE.Group;
  private readonly legR: THREE.Group;
  private readonly armL: THREE.Group;
  private readonly armR: THREE.Group;
  private readonly body: THREE.Group;
  private readonly prop: THREE.Object3D | null;
  private readonly yoke: THREE.Group;
  private readonly bubble: THREE.Sprite;
  private readonly carriedStone: THREE.Mesh | null;

  private path: string[] = [];
  private pathIndex = 0;
  private currentEntry = -1;
  private walkPhase = 0;
  private chorePhase = 0;
  private idleTime = 0;
  private atSpot = false;
  private chatHeading: number | null = null;
  private chatTimer = 0;
  private roamCooldown = 0;
  private fillTimer = 0;
  private carrying = false;
  private readonly pose: Pose = { ...REST_POSE };

  // titan defence
  private defendTarget: string | null = null;
  private wasDefending = false;
  private throwTimer = 0;
  private patrolCooldown = 0;
  private patrolAlt = false;
  private readonly stones: THREE.InstancedMesh;
  private readonly stoneState: { active: boolean; t: number; dur: number; power: number; from: THREE.Vector3; to: THREE.Vector3 }[] = [];
  private readonly stoneDummy = new THREE.Object3D();

  /** current position, updated every frame; used by the follow camera */
  readonly position = new THREE.Vector3();

  constructor(def: VillagerDef, worldGroup: THREE.Group) {
    this.def = def;
    const mesh = buildMesh(def);
    this.group = mesh.group;
    this.legL = mesh.legL;
    this.legR = mesh.legR;
    this.armL = mesh.armL;
    this.armR = mesh.armR;
    this.body = mesh.body;
    this.prop = mesh.prop;
    this.yoke = mesh.yoke;
    this.bubble = mesh.bubble;
    this.carriedStone = mesh.carriedStone;
    this.doorNode = def.homeNode ?? HOUSES[def.houseIndex].doorNode;
    const door = nodePos(this.doorNode);
    this.group.position.set(door.x, 0, door.z);
    this.position.copy(this.group.position);
    this.position.y = 1.1 * def.scale;
    this.group.visible = false; // asleep at boot (the day starts at 6.75)

    // personal stone pool for titan defence (world-space: parented above)
    const stoneGeo = new THREE.SphereGeometry(0.1, 6, 5);
    this.stones = new THREE.InstancedMesh(stoneGeo, toon(0x8a8175), 30);
    this.stones.frustumCulled = false;
    this.stones.castShadow = false;
    worldGroup.add(this.stones);
    for (let i = 0; i < 30; i++) {
      this.stoneState.push({
        active: false,
        t: 0,
        dur: 0.9,
        power: 1,
        from: new THREE.Vector3(),
        to: new THREE.Vector3(),
      });
      this.stoneDummy.position.set(0, -50, 0);
      this.stoneDummy.updateMatrix();
      this.stones.setMatrixAt(i, this.stoneDummy.matrix);
    }
  }

  get isIdle(): boolean {
    return this.path.length === 0 && this.group.visible;
  }

  private entryAt(hours: number): number {
    const s = this.def.schedule;
    for (let i = 0; i < s.length; i++) {
      if (hours >= s[i].start && hours < s[i].end) return i;
    }
    return s.length - 1;
  }

  private targetFor(act: Activity, hours: number): string {
    switch (act) {
      case 'sleep':
      case 'home':
        return this.doorNode;
      case 'work':
      case 'fetch':
        return act === 'fetch' ? 'w' : (this.def.workNode ?? this.doorNode);
      case 'market': {
        const stalls = ['sn1', 'sn2', 'sn3'];
        return stalls[Math.floor(hours * 7 + this.def.name.length) % stalls.length];
      }
      case 'roam': {
        const nodes = this.def.roamNodes.length > 0 ? this.def.roamNodes : ['w'];
        return nodes[Math.floor(hours * 3 + this.def.name.length * 5) % nodes.length];
      }
    }
  }

  private walkTo(target: string): void {
    const from = nearestNode(this.group.position.x, this.group.position.z);
    this.path = from === target ? [] : findPath(from, target);
    this.pathIndex = 0;
    this.atSpot = false;
  }

  /** face another villager while chatting */
  faceTowards(x: number, z: number): void {
    if (!this.isIdle) return;
    this.chatHeading = Math.atan2(x - this.group.position.x, z - this.group.position.z);
  }

  startChat(duration: number): void {
    if (this.chatTimer <= 0) this.chatTimer = duration;
  }

  update(dt: number, hours: number, elapsed: number, threat: Threat | null, build: Record<string, number> | null): void {
    const entryIdx = this.entryAt(hours);
    const act = this.def.schedule[entryIdx].act;

    if (entryIdx !== this.currentEntry) {
      this.currentEntry = entryIdx;
      const target = this.targetFor(act, hours);
      if (act !== 'sleep' && !this.group.visible) {
        // waking up: appear at the door, then head wherever the day takes us
        this.group.visible = true;
        this.path = [];
        this.pathIndex = 0;
        this.atSpot = false;
        if (target !== this.doorNode && !this.wasDefending) this.walkTo(target);
      } else if (act === 'fetch' && this.carrying) {
        this.walkTo(this.def.workNode ?? this.doorNode); // finish the delivery
      } else if (!this.wasDefending) {
        this.walkTo(target); // the titan alarm keeps its override otherwise
      }
    }

    // ---- titan alarm overrides the day's plan ----
    // builders keep hauling unless the attack is at their own gate
    let alarmed = threat !== null && threat.active && act !== 'sleep' && this.group.visible;
    if (alarmed && this.def.role === 'builder' && threat) {
      const gate = nodePos(this.def.gate ?? 'rimW');
      if (Math.hypot(threat.x - gate.x, threat.z - gate.z) > 30) alarmed = false;
    }
    // guards hold their own post and loose heavy stones at anything close to it
    if (alarmed && threat && this.def.role === 'guard') {
      const post = nodePos(this.def.workNode ?? 'rimW');
      this.wasDefending = true;
      this.defendTarget = this.def.workNode ?? 'rimW';
      this.chatHeading = Math.atan2(threat.x - this.group.position.x, threat.z - this.group.position.z);
      if (this.path.length === 0 && Math.hypot(this.group.position.x - post.x, this.group.position.z - post.z) > 1.7) {
        this.walkTo(this.defendTarget);
      }
      const onWatch = Math.hypot(threat.x - post.x, threat.z - post.z) < 38;
      if (onWatch && this.path.length === 0) {
        this.throwTimer -= dt;
        if (this.throwTimer <= 0) {
          this.throwTimer = 0.8 + Math.random() * 0.6; // trained: quicker than villagers
          this.throwStone(threat, 2);
        }
      }
    } else if (alarmed && threat) {
      const isChild = this.def.role === 'child';
      const target = isChild
        ? this.doorNode // children run home
        : this.def.role === 'priest'
          ? 't' // the priest stays at his tower, ringing
          : nearestRimNode(threat.x, threat.z);
      if (this.defendTarget !== target) {
        this.defendTarget = target;
        this.walkTo(target);
      }
      this.wasDefending = true;
      this.chatHeading = Math.atan2(threat.x - this.group.position.x, threat.z - this.group.position.z);

      // at the rim: hurl stones at the titan's head
      const rim = nodePos(this.defendTarget);
      const atRim = this.path.length === 0 && Math.hypot(this.group.position.x - rim.x, this.group.position.z - rim.z) < 1.4;
      if (atRim && !isChild) {
        this.throwTimer -= dt;
        if (this.throwTimer <= 0) {
          this.throwTimer = 1.2 + Math.random() * 1.0;
          this.throwStone(threat);
        }
      }
    } else if (this.wasDefending && (!threat || !threat.active)) {
      // all clear — back to ordinary life
      this.wasDefending = false;
      this.defendTarget = null;
      this.throwTimer = 0;
      this.currentEntry = -1; // force a schedule re-evaluation
    }

    let moving = false;

    // ---------- the morning water trip ----------
    if (act === 'fetch' && this.def.fetchesWater) {
      if (!this.carrying) {
        const atWell = this.path.length === 0 && Math.hypot(this.group.position.x, this.group.position.z) < 1.3;
        if (atWell) {
          // filling the buckets: crouch at the well, then shoulder the yoke
          this.fillTimer += dt;
          if (this.fillTimer > 3.2) {
            this.carrying = true;
            this.fillTimer = 0;
            this.yoke.visible = true;
            this.walkTo(this.def.workNode ?? this.doorNode);
          }
        } else if (this.path.length === 0) {
          this.walkTo('w');
        }
      } else if (this.path.length === 0) {
        // buckets delivered
        this.carrying = false;
        this.yoke.visible = false;
      }
    }
    if (this.carrying && act !== 'fetch' && act !== 'work') {
      this.carrying = false;
      this.yoke.visible = false;
    }

    // ---------- moving along the path ----------
    if (this.path.length > 0) {
      moving = true;
      const node = nodePos(this.path[this.pathIndex]);
      const dx = node.x - this.group.position.x;
      const dz = node.z - this.group.position.z;
      const dist = Math.hypot(dx, dz);
      const speed = this.def.speed * (this.carrying ? 0.8 : 1);
      const step = speed * dt;
      if (dist <= step) {
        this.group.position.set(node.x, 0, node.z);
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.path = [];
          this.pathIndex = 0;
          this.atSpot = false;
          this.idleTime = 0;
        }
      } else {
        const ux = dx / dist;
        const uz = dz / dist;
        this.group.position.x += ux * step;
        this.group.position.z += uz * step;
        this.chatHeading = Math.atan2(ux, uz);
        this.walkPhase += dt * speed * 4.4;
      }
    } else {
      this.idleTime += dt;
      // step from the node onto the exact work spot (behind a stall, in the crops, on the bench)
      if (!this.wasDefending && !this.atSpot && this.def.workSpot && (act === 'work' || (this.carrying && act === 'fetch'))) {
        moving = true;
        const spot = this.def.workSpot;
        const dx = spot.x - this.group.position.x;
        const dz = spot.z - this.group.position.z;
        const dist = Math.hypot(dx, dz);
        const step = this.def.speed * 0.6 * dt;
        if (dist > Math.max(0.08, step)) {
          this.group.position.x += (dx / dist) * step;
          this.group.position.z += (dz / dist) * step;
          this.chatHeading = Math.atan2(dx, dz);
          this.walkPhase += dt * 4.2;
        } else {
          this.group.position.set(spot.x, 0, spot.z);
          this.atSpot = true;
        }
      }
      // chore rhythms keep ticking while standing
      if (this.atSpot && (act === 'work' || (act === 'fetch' && this.def.fetchesWater && !this.carrying))) {
        this.chorePhase += dt * (this.def.role === 'smith' ? 6 : 2.2);
      }
      // guards patrol their stretch of the rim when nothing threatens it
      if (this.def.role === 'guard' && act === 'work' && !this.wasDefending && this.idleTime > 10 + this.patrolCooldown) {
        this.patrolCooldown = Math.random() * 12;
        this.idleTime = 0;
        this.patrolAlt = !this.patrolAlt;
        const post = this.def.workNode ?? 'rimW';
        const PATROL: Record<string, string> = { rimW: 'wm', rimE: 'fn1', rimN: 'r1', rimS: 'r6' };
        this.walkTo(this.patrolAlt ? (PATROL[post] ?? post) : post);
      }

      // builders shuttle stones from the quarry to their wall gate
      if (this.def.role === 'builder' && act === 'work' && !this.wasDefending && build) {
        const gateNode = this.def.gate ?? 'rimW';
        if (!this.carrying) {
          const q = nodePos('quarry');
          const atQuarry = this.path.length === 0 && Math.hypot(this.group.position.x - q.x, this.group.position.z - q.z) < 1.5;
          if (atQuarry) {
            this.carrying = true;
            if (this.carriedStone) this.carriedStone.visible = true;
            this.walkTo(gateNode);
          } else if (this.path.length === 0) {
            this.walkTo('quarry');
          }
        } else {
          const g = nodePos(gateNode);
          const atGate = this.path.length === 0 && Math.hypot(this.group.position.x - g.x, this.group.position.z - g.z) < 1.7;
          if (atGate) {
            this.carrying = false;
            if (this.carriedStone) this.carriedStone.visible = false;
            build[gateNode] = (build[gateNode] ?? 0) + 1;
            this.walkTo('quarry');
          } else if (this.path.length === 0) {
            this.walkTo(gateNode);
          }
        }
      }

      // children wander between their hangouts
      if (act === 'roam' && !this.wasDefending && this.idleTime > 9 + this.roamCooldown) {
        this.roamCooldown = Math.random() * 14;
        this.idleTime = 0;
        this.walkTo(this.targetFor('roam', hours + Math.random()));
      }
    }

    if (act === 'sleep' && this.path.length === 0) {
      this.group.visible = false;
    }

    // ---------- pose targets ----------
    const target: Pose = { ...REST_POSE };
    if (moving) {
      const swing = Math.sin(this.walkPhase);
      target.legL = swing * 0.6;
      target.legR = -swing * 0.6;
      target.armL = swing * 0.42;
      target.armR = -swing * 0.42;
      target.lean = 0.06;
      if (this.carrying) {
        // steadying the yoke with both hands
        target.armL = -0.55;
        target.armR = -0.55;
      }
    } else if (act === 'fetch' && this.def.fetchesWater && !this.carrying && this.path.length === 0) {
      // crouched at the well, pulling up the bucket
      const bob = Math.sin(this.chorePhase * 2) * 0.12;
      target.bodyY = -0.22 + bob * 0.4;
      target.armL = -1.0 + bob;
      target.armR = -1.0 - bob;
      target.lean = 0.3;
    } else if (act === 'work' && this.atSpot) {
      switch (this.def.role) {
        case 'farmer':
          target.lean = 0.2;
          target.armR = -0.6 + Math.sin(this.chorePhase) * 0.25;
          target.armL = 0.25;
          break;
        case 'baker':
          target.lean = 0.28;
          target.armL = -0.75 + Math.sin(this.chorePhase * 1.6) * 0.3;
          target.armR = -0.75 - Math.sin(this.chorePhase * 1.6) * 0.3;
          break;
        case 'smith':
          target.lean = 0.3;
          target.armR = -1.15 + Math.sin(this.chorePhase * 1.4) * 0.5;
          target.armL = -0.3;
          break;
        case 'fisher':
          target.armL = -1.05;
          target.lean = 0.05;
          break;
        case 'elder': {
          // sitting on the bench, hands resting in lap
          target.legL = -1.45;
          target.legR = -1.45;
          target.bodyY = -0.3;
          target.armL = -0.45;
          target.armR = -0.45;
          this.chatHeading = Math.atan2(POND.center.x - this.group.position.x, POND.center.z - this.group.position.z);
          break;
        }
        case 'priest': {
          // raising the bell rope at ringing time
          const nearRing = RING_HOURS.some((rh) => {
            let d = hours - rh;
            if (d < -12) d += 24;
            return d >= 0 && d < 0.2 / 60;
          });
          if (nearRing) {
            target.armR = -2.6 + Math.sin(elapsed * 9) * 0.15;
          } else {
            target.armR = Math.sin(this.chorePhase * 0.8) * 0.1;
          }
          break;
        }
        case 'shepherd':
          target.armL = -0.3 + Math.sin(this.chorePhase * 0.6) * 0.1;
          break;
        default:
          // merchants tend their stalls with a gentle sway
          target.armL = 0.15 + Math.sin(this.chorePhase * 0.9) * 0.12;
          target.armR = -0.15 - Math.sin(this.chorePhase * 0.9) * 0.12;
          break;
      }
    }

    // chatting: wave and show the speech bubble
    if (this.chatTimer > 0 && !this.wasDefending) {
      this.chatTimer -= dt;
      const fade = Math.min(1, this.chatTimer / 0.4);
      this.bubble.visible = true;
      (this.bubble.material as THREE.SpriteMaterial).opacity = Math.min(fade, (3.5 - this.chatTimer) * 2);
      if (!moving) {
        target.armR = -2.5 + Math.sin(elapsed * 10) * 0.35;
      }
    } else {
      this.bubble.visible = false;
    }

    // defending: wind up and hurl (the arm follows the throw timer)
    if (this.wasDefending && alarmed) {
      const wind = this.throwTimer < 0.5 ? 1 - this.throwTimer * 2 : 0; // just after a throw
      target.armR = -2.4 + wind * 1.6;
      if (moving) target.armR = -0.5;
    }

    if (this.prop) {
      this.prop.visible =
        this.def.prop === 'cane' || this.def.role === 'guard' || act === 'work';
    }

    // ---------- blend and apply the pose ----------
    const k = 1 - Math.exp(-dt * 11);
    this.pose.legL += (target.legL - this.pose.legL) * k;
    this.pose.legR += (target.legR - this.pose.legR) * k;
    this.pose.armL += (target.armL - this.pose.armL) * k;
    this.pose.armR += (target.armR - this.pose.armR) * k;
    this.pose.lean += (target.lean - this.pose.lean) * k;
    this.pose.bodyY += (target.bodyY - this.pose.bodyY) * k;

    this.legL.rotation.x = this.pose.legL;
    this.legR.rotation.x = this.pose.legR;
    this.armL.rotation.x = this.pose.armL;
    this.armR.rotation.x = this.pose.armR;
    this.body.rotation.x = this.pose.lean;
    this.body.position.y = this.pose.bodyY + (moving ? Math.abs(Math.sin(this.walkPhase)) * 0.045 : Math.sin(elapsed * 1.8) * 0.012);

    // turn smoothly toward where we are heading
    if (this.chatHeading !== null) {
      const diff = shortAngle(this.chatHeading - this.group.rotation.y);
      this.group.rotation.y += diff * Math.min(1, dt * 8);
    }
    // the fisher stands up on the dock planks
    const dockY = this.def.role === 'fisher' && this.atSpot && act === 'work' ? 0.19 : 0;
    this.group.position.y += (dockY - this.group.position.y) * Math.min(1, dt * 10);
    this.position.copy(this.group.position);
    this.position.y = this.group.position.y + 1.1 * this.def.scale;

    // stones in flight
    for (let i = 0; i < this.stoneState.length; i++) {
      const s = this.stoneState[i];
      if (s.active) {
        s.t += dt / s.dur;
        if (s.t >= 1) {
          s.active = false;
          if (threat && threat.active) threat.hits += s.power;
        }
      }
      if (s.active) {
        this.stoneDummy.position.lerpVectors(s.from, s.to, s.t);
        this.stoneDummy.position.y += Math.sin(s.t * Math.PI) * 2.6;
      } else {
        this.stoneDummy.position.set(0, -50, 0);
      }
      this.stoneDummy.updateMatrix();
      this.stones.setMatrixAt(i, this.stoneDummy.matrix);
    }
    this.stones.instanceMatrix.needsUpdate = true;
  }

  /** hurl a stone in a high arc at the titan's head */
  private throwStone(threat: Threat, power = 1): void {
    const slot = this.stoneState.find((s) => !s.active);
    if (!slot) return;
    slot.active = true;
    slot.t = 0;
    slot.dur = 0.9;
    slot.power = power;
    slot.from.set(this.group.position.x, 1.5, this.group.position.z);
    slot.to.set(
      threat.x + (Math.random() - 0.5) * 1.6,
      Math.max(1.5, threat.y + (Math.random() - 0.5) * 1.2),
      threat.z + (Math.random() - 0.5) * 1.6,
    );
  }
}

const RING_HOURS = [7, 12, 18];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function shortAngle(a: number): number {
  let d = a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class VillagerSystem {
  readonly group = new THREE.Group();
  readonly villagers: Villager[] = [];

  constructor() {
    for (const def of makeDefs()) this.spawn(def, this.group);
  }

  /** Bring a new character to life from a data seed (see src/content/villagers.ts). */
  addSeed(seed: VillagerSeed): Villager {
    return this.spawn(makeDef(seed), this.group);
  }

  private spawn(def: VillagerDef, worldGroup: THREE.Group): Villager {
    const v = new Villager(def, worldGroup);
    this.villagers.push(v);
    this.group.add(v.group);
    return v;
  }

  /** Send a character home for good and remove them from the world. */
  remove(name: string): boolean {
    const idx = this.villagers.findIndex((v) => v.def.name === name);
    if (idx < 0) return false;
    const [v] = this.villagers.splice(idx, 1);
    this.group.remove(v.group);
    return true;
  }

  update(dt: number, hours: number, elapsed: number, threat: Threat | null, build: Record<string, number> | null): void {
    for (const v of this.villagers) v.update(dt, hours, elapsed, threat, build);

    // little chat clusters: idle villagers near each other turn, wave and chat
    for (let i = 0; i < this.villagers.length; i++) {
      const a = this.villagers[i];
      if (!a.isIdle) continue;
      for (let j = i + 1; j < this.villagers.length; j++) {
        const b = this.villagers[j];
        if (!b.isIdle) continue;
        if (a.position.distanceTo(b.position) < 1.5) {
          a.faceTowards(b.position.x, b.position.z);
          b.faceTowards(a.position.x, a.position.z);
          if (Math.random() < dt * 0.5) {
            const dur = 2.5 + Math.random() * 2.5;
            a.startChat(dur);
            b.startChat(dur);
          }
        }
      }
    }
  }
}
