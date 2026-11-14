/**
 * Placement rules for the room editor. Boxes are floor footprints in room units:
 * { minX, maxX, minZ, maxZ }. Pure functions, no Three.js, so they're easy to test.
 */

export const GRID_STEP = 0.25;
export const ROTATION_STEP = Math.PI / 4;
// Overlaps thinner than this are allowed, so neighbours can touch.
export const TOUCH_TOLERANCE = 0.02;

export function snap(value, step = GRID_STEP) {
  return Math.round(value / step) * step;
}

/** Wraps an angle into (-PI, PI]. */
export function normalizeAngle(angle) {
  const wrapped = Math.atan2(Math.sin(angle), Math.cos(angle));
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

export function translateBox(box, dx, dz) {
  return { minX: box.minX + dx, maxX: box.maxX + dx, minZ: box.minZ + dz, maxZ: box.maxZ + dz };
}

export function overlaps(a, b, tolerance = TOUCH_TOLERANCE) {
  return (
    a.minX < b.maxX - tolerance &&
    a.maxX > b.minX + tolerance &&
    a.minZ < b.maxZ - tolerance &&
    a.maxZ > b.minZ + tolerance
  );
}

export function isInside(box, room, tolerance = 0.001) {
  return (
    box.minX >= room.minX - tolerance &&
    box.maxX <= room.maxX + tolerance &&
    box.minZ >= room.minZ - tolerance &&
    box.maxZ <= room.maxZ + tolerance
  );
}

/** Smallest shift { dx, dz } that moves box inside room, or null if it can't fit. */
export function shiftInside(box, room) {
  if (box.maxX - box.minX > room.maxX - room.minX || box.maxZ - box.minZ > room.maxZ - room.minZ) {
    return null;
  }
  const dx = box.minX < room.minX ? room.minX - box.minX : box.maxX > room.maxX ? room.maxX - box.maxX : 0;
  const dz = box.minZ < room.minZ ? room.minZ - box.minZ : box.maxZ > room.maxZ ? room.maxZ - box.maxZ : 0;
  return { dx, dz };
}

/** True when box is inside the room and (unless ignored) clear of every obstacle. */
export function canPlace(box, room, obstacles, { ignoreObstacles = false } = {}) {
  if (!isInside(box, room)) return false;
  return ignoreObstacles || obstacles.every((obstacle) => !overlaps(box, obstacle));
}

/**
 * Grid positions spiralling out from (x, z), nearest first. Used to find a free
 * spot for newly added furniture.
 */
export function* spiral(x, z, maxRadius, step = GRID_STEP) {
  yield [x, z];
  const rings = Math.ceil(maxRadius / step);
  for (let ring = 1; ring <= rings; ring += 1) {
    const cells = [];
    for (let i = -ring; i <= ring; i += 1) {
      for (let j = -ring; j <= ring; j += 1) {
        if (Math.max(Math.abs(i), Math.abs(j)) === ring) cells.push([i, j]);
      }
    }
    cells.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
    for (const [i, j] of cells) yield [x + i * step, z + j * step];
  }
}
