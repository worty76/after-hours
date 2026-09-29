import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Villager } from '../people/villagers';

export type CameraMode = 'orbit' | 'follow';

/** Overview orbit camera + a smoothly damped "follow a villager" camera. */
export class CameraRig {
  readonly controls: OrbitControls;
  mode: CameraMode = 'orbit';

  private readonly camera: THREE.PerspectiveCamera;
  private villagers: Villager[] = [];
  private followIndex = 0;
  private readonly lookTarget = new THREE.Vector3(0, 1.2, 0);
  private readonly desired = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement) {
    this.camera = camera;
    this.controls = new OrbitControls(camera, dom);
    this.controls.target.set(0, 1.2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 200;
    this.controls.maxPolarAngle = 1.45; // never dip below the diorama
    this.controls.update();
  }

  setVillagers(villagers: Villager[]): void {
    this.villagers = villagers;
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.controls.enabled = mode === 'orbit';
  }

  /** cycle which villager we follow; returns the name or null when back to orbit */
  cycleFollow(dir: 1 | -1): string | null {
    if (this.villagers.length === 0) return null;
    this.followIndex = (this.followIndex + dir + this.villagers.length) % this.villagers.length;
    this.setMode('follow');
    return this.villagers[this.followIndex].def.name;
  }

  followByName(name: string): boolean {
    const idx = this.villagers.findIndex((v) => v.def.name === name);
    if (idx < 0) return false;
    this.followIndex = idx;
    this.setMode('follow');
    return true;
  }

  update(dt: number): void {
    if (this.mode === 'orbit') {
      this.controls.update();
      return;
    }
    const v = this.villagers[this.followIndex];
    if (!v) {
      this.setMode('orbit');
      return;
    }
    // hover behind and above whoever we follow
    const heading = v.group.rotation.y;
    const back = 4.2;
    const up = 3.1;
    this.desired.set(
      v.position.x - Math.sin(heading) * back,
      v.position.y + up,
      v.position.z - Math.cos(heading) * back,
    );
    const k = 1 - Math.exp(-dt * 3.2);
    this.camera.position.lerp(this.desired, k);
    this.lookTarget.lerp(v.position, 1 - Math.exp(-dt * 5));
    this.camera.lookAt(this.lookTarget);
  }
}
