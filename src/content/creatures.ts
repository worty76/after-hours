/**
 * Population config for the animal life. Tune numbers here — the systems
 * in src/world/animals.ts build whatever this asks for.
 */
export const CREATURES = {
  sheep: 5,
  chickens: 4,
  /** leisurely koi gliding under the surface */
  koi: 4,
  /** small darty fish */
  minnows: 6,
  duck: true,
  dog: true,
} as const;
