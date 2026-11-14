import * as THREE from 'three';
import { PROP_BUILDERS } from './props/index.js';

const GLOW_ON = { emissive: 'lampGlow', emissiveIntensity: 0.9 };
const round = (value, digits) => Number(value.toFixed(digits));

/**
 * Builds room objects ({ id, catalogId, position, rotation, scale, customData, permissions })
 * from catalogue entries, either GLB models or procedural builders. Objects can be
 * added and removed at any time, and the current layout serialized back to JSON.
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
    // Objects with unknown catalogue ids are kept so saving doesn't silently drop them.
    this._unknownObjects = [];
    // Ids in the order objects were added, so saved layouts keep a stable order.
    this._order = [];
  }

  async populate(objects, onProgress) {
    let done = 0;
    const total = objects.length || 1;
    await Promise.all(
      objects.map(async (object) => {
        await this.addObject(object);
        done += 1;
        onProgress?.(done / total);
      }),
    );
  }

  /** Adds one object, falling back to a placeholder if its model fails. Returns its record. */
  async addObject(object) {
    if (!this._order.includes(object.id)) this._order.push(object.id);
    try {
      return await this._add(object);
    } catch (error) {
      if (this.loader.disposed) return null;
      console.warn(`[room] Showing a placeholder for "${object.id}".`, error);
      this.failed.push(object.id);
      return this._addPlaceholder(object);
    }
  }

  removeObject(objectId) {
    const record = this.records.get(objectId);
    if (!record) return false;
    record.root.removeFromParent();
    record.light?.dispose();
    this.kit.removeUpdaters(record.updaters);
    this.records.delete(objectId);
    this._order = this._order.filter((id) => id !== objectId);
    return true;
  }

  get(objectId) {
    return this.records.get(objectId) ?? null;
  }

  /** Reorders saved output to match ids (unknown ids are ignored). */
  setOrder(ids) {
    const known = ids.filter((id) => this.records.has(id));
    this._order = [...known, ...this._order.filter((id) => !known.includes(id) && this.records.has(id))];
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

  /** The current layout in the room JSON format. */
  serialize() {
    const ordered = this._order.map((id) => this.records.get(id)).filter(Boolean);
    const objects = ordered.map((record) => {
      const { position, rotation, scale } = record.root;
      const object = {
        id: record.id,
        catalogId: record.catalogId,
        position: { x: round(position.x, 3), y: round(position.y, 3), z: round(position.z, 3) },
        rotation: { x: round(rotation.x, 4), y: round(rotation.y, 4), z: round(rotation.z, 4) },
        scale: { x: round(scale.x, 3), y: round(scale.y, 3), z: round(scale.z, 3) },
      };
      if (Object.keys(record.data).length > 0) object.customData = structuredClone(record.data);
      if (record.permissionOverride) object.permissions = { interact: record.permissionOverride };
      return object;
    });
    return [...objects, ...this._unknownObjects.map((object) => structuredClone(object))];
  }

  getDebugInfo() {
    const lamps = {};
    const interactive = [];
    const permissions = {};
    const states = {};
    for (const record of this.records.values()) {
      if (record.light) lamps[record.id] = record.lampOn;
      if (record.controls) states[record.id] = { ...record.controls.state };
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
      states,
      lamps,
    };
  }

  async _add(object) {
    const entry = this.catalog.get(object.catalogId);
    if (!entry) {
      console.warn(`[room] Unknown catalogue item "${object.catalogId}" for "${object.id}" skipped.`);
      this.skipped.push(object.id);
      this._unknownObjects.push(object);
      return null;
    }

    let content;
    let updaters = [];
    if (entry.model) {
      content = await this._instantiateModel(entry);
    } else {
      const build = PROP_BUILDERS[entry.builder];
      if (!build) throw new Error(`No builder named "${entry.builder}".`);
      const options = { ...(entry.options ?? {}), ...object.customData };
      const [result, owned] = this.kit.collectUpdaters(() =>
        build(this.kit, options, { loader: this.loader, room: this.room }),
      );
      updaters = owned;
      content = await result;
    }
    if (this.loader.disposed) {
      this.kit.removeUpdaters(updaters);
      return null;
    }
    const holder = this._place(object, content, entry);

    const glowMeshes = [];
    holder.traverse((child) => {
      if (child.isMesh && child.userData.glow) glowMeshes.push(child);
    });

    const record = {
      ...this._baseRecord(object, entry, holder),
      name: entry.name,
      interaction: entry.interaction ?? null,
      controls: content.userData.controls ?? null,
      glowMeshes,
      updaters,
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
    return record;
  }

  _baseRecord(object, entry, holder) {
    const override = object.permissions?.interact ?? null;
    return {
      id: object.id,
      catalogId: object.catalogId,
      name: entry?.name ?? 'Missing item',
      interaction: null,
      permission: override ?? entry?.permissions?.interact ?? null,
      permissionOverride: override,
      placement: entry?.placement ?? 'floor',
      flat: Boolean(entry?.flat),
      controls: null,
      data: object.customData,
      root: holder,
      glowMeshes: [],
      updaters: [],
      light: null,
      lightIntensity: 0,
      lampOn: false,
    };
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
    const entry = this.catalog.get(object.catalogId);
    const holder = this._place(object, group, entry);
    const record = { ...this._baseRecord(object, entry, holder), name: 'Missing item', placeholder: true };
    this.records.set(object.id, record);
    return record;
  }
}
