// Piece sets. Axes everywhere: 0 = x, 1 = y (up, gravity pulls to -y), 2 = z, 3 = w, 4 = v.
// A piece lives in an n×n×… box and rotates about the box centre, so the pivot never drifts
// (in 2D this is exactly SRS "true rotation"). Cells are given as [x, y] or [x, y, z];
// missing coordinates are padded with the box centre.

// 2D: the seven tetrominoes in SRS spawn orientation (rows read top-down, y up).
const TETROMINOES = [
  { id: 'I', n: 4, color: 0, cells: [[0, 2], [1, 2], [2, 2], [3, 2]] },
  { id: 'O', n: 2, color: 1, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { id: 'T', n: 3, color: 2, cells: [[1, 2], [0, 1], [1, 1], [2, 1]] },
  { id: 'S', n: 3, color: 3, cells: [[1, 2], [2, 2], [0, 1], [1, 1]] },
  { id: 'Z', n: 3, color: 4, cells: [[0, 2], [1, 2], [1, 1], [2, 1]] },
  { id: 'J', n: 3, color: 5, cells: [[0, 2], [0, 1], [1, 1], [2, 1]] },
  { id: 'L', n: 3, color: 6, cells: [[2, 2], [0, 1], [1, 1], [2, 1]] },
];

// 3D and up: the eight tetracubes lying flat (L = J and S = Z once you can flip in 3D),
// plus two small helpers so a wide floor is not a chore to fill. [x, y, z]
const TETRACUBES = [
  { id: 'I', n: 4, color: 0, cells: [[0, 1, 1], [1, 1, 1], [2, 1, 1], [3, 1, 1]] },
  { id: 'O', n: 2, color: 1, cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]] },
  { id: 'T', n: 3, color: 2, cells: [[0, 1, 1], [1, 1, 1], [2, 1, 1], [1, 1, 2]] },
  { id: 'S', n: 3, color: 3, cells: [[0, 1, 1], [1, 1, 1], [1, 1, 2], [2, 1, 2]] },
  { id: 'L', n: 3, color: 6, cells: [[0, 1, 1], [1, 1, 1], [2, 1, 1], [2, 1, 2]] },
  { id: 'Y', n: 2, color: 7, cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0]] }, // tripod
  { id: 'R', n: 2, color: 8, cells: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 1]] }, // screw
  { id: 'G', n: 2, color: 4, cells: [[1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] }, // mirrored screw
];
const SMALL_CUBES = [
  { id: 'i', n: 3, color: 5, cells: [[0, 1, 1], [1, 1, 1], [2, 1, 1]] },
  { id: 'v', n: 2, color: 9, cells: [[0, 0, 0], [1, 0, 0], [0, 0, 1]] },
];

function pad(def, dim) {
  const c = Math.floor((def.n - 1) / 2);
  return {
    ...def,
    cells: def.cells.map((p) => Array.from({ length: dim }, (_, i) => (i < p.length ? p[i] : c))),
  };
}

export function pieceSet(dim, { small = dim >= 3 } = {}) {
  const base = dim === 2 ? TETROMINOES : small ? [...TETRACUBES, ...SMALL_CUBES] : TETRACUBES;
  return base.map((d) => pad(d, dim));
}

// Rotate cells in the plane of axes a and b by 90°, about the box centre.
// dir = +1 turns axis a towards axis b; dir = -1 the other way.
export function rotateCells(cells, n, a, b, dir) {
  const m = n - 1;
  return cells.map((p) => {
    const q = p.slice();
    if (dir > 0) {
      q[a] = m - p[b];
      q[b] = p[a];
    } else {
      q[a] = p[b];
      q[b] = m - p[a];
    }
    return q;
  });
}
