import * as THREE from 'three';
import { seededRandom } from './kit.js';

// Every prop is built around its own origin: floor level, centred on its
// footprint, with its front facing +z. Placement is done by the room scene.

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function addLamp(kit, parent, position, { intensity, distance, color = 'lampGlow' }) {
  const light = new THREE.PointLight(kit.color(color), intensity, distance, 2);
  light.position.set(...position);
  light.castShadow = false;
  parent.add(light);
  return light;
}

export function buildBed(kit, { width = 1.8, length = 2.2, blanket = 'navy' } = {}) {
  const bed = group('bed');
  const legH = 0.1;
  const frameH = 0.3;
  const mattressH = 0.22;
  const top = legH + frameH;
  const wood = kit.material('woodMid');

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.part(bed, kit.box(0.09, legH, 0.09), wood, [sx * (width / 2 - 0.08), legH / 2, sz * (length / 2 - 0.08)]);
  }
  kit.part(bed, kit.rounded(width, frameH, length, 0.05), wood, [0, legH + frameH / 2, 0]);
  kit.part(bed, kit.rounded(width + 0.1, 1.1, 0.12, 0.05), kit.material('woodDark'), [0, 0.55, -length / 2 + 0.02]);
  kit.part(bed, kit.rounded(width - 0.25, 0.48, 0.08, 0.04, 3), kit.material('mustard'), [0, 0.78, -length / 2 + 0.11]);

  const mattressL = length - 0.16;
  const mattressZ = 0.04;
  kit.part(bed, kit.rounded(width - 0.08, mattressH, mattressL, 0.08, 3), kit.material('linen'), [0, top + mattressH / 2, mattressZ]);

  const blanketL = mattressL * 0.64;
  const footEdge = mattressZ + mattressL / 2;
  kit.part(
    bed,
    kit.rounded(width - 0.02, 0.07, blanketL + 0.02, 0.03, 3),
    kit.material(blanket, { roughness: 0.95 }),
    [0, top + mattressH + 0.015, footEdge - blanketL / 2 + 0.01],
  );
  kit.part(
    bed,
    kit.rounded(width, 0.07, 0.34, 0.03, 3),
    kit.material('terracotta', { roughness: 0.95 }),
    [0, top + mattressH + 0.06, footEdge - 0.3],
  );

  const pillow = kit.rounded(0.66, 0.15, 0.42, 0.07, 3);
  const pillowZ = -length / 2 + 0.36;
  kit.part(bed, pillow, kit.material('linen'), [-0.42, top + mattressH + 0.08, pillowZ], [-0.25, 0.05, 0]);
  kit.part(bed, pillow, kit.material('dustyPink'), [0.42, top + mattressH + 0.08, pillowZ], [-0.25, -0.05, 0]);
  return bed;
}

