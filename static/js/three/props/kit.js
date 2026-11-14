import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Shared toolkit for building props. Caches geometries, materials, and textures
 * so identical parts reuse GPU resources, and disposes everything in one call.
 */
export class PropKit {
  constructor({ palette, quality }) {
    this.palette = palette;
    this.quality = quality;
    this._materials = new Map();
    this._geometries = new Map();
    this._textures = new Set();
    this.updaters = [];
  }

  /** Resolves a palette key ("woodMid") or passes a raw colour through. */
  color(value) {
    return this.palette[value] ?? value;
  }

  material(color, options = {}) {
    const {
      roughness = 0.85,
      metalness = 0,
      flatShading = false,
      emissive = null,
      emissiveIntensity = 1,
      map = null,
      side = THREE.FrontSide,
      basic = false,
    } = options;
    const resolved = this.color(color);
    // Cached by the colour as requested (palette key or raw colour), so setPalette()
    // can recolour every material that was asked for by palette key.
    const key = JSON.stringify([
      color,
      roughness,
      metalness,
      flatShading,
      emissive,
      emissiveIntensity,
      map?.uuid ?? null,
      side,
      basic,
    ]);
    let material = this._materials.get(key);
    if (!material) {
      material = basic
        ? new THREE.MeshBasicMaterial({ color: resolved, map, side })
        : new THREE.MeshStandardMaterial({
            color: resolved,
            roughness,
            metalness,
            flatShading,
            map,
            side,
            emissive: emissive ? this.color(emissive) : 0x000000,
            emissiveIntensity,
          });
      material.userData.paletteKeys = { color, emissive };
      this._materials.set(key, material);
    }
    return material;
  }

  /** Switches palette and recolours every material created from palette keys. */
  setPalette(palette) {
    this.palette = palette;
    for (const material of this._materials.values()) {
      const { color, emissive } = material.userData.paletteKeys;
      if (Object.hasOwn(palette, color)) material.color.set(palette[color]);
      if (emissive && Object.hasOwn(palette, emissive)) material.emissive.set(palette[emissive]);
    }
  }

  texture(texture) {
    this._textures.add(texture);
    return texture;
  }

  releaseTexture(texture) {
    if (this._textures.delete(texture)) texture.dispose();
  }

  geometry(key, create) {
    let geometry = this._geometries.get(key);
    if (!geometry) {
      geometry = create();
      this._geometries.set(key, geometry);
    }
    return geometry;
  }

  box(w, h, d) {
    return this.geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
  }

  rounded(w, h, d, radius = 0.04, segments = 2) {
    const r = Math.min(radius, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    return this.geometry(
      `rbox:${w}:${h}:${d}:${r}:${segments}`,
      () => new RoundedBoxGeometry(w, h, d, segments, r),
    );
  }

  cylinder(radiusTop, radiusBottom, height, segments = 16, openEnded = false) {
    return this.geometry(
      `cyl:${radiusTop}:${radiusBottom}:${height}:${segments}:${openEnded}`,
      () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, openEnded),
    );
  }

  sphere(radius, widthSegments = 16, heightSegments = 12) {
    return this.geometry(
      `sph:${radius}:${widthSegments}:${heightSegments}`,
      () => new THREE.SphereGeometry(radius, widthSegments, heightSegments),
    );
  }

  icosahedron(radius, detail = 0) {
    return this.geometry(
      `ico:${radius}:${detail}`,
      () => new THREE.IcosahedronGeometry(radius, detail),
    );
  }

  torus(radius, tube, radialSegments = 8, tubularSegments = 16, arc = Math.PI * 2) {
    return this.geometry(
      `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}:${arc}`,
      () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc),
    );
  }

  plane(w, h) {
    return this.geometry(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
  }

  circle(radius, segments = 48) {
    return this.geometry(
      `circle:${radius}:${segments}`,
      () => new THREE.CircleGeometry(radius, segments),
    );
  }

  mesh(geometry, material, { castShadow = true, receiveShadow = true } = {}) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = castShadow && this.quality.shadows;
    mesh.receiveShadow = receiveShadow && this.quality.shadows;
    return mesh;
  }

  /** Creates a mesh, positions it, and adds it to parent. */
  part(parent, geometry, material, position = [0, 0, 0], rotation = null, shadow = {}) {
    const mesh = this.mesh(geometry, material, shadow);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  }

  /** Registers a per-frame callback. It returns true when it changed something visible. */
  addUpdater(update) {
    this.updaters.push(update);
    this._collecting?.push(update);
  }

  /** Runs fn and returns [result, updaters it registered], so they can be removed later. */
  collectUpdaters(fn) {
    const collected = [];
    this._collecting = collected;
    try {
      return [fn(), collected];
    } finally {
      this._collecting = null;
    }
  }

  removeUpdaters(updaters) {
    const remove = new Set(updaters);
    this.updaters = this.updaters.filter((update) => !remove.has(update));
  }

  dispose() {
    for (const material of this._materials.values()) material.dispose();
    for (const geometry of this._geometries.values()) geometry.dispose();
    for (const texture of this._textures) texture.dispose();
    this._materials.clear();
    this._geometries.clear();
    this._textures.clear();
    this.updaters = [];
  }
}

/** Small deterministic PRNG so procedural details look the same on every load. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
