// The game rules, for any number of dimensions. No rendering here: the view reads the grid,
// the active piece and the event queue. Axes: 0 = x, 1 = y (up), 2 = z, 3 = w, 4 = v.
// The board is a set of wells: x (and z from 3D on) are the inside of a well, w and v pick the well.
import { createRng } from './rng.js';
import { rotateCells } from './pieces.js';

export const AX = 0, AY = 1, AZ = 2, AW = 3, AV = 4;

// SRS wall kicks (y up), indexed by `${from}${to}` with states 0, 1 = R, 2, 3 = L.
const KICKS_JLSTZ = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

const LINE_SCORE = (n) => (n <= 0 ? 0 : [100, 300, 500, 800][n - 1] ?? 800 + (n - 4) * 400);
const TSPIN_SCORE = [400, 800, 1200, 1600];
const TSPIN_MINI_SCORE = [100, 200, 400];
const PERFECT_SCORE = [0, 800, 1200, 1800, 2000];

export function gravityInterval(level, dim, scale = 1) {
  const L = Math.max(1, level);
  if (dim === 2) return Math.max(0.0167, Math.pow(0.8 - (L - 1) * 0.007, L - 1)) * scale;
  const base = { 3: 1.2, 4: 1.5, 5: 1.8 }[dim] ?? 1.5;
  return Math.max(0.06, base * Math.pow(0.86, L - 1)) * scale;
}

export class Game {
  /**
   * cfg: dim, size (length dim: [x, y, z, w, v], y = rows incl. the hidden buffer), height (playable rows),
   * pieces (from pieceSet), clearRule ('well' | 'all'), preview, mode ('marathon' | 'timed'), timeLimit (s),
   * startLevel, linesPerLevel, seed, hyperSpawn (chance a piece spawns already turned into w/v).
   */
  constructor(cfg) {
    this.cfg = {
      clearRule: 'well', preview: 5, mode: 'marathon', timeLimit: 180, startLevel: 1,
      linesPerLevel: cfg.dim === 2 ? 10 : 5, lockDelay: cfg.dim === 2 ? 0.5 : 0.8, lockResets: 15,
      gravityScale: 1, hyperSpawn: 0, ...cfg,
    };
    const { dim, size } = this.cfg;
    if (size.length !== dim) throw new Error('size must have one entry per dimension');
    this.dim = dim;
    this.size = size.slice();
    this.height = this.cfg.height;
    this.strides = [];
    let total = 1;
    for (let i = 0; i < dim; i++) {
      this.strides.push(total);
      total *= size[i];
    }
    this.total = total;
    this.grid = new Uint8Array(total);
    this.horizontal = [...Array(dim).keys()].filter((a) => a !== AY);
    this.inWellAxes = dim === 2 ? [AX] : [AX, AZ];
    this.wellAxes = this.horizontal.filter((a) => !this.inWellAxes.includes(a));
    this.clearAxes = this.cfg.clearRule === 'all' ? this.horizontal : this.inWellAxes;
    this.groupAxes = this.horizontal.filter((a) => !this.clearAxes.includes(a));
    this.wellCount = this.wellAxes.reduce((n, a) => n * size[a], 1);

    this.rng = createRng(this.cfg.seed);
    this.bag = [];
    this.queue = [];
    this.events = [];
    this.piece = null;
    this.holdType = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.pieces = 0;
    this.level = this.cfg.startLevel;
    this.combo = -1;
    this.b2b = false;
    this.time = 0;
    this.state = 'play'; // 'play' | 'over'
    this.overReason = null;
    this.spawnDelay = 0;
    this.gravityTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.softDropping = false;
    this.lastMoveRotate = false;
    this.lastKick = 0;
    this.lowestY = Infinity;
    // Where the last piece went along w/v: new pieces spawn above the same well.
    this.stickyWell = this.wellAxes.map((a) => Math.floor((size[a] - 1) / 2));
    this.stats = { tetrises: 0, tspins: 0, maxCombo: 0, perfect: 0, hyper: 0 };
  }

