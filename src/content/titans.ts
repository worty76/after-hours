/**
 * Titan attack tuning. Titans rise from the sea of clouds below, grip the
 * island rim and try to haul themselves up; the villagers repel them.
 */
export const TITANS = {
  enabled: true,
  /** seconds before the first attack (also force with key T or ?titan=1) */
  firstDelay: 22,
  /** how many titans may climb at once */
  maxActive: 2,
  /** random delay range between attacks */
  interval: [95, 170] as const,
  /** seconds of uninterrupted climbing for a titan to reach the summit */
  climbTime: 36,
  /** how much one landed villager stone sets the climb back (0..1) */
  stoneDamage: 0.009,
  /** pinned this close to the rim for this long → the titan gives up */
  giveUpAt: 0.47,
  giveUpAfter: 8,
  /** rim spots titans attack, one per defender trail */
  attackPoints: [
    { x: -54, z: 6 },
    { x: 55, z: -4 },
    { x: 3, z: 55 },
    { x: -3, z: -55 },
  ],
} as const;
