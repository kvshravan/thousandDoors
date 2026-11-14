import * as THREE from 'three';
import { createClockFaceTexture, createRugTexture, createSkyTexture } from './textures.js';

// Wall-mounted props use their origin as the point on the wall surface, front facing +z.
// Floor props use floor level at the centre of their footprint.

const NO_CAST = { castShadow: false };

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

export function buildRug(kit, { radius = 1.9 } = {}) {
  const rug = group('rug');
  const map = kit.texture(createRugTexture(kit.palette));
  kit.part(rug, kit.circle(radius, 64), kit.material('#ffffff', { map, roughness: 1 }), [0, 0.006, 0], [-Math.PI / 2, 0, 0], NO_CAST);
  return rug;
}

export function buildDoorMat(kit) {
  const mat = group('door-mat');
  kit.part(mat, kit.rounded(0.95, 0.02, 0.55, 0.008), kit.material('mustard', { roughness: 1 }), [0, 0.01, 0], null, NO_CAST);
  kit.part(mat, kit.box(0.75, 0.004, 0.06), kit.material('terracotta', { roughness: 1 }), [0, 0.021, 0], null, NO_CAST);
  return mat;
}

export function buildDoor(kit, { width = 1.05, height = 2.2 } = {}) {
  const door = group('door');
  const trim = kit.material('baseboard', { roughness: 0.7 });
  const jamb = 0.1;
  kit.part(door, kit.box(jamb, height + jamb, 0.1), trim, [-(width / 2 + jamb / 2), (height + jamb) / 2, 0.05]);
  kit.part(door, kit.box(jamb, height + jamb, 0.1), trim, [width / 2 + jamb / 2, (height + jamb) / 2, 0.05]);
  kit.part(door, kit.box(width + jamb * 2 + 0.06, jamb, 0.11), trim, [0, height + jamb / 2, 0.055]);

  const panel = kit.material('terracotta', { roughness: 0.75 });
  kit.part(door, kit.rounded(width, height, 0.06, 0.02), panel, [0, height / 2, 0.04]);
  const inset = kit.rounded(width * 0.34, height * 0.36, 0.025, 0.012);
  const insetMaterial = kit.material('#d98a67', { roughness: 0.75 });
  for (const sx of [-1, 1]) {
    for (const y of [height * 0.28, height * 0.7]) {
      kit.part(door, inset, insetMaterial, [sx * width * 0.21, y, 0.078], null, NO_CAST);
    }
  }
  const brass = kit.material('brass', { metalness: 0.6, roughness: 0.35 });
  kit.part(door, kit.cylinder(0.05, 0.05, 0.02, 16), brass, [width * 0.38, height * 0.48, 0.08], [Math.PI / 2, 0, 0]);
  kit.part(door, kit.sphere(0.045, 14, 10), brass, [width * 0.38, height * 0.48, 0.12]);
  kit.part(door, kit.rounded(0.32, 0.1, 0.015, 0.006), brass, [0, height * 0.86, 0.075], null, NO_CAST);
  return door;
}

export function buildWindow(kit, { width = 2.0, height = 1.5 } = {}) {
  const win = group('window');
  const sky = kit.texture(createSkyTexture(kit.palette));
  kit.part(win, kit.plane(width, height), kit.material('#ffffff', { map: sky, basic: true }), [0, 0, 0.01], null, {
    castShadow: false,
    receiveShadow: false,
  });

  const frame = kit.material('baseboard', { roughness: 0.6 });
  const f = 0.09;
  kit.part(win, kit.box(width + 2 * f, f, 0.1), frame, [0, height / 2 + f / 2, 0.05]);
  kit.part(win, kit.box(width + 2 * f, f, 0.1), frame, [0, -height / 2 - f / 2, 0.05]);
  kit.part(win, kit.box(f, height, 0.1), frame, [-width / 2 - f / 2, 0, 0.05]);
  kit.part(win, kit.box(f, height, 0.1), frame, [width / 2 + f / 2, 0, 0.05]);
  kit.part(win, kit.box(0.04, height, 0.05), frame, [0, 0, 0.03], null, NO_CAST);
  kit.part(win, kit.box(width, 0.04, 0.05), frame, [0, height * 0.12, 0.03], null, NO_CAST);
  kit.part(win, kit.rounded(width + 0.35, 0.05, 0.22, 0.015), frame, [0, -height / 2 - f - 0.02, 0.11]);

  const rodY = height / 2 + 0.2;
  kit.part(
    win,
    kit.cylinder(0.018, 0.018, width + 0.9, 8),
    kit.material('woodDark'),
    [0, rodY, 0.16],
    [0, 0, Math.PI / 2],
    NO_CAST,
  );
  const curtainMaterial = kit.material('dustyPink', { roughness: 1 });
  const fold = kit.cylinder(0.055, 0.065, height + 0.45, 8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const x = side * (width / 2 + 0.06 + i * 0.075);
      kit.part(win, fold, curtainMaterial, [x, rodY - (height + 0.45) / 2 - 0.02, 0.16 + (i % 2) * 0.02], null, NO_CAST);
    }
  }
  return win;
}

