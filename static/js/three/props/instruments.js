import * as THREE from 'three';
import { createKeysTexture } from './textures.js';

// Musical instruments (for show; they don't play). Floor props stand on y = 0,
// surface props lie on y = 0, wall props hang from the wall at z = 0 facing +z.

const NO_CAST = { castShadow: false };

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

/**
 * A guitar standing upright with its back at z = 0 and the bottom of the body at y = 0.
 * scale 1 is a full-size guitar (about 1 m long).
 */
function guitar(kit, { body = 'woodLight', neck = 'woodDark', electric = false, scale = 1 } = {}) {
  const g = group('guitar');
  const depth = (electric ? 0.045 : 0.1) * scale;
  const bodyMaterial = kit.material(body, { roughness: 0.5 });
  const lower = 0.19 * scale;
  const upper = (electric ? 0.14 : 0.15) * scale;
  const turn = [Math.PI / 2, 0, 0];
  kit.part(g, kit.cylinder(lower, lower, depth, 24), bodyMaterial, [0, lower, depth / 2], turn);
  kit.part(g, kit.cylinder(upper, upper, depth, 24), bodyMaterial, [0, lower * 1.95, depth / 2], turn);
  if (electric) {
    // Pickguard and pickups.
    kit.part(g, kit.circle(lower * 0.7, 20), kit.material('#f4efe6'), [lower * 0.25, lower * 0.9, depth + 0.002], null, NO_CAST);
    for (const y of [0.7, 1.05]) {
      kit.part(g, kit.box(0.08 * scale, 0.02 * scale, 0.01), kit.material('#2d2a2e'), [0, lower * y + 0.08 * scale, depth + 0.006], null, NO_CAST);
    }
  } else {
    kit.part(g, kit.circle(0.05 * scale, 20), kit.material('#2d2320'), [0, lower * 1.7, depth + 0.002], null, NO_CAST);
    kit.part(g, kit.box(0.12 * scale, 0.02 * scale, 0.01), kit.material(neck), [0, lower * 0.7, depth + 0.005], null, NO_CAST);
  }
  const neckLength = 0.48 * scale;
  const neckBase = lower * 2 + upper * 0.6;
  kit.part(g, kit.box(0.05 * scale, neckLength, 0.03 * scale), kit.material(neck), [0, neckBase + neckLength / 2, depth * 0.6]);
  kit.part(g, kit.rounded(0.08 * scale, 0.16 * scale, 0.025 * scale, 0.01), kit.material(neck), [0, neckBase + neckLength + 0.07 * scale, depth * 0.55]);
  // Strings, as one thin pale strip.
  kit.part(g, kit.box(0.03 * scale, neckLength + lower * 1.6, 0.003), kit.material('#d8d2c8', { metalness: 0.6, roughness: 0.3 }), [0, neckBase + neckLength / 2 - lower * 0.6, depth + 0.012 * scale], null, NO_CAST);
  return g;
}

function stand(kit, height) {
  const s = group('stand');
  const metal = kit.material('metal', { metalness: 0.4, roughness: 0.5 });
  for (const x of [-0.14, 0.14]) {
    kit.part(s, kit.box(0.025, 0.025, 0.36), metal, [x, 0.02, 0.05]);
  }
  kit.part(s, kit.box(0.025, height, 0.025), metal, [0, height / 2, -0.12], [-0.12, 0, 0]);
  kit.part(s, kit.box(0.32, 0.025, 0.04), metal, [0, 0.16, 0.12]);
  return s;
}

export function buildAcousticGuitar(kit, { color = 'woodLight' } = {}) {
  const root = group('acoustic-guitar');
  root.add(stand(kit, 0.7));
  const g = guitar(kit, { body: color });
  g.position.set(0, 0.12, -0.02);
  g.rotation.x = -0.18;
  root.add(g);
  return root;
}

export function buildElectricGuitar(kit, { color = 'terracotta' } = {}) {
  const root = group('electric-guitar');
  root.add(stand(kit, 0.7));
  const g = guitar(kit, { body: color, neck: 'woodMid', electric: true });
  g.position.set(0, 0.12, 0);
  g.rotation.x = -0.18;
  root.add(g);
  return root;
}

export function buildGuitarWall(kit, { color = 'woodLight' } = {}) {
  const root = group('guitar-wall');
  const g = guitar(kit, { body: color });
  g.position.set(0, -0.55, 0.02);
  root.add(g);
  kit.part(root, kit.box(0.12, 0.04, 0.08), kit.material('woodDark'), [0, 0.43, 0.04]);
  return root;
}

