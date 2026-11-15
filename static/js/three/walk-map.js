/**
 * Where a visitor can stand: a grid over the floor with the furniture (grown by the
 * visitor's radius) and a band along the walls blocked out. Finds smooth routes around
 * things for tap-to-walk, and slides keyboard movement along whatever's in the way.
 */
export class WalkMap {
  /**
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} area the room's floor
   * @param {{minX:number,maxX:number,minZ:number,maxZ:number}[]} obstacles footprints on the floor
   */
  constructor(area, obstacles = [], { cell = 0.1, radius = 0.38, wallMargin = 0.6 } = {}) {
    this.area = area;
    this.cell = cell;
    this.radius = radius;
    this.cols = Math.max(1, Math.round((area.maxX - area.minX) / cell));
    this.rows = Math.max(1, Math.round((area.maxZ - area.minZ) / cell));
    this.blocked = new Uint8Array(this.cols * this.rows);
    // A wide view at eye height fills with wall when you stand right up against it.
    const m = wallMargin;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const { x, z } = this._centre(col, row);
        const nearWall = x - area.minX < m || area.maxX - x < m || z - area.minZ < m || area.maxZ - z < m;
        if (nearWall) this.blocked[row * this.cols + col] = 1;
      }
    }
    for (const box of obstacles) this._block(box);
  }

  /** True if someone can stand at (x, z). */
  isFree(x, z) {
    const cell = this._cellAt(x, z);
    return cell !== null && !this.blocked[cell];
  }

  /** The nearest free spot to (x, z) within maxDistance metres, or null. */
  nearestFree(x, z, maxDistance = 2.5) {
    if (this.isFree(x, z)) return { x, z };
    const col0 = Math.floor((x - this.area.minX) / this.cell);
    const row0 = Math.floor((z - this.area.minZ) / this.cell);
    const reach = Math.ceil(maxDistance / this.cell);
    let best = null;
    for (let ring = 1; ring <= reach && !best; ring += 1) {
      for (let dr = -ring; dr <= ring; dr += 1) {
        for (let dc = -ring; dc <= ring; dc += 1) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const col = col0 + dc;
          const row = row0 + dr;
          if (!this._inGrid(col, row) || this.blocked[row * this.cols + col]) continue;
          const point = this._centre(col, row);
          const d = Math.hypot(point.x - x, point.z - z);
          if (!best || d < best.d) best = { ...point, d };
        }
      }
    }
    return best ? { x: best.x, z: best.z } : null;
  }

  /** True if the straight line from a to b crosses only free floor. */
  clearLine(a, b) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (!this.isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  /** How far along the line from `from` toward `to` can be walked before something's in the way. */
  reach(from, to) {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / (this.cell * 0.5)));
    let last = { x: from.x, z: from.z };
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const point = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
      if (!this.isFree(point.x, point.z)) break;
      last = point;
    }
    return last;
  }

  /**
   * Moves from `from` by (dx, dz), sliding along walls and furniture instead of
   * stopping dead, like walking into a table at an angle.
   */
  slide(from, dx, dz) {
    if (this.isFree(from.x + dx, from.z + dz)) return { x: from.x + dx, z: from.z + dz };
    if (this.isFree(from.x + dx, from.z)) return { x: from.x + dx, z: from.z };
    if (this.isFree(from.x, from.z + dz)) return { x: from.x, z: from.z + dz };
    return { x: from.x, z: from.z };
  }

  /**
   * A short list of points from `from` to `to` around everything in the way (A* on the
   * grid, then pulled straight wherever the line is clear), or null if there's no way.
   */
  findPath(from, to) {
    const start = this.nearestFree(from.x, from.z, 1);
    const goal = this.nearestFree(to.x, to.z);
    if (!start || !goal) return null;
    if (this.clearLine(start, goal)) return [from, goal];

    const startCell = this._cellAt(start.x, start.z);
    const goalCell = this._cellAt(goal.x, goal.z);
    const { cols } = this;
    const cost = new Float32Array(this.blocked.length).fill(Infinity);
    const came = new Int32Array(this.blocked.length).fill(-1);
    const open = new MinHeap();
    cost[startCell] = 0;
    open.push(startCell, 0);
    const goalCol = goalCell % cols;
    const goalRow = Math.floor(goalCell / cols);
    const heuristic = (cell) => {
      const dc = Math.abs((cell % cols) - goalCol);
      const dr = Math.abs(Math.floor(cell / cols) - goalRow);
      return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
    };
    while (open.size) {
      const cell = open.pop();
      if (cell === goalCell) break;
      const col = cell % cols;
      const row = Math.floor(cell / cols);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          if (!dr && !dc) continue;
          const c = col + dc;
          const r = row + dr;
          if (!this._inGrid(c, r) || this.blocked[r * cols + c]) continue;
          // No cutting corners past furniture.
          if (dr && dc && (this.blocked[row * cols + c] || this.blocked[r * cols + col])) continue;
          const next = r * cols + c;
          const step = dr && dc ? Math.SQRT2 : 1;
          const total = cost[cell] + step;
          if (total < cost[next]) {
            cost[next] = total;
            came[next] = cell;
            open.push(next, total + heuristic(next));
          }
        }
      }
    }
    if (came[goalCell] === -1 && goalCell !== startCell) return null;

    const cells = [];
    for (let cell = goalCell; cell !== -1; cell = came[cell]) cells.push(cell);
    cells.reverse();
    const raw = [from, ...cells.slice(1, -1).map((cell) => this._centre(cell % cols, Math.floor(cell / cols))), goal];
    // Pull the path tight: skip every point that can be seen past.
    const path = [raw[0]];
    let anchor = 0;
    while (anchor < raw.length - 1) {
      let far = raw.length - 1;
      while (far > anchor + 1 && !this.clearLine(raw[anchor], raw[far])) far -= 1;
      path.push(raw[far]);
      anchor = far;
    }
    return path;
  }

  _block({ minX, maxX, minZ, maxZ }) {
    const r = this.radius;
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const { x, z } = this._centre(col, row);
        // Distance from the cell to the footprint, so corners come out rounded.
        const dx = Math.max(minX - x, 0, x - maxX);
        const dz = Math.max(minZ - z, 0, z - maxZ);
        if (dx * dx + dz * dz < r * r) this.blocked[row * this.cols + col] = 1;
      }
    }
  }

  _cellAt(x, z) {
    const col = Math.floor((x - this.area.minX) / this.cell);
    const row = Math.floor((z - this.area.minZ) / this.cell);
    return this._inGrid(col, row) ? row * this.cols + col : null;
  }

  _inGrid(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  _centre(col, row) {
    return { x: this.area.minX + (col + 0.5) * this.cell, z: this.area.minZ + (row + 0.5) * this.cell };
  }
}

class MinHeap {
  constructor() {
    this.items = [];
    this.keys = [];
  }

  get size() {
    return this.items.length;
  }

  push(item, key) {
    const { items, keys } = this;
    items.push(item);
    keys.push(key);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= keys[i]) break;
      [items[i], items[parent]] = [items[parent], items[i]];
      [keys[i], keys[parent]] = [keys[parent], keys[i]];
      i = parent;
    }
  }

  pop() {
    const { items, keys } = this;
    const top = items[0];
    const lastItem = items.pop();
    const lastKey = keys.pop();
    if (items.length) {
      items[0] = lastItem;
      keys[0] = lastKey;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && keys[l] < keys[m]) m = l;
        if (r < items.length && keys[r] < keys[m]) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m], items[i]];
        [keys[i], keys[m]] = [keys[m], keys[i]];
        i = m;
      }
    }
    return top;
  }
}
