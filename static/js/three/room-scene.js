import * as THREE from 'three';
import { AssetLoader } from './asset-loader.js';
import { CameraController } from './camera-controller.js';
import { normalizeRoom } from './catalog.js';
import { EditorController } from './editor-controller.js';
import { InteractionManager } from './interaction-manager.js';
import { ObjectManager } from './object-manager.js';
import { buildRoomShell } from './props/architecture.js';
import { PropKit } from './props/kit.js';
import { CAMERA_SETTINGS, ROOM_DIMENSIONS, resolveAppearance } from './room-config.js';
import { worldToClient } from './screen-point.js';

// Seated eye position and look-at point, in the seat's local space (front faces +z).
const SEAT_EYE = [0, 1.15, 0.1];
const SEAT_LOOK_AT = [0, 0.7, 2.3];

/**
 * Renders one room from a normalized room config and a catalogue.
 * Knows nothing about pages, routes, users, or the database. Interactions are
 * reported through callbacks, and `canInteract(permission)` decides which objects
 * respond to the current viewer.
 */
export class RoomScene {
  constructor({
    room,
    catalog,
    modelsUrl,
    onInteract,
    onHoverChange,
    canInteract = () => true,
    dimensions = ROOM_DIMENSIONS,
    camera = CAMERA_SETTINGS,
  }) {
    const appearance = resolveAppearance(room.appearance);
    this.room = room;
    this.catalog = catalog;
    this.modelsUrl = modelsUrl;
    this.onInteract = onInteract;
    this.onHoverChange = onHoverChange;
    this.canInteract = canInteract;
    this.appearance = appearance.choice;
    this.palette = appearance.palette;
    this.lighting = appearance.lighting;
    this.dimensions = dimensions;
    this.cameraSettings = camera;

    this.scene = new THREE.Scene();
    this.scene.name = 'room';
    this.camera = new THREE.PerspectiveCamera(camera.fov, 1, camera.near, camera.far);
    this.controller = null;
    this.kit = null;
    this.loader = null;
    this.objects = null;
    this.interactions = null;
    this.engine = null;
    this.editor = null;
    this.shell = null;
    this.seatedOn = null;
    this._dirty = false;
  }

  async load(engine, { onProgress } = {}) {
    this.engine = engine;
    this.kit = new PropKit({ palette: this.palette, quality: engine.quality });
    this.loader = new AssetLoader(this.modelsUrl);
    this.scene.background = new THREE.Color(this.palette.background);
    engine.setToneMappingExposure(this.lighting.toneMappingExposure);

    onProgress?.(0.05);
    this.shell = buildRoomShell(this.kit, this.dimensions);
    this.scene.add(this.shell);
    this._addLighting(engine.quality);

    this.objects = new ObjectManager({
      scene: this.scene,
      kit: this.kit,
      catalog: this.catalog,
      loader: this.loader,
      theme: this.palette,
      room: this.room,
    });
    await this.objects.populate(this.room.objects, (fraction) => onProgress?.(0.1 + fraction * 0.85));
    if (this.loader.disposed) return;

    this.controller = new CameraController(this.camera, engine.canvas, this.cameraSettings, this._cameraBounds());
    this.interactions = new InteractionManager({
      camera: this.camera,
      canvas: engine.canvas,
      scene: this.scene,
      resolve: (object3d) => {
        const record = this.objects.resolve(object3d);
        return record?.interaction && this.canInteract(record.permission) ? record : null;
      },
      onHoverChange: (record, point) => this.onHoverChange?.(record ? describe(record) : null, point),
      onSelect: (record) => this.onInteract?.(describe(record)),
    });
    engine.renderer.compile(this.scene, this.camera);
    onProgress?.(1);
  }

  update(dt) {
    let changed = this.controller.update(dt);
    if (this.interactions.update()) changed = true;
    if (this.editor?.update()) changed = true;
    for (const updater of this.kit.updaters) {
      if (updater(dt)) changed = true;
    }
    if (this._dirty) {
      this._dirty = false;
      changed = true;
    }
    return changed;
  }

