import * as THREE from 'three';

const SAMPLE_GRID = 9;

/**
 * Finds a client-space point where `root` is visible and `isHit(x, y)` confirms it is
 * the thing under the pointer (so it isn't hidden behind something else).
 */
export function findScreenPoint({ camera, canvas, root, isHit }) {
  const rect = canvas.getBoundingClientRect();
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(camera));
    }
  }
  if (corners.every((c) => c.z > 1)) return null;
  const points = corners.map((c) => ({
    x: rect.left + ((c.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - c.y) / 2) * rect.height,
  }));
  const minX = Math.max(rect.left + 1, Math.min(...points.map((p) => p.x)));
  const maxX = Math.min(rect.right - 1, Math.max(...points.map((p) => p.x)));
  const minY = Math.max(rect.top + 1, Math.min(...points.map((p) => p.y)));
  const maxY = Math.min(rect.bottom - 1, Math.max(...points.map((p) => p.y)));
  if (minX >= maxX || minY >= maxY) return null;

  // Sample from the centre outwards so the returned point is well inside the object.
  const offsets = [];
  for (let i = 0; i < SAMPLE_GRID; i += 1) offsets.push((i + 0.5) / SAMPLE_GRID);
  offsets.sort((a, b) => Math.abs(a - 0.5) - Math.abs(b - 0.5));
  for (const fy of offsets) {
    for (const fx of offsets) {
      const x = minX + (maxX - minX) * fx;
      const y = minY + (maxY - minY) * fy;
      if (isHit(x, y)) return { x, y };
    }
  }
  return null;
}

/** Projects a world point to client coordinates, or null if it is behind the camera. */
export function worldToClient(camera, canvas, point) {
  const projected = point.clone().project(camera);
  if (projected.z > 1) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.left + ((projected.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - projected.y) / 2) * rect.height,
  };
}

/** Sets a raycaster from client coordinates. Returns false if the canvas has no size. */
export function setRayFromClient(raycaster, camera, canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, camera);
  return true;
}
