import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const VAULT = Object.freeze({
  background: '#0b1230',
  fog: 0.0105,
  wallX: 52,
  backZ: -175,
  floorY: -26,
  ceilingY: 44,
});

function canvasTexture(width, height, draw, { repeat = [1, 1] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(...repeat);
  texture.anisotropy = 4;
  return texture;
}

/** Shelves stacked with stored doors, seen from far away. Seeded, so it's stable. */
function shelfTexture() {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const colours = ['#5a4a7a', '#3f5f7d', '#7a5a4a', '#4f6f58', '#7a4f62', '#6b6a45', '#46557a', '#7d6a4a'];
  return canvasTexture(
    512,
    512,
    (ctx, w, h) => {
      ctx.fillStyle = '#121a3a';
      ctx.fillRect(0, 0, w, h);
      const row = 64;
      for (let y = 0; y < h; y += row) {
        let x = 2;
        while (x < w - 8) {
          const dw = 6 + random() * 7;
          const dh = row - 14 - random() * 8;
          ctx.fillStyle = colours[Math.floor(random() * colours.length)];
          ctx.globalAlpha = 0.55 + random() * 0.35;
          ctx.fillRect(x, y + row - 6 - dh, dw, dh);
          x += dw + 2 + random() * 3;
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#2b3866';
        ctx.fillRect(0, y + row - 6, w, 6);
        // Little warm bulbs along each shelf.
        ctx.fillStyle = '#ffcf8a';
        for (let bx = 16; bx < w; bx += 64) ctx.fillRect(bx + random() * 20, y + row - 9, 3, 3);
      }
    },
    { repeat: [8, 4] },
  );
}

function gridTexture() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#0a0f26';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120, 150, 255, 0.28)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 200, 130, 0.18)';
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w / 2, h);
      ctx.stroke();
    },
    { repeat: [40, 60] },
  );
}

function shaftTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    const vertical = ctx.createLinearGradient(0, 0, 0, h);
    vertical.addColorStop(0, 'rgba(255, 236, 205, 0.9)');
    vertical.addColorStop(1, 'rgba(255, 236, 205, 0)');
    ctx.fillStyle = vertical;
    ctx.fillRect(0, 0, w, h);
    // Soft edges.
    const across = ctx.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, 'rgba(0,0,0,1)');
    across.addColorStop(0.3, 'rgba(0,0,0,0)');
    across.addColorStop(0.7, 'rgba(0,0,0,0)');
    across.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, w, h);
  });
}

function windowTexture() {
  return canvasTexture(128, 256, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#fff6e2');
    gradient.addColorStop(1, '#bcd4ff');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, w / 2);
    ctx.arc(w / 2, w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 50, 90, 0.7)';
    ctx.lineWidth = 6;
    for (let y = w / 2; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
  });
}

/**
 * The space the rails run through: walls of shelved doors fading into fog, tall
 * windows with shafts of light, pillars, a floor far below, and drifting dust.
 * Returns { group, update(dt), dispose() }.
 */
