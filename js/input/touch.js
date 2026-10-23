// On-screen buttons for phones and tablets. They press the same actions as the keyboard;
// dragging on the board still turns the camera.
const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

const LAYOUT_2D = {
  left: [
    [['left', '←'], ['right', '→']],
    [['soft', '↓', 'wide']],
  ],
  right: [
    [['ccw', '⟲'], ['cw', '⟳']],
    [['hold', '<small>schowek</small>'], ['hard', '⤓', 'drop']],
  ],
};
const LAYOUT_ND = {
  left: [
    [null, ['up', '↑'], null],
    [['left', '←'], ['soft', '<small>w dół</small>'], ['right', '→']],
    [null, ['down', '↓'], null],
  ],
  right: [
    [['spinL', '⟲'], ['tipF', '⤒'], ['spinR', '⟳']],
    [['tipL', '⇐'], ['tipB', '⤓'], ['tipR', '⇒']],
    [['hold', '<small>schowek</small>'], ['camR', '<small>kamera</small>'], ['hard', '⬇', 'drop']],
  ],
};

export class TouchControls {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('touch');
    this.enabled = isTouch();
    document.body.classList.toggle('touch', this.enabled);
  }

  show(dim) {
    if (!this.enabled) return;
    const layout = dim === 2 ? LAYOUT_2D : LAYOUT_ND;
    const pad = (rows, extra = '') =>
      `<div class="tpad" style="grid-template-columns:repeat(${rows[0].length},auto)">${rows
        .flat()
        .map((b) => (b ? `<button class="tbtn ${b[2] ?? ''}" data-a="${b[0]}">${b[1]}</button>` : '<span></span>'))
        .join('')}${extra}</div>`;
    const hyper = dim >= 4 ? `<button class="tbtn hyper wide" data-hyper style="grid-column:1/-1">⇧ <small>między studniami</small></button>` : '';
    this.el.innerHTML = pad(layout.left, hyper) + pad(layout.right);
    this.el.hidden = false;
    this.bind();
    this.measure();
  }

  // The board leaves room for the buttons below it (portrait).
  measure() {
    const h = this.el.hidden ? 0 : this.el.getBoundingClientRect().height;
    document.getElementById('hud').style.setProperty('--touch-h', `${Math.round(h)}px`);
  }

  hide() {
    this.el.hidden = true;
    this.el.innerHTML = '';
    this.measure();
    this.app.controls.hyperLatch = false;
  }

  bind() {
    const c = this.app.controls;
    this.el.querySelectorAll('[data-a]').forEach((b) => {
      const id = 'touch-' + b.dataset.a;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('on');
        c.press(id, b.dataset.a, c.hyperLatch);
        navigator.vibrate?.(8);
      });
      const up = () => {
        b.classList.remove('on');
        c.release(id);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    });
    const h = this.el.querySelector('[data-hyper]');
    h?.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      c.hyperLatch = !c.hyperLatch;
      h.classList.toggle('on', c.hyperLatch);
    });
  }
}
