import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RESET_SPEED = 6;
const RESET_EPSILON = 0.002;
// Movements smaller than this (0.1 mm, squared) are invisible and count as idle.
const MOVE_EPSILON_SQ = 1e-8;
const MIN_FRAME_S = 1 / 240;

/**
 * Orbit-style camera that stays inside the room: limited zoom, limited tilt,
 * no panning, and a hard clamp to the room's interior box.
 */
export class CameraController {
  constructor(camera, domElement, settings, bounds) {
    this.camera = camera;
    this.settings = settings;
    this.bounds = bounds;
    this.home = {
      position: new THREE.Vector3(...settings.initialPosition),
      target: new THREE.Vector3(...settings.target),
    };

    const controls = new OrbitControls(camera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = settings.dampingFactor;
    controls.enablePan = false;
    controls.rotateSpeed = settings.rotateSpeed;
    controls.zoomSpeed = settings.zoomSpeed;
    controls.minDistance = settings.minDistance;
    controls.maxDistance = settings.maxDistance;
    controls.minPolarAngle = settings.minPolarAngle;
    controls.maxPolarAngle = settings.maxPolarAngle;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls = controls;

    this._changed = true;
    this._resetting = false;
    this._goal = this.home;
    this.idle = false;
    this._lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._lastTarget = new THREE.Vector3(Infinity, Infinity, Infinity);
    this._onStart = () => {
      this._resetting = false;
    };
    controls.addEventListener('start', this._onStart);

    camera.position.copy(this.home.position);
    controls.target.copy(this.home.target);
    controls.update();
  }

  /** Returns true when the camera moved and the frame should be re-rendered. */
  update(dt) {
    // OrbitControls damps per frame; scale it by elapsed time so the camera glides and
    // settles in the same time at 10 fps (software rendering) as at 120 fps.
    const frames = Math.max(dt, MIN_FRAME_S) * 60;
    this.controls.dampingFactor = 1 - (1 - this.settings.dampingFactor) ** frames;
    if (this._resetting) this._stepReset(dt);
    this.controls.update(dt);
    this._clampToBounds();

    // Compare actual poses rather than trusting OrbitControls' "change" event, which
    // can fire every frame at the zoom limit because of floating-point rounding.
    const moved =
      this._lastPosition.distanceToSquared(this.camera.position) > MOVE_EPSILON_SQ ||
      this._lastTarget.distanceToSquared(this.controls.target) > MOVE_EPSILON_SQ;
    if (moved) {
      this._lastPosition.copy(this.camera.position);
      this._lastTarget.copy(this.controls.target);
    }
    const changed = moved || this._changed || this._resetting;
    this._changed = false;
    this.idle = !changed;
    return changed;
  }

  resetView() {
    this.flyTo(this.home);
  }

  /** Overrides how far the camera may tilt; pass nothing to restore the defaults. */
  setPolarLimits(min = this.settings.minPolarAngle, max = this.settings.maxPolarAngle) {
    this.controls.minPolarAngle = min;
    this.controls.maxPolarAngle = max;
  }

  /** Pauses mouse and touch camera control (for example while dragging furniture). */
  setUserControl(enabled) {
    this.controls.enabled = enabled;
  }

  /** Smoothly moves the camera to { position, target } (THREE.Vector3s). A drag cancels it. */
  flyTo({ position, target }) {
    this._goal = { position: position.clone(), target: target.clone() };
    this._resetting = true;
  }

  getDebugInfo() {
    const { position } = this.camera;
    const { target } = this.controls;
    return {
      position: { x: position.x, y: position.y, z: position.z },
      target: { x: target.x, y: target.y, z: target.z },
      distance: this.controls.getDistance(),
      polar: this.controls.getPolarAngle(),
      azimuth: this.controls.getAzimuthalAngle(),
      idle: this.idle,
      aspect: this.camera.aspect,
      fov: this.camera.fov,
      limits: {
        minDistance: this.settings.minDistance,
        maxDistance: this.settings.maxDistance,
        minPolarAngle: this.settings.minPolarAngle,
        maxPolarAngle: this.settings.maxPolarAngle,
        bounds: {
          min: this.bounds.min.toArray(),
          max: this.bounds.max.toArray(),
        },
      },
    };
  }

  dispose() {
    this.controls.removeEventListener('start', this._onStart);
    this.controls.dispose();
  }

  _stepReset(dt) {
    const alpha = 1 - Math.exp(-RESET_SPEED * dt);
    this.camera.position.lerp(this._goal.position, alpha);
    this.controls.target.lerp(this._goal.target, alpha);
    const done =
      this.camera.position.distanceTo(this._goal.position) < RESET_EPSILON &&
      this.controls.target.distanceTo(this._goal.target) < RESET_EPSILON;
    if (done) {
      this.camera.position.copy(this._goal.position);
      this.controls.target.copy(this._goal.target);
      this._resetting = false;
      this._changed = true;
    }
  }

  /**
   * If the camera is outside the room box, pulls it back toward the target along
   * the view ray. Keeping the angle unchanged avoids fighting OrbitControls.
   */
  _clampToBounds() {
    const position = this.camera.position;
    if (this.bounds.containsPoint(position)) return;

    const target = this.controls.target;
    const offset = position.clone().sub(target);
    let t = 1;
    for (const axis of ['x', 'y', 'z']) {
      const delta = offset[axis];
      if (delta > 0 && target[axis] + delta > this.bounds.max[axis]) {
        t = Math.min(t, (this.bounds.max[axis] - target[axis]) / delta);
      } else if (delta < 0 && target[axis] + delta < this.bounds.min[axis]) {
        t = Math.min(t, (this.bounds.min[axis] - target[axis]) / delta);
      }
    }
    position.copy(target).addScaledVector(offset, Math.max(t, 0));
  }
}
