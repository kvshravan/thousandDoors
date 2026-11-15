import * as THREE from 'three';
import {
  canPlace,
  GRID_STEP,
  isInside,
  normalizeAngle,
  overlaps,
  ROTATION_STEP,
  shiftInside,
  snap,
  spiral,
  translateBox,
} from './placement.js';
import { ITEM_COLORS, ITEM_SIZES, LIGHT_COLORS, LIGHT_EFFECTS, sizeForScale } from './room-config.js';
import { findScreenPoint, setRayFromClient } from './screen-point.js';

const TAP_MAX_MOVE_PX = 6;
const TAP_MAX_MS = 600;
// Objects whose lowest point is below this stand on the floor.
const FLOOR_LEVEL = 0.05;
const WALL_GAP = 0.02;
// Wall items hang this far in front of the wall surface.
const WALL_OFFSET = 0.03;
// Small things move in finer steps than furniture.
const FINE_STEP = 0.05;
const NUDGE_FINE = 0.1;
const SEARCH_RADIUS = 4.5;
// A surface item may overhang its support by this much.
const SUPPORT_OVERHANG = 0.08;
// Surface items closer in height than this are on the same shelf and may not overlap.
const SAME_LEVEL = 0.04;
// A hit face counts as a top surface when its normal points at least this much up.
const UP_FACING = 0.7;
const EDIT_VIEW = {
  position: new THREE.Vector3(0, 3.6, 3.4),
  target: new THREE.Vector3(0, 0, -0.4),
  minPolar: 0.35,
  maxPolar: 1.3,
};
const MARKER_VALID = '#7fd18b';
const MARKER_INVALID = '#e0604f';
const MARKER_PAD = 0.12;
const MOVABLE = new Set(['floor', 'surface', 'wall', 'ceiling']);
const TYPING = 'input, textarea, select, [contenteditable="true"]';

const _box = new THREE.Box3();
const _up = new THREE.Vector3(0, 1, 0);
const _down = new THREE.Vector3(0, -1, 0);
const _normal = new THREE.Vector3();

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

/** The four walls, each with the direction into the room and "right" as seen facing it. */
function createWalls({ width, depth }) {
  const make = (name, normal, distance, half) => {
    const n = new THREE.Vector3(...normal);
    return {
      name,
      normal: n,
      right: new THREE.Vector3().crossVectors(n.clone().negate(), _up),
      // The centre of the wall at floor level, nudged into the room.
      origin: n.clone().multiplyScalar(-(distance - WALL_OFFSET)),
      plane: new THREE.Plane(n, distance),
      half,
      axis: n.x === 0 ? 'x' : 'z',
      rotationY: Math.atan2(n.x, n.z),
    };
  };
  return [
    make('back', [0, 0, 1], depth / 2, width / 2),
    make('front', [0, 0, -1], depth / 2, width / 2),
    make('left', [1, 0, 0], width / 2, depth / 2),
    make('right', [-1, 0, 0], width / 2, depth / 2),
  ];
}

