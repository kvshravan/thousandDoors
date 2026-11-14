import { Catalog, fetchJson, normalizeRoom } from '../three/catalog.js';
import { Engine } from '../three/engine.js';
import { detectQuality, isWebGL2Available } from '../three/quality.js';
import { RoomScene } from '../three/room-scene.js';
import { SceneManager } from '../three/scene-manager.js';
import { GuestbookPanel } from '../ui/guestbook.js';
import { createInteractionRegistry, handleInteraction, INTERACTION_VERBS } from '../ui/interactions.js';
import { PhotoViewer } from '../ui/photo-viewer.js';

const HINT_FADE_DELAY_MS = 2500;
const TOOLTIP_OFFSET_PX = 16;

class RoomPage {
  constructor(root) {
    this.stage = root.querySelector('#room-stage');
    this.loading = root.querySelector('#room-loading');
    this.loadingText = root.querySelector('#room-loading-text');
    this.errorPanel = root.querySelector('#room-error');
    this.fallbackPanel = root.querySelector('#room-fallback');
    this.hint = root.querySelector('#room-hint');
    this.tooltip = root.querySelector('#room-tooltip');
    this.nameplateTitle = root.querySelector('[data-room-name]');
    this.nameplateSub = root.querySelector('[data-room-description]');
    this.resetButton = root.querySelector('#reset-view');
    this.retryButton = root.querySelector('#room-retry');

    const { catalogUrl, roomUrl, modelsUrl } = this.stage.dataset;
    this.urls = { catalogUrl, roomUrl, modelsUrl };

    this.state = 'idle';
    this.engine = null;
    this.manager = null;
    this.room = null;
    this.lastInteraction = null;

    this.photoViewer = new PhotoViewer(root.querySelector('#photo-viewer'));
    this.guestbook = new GuestbookPanel(root.querySelector('#guestbook-panel'));
    this.registry = createInteractionRegistry({
      photoViewer: this.photoViewer,
      guestbook: this.guestbook,
      getScene: () => this.manager?.current ?? null,
      getRoomName: () => this.room?.name ?? '',
    });

    this._onReset = () => this.manager?.current?.resetView();
    this._onRetry = () => this.remount();
    this._onFirstInteraction = () => this._fadeHint();
    this.resetButton.addEventListener('click', this._onReset);
    this.retryButton.addEventListener('click', this._onRetry);

    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.hint.textContent = coarse
      ? 'Drag to look around · Pinch to zoom · Tap things'
      : 'Drag to look around · Scroll to zoom · Click things';
  }

  async mount() {
    if (this.state === 'loading' || this.state === 'ready') return;
    this._hideAllPanels();

    if (!isWebGL2Available()) {
      this._setState('unsupported');
      this.loading.hidden = true;
      this.fallbackPanel.hidden = false;
      return;
    }

    this._setState('loading');
    this.loading.hidden = false;
    this.loading.classList.remove('is-hidden');
    this._setProgress(0);

    try {
      const [catalogData, roomData] = await Promise.all([
        fetchJson(this.urls.catalogUrl, 'the item catalogue'),
        fetchJson(this.urls.roomUrl, 'the room'),
      ]);
      const catalog = new Catalog(catalogData);
      this.room = normalizeRoom(roomData);
      this._showNameplate(this.room);

      const quality = detectQuality(new URLSearchParams(window.location.search).get('quality'));
      this.engine = new Engine(this.stage, { quality, onContextLost: () => this._fail('lost') });
      this.manager = new SceneManager(this.engine);
      const scene = await this.manager.show(
        () =>
          new RoomScene({
            room: this.room,
            catalog,
            modelsUrl: this.urls.modelsUrl,
            onInteract: (event) => this._interact(event),
            onHoverChange: (target, point) => this._showTooltip(target, point),
          }),
        { onProgress: (value) => this._setProgress(value) },
      );
      if (!scene) return;
      await this.engine.waitForFrame();
      if (this.manager?.current !== scene) return;
      this._setState('ready');
      this.loading.classList.add('is-hidden');
      this.engine.canvas.addEventListener('pointerdown', this._onFirstInteraction, { once: true });
      this.engine.canvas.addEventListener('wheel', this._onFirstInteraction, { once: true, passive: true });
    } catch (error) {
      console.error('[room] Could not open the room.', error);
      this._fail('load');
    }
  }