export async function buildPictureFrame(
  kit,
  { width = 0.6, height = 0.8, imageUrl = null, frameColor = 'woodDark' } = {},
  { loader } = {},
) {
  const frame = group('picture-frame');
  const border = 0.05;
  kit.part(frame, kit.rounded(width, height, 0.04, 0.012), kit.material(frameColor, { roughness: 0.7 }), [0, 0, 0.02], null, NO_CAST);
  const map = imageUrl && loader ? await loader.loadTexture(imageUrl) : null;
  kit.part(
    frame,
    kit.plane(width - border * 2, height - border * 2),
    kit.material(map ? '#ffffff' : 'cream', { map, roughness: 0.9 }),
    [0, 0, 0.041],
    null,
    NO_CAST,
  );
  return frame;
}

export function buildGuestbook(kit) {
  const stand = group('guestbook');
  const wood = kit.material('woodMid');
  kit.part(stand, kit.cylinder(0.2, 0.24, 0.05, 20), wood, [0, 0.025, 0]);
  kit.part(stand, kit.cylinder(0.035, 0.045, 0.85, 10), wood, [0, 0.45, 0]);

  const top = group('guestbook-top');
  top.position.set(0, 0.95, 0);
  top.rotation.x = -0.5;
  kit.part(top, kit.rounded(0.6, 0.04, 0.44, 0.014), kit.material('woodMid'), [0, 0, 0]);
  kit.part(top, kit.box(0.56, 0.012, 0.03), kit.material('woodDark'), [0, 0.024, 0.21]);
  kit.part(top, kit.rounded(0.54, 0.022, 0.38, 0.008), kit.material('terracotta'), [0, 0.03, 0]);
  const page = kit.rounded(0.25, 0.02, 0.35, 0.006);
  const paper = kit.material('linen', { roughness: 0.95 });
  kit.part(top, page, paper, [-0.13, 0.05, 0], [0, 0, 0.06]);
  kit.part(top, page, paper, [0.13, 0.05, 0], [0, 0, -0.06]);
  kit.part(top, kit.box(0.018, 0.004, 0.36), kit.material('mustard'), [0.02, 0.066, 0.02], null, NO_CAST);
  kit.part(top, kit.cylinder(0.009, 0.009, 0.18, 6), kit.material('navy'), [0.19, 0.07, 0.06], [0, 0.6, Math.PI / 2], NO_CAST);
  stand.add(top);
  return stand;
}

export function buildWallClock(kit, { radius = 0.28 } = {}) {
  const clock = group('wall-clock');
  kit.part(clock, kit.cylinder(radius, radius, 0.05, 32), kit.material('woodDark'), [0, 0, 0.025], [Math.PI / 2, 0, 0], NO_CAST);
  const face = kit.texture(createClockFaceTexture(kit.palette));
  kit.part(clock, kit.circle(radius * 0.88, 32), kit.material('#ffffff', { map: face, roughness: 0.9 }), [0, 0, 0.052], null, NO_CAST);

  const handMaterial = kit.material('metal');
  const makeHand = (length, thickness, z) => {
    const pivot = group('clock-hand');
    pivot.position.set(0, 0, z);
    kit.part(pivot, kit.box(thickness, length, 0.008), handMaterial, [0, length / 2 - 0.02, 0], null, NO_CAST);
    clock.add(pivot);
    return pivot;
  };
  const hourHand = makeHand(radius * 0.5, 0.03, 0.058);
  const minuteHand = makeHand(radius * 0.75, 0.02, 0.066);
  kit.part(clock, kit.cylinder(0.025, 0.025, 0.02, 12), kit.material('brass', { metalness: 0.5 }), [0, 0, 0.07], [Math.PI / 2, 0, 0], NO_CAST);

  let lastMinute = -1;
  kit.addUpdater(() => {
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (minutes === lastMinute) return false;
    lastMinute = minutes;
    minuteHand.rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;
    hourHand.rotation.z = -((minutes % 720) / 720) * Math.PI * 2;
    return true;
  });
  return clock;
}

export function buildPendantLamp(kit, { drop = 1.0 } = {}) {
  const lamp = group('pendant-lamp');
  kit.part(lamp, kit.cylinder(0.006, 0.006, drop, 6), kit.material('metal'), [0, -drop / 2, 0], null, NO_CAST);
  kit.part(lamp, kit.cylinder(0.06, 0.06, 0.03, 12), kit.material('metal'), [0, -0.015, 0], null, NO_CAST);
  kit.part(
    lamp,
    kit.cylinder(0.07, 0.3, 0.24, 24, true),
    kit.material('mustard', { side: THREE.DoubleSide, roughness: 0.7 }),
    [0, -drop - 0.1, 0],
    null,
    NO_CAST,
  );
  const bulb = kit.part(
    lamp,
    kit.sphere(0.07, 14, 10),
    kit.material('lampGlow', { emissive: 'lampGlow', emissiveIntensity: 1.4 }),
    [0, -drop - 0.17, 0],
    null,
    { castShadow: false, receiveShadow: false },
  );
  bulb.userData.glow = true;
  return lamp;
}
