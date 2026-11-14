import * as THREE from 'three';
import { LANDSCAPES } from '../room-config.js';
import { buildDoor } from './decor.js';
import { seededRandom } from './kit.js';

// The outside of a house: one house style per landscape plus its surroundings.
// The house is centred on the origin with its front (and front door) facing +z.

const NO_CAST = { castShadow: false };

// Sky and light outside, per time of day.
export const OUTDOOR_LIGHT = Object.freeze({
  day: { sky: '#a8d6f0', hemisphere: ['#ffffff', '#8a7a60', 1.9], sun: ['#fff1d6', 2.6], exposure: 1.0 },
  evening: { sky: '#f0a27c', hemisphere: ['#ffd9c2', '#6a4a4a', 1.3], sun: ['#ff9f6b', 2.0], exposure: 1.0 },
  night: { sky: '#121833', hemisphere: ['#8a9ad0', '#2a2440', 0.75], sun: ['#9fb1ff', 0.55], exposure: 1.1 },
});

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/** A triangular roof prism: width across x, height up, depth along z, base at y = 0. */
function gable(kit, width, height, depth) {
  return kit.geometry(`gable:${width}:${height}:${depth}`, () => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  });
}

function windowPane(kit, parent, time, width, height, position, rotationY = 0) {
  const lit = time !== 'day';
  const glass = lit
    ? kit.material('#ffd79a', { emissive: '#ffd79a', emissiveIntensity: 0.9 })
    : kit.material('#9ec9e8', { roughness: 0.2, metalness: 0.1 });
  const pane = group('window');
  pane.position.set(...position);
  pane.rotation.y = rotationY;
  kit.part(pane, kit.box(width + 0.16, height + 0.16, 0.08), kit.material('#fbf5ec'), [0, 0, 0], null, NO_CAST);
  kit.part(pane, kit.plane(width, height), glass, [0, 0, 0.045], null, NO_CAST);
  kit.part(pane, kit.box(0.05, height, 0.02), kit.material('#fbf5ec'), [0, 0, 0.05], null, NO_CAST);
  parent.add(pane);
  return pane;
}

function frontDoor(kit, parent, { room, color, y = 0, z }) {
  const door = buildDoor(kit, { color, width: 1.0, height: 2.1 }, { room });
  door.name = 'front-door';
  door.position.set(0, y, z);
  parent.add(door);
  return door;
}

// ---- Houses ----

