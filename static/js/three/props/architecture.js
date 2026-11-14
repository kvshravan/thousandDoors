import * as THREE from 'three';
import { createPlankTexture } from './textures.js';

const WAINSCOT_HEIGHT = 1.0;
const WAINSCOT_DEPTH = 0.04;

/** Builds the reusable shell: floor, four walls, and ceiling. Walls face inward. */
export function buildRoomShell(kit, { width, height, depth }) {
  const shell = new THREE.Group();
  shell.name = 'room-shell';

  const floorMap = kit.texture(createPlankTexture(kit.palette));
  const floor = kit.mesh(kit.plane(width, depth), kit.material('#ffffff', { map: floorMap, roughness: 0.75 }), {
    castShadow: false,
  });
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  shell.add(floor);

  const halfW = width / 2;
  const halfD = depth / 2;
  const walls = [
    { name: 'wall-back', length: width, position: [0, 0, -halfD], rotationY: 0 },
    { name: 'wall-front', length: width, position: [0, 0, halfD], rotationY: Math.PI },
    { name: 'wall-left', length: depth, position: [-halfW, 0, 0], rotationY: Math.PI / 2 },
    { name: 'wall-right', length: depth, position: [halfW, 0, 0], rotationY: -Math.PI / 2 },
  ];
  for (const spec of walls) {
    const wall = buildWall(kit, spec.length, height);
    wall.name = spec.name;
    wall.position.set(...spec.position);
    wall.rotation.y = spec.rotationY;
    shell.add(wall);
  }

  shell.add(buildCeiling(kit, width, height, depth));
  return shell;
}

function buildWall(kit, length, height) {
  const wall = new THREE.Group();
  const noCast = { castShadow: false };

  kit.part(wall, kit.plane(length, height), kit.material('plaster', { roughness: 0.95 }), [0, height / 2, 0], null, noCast);
  kit.part(
    wall,
    kit.box(length, WAINSCOT_HEIGHT, WAINSCOT_DEPTH),
    kit.material('wainscot', { roughness: 0.9 }),
    [0, WAINSCOT_HEIGHT / 2, WAINSCOT_DEPTH / 2],
    null,
    noCast,
  );
  kit.part(
    wall,
    kit.box(length, 0.05, WAINSCOT_DEPTH + 0.03),
    kit.material('wainscotTrim', { roughness: 0.8 }),
    [0, WAINSCOT_HEIGHT + 0.02, (WAINSCOT_DEPTH + 0.03) / 2],
    null,
    noCast,
  );
  kit.part(
    wall,
    kit.box(length, 0.12, WAINSCOT_DEPTH + 0.02),
    kit.material('baseboard', { roughness: 0.7 }),
    [0, 0.06, (WAINSCOT_DEPTH + 0.02) / 2],
    null,
    noCast,
  );
  kit.part(
    wall,
    kit.box(length, 0.08, 0.06),
    kit.material('baseboard', { roughness: 0.7 }),
    [0, height - 0.04, 0.03],
    null,
    noCast,
  );
  return wall;
}

function buildCeiling(kit, width, height, depth) {
  const ceiling = new THREE.Group();
  ceiling.name = 'ceiling';
  const noCast = { castShadow: false };

  kit.part(
    ceiling,
    kit.plane(width, depth),
    kit.material('ceiling', { roughness: 1 }),
    [0, height, 0],
    [Math.PI / 2, 0, 0],
    noCast,
  );
  const beam = kit.box(0.2, 0.16, depth);
  const beamMaterial = kit.material('woodMid', { roughness: 0.8 });
  for (const x of [-width * 0.3, 0, width * 0.3]) {
    kit.part(ceiling, beam, beamMaterial, [x, height - 0.08, 0], null, noCast);
  }
  return ceiling;
}
