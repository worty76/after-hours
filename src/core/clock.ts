export type Phase = 'Night' | 'Dawn' | 'Morning' | 'Midday' | 'Afternoon' | 'Dusk' | 'Evening';

/** Game time of day in hours [0, 24), accelerated by a speed multiplier. */
export class GameClock {
  hours = 6.75; // start just before sunrise
  speed = 1; // multiplier on the base rate
  paused = false;

  /** At 1× one real second equals one game minute (a full day ≈ 24 real minutes). */
  private static readonly HOURS_PER_SECOND = 1 / 60;

  advance(dt: number): void {
    if (!this.paused) {
      this.hours = (this.hours + dt * GameClock.HOURS_PER_SECOND * this.speed) % 24;
    }
  }
}

export function formatClock(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function phaseOf(hours: number): Phase {
  if (hours < 5) return 'Night';
  if (hours < 7) return 'Dawn';
  if (hours < 11) return 'Morning';
  if (hours < 14) return 'Midday';
  if (hours < 17.5) return 'Afternoon';
  if (hours < 19.5) return 'Dusk';
  if (hours < 21.5) return 'Evening';
  return 'Night';
}
