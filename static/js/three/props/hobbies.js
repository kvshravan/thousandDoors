import * as THREE from 'three';
import { createBallTexture, createGlobeTexture, createPaintingTexture, createScreenTexture } from './textures.js';

// Tech, hobby, and decor props. Floor and surface props stand on y = 0; wall props
// hang from the wall at z = 0 facing +z; ceiling props hang down from y = 0.

const NO_CAST = { castShadow: false };

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

// ---- Tech ----

export function buildGameConsole(kit, { color = '#2d2a2e' } = {}) {
  const root = group('game-console');
  const body = kit.material(color, { roughness: 0.4 });
  kit.part(root, kit.rounded(0.32, 0.06, 0.22, 0.015), body, [0, 0.03, -0.06]);
  kit.part(root, kit.box(0.2, 0.006, 0.004), kit.material('#6aa8ff', { emissive: '#6aa8ff', emissiveIntensity: 0.8 }), [0, 0.04, 0.052], null, NO_CAST);
  // Controller.
  const pad = group('controller');
  pad.position.set(0.02, 0, 0.17);
  pad.rotation.y = 0.3;
  kit.part(pad, kit.rounded(0.14, 0.035, 0.07, 0.015), body, [0, 0.0175, 0]);
  for (const x of [-0.065, 0.065]) kit.part(pad, kit.sphere(0.035, 10, 8), body, [x, 0.02, 0.02]);
  for (const [x, c] of [[0.04, '#ff5f55'], [0.06, '#7dffa0']]) {
    kit.part(pad, kit.cylinder(0.008, 0.008, 0.01, 8), kit.material(c), [x, 0.038, -0.005], null, NO_CAST);
  }
  root.add(pad);
  return root;
}

export function buildHeadphones(kit, { color = '#2d2a2e' } = {}) {
  const root = group('headphones');
  const body = kit.material(color, { roughness: 0.5 });
  kit.part(root, kit.torus(0.09, 0.012, 6, 20, Math.PI), body, [0, 0.03, 0], [0, 0, 0], NO_CAST).rotation.set(-Math.PI / 2, 0, 0);
  for (const x of [-0.09, 0.09]) {
    kit.part(root, kit.cylinder(0.045, 0.045, 0.035, 16), body, [x, 0.03, 0], [0, 0, Math.PI / 2]);
    kit.part(root, kit.cylinder(0.04, 0.04, 0.012, 16), kit.material('#5a5560', { roughness: 1 }), [x * 0.82, 0.03, 0], [0, 0, Math.PI / 2], NO_CAST);
  }
  return root;
}

export function buildArcade(kit, { color = 'plum' } = {}) {
  const root = group('arcade');
  const body = kit.material(color, { roughness: 0.6 });
  kit.part(root, kit.box(0.7, 1.75, 0.7), body, [0, 0.875, -0.05]);
  const screen = kit.texture(createScreenTexture('PLAY'));
  kit.part(root, kit.plane(0.54, 0.42), kit.material('#ffffff', { map: screen, basic: true }), [0, 1.3, 0.31], [-0.15, 0, 0], NO_CAST);
  kit.part(root, kit.box(0.7, 0.06, 0.32), body, [0, 0.98, 0.42], [0.25, 0, 0]);
  kit.part(root, kit.box(0.6, 0.12, 0.02), kit.material('#ffd166', { emissive: '#ffd166', emissiveIntensity: 0.6 }), [0, 1.66, 0.31], null, NO_CAST);
  kit.part(root, kit.cylinder(0.012, 0.012, 0.08, 8), kit.material('#2d2a2e'), [-0.14, 1.05, 0.45], null, NO_CAST);
  kit.part(root, kit.sphere(0.025, 10, 8), kit.material('#ff5f55'), [-0.14, 1.1, 0.45], null, NO_CAST);
  for (const [x, c] of [[0.06, '#7dffa0'], [0.13, '#6aa8ff'], [0.2, '#ffd166']]) {
    kit.part(root, kit.cylinder(0.02, 0.02, 0.02, 10), kit.material(c), [x, 1.03, 0.45], [0.25, 0, 0], NO_CAST);
  }
  return root;
}

// ---- Hobbies ----

