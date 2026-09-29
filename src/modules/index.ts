import * as THREE from 'three';
import { World, WorldSystem } from '../core/world';
import { CameraRig } from '../cameras/rig';
import { AnimalSystem } from '../world/animals';
import { ButterflySystem, FireflySystem, SparkSystem } from '../world/fx';
import { buildFlora, buildPond } from '../world/flora';
import { buildPaths } from '../world/paths';
import { buildTerrain } from '../world/terrain';
import { buildVillage } from '../world/props';
import { POND } from '../world/layout';
import { SkySystem } from '../world/sky';
import { SmokeSystem } from '../world/smoke';
import { WaterfallSystem } from '../world/waterfall';
import { VillagerSystem } from '../people/villagers';
import { TitanSystem } from '../world/titans';
import { GreatTree } from '../world/greatTree';
import { WallSystem } from '../world/wall';

/**
 * The assembly point of the world.
 *
 * `steps` are the named build stages shown on the loading screen; `postBuild`
 * registers every per-frame system in update order (sky first — it writes the
 * env values everyone else reads). To extend the world, build your system in a
 * step and/or register it in postBuild; nothing else needs to change.
 */

export interface WorldDeps {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
}

export interface WorldHandles {
  rig: CameraRig;
  people: VillagerSystem;
  titan: TitanSystem;
  wall: WallSystem;
  smithIsWorking: (hours: number) => boolean;
}