export function buildUkulele(kit, { color = 'woodMid' } = {}) {
  const root = group('ukulele');
  const g = guitar(kit, { body: color, scale: 0.55 });
  // Lying on its back, neck pointing away.
  g.rotation.x = -Math.PI / 2;
  g.position.set(0, 0.002, 0.25);
  root.add(g);
  return root;
}

export function buildViolin(kit, { color = 'woodMid' } = {}) {
  const root = group('violin');
  kit.part(root, kit.rounded(0.78, 0.06, 0.3, 0.03), kit.material('#2d2a2e'), [0, 0.03, 0]);
  kit.part(root, kit.box(0.72, 0.004, 0.24), kit.material('#7a4a6e', { roughness: 1 }), [0, 0.062, 0], null, NO_CAST);
  const g = guitar(kit, { body: color, neck: '#2d2320', scale: 0.38, electric: true });
  g.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  g.position.set(0.24, 0.064, 0);
  root.add(g);
  kit.part(root, kit.box(0.6, 0.008, 0.008), kit.material('woodDark'), [0, 0.07, 0.095], null, NO_CAST);
  return root;
}

export function buildKeyboard(kit, { color = '#2d2a2e' } = {}) {
  const root = group('keyboard');
  const metal = kit.material('metal', { metalness: 0.4, roughness: 0.5 });
  // X stand.
  for (const side of [-0.38, 0.38]) {
    kit.part(root, kit.box(0.03, 0.95, 0.03), metal, [side, 0.4, 0], [0.55, 0, 0]);
    kit.part(root, kit.box(0.03, 0.95, 0.03), metal, [side, 0.4, 0], [-0.55, 0, 0]);
  }
  kit.part(root, kit.rounded(1.1, 0.08, 0.32, 0.02), kit.material(color, { roughness: 0.5 }), [0, 0.82, 0]);
  const keys = kit.texture(createKeysTexture(4));
  kit.part(root, kit.plane(1.0, 0.16), kit.material('#ffffff', { map: keys, roughness: 0.6 }), [0, 0.861, 0.06], [-Math.PI / 2, 0, 0], NO_CAST);
  for (let i = 0; i < 4; i += 1) {
    kit.part(root, kit.cylinder(0.012, 0.012, 0.01, 10), kit.material('#c9c2b8'), [-0.4 + i * 0.05, 0.865, -0.09], null, NO_CAST);
  }
  return root;
}

export function buildPiano(kit, { color = 'woodDark' } = {}) {
  const root = group('piano');
  const wood = kit.material(color, { roughness: 0.45 });
  kit.part(root, kit.rounded(1.45, 1.2, 0.5, 0.03), wood, [0, 0.6, -0.1]);
  kit.part(root, kit.rounded(1.45, 0.08, 0.32, 0.02), wood, [0, 0.72, 0.28]);
  const keys = kit.texture(createKeysTexture(7));
  kit.part(root, kit.plane(1.32, 0.16), kit.material('#ffffff', { map: keys, roughness: 0.6 }), [0, 0.762, 0.33], [-Math.PI / 2, 0, 0], NO_CAST);
  for (const x of [-0.66, 0.66]) kit.part(root, kit.box(0.06, 0.72, 0.06), wood, [x, 0.36, 0.38]);
  kit.part(root, kit.box(0.5, 0.2, 0.02), kit.material('cream', { roughness: 1 }), [0, 1.0, 0.16], [-0.25, 0, 0], NO_CAST);
  // A small bench.
  kit.part(root, kit.rounded(0.8, 0.07, 0.34, 0.02), wood, [0, 0.48, 0.85]);
  for (const x of [-0.34, 0.34]) kit.part(root, kit.box(0.05, 0.45, 0.25), wood, [x, 0.225, 0.85]);
  return root;
}