export function buildEasel(kit, { color = 'woodLight' } = {}) {
  const root = group('easel');
  const wood = kit.material(color);
  kit.part(root, kit.box(0.04, 1.7, 0.04), wood, [-0.28, 0.83, 0], [0, 0, -0.12]);
  kit.part(root, kit.box(0.04, 1.7, 0.04), wood, [0.28, 0.83, 0], [0, 0, 0.12]);
  kit.part(root, kit.box(0.04, 1.65, 0.04), wood, [0, 0.8, -0.32], [-0.38, 0, 0]);
  kit.part(root, kit.box(0.7, 0.04, 0.1), wood, [0, 0.68, 0.06]);
  const painting = kit.texture(createPaintingTexture(4));
  kit.part(root, kit.box(0.56, 0.7, 0.025), kit.material('#fbf5ec'), [0, 1.06, 0.06], [-0.08, 0, 0]);
  kit.part(root, kit.plane(0.52, 0.66), kit.material('#ffffff', { map: painting, roughness: 0.95 }), [0, 1.06, 0.074], [-0.08, 0, 0], NO_CAST);
  return root;
}

export function buildSkateboard(kit, { color = 'terracotta' } = {}) {
  const root = group('skateboard');
  kit.part(root, kit.rounded(0.8, 0.02, 0.21, 0.01), kit.material(color, { roughness: 0.6 }), [0, 0.075, 0]);
  const metal = kit.material('#c9c2b8', { metalness: 0.6, roughness: 0.35 });
  const wheel = kit.material('#f4efe6', { roughness: 0.5 });
  for (const x of [-0.27, 0.27]) {
    kit.part(root, kit.box(0.04, 0.03, 0.16), metal, [x, 0.05, 0]);
    for (const z of [-0.09, 0.09]) kit.part(root, kit.cylinder(0.03, 0.03, 0.03, 12), wheel, [x, 0.03, z], [Math.PI / 2, 0, 0]);
  }
  return root;
}

export function buildGlobe(kit, { color = 'woodDark' } = {}) {
  const root = group('globe');
  const wood = kit.material(color);
  kit.part(root, kit.cylinder(0.08, 0.1, 0.03, 16), wood, [0, 0.015, 0]);
  kit.part(root, kit.cylinder(0.012, 0.012, 0.1, 8), wood, [0, 0.07, 0]);
  const map = kit.texture(createGlobeTexture());
  const ball = kit.part(root, kit.sphere(0.13, 24, 16), kit.material('#ffffff', { map, roughness: 0.6 }), [0, 0.25, 0]);
  ball.rotation.z = 0.41;
  kit.part(root, kit.torus(0.145, 0.007, 6, 28, Math.PI), kit.material('brass', { metalness: 0.6, roughness: 0.35 }), [0, 0.25, 0], [0, Math.PI / 2, 0.41], NO_CAST);
  return root;
}