  // ---- grid helpers ----
  index(p) {
    let i = 0;
    for (let a = 0; a < this.dim; a++) i += p[a] * this.strides[a];
    return i;
  }
  coords(i) {
    const p = new Array(this.dim);
    for (let a = 0; a < this.dim; a++) {
      p[a] = i % this.size[a];
      i = Math.floor(i / this.size[a]);
    }
    return p;
  }
  inBounds(p) {
    for (let a = 0; a < this.dim; a++) if (p[a] < 0 || p[a] >= this.size[a]) return false;
    return true;
  }
  cellAt(p) {
    return this.inBounds(p) ? this.grid[this.index(p)] : -1;
  }

  // ---- piece helpers ----
  absCells(piece = this.piece, pos = piece?.pos) {
    if (!piece) return [];
    return piece.cells.map((c) => c.map((v, a) => v + pos[a]));
  }
  fits(cells, pos) {
    for (const c of cells) {
      const p = c.map((v, a) => v + pos[a]);
      for (let a = 0; a < this.dim; a++) {
        if (p[a] < 0 || p[a] >= this.size[a]) return false;
      }
      if (this.grid[this.index(p)]) return false;
    }
    return true;
  }
  ghostPos() {
    if (!this.piece) return null;
    const pos = this.piece.pos.slice();
    while (true) {
      pos[AY]--;
      if (!this.fits(this.piece.cells, pos)) {
        pos[AY]++;
        return pos;
      }
    }
  }
  ghostCells() {
    const pos = this.ghostPos();
    return pos ? this.absCells(this.piece, pos) : [];
  }

  // ---- randomizer ----
  refillBag() {
    const ids = this.cfg.pieces.map((_, i) => i);
    this.bag.push(...this.rng.shuffle(ids));
  }
  fillQueue() {
    while (this.queue.length < Math.max(1, this.cfg.preview) + 1) {
      if (!this.bag.length) this.refillBag();
      this.queue.push(this.makePiece(this.bag.shift()));
    }
  }
  makePiece(type) {
    const def = this.cfg.pieces[type];
    let cells = def.cells.map((c) => c.slice());
    // In 4D/5D some pieces arrive already stretched across neighbouring wells.
    if (this.wellAxes.length && this.cfg.hyperSpawn && this.rng.next() < this.cfg.hyperSpawn) {
      const wa = this.wellAxes[this.rng.int(this.wellAxes.length)];
      const from = this.inWellAxes[this.rng.int(this.inWellAxes.length)];
      const spread = new Set(cells.map((c) => c[from])).size;
      if (spread > 1 && spread <= this.size[wa]) cells = rotateCells(cells, def.n, from, wa, 1);
    }
    // A piece longer than a narrow well (I in a 3-wide well) arrives standing up.
    for (const a of this.horizontal) {
      if (new Set(cells.map((c) => c[a])).size > this.size[a]) cells = rotateCells(cells, def.n, a, AY, 1);
    }
    return { type, def, n: def.n, color: def.color, cells, rot: 0, pos: null };
  }

  start() {
    this.fillQueue();
    this.spawn();
  }

  spawn(piece = null) {
    if (!piece) {
      piece = this.queue.shift();
      this.fillQueue();
    }
    const pos = new Array(this.dim).fill(0);
    for (const a of this.horizontal) {
      let lo = Infinity, hi = -Infinity;
      for (const c of piece.cells) {
        lo = Math.min(lo, c[a]);
        hi = Math.max(hi, c[a]);
      }
      let want;
      const wi = this.wellAxes.indexOf(a);
      if (wi >= 0) want = this.stickyWell[wi] - Math.floor((lo + hi) / 2);
      else want = Math.floor((this.size[a] - piece.n) / 2);
      pos[a] = Math.max(-lo, Math.min(this.size[a] - 1 - hi, want));
    }
    const minY = Math.min(...piece.cells.map((c) => c[AY]));
    pos[AY] = this.height - minY;
    piece.pos = pos;
    if (!this.fits(piece.cells, pos)) {
      pos[AY]++;
      if (!this.fits(piece.cells, pos)) {
        this.piece = piece;
        return this.gameOver('blockout');
      }
    }
    this.piece = piece;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.gravityTimer = 0;
    this.lastMoveRotate = false;
    this.lowestY = pos[AY];
    // Guideline: the piece drops one row right away if it can.
    this.tryShift(AY, -1);
    this.lowestY = this.piece.pos[AY];
    this.events.push({ type: 'spawn', piece: this.piece });
  }

