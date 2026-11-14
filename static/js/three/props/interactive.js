import * as THREE from 'three';
import { createPosterTexture } from './textures.js';

// Props that react to visitors. Each one exposes `userData.controls`:
//   { state: {...}, actions: { name: (...args) => result } }
// RoomScene.runAction(objectId, name, ...args) calls them, so the page never touches meshes.

const NO_CAST = { castShadow: false };

function group(name) {
  const g = new THREE.Group();
  g.name = name;
  return g;
}

export function buildPoster(
  kit,
  { width = 0.7, height = 1.0, title = '', subtitle = '', accent = 'terracotta', motif = 'sun', frameColor = 'woodDark' } = {},
) {
  const poster = group('poster');
  const map = kit.texture(createPosterTexture(kit.palette, { title, subtitle, accent, motif }));
  kit.part(poster, kit.rounded(width + 0.04, height + 0.04, 0.02, 0.006), kit.material(frameColor), [0, 0, 0.01], null, NO_CAST);
  kit.part(poster, kit.plane(width, height), kit.material('#ffffff', { map, roughness: 0.95 }), [0, 0, 0.021], null, NO_CAST);
  return poster;
}

export function buildRecordPlayer(kit, { label = 'mustard' } = {}) {
  const player = group('record-player');
  const metal = kit.material('#c9c2b8', { metalness: 0.4, roughness: 0.45 });
  kit.part(player, kit.rounded(0.56, 0.12, 0.42, 0.02), kit.material('woodMid'), [0, 0.06, 0]);
  kit.part(player, kit.box(0.52, 0.008, 0.38), kit.material('woodDark'), [0, 0.124, 0], null, NO_CAST);

  const platter = group('platter');
  platter.position.set(-0.06, 0.128, 0);
  kit.part(platter, kit.cylinder(0.165, 0.165, 0.012, 32), metal, [0, 0.006, 0]);
  const disc = group('disc');
  disc.position.y = 0.012;
  kit.part(disc, kit.cylinder(0.155, 0.155, 0.006, 40), kit.material('#221c1f', { roughness: 0.3 }), [0, 0.003, 0]);
  kit.part(disc, kit.cylinder(0.052, 0.052, 0.007, 24), kit.material(label), [0, 0.0035, 0], null, NO_CAST);
  kit.part(disc, kit.box(0.014, 0.008, 0.03), kit.material('cream'), [0, 0.006, 0.03], null, NO_CAST);
  platter.add(disc);
  player.add(platter);

  kit.part(player, kit.cylinder(0.026, 0.03, 0.04, 12), metal, [0.2, 0.148, -0.13]);
  const arm = group('tonearm');
  arm.position.set(0.2, 0.172, -0.13);
  kit.part(arm, kit.box(0.012, 0.012, 0.25), metal, [0, 0, 0.125], null, NO_CAST);
  kit.part(arm, kit.box(0.03, 0.02, 0.04), kit.material('metal'), [0, -0.006, 0.25], null, NO_CAST);
  player.add(arm);
  for (const x of [0.16, 0.22]) {
    kit.part(player, kit.cylinder(0.018, 0.018, 0.02, 12), kit.material('brass', { metalness: 0.5 }), [x, 0.136, 0.15], null, NO_CAST);
  }

  const REST = 0.45;
  const PLAY = -0.18;
  arm.rotation.y = REST;
  let playing = false;
  kit.addUpdater((dt) => {
    if (!playing) return false;
    disc.rotation.y -= dt * 3.5;
    return true;
  });
  const controls = {
    state: { playing: false },
    actions: {
      setPlaying(on) {
        playing = Boolean(on);
        arm.rotation.y = playing ? PLAY : REST;
        controls.state.playing = playing;
        return playing;
      },
    },
  };
  player.userData.controls = controls;
  return player;
}

const NOTE_COLORS = ['cream', 'mustard', 'dustyPink', 'sage', 'linen', 'mustard', 'cream', 'dustyPink'];
const MAX_NOTES = NOTE_COLORS.length;

export function buildNoticeboard(kit, { width = 1.3, height = 0.9, entries = [] } = {}) {
  const board = group('noticeboard');
  kit.part(board, kit.rounded(width + 0.1, height + 0.1, 0.05, 0.015), kit.material('woodDark'), [0, 0, 0.025], null, NO_CAST);
  kit.part(board, kit.plane(width, height), kit.material('#c99c6c', { roughness: 1 }), [0, 0, 0.052], null, NO_CAST);

  const notes = [];
  const paper = kit.plane(0.22, 0.22);
  const pin = kit.sphere(0.018, 8, 6);
  for (let i = 0; i < MAX_NOTES; i += 1) {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const note = group('note');
    note.position.set(-width / 2 + 0.2 + col * ((width - 0.4) / 3), height / 2 - 0.24 - row * 0.38, 0.056);
    note.rotation.z = ((i * 37) % 11) / 60 - 0.08;
    kit.part(note, paper, kit.material(NOTE_COLORS[i], { roughness: 1 }), [0, 0, 0], null, NO_CAST);
    kit.part(note, kit.box(0.14, 0.012, 0.002), kit.material('#9a8a7a'), [0, 0.03, 0.002], null, NO_CAST);
    kit.part(note, kit.box(0.1, 0.012, 0.002), kit.material('#9a8a7a'), [-0.02, -0.01, 0.002], null, NO_CAST);
    kit.part(note, pin, kit.material(i % 2 ? 'terracotta' : 'navy'), [0, 0.085, 0.01], null, NO_CAST);
    board.add(note);
    notes.push(note);
  }

  const controls = {
    state: { notes: 0 },
    actions: {
      setCount(count) {
        const shown = Math.max(0, Math.min(MAX_NOTES, Math.floor(count)));
        notes.forEach((note, i) => {
          note.visible = i < shown;
        });
        controls.state.notes = shown;
        return shown;
      },
    },
  };
  controls.actions.setCount(entries.length);
  board.userData.controls = controls;
  return board;
}

