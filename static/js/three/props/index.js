import { buildDoor, buildDoorMat, buildPendantLamp, buildPictureFrame, buildRug, buildWallClock, buildWindow } from './decor.js';
import {
  buildBed,
  buildBookshelf,
  buildChair,
  buildDesk,
  buildFloorLamp,
  buildNightstand,
  buildPlant,
  buildSideTable,
  buildSofa,
} from './furniture.js';

/** Maps layout prop names to builder functions: (kit, options) => THREE.Object3D. */
export const PROP_BUILDERS = Object.freeze({
  bed: buildBed,
  nightstand: buildNightstand,
  desk: buildDesk,
  chair: buildChair,
  bookshelf: buildBookshelf,
  plant: buildPlant,
  floorLamp: buildFloorLamp,
  sofa: buildSofa,
  sideTable: buildSideTable,
  rug: buildRug,
  door: buildDoor,
  doorMat: buildDoorMat,
  window: buildWindow,
  pictureFrame: buildPictureFrame,
  wallClock: buildWallClock,
  pendantLamp: buildPendantLamp,
});
