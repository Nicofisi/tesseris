// The backdrop: a soft gradient sky with a sun, drifting clouds, faraway floating islands and
// petals in the air. Rendered once per frame behind the wells. setDayTime(t) moves it from
// morning (0) through noon and sunset to a starry night (1).
import * as THREE from 'three';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uStars;
  uniform float uTime;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.65, h)) : mix(uMid, uBottom, smoothstep(0.0, -0.4, h));
    float sd = max(0.0, dot(d, normalize(uSunDir)));
    col += uSunColor * (pow(sd, 400.0) * 1.4 + pow(sd, 18.0) * 0.35 + pow(sd, 3.0) * 0.12);
    if (uStars > 0.0) {
      vec3 g = floor(d * 140.0);
      float s = hash(g);
      float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 40.0);
      col += vec3(step(0.985, s) * tw * uStars * smoothstep(0.0, 0.3, h));
    }
    gl_FragColor = vec4(col, 1.0);
  }
`;

// Key moments of the day; colours blend between them.
const DAY = [
  { t: 0.0, top: '#7ec8ff', mid: '#ffd9e8', bottom: '#ffe9c7', sun: '#fff1c1', light: '#fff4e0', hemi: ['#cfe8ff', '#ffe2c4'], stars: 0, fog: '#ffe3ec' },
  { t: 0.35, top: '#4fb3ff', mid: '#bfe6ff', bottom: '#eaf7ff', sun: '#fff8e0', light: '#ffffff', hemi: ['#d6efff', '#e9f5d0'], stars: 0, fog: '#d8efff' },
  { t: 0.65, top: '#7a7cff', mid: '#ff9fb3', bottom: '#ffc58a', sun: '#ffb36b', light: '#ffd2a8', hemi: ['#ffc7d9', '#ffcf9e'], stars: 0, fog: '#ffb8c4' },
  { t: 1.0, top: '#141a4a', mid: '#3d3a8c', bottom: '#7a5ea8', sun: '#cfd8ff', light: '#b9c4ff', hemi: ['#6d78d6', '#5a4a8a'], stars: 1, fog: '#4a3f8f' },
];

function lerpDay(t) {
  t = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < DAY.length - 2 && t > DAY[i + 1].t) i++;
  const a = DAY[i], b = DAY[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  const mix = (x, y) => new THREE.Color(x).lerp(new THREE.Color(y), k);
  return {
    top: mix(a.top, b.top), mid: mix(a.mid, b.mid), bottom: mix(a.bottom, b.bottom), sun: mix(a.sun, b.sun),
    light: mix(a.light, b.light), hemiSky: mix(a.hemi[0], b.hemi[0]), hemiGround: mix(a.hemi[1], b.hemi[1]),
    stars: a.stars + (b.stars - a.stars) * k, fog: mix(a.fog, b.fog),
  };
}

function softTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Environment {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 2000);
    this.camera.position.set(0, 6, 40);
    this.camera.lookAt(0, 8, 0);
    this.time = 0;
    this.day = 0;
    this.dayTarget = 0;

    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0.4, 0.35, -1) }, uSunColor: { value: new THREE.Color() },
        uStars: { value: 0 }, uTime: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), this.skyMat);
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight('#ffffff', '#ffffff', 1.4);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.6);
    this.sun.position.set(30, 50, 40);
    this.scene.add(this.hemi, this.sun);
    this.scene.fog = new THREE.Fog('#ffffff', 120, 520);

    this.buildClouds();
    this.buildIslands();
    this.buildMotes();
    this.apply(0);
  }

  buildClouds() {
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.25, flatShading: true });
    this.cloudMat = mat;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.clouds = [];
    let r = 7;
    const rand = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const puffs = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < puffs; k++) {
        const m = new THREE.Mesh(geo, mat);
        const s = 3 + rand() * 4;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((k - puffs / 2) * 4 + rand() * 2, rand() * 2, rand() * 3);
        g.add(m);
      }
      g.position.set(-260 + rand() * 520, 10 + rand() * 70, -120 - rand() * 260);
      g.userData.speed = 1.5 + rand() * 2.5;
      this.scene.add(g);
      this.clouds.push(g);
    }
  }

  buildIslands() {
    const grass = new THREE.MeshStandardMaterial({ color: '#9bd97a', roughness: 1, flatShading: true });
    const dirt = new THREE.MeshStandardMaterial({ color: '#c99b74', roughness: 1, flatShading: true });
    const leaf = new THREE.MeshStandardMaterial({ color: '#6cc48a', roughness: 1, flatShading: true });
    const blossom = new THREE.MeshStandardMaterial({ color: '#ffb7d5', roughness: 1, flatShading: true });
    const trunk = new THREE.MeshStandardMaterial({ color: '#a8754f', roughness: 1 });
    this.islands = [];
    const spots = [
      [-70, -14, -110, 12], [80, -4, -150, 16], [-140, 18, -230, 20], [150, 30, -260, 18], [10, -38, -90, 9],
      [-40, 42, -300, 14], [60, 60, -380, 22],
    ];
    spots.forEach(([x, y, z, s], i) => {
      const g = new THREE.Group();
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.95, 0.35, 9), grass);
      top.scale.set(s, s * 0.5, s * 0.8);
      const rock = new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 8), dirt);
      rock.rotation.x = Math.PI;
      rock.scale.set(s * 0.95, s, s * 0.75);
      rock.position.y = -s * 0.98;
      g.add(top, rock);
      const trees = 1 + (i % 3);
      for (let k = 0; k < trees; k++) {
        const t = new THREE.Group();
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 6), trunk);
        tr.position.y = 0.8;
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), (i + k) % 2 ? blossom : leaf);
        crown.position.y = 2;
        crown.scale.set(1, 0.85, 1);
        t.add(tr, crown);
        t.scale.setScalar(s * 0.28);
        t.position.set((k - (trees - 1) / 2) * s * 0.5, s * 0.08, (k % 2) * s * 0.2);
        g.add(t);
      }
      g.position.set(x, y, z);
      g.userData = { baseY: y, phase: i * 1.7 };
      this.scene.add(g);
      this.islands.push(g);
    });
  }

  buildMotes() {
    const n = 160;
    const pos = new Float32Array(n * 3);
    this.moteVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 160;
      pos[i * 3 + 1] = (Math.random() - 0.3) * 70;
      pos[i * 3 + 2] = -Math.random() * 120 + 10;
      this.moteVel[i * 3] = 0.6 + Math.random() * 1.2;
      this.moteVel[i * 3 + 1] = -0.3 - Math.random() * 0.5;
      this.moteVel[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteMat = new THREE.PointsMaterial({
      map: softTexture(), size: 1.2, transparent: true, depthWrite: false, color: '#ffd1e6', opacity: 0.9,
    });
    this.motes = new THREE.Points(g, this.moteMat);
    this.scene.add(this.motes);
  }

  setDayTime(t, instant = false) {
    this.dayTarget = t;
    if (instant) this.apply(t);
  }

  apply(t) {
    this.day = t;
    const d = lerpDay(t);
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(d.top);
    u.uMid.value.copy(d.mid);
    u.uBottom.value.copy(d.bottom);
    u.uSunColor.value.copy(d.sun);
    u.uStars.value = d.stars;
    const sunH = t < 0.8 ? 0.15 + Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.45 : 0.25;
    u.uSunDir.value.set(0.5 - t * 0.6, sunH, -1).normalize();
    this.hemi.color.copy(d.hemiSky);
    this.hemi.groundColor.copy(d.hemiGround);
    this.sun.color.copy(d.light);
    this.scene.fog.color.copy(d.fog);
    this.cloudMat.color.copy(new THREE.Color('#ffffff').lerp(d.mid, 0.25));
    this.cloudMat.emissive.copy(d.mid).lerp(new THREE.Color('#ffffff'), 0.5);
    this.moteMat.color.copy(t > 0.85 ? new THREE.Color('#fff3a0') : new THREE.Color('#ffd1e6'));
    this.palette = d;
  }

  resize(w, h) {
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.time += dt;
    this.skyMat.uniforms.uTime.value = this.time;
    if (Math.abs(this.day - this.dayTarget) > 0.001) {
      this.apply(this.day + (this.dayTarget - this.day) * Math.min(1, dt * 0.8));
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 300) c.position.x = -300;
    }
    for (const g of this.islands) g.position.y = g.userData.baseY + Math.sin(this.time * 0.4 + g.userData.phase) * 1.2;
    const pos = this.motes.geometry.attributes.position;
    const a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      a[i] += this.moteVel[i] * dt + Math.sin(this.time + i) * 0.01;
      a[i + 1] += this.moteVel[i + 1] * dt;
      a[i + 2] += this.moteVel[i + 2] * dt;
      if (a[i] > 80) a[i] = -80;
      if (a[i + 1] < -30) a[i + 1] = 45;
    }
    pos.needsUpdate = true;
    // A slow, gentle sway of the backdrop camera.
    this.camera.position.x = Math.sin(this.time * 0.05) * 4;
    this.camera.lookAt(0, 8, 0);
  }
}