const HOUSES = {
  countryside(kit, house, ctx) {
    kit.part(house, kit.box(6, 3, 5), kit.material('#f3e3cc'), [0, 1.5, 0]);
    kit.part(house, gable(kit, 7, 2.2, 5.8), kit.material('#b8573c', { roughness: 0.7 }), [0, 3, 0]);
    kit.part(house, kit.box(0.6, 1.6, 0.6), kit.material('#9a6a54'), [1.8, 4.2, -0.8]);
    for (const x of [-1.9, 1.9]) {
      windowPane(kit, house, ctx.time, 1.0, 0.9, [x, 1.6, 2.52]);
      kit.part(house, kit.box(1.1, 0.18, 0.22), kit.material('woodMid'), [x, 1.05, 2.6]);
      for (let i = 0; i < 4; i += 1) {
        kit.part(house, kit.sphere(0.09, 8, 6), kit.material(['#ff8fc8', '#ffd166', '#ff5f55', '#b98cff'][i]), [x - 0.36 + i * 0.24, 1.2, 2.62], null, NO_CAST);
      }
    }
    windowPane(kit, house, ctx.time, 0.9, 0.8, [3.02, 1.6, 0], Math.PI / 2);
    windowPane(kit, house, ctx.time, 0.9, 0.8, [-3.02, 1.6, 0], -Math.PI / 2);
    return { door: frontDoor(kit, house, { ...ctx, z: 2.5 }), focusY: 1.8 };
  },
  beach(kit, house, ctx) {
    const wood = kit.material('#c9a26e');
    const dark = kit.material('#8a6a4a');
    for (const x of [-2.8, 0, 2.8]) {
      for (const z of [-2.3, 0, 2.3, 3.6]) kit.part(house, kit.cylinder(0.12, 0.12, 1.4, 8), dark, [x, 0.7, z]);
    }
    kit.part(house, kit.box(6.2, 0.18, 6.4), wood, [0, 1.4, 0.6]);
    kit.part(house, kit.box(5, 2.5, 4.4), kit.material('#d9b88a'), [0, 2.75, 0]);
    const roof = kit.part(house, kit.cylinder(0.2, 4.6, 2.4, 4), kit.material('#d9b46a', { roughness: 1, flatShading: true }), [0, 5.2, 0]);
    roof.rotation.y = Math.PI / 4;
    // Railing around the front deck.
    for (let x = -2.9; x <= 2.91; x += 0.58) {
      if (Math.abs(x) > 0.7) kit.part(house, kit.box(0.08, 0.8, 0.08), dark, [x, 1.9, 3.7]);
    }
    for (const x of [-1.85, 1.85]) kit.part(house, kit.box(2.3, 0.08, 0.1), dark, [x, 2.28, 3.7]);
    for (let i = 0; i < 5; i += 1) kit.part(house, kit.box(1.2, 0.12, 0.35), wood, [0, 1.25 - i * 0.28, 4.0 + i * 0.32]);
    for (const x of [-1.6, 1.6]) windowPane(kit, house, ctx.time, 0.9, 0.9, [x, 2.9, 2.22]);
    return { door: frontDoor(kit, house, { ...ctx, y: 1.49, z: 2.2 }), focusY: 3 };
  },
  forest(kit, house, ctx) {
    const log = kit.material('#8a5a38', { roughness: 0.9 });
    const end = kit.material('#c9a07a');
    for (let row = 0; row < 9; row += 1) {
      const y = 0.17 + row * 0.33;
      for (const z of [-2.5, 2.5]) kit.part(house, kit.cylinder(0.17, 0.17, 6.4, 8), log, [0, y, z], [0, 0, Math.PI / 2]);
      for (const x of [-3, 3]) kit.part(house, kit.cylinder(0.17, 0.17, 5.4, 8), log, [x, y + 0.16, 0], [Math.PI / 2, 0, 0]);
      for (const x of [-3.2, 3.2]) kit.part(house, kit.circle(0.17, 8), end, [x, y, 2.5 + 0.001], null, NO_CAST);
    }
    kit.part(house, kit.box(5.8, 3, 4.8), kit.material('#6e4a30'), [0, 1.5, 0]);
    kit.part(house, gable(kit, 7.4, 2.6, 6.2), kit.material('#2f5a3a', { roughness: 0.8 }), [0, 3, 0]);
    kit.part(house, kit.box(0.8, 3.4, 0.8), kit.material('#8a8a8a', { roughness: 1 }), [-3.4, 2.4, -1]);
    for (const x of [-1.9, 1.9]) windowPane(kit, house, ctx.time, 0.9, 0.9, [x, 1.6, 2.7]);
    kit.part(house, kit.box(3, 0.15, 1.4), kit.material('#6e4a30'), [0, 0.07, 3.3]);
    return { door: frontDoor(kit, house, { ...ctx, y: 0.15, z: 2.68 }), focusY: 1.8 };
  },
  city(kit, house, ctx) {
    const brick = kit.material('#b5654a', { roughness: 0.9 });
    kit.part(house, kit.box(7, 10, 6), brick, [0, 5, 0]);
    kit.part(house, kit.box(7.3, 0.3, 6.3), kit.material('#8a8a8a'), [0, 10.15, 0]);
    kit.part(house, kit.cylinder(0.7, 0.7, 1.4, 12), kit.material('#8a6a4a'), [2, 11, -1.5]);
    for (let floor = 0; floor < 3; floor += 1) {
      for (const x of [-2.4, -0.8, 0.8, 2.4]) {
        if (floor === 0 && Math.abs(x) < 1) continue;
        windowPane(kit, house, ctx.time, 0.9, 1.3, [x, 2 + floor * 3, 3.02]);
      }
    }
    kit.part(house, kit.box(2.2, 0.12, 1.1), kit.material('#3e4a6b'), [0, 2.55, 3.5], [0.15, 0, 0]);
    kit.part(house, kit.box(1.6, 0.3, 0.8), kit.material('#8a8a8a'), [0, 0.15, 3.4]);
    return { door: frontDoor(kit, house, { ...ctx, y: 0.3, z: 3.0 }), focusY: 2.2 };
  },
  snow(kit, house, ctx) {
    kit.part(house, kit.box(5.6, 3.2, 5), kit.material('#9a6a44'), [0, 1.6, 0]);
    kit.part(house, gable(kit, 7.2, 3.6, 6.2), kit.material('#4a3a36', { roughness: 0.8 }), [0, 3.2, 0]);
    kit.part(house, gable(kit, 6.6, 3.3, 6.3), kit.material('#f7fbff', { roughness: 1 }), [0, 3.55, 0]);
    kit.part(house, kit.box(4, 0.15, 1.2), kit.material('woodMid'), [0, 2.6, 3.1]);
    for (let x = -1.9; x <= 1.91; x += 0.38) kit.part(house, kit.box(0.06, 0.7, 0.06), kit.material('woodDark'), [x, 2.95, 3.65]);
    for (const x of [-1.6, 1.6]) windowPane(kit, house, ctx.time, 0.9, 1.0, [x, 1.4, 2.52]);
    windowPane(kit, house, ctx.time, 1.2, 1.0, [0, 4.3, 3.12]);
    return { door: frontDoor(kit, house, { ...ctx, z: 2.5 }), focusY: 2 };
  },
  desert(kit, house, ctx) {
    const adobe = kit.material('#d9a066', { roughness: 1 });
    kit.part(house, kit.rounded(6.4, 3.2, 5.2, 0.35, 3), adobe, [0, 1.6, 0]);
    kit.part(house, kit.rounded(4, 1.6, 3.6, 0.3, 3), adobe, [-0.8, 3.8, -0.4]);
    for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) {
      kit.part(house, kit.cylinder(0.1, 0.1, 0.8, 8), kit.material('woodDark'), [x, 2.85, 2.7], [Math.PI / 2, 0, 0]);
    }
    for (const x of [-2, 2]) windowPane(kit, house, ctx.time, 0.8, 0.8, [x, 1.6, 2.62]);
    kit.part(house, kit.box(1.5, 2.5, 0.06), kit.material('#3fa7a0'), [0, 1.25, 2.6], null, NO_CAST);
    return { door: frontDoor(kit, house, { ...ctx, z: 2.62 }), focusY: 1.8 };
  },
};

