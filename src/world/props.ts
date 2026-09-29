import * as THREE from 'three';
import { makeRng, Rng } from '../core/rng';
import { ANVIL, BENCH, COOP, DOCK, FIELDS, FLOWER_BEDS, HouseDef, HOUSES, LAMP_LIGHT_INDICES, LAMPS, POND, STALLS, TOWER } from './layout';
import { GlowSprite, makeGlow, PAL, toon } from './materials';

export interface NightGlass {
  mat: THREE.MeshToonMaterial;
  max: number;
}

export interface VillageParts {
  group: THREE.Group;
  /** window/lantern glass that glows at night */
  nightGlass: NightGlass[];
  /** additive halos over the same lights */
  glows: GlowSprite[];
  /** world-space chimney tops for the smoke system */
  chimneys: THREE.Vector3[];
  /** clock hands update, called with the game hour */
  updateHands: (hours: number) => void;
  /** bell swing, called every frame with game hours + elapsed seconds */
  updateBell: (hours: number, elapsed: number) => void;
  /** lanterns that get a real point light */
  lampLights: THREE.PointLight[];
}

const SHUTTER_COLORS = [0x49847d, 0x5e7fa3, 0x7a6aa0, 0x9a5f4a];

function makeGlass(rng: Rng): { mat: THREE.MeshToonMaterial; max: number } {
  // some houses keep warm windows all night, a few go dark
  const roll = rng();
  const max = roll < 0.6 ? 1.5 : roll < 0.9 ? 1.0 : 0.3;
  const mat = new THREE.MeshToonMaterial({
    color: 0x9fc6d8,
    emissive: 0xffca7a,
    emissiveIntensity: 0,
  });
  return { mat, max };
}

function darker(color: number, f = 0.8): number {
  return new THREE.Color(color).multiplyScalar(f).getHex();
}

/** Gabled roof with fascia boards, verge boards and a rounded ridge cap. */
function gableRoof(width: number, depth: number, height: number, color: number): THREE.Group {
  const overhang = 0.32;
  const g = new THREE.Group();
  const hw = width / 2 + overhang;
  const length = depth + overhang * 2;

  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  geo.translate(0, 0, -length / 2);
  const roofMat = toon(color);
  const prism = new THREE.Mesh(geo, roofMat);
  prism.castShadow = true;
  prism.receiveShadow = true;
  g.add(prism);

  const trimMat = toon(darker(color, 0.72));
  // fascia boards tucked under both eaves
  for (const s of [-1, 1]) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, length), trimMat);
    board.position.set(s * (hw - 0.03), -0.03, 0);
    board.castShadow = true;
    g.add(board);
  }
  // verge boards running down the gable slopes
  const slopeLen = Math.hypot(hw, height) + 0.1;
  for (const s of [-1, 1]) {
    for (const end of [-1, 1]) {
      const verge = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.09, 0.09), trimMat);
      verge.position.set(s * hw * 0.52, height * 0.52, end * (length / 2 + 0.02));
      verge.rotation.z = Math.atan2(-height, s * hw);
      verge.castShadow = true;
      g.add(verge);
    }
  }
  // rounded ridge cap
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, length + 0.04, 10), trimMat);
  ridge.rotation.x = Math.PI / 2;
  ridge.position.set(0, height, 0);
  ridge.castShadow = true;
  g.add(ridge);

  return g;
}

