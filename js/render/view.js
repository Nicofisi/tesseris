// Draws a game: the sky backdrop full-screen, then every well in its own viewport (one in 2D/3D,
// a row or a grid in 4D/5D), then the hold/next previews into their HUD slots.
import * as THREE from 'three';
import { Environment } from './env.js';
import { WellView, createWellShared } from './well.js';
import { PALETTE, blockGeometry } from './assets.js';


export class GameView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = false;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.env = new Environment();
    this.shared = createWellShared();

    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight('#dff0ff', '#ffe6cc', 1.25);
    this.key = new THREE.DirectionalLight('#fff4e0', 2.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0008;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    this.fill = new THREE.DirectionalLight('#ffd6f0', 0.5);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill);

    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
    this.cam = { yaw: 0.32, pitch: 0.95, zoom: 1, yawTarget: 0.32, pitchTarget: 0.95, dragging: false };

    this.previewScene = new THREE.Scene();
    this.previewScene.add(new THREE.HemisphereLight('#ffffff', '#ffe0cc', 1.6));
    const pl = new THREE.DirectionalLight('#ffffff', 1.8);
    pl.position.set(3, 6, 5);
    this.previewScene.add(pl);
    this.previewCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    // Previews sit on top of the HUD panels, so they get their own transparent canvas.
    this.overlayCanvas = document.getElementById('previews');
    this.overlay = new THREE.WebGLRenderer({ canvas: this.overlayCanvas, alpha: true, antialias: true });
    this.overlay.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.overlay.outputColorSpace = THREE.SRGBColorSpace;
    this.overlay.toneMapping = THREE.NeutralToneMapping;
    this.overlay.autoClear = false;
    this.overlay.setClearColor(0x000000, 0);
    this.previewMesh = new THREE.InstancedMesh(blockGeometry(), this.shared.blockMat, 64);
    this.previewMesh.setColorAt(0, new THREE.Color());
    this.previewMesh.frustumCulled = false;
    this.previewScene.add(this.previewMesh);

    this.wells = [];
    this.game = null;
    this.rects = [];
    this.boardRect = { x: 0, y: 0, w: 1, h: 1 };
    this.pieceOffset = new THREE.Vector3();
    this.piecePulse = 0;
    this.shake = 0;
    this.time = 0;
    this.previewSlots = [];
    this.resize();
  }

  // ---- setup ----
  setGame(game) {
    for (const w of this.wells) {
      this.scene.remove(w.group);
      w.dispose();
    }
    this.game = game;
    this.wells = [];
    const sizes = game.wellAxes.map((a) => game.size[a]);
    const coords = [];
    const rec = (k, acc) => {
      if (k === sizes.length) return coords.push(acc);
      for (let i = 0; i < sizes[k]; i++) rec(k + 1, [...acc, i]);
    };
    rec(0, []);
    // Wells ordered so that index = w + W * v.
    coords.sort((a, b) => (a[1] ?? 0) - (b[1] ?? 0) || (a[0] ?? 0) - (b[0] ?? 0));
    const lite = coords.length > 16;
    this.batched = lite;
    coords.forEach((c, i) => {
      const wv = new WellView({ game, wellCoords: c, shared: this.shared, seed: i + 3, lite, layerColors: game.dim >= 3 && this.layerColors !== false });
      wv.group.visible = false;
      this.scene.add(wv.group);
      this.wells.push(wv);
    });
    const dim = game.dim;
    if (dim === 2) {
      this.cam.yaw = this.cam.yawTarget = 0;
      this.cam.pitch = this.cam.pitchTarget = 0.12;
    } else {
      this.cam.yaw = this.cam.yawTarget = 0.32;
      this.cam.pitch = this.cam.pitchTarget = dim === 3 ? 1.02 : 1.05;
    }
    this.cam.zoom = 1;
    this.camera.fov = dim === 2 ? 26 : 32;
    this.camera.updateProjectionMatrix();
    // Shadows: one shadow camera that covers a well (they all share local space).
    const b = this.wells[0].bounds();
    const r = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) * 0.75;
    const sc = this.key.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.5; sc.far = r * 6;
    sc.updateProjectionMatrix();
    this.key.target.position.set(0, (b.max.y + b.min.y) / 2, 0);
    this.key.position.set(r * 0.35, r * 3.2, r * 0.9).add(this.key.target.position);
    this.fill.position.set(-r, r, -r);
    const shadows = this.wells.length <= 16 && this.shadowsAllowed !== false;
    if (shadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = shadows;
      for (const m of Object.values(this.shared)) if (m?.isMaterial) m.needsUpdate = true;
      for (const m of this.shared.floors?.values() ?? []) m.needsUpdate = true;
    }
    this.layout();
  }

  setLayerColors(on) {
    this.layerColors = on;
    for (const w of this.wells) {
      w.layerColors = on && w.dim >= 3;
      w.dirty = true;
    }
  }

  setBoardRect(rect) {
    this.boardRect = rect;
    this.layout();
  }

  setPreviewSlots(slots) {
    this.previewSlots = slots; // [{ el, piece: { cells, n } | null }]
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.overlay?.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.env.resize(w, h);
    this.layout();
  }

  // Splits the board area into one viewport per well.
  layout() {
    if (!this.game) return;
    const g = this.game;
    const { x, y, w, h } = this.boardRect;
    let cols = 1, rows = 1;
    if (g.wellAxes.length === 1) {
      const W = g.size[g.wellAxes[0]];
      // One row or two, whichever gives the wells more room.
      const score = (r) => {
        const c = Math.ceil(W / r);
        const cw = w / c, ch = h / r;
        return Math.min(cw / 0.62, ch);
      };
      // Neighbouring wells read best in one row; wrap only when that makes them much bigger.
      rows = W >= 6 && score(2) > score(1) * 1.3 ? 2 : 1;
      cols = Math.ceil(W / rows);
    } else if (g.wellAxes.length === 2) {
      cols = g.size[g.wellAxes[0]];
      rows = g.size[g.wellAxes[1]];
    }
    this.cols = cols;
    this.rows = rows;
    const gap = this.wells.length > 1 ? Math.max(4, Math.min(14, w * 0.008)) : 0;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    this.rects = this.wells.map((_, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      return { x: x + c * (cw + gap), y: y + r * (ch + gap), w: cw, h: ch };
    });
  }

  wellIndexOf(c) {
    const g = this.game;
    if (!g.wellAxes.length) return 0;
    const w = c[g.wellAxes[0]];
    const v = g.wellAxes.length > 1 ? c[g.wellAxes[1]] : 0;
    return w + g.size[g.wellAxes[0]] * v;
  }

  // ---- camera ----
  orbit(dx, dy) {
    if (this.game?.dim === 2) {
      this.cam.yawTarget = Math.max(-0.5, Math.min(0.5, this.cam.yawTarget - dx * 0.005));
      this.cam.pitchTarget = Math.max(0, Math.min(0.6, this.cam.pitchTarget + dy * 0.004));
      return;
    }
    this.cam.yawTarget -= dx * 0.008;
    this.cam.pitchTarget = Math.max(0.25, Math.min(1.53, this.cam.pitchTarget + dy * 0.006));
  }
  orbitEnd() {
    if (this.game?.dim === 2) {
      this.cam.yawTarget = 0;
      this.cam.pitchTarget = 0.12;
      return;
    }
    // Snap to the nearest of the four nice diagonal-ish views so the controls stay unambiguous.
    const step = Math.PI / 2;
    this.cam.yawTarget = Math.round((this.cam.yawTarget - 0.32) / step) * step + 0.32;
  }
  turn(dir) {
    if (this.game?.dim === 2) return;
    this.cam.yawTarget += (dir * Math.PI) / 2;
  }
  toggleTop() {
    if (this.game?.dim === 2) return;
    const top = 1.5;
    this.cam.pitchTarget = this.cam.pitchTarget > 1.4 ? (this.game.dim === 3 ? 1.02 : 1.05) : top;
  }
  zoomBy(f) {
    this.cam.zoom = Math.max(0.55, Math.min(1.8, this.cam.zoom * f));
  }

  // Which grid axis (and sign) is screen-right and which is "away from the camera".
  screenAxes() {
    const yaw = this.cam.yawTarget;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const pick = (x, z) => (Math.abs(x) >= Math.abs(z) ? { axis: 0, sign: Math.sign(x) || 1 } : { axis: 2, sign: Math.sign(z) || 1 });
    if (this.game?.dim === 2) return { right: { axis: 0, sign: 1 }, fwd: null };
    return { right: pick(rx, rz), fwd: pick(fx, fz) };
  }

  fitCamera(aspect) {
    const b = this.wells[0].bounds();
    const center = b.getCenter(new THREE.Vector3());
    const { yaw, pitch } = this.cam;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanH = tanV * aspect;
    const corners = [];
    for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) corners.push(new THREE.Vector3(cx, cy, cz));
    const fit = (target) => {
      let d = 0;
      for (const c of corners) {
        const rel = c.clone().sub(target);
        const zc = rel.dot(dir), xc = rel.dot(right), yc = rel.dot(up);
        d = Math.max(d, zc + Math.abs(xc) / tanH, zc + Math.abs(yc) / tanV);
      }
      return d;
    };
    let target = center.clone();
    let d = fit(target);
    // Re-centre the projected box.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      const rel = c.clone().sub(target);
      const depth = d - rel.dot(dir);
      const px = rel.dot(right) / (depth * tanH), py = rel.dot(up) / (depth * tanV);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
    target.addScaledVector(right, ((minX + maxX) / 2) * d * tanH).addScaledVector(up, ((minY + maxY) / 2) * d * tanV);
    d = fit(target) * 1.03 / this.cam.zoom;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(target).addScaledVector(dir, d);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    if (this.shake > 0) {
      const s = this.shake * 0.15;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
  }

  // ---- events from the game ----
  handleEvents(events) {
    const g = this.game;
    for (const e of events) {
      switch (e.type) {
        case 'move':
          if (g.inWellAxes.includes(e.axis)) {
            const v = e.axis === 0 ? 'x' : 'z';
            this.pieceOffset[v] -= e.dir;
          }
          break;
        case 'fall':
          this.pieceOffset.y += 1;
          break;
        case 'rotate':
          this.piecePulse = 1;
          break;
        case 'spawn':
          this.pieceOffset.set(0, 0, 0);
          break;
        case 'hardDrop':
          this.pieceOffset.set(0, 0, 0);
          for (const w of this.wells) w.onHardDrop(e.cells, g.piece?.color ?? 0, e.distance);
          this.shake = Math.max(this.shake, Math.min(1, 0.25 + e.distance * 0.03));
          break;
        case 'lock':
          for (const w of this.wells) w.onLock(e.cells);
          break;
        case 'clear':
          for (const w of this.wells) w.onClear(e);
          this.shake = Math.max(this.shake, Math.min(1.6, 0.35 * e.count));
          break;
      }
    }
  }

  collapse() {
    for (const w of this.wells) w.collapse();
    this.shake = 1.2;
  }

  // Screen position (CSS px) of a grid cell, for score popups.
  cellToScreen(c) {
    const wi = this.wellIndexOf(c);
    const r = this.rects[wi];
    const well = this.wells[wi];
    if (!r || !well) return null;
    if (this.batched) {
      const cam = this.placeBatched();
      const p = well.cellPos(c[0], c[1], this.game.dim >= 3 ? c[2] : 0).clone().add(well.group.position).project(cam);
      return { x: ((p.x + 1) / 2) * this.width, y: ((1 - p.y) / 2) * this.height };
    }
    this.fitCamera(r.w / r.h);
    const p = well.cellPos(c[0], c[1], this.game.dim >= 3 ? c[2] : 0).clone().project(this.camera);
    return { x: r.x + ((p.x + 1) / 2) * r.w, y: r.y + ((1 - p.y) / 2) * r.h };
  }

  // ---- per frame ----
  update(dt) {
    this.time += dt;
    this.env.update(dt);
    const k = 1 - Math.exp(-dt * 10);
    // Shortest way around for yaw.
    this.cam.yaw += (this.cam.yawTarget - this.cam.yaw) * k;
    this.cam.pitch += (this.cam.pitchTarget - this.cam.pitch) * k;
    this.pieceOffset.multiplyScalar(Math.exp(-dt * 28));
    this.piecePulse *= Math.exp(-dt * 12);
    this.shake = Math.max(0, this.shake - dt * 4);
    const g = this.game;
    if (!g) return;
    const live = g.piece && g.state === 'play';
    const cells = live ? g.absCells() : [];
    const ghost = live ? g.ghostCells() : [];
    const color = g.piece?.color ?? 0;
    const activeWells = new Set(cells.map((c) => this.wellIndexOf(c)));
    this.wells.forEach((w, i) => {
      w.setActive(this.wells.length > 1 && activeWells.has(i));
      w.update(dt);
      w.setPiece(cells, ghost, color, this.pieceOffset, this.piecePulse);
    });
  }

  render() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    r.clear();
    r.render(this.env.scene, this.env.camera);
    if (!this.game) return this.clearPreviews();
    r.setScissorTest(true);
    const H = this.height;
    // Everything in the well scene uses the backdrop's lights palette.
    const pal = this.env.palette;
    if (pal) {
      this.hemi.color.copy(pal.hemiSky).lerp(new THREE.Color('#ffffff'), 0.4);
      this.hemi.groundColor.copy(pal.hemiGround);
      this.key.color.copy(pal.light);
    }
    if (this.batched) {
      this.renderBatched();
      this.renderPreviews();
      return;
    }
    const first = this.rects[0];
    if (first) this.fitCamera(first.w / first.h);
    const g = this.game;
    const ghost = g.dim >= 3 && g.piece && g.state === 'play' ? g.ghostCells() : [];
    this.wells.forEach((w, i) => {
      const rc = this.rects[i];
      if (!rc || rc.w < 2 || rc.h < 2) return;
      if (g.dim >= 3) {
        w.updateOccluders(this.camera.position, ghost);
        if (w.dirty) w.rebuildBlocks(0);
      }
      w.particles.setScale((rc.h * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      w.group.visible = true;
      r.setViewport(rc.x, H - rc.y - rc.h, rc.w, rc.h);
      r.setScissor(rc.x, H - rc.y - rc.h, rc.w, rc.h);
      r.clearDepth();
      r.render(this.scene, this.camera);
      w.group.visible = false;
    });
    this.renderPreviews();
    r.setScissorTest(false);
  }

  // Many wells (5D): one orthographic pass, each well moved so it lands in its own cell.
  // In an orthographic view a shift in the camera plane is just a shift on screen.
  placeBatched() {
    const { yaw, pitch } = this.cam;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new THREE.Vector3().crossVectors(dir, right).normalize();
    const b = this.wells[0].bounds();
    const bc = b.getCenter(new THREE.Vector3());
    let ex = 0, ey = 0;
    for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
      const rel = new THREE.Vector3(cx, cy, cz).sub(bc);
      ex = Math.max(ex, Math.abs(rel.dot(right)));
      ey = Math.max(ey, Math.abs(rel.dot(up)));
    }
    const rc = this.rects[0];
    const k = (Math.max((2 * ex) / rc.w, (2 * ey) / rc.h) * 1.04) / Math.min(1, this.cam.zoom); // world units per pixel
    const W = this.width, H = this.height;
    const cam = this.orthoCam ?? (this.orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000));
    cam.left = (-W / 2) * k;
    cam.right = (W / 2) * k;
    cam.top = (H / 2) * k;
    cam.bottom = (-H / 2) * k;
    cam.position.copy(dir).multiplyScalar(500);
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    if (this.shake > 0) cam.position.addScaledVector(right, (Math.random() - 0.5) * this.shake * 0.1);
    this.wells.forEach((w, i) => {
      const r = this.rects[i];
      const sx = (r.x + r.w / 2 - W / 2) * k, sy = (H / 2 - (r.y + r.h / 2)) * k;
      w.group.position.copy(right).multiplyScalar(sx).addScaledVector(up, sy).sub(bc);
      w.particles.setScale(1 / k, true);
    });
    return cam;
  }

  renderBatched() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    r.clearDepth();
    const cam = this.placeBatched();
    for (const w of this.wells) w.group.visible = true;
    r.render(this.scene, cam);
    for (const w of this.wells) w.group.visible = false;
  }

  clearPreviews() {
    if (this.previewsClear) return;
    this.overlay.setScissorTest(false);
    this.overlay.clear();
    this.previewsClear = true;
  }

  renderPreviews() {
    this.previewsClear = false;
    const r = this.overlay;
    const H = this.height;
    const dim = this.game.dim;
    r.setScissorTest(false);
    r.setViewport(0, 0, this.width, this.height);
    r.clear();
    r.setScissorTest(true);
    const canvasRect = this.overlayCanvas.getBoundingClientRect();
    for (const slot of this.previewSlots) {
      if (!slot.piece) continue;
      const er = slot.el.getBoundingClientRect();
      const x = er.left - canvasRect.left, y = er.top - canvasRect.top;
      if (er.width < 4 || er.height < 4) continue;
      const box = this.buildPreview(slot.piece);
      const aspect = er.width / er.height;
      const cam = this.previewCam;
      // Look at the piece from the same direction as the main camera (front-on in 2D).
      const yaw = dim === 2 ? 0 : this.cam.yaw, pitch = dim === 2 ? 0.1 : 0.7;
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const c = box.getCenter(new THREE.Vector3());
      cam.position.copy(c).addScaledVector(dir, 30);
      cam.up.set(0, 1, 0);
      cam.lookAt(c);
      cam.updateMatrixWorld();
      // Fit the box in view space.
      const inv = cam.matrixWorldInverse;
      let mx = 0, my = 0;
      for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
        const p = new THREE.Vector3(cx, cy, cz).applyMatrix4(inv);
        const cc = c.clone().applyMatrix4(inv);
        mx = Math.max(mx, Math.abs(p.x - cc.x));
        my = Math.max(my, Math.abs(p.y - cc.y));
      }
      let hh = Math.max(my, mx / aspect, 1.2) * 1.25;
      cam.top = hh; cam.bottom = -hh; cam.left = -hh * aspect; cam.right = hh * aspect;
      cam.updateProjectionMatrix();
      r.setViewport(x, H - y - er.height, er.width, er.height);
      r.setScissor(x, H - y - er.height, er.width, er.height);
      r.clearDepth();
      r.render(this.previewScene, cam);
    }
    r.setScissorTest(false);
  }

  // Lays the preview piece out in 3D; cells in other wells are shifted sideways with a gap.
  buildPreview(piece) {
    const m = this.previewMesh;
    const box = new THREE.Box3();
    const tmp = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const dim = this.game.dim;
    const ws = piece.cells.map((c) => c[3] ?? 0), vs = piece.cells.map((c) => c[4] ?? 0);
    const w0 = Math.min(...ws), v0 = Math.min(...vs);
    const spread = piece.n + 0.8;
    piece.cells.forEach((c, i) => {
      p.set(c[0] + ((c[3] ?? 0) - w0) * spread, c[1], (dim >= 3 ? c[2] : 0) + ((c[4] ?? 0) - v0) * spread);
      tmp.makeTranslation(p.x, p.y, p.z);
      m.setMatrixAt(i, tmp);
      m.setColorAt(i, PALETTE[piece.color]);
      box.expandByPoint(p.clone().addScalar(0.5));
      box.expandByPoint(p.clone().addScalar(-0.5));
    });
    m.count = piece.cells.length;
    m.instanceMatrix.needsUpdate = true;
    m.instanceColor.needsUpdate = true;
    return box;
  }
}
