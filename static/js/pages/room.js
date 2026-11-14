import { canInteract, normalizeRelationship } from '../permissions.js';
import { Catalog, fetchJson, normalizeRoom } from '../three/catalog.js';
import { Engine } from '../three/engine.js';
import { detectQuality, isWebGL2Available } from '../three/quality.js';
import { RoomScene } from '../three/room-scene.js';
import { SceneManager } from '../three/scene-manager.js';
import {
  createInteractionRegistry,
  giftCount,
  handleInteraction,
  INTERACTION_VERBS,
  noteCount,
} from '../ui/interactions.js';
import { MusicPlayer } from '../ui/music.js';
import { Panel } from '../ui/panel.js';
import { PhotoViewer } from '../ui/photo-viewer.js';
import { RoomStore } from '../ui/room-store.js';
import { EditorPanel } from '../ui/editor-panel.js';
import { resolveAppearance } from '../three/room-config.js';

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
    this.nameplateStatus = root.querySelector('[data-room-status]');
    this.resetButton = root.querySelector('#reset-view');
    this.retryButton = root.querySelector('#room-retry');
    this.standButton = root.querySelector('#stand-up');
    this.editButton = root.querySelector('#edit-room');
    this.editorRoot = root.querySelector('#editor');
    this.editorPanel = null;
    this.editing = false;
    this._editSnapshot = null;
    this._editBusy = false;
    this.leaveUrl = root.querySelector('[data-testid="back-link"]').getAttribute('href');

    const { catalogUrl, roomUrl, modelsUrl } = this.stage.dataset;
    this.urls = { catalogUrl, roomUrl, modelsUrl };
    // Mock viewer until accounts exist (Milestone 4): ?as=stranger|follower|friend|owner.
    this.viewer = { relationship: normalizeRelationship(new URLSearchParams(window.location.search).get('as')) };

    this.state = 'idle';
    this.engine = null;
    this.manager = null;
    this.room = null;
    this.catalog = null;
    this.store = null;
    this.lastInteraction = null;

    this.photoViewer = new PhotoViewer(root.querySelector('#photo-viewer'));
    this.panel = new Panel(root.querySelector('#room-panel'));
    this._musicSource = null;
    this.music = new MusicPlayer({ onChange: (state) => this._syncMusic(state) });
    const page = this;
    this.interactionContext = {
      photoViewer: this.photoViewer,
      panel: this.panel,
      music: this.music,
      leaveUrl: this.leaveUrl,
      get store() {
        return page.store;
      },
      getScene: () => this.manager?.current ?? null,
      getRoom: () => this.room,
      sit: (objectId) => this._sit(objectId),
    };
    this.registry = createInteractionRegistry(this.interactionContext);

    this._onReset = () => this._stand();
    this._onRetry = () => this.remount();
    this._onFirstInteraction = () => this._fadeHint();
    this.resetButton.addEventListener('click', this._onReset);
    this.retryButton.addEventListener('click', this._onRetry);
    this.standButton.addEventListener('click', this._onReset);
    this.editButton.addEventListener('click', () => this.enterEditMode());

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
      this.catalog = catalog;
      this.originalRoom = normalizeRoom(roomData);
      this.store = new RoomStore(this.originalRoom.roomId);
      this.room = this._withSavedLayout(roomData);
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
            canInteract: (level) => canInteract(level ?? 'everyone', this.viewer.relationship),
          }),
        { onProgress: (value) => this._setProgress(value) },
      );
      if (!scene) return;
      await this.engine.waitForFrame();
      if (this.manager?.current !== scene) return;
      this._syncVisitorCounts(scene);
      this._setState('ready');
      this.editButton.hidden = this.viewer.relationship !== 'owner';
      this.loading.classList.add('is-hidden');
      this.engine.canvas.addEventListener('pointerdown', this._onFirstInteraction, { once: true });
      this.engine.canvas.addEventListener('wheel', this._onFirstInteraction, { once: true, passive: true });
    } catch (error) {
      console.error('[room] Could not open the room.', error);
      this._fail('load');
    }
  }

  destroy() {
    this._leaveEditMode();
    this.editButton.hidden = true;
    this.photoViewer.close();
    this.panel.close();
    this.music.stop();
    this._musicSource = null;
    this.standButton.hidden = true;
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
      viewer: { ...this.viewer },
      owner: this.room ? { ...this.room.owner } : null,
      lastInteraction: this.lastInteraction,
      music: this.music.state,
      editing: this.editing,
      customized: Boolean(this.room?.customized),
      savedLayout: this.store?.loadLayout() ?? null,
      ui: {
        photoOpen: this.photoViewer.isOpen,
        panel: this.panel.getDebugInfo(),
        standUpVisible: !this.standButton.hidden,
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

  // ---- Edit mode (owner only) ----

  /** The room as authored, with the owner's saved layout (if any) applied on top. */
  _withSavedLayout(roomData) {
    const saved = this.store.loadLayout();
    if (!saved) return normalizeRoom(roomData);
    let appearance = saved.appearance;
    try {
      resolveAppearance(appearance);
    } catch {
      appearance = roomData.appearance;
    }
    const room = normalizeRoom({ ...roomData, appearance, objects: saved.objects });
    room.customized = true;
    return room;
  }

  enterEditMode() {
    const scene = this.manager?.current;
    if (this.editing || this.state !== 'ready' || !scene || this.viewer.relationship !== 'owner') return false;
    if (!this.editorPanel) {
      this.editorPanel = new EditorPanel(this.editorRoot, {
        catalog: this.catalog,
        modelsUrl: this.urls.modelsUrl,
        onAdd: (catalogId) => this.manager?.current?.editor?.beginPlacement(catalogId),
        onAppearance: (change) => this._changeAppearance(change),
        onCommand: (command) => this._editorCommand(command),
      });
    }
    this.photoViewer.close();
    this.panel.close();
    this._showTooltip(null);
    this.standButton.hidden = true;
    this._editSnapshot = scene.serialize();
    scene.enterEditMode({ onChange: (state) => this.editorPanel.render(state) });
    this.editing = true;
    document.body.classList.add('is-editing');
    this.editorPanel.show(scene.appearance);
    this.editorRoot.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    return true;
  }

  async _editorCommand(command) {
    const editor = this.manager?.current?.editor;
    if (!editor || this._editBusy) return;
    switch (command) {
      case 'rotate-left':
        editor.rotateSelected(-1);
        break;
      case 'rotate-right':
        editor.rotateSelected(1);
        break;
      case 'delete':
        editor.deleteSelected();
        break;
      case 'place':
        editor.commitPlacement();
        break;
      case 'save':
        this.saveEdits();
        break;
      case 'cancel':
        await this.cancelEdits();
        break;
      case 'restore':
        await this._runBusy(() => this.manager.current.applyLayout(this.originalRoom));
        editor.deselect();
        this.editorPanel.setAppearance(this.manager.current.appearance);
        editor._setMessage('Back to how the room started. Save to keep it.');
        break;
      default:
        break;
    }
  }

  _changeAppearance(change) {
    const scene = this.manager?.current;
    if (!scene?.editing) return;
    this.editorPanel.setAppearance(scene.setAppearance(change));
  }

  saveEdits() {
    const scene = this.manager?.current;
    if (!scene?.editing) return false;
    scene.editor.cancelPlacement();
    const layout = scene.serialize();
    this.store.saveLayout(layout);
    this.room = normalizeRoom({ ...this.room, appearance: layout.appearance, objects: layout.objects });
    this.room.customized = true;
    this._leaveEditMode();
    this._syncVisitorCounts(scene);
    return true;
  }

  async cancelEdits() {
    const scene = this.manager?.current;
    if (!scene?.editing) return false;
    const snapshot = this._editSnapshot;
    this._leaveEditMode();
    if (snapshot) await this._runBusy(() => scene.applyLayout(snapshot));
    this._syncVisitorCounts(scene);
    return true;
  }

  async _runBusy(task) {
    this._editBusy = true;
    this.editorPanel?.setBusy(true);
    try {
      await task();
    } finally {
      this._editBusy = false;
      this.editorPanel?.setBusy(false);
    }
  }

  _leaveEditMode() {
    if (!this.editing) return;
    this.manager?.current?.exitEditMode();
    this.editing = false;
    this._editSnapshot = null;
    document.body.classList.remove('is-editing');
    this.editorPanel?.hide();
    this.editButton.focus?.();
  }

  _sit(objectId) {
    if (this.manager?.current?.sitOn(objectId)) this.standButton.hidden = false;
  }

  _stand() {
    this.manager?.current?.resetView();
    this.standButton.hidden = true;
  }

  _syncMusic(state) {
    const scene = this.manager?.current;
    if (this._musicSource && this._musicSource !== state.sourceId) scene?.runAction(this._musicSource, 'setPlaying', false);
    if (state.sourceId) scene?.runAction(state.sourceId, 'setPlaying', state.playing);
    this._musicSource = state.playing ? state.sourceId : null;
  }

  /** Shows notes and gifts left from this browser on the noticeboard and gift table. */
  _syncVisitorCounts(scene) {
    for (const object of this.room.objects) {
      const type = this.catalog.get(object.catalogId)?.interaction;
      if (type === 'noticeboard') scene.runAction(object.id, 'setCount', noteCount(this.interactionContext, object.customData));
      if (type === 'gifts') scene.runAction(object.id, 'setCount', giftCount(this.interactionContext, object.customData));
    }
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
    document.title = `${room.name} · ${document.title.split(' · ').pop()}`;
    const { online, status } = room.owner;
    const dot = document.createElement('span');
    dot.className = `status-dot${online ? ' is-online' : ''}`;
    dot.setAttribute('aria-hidden', 'true');
    const label = [online ? 'Online' : 'Offline', status].filter(Boolean).join(' · ');
    this.nameplateStatus.replaceChildren(dot, document.createTextNode(label));
    this.nameplateStatus.hidden = !room.owner.username;
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
    floorPoint: (x, z) => page.manager?.current?.worldToClient(x, 0, z) ?? null,
    layout: () => page.manager?.current?.serialize() ?? null,
    enterEdit: () => page.enterEditMode(),
    editorSelect: (objectId) => page.manager?.current?.editor?.select(objectId) ?? false,
    destroy: () => page.destroy(),
    remount: () => page.remount(),
  };
}

page.mount();
