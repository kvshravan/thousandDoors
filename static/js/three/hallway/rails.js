import * as THREE from 'three';

const GRAVITY = 9.8;
// Doors lean out on bends like a swing on a fairground ride, up to this angle.
const MAX_SWING = 0.42;
// Slow rails still sway: doors drift out on bends more than the physics alone would give.
const SWING_GAIN = 1.6;
const SAMPLES_PER_METRE = 2;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * A closed rail through the vault, with an arc-length lookup table so doors can be
 * placed at any distance along it cheaply every frame. Each sample stores the point,
 * the horizontal heading (the way a hanging door faces), and how far a door swings
 * out on that bend at the rail's speed.
 */
export class Rail {
  constructor({ id, points, speed, spacing, role = 'lane' }) {
    this.id = id;
    this.role = role;
    this.speed = speed;
    this.curve = new THREE.CatmullRomCurve3(
      points.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      'centripetal',
    );
    this.length = this.curve.getLength();
    this.slots = Math.max(1, Math.floor(this.length / spacing));
    this.spacing = this.length / this.slots;

    const n = Math.max(128, Math.ceil(this.length * SAMPLES_PER_METRE));
    this.samples = n;
    this.points = new Float32Array(n * 3);
    // Horizontal unit heading (x, z) of the rail at each sample.
    this.headings = new Float32Array(n * 2);
    this.swings = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const u = i / n;
      this.curve.getPointAt(u, _a);
      this.points.set([_a.x, _a.y, _a.z], i * 3);
      this.curve.getTangentAt(u, _b);
      const flat = Math.hypot(_b.x, _b.z) || 1;
      this.headings[i * 2] = _b.x / flat;
      this.headings[i * 2 + 1] = _b.z / flat;
    }
    this._computeSwings();
  }

  /** Lateral (centripetal) acceleration along each door's facing axis, as a lean angle. */
  _computeSwings() {
    const n = this.samples;
    const ds = this.length / n;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const prev = ((i - 1 + n) % n) * 2;
      const next = ((i + 1) % n) * 2;
      // Rate of change of the heading: points to the inside of the bend.
      const cx = (this.headings[next] - this.headings[prev]) / (2 * ds);
      const cz = (this.headings[next + 1] - this.headings[prev + 1]) / (2 * ds);
      // The door's face normal (heading x up).
      const zx = -this.headings[i * 2 + 1];
      const zz = this.headings[i * 2];
      const lateral = (cx * zx + cz * zz) * this.speed * this.speed;
      raw[i] = Math.atan(lateral / GRAVITY) * SWING_GAIN;
    }
    // Smooth over a few metres so doors ease into bends.
    const span = Math.max(1, Math.round(3 * SAMPLES_PER_METRE));
    for (let i = 0; i < n; i += 1) {
      let sum = 0;
      for (let k = -span; k <= span; k += 1) sum += raw[(i + k + n) % n];
      this.swings[i] = THREE.MathUtils.clamp(sum / (2 * span + 1), -MAX_SWING, MAX_SWING);
    }
  }

  /**
   * The pose at arc length s (any value; it wraps): fills out.point, out.heading
   * ({x, z}), and out.swing. Linear between samples.
   */
  sample(s, out) {
    const n = this.samples;
    const f = ((((s / this.length) % 1) + 1) % 1) * n;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    const p = this.points;
    out.point.set(
      p[i0 * 3] + (p[i1 * 3] - p[i0 * 3]) * t,
      p[i0 * 3 + 1] + (p[i1 * 3 + 1] - p[i0 * 3 + 1]) * t,
      p[i0 * 3 + 2] + (p[i1 * 3 + 2] - p[i0 * 3 + 2]) * t,
    );
    const h = this.headings;
    const hx = h[i0 * 2] + (h[i1 * 2] - h[i0 * 2]) * t;
    const hz = h[i0 * 2 + 1] + (h[i1 * 2 + 1] - h[i0 * 2 + 1]) * t;
    const len = Math.hypot(hx, hz) || 1;
    out.heading.x = hx / len;
    out.heading.z = hz / len;
    out.swing = this.swings[i0] + (this.swings[i1] - this.swings[i0]) * t;
    return out;
  }
}

export function railPose() {
  return { point: new THREE.Vector3(), heading: { x: 1, z: 0 }, swing: 0 };
}

/** A long loop: out along z at x, back at x + width, waving gently up and down. */
function lane(x, y, { near = 12, far = -150, width = 3.5, wave = 1.2, phase = 0, step = 15 }) {
  const out = [];
  const back = [];
  for (let z = near; z >= far; z -= step) {
    const lift = Math.sin(z * 0.045 + phase) * wave;
    out.push([x, y + lift, z]);
    back.unshift([x + width, y + lift * 0.8 + 0.4, z]);
  }
  return [...out, ...back];
}

/**
 * The vault's rails. "swoop" sweeps across in front of the landing (where real doors
 * are easiest to see), "coaster" climbs and dives (the one you ride), and the lanes
 * run off into the distance in two banks. Fewer doors on slower devices.
 */
export function buildRails(quality, { hero = false } = {}) {
  const sparse = quality.name === 'low' || hero;
  let laneSpacing = 3.4;
  if (quality.name === 'high' && !hero) laneSpacing = 1.9;
  else if (quality.name !== 'low') laneSpacing = 2.6;
  const rails = [
    new Rail({
      id: 'swoop',
      role: 'feature',
      speed: 2.1,
      spacing: 1.9,
      points: [
        [-34, 15, 12],
        [-16, 11.5, 6],
        [0, 8.5, 2],
        [15, 6.5, -3],
        [29, 7.5, -12],
        [34, 11, -32],
        [18, 15, -44],
        [-6, 17, -38],
        [-26, 17.5, -22],
        [-38, 16.5, -2],
      ],
    }),
    new Rail({
      id: 'coaster',
      role: 'ride',
      speed: 4.6,
      spacing: 2.4,
      points: [
        [-10, 3.2, 5],
        [4, 2.6, 1],
        [15, 4.5, -8],
        [21, 11, -22],
        [14, 19, -38],
        [-2, 21, -50],
        [-18, 15, -54],
        [-27, 7, -42],
        [-25, 2.8, -24],
        [-19, 2.4, -6],
      ],
    }),
  ];
  const banks = sparse
    ? [
        [-30, 7],
        [-28, 15],
        [24, 9],
        [26, 17],
      ]
    : [
        [-34, 5],
        [-30, 11],
        [-26, 17],
        [22, 6],
        [26, 12],
        [30, 18],
      ];
  banks.forEach(([x, y], i) => {
    rails.push(
      new Rail({
        id: `lane-${i}`,
        speed: (i % 2 === 0 ? 1 : -1) * (1.4 + (i % 3) * 0.4),
        spacing: laneSpacing,
        points: lane(x, y, { phase: i * 1.7, far: sparse ? -120 : -150 }),
      }),
    );
  });
  return rails;
}