/**
 * Edit mode for a RoomScene: select, drag, rotate, resize, recolour, delete, and
 * place things. Each kind of item moves its own way:
 *   floor    snaps to a grid, stays inside the walls, can't overlap other furniture
 *   surface  stands on whatever furniture is under the pointer (or the floor)
 *   wall     slides along any of the four walls without overlapping other wall items
 *   ceiling  hangs from the ceiling, clear of other ceiling items
 * Items standing on furniture move, turn, and are removed with it. Fixed parts (door,
 * window) can't move, but can be recoloured if the catalogue allows it.
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
    const { width, depth, height } = scene.dimensions;
    this.height = height;
    this.bounds = {
      minX: -width / 2 + WALL_GAP,
      maxX: width / 2 - WALL_GAP,
      minZ: -depth / 2 + WALL_GAP,
      maxZ: depth / 2 - WALL_GAP,
    };
    this.walls = createWalls(scene.dimensions);

    this.active = false;
    this.selectedId = null;
    this.pendingId = null;
    this.valid = true;
    this.message = '';
    this.busy = false;
    this._children = [];
    this._obstacles = [];
    this._supports = [];
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
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    this._setMessage(touch ? 'Tap something to pick it, then drag it to move.' : 'Drag things to move them, or add something new.');
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
      selected: record ? this._describe(record) : null,
      pending: this.pendingId,
      valid: this.valid,
      busy: this.busy,
      message: this.message,
    };
  }

  // ---- Commands (also used by the page's buttons and by keyboard shortcuts) ----

  select(objectId) {
    const record = this.objects.get(objectId);
    if (!record || !this._isSelectable(record)) return false;
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
    if (!this.active || !entry || entry.addable === false || !MOVABLE.has(entry.placement)) return null;
    this.cancelPlacement();
    const token = ++this._placeToken;
    const id = this._uniqueId(catalogId);
    const record = await this.room.addObject({
      id,
      catalogId,
      position: { x: 0, y: entry.placement === 'ceiling' ? this.height : 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      customData: structuredClone(entry.defaults ?? {}),
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
    if (!this._findSpot(record)) {
      this.cancelPlacement();
      this._setMessage(`There's no free space for the ${entry.name.toLowerCase()}.`);
      return null;
    }
    this.valid = true;
    this._updateMarker();
    const where = { wall: 'a wall', ceiling: 'the floor below where it should hang', surface: 'a table, shelf, or the floor' };
    this._setMessage(`Tap or click ${where[entry.placement] ?? 'the floor'} to place the ${entry.name.toLowerCase()}.`);
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
    if (!this._canRotate(record)) {
      this._setMessage(`The ${record.name.toLowerCase()} can't be turned.`);
      return false;
    }
    const angle = Math.sign(direction || 1) * ROTATION_STEP;
    const position = record.root.position.clone();
    return this._changeChecked(record, () => this._moveGroup(record, position, record.root.rotation.y + angle), "There isn't room to turn it here.");
  }

  /** Changes the selected item's size to one of ITEM_SIZES. */
  resizeSelected(size) {
    const record = this._selected();
    const preset = ITEM_SIZES[size];
    if (!record || !preset || !this._canResize(record)) return false;
    const ratio = preset.scale / record.root.scale.x;
    if (Math.abs(ratio - 1) < 1e-6) return true;
    const ok = this._changeChecked(record, () => this._scaleGroup(record, ratio), "There isn't room for it to be that big here.");
    if (ok) this._setMessage(`The ${record.name.toLowerCase()} is now ${preset.label.toLowerCase()}.`);
    return ok;
  }

  /** Recolours the selected item (a key of ITEM_COLORS, or null for its original colour). */
  async recolorSelected(color) {
    const record = this._selected();
    if (!record?.recolor) return false;
    if (color !== null && !Object.hasOwn(ITEM_COLORS, color)) return false;
    if ((record.data.color ?? null) === color) return true;
    const label = color ? ITEM_COLORS[color].label.toLowerCase() : 'its original colour';
    return this._changeData({ color }, `The ${record.name.toLowerCase()} is now ${label}.`);
  }

  /** Changes the selected light: any of { on, color, brightness, effect }. Applied immediately. */
  setLightSelected(changes) {
    const record = this._selected();
    if (!record?.light) return false;
    const state = this.room.setObjectLight(record.id, changes);
    if (!state) return false;
    this._changed = true;
    const words = [];
    if ('on' in changes) words.push(state.on ? 'switched on' : 'switched off');
    if ('color' in changes) words.push(`${LIGHT_COLORS[state.color].label.toLowerCase()} light`);
    if ('brightness' in changes) words.push(`${Math.round(state.brightness * 100)}% bright`);
    if ('effect' in changes) words.push(LIGHT_EFFECTS[state.effect].label.toLowerCase());
    this._setMessage(`The ${record.name.toLowerCase()}: ${words.join(', ')}.`);
    return true;
  }

  /** Changes the selected item's text (a neon sign's words, a poster's title). */
  async setTextSelected(text) {
    const record = this._selected();
    const option = record?.textOption;
    if (!option) return false;
    const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, option.maxLength ?? 24);
    if (!clean) {
      this._setMessage('Type something first.');
      return false;
    }
    return this._changeData({ [option.field]: clean }, `The ${record.name.toLowerCase()} now says “${clean}”.`);
  }

  /**
   * Sets the selected item's song or video ({ provider, kind, id }, already checked
   * by the page), or removes it with null.
   */
  async setLinkSelected(ref, label = '') {
    const record = this._selected();
    const option = record?.linkOption;
    if (!option) return false;
    const message = ref ? `The ${record.name.toLowerCase()} now plays ${label || 'your link'}.` : `Removed the link from the ${record.name.toLowerCase()}.`;
    return this._changeData({ [option.field]: ref ? { provider: ref.provider, kind: ref.kind, id: ref.id } : null }, message);
  }

  /** Puts a photo on the selected frame, or adds it to the selected photo string. */
  async usePhotoSelected(ref) {
    const record = this._selected();
    const option = record?.photoOption;
    if (!option || typeof ref !== 'string') return false;
    if (option.field === 'imageUrl') return this._changeData({ imageUrl: ref }, `New photo in the ${record.name.toLowerCase()}.`);
    const photos = Array.isArray(record.data.photos) ? [...record.data.photos] : [];
    if (photos.length >= option.max) {
      this._setMessage(`The ${record.name.toLowerCase()} holds ${option.max} photos. Remove one first.`);
      return false;
    }
    photos.push(ref);
    return this._changeData({ photos }, `Added a photo (${photos.length} of ${option.max}).`);
  }

  async removePhotoSelected(index) {
    const record = this._selected();
    if (record?.photoOption?.field !== 'photos') return false;
    const photos = Array.isArray(record.data.photos) ? [...record.data.photos] : [];
    if (!(index >= 0 && index < photos.length)) return false;
    photos.splice(index, 1);
    return this._changeData({ photos }, `Removed a photo (${photos.length} left).`);
  }

  /** Rebuilds the selected item with some customData changed. */
  async _changeData(changes, message) {
    const record = this._selected();
    if (!record || this.busy) return false;
    this.busy = true;
    this._emit();
    try {
      const rebuilt = await this.room.restyleObject(record.id, changes);
      if (!rebuilt || !this.active) return false;
      this._refreshContext();
      this._updateMarker();
      this._setMessage(message);
      return true;
    } finally {
      this.busy = false;
      this._emit();
    }
  }

  deleteSelected() {
    const record = this._selected();
    if (!record) return false;
    if (!this._canMove(record)) {
      this._setMessage(`The ${record.name.toLowerCase()} is part of the room and can't be removed.`);
      return false;
    }
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

  /** Moves the selected item a step (keyboard arrows). stepsZ < 0 is away / up a wall. */
  nudge(stepsX, stepsZ) {
    const record = this._selected();
    if (!record || !this._canMove(record)) return false;
    const pending = this.pendingId === record.id;
    const { x, y, z } = record.root.position;
    let result;
    if (record.placement === 'wall') {
      const wall = this._wallOf(record);
      const u = record.root.position.clone().sub(wall.origin).dot(wall.right);
      result = this._tryWallMove(record, wall, u + stepsX * NUDGE_FINE, y - stepsZ * NUDGE_FINE, { force: pending });
    } else if (record.placement === 'surface') {
      // Look for a surface from a little above the item, so it stays on its shelf.
      const target = this._dropAt(x + stepsX * NUDGE_FINE, z + stepsZ * NUDGE_FINE, y + 0.3);
      result = this._trySurfaceMove(record, target, { force: pending });
    } else {
      result = this._tryMove(record, snap(x + stepsX * GRID_STEP), snap(z + stepsZ * GRID_STEP), { force: pending });
    }
    if (pending) this.valid = result.ok;
    else if (!result.ok) this._setMessage('Something is in the way.');
    this._updateMarker();
    this._touched();
    return result.ok;
  }

  /**
   * Nudges the selected item as seen on screen (the phone arrow buttons): dx is
   * right (+1) or left, dy is down (+1) or up. Floor moves follow the nearest
   * room axis to that screen direction; wall items slide along or up their wall.
   */
  nudgeOnScreen(dx, dy) {
    const record = this._selected();
    if (!record) return false;
    this.camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    if (record.placement === 'wall') {
      if (dy) return this.nudge(0, dy);
      return this.nudge(right.dot(this._wallOf(record).right) < 0 ? -dx : dx, 0);
    }
    const move = dx ? right.multiplyScalar(dx) : this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-dy);
    if (Math.abs(move.x) >= Math.abs(move.z)) return this.nudge(Math.sign(move.x), 0);
    return this.nudge(0, Math.sign(move.z));
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
    return record && this._isSelectable(record) ? record : null;
  }

  // ---- Internals ----

  _selected() {
    return this.selectedId ? this.objects.get(this.selectedId) : null;
  }

  _canMove(record) {
    return MOVABLE.has(record.placement);
  }

  _canRotate(record) {
    return this._canMove(record) && record.placement !== 'wall';
  }

  _canResize(record) {
    return this._canMove(record);
  }

  _isSelectable(record) {
    return this._canMove(record) || Boolean(record.recolor) || Boolean(record.light) || Boolean(record.textOption);
  }

  _describe(record) {
    const photoField = record.photoOption?.field;
    let photos = null;
    if (photoField === 'photos') photos = Array.isArray(record.data.photos) ? [...record.data.photos] : [];
    else if (photoField) photos = record.data.imageUrl ? [record.data.imageUrl] : [];
    return {
      id: record.id,
      name: record.name,
      placement: record.placement,
      canMove: this._canMove(record),
      canRotate: this._canRotate(record),
      canResize: this._canResize(record),
      canDelete: this._canMove(record),
      canRecolor: Boolean(record.recolor),
      color: record.data.color ?? null,
      size: sizeForScale(record.root.scale.x),
      light: this.objects.lightState(record),
      text: record.textOption ? { ...record.textOption, value: String(record.data[record.textOption.field] ?? '') } : null,
      link: record.linkOption ? { ...record.linkOption, value: record.data[record.linkOption.field] ?? null } : null,
      photos: photoField ? { ...record.photoOption, value: photos } : null,
      children: this._children.map((child) => child.id),
    };
  }

  /** Recomputes what rides along with the selection, what it may not overlap, and what it may stand on. */
  _refreshContext() {
    const record = this._selected();
    // A new item starts at the room centre; it must not adopt whatever stands there.
    this._children = record && record.id !== this.pendingId ? this._findChildren(record) : [];
    const exclude = new Set([record?.id, ...this._children.map((child) => child.id), this.pendingId]);
    const layer = record?.placement === 'ceiling' ? 'ceiling' : 'floor';
    this._obstacles = [];
    this._supports = [];
    for (const other of this.objects.records.values()) {
      if (exclude.has(other.id)) continue;
      if (other.support && other.placement !== 'surface') this._supports.push(other);
      if (other.flat) continue;
      const box = footprint(other);
      const inLayer = layer === 'ceiling' ? other.placement === 'ceiling' : box.minY < FLOOR_LEVEL;
      if (inLayer) this._obstacles.push(box);
    }
  }

  _findChildren(parent) {
    if (!parent.support || !this._canMove(parent)) return [];
    const base = footprint(parent);
    const onFloor = base.minY < FLOOR_LEVEL;
    const children = [];
    for (const other of this.objects.records.values()) {
      if (other === parent || other.placement !== 'surface') continue;
      const box = footprint(other);
      if (box.minY < FLOOR_LEVEL || box.minY > base.maxY + 0.05) continue;
      if (!onFloor && box.minY < base.minY - 0.01) continue;
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      if (cx >= base.minX && cx <= base.maxX && cz >= base.minZ && cz <= base.maxZ) children.push(other);
    }
    return children;
  }

  /** Puts a new item somewhere it fits, near what the camera is looking at. */
  _findSpot(record) {
    const target = this.cameraController.controls.target;
    if (record.placement === 'wall') {
      const forward = target.clone().sub(this.camera.position).setY(0).normalize();
      const walls = [...this.walls].sort((a, b) => a.normal.dot(forward) - b.normal.dot(forward));
      for (const wall of walls) {
        for (const [u, y] of spiral(0, 1.8, SEARCH_RADIUS)) {
          if (y < 0.3 || y > this.height - 0.3) continue;
          if (this._tryWallMove(record, wall, u, y).ok) return true;
        }
      }
      return false;
    }
    for (const [x, z] of spiral(snap(target.x), snap(target.z), SEARCH_RADIUS)) {
      const ok =
        record.placement === 'surface'
          ? this._trySurfaceMove(record, this._dropAt(x, z, this.height)).ok
          : this._tryMove(record, x, z).ok;
      if (ok) return true;
    }
    return false;
  }

  /**
   * Floor and ceiling items: moves record (and riders) so its origin is at (x, z),
   * shifted back inside the walls if needed. Only moves when the spot is allowed,
   * unless force is set.
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
    if (ok || force) {
      const position = record.root.position.clone();
      position.x += dx;
      position.z += dz;
      this._moveGroup(record, position, record.root.rotation.y);
    }
    return { ok, box: { ...box, minY: current.minY } };
  }

  /** Surface items: stands record on the surface at target ({ x, y, z }). */
  _trySurfaceMove(record, target, { force = false } = {}) {
    if (!target) return { ok: false, box: footprint(record) };
    const saved = record.root.position.clone();
    record.root.position.set(snap(target.x, FINE_STEP), target.y, snap(target.z, FINE_STEP));
    const { ok, box } = this._checkSurface(record);
    if (!ok && !force) record.root.position.copy(saved);
    else this._touched();
    return { ok, box };
  }

  _checkSurface(record) {
    const box = footprint(record);
    if (!isInside(box, this.bounds)) return { ok: false, box };
    if (box.minY < FLOOR_LEVEL) return { ok: canPlace(box, this.bounds, this._obstacles), box };
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const support = this._supports
      .map(footprint)
      .find((base) => {
        const within =
          box.minX >= base.minX - SUPPORT_OVERHANG &&
          box.maxX <= base.maxX + SUPPORT_OVERHANG &&
          box.minZ >= base.minZ - SUPPORT_OVERHANG &&
          box.maxZ <= base.maxZ + SUPPORT_OVERHANG;
        return within && cx > base.minX && cx < base.maxX && cz > base.minZ && cz < base.maxZ &&
          box.minY >= base.minY - 0.01 && box.minY <= base.maxY + 0.02;
      });
    if (!support) return { ok: false, box };
    const exclude = new Set([record.id, ...this._children.map((child) => child.id)]);
    for (const other of this.objects.records.values()) {
      if (exclude.has(other.id) || other.placement !== 'surface') continue;
      const otherBox = footprint(other);
      if (Math.abs(otherBox.minY - box.minY) < SAME_LEVEL && overlaps(box, otherBox)) return { ok: false, box };
    }
    return { ok: true, box };
  }

  /** Wall items: hangs record on wall at u (metres right of the wall's centre) and height y. */
  _tryWallMove(record, wall, u, y, { force = false } = {}) {
    const movers = [record, ...this._children];
    const saved = movers.map((item) => [item.root.position.clone(), item.root.rotation.y]);
    const position = wall.origin.clone().addScaledVector(wall.right, snap(u, FINE_STEP));
    position.y = snap(y, FINE_STEP);
    this._moveGroup(record, position, wall.rotationY);
    const { ok, box } = this._checkWall(record, wall);
    if (!ok && !force) {
      movers.forEach((item, i) => {
        item.root.position.copy(saved[i][0]);
        item.root.rotation.y = saved[i][1];
      });
    } else {
      this._touched();
    }
    return { ok, box };
  }

  _checkWall(record, wall) {
    const box = footprint(record);
    const span = (b) => (wall.axis === 'x' ? [b.minX, b.maxX] : [b.minZ, b.maxZ]);
    const [lo, hi] = span(box);
    const inside = lo >= -wall.half + WALL_GAP && hi <= wall.half - WALL_GAP && box.minY >= WALL_GAP && box.maxY <= this.height - WALL_GAP;
    if (!inside) return { ok: false, box };
    const exclude = new Set([record.id, ...this._children.map((child) => child.id)]);
    for (const other of this.objects.records.values()) {
      if (exclude.has(other.id) || (other.placement !== 'wall' && other.placement !== 'fixed')) continue;
      if (this._wallOf(other) !== wall) continue;
      const otherBox = footprint(other);
      const [olo, ohi] = span(otherBox);
      const clash = lo < ohi - 0.01 && hi > olo + 0.01 && box.minY < otherBox.maxY - 0.01 && box.maxY > otherBox.minY + 0.01;
      if (clash) return { ok: false, box };
    }
    return { ok: true, box };
  }

  /** The wall an object hangs on (the one its origin is closest to). */
  _wallOf(record) {
    const p = record.root.position;
    let best = this.walls[0];
    let bestDistance = Infinity;
    for (const wall of this.walls) {
      const distance = Math.abs(wall.plane.distanceToPoint(p));
      if (distance < bestDistance) {
        best = wall;
        bestDistance = distance;
      }
    }
    return best;
  }

  /**
   * Validates a change by applying it; if the result isn't allowed (and the item
   * isn't still being placed), puts everything back and shows message.
   */
  _changeChecked(record, change, message) {
    const movers = [record, ...this._children];
    const saved = movers.map((item) => [item.root.position.clone(), item.root.rotation.y, item.root.scale.clone()]);
    change();
    let ok;
    if (record.placement === 'wall') ok = this._checkWall(record, this._wallOf(record)).ok;
    else if (record.placement === 'surface') ok = this._checkSurface(record).ok;
    else ok = this._tryMove(record, record.root.position.x, record.root.position.z, { force: true }).ok;
    const pending = this.pendingId === record.id;
    if (ok || pending) {
      this.valid = ok;
      this._updateMarker();
      this._touched();
      return true;
    }
    movers.forEach((item, i) => {
      item.root.position.copy(saved[i][0]);
      item.root.rotation.y = saved[i][1];
      item.root.scale.copy(saved[i][2]);
    });
    this.valid = true;
    this._updateMarker();
    this._setMessage(message);
    return false;
  }

  /** Moves and turns record to (position, rotationY), carrying its riders along. */
  _moveGroup(record, position, rotationY) {
    const pivot = record.root.position;
    const angle = normalizeAngle(rotationY - record.root.rotation.y);
    for (const child of record.id === this.selectedId ? this._children : []) {
      const offset = child.root.position.clone().sub(pivot).applyAxisAngle(_up, angle);
      child.root.position.copy(position).add(offset);
      child.root.rotation.y = normalizeAngle(child.root.rotation.y + angle);
    }
    record.root.position.copy(position);
    record.root.rotation.y = normalizeAngle(rotationY);
    this._touched();
  }

  /** Scales record by ratio; riders keep their size but move with the surface they stand on. */
  _scaleGroup(record, ratio) {
    const pivot = record.root.position;
    for (const child of record.id === this.selectedId ? this._children : []) {
      const offset = child.root.position.clone().sub(pivot).multiplyScalar(ratio);
      child.root.position.copy(pivot).add(offset);
    }
    record.root.scale.multiplyScalar(ratio);
    this._touched();
  }

  /** The top surface below (x, fromY, z): a support's top or shelf, else the floor. */
  _dropAt(x, z, fromY) {
    this._raycaster.set(new THREE.Vector3(x, fromY, z), _down);
    const hit = this._raycaster
      .intersectObjects(this._supports.map((record) => record.root), true)
      .find((h) => h.object.isMesh && h.object.visible && this._facesUp(h));
    return hit ? { x, y: hit.point.y, z } : { x, y: 0, z };
  }

  /** Where a surface item under the pointer should stand. */
  _surfaceTarget(clientX, clientY) {
    if (!setRayFromClient(this._raycaster, this.camera, this.canvas, clientX, clientY)) return null;
    const hit = this._raycaster
      .intersectObjects(this._supports.map((record) => record.root), true)
      .find((h) => h.object.isMesh && h.object.visible);
    if (hit && this._facesUp(hit)) return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    const point = hit?.point ?? this._raycaster.ray.intersectPlane(this._floor, new THREE.Vector3());
    return point ? this._dropAt(point.x, point.z, this.height) : null;
  }

  /** Which wall the pointer is on, and where: { wall, u, y }, or null. */
  _wallTarget(clientX, clientY) {
    if (!setRayFromClient(this._raycaster, this.camera, this.canvas, clientX, clientY)) return null;
    const ray = this._raycaster.ray;
    let best = null;
    for (const wall of this.walls) {
      // Only walls the camera faces from inside the room.
      if (ray.direction.dot(wall.normal) >= 0) continue;
      const point = ray.intersectPlane(wall.plane, new THREE.Vector3());
      if (!point || point.y < 0 || point.y > this.height) continue;
      const u = point.clone().sub(wall.origin).dot(wall.right);
      if (Math.abs(u) > wall.half) continue;
      const distance = point.distanceTo(ray.origin);
      if (!best || distance < best.distance) best = { wall, u, y: point.y, distance };
    }
    return best;
  }

  _facesUp(hit) {
    if (!hit.face) return false;
    _normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
    return _normal.y > UP_FACING;
  }

  /** Moves record toward a client point, by its kind. */
  _dragTo(record, clientX, clientY, { force = false, offset = null } = {}) {
    if (record.placement === 'wall') {
      const target = this._wallTarget(clientX, clientY);
      return target ? this._tryWallMove(record, target.wall, target.u, target.y, { force }) : null;
    }
    if (record.placement === 'surface') {
      const target = this._surfaceTarget(clientX, clientY);
      return target ? this._trySurfaceMove(record, target, { force }) : null;
    }
    const point = this._floorPoint(clientX, clientY);
    if (!point) return null;
    return this._tryMove(record, snap(point.x + (offset?.x ?? 0)), snap(point.z + (offset?.z ?? 0)), { force });
  }

  _createMarker() {
    const marker = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: MARKER_VALID,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    marker.name = 'editor-marker';
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
    const marker = this._marker;
    marker.visible = true;
    marker.material.color.set(this.valid ? MARKER_VALID : MARKER_INVALID);
    this._changed = true;
    if (record.placement === 'wall') {
      // A glow on the wall behind the item.
      const wall = this._wallOf(record);
      const along = wall.axis === 'x' ? area.maxX - area.minX : area.maxZ - area.minZ;
      marker.rotation.set(0, wall.rotationY, 0);
      marker.scale.set(along + MARKER_PAD * 2, area.maxY - area.minY + MARKER_PAD * 2, 1);
      const centre = new THREE.Vector3((area.minX + area.maxX) / 2, (area.minY + area.maxY) / 2, (area.minZ + area.maxZ) / 2);
      // Project the centre onto the wall surface, just in front of it.
      const onWall = wall.plane.projectPoint(centre, new THREE.Vector3()).addScaledVector(wall.normal, 0.005);
      marker.position.copy(onWall);
      return;
    }
    // Padded so the glow shows around the object, not just hidden underneath it.
    const y = box ? footprint(record).minY : area.minY;
    marker.rotation.set(-Math.PI / 2, 0, 0);
    marker.scale.set(area.maxX - area.minX + MARKER_PAD * 2, area.maxZ - area.minZ + MARKER_PAD * 2, 1);
    marker.position.set((area.minX + area.maxX) / 2, y + 0.015, (area.minZ + area.maxZ) / 2);
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
    // On touch, furniture covers most of the view: a swipe that starts on something
    // unselected turns the camera, and a tap selects it (see _onPointerUp). Only the
    // selected thing can be dragged.
    if (event.pointerType !== 'mouse' && hit.id !== this.selectedId) return;
    this.select(hit.id);
    if (!this._canMove(hit) || this.busy) return;
    let offset = null;
    if (hit.placement === 'floor' || hit.placement === 'ceiling') {
      // Keep the grab point under the pointer instead of jumping the origin to it.
      const point = this._floorPoint(event.clientX, event.clientY);
      if (!point) return;
      offset = { x: hit.root.position.x - point.x, z: hit.root.position.z - point.z };
    }
    this.cameraController.setUserControl(false);
    this.canvas.setPointerCapture?.(event.pointerId);
    this._drag = { pointerId: event.pointerId, offset, moved: false, startX: event.clientX, startY: event.clientY };
    this.canvas.style.cursor = 'grabbing';
  }

  _onPointerMove(event) {
    const drag = this._drag;
    if (drag && event.pointerId === drag.pointerId) {
      const record = this._selected();
      if (!record) return;
      // Small things jump to the pointer, so wait for a real drag before moving them.
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) <= TAP_MAX_MOVE_PX) return;
      drag.moved = true;
      const result = this._dragTo(record, event.clientX, event.clientY, { offset: drag.offset });
      if (!result) return;
      if (result.ok !== this.valid) {
        this.valid = result.ok;
        this._emit();
      }
      this._updateMarker(result.ok ? null : result.box);
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
    } else if (press.hit) {
      if (press.hit.id !== this.selectedId) this.select(press.hit.id);
    } else {
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
    if (!record) return;
    const result = this._dragTo(record, clientX, clientY, { force: true });
    if (!result) return;
    this.valid = result.ok;
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
    this.canvas.style.cursor = record ? (this._canMove(record) ? 'grab' : 'pointer') : '';
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