export function buildVault({ quality, hero = false }) {
  const group = new THREE.Group();
  group.name = 'vault';
  const disposables = [];
  const keep = (thing) => {
    disposables.push(thing);
    return thing;
  };

  const shelves = keep(shelfTexture());
  const wallMaterial = keep(new THREE.MeshBasicMaterial({ map: shelves, color: '#8d9bd6' }));
  const wallGeometry = keep(new THREE.PlaneGeometry(260, 90));
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(side * VAULT.wallX, 8, -60);
    wall.rotation.y = -side * (Math.PI / 2);
    group.add(wall);
  }
  const back = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 90)), wallMaterial);
  back.position.set(0, 8, VAULT.backZ);
  group.add(back);

  const floorTexture = keep(gridTexture());
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(140, 260)),
    keep(new THREE.MeshBasicMaterial({ map: floorTexture, color: '#9aa8e6' })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, VAULT.floorY, -60);
  group.add(floor);

  // Pillars along both walls.
  const pillarGeometry = keep(new THREE.BoxGeometry(3, 90, 3));
  const pillarMaterial = keep(new THREE.MeshStandardMaterial({ color: '#1e2a55', roughness: 0.9 }));
  const pillarCount = 18;
  const pillars = new THREE.InstancedMesh(pillarGeometry, pillarMaterial, pillarCount);
  const m = new THREE.Matrix4();
  for (let i = 0; i < pillarCount; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    m.makeTranslation(side * (VAULT.wallX - 2), 8, 20 - Math.floor(i / 2) * 22);
    pillars.setMatrixAt(i, m);
  }
  group.add(pillars);

  // Tall windows high on the left wall, and the light falling in from them.
  const windowMap = keep(windowTexture());
  const windowMaterial = keep(new THREE.MeshBasicMaterial({ map: windowMap, transparent: true, fog: false, toneMapped: false }));
  const windowGeometry = keep(new THREE.PlaneGeometry(9, 18));
  const shaftMap = keep(shaftTexture());
  const shaftMaterial = keep(
    new THREE.MeshBasicMaterial({
      map: shaftMap,
      transparent: true,
      opacity: hero ? 0.1 : 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }),
  );
  const shaftGeometry = keep(new THREE.PlaneGeometry(10, 110).translate(0, -55, 0));
  for (let i = 0; i < 4; i += 1) {
    const z = 4 - i * 34;
    const pane = new THREE.Mesh(windowGeometry, windowMaterial);
    pane.position.set(-VAULT.wallX + 0.5, 30, z);
    pane.rotation.y = Math.PI / 2;
    group.add(pane);
    for (const turn of [0, Math.PI / 2]) {
      const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
      shaft.position.set(-VAULT.wallX + 2, 34, z);
      shaft.rotation.set(0, turn, -0.85);
      group.add(shaft);
    }
  }

  // Dust in the light.
  const dustCount = quality.name === 'low' ? 300 : 900;
  const dust = new Float32Array(dustCount * 3);
  let seed = 3;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < dustCount; i += 1) {
    dust.set([(random() - 0.5) * 90, -8 + random() * 40, 18 - random() * 120], i * 3);
  }
  const dustGeometry = keep(new THREE.BufferGeometry());
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dustPoints = new THREE.Points(
    dustGeometry,
    keep(
      new THREE.PointsMaterial({
        size: 0.09,
        color: '#ffe3b8',
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  dustPoints.name = 'dust';
  group.add(dustPoints);

  let time = 0;
  return {
    group,
    update(dt) {
      time += dt;
      dustPoints.position.y = Math.sin(time * 0.15) * 0.8;
      dustPoints.rotation.y = Math.sin(time * 0.03) * 0.04;
    },
    dispose() {
      for (const thing of disposables) thing.dispose();
      pillars.dispose();
    },
  };
}

/** The rails as one merged tube mesh, plus the rods that hang them from the ceiling. */
export function buildRailMeshes(rails, quality) {
  const radial = quality.name === 'low' ? 5 : 8;
  const tubes = rails.map(
    (rail) => new THREE.TubeGeometry(rail.curve, Math.ceil(rail.length * 1.1), 0.075, radial, true),
  );
  const geometry = mergeGeometries(tubes);
  for (const tube of tubes) tube.dispose();
  const material = new THREE.MeshStandardMaterial({ color: '#b9c3e0', metalness: 0.75, roughness: 0.3 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rails';

  const rods = [];
  const point = new THREE.Vector3();
  for (const rail of rails) {
    const count = Math.max(3, Math.floor(rail.length / 11));
    for (let i = 0; i < count; i += 1) {
      rail.curve.getPointAt(i / count, point);
      rods.push(point.clone());
    }
  }
  const rodGeometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 5).translate(0, 0.5, 0);
  const rodMaterial = new THREE.MeshStandardMaterial({ color: '#4a557d', metalness: 0.6, roughness: 0.5 });
  const rodMesh = new THREE.InstancedMesh(rodGeometry, rodMaterial, rods.length);
  rodMesh.name = 'rail-rods';
  const m = new THREE.Matrix4();
  rods.forEach((p, i) => {
    m.makeScale(1, VAULT.ceilingY - p.y, 1).setPosition(p.x, p.y + 0.05, p.z);
    rodMesh.setMatrixAt(i, m);
  });

  const group = new THREE.Group();
  group.add(mesh, rodMesh);
  return {
    group,
    dispose() {
      geometry.dispose();
      material.dispose();
      rodGeometry.dispose();
      rodMaterial.dispose();
      rodMesh.dispose();
    },
  };
}

/** The platform you stand on, where a chosen door glides in on a short rail and opens. */
export function buildLanding({ doorY = 2.47, doorZ = 10.6 } = {}) {
  const group = new THREE.Group();
  group.name = 'landing';
  const deckGeometry = new THREE.BoxGeometry(7, 0.3, 5);
  const deckMaterial = new THREE.MeshStandardMaterial({ color: '#1c1830', roughness: 0.85 });
  const deck = new THREE.Mesh(deckGeometry, deckMaterial);
  deck.position.set(0, -0.15, 13);
  group.add(deck);
  const edgeGeometry = new THREE.BoxGeometry(7, 0.06, 0.06);
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: '#ffcf8a', toneMapped: false });
  const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
  edge.position.set(0, 0.02, 10.5);
  group.add(edge);
  // The landing's own bit of rail, hung from the ceiling like the others. It only
  // appears while a door is arriving, so it doesn't cut across the view.
  const railGeometry = new THREE.CylinderGeometry(0.075, 0.075, 9, 8).rotateZ(Math.PI / 2);
  const railMaterial = new THREE.MeshStandardMaterial({ color: '#b9c3e0', metalness: 0.75, roughness: 0.3 });
  const railGroup = new THREE.Group();
  railGroup.visible = false;
  const rail = new THREE.Mesh(railGeometry, railMaterial);
  rail.position.set(0, doorY + 0.06, doorZ);
  railGroup.add(rail);
  const rodGeometry = new THREE.CylinderGeometry(0.035, 0.035, VAULT.ceilingY - doorY, 5);
  for (const x of [-4, 4]) {
    const rod = new THREE.Mesh(rodGeometry, railMaterial);
    rod.position.set(x, (VAULT.ceilingY + doorY) / 2, doorZ);
    railGroup.add(rod);
  }
  group.add(railGroup);
  return {
    group,
    showRail(visible) {
      railGroup.visible = visible;
    },
    dispose() {
      for (const thing of [deckGeometry, deckMaterial, edgeGeometry, edgeMaterial, railGeometry, railMaterial, rodGeometry]) {
        thing.dispose();
      }
    },
  };
}