/** Builds the house for a landscape. Returns { house, door, focusY }. */
export function buildHouse(kit, landscape, { time = 'day', room = null, doorColor = 'terracotta' } = {}) {
  const house = group(`house-${landscape}`);
  const build = HOUSES[landscape] ?? HOUSES.countryside;
  const { door, focusY } = build(kit, house, { time, room, color: doorColor });
  return { house, door, focusY };
}

// ---- Surroundings ----

function tree(kit, parent, x, z, size, crown = 'leaf') {
  kit.part(parent, kit.cylinder(0.15 * size, 0.2 * size, 1.6 * size, 8), kit.material('#6b4a32'), [x, 0.8 * size, z]);
  kit.part(parent, kit.icosahedron(1.1 * size, 0), kit.material(crown, { flatShading: true }), [x, 2.2 * size, z]);
}

function pine(kit, parent, x, z, size, color, snow = false) {
  kit.part(parent, kit.cylinder(0.12 * size, 0.16 * size, 0.8 * size, 6), kit.material('#5b3e2a'), [x, 0.4 * size, z]);
  for (let i = 0; i < 3; i += 1) {
    kit.part(parent, kit.cylinder(0, (1.2 - i * 0.3) * size, 1.4 * size, 7), kit.material(color, { flatShading: true }), [x, (1.2 + i * 0.75) * size, z]);
    if (snow) kit.part(parent, kit.cylinder(0, (0.55 - i * 0.12) * size, 0.6 * size, 7), kit.material('#f7fbff'), [x, (1.6 + i * 0.75) * size, z], null, NO_CAST);
  }
}

