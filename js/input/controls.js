// Keyboard and mouse. Keys become actions; actions become moves on the game, turned to
// match the camera (in 3D "←" always moves the piece to the left of the screen).
import { AX, AY, AW, AV } from '../core/game.js';

const KEYS_2D = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'cw',
  KeyA: 'left', KeyD: 'right', KeyS: 'soft', KeyW: 'cw',
  KeyX: 'cw', KeyE: 'cw', KeyZ: 'ccw', KeyQ: 'ccw',
  Space: 'hard', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  Escape: 'pause', KeyP: 'pause',
};
const KEYS_ND = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Space: 'hard', KeyF: 'soft',
  KeyQ: 'spinL', KeyE: 'spinR', KeyW: 'tipF', KeyS: 'tipB', KeyA: 'tipL', KeyD: 'tipR',
  KeyC: 'hold', KeyZ: 'camL', KeyX: 'camR', KeyV: 'camTop',
  Escape: 'pause', KeyP: 'pause',
};
const REPEAT = new Set(['left', 'right', 'up', 'down']);

export class Controls {
  constructor(app) {
    this.app = app;
    this.held = new Map(); // code -> { action, hyper, t, fired }
    this.lastMove = null;
    this.hyperLatch = false; // the on-screen "hyper" toggle
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.releaseAll());
    this.attachPointer(app.view.canvas);
  }

  get dim() {
    return this.app.game?.dim ?? 2;
  }

  keymap() {
    return this.dim === 2 ? KEYS_2D : KEYS_ND;
  }

  onKeyDown(e) {
    if (!this.app.isPlaying()) {
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.app.isPaused()) {
        e.preventDefault();
        this.app.resume();
      }
      return;
    }
    const action = this.keymap()[e.code];
    if (!action) return;
    e.preventDefault();
    if (e.repeat) return;
    const hyper = e.shiftKey || this.hyperLatch;
    this.press(e.code, action, hyper);
  }

  onKeyUp(e) {
    const h = this.held.get(e.code);
    if (!h) return;
    this.release(e.code);
  }

  // Shared by keyboard and touch buttons.
  press(id, action, hyper = this.hyperLatch) {
    if (action === 'soft') {
      this.held.set(id, { action, hyper });
      this.app.game?.softDrop(true);
      return;
    }
    if (REPEAT.has(action)) {
      this.held.set(id, { action, hyper, t: 0, fired: 0 });
      this.lastMove = id;
    }
    this.perform(action, hyper);
  }

  release(id) {
    const h = this.held.get(id);
    this.held.delete(id);
    if (h?.action === 'soft' && ![...this.held.values()].some((x) => x.action === 'soft')) this.app.game?.softDrop(false);
    if (this.lastMove === id) this.lastMove = [...this.held.keys()].reverse().find((k) => REPEAT.has(this.held.get(k).action)) ?? null;
  }

  releaseAll() {
    for (const id of [...this.held.keys()]) this.release(id);
  }

  update(dt) {
    if (!this.lastMove) return;
    const h = this.held.get(this.lastMove);
    if (!h) return;
    const das = this.dim === 2 ? 0.16 : 0.2;
    const arr = this.dim === 2 ? 0.04 : 0.09;
    h.t += dt;
    while (h.t >= das + h.fired * arr) {
      if (!this.perform(h.action, h.hyper, true)) {
        // Blocked: keep trying every frame, without saving up a burst of moves for later.
        h.fired = Math.max(h.fired, Math.floor((h.t - das) / arr));
        break;
      }
      h.fired++;
    }
  }

  perform(action, hyper, repeat = false) {
    const app = this.app;
    const g = app.game;
    if (!g || !app.isPlaying()) return false;
    const view = app.view;
    const dim = g.dim;
    const hyp = hyper && dim >= 4;
    const { right: R, fwd: F } = view.screenAxes();
    switch (action) {
      case 'left':
        return hyp ? g.move(AW, -1, repeat) : g.move(R.axis, -R.sign, repeat);
      case 'right':
        return hyp ? g.move(AW, 1, repeat) : g.move(R.axis, R.sign, repeat);
      case 'up':
        if (dim === 2) return g.rotate(AX, AY, -1);
        if (hyp) return dim === 5 ? g.move(AV, -1, repeat) : false;
        return g.move(F.axis, F.sign, repeat);
      case 'down':
        if (dim === 2) return false;
        if (hyp) return dim === 5 ? g.move(AV, 1, repeat) : false;
        return g.move(F.axis, -F.sign, repeat);
      case 'cw':
        return g.rotate(AX, AY, -1);
      case 'ccw':
        return g.rotate(AX, AY, 1);
      case 'spinR':
        return hyp ? g.rotate(R.axis, AW, R.sign) : g.rotate(F.axis, R.axis, F.sign * R.sign);
      case 'spinL':
        return hyp ? g.rotate(R.axis, AW, -R.sign) : g.rotate(F.axis, R.axis, -F.sign * R.sign);
      case 'tipF':
        if (hyp) return dim === 5 ? g.rotate(F.axis, AV, -F.sign) : g.rotate(F.axis, AW, F.sign);
        return g.rotate(AY, F.axis, F.sign);
      case 'tipB':
        if (hyp) return dim === 5 ? g.rotate(F.axis, AV, F.sign) : g.rotate(F.axis, AW, -F.sign);
        return g.rotate(AY, F.axis, -F.sign);
      case 'tipR':
        return hyp ? g.rotate(AY, AW, 1) : g.rotate(AY, R.axis, R.sign);
      case 'tipL':
        return hyp ? g.rotate(AY, AW, -1) : g.rotate(AY, R.axis, -R.sign);
      case 'hard':
        g.hardDrop();
        return true;
      case 'hold':
        return g.hold();
      case 'camL':
        view.turn(-1);
        return true;
      case 'camR':
        view.turn(1);
        return true;
      case 'camTop':
        view.toggleTop();
        return true;
      case 'pause':
        app.pause();
        return true;
    }
    return false;
  }

  attachPointer(canvas) {
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.app.isPlaying() || e.button !== 0) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      this.app.view.orbit(dx, dy);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      this.app.view.orbitEnd();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.app.isPlaying()) return;
        e.preventDefault();
        this.app.view.zoomBy(Math.exp(-e.deltaY * 0.0012));
      },
      { passive: false },
    );
  }
}