function buildWindow(
  parent: THREE.Group,
  x: number,
  y: number,
  z: number,
  alongX: boolean,
  rng: Rng,
  nightGlass: NightGlass[],
  glows: GlowSprite[],
): void {
  const frameMat = toon(0x8a5f38);
  const glass = makeGlass(rng);
  nightGlass.push(glass);
  const fd = alongX ? z : x; // signed face offset

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.72 : 0.1, 0.78, alongX ? 0.1 : 0.72),
    frameMat,
  );
  frame.position.set(x, y, z);
  parent.add(frame);

  const pane = new THREE.Mesh(
    new THREE.BoxGeometry(alongX ? 0.56 : 0.1, 0.62, alongX ? 0.1 : 0.56),
    glass.mat,
  );
  pane.position.set(x, y, z);
  parent.add(pane);

  // mullion cross on the glass
  const off = alongX ? new THREE.Vector3(0, 0, Math.sign(fd) * 0.055) : new THREE.Vector3(Math.sign(fd) * 0.055, 0, 0);
  const vert = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.05 : 0.02, 0.62, alongX ? 0.02 : 0.05), frameMat);
  vert.position.set(x + off.x, y, z + off.z);
  const horz = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.56 : 0.02, 0.05, alongX ? 0.02 : 0.56), frameMat);
  horz.position.copy(vert.position);
  parent.add(vert, horz);

  // shutters on some windows
  if (alongX && rng.chance(0.6)) {
    const shutterMat = toon(rng.pick(SHUTTER_COLORS));
    for (const s of [-1, 1]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.045), shutterMat);
      shutter.position.set(x + s * 0.5, y, z + off.z * 0.8);
      shutter.castShadow = true;
      parent.add(shutter);
    }
  }

  // flower box under some front windows
  if (alongX && rng.chance(0.55)) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 0.2), toon(PAL.woodMid));
    box.position.set(x, y - 0.44, z + off.z * 1.6);
    box.castShadow = true;
    parent.add(box);
    const flowerColors = [0xe88aa0, 0xe8c85a, 0xc8483c, 0xf5f1e6];
    for (let f = 0; f < 3; f++) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 7, 6),
        toon(rng.pick(flowerColors)),
      );
      bloom.position.set(x - 0.2 + f * 0.2, y - 0.34, z + off.z * 1.9);
      parent.add(bloom);
    }
  }

  const glow = makeGlow(PAL.glowWarm, 1.5, 0.55);
  glow.sprite.position.set(x + off.x * 1.8, y, z + off.z * 1.8);
  parent.add(glow.sprite);
  glows.push(glow);
}

