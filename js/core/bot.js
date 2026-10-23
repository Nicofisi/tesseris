// A simple greedy player for the title-screen demo (and for tests): tries every orientation and
// position of the current piece and picks the landing that leaves the tidiest stack.
import { rotateCells } from './pieces.js';
import { AY } from './game.js';

function normKey(cells) {
  const dim = cells[0].length;
  const min = new Array(dim).fill(Infinity);
  for (const c of cells) for (let a = 0; a < dim; a++) min[a] = Math.min(min[a], c[a]);
  return cells.map((c) => c.map((v, a) => v - min[a]).join(',')).sort().join(' ');
}

const orientCache = new Map();
export function orientations(def, dim, planes = null) {
  const key = def.id + '/' + dim;
  if (orientCache.has(key)) return orientCache.get(key);
  const seen = new Map();
  const queue = [def.cells];
  seen.set(normKey(def.cells), def.cells);
  const pl = planes ?? [];
  if (!planes) for (let a = 0; a < dim; a++) for (let b = a + 1; b < dim; b++) pl.push([a, b]);
  while (queue.length) {
    const cur = queue.shift();
    for (const [a, b] of pl) {
      const next = rotateCells(cur, def.n, a, b, 1);
      const k = normKey(next);
      if (!seen.has(k)) {
        seen.set(k, next);
        queue.push(next);
      }
    }
  }
  const list = [...seen.values()];
  orientCache.set(key, list);
  return list;
}

// Evaluates a landing: lower, flatter, fewer holes, more clears is better.
function evaluate(game, cells, pos) {
  const grid = game.grid.slice();
  const abs = cells.map((c) => c.map((v, a) => v + pos[a]));
  for (const c of abs) grid[game.index(c)] = 1;
  const H = game.size[AY];
  // Full layers (inside each well).
  let clears = 0;
  const ys = new Set(abs.map((c) => c[AY]));
  for (const y of ys) {
    for (const group of new Set(abs.filter((c) => c[AY] === y).map((c) => JSON.stringify(game.groupAxes.map((a) => c[a]))))) {
      const g = JSON.parse(group);
      const base = new Array(game.dim).fill(0);
      base[AY] = y;
      game.groupAxes.forEach((a, i) => (base[a] = g[i]));
      let full = true;
      game.forEachIn(game.clearAxes, base, (p) => {
        if (!grid[game.index(p)]) return (full = false);
      });
      if (full) clears++;
    }
  }
  let holes = 0, agg = 0, maxH = 0;
  const heights = new Map();
  const base = new Array(game.dim).fill(0);
  game.forEachIn(game.horizontal, base, (p) => {
    const col = p.slice();
    let h = 0, seenBlock = false;
    for (let y = H - 1; y >= 0; y--) {
      col[AY] = y;
      const v = grid[game.index(col)];
      if (v && !seenBlock) {
        seenBlock = true;
        h = y + 1;
      } else if (!v && seenBlock) holes++;
    }
    agg += h;
    maxH = Math.max(maxH, h);
    heights.set(game.horizontal.map((a) => p[a]).join(','), h);
  });
  let bump = 0;
  for (const [k, h] of heights) {
    const c = k.split(',').map(Number);
    game.horizontal.forEach((a, i) => {
      const n = c.slice();
      n[i]++;
      const hn = heights.get(n.join(','));
      if (hn !== undefined) bump += Math.abs(h - hn);
    });
  }
  const landing = Math.min(...abs.map((c) => c[AY]));
  return clears * 6 - holes * 4.5 - agg * 0.12 - bump * 0.35 - maxH * 0.6 - landing * 0.3;
}

// Returns { cells, pos } for the best landing of the active piece, or null.
export function bestMove(game) {
  const p = game.piece;
  if (!p) return null;
  let best = null;
  for (const cells of orientations(p.def, game.dim)) {
    const lo = new Array(game.dim).fill(Infinity), hi = new Array(game.dim).fill(-Infinity);
    for (const c of cells) for (let a = 0; a < game.dim; a++) {
      lo[a] = Math.min(lo[a], c[a]);
      hi[a] = Math.max(hi[a], c[a]);
    }
    const ranges = game.horizontal.map((a) => [-lo[a], game.size[a] - 1 - hi[a]]);
    const pos = new Array(game.dim).fill(0);
    pos[AY] = p.pos[AY];
    const rec = (k) => {
      if (k === game.horizontal.length) {
        const start = pos.slice();
        if (!game.fits(cells, start)) return;
        while (true) {
          start[AY]--;
          if (!game.fits(cells, start)) {
            start[AY]++;
            break;
          }
        }
        const s = evaluate(game, cells, start) + Math.random() * 0.05;
        if (!best || s > best.score) best = { score: s, cells, pos: start.slice(), from: pos.slice() };
        return;
      }
      const a = game.horizontal[k];
      for (let v = ranges[k][0]; v <= ranges[k][1]; v++) {
        pos[a] = v;
        rec(k + 1);
      }
    };
    rec(0);
  }
  return best;
}
