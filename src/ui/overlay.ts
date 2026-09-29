export interface UIApi {
  setLoading(progress: number, label: string): void;
  finishLoading(): void;
  setClock(time: string, phase: string): void;
  setSpeedLabel(mult: number): void;
  setPaused(paused: boolean): void;
  setFollow(name: string | null): void;
  onSpeedChange(cb: (mult: number) => void): void;
  onPauseToggle(cb: () => void): void;
  toggleShortcuts(): void;
}

/** slider position [0..100] -> speed multiplier (0.2x .. 6x, 1x near a third) */
export function sliderToSpeed(v: number): number {
  return Math.max(0.2, 6 * Math.pow(v / 100, 1.6));
}

export function initUI(): UIApi {
  const loader = document.getElementById('loader')!;
  const loaderFill = document.getElementById('loader-fill')!;
  const loaderLabel = document.getElementById('loader-label')!;
  const clockTime = document.getElementById('clock-time')!;
  const clockPhase = document.getElementById('clock-phase')!;
  const speedInput = document.getElementById('speed') as HTMLInputElement;
  const speedLabel = document.getElementById('speed-label')!;
  const pauseBtn = document.getElementById('btn-pause')!;
  const helpBtn = document.getElementById('btn-help')!;
  const shortcuts = document.getElementById('shortcuts')!;
  const followBadge = document.getElementById('follow-badge')!;
  const followName = document.getElementById('follow-name')!;
  const hint = document.getElementById('hint')!;

  let speedCb: ((mult: number) => void) | null = null;
  let pauseCb: (() => void) | null = null;

  speedInput.addEventListener('input', () => {
    speedCb?.(sliderToSpeed(Number(speedInput.value)));
  });
  pauseBtn.addEventListener('click', () => pauseCb?.());
  helpBtn.addEventListener('click', () => {
    shortcuts.hidden = !shortcuts.hidden;
  });

  setTimeout(() => hint.classList.add('fade'), 6000);

  return {
    setLoading(progress, label) {
      loaderFill.style.width = `${Math.round(progress * 100)}%`;
      loaderLabel.textContent = label;
    },
    finishLoading() {
      loader.classList.add('done');
      setTimeout(() => loader.remove(), 900);
    },
    setClock(time, phase) {
      clockTime.textContent = time;
      clockPhase.textContent = phase;
    },
    setSpeedLabel(mult) {
      speedLabel.textContent = `${mult.toFixed(1)}×`;
    },
    setPaused(paused) {
      pauseBtn.textContent = paused ? '▶' : '❚❚';
    },
    setFollow(name) {
      if (name === null) {
        followBadge.hidden = true;
      } else {
        followName.textContent = name;
        followBadge.hidden = false;
      }
    },
    onSpeedChange(cb) {
      speedCb = cb;
    },
    onPauseToggle(cb) {
      pauseCb = cb;
    },
    toggleShortcuts() {
      shortcuts.hidden = !shortcuts.hidden;
    },
  };
}