function buildHouse(def: HouseDef, rng: Rng, nightGlass: NightGlass[], glows: GlowSprite[], chimneys: THREE.Vector3[]): THREE.Group {
  const g = new THREE.Group();
  g.position.set(def.pos.x, 0, def.pos.z);
  g.rotation.y = def.rotY;

  const wallH = rng.range(1.9, 2.2);
  const roofH = rng.range(1.15, 1.5);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(def.width, wallH, def.depth), toon(def.wallColor));
  walls.position.y = wallH / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  // stone foundation strip under the walls
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(def.width + 0.1, 0.26, def.depth + 0.1),
    toon(0x9a9186),
  );
  foundation.position.y = 0.13;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  g.add(foundation);

  // striped awning over the door on some cottages
  if (rng.chance(0.5)) {
    const doorX = def.width * 0.1;
    const awningMat = toon(rng.chance(0.5) ? 0xc94f3f : 0x49847d);
    const canvas = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.6), awningMat);
    canvas.position.set(doorX, 1.62, def.depth / 2 + 0.3);
    canvas.rotation.x = 0.32;
    canvas.castShadow = true;
    g.add(canvas);
    for (const s of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.35, 6), toon(PAL.woodDark));
      pole.position.set(doorX + s * 0.6, 0.68, def.depth / 2 + 0.55);
      g.add(pole);
    }
  }

  // half-timbered corners on some cottages
  if (rng.chance(0.45)) {
    const beamMat = toon(PAL.woodDark);
    const bw = 0.13;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(bw, wallH, bw), beamMat);
        beam.position.set(sx * (def.width / 2 - bw / 2 + 0.01), wallH / 2, sz * (def.depth / 2 - bw / 2 + 0.01));
        g.add(beam);
      }
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(def.width + 0.06, 0.13, 0.1), beamMat);
    lintel.position.set(0, wallH - 0.08, def.depth / 2 + 0.02);
    g.add(lintel);
  }

  const roof = gableRoof(
    def.ridgeAlongX ? def.depth : def.width,
    def.ridgeAlongX ? def.width : def.depth,
    roofH,
    def.roofColor,
  );
  roof.position.y = wallH;
  if (def.ridgeAlongX) roof.rotation.y = Math.PI / 2;
  g.add(roof);

  // chimney with a cap and a dark flue
  const chimney = new THREE.Group();
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.2, 0.42), toon(PAL.brick));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.56), toon(darker(PAL.brick, 0.8)));
  cap.position.y = 0.62;
  const flue = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), toon(0x2c2018));
  flue.position.y = 0.68;
  chimney.add(stack, cap, flue);
  const cLocalX = def.ridgeAlongX ? def.width * 0.28 : def.width * 0.12;
  const cLocalZ = def.ridgeAlongX ? def.depth * 0.12 : def.depth * 0.28;
  chimney.position.set(cLocalX, wallH + roofH * 0.55, cLocalZ);
  chimney.children.forEach((c) => (c.castShadow = true));
  g.add(chimney);
  const cos = Math.cos(def.rotY);
  const sin = Math.sin(def.rotY);
  chimneys.push(
    new THREE.Vector3(
      def.pos.x + cLocalX * cos + cLocalZ * sin,
      wallH + roofH * 0.55 + 0.75,
      def.pos.z - cLocalX * sin + cLocalZ * cos,
    ),
  );

  // recessed door with a handle and a stone step
  const doorX = def.width * 0.1;
  const recess = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.42, 0.08), toon(0x2c2018));
  recess.position.set(doorX, 0.71, def.depth / 2 + 0.01);
  g.add(recess);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.32, 0.07), toon(PAL.woodDark));
  door.position.set(doorX, 0.66, def.depth / 2 + 0.05);
  g.add(door);
  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), toon(0xc9a24a));
  handle.position.set(doorX + 0.26, 0.68, def.depth / 2 + 0.095);
  g.add(handle);
  const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.46), toon(0xb5a284));
  step.position.set(doorX, 0.05, def.depth / 2 + 0.28);
  step.receiveShadow = true;
  g.add(step);

  // windows: two on the door side, one on each gable wall
  const fd = def.depth / 2 + 0.02;
  const sd = def.width / 2 + 0.02;
  buildWindow(g, -def.width * 0.26, 1.25, fd, true, rng, nightGlass, glows);
  buildWindow(g, def.width * 0.38, 1.25, fd, true, rng, nightGlass, glows);
  buildWindow(g, sd, 1.25, 0, false, rng, nightGlass, glows);
  buildWindow(g, -sd, 1.25, 0, false, rng, nightGlass, glows);

  return g;
}

function buildWell(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.85, 12), toon(PAL.stone));
  base.position.y = 0.425;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 18), toon(darker(PAL.stone, 0.85)));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.86;
  rim.castShadow = true;
  g.add(rim);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.72, 12), toon(0x2c2620));
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.87;
  g.add(hole);

  const postMat = toon(PAL.woodMid);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), postMat);
    post.position.set(side * 0.82, 1.2, 0);
    post.castShadow = true;
    g.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.9, 6), postMat);
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 1.75;
  g.add(axle);
  // crank handle on the axle end
  const iron = toon(PAL.iron);
  const crankArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), iron);
  crankArm.position.set(1.02, 1.64, 0);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.14, 6), toon(PAL.woodLight));
  knob.rotation.x = Math.PI / 2;
  knob.position.set(1.02, 1.54, 0.08);
  g.add(crankArm, knob);

  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.85, 4), toon(0xd9cba8));
  rope.position.y = 1.32;
  g.add(rope);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.2, 8), toon(PAL.woodDark));
  bucket.position.y = 0.95;
  bucket.castShadow = true;
  g.add(bucket);

  const roof = gableRoof(2.0, 1.3, 0.55, 0xa45238);
  roof.position.y = 2.0;
  g.add(roof);
  return g;
}

