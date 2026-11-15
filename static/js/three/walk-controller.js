import * as THREE from 'three';

export const EYE_HEIGHT = 1.6;
const WALK_SPEED = 2.4; // m/s along a tapped route
const KEY_SPEED = 1.9; // m/s with the keyboard (Shift: faster)
const RUN_FACTOR = 1.7;
const TURN_SPEED = 1.9; // rad/s with the arrow keys
const LOOK_DAMPING = 16;
const MOVE_DAMPING = 9;
const INERTIA_DECAY = 5.5;
const PITCH_LIMITS = [-1.05, 0.8];
const TAP_SLOP_PX = 6;
const STEP_LENGTH = 0.62; // metres per footstep, for the head bob
const BOB_HEIGHT = 0.024;
const BOB_SWAY = 0.012;
const WHEEL_STEP = 0.7;
const PINCH_METRES_PER_PX = 0.012;
const EPSILON = 1e-5;
const MOVE_KEYS = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  KeyD: 'right',
  ArrowLeft: 'turnLeft',
  ArrowRight: 'turnRight',
};

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

function typingInto(target) {
  return Boolean(target?.closest?.('input, textarea, select, [contenteditable="true"], dialog[open]'));
}

/**
 * First-person camera at eye height. Drag to look around (with a little momentum),
 * tap or click the floor to walk there along a route around the furniture, W A S D or
 * the arrow keys to walk freely, and wheel or pinch to step forward and back.
 */
export class WalkController {
  constructor(camera, canvas, { home, map = null, headBob = true, reducedMotion = false, onMove = null }) {
    this.camera = camera;
    this.canvas = canvas;
    this.map = map;
    this.onMove = onMove;
    this.reducedMotion = reducedMotion;
    this.headBob = headBob && !reducedMotion;
    this.home = home;
    this.enabled = false;
    this.userControl = true;

    this.position = new THREE.Vector3(home.x, EYE_HEIGHT, home.z);
    this.yaw = home.yaw;
    this.pitch = home.pitch;
    this.targetYaw = home.yaw;
    this.targetPitch = home.pitch;
    this.height = EYE_HEIGHT;
    this.targetHeight = EYE_HEIGHT;
    this.seated = false;

    this.route = null; // { points, lengths, total, t, duration }
    this.glide = null; // { from, to, t, duration } (pose changes: seats, switching views)
    this.keys = new Set();
    this.velocity = new THREE.Vector2();
    this.spin = { yaw: 0, pitch: 0 }; // look momentum after a drag (rad/s)
    this.bob = { phase: 0, amount: 0 };
    this.pointers = new Map();
    this._drag = null;
    this._pinch = null;
    this._changed = true;
    this.idle = false;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = () => this.keys.clear();
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  get walking() {
    return Boolean(this.route) || this.velocity.lengthSq() > 0.0004;
  }

  setMap(map) {
    this.map = map;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this._stopInput();
  }

  setUserControl(enabled) {
    this.userControl = enabled;
    if (!enabled) this._stopInput();
  }

  /** The point the camera looks at, `distance` metres ahead. */
  lookTarget(distance = 2, out = new THREE.Vector3()) {
    const cos = Math.cos(this.pitch);
    return out.set(
      this.position.x - Math.sin(this.yaw) * cos * distance,
      this.position.y + Math.sin(this.pitch) * distance,
      this.position.z - Math.cos(this.yaw) * cos * distance,
    );
  }

  /** Walks to a spot on the floor along a route around the furniture. Returns false if it can't. */
  walkTo(x, z) {
    if (!this.map) return false;
    const from = { x: this.position.x, z: this.position.z };
    const path = this.map.findPath(from, { x, z });
    if (!path || path.length < 2) return false;
    const end = path.at(-1);
    if (Math.hypot(end.x - from.x, end.z - from.z) < 0.05) return false;
    this._startRoute(path);
    return true;
  }

  /** Steps forward (or back, if negative) along the view, stopping short of anything in the way. */
  stepBy(metres) {
    if (!this.map) return;
    const base = this.route ? this.route.points.at(-1) : { x: this.position.x, z: this.position.z };
    const to = {
      x: base.x - Math.sin(this.yaw) * metres,
      z: base.z - Math.cos(this.yaw) * metres,
    };
    const end = this.map.reach({ x: this.position.x, z: this.position.z }, to);
    if (Math.hypot(end.x - this.position.x, end.z - this.position.z) > 0.03) {
      this._startRoute([{ x: this.position.x, z: this.position.z }, end]);
    }
  }

  lookBy(dYaw, dPitch) {
    this.targetYaw += dYaw;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dPitch, ...PITCH_LIMITS);
    this._changed = true;
  }

