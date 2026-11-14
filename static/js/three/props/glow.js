import * as THREE from 'three';
import { createNeonTexture } from './textures.js';

// Things that glow. Parts marked userData.glow follow the owner's light settings
// (colour, brightness, effect); userData.offMaterial is how they look switched off.

const NO_SHADOW = { castShadow: false, receiveShadow: false };
const NO_CAST = { castShadow: false };
export const MAX_PHOTOS = 6;

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

function glowing(mesh, offMaterial) {
  mesh.userData.glow = true;
  mesh.userData.offMaterial = offMaterial;
  return mesh;
}

const bulbOn = (kit) => kit.material('lampGlow', { emissive: 'lampGlow', emissiveIntensity: 1.2, roughness: 0.3 });
const bulbOff = (kit) => kit.material('#8a847c', { roughness: 0.35 });

/** Points along a scalloped garland hung from the wall: `swags` dips across `width`. */
function garlandPoints(width, swags, sag) {
  const points = [];
  const steps = swags * 12;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const local = (t * swags) % 1;
    const y = -sag * Math.sin(Math.PI * (i === steps ? 1 : local));
    points.push(new THREE.Vector3(-width / 2 + t * width, y, 0.03));
  }
  return points;
}

function garland(kit, parent, width, swags, sag, wireColor = '#3a3330') {
  const points = garlandPoints(width, swags, sag);
  const curve = new THREE.CatmullRomCurve3(points);
  const wire = kit.geometry(`garland:${width}:${swags}:${sag}`, () => new THREE.TubeGeometry(curve, swags * 24, 0.006, 5, false));
  kit.part(parent, wire, kit.material(wireColor), [0, 0, 0], null, NO_CAST);
  kit.part(parent, kit.sphere(0.02, 8, 6), kit.material(wireColor), [-width / 2, 0, 0.03], null, NO_CAST);
  kit.part(parent, kit.sphere(0.02, 8, 6), kit.material(wireColor), [width / 2, 0, 0.03], null, NO_CAST);
  return curve;
}

export function buildFairyLights(kit, { width = 1.8, bulbs = 14 } = {}) {
  const root = group('fairy-lights');
  const curve = garland(kit, root, width, 3, 0.16);
  for (let i = 0; i < bulbs; i += 1) {
    const point = curve.getPointAt((i + 0.5) / bulbs);
    const bulb = kit.part(root, kit.sphere(0.028, 10, 8), bulbOn(kit), [point.x, point.y - 0.03, point.z + 0.005], null, NO_SHADOW);
    glowing(bulb, bulbOff(kit));
  }
  return root;
}

export function buildLedStrip(kit, { width = 1.6 } = {}) {
  const root = group('led-strip');
  kit.part(root, kit.box(width + 0.04, 0.04, 0.025), kit.material('#c9c2b8', { metalness: 0.5, roughness: 0.4 }), [0, 0, 0.0125], null, NO_CAST);
  const strip = kit.part(root, kit.box(width, 0.022, 0.006), bulbOn(kit), [0, 0, 0.027], null, NO_SHADOW);
  glowing(strip, kit.material('#e8e2d8', { roughness: 0.5 }));
  return root;
}

export function buildNeonSign(kit, { text = 'hello' } = {}) {
  const root = group('neon-sign');
  const label = String(text).trim().slice(0, 24) || 'hello';
  const { texture, aspect } = createNeonTexture(label);
  kit.texture(texture);
  const height = 0.34;
  const width = Math.min(1.9, height * aspect);
  kit.part(root, kit.rounded(width + 0.08, height + 0.06, 0.015, 0.01), kit.material('#30283a', { transparent: true, opacity: 0.55, roughness: 0.2 }), [0, 0, 0.0075], null, NO_CAST);
  const glass = kit.part(
    root,
    kit.plane(width, (width / aspect)),
    kit.material('#ffffff', { map: texture, transparent: true, emissive: '#ffffff', emissiveIntensity: 1 }),
    [0, 0, 0.018],
    null,
    NO_SHADOW,
  );
  glowing(glass, kit.material('#a8a29a', { map: texture, transparent: true }));
  root.userData.controls = { state: { text: label }, actions: {} };
  return root;
}

export function buildCandles(kit) {
  const root = group('candles');
  kit.part(root, kit.cylinder(0.14, 0.15, 0.015, 20), kit.material('brass', { metalness: 0.6, roughness: 0.35 }), [0, 0.0075, 0]);
  const wax = kit.material('cream', { roughness: 0.7 });
  const flameOff = kit.material('#3a3330');
  for (const [x, z, height] of [[-0.06, 0.02, 0.16], [0.05, -0.04, 0.22], [0.06, 0.06, 0.11]]) {
    kit.part(root, kit.cylinder(0.035, 0.035, height, 14), wax, [x, 0.015 + height / 2, z]);
    const flame = kit.part(root, kit.sphere(0.018, 8, 8), kit.material('#ffb35c', { emissive: '#ffb35c', emissiveIntensity: 1.3 }), [x, 0.015 + height + 0.028, z], null, NO_SHADOW);
    flame.scale.set(1, 1.7, 1);
    glowing(flame, flameOff);
  }
  return root;
}

