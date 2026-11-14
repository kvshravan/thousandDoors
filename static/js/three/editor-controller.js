import * as THREE from 'three';
import { canPlace, GRID_STEP, normalizeAngle, ROTATION_STEP, shiftInside, snap, spiral, translateBox } from './placement.js';
import { findScreenPoint, setRayFromClient } from './screen-point.js';

const TAP_MAX_MOVE_PX = 6;
const TAP_MAX_MS = 600;
// Objects whose lowest point is below this stand on the floor.
const FLOOR_LEVEL = 0.05;
const WALL_GAP = 0.02;
const SEARCH_RADIUS = 4.5;
const EDIT_VIEW = {
  position: new THREE.Vector3(0, 3.6, 3.4),
  target: new THREE.Vector3(0, 0, -0.4),
  minPolar: 0.35,
  maxPolar: 1.3,
};
const MARKER_VALID = '#7fd18b';
const MARKER_INVALID = '#e0604f';
const MARKER_PAD = 0.12;
const EDITABLE = new Set(['floor', 'surface']);
const TYPING = 'input, textarea, select, [contenteditable="true"]';

const _box = new THREE.Box3();
const _up = new THREE.Vector3(0, 1, 0);

function footprint(record) {
  _box.setFromObject(record.root);
  return {
    minX: _box.min.x,
    maxX: _box.max.x,
    minZ: _box.min.z,
    maxZ: _box.max.z,
    minY: _box.min.y,
    maxY: _box.max.y,
  };
}

const isOnFloor = (record) => footprint(record).minY < FLOOR_LEVEL;

/**
 * Edit mode for a RoomScene: select, drag, rotate, delete, and place furniture.
 * Floor items snap to a grid, stay inside the walls, and can't overlap. Items
 * standing on furniture (a lamp on a nightstand) move and turn with it.
 * Reports changes through onChange(state); it never touches page HTML.
 */
export class EditorController {
  constructor({ scene, onChange }) {
    this.room = scene;
    this.objects = scene.objects;
    this.camera = scene.camera;
    this.canvas = scene.engine.canvas;
    this.cameraController = scene.controller;
    this.onChange = onChange;
    const { width, depth } = scene.dimensions;
    this.bounds = {
      minX: -width / 2 + WALL_GAP,
      maxX: width / 2 - WALL_GAP,
      minZ: -depth / 2 + WALL_GAP,
      maxZ: depth / 2 - WALL_GAP,
    };

    this.active = false;
    this.selectedId = null;
    this.pendingId = null;
    this.valid = true;
    this.message = '';
    this._children = [];
    this._obstacles = [];
    this._drag = null;
    this._press = null;
    this._pointers = new Set();
    this._hover = null;
    this._changed = false;
    this._placeToken = 0;
    this._raycaster = new THREE.Raycaster();
    this._floor = new THREE.Plane(_up, 0);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
  }

  start() {
    if (this.active) return;
    this.active = true;
    this._marker = this._createMarker();
    this.room.scene.add(this._marker);
    // Capture phase, so a drag on furniture can switch off camera control before
    // OrbitControls sees the pointerdown.
    this.canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.addEventListener('pointermove', this._onPointerMove);
    this.canvas.addEventListener('pointerup', this._onPointerUp);
    this.canvas.addEventListener('pointercancel', this._onPointerUp);
    window.addEventListener('keydown', this._onKeyDown);
    this.cameraController.setPolarLimits(EDIT_VIEW.minPolar, EDIT_VIEW.maxPolar);
    this.cameraController.flyTo(EDIT_VIEW);
    this._setMessage('Drag furniture to move it, or add something new.');
  }

  stop() {
    if (!this.active) return;
    this.cancelPlacement();
    this._endDrag();
    this.deselect();
    this.active = false;
    this.canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    window.removeEventListener('keydown', this._onKeyDown);
    this._marker.removeFromParent();
    this._marker.geometry.dispose();
    this._marker.material.dispose();
    this._marker = null;
    this.canvas.style.cursor = '';
    this.cameraController.setUserControl(true);
    this.cameraController.setPolarLimits();
    this.cameraController.resetView();
  }

  /** Returns true when something visible changed since the last frame. */
  update() {
    if (this._hover) {
      const { x, y } = this._hover;
      this._hover = null;
      this._handleHover(x, y);
    }
    const changed = this._changed;
    this._changed = false;
    return changed;
  }

  getState() {
    const record = this._selected();
    return {
      active: this.active,
      selected: record
        ? {
            id: record.id,
            name: record.name,
            canMove: this._isDraggable(record),
            children: this._children.map((child) => child.id),
          }
        : null,
      pending: this.pendingId,
      valid: this.valid,
      message: this.message,
    };
  }

