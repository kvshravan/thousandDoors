import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const RESET_SPEED = 6;
const RESET_EPSILON = 0.002;

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
    this._onChange = () => {
      this._changed = true;
    };
    this._onStart = () => {
      this._resetting = false;
    };
    controls.addEventListener('change', this._onChange);
    controls.addEventListener('start', this._onStart);

    camera.position.copy(this.home.position);
    controls.target.copy(this.home.target);
    controls.update();
  }

  /** Returns true when the camera moved and the frame should be re-rendered. */
  update(dt) {
    if (this._resetting) this._stepReset(dt);
    this.controls.update(dt);
    if (this._clampToBounds()) this._changed = true;

    const changed = this._changed || this._resetting;
    this._changed = false;
    return changed;
  }

  resetView() {
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
    this.controls.removeEventListener('change', this._onChange);
    this.controls.removeEventListener('start', this._onStart);
    this.controls.dispose();
  }

  _stepReset(dt) {
    const alpha = 1 - Math.exp(-RESET_SPEED * dt);
    this.camera.position.lerp(this.home.position, alpha);
    this.controls.target.lerp(this.home.target, alpha);
    const done =
      this.camera.position.distanceTo(this.home.position) < RESET_EPSILON &&
      this.controls.target.distanceTo(this.home.target) < RESET_EPSILON;
    if (done) {
      this.camera.position.copy(this.home.position);
      this.controls.target.copy(this.home.target);
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
    if (this.bounds.containsPoint(position)) return false;

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
    return true;
  }
}
