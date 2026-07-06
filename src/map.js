// The level as an ASCII grid. One char = one cell (CELL meters square).
// Legend: '#' wall, '.' floor, 'P' player spawn, 'K' key, 'M' monster spawn,
// 'E' exit door cell.
export const CELL = 2.4;

export const MAP = [
  '###############',
  '#P............#',
  '#.####.#####..#',
  '#....#.....#..#',
  '#.##.#.###.##.#',
  '#.#..#.#K#..#.#',
  '#.#.##.#.##.#.#',
  '#.#........#..#',
  '#.#.######.##.#',
  '#...#....#..#.#',
  '#.###.##.##.#.#',
  '#.#...#...#...#',
  '#.#.###.#.###.#',
  '#..M....#....E#',
  '###############',
];

export const ROWS = MAP.length;
export const COLS = MAP[0].length;

export function parseMap() {
  const walkable = [];
  let spawn = null, key = null, monster = null, exit = null;
  for (let r = 0; r < ROWS; r++) {
    walkable.push([]);
    for (let c = 0; c < COLS; c++) {
      const ch = MAP[r][c];
      walkable[r][c] = ch !== '#';
      if (ch === 'P') spawn = { col: c, row: r };
      if (ch === 'K') key = { col: c, row: r };
      if (ch === 'M') monster = { col: c, row: r };
      if (ch === 'E') exit = { col: c, row: r };
    }
  }
  return { walkable, spawn, key, monster, exit };
}

// Grid is centered on the world origin; +x is east (col+), +z is south (row+).
export function cellToWorld(col, row) {
  return {
    x: (col - COLS / 2 + 0.5) * CELL,
    z: (row - ROWS / 2 + 0.5) * CELL,
  };
}

export function worldToCell(x, z) {
  return {
    col: Math.floor(x / CELL + COLS / 2),
    row: Math.floor(z / CELL + ROWS / 2),
  };
}

/** BFS shortest path between cells. Returns [{col,row}, ...] excluding start, or null. */
export function findPath(walkable, start, goal) {
  if (start.col === goal.col && start.row === goal.row) return [];
  const key = (c, r) => r * COLS + c;
  const prev = new Map();
  prev.set(key(start.col, start.row), null);
  const queue = [start];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length) {
    const cur = queue.shift();
    for (const [dc, dr] of dirs) {
      const c = cur.col + dc, r = cur.row + dr;
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      if (!walkable[r][c] || prev.has(key(c, r))) continue;
      prev.set(key(c, r), cur);
      if (c === goal.col && r === goal.row) {
        // Walk back from the goal to build the path.
        const path = [];
        let node = { col: c, row: r };
        while (node && !(node.col === start.col && node.row === start.row)) {
          path.unshift(node);
          node = prev.get(key(node.col, node.row));
        }
        return path;
      }
      queue.push({ col: c, row: r });
    }
  }
  return null;
}

/** Random walkable cell, for monster patrol targets. */
export function randomWalkableCell(walkable) {
  for (let tries = 0; tries < 200; tries++) {
    const col = 1 + Math.floor(Math.random() * (COLS - 2));
    const row = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (walkable[row][col]) return { col, row };
  }
  return { col: 1, row: 1 };
}
