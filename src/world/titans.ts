import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { Threat, WorldEnv, WorldSystem } from '../core/world';
import { TITANS } from '../content/titans';
import { TERRAIN_RADIUS } from './layout';
import { coastRadius } from './terrain';
import { makeGlow, toon } from './materials';

/**
 * Titans: giant mossy stone creatures that rise from the sea of clouds below
 * the island, hook their fists over the rim and try to haul themselves up into
 * the skyland. The bell rings, villagers run to the rim and pelt them with
 * stones; enough hits and the titan loses its grip and falls back.
 *
 * State machine: lurking → emerging → climbing → (summit roar) → falling.
 */

type TitanState = 'lurking' | 'emerging' | 'climbing' | 'summit' | 'falling';

const HEAD_TOP = 7.5; // head height above the rim at full climb
const HANG_DEPTH = -11; // torso height below the rim while hanging

/** soft cloud puff sprite (the sea of clouds titans rise through) */
function makePuffSprite(scale: number, opacity: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (const [x, y, r, a] of [
    [64, 78, 44, 0.75],
    [42, 62, 30, 0.7],
    [88, 60, 32, 0.7],
    [64, 50, 28, 0.8],
    [104, 80, 24, 0.5],
    [24, 82, 22, 0.5],
  ] as const) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      opacity,
      depthWrite: false,
    }),
  );
  sprite.scale.set(scale, scale * 0.62, 1);
  return sprite;
}

interface Titan {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  eyes: THREE.MeshToonMaterial;
  runes: THREE.MeshToonMaterial;
  puffs: THREE.Group;
  state: TitanState;
  timer: number;
  rise: number;
  size: number;
  flinch: number;
  swayPhase: number;
  giveUp: number;
}

/** geometry pivot at its top edge, for stretching between two points */
const ARM_GEO = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0);
  return g;
})();

const DOWN = new THREE.Vector3(0, -1, 0);