export function setupWorld(
  world: World,
  deps: WorldDeps,
): { steps: Array<[string, () => void]>; postBuild: () => WorldHandles } {
  // objects built during the loading steps, wired into systems in postBuild
  const pond = { current: null as ReturnType<typeof buildPond> | null };
  const falls = { current: null as WaterfallSystem | null };
  const village = { current: null as ReturnType<typeof buildVillage> | null };
  const sky = { current: null as SkySystem | null };
  const people = { current: null as VillagerSystem | null };
  const animals = { current: null as AnimalSystem | null };
  const titans = { current: null as TitanSystem | null };
  const wall = { current: null as WallSystem | null };

  const asSystem = (object3D: THREE.Object3D): WorldSystem => ({ object3D, update() {} });

  const steps: Array<[string, () => void]> = [
    ['shaping the valley…', () => world.register(asSystem(buildTerrain()))],
    ['growing the Great Tree…', () => {
      const tree = new GreatTree();
      world.register({ object3D: tree.group, update: (ctx) => tree.update(ctx) });
    }],
    ['laying the roads…', () => world.register(asSystem(buildPaths()))],
    ['digging the pond…', () => {
      pond.current = buildPond();
      world.register(asSystem(pond.current.group));
    }],
    ['carving the river…', () => {
      falls.current = new WaterfallSystem();
      world.register(asSystem(falls.current.group));
    }],
    ['planting the forest…', () => world.register(asSystem(buildFlora()))],
    ['raising the houses…', () => {
      village.current = buildVillage();
      world.register(asSystem(village.current.group));
    }],
    ['painting the sky…', () => {
      sky.current = new SkySystem(world.scene, village.current!.lampLights);
    }],
    ['waking the villagers…', () => {
      people.current = new VillagerSystem();
      world.register(asSystem(people.current.group));
    }],
    ['gathering the animals…', () => {
      animals.current = new AnimalSystem();
      world.register(asSystem(animals.current.group));
    }],
    ['beware the horizon…', () => {
      titans.current = new TitanSystem();
      world.register(asSystem(titans.current.group));
    }],
    ['raising the wall…', () => {
      wall.current = new WallSystem();
      world.register(asSystem(wall.current.group));
    }],
  ];

  function postBuild(): WorldHandles {
    const skySys = sky.current!;
    const villageSys = village.current!;
    const peopleSys = people.current!;
    const animalsSys = animals.current!;

    const smoke = new SmokeSystem(villageSys.chimneys);
    const sparks = new SparkSystem();
    const fireflies = new FireflySystem();
    const butterflies = new ButterflySystem();
    world.register(
      asSystem(smoke.group),
      asSystem(sparks.group),
      asSystem(fireflies.group),
      asSystem(butterflies.group),
    );

    const shepherd = peopleSys.villagers.find((v) => v.def.role === 'shepherd') ?? null;
    const smithIsWorking = (hours: number) =>
      (hours > 8.4 && hours < 12) || (hours > 13 && hours < 17.5);

    const rig = new CameraRig(deps.camera, deps.canvas);
    rig.setVillagers(peopleSys.villagers);
    const titanSys = titans.current!;

    // --- per-frame systems, in update order ---

    // 1. sky + titans: write env for everyone else + drive exposure
    world.register({
      update(ctx) {
        skySys.update(ctx.hours, ctx.dt);
        ctx.env.night = skySys.nightFactor.value;
        ctx.env.daylight = skySys.daylight.value;
        ctx.env.exposure = skySys.exposure.value;
        titanSys.update(ctx);
        deps.renderer.toneMappingExposure = ctx.env.exposure;
      },
    });

    // 2. weather-driven world detail
    world.register({
      update(ctx) {
        smoke.update(ctx.dt, ctx.hours);
        peopleSys.update(ctx.dt, ctx.hours, ctx.elapsed, ctx.env.threat, ctx.env.build);
        wall.current!.update(ctx);
        animalsSys.update(
          ctx.dt,
          ctx.elapsed,
          shepherd && shepherd.isIdle && !ctx.env.threat.active ? shepherd.position : null,
        );
        villageSys.updateHands(ctx.hours);
        villageSys.updateBell(ctx.hours, ctx.elapsed, ctx.env.threat.active);
        sparks.update(ctx.dt, smithIsWorking(ctx.hours));
        fireflies.update(ctx.dt, ctx.elapsed, ctx.env.night);
        butterflies.update(ctx.dt, ctx.elapsed, ctx.env.daylight);
        falls.current!.update(ctx.dt, ctx.elapsed);
        villageSys.updateExtras(ctx.elapsed);
      },
    });

    // 3. window/lantern glow follows nightfall
    world.register({
      update(ctx) {
        const glowK = THREE.MathUtils.smoothstep(ctx.env.night, 0.3, 0.85);
        for (const g of villageSys.nightGlass) {
          g.mat.emissiveIntensity = glowK * g.max;
        }
        for (const g of villageSys.glows) {
          (g.sprite.material as THREE.SpriteMaterial).opacity = glowK * g.base;
        }
      },
    });

    // 4. pond ripples expand, fade and respawn at fresh spots
    world.register({
      update(ctx) {
        for (const ripple of pond.current!.ripples) {
          const u = ripple.userData as { phase: number; x: number; z: number };
          u.phase += ctx.dt * 0.35;
          if (u.phase >= 1) {
            u.phase = 0;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 2.2;
            u.x = POND.center.x + Math.cos(a) * r;
            u.z = POND.center.z + Math.sin(a) * r;
          }
          const p = u.phase;
          ripple.position.set(u.x, 0.09, u.z);
          ripple.scale.setScalar(0.3 + p * 2.4);
          (ripple.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.45;
        }
      },
    });

    // 5. camera damping runs after everything has moved; titans shake the frame
    world.register({
      update(ctx) {
        rig.update(ctx.dt);
        const shake = ctx.env.threat.shake;
        if (shake > 0.01) {
          deps.camera.position.x += (Math.random() - 0.5) * shake * 0.35;
          deps.camera.position.y += (Math.random() - 0.5) * shake * 0.25;
          deps.camera.position.z += (Math.random() - 0.5) * shake * 0.35;
        }
      },
    });

    return { rig, people: peopleSys, titan: titanSys, wall: wall.current!, smithIsWorking };
  }

  return { steps, postBuild };
}
