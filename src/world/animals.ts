import * as THREE from 'three';
import { makeRng, Rng } from '../core/rng';
import { makeBlobShadow, PAL, toon } from './materials';
import { COOP, POND, SHEEP_MEADOW } from './layout';
import { CREATURES } from '../content/creatures';

/**
 * The village menagerie: a grazing sheep flock the shepherd watches over,
 * pecking chickens by the coop, a duck paddling circles on the pond and a
 * dog that dozes by the well and occasionally stretches its legs.
 */

interface Walker {
  group: THREE.Group;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  speed: number;
  heading: number;
  wait: number;
}

function walkTowards(w: Walker, dt: number): boolean {
  const dx = w.target.x - w.pos.x;
  const dz = w.target.z - w.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.06) return true;
  const step = Math.min(w.speed * dt, dist);
  w.pos.x += (dx / dist) * step;
  w.pos.z += (dz / dist) * step;
  w.heading = Math.atan2(dx, dz);
  return false;
}

function pickMeadowPoint(rng: Rng): THREE.Vector3 {
  const a = rng() * Math.PI * 2;
  const r = Math.sqrt(rng()) * (SHEEP_MEADOW.radius - 0.5);
  return new THREE.Vector3(
    SHEEP_MEADOW.center.x + Math.cos(a) * r,
    0,
    SHEEP_MEADOW.center.z + Math.sin(a) * r,
  );
}

class Sheep implements Walker {
  group = new THREE.Group();
  pos = new THREE.Vector3();
  target = new THREE.Vector3();
  speed = 0.55;
  heading = 0;
  wait = 0;
  private neck: THREE.Group;
  private grazing = false;

  constructor(rng: Rng, position: THREE.Vector3) {
    this.pos.copy(position);
    this.target.copy(position);

    const wool = toon(PAL.sheepWool);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), wool);
    body.position.y = 0.38;
    body.scale.set(1.25, 1, 1.05);
    this.group.add(body);
    for (const [x, z] of [[-0.3, 0.16], [0.3, 0.16], [-0.3, -0.16], [0.3, -0.16]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.18, 6), toon(0x6b5540));
      leg.position.set(x, 0.12, z);
      this.group.add(leg);
    }
    this.neck = new THREE.Group();
    this.neck.position.set(0.36, 0.48, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), toon(PAL.sheepFace));
    head.position.set(0.1, 0, 0);
    head.scale.set(1.15, 0.9, 0.9);
    const earMat = toon(0x6b5540);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), earMat);
      ear.position.set(0.06, 0.06, s * 0.11);
      ear.scale.set(1.4, 0.5, 0.7);
      this.neck.add(ear);
    }
    this.neck.add(head);
    this.group.add(this.neck);

    const blob = makeBlobShadow(0.5);
    blob.position.y = 0.03;
    this.group.add(blob);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.scale.setScalar(rng.range(0.85, 1.1));
    this.group.rotation.y = rng.range(0, Math.PI * 2);
  }

  update(dt: number, elapsed: number, shepherdPos: THREE.Vector3 | null): void {
    // gently drift away when the shepherd comes close
    if (shepherdPos && shepherdPos.distanceTo(this.pos) < 2.2) {
      const away = this.pos.clone().sub(shepherdPos).setY(0).normalize();
      this.target.copy(this.pos).addScaledVector(away, 1.4);
      this.grazing = false;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.grazing) {
        this.neck.rotation.z = -0.9 + Math.sin(elapsed * 2 + this.wait) * 0.12;
      }
    } else if (walkTowards(this, dt)) {
      this.wait = 2 + Math.random() * 5;
      this.grazing = Math.random() < 0.65;
      this.neck.rotation.z = this.grazing ? -0.9 : 0;
      this.target.copy(pickMeadowPoint(makeRng(Math.floor(Math.random() * 1e9))));
    }
    const cur = this.group.rotation.y;
    let diff = this.heading - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y = cur + diff * Math.min(1, dt * 3);
    this.group.position.copy(this.pos);
  }
}

class Chicken implements Walker {
  group = new THREE.Group();
  pos = new THREE.Vector3();
  target = new THREE.Vector3();
  speed = 0.9;
  heading = 0;
  wait = 0;
  private head: THREE.Group;

