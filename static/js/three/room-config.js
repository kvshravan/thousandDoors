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
      metalLight: '#e6e0d8',
      carpetBlue: 'navy',
      fur: '#c08a5b',
      plant: 'leaf',
      _defaultMat: 'cream',
    },
  },
});

// Colours an owner can give an item (catalogue "recolor"). Values are palette keys,
// so wood tones follow the theme, or plain colours.
export const ITEM_COLORS = Object.freeze({
  woodLight: { label: 'Light wood', value: 'woodLight' },
  woodMid: { label: 'Wood', value: 'woodMid' },
  woodDark: { label: 'Dark wood', value: 'woodDark' },
  cream: { label: 'Cream', value: 'cream' },
  terracotta: { label: 'Terracotta', value: 'terracotta' },
  coral: { label: 'Coral', value: '#e8836b' },
  mustard: { label: 'Mustard', value: 'mustard' },
  sage: { label: 'Sage', value: 'sage' },
  forest: { label: 'Forest', value: '#4f7a4a' },
  teal: { label: 'Teal', value: '#3f8a88' },
  sky: { label: 'Sky', value: '#8cbad8' },
  navy: { label: 'Navy', value: 'navy' },
  lilac: { label: 'Lilac', value: '#b7a2d6' },
  plum: { label: 'Plum', value: '#7a4a6e' },
  dustyPink: { label: 'Dusty pink', value: 'dustyPink' },
  charcoal: { label: 'Charcoal', value: '#3b3a3d' },
});

// Sizes an owner can pick, as uniform scale factors.
export const ITEM_SIZES = Object.freeze({
  small: { label: 'Small', scale: 0.8 },
  medium: { label: 'Medium', scale: 1 },
  large: { label: 'Large', scale: 1.25 },
});

/** The size preset nearest to a scale factor. */
export function sizeForScale(scale) {
  let best = 'medium';
  for (const [name, preset] of Object.entries(ITEM_SIZES)) {
    if (Math.abs(preset.scale - scale) < Math.abs(ITEM_SIZES[best].scale - scale)) best = name;
  }
  return best;
}

// Light colours an owner can pick for lamps and other glowing things. "multi" gives
// strings of bulbs a different colour per bulb.
export const LIGHT_COLORS = Object.freeze({
  warm: { label: 'Warm', value: '#ffd79a' },
  candle: { label: 'Candle', value: '#ffb35c' },
  white: { label: 'Cool white', value: '#eef2ff' },
  pink: { label: 'Pink', value: '#ff8fc8' },
  red: { label: 'Red', value: '#ff5f55' },
  green: { label: 'Green', value: '#7dffa0' },
  teal: { label: 'Teal', value: '#5ff2e0' },
  blue: { label: 'Blue', value: '#6aa8ff' },
  purple: { label: 'Purple', value: '#b98cff' },
  multi: { label: 'Rainbow', value: '#ffd79a', bulbs: ['#ff5f55', '#ffd166', '#7dffa0', '#6aa8ff', '#ff8fc8'] },
});

export const LIGHT_EFFECTS = Object.freeze({
  steady: { label: 'Steady' },
  pulse: { label: 'Pulse' },
  twinkle: { label: 'Twinkle' },
  flicker: { label: 'Flicker' },
});

export const LIGHT_BRIGHTNESS = Object.freeze({ min: 0.25, max: 1.5, step: 0.25 });

/** A light's settings with defaults filled in and unknown values dropped. */
export function resolveLightSettings(settings = {}, defaults = {}) {
  const pick = (value, presets, fallback) => (Object.hasOwn(presets, value ?? '') ? value : fallback);
  const brightness = Number(settings.brightness ?? defaults.brightness ?? 1);
  return {
    color: pick(settings.color, LIGHT_COLORS, pick(defaults.color, LIGHT_COLORS, 'warm')),
    effect: pick(settings.effect, LIGHT_EFFECTS, pick(defaults.effect, LIGHT_EFFECTS, 'steady')),
    brightness: Number.isFinite(brightness)
      ? Math.min(LIGHT_BRIGHTNESS.max, Math.max(LIGHT_BRIGHTNESS.min, brightness))
      : 1,
  };
}

// Places a house can stand. Each sets the scenery through the window and the
// outside view. `window` colours paint the view; `ground` and friends build the 3D scene.
export const LANDSCAPES = Object.freeze({
  countryside: {
    label: 'Countryside cottage',
    swatch: ['#8fc3e3', '#7f9e72'],
    ground: '#7f9e72',
    far: '#a9c09a',
    near: '#6b8c5f',
  },
  beach: {
    label: 'Beach house',
    swatch: ['#3f8fd8', '#f3e2b8'],
    ground: '#f3e2b8',
    far: '#3fc1c9',
    near: '#2a9fb0',
  },
  forest: {
    label: 'Forest cabin',
    swatch: ['#9fc7d8', '#3f6b45'],
    ground: '#5d7f4e',
    far: '#7d93a6',
    near: '#2f5a3a',
  },
  city: {
    label: 'City apartment',
    swatch: ['#a6bfd6', '#5c6070'],
    ground: '#6a6d78',
    far: '#8a90a6',
    near: '#4e5262',
  },
  snow: {
    label: 'Snowy chalet',
    swatch: ['#b9d3ea', '#f4f7fb'],
    ground: '#eef3f8',
    far: '#c9d6e6',
    near: '#5f7f74',
  },
  desert: {
    label: 'Desert adobe',
    swatch: ['#f2b27a', '#d9a066'],
    ground: '#e0b07a',
    far: '#c9805a',
    near: '#cf9a62',
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

// Scenery shown through the window. A room starts with the scene matching its
// lighting mood; visitors can cycle through them by clicking the window.
export const WINDOW_SCENES = Object.freeze({
  day: { skyTop: '#8fc3e3', skyBottom: '#fde2b8', sun: '#ffe7a8', hillNear: '#7f9e72', hillFar: '#a9c09a', stars: null },
  evening: { skyTop: '#e58a6f', skyBottom: '#ffd19a', sun: '#ffb36b', hillNear: '#6b6f5a', hillFar: '#9a8c74', stars: null },
  night: { skyTop: '#141a33', skyBottom: '#3e4a6b', sun: '#f1e4cf', hillNear: '#26304a', hillFar: '#34405e', stars: '#f1e4cf' },
});

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
    palette: { ...WINDOW_SCENES.evening },
  },
  night: {
    hemisphere: { sky: '#aab4e0', ground: '#3a2e40', intensity: 1.0 },
    sun: { color: '#9fb1ff', intensity: 0.5, position: SUN_POSITION, target: [0, 0, 0], shadowExtent: 6.5 },
    toneMappingExposure: 1.1,
    palette: { background: '#161022', ...WINDOW_SCENES.night },
  },
});

export const DEFAULT_APPEARANCE = Object.freeze({
  theme: 'cozy',
  wallpaper: 'cream',
  floor: 'oak',
  lighting: 'day',
  landscape: 'countryside',
});

/** Combines a theme with the room's wallpaper, floor, and lighting choices. */
export function resolveAppearance(appearance = {}) {
  const choice = { ...DEFAULT_APPEARANCE, ...appearance };
  const lookups = [
    ['theme', THEMES],
    ['wallpaper', WALLPAPERS],
    ['floor', FLOORS],
    ['lighting', LIGHTING_MOODS],
    ['landscape', LANDSCAPES],
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
