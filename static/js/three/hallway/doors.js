import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEM_COLORS, THEMES } from '../room-config.js';
import { railPose } from './rails.js';

// Door size (metres). Doors hang HANG below their trolley on the rail.
export const DOOR = Object.freeze({ width: 1, height: 2, depth: 0.09, hang: 0.45 });
const LAMP_Y = -DOOR.hang + 0.14;
// Shades baked into vertex colours, multiplied by each door's own colour.
const SHADE = { leaf: 1, frame: 0.6, panel: 1.16 };
const STEEL = [0.34, 0.36, 0.42];
const BRASS = [0.86, 0.66, 0.34];
const LIT = new THREE.Color('#ffc978');
const UNLIT = new THREE.Color('#33406e');
const HIGHLIGHT = new THREE.Color('#ffffff');
// Unclaimed doors: a bright jumble of colours, a little dimmer than real rooms' doors.
const UNCLAIMED = [
  '#c8483f',
  '#3f6fc8',
  '#e0b13c',
  '#d0679a',
  '#4f9a5b',
  '#8a5ac8',
  '#e07a3c',
  '#3fa3a0',
  '#b8b1a6',
  '#6b4a3a',
  '#5a8fd8',
  '#a83f6f',
];
const UNCLAIMED_DIM = 0.78;

/** The hex colour of a door painted `name` (an ITEM_COLORS key), terracotta by default. */
export function doorColor(name) {
  const value = ITEM_COLORS[name]?.value ?? 'terracotta';
  return THEMES.cozy[value] ?? value;
}

/** A stable 0..1 number from a string. */
export function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function box(w, h, d, x, y, z, shade) {
  const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  return paint(geometry, Array.isArray(shade) ? shade : [shade, shade, shade]);
}

