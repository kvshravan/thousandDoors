/** Loads and validates the item catalogue and room configurations. */

const VECTOR_KEYS = ['x', 'y', 'z'];

export async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Could not load ${label} (HTTP ${response.status}).`);
  return response.json();
}

export class Catalog {
  constructor(data) {
    if (!data || !Array.isArray(data.items)) throw new Error('Catalogue is missing an items list.');
    this.modelScale = Number(data.modelScale ?? 1);
    this._items = new Map();
    for (const item of data.items) {
      if (!item.id || (!item.model && !item.builder)) {
        throw new Error(`Catalogue item ${JSON.stringify(item.id)} needs an id and a model or builder.`);
      }
      this._items.set(item.id, Object.freeze({ ...item }));
    }
  }

  get(id) {
    return this._items.get(id) ?? null;
  }

  get size() {
    return this._items.size;
  }
}

function vector(value, fallback) {
  const result = {};
  for (const key of VECTOR_KEYS) {
    const n = Number(value?.[key] ?? fallback);
    result[key] = Number.isFinite(n) ? n : fallback;
  }
  return result;
}

/** Normalizes a room config ({ roomId, name, theme, objects }) and fills in defaults. */
export function normalizeRoom(data) {
  if (!data || !Array.isArray(data.objects)) throw new Error('Room configuration is missing objects.');
  const seen = new Set();
  const objects = data.objects.map((object, index) => {
    const id = String(object.id ?? `object-${index}`);
    if (seen.has(id)) throw new Error(`Duplicate room object id "${id}".`);
    seen.add(id);
    return {
      id,
      catalogId: String(object.catalogId ?? ''),
      position: vector(object.position, 0),
      rotation: vector(object.rotation, 0),
      scale: vector(object.scale, 1),
      customData: { ...(object.customData ?? {}) },
    };
  });
  return {
    roomId: String(data.roomId ?? ''),
    name: data.name ?? 'Room',
    description: data.description ?? '',
    theme: data.theme ?? 'cozy',
    objects,
  };
}
