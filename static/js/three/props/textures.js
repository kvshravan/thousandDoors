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
    sun.addColorStop(1, `${palette.sun}00`);
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    if (palette.stars) {
      const rand = seededRandom(19);
      ctx.fillStyle = palette.stars;
      for (let i = 0; i < 40; i += 1) {
        const size = rand() < 0.2 ? 3 : 2;
        ctx.fillRect(rand() * w, rand() * h * 0.6, size, size);
      }
    }

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

export function createNameplateTexture(palette, username, online) {
  const texture = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = palette.cream;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = palette.woodDark;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);

    const dotX = 52;
    ctx.fillStyle = online ? '#5fb26a' : '#a39a92';
    ctx.beginPath();
    ctx.arc(dotX, h / 2, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.woodDark;
    ctx.textBaseline = 'middle';
    let size = 64;
    const label = `@${username}`;
    do {
      ctx.font = `700 ${size}px "Segoe UI", system-ui, sans-serif`;
      size -= 4;
    } while (ctx.measureText(label).width > w - 120 && size > 20);
    ctx.fillText(label, dotX + 34, h / 2 + 2);
  });
  return texture;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const POSTER_MOTIFS = {
  sun(ctx, w, h, ink) {
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.32, w * 0.24, 0, Math.PI * 2);
    ctx.fill();
  },
  film(ctx, w, h, ink) {
    ctx.fillStyle = ink;
    ctx.fillRect(w * 0.12, h * 0.12, w * 0.76, h * 0.36);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (let i = 0; i < 7; i += 1) {
      ctx.fillRect(w * (0.16 + i * 0.1), h * 0.14, w * 0.05, h * 0.03);
      ctx.fillRect(w * (0.16 + i * 0.1), h * 0.43, w * 0.05, h * 0.03);
    }
  },
  leaf(ctx, w, h, ink) {
    ctx.fillStyle = ink;
    ctx.save();
    ctx.translate(w * 0.5, h * 0.3);
    ctx.rotate(-0.6);
    ctx.beginPath();
    ctx.ellipse(0, 0, w * 0.12, w * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  wave(ctx, w, h, ink) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    for (let row = 0; row < 3; row += 1) {
      ctx.beginPath();
      for (let x = w * 0.1; x <= w * 0.9; x += 4) {
        const y = h * (0.2 + row * 0.1) + Math.sin((x / w) * Math.PI * 4) * 8;
        if (x === w * 0.1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  },
};

export function createPosterTexture(palette, { title = '', subtitle = '', accent = 'terracotta', motif = 'sun' }) {
  return canvasTexture(256, 360, (ctx, w, h) => {
    ctx.fillStyle = palette[accent] ?? accent;
    ctx.fillRect(0, 0, w, h);
    (POSTER_MOTIFS[motif] ?? POSTER_MOTIFS.sun)(ctx, w, h, palette.cream);

    ctx.fillStyle = palette.cream;
    ctx.textAlign = 'center';
    ctx.font = '800 34px "Segoe UI", system-ui, sans-serif';
    const lines = wrapLines(ctx, title.toUpperCase(), w - 32).slice(0, 3);
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h * 0.66 + i * 38));
    if (subtitle) {
      ctx.font = '500 18px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(subtitle, w / 2, h * 0.66 + lines.length * 38 + 8);
    }
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