  gameOver(reason) {
    this.state = 'over';
    this.overReason = reason;
    this.events.push({ type: reason === 'time' ? 'timeUp' : 'gameOver', reason });
  }

  tryShift(axis, dir) {
    const pos = this.piece.pos.slice();
    pos[axis] += dir;
    if (!this.fits(this.piece.cells, pos)) return false;
    this.piece.pos = pos;
    return true;
  }

  onGround() {
    const pos = this.piece.pos.slice();
    pos[AY]--;
    return !this.fits(this.piece.cells, pos);
  }

  // Successful move or rotation on the ground buys more time, up to a limit.
  touchLockDelay() {
    if (this.lockResets < this.cfg.lockResets && this.onGround()) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  // ---- player actions ----
  move(axis, dir) {
    if (this.state !== 'play' || !this.piece || axis === AY) return false;
    if (!this.tryShift(axis, dir)) {
      this.events.push({ type: 'bump', axis, dir });
      return false;
    }
    this.lastMoveRotate = false;
    this.touchLockDelay();
    this.events.push({ type: 'move', axis, dir });
    return true;
  }

  rotate(a, b, dir) {
    if (this.state !== 'play' || !this.piece) return false;
    const p = this.piece;
    if (a >= this.dim || b >= this.dim) return false;
    const cells = rotateCells(p.cells, p.n, a, b, dir);
    let kicks;
    let newRot = p.rot;
    if (this.dim === 2) {
      // SRS: dir -1 in the x–y plane is clockwise.
      const cw = (a === AX && b === AY) === dir < 0;
      newRot = (p.rot + (cw ? 1 : 3)) % 4;
      const table = p.def.id === 'I' ? KICKS_I : KICKS_JLSTZ;
      kicks = p.def.id === 'O' ? [[0, 0]] : table[`${p.rot}${newRot}`];
    } else {
      kicks = this.kicksFor(a, b);
    }
    for (let k = 0; k < kicks.length; k++) {
      const pos = p.pos.slice();
      for (let i = 0; i < this.dim; i++) pos[i] += kicks[k][i] ?? 0;
      if (this.fits(cells, pos)) {
        p.cells = cells;
        p.pos = pos;
        p.rot = newRot;
        this.lastMoveRotate = true;
        this.lastKick = k;
        this.touchLockDelay();
        this.events.push({ type: 'rotate', a, b, dir, kick: k });
        return true;
      }
    }
    this.events.push({ type: 'rotateFail' });
    return false;
  }

  kicksFor(a, b) {
    const zero = () => new Array(this.dim).fill(0);
    const unit = (ax, d) => {
      const v = zero();
      v[ax] = d;
      return v;
    };
    const add = (u, v) => u.map((x, i) => x + v[i]);
    const hor = [a, b].filter((ax) => ax !== AY);
    const list = [zero()];
    for (const ax of hor) for (const d of [1, -1]) list.push(unit(ax, d));
    list.push(unit(AY, 1));
    for (const ax of hor) for (const d of [1, -1]) list.push(add(unit(ax, d), unit(AY, 1)));
    for (const ax of hor) for (const d of [2, -2]) list.push(unit(ax, d));
    if (hor.length === 2) {
      for (const d1 of [1, -1]) for (const d2 of [1, -1]) list.push(add(unit(hor[0], d1), unit(hor[1], d2)));
    }
    list.push(unit(AY, 2));
    return list;
  }

  softDrop(on) {
    this.softDropping = on;
  }

  hardDrop() {
    if (this.state !== 'play' || !this.piece) return;
    const from = this.piece.pos[AY];
    const pos = this.ghostPos();
    const dist = from - pos[AY];
    this.piece.pos = pos;
    if (dist > 0) this.lastMoveRotate = false;
    this.score += dist * 2;
    this.events.push({ type: 'hardDrop', distance: dist, cells: this.absCells() });
    this.lock();
  }

  hold() {
    if (this.state !== 'play' || !this.piece || !this.canHold) return false;
    const cur = this.piece.type;
    const next = this.holdType;
    this.holdType = cur;
    this.canHold = false;
    this.events.push({ type: 'hold' });
    if (next === null) this.spawn();
    else this.spawn(this.makePiece(next));
    return true;
  }

  // ---- time ----
  update(dt) {
    if (this.state !== 'play') return;
    this.time += dt;
    if (this.cfg.mode === 'timed' && this.time >= this.cfg.timeLimit) {
      this.time = this.cfg.timeLimit;
      return this.gameOver('time');
    }
    if (!this.piece) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) this.spawn();
      return;
    }
    const g = gravityInterval(this.level, this.dim, this.cfg.gravityScale);
    const interval = this.softDropping ? Math.min(g, this.dim === 2 ? 0.033 : 0.05) : g;
    if (this.onGround()) {
      this.gravityTimer = 0;
      this.lockTimer += dt;
      if (this.lockTimer >= this.cfg.lockDelay) this.lock();
      return;
    }
    this.lockTimer = 0;
    this.gravityTimer += dt;
    while (this.gravityTimer >= interval && this.piece) {
      this.gravityTimer -= interval;
      if (!this.tryShift(AY, -1)) break;
      this.lastMoveRotate = false;
      if (this.softDropping) this.score += 1;
      if (this.piece.pos[AY] < this.lowestY) {
        // Reaching a new low row gives the full set of lock resets back.
        this.lowestY = this.piece.pos[AY];
        this.lockResets = 0;
      }
      this.events.push({ type: 'fall', soft: this.softDropping });
      if (this.onGround()) {
        this.gravityTimer = 0;
        break;
      }
    }
  }

  // ---- locking and clearing ----
  tspinKind() {
    const p = this.piece;
    if (this.dim !== 2 || p.def.id !== 'T' || !this.lastMoveRotate) return null;
    const [px, py] = p.pos;
    const corner = (dx, dy) => this.cellAt([px + dx, py + dy]) !== 0;
    const corners = { tl: corner(0, 2), tr: corner(2, 2), bl: corner(0, 0), br: corner(2, 0) };
    const count = Object.values(corners).filter(Boolean).length;
    if (count < 3) return null;
    const front = [
      [corners.tl, corners.tr],
      [corners.tr, corners.br],
      [corners.bl, corners.br],
      [corners.tl, corners.bl],
    ][p.rot];
    if (front[0] && front[1]) return 'full';
    return this.lastKick === 4 ? 'full' : 'mini';
  }

  lock() {
    const p = this.piece;
    const cells = this.absCells();
    const tspin = this.tspinKind();
    for (const c of cells) {
      if (this.inBounds(c)) this.grid[this.index(c)] = p.color + 1;
    }
    this.piece = null;
    this.pieces++;
    this.canHold = true;
    this.events.push({ type: 'lock', cells, color: p.color });
    // Remember the well the piece went into.
    this.wellAxes.forEach((a, i) => {
      const vals = cells.map((c) => c[a]);
      this.stickyWell[i] = Math.round((Math.min(...vals) + Math.max(...vals)) / 2);
    });

    if (cells.every((c) => c[AY] >= this.height)) return this.gameOver('lockout');

    const cleared = this.clearFull(cells);
    const n = cleared.groups.length;
    const level = this.level;
    let points = 0;
    let label = null;
    const difficult = n >= 4 || (tspin && n > 0);
    if (tspin === 'full') {
      points = TSPIN_SCORE[Math.min(n, 3)] * level;
      label = 'tspin';
      this.stats.tspins++;
    } else if (tspin === 'mini') {
      points = TSPIN_MINI_SCORE[Math.min(n, 2)] * level;
      label = 'tspinMini';
    } else if (n > 0) {
      points = LINE_SCORE(n) * level;
    }
    const wells = cleared.wells;
    if (wells > 1) {
      points = Math.round(points * (1 + 0.5 * (wells - 1)));
      this.stats.hyper++;
    }
    const b2b = n > 0 && difficult && this.b2b;
    if (b2b) points = Math.round(points * 1.5);
    if (n > 0) {
      this.b2b = difficult;
      this.combo++;
      if (this.combo > 0) points += 50 * this.combo * level;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (n >= 4) this.stats.tetrises++;
    } else {
      this.combo = -1;
    }
    const perfect = n > 0 && this.grid.every((v) => v === 0);
    if (perfect) {
      points += PERFECT_SCORE[Math.min(n, 4)] * level;
      this.stats.perfect++;
    }
    this.score += points;
    this.lines += n;
    const newLevel = this.cfg.startLevel + Math.floor(this.lines / this.cfg.linesPerLevel);
    if (n > 0 || tspin) {
      this.events.push({
        type: 'clear', groups: cleared.groups, drop: cleared.drop, removed: cleared.removed, count: n, wells, tspin: label,
        combo: this.combo, b2b, perfect, points, cells,
      });
    }
    if (newLevel > this.level) {
      this.level = newLevel;
      this.events.push({ type: 'levelUp', level: newLevel });
    }
    this.spawnDelay = n > 0 ? 0.42 : 0.06;
  }

  // Iterate every combination of coordinates over the given axes (others taken from base).
  forEachIn(axes, base, fn) {
    const p = base.slice();
    const rec = (k) => {
      if (k === axes.length) return fn(p);
      const a = axes[k];
      for (let v = 0; v < this.size[a]; v++) {
        p[a] = v;
        if (rec(k + 1) === false) return false;
      }
    };
    rec(0);
  }

  isFull(y, group) {
    const base = new Array(this.dim).fill(0);
    base[AY] = y;
    this.groupAxes.forEach((a, i) => (base[a] = group[i]));
    let full = true;
    this.forEachIn(this.clearAxes, base, (p) => {
      if (!this.grid[this.index(p)]) return (full = false);
    });
    return full;
  }

  // Finds full layers touched by the locked cells, removes them and drops what was above,
  // separately inside each group (each well under the 'well' rule).
  clearFull(cells) {
    const candidates = new Map();
    for (const c of cells) {
      if (c[AY] >= this.size[AY]) continue;
      const group = this.groupAxes.map((a) => c[a]);
      const key = group.join(',');
      if (!candidates.has(key)) candidates.set(key, { group, ys: new Set() });
      candidates.get(key).ys.add(c[AY]);
    }
    const groups = [];
    const byGroup = new Map();
    for (const [key, { group, ys }] of candidates) {
      for (const y of ys) {
        if (this.isFull(y, group)) {
          groups.push({ y, group });
          if (!byGroup.has(key)) byGroup.set(key, { group, ys: [] });
          byGroup.get(key).ys.push(y);
        }
      }
    }
    let drop = null;
    const removed = [];
    if (groups.length) {
      for (const { y, group } of groups) {
        const base = new Array(this.dim).fill(0);
        base[AY] = y;
        this.groupAxes.forEach((a, i) => (base[a] = group[i]));
        this.forEachIn(this.clearAxes, base, (p) => {
          removed.push({ p: p.slice(), color: this.grid[this.index(p)] - 1 });
        });
      }
      drop = new Int8Array(this.total);
      const H = this.size[AY];
      for (const { group, ys } of byGroup.values()) {
        const gone = new Set(ys);
        const base = new Array(this.dim).fill(0);
        this.groupAxes.forEach((a, i) => (base[a] = group[i]));
        this.forEachIn(this.clearAxes, base, (p) => {
          const col = p.slice();
          let to = 0;
          for (let y = 0; y < H; y++) {
            col[AY] = y;
            const v = this.grid[this.index(col)];
            if (gone.has(y)) continue;
            if (to !== y) {
              col[AY] = to;
              const ti = this.index(col);
              this.grid[ti] = v;
              drop[ti] = y - to;
            }
            to++;
          }
          for (; to < H; to++) {
            col[AY] = to;
            this.grid[this.index(col)] = 0;
          }
        });
      }
    }
    const wellKeys = new Set(
      groups.map((g) => this.wellAxes.map((a) => (this.groupAxes.includes(a) ? g.group[this.groupAxes.indexOf(a)] : '*')).join(',')),
    );
    return { groups, drop, removed, wells: this.wellAxes.length ? wellKeys.size : groups.length ? 1 : 0 };
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }
}