function buildTower(nightGlass: NightGlass[], glows: GlowSprite[], rng: Rng): {
  group: THREE.Group;
  updateHands: (h: number) => void;
  updateBell: (hours: number, elapsed: number) => void;
} {
  const g = new THREE.Group();
  g.position.set(TOWER.x, 0, TOWER.z);
  g.rotation.y = Math.atan2(-TOWER.x, -TOWER.z);

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.4, 3.4), toon(0xd8cdb4));
  body.position.y = 3.2;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // corner buttresses
  const buttressMat = toon(0xc4b799);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const buttress = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.6, 0.42), buttressMat);
      buttress.position.set(sx * 1.62, 1.3, sz * 1.62);
      buttress.castShadow = true;
      g.add(buttress);
    }
  }

  const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.28, 3.9), toon(0xb5a88a));
  ledge.position.y = 6.5;
  ledge.castShadow = true;
  g.add(ledge);

  const chamber = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.6, 2.7), toon(0xd8cdb4));
  chamber.position.y = 7.45;
  chamber.castShadow = true;
  g.add(chamber);
  const openingMat = toon(0x2f2620);
  for (const [x, z, alongX] of [
    [0, 1.36, true],
    [0, -1.36, true],
    [1.36, 0, false],
    [-1.36, 0, false],
  ] as const) {
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(alongX ? 0.85 : 0.1, 1.15, alongX ? 0.1 : 0.85),
      openingMat,
    );
    opening.position.set(x, 7.45, z);
    g.add(opening);
    // louver slats
    for (let l = 0; l < 3; l++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(alongX ? 0.9 : 0.14, 0.09, alongX ? 0.14 : 0.9),
        toon(0x8a5f38),
      );
      slat.position.set(x, 7.1 + l * 0.32, z);
      slat.rotation.x = alongX ? 0.5 : 0;
      slat.rotation.z = alongX ? 0 : 0.5;
      g.add(slat);
    }
  }

  // the bell hangs from a pivot so it can swing
  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 7.85, 0);
  const bell = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 10), toon(0xc9a24a));
  bell.position.y = -0.28;
  const bellTop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), toon(0xc9a24a));
  bellTop.position.y = -0.02;
  bellPivot.add(bell, bellTop);
  g.add(bellPivot);

  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.0, 4), toon(0x8d6b52));
  spire.rotation.y = Math.PI / 4;
  spire.position.y = 9.25;
  spire.castShadow = true;
  g.add(spire);

  // weathervane on the spire tip
  const vaneMat = toon(PAL.iron);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.6, 6), vaneMat);
  rod.position.y = 10.5;
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.05, 0.05), vaneMat);
  arrow.position.y = 10.72;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), toon(0xc9a24a));
  orb.position.y = 10.62;
  g.add(rod, arrow, orb);

  // clock face with working hands
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.02, 28), toon(0xf5efdf));
  face.position.set(0, 4.7, 1.71);
  g.add(face);
  const rimRing = new THREE.Mesh(new THREE.TorusGeometry(1.09, 0.075, 8, 28), toon(PAL.woodDark));
  rimRing.position.set(0, 4.7, 1.71);
  g.add(rimRing);

  const hourGeo = new THREE.BoxGeometry(0.1, 0.52, 0.04);
  hourGeo.translate(0, 0.2, 0);
  const hourHand = new THREE.Mesh(hourGeo, toon(0x3a2c1c));
  const minGeo = new THREE.BoxGeometry(0.065, 0.8, 0.04);
  minGeo.translate(0, 0.32, 0);
  const minHand = new THREE.Mesh(minGeo, toon(0x3a2c1c));
  hourHand.position.set(0, 4.7, 1.78);
  minHand.position.set(0, 4.7, 1.81);
  g.add(hourHand, minHand);

  // warm tower window behind the clock
  const glass = makeGlass(rng);
  nightGlass.push(glass);
  const window = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.1), glass.mat);
  window.position.set(0, 2.6, 1.71);
  g.add(window);
  const towerGlow = makeGlow(PAL.glowWarm, 1.8, 0.6);
  towerGlow.sprite.position.set(0, 2.6, 1.85);
  g.add(towerGlow.sprite);
  glows.push(towerGlow);

  const updateHands = (hours: number) => {
    hourHand.rotation.z = -((hours % 12) / 12) * Math.PI * 2;
    minHand.rotation.z = -(hours % 1) * Math.PI * 2;
  };

  // ring at 7:00, 12:00 and 18:00 — decaying swing for about 12 game-seconds
  const RING_HOURS = [7, 12, 18];
  const RING_SPAN = 0.2 / 60;
  const updateBell = (hours: number, elapsed: number) => {
    let amp = 0;
    for (const rh of RING_HOURS) {
      let d = hours - rh;
      if (d < -12) d += 24;
      if (d >= 0 && d < RING_SPAN) {
        amp = Math.max(amp, (1 - d / RING_SPAN) * 0.32);
      }
    }
    bellPivot.rotation.z = Math.sin(elapsed * 9) * amp;
  };
  return { group: g, updateHands, updateBell };
}