function palm(kit, parent, x, z, size) {
  const trunk = kit.material('#8a6a4a');
  let px = x;
  for (let i = 0; i < 6; i += 1) {
    px += 0.08 * size;
    kit.part(parent, kit.cylinder(0.14 * size, 0.17 * size, 0.8 * size, 7), trunk, [px, (0.4 + i * 0.75) * size, z], [0, 0, -0.1]);
  }
  const top = [px + 0.1 * size, 4.6 * size, z];
  const leaf = kit.material('#3f8a4a', { flatShading: true });
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const frond = kit.part(parent, kit.box(0.35 * size, 0.05 * size, 2.0 * size), leaf, [top[0] + Math.sin(angle) * 0.9 * size, top[1] - 0.25 * size, top[2] + Math.cos(angle) * 0.9 * size], null, NO_CAST);
    frond.rotation.set(0.35, angle, 0, 'YXZ');
  }
  kit.part(parent, kit.sphere(0.3 * size, 8, 6), kit.material('#6b4a32'), top, null, NO_CAST);
}

function mountain(kit, parent, x, z, radius, height, color, cap = '#f7fbff') {
  kit.part(parent, kit.cylinder(0, radius, height, 7), kit.material(color, { flatShading: true }), [x, height / 2, z], null, NO_CAST);
  if (cap) kit.part(parent, kit.cylinder(0, radius * 0.32, height * 0.32, 7), kit.material(cap, { flatShading: true }), [x, height * 0.84 + 0.05, z], null, NO_CAST);
}

/** Scatter positions in a ring around the house, deterministic per landscape. */
function* scatter(seed, count, minRadius, maxRadius, avoidFront = true) {
  const rand = seededRandom(seed);
  let made = 0;
  let tries = 0;
  while (made < count && tries < count * 20) {
    tries += 1;
    const angle = rand() * Math.PI * 2;
    const radius = minRadius + rand() * (maxRadius - minRadius);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    // Keep the view from the front clear.
    if (avoidFront && z > 2 && Math.abs(x) < 6) continue;
    made += 1;
    yield [x, z, rand];
  }
}