function buildTitanBody(): Omit<Titan, 'state' | 'timer' | 'rise' | 'size' | 'flinch' | 'swayPhase'> {
  const root = new THREE.Group();
  // charred stone dragged up from the dark world below
  const rockMat = toon(0x3b3531);
  const rockDark = toon(0x2a2522);
  const blightMat = toon(0x4a5340);
  const obsidian = toon(0x1a1715);

  // ---- torso: chest, belly, dangling legs, blight and burning cracks ----
  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), rockMat);
  chest.scale.set(1.15, 1.25, 0.85);
  torso.add(chest);
  const belly = new THREE.Mesh(new THREE.DodecahedronGeometry(2.0, 0), rockDark);
  belly.position.y = -2.7;
  belly.scale.set(1.05, 1.25, 0.8);
  torso.add(belly);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.05, 4.4, 1.05), rockDark);
    leg.position.set(side * 0.95, -6.2, 0);
    leg.rotation.z = side * 0.12;
    torso.add(leg);
    const foot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), rockMat);
    foot.position.set(side * 1.05, -8.5, 0.25);
    torso.add(foot);
  }
  for (const [x, y, z, s] of [
    [1.4, 1.9, 0.9, 0.9],
    [-1.6, 1.4, 0.8, 0.75],
    [0.4, -2.0, 1.5, 0.8],
  ] as const) {
    const blight = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 6), blightMat);
    blight.position.set(x, y, z);
    blight.scale.set(1.15, 0.55, 0.7);
    torso.add(blight);
  }
  // burning cracks in the stone
  const runeMat = new THREE.MeshToonMaterial({
    color: 0x401812,
    emissive: 0xff3a20,
    emissiveIntensity: 1.2,
  });
  for (const [x, y, len, rot, w] of [
    [-1.85, 0.4, 1.7, 0, 0.1],
    [1.85, 0.4, 1.7, 0, 0.1],
    [-0.7, 0.9, 2.1, 0.35, 0.09],
    [0.8, -0.6, 1.6, -0.5, 0.09],
  ] as const) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.1), runeMat);
    crack.position.set(x, y, 1.62);
    crack.rotation.z = rot;
    torso.add(crack);
  }
  // obsidian spikes fan from the shoulders
  for (const side of [-1, 1]) {
    for (const [ox, rot] of [
      [-0.35, -0.5],
      [0.25, 0.05],
      [0.75, 0.5],
    ] as const) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.3, 5), obsidian);
      spike.position.set(side * 2.2 + ox * side, 2.6 - Math.abs(ox) * 0.4, 0.2);
      spike.rotation.z = side * (-0.7 + rot);
      torso.add(spike);
    }
  }

  // ---- head: heavy brow, burning eyes, spiked crest ----
  const head = new THREE.Group();
  head.position.y = 3.6;
  const skull = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 0), rockMat);
  skull.scale.set(1, 0.95, 0.95);
  head.add(skull);
  const brow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.5), obsidian);
  brow.position.set(0, 0.55, 0.85);
  brow.rotation.x = 0.25;
  head.add(brow);
  const eyes = new THREE.MeshToonMaterial({
    color: 0x2a0d08,
    emissive: 0xff2d1a,
    emissiveIntensity: 2.2,
  });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6), eyes);
    eye.position.set(s * 0.42, 0.08, 1.0);
    head.add(eye);
  }
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 5), obsidian);
    spike.position.set((i - 1) * 0.45, 1.0 - Math.abs(i - 1) * 0.18, -0.35);
    spike.rotation.x = -0.5;
    head.add(spike);
  }
  torso.add(head);
  root.add(torso);

  // ---- ember glow drifting around the body ----
  for (let i = 0; i < 5; i++) {
    const glow = makeGlow(0xff4422, 1.6 + (i % 3) * 0.5, 0.35);
    const a = (i / 5) * Math.PI * 2;
    glow.sprite.position.set(Math.cos(a) * 2.4, Math.sin(a * 2) * 2.2, Math.cos(a * 2) * 1.8);
    (glow.sprite.material as THREE.SpriteMaterial).opacity = 0.28 + (i % 2) * 0.1;
    root.add(glow.sprite);
  }

  // ---- fists: static, hooked over the lip ----
  for (const side of [-1, 1]) {
    const fist = new THREE.Group();
    fist.position.set(side * 2.25, 0.35, 0.5);
    const knuckle = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 0), rockMat);
    fist.add(knuckle);
    for (const f of [-0.45, 0, 0.45]) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 0.55), obsidian);
      finger.position.set(f, 0.35, 0.35);
      finger.rotation.x = -0.6;
      fist.add(finger);
    }
    root.add(fist);
  }

  // ---- stretchy arms: scaled between shoulder and fist every frame ----
  const armL = new THREE.Mesh(ARM_GEO, rockMat);
  const armR = new THREE.Mesh(ARM_GEO, rockDark);
  root.add(armL, armR);

  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });

  return { root, torso, head, armL, armR, eyes, runes: runeMat, puffs: new THREE.Group(), giveUp: 0 };
}

export class TitanSystem implements WorldSystem {
  readonly group = new THREE.Group();

  /** the cloud blanket the skyland floats on, drifting slowly below the rim */
  private readonly sea = new THREE.Group();
  private readonly titans: Titan[] = [];
  private readonly rng = makeRng(90210);
  private nextAttack: number = TITANS.firstDelay;

  constructor() {
    for (let i = 0; i < 3; i++) {
      const body = buildTitanBody();
      const puffs = new THREE.Group();
      for (let p = 0; p < 7; p++) {
        const puff = makePuffSprite(this.rng.range(9, 15), this.rng.range(0.5, 0.75));
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(2, 6);
        puff.position.set(Math.cos(a) * r, this.rng.range(-8, -3), Math.sin(a) * r);
        puffs.add(puff);
      }
      body.root.add(puffs);
      body.root.visible = false;
      this.titans.push({
        ...body,
        puffs,
        state: 'lurking',
        timer: 0,
        rise: 0,
        size: this.rng.range(0.95, 1.2),
        flinch: 0,
        swayPhase: this.rng.range(0, Math.PI * 2),
        giveUp: 0,
      });
      body.root.scale.setScalar(this.titans[i].size);
      this.group.add(body.root);
    }

    // the sea of clouds: a full blanket filling the whole underside of the
    // skyland, spilling past the rim, in two soft layers. Puffs near the rim
    // stay small and low so they never swallow the wall.
    for (let i = 0; i < 90; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng()) * (TERRAIN_RADIUS + 18);
      const layer = this.rng();
      const nearRim = r > 40 && r < 72;
      const puff = makePuffSprite(
        nearRim ? this.rng.range(13, 21) : this.rng.range(20, 40) * (layer > 0.5 ? 1.25 : 1),
        this.rng.range(0.42, 0.7),
      );
      const y = nearRim
        ? -12.5 + this.rng.range(-1.5, 1.5)
        : -7.5 - layer * 7 + this.rng.range(-1.5, 1.5);
      puff.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      this.sea.add(puff);
    }

