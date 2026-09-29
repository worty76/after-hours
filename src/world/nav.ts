import { EDGES, NODES, Pt } from './layout';

const adjacency = new Map<string, string[]>();
for (const [a, b] of EDGES) {
  if (!adjacency.has(a)) adjacency.set(a, []);
  if (!adjacency.has(b)) adjacency.set(b, []);
  adjacency.get(a)!.push(b);
  adjacency.get(b)!.push(a);
}

export function nodePos(id: string): Pt {
  return NODES[id];
}

/** Shortest path (fewest nodes) between two waypoints, inclusive of both ends. */
export function findPath(from: string, to: string): string[] {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const queue: string[] = [from];
  const seen = new Set<string>([from]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of adjacency.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: string[] = [to];
        let step = to;
        while (step !== from) {
          step = prev.get(step)!;
          path.unshift(step);
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [from]; // disconnected graph should not happen; stand still
}

/** Whatever node is closest to a world position — used to start a journey. */
export function nearestNode(x: number, z: number): string {
  let best = 'w';
  let bestD = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = (x - n.x) ** 2 + (z - n.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