export function buildDrumKit(kit, { color = 'navy' } = {}) {
  const root = group('drum-kit');
  const shell = kit.material(color, { roughness: 0.4, metalness: 0.1 });
  const head = kit.material('#f4efe6', { roughness: 0.9 });
  const metal = kit.material('#c9c2b8', { metalness: 0.6, roughness: 0.35 });
  const brass = kit.material('brass', { metalness: 0.7, roughness: 0.3 });
  const side = [Math.PI / 2, 0, 0];
  // Bass drum on its side, facing the front.
  kit.part(root, kit.cylinder(0.28, 0.28, 0.36, 24), shell, [0, 0.29, 0], side);
  kit.part(root, kit.circle(0.26, 24), head, [0, 0.29, 0.181], null, NO_CAST);
  kit.part(root, kit.circle(0.09, 20), kit.material('terracotta'), [0, 0.29, 0.183], null, NO_CAST);
  const drum = (radius, depth, x, y, z) => {
    kit.part(root, kit.cylinder(radius, radius, depth, 20), shell, [x, y, z]);
    kit.part(root, kit.cylinder(radius * 0.97, radius * 0.97, 0.004, 20), head, [x, y + depth / 2 + 0.002, z], null, NO_CAST);
  };
  drum(0.13, 0.12, -0.12, 0.7, 0.02);
  drum(0.14, 0.13, 0.14, 0.72, 0.02);
  drum(0.18, 0.3, 0.5, 0.42, 0.25);
  drum(0.17, 0.12, -0.42, 0.6, 0.3);
  for (const x of [-0.42, 0.5]) kit.part(root, kit.cylinder(0.012, 0.012, 0.42, 8), metal, [x, 0.21, x < 0 ? 0.3 : 0.25]);
  // Hi-hat and crash cymbal on stands.
  const cymbal = (x, z, height, radius) => {
    kit.part(root, kit.cylinder(0.012, 0.012, height, 8), metal, [x, height / 2, z]);
    kit.part(root, kit.cylinder(0.006, radius, 0.02, 24), brass, [x, height + 0.01, z]);
  };
  cymbal(-0.62, 0.15, 0.82, 0.17);
  cymbal(0.45, -0.25, 1.15, 0.21);
  // Stool.
  kit.part(root, kit.cylinder(0.15, 0.15, 0.06, 16), kit.material('#2d2a2e'), [0, 0.5, 0.65]);
  kit.part(root, kit.cylinder(0.02, 0.02, 0.48, 8), metal, [0, 0.24, 0.65]);
  return root;
}

export function buildAmp(kit, { color = '#2d2a2e' } = {}) {
  const root = group('amp');
  kit.part(root, kit.rounded(0.55, 0.48, 0.28, 0.03), kit.material(color, { roughness: 0.9 }), [0, 0.24, 0]);
  kit.part(root, kit.plane(0.46, 0.3), kit.material('#5a4a40', { roughness: 1 }), [0, 0.2, 0.141], null, NO_CAST);
  kit.part(root, kit.box(0.46, 0.06, 0.01), kit.material('#c9b48a'), [0, 0.41, 0.142], null, NO_CAST);
  for (let i = 0; i < 5; i += 1) {
    kit.part(root, kit.cylinder(0.012, 0.012, 0.02, 10), kit.material('#f4efe6'), [-0.16 + i * 0.08, 0.41, 0.15], [Math.PI / 2, 0, 0], NO_CAST);
  }
  kit.part(root, kit.box(0.2, 0.025, 0.04), kit.material('#2d2a2e'), [0, 0.49, 0]);
  return root;
}

export function buildMicStand(kit, { color = 'metal' } = {}) {
  const root = group('mic-stand');
  const metal = kit.material(color, { metalness: 0.5, roughness: 0.4 });
  kit.part(root, kit.cylinder(0.14, 0.15, 0.03, 20), metal, [0, 0.015, 0]);
  kit.part(root, kit.cylinder(0.012, 0.012, 1.45, 8), metal, [0, 0.74, 0]);
  kit.part(root, kit.cylinder(0.022, 0.016, 0.12, 12), kit.material('#2d2a2e'), [0, 1.5, 0.04], [0.4, 0, 0]);
  kit.part(root, kit.sphere(0.03, 12, 10), kit.material('#9a948a', { metalness: 0.6, roughness: 0.4 }), [0, 1.57, 0.07]);
  return root;
}

export function buildVinylCrate(kit, { color = 'woodLight' } = {}) {
  const root = group('vinyl-crate');
  const wood = kit.material(color);
  kit.part(root, kit.box(0.36, 0.02, 0.36), wood, [0, 0.01, 0]);
  for (const x of [-0.17, 0.17]) kit.part(root, kit.box(0.02, 0.3, 0.36), wood, [x, 0.15, 0]);
  for (const z of [-0.17, 0.17]) kit.part(root, kit.box(0.36, 0.2, 0.02), wood, [0, 0.1, z]);
  const sleeves = ['terracotta', 'navy', 'mustard', 'sage', 'dustyPink', '#2d2a2e', 'cream'];
  sleeves.forEach((sleeve, i) => {
    kit.part(root, kit.box(0.3, 0.31, 0.012), kit.material(sleeve), [0, 0.175, -0.13 + i * 0.04], [-0.12, 0, 0], NO_CAST);
  });
  return root;
}
