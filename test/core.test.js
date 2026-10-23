import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, AX, AY, AZ, AW, AV } from '../js/core/game.js';
import { pieceSet, rotateCells } from '../js/core/pieces.js';
import { modeConfig, MODES } from '../js/core/modes.js';

const dist2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
const key = (cells) => cells.map((c) => c.join(',')).sort().join(' ');

function makeGame(dim, size, height, opts = {}) {
  return new Game({ dim, size, height, pieces: pieceSet(dim), seed: 7, preview: 3, ...opts });
}
function fill(game, p) {
  game.grid[game.index(p)] = 1;
}
// Puts the active piece in the given orientation/position (overriding the queue).
function place(game, id, pos, rotate = []) {
  const type = game.cfg.pieces.findIndex((d) => d.id === id);
  const piece = game.makePiece(type);
  piece.cells = piece.def.cells.map((c) => c.slice());
  for (const [a, b, d] of rotate) piece.cells = rotateCells(piece.cells, piece.n, a, b, d);
  piece.pos = pos;
  game.piece = piece;
}

test('rotation keeps shape, size and returns home after four turns, in every plane up to 5D', () => {
  for (const dim of [2, 3, 4, 5]) {
    for (const def of pieceSet(dim)) {
      for (let a = 0; a < dim; a++) {
        for (let b = a + 1; b < dim; b++) {
          let cells = def.cells;
          for (let k = 0; k < 4; k++) {
            const next = rotateCells(cells, def.n, a, b, 1);
            assert.equal(next.length, cells.length);
            for (let i = 0; i < cells.length; i++)
              for (let j = 0; j < cells.length; j++) assert.equal(dist2(next[i], next[j]), dist2(cells[i], cells[j]));
            for (const c of next) for (const v of c) assert.ok(v >= 0 && v < def.n, `${def.id} leaves its box`);
            cells = next;
          }
          assert.equal(key(cells), key(def.cells));
          const back = rotateCells(rotateCells(def.cells, def.n, a, b, 1), def.n, a, b, -1);
          assert.equal(key(back), key(def.cells));
        }
      }
    }
  }
});

test('2D SRS: T turns clockwise into the R state, I kicks off the wall', () => {
  const g = makeGame(2, [10, 25], 20);
  place(g, 'T', [3, 10]);
  assert.ok(g.rotate(AX, AY, -1));
  assert.equal(key(g.piece.cells), key([[1, 2], [1, 1], [2, 1], [1, 0]]));
  assert.equal(g.piece.rot, 1);
  // Vertical I hugging the left wall turns flat by kicking right.
  place(g, 'I', [-2, 5], [[AX, AY, -1]]);
  g.piece.rot = 1;
  assert.ok(g.fits(g.piece.cells, g.piece.pos));
  assert.ok(g.rotate(AX, AY, -1));
  assert.ok(g.absCells().every((c) => c[0] >= 0));
});

test('2D: a full row clears and the stack above drops', () => {
  const g = makeGame(2, [10, 25], 20);
  for (let x = 0; x < 10; x++) if (x < 6 || x > 9) fill(g, [x, 0]);
  fill(g, [0, 1]);
  place(g, 'I', [6, 10]); // flat I: cells x 6..9 at box row 2
  g.hardDrop();
  const clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(clear.count, 1);
  assert.equal(g.lines, 1);
  assert.equal(g.grid[g.index([0, 0])], 1, 'the block from row 1 fell to row 0');
  assert.equal(g.grid[g.index([0, 1])], 0);
  assert.equal(clear.drop[g.index([0, 0])], 1);
});

test('2D: T-spin double is recognised and scored', () => {
  const g = makeGame(2, [10, 25], 20);
  // Classic TSD slot at x = 3..5, rows 0..1, overhang at (3, 2).
  for (let x = 0; x < 10; x++) {
    if (x !== 4) fill(g, [x, 0]);
    if (x < 3 || x > 5) fill(g, [x, 1]);
  }
  fill(g, [3, 2]);
  // T pointing right, resting in the slot; a clockwise turn points it down under the overhang.
  place(g, 'T', [3, 0], [[AX, AY, -1]]);
  g.piece.rot = 1;
  assert.ok(g.fits(g.piece.cells, g.piece.pos));
  assert.ok(g.rotate(AX, AY, -1));
  g.hardDrop();
  const clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.ok(clear, 'clears');
  assert.equal(clear.tspin, 'tspin');
  assert.equal(clear.count, 2);
});

