import { canInteract, normalizeRelationship } from '../permissions.js';
import { api, errorMessage } from '../auth.js';
import { Catalog, fetchJson, normalizeRoom } from '../three/catalog.js';
import { Engine } from '../three/engine.js';
import { ExteriorScene } from '../three/exterior-scene.js';
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
import { thingsPanel } from '../ui/panels.js';
import { RoomStore } from '../ui/room-store.js';
import { VisitorBook } from '../ui/visitor-book.js';
import { EditorPanel } from '../ui/editor-panel.js';
import { DEMO_PHOTOS, ImageStore, isPhotoRef } from '../ui/image-store.js';
import { resolveAppearance } from '../three/room-config.js';

const HINT_FADE_DELAY_MS = 2500;
const TOOLTIP_OFFSET_PX = 16;
// Verbs for things outside the room, which aren't room interactions.
const VERBS = { ...INTERACTION_VERBS, enter: 'Go inside' };

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
    this.thingsButton = root.querySelector('#things-list');
    this.announcer = root.querySelector('#room-announcer');
    this.editButton = root.querySelector('#edit-room');
    this.insideButton = root.querySelector('#go-inside');
    this.editorRoot = root.querySelector('#editor');
    this.editorPanel = null;
    this.editing = false;
    this.outside = false;
    this.images = new ImageStore();
    this._editSnapshot = null;
    this._editBusy = false;
    this.leaveUrl = root.querySelector('[data-testid="back-link"]').getAttribute('href');
    this._continueArrival();

    const { catalogUrl, roomUrl, modelsUrl } = this.stage.dataset;
    this.urls = { catalogUrl, roomUrl, modelsUrl };
    // The server says who you are to the room's owner. In development, ?as=stranger|
    // follower|friend|owner previews other relationships (and edits demo rooms in
    // this browser only).
    const debug = document.documentElement.dataset.debug === '1';
    this.debug = debug;
    this.previewAs = debug ? new URLSearchParams(window.location.search).get('as') : null;
    this.viewer = { relationship: 'stranger', signedIn: false };
    // 'account' saves edits to the server; 'browser' keeps a local preview; null can't edit.
    this.saveMode = null;

    this.state = 'idle';
    this.engine = null;
    this.manager = null;
    this.room = null;
    this.catalog = null;
    this.store = null;
    this.book = null;
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
        return page.book;
      },
      getScene: () => this.manager?.current ?? null,
      getRoom: () => this.room,
      images: this.images,
      sit: (objectId) => this._sit(objectId),
      stepOutside: () => this.stepOutside(),
      announce: (message) => this._announce(message),
    };
    this.registry = createInteractionRegistry(this.interactionContext);

    this._onReset = () => this._stand();
    this._onRetry = () => this.remount();
    this._onFirstInteraction = () => this._fadeHint();
    this.resetButton.addEventListener('click', this._onReset);
    this.retryButton.addEventListener('click', this._onRetry);
    this.standButton.addEventListener('click', this._onReset);
    this.editButton.addEventListener('click', () => this.enterEditMode());
    this.insideButton.addEventListener('click', () => this.goInside());
    this.thingsButton.addEventListener('click', () => this.openThingsList());
    this._onCanvasKey = (event) => this._handleCanvasKey(event);

    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.hint.textContent = coarse
      ? 'Drag to look around · Pinch to zoom · Tap things'
      : 'Drag to look around · Scroll to zoom · Click things';
  }

  /** Coming through a door from the hallway: start in its warm light, then fade in. */
  _continueArrival() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('from') !== 'hallway') return;
    this.loading.classList.add('is-arrival');
    this.loadingText.textContent = 'Stepping inside…';
    // A reload shouldn't replay the arrival.
    params.delete('from');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
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
      const [catalogData, roomResult] = await Promise.all([
        fetchJson(this.urls.catalogUrl, 'the item catalogue'),
        api(this.urls.roomUrl),
      ]);
      if (!roomResult.ok) throw new Error(`Could not load the room (HTTP ${roomResult.status}).`);
      const { room: roomData, viewer, visitors: visitorData } = roomResult.data;
      const catalog = new Catalog(catalogData);
      this.catalog = catalog;
      this.viewer = {
        relationship: this.previewAs ? normalizeRelationship(this.previewAs) : viewer.relationship,
        signedIn: viewer.signedIn,
      };
      this.saveMode = viewer.canEdit ? 'account' : this.viewer.relationship === 'owner' ? 'browser' : null;
      this.images.account = this.saveMode === 'account';
      this.originalRoom = normalizeRoom(roomData);
      this.store = new RoomStore(this.originalRoom.roomId);
      // Browser-saved previews of demo rooms (development only) show to anyone in this
      // browser; account rooms always show what's saved on the server.
      const preview = this.debug && this.saveMode !== 'account';
      this.room = preview ? this._withSavedLayout(roomData) : normalizeRoom(roomData);
      this._showNameplate(this.room);
      this.book = new VisitorBook(this.originalRoom.roomId, visitorData);
      const visitors = visitorData ? Promise.resolve() : this.book.load();

      const quality = detectQuality(new URLSearchParams(window.location.search).get('quality'));
      this.engine = new Engine(this.stage, { quality, onContextLost: () => this._fail('lost') });
      this._setUpCanvas(this.engine.canvas);
      this.manager = new SceneManager(this.engine);
      const scene = await this.manager.show(() => this._createRoomScene(), {
        onProgress: (value) => this._setProgress(value),
      });
      if (!scene) return;
      await Promise.all([this.engine.waitForFrame(), visitors]);
      if (this.manager?.current !== scene) return;
      this._syncVisitorCounts(scene);
      this._setState('ready');
      this.editButton.hidden = !this.saveMode;
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
    this.insideButton.hidden = true;
    this.outside = false;
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

  _createRoomScene() {
    return new RoomScene({
      room: this.room,
      catalog: this.catalog,
      modelsUrl: this.urls.modelsUrl,
      images: this.images,
      onInteract: (event) => this._interact(event),
      onHoverChange: (target, point) => this._showTooltip(target, point),
      canInteract: (level) => canInteract(level ?? 'everyone', this.viewer.relationship),
    });
  }

  /** Leaves through the front door to see the house in its landscape. */
  async stepOutside() {
    if (this.state !== 'ready' || this.outside || this.editing) return false;
    const ok = await this._switchScene(
      () =>
        new ExteriorScene({
          room: this.room,
          catalog: this.catalog,
          onInteract: (event) => this._interact(event),
          onHoverChange: (target, point) => this._showTooltip(target, point),
        }),
      true,
    );
    if (ok) {
      const owner = this.room.owner.displayName || this.room.owner.username;
      this._announce(`You're outside ${owner ? `${owner}'s` : 'the'} house. Choose Go inside to return.`);
    }
    return ok;
  }

  async goInside() {
    if (this.state !== 'ready' || !this.outside) return false;
    const ok = await this._switchScene(() => this._createRoomScene(), false);
    if (ok) {
      this._syncVisitorCounts(this.manager.current);
      this._announce('You go back inside.');
    }
    return ok;
  }

  async _switchScene(create, outside) {
    this.photoViewer.close();
    this.panel.close();
    this.music.stop();
    this._musicSource = null;
    this._showTooltip(null);
    this.standButton.hidden = true;
    this._setState('loading');
    this.loading.hidden = false;
    this.loading.classList.remove('is-hidden');
    this.loadingText.textContent = outside ? 'Stepping outside…' : 'Coming back in…';
    try {
      const scene = await this.manager.show(create);
      if (!scene) return false;
      await this.engine.waitForFrame();
      if (this.manager?.current !== scene) return false;
    } catch (error) {
      console.error('[room] Could not change scene.', error);
      this._fail('load');
      return false;
    }
    this.outside = outside;
    this.insideButton.hidden = !outside;
    this.editButton.hidden = outside || !this.saveMode;
    this.engine.canvas.setAttribute('aria-label', outside ? `Outside ${this.room.name}, 3D view` : `${this.room.name}, 3D view`);
    this.loading.classList.add('is-hidden');
    this._setState('ready');
    return true;
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
      outside: this.outside,
      saveMode: this.saveMode,
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
  /** Colour statistics of the rendered canvas, or of a square around a client point. */
  samplePixels(region = null) {
    const { engine } = this;
    const view = this.manager?.current;
    if (!engine || !view) return null;
    engine.renderer.render(view.scene, view.camera);
    const size = 64;
    const probe = document.createElement('canvas');
    probe.width = size;
    probe.height = size;
    const ctx = probe.getContext('2d', { willReadFrequently: true });
    if (region) {
      const rect = engine.canvas.getBoundingClientRect();
      const scale = engine.canvas.width / rect.width;
      const half = (region.size ?? 24) / 2;
      const sx = (region.x - rect.left - half) * scale;
      const sy = (region.y - rect.top - half) * scale;
      ctx.drawImage(engine.canvas, sx, sy, half * 2 * scale, half * 2 * scale, 0, 0, size, size);
    } else {
      ctx.drawImage(engine.canvas, 0, 0, size, size);
    }
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
    if (this.editing || this.outside || this.state !== 'ready' || !scene || !this.saveMode) return false;
    if (!this.editorPanel) {
      this.editorPanel = new EditorPanel(this.editorRoot, {
        catalog: this.catalog,
        modelsUrl: this.urls.modelsUrl,
        onAdd: (catalogId) => {
          // Focus the 3D view so the arrow keys and Enter go to the item being placed.
          this.manager?.current?.editor?.beginPlacement(catalogId).then((id) => {
            if (id) this.engine?.canvas.focus();
          });
        },
        onAppearance: (change) => this._changeAppearance(change),
        onCommand: (command, value) => this._editorCommand(command, value),
        onUpload: (file) => this._uploadPhoto(file),
      });
    }
    this._refreshPhotoLibrary();
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

  async _editorCommand(command, value) {
    const editor = this.manager?.current?.editor;
    // Wait for a recolour to finish rebuilding, so saving never misses the object.
    if (!editor || this._editBusy || editor.busy) return;
    switch (command) {
      case 'color':
        await editor.recolorSelected(value || null);
        break;
      case 'size':
        editor.resizeSelected(value);
        break;
      case 'light-on':
        editor.setLightSelected({ on: value === 'true' });
        break;
      case 'light-color':
        editor.setLightSelected({ color: value });
        break;
      case 'light-effect':
        editor.setLightSelected({ effect: value });
        break;
      case 'light-brightness':
        editor.setLightSelected({ brightness: Number(value) });
        break;
      case 'text':
        await editor.setTextSelected(value);
        break;
      case 'photo-use':
        if (isPhotoRef(value)) await editor.usePhotoSelected(value);
        break;
      case 'photo-remove':
        await editor.removePhotoSelected(Number(value));
        break;
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
      case 'nudge': {
        const [dx, dy] = String(value).split(',').map(Number);
        editor.nudgeOnScreen(dx, dy);
        break;
      }
      case 'deselect':
        if (editor.pendingId) editor.commitPlacement();
        else editor.deselect();
        break;
      case 'save':
        await this.saveEdits();
        break;
      case 'photos-migrate':
        await this._movePhotosToAccount();
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

  async _refreshPhotoLibrary() {
    try {
      const uploads = await this.images.list();
      this.editorPanel?.setPhotoLibrary([...uploads, ...DEMO_PHOTOS], { account: this.saveMode === 'account' });
    } catch (error) {
      console.warn('[room] Could not read uploaded photos.', error);
    }
  }

  /**
   * Uploads photos kept only in this browser to the owner's account, and points every
   * frame and photo string in the room at the uploaded copies. Saving keeps the change.
   */
  async _movePhotosToAccount() {
    const scene = this.manager?.current;
    const editor = scene?.editor;
    if (!editor || this.saveMode !== 'account') return;
    editor._setMessage('Moving your photos…');
    let moved;
    try {
      moved = await this._runBusy(() => this.images.moveToAccount());
    } catch (error) {
      editor._setMessage(error.message);
      await this._refreshPhotoLibrary();
      return;
    }
    const swap = (ref) => moved.get(ref) ?? ref;
    for (const object of scene.serialize().objects) {
      const data = object.customData ?? {};
      const changes = {};
      if (moved.has(data.imageUrl)) changes.imageUrl = swap(data.imageUrl);
      if (Array.isArray(data.photos) && data.photos.some((ref) => moved.has(ref))) changes.photos = data.photos.map(swap);
      if (Object.keys(changes).length > 0) await scene.restyleObject(object.id, changes);
    }
    await this._refreshPhotoLibrary();
    editor._setMessage(`Moved ${moved.size} photo${moved.size === 1 ? '' : 's'} to your account. Save to keep the room using them.`);
  }

  /** Stores an uploaded photo and puts it on the selected frame or photo string. */
  async _uploadPhoto(file) {
    const editor = this.manager?.current?.editor;
    if (!editor) return;
    let ref;
    try {
      editor._setMessage('Adding your photo…');
      ref = await this.images.add(file);
    } catch (error) {
      editor._setMessage(error.message || 'That photo could not be added.');
      return;
    }
    await this._refreshPhotoLibrary();
    if (editor.selectedId) await editor.usePhotoSelected(ref);
  }

  async saveEdits() {
    const scene = this.manager?.current;
    if (!scene?.editing) return false;
    scene.editor.cancelPlacement();
    const layout = scene.serialize();
    if (this.saveMode === 'account') {
      scene.editor._setMessage('Saving…');
      const result = await this._runBusy(() =>
        api(`/api/rooms/${encodeURIComponent(this.room.roomId)}/layout`, { method: 'PUT', json: layout }),
      );
      if (!result.ok) {
        scene.editor._setMessage(errorMessage(result, "Your room couldn't be saved. Try again."));
        return false;
      }
    } else {
      this.store.saveLayout(layout);
    }
    this.room = normalizeRoom({ ...this.room, appearance: layout.appearance, objects: layout.objects });
    this.room.customized = true;
    this._leaveEditMode();
    this._syncVisitorCounts(scene);
    this._announce(this.saveMode === 'account' ? 'Your room is saved.' : 'Saved in this browser.');
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
      return await task();
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

  // ---- Keyboard and screen-reader access ----

  _setUpCanvas(canvas) {
    canvas.tabIndex = 0;
    // "application" lets screen readers pass arrow keys through to the camera.
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', '3D room');
    canvas.setAttribute('aria-label', `${this.room.name}, 3D view`);
    canvas.setAttribute('aria-describedby', 'room-keys-help');
    canvas.addEventListener('keydown', this._onCanvasKey);
  }

  _handleCanvasKey(event) {
    const scene = this.manager?.current;
    if (!scene || this.state !== 'ready' || event.altKey || event.ctrlKey || event.metaKey) return;
    // While editing with something selected, the arrow keys move the furniture instead.
    if (scene.editing && scene.editor?.selectedId) return;
    const STEP = Math.PI / 12;
    const actions = {
      ArrowLeft: () => scene.orbitCamera(-STEP, 0),
      ArrowRight: () => scene.orbitCamera(STEP, 0),
      ArrowUp: () => scene.orbitCamera(0, -STEP / 2),
      ArrowDown: () => scene.orbitCamera(0, STEP / 2),
      '+': () => scene.zoomCamera(0.85),
      '=': () => scene.zoomCamera(0.85),
      '-': () => scene.zoomCamera(1 / 0.85),
      _: () => scene.zoomCamera(1 / 0.85),
      Home: () => (scene.editing ? null : this._stand()),
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    if (scene.seatedOn) this.standButton.hidden = true;
    action();
    this._fadeHint();
  }

  openThingsList() {
    const scene = this.manager?.current;
    if (!scene || this.state !== 'ready' || this.editing) return false;
    this.panel.open(
      thingsPanel(scene.listInteractive(), VERBS, (item) => {
        this.panel.close();
        this._interact(item);
      }),
    );
    return true;
  }

  _announce(message) {
    // Clear first so repeating the same message is announced again.
    this.announcer.textContent = '';
    window.setTimeout(() => {
      this.announcer.textContent = message;
    }, 50);
  }

  _sit(objectId) {
    const scene = this.manager?.current;
    if (!scene?.sitOn(objectId)) return;
    this.standButton.hidden = false;
    const name = scene.objects.get(objectId)?.name.toLowerCase() ?? 'seat';
    this._announce(`You sit on the ${name}. Press Stand up or Home to get up.`);
  }

  _stand() {
    const wasSeated = Boolean(this.manager?.current?.seatedOn);
    this.manager?.current?.resetView();
    this.standButton.hidden = true;
    if (wasSeated) this._announce('You stand up.');
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
    if (event.type === 'enter') {
      this.goInside();
      return;
    }
    handleInteraction(this.registry, event);
  }

  _showTooltip(target, point) {
    if (!target || !point) {
      this.tooltip.hidden = true;
      return;
    }
    const verb = VERBS[target.type];
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
    samplePixels: (region) => page.samplePixels(region),
    pointFor: (objectId) => page.pointFor(objectId),
    bounds: () => page.manager?.current?.getObjectBounds() ?? {},
    floorPoint: (x, z) => page.manager?.current?.worldToClient(x, 0, z) ?? null,
    worldPoint: (x, y, z) => page.manager?.current?.worldToClient(x, y, z) ?? null,
    layout: () => page.manager?.current?.serialize?.() ?? null,
    enterEdit: () => page.enterEditMode(),
    editorSelect: (objectId) => page.manager?.current?.editor?.select(objectId) ?? false,
    stepOutside: () => page.stepOutside(),
    goInside: () => page.goInside(),
    // Adds a catalogue item in edit mode, then removes it again; resolves to its id or null.
    editorTryAdd: async (catalogId) => {
      const editor = page.manager?.current?.editor;
      const id = editor ? await editor.beginPlacement(catalogId) : null;
      const record = id ? page.manager.current.objects.get(id) : null;
      const result = record ? { id, placeholder: Boolean(record.placeholder) } : null;
      editor?.cancelPlacement();
      return result;
    },
    destroy: () => page.destroy(),
    remount: () => page.remount(),
  };
}

page.mount();
