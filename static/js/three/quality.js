export const QUALITY_PRESETS = Object.freeze({
  low: { name: 'low', maxPixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 512 },
  medium: { name: 'medium', maxPixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 1024 },
  high: { name: 'high', maxPixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 2048 },
});

export function isWebGL2Available() {
  try {
    if (!window.WebGL2RenderingContext) return false;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function detectQuality(override) {
  if (override && QUALITY_PRESETS[override]) return QUALITY_PRESETS[override];

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;

  if (cores <= 2 || memory <= 2) return QUALITY_PRESETS.low;
  if (coarsePointer || cores <= 4) return QUALITY_PRESETS.medium;
  return QUALITY_PRESETS.high;
}