function paint(geometry, [r, g, b]) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) colors.set([r, g, b], i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The door leaf (slab and raised panels) with its hinge edge at x = hingeX. */
function leafParts(hingeX = -DOOR.width / 2) {
  const { width: w, height: h, depth: d, hang } = DOOR;
  const cx = hingeX + w / 2;
  const parts = [box(w, h, d, cx, -hang - h / 2, 0, SHADE.leaf)];
  for (const face of [1, -1]) {
    const z = face * (d / 2 + 0.01);
    for (const px of [-0.2, 0.2]) {
      parts.push(box(0.32, 0.62, 0.02, cx + px, -hang - 0.46, z, SHADE.panel));
      parts.push(box(0.32, 0.9, 0.02, cx + px, -hang - 1.4, z, SHADE.panel));
    }
  }
  return parts;
}

function frameParts() {
  const { width: w, height: h, depth: d, hang } = DOOR;
  return [
    box(0.07, h + 0.07, d + 0.03, -(w / 2 + 0.035), -hang - h / 2 + 0.035, 0, SHADE.frame),
    box(0.07, h + 0.07, d + 0.03, w / 2 + 0.035, -hang - h / 2 + 0.035, 0, SHADE.frame),
    box(w + 0.14, 0.07, d + 0.03, 0, -hang + 0.035, 0, SHADE.frame),
  ];
}

function hangerParts() {
  const { hang } = DOOR;
  const rod = paint(new THREE.CylinderGeometry(0.025, 0.025, hang, 6).translate(0, -hang / 2, 0), STEEL);
  // CylinderGeometry is indexed like BoxGeometry, so they merge.
  return [rod, box(0.24, 0.12, 0.18, 0, 0, 0, STEEL), box(0.34, 0.05, 0.12, 0, -hang + 0.02, 0, STEEL)];
}

function knobParts(hingeX = -DOOR.width / 2) {
  const { width: w, depth: d, hang } = DOOR;
  const x = hingeX + w * 0.86;
  return [1, -1].map((face) =>
    paint(new THREE.SphereGeometry(0.045, 6, 4).translate(x, -hang - 1.05, face * (d / 2 + 0.05)), BRASS),
  );
}

let glowTexture = null;
function glow() {
  if (glowTexture) return glowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  return glowTexture;
}

/**
 * Spreads real doors over the rails: first taking turns between the swoop and the
 * coaster (closest to the landing, and the one you ride), then the lanes, evenly
 * spaced along each rail so they don't bunch up. Every other slot is unclaimed.
 */
function assign(rails, doors) {
  const capacity = new Map(rails.map((rail) => [rail, Math.floor(rail.slots * (rail.role === 'lane' ? 0.5 : 0.7))]));
  const chosen = new Map(rails.map((rail) => [rail, []]));
  const featured = rails.filter((rail) => rail.role !== 'lane');
  const lanes = rails.filter((rail) => rail.role === 'lane');
  let i = 0;
  for (const group of [featured, lanes]) {
    let turn = 0;
    while (i < doors.length && group.some((rail) => chosen.get(rail).length < capacity.get(rail))) {
      const rail = group[turn % group.length];
      turn += 1;
      if (chosen.get(rail).length >= capacity.get(rail)) continue;
      chosen.get(rail).push(doors[i]);
      i += 1;
    }
  }
  const byRail = new Map();
  for (const rail of rails) {
    const seats = new Array(rail.slots).fill(null);
    const list = chosen.get(rail);
    list.forEach((door, j) => {
      seats[Math.floor((j * rail.slots) / list.length)] = door;
    });
    byRail.set(rail, seats);
  }
  return byRail;
}

/**
 * Every door in the vault, drawn with two instanced meshes (the painted door, and its
 * metal hanger and knob) that share one matrix per door, plus a point cloud of lamps:
 * lit for claimed rooms, dark for unclaimed ones. update(time) slides each door along
 * its rail and lets it swing out on bends.
 */
export class DoorFleet {
  constructor({ rails, doors = [] }) {
    this.rails = rails;
    this.group = new THREE.Group();
    this.group.name = 'door-fleet';
    this.slots = [];
    this.byRoom = new Map();

    const seats = assign(rails, doors);
    for (const rail of rails) {
      seats.get(rail).forEach((door, i) => {
        const index = this.slots.length;
        const seed = hash01(`${rail.id}:${i}`);
        const base = new THREE.Color(door ? doorColor(door.color) : UNCLAIMED[Math.floor(seed * UNCLAIMED.length)]);
        if (!door) base.multiplyScalar(UNCLAIMED_DIM);
        const slot = {
          index,
          rail,
          offset: i * rail.spacing,
          door,
          base,
          seed,
          sx: door ? 1 : 0.9 + seed * 0.22,
          sy: door ? 1 : 0.95 + ((seed * 7) % 1) * 0.12,
          hidden: false,
        };
        this.slots.push(slot);
        if (door) this.byRoom.set(door.id, slot);
      });
    }
    const count = this.slots.length;

    this.doorGeometry = mergeGeometries([...frameParts(), ...leafParts()]);
    this.metalGeometry = mergeGeometries([...hangerParts(), ...knobParts()]);
    this.doorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 });
    this.metalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.7 });

    this.doors = new THREE.InstancedMesh(this.doorGeometry, this.doorMaterial, count);
    this.doors.name = 'doors';
    this.metal = new THREE.InstancedMesh(this.metalGeometry, this.metalMaterial, count);
    this.metal.name = 'door-hangers';
    // One matrix per door, shared by both meshes (and the picker).
    this.metal.instanceMatrix = this.doors.instanceMatrix;
    this.doors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const mesh of [this.doors, this.metal]) {
      // Doors cover the whole vault; culling the lot as one sphere would only cost time.
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    for (const slot of this.slots) this.doors.setColorAt(slot.index, slot.base);
    for (let i = 0; i < count; i += 1) this.metal.setColorAt(i, HIGHLIGHT);

    // Raycasting against simple boxes (12 triangles a door) keeps picking cheap.
    this.pickGeometry = new THREE.BoxGeometry(DOOR.width + 0.1, DOOR.height + DOOR.hang, DOOR.depth + 0.2).translate(
      0,
      -(DOOR.height + DOOR.hang) / 2,
      0,
    );
    this.picker = new THREE.InstancedMesh(this.pickGeometry, new THREE.MeshBasicMaterial({ visible: false }), count);
    this.picker.name = 'door-picker';
    this.picker.instanceMatrix = this.doors.instanceMatrix;
    this.picker.frustumCulled = false;
    this.picker.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, -60), 220);
    this.group.add(this.picker);

    this.lampPositions = new Float32Array(count * 3);
    this.lampColors = new Float32Array(count * 3);
    const lampGeometry = new THREE.BufferGeometry();
    lampGeometry.setAttribute('position', new THREE.BufferAttribute(this.lampPositions, 3).setUsage(THREE.DynamicDrawUsage));
    lampGeometry.setAttribute('color', new THREE.BufferAttribute(this.lampColors, 3));
    this.lampGeometry = lampGeometry;
    this.lampMaterial = new THREE.PointsMaterial({
      size: 0.9,
      map: glow(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lamps = new THREE.Points(lampGeometry, this.lampMaterial);
    this.lamps.name = 'door-lamps';
    this.lamps.frustumCulled = false;
    this.group.add(this.lamps);
    for (const slot of this.slots) this._paintLamp(slot, false);

    this.highlighted = null;
    this._pose = railPose();
    this._m = new THREE.Matrix4();
  }

  get count() {
    return this.slots.length;
  }

  slotForInstance(index) {
    return this.slots[index] ?? null;
  }

  slotForRoom(roomId) {
    return this.byRoom.get(roomId) ?? null;
  }

  /** Arc length of a slot along its rail at a time. */
  distance(slot, time) {
    return slot.offset + slot.rail.speed * time;
  }

  /**
   * A door's transform at `time`: out.matrix (with the door's size), plus the
   * trolley point and facing for cameras. Returns out.
   */
  pose(slot, time, out = { matrix: new THREE.Matrix4(), point: new THREE.Vector3(), heading: { x: 1, z: 0 }, swing: 0 }) {
    const pose = slot.rail.sample(this.distance(slot, time), this._pose);
    const swing = pose.swing + Math.sin(time * 1.1 + slot.seed * 6.283) * 0.035;
    const { x: hx, z: hz } = pose.heading;
    const c = Math.cos(swing);
    const s = Math.sin(swing);
    // Columns: X along the rail, Y up (swung about X), Z the door's face normal.
    const zx = -hz;
    const zz = hx;
    const e = out.matrix.elements;
    e[0] = hx * slot.sx;
    e[1] = 0;
    e[2] = hz * slot.sx;
    e[3] = 0;
    e[4] = zx * s * slot.sy;
    e[5] = c * slot.sy;
    e[6] = zz * s * slot.sy;
    e[7] = 0;
    e[8] = zx * c;
    e[9] = -s;
    e[10] = zz * c;
    e[11] = 0;
    e[12] = pose.point.x;
    e[13] = pose.point.y;
    e[14] = pose.point.z;
    e[15] = 1;
    out.point.copy(pose.point);
    out.heading.x = hx;
    out.heading.z = hz;
    out.swing = swing;
    return out;
  }

  update(time) {
    const array = this.doors.instanceMatrix.array;
    const lamps = this.lampPositions;
    const out = { matrix: this._m, point: new THREE.Vector3(), heading: { x: 1, z: 0 }, swing: 0 };
    for (const slot of this.slots) {
      const offset = slot.index * 16;
      if (slot.hidden) {
        array.fill(0, offset, offset + 16);
        lamps.fill(0, slot.index * 3, slot.index * 3 + 3);
        continue;
      }
      this.pose(slot, time, out);
      const e = this._m.elements;
      for (let k = 0; k < 16; k += 1) array[offset + k] = e[k];
      lamps[slot.index * 3] = e[12] + e[4] * LAMP_Y;
      lamps[slot.index * 3 + 1] = e[13] + e[5] * LAMP_Y;
      lamps[slot.index * 3 + 2] = e[14] + e[6] * LAMP_Y;
    }
    this.doors.instanceMatrix.needsUpdate = true;
    this.lampGeometry.attributes.position.needsUpdate = true;
  }

  /** Brightens one door (hover or selection); null clears it. */
  highlight(slot) {
    if (slot === this.highlighted) return;
    const previous = this.highlighted;
    this.highlighted = slot;
    if (previous) {
      this.doors.setColorAt(previous.index, previous.base);
      this._paintLamp(previous, false);
    }
    if (slot) {
      this.doors.setColorAt(slot.index, slot.base.clone().lerp(HIGHLIGHT, 0.32));
      this._paintLamp(slot, true);
    }
    this.doors.instanceColor.needsUpdate = true;
    this.lampGeometry.attributes.color.needsUpdate = true;
  }

  _paintLamp(slot, bright) {
    const color = slot.door ? LIT.clone() : UNLIT.clone();
    if (bright) color.copy(LIT).multiplyScalar(1.6);
    this.lampColors.set([color.r, color.g, color.b], slot.index * 3);
  }

  setHidden(slot, hidden) {
    slot.hidden = hidden;
  }

  dispose() {
    for (const thing of [
      this.doorGeometry,
      this.metalGeometry,
      this.pickGeometry,
      this.lampGeometry,
      this.doorMaterial,
      this.metalMaterial,
      this.picker.material,
      this.lampMaterial,
    ]) {
      thing.dispose();
    }
    this.doors.dispose();
    this.metal.dispose();
    this.picker.dispose();
  }
}

function nameplate(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#2b1d2e';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 24);
  ctx.fill();
  ctx.strokeStyle = '#d6a85a';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#f6eadf';
  ctx.font = '600 56px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 56;
  while (ctx.measureText(text).width > 450 && size > 24) {
    size -= 4;
    ctx.font = `600 ${size}px "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * One door as its own object, for the arrival: the leaf swings on a hinge
 * (model.hinge.rotation.y), a nameplate shows whose room it is, and a warm glow
 * (model.portal) waits behind it. Same size and origin (the trolley) as the fleet's.
 */
export function buildDoorModel({ color, name }) {
  const group = new THREE.Group();
  group.name = 'arriving-door';
  const disposables = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };
  const doorMaterial = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.04, color }));
  const metalMaterial = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7 }));

  group.add(new THREE.Mesh(keep(mergeGeometries([...frameParts()])), doorMaterial));
  group.add(new THREE.Mesh(keep(mergeGeometries(hangerParts())), metalMaterial));

  const hinge = new THREE.Group();
  hinge.position.x = -DOOR.width / 2;
  hinge.add(new THREE.Mesh(keep(mergeGeometries(leafParts(0))), doorMaterial));
  hinge.add(new THREE.Mesh(keep(mergeGeometries(knobParts(0))), metalMaterial));
  const plateTexture = keep(nameplate(name));
  const plate = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(0.62, 0.155)),
    keep(new THREE.MeshBasicMaterial({ map: plateTexture, transparent: true, toneMapped: false })),
  );
  plate.position.set(DOOR.width / 2, -DOOR.hang - 0.2, DOOR.depth / 2 + 0.025);
  hinge.add(plate);
  group.add(hinge);

  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 64;
  glowCanvas.height = 128;
  const ctx = glowCanvas.getContext('2d');
  const warm = ctx.createRadialGradient(32, 76, 4, 32, 70, 80);
  warm.addColorStop(0, '#fff7e6');
  warm.addColorStop(0.45, '#ffd9a0');
  warm.addColorStop(1, '#e8915a');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, 64, 128);
  const glowMap = keep(new THREE.CanvasTexture(glowCanvas));
  glowMap.colorSpace = THREE.SRGBColorSpace;
  const portal = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(DOOR.width - 0.02, DOOR.height - 0.02)),
    keep(
      new THREE.MeshBasicMaterial({
        map: glowMap,
        transparent: true,
        opacity: 0,
        toneMapped: false,
        depthWrite: false,
        fog: false,
      }),
    ),
  );
  portal.position.set(0, -DOOR.hang - DOOR.height / 2, -0.03);
  group.add(portal);

  return {
    group,
    hinge,
    portal,
    dispose() {
      for (const thing of disposables) thing.dispose();
    },
  };
}
