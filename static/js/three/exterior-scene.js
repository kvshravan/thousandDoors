import * as THREE from 'three';
import { CameraController } from './camera-controller.js';
import { InteractionManager } from './interaction-manager.js';
import { itemColorValue } from './object-manager.js';
import { buildHouse, buildSurroundings, OUTDOOR_LIGHT } from './props/outdoors.js';
import { PropKit } from './props/kit.js';
import { resolveAppearance } from './room-config.js';
import { worldToClient } from './screen-point.js';

const DOOR_ID = 'front-door';
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * The outside of a room's house, in the room's landscape and time of day. The only
 * interactive thing is the front door (type "enter"), which leads back inside.
 * Same view interface as RoomScene: load, update, resize, dispose.
 */
export class ExteriorScene {
  constructor({ room, catalog, onInteract, onHoverChange }) {
    const appearance = resolveAppearance(room.appearance);
    this.room = room;
    this.catalog = catalog;
    this.onInteract = onInteract;
    this.onHoverChange = onHoverChange;
    this.landscape = appearance.choice.landscape;
    this.time = appearance.choice.lighting;
    this.palette = appearance.palette;

    this.scene = new THREE.Scene();
    this.scene.name = 'exterior';
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.kit = null;
    this.controller = null;
    this.interactions = null;
    this.engine = null;
    this.door = null;
    this.seatedOn = null;
    this.editing = false;
    this._dirty = false;
  }

  async load(engine, { onProgress } = {}) {
    this.engine = engine;
    this.kit = new PropKit({ palette: this.palette, quality: engine.quality });
    const light = OUTDOOR_LIGHT[this.time] ?? OUTDOOR_LIGHT.day;
    this.scene.background = new THREE.Color(light.sky);
    this.scene.fog = new THREE.Fog(light.sky, 35, 95);
    engine.setToneMappingExposure(light.exposure);
    this._addLighting(light, engine.quality);
    onProgress?.(0.2);

    this.scene.add(buildSurroundings(this.kit, this.landscape, { time: this.time, reducedMotion: prefersReducedMotion() }));
    // The front door outside matches the door inside, including the owner's colour.
    const doorObject = this.room.objects.find((object) => this.catalog?.get(object.catalogId)?.builder === 'door');
    const doorColor = itemColorValue(doorObject?.customData?.color) ?? 'terracotta';
    const { house, door, focusY } = buildHouse(this.kit, this.landscape, { time: this.time, room: this.room, doorColor });
    this.scene.add(house);
    this.door = { id: DOOR_ID, root: door, interaction: 'enter', name: 'Front door' };
    onProgress?.(0.8);

    const height = this.landscape === 'city' ? 14 : 9;
    this.cameraSettings = {
      fov: 50,
      minHorizontalFov: 60,
      maxFov: 72,
      target: [0, focusY, 0],
      initialPosition: [6.5, focusY + 2.2, 12.5],
      minDistance: 7,
      maxDistance: 22,
      minPolarAngle: 0.7,
      maxPolarAngle: 1.45,
      dampingFactor: 0.08,
      rotateSpeed: 0.6,
      zoomSpeed: 0.8,
    };
    const bounds = new THREE.Box3(new THREE.Vector3(-40, 0.5, -40), new THREE.Vector3(40, height + 12, 40));
    this.controller = new CameraController(this.camera, engine.canvas, this.cameraSettings, bounds);
    this.interactions = new InteractionManager({
      camera: this.camera,
      canvas: engine.canvas,
      scene: this.scene,
      resolve: (object3d) => (this._isDoor(object3d) ? this.door : null),
      onHoverChange: (record, point) => this.onHoverChange?.(record ? describe(record) : null, point),
      onSelect: (record) => this.onInteract?.(describe(record)),
    });
    engine.renderer.compile(this.scene, this.camera);
    engine.requestShadowUpdate();
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
    const { fov, minHorizontalFov, maxFov } = this.cameraSettings ?? { fov: 50, minHorizontalFov: 60, maxFov: 72 };
    const halfH = THREE.MathUtils.degToRad(minHorizontalFov) / 2;
    const neededFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfH) / aspect));
    this.camera.fov = THREE.MathUtils.clamp(neededFov, fov, maxFov);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  resetView() {
    this.controller?.resetView();
  }

  orbitCamera(dAzimuth, dPolar) {
    this.controller?.orbitBy(dAzimuth, dPolar);
  }

  zoomCamera(factor) {
    this.controller?.zoomBy(factor);
  }

  listInteractive() {
    return this.door ? [describe(this.door)] : [];
  }

  runAction() {
    return undefined;
  }

  getObjectScreenPoint(objectId) {
    if (objectId !== DOOR_ID || !this.interactions) return null;
    this.scene.updateMatrixWorld(true);
    return this.interactions.findScreenPoint(this.door);
  }

  worldToClient(x, y, z) {
    if (!this.engine) return null;
    this.camera.updateMatrixWorld(true);
    return worldToClient(this.camera, this.engine.canvas, new THREE.Vector3(x, y, z));
  }

  getObjectBounds() {
    if (!this.door) return {};
    const box = new THREE.Box3().setFromObject(this.door.root);
    return { [DOOR_ID]: { min: box.min.toArray(), max: box.max.toArray() } };
  }

  getDebugInfo() {
    let meshes = 0;
    this.scene.traverse((object) => {
      if (object.isMesh) meshes += 1;
    });
    return {
      kind: 'exterior',
      roomId: this.room.roomId,
      landscape: this.landscape,
      time: this.time,
      meshes,
      hovered: this.interactions?.hovered?.id ?? null,
      camera: this.controller?.getDebugInfo() ?? null,
      editor: null,
      seatedOn: null,
    };
  }

  dispose() {
    this.interactions?.dispose();
    this.interactions = null;
    this.controller?.dispose();
    this.controller = null;
    this.scene.traverse((object) => {
      if (object.isLight) object.dispose?.();
      object.userData.ownedMaterial?.dispose();
    });
    this.scene.clear();
    this.kit?.dispose();
    this.kit = null;
    this.engine = null;
  }

  _isDoor(object3d) {
    for (let current = object3d; current; current = current.parent) {
      if (current === this.door?.root) return true;
    }
    return false;
  }

  _addLighting(light, quality) {
    const [sky, ground, intensity] = light.hemisphere;
    this.scene.add(new THREE.HemisphereLight(sky, ground, intensity));
    const [color, strength] = light.sun;
    const sun = new THREE.DirectionalLight(color, strength);
    sun.position.set(14, 22, 12);
    if (quality.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 70 });
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.03;
    }
    this.scene.add(sun, sun.target);
  }
}

function describe(record) {
  return { objectId: record.id, catalogId: null, name: record.name, type: record.interaction, data: {} };
}
