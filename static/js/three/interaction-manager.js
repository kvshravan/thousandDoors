import * as THREE from 'three';
import { findScreenPoint, setRayFromClient } from './screen-point.js';

const CLICK_MAX_MOVE_PX = 6;
const CLICK_MAX_MS = 600;
const TAP_CLICK_FALLBACK_MS = 350;
const HIGHLIGHT = new THREE.Color('#ffcf7a');

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

    this.enabled = true;
    this.hovered = null;
    this._raycaster = new THREE.Raycaster();
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
    if (!setRayFromClient(this._raycaster, this.camera, this.canvas, clientX, clientY)) return null;
    const hits = this._raycaster.intersectObjects(this.scene.children, true);
    const hit = hits.find((h) => h.object.isMesh && h.object.visible);
    if (!hit) return null;
    const record = this.resolve(hit.object);
    return record?.interaction ? record : null;
  }

  /** Finds a client-space point where the given object is visible and clickable. */
  findScreenPoint(record) {
    return findScreenPoint({
      camera: this.camera,
      canvas: this.canvas,
      root: record.root,
      isHit: (x, y) => this.pick(x, y) === record,
    });
  }

  /** Turns hover and click handling off (for example while editing the room). */
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this._pendingHover = null;
      this._press = null;
      this._clearTap();
      this._setHovered(null);
    }
  }

  /** Drops cached highlight materials, which go stale when the room's palette changes. */
  resetHighlights() {
    const hovered = this.hovered;
    this._applyHighlight(null);
    for (const material of this._highlightMaterials.values()) material.dispose();
    this._highlightMaterials.clear();
    this._applyHighlight(hovered);
    this._changed = true;
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
    if (!this.enabled || this._activePointers.size > 1) {
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
    if (!tap || !this.enabled) return;
    const record = this.pick(tap.x, tap.y);
    if (!record) return;
    // Interactions often move the camera or open a panel, so drop any stale hover.
    this._pendingHover = null;
    this._setHovered(null);
    this.onSelect?.(record);
  }

  _clearTap() {
    this._tap = null;
    if (this._tapTimer) window.clearTimeout(this._tapTimer);
    this._tapTimer = null;
  }

  _onPointerMove(event) {
    if (!this.enabled || event.pointerType !== 'mouse') return;
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
