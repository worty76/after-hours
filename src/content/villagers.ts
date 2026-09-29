import type { VillagerDef } from '../people/villagers';

/**
 * The people of Petit Valley, as pure data.
 *
 * To add a villager: append an entry and reload — visuals, schedule and
 * behaviors are derived from `role` (see makeDefs in src/people/villagers.ts).
 * `houseIndex` points into HOUSES (src/world/layout.ts); the tower took slot
 * h3, so the array has 7 entries (0..6).
 * `workSpot` is either a named place (resolved in src/people/villagers.ts —
 * currently 'dock' and 'bench') or exact { x, z } coordinates.
 */
export interface VillagerSeed {
  name: string;
  role: VillagerDef['role'];
  houseIndex: number;
  homeNode?: string;
  workNode: string | null;
  stallIndex?: number;
  fieldIndex?: number;
  workSpot?: string | { x: number; z: number } | null;
}

export const VILLAGER_SEEDS: VillagerSeed[] = [
  { name: 'Tomas', role: 'farmer', houseIndex: 0, workNode: 'fn1', fieldIndex: 0 },
  { name: 'Elif', role: 'farmer', houseIndex: 0, workNode: 'fn2', fieldIndex: 1 },
  { name: 'Jonas', role: 'farmer', houseIndex: 4, workNode: 'fn3', fieldIndex: 2 },
  { name: 'Mira', role: 'baker', houseIndex: 1, workNode: 'sn1', stallIndex: 0 },
  { name: 'Petra', role: 'merchant', houseIndex: 2, workNode: 'sn2', stallIndex: 1 },
  { name: 'Okan', role: 'merchant', houseIndex: 5, workNode: 'sn3', stallIndex: 2 },
  { name: 'Lina', role: 'fisher', houseIndex: 3, workNode: 'pn', workSpot: 'dock' },
  { name: 'Bram', role: 'smith', houseIndex: 5, workNode: 'an' },
  { name: 'Sofia', role: 'priest', houseIndex: 6, homeNode: 't', workNode: 't' },
  { name: 'Yusuf', role: 'shepherd', houseIndex: 6, workNode: 'fn1', workSpot: { x: 18.4, z: 1.2 } },
  { name: 'Ada', role: 'elder', houseIndex: 4, workNode: 'bn', workSpot: 'bench' },
  { name: 'Ayla', role: 'child', houseIndex: 1, workNode: null },
];