export function buildLavaLamp(kit, { color = 'metal' } = {}) {
  const root = group('lava-lamp');
  const metal = kit.material(color, { metalness: 0.6, roughness: 0.35 });
  kit.part(root, kit.cylinder(0.05, 0.09, 0.14, 18), metal, [0, 0.07, 0]);
  kit.part(root, kit.cylinder(0.065, 0.05, 0.34, 18), kit.material('#5a4a70', { transparent: true, opacity: 0.45, roughness: 0.1 }), [0, 0.31, 0], null, NO_CAST);
  kit.part(root, kit.cylinder(0.03, 0.065, 0.08, 18), metal, [0, 0.52, 0]);
  for (const [y, r] of [[0.2, 0.04], [0.31, 0.03], [0.42, 0.035]]) {
    const blob = kit.part(root, kit.sphere(r, 12, 10), kit.material('#ff8fc8', { emissive: '#ff8fc8', emissiveIntensity: 1 }), [((y * 100) % 3) * 0.008 - 0.008, y, 0], null, NO_SHADOW);
    blob.scale.set(1, 1.3, 1);
    glowing(blob, kit.material('#7a4a6e'));
  }
  return root;
}

export function buildPaperLantern(kit, { drop = 0.7 } = {}) {
  const root = group('paper-lantern');
  kit.part(root, kit.cylinder(0.006, 0.006, drop, 6), kit.material('metal'), [0, -drop / 2, 0], null, NO_CAST);
  kit.part(root, kit.cylinder(0.04, 0.05, 0.03, 12), kit.material('metal'), [0, -drop, 0], null, NO_CAST);
  const paper = kit.part(root, kit.sphere(0.24, 20, 14), kit.material('#fff4e0', { emissive: '#ffd79a', emissiveIntensity: 0.9, roughness: 0.9 }), [0, -drop - 0.22, 0], null, NO_SHADOW);
  glowing(paper, kit.material('#f4ede0', { roughness: 0.95 }));
  paper.userData.keepColor = true;
  return root;
}

/**
 * Photos pegged along a string of fairy lights. `photos` are image references
 * (static URLs or "upload:<id>"), resolved through images.resolve().
 */
export async function buildPhotoString(kit, { photos = [], width = 1.7 } = {}, { loader, images } = {}) {
  const root = group('photo-string');
  const curve = garland(kit, root, width, 1, 0.14, '#6b5a48');
  const refs = (Array.isArray(photos) ? photos : []).slice(0, MAX_PHOTOS);
  const slots = Math.max(refs.length, 3);

  const frame = kit.material('#fbf8f2', { roughness: 0.9 });
  const peg = kit.material('woodLight');
  const blank = kit.material('cream', { roughness: 1 });
  const textures = await Promise.all(
    refs.map(async (ref) => {
      try {
        const url = images ? await images.resolve(ref) : ref;
        return url && loader ? await loader.loadTexture(url) : null;
      } catch {
        return null;
      }
    }),
  );
  for (let i = 0; i < slots; i += 1) {
    const point = curve.getPointAt((i + 0.5) / slots);
    const card = group('photo');
    card.position.set(point.x, point.y - 0.02, 0.035);
    card.rotation.z = ((i * 37) % 9) / 60 - 0.07;
    kit.part(card, kit.box(0.02, 0.05, 0.012), peg, [0, 0, 0.008], null, NO_CAST);
    kit.part(card, kit.box(0.2, 0.24, 0.004), frame, [0, -0.13, 0], null, NO_CAST);
    const map = textures[i] ?? null;
    kit.part(card, kit.plane(0.17, 0.17), map ? kit.material('#ffffff', { map, roughness: 0.9 }) : blank, [0, -0.115, 0.0025], null, NO_SHADOW);
    root.add(card);
  }
  // Bulbs between the photos.
  for (let i = 0; i <= slots; i += 1) {
    const point = curve.getPointAt(Math.min(0.98, Math.max(0.02, i / slots)));
    const bulb = kit.part(root, kit.sphere(0.024, 10, 8), bulbOn(kit), [point.x, point.y - 0.02, point.z + 0.01], null, NO_SHADOW);
    glowing(bulb, bulbOff(kit));
  }
  root.userData.controls = { state: { photos: refs.length, shown: textures.filter(Boolean).length }, actions: {} };
  return root;
}
