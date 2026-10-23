// Pooled point particles: soft sparkles and little flower petals.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute float aKind;
  attribute float aSpin;
  attribute vec3 aColor;
  varying float vAlpha;
  varying float vKind;
  varying float vSpin;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vKind = aKind;
    vSpin = aSpin;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  varying float vAlpha;
  varying float vKind;
  varying float vSpin;
  varying vec3 vColor;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float c = cos(vSpin), s = sin(vSpin);
    p = mat2(c, -s, s, c) * p;
    float a;
    if (vKind < 0.5) {
      // sparkle: soft disc with a bright core and a four-point glint
      float r = length(p);
      a = smoothstep(1.0, 0.0, r) * 0.55 + smoothstep(0.35, 0.0, r);
      a += smoothstep(0.12, 0.0, abs(p.x)) * smoothstep(1.0, 0.2, abs(p.y)) * 0.5;
      a += smoothstep(0.12, 0.0, abs(p.y)) * smoothstep(1.0, 0.2, abs(p.x)) * 0.5;
    } else {
      // petal: a pointed ellipse
      vec2 q = vec2(p.x * 1.7, p.y);
      float r = length(q) + abs(p.y) * 0.25;
      a = smoothstep(1.0, 0.85, r);
    }
    if (a * vAlpha < 0.01) discard;
    vec3 col = vKind < 0.5 ? mix(vColor, vec3(1.0), 0.45) : vColor;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * vAlpha);
  }
`;

export class Particles {
  constructor(capacity = 400) {
    this.cap = capacity;
    this.n = 0;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.kind = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.spinVel = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 3);
    this.drag = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSpin', new THREE.BufferAttribute(this.spin, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setScale(pixelHeight) {
    this.material.uniforms.uScale.value = pixelHeight;
  }

  emit({ x, y, z, vx = 0, vy = 0, vz = 0, life = 1, size = 0.3, kind = 0, color, drag = 1.5, gravity = -2 }) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.kind[i] = kind;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.spinVel[i] = (Math.random() - 0.5) * 8;
    this.color.set([color.r, color.g, color.b], i * 3);
    this.drag[i] = drag;
    this.grav[i] = gravity;
    this.alpha[i] = 1;
  }

  // Burst from a block: petals in its colour plus a few white sparkles.
  burst(x, y, z, color, strength = 1) {
    const petals = Math.round(5 * strength);
    for (let k = 0; k < petals; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.2 + Math.random() * 2.4) * strength;
      this.emit({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.8, size: 0.32 + Math.random() * 0.22, kind: 1, color, drag: 2.2, gravity: -3.2,
      });
    }
    for (let k = 0; k < 2; k++) {
      this.emit({
        x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.8, z: z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 2,
        life: 0.5 + Math.random() * 0.6, size: 0.45 + Math.random() * 0.3, kind: 0, color, drag: 3, gravity: 0.5,
      });
    }
  }

  // A small ring of dust where a piece lands.
  puff(x, y, z, color) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.random();
      this.emit({
        x, y, z, vx: Math.cos(a) * 1.6, vy: 0.4 + Math.random() * 0.4, vz: Math.sin(a) * 1.6,
        life: 0.35 + Math.random() * 0.2, size: 0.28, kind: 0, color, drag: 5, gravity: 0,
      });
    }
  }

  update(dt) {
    let j = 0;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (i !== j) this.copy(i, j);
      const d = Math.exp(-this.drag[j] * dt);
      this.vel[j * 3] *= d;
      this.vel[j * 3 + 1] = this.vel[j * 3 + 1] * d + this.grav[j] * dt;
      this.vel[j * 3 + 2] *= d;
      this.pos[j * 3] += this.vel[j * 3] * dt;
      this.pos[j * 3 + 1] += this.vel[j * 3 + 1] * dt;
      this.pos[j * 3 + 2] += this.vel[j * 3 + 2] * dt;
      this.spin[j] += this.spinVel[j] * dt;
      const t = this.life[j] / this.maxLife[j];
      this.alpha[j] = Math.min(1, t * 3);
      j++;
    }
    this.n = j;
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const name of ['position', 'aSize', 'aAlpha', 'aKind', 'aSpin', 'aColor']) g.attributes[name].needsUpdate = true;
  }

  copy(i, j) {
    for (const arr of [this.pos, this.vel, this.color]) {
      arr[j * 3] = arr[i * 3];
      arr[j * 3 + 1] = arr[i * 3 + 1];
      arr[j * 3 + 2] = arr[i * 3 + 2];
    }
    for (const arr of [this.life, this.maxLife, this.size, this.alpha, this.kind, this.spin, this.spinVel, this.drag, this.grav]) {
      arr[j] = arr[i];
    }
  }

  clear() {
    this.n = 0;
  }
}
