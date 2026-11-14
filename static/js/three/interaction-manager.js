import * as THREE from 'three';

const CLICK_MAX_MOVE_PX = 6;
const CLICK_MAX_MS = 600;
const TAP_CLICK_FALLBACK_MS = 350;
const HIGHLIGHT = new THREE.Color('#ffcf7a');
const SAMPLE_GRID = 9;

/**
 * Raycast-based hover and click handling. The first mesh under the pointer wins,
 * so objects hidden behind others can't be clicked through them.
 */
export class InteractionManager {
  constructor({ camera, canvas, scene, resolve, onHoverChange, onSelect }) {
    this.camera = camera;
    this.canvas = canvas;
    this.scene = scene;
    this.resolve = resolve;
    this.onHoverChange = onHoverChange;
    this.onSelect = onSelect;

    this.hovered = null;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._pendingHover = null;
    this._press = null;
    this._activePointers = new Set();
    this._saved = new Map();
    this._highlightMaterials = new Map();
    this._changed = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerLeave = this._onPointerLeave.bind(this);
    this._onClick = this._onClick.bind(this);
    this._tap = null;
    this._tapTimer = null;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerleave', this._onPointerLeave);
    canvas.addEventListener('click', this._onClick);
  }

  /** Processes at most one hover raycast per frame. Returns true if highlighting changed. */
  update() {
    if (this._pendingHover) {
      const { x, y } = this._pendingHover;
      this._pendingHover = null;
      this._setHovered(this.pick(x, y), { x, y });
    }
    const changed = this._changed;
    this._changed = false;
    return changed;
  }

  pick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObjects(this.scene.children, true);
    const hit = hits.find((h) => h.object.isMesh && h.object.visible);
    if (!hit) return null;
    const record = this.resolve(hit.object);
    return record?.interaction ? record : null;
  }

  /** Finds a client-space point where the given object is visible and clickable. */
  findScreenPoint(record) {
    const rect = this.canvas.getBoundingClientRect();
    const box = new THREE.Box3().setFromObject(record.root);
    const corners = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z).project(this.camera));
      }
    }
    if (corners.every((c) => c.z > 1)) return null;
    const toClient = (c) => ({ x: rect.left + ((c.x + 1) / 2) * rect.width, y: rect.top + ((1 - c.y) / 2) * rect.height });
    const points = corners.map(toClient);
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
        if (this.pick(x, y) === record) return { x, y };
      }
    }
    return null;
  }

  /** Temporarily removes highlighting so callers can swap materials safely. */
  withoutHighlight(fn) {
    const hovered = this.hovered;
    this._applyHighlight(null);
    try {
      return fn();
    } finally {
      this._applyHighlight(hovered);
      this._changed = true;
    }
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerleave', this._onPointerLeave);
    this.canvas.removeEventListener('click', this._onClick);
    this._clearTap();
    this._applyHighlight(null);
    for (const material of this._highlightMaterials.values()) material.dispose();
    this._highlightMaterials.clear();
    this.canvas.style.cursor = '';
  }

  _onPointerDown(event) {
    this._activePointers.add(event.pointerId);
    if (this._activePointers.size > 1) {
      this._press = null;
      return;
    }
    this._press = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
  }

  _onPointerUp(event) {
    this._activePointers.delete(event.pointerId);
    const press = this._press;
    this._press = null;
    this._clearTap();
    if (!press || press.id !== event.pointerId || event.type === 'pointercancel') return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > CLICK_MAX_MOVE_PX || performance.now() - press.time > CLICK_MAX_MS) return;
    this._tap = { x: event.clientX, y: event.clientY };
    // Browsers skip the click for taps that interrupt a fling, so don't wait forever.
    this._tapTimer = window.setTimeout(() => this._selectTap(), TAP_CLICK_FALLBACK_MS);
  }

  // Selection normally happens on "click" (which follows pointerup) so that a dialog
  // opened by the interaction doesn't receive the tap's own click and close again.
  _onClick() {
    this._selectTap();
  }

  _selectTap() {
    const tap = this._tap;
    this._clearTap();
    if (!tap) return;
    const record = this.pick(tap.x, tap.y);
    if (record) this.onSelect?.(record);
  }

  _clearTap() {
    this._tap = null;
    if (this._tapTimer) window.clearTimeout(this._tapTimer);
    this._tapTimer = null;
  }

  _onPointerMove(event) {
    if (event.pointerType !== 'mouse') return;
    if (event.buttons !== 0) {
      if (this.hovered) this._setHovered(null);
      return;
    }
    this._pendingHover = { x: event.clientX, y: event.clientY };
  }

  _onPointerLeave() {
    this._pendingHover = null;
    this._setHovered(null);
  }

  _setHovered(record, point = null) {
    if (record === this.hovered) {
      if (record && point) this.onHoverChange?.(record, point);
      return;
    }
    this._applyHighlight(record);
    this.canvas.style.cursor = record ? 'pointer' : '';
    this._changed = true;
    this.onHoverChange?.(record, point);
  }

  _applyHighlight(record) {
    for (const [mesh, material] of this._saved) mesh.material = material;
    this._saved.clear();
    this.hovered = record;
    if (!record) return;
    record.root.traverse((child) => {
      if (!child.isMesh) return;
      this._saved.set(child, child.material);
      child.material = Array.isArray(child.material)
        ? child.material.map((m) => this._highlighted(m))
        : this._highlighted(child.material);
    });
  }

  _highlighted(material) {
    let highlighted = this._highlightMaterials.get(material);
    if (!highlighted) {
      highlighted = material.clone();
      if (highlighted.emissive) {
        highlighted.emissive = material.emissive.clone().lerp(HIGHLIGHT, 0.65);
        highlighted.emissiveIntensity = Math.max(material.emissiveIntensity ?? 0, 0.32);
      } else if (highlighted.color) {
        highlighted.color = material.color.clone().lerp(HIGHLIGHT, 0.3);
      }
      this._highlightMaterials.set(material, highlighted);
    }
    return highlighted;
  }
}
