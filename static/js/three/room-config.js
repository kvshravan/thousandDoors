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
    // Recolours GLB model materials (matched by material name) to this palette.
    modelMaterials: {
      wood: 'woodLight',
      woodDark: 'woodDark',
      carpet: 'terracotta',
      carpetDarker: '#a8553a',
      carpetWhite: 'linen',
      metal: '#d3cbbf',
      metalMedium: '#7b7570',
      metalDark: '#3b3a3d',
      plant: 'leaf',
      _defaultMat: 'cream',
    },
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
