import * as THREE from 'three';
import { makeRng } from '../core/rng';

const WHITE = new THREE.Color(0xffffff);

interface SkyKey {
  h: number;
  top: number;
  bottom: number;
  sun: number;
  sunI: number;
  hemiI: number;
  star: number;
  exposure: number;
}

// colour script for one full day; values interpolate between keys
const KEYS: SkyKey[] = [
  { h: 0, top: 0x0b1030, bottom: 0x1d2547, sun: 0x8fa8ff, sunI: 0, hemiI: 0.22, star: 1, exposure: 0.92 },
  { h: 4.5, top: 0x161c3c, bottom: 0x2a3258, sun: 0x8fa8ff, sunI: 0, hemiI: 0.24, star: 0.9, exposure: 0.95 },
  { h: 6, top: 0x6a74a4, bottom: 0xf0b088, sun: 0xffb070, sunI: 0.5, hemiI: 0.5, star: 0.15, exposure: 1.18 },
  { h: 7.5, top: 0x74a2d4, bottom: 0xd4e4ee, sun: 0xfff1d0, sunI: 1.0, hemiI: 0.8, star: 0, exposure: 1.14 },
  { h: 10, top: 0x5fa5e0, bottom: 0xd5e9f4, sun: 0xfff6e0, sunI: 1.3, hemiI: 0.95, star: 0, exposure: 1.1 },
  { h: 13, top: 0x5fa9e2, bottom: 0xdceef6, sun: 0xfff8e6, sunI: 1.35, hemiI: 1.0, star: 0, exposure: 1.08 },
  { h: 16, top: 0x6aa2d0, bottom: 0xe9dcc0, sun: 0xffe9c0, sunI: 1.15, hemiI: 0.85, star: 0, exposure: 1.12 },
  { h: 18, top: 0x5c5c8c, bottom: 0xf0a068, sun: 0xff9d5c, sunI: 0.55, hemiI: 0.5, star: 0.05, exposure: 1.2 },
  { h: 19.5, top: 0x32305c, bottom: 0x7c5266, sun: 0xb06a80, sunI: 0.08, hemiI: 0.35, star: 0.5, exposure: 1.14 },
  { h: 21, top: 0x0e1334, bottom: 0x20284e, sun: 0x8fa8ff, sunI: 0, hemiI: 0.25, star: 0.95, exposure: 0.95 },
  { h: 24, top: 0x0b1030, bottom: 0x1d2547, sun: 0x8fa8ff, sunI: 0, hemiI: 0.22, star: 1, exposure: 0.92 },
];

const DOME_VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DOME_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  varying vec3 vPos;
  void main() {
    float t = smoothstep(-0.04, 0.42, normalize(vPos).y);
    gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
  }
