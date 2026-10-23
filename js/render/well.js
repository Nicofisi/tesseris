// One well (a 2D or 3D pit) with its little floating island, its blocks, the falling piece,
// the ghost and the effects. In 4D/5D there is one WellView per (w, v) slice.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PALETTE, blockGeometry } from './assets.js';
import { Particles } from './particles.js';

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const WHITE = new THREE.Color('#ffffff');

function floorTexture(X, Z) {
  const px = 64;
  const c = document.createElement('canvas');
  c.width = X * px;
  c.height = Z * px;
  const g = c.getContext('2d');
  g.fillStyle = '#d9c7a5';
  g.fillRect(0, 0, c.width, c.height);
  for (let x = 0; x < X; x++) {
    for (let z = 0; z < Z; z++) {
      g.fillStyle = (x + z) % 2 ? '#f7eedb' : '#efe3c8';
      const m = 3;
      const r = 12;
      const x0 = x * px + m, y0 = z * px + m, w = px - 2 * m;
      g.beginPath();
      g.roundRect(x0, y0, w, w, r);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.roundRect(x0 + 6, y0 + 5, w - 12, 8, 4);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Materials shared by every well.
export function createWellShared() {
  const blockMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.38, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.3,
    sheen: 0.25, sheenColor: new THREE.Color('#fff0f6'), sheenRoughness: 0.5,
  });
  const pieceMat = blockMat.clone();
  pieceMat.emissive = new THREE.Color('#ffffff');
  pieceMat.emissiveIntensity = 0.12;
  // Ghost: see-through block with glowing edges.
  const ghostMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vColor;
      void main() {
        vLocal = position;
        vColor = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vColor = instanceColor;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying vec3 vLocal;
      varying vec3 vColor;
      void main() {
        vec3 a = smoothstep(0.28, 0.43, abs(vLocal));
        float edge = max(max(a.x * a.y, a.y * a.z), a.x * a.z);
        float alpha = (0.2 + 0.7 * edge) * uOpacity;
        gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.15 + 0.45 * edge), alpha);
      }`,
    uniforms: { uOpacity: { value: 1 } },
  });
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const wood = new THREE.MeshStandardMaterial({ color: '#c98a5b', roughness: 0.8 });
  const woodActive = new THREE.MeshStandardMaterial({ color: '#ffd27a', roughness: 0.5, emissive: '#ffb347', emissiveIntensity: 0.65 });
  const grass = new THREE.MeshStandardMaterial({ color: '#8fd46b', roughness: 0.95 });
  const dirt = new THREE.MeshStandardMaterial({ color: '#c89468', roughness: 1, flatShading: true });
  const dirtDark = new THREE.MeshStandardMaterial({ color: '#a8724f', roughness: 1, flatShading: true });
  const lines = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22, depthWrite: false });
  const glass = new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide });
  const flower = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
  return { blockMat, pieceMat, ghostMat, flashMat, beamMat, wood, woodActive, grass, dirt, dirtDark, lines, glass, flower };
}

export class WellView {
  constructor({ game, wellCoords, shared, seed = 1 }) {
    this.game = game;
    this.wellCoords = wellCoords; // values for game.wellAxes
    this.dim = game.dim;
    this.X = game.size[0];
    this.Y = game.size[1];
    this.Z = this.dim >= 3 ? game.size[2] : 1;
    this.H = game.height;
    this.shared = shared;
    this.group = new THREE.Group();
    this.active = false;

    const n = this.X * this.Y * this.Z;
    this.n = n;
    this.globalIndex = new Int32Array(n);
    const p = new Array(this.dim).fill(0);
    game.wellAxes.forEach((a, i) => (p[a] = wellCoords[i]));
    for (let z = 0; z < this.Z; z++)
      for (let y = 0; y < this.Y; y++)
        for (let x = 0; x < this.X; x++) {
          p[0] = x;
          p[1] = y;
          if (this.dim >= 3) p[2] = z;
          this.globalIndex[this.local(x, y, z)] = game.index(p);
        }
    this.offset = new Float32Array(n);
    this.offVel = new Float32Array(n);
    this.pulse = new Float32Array(n).fill(9);
    this.hang = 0;
    this.animating = false;
    this.dirty = true;

    const geo = blockGeometry();
    this.blocks = new THREE.InstancedMesh(geo, shared.blockMat, n);
    this.blocks.castShadow = true;
    this.blocks.receiveShadow = true;
    this.blocks.count = 0;
    this.blocks.frustumCulled = false;
    this.piece = new THREE.InstancedMesh(geo, shared.pieceMat, 32);
    this.piece.castShadow = true;
    this.piece.count = 0;
    this.piece.frustumCulled = false;
    this.ghost = new THREE.InstancedMesh(geo, shared.ghostMat, 32);
    this.ghost.count = 0;
    this.ghost.renderOrder = 2;
    this.ghost.frustumCulled = false;
    this.flash = new THREE.InstancedMesh(geo, shared.flashMat, Math.max(64, this.X * this.Z * 6));
    this.flash.count = 0;
    this.flash.renderOrder = 3;
    this.flash.frustumCulled = false;
    this.flashes = []; // { x, y, z, color, t }
    const beamGeo = new THREE.BoxGeometry(0.86, 1, 0.86);
    beamGeo.translate(0, 0.5, 0);
    this.beams = new THREE.InstancedMesh(beamGeo, shared.beamMat, 32);
    this.beams.count = 0;
    this.beams.renderOrder = 1;
    this.beams.frustumCulled = false;
    this.particles = new Particles(this.dim >= 4 ? 220 : 700);
    this.group.add(this.blocks, this.piece, this.ghost, this.flash, this.beams, this.particles.points);
    // Colour attribute exists from the start.
    for (const m of [this.blocks, this.piece, this.ghost, this.flash]) {
      m.setColorAt(0, WHITE);
    }
    this.buildDecor(seed);
  }

  local(x, y, z) {
    return x + this.X * (y + this.Y * z);
  }
  // Cell centre in the well's local space (floor at y = 0, centred on x/z).
  cellPos(x, y, z, out = tmpP) {
    return out.set(x - (this.X - 1) / 2, y + 0.5, z - (this.Z - 1) / 2);
  }
  // Does a full grid coordinate belong to this well?
  owns(c) {
    const wa = this.game.wellAxes;
    for (let i = 0; i < wa.length; i++) if (c[wa[i]] !== this.wellCoords[i]) return false;
    return true;
  }

  bounds() {
    const X = this.X, Z = this.Z;
    return new THREE.Box3(new THREE.Vector3(-X / 2 - 0.2, -0.6, -Z / 2 - 0.2), new THREE.Vector3(X / 2 + 0.2, this.H + 2.2, Z / 2 + 0.2));
  }

  buildDecor(seed) {
    const s = this.shared;
    const X = this.X, Z = this.Z, H = this.H;
    const decor = new THREE.Group();
    this.decor = decor;
    let r = seed * 9301 + 49297;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);

    // Tiled floor.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(X, Z),
      new THREE.MeshStandardMaterial({ map: floorTexture(X, Z), roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.001;
    floor.receiveShadow = true;
    decor.add(floor);

    // Grass slab and a rocky underside: a little floating island.
    const pad = 0.9;
    const slab = new THREE.Mesh(new RoundedBoxGeometry(X + pad * 2, 0.6, Z + pad * 2, 2, 0.22), s.grass);
    slab.position.y = -0.3;
    slab.receiveShadow = true;
    decor.add(slab);
    const rx = (X + pad * 2) / 2, rz = (Z + pad * 2) / 2;
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.18, 1, 7, 2), s.dirt);
    rock.scale.set(rx * 1.02, Math.max(2.2, Math.max(X, Z) * 0.75), rz * 1.02);
    rock.position.y = -0.6 - rock.scale.y / 2;
    decor.add(rock);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.92, 1, 7, 1), s.dirtDark);
    band.scale.set(rx * 1.04, 0.35, rz * 1.04);
    band.position.y = -0.62;
    decor.add(band);

    // Corner posts and the rim.
    const posts = new THREE.Group();
    const postGeo = new RoundedBoxGeometry(0.16, H + 0.3, 0.16, 1, 0.05);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const m = new THREE.Mesh(postGeo, s.wood);
        m.position.set((sx * X) / 2, (H + 0.3) / 2, (sz * Z) / 2);
        m.castShadow = true;
        posts.add(m);
      }
    const rimX = new RoundedBoxGeometry(X + 0.16, 0.12, 0.12, 1, 0.04);
    const rimZ = new RoundedBoxGeometry(0.12, 0.12, Z + 0.16, 1, 0.04);
    for (const s2 of [-1, 1]) {
      const a = new THREE.Mesh(rimX, s.wood);
      a.position.set(0, H + 0.3, (s2 * Z) / 2);
      const b = new THREE.Mesh(rimZ, s.wood);
      b.position.set((s2 * X) / 2, H + 0.3, 0);
      posts.add(a, b);
    }
    this.posts = posts;
    decor.add(posts);

    // Faint grid on the walls helps judge height and depth.
    const pts = [];
    const x0 = -X / 2, x1 = X / 2, z0 = -Z / 2, z1 = Z / 2;
    for (let y = 1; y <= H; y++) {
      if (this.dim === 2) {
        pts.push(x0, y, z0, x1, y, z0);
      } else {
        pts.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z1);
      }
    }
    for (let x = 1; x < X; x++) pts.push(x0 + x, 0, z0, x0 + x, H, z0);
    if (this.dim >= 3) {
      for (let x = 1; x < X; x++) pts.push(x0 + x, 0, z1, x0 + x, H, z1);
      for (let z = 1; z < Z; z++) pts.push(x0, 0, z0 + z, x0, H, z0 + z, x1, 0, z0 + z, x1, H, z0 + z);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(lg, s.lines);
    lines.renderOrder = 1;
    decor.add(lines);
    if (this.dim === 2) {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(X, H), new THREE.MeshStandardMaterial({ color: '#fff6e6', transparent: true, opacity: 0.55, roughness: 1 }));
      back.position.set(0, H / 2, -0.5 - 0.01);
      back.receiveShadow = true;
      decor.add(back);
    }

    // Flowers and tufts around the edge of the island.
    const petalGeo = new THREE.SphereGeometry(0.11, 6, 4);
    const count = Math.round((X + Z) * 2.2);
    const flowers = new THREE.InstancedMesh(petalGeo, s.flower, count * 5);
    const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshStandardMaterial({ color: '#ffe066' }), count);
    const flowerColors = ['#ffffff', '#ffb3d1', '#ffd6a5', '#cdb4ff', '#ff8fab', '#a0e7ff'].map((c) => new THREE.Color(c));
    let fi = 0;
    for (let i = 0; i < count; i++) {
      // A point on the grass ring between the floor and the slab edge.
      const side = Math.floor(rand() * 4);
      const t = rand();
      const d = 0.25 + rand() * (pad - 0.4);
      let fx, fz;
      if (side === 0) [fx, fz] = [-X / 2 - d, -Z / 2 - pad + t * (Z + 2 * pad)];
      else if (side === 1) [fx, fz] = [X / 2 + d, -Z / 2 - pad + t * (Z + 2 * pad)];
      else if (side === 2) [fx, fz] = [-X / 2 - pad + t * (X + 2 * pad), -Z / 2 - d];
      else [fx, fz] = [-X / 2 - pad + t * (X + 2 * pad), Z / 2 + d];
      fx = Math.max(-rx + 0.2, Math.min(rx - 0.2, fx));
      fz = Math.max(-rz + 0.2, Math.min(rz - 0.2, fz));
      const col = flowerColors[Math.floor(rand() * flowerColors.length)];
      const fy = 0.05;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        tmpM.makeTranslation(fx + Math.cos(a) * 0.1, fy, fz + Math.sin(a) * 0.1);
        flowers.setMatrixAt(fi, tmpM);
        flowers.setColorAt(fi, col);
        fi++;
      }
      tmpM.makeTranslation(fx, fy + 0.04, fz);
      centers.setMatrixAt(i, tmpM);
    }
    decor.add(flowers, centers);
    this.group.add(decor);
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    for (const m of this.posts.children) m.material = on ? this.shared.woodActive : this.shared.wood;
  }

  // ---- events ----
  onLock(cells) {
    for (const c of cells) {
      if (!this.owns(c) || c[1] >= this.Y) continue;
      this.pulse[this.local(c[0], c[1], this.dim >= 3 ? c[2] : 0)] = 0;
      this.animating = true;
    }
    this.dirty = true;
  }

  onHardDrop(cells, color) {
    const col = PALETTE[color];
    for (const c of cells) {
      if (!this.owns(c)) continue;
      const p = this.cellPos(c[0], c[1], this.dim >= 3 ? c[2] : 0);
      this.particles.puff(p.x, p.y - 0.45, p.z, col);
    }
  }

  onClear(ev) {
    let any = false;
    for (const { p, color } of ev.removed) {
      if (!this.owns(p)) continue;
      any = true;
      this.flashes.push({ x: p[0], y: p[1], z: this.dim >= 3 ? p[2] : 0, color, t: 0 });
    }
    if (ev.drop) {
      for (let li = 0; li < this.n; li++) {
        const d = ev.drop[this.globalIndex[li]];
        if (d > 0) {
          this.offset[li] += d;
          this.offVel[li] = 0;
          any = true;
        }
      }
    }
    if (any) {
      this.hang = 0.2;
      this.animating = true;
      this.dirty = true;
    }
  }

  // ---- per frame ----
  update(dt) {
    this.particles.update(dt);
    if (this.flashes.length) this.updateFlashes(dt);
    if (this.hang > 0) this.hang -= dt;
    if (this.animating || this.dirty) this.rebuildBlocks(dt);
  }

  updateFlashes(dt) {
    let k = 0;
    const out = [];
    for (const f of this.flashes) {
      const before = f.t;
      f.t += dt;
      if (before < 0.16 && f.t >= 0.16) {
        const p = this.cellPos(f.x, f.y, f.z);
        this.particles.burst(p.x, p.y, p.z, PALETTE[f.color] ?? WHITE, this.dim >= 4 ? 0.6 : 1);
      }
      if (f.t > 0.32) continue;
      out.push(f);
      const t = f.t / 0.32;
      const s = t < 0.5 ? 1 + t * 0.5 : 1.25 * (1 - (t - 0.5) * 2) + 0.01;
      this.cellPos(f.x, f.y, f.z, tmpP);
      tmpS.setScalar(s);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS);
      this.flash.setMatrixAt(k, tmpM);
      tmpC.copy(PALETTE[f.color] ?? WHITE).lerp(WHITE, Math.min(1, t * 2.5));
      this.flash.setColorAt(k, tmpC);
      k++;
    }
    this.flashes = out;
    this.flash.count = k;
    this.flash.instanceMatrix.needsUpdate = true;
    if (this.flash.instanceColor) this.flash.instanceColor.needsUpdate = true;
  }

  rebuildBlocks(dt) {
    const grid = this.game.grid;
    let k = 0;
    let still = true;
    for (let z = 0; z < this.Z; z++)
      for (let y = 0; y < this.Y; y++)
        for (let x = 0; x < this.X; x++) {
          const li = this.local(x, y, z);
          const v = grid[this.globalIndex[li]];
          if (!v) {
            this.offset[li] = 0;
            this.offVel[li] = 0;
            this.pulse[li] = 9;
            continue;
          }
          let off = this.offset[li];
          if (off !== 0 && this.hang <= 0) {
            this.offVel[li] -= 55 * dt;
            off += this.offVel[li] * dt;
            if (off <= 0) {
              off = 0;
              if (this.offVel[li] < -4) {
                this.offVel[li] = -this.offVel[li] * 0.22;
                off = 0.0001;
              } else this.offVel[li] = 0;
            }
            this.offset[li] = off;
          }
          if (off !== 0) still = false;
          let sx = 1, sy = 1;
          if (this.pulse[li] < 0.5) {
            const t = this.pulse[li];
            const wob = Math.exp(-t * 11) * Math.cos(t * 32);
            sy = 1 - 0.2 * wob;
            sx = 1 + 0.12 * wob;
            this.pulse[li] += dt;
            still = false;
          }
          this.cellPos(x, y + off, z, tmpP);
          tmpP.y -= (1 - sy) * 0.46;
          tmpS.set(sx, sy, sx);
          tmpM.compose(tmpP, tmpQ.identity(), tmpS);
          this.blocks.setMatrixAt(k, tmpM);
          this.blocks.setColorAt(k, PALETTE[v - 1] ?? WHITE);
          k++;
        }
    this.blocks.count = k;
    this.blocks.instanceMatrix.needsUpdate = true;
    if (this.blocks.instanceColor) this.blocks.instanceColor.needsUpdate = true;
    this.animating = !still;
    this.dirty = false;
  }

  // Draws the active piece, its ghost and the landing beams (pieceCells are absolute grid coords).
  setPiece(cells, ghost, color, visualOffset, pulse) {
    let k = 0;
    const col = PALETTE[color] ?? WHITE;
    const s = 1 + pulse * 0.08;
    tmpS.setScalar(s);
    for (const c of cells) {
      if (!this.owns(c)) continue;
      this.cellPos(c[0], c[1], this.dim >= 3 ? c[2] : 0, tmpP).add(visualOffset);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS);
      this.piece.setMatrixAt(k, tmpM);
      this.piece.setColorAt(k, col);
      k++;
    }
    this.piece.count = k;
    this.piece.instanceMatrix.needsUpdate = true;
    if (this.piece.instanceColor) this.piece.instanceColor.needsUpdate = true;

    let g = 0;
    tmpS.setScalar(0.96);
    const ghostCol = tmpC.copy(col);
    const sameAsPiece = ghost.length && cells.length && ghost[0][1] === cells[0][1];
    if (!sameAsPiece) {
      for (const c of ghost) {
        if (!this.owns(c)) continue;
        this.cellPos(c[0], c[1], this.dim >= 3 ? c[2] : 0, tmpP);
        tmpM.compose(tmpP, tmpQ.identity(), tmpS);
        this.ghost.setMatrixAt(g, tmpM);
        this.ghost.setColorAt(g, ghostCol);
        g++;
      }
    }
    this.ghost.count = g;
    this.ghost.instanceMatrix.needsUpdate = true;
    if (this.ghost.instanceColor) this.ghost.instanceColor.needsUpdate = true;

    // Beams: one translucent column per footprint cell, from the ghost up to the piece.
    let b = 0;
    if (this.dim >= 3 && !sameAsPiece) {
      const cols = new Map();
      for (const c of cells) {
        if (!this.owns(c)) continue;
        const key = c[0] + ',' + c[2];
        const cur = cols.get(key);
        if (!cur || c[1] < cur.top) cols.set(key, { x: c[0], z: c[2], top: c[1], bottom: Infinity });
      }
      for (const c of ghost) {
        if (!this.owns(c)) continue;
        const cur = cols.get(c[0] + ',' + c[2]);
        if (cur) cur.bottom = Math.min(cur.bottom === Infinity ? c[1] : cur.bottom, c[1]);
      }
      for (const { x, z, top, bottom } of cols.values()) {
        if (bottom === Infinity) continue;
        const from = bottom;
        const h = top + visualOffset.y - from;
        if (h <= 0.05) continue;
        this.cellPos(x, from - 0.5, z, tmpP);
        tmpP.x += visualOffset.x;
        tmpP.z += visualOffset.z;
        tmpS.set(1, h, 1);
        tmpM.compose(tmpP, tmpQ.identity(), tmpS);
        this.beams.setMatrixAt(b++, tmpM);
      }
    }
    this.beams.count = b;
    this.beams.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry && o.geometry !== blockGeometry()) o.geometry.dispose?.();
    });
  }
}
