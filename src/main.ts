import { bindResize, createCamera, createRenderer } from './core/engine';
import { World } from './core/world';
import { formatClock, phaseOf } from './core/clock';
import { setupWorld } from './modules';
import { initUI } from './ui/overlay';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function reportBootError(err: unknown): void {
  const label = document.getElementById('loader-label');
  const fill = document.getElementById('loader-fill');
  if (label) {
    label.textContent = `something broke the valley: ${err instanceof Error ? err.message : String(err)}`;
    label.style.color = '#a03d2d';
  }
  if (fill) fill.style.background = '#a03d2d';
  console.error(err);
}

async function boot(): Promise<void> {
  const ui = initUI();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = createRenderer(canvas);
  const camera = createCamera();
  bindResize(camera, renderer);

  const world = new World();
  const { steps, postBuild } = setupWorld(world, { renderer, camera, canvas });

  // run the build stages with the loading screen
  for (let i = 0; i < steps.length; i++) {
    ui.setLoading(i / steps.length, steps[i][0]);
    await wait(70); // let the loader paint between steps
    steps[i][1]();
  }
  ui.setLoading(1, 'ringing the morning bell…');
  await wait(110);
  const { rig, people, titan, wall } = postBuild();
  ui.finishLoading();

  // debug/screenshot query params
  const params = new URLSearchParams(window.location.search);
  if (params.has('h')) world.clock.hours = Number(params.get('h')) % 24;
  if (params.has('speed')) world.clock.speed = Number(params.get('speed'));
  if (params.get('cam') === 'follow') {
    const name = params.get('v');
    if (name && rig.followByName(name)) ui.setFollow(name);
  }
  if (params.has('titan')) titan.summon();

  // ---- UI wiring ----
  ui.setSpeedLabel(world.clock.speed);
  ui.onSpeedChange((mult) => {
    world.clock.speed = mult;
    ui.setSpeedLabel(mult);
  });
  ui.onPauseToggle(() => {
    world.clock.paused = !world.clock.paused;
    ui.setPaused(world.clock.paused);
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.key) {
      case '1':
        rig.setMode('orbit');
        ui.setFollow(null);
        break;
      case '2':
        ui.setFollow(rig.cycleFollow(1));
        break;
      case '3':
        ui.setFollow(rig.cycleFollow(-1));
        break;
      case ' ':
        e.preventDefault();
        world.clock.paused = !world.clock.paused;
        ui.setPaused(world.clock.paused);
        break;
      case 'h':
      case 'H':
        ui.toggleShortcuts();
        break;
      case 't':
      case 'T':
        titan.summon();
        break;
      default:
        break;
    }
  });

  // debug handle for browser-console diagnosis
  Object.assign(window, { __village: { world, rig, people, titan, wall } });

  // ---- frame loop ----
  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;

    world.update(dt);
    ui.setClock(formatClock(world.clock.hours), phaseOf(world.clock.hours));
    renderer.render(world.scene, camera);
  });
}

void boot().catch(reportBootError);