  // ---- Commands (also used by the page's buttons and by keyboard shortcuts) ----

  select(objectId) {
    const record = this.objects.get(objectId);
    if (!record || !EDITABLE.has(record.placement)) return false;
    if (this.selectedId !== objectId) {
      this.selectedId = objectId;
      this._refreshContext();
    }
    this.valid = true;
    this._updateMarker();
    this._emit();
    return true;
  }

  deselect() {
    if (this.pendingId) this.cancelPlacement();
    if (!this.selectedId) return;
    this.selectedId = null;
    this._children = [];
    this.valid = true;
    this._updateMarker();
    this._emit();
  }

  /** Adds a catalogue item at a free spot and lets the user place it. */
  async beginPlacement(catalogId) {
    const entry = this.objects.catalog.get(catalogId);
    if (!this.active || entry?.placement !== 'floor') return null;
    this.cancelPlacement();
    const token = ++this._placeToken;
    const id = this._uniqueId(catalogId);
    const record = await this.room.addObject({
      id,
      catalogId,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      customData: {},
      permissions: { interact: null },
    });
    if (!record) return null;
    if (token !== this._placeToken || !this.active) {
      this.room.removeObject(id);
      return null;
    }

    this.pendingId = id;
    this.selectedId = id;
    this._refreshContext();
    const target = this.cameraController.controls.target;
    let found = false;
    for (const [x, z] of spiral(snap(target.x), snap(target.z), SEARCH_RADIUS)) {
      if (this._tryMove(record, x, z).ok) {
        found = true;
        break;
      }
    }
    if (!found) {
      this.cancelPlacement();
      this._setMessage(`There's no free space for the ${entry.name.toLowerCase()}.`);
      return null;
    }
    this.valid = true;
    this._updateMarker();
    this._setMessage(`Tap or click the floor to place the ${entry.name.toLowerCase()}.`);
    return id;
  }

  /** Confirms the pending item where it is, if that spot is allowed. */
  commitPlacement() {
    const record = this.objects.get(this.pendingId);
    if (!record) return false;
    if (!this.valid) {
      this._setMessage("It doesn't fit there.");
      return false;
    }
    this.pendingId = null;
    this._refreshContext();
    this._setMessage(`Placed the ${record.name.toLowerCase()}. Drag it to adjust.`);
    return true;
  }

  cancelPlacement() {
    if (!this.pendingId) return;
    const id = this.pendingId;
    this.pendingId = null;
    this.room.removeObject(id);
    if (this.selectedId === id) {
      this.selectedId = null;
      this._children = [];
    }
    this.valid = true;
    this._updateMarker();
    this._emit();
  }

  rotateSelected(direction = 1) {
    const record = this._selected();
    if (!record) return false;
    const angle = Math.sign(direction || 1) * ROTATION_STEP;
    const movers = [record, ...this._children];
    const saved = movers.map((item) => [item.root.position.clone(), item.root.rotation.y]);
    this._rotate(record, angle);
    if (!this._isDraggable(record)) {
      this._updateMarker();
      this._touched();
      return true;
    }
    const { ok } = this._tryMove(record, record.root.position.x, record.root.position.z, { force: true });
    if (ok || this.pendingId === record.id) {
      this.valid = ok;
      this._updateMarker();
      this._touched();
      return true;
    }
    movers.forEach((item, i) => {
      item.root.position.copy(saved[i][0]);
      item.root.rotation.y = saved[i][1];
    });
    this.valid = true;
    this._updateMarker();
    this._setMessage("There isn't room to turn it here.");
    return false;
  }

  deleteSelected() {
    const record = this._selected();
    if (!record) return false;
    if (this.pendingId === record.id) {
      this.cancelPlacement();
      return true;
    }
    for (const child of this._children) this.room.removeObject(child.id);
    this.room.removeObject(record.id);
    this.selectedId = null;
    this._children = [];
    this._updateMarker();
    this._setMessage(`Removed the ${record.name.toLowerCase()}.`);
    this._touched();
    return true;
  }

  /** Moves the selected item one grid step (keyboard arrows). */
  nudge(stepsX, stepsZ) {
    const record = this._selected();
    if (!record || !this._isDraggable(record)) return false;
    const { x, z } = record.root.position;
    const { ok } = this._tryMove(record, snap(x + stepsX * GRID_STEP), snap(z + stepsZ * GRID_STEP), {
      force: this.pendingId === record.id,
    });
    if (this.pendingId === record.id) this.valid = ok;
    else if (!ok) this._setMessage('Something is in the way.');
    this._updateMarker();
    this._touched();
    return ok;
  }

