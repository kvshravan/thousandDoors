// Room-wide configuration. Keep values here rather than in scene code.

export const ROOM_DIMENSIONS = Object.freeze({
  width: 10,
  height: 4,
  depth: 10,
});

export const THEMES = Object.freeze({
  cozy: {
    background: '#2b1d2e',
    plaster: '#f3e3cc',
    ceiling: '#f7ecdc',
    wainscot: '#9bb092',
    wainscotTrim: '#7f9678',
    baseboard: '#fbf5ec',
    floorLight: '#c9905f',
    floorDark: '#a8714a',
    woodLight: '#d9a877',
    woodMid: '#b07a4f',
    woodDark: '#7d5236',
    linen: '#fbf5ec',
    cream: '#f1e4cf',
    terracotta: '#cf7651',
    mustard: '#e2b04a',
    dustyPink: '#e3a5a0',
    navy: '#3e4a6b',
    sage: '#9bb092',
    leaf: '#6f9a5b',
    leafDark: '#557e45',
    soil: '#4a3426',
    metal: '#3b3330',
    brass: '#d6a85a',
    screen: '#9ec9e8',
    lampGlow: '#ffd79a',
    skyTop: '#8fc3e3',
    skyBottom: '#fde2b8',
    hillNear: '#7f9e72',
    hillFar: '#a9c09a',
    sun: '#ffe7a8',
  },
});

export const LIGHTING = Object.freeze({
  hemisphere: { sky: '#fff3e2', ground: '#9a7a62', intensity: 1.9 },
  sun: {
    color: '#ffd9ad',
    intensity: 2.2,
    position: [3.5, 7.5, -8],
    target: [0, 0, 0],
    shadowExtent: 6.5,
  },
  toneMappingExposure: 1.1,
});

export const CAMERA_SETTINGS = Object.freeze({
  fov: 55,
  // On narrow (portrait) screens the vertical FOV widens to keep at least this
  // much horizontal view, up to maxFov.
  minHorizontalFov: 62,
  maxFov: 75,
  near: 0.1,
  far: 60,
  target: [0, 1.05, -0.6],
  initialPosition: [2.16, 2.76, 2.56],
  minDistance: 1.8,
  maxDistance: 4.2,
  minPolarAngle: 1.0,
  maxPolarAngle: 1.4,
  dampingFactor: 0.08,
  rotateSpeed: 0.6,
  zoomSpeed: 0.8,
  // Keeps the camera this far inside the walls, floor, and ceiling.
  boundsMargin: 0.3,
});

const HALF_PI = Math.PI / 2;

// Placement of props for the demo room. Positions are in room units, y = floor.
export const DEMO_ROOM_LAYOUT = Object.freeze([
  { prop: 'rug', position: [0.3, 0, -0.6], options: { radius: 1.6 } },
  { prop: 'bed', position: [-2.6, 0, -3.84] },
  { prop: 'nightstand', position: [-1.15, 0, -4.68] },
  { prop: 'desk', position: [1.4, 0, -4.58] },
  { prop: 'chair', position: [1.4, 0, -3.72], rotationY: Math.PI - 0.12 },
  { prop: 'floorLamp', position: [2.9, 0, -4.5] },
  { prop: 'plant', position: [4.35, 0, -4.35], options: { seed: 3 } },
  { prop: 'bookshelf', position: [-4.74, 0, 0.4], rotationY: HALF_PI },
  { prop: 'plant', position: [-4.35, 0, 4.3], options: { seed: 11, scale: 0.75 } },
  { prop: 'sofa', position: [-1.0, 0, 4.48], rotationY: Math.PI },
  { prop: 'sideTable', position: [0.45, 0, 4.55] },
  { prop: 'door', position: [4.97, 0, 2.0], rotationY: -HALF_PI },
  { prop: 'doorMat', position: [4.45, 0, 2.0], rotationY: -HALF_PI },
  { prop: 'window', position: [1.4, 2.15, -4.97], options: { width: 2.0, height: 1.5 } },
  { prop: 'pendantLamp', position: [0.3, 4, -0.6], options: { drop: 1.0 } },
  { prop: 'wallClock', position: [4.97, 2.7, -1.6], rotationY: -HALF_PI },
  {
    prop: 'pictureFrame',
    position: [-4.97, 2.45, -1.7],
    rotationY: HALF_PI,
    options: { width: 0.8, height: 1.0, art: 'sun' },
  },
  {
    prop: 'pictureFrame',
    position: [-4.97, 2.65, -2.85],
    rotationY: HALF_PI,
    options: { width: 0.6, height: 0.6, art: 'waves' },
  },
  {
    prop: 'pictureFrame',
    position: [-4.97, 2.2, -2.85],
    rotationY: HALF_PI,
    options: { width: 0.6, height: 0.25, art: 'stripes', frameColor: 'woodLight' },
  },
  {
    prop: 'pictureFrame',
    position: [-1.0, 2.15, 4.97],
    rotationY: Math.PI,
    options: { width: 1.3, height: 0.8, art: 'blocks' },
  },
  {
    prop: 'pictureFrame',
    position: [-2.6, 1.95, -4.97],
    options: { width: 0.5, height: 0.6, art: 'moon', frameColor: 'woodLight' },
  },
]);
