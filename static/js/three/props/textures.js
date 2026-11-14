import * as THREE from 'three';
import { seededRandom } from './kit.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function shade(hex, rand, lightness = 0.08) {
  return new THREE.Color(hex)
    .offsetHSL((rand() - 0.5) * 0.015, (rand() - 0.5) * 0.06, (rand() - 0.5) * lightness)
    .getStyle();
}

export function createPlankTexture(palette, repeat = 4) {
  const texture = canvasTexture(512, 512, (ctx, w, h) => {
    const rand = seededRandom(7);
    const rows = 8;
    const rowHeight = h / rows;
    for (let row = 0; row < rows; row += 1) {
      const y = row * rowHeight;
      let x = -rand() * w * 0.6;
      while (x < w) {
        const length = w * (0.35 + rand() * 0.45);
        const base = rand() > 0.5 ? palette.floorLight : palette.floorDark;
        ctx.fillStyle = shade(base, rand);
        ctx.fillRect(x, y, length, rowHeight);

        ctx.strokeStyle = 'rgba(70, 40, 20, 0.12)';
        ctx.lineWidth = 1;
        for (let grain = 0; grain < 3; grain += 1) {
          const gy = y + rowHeight * (0.2 + rand() * 0.6);
          ctx.beginPath();
          ctx.moveTo(x + 4, gy);
          ctx.bezierCurveTo(
            x + length * 0.3,
            gy + (rand() - 0.5) * 6,
            x + length * 0.6,
            gy + (rand() - 0.5) * 6,
            x + length - 4,
            gy,
          );
          ctx.stroke();
        }

        ctx.fillStyle = 'rgba(60, 32, 18, 0.45)';
        ctx.fillRect(x, y, 2, rowHeight);
        x += length;
      }
      ctx.fillStyle = 'rgba(60, 32, 18, 0.5)';
      ctx.fillRect(0, y, w, 2);
    }
  });
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}

export function createRugTexture(palette) {
  return canvasTexture(512, 512, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const rings = [
      [0.5, palette.terracotta],
      [0.46, palette.cream],
      [0.4, palette.mustard],
      [0.37, palette.cream],
      [0.24, palette.dustyPink],
      [0.2, palette.cream],
      [0.08, palette.terracotta],
    ];
    for (const [radius, color] of rings) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * w, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = palette.terracotta;
    const motifs = 18;
    for (let i = 0; i < motifs; i += 1) {
      const angle = (i / motifs) * Math.PI * 2;
      const r = 0.305 * w;
      ctx.save();
      ctx.translate(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.rotate(angle + Math.PI / 4);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
    }
  });
}

export function createSkyTexture(palette) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.75, palette.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sun = ctx.createRadialGradient(w * 0.7, h * 0.55, 0, w * 0.7, h * 0.55, w * 0.3);
    sun.addColorStop(0, palette.sun);
    sun.addColorStop(0.25, palette.sun);
    sun.addColorStop(1, 'rgba(255, 231, 168, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    const hill = (color, baseY, amplitude, phase) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 8) {
        ctx.lineTo(x, baseY + Math.sin(x / w * Math.PI * 2 + phase) * amplitude);
      }
      ctx.lineTo(w, h);
      ctx.fill();
    };
    hill(palette.hillFar, h * 0.72, 10, 0.6);
    hill(palette.hillNear, h * 0.84, 14, 2.4);
  });
}

export function createClockFaceTexture(palette) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = palette.cream;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = palette.woodDark;
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2;
      const r = w * 0.4;
      const size = i % 3 === 0 ? 10 : 5;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.sin(angle) * r, h / 2 - Math.cos(angle) * r, size, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