export function buildNightstand(kit) {
  const stand = group('nightstand');
  const w = 0.55;
  const h = 0.55;
  const d = 0.45;
  kit.part(stand, kit.rounded(w, h, d, 0.035), kit.material('woodLight'), [0, h / 2, 0]);
  kit.part(stand, kit.rounded(w - 0.08, 0.2, 0.02, 0.008), kit.material('woodMid'), [0, h * 0.62, d / 2]);
  kit.part(stand, kit.sphere(0.022, 10, 8), kit.material('brass', { metalness: 0.5, roughness: 0.4 }), [0, h * 0.62, d / 2 + 0.025]);

  const lampY = h;
  kit.part(stand, kit.cylinder(0.08, 0.1, 0.05, 20), kit.material('terracotta'), [0.05, lampY + 0.025, -0.04]);
  kit.part(stand, kit.cylinder(0.015, 0.015, 0.26, 8), kit.material('metal'), [0.05, lampY + 0.18, -0.04]);
  kit.part(
    stand,
    kit.cylinder(0.11, 0.17, 0.2, 20, true),
    kit.material('cream', { emissive: 'lampGlow', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    [0.05, lampY + 0.36, -0.04],
    null,
    { castShadow: false },
  );
  addLamp(kit, stand, [0.05, lampY + 0.33, -0.04], { intensity: 1.6, distance: 4 });

  kit.part(stand, kit.rounded(0.16, 0.035, 0.12, 0.01), kit.material('navy'), [-0.14, lampY + 0.018, 0.08], [0, 0.3, 0]);
  return stand;
}

export function buildDesk(kit, { width = 1.7, depth = 0.7 } = {}) {
  const desk = group('desk');
  const height = 0.76;
  const topT = 0.05;
  const wood = kit.material('woodLight');
  const legMaterial = kit.material('woodMid');

  kit.part(desk, kit.rounded(width, topT, depth, 0.02), wood, [0, height - topT / 2, 0]);
  const leg = kit.box(0.06, height - topT, 0.06);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.part(desk, leg, legMaterial, [sx * (width / 2 - 0.07), (height - topT) / 2, sz * (depth / 2 - 0.07)]);
  }
  kit.part(desk, kit.rounded(0.45, 0.18, depth - 0.1, 0.02), wood, [width / 2 - 0.3, height - topT - 0.09, 0]);
  kit.part(desk, kit.sphere(0.018, 10, 8), kit.material('brass', { metalness: 0.5, roughness: 0.4 }), [width / 2 - 0.3, height - topT - 0.09, depth / 2 - 0.03]);

  const laptop = group('laptop');
  const shell = kit.material('#d4d7da', { roughness: 0.5, metalness: 0.2 });
  kit.part(laptop, kit.rounded(0.38, 0.018, 0.26, 0.006), shell, [0, 0.009, 0]);
  const lid = group('laptop-lid');
  lid.position.set(0, 0.018, -0.13);
  lid.rotation.x = -0.3;
  kit.part(lid, kit.rounded(0.38, 0.25, 0.012, 0.006), shell, [0, 0.125, 0]);
  kit.part(
    lid,
    kit.plane(0.34, 0.21),
    kit.material('screen', { emissive: 'screen', emissiveIntensity: 0.55 }),
    [0, 0.128, 0.0065],
    null,
    { castShadow: false },
  );
  laptop.add(lid);
  laptop.position.set(-0.1, height, 0.02);
  laptop.rotation.y = 0.12;
  desk.add(laptop);

  const mug = group('mug');
  kit.part(mug, kit.cylinder(0.042, 0.038, 0.1, 16), kit.material('terracotta'), [0, 0.05, 0]);
  kit.part(mug, kit.torus(0.028, 0.008, 6, 12), kit.material('terracotta'), [0.045, 0.055, 0], [0, 0, Math.PI / 2]);
  mug.position.set(0.42, height, 0.12);
  desk.add(mug);

  const bookColors = ['mustard', 'sage', 'dustyPink'];
  bookColors.forEach((color, i) => {
    kit.part(
      desk,
      kit.rounded(0.24, 0.04, 0.17, 0.008),
      kit.material(color),
      [-0.62, height + 0.02 + i * 0.04, -0.12],
      [0, 0.15 * (i - 1), 0],
    );
  });

  desk.add(positioned(buildPlant(kit, { seed: 21, scale: 0.28 }), [0.65, height, -0.18]));
  return desk;
}

export function buildChair(kit) {
  const chair = group('chair');
  const wood = kit.material('woodMid');
  const seatY = 0.46;
  const leg = kit.cylinder(0.022, 0.018, seatY, 8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.part(chair, leg, wood, [sx * 0.19, seatY / 2, sz * 0.18]);
  }
  kit.part(chair, kit.rounded(0.48, 0.05, 0.46, 0.02), wood, [0, seatY, 0]);
  kit.part(chair, kit.rounded(0.42, 0.06, 0.4, 0.03, 3), kit.material('mustard', { roughness: 0.95 }), [0, seatY + 0.05, 0.01]);
  const post = kit.cylinder(0.018, 0.018, 0.42, 8);
  kit.part(chair, post, wood, [-0.19, seatY + 0.21, -0.2]);
  kit.part(chair, post, wood, [0.19, seatY + 0.21, -0.2]);
  kit.part(chair, kit.rounded(0.46, 0.2, 0.04, 0.02), wood, [0, seatY + 0.33, -0.2], [0.08, 0, 0]);
  return chair;
}

export function buildBookshelf(kit, { width = 1.3, height = 1.9, depth = 0.36 } = {}) {
  const shelf = group('bookshelf');
  const t = 0.045;
  const wood = kit.material('woodMid');
  kit.part(shelf, kit.box(t, height, depth), wood, [-width / 2 + t / 2, height / 2, 0]);
  kit.part(shelf, kit.box(t, height, depth), wood, [width / 2 - t / 2, height / 2, 0]);
  kit.part(shelf, kit.rounded(width + 0.04, t, depth + 0.02, 0.015), wood, [0, height - t / 2, 0]);
  kit.part(shelf, kit.box(width - 2 * t, 0.08, depth), wood, [0, 0.04, 0]);
  kit.part(shelf, kit.box(width - 2 * t, height - t, 0.02), kit.material('woodDark'), [0, (height - t) / 2, -depth / 2 + 0.01], null, {
    castShadow: false,
  });

  const levels = 4;
  const innerW = width - 2 * t;
  const bottom = 0.08;
  const spacing = (height - t - bottom) / levels;
  const board = kit.box(innerW, t * 0.8, depth - 0.02);
  for (let i = 1; i < levels; i += 1) {
    kit.part(shelf, board, wood, [0, bottom + i * spacing, 0.01]);
  }

  const rand = seededRandom(42);
  const palette = ['terracotta', 'mustard', 'sage', 'navy', 'dustyPink', 'cream', 'woodDark'];
  const books = [];
  for (let level = 0; level < levels; level += 1) {
    const baseY = bottom + level * spacing + (level === 0 ? 0 : t * 0.4);
    const fillTo = level === 2 ? innerW * 0.55 : innerW - 0.04;
    let x = -innerW / 2 + 0.03;
    while (x < -innerW / 2 + fillTo) {
      const bw = 0.035 + rand() * 0.035;
      const bh = Math.min(spacing - 0.06, 0.2 + rand() * 0.13);
      const bd = 0.2 + rand() * 0.06;
      if (rand() < 0.08) {
        x += 0.05;
        continue;
      }
      books.push({ x: x + bw / 2, y: baseY + bh / 2, z: depth / 2 - bd / 2 - 0.03, w: bw, h: bh, d: bd, color: palette[Math.floor(rand() * palette.length)] });
      x += bw + 0.004;
    }
  }

  const bookMesh = new THREE.InstancedMesh(kit.box(1, 1, 1), kit.material('#ffffff', { roughness: 0.9 }), books.length);
  bookMesh.name = 'books';
  bookMesh.castShadow = kit.quality.shadows;
  bookMesh.receiveShadow = kit.quality.shadows;
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  books.forEach((book, i) => {
    matrix.makeScale(book.w, book.h, book.d).setPosition(book.x, book.y, book.z);
    bookMesh.setMatrixAt(i, matrix);
    bookMesh.setColorAt(i, color.set(kit.color(book.color)));
  });
  bookMesh.instanceMatrix.needsUpdate = true;
  if (bookMesh.instanceColor) bookMesh.instanceColor.needsUpdate = true;
  shelf.add(bookMesh);

  shelf.add(positioned(buildPlant(kit, { seed: 8, scale: 0.32 }), [innerW / 2 - 0.2, bottom + 2 * spacing + t * 0.4, 0.02]));
  kit.part(shelf, kit.sphere(0.09, 16, 12), kit.material('sage', { roughness: 0.6 }), [-0.35, height + 0.09, 0]);
  kit.part(shelf, kit.cylinder(0.05, 0.07, 0.03, 12), kit.material('woodDark'), [-0.35, height + 0.015, 0]);
  shelf.add(positioned(buildPlant(kit, { seed: 14, scale: 0.36 }), [0.3, height, 0]));
  return shelf;
}

export function buildPlant(kit, { seed = 1, scale = 1 } = {}) {
  const plant = group('plant');
  const rand = seededRandom(seed);
  const potH = 0.42;
  kit.part(plant, kit.cylinder(0.26, 0.19, potH, 10), kit.material('terracotta', { flatShading: true }), [0, potH / 2, 0]);
  kit.part(plant, kit.cylinder(0.285, 0.285, 0.06, 10), kit.material('terracotta', { flatShading: true }), [0, potH - 0.02, 0]);
  kit.part(plant, kit.cylinder(0.24, 0.24, 0.02, 10), kit.material('soil'), [0, potH - 0.005, 0], null, { castShadow: false });
  kit.part(plant, kit.cylinder(0.025, 0.035, 0.55, 6), kit.material('woodDark'), [0, potH + 0.27, 0]);

  const leaves = [kit.material('leaf', { flatShading: true }), kit.material('leafDark', { flatShading: true })];
  const clusters = 7;
  for (let i = 0; i < clusters; i += 1) {
    const angle = (i / clusters) * Math.PI * 2 + rand() * 0.6;
    const spread = 0.12 + rand() * 0.16;
    const radius = 0.2 + rand() * 0.12;
    const leaf = kit.part(
      plant,
      kit.icosahedron(0.25, 0),
      leaves[i % 2],
      [Math.cos(angle) * spread, potH + 0.55 + rand() * 0.55, Math.sin(angle) * spread],
      [rand() * Math.PI, rand() * Math.PI, 0],
    );
    leaf.scale.setScalar(radius / 0.25);
  }
  kit.part(plant, kit.icosahedron(0.25, 0), leaves[0], [0, potH + 1.2, 0], [0.4, 0.2, 0]);
  plant.scale.setScalar(scale);
  return plant;
}

export function buildFloorLamp(kit) {
  const lamp = group('floor-lamp');
  const metal = kit.material('metal', { roughness: 0.5, metalness: 0.3 });
  kit.part(lamp, kit.cylinder(0.17, 0.2, 0.04, 20), metal, [0, 0.02, 0]);
  kit.part(lamp, kit.cylinder(0.016, 0.016, 1.45, 8), metal, [0, 0.75, 0]);
  kit.part(
    lamp,
    kit.cylinder(0.17, 0.26, 0.32, 20, true),
    kit.material('cream', { emissive: 'lampGlow', emissiveIntensity: 0.55, side: THREE.DoubleSide }),
    [0, 1.55, 0],
    null,
    { castShadow: false },
  );
  addLamp(kit, lamp, [0, 1.5, 0], { intensity: 2.6, distance: 6 });
  return lamp;
}

export function buildSofa(kit, { width = 1.9, depth = 0.85, color = 'dustyPink' } = {}) {
  const sofa = group('sofa');
  const fabric = kit.material(color, { roughness: 0.95 });
  const legH = 0.08;
  const leg = kit.cylinder(0.025, 0.02, legH, 8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    kit.part(sofa, leg, kit.material('woodDark'), [sx * (width / 2 - 0.1), legH / 2, sz * (depth / 2 - 0.1)]);
  }
  kit.part(sofa, kit.rounded(width, 0.26, depth, 0.06, 3), fabric, [0, legH + 0.13, 0]);
  kit.part(sofa, kit.rounded(width, 0.55, 0.2, 0.08, 3), fabric, [0, legH + 0.5, -depth / 2 + 0.1]);
  const arm = kit.rounded(0.17, 0.36, depth, 0.07, 3);
  kit.part(sofa, arm, fabric, [-width / 2 + 0.085, legH + 0.36, 0]);
  kit.part(sofa, arm, fabric, [width / 2 - 0.085, legH + 0.36, 0]);
  const cushionW = (width - 0.36) / 2;
  const cushion = kit.rounded(cushionW - 0.01, 0.14, depth - 0.24, 0.06, 3);
  kit.part(sofa, cushion, fabric, [-cushionW / 2, legH + 0.33, 0.08]);
  kit.part(sofa, cushion, fabric, [cushionW / 2, legH + 0.33, 0.08]);
  const pillow = kit.rounded(0.38, 0.36, 0.12, 0.06, 3);
  kit.part(sofa, pillow, kit.material('mustard', { roughness: 0.95 }), [-0.5, legH + 0.6, -0.16], [-0.25, 0.25, 0.1]);
  kit.part(sofa, pillow, kit.material('sage', { roughness: 0.95 }), [0.5, legH + 0.6, -0.16], [-0.25, -0.2, -0.1]);
  return sofa;
}

export function buildSideTable(kit) {
  const table = group('side-table');
  const wood = kit.material('woodLight');
  kit.part(table, kit.cylinder(0.25, 0.25, 0.04, 24), wood, [0, 0.52, 0]);
  kit.part(table, kit.cylinder(0.03, 0.03, 0.5, 8), kit.material('woodMid'), [0, 0.25, 0]);
  kit.part(table, kit.cylinder(0.16, 0.18, 0.03, 20), kit.material('woodMid'), [0, 0.015, 0]);
  kit.part(table, kit.cylinder(0.045, 0.06, 0.18, 12), kit.material('navy', { roughness: 0.4 }), [0.05, 0.63, -0.03]);
  kit.part(table, kit.sphere(0.05, 10, 8), kit.material('mustard', { flatShading: true }), [0.05, 0.75, -0.03]);
  return table;
}

function positioned(object, position) {
  object.position.set(...position);
  return object;
}
