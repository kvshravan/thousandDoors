import * as THREE from 'three';
import { buildRails } from './rails.js';
import { buildDoorModel, DOOR, DoorFleet, doorColor } from './doors.js';
import { buildLanding, buildRailMeshes, buildVault, VAULT } from './vault.js';

const OVERVIEW = { position: new THREE.Vector3(0, 3.4, 19.5), yaw: 0, pitch: 0.1, fov: 60 };
const HERO = { position: new THREE.Vector3(-4, 5.5, 27), yaw: 0.16, pitch: 0.06, fov: 50 };
// Where a chosen door comes to rest (its trolley point), and where you stand to see it.
const LANDING_DOOR = new THREE.Vector3(0, DOOR.hang + DOOR.height + 0.02, 10.6);
const LANDING_EYE = new THREE.Vector3(0, 1.25, 14.6);
const DOOR_MIDDLE = -(DOOR.hang + DOOR.height / 2);
const DRAG_SPEED = 0.0042;
const IDLE_DRIFT_DELAY = 5;
const TAP_MOVE_PX = 8;
const FOV_RANGE = [34, 72];
const ARRIVAL = { fly: 1.35, open: 0.75, enter: 0.85 };

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t) => 1 - (1 - t) ** 3;
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);

function lookQuaternion(eye, target, up, out) {
  _m.lookAt(eye, target, up);
  return out.setFromRotationMatrix(_m);
}

function directionQuaternion(yaw, pitch, out) {
  const dir = _w.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  return lookQuaternion(_v.set(0, 0, 0), dir, _up, out);
}

/**
 * The hallway: a vault of rails with doors gliding along them. Modes:
 *  - overview: you stand on the landing; drag to look around, the view drifts when idle
 *  - ride: you ride on top of a door along the coaster (or any rail), banking on bends
 *  - arrive: the chosen door glides to the landing, opens, and you go through
 *  - hero: a fixed, slowly drifting view for the home page (no input)
 * A view for Engine: { scene, camera, update(dt), resize(w, h) }.
 */
export class HallwayScene {
  constructor({ quality, doors = [], hero = false, reducedMotion = false }) {
    this.quality = quality;
    this.hero = hero;
    this.reducedMotion = reducedMotion;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(VAULT.background);
    this.scene.fog = new THREE.FogExp2(VAULT.background, VAULT.fog);
    const start = hero ? HERO : OVERVIEW;
    this.camera = new THREE.PerspectiveCamera(start.fov, 1, 0.1, 400);
    this.camera.position.copy(start.position);
    directionQuaternion(start.yaw, start.pitch, this.camera.quaternion);

    this.rails = buildRails(quality, { hero });
    this.fleet = new DoorFleet({ rails: this.rails, doors });
    this.vault = buildVault({ quality, hero });
    this.railMeshes = buildRailMeshes(this.rails, quality);
    this.landing = hero ? null : buildLanding({ doorY: LANDING_DOOR.y, doorZ: LANDING_DOOR.z });
    this.scene.add(this.vault.group, this.railMeshes.group, this.fleet.group);
    if (this.landing) this.scene.add(this.landing.group);

    this.scene.add(new THREE.HemisphereLight('#b4c6ff', '#2a2448', 2.1));
    const sun = new THREE.DirectionalLight('#ffe0b5', 2.2);
    sun.position.set(-40, 50, 10);
    this.scene.add(sun);
    // A cool fill from behind you, so the faces of the doors turned your way aren't dark.
    const fill = new THREE.DirectionalLight('#c4d2ff', 1.1);
    fill.position.set(10, 12, 60);
    this.scene.add(fill);
    // Spills out of an opening door; dark until then (kept so no shader recompiles).
    this.doorLight = new THREE.PointLight('#ffd09a', 0, 12, 1.6);
    this.doorLight.position.copy(LANDING_DOOR).add(_v.set(0, DOOR_MIDDLE, -0.6));
    this.scene.add(this.doorLight);

    this.time = hero ? 40 : 0;
    this.timeScale = reducedMotion ? 0 : 1;
    // Debug only: slows the arrival down to look at it frame by frame.
    this.arrivalRate = 1;
    this.mode = hero ? 'hero' : 'overview';
    this.rider = null;
    this.arrival = null;
    this.transition = null;
    this.look = { yaw: start.yaw, pitch: start.pitch, targetYaw: start.yaw, targetPitch: start.pitch };
    this.rideLook = { yaw: 0, pitch: 0 };
    this.fov = start.fov;
    this.targetFov = start.fov;
    this.idle = IDLE_DRIFT_DELAY;
    this.dirty = true;
    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._pose = { matrix: new THREE.Matrix4(), point: new THREE.Vector3(), heading: { x: 1, z: 0 }, swing: 0 };
    this._rideQ = new THREE.Quaternion();
    this.fleet.update(this.time);
  }

