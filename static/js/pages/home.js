import { Engine } from '../three/engine.js';
import { HallwayScene } from '../three/hallway/hallway-scene.js';
import { detectQuality, isWebGL2Available, QUALITY_PRESETS } from '../three/quality.js';

// The rails of doors gliding behind the home page's headline. Decoration only: the
// page works the same without it (no WebGL, or it fails to start).

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const DOORS_TIMEOUT_MS = 1500;

async function fetchDoors(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOORS_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok ? ((await response.json()).doors ?? []) : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

async function start(stage) {
  if (!stage || !isWebGL2Available()) return null;
  const doors = await fetchDoors(stage.dataset.doorsUrl);
  // A backdrop never needs more than medium quality.
  const detected = detectQuality(new URLSearchParams(window.location.search).get('quality'));
  const quality = detected.name === 'high' ? QUALITY_PRESETS.medium : detected;
  try {
    const engine = new Engine(stage, { quality, onContextLost: () => stage.classList.remove('is-ready') });
    const view = new HallwayScene({ quality, doors, hero: true, reducedMotion: prefersReducedMotion() });
    engine.setView(view);
    engine.start();
    await engine.waitForFrame();
    stage.classList.add('is-ready');
    return { engine, view };
  } catch {
    return null;
  }
}

const hero = await start(document.querySelector('#home-stage'));
if (document.documentElement.dataset.debug === '1') {
  window.__home = {
    ready: Boolean(hero),
    info: () => ({ engine: hero?.engine.getDebugInfo() ?? null, scene: hero?.view.getDebugInfo() ?? null }),
  };
}