  constructor(rng: Rng, position: THREE.Vector3) {
    this.pos.copy(position);
    this.target.copy(position);
    const feather = toon(rng.chance(0.5) ? PAL.chickenWhite : PAL.chickenBrown);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), feather);
    body.position.y = 0.15;
    body.scale.set(1.15, 1, 0.9);
    this.group.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 6), feather);
    tail.position.set(-0.15, 0.2, 0);
    tail.rotation.z = 0.9;
    this.group.add(tail);
    this.head = new THREE.Group();
    this.head.position.set(0.13, 0.26, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), feather);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.07, 5), toon(0xe0a030));
    beak.rotation.z = -Math.PI / 2;
    beak.position.x = 0.1;
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.05), toon(0xc8483c));
    comb.position.y = 0.08;
    this.head.add(head, beak, comb);
    this.group.add(this.head);

    const blob = makeBlobShadow(0.24);
    blob.position.y = 0.02;
    this.group.add(blob);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.rotation.y = rng.range(0, Math.PI * 2);
  }

  update(dt: number, elapsed: number): void {
    if (this.wait > 0) {
      this.wait -= dt;
      // pecking bob
      this.head.rotation.z = Math.max(0, Math.sin(elapsed * 9)) * -0.7;
    } else if (walkTowards(this, dt)) {
      this.wait = 0.8 + Math.random() * 2.6;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.9;
      this.target.set(COOP.x + Math.cos(a) * r, 0, COOP.z + Math.sin(a) * r);
    }
    const cur = this.group.rotation.y;
    let diff = this.heading - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y = cur + diff * Math.min(1, dt * 6);
    this.group.position.copy(this.pos);
  }
}

class Duck {
  group = new THREE.Group();
  private angle = Math.random() * Math.PI * 2;
  constructor() {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(PAL.duckBody));
    body.scale.set(1.3, 0.9, 1);
    body.position.y = 0.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(PAL.duckHead));
    head.position.set(0.18, 0.22, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 5), toon(0xe0a030));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.29, 0.2, 0);
    this.group.add(body, head, beak);
    const blob = makeBlobShadow(0.26);
    blob.position.y = 0.02;
    this.group.add(blob);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  update(dt: number, elapsed: number): void {
    this.angle += dt * 0.22;
    const r = 1.9;
    this.group.position.set(
      POND.center.x + Math.cos(this.angle) * r,
      0.06 + Math.sin(elapsed * 3) * 0.015,
      POND.center.z + Math.sin(this.angle) * r,
    );
    this.group.rotation.y = -this.angle;
  }
}

class Dog {
  group = new THREE.Group();
  private pos = new THREE.Vector3(1.4, 0, 0.9);
  private target = new THREE.Vector3();
  private state: 'sleep' | 'trot' = 'sleep';
  private timer = 6 + Math.random() * 8;
  private tail: THREE.Mesh;
  private spots = [
    new THREE.Vector3(1.4, 0, 0.9),
    new THREE.Vector3(-1.6, 0, -1.1),
    new THREE.Vector3(2.2, 0, -1.6),
    new THREE.Vector3(-2.1, 0, 1.5),
  ];

  constructor() {
    const fur = toon(PAL.dogFur);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur);
    body.scale.set(1.5, 0.85, 0.9);
    body.position.y = 0.17;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), fur);
    head.position.set(0.3, 0.28, 0);
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), toon(0x713f28));
    snout.scale.set(1.4, 0.8, 0.9);
    snout.position.set(0.42, 0.25, 0);
    for (const [x, z] of [[-0.18, 0.09], [0.18, 0.09], [-0.18, -0.09], [0.18, -0.09]] as const) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 5), fur);
      leg.position.set(x, 0.06, z);
      this.group.add(leg);
    }
    this.tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.22, 5), fur);
    this.tail.position.set(-0.32, 0.28, 0);
    this.tail.rotation.z = 0.8;
    this.group.add(body, head, snout, this.tail);
    const blob = makeBlobShadow(0.36);
    blob.position.y = 0.02;
    this.group.add(blob);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    this.group.position.copy(this.pos);
    this.group.rotation.y = 2.2;
  }

  update(dt: number, elapsed: number): void {
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.state === 'sleep') {
        this.state = 'trot';
        this.target.copy(this.spots[Math.floor(Math.random() * this.spots.length)]);
        this.timer = 5 + Math.random() * 4;
      } else {
        this.state = 'sleep';
        this.timer = 8 + Math.random() * 12;
      }
    }
    if (this.state === 'trot') {
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const step = Math.min(1.3 * dt, dist);
        this.pos.x += (dx / dist) * step;
        this.pos.z += (dz / dist) * step;
        const heading = Math.atan2(dx, dz);
        const cur = this.group.rotation.y;
        let diff = heading - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.group.rotation.y = cur + diff * Math.min(1, dt * 6);
        this.group.position.y = Math.abs(Math.sin(elapsed * 9)) * 0.04;
      } else {
        this.timer = Math.min(this.timer, 0.6);
      }
      this.tail.rotation.x = Math.sin(elapsed * 12) * 0.5;
    } else {
      this.group.position.y = 0;
      this.tail.rotation.x = Math.sin(elapsed * 1.2) * 0.12;
    }
    this.group.position.x = this.pos.x;
    this.group.position.z = this.pos.z;
  }
}

/** A fish gliding under the pond surface, tail swishing, staying off the bank. */
class PondFish {
  group = new THREE.Group();
  private pos: THREE.Vector3;
  private heading: number;
  private turnVel = 0;
  private wanderT = 0;
  private readonly dart: boolean;
  private readonly speed: number;
  private readonly tail: THREE.Object3D;
  private readonly phase = Math.random() * 10;

