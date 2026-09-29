# Petit Valley · the skyland upon the Great Tree

A self-contained Three.js diorama: a village skyland built on the crown of a
colossal tree, high above a sea of clouds — placed there precisely because
*things climb from the dark below*. Watch the villagers live their day, and
when the horn of the bell tower rings, run to the rim with them: titans of
charred stone haul themselves up the Great Tree's branches trying to reach
the skyland, and the villagers stone them back into the clouds.

Everything is procedural — no model files, no textures, no audio assets. The whole
world is built from Three.js primitives at load time.

## Run it

```bash
npm install
npm run dev       # dev server
npm run build     # production build into dist/
npm run preview   # serve the production build
```

## Controls

| Key | Action |
| --- | --- |
| `1` | overview (orbit) camera |
| `2` / `3` | follow the next / previous villager |
| `Space` | pause time |
| `T` | summon a titan |
| `H` | toggle the shortcuts panel |
| drag / scroll | orbit and zoom |

The bottom slider scales time (0.2× – 6×; at 1× one real second is one game
minute, so a full day passes in 24).

URL params for jumping around: `?h=22` (start hour), `?speed=4`, `?cam=follow&v=Lina`.

## How it works

```
src/
  core/      renderer + camera setup, game clock, World orchestrator,
             seeded RNG & value noise
  content/   pure data: villagers (who lives where, who works where),
             creature population, titan attack tuning
  world/     layout data (road graph, houses, river, scatter zones),
             terrain chunk, paths, props (houses, well, bell tower, stalls,
             lamps, fields, coop, bridge, windmill, barn, dock, boat),
             materials (toon shading + palette + glow sprites),
             instanced flora, pond, river + waterfall, the Great Tree (trunk,
             buttress roots, titan-ladder branches, vines), sky/time-of-day
             system, chimney smoke, animals (sheep, chickens, fish, duck,
             dog), titans (charred climbing giants + the villagers'
             defence), fx (sparks, fireflies, butterflies)
  people/    chibi villager meshes, pose blending, daily schedules,
             BFS pathfinding on the road graph
  cameras/   orbit + smoothly damped follow camera
  modules/   the assembly point: build steps + per-frame system wiring
  ui/        loading screen, clock, speed slider, shortcuts panel
  main.ts    thin boot: renderer, loader, UI, keyboard, frame loop
```

Everything on screen is a **`WorldSystem`** (`src/core/world.ts`): an optional
`object3D` plus an `update(ctx)` that receives `{ dt, elapsed, hours, env }`.
Systems update in registration order; the sky system runs first and writes
`env` (night, daylight, exposure) for everyone else. `src/modules/index.ts`
is the single assembly point — build steps for the loading screen, then the
per-frame registrations.

## How to extend

**Add a villager** — append an entry to `VILLAGER_SEEDS`
(`src/content/villagers.ts`): name, role, which house they live in, where they
work. Appearance, schedule and behavior derive from `role`. New role? Extend
the `role` union, add a branch in `makeDef`/`idlePose` (`src/people/villagers.ts`).
At runtime you can also call `people.addSeed({...})` / `people.remove('Name')`
from the browser console via `window.__village.people`.

**Add animals** — tune counts in `CREATURES` (`src/content/creatures.ts`);
implement new creatures in `src/world/animals.ts` following the `Sheep`/
`Chicken` pattern (a class with `group` + `update`, registered in `AnimalSystem`).

**Add a whole new system** (weather, birds, a second island…) — create a
module under `src/world/`, construct it in a `steps` entry of
`src/modules/index.ts`, and register an adapter in `postBuild`. Anything that
reads `ctx.env` reacts to night/day automatically. `src/world/titans.ts` is a
full worked example: it writes `env.threat` each frame, and the bell, the
villagers (who drop everything to defend the rim) and the camera shake all
react to it through `env` alone.

**Titan attacks** run on their own timer (tune `src/content/titans.ts`) or
press `T` / open `?titan=1` — and up to `maxActive` titans climb at once, each
at a different branch. Titans rise from the sea of clouds below, scale the
Great Tree's branches and grip the rim; awake villagers run to the nearest rim
lookout and stone them back into the clouds. At night, with few defenders, a
titan can reach the summit — it roars, shakes the island… and still loses its
grip.

**The wall is being built.** Kaan and Nadia the builders spend their workdays
hauling stones from the quarry to their gate; every delivery raises the current
wall section by one stone (the wall drains `env.build` counters — same pattern
as titan hits). Four courses high when finished, scaffolds hop to the next
unfinished stretch, and untouched segments show stakes and loose stones.
Gates stay low where the defence trails cross, so the wall will close only
when the work is truly done.

**The watch.** Four guards — Rustem, Deniz, Ida and Baran — hold the rim
lookouts by the watcher stones, helmets, spears and shields out, patrolling
their stretch in shifts (two by day, two by night — so night titans meet
steel, not sleeping villagers). Guards hold their own post during an attack
and throw heavier stones faster than the villagers, who swarm the threat
from the village.

**Keyboard/camera presets** live in `main.ts` and `src/cameras/rig.ts`.

## Ideas for later phases

- weather (rain/snow) with villager reactions, seasons
- ambient sound (WebAudio: birds by day, crickets at night, bell rings)
- pixel-art / ink-lines render modes, more camera presets