    // the deep cloud floor: an endless ocean of cloud far below the world, so
    // there is no void under the tree — the trunk simply disappears into it
    for (let i = 0; i < 170; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng()) * 260;
      const puff = makePuffSprite(this.rng.range(50, 95), this.rng.range(0.5, 0.75));
      puff.position.set(Math.cos(a) * r, -46 - this.rng() * 13, Math.sin(a) * r);
      this.sea.add(puff);
    }
    this.group.add(this.sea);
  }

  /** key T / ?titan=1 — start an attack immediately if capacity allows */
  summon(): boolean {
    const idle = this.titans.find((t) => t.state === 'lurking');
    if (!idle) return false;
    const point = this.pickPoint();
    if (!point) return false;
    this.begin(idle, point);
    return true;
  }

  /** an attack point far from any titan already climbing */
  private pickPoint(): { x: number; z: number } | null {
    const busy = this.titans
      .filter((t) => t.state !== 'lurking')
      .map((t) => Math.atan2(t.root.position.z, t.root.position.x));
    const free = TITANS.attackPoints.filter((p) => {
      const a = Math.atan2(p.z, p.x);
      return !busy.some((b) => {
        let d = Math.abs(a - b);
        while (d > Math.PI) d = Math.PI * 2 - d;
        return d < 0.9;
      });
    });
    if (free.length === 0) return null;
    return free[this.rng.int(0, free.length - 1)];
  }

  private begin(titan: Titan, point: { x: number; z: number }): void {
    const angle = Math.atan2(point.z, point.x);
    const r = coastRadius(angle) - 1.5; // fists hook just over the lip
    titan.root.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    titan.root.rotation.y = angle - Math.PI / 2; // face the island centre
    titan.root.rotation.x = 0;
    titan.state = 'emerging';
    titan.timer = 0;
    titan.rise = 0;
    titan.flinch = 0;
    titan.giveUp = 0;
    titan.root.visible = true;
  }

  update(ctx: { dt: number; elapsed: number; env: WorldEnv }): void {
    const threat: Threat = ctx.env.threat;
    this.sea.rotation.y += ctx.dt * 0.006; // the cloud sea slowly turns

    const activeCount = this.titans.filter((t) => t.state !== 'lurking').length;
    if (TITANS.enabled && activeCount < TITANS.maxActive) {
      this.nextAttack -= ctx.dt;
      if (this.nextAttack <= 0) {
        const lurker = this.titans.find((t) => t.state === 'lurking');
        const point = lurker ? this.pickPoint() : null;
        if (lurker && point) {
          this.begin(lurker, point);
          // the next titan of the wave follows soon after
          this.nextAttack = this.rng.range(TITANS.interval[0], TITANS.interval[1]) * 0.3;
        } else {
          this.nextAttack = 8;
        }
      }
    }

    let active: Titan | null = null;
    let shake = 0;

    for (const titan of this.titans) {
      if (titan.state !== 'lurking') titan.flinch = Math.max(0, titan.flinch - ctx.dt);
      switch (titan.state) {
        case 'lurking':
          break;

        case 'emerging': {
          titan.timer += ctx.dt;
          titan.rise = Math.min(0.45, titan.timer / 24);
          shake = Math.max(shake, 0.2);
          if (titan.timer >= 11) {
            titan.state = 'climbing';
            titan.timer = 0;
          }
          break;
        }

        case 'climbing': {
          titan.timer += ctx.dt;
          titan.rise += ctx.dt / TITANS.climbTime;
          shake = Math.max(shake, 0.32 + Math.sin(ctx.elapsed * 2.2) * 0.1);
          // held near the rim for too long → the grip fails and it falls
          if (titan.rise <= TITANS.giveUpAt) {
            titan.giveUp += ctx.dt;
            if (titan.giveUp >= TITANS.giveUpAfter) {
              titan.state = 'falling';
              titan.timer = 0;
            }
          } else {
            titan.giveUp = Math.max(0, titan.giveUp - ctx.dt * 0.5);
          }
          if (titan.rise >= 1) {
            titan.state = 'summit';
            titan.timer = 0;
          }
          break;
        }

        case 'summit': {
          titan.timer += ctx.dt;
          titan.rise = 1 + Math.sin(titan.timer * 3) * 0.02;
          shake = 1.0; // the island trembles under the roar
          if (titan.timer >= 3.5) {
            titan.state = 'falling';
            titan.timer = 0;
          }
          break;
        }

        case 'falling': {
          titan.timer += ctx.dt;
          titan.rise -= ctx.dt * 0.8;
          titan.root.rotation.x = -Math.min(0.7, titan.timer * 0.4); // tips away outward
          shake = Math.max(shake, 0.3);
          if (titan.rise <= -0.2) {
            titan.state = 'lurking';
            titan.root.visible = false;
            titan.root.rotation.x = 0;
            this.nextAttack = this.rng.range(TITANS.interval[0], TITANS.interval[1]) * 0.45;
          }
          break;
        }
      }

      if (titan.state !== 'lurking') {
        this.applyPose(titan, ctx.elapsed);
        if (!active || titan.rise > active.rise) active = titan;
      }
    }

    // stones landed by villagers drag the climb back down
    if (active && threat.hits > 0) {
      active.rise = Math.max(TITANS.giveUpAt - 0.06, active.rise - threat.hits * TITANS.stoneDamage);
      active.flinch = 0.8;
      threat.hits = 0;
    }

    // publish the threat for the bell, the villagers and the camera
    threat.active = !!active;
    threat.shake = shake;
    if (active) {
      threat.x = active.root.position.x;
      threat.y = -3 + THREE.MathUtils.clamp(active.rise, 0, 1) * (HEAD_TOP + 3);
      threat.z = active.root.position.z;
    }
  }

  /** pose the titan body from its climb progress */
  private applyPose(titan: Titan, elapsed: number): void {
    const p = THREE.MathUtils.clamp(titan.rise, 0, 1.15);
    const sway = Math.sin(elapsed * 0.8 + titan.swayPhase) * 0.05;
    // a heavy, lurching haul upward
    const lurch = Math.max(0, Math.sin(elapsed * 1.6 + titan.swayPhase)) * 0.7;
    const torsoY = THREE.MathUtils.lerp(HANG_DEPTH, 1.6, p) + Math.abs(sway) * 8 + lurch * Math.min(1, p * 2);
    titan.torso.position.y = torsoY;
    titan.torso.rotation.z = sway * 2.2;
    titan.torso.rotation.x = 0.12; // hunched, hungry
    titan.head.rotation.y = sway * 3 + (titan.flinch > 0 ? Math.sin(titan.flinch * 30) * 0.18 : 0);
    titan.head.rotation.x = -0.3 + (1 - Math.min(1, p)) * 0.5; // eyes locked on the village
    titan.puffs.visible = p < 0.85;
    // eyes and cracks flare while roaring at the summit
    const flare = titan.state === 'summit' ? 2.2 : 1;
    titan.eyes.emissiveIntensity = 2.2 * flare;
    titan.runes.emissiveIntensity = 1.2 * flare;

    // stretch each arm between the rising shoulder and its fixed fist
    for (const [arm, side] of [
      [titan.armL, -1],
      [titan.armR, 1],
    ] as const) {
      const shoulder = new THREE.Vector3(side * 2.45, torsoY + 1.3, 0.1);
      const fist = new THREE.Vector3(side * 2.25, 0.5, 0.55);
      const dir = fist.clone().sub(shoulder);
      const length = Math.max(0.6, dir.length());
      arm.position.copy(shoulder);
      arm.scale.set(1, length, 1);
      arm.quaternion.setFromUnitVectors(DOWN, dir.normalize());
      // a modest elbow bulge near the fist end
      arm.scale.x = arm.scale.z = 0.9 + 0.25 * (1 - p);
    }
  }
}
