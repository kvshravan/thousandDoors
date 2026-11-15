import * as THREE from 'three';
import { PROP_BUILDERS } from './props/index.js';
import { ITEM_COLORS, LIGHT_COLORS, resolveLightSettings } from './room-config.js';

const GLOW_INTENSITY = 0.9;
const round = (value, digits) => Number(value.toFixed(digits));
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The palette value for an owner-chosen item colour, or null if it isn't one. */
export function itemColorValue(name) {
  return Object.hasOwn(ITEM_COLORS, name ?? '') ? ITEM_COLORS[name].value : null;
}

/** How bright an animated light is at time t (seconds), as a factor of its brightness. */
function effectFactor(effect, t, phase) {
  switch (effect) {
    case 'pulse':
      return 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2.2));
    case 'twinkle': {
      const wave = 0.5 + 0.5 * Math.sin(t * 3.1 + phase);
      return 0.25 + 0.75 * wave * wave;
    }
    case 'flicker':
      return 0.82 + 0.09 * Math.sin(t * 13 + phase) + 0.09 * Math.sin(t * 7.3 + phase * 2);
    default:
      return 1;
  }
}

/**
 * Builds room objects ({ id, catalogId, position, rotation, scale, customData, permissions })
 * from catalogue entries, either GLB models or procedural builders. Objects can be
 * added and removed at any time, and the current layout serialized back to JSON.
 *
 * Objects with a catalogue `light` glow: customData.light = { color, brightness, effect }
 * picks the colour (LIGHT_COLORS), strength, and animation, and customData.on whether
 * the light starts on. `images.resolve(ref)` turns photo references into URLs.
 */
export class ObjectManager {
  constructor({ scene, kit, catalog, loader, theme, room, images = null }) {
    this.scene = scene;
    this.kit = kit;
    this.catalog = catalog;
    this.loader = loader;
    this.theme = theme;
    this.room = room;
    this.images = images;
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
    this._releaseLight(record);
    this.records.delete(objectId);
    this._order = this._order.filter((id) => id !== objectId);
    return true;
  }

  get(objectId) {
    return this.records.get(objectId) ?? null;
  }

  /** The object as it is now, in the room JSON format (unrounded). */
  snapshot(objectId) {
    const record = this.records.get(objectId);
    if (!record) return null;
    const { position, rotation, scale } = record.root;
    return {
      id: record.id,
      catalogId: record.catalogId,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
      scale: { x: scale.x, y: scale.y, z: scale.z },
      customData: structuredClone(record.data),
      permissions: { interact: record.permissionOverride },
    };
  }