  /** Glides to a pose given as { position, target } (THREE.Vector3s), e.g. sitting down. */
  glideTo({ position, target }, { seated = true } = {}) {
    const dir = target.clone().sub(position);
    const yaw = this._nearestYaw(Math.atan2(-dir.x, -dir.z));
    const pitch = Math.atan2(dir.y, Math.hypot(dir.x, dir.z));
    this.route = null;
    this.velocity.set(0, 0);
    this.seated = seated;
    this._startGlide({ x: position.x, y: position.y, z: position.z, yaw, pitch });
  }

  /** Gets up from a seat: eye height, on free floor nearby, facing the same way. */
  standUp() {
    const spot = this.map?.nearestFree(this.position.x, this.position.z) ?? this.position;
    this.seated = false;
    this._startGlide({ x: spot.x, y: EYE_HEIGHT, z: spot.z, yaw: this.targetYaw, pitch: Math.min(this.targetPitch, 0) });
  }

  /** Back to the start: just inside the door, looking into the room. */
  resetView() {
    this.route = null;
    this.velocity.set(0, 0);
    this.seated = false;
    const spot = this.map?.nearestFree(this.home.x, this.home.z) ?? this.home;
    this._startGlide({ x: spot.x, y: EYE_HEIGHT, z: spot.z, yaw: this._nearestYaw(this.home.yaw), pitch: this.home.pitch });
  }

  /**
   * Takes over from wherever the camera is (e.g. the overview) and glides back to where
   * the visitor was last standing, facing the way they were.
   */
  takeOver() {
    const back = { x: this.position.x, z: this.position.z, yaw: this.targetYaw, pitch: this.targetPitch };
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.position.copy(this.camera.position);
    this.height = this.position.y;
    this.yaw = this.targetYaw = Math.atan2(-forward.x, -forward.z);
    this.pitch = this.targetPitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const spot = this.map?.nearestFree(back.x, back.z) ?? back;
    this.seated = false;
    this._startGlide(
      { x: spot.x, y: EYE_HEIGHT, z: spot.z, yaw: this._nearestYaw(back.yaw), pitch: THREE.MathUtils.clamp(back.pitch, -0.4, 0.2) },
      1.1,
    );
  }

  /** Returns true when the camera moved and the frame should be re-rendered. */
  update(dt) {
    dt = Math.min(dt, 0.1);
    const before = this.camera.position.clone();
    const beforeQuat = this.camera.quaternion.clone();
    const startX = this.position.x;
    const startZ = this.position.z;

    const gliding = Boolean(this.glide);
    if (gliding) this._stepGlide(dt);
    else {
      this._stepLook(dt);
      if (this.route) this._stepRoute(dt);
      else this._stepKeys(dt);
    }

    const moved = Math.hypot(this.position.x - startX, this.position.z - startZ);
    // Gliding (into a seat, or between views) isn't walking away.
    if (moved > 0.0005 && !gliding) this.onMove?.();
    this._stepBob(dt, moved);
    this._apply();

    const changed =
      this._changed ||
      before.distanceToSquared(this.camera.position) > EPSILON * EPSILON ||
      1 - Math.abs(beforeQuat.dot(this.camera.quaternion)) > 1e-10;
    this._changed = false;
    this.idle = !changed && !this.glide && !this.route && !this.walking;
    return changed;
  }

