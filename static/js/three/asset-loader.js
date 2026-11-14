import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads GLB models and image textures once each and shares them between instances.
 * Models are normalized so their origin sits at floor level in the centre of their footprint.
 */
export class AssetLoader {
  constructor(modelsBaseUrl) {
    this.modelsBaseUrl = new URL(modelsBaseUrl.endsWith('/') ? modelsBaseUrl : `${modelsBaseUrl}/`, window.location.href);
    this._gltfLoader = new GLTFLoader();
    this._textureLoader = new THREE.TextureLoader();
    this._models = new Map();
    this._textures = new Map();
    this._templates = [];
    this._loadedTextures = [];
    this.failed = new Set();
    this.loadedModelPaths = new Set();
    this.disposed = false;
  }

  loadModel(path) {
    if (!this._models.has(path)) {
      const url = new URL(path, this.modelsBaseUrl).href;
      const promise = this._gltfLoader.loadAsync(url).then(
        (gltf) => {
          const template = normalizeModel(gltf.scene);
          if (this.disposed) {
            disposeTree(template);
            throw new Error('Asset loader was disposed.');
          }
          this._templates.push(template);
          this.loadedModelPaths.add(path);
          return template;
        },
        (error) => {
          this.failed.add(path);
          throw new Error(`Model "${path}" failed to load: ${error?.message ?? error}`);
        },
      );
      this._models.set(path, promise);
    }
    return this._models.get(path);
  }

  loadTexture(url) {
    if (!this._textures.has(url)) {
      const promise = this._textureLoader.loadAsync(url).then(
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          if (this.disposed) {
            texture.dispose();
            throw new Error('Asset loader was disposed.');
          }
          this._loadedTextures.push(texture);
          return texture;
        },
        (error) => {
          this.failed.add(url);
          throw new Error(`Image "${url}" failed to load: ${error?.message ?? error}`);
        },
      );
      this._textures.set(url, promise);
    }
    return this._textures.get(url);
  }

  getStats() {
    return {
      models: [...this.loadedModelPaths].sort(),
      textures: this._loadedTextures.length,
      failed: [...this.failed].sort(),
    };
  }

  dispose() {
    this.disposed = true;
    for (const template of this._templates) disposeTree(template);
    for (const texture of this._loadedTextures) texture.dispose();
    this._templates = [];
    this._loadedTextures = [];
    this._models.clear();
    this._textures.clear();
  }
}

function normalizeModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;

  const template = new THREE.Group();
  template.name = 'model-template';
  template.add(root);
  template.userData.size = box.getSize(new THREE.Vector3()).toArray();
  return template;
}

function disposeTree(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
}