  /**
   * Rebuilds an object with changed customData (colour, text...), keeping its place,
   * its position in the saved order, and whether its lamp is on.
   */
  async rebuild(objectId, customData) {
    const object = this.snapshot(objectId);
    if (!object) return null;
    const lampOn = this.records.get(objectId).lampOn;
    const index = this._order.indexOf(objectId);
    object.customData = structuredClone(customData);
    this.removeObject(objectId);
    const record = await this.addObject(object);
    this._order = this._order.filter((id) => id !== objectId);
    this._order.splice(index, 0, objectId);
    if (record?.light) this.setLamp(objectId, lampOn);
    return record;
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

  /** Switches a light on or off for now (visitors' clicks); doesn't change the saved setting. */
  setLamp(objectId, on) {
    const record = this.records.get(objectId);
    return record?.light ? this._switch(record, on) : null;
  }

  _switch(record, on) {
    record.lampOn = on;
    record.light.intensity = on ? record.lightIntensity * record.lightSettings.brightness : 0;
    record.glowMeshes.forEach((mesh, i) => {
      mesh.material = on ? record.onMaterials[i] : record.offMaterials[i];
    });
    return on;
  }

  /**
   * Changes a light's saved settings: any of { color, brightness, effect, on }.
   * Applied in place, without rebuilding the object. Returns the new settings.
   */
  setLight(objectId, changes) {
    const record = this.records.get(objectId);
    if (!record?.light) return null;
    const { on, ...settings } = changes;
    if (Object.keys(settings).length > 0) {
      record.data.light = resolveLightSettings({ ...record.data.light, ...settings }, record.lightDefaults);
    }
    if (typeof on === 'boolean') {
      if (on) delete record.data.on;
      else record.data.on = false;
      record.lampOn = on;
    }
    this._applyLight(record);
    return this.lightState(record);
  }

  lightState(record) {
    return record?.light ? { on: record.lampOn, ...record.lightSettings, animated: record.effect !== 'steady' } : null;
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
    const lights = {};
    const interactive = [];
    const permissions = {};
    const states = {};
    for (const record of this.records.values()) {
      if (record.light) {
        lamps[record.id] = record.lampOn;
        lights[record.id] = this.lightState(record);
      }
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
      lights,
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
    const color = entry.recolor ? itemColorValue(object.customData.color) : null;
    if (entry.model) {
      content = await this._instantiateModel(entry, color);
    } else {
      const build = PROP_BUILDERS[entry.builder];
      if (!build) throw new Error(`No builder named "${entry.builder}".`);
      // customData.color is a colour name; builders get the resolved value.
      const { color: _name, ...custom } = object.customData;
      const options = { ...(entry.options ?? {}), ...custom };
      if (color) options[entry.recolor] = color;
      const [result, owned] = this.kit.collectUpdaters(() =>
        build(this.kit, options, { loader: this.loader, room: this.room, images: this.images }),
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
      const { position = [0, 0, 0], intensity = 1, distance = 5, defaults = {} } = entry.light;
      const light = new THREE.PointLight('#ffffff', intensity, distance, 2);
      light.position.set(...position);
      holder.add(light);
      record.light = light;
      record.lightIntensity = intensity;
      record.lightDefaults = defaults;
      record.lampOn = object.customData.on ?? true;
      for (const mesh of glowMeshes) mesh.userData.baseMaterial = mesh.material;
      this._applyLight(record);
    }

    this.records.set(object.id, record);
    return record;
  }

  /** (Re)creates a light's materials, colour, and effect from its settings. */
  _applyLight(record) {
    this._releaseLight(record);
    const settings = resolveLightSettings(record.data.light, record.lightDefaults);
    const preset = LIGHT_COLORS[settings.color];
    record.lightSettings = settings;
    record.light.color.set(preset.value);

    // Each glowing part gets its own material, so bulbs can differ and animate.
    record.onMaterials = record.glowMeshes.map((mesh, i) => {
      const material = mesh.userData.baseMaterial.clone();
      const color = preset.bulbs ? preset.bulbs[i % preset.bulbs.length] : preset.value;
      if (material.color && !mesh.userData.keepColor) material.color.set(color);
      if (material.emissive) {
        material.emissive.set(color);
        material.emissiveIntensity = GLOW_INTENSITY * settings.brightness;
        if (material.map && !material.emissiveMap) material.emissiveMap = material.map;
      }
      return material;
    });
    record.offMaterials = record.glowMeshes.map(
      (mesh) => mesh.userData.offMaterial ?? this.kit.material('cream', { roughness: 0.6 }),
    );

    record.effect = prefersReducedMotion() ? 'steady' : settings.effect;
    if (record.effect !== 'steady') {
      const phases = record.glowMeshes.map((_, i) => i * 2.399);
      let time = 0;
      record.effectUpdater = (dt) => {
        if (!record.lampOn) return false;
        time += dt;
        let sum = 0;
        record.onMaterials.forEach((material, i) => {
          const factor = effectFactor(record.effect, time, phases[i]);
          if (material.emissive) material.emissiveIntensity = GLOW_INTENSITY * settings.brightness * factor;
          sum += factor;
        });
        const average = record.onMaterials.length > 0 ? sum / record.onMaterials.length : effectFactor(record.effect, time, 0);
        record.light.intensity = record.lightIntensity * settings.brightness * average;
        return true;
      };
      this.kit.addUpdater(record.effectUpdater);
    }
    this._switch(record, record.lampOn);
  }

  _releaseLight(record) {
    for (const material of record.onMaterials ?? []) material.dispose();
    record.onMaterials = [];
    if (record.effectUpdater) this.kit.removeUpdaters([record.effectUpdater]);
    record.effectUpdater = null;
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
      // Furniture other items can stand on: anything on the floor except rugs, plus
      // catalogue items marked "support" (such as wall shelves).
      support: Boolean(entry?.support) || ((entry?.placement ?? 'floor') === 'floor' && !entry?.flat),
      recolor: entry?.recolor ?? null,
      textOption: entry?.text ?? null,
      linkOption: entry?.link ?? null,
      photoOption: entry?.photos ?? null,
      controls: null,
      data: object.customData,
      root: holder,
      glowMeshes: [],
      updaters: [],
      light: null,
      lightIntensity: 0,
      lightSettings: null,
      lampOn: false,
    };
  }

  async _instantiateModel(entry, color = null) {
    const template = await this.loader.loadModel(entry.model);
    const instance = template.clone(true);
    instance.scale.setScalar(this.catalog.modelScale * (entry.scale ?? 1));
    const shadows = this.kit.quality.shadows;
    const palette = { ...this.theme.modelMaterials, ...entry.materials };
    if (color) palette[entry.recolor] = color;

    instance.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = shadows;
      child.receiveShadow = shadows;
      const remap = (material) => {
        if (material.name === 'lamp') child.userData.glow = true;
        const value = palette[material.name];
        return value ? this.kit.material(value, { roughness: 0.8 }) : material;
      };
      child.material = Array.isArray(child.material) ? child.material.map(remap) : remap(child.material);
    });
    return this._mount(instance, entry);
  }

  /**
   * Re-anchors wall and ceiling models, which are authored standing on the floor:
   * wall items get their back on the wall (z = 0) and are centred vertically, and
   * ceiling items hang from the origin on a rod of length mount.drop.
   */
  _mount(instance, entry) {
    if (entry.placement !== 'wall' && entry.placement !== 'ceiling') return instance;
    instance.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(instance);
    const mounted = new THREE.Group();
    mounted.name = 'mounted';
    mounted.add(instance);
    if (entry.placement === 'wall') {
      instance.position.z -= box.min.z;
      instance.position.y -= (box.min.y + box.max.y) / 2;
      return mounted;
    }
    const drop = entry.mount?.drop ?? 0;
    instance.position.y -= box.max.y + drop;
    if (drop > 0) {
      this.kit.part(mounted, this.kit.cylinder(0.015, 0.015, drop, 8), this.kit.material('metal'), [0, -drop / 2, 0], null, {
        castShadow: false,
      });
    }
    return mounted;
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