const SURROUNDINGS = {
  countryside(kit, root, { time }) {
    for (const [x, z, rand] of scatter(3, 14, 9, 26)) tree(kit, root, x, z, 0.9 + rand() * 0.6, rand() > 0.5 ? 'leaf' : 'leafDark');
    for (const [x, z, s] of [[-25, -30, 12], [10, -38, 16], [32, -20, 10]]) {
      const hill = kit.part(root, kit.sphere(s, 16, 10), kit.material(LANDSCAPES.countryside.far, { flatShading: true }), [x, -s * 0.3, z], null, NO_CAST);
      hill.scale.y = 0.6;
    }
    const white = kit.material('#fbf5ec');
    for (let x = -7; x <= 7.01; x += 0.7) {
      if (Math.abs(x) < 1) continue;
      kit.part(root, kit.box(0.1, 0.8, 0.06), white, [x, 0.4, 6.5]);
    }
    for (const x of [-4, 4]) kit.part(root, kit.box(6, 0.08, 0.05), white, [x, 0.55, 6.5]);
    for (let i = 0; i < 7; i += 1) kit.part(root, kit.cylinder(0.32, 0.36, 0.06, 8), kit.material('#c9b8a8'), [0, 0.03, 3.3 + i * 0.5], null, NO_CAST);
    if (time === 'night') kit.part(root, kit.sphere(1.2, 12, 8), kit.material('#f1e4cf', { basic: true }), [-20, 26, -40], null, NO_CAST);
  },
  beach(kit, root) {
    const sea = kit.part(root, kit.plane(140, 70), kit.material('#2fb3c0', { roughness: 0.25, metalness: 0.1 }), [0, 0.03, -45], [-Math.PI / 2, 0, 0], NO_CAST);
    sea.receiveShadow = false;
    kit.part(root, kit.plane(140, 3), kit.material('#8fe3dc', { roughness: 0.3 }), [0, 0.035, -9.5], [-Math.PI / 2, 0, 0], NO_CAST);
    for (const [x, z, rand] of scatter(5, 9, 7, 20)) {
      if (z < -8) continue;
      palm(kit, root, x, z, 0.8 + rand() * 0.4);
    }
    for (const [x, z] of [[-8, -6], [9, -4], [12, 5]]) kit.part(root, kit.icosahedron(0.7, 0), kit.material('#9a948a', { flatShading: true }), [x, 0.3, z]);
  },
  forest(kit, root) {
    const lake = kit.part(root, kit.circle(9, 32), kit.material('#4f86a8', { roughness: 0.2 }), [-14, 0.03, -6], [-Math.PI / 2, 0, 0], NO_CAST);
    lake.scale.set(1.4, 1, 1);
    for (const [x, z, rand] of scatter(9, 34, 8, 30)) {
      if (Math.hypot(x + 14, z + 6) < 10) continue;
      pine(kit, root, x, z, 1.2 + rand() * 1.2, rand() > 0.5 ? '#2f5a3a' : '#3f6b45');
    }
    mountain(kit, root, -20, -45, 16, 22, '#7d93a6');
    mountain(kit, root, 12, -50, 20, 28, '#8fa3b4');
  },
  city(kit, root, { time }) {
    kit.part(root, kit.box(60, 0.12, 4), kit.material('#b9b4aa'), [0, 0.06, 5]);
    kit.part(root, kit.plane(80, 8), kit.material('#3b3a3d', { roughness: 0.9 }), [0, 0.02, 11], [-Math.PI / 2, 0, 0], NO_CAST);
    for (let x = -30; x <= 30; x += 4) kit.part(root, kit.box(1.6, 0.01, 0.2), kit.material('#f4efe6'), [x, 0.03, 11], null, NO_CAST);
    const rand = seededRandom(17);
    const facades = ['#8a90a6', '#c98f7e', '#a9b8a0', '#d9c2a0', '#7a6a8a'];
    for (const x of [-15, -8.5, 8.5, 15, 22, -22]) {
      const height = 6 + rand() * 10;
      kit.part(root, kit.box(6, height, 6), kit.material(facades[Math.floor(rand() * facades.length)]), [x, height / 2, -0.5]);
      for (let y = 1.5; y < height - 1; y += 2.4) {
        for (const dx of [-1.6, 0, 1.6]) {
          const lit = time !== 'day' && rand() > 0.4;
          kit.part(root, kit.plane(0.8, 1.1), lit ? kit.material('#ffd166', { emissive: '#ffd166', emissiveIntensity: 0.8 }) : kit.material('#9ec9e8', { roughness: 0.3 }), [x + dx, y, 2.51], null, NO_CAST);
        }
      }
    }
    for (let i = 0; i < 6; i += 1) {
      const height = 14 + rand() * 18;
      kit.part(root, kit.box(8, height, 8), kit.material('#6a7088'), [-30 + i * 12, height / 2, -22], null, NO_CAST);
    }
    for (const x of [-5, 5]) {
      kit.part(root, kit.cylinder(0.06, 0.08, 4, 8), kit.material('#3b3a3d'), [x, 2, 6.6]);
      kit.part(root, kit.sphere(0.25, 10, 8), kit.material('#ffe9b0', { emissive: '#ffe9b0', emissiveIntensity: time === 'day' ? 0.2 : 1.2 }), [x, 4.1, 6.6], null, NO_CAST);
    }
    tree(kit, root, -3.2, 5.2, 0.6);
  },
  snow(kit, root) {
    for (const [x, z, rand] of scatter(13, 26, 8, 28)) pine(kit, root, x, z, 1.1 + rand() * 1.1, '#3f5f55', true);
    mountain(kit, root, -18, -42, 18, 26, '#a9bdd6');
    mountain(kit, root, 16, -48, 22, 32, '#c3d2e6');
    for (const [x, z] of [[-6, 4], [6, 5]]) {
      kit.part(root, kit.sphere(0.5, 10, 8), kit.material('#ffffff'), [x, 0.45, z]);
      kit.part(root, kit.sphere(0.35, 10, 8), kit.material('#ffffff'), [x, 1.15, z]);
      kit.part(root, kit.sphere(0.25, 10, 8), kit.material('#ffffff'), [x, 1.65, z]);
      kit.part(root, kit.cylinder(0, 0.06, 0.25, 6), kit.material('#ff8a3d'), [x, 1.65, z + 0.3], [Math.PI / 2, 0, 0], NO_CAST);
    }
  },
  desert(kit, root) {
    for (const [x, z, rand] of scatter(21, 10, 8, 24)) {
      const s = 0.8 + rand() * 0.8;
      const green = kit.material('#5f8f4e', { flatShading: true });
      kit.part(root, kit.cylinder(0.3 * s, 0.35 * s, 3 * s, 8), green, [x, 1.5 * s, z]);
      kit.part(root, kit.cylinder(0.2 * s, 0.2 * s, 1.2 * s, 8), green, [x + 0.6 * s, 1.9 * s, z]);
      kit.part(root, kit.cylinder(0.2 * s, 0.2 * s, 0.7 * s, 8), green, [x + 0.35 * s, 1.4 * s, z], [0, 0, Math.PI / 2]);
    }
    for (const [x, z, r, h] of [[-26, -36, 9, 9], [18, -42, 12, 11], [36, -18, 7, 7]]) {
      kit.part(root, kit.cylinder(r * 0.8, r, h, 6), kit.material('#c9805a', { flatShading: true }), [x, h / 2, z], null, NO_CAST);
    }
    for (const [x, z, s] of [[-12, 10, 6], [14, 12, 7], [0, -16, 9]]) {
      const dune = kit.part(root, kit.sphere(s, 16, 10), kit.material('#e8c08a', { flatShading: true }), [x, -s * 0.7, z], null, NO_CAST);
      dune.scale.y = 0.5;
    }
  },
};