const GIFT_SLOTS = [
  { position: [-0.12, 0, -0.08], size: [0.16, 0.14, 0.16], color: 'terracotta', ribbon: 'mustard' },
  { position: [0.13, 0, -0.06], size: [0.13, 0.18, 0.13], color: 'sage', ribbon: 'cream' },
  { position: [0.02, 0, 0.13], size: [0.18, 0.1, 0.14], color: 'navy', ribbon: 'dustyPink' },
  { position: [-0.16, 0, 0.12], size: [0.1, 0.1, 0.1], color: 'mustard', ribbon: 'terracotta' },
  { position: [0.17, 0, 0.14], size: [0.1, 0.12, 0.1], color: 'dustyPink', ribbon: 'cream' },
];

export function buildGiftTable(kit, { gifts = [] } = {}) {
  const table = group('gift-table');
  const wood = kit.material('woodLight');
  const topY = 0.62;
  kit.part(table, kit.cylinder(0.34, 0.34, 0.04, 28), wood, [0, topY - 0.02, 0]);
  kit.part(table, kit.cylinder(0.035, 0.045, topY - 0.04, 10), kit.material('woodMid'), [0, (topY - 0.04) / 2, 0]);
  kit.part(table, kit.cylinder(0.2, 0.22, 0.03, 20), kit.material('woodMid'), [0, 0.015, 0]);
  kit.part(table, kit.cylinder(0.3, 0.3, 0.004, 28), kit.material('linen', { roughness: 1 }), [0, topY + 0.002, 0], null, NO_CAST);

  const boxes = GIFT_SLOTS.map(({ position, size, color, ribbon }) => {
    const box = group('gift');
    const [w, h, d] = size;
    box.position.set(position[0], topY + 0.004, position[2]);
    kit.part(box, kit.rounded(w, h, d, 0.01), kit.material(color), [0, h / 2, 0]);
    const band = kit.material(ribbon);
    kit.part(box, kit.box(w + 0.004, h + 0.004, 0.02), band, [0, h / 2, 0], null, NO_CAST);
    kit.part(box, kit.box(0.02, h + 0.004, d + 0.004), band, [0, h / 2, 0], null, NO_CAST);
    kit.part(box, kit.torus(0.025, 0.008, 6, 12), band, [0, h + 0.012, 0], [0, 0, 0], NO_CAST);
    table.add(box);
    return box;
  });

  const controls = {
    state: { gifts: 0 },
    actions: {
      setCount(count) {
        const shown = Math.max(0, Math.min(boxes.length, Math.floor(count)));
        boxes.forEach((box, i) => {
          box.visible = i < shown;
        });
        controls.state.gifts = shown;
        return shown;
      },
    },
  };
  controls.actions.setCount(gifts.length);
  table.userData.controls = controls;
  return table;
}

export function buildChest(kit) {
  const chest = group('chest');
  const w = 0.78;
  const h = 0.4;
  const d = 0.48;
  const wood = kit.material('woodMid');
  const band = kit.material('#8a6a3a', { metalness: 0.4, roughness: 0.5 });
  kit.part(chest, kit.rounded(w, h, d, 0.03), wood, [0, h / 2, 0]);
  for (const x of [-w * 0.3, w * 0.3]) {
    kit.part(chest, kit.box(0.05, h + 0.004, d + 0.006), band, [x, h / 2, 0], null, NO_CAST);
  }
  const glow = kit.part(
    chest,
    kit.plane(w - 0.08, d - 0.08),
    kit.material('mustard', { emissive: 'lampGlow', emissiveIntensity: 1.2 }),
    [0, h - 0.01, 0],
    [-Math.PI / 2, 0, 0],
    { castShadow: false, receiveShadow: false },
  );
  glow.visible = false;

  const lid = group('lid');
  lid.position.set(0, h, -d / 2);
  kit.part(lid, kit.rounded(w + 0.02, 0.14, d + 0.02, 0.05), kit.material('woodDark'), [0, 0.07, d / 2]);
  for (const x of [-w * 0.3, w * 0.3]) {
    kit.part(lid, kit.box(0.05, 0.144, d + 0.026), band, [x, 0.07, d / 2], null, NO_CAST);
  }
  kit.part(lid, kit.rounded(0.1, 0.1, 0.03, 0.01), kit.material('brass', { metalness: 0.6, roughness: 0.35 }), [0, 0.02, d + 0.02]);
  chest.add(lid);

  const OPEN_ANGLE = -1.15;
  let target = 0;
  kit.addUpdater((dt) => {
    const diff = target - lid.rotation.x;
    if (Math.abs(diff) < 0.001) {
      if (lid.rotation.x !== target) {
        lid.rotation.x = target;
        return true;
      }
      return false;
    }
    lid.rotation.x += diff * Math.min(1, dt * 8);
    return true;
  });
  const controls = {
    state: { open: false },
    actions: {
      setOpen(open) {
        controls.state.open = Boolean(open);
        target = open ? OPEN_ANGLE : 0;
        glow.visible = controls.state.open;
        return controls.state.open;
      },
    },
  };
  chest.userData.controls = controls;
  return chest;
}
