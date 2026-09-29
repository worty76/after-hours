import * as THREE from 'three';
import { makeRng, noise2 } from '../core/rng';
import { coastRadius } from './terrain';
import { WorldSystem } from '../core/world';
import { toon } from './materials';

/**
 * The Great Tree: the skyland was built upon its crown, high above the world,
 * precisely so the things in the dark below could not reach it. The colossal
 * trunk descends from the island into the sea of clouds; buttress roots hold
 * the land aloft; and four thick branches arc up and over the rim — the
 * ladders the titans climb.
 */

export class GreatTree implements WorldSystem {
  readonly group = new THREE.Group();

  private readonly vines: { group: THREE.Group; phase: number }[] = [];

  constructor() {
    const rng = makeRng(30303);
    this.buildTrunk();
    this.buildRoots(rng);
    this.buildVines(rng);
  }

  /** colossal bark-covered trunk, descending from the island into the clouds */
  private buildTrunk(): void {
    const profile = [
      new THREE.Vector2(10, -58),
      new THREE.Vector2(11.2, -44),
      new THREE.Vector2(12.4, -32),
      new THREE.Vector2(13.8, -24),
      new THREE.Vector2(15.5, -16),
      new THREE.Vector2(17.5, -11),
      new THREE.Vector2(20.5, -7.5),
      new THREE.Vector2(24, -6.1),
    ];
    const geo = new THREE.LatheGeometry(profile, 48);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const bark = new THREE.Color(0x6f4d36);
    const groove = new THREE.Color(0x513723);
    const mossTop = new THREE.Color(0x55703c);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const r = Math.hypot(x, z) || 1;
      const a = Math.atan2(z, x);
      // bark grooves
      const n = noise2(a * 5 + 3, y * 0.16);
      c.copy(bark).lerp(groove, Math.abs(n - 0.5) * 1.8);
      // a collar of moss where trunk meets the island
      if (y > -12) c.lerp(mossTop, THREE.MathUtils.clamp((y + 12) / 6, 0, 1) * 0.5);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      // radial bark wobble
      const wobble = (noise2(a * 9 + 11, y * 0.24) - 0.5) * 1.6;
      pos.setX(i, (x / r) * (r + wobble));
      pos.setZ(i, (z / r) * (r + wobble));
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const trunk = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ vertexColors: true }));
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    this.group.add(trunk);
  }

  /** buttress roots flaring from the trunk up into the island's underside */
  private buildRoots(rng: ReturnType<typeof makeRng>): void {
    const mat = toon(0x5f4128);
    const count = 9;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const start = new THREE.Vector3(Math.cos(a) * 15, -10.5, Math.sin(a) * 15);
      const end = new THREE.Vector3(
        Math.cos(a) * rng.range(40, 48),
        -5.6,
        Math.sin(a) * rng.range(40, 48),
      );
      const dir = end.clone().sub(start);
      const len = dir.length();
      const root = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3.4, len, 7), mat);
      root.position.copy(start).add(end).multiplyScalar(0.5);
      root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      root.castShadow = true;
      this.group.add(root);
    }
  }

  /** vines trailing off the rim, swaying over the cliff face */
  private buildVines(rng: ReturnType<typeof makeRng>): void {
    const stemMat = toon(0x55703c);
    const leafMat = toon(0x4f8a5a);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rng.range(-0.18, 0.18);
      const r0 = coastRadius(a) + 0.18;
      const group = new THREE.Group();
      group.position.set(Math.cos(a) * r0, -0.1, Math.sin(a) * r0);
      const len = rng.range(3, 7.5);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, len, 5), stemMat);
      stem.position.y = -len / 2;
      group.add(stem);
      for (const t of [0.5, 0.95]) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.14, 0.24), 6, 5), leafMat);
        leaf.scale.set(1.3, 0.6, 0.9);
        leaf.position.set(rng.range(-0.1, 0.1), -len * t, rng.range(-0.1, 0.1));
        group.add(leaf);
      }
      this.vines.push({ group, phase: rng.range(0, Math.PI * 2) });
      this.group.add(group);
    }
  }

  update(ctx: { elapsed: number }): void {
    // vines breathe with the wind
    for (const vine of this.vines) {
      vine.group.rotation.x = Math.sin(ctx.elapsed * 0.9 + vine.phase) * 0.06;
      vine.group.rotation.z = Math.cos(ctx.elapsed * 0.7 + vine.phase) * 0.06;
    }
  }
}