  /** Client-space point where an editable object can be grabbed, or null. */
  findScreenPoint(objectId) {
    const record = this.objects.get(objectId);
    if (!record) return null;
    return findScreenPoint({
      camera: this.camera,
      canvas: this.canvas,
      root: record.root,
      isHit: (x, y) => this.pick(x, y) === record,
    });
  }

  /** The editable object under a client point, or null. */
  pick(clientX, clientY) {
    if (!setRayFromClient(this._raycaster, this.camera, this.canvas, clientX, clientY)) return null;
    const hit = this._raycaster
      .intersectObjects(this.room.scene.children, true)
      .find((h) => h.object.isMesh && h.object.visible && h.object !== this._marker);
    const record = hit ? this.objects.resolve(hit.object) : null;
    return record && EDITABLE.has(record.placement) ? record : null;
  }

  // ---- Internals ----

  _selected() {
    return this.selectedId ? this.objects.get(this.selectedId) : null;
  }

  _isDraggable(record) {
    return EDITABLE.has(record.placement) && isOnFloor(record);
  }

  /** Recomputes what rides along with the selection and what it may not overlap. */
  _refreshContext() {
    const record = this._selected();
    // A new item starts at the room centre; it must not adopt whatever stands there.
    this._children = record && record.id !== this.pendingId ? this._findChildren(record) : [];
    const exclude = new Set([record?.id, ...this._children.map((child) => child.id), this.pendingId]);
    this._obstacles = [];
    for (const other of this.objects.records.values()) {
      if (exclude.has(other.id) || other.flat) continue;
      const box = footprint(other);
      if (box.minY < FLOOR_LEVEL) this._obstacles.push(box);
    }
  }

  _findChildren(parent) {
    if (!this._isDraggable(parent)) return [];
    const base = footprint(parent);
    const children = [];
    for (const other of this.objects.records.values()) {
      if (other === parent || other.placement !== 'surface') continue;
      const box = footprint(other);
      if (box.minY < FLOOR_LEVEL || box.minY > base.maxY + 0.05) continue;
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      if (cx >= base.minX && cx <= base.maxX && cz >= base.minZ && cz <= base.maxZ) children.push(other);
    }
    return children;
  }

  /**
   * Moves record (and riders) so its origin is at (x, z), shifted back inside the
   * walls if needed. Only moves when the spot is allowed, unless force is set.
   */
  _tryMove(record, x, z, { force = false } = {}) {
    const current = footprint(record);
    let dx = x - record.root.position.x;
    let dz = z - record.root.position.z;
    let box = translateBox(current, dx, dz);
    const shift = shiftInside(box, this.bounds);
    if (!shift) return { ok: false, box };
    dx += shift.dx;
    dz += shift.dz;
    box = translateBox(box, shift.dx, shift.dz);
    const ok = canPlace(box, this.bounds, this._obstacles, { ignoreObstacles: record.flat });
    if (ok || force) this._translate(record, dx, dz);
    return { ok, box };
  }

  _translate(record, dx, dz) {
    if (dx === 0 && dz === 0) return;
    for (const item of [record, ...(record.id === this.selectedId ? this._children : [])]) {
      item.root.position.x += dx;
      item.root.position.z += dz;
    }
    this._touched();
  }

  _rotate(record, angle) {
    const pivot = record.root.position;
    record.root.rotation.y = normalizeAngle(record.root.rotation.y + angle);
    for (const child of record.id === this.selectedId ? this._children : []) {
      const offset = child.root.position.clone().sub(pivot).applyAxisAngle(_up, angle);
      child.root.position.copy(pivot).add(offset);
      child.root.rotation.y = normalizeAngle(child.root.rotation.y + angle);
    }
  }

  _createMarker() {
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: MARKER_VALID, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    marker.name = 'editor-marker';
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 10;
    marker.visible = false;
    marker.raycast = () => {};
    return marker;
  }

  _updateMarker(box = null) {
    if (!this._marker) return;
    const record = this._selected();
    if (!record) {
      this._marker.visible = false;
      this._changed = true;
      return;
    }
    const area = box ?? footprint(record);
    const y = box ? footprint(record).minY : area.minY;
    this._marker.visible = true;
    // Padded so the glow shows around the object, not just hidden underneath it.
    this._marker.scale.set(area.maxX - area.minX + MARKER_PAD * 2, area.maxZ - area.minZ + MARKER_PAD * 2, 1);
    this._marker.position.set((area.minX + area.maxX) / 2, y + 0.015, (area.minZ + area.maxZ) / 2);
    this._marker.material.color.set(this.valid ? MARKER_VALID : MARKER_INVALID);
    this._changed = true;
  }

  _floorPoint(clientX, clientY) {
    if (!setRayFromClient(this._raycaster, this.camera, this.canvas, clientX, clientY)) return null;
    return this._raycaster.ray.intersectPlane(this._floor, new THREE.Vector3());
  }