  getDebugInfo() {
    return {
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      yaw: this.yaw,
      pitch: this.pitch,
      seated: this.seated,
      walking: this.walking || Boolean(this.glide),
      route: this.route ? this.route.points.map((p) => ({ x: p.x, z: p.z })) : null,
    };
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    this.canvas.removeEventListener('pointerup', this._onPointerUp);
    this.canvas.removeEventListener('pointercancel', this._onPointerUp);
    this.canvas.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  // ---- Movement ----

  _startRoute(points) {
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) {
      lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    }
    const total = lengths.at(-1);
    this.glide = null;
    this.velocity.set(0, 0);
    this.seated = false;
    this.targetHeight = EYE_HEIGHT;
    const duration = this.reducedMotion ? 0 : Math.max(0.45, total / WALK_SPEED + 0.3);
    this.route = { points, lengths, total, t: 0, duration };
    this._changed = true;
  }

  _stepRoute(dt) {
    const route = this.route;
    route.t = route.duration ? Math.min(1, route.t + dt / route.duration) : 1;
    const along = easeInOut(route.t) * route.total;
    let i = 1;
    while (i < route.lengths.length - 1 && route.lengths[i] < along) i += 1;
    const a = route.points[i - 1];
    const b = route.points[i];
    const span = route.lengths[i] - route.lengths[i - 1] || 1;
    const t = (along - route.lengths[i - 1]) / span;
    this.position.x = a.x + (b.x - a.x) * t;
    this.position.z = a.z + (b.z - a.z) * t;
    if (route.t >= 1) this.route = null;
    this.height += (this.targetHeight - this.height) * damp(6, dt);
  }