  // ---- Engine view ----

  resize(width, height) {
    this.camera.aspect = width / height;
    // Keep the vault wide on portrait phones.
    this.portrait = height > width;
    this.camera.updateProjectionMatrix();
    if (this.hero && this.portrait) {
      this.look.pitch = this.look.targetPitch = HERO.pitch - 0.24;
    }
    this.dirty = true;
  }

  update(dt) {
    const step = dt * this.timeScale;
    this.time += step;
    this.idle += dt;
    if (step > 0) this.fleet.update(this.time);
    this.vault.update(step);

    if (this.arrival) this._updateArrival(dt * this.arrivalRate);
    else if (this.transition) this._updateTransition(dt);
    else if (this.mode === 'ride') this._updateRide(dt);
    else this._updateOverview(dt);

    const fov = this.portrait ? Math.min(this.fov + 12, 82) : this.fov;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const changed = this.dirty || step > 0 || this.transition || this.arrival || this.mode === 'ride';
    this.dirty = false;
    return Boolean(changed);
  }

  // ---- Camera modes ----

  _updateOverview(dt) {
    const base = this.hero ? HERO : OVERVIEW;
    // On a portrait phone the home page's words sit low, so the doors go up top.
    const basePitch = this.hero && this.portrait ? base.pitch - 0.24 : base.pitch;
    let { targetYaw, targetPitch } = this.look;
    // Drift slowly when nobody is steering.
    if (this.idle > IDLE_DRIFT_DELAY && !this.reducedMotion) {
      const drift = Math.min(1, (this.idle - IDLE_DRIFT_DELAY) / 4);
      targetYaw += (base.yaw + Math.sin(this.time * 0.06) * (this.hero ? 0.1 : 0.28) - targetYaw) * drift * damp(dt, 0.6);
      targetPitch += (basePitch + Math.sin(this.time * 0.045) * 0.05 - targetPitch) * drift * damp(dt, 0.6);
      this.look.targetYaw = targetYaw;
      this.look.targetPitch = targetPitch;
    } else if (this.hero) {
      this.look.targetPitch = targetPitch = basePitch;
    }
    const k = damp(dt, 7);
    this.look.yaw += (targetYaw - this.look.yaw) * k;
    this.look.pitch += (targetPitch - this.look.pitch) * k;
    this.fov += (this.targetFov - this.fov) * k;
    this.camera.position.copy(base.position);
    directionQuaternion(this.look.yaw, this.look.pitch, this.camera.quaternion);
  }

