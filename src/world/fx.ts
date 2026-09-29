import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { ANVIL, FIELDS, POND, SHEEP_MEADOW } from './layout';

/** Yellow sparks flying off the anvil while the smith works. */
export class SparkSystem {
  readonly group = new THREE.Group();

  private readonly mesh: THREE.InstancedMesh;
  private readonly parts: { active: boolean; age: number; life: number; pos: THREE.Vector3; vel: THREE.Vector3 }[] = [];
  private readonly dummy = new THREE.Object3D();
  private cooldown = 1;

  private static readonly MAX = 26;

  constructor() {
    const geo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    this.mesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.95 }),
      SparkSystem.MAX,
    );
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    for (let i = 0; i < SparkSystem.MAX; i++) {
      this.parts.push({
        active: false,
        age: 0,
        life: 0.7,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }
  }

  update(dt: number, smithWorking: boolean): void {
    if (smithWorking) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = 1.6 + Math.random() * 0.8;
        for (let i = 0; i < 7; i++) {
          const p = this.parts.find((q) => !q.active);
          if (!p) break;
          p.active = true;
          p.age = 0;
          p.life = 0.45 + Math.random() * 0.4;
          p.pos.set(ANVIL.x + 0.2, 0.75, ANVIL.z + 0.2);
          p.vel.set(
            (Math.random() - 0.2) * 2.2,
            1.6 + Math.random() * 1.8,
            (Math.random() - 0.5) * 2.2,
          );
        }
      }
    }
    let i = 0;
    for (const p of this.parts) {
      if (p.active) {
        p.age += dt;
        if (p.age >= p.life) p.active = false;
      }
      if (!p.active) {
        this.dummy.position.set(0, -50, 0);
        this.dummy.scale.setScalar(0.001);
      } else {
        const t = p.age / p.life;
        p.vel.y -= 6.5 * dt;
        p.pos.addScaledVector(p.vel, dt);
        this.dummy.position.copy(p.pos);
        this.dummy.scale.setScalar(1 - t * 0.7);
        this.dummy.rotation.set(p.age * 14, p.age * 10, 0);
      }
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      i++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Fireflies drifting over the pond, fields and meadow after dark. */
export class FireflySystem {
  readonly group = new THREE.Group();

  private readonly points: THREE.Points;
  private readonly base: Float32Array;
  private readonly count = 46;

  constructor() {
    const spots = [POND, SHEEP_MEADOW, ...FIELDS.map((f) => ({ center: f.pos, radius: 3.4 }))];
    const pos = new Float32Array(this.count * 3);
    this.base = new Float32Array(this.count * 3);
    for (let i = 0; i < this.count; i++) {
      const spot = spots[i % spots.length];
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spot.radius;
      this.base[i * 3] = spot.center.x + Math.cos(a) * r;
      this.base[i * 3 + 1] = 0.5 + Math.random() * 1.1;
      this.base[i * 3 + 2] = spot.center.z + Math.sin(a) * r;
    }
    pos.set(this.base);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xffe27a,
        size: 0.09,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  update(_dt: number, elapsed: number, night: number): void {
    this.points.visible = night > 0.15;
    (this.points.material as THREE.PointsMaterial).opacity =
      Math.min(1, night * 1.4) * (0.75 + Math.sin(elapsed * 2.3) * 0.25);
    const attr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      attr.setX(i, this.base[i * 3] + Math.sin(elapsed * 0.7 + i * 2.1) * 0.5);
      attr.setY(i, this.base[i * 3 + 1] + Math.sin(elapsed * 1.3 + i * 1.7) * 0.22);
      attr.setZ(i, this.base[i * 3 + 2] + Math.cos(elapsed * 0.6 + i * 1.3) * 0.5);
    }
    attr.needsUpdate = true;
  }
}

/** Butterflies fluttering between the flower patches by day. */
interface Butterfly {
  group: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  speed: number;
}

export class ButterflySystem {
  readonly group = new THREE.Group();
  private readonly butterflies: Butterfly[] = [];
  private readonly patches: THREE.Vector3[] = [];

  constructor() {
    const rng = makeRng(4711);
    // flutter zones: around the plaza garden, the pond bank and the field lane
    for (const p of [
      { x: 7.5, z: 5.5 },
      { x: -7.5, z: 6 },
      { x: -15, z: 9.5 },
      { x: 17, z: -4 },
      { x: 10, z: -13 },
    ]) {
      this.patches.push(new THREE.Vector3(p.x, 0, p.z));
    }
    const wingGeo = new THREE.PlaneGeometry(0.16, 0.22);
    wingGeo.translate(0.08, 0, 0);
    const colors = [0xe88aa0, 0xe8c85a, 0xb48ae0, 0xf5f1e6];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length],
        side: THREE.DoubleSide,
      });
      const g = new THREE.Group();
      const wingL = new THREE.Mesh(wingGeo, mat);
      const wingR = new THREE.Mesh(wingGeo, mat);
      wingR.rotation.y = Math.PI;
      g.add(wingL, wingR);
      const from = this.patches[i % this.patches.length].clone();
      this.butterflies.push({
        group: g,
        wingL,
        wingR,
        from,
        to: this.nextPatch(from),
        t: rng(),
        speed: 0.12 + rng() * 0.08,
      });
      this.group.add(g);
    }
  }

  private nextPatch(from: THREE.Vector3): THREE.Vector3 {
    const options = this.patches.filter((p) => p.distanceTo(from) > 3);
    const pick = options[Math.floor(Math.random() * options.length)] ?? this.patches[0];
    return pick.clone().add(new THREE.Vector3(Math.random() * 2 - 1, 0, Math.random() * 2 - 1));
  }

  update(dt: number, elapsed: number, daylight: number): void {
    this.group.visible = daylight > 0.35;
    if (!this.group.visible) return;
    const flap = Math.sin(elapsed * 22) * 0.9;
    for (const b of this.butterflies) {
      b.t += dt * b.speed;
      if (b.t >= 1) {
        b.t = 0;
        b.from.copy(b.to);
        b.to = this.nextPatch(b.from);
      }
      b.group.position.lerpVectors(b.from, b.to, b.t);
      b.group.position.y = 0.8 + Math.sin(elapsed * 3 + b.speed * 40) * 0.28;
      b.group.rotation.y += dt * 1.5;
      b.wingL.rotation.z = flap;
      b.wingR.rotation.z = Math.PI + flap;
    }
  }
}