  resize(width, height) {
    const aspect = width / height;
    const { fov, minHorizontalFov, maxFov } = this.cameraSettings;
    const halfH = THREE.MathUtils.degToRad(minHorizontalFov) / 2;
    const neededFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect));
    this.camera.fov = THREE.MathUtils.clamp(neededFov, fov, maxFov);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  resetView() {
    this.seatedOn = null;
    this.controller?.resetView();
  }

  /** Calls an action exposed by an object's builder (see props/interactive.js). */
  runAction(objectId, action, ...args) {
    const record = this.objects?.get(objectId);
    const fn = record?.controls?.actions?.[action];
    if (!fn) return undefined;
    const result = this.interactions ? this.interactions.withoutHighlight(() => fn(...args)) : fn(...args);
    this._dirty = true;
    return result;
  }

  /** Moves the camera to a seated view on a couch or chair, looking the way it faces. */
  sitOn(objectId) {
    const record = this.objects?.get(objectId);
    if (!record || !this.controller) return false;
    record.root.updateMatrixWorld(true);
    const position = record.root.localToWorld(new THREE.Vector3(...SEAT_EYE));
    const target = record.root.localToWorld(new THREE.Vector3(...SEAT_LOOK_AT));
    this.seatedOn = objectId;
    this.controller.flyTo({ position, target });
    return true;
  }

  /** Toggles a lamp and returns its new state, or null if the object has no light. */
  toggleLamp(objectId) {
    const record = this.objects?.get(objectId);
    if (!record?.light) return null;
    const on = this.interactions.withoutHighlight(() => this.objects.setLamp(objectId, !record.lampOn));
    this._dirty = true;
    return on;
  }

  // ---- Customization ----

  get editing() {
    return Boolean(this.editor);
  }

  /** Enters edit mode. Object interactions are paused until exitEditMode(). */
  enterEditMode({ onChange } = {}) {
    if (this.editor || !this.controller) return null;
    this.seatedOn = null;
    this.interactions.setEnabled(false);
    this.editor = new EditorController({ scene: this, onChange });
    this.editor.start();
    return this.editor;
  }

  exitEditMode() {
    if (!this.editor) return;
    this.editor.stop();
    this.editor = null;
    this.interactions.setEnabled(true);
    this._dirty = true;
  }

  /** Changes wallpaper, floor, and lighting in place. Throws on unknown presets. */
  setAppearance(appearance) {
    const resolved = resolveAppearance({ ...this.appearance, ...appearance });
    this.appearance = resolved.choice;
    this.palette = resolved.palette;
    this.lighting = resolved.lighting;
    this.objects.theme = resolved.palette;
    this.kit.setPalette(resolved.palette);
    this.shell.userData.refreshFloor();

    const { hemisphere, sun } = resolved.lighting;
    this.scene.background.set(resolved.palette.background);
    this.hemisphere.color.set(hemisphere.sky);
    this.hemisphere.groundColor.set(hemisphere.ground);
    this.hemisphere.intensity = hemisphere.intensity;
    this.sun.color.set(sun.color);
    this.sun.intensity = sun.intensity;
    this.engine.setToneMappingExposure(resolved.lighting.toneMappingExposure);
    for (const record of this.objects.records.values()) {
      record.controls?.actions?.setScene?.(resolved.choice.lighting);
    }
    this.interactions.resetHighlights();
    this.engine.requestShadowUpdate();
    this._dirty = true;
    return { ...this.appearance };
  }

  async addObject(object) {
    const record = await this.objects.addObject(object);
    this.engine?.requestShadowUpdate();
    this._dirty = true;
    return record;
  }

  removeObject(objectId) {
    const removed = this.objects.removeObject(objectId);
    if (removed) {
      this.engine?.requestShadowUpdate();
      this._dirty = true;
    }
    return removed;
  }

  /** The room's current appearance and layout, in the room JSON format. */
  serialize() {
    return { appearance: { ...this.appearance }, objects: this.objects.serialize() };
  }

  /**
   * Makes the scene match a serialized layout (used to cancel edits or start over).
   * Objects are moved in place where possible and only rebuilt when they changed type.
   */
  async applyLayout(layout) {
    const { appearance } = layout;
    const { objects } = normalizeRoom({ objects: layout.objects });
    this.setAppearance(appearance);
    const wanted = new Map(objects.map((object) => [object.id, object]));
    for (const id of [...this.objects.records.keys()]) {
      const object = wanted.get(id);
      if (!object || object.catalogId !== this.objects.get(id).catalogId) this.objects.removeObject(id);
    }
    await Promise.all(
      objects.map((object) => {
        const record = this.objects.get(object.id);
        if (!record) return this.objects.addObject(object);
        record.root.position.set(object.position.x, object.position.y, object.position.z);
        record.root.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
        record.root.scale.set(object.scale.x, object.scale.y, object.scale.z);
        return null;
      }),
    );
    this.objects.setOrder(objects.map((object) => object.id));
    this.engine?.requestShadowUpdate();
    this._dirty = true;
  }

  /** Client-space point where the object can be clicked, or null if it isn't visible. */
  getObjectScreenPoint(objectId) {
    const record = this.objects?.get(objectId);
    if (!record || !this.interactions) return null;
    this.scene.updateMatrixWorld(true);
    return this.editor ? this.editor.findScreenPoint(objectId) : this.interactions.findScreenPoint(record);
  }

  /** Client-space point of a world position, or null if it is behind the camera. */
  worldToClient(x, y, z) {
    if (!this.engine) return null;
    this.camera.updateMatrixWorld(true);
    return worldToClient(this.camera, this.engine.canvas, new THREE.Vector3(x, y, z));
  }

  /** World-space bounding boxes of every room object, keyed by object id. */
  getObjectBounds() {
    const bounds = {};
    if (!this.objects) return bounds;
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const record of this.objects.records.values()) {
      box.setFromObject(record.root);
      bounds[record.id] = { min: box.min.toArray(), max: box.max.toArray() };
    }
    return bounds;
  }

  getDebugInfo() {
    let meshes = 0;
    let lights = 0;
    this.scene.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (object.isLight) lights += 1;
    });
    return {
      roomId: this.room.roomId,
      appearance: { ...this.appearance },
      meshes,
      lights,
      hovered: this.interactions?.hovered?.id ?? null,
      editor: this.editor?.getState() ?? null,
      seatedOn: this.seatedOn,
      assets: this.loader?.getStats() ?? null,
      ...(this.objects?.getDebugInfo() ?? {}),
      camera: this.controller?.getDebugInfo() ?? null,
    };
  }

  dispose() {
    this.editor?.stop();
    this.editor = null;
    this.interactions?.dispose();
    this.interactions = null;
    this.controller?.dispose();
    this.controller = null;
    this.scene.traverse((object) => {
      if (object.isLight) object.dispose?.();
    });
    this.scene.clear();
    this.loader?.dispose();
    this.kit?.dispose();
    this.loader = null;
    this.kit = null;
    this.objects = null;
    this.engine = null;
  }

  _addLighting(quality) {
    const { hemisphere, sun } = this.lighting;
    this.hemisphere = new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity);
    this.scene.add(this.hemisphere);

    const sunLight = new THREE.DirectionalLight(sun.color, sun.intensity);
    sunLight.name = 'sun';
    sunLight.position.set(...sun.position);
    sunLight.target.position.set(...sun.target);
    if (quality.shadows) {
      sunLight.castShadow = true;
      sunLight.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      const extent = sun.shadowExtent;
      Object.assign(sunLight.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 25 });
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      sunLight.shadow.radius = 4;
    }
    this.scene.add(sunLight, sunLight.target);
    this.sun = sunLight;
  }

  _cameraBounds() {
    const { width, height, depth } = this.dimensions;
    const m = this.cameraSettings.boundsMargin;
    return new THREE.Box3(
      new THREE.Vector3(-width / 2 + m, m, -depth / 2 + m),
      new THREE.Vector3(width / 2 - m, height - m, depth / 2 - m),
    );
  }
}

function describe(record) {
  return {
    objectId: record.id,
    catalogId: record.catalogId,
    name: record.data.label ?? record.data.caption ?? record.name,
    type: record.interaction,
    data: record.data,
    lampOn: record.light ? record.lampOn : undefined,
  };
}
