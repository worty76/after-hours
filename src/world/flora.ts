import * as THREE from 'three';
import { makeRng } from '../core/rng';
import { PAL } from './materials';
import { BUSH_SPOTS, CLOVER_SPOTS, FLOWER_SPOTS, POND, ROCK_SPOTS, ScatterSpot, TREE_SPOTS } from './layout';

/** Round, soft-edged trees, flower dots and clover — the toy-garden look. */
export function buildFlora(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(31337);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();

  // --- trunks ---
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.18, 1.05, 8);
  trunkGeo.translate(0, 0.52, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshToonMaterial({ color: PAL.trunk }), TREE_SPOTS.length);

  // --- round deciduous canopies: 2-3 smooth overlapping spheres ---
  const blobGeo = new THREE.SphereGeometry(1, 18, 14);
  const blobs = new THREE.InstancedMesh(
    blobGeo,
    new THREE.MeshToonMaterial({}),
    TREE_SPOTS.length * 3,
  );

  // --- pines: three stacked cones on one trunk (separate instanced mesh) ---
  const pineCount = Math.floor(TREE_SPOTS.length * 0.3);
  const pineTrunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshToonMaterial({ color: PAL.trunk }), pineCount);
  const coneGeo = new THREE.ConeGeometry(1, 1.5, 12);
  coneGeo.translate(0, 0.75, 0);
  const pineCones = new THREE.InstancedMesh(coneGeo, new THREE.MeshToonMaterial({}), pineCount * 3);

  let blobCount = 0;
  let pineIdx = 0;
  let coneIdx = 0;
  TREE_SPOTS.forEach((spot: ScatterSpot, i: number) => {
    const isPine = pineIdx < pineCount && spot.s < 0.3;
    if (isPine) {
      const s = rng.range(0.85, 1.25);
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.scale.setScalar(s);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      pineTrunks.setMatrixAt(pineIdx, dummy.matrix);

      const green = new THREE.Color(PAL.pine).offsetHSL(0, 0, rng.range(-0.05, 0.05));
      const tiers = [
        { y: 1.1, r: 1.0 },
        { y: 1.85, r: 0.78 },
        { y: 2.55, r: 0.52 },
      ];
      for (const tier of tiers) {
        dummy.position.set(spot.x, spot.y + tier.y * s, spot.z);
        dummy.scale.set(tier.r * s, tier.r * s * rng.range(0.95, 1.15), tier.r * s);
        dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
        dummy.updateMatrix();
        pineCones.setMatrixAt(coneIdx, dummy.matrix);
        pineCones.setColorAt(coneIdx, green);
        coneIdx++;
      }
      pineIdx++;
    } else {
      const scale = rng.range(0.8, 1.3);
      dummy.position.set(spot.x, spot.y, spot.z);
      dummy.scale.setScalar(scale);
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);

      const autumn = rng.chance(0.07);
      const foliageColor = autumn
        ? rng.pick(PAL.foliageAutumn)
        : rng.pick(PAL.foliage);
      const base = new THREE.Color(foliageColor);

      // main canopy
      dummy.position.set(spot.x, spot.y + 1.5 * scale, spot.z);
      dummy.scale.set(scale * rng.range(0.95, 1.15), scale * rng.range(0.9, 1.1), scale * rng.range(0.95, 1.15));
      dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
      dummy.updateMatrix();
      blobs.setMatrixAt(blobCount, dummy.matrix);
      blobs.setColorAt(blobCount, base.clone().offsetHSL(0, 0, rng.range(-0.02, 0.02)));
      blobCount++;

      // side puff
      dummy.position.set(
        spot.x + rng.range(-0.5, 0.5) * scale,
        spot.y + 1.15 * scale,
        spot.z + rng.range(-0.5, 0.5) * scale,
      );
      dummy.scale.setScalar(scale * rng.range(0.55, 0.75));
      dummy.updateMatrix();
      blobs.setMatrixAt(blobCount, dummy.matrix);
      blobs.setColorAt(blobCount, base.clone().offsetHSL(0, 0, rng.range(-0.05, 0.03)));
      blobCount++;

      // occasional top puff
      if (rng.chance(0.5)) {
        dummy.position.set(
          spot.x + rng.range(-0.25, 0.25) * scale,
          spot.y + 1.95 * scale,
          spot.z + rng.range(-0.25, 0.25) * scale,
        );
        dummy.scale.setScalar(scale * rng.range(0.4, 0.55));
        dummy.updateMatrix();
        blobs.setMatrixAt(blobCount, dummy.matrix);
        blobs.setColorAt(blobCount, base.clone().offsetHSL(0, 0, rng.range(0.0, 0.06)));
        blobCount++;
      }
    }
  });
  blobs.count = blobCount;
  pineCones.count = coneIdx;
  pineTrunks.count = pineIdx;
  for (const m of [trunks, blobs, pineTrunks, pineCones]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(trunks, blobs, pineTrunks, pineCones);

  // --- bushes: smooth squashed spheres ---
  const bushGeo = new THREE.SphereGeometry(0.55, 12, 10);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshToonMaterial({}), BUSH_SPOTS.length);
  BUSH_SPOTS.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y + 0.2, spot.z);
    dummy.scale.set(rng.range(0.8, 1.5), rng.range(0.55, 0.85), rng.range(0.8, 1.5));
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.updateMatrix();
    bushes.setMatrixAt(i, dummy.matrix);
    bushes.setColorAt(i, col.setHex(rng.pick(PAL.foliage)).offsetHSL(0, 0, rng.range(-0.04, 0.05)));
  });
  bushes.castShadow = true;
  bushes.receiveShadow = true;
  group.add(bushes);

  // --- rocks: fewer, rounder, nesting into the ground ---
  const rockGeo = new THREE.SphereGeometry(0.34, 10, 8);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshToonMaterial({ color: 0xa8a094 }), ROCK_SPOTS.length);
  ROCK_SPOTS.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y + 0.08, spot.z);
    dummy.scale.set(rng.range(0.7, 1.5), rng.range(0.45, 0.8), rng.range(0.7, 1.5));
    dummy.rotation.set(rng.range(-0.2, 0.2), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2));
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  group.add(rocks);

  // --- clover dots: tiny green pebbles of grass ---
  const cloverGeo = new THREE.SphereGeometry(0.13, 8, 6);
  cloverGeo.translate(0, 0.06, 0);
  const clover = new THREE.InstancedMesh(cloverGeo, new THREE.MeshToonMaterial({}), CLOVER_SPOTS.length);
  CLOVER_SPOTS.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.set(rng.range(0.7, 1.4), rng.range(0.5, 0.8), rng.range(0.7, 1.4));
    dummy.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    dummy.updateMatrix();
    clover.setMatrixAt(i, dummy.matrix);
    clover.setColorAt(i, col.setHex(rng.pick(PAL.foliage)).offsetHSL(0, 0, rng.range(-0.03, 0.07)));
  });
  clover.receiveShadow = true;
  group.add(clover);

  // --- flowers: colored heads with tiny stems ---
  const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.16, 5);
  stemGeo.translate(0, 0.08, 0);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshToonMaterial({ color: 0x4f8a3f }), FLOWER_SPOTS.length);
  const headGeo = new THREE.SphereGeometry(0.075, 8, 6);
  headGeo.translate(0, 0.19, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshToonMaterial({}), FLOWER_SPOTS.length);
  FLOWER_SPOTS.forEach((spot, i) => {
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.setScalar(rng.range(0.8, 1.4));
    dummy.rotation.set(rng.range(-0.1, 0.1), rng.range(0, Math.PI * 2), rng.range(-0.1, 0.1));
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    heads.setMatrixAt(i, dummy.matrix);
    heads.setColorAt(i, col.setHex(rng.pick(PAL.flowerColors)));
  });
  group.add(stems, heads);

  // --- fruit on some canopies (little orchard accents) ---
  const fruitGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const fruits = new THREE.InstancedMesh(fruitGeo, new THREE.MeshToonMaterial({}), 40);
  let fruitCount = 0;
  TREE_SPOTS.forEach((spot) => {
    if (spot.s > 0.16 || fruitCount > 36) return; // sparse: a few apple trees
    const canopyY = spot.y + 1.5;
    for (let f = 0; f < 4; f++) {
      const a = rng.range(0, Math.PI * 2);
      const e = rng.range(-0.2, 0.75);
      const rr = 0.95 * (1 - e * e * 0.5);
      dummy.position.set(
        spot.x + Math.cos(a) * rr,
        canopyY + e,
        spot.z + Math.sin(a) * rr,
      );
      dummy.scale.setScalar(rng.range(0.8, 1.2));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      fruits.setMatrixAt(fruitCount, dummy.matrix);
      fruits.setColorAt(fruitCount, col.setHex(rng.chance(0.6) ? 0xc8483c : 0x9ab84a));
      fruitCount++;
    }
  });
  fruits.count = fruitCount;
  group.add(fruits);

  // --- mushroom clusters near the treeline ---
  const shroomStem = new THREE.CylinderGeometry(0.028, 0.038, 0.1, 6);
  shroomStem.translate(0, 0.05, 0);
  const shroomCap = new THREE.SphereGeometry(0.085, 8, 6);
  shroomCap.scale(1, 0.62, 1);
  shroomCap.translate(0, 0.11, 0);
  const shroomStems = new THREE.InstancedMesh(shroomStem, new THREE.MeshToonMaterial({ color: 0xefe6cf }), 14);
  const shroomCaps = new THREE.InstancedMesh(shroomCap, new THREE.MeshToonMaterial({}), 14);
  const mushRng = makeRng(9911);
  for (let i = 0; i < 14; i++) {
    const spot = TREE_SPOTS[(i * 7 + 3) % TREE_SPOTS.length];    const ox = mushRng.range(-1.1, 1.1);
    const oz = mushRng.range(-1.1, 1.1);
    const s = mushRng.range(0.7, 1.3);
    dummy.position.set(spot.x + ox, spot.y, spot.z + oz);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, mushRng.range(0, Math.PI * 2), 0);
    dummy.updateMatrix();
    shroomStems.setMatrixAt(i, dummy.matrix);
    shroomCaps.setMatrixAt(i, dummy.matrix);
    shroomCaps.setColorAt(i, col.setHex(mushRng.chance(0.55) ? 0xc8483c : 0xa56a4e));
  }
  group.add(shroomStems, shroomCaps);

  return group;
}

