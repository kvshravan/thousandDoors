import { buildDoor, buildDoorMat, buildPendantLamp, buildPictureFrame, buildRug, buildWallClock, buildWindow } from './decor.js';
import { buildChest, buildGiftTable, buildNoticeboard, buildPoster, buildRecordPlayer } from './interactive.js';

/**
 * Procedural builders referenced by catalogue entries ({ "builder": "door" }).
 * Signature: (kit, options, { loader, room }) => THREE.Object3D | Promise<THREE.Object3D>.
 * Furniture comes from GLB models instead; see static/data/catalog.json.
 */
export const PROP_BUILDERS = Object.freeze({
  rug: buildRug,
  door: buildDoor,
  doorMat: buildDoorMat,
  window: buildWindow,
  pictureFrame: buildPictureFrame,
  wallClock: buildWallClock,
  pendantLamp: buildPendantLamp,
  poster: buildPoster,
  recordPlayer: buildRecordPlayer,
  noticeboard: buildNoticeboard,
  giftTable: buildGiftTable,
  chest: buildChest,
});