`;

export class SkySystem {
  readonly nightFactor = { value: 0 }; // 0 = full day, 1 = deep night
  readonly daylight = { value: 1 };
  readonly exposure = { value: 1.1 }; // renderer tone-mapping exposure for the current time

  private static readonly KEY_COLORS = KEYS.map((k) => ({
    top: new THREE.Color(k.top),
    bottom: new THREE.Color(k.bottom),
    sun: new THREE.Color(k.sun),
  }));

  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly moon: THREE.DirectionalLight;
  private readonly stars: THREE.Points;
  private readonly sunDisc: THREE.Mesh;
  private readonly moonDisc: THREE.Mesh;
  private readonly clouds: THREE.Group;  private readonly domeMats: { uTop: THREE.IUniform<THREE.Color>; uBottom: THREE.IUniform<THREE.Color> };
  private readonly fog: THREE.Fog;
  private readonly lampLights: THREE.PointLight[];

  private readonly topColor = new THREE.Color();
  private readonly bottomColor = new THREE.Color();
  private readonly sunColor = new THREE.Color();
  private sunI = 0;
  private hemiI = 1;
  private starA = 0;

  constructor(scene: THREE.Scene, lampLights: THREE.PointLight[]) {
    this.lampLights = lampLights;

    this.fog = new THREE.Fog(0xd8edf6, 110, 340);
    scene.fog = this.fog;

    const domeMats = {
      uTop: { value: new THREE.Color(0x72bce8) },
      uBottom: { value: new THREE.Color(0xd8edf6) },
    };
    this.domeMats = domeMats;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(340, 28, 16),
      new THREE.ShaderMaterial({
        uniforms: domeMats,
        vertexShader: DOME_VERT,
        fragmentShader: DOME_FRAG,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    scene.add(dome);

    this.hemi = new THREE.HemisphereLight(0xbfd9ec, 0x8a7a5f, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff8e6, 1.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -72;
    this.sun.shadow.camera.right = 72;
    this.sun.shadow.camera.top = 72;
    this.sun.shadow.camera.bottom = -72;
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 300;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.04;
    // VSM blur: the soft, diffused shadow of a tabletop model
    this.sun.shadow.radius = 5;
    this.sun.shadow.blurSamples = 12;
    scene.add(this.sun, this.sun.target);

    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0);
    scene.add(this.moon, this.moon.target);

    // stars on the upper dome
    const starCount = 420;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.5 + 0.08; // elevation fraction, keep above horizon
      const r = 310;
      starPos[i * 3] = Math.cos(a) * Math.cos(e * Math.PI * 0.5) * r;
      starPos[i * 3 + 1] = Math.sin(e * Math.PI * 0.5) * r;
      starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e * Math.PI * 0.5) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xcfd8ff,
        size: 2.2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        fog: false,
      }),
    );
    scene.add(this.stars);

    this.sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(13, 24),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0, fog: false }),
    );
    this.moonDisc = new THREE.Mesh(
      new THREE.CircleGeometry(9, 24),
      new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false }),
    );
    scene.add(this.sunDisc, this.moonDisc);

    this.clouds = buildClouds();
    scene.add(this.clouds);
  }

  update(hours: number, dt: number): void {
    // sample the colour script
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= hours) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const ca = SkySystem.KEY_COLORS[i];
    const cb = SkySystem.KEY_COLORS[i + 1];
    const t = THREE.MathUtils.clamp((hours - a.h) / (b.h - a.h), 0, 1);
    this.topColor.copy(ca.top).lerp(cb.top, t);
    this.bottomColor.copy(ca.bottom).lerp(cb.bottom, t);
    this.sunColor.copy(ca.sun).lerp(cb.sun, t);
    this.sunI = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    this.hemiI = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    this.starA = THREE.MathUtils.lerp(a.star, b.star, t);
    this.exposure.value = THREE.MathUtils.lerp(a.exposure, b.exposure, t);

    // celestial positions
    const dayT = ((hours - 6) / 12) * Math.PI; // 6:00 -> 0, 18:00 -> PI
    const sunDir = new THREE.Vector3(Math.cos(dayT), Math.sin(dayT), 0.35).normalize();
    this.sun.position.copy(sunDir).multiplyScalar(100);
    const nightT = ((hours + 12 - 6) / 12) * Math.PI;
    const moonDir = new THREE.Vector3(Math.cos(nightT), Math.sin(nightT), -0.3).normalize();
    this.moon.position.copy(moonDir).multiplyScalar(100);

    this.sun.color.copy(this.sunColor);
    this.sun.intensity = this.sunI;
    this.sun.castShadow = this.sunI > 0.12;
    this.moon.intensity = this.starA * 0.32;
    this.hemi.intensity = this.hemiI;
    this.hemi.color.copy(this.topColor).lerp(WHITE, 0.35);

    (this.domeMats.uTop.value as THREE.Color).copy(this.topColor);
    (this.domeMats.uBottom.value as THREE.Color).copy(this.bottomColor);
    this.fog.color.copy(this.bottomColor).multiplyScalar(0.96);

    (this.stars.material as THREE.PointsMaterial).opacity = this.starA;
    this.stars.rotation.y += dt * 0.004; // very slow wheeling of the sky

    this.sunDisc.position.copy(sunDir).multiplyScalar(290);
    this.sunDisc.lookAt(0, 0, 0);
    this.sunDisc.visible = sunDir.y > -0.02;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(this.sunColor).lerp(WHITE, 0.5);
    this.moonDisc.position.copy(moonDir).multiplyScalar(290);
    this.moonDisc.lookAt(0, 0, 0);
    this.moonDisc.visible = moonDir.y > -0.02;

    // lamps come on as night falls
    const lampI = THREE.MathUtils.smoothstep(this.starA, 0.35, 0.9);
    for (const l of this.lampLights) l.intensity = lampI * 1.7;

    this.nightFactor.value = this.starA;
    this.daylight.value = THREE.MathUtils.clamp(this.sunI / 1.35, 0, 1);

    // drifting clouds
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * cloud.userData.speed;
      if (cloud.position.x > 90) cloud.position.x = -90;
    }
  }
}

function buildClouds(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(8642);

  // painterly cloud: layered blurred blobs on a canvas
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 128);
  const puff = (x: number, y: number, rx: number, ry: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.65, `rgba(255,255,255,${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, ry / rx);
    ctx.translate(-x, -y);
    ctx.beginPath();
    ctx.arc(x, y, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  puff(128, 78, 96, 34, 0.85);
  puff(86, 62, 52, 30, 0.8);
  puff(170, 58, 58, 32, 0.8);
  puff(128, 48, 44, 26, 0.85);
  puff(210, 78, 36, 20, 0.6);
  puff(48, 80, 34, 18, 0.6);
  const cloudTex = new THREE.CanvasTexture(c);

  for (let i = 0; i < 8; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: cloudTex,
        transparent: true,
        opacity: rng.range(0.65, 0.9),
        depthWrite: false,
      }),
    );
    const a = rng() * Math.PI * 2;
    // keep sky clouds off the rim: high over the village or far out at sea —
    // never hovering the wall at the edge
    const inland = rng.chance(0.55);
    const r = inland ? rng.range(6, 36) : rng.range(80, 130);
    sprite.position.set(Math.cos(a) * r, inland ? rng.range(31, 40) : rng.range(21, 30), Math.sin(a) * r);
    const w = rng.range(13, 24);
    sprite.scale.set(w, w * 0.44, 1);
    sprite.userData.speed = rng.range(0.25, 0.6);
    group.add(sprite);
  }
  return group;
}
