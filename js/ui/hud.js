// The in-game HUD: stats, hold/next slots, the key legend, well frames and score popups.
import { presetLabel, MODE_NAMES } from './text.js';

const $ = (id) => document.getElementById(id);

const LEGEND = {
  2: [
    ['← →', 'ruch'], ['↑ X', 'obrót'], ['Z', 'obrót w lewo'], ['↓', 'w dół'], ['Spacja', 'zrzut'], ['C', 'schowek'], ['Esc', 'pauza'],
  ],
  3: [
    ['← ↑ ↓ →', 'ruch'], ['Q E', 'obrót'], ['W S', 'przechył przód/tył'], ['A D', 'przechył na boki'],
    ['Spacja', 'zrzut'], ['F', 'w dół'], ['C', 'schowek'], ['Z X', 'kamera'], ['V', 'z góry'], ['Esc', 'pauza'],
  ],
};
LEGEND[4] = [
  ...LEGEND[3].slice(0, 4),
  ['⇧ + ← →', 'do sąsiedniej studni'], ['⇧ + A D', 'przechył w studnie'], ['⇧ + Q E · ⇧ + W S', 'obrót w 4. wymiar'],
  ...LEGEND[3].slice(4),
];
LEGEND[5] = [
  ...LEGEND[3].slice(0, 4),
  ['⇧ + ← → ↑ ↓', 'do sąsiedniej studni'], ['⇧ + A D', 'przechył w studnie obok'], ['⇧ + W S', 'w studnie wyżej/niżej'], ['⇧ + Q E', 'obrót w 4. wymiar'],
  ...LEGEND[3].slice(4),
];

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(app) {
    this.app = app;
    this.el = $('hud');
    this.popups = $('popups');
    this.frames = $('frames');
    this.last = {};
    $('btnPause').addEventListener('click', () => app.pause());
  }

  show(game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.el.hidden = false;
    this.last = {};
    const dim = game.dim;
    $('sLinesLabel').textContent = dim === 2 ? 'Linie' : 'Warstwy';
    $('sTimeLabel').textContent = cfg.gameMode === 'timed' ? 'Zostało' : 'Czas';
    document.querySelector('.k-hold').textContent = 'C';
    $('modeTag').innerHTML = `<b>${MODE_NAMES[cfg.modeId]}</b><br>${presetLabel(cfg.modeId, cfg.presetId)}<br>${
      cfg.gameMode === 'timed' ? 'Na czas · 3 minuty' : 'Maraton'
    }${dim >= 4 && cfg.clearRule === 'all' ? '<br>Hardkor: cała hiperwarstwa' : ''}`;
    $('legend').innerHTML = LEGEND[dim].map(([k, t]) => `<span>${k.split(' ').map((x) => (x === '+' || x === '·' ? x : `<kbd>${x}</kbd>`)).join(' ')} ${t}</span>`).join('');
    // Preview slots.
    const next = $('nextSlots');
    next.innerHTML = '';
    this.nextEls = [];
    for (let i = 0; i < game.cfg.preview; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      next.appendChild(d);
      this.nextEls.push(d);
    }
    this.holdEl = $('holdSlot');
    this.buildFrames();
    this.layout();
    const intro = {
      3: 'Zapełnij całą warstwę podłogi',
      4: 'Studnie obok siebie to jedna przestrzeń 4D',
      5: 'Siatka studni to przestrzeń 5D. Powodzenia!',
    }[dim];
    if (intro) setTimeout(() => this.game === game && this.toast(intro, 'wide'), 400);
  }

  hide() {
    this.el.hidden = true;
    this.frames.innerHTML = '';
    this.popups.innerHTML = '';
    this.app.view.setPreviewSlots([]);
  }

  layout() {
    const r = $('board').getBoundingClientRect();
    this.app.view.setBoardRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    this.placeFrames();
  }

  buildFrames() {
    this.frames.innerHTML = '';
    this.frameEls = [];
    const v = this.app.view;
    if (v.wells.length <= 1) return;
    const g = this.game;
    v.wells.forEach((w) => {
      const d = document.createElement('div');
      d.className = 'wframe';
      const label = g.wellAxes.length === 1 ? `w ${w.wellCoords[0] + 1}` : `w ${w.wellCoords[0] + 1} · v ${w.wellCoords[1] + 1}`;
      d.innerHTML = `<span class="wl">${label}</span>`;
      this.frames.appendChild(d);
      this.frameEls.push(d);
    });
  }

  placeFrames() {
    const rects = this.app.view.rects;
    (this.frameEls ?? []).forEach((d, i) => {
      const r = rects[i];
      if (!r) return;
      Object.assign(d.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      d.classList.toggle('tiny', r.w < 130 || r.h < 100);
    });
  }

  update() {
    const g = this.game;
    if (!g) return;
    const set = (id, v) => {
      if (this.last[id] !== v) {
        this.last[id] = v;
        $(id).textContent = v;
      }
    };
    set('sScore', g.score.toLocaleString('pl-PL'));
    set('sLevel', String(g.level));
    set('sLines', String(g.lines));
    const left = g.cfg.timeLimit - g.time;
    set('sTime', fmtTime(this.cfg.gameMode === 'timed' ? Math.ceil(left) : g.time));
    const hurry = this.cfg.gameMode === 'timed' && left <= 10 && g.state === 'play';
    if (this.last.hurry !== hurry) {
      this.last.hurry = hurry;
      $('sTime').classList.toggle('hurry', hurry);
    }
    this.holdEl.classList.toggle('used', !g.canHold);
    const slots = [];
    if (g.holdType !== null) {
      const def = g.cfg.pieces[g.holdType];
      slots.push({ el: this.holdEl, piece: { cells: def.cells, n: def.n, color: def.color } });
    }
    g.queue.slice(0, g.cfg.preview).forEach((p, i) => slots.push({ el: this.nextEls[i], piece: p }));
    this.app.view.setPreviewSlots(slots);
    // Highlight the wells the piece is in.
    if (this.frameEls?.length) {
      const v = this.app.view;
      this.frameEls.forEach((d, i) => d.classList.toggle('on', v.wells[i].active));
    }
  }

  onEvents(events) {
    for (const e of events) {
      if (e.type === 'clear') this.clearPopup(e);
      if (e.type === 'levelUp') this.toast(`Poziom ${e.level}!`);
    }
  }

  clearPopup(e) {
    const dim = this.game.dim;
    const n = e.count;
    let big;
    let cls = '';
    if (e.tspin === 'tspin') {
      big = ['T-spin!', 'T-spin single!', 'T-spin double!', 'T-spin triple!'][Math.min(n, 3)];
      cls = 'lav';
    } else if (e.tspin === 'tspinMini') {
      big = 'Mini T-spin';
      cls = 'lav';
    } else if (dim === 2) {
      big = ['', 'Linia', 'Podwójna!', 'Potrójna!', 'TETRIS!'][Math.min(n, 4)];
      if (n >= 4) cls = 'gold';
    } else {
      big = n === 1 ? 'Warstwa!' : n === 2 ? 'Dwie warstwy!' : n === 3 ? 'Trzy warstwy!' : n >= 4 ? 'TESSERIS!' : '';
      if (n >= 4) cls = 'gold';
    }
    const extra = [];
    if (e.wells > 1) extra.push(`Hiper ×${e.wells}`);
    if (e.b2b) extra.push('Back-to-back');
    if (e.combo > 0) extra.push(`Combo ×${e.combo}`);
    if (e.perfect) {
      big = 'Perfekcyjnie czysto!';
      cls = 'mint';
    }
    // Place it over the middle of what was cleared.
    const src = e.removed?.length ? e.removed : e.cells.map((p) => ({ p }));
    const mid = src[Math.floor(src.length / 2)]?.p ?? e.cells[0];
    let pos = this.app.view.cellToScreen(mid);
    if (!pos) pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const d = document.createElement('div');
    d.className = 'pop ' + cls;
    d.innerHTML = `<span class="big">${big}</span><span class="small">${extra.join(' · ')}${extra.length ? ' · ' : ''}+${e.points.toLocaleString('pl-PL')}</span>`;
    d.style.left = Math.max(120, Math.min(window.innerWidth - 120, pos.x)) + 'px';
    d.style.top = Math.max(60, pos.y) + 'px';
    this.popups.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }

  toast(text, cls = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.textContent = text;
    this.popups.appendChild(d);
    setTimeout(() => d.remove(), 2100);
  }
}