/** The pond: still water, lily pads, reeds and drifting ripple rings. */
export function buildPond(): { group: THREE.Group; water: THREE.Mesh; ripples: THREE.Mesh[] } {
  const group = new THREE.Group();
  const rng = makeRng(60606);

  const bed = new THREE.Mesh(
    new THREE.CircleGeometry(POND.radius - 0.03, 40),
    new THREE.MeshToonMaterial({ color: 0x516b5c }),
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(POND.center.x, 0.012, POND.center.z);
  group.add(bed);

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(POND.radius, 40),
    new THREE.MeshToonMaterial({
      color: 0x58a8b8,
      transparent: true,
      opacity: 0.62,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(POND.center.x, 0.06, POND.center.z);
  group.add(water);

  const padMat = new THREE.MeshToonMaterial({ color: 0x4f8a5a });
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.4, POND.radius - 1);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.16, 0.3), 10), padMat);
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(POND.center.x + Math.cos(a) * r, 0.08, POND.center.z + Math.sin(a) * r);
    group.add(pad);
  }

  const reedMat = new THREE.MeshToonMaterial({ color: 0x6f9e5a });
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = POND.radius + rng.range(-0.15, 0.35);
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, rng.range(0.5, 0.9), 5), reedMat);
    reed.position.set(POND.center.x + Math.cos(a) * r, 0.3, POND.center.z + Math.sin(a) * r);
    reed.rotation.set(rng.range(-0.12, 0.12), 0, rng.range(-0.12, 0.12));
    reed.castShadow = true;
    group.add(reed);
  }

  // ripple rings that expand and fade, cycling at random spots
  const ripples: THREE.Mesh[] = [];
  const ringGeo = new THREE.RingGeometry(0.85, 0.95, 28);
  for (let i = 0; i < 3; i++) {
    const ripple = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xdff2f6,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.09;
    ripple.userData = { phase: i / 3, x: POND.center.x, z: POND.center.z };
    group.add(ripple);
    ripples.push(ripple);
  }

  return { group, water, ripples };
}
