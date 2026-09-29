# Petit Valley · a living village diorama

A self-contained Three.js diorama where you watch a tiny village live through its
day — villagers walk to their fields, work, gather at the market, and go home to
sleep while the sun crosses the sky. Inspired by
[traindiorama.netlify.app](https://traindiorama.netlify.app/).

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
             creature population counts
  world/     layout data (road graph, houses, scatter zones), terrain chunk,
             paths, props (houses, well, bell tower, stalls, lamps, fields,
             coop), materials (toon shading + palette + glow sprites),
             instanced flora, pond, waterfall, sky/time-of-day system,
             chimney smoke, animals (sheep, chickens, fish, duck, dog),
             fx (sparks, fireflies, butterflies)
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
reads `ctx.env` reacts to night/day automatically.

**Keyboard/camera presets** live in `main.ts` and `src/cameras/rig.ts`.

## Ideas for later phases

- weather (rain/snow) with villager reactions, seasons
- ambient sound (WebAudio: birds by day, crickets at night, bell rings)
- pixel-art / ink-lines render modes, more camera presets