  _uniqueId(catalogId) {
    let n = 1;
    while (this.objects.get(`${catalogId}-${n}`)) n += 1;
    return `${catalogId}-${n}`;
  }

  _touched() {
    this._changed = true;
    this.room.engine?.requestShadowUpdate();
    this._emit();
  }

  _setMessage(message) {
    this.message = message;
    this._emit();
  }

  _emit() {
    this.onChange?.(this.getState());
  }

  // ---- Pointer and keyboard ----

  _onPointerDown(event) {
    this._pointers.add(event.pointerId);
    if (this._pointers.size > 1) {
      this._press = null;
      this._endDrag();
      return;
    }
    const hit = this.pendingId ? null : this.pick(event.clientX, event.clientY);
    this._press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), hit };
    if (!hit) return;
    this.select(hit.id);
    if (!this._isDraggable(hit)) return;
    const point = this._floorPoint(event.clientX, event.clientY);
    if (!point) return;
    this.cameraController.setUserControl(false);
    this.canvas.setPointerCapture?.(event.pointerId);
    this._drag = {
      pointerId: event.pointerId,
      offsetX: hit.root.position.x - point.x,
      offsetZ: hit.root.position.z - point.z,
    };
    this.canvas.style.cursor = 'grabbing';
  }

  _onPointerMove(event) {
    const drag = this._drag;
    if (drag && event.pointerId === drag.pointerId) {
      const point = this._floorPoint(event.clientX, event.clientY);
      const record = this._selected();
      if (!point || !record) return;
      const { ok, box } = this._tryMove(record, snap(point.x + drag.offsetX), snap(point.z + drag.offsetZ));
      if (ok !== this.valid) {
        this.valid = ok;
        this._emit();
      }
      this._updateMarker(ok ? null : box);
      return;
    }
    if (event.pointerType === 'mouse' && event.buttons === 0) this._hover = { x: event.clientX, y: event.clientY };
  }

  _onPointerUp(event) {
    this._pointers.delete(event.pointerId);
    if (this._drag?.pointerId === event.pointerId) this._endDrag();
    const press = this._press;
    this._press = null;
    if (!press || press.id !== event.pointerId || event.type === 'pointercancel') return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > TAP_MAX_MOVE_PX || performance.now() - press.time > TAP_MAX_MS) return;

    if (this.pendingId) {
      this._movePendingTo(event.clientX, event.clientY);
      this.commitPlacement();
    } else if (!press.hit) {
      this.deselect();
    }
  }

  _endDrag() {
    if (!this._drag) return;
    this.canvas.releasePointerCapture?.(this._drag.pointerId);
    this._drag = null;
    this.cameraController.setUserControl(true);
    this.canvas.style.cursor = '';
    this.valid = true;
    this._updateMarker();
    this._touched();
  }

  _movePendingTo(clientX, clientY) {
    const record = this.objects.get(this.pendingId);
    const point = this._floorPoint(clientX, clientY);
    if (!record || !point) return;
    const { ok } = this._tryMove(record, snap(point.x), snap(point.z), { force: true });
    this.valid = ok;
    this._updateMarker();
    this._emit();
  }

  _handleHover(x, y) {
    if (this._drag) return;
    if (this.pendingId) {
      this._movePendingTo(x, y);
      return;
    }
    const record = this.pick(x, y);
    this.canvas.style.cursor = record ? (this._isDraggable(record) ? 'grab' : 'pointer') : '';
  }

  _onKeyDown(event) {
    if (event.defaultPrevented || event.target?.closest?.(TYPING) || document.querySelector('dialog[open]')) return;
    const handled = this._handleKey(event);
    if (handled) event.preventDefault();
  }

  _handleKey(event) {
    switch (event.key) {
      case 'r':
      case 'R':
        if (!this.selectedId) return false;
        this.rotateSelected(event.shiftKey ? -1 : 1);
        return true;
      case 'Delete':
      case 'Backspace':
        return this.deleteSelected();
      case 'Escape':
        if (this.pendingId) this.cancelPlacement();
        else if (this.selectedId) this.deselect();
        else return false;
        return true;
      case 'Enter':
        return this.pendingId ? (this.commitPlacement(), true) : false;
      case 'ArrowLeft':
        return this.nudge(-1, 0) || Boolean(this.selectedId);
      case 'ArrowRight':
        return this.nudge(1, 0) || Boolean(this.selectedId);
      case 'ArrowUp':
        return this.nudge(0, -1) || Boolean(this.selectedId);
      case 'ArrowDown':
        return this.nudge(0, 1) || Boolean(this.selectedId);
      default:
        return false;
    }
  }
}