export function buildTelescope(kit, { color = 'cream' } = {}) {
  const root = group('telescope');
  const metal = kit.material('metal', { metalness: 0.4, roughness: 0.5 });
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    const leg = kit.part(root, kit.box(0.025, 1.0, 0.025), metal, [Math.sin(angle) * 0.17, 0.48, Math.cos(angle) * 0.17]);
    // Tilt each leg so the tops meet under the tube.
    leg.rotation.set(-Math.cos(angle) * 0.34, 0, Math.sin(angle) * 0.34);
  }
  const tube = group('tube');
  tube.position.set(0, 1.0, 0);
  tube.rotation.x = -0.55;
  kit.part(tube, kit.cylinder(0.065, 0.05, 0.85, 18), kit.material(color, { roughness: 0.4 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
  kit.part(tube, kit.cylinder(0.072, 0.072, 0.06, 18), metal, [0, 0, -0.42], [Math.PI / 2, 0, 0]);
  kit.part(tube, kit.cylinder(0.018, 0.018, 0.1, 8), metal, [0, 0.05, 0.4], null, NO_CAST);
  root.add(tube);
  return root;
}

export function buildBasketball(kit) {
  const root = group('basketball');
  const map = kit.texture(createBallTexture());
  kit.part(root, kit.sphere(0.12, 20, 14), kit.material('#ffffff', { map, roughness: 0.8 }), [0, 0.12, 0]);
  return root;
}

export function buildYogaMat(kit, { color = 'sage' } = {}) {
  const root = group('yoga-mat');
  const mat = kit.material(color, { roughness: 1 });
  kit.part(root, kit.rounded(0.6, 0.012, 1.6, 0.005), mat, [0, 0.006, 0], null, NO_CAST);
  kit.part(root, kit.cylinder(0.06, 0.06, 0.6, 16), mat, [0, 0.06, -0.85], [0, 0, Math.PI / 2]);
  return root;
}

// ---- Decor ----

/** A floating shelf. Small things can stand on it (catalogue "support"). */
export function buildWallShelf(kit, { color = 'woodMid', width = 0.9 } = {}) {
  const root = group('wall-shelf');
  const wood = kit.material(color);
  kit.part(root, kit.rounded(width, 0.04, 0.24, 0.008), wood, [0, -0.02, 0.12]);
  for (const x of [-width * 0.35, width * 0.35]) {
    kit.part(root, kit.box(0.03, 0.14, 0.03), kit.material('metal'), [x, -0.1, 0.02]);
    kit.part(root, kit.box(0.03, 0.03, 0.18), kit.material('metal'), [x, -0.055, 0.1]);
  }
  return root;
}

export function buildBeanBag(kit, { color = 'mustard' } = {}) {
  const root = group('bean-bag');
  const fabric = kit.material(color, { roughness: 1 });
  const seat = kit.part(root, kit.sphere(0.45, 20, 14), fabric, [0, 0.27, 0]);
  seat.scale.set(1, 0.62, 1);
  const back = kit.part(root, kit.sphere(0.32, 16, 12), fabric, [0, 0.5, -0.22]);
  back.scale.set(1.1, 0.8, 0.6);
  return root;
}

export function buildHangingPlant(kit, { color = 'terracotta', drop = 0.8 } = {}) {
  const root = group('hanging-plant');
  const cord = kit.material('#c9b48a', { roughness: 1 });
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2;
    kit.part(root, kit.cylinder(0.005, 0.005, drop, 5), cord, [Math.sin(angle) * 0.06, -drop / 2, Math.cos(angle) * 0.06], [-Math.cos(angle) * 0.08, 0, Math.sin(angle) * 0.08], NO_CAST);
  }
  kit.part(root, kit.cylinder(0.14, 0.1, 0.16, 16), kit.material(color), [0, -drop - 0.08, 0]);
  const leaf = kit.material('leaf', { roughness: 0.8 });
  const dark = kit.material('leafDark', { roughness: 0.8 });
  for (let i = 0; i < 7; i += 1) {
    const angle = (i / 7) * Math.PI * 2;
    const length = 0.25 + (i % 3) * 0.12;
    const vine = kit.part(root, kit.box(0.05, length, 0.02), i % 2 ? leaf : dark, [Math.sin(angle) * 0.13, -drop - length / 2, Math.cos(angle) * 0.13], null, NO_CAST);
    vine.rotation.set(Math.cos(angle) * 0.25, angle, -Math.sin(angle) * 0.25);
  }
  kit.part(root, kit.sphere(0.13, 12, 8), leaf, [0, -drop + 0.02, 0]);
  return root;
}

export function buildCactus(kit, { color = 'terracotta' } = {}) {
  const root = group('cactus');
  kit.part(root, kit.cylinder(0.08, 0.06, 0.1, 14), kit.material(color), [0, 0.05, 0]);
  const green = kit.material('#5f8f4e', { roughness: 0.7 });
  kit.part(root, kit.cylinder(0.04, 0.045, 0.24, 10), green, [0, 0.22, 0]);
  kit.part(root, kit.sphere(0.04, 10, 8), green, [0, 0.34, 0]);
  kit.part(root, kit.cylinder(0.022, 0.022, 0.08, 8), green, [0.05, 0.22, 0], [0, 0, Math.PI / 2]);
  kit.part(root, kit.cylinder(0.022, 0.022, 0.08, 8), green, [0.085, 0.26, 0]);
  kit.part(root, kit.sphere(0.022, 8, 6), kit.material('#ff8fc8'), [0, 0.38, 0], null, NO_CAST);
  return root;
}