function buildStall(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.95), toon(PAL.woodMid));
  counter.position.y = 0.45;
  counter.castShadow = true;
  counter.receiveShadow = true;
  g.add(counter);

  const postMat = toon(PAL.woodDark);
  for (const [x, z] of [
    [-1.05, -0.42],
    [1.05, -0.42],
    [-1.05, 0.42],
    [1.05, 0.42],
  ] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.0, 0.09), postMat);
    post.position.set(x, 1.0, z);
    post.castShadow = true;
    g.add(post);
  }

  const stripeCols = [0xc94f3f, 0xf3ead8];
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.05, 1.35), toon(stripeCols[i % 2]));
    stripe.position.set(-1.02 + i * 0.41, 2.02, 0);
    stripe.rotation.x = -0.14;
    stripe.castShadow = true;
    g.add(stripe);
  }

  // hanging shop sign
  const signMat = toon(PAL.woodLight);
  for (const s of [-1, 1]) {
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 4), toon(0x8a8175));
    string.position.set(s * 0.12, 1.82, 0.62);
    g.add(string);
  }
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.035), signMat);
  sign.position.set(0, 1.62, 0.62);
  sign.rotation.z = 0.04;
  sign.castShadow = true;
  g.add(sign);

  // produce piles + a crate at the end
  const produceColors = [0xe0862f, 0x7a9e3f, 0xc2452f, 0xd9a441];
  for (let i = 0; i < 3; i++) {
    const cluster = new THREE.Group();
    const mat = toon(rng.pick(produceColors));
    for (let j = 0; j < 6; j++) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), mat);
      ball.position.set(rng.range(-0.16, 0.16), 0.95 + (j % 2) * 0.09, rng.range(-0.16, 0.16));
      cluster.add(ball);
    }
    cluster.position.set(-0.6 + i * 0.6, 0, 0);
    g.add(cluster);
  }
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.42), toon(PAL.woodLight));
  crate.position.set(1.45, 0.18, 0.1);
  crate.rotation.y = 0.3;
  crate.castShadow = true;
  g.add(crate);

  return g;
}

function buildLamp(): { group: THREE.Group; glass: NightGlass; glow: GlowSprite } {
  const g = new THREE.Group();
  const postMat = toon(0x4a4038);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 8), postMat);
  post.position.y = 1.3;
  post.castShadow = true;
  g.add(post);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.24, 6), toon(0x35302b));
  cap.position.y = 2.95;
  cap.castShadow = true;
  g.add(cap);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), toon(0xc9a24a));
  finial.position.y = 3.1;
  g.add(finial);
  const glass: NightGlass = {
    mat: new THREE.MeshToonMaterial({
      color: 0x9fc6d8,
      emissive: 0xffca7a,
      emissiveIntensity: 0,
    }),
    max: 2.4,
  };
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), glass.mat);
  lantern.position.y = 2.72;
  g.add(lantern);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), toon(0x35302b));
  ring.position.y = 2.94;
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  const glow = makeGlow(PAL.glowWarm, 2.8, 0.95);
  glow.sprite.position.set(0, 2.72, 0);
  g.add(glow.sprite);
  return { group: g, glass, glow };
}