test('3D: a full 4×4 layer clears; clearing everything is a perfect clear', () => {
  const g = makeGame(3, [4, 17, 4], 12);
  for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) if (!(x < 2 && z < 2)) fill(g, [x, 0, z]);
  place(g, 'O', [0, 8, 0]);
  g.hardDrop();
  const clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.equal(clear.count, 1);
  assert.ok(clear.perfect);
  assert.ok(g.grid.every((v) => v === 0));
});

test('4D: one piece across two wells clears a layer in both (well rule)', () => {
  const g = makeGame(4, [2, 15, 2, 3], 10);
  for (const w of [0, 1]) for (let x = 0; x < 2; x++) fill(g, [x, 0, 0, w]);
  // O square turned into the x–w plane (it lands at z = 1): two cells at w and two at w+1.
  place(g, 'O', [0, 5, 0, 0], [[AZ, AW, 1]]);
  const cells = g.absCells();
  assert.equal(new Set(cells.map((c) => c[AW])).size, 2);
  g.hardDrop();
  const clear = g.drainEvents().find((e) => e.type === 'clear');
  assert.ok(clear, 'clears');
  assert.equal(clear.count, 2);
  assert.equal(clear.wells, 2);
});

test('4D: under the "all" rule a single well filling up is not enough', () => {
  const g = makeGame(4, [2, 15, 2, 2], 10, { clearRule: 'all' });
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) if (!(x === 0 && z === 0)) fill(g, [x, 0, z, 0]);
  place(g, 'v', [0, 5, 0, 0]);
  g.piece.cells = [[0, 0, 0, 0]];
  g.hardDrop();
  assert.equal(g.drainEvents().filter((e) => e.type === 'clear').length, 0);
  assert.equal(g.lines, 0);
});

test('every mode spawns pieces inside the board, also pieces pre-turned across wells', () => {
  for (const id of Object.keys(MODES)) {
    for (const preset of MODES[id].presets) {
      const g = new Game({ ...modeConfig(id, preset.id), seed: 3, hyperSpawn: MODES[id].dim >= 4 ? 1 : 0 });
      g.start();
      for (let i = 0; i < 60 && g.state === 'play'; i++) {
        assert.ok(g.fits(g.piece.cells, g.piece.pos), `${id}/${preset.id} piece ${g.piece.def.id} fits`);
        g.hardDrop();
        g.update(1);
      }
    }
  }
});

test('random play never overlaps blocks or leaves the board (2D–5D)', () => {
  for (const [dim, size, height] of [[2, [10, 25], 20], [3, [5, 19, 5], 14], [4, [3, 17, 3, 4], 12], [5, [3, 15, 3, 3, 3], 10]]) {
    const g = makeGame(dim, size, height, { seed: 11, hyperSpawn: 0.4 });
    g.start();
    let rnd = 1;
    const r = (n) => ((rnd = (rnd * 16807) % 2147483647) % n);
    for (let step = 0; step < 4000 && g.state === 'play'; step++) {
      const act = r(10);
      if (!g.piece) {
        g.update(0.5);
        continue;
      }
      const hor = g.horizontal[r(g.horizontal.length)];
      if (act < 4) g.move(hor, r(2) ? 1 : -1);
      else if (act < 7) {
        const a = r(dim), b = (a + 1 + r(dim - 1)) % dim;
        g.rotate(Math.min(a, b), Math.max(a, b), r(2) ? 1 : -1);
      } else if (act < 8) g.hold();
      else if (act < 9) g.hardDrop();
      else g.update(0.3);
      if (g.piece) assert.ok(g.fits(g.piece.cells, g.piece.pos), 'active piece overlaps');
    }
    assert.ok(g.pieces > 10, `dim ${dim} played some pieces (${g.pieces})`);
  }
});

test('timed mode ends when the clock runs out', () => {
  const g = new Game({ ...modeConfig('2d', 'classic'), mode: 'timed', timeLimit: 2, seed: 1 });
  g.start();
  for (let i = 0; i < 30; i++) g.update(0.1);
  assert.equal(g.state, 'over');
  assert.equal(g.overReason, 'time');
});

test('pieces in 4D spawn above the well where the last one landed', () => {
  const g = new Game({ ...modeConfig('4d', 'six'), seed: 5, hyperSpawn: 0 });
  g.start();
  for (let i = 0; i < 4; i++) g.move(AW, 1);
  const w = g.piece.pos[AW];
  g.hardDrop();
  g.update(1);
  const ws = g.absCells().map((c) => c[AW]);
  assert.ok(ws.includes(Math.min(w + 1, g.size[AW] - 1)) || ws.includes(w), `spawned near well ${w}: ${ws}`);
  void AV;
});
