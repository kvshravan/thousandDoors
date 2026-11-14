import * as THREE from 'three';
import { LANDSCAPES, WINDOW_SCENES } from '../room-config.js';
import { seededRandom } from './kit.js';

// Window views: each landscape painted for each time of day (day, evening, night).
// The same places are built in 3D outside the house; see exterior-scene.js.

const DARKEN = { day: 0, evening: 0.22, night: 0.62 };
const DUSK = '#1b2142';

function tinter(time) {
  const amount = DARKEN[time] ?? 0;
  return (hex) => new THREE.Color(hex).lerp(new THREE.Color(DUSK), amount).getStyle();
}

function sky(ctx, w, h, scene) {
  const gradient = ctx.createLinearGradient(0, 0, 0, h * 0.75);
  gradient.addColorStop(0, scene.skyTop);
  gradient.addColorStop(1, scene.skyBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

function sun(ctx, w, h, scene, time, x = 0.72) {
  const y = time === 'evening' ? 0.6 : 0.24;
  const radius = time === 'evening' ? 0.12 : 0.07;
  const glow = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, w * radius * 2.6);
  glow.addColorStop(0, scene.sun);
  glow.addColorStop(0.35, scene.sun);
  glow.addColorStop(1, `${scene.sun}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  if (scene.stars) {
    const rand = seededRandom(19);
    ctx.fillStyle = scene.stars;
    for (let i = 0; i < 60; i += 1) ctx.fillRect(rand() * w, rand() * h * 0.55, rand() < 0.2 ? 3 : 2, rand() < 0.2 ? 3 : 2);
  }
}

function clouds(ctx, w, h, time) {
  if (time === 'night') return;
  ctx.fillStyle = time === 'evening' ? 'rgba(255, 214, 190, 0.75)' : 'rgba(255, 255, 255, 0.85)';
  for (const [x, y, s] of [[0.2, 0.18, 1], [0.5, 0.1, 0.7], [0.86, 0.32, 0.8]]) {
    for (const [dx, dy, r] of [[0, 0, 0.05], [0.05, -0.02, 0.06], [0.1, 0, 0.045]]) {
      ctx.beginPath();
      ctx.ellipse(w * (x + dx * s), h * (y + dy * s), w * r * s, w * r * s * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function wave(ctx, w, h, color, baseY, amplitude, frequency, phase) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 6) ctx.lineTo(x, baseY + Math.sin((x / w) * Math.PI * frequency + phase) * amplitude);
  ctx.lineTo(w, h);
  ctx.fill();
}

function triangle(ctx, color, x, baseY, width, height) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - width / 2, baseY);
  ctx.lineTo(x, baseY - height);
  ctx.lineTo(x + width / 2, baseY);
  ctx.fill();
}

function pine(ctx, color, x, baseY, size, snow = null) {
  ctx.fillStyle = '#4a3426';
  ctx.fillRect(x - size * 0.06, baseY - size * 0.2, size * 0.12, size * 0.2);
  for (let i = 0; i < 3; i += 1) {
    const y = baseY - size * 0.15 - i * size * 0.28;
    triangle(ctx, color, x, y, size * (0.8 - i * 0.18), size * 0.45);
    if (snow) triangle(ctx, snow, x, y - size * 0.3, size * (0.3 - i * 0.05), size * 0.15);
  }
}

function palm(ctx, x, baseY, size, trunk, leaf) {
  ctx.strokeStyle = trunk;
  ctx.lineWidth = size * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(x + size * 0.3, baseY - size * 0.5, x + size * 0.15, baseY - size);
  ctx.stroke();
  ctx.strokeStyle = leaf;
  ctx.lineWidth = size * 0.06;
  const top = [x + size * 0.15, baseY - size];
  for (let i = 0; i < 6; i += 1) {
    const angle = Math.PI * (1.05 + i * 0.18);
    ctx.beginPath();
    ctx.moveTo(...top);
    ctx.quadraticCurveTo(
      top[0] + Math.cos(angle) * size * 0.3,
      top[1] + Math.sin(angle) * size * 0.3 - size * 0.08,
      top[0] + Math.cos(angle) * size * 0.55,
      top[1] + Math.sin(angle) * size * 0.25 + size * 0.15,
    );
    ctx.stroke();
  }
}

function cactus(ctx, color, x, baseY, size) {
  ctx.fillStyle = color;
  const r = size * 0.09;
  const bar = (bx, by, bw, bh) => {
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();
  };
  bar(x - r, baseY - size, r * 2, size);
  bar(x - size * 0.35, baseY - size * 0.62, r * 1.6, size * 0.32);
  bar(x - size * 0.35, baseY - size * 0.4, size * 0.3, r * 1.4);
  bar(x + size * 0.2, baseY - size * 0.78, r * 1.6, size * 0.38);
  bar(x, baseY - size * 0.48, size * 0.3, r * 1.4);
}

const PAINTERS = {
  countryside(ctx, w, h, tint, time) {
    const l = LANDSCAPES.countryside;
    wave(ctx, w, h, tint(l.far), h * 0.66, 12, 2, 0.6);
    wave(ctx, w, h, tint(l.ground), h * 0.78, 14, 2, 2.4);
    ctx.fillStyle = tint('#c9b26a');
    for (let i = 0; i < 4; i += 1) ctx.fillRect(0, h * (0.86 + i * 0.035), w, h * 0.012);
    for (const [x, s] of [[0.12, 0.08], [0.3, 0.06], [0.88, 0.09]]) {
      ctx.fillStyle = tint('#5b4030');
      ctx.fillRect(w * x - 2, h * 0.7, 4, h * s);
      ctx.fillStyle = tint(l.near);
      ctx.beginPath();
      ctx.arc(w * x, h * 0.7, w * s * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = tint('#f4ede0');
    for (let x = 0; x < w; x += 22) ctx.fillRect(x, h * 0.83, 4, h * 0.06);
    ctx.fillRect(0, h * 0.845, w, 3);
    ctx.fillRect(0, h * 0.87, w, 3);
    if (time === 'night') {
      ctx.fillStyle = '#ffd79a';
      ctx.fillRect(w * 0.6, h * 0.71, 6, 5);
    }
  },
  beach(ctx, w, h, tint, time) {
    const l = LANDSCAPES.beach;
    const sea = ctx.createLinearGradient(0, h * 0.58, 0, h * 0.78);
    sea.addColorStop(0, tint('#2a9fb0'));
    sea.addColorStop(1, tint('#6fe0d8'));
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.58, w, h * 0.22);
    ctx.fillStyle = time === 'night' ? 'rgba(241, 228, 207, 0.25)' : 'rgba(255, 255, 255, 0.55)';
    for (let i = 0; i < 6; i += 1) ctx.fillRect(w * (0.1 + i * 0.15), h * (0.62 + (i % 3) * 0.05), w * 0.06, 2);
    wave(ctx, w, h, tint(l.ground), h * 0.8, 6, 3, 1);
    palm(ctx, w * 0.12, h * 0.95, h * 0.6, tint('#8a6a4a'), tint('#3f7a45'));
    palm(ctx, w * 0.9, h * 0.92, h * 0.45, tint('#8a6a4a'), tint('#4f8a4a'));
    // A neighbour's stilt hut along the shore.
    ctx.fillStyle = tint('#9a7650');
    ctx.fillRect(w * 0.62, h * 0.66, w * 0.1, h * 0.08);
    ctx.fillStyle = tint('#d9b46a');
    triangle(ctx, tint('#d9b46a'), w * 0.67, h * 0.67, w * 0.15, h * 0.08);
    ctx.fillStyle = tint('#6b5038');
    for (const x of [0.63, 0.67, 0.71]) ctx.fillRect(w * x, h * 0.74, 3, h * 0.06);
  },
  forest(ctx, w, h, tint) {
    const l = LANDSCAPES.forest;
    triangle(ctx, tint(l.far), w * 0.3, h * 0.66, w * 0.6, h * 0.42);
    triangle(ctx, tint('#8fa3b4'), w * 0.72, h * 0.66, w * 0.5, h * 0.34);
    triangle(ctx, tint('#f4f7fb'), w * 0.3, h * 0.34, w * 0.14, h * 0.1);
    ctx.fillStyle = tint('#4f86a8');
    ctx.fillRect(0, h * 0.66, w, h * 0.1);
    ctx.fillStyle = tint(l.ground);
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
    const rand = seededRandom(23);
    for (let i = 0; i < 14; i += 1) pine(ctx, tint(i % 2 ? l.near : '#3f6b45'), rand() * w, h * (0.8 + rand() * 0.2), h * (0.22 + rand() * 0.2));
  },
  city(ctx, w, h, tint, time) {
    const l = LANDSCAPES.city;
    const rand = seededRandom(31);
    const lit = time === 'day' ? null : '#ffd166';
    for (const [layer, color, base] of [[0, l.far, 0.78], [1, l.near, 0.9]]) {
      let x = -10;
      while (x < w) {
        const bw = w * (0.08 + rand() * 0.1);
        const bh = h * (0.25 + rand() * (layer ? 0.35 : 0.45));
        ctx.fillStyle = tint(color);
        ctx.fillRect(x, h * base - bh, bw - 3, bh);
        for (let wy = h * base - bh + 8; wy < h * base - 8; wy += 12) {
          for (let wx = x + 5; wx < x + bw - 10; wx += 10) {
            const on = lit && rand() < 0.45;
            ctx.fillStyle = on ? lit : tint(layer ? '#7f8aa6' : '#9aa6c0');
            if (on || rand() < 0.7) ctx.fillRect(wx, wy, 5, 6);
          }
        }
        x += bw;
      }
    }
    ctx.fillStyle = tint('#3b3a3d');
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
  },
  snow(ctx, w, h, tint, time) {
    const l = LANDSCAPES.snow;
    triangle(ctx, tint('#a9bdd6'), w * 0.25, h * 0.7, w * 0.6, h * 0.45);
    triangle(ctx, tint('#c3d2e6'), w * 0.7, h * 0.7, w * 0.7, h * 0.5);
    triangle(ctx, tint('#ffffff'), w * 0.7, h * 0.36, w * 0.22, h * 0.16);
    triangle(ctx, tint('#ffffff'), w * 0.25, h * 0.4, w * 0.18, h * 0.15);
    wave(ctx, w, h, tint(l.ground), h * 0.74, 8, 2, 1.2);
    const rand = seededRandom(41);
    for (let i = 0; i < 10; i += 1) pine(ctx, tint(l.near), rand() * w, h * (0.82 + rand() * 0.18), h * (0.2 + rand() * 0.18), tint('#ffffff'));
    ctx.fillStyle = time === 'night' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.9)';
    for (let i = 0; i < 70; i += 1) {
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 1.5 + rand() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  desert(ctx, w, h, tint) {
    const l = LANDSCAPES.desert;
    ctx.fillStyle = tint(l.far);
    ctx.beginPath();
    ctx.moveTo(w * 0.05, h * 0.72);
    ctx.lineTo(w * 0.12, h * 0.5);
    ctx.lineTo(w * 0.34, h * 0.5);
    ctx.lineTo(w * 0.4, h * 0.72);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.62, h * 0.72);
    ctx.lineTo(w * 0.67, h * 0.58);
    ctx.lineTo(w * 0.8, h * 0.58);
    ctx.lineTo(w * 0.84, h * 0.72);
    ctx.fill();
    wave(ctx, w, h, tint('#e8c08a'), h * 0.72, 10, 2.4, 0.4);
    wave(ctx, w, h, tint(l.ground), h * 0.82, 12, 1.6, 2);
    cactus(ctx, tint('#5f8f4e'), w * 0.18, h * 0.95, h * 0.32);
    cactus(ctx, tint('#4f7f42'), w * 0.84, h * 0.9, h * 0.22);
  },
};

/** The window view: landscape (LANDSCAPES key) at time (WINDOW_SCENES key). */
export function createLandscapeTexture(landscape, time) {
  const scene = WINDOW_SCENES[time] ?? WINDOW_SCENES.day;
  const painter = PAINTERS[landscape] ?? PAINTERS.countryside;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  const tint = tinter(time);
  sky(ctx, canvas.width, canvas.height, scene);
  sun(ctx, canvas.width, canvas.height, scene, time);
  clouds(ctx, canvas.width, canvas.height, time);
  painter(ctx, canvas.width, canvas.height, tint, time);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
