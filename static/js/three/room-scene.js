import * as THREE from 'three';
import { CameraController } from './camera-controller.js';
import { buildRoomShell } from './props/architecture.js';
import { PROP_BUILDERS } from './props/index.js';
import { PropKit } from './props/kit.js';
import { CAMERA_SETTINGS, LIGHTING, ROOM_DIMENSIONS, THEMES } from './room-config.js';

/**
 * Renders one room from a configuration: { theme, layout }.
 * Knows nothing about pages, routes, or the database.
 */
export class RoomScene {
  constructor({ theme = 'cozy', layout = [], dimensions = ROOM_DIMENSIONS, camera = CAMERA_SETTINGS } = {}) {
    if (!THEMES[theme]) throw new Error(`Unknown room theme "${theme}".`);
    this.themeName = theme;
    this.palette = THEMES[theme];
    this.layout = layout;
    this.dimensions = dimensions;
    this.cameraSettings = camera;

    this.scene = new THREE.Scene();
    this.scene.name = 'room';
    this.camera = new THREE.PerspectiveCamera(camera.fov, 1, camera.near, camera.far);
    this.controller = null;
    this.kit = null;
    this.engine = null;
    this.skippedProps = [];
  }

  async load(engine, { onProgress } = {}) {
    this.engine = engine;
    this.kit = new PropKit({ palette: this.palette, quality: engine.quality });
    this.scene.background = new THREE.Color(this.palette.background);
    engine.setToneMappingExposure(LIGHTING.toneMappingExposure);

    onProgress?.(0.1);
    this.scene.add(buildRoomShell(this.kit, this.dimensions));
    this._addLighting(engine.quality);
    onProgress?.(0.3);

    const total = this.layout.length || 1;
    for (const [index, item] of this.layout.entries()) {
      this._placeProp(item);
      if (index % 5 === 4) {
        onProgress?.(0.3 + (0.6 * (index + 1)) / total);
        await nextFrame();
      }
    }

    this.controller = new CameraController(this.camera, engine.canvas, this.cameraSettings, this._cameraBounds());
    engine.renderer.compile(this.scene, this.camera);
    onProgress?.(1);
  }

  update(dt) {
    let changed = this.controller.update(dt);
    for (const updater of this.kit.updaters) {
      if (updater(dt)) changed = true;
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

  getDebugInfo() {
    let meshes = 0;
    let lights = 0;
    this.scene.traverse((object) => {
      if (object.isMesh) meshes += 1;
      if (object.isLight) lights += 1;
    });
    return {
      theme: this.themeName,
      props: this.layout.length - this.skippedProps.length,
      skippedProps: [...this.skippedProps],
      meshes,
      lights,
      camera: this.controller?.getDebugInfo() ?? null,
    };
  }

  dispose() {
    this.controller?.dispose();
    this.controller = null;
    this.kit?.dispose();
    this.kit = null;
    this.scene.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.isLight) object.dispose?.();
    });
    this.scene.clear();
    this.engine = null;
  }

  _placeProp({ prop, position = [0, 0, 0], rotationY = 0, options = {} }) {
    const build = PROP_BUILDERS[prop];
    if (!build) {
      console.warn(`[room] Unknown prop "${prop}" skipped.`);
      this.skippedProps.push(prop);
      return;
    }
    const object = build(this.kit, options);
    object.position.set(...position);
    object.rotation.y = rotationY;
    this.scene.add(object);
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

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
