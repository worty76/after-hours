import * as THREE from 'three';
import { EDGES, NODES, PLAZA_RADIUS, groundY } from './layout';

const DIRT = new THREE.Color('#cfa878');
const DIRT_ALT = new THREE.Color('#c39c6c');

function ringArc(a: THREE.Vector2, b: THREE.Vector2, samples: number): THREE.Vector2[] {
  // both endpoints sit near the ring road: bend the segment into a circular arc
  const r1 = a.length();
  const r2 = b.length();
  const a1 = Math.atan2(a.y, a.x);
  let a2 = Math.atan2(b.y, b.x);
  let span = a2 - a1;
  while (span > Math.PI) span -= Math.PI * 2;
  while (span < -Math.PI) span += Math.PI * 2;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const ang = a1 + span * t;
    const r = r1 + (r2 - r1) * t;
    pts.push(new THREE.Vector2(Math.cos(ang) * r, Math.sin(ang) * r));
  }
  return pts;
}

function straight(a: THREE.Vector2, b: THREE.Vector2, samples: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    pts.push(new THREE.Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
  }
  return pts;
}

function ribbon(points: THREE.Vector2[], width: number, y: number | ((x: number, z: number) => number), color: THREE.Color): THREE.Mesh {
  const verts: number[] = [];
  const indexes: number[] = [];
  const count = points.length;
  const yAt = typeof y === 'function' ? y : () => y;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(count - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.y - prev.y;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const hw = width / 2;
    const py = yAt(p.x, p.y);
    verts.push(p.x + nx * hw, py, p.y + nz * hw);
    verts.push(p.x - nx * hw, py, p.y - nz * hw);
    if (i < count - 1) {
      const o = i * 2;
      // wound counter-clockwise when viewed from above so the top face is visible
      indexes.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indexes);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/** Dirt paths following the road graph, plus the market plaza disc. */
export function buildPaths(): THREE.Group {
  const group = new THREE.Group();
  const v = (p: { x: number; z: number }) => new THREE.Vector2(p.x, p.z);

  let edgeIndex = 0;
  for (const [aId, bId] of EDGES) {
    const a = v(NODES[aId]);
    const b = v(NODES[bId]);
    const onRing = a.length() > 10.4 && b.length() > 10.4;
    // sample density follows segment length; the path hugs the terrain so it
    // can climb the windmill hill and roll over the outer mounds
    const dist = a.distanceTo(b);
    const samples = Math.max(2, Math.ceil(dist / 1.4));
    const pts = onRing
      ? ringArc(a, b, Math.max(6, Math.ceil(dist / 1.2)))
      : straight(a, b, samples);
    const width = onRing ? 1.6 : 1.25;
    const y = (x: number, z: number) => groundY(x, z) + 0.03 + (edgeIndex % 5) * 0.004;
    group.add(ribbon(pts, width, y, edgeIndex % 2 === 0 ? DIRT : DIRT_ALT));
    edgeIndex++;
  }

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(PLAZA_RADIUS, 42),
    new THREE.MeshLambertMaterial({ color: '#d8b285' }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.025;
  plaza.receiveShadow = true;
  group.add(plaza);

  return group;
}
