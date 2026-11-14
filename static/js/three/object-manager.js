import * as THREE from 'three';
import { PROP_BUILDERS } from './props/index.js';

const GLOW_ON = { emissive: 'lampGlow', emissiveIntensity: 0.9 };

/**
 * Builds room objects ({ id, catalogId, position, rotation, scale, customData, permissions })
 * from catalogue entries, either GLB models or procedural builders.
 */
export class ObjectManager {
  constructor({ scene, kit, catalog, loader, theme, room }) {
    this.scene = scene;
    this.kit = kit;
    this.catalog = catalog;
    this.loader = loader;
    this.theme = theme;
    this.room = room;
    this.records = new Map();
    this.failed = [];
    this.skipped = [];
  }

  async populate(objects, onProgress) {
    let done = 0;
    const total = objects.length || 1;
    await Promise.all(
      objects.map(async (object) => {
        try {
          await this._add(object);
        } catch (error) {
          if (this.loader.disposed) return;
          console.warn(`[room] Showing a placeholder for "${object.id}".`, error);
          this.failed.push(object.id);
          this._addPlaceholder(object);
        } finally {
          done += 1;
          onProgress?.(done / total);
        }
      }),
    );
  }

  get(objectId) {
    return this.records.get(objectId) ?? null;
  }

  /** Walks up from a hit mesh to the room object that owns it. */
  resolve(object3d) {
    let current = object3d;
    while (current) {
      if (current.userData.objectId) return this.records.get(current.userData.objectId) ?? null;
      current = current.parent;
    }
    return null;
  }

  setLamp(objectId, on) {
    const record = this.records.get(objectId);
    if (!record?.light) return null;
    record.lampOn = on;
    record.light.intensity = on ? record.lightIntensity : 0;
    const material = on ? this.kit.material('lampGlow', GLOW_ON) : this.kit.material('cream', { roughness: 0.6 });
    for (const mesh of record.glowMeshes) mesh.material = material;
    return on;
  }

  getDebugInfo() {
    const lamps = {};
    const interactive = [];
    const permissions = {};
    for (const record of this.records.values()) {
      if (record.light) lamps[record.id] = record.lampOn;
      if (record.interaction) {
        interactive.push(record.id);
        permissions[record.id] = record.permission;
      }
    }
    return {
      objects: this.records.size,
      failed: [...this.failed].sort(),
      skipped: [...this.skipped].sort(),
      interactive: interactive.sort(),
      permissions,
      lamps,
    };
  }

  async _add(object) {
    const entry = this.catalog.get(object.catalogId);
    if (!entry) {
      console.warn(`[room] Unknown catalogue item "${object.catalogId}" for "${object.id}" skipped.`);
      this.skipped.push(object.id);
      return;
    }

    const content = entry.model ? await this._instantiateModel(entry) : await this._build(entry, object);
    if (this.loader.disposed) return;
    const holder = this._place(object, content, entry);

    const glowMeshes = [];
    holder.traverse((child) => {
      if (child.isMesh && child.userData.glow) glowMeshes.push(child);
    });

    const record = {
      id: object.id,
      catalogId: entry.id,
      name: entry.name,
      interaction: entry.interaction ?? null,
      permission: object.permissions?.interact ?? entry.permissions?.interact ?? null,
      data: object.customData,
      root: holder,
      glowMeshes,
      light: null,
      lightIntensity: 0,
      lampOn: false,
    };

    if (entry.light) {
      const { position = [0, 0, 0], intensity = 1, distance = 5 } = entry.light;
      const light = new THREE.PointLight(this.kit.color('lampGlow'), intensity, distance, 2);
      light.position.set(...position);
      holder.add(light);
      record.light = light;
      record.lightIntensity = intensity;
    }

    this.records.set(object.id, record);
    if (record.light) this.setLamp(object.id, object.customData.on ?? true);
  }

  async _instantiateModel(entry) {
    const template = await this.loader.loadModel(entry.model);
    const instance = template.clone(true);
    instance.scale.setScalar(this.catalog.modelScale * (entry.scale ?? 1));
    const shadows = this.kit.quality.shadows;
    const palette = { ...this.theme.modelMaterials, ...entry.materials };

    instance.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = shadows;
      child.receiveShadow = shadows;
      const remap = (material) => {
        if (material.name === 'lamp') child.userData.glow = true;
        const color = palette[material.name];
        return color ? this.kit.material(color, { roughness: 0.8 }) : material;
      };
      child.material = Array.isArray(child.material) ? child.material.map(remap) : remap(child.material);
    });
    return instance;
  }

  async _build(entry, object) {
    const build = PROP_BUILDERS[entry.builder];
    if (!build) throw new Error(`No builder named "${entry.builder}".`);
    return build(this.kit, { ...(entry.options ?? {}), ...object.customData }, { loader: this.loader, room: this.room });
  }

  _place(object, content, entry) {
    const holder = new THREE.Group();
    holder.name = `object:${object.id}`;
    holder.userData.objectId = object.id;
    holder.userData.catalogId = entry?.id ?? object.catalogId;
    holder.position.set(object.position.x, object.position.y, object.position.z);
    holder.rotation.set(object.rotation.x, object.rotation.y, object.rotation.z);
    holder.scale.set(object.scale.x, object.scale.y, object.scale.z);
    holder.add(content);
    this.scene.add(holder);
    return holder;
  }

  _addPlaceholder(object) {
    const group = new THREE.Group();
    group.name = 'placeholder';
    const box = this.kit.part(group, this.kit.rounded(0.5, 0.5, 0.5, 0.06), this.kit.material('#c9b8a8', { roughness: 1 }), [0, 0.25, 0]);
    box.userData.placeholder = true;
    const holder = this._place(object, group, null);
    this.records.set(object.id, {
      id: object.id,
      catalogId: object.catalogId,
      name: 'Missing item',
      interaction: null,
      data: object.customData,
      root: holder,
      glowMeshes: [],
      light: null,
      lightIntensity: 0,
      lampOn: false,
      placeholder: true,
    });
  }
}