  _stepKeys(dt) {
    const k = this.keys;
    const turn = (k.has('turnRight') ? 1 : 0) - (k.has('turnLeft') ? 1 : 0);
    if (turn) this.lookBy(-turn * TURN_SPEED * dt, 0);
    const forward = (k.has('forward') ? 1 : 0) - (k.has('back') ? 1 : 0);
    const strafe = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    const speed = KEY_SPEED * (this._run ? RUN_FACTOR : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wantX = (-sin * forward + cos * strafe) * speed;
    let wantZ = (-cos * forward - sin * strafe) * speed;
    const norm = Math.hypot(forward, strafe);
    if (norm > 1) {
      wantX /= norm;
      wantZ /= norm;
    }
    const blend = damp(MOVE_DAMPING, dt);
    this.velocity.x += (wantX - this.velocity.x) * blend;
    this.velocity.y += (wantZ - this.velocity.y) * blend;
    if (this.velocity.lengthSq() < 1e-6 && !forward && !strafe) {
      this.velocity.set(0, 0);
    } else if (this.map) {
      if (this.seated) this.seated = false;
      this.targetHeight = EYE_HEIGHT;
      const next = this.map.slide(this.position, this.velocity.x * dt, this.velocity.y * dt);
      this.position.x = next.x;
      this.position.z = next.z;
    }
    this.height += (this.targetHeight - this.height) * damp(6, dt);
  }

  _stepLook(dt) {
    if (!this._drag && (Math.abs(this.spin.yaw) > 0.002 || Math.abs(this.spin.pitch) > 0.002)) {
      this.lookBy(this.spin.yaw * dt, this.spin.pitch * dt);
      const decay = Math.exp(-INERTIA_DECAY * dt);
      this.spin.yaw *= decay;
      this.spin.pitch *= decay;
    }
    const k = this.reducedMotion ? 1 : damp(LOOK_DAMPING, dt);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    if (Math.abs(this.targetYaw - this.yaw) < 1e-5) this.yaw = this.targetYaw;
    if (Math.abs(this.targetPitch - this.pitch) < 1e-5) this.pitch = this.targetPitch;
  }

  _startGlide(to, duration = 0.9) {
    this.glide = {
      from: { x: this.position.x, y: this.height, z: this.position.z, yaw: this.yaw, pitch: this.pitch },
      to,
      t: 0,
      duration: this.reducedMotion ? 0 : duration,
    };
    this.spin.yaw = this.spin.pitch = 0;
    this._changed = true;
  }

  _stepGlide(dt) {
    const g = this.glide;
    g.t = g.duration ? Math.min(1, g.t + dt / g.duration) : 1;
    const e = easeInOut(g.t);
    const lerp = (a, b) => a + (b - a) * e;
    this.position.x = lerp(g.from.x, g.to.x);
    this.position.z = lerp(g.from.z, g.to.z);
    this.height = lerp(g.from.y, g.to.y);
    this.yaw = this.targetYaw = lerp(g.from.yaw, g.to.yaw);
    this.pitch = this.targetPitch = lerp(g.from.pitch, g.to.pitch);
    if (g.t >= 1) {
      this.glide = null;
      this.targetHeight = g.to.y;
      this._changed = true;
    }
  }

  _stepBob(dt, moved) {
    const speed = moved / Math.max(dt, 1e-4);
    const want = this.headBob && !this.seated ? Math.min(1, speed / WALK_SPEED) : 0;
    this.bob.amount += (want - this.bob.amount) * damp(want > this.bob.amount ? 6 : 4, dt);
    if (this.bob.amount < 0.001) this.bob.amount = 0;
    this.bob.phase += (moved / STEP_LENGTH) * Math.PI;
  }

  _apply() {
    const bobY = Math.abs(Math.sin(this.bob.phase)) * BOB_HEIGHT * this.bob.amount;
    const sway = Math.sin(this.bob.phase) * BOB_SWAY * this.bob.amount;
    this.position.y = this.height;
    this.camera.position.set(
      this.position.x + Math.cos(this.yaw) * sway,
      this.height + bobY - BOB_HEIGHT * 0.5 * this.bob.amount,
      this.position.z - Math.sin(this.yaw) * sway,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(this.pitch, this.yaw, -sway * 0.35);
  }

  /** The equivalent of `yaw` closest to the current heading (so turns take the short way). */
  _nearestYaw(yaw) {
    const turn = THREE.MathUtils.euclideanModulo(yaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    return this.yaw + turn;
  }

  // ---- Input ----

  _stopInput() {
    this.keys.clear();
    this._drag = null;
    this._pinch = null;
    this.pointers.clear();
    this.spin.yaw = this.spin.pitch = 0;
  }

  get _active() {
    return this.enabled && this.userControl;
  }

  _onPointerDown(event) {
    if (!this._active || (event.pointerType === 'mouse' && event.button !== 0)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.canvas.setPointerCapture?.(event.pointerId);
    this.spin.yaw = this.spin.pitch = 0;
    if (this.pointers.size === 1) {
      this._drag = { x: event.clientX, y: event.clientY, moved: 0, samples: [] };
      this._pinch = null;
    } else if (this.pointers.size === 2) {
      this._drag = null;
      this._pinch = { distance: this._pointerDistance() };
    }
  }

  _onPointerMove(event) {
    if (!this._active || !this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this._pinch && this.pointers.size === 2) {
      const distance = this._pointerDistance();
      const delta = distance - this._pinch.distance;
      this._pinch.distance = distance;
      if (Math.abs(delta) > 0.5) this.stepBy(delta * PINCH_METRES_PER_PX);
      return;
    }
    const drag = this._drag;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.moved += Math.hypot(dx, dy);
    // "Grab the world": the spot under the pointer stays under it.
    const radPerPx = THREE.MathUtils.degToRad(this.camera.fov) / Math.max(1, this.canvas.clientHeight);
    const dYaw = dx * radPerPx;
    const dPitch = dy * radPerPx;
    if (drag.moved > TAP_SLOP_PX) this.lookBy(dYaw, dPitch);
    const now = performance.now();
    drag.samples.push({ t: now, yaw: dYaw, pitch: dPitch });
    while (drag.samples.length && now - drag.samples[0].t > 90) drag.samples.shift();
  }

  _onPointerUp(event) {
    if (!this.pointers.delete(event.pointerId)) return;
    const drag = this._drag;
    if (drag && this.pointers.size === 0 && drag.moved > TAP_SLOP_PX && !this.reducedMotion && event.type !== 'pointercancel') {
      // Keep turning a little after a flick, then settle.
      const samples = drag.samples.filter((s) => performance.now() - s.t < 90);
      if (samples.length > 1) {
        const span = Math.max(16, samples.at(-1).t - samples[0].t) / 1000;
        this.spin.yaw = samples.reduce((sum, s) => sum + s.yaw, 0) / span * 0.6;
        this.spin.pitch = samples.reduce((sum, s) => sum + s.pitch, 0) / span * 0.3;
      }
    }
    if (this.pointers.size < 2) this._pinch = null;
    if (this.pointers.size === 0) this._drag = null;
    else if (this.pointers.size === 1) {
      const [p] = this.pointers.values();
      this._drag = { x: p.x, y: p.y, moved: TAP_SLOP_PX + 1, samples: [] };
    }
  }

  _pointerDistance() {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  _onWheel(event) {
    if (!this._active) return;
    event.preventDefault();
    this.stepBy(event.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP);
  }

  _onKeyDown(event) {
    const move = MOVE_KEYS[event.code];
    this._run = event.shiftKey;
    if (!move || !this._active || event.altKey || event.ctrlKey || event.metaKey || typingInto(event.target)) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    this.route = null;
    this.spin.yaw = this.spin.pitch = 0;
    this.keys.add(move);
    this._changed = true;
  }

  _onKeyUp(event) {
    this._run = event.shiftKey;
    const move = MOVE_KEYS[event.code];
    if (move) this.keys.delete(move);
  }
}

/**
 * A soft ring on the floor: follows the mouse over walkable floor, and marks where a
 * tap is taking you while you walk there.
 */
export class WalkMarker {
  constructor() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.21, 0.27, 48),
      new THREE.MeshBasicMaterial({ color: '#fff3dc', transparent: true, opacity: 0, depthWrite: false }),
    );
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.21, 48),
      new THREE.MeshBasicMaterial({ color: '#ffd08a', transparent: true, opacity: 0, depthWrite: false }),
    );
    this.group = new THREE.Group();
    this.group.name = 'walk-marker';
    this.group.add(ring, dot);
    this.group.rotation.x = -Math.PI / 2;
    this.group.renderOrder = 10;
    this.group.visible = false;
    // Never in the way of clicks on the room.
    ring.raycast = () => {};
    dot.raycast = () => {};
    this.ring = ring;
    this.dot = dot;
    this.hover = null;
    this.destination = null;
    this.pulse = 0;
  }