  /** The camera pose riding `slot` now: just above and behind its trolley, looking ahead. */
  _ridePose(slot, outPosition, outQuaternion) {
    const pose = this.fleet.pose(slot, this.time, this._pose);
    const sign = Math.sign(slot.rail.speed) || 1;
    const ahead = slot.rail.sample(this.fleet.distance(slot, this.time) + sign * 7, {
      point: new THREE.Vector3(),
      heading: { x: 1, z: 0 },
      swing: 0,
    }).point;
    const forward = _w.set(pose.heading.x * sign, 0, pose.heading.z * sign);
    outPosition.copy(pose.point).addScaledVector(_up, 0.75).addScaledVector(forward, -1.7);
    const target = ahead.addScaledVector(_up, 0.15);
    // Lean into the bend, opposite to the door swinging out.
    const roll = -pose.swing * 0.75 * sign;
    const right = _v.crossVectors(forward, _up).normalize();
    const up = new THREE.Vector3().copy(_up).multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll));
    lookQuaternion(outPosition, target, up, outQuaternion);
    // Looking around while riding.
    if (this.rideLook.yaw || this.rideLook.pitch) {
      outQuaternion.multiply(_q.setFromEuler(new THREE.Euler(this.rideLook.pitch, this.rideLook.yaw, 0, 'YXZ')));
    }
    return outPosition;
  }

  _updateRide(dt) {
    if (this.idle > 1.5) {
      const k = damp(dt, 2.5);
      this.rideLook.yaw -= this.rideLook.yaw * k;
      this.rideLook.pitch -= this.rideLook.pitch * k;
    }
    this._ridePose(this.rider, this.camera.position, this._rideQ);
    this.camera.quaternion.slerp(this._rideQ, damp(dt, 9));
    this.fov += (66 - this.fov) * damp(dt, 4);
  }

  /** Glides the camera to a moving target ({ position, quaternion, fov } from target()). */
  _startTransition(target, { duration = 1.3, then }) {
    this.transition = {
      fromPosition: this.camera.position.clone(),
      fromQuaternion: this.camera.quaternion.clone(),
      fromFov: this.fov,
      target,
      t: 0,
      duration: this.reducedMotion ? 0.01 : duration,
      then,
    };
  }

  _updateTransition(dt) {
    const tr = this.transition;
    tr.t = Math.min(1, tr.t + dt / tr.duration);
    const e = ease(tr.t);
    const goal = tr.target();
    this.camera.position.lerpVectors(tr.fromPosition, goal.position, e);
    this.camera.quaternion.slerpQuaternions(tr.fromQuaternion, goal.quaternion, e);
    this.fov = tr.fromFov + (goal.fov - tr.fromFov) * e;
    if (tr.t >= 1) {
      this.transition = null;
      tr.then?.();
    }
  }

  _overviewTarget() {
    const quaternion = directionQuaternion(OVERVIEW.yaw, OVERVIEW.pitch, new THREE.Quaternion());
    return { position: OVERVIEW.position, quaternion, fov: OVERVIEW.fov };
  }

  // ---- Commands ----

  /** Ride a door (a slot, or by default a claimed door on the coaster). */
  ride(slot = null) {
    if (this.hero || this.arrival || this.reducedMotion) return null;
    const target = slot ?? this._defaultRide();
    if (!target) return null;
    const previous = this.rider;
    this.rider = target;
    this.rideLook.yaw = 0;
    this.rideLook.pitch = 0;
    this.fleet.highlight(null);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    this._startTransition(
      () => {
        this._ridePose(target, position, quaternion);
        return { position, quaternion, fov: 66 };
      },
      {
        duration: previous ? 1.1 : 1.6,
        then: () => {
          this.mode = 'ride';
        },
      },
    );
    this.mode = 'riding-in';
    return target;
  }

  hopOff() {
    if (!this.rider || this.arrival) return;
    this.rider = null;
    this._resetLook();
    this._startTransition(() => this._overviewTarget(), {
      duration: 1.5,
      then: () => {
        this.mode = 'overview';
      },
    });
    this.mode = 'hopping-off';
  }

  _resetLook() {
    this.look.yaw = this.look.targetYaw = OVERVIEW.yaw;
    this.look.pitch = this.look.targetPitch = OVERVIEW.pitch;
    this.targetFov = OVERVIEW.fov;
    this.idle = 0;
  }

  _defaultRide() {
    const coaster = this.fleet.slots.filter((slot) => slot.rail.role === 'ride');
    const claimed = coaster.filter((slot) => slot.door);
    const pool = claimed.length ? claimed : coaster;
    // The one coming round soonest is nicest to jump onto.
    return pool.reduce((best, slot) => {
      this.fleet.pose(slot, this.time, this._pose);
      const d = this._pose.point.distanceTo(LANDING_DOOR);
      return !best || d < best.d ? { slot, d } : best;
    }, null)?.slot;
  }

  /**
   * The chosen door glides to the landing and opens, and the camera goes through.
   * onEnter fires as the camera starts through the doorway (fade the page then);
   * the promise resolves when it's through.
   */
  arrive(slot, { onOpen, onEnter } = {}) {
    if (this.arrival) return this.arrival.promise;
    this.transition = null;
    this.fleet.highlight(null);
    if (this.reducedMotion || this.hero) {
      onEnter?.();
      return Promise.resolve();
    }
    const pose = this.fleet.pose(slot, this.time, this._pose);
    const startPosition = pose.point.clone();
    const startQuaternion = new THREE.Quaternion().setFromRotationMatrix(_m.extractRotation(pose.matrix));
    const model = buildDoorModel({
      color: slot.door ? doorColor(slot.door.color) : slot.base.getStyle(),
      name: slot.door?.name ?? 'Unclaimed',
    });
    model.group.position.copy(startPosition);
    model.group.quaternion.copy(startQuaternion);
    this.scene.add(model.group);
    this.landing?.showRail(true);
    this.fleet.setHidden(slot, true);
    this.fleet.update(this.time);

    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    this.arrival = {
      slot,
      model,
      phase: 'fly',
      t: 0,
      promise,
      resolve,
      onOpen,
      onEnter,
      startPosition,
      startQuaternion,
      control1: startPosition.clone().add(_v.set(0, 3.5, 0)),
      control2: LANDING_DOOR.clone().add(_v.set(0, 3, -7)),
      cameraFrom: this.camera.position.clone(),
      cameraFromQuaternion: this.camera.quaternion.clone(),
      fovFrom: this.fov,
    };
    this.rider = null;
    this.mode = 'arriving';
    return promise;
  }

  _updateArrival(dt) {
    const a = this.arrival;
    const doorMiddle = _w.copy(LANDING_DOOR).add(_v.set(0, DOOR_MIDDLE, 0));
    if (a.phase === 'fly') {
      a.t = Math.min(1, a.t + dt / ARRIVAL.fly);
      const e = ease(a.t);
      const u = 1 - e;
      // A cubic Bézier from the rail, up and over, down to the landing.
      a.model.group.position
        .copy(a.startPosition)
        .multiplyScalar(u * u * u)
        .addScaledVector(a.control1, 3 * u * u * e)
        .addScaledVector(a.control2, 3 * u * e * e)
        .addScaledVector(LANDING_DOOR, e * e * e);
      a.model.group.quaternion.slerpQuaternions(a.startQuaternion, _q.identity(), e);
      this.camera.position.lerpVectors(a.cameraFrom, LANDING_EYE, e);
      lookQuaternion(LANDING_EYE, doorMiddle, _up, _q);
      this.camera.quaternion.slerpQuaternions(a.cameraFromQuaternion, _q, e);
      this.fov = a.fovFrom + (48 - a.fovFrom) * e;
      if (a.t >= 1) {
        a.phase = 'open';
        a.t = 0;
        a.onOpen?.();
      }
    } else if (a.phase === 'open') {
      a.t = Math.min(1, a.t + dt / ARRIVAL.open);
      const e = easeOut(a.t);
      a.model.hinge.rotation.y = -1.45 * e;
      a.model.portal.material.opacity = e;
      this.doorLight.intensity = 9 * e;
      if (a.t >= 1) {
        a.phase = 'enter';
        a.t = 0;
        a.onEnter?.();
      }
    } else if (a.phase === 'enter') {
      a.t = Math.min(1, a.t + dt / ARRIVAL.enter);
      const e = ease(a.t);
      this.camera.position.lerpVectors(LANDING_EYE, _v.copy(doorMiddle).add(_w.set(0, 0, -0.8)), e);
      this.fov = 48 + 24 * e;
      if (a.t >= 1) {
        a.phase = 'through';
        a.resolve();
      }
    }
  }

  /** Puts everything back after an arrival (for example when the page is shown again). */
  resetArrival() {
    const a = this.arrival;
    if (!a) return;
    this.scene.remove(a.model.group);
    a.model.dispose();
    this.fleet.setHidden(a.slot, false);
    this.landing?.showRail(false);
    this.doorLight.intensity = 0;
    this.arrival = null;
    this.mode = 'overview';
    this._resetLook();
    this.camera.position.copy(OVERVIEW.position);
    this.fov = OVERVIEW.fov;
    this.dirty = true;
  }

  // ---- Input ----

  /** Turns the view by a pointer drag of (dx, dy) pixels. */
  lookBy(dx, dy) {
    this.idle = 0;
    if (this.mode === 'ride') {
      this.rideLook.yaw = THREE.MathUtils.clamp(this.rideLook.yaw - dx * DRAG_SPEED, -1.2, 1.2);
      this.rideLook.pitch = THREE.MathUtils.clamp(this.rideLook.pitch - dy * DRAG_SPEED, -0.6, 0.6);
    } else if (this.mode === 'overview') {
      this.look.targetYaw = THREE.MathUtils.clamp(this.look.targetYaw - dx * DRAG_SPEED, -1.25, 1.25);
      this.look.targetPitch = THREE.MathUtils.clamp(this.look.targetPitch - dy * DRAG_SPEED, -0.45, 0.75);
    }
    this.dirty = true;
  }

  zoomBy(delta) {
    this.idle = 0;
    this.targetFov = THREE.MathUtils.clamp(this.targetFov + delta, ...FOV_RANGE);
    this.dirty = true;
  }

  /** The door under a client point, or null. */
  pick(clientX, clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hits = this._raycaster.intersectObject(this.fleet.picker, false);
    for (const hit of hits) {
      const slot = this.fleet.slotForInstance(hit.instanceId);
      if (slot && !slot.hidden && slot !== this.rider) return slot;
    }
    return null;
  }

  highlight(slot) {
    this.fleet.highlight(slot);
    this.dirty = true;
  }

  /** Where a door's middle is on screen (client pixels), or null if it isn't clickable there. */
  screenPoint(slot, canvas) {
    const pose = this.fleet.pose(slot, this.time, this._pose);
    const e = pose.matrix.elements;
    const middle = _v.set(e[12] + e[4] * DOOR_MIDDLE, e[13] + e[5] * DOOR_MIDDLE, e[14] + e[6] * DOOR_MIDDLE);
    this.camera.updateMatrixWorld();
    middle.project(this.camera);
    if (middle.z > 1 || Math.abs(middle.x) > 0.95 || Math.abs(middle.y) > 0.95) return null;
    const rect = canvas.getBoundingClientRect();
    const point = { x: rect.left + ((middle.x + 1) / 2) * rect.width, y: rect.top + ((1 - middle.y) / 2) * rect.height };
    return this.pick(point.x, point.y, canvas) === slot ? point : null;
  }

  getDebugInfo() {
    return {
      mode: this.mode,
      time: this.time,
      timeScale: this.timeScale,
      doors: this.fleet.count,
      claimed: this.fleet.byRoom.size,
      rails: this.rails.map((rail) => ({ id: rail.id, slots: rail.slots, length: Math.round(rail.length) })),
      rider: this.rider ? (this.rider.door?.id ?? `unclaimed:${this.rider.index}`) : null,
      arrival: this.arrival ? { phase: this.arrival.phase, door: this.arrival.slot.door?.id ?? null } : null,
      camera: {
        position: this.camera.position.toArray().map((n) => Number(n.toFixed(3))),
        fov: Number(this.camera.fov.toFixed(2)),
      },
    };
  }

  dispose() {
    if (this.arrival) this.arrival.model.dispose();
    this.fleet.dispose();
    this.vault.dispose();
    this.railMeshes.dispose();
    this.landing?.dispose();
  }
}