  destroy() {
    this.photoViewer.close();
    this.guestbook.close();
    this._showTooltip(null);
    this.manager?.dispose();
    this.engine?.dispose();
    this.manager = null;
    this.engine = null;
    if (this.state !== 'unsupported') this._setState('destroyed');
  }

  async remount() {
    this.destroy();
    this._setState('idle');
    await this.mount();
  }

  getDebugInfo() {
    return {
      state: this.state,
      engine: this.engine?.getDebugInfo() ?? null,
      scene: this.manager?.current?.getDebugInfo() ?? null,
      activeLoops: Engine.activeLoops,
      lastInteraction: this.lastInteraction,
      ui: {
        photoOpen: this.photoViewer.isOpen,
        guestbookOpen: this.guestbook.isOpen,
        tooltip: this.tooltip.hidden ? null : this.tooltip.textContent,
      },
    };
  }

  /** Client-space point where an object can be clicked, or null if it isn't visible. */
  pointFor(objectId) {
    return this.manager?.current?.getObjectScreenPoint(objectId) ?? null;
  }

  /** Renders a frame and returns basic pixel statistics, used to verify the canvas isn't blank. */
  samplePixels() {
    const { engine } = this;
    const view = this.manager?.current;
    if (!engine || !view) return null;
    engine.renderer.render(view.scene, view.camera);
    const size = 64;
    const probe = document.createElement('canvas');
    probe.width = size;
    probe.height = size;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(engine.canvas, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const colors = new Set();
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return { distinctColors: colors.size, meanBrightness: sum / (size * size) };
  }

  _interact(event) {
    this.lastInteraction = { objectId: event.objectId, type: event.type };
    this._showTooltip(null);
    handleInteraction(this.registry, event);
  }

  _showTooltip(target, point) {
    if (!target || !point) {
      this.tooltip.hidden = true;
      return;
    }
    const verb = INTERACTION_VERBS[target.type];
    this.tooltip.textContent = verb ? `${target.name} · ${verb}` : target.name;
    this.tooltip.hidden = false;
    const maxX = window.innerWidth - this.tooltip.offsetWidth - 8;
    const maxY = window.innerHeight - this.tooltip.offsetHeight - 8;
    this.tooltip.style.transform = `translate(${Math.min(point.x + TOOLTIP_OFFSET_PX, maxX)}px, ${Math.min(point.y + TOOLTIP_OFFSET_PX, maxY)}px)`;
  }

  _showNameplate(room) {
    this.nameplateTitle.textContent = room.name;
    this.nameplateSub.textContent = room.description;
    this.nameplateSub.hidden = !room.description;
  }

  _fail(reason) {
    this.manager?.dispose();
    this.engine?.dispose();
    this.manager = null;
    this.engine = null;
    this._setState('error');
    this.loading.hidden = true;
    this.errorPanel.hidden = false;
    this.errorPanel.dataset.reason = reason;
  }

  _hideAllPanels() {
    this.errorPanel.hidden = true;
    this.fallbackPanel.hidden = true;
  }

  _setProgress(value) {
    const percent = Math.round(value * 100);
    this.loadingText.textContent = percent < 100 ? `Opening the door… ${percent}%` : 'Come on in';
  }

  _setState(state) {
    this.state = state;
    document.documentElement.dataset.roomState = state;
  }

  _fadeHint() {
    window.setTimeout(() => this.hint.classList.add('is-hidden'), HINT_FADE_DELAY_MS);
  }
}

const page = new RoomPage(document);

window.addEventListener('pagehide', () => page.destroy());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) page.remount();
});

if (document.documentElement.dataset.debug === '1') {
  window.__doors = {
    get state() {
      return page.state;
    },
    info: () => page.getDebugInfo(),
    samplePixels: () => page.samplePixels(),
    pointFor: (objectId) => page.pointFor(objectId),
    bounds: () => page.manager?.current?.getObjectBounds() ?? {},
    destroy: () => page.destroy(),
    remount: () => page.remount(),
  };
}

page.mount();
