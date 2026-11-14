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

// Appearance presets a room owner can pick. Each overrides part of the theme palette.
export const WALLPAPERS = Object.freeze({
  cream: { plaster: '#f3e3cc', wainscot: '#9bb092', wainscotTrim: '#7f9678' },
  blush: { plaster: '#f2dbd2', wainscot: '#c98f7e', wainscotTrim: '#b07a6a' },
  sage: { plaster: '#e3e8d5', wainscot: '#7f9e72', wainscotTrim: '#6a8760' },
  midnight: { plaster: '#c8cde0', wainscot: '#3e4a6b', wainscotTrim: '#323c58' },
});

export const FLOORS = Object.freeze({
  oak: { floorLight: '#c9905f', floorDark: '#a8714a' },
  walnut: { floorLight: '#8f5f3f', floorDark: '#73492f' },
  birch: { floorLight: '#e2c79f', floorDark: '#cdab7f' },
});

const SUN_POSITION = [3.5, 7.5, -8];

export const LIGHTING_MOODS = Object.freeze({
  day: {
    hemisphere: { sky: '#fff3e2', ground: '#9a7a62', intensity: 1.9 },
    sun: { color: '#ffd9ad', intensity: 2.2, position: SUN_POSITION, target: [0, 0, 0], shadowExtent: 6.5 },
    toneMappingExposure: 1.1,
    palette: {},
  },
  evening: {
    hemisphere: { sky: '#ffd9c2', ground: '#7a5a4a', intensity: 1.25 },
    sun: { color: '#ff9f6b', intensity: 1.7, position: SUN_POSITION, target: [0, 0, 0], shadowExtent: 6.5 },
    toneMappingExposure: 1.05,
    palette: { skyTop: '#e58a6f', skyBottom: '#ffd19a', sun: '#ffb36b', hillNear: '#6b6f5a', hillFar: '#9a8c74' },
  },
  night: {
    hemisphere: { sky: '#aab4e0', ground: '#3a2e40', intensity: 1.0 },
    sun: { color: '#9fb1ff', intensity: 0.5, position: SUN_POSITION, target: [0, 0, 0], shadowExtent: 6.5 },
    toneMappingExposure: 1.1,
    palette: {
      background: '#161022',
      skyTop: '#141a33',
      skyBottom: '#3e4a6b',
      sun: '#f1e4cf',
      hillNear: '#26304a',
      hillFar: '#34405e',
      stars: '#f1e4cf',
    },
  },
});

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: 'cozy',
  wallpaper: 'cream',
  floor: 'oak',
  lighting: 'day',
});

/** Combines a theme with the room's wallpaper, floor, and lighting choices. */
export function resolveAppearance(appearance = {}) {
  const choice = { ...DEFAULT_APPEARANCE, ...appearance };
  const lookups = [
    ['theme', THEMES],
    ['wallpaper', WALLPAPERS],
    ['floor', FLOORS],
    ['lighting', LIGHTING_MOODS],
  ];
  for (const [key, presets] of lookups) {
    if (!presets[choice[key]]) throw new Error(`Unknown ${key} "${choice[key]}".`);
  }
  const lighting = LIGHTING_MOODS[choice.lighting];
  return {
    choice,
    lighting,
    palette: {
      ...THEMES[choice.theme],
      ...WALLPAPERS[choice.wallpaper],
      ...FLOORS[choice.floor],
      ...lighting.palette,
    },
  };
}

export const CAMERA_SETTINGS = Object.freeze({
  fov: 55,
  // On narrow (portrait) screens the vertical FOV widens to keep at least this
  // much horizontal view, up to maxFov.
  minHorizontalFov: 62,
  maxFov: 75,
  near: 0.1,
  far: 60,
  // Starts just inside the entrance, looking toward the back wall.
  target: [0, 1.0, -0.8],
  initialPosition: [0.5, 3.0, 4.2],
  minDistance: 1.8,
  maxDistance: 5.45,
  minPolarAngle: 1.0,
  maxPolarAngle: 1.4,
  dampingFactor: 0.08,
  rotateSpeed: 0.6,
  zoomSpeed: 0.8,
  // Keeps the camera this far inside the walls, floor, and ceiling.
  boundsMargin: 0.3,
});