function buildField(def: { pos: { x: number; z: number }; rotY: number }, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.set(def.pos.x, 0, def.pos.z);
  g.rotation.y = def.rotY;

  const soil = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 2.4), toon(0x6d4c33));
  soil.position.y = 0.08;
  soil.receiveShadow = true;
  soil.castShadow = true;
  g.add(soil);

  const cropGeo = new THREE.BoxGeometry(0.16, 0.34, 0.16);
  const cropMat = new THREE.MeshToonMaterial({});
  const rows = 4;
  const cols = 8;
  const crops = new THREE.InstancedMesh(cropGeo, cropMat, rows * cols);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let cIdx = 0; cIdx < cols; cIdx++) {
      dummy.position.set(
        -1.4 + cIdx * 0.4 + rng.range(-0.04, 0.04),
        0.32,
        -0.9 + r * 0.55 + rng.range(-0.05, 0.05),
      );
      dummy.rotation.y = rng.range(-0.2, 0.2);
      dummy.updateMatrix();
      crops.setMatrixAt(i, dummy.matrix);
      col.setHSL(rng.range(0.24, 0.3), 0.45, rng.range(0.36, 0.48));
      crops.setColorAt(i, col);
      i++;
    }
  }
  crops.castShadow = true;
  g.add(crops);

  const postMat = toon(PAL.woodMid);
  const railMat = toon(0x9a7454);
  const posts: [number, number][] = [
    [-1.75, -1.25], [0, -1.25], [1.75, -1.25],
    [-1.75, 1.25], [0, 1.25], [1.75, 1.25],
    [-1.75, 0],
  ];
  for (const [x, z] of posts) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), postMat);
    post.position.set(x, 0.4, z);
    post.castShadow = true;
    g.add(post);
  }
  for (const h of [0.35, 0.62]) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.055, 0.055), railMat);
    back.position.set(0, h, -1.25);
    g.add(back);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 2.55), railMat);
      rail.position.set(side * 1.75, h, 0);
      g.add(rail);
    }
  }
  return g;
}

function buildBench(): THREE.Group {
  const g = new THREE.Group();
  const wood = toon(PAL.woodMid);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.45), wood);
  seat.position.y = 0.45;
  seat.castShadow = true;
  g.add(seat);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.45, 0.4), wood);
    leg.position.set(side * 0.6, 0.22, 0);
    g.add(leg);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.07), wood);
  back.position.set(0, 0.72, -0.2);
  back.rotation.x = -0.15;
  g.add(back);
  g.rotation.y = Math.atan2(POND.center.x - BENCH.x, POND.center.z - BENCH.z);
  return g;
}

function buildAnvil(): THREE.Group {
  const g = new THREE.Group();
  const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.55, 8), toon(PAL.woodDark));
  stump.position.y = 0.275;
  stump.castShadow = true;
  g.add(stump);
  const iron = toon(PAL.iron);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.24), iron);
  top.position.y = 0.63;
  top.castShadow = true;
  g.add(top);
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 6), iron);
  horn.rotation.z = Math.PI / 2;
  horn.position.set(0.42, 0.63, 0);
  g.add(horn);
  return g;
}

function buildCoop(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(COOP.x, 0, COOP.z);
  g.rotation.y = Math.atan2(-COOP.x, -COOP.z) + 0.6;

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 0.85), toon(0xc98a5a));
  body.position.y = 0.5;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.1, 1.05), toon(0x8d6b52));
  roof.position.y = 0.97;
  roof.rotation.z = 0.12;
  roof.castShadow = true;
  g.add(roof);
  const hole = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.05), toon(0x2c2620));
  hole.position.set(0.2, 0.35, 0.44);
  g.add(hole);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.7), toon(PAL.woodLight));
  ramp.position.set(0.2, 0.14, 0.75);
  ramp.rotation.x = -0.35;
  g.add(ramp);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.24), toon(0xd9a441));
  tray.position.set(-0.55, 0.06, 0.5);
  g.add(tray);
  return g;
}