/**
 * Pointer and keyboard input for the hallway canvas: drag (or one finger) to look,
 * wheel or pinch to zoom, arrow keys to look. Taps and hover go to callbacks.
 */
export class HallwayControls {
  constructor(view, canvas, { onTap, onHover } = {}) {
    this.view = view;
    this.canvas = canvas;
    this.onTap = onTap;
    this.onHover = onHover;
    this.pointers = new Map();
    this.press = null;
    this.pinch = null;
    this._down = (e) => this._onDown(e);
    this._move = (e) => this._onMove(e);
    this._up = (e) => this._onUp(e);
    this._wheel = (e) => this._onWheel(e);
    this._key = (e) => this._onKey(e);
    this._leave = () => onHover?.(null, null);
    canvas.addEventListener('pointerdown', this._down);
    canvas.addEventListener('pointermove', this._move);
    canvas.addEventListener('pointerup', this._up);
    canvas.addEventListener('pointercancel', this._up);
    canvas.addEventListener('pointerleave', this._leave);
    canvas.addEventListener('wheel', this._wheel, { passive: false });
    canvas.addEventListener('keydown', this._key);
  }

  _onDown(event) {
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.setPointerCapture?.(event.pointerId);
    if (this.pointers.size === 1) {
      this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
    } else {
      this.press = null;
      const [a, b] = [...this.pointers.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  _onMove(event) {
    const last = this.pointers.get(event.pointerId);
    if (!last) {
      if (event.pointerType === 'mouse') this.onHover?.(event.clientX, event.clientY);
      return;
    }
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last.x = event.clientX;
    last.y = event.clientY;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch) this.view.zoomBy((this.pinch - distance) * 0.06);
      this.pinch = distance;
      return;
    }
    if (this.press?.id === event.pointerId) this.press.moved += Math.abs(dx) + Math.abs(dy);
    if (!this.press || this.press.moved > TAP_MOVE_PX) this.view.lookBy(dx, dy);
  }

  _onUp(event) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const press = this.press;
    if (press?.id === event.pointerId) {
      this.press = null;
      if (event.type === 'pointerup' && press.moved <= TAP_MOVE_PX) this.onTap?.(event.clientX, event.clientY);
    }
  }

  _onWheel(event) {
    event.preventDefault();
    this.view.zoomBy(Math.sign(event.deltaY) * 3);
  }

  _onKey(event) {
    const step = 40;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      const [dx, dy] = moves[event.key];
      // Arrow keys turn the way they point (the opposite of dragging the view).
      this.view.lookBy(-dx, -dy);
    } else if (event.key === '+' || event.key === '=') {
      this.view.zoomBy(-4);
    } else if (event.key === '-') {
      this.view.zoomBy(4);
    }
  }

  dispose() {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._down);
    c.removeEventListener('pointermove', this._move);
    c.removeEventListener('pointerup', this._up);
    c.removeEventListener('pointercancel', this._up);
    c.removeEventListener('pointerleave', this._leave);
    c.removeEventListener('wheel', this._wheel);
    c.removeEventListener('keydown', this._key);
  }
}