  constructor(rng: Rng, size: number, color: number, patch?: number) {
    this.pos = new THREE.Vector3();
    this.heading = rng.range(0, Math.PI * 2);
    this.dart = size < 0.8;
    this.speed = this.dart ? rng.range(0.8, 1.3) : rng.range(0.25, 0.45);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09 * size, 10, 8), toon(color));
    body.scale.set(1.75, 0.7, 0.7);
    this.group.add(body);

    // a color patch along the back for some koi
    if (patch !== undefined) {
      const spot = new THREE.Mesh(new THREE.SphereGeometry(0.075 * size, 8, 6), toon(patch));
      spot.scale.set(1.25, 0.55, 0.8);
      spot.position.set(-0.01 * size, 0.045 * size, 0.012 * size);
      this.group.add(spot);
    }

    // tail fin hinged at the body, swishing behind
    const tail = new THREE.Group();
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.055 * size, 0.16 * size, 4), toon(color));
    fin.rotation.z = Math.PI / 2; // point backwards
    fin.scale.set(1, 1, 0.3);
    fin.position.x = -0.09 * size;
    tail.add(fin);
    tail.position.x = -0.13 * size;
    this.tail = tail;
    this.group.add(tail);

    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false;
    });

    // spawn somewhere in the pond
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.5, POND.radius - 1.2);
    this.pos.set(POND.center.x + Math.cos(a) * r, 0, POND.center.z + Math.sin(a) * r);
  }

  update(dt: number, elapsed: number): void {
    // wander: pick a new turn rate now and then
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = this.dart ? 0.4 + Math.random() * 0.8 : 1.2 + Math.random() * 2.2;
      this.turnVel = (Math.random() - 0.5) * (this.dart ? 4 : 1.6);
    }
    this.heading += this.turnVel * dt;

    // steer back inside the pond when nearing the bank
    const dx = this.pos.x - POND.center.x;
    const dz = this.pos.z - POND.center.z;
    const dist = Math.hypot(dx, dz);
    if (dist > POND.radius - 0.9) {
      const toCenter = Math.atan2(-dz, -dx);
      let diff = toCenter - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 3.5);
    }

    this.pos.x += Math.cos(this.heading) * this.speed * dt;
    this.pos.z += Math.sin(this.heading) * this.speed * dt;
    this.group.position.set(this.pos.x, 0.032 + Math.sin(elapsed * 2 + this.phase) * 0.006, this.pos.z);
    this.group.rotation.y = -this.heading + Math.PI / 2;
    this.tail.rotation.y = Math.sin(elapsed * (this.dart ? 11 : 6) + this.phase) * 0.5;
  }
}

export class AnimalSystem {
  readonly group = new THREE.Group();
  private readonly sheep: Sheep[] = [];
  private readonly chickens: Chicken[] = [];
  private readonly fish: PondFish[] = [];
  private readonly duck: Duck | null = null;
  private readonly dog: Dog | null = null;

  constructor() {
    const rng = makeRng(8123);
    for (let i = 0; i < CREATURES.sheep; i++) {
      const sheep = new Sheep(rng, pickMeadowPoint(rng));
      this.sheep.push(sheep);
      this.group.add(sheep.group);
    }
    for (let i = 0; i < CREATURES.chickens; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.5, 1.6);
      const chicken = new Chicken(
        rng,
        new THREE.Vector3(COOP.x + Math.cos(a) * r, 0, COOP.z + Math.sin(a) * r),
      );
      this.chickens.push(chicken);
      this.group.add(chicken.group);
    }
    // koi: white, red, gold — some with patches; minnows: small bright darters
    const koiPalette: [number, number | undefined][] = [
      [0xf1eadb, 0xdc4b2f],
      [0xdc4b2f, undefined],
      [0xe7aa31, undefined],
      [0xf1eadb, 0xe7aa31],
    ];
    for (let i = 0; i < CREATURES.koi; i++) {
      const [color, patch] = koiPalette[i % koiPalette.length];
      const koi = new PondFish(rng, rng.range(1.0, 1.35), color, patch);
      this.fish.push(koi);
      this.group.add(koi.group);
    }
    const minnowColors = [0xffe66d, 0x56dffc, 0xff72ad];
    for (let i = 0; i < CREATURES.minnows; i++) {
      const minnow = new PondFish(rng, rng.range(0.55, 0.7), minnowColors[i % minnowColors.length]);
      this.fish.push(minnow);
      this.group.add(minnow.group);
    }
    if (CREATURES.duck) {
      this.duck = new Duck();
      this.group.add(this.duck.group);
    }
    if (CREATURES.dog) {
      this.dog = new Dog();
      this.group.add(this.dog.group);
    }
  }

  update(dt: number, elapsed: number, shepherdPos: THREE.Vector3 | null): void {
    for (const s of this.sheep) s.update(dt, elapsed, shepherdPos);
    for (const c of this.chickens) c.update(dt, elapsed);
    for (const f of this.fish) f.update(dt, elapsed);
    this.duck?.update(dt, elapsed);
    this.dog?.update(dt, elapsed);
  }
}