/** Wooden fishing dock jutting into the pond. */
function buildDock(): THREE.Group {
  const g = new THREE.Group();
  const plankMat = toon(PAL.woodLight);
  const n = 5;
  for (let i = 0; i < n; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(DOCK.width, 0.06, 0.36), plankMat);
    plank.position.set(DOCK.base.x, 0.16, DOCK.base.z + 0.2 + i * 0.44);
    plank.rotation.y = makeRng(i * 31 + 7).range(-0.03, 0.03);
    plank.castShadow = true;
    plank.receiveShadow = true;
    g.add(plank);
  }
  const postMat = toon(PAL.woodDark);
  for (const zz of [DOCK.base.z + 0.1, DOCK.end.z - 0.1]) {
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.7, 7), postMat);
      post.position.set(DOCK.base.x + sx * (DOCK.width / 2 - 0.09), -0.14, zz);
      post.castShadow = true;
      g.add(post);
    }
  }
  return g;
}

/** Bordered garden bed with flower rows. */
function buildFlowerBed(def: { pos: { x: number; z: number }; rotY: number }, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.set(def.pos.x, 0, def.pos.z);
  g.rotation.y = def.rotY;

  const borderMat = toon(PAL.woodMid);
  const w = 1.7;
  const d = 1.0;
  for (const [sx, sz, lx, lz] of [
    [0, -d / 2, w, 0.08],
    [0, d / 2, w, 0.08],
    [-w / 2, 0, 0.08, d],
    [w / 2, 0, 0.08, d],
  ] as const) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.14, lz), borderMat);
    board.position.set(sx, 0.07, sz);
    board.castShadow = true;
    g.add(board);
  }
  const soil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.16, 0.1, d - 0.16), toon(0x5d4a36));
  soil.position.y = 0.05;
  g.add(soil);

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const bloom = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 6),
        toon(rng.pick(PAL.flowerColors)),
      );
      bloom.position.set(
        -0.6 + c * 0.4 + rng.range(-0.05, 0.05),
        0.19,
        -0.25 + r * 0.5 + rng.range(-0.05, 0.05),
      );
      bloom.scale.setScalar(rng.range(0.8, 1.25));
      bloom.castShadow = true;
      g.add(bloom);
    }
  }
  return g;
}

export function buildVillage(): VillageParts {
  const group = new THREE.Group();
  const nightGlass: NightGlass[] = [];
  const glows: GlowSprite[] = [];
  const chimneys: THREE.Vector3[] = [];
  const lampLights: THREE.PointLight[] = [];
  const rng = makeRng(4242);

  for (const def of HOUSES) {
    group.add(buildHouse(def, rng, nightGlass, glows, chimneys));
  }

  const tower = buildTower(nightGlass, glows, rng);
  group.add(tower.group);

  const well = buildWell();
  group.add(well);

  for (const s of STALLS) {
    const stall = buildStall(rng);
    stall.position.set(s.pos.x, 0, s.pos.z);
    stall.rotation.y = s.rotY;
    group.add(stall);
  }

  LAMPS.forEach((l) => {
    const { group: lamp, glass, glow } = buildLamp();
    lamp.position.set(l.x, 0, l.z);
    nightGlass.push(glass);
    glows.push(glow);
    group.add(lamp);
  });
  for (const idx of LAMP_LIGHT_INDICES) {
    const light = new THREE.PointLight(0xffc879, 0, 11, 1.6);
    light.position.set(LAMPS[idx].x, 2.7, LAMPS[idx].z);
    group.add(light);
    lampLights.push(light);
  }

  for (const f of FIELDS) {
    group.add(buildField(f, rng));
  }

  const bench = buildBench();
  bench.position.set(BENCH.x, 0, BENCH.z);
  group.add(bench);

  const anvil = buildAnvil();
  anvil.position.set(ANVIL.x, 0, ANVIL.z);
  group.add(anvil);

  const coop = buildCoop();
  group.add(coop);

  group.add(buildDock());

  for (const bed of FLOWER_BEDS) {
    group.add(buildFlowerBed(bed, rng));
  }

  // pond rim: a sandy ring marking the bank
  const rim = new THREE.Mesh(new THREE.RingGeometry(POND.radius, POND.radius + 0.85, 36), toon(0xd3b689));
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(POND.center.x, 0.02, POND.center.z);
  rim.receiveShadow = true;
  group.add(rim);

  return {
    group,
    nightGlass,
    glows,
    chimneys,
    updateHands: tower.updateHands,
    updateBell: tower.updateBell,
    lampLights,
  };
}
