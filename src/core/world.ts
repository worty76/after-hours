import * as THREE from 'three';
import { GameClock } from './clock';

/** Everything a system might need about "right now". Built once per frame. */
export interface FrameContext {
  /** seconds since the previous frame (capped) */
  dt: number;
  /** seconds since the world started */
  elapsed: number;
  /** game time of day in hours [0, 24) */
  hours: number;
  /** environment values written by the sky system each frame */
  env: WorldEnv;
}

export interface WorldEnv {
  /** 0 = full day, 1 = deep night */
  night: number;
  /** 0..1 strength of sunlight */
  daylight: number;
  /** renderer tone-mapping exposure for the current time */
  exposure: number;
}

/**
 * A piece of the world. Register systems in the order they should update —
 * the sky system runs first so `env` is fresh for everyone else.
 */
export interface WorldSystem {
  /** optional root added to the scene on registration */
  readonly object3D?: THREE.Object3D;
  update(ctx: FrameContext): void;
}

/**
 * Owns the scene and the frame loop. Everything on screen is a WorldSystem;
 * to extend the world, write a system and `world.register(...)` it (see
 * src/modules/index.ts and the README "How to extend" section).
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly clock = new GameClock();
  readonly env: WorldEnv = { night: 0, daylight: 1, exposure: 1.1 };

  private readonly systems: WorldSystem[] = [];
  private elapsed = 0;

  register(...systems: WorldSystem[]): this {
    for (const system of systems) {
      this.systems.push(system);
      if (system.object3D) this.scene.add(system.object3D);
    }
    return this;
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.clock.advance(dt);
    const ctx: FrameContext = {
      dt,
      elapsed: this.elapsed,
      hours: this.clock.hours,
      env: this.env,
    };
    for (const system of this.systems) system.update(ctx);
  }
}
