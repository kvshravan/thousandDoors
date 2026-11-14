import * as THREE from 'three';
import { AssetLoader } from './asset-loader.js';
import { CameraController } from './camera-controller.js';
import { InteractionManager } from './interaction-manager.js';
import { ObjectManager } from './object-manager.js';
import { buildRoomShell } from './props/architecture.js';
import { PropKit } from './props/kit.js';
import { CAMERA_SETTINGS, LIGHTING, ROOM_DIMENSIONS, THEMES } from './room-config.js';

/**
 * Renders one room from a normalized room config and a catalogue.
 * Knows nothing about pages, routes, or the database; interactions are reported
 * through callbacks.
 */
export class RoomScene {
  constructor({
    room,
    catalog,
    modelsUrl,
    onInteract,
    onHoverChange,
    dimensions = ROOM_DIMENSIONS,
    camera = CAMERA_SETTINGS,
  }) {
    if (!THEMES[room.theme]) throw new Error(`Unknown room theme "${room.theme}".`);
    this.room = room;
    this.catalog = catalog;
    this.modelsUrl = modelsUrl;
    this.onInteract = onInteract;
    this.onHoverChange = onHoverChange;
    this.palette = THEMES[room.theme];
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
    this._dirty = false;
  }

  async load(engine, { onProgress } = {}) {
    this.engine = engine;
    this.kit = new PropKit({ palette: this.palette, quality: engine.quality });
    this.loader = new AssetLoader(this.modelsUrl);
    this.scene.background = new THREE.Color(this.palette.background);
    engine.setToneMappingExposure(LIGHTING.toneMappingExposure);

    onProgress?.(0.05);
    this.scene.add(buildRoomShell(this.kit, this.dimensions));
    this._addLighting(engine.quality);

    this.objects = new ObjectManager({
      scene: this.scene,
      kit: this.kit,
      catalog: this.catalog,
      loader: this.loader,
      theme: this.palette,
    });
    await this.objects.populate(this.room.objects, (fraction) => onProgress?.(0.1 + fraction * 0.85));
    if (this.loader.disposed) return;

    this.controller = new CameraController(this.camera, engine.canvas, this.cameraSettings, this._cameraBounds());
    this.interactions = new InteractionManager({
      camera: this.camera,
      canvas: engine.canvas,
      scene: this.scene,
      resolve: (object3d) => this.objects.resolve(object3d),
      onHoverChange: (record, point) => this.onHoverChange?.(record ? describe(record) : null, point),
      onSelect: (record) => this.onInteract?.(describe(record)),
    });
    engine.renderer.compile(this.scene, this.camera);
    onProgress?.(1);
  }

  update(dt) {
    let changed = this.controller.update(dt);
    if (this.interactions.update()) changed = true;
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
    this.controller?.resetView();
  }

  /** Toggles a lamp and returns its new state, or null if the object has no light. */
  toggleLamp(objectId) {
    const record = this.objects?.get(objectId);
    if (!record?.light) return null;
    const on = this.interactions.withoutHighlight(() => this.objects.setLamp(objectId, !record.lampOn));
    this._dirty = true;
    return on;
  }

  /** Client-space point where the object can be clicked, or null if it isn't visible. */
  getObjectScreenPoint(objectId) {
    const record = this.objects?.get(objectId);
    if (!record || !this.interactions) return null;
    this.scene.updateMatrixWorld(true);
    return this.interactions.findScreenPoint(record);
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
      theme: this.room.theme,
      roomId: this.room.roomId,
      meshes,
      lights,
      hovered: this.interactions?.hovered?.id ?? null,
      assets: this.loader?.getStats() ?? null,
      ...(this.objects?.getDebugInfo() ?? {}),
      camera: this.controller?.getDebugInfo() ?? null,
    };
  }

  dispose() {
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
    const { hemisphere, sun } = LIGHTING;
    this.scene.add(new THREE.HemisphereLight(hemisphere.sky, hemisphere.ground, hemisphere.intensity));

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