/** Ground and everything around the house. Returns the group plus any per-frame updaters. */
export function buildSurroundings(kit, landscape, { time = 'day', reducedMotion = false } = {}) {
  const root = group(`surroundings-${landscape}`);
  const look = LANDSCAPES[landscape] ?? LANDSCAPES.countryside;
  const ground = kit.part(root, kit.circle(70, 48), kit.material(look.ground, { roughness: 1 }), [0, 0, 0], [-Math.PI / 2, 0, 0], NO_CAST);
  ground.name = 'ground';
  (SURROUNDINGS[landscape] ?? SURROUNDINGS.countryside)(kit, root, { time });

  if (landscape === 'snow') {
    // Gently falling snow (kept still when the viewer prefers reduced motion).
    const count = 500;
    const rand = seededRandom(7);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) positions.set([(rand() - 0.5) * 40, rand() * 16, (rand() - 0.5) * 40], i * 3);
    const geometry = kit.geometry('snowfall', () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)));
    const flakes = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#ffffff', size: 0.12 }));
    flakes.name = 'snowfall';
    flakes.userData.ownedMaterial = flakes.material;
    root.add(flakes);
    if (!reducedMotion) {
      kit.addUpdater((dt) => {
        const array = geometry.attributes.position.array;
        for (let i = 1; i < array.length; i += 3) {
          array[i] -= dt * 1.2;
          if (array[i] < 0) array[i] += 16;
        }
        geometry.attributes.position.needsUpdate = true;
        return true;
      });
    }
  }
  return root;
}