  showHover(point) {
    this.hover = point ? point.clone() : null;
  }

  showDestination(point) {
    this.destination = point ? point.clone() : null;
    this.pulse = 0;
  }

  /** Returns true while it's changing. */
  update(dt, arrived) {
    if (arrived) this.destination = null;
    const at = this.destination ?? this.hover;
    let ringOpacity = 0;
    let dotOpacity = 0;
    let scale = 1;
    if (this.destination) {
      this.pulse += dt;
      ringOpacity = 0.85;
      dotOpacity = 0.28 * (0.6 + 0.4 * Math.cos(this.pulse * 6));
      scale = 1 + 0.08 * Math.sin(this.pulse * 6);
    } else if (this.hover) {
      ringOpacity = 0.6;
      dotOpacity = 0.1;
    }
    const prev = [this.ring.material.opacity, this.dot.material.opacity, this.group.scale.x, this.group.position.x, this.group.position.z];
    const k = damp(14, dt);
    this.ring.material.opacity += (ringOpacity - this.ring.material.opacity) * k;
    this.dot.material.opacity += (dotOpacity - this.dot.material.opacity) * k;
    if (at) this.group.position.set(at.x, 0.015, at.z);
    this.group.scale.setScalar(scale);
    this.group.visible = this.ring.material.opacity > 0.01;
    if (!this.group.visible) this.ring.material.opacity = this.dot.material.opacity = 0;
    const now = [this.ring.material.opacity, this.dot.material.opacity, this.group.scale.x, this.group.position.x, this.group.position.z];
    return now.some((v, i) => Math.abs(v - prev[i]) > 1e-4);
  }

  dispose() {
    for (const mesh of [this.ring, this.dot]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
  }
}
