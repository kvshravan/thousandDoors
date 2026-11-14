/**
 * Photos for frames and photo strings. A photo reference ("ref") is either a
 * bundled image ("/static/images/...") or a photo the owner uploaded ("upload:<id>").
 *
 * Until accounts exist (Milestone 4), uploads are resized and kept in this browser
 * (IndexedDB), so only this browser can show them; elsewhere they appear blank.
 * Milestone 4 moves them to Supabase Storage without changing the refs' shape.
 */

export const UPLOAD_PREFIX = 'upload:';
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_SIDE = 512;
export const DEMO_PHOTOS = Object.freeze([
  { ref: '/static/images/demo/sunset-hills.svg', name: 'Sunset hills' },
  { ref: '/static/images/demo/waves.svg', name: 'Waves' },
  { ref: '/static/images/demo/moonrise.svg', name: 'Moonrise' },
  { ref: '/static/images/demo/blocks.svg', name: 'Colour blocks' },
]);

const DB_NAME = 'doors-images';
const STORE = 'images';
const SAFE_STATIC = /^\/static\/images\/[\w\-/]+\.(svg|png|jpe?g|webp)$/;
const UPLOAD_ID = /^upload:[\w-]{8,64}$/;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const isPhotoRef = (ref) => typeof ref === 'string' && (SAFE_STATIC.test(ref) || UPLOAD_ID.test(ref));

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Scales an image file down to fit MAX_SIDE and re-encodes it as JPEG. */
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not read that image.');
  return { blob, width: canvas.width, height: canvas.height };
}

export class ImageStore {
  constructor() {
    this._db = null;
    // Falls back to memory (lost on reload) where IndexedDB isn't available.
    this._memory = new Map();
    this._urls = new Map();
  }

  /** Validates, resizes, and stores an image file. Returns its ref. */
  async add(file) {
    if (!file || !ACCEPTED.includes(file.type)) throw new Error('Choose a PNG, JPEG, WebP, or GIF image.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is too big (15 MB at most).');
    const { blob, width, height } = await shrink(file);
    const id = crypto.randomUUID();
    const entry = { id, blob, width, height, name: String(file.name || 'Photo').slice(0, 80), created: Date.now() };
    const db = await this._open();
    if (db) await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
    else this._memory.set(id, entry);
    return `${UPLOAD_PREFIX}${id}`;
  }

  /** The owner's uploads, newest first: [{ ref, url, name }]. */
  async list() {
    const db = await this._open();
    const entries = db ? await request(db.transaction(STORE).objectStore(STORE).getAll()) : [...this._memory.values()];
    return entries
      .sort((a, b) => b.created - a.created)
      .map((entry) => ({ ref: `${UPLOAD_PREFIX}${entry.id}`, url: this._urlFor(entry), name: entry.name }));
  }

  /** A URL to show the photo, or null if the ref isn't allowed or the upload isn't here. */
  async resolve(ref) {
    if (!isPhotoRef(ref)) return null;
    if (!ref.startsWith(UPLOAD_PREFIX)) return ref;
    const id = ref.slice(UPLOAD_PREFIX.length);
    if (this._urls.has(id)) return this._urls.get(id);
    const db = await this._open();
    const entry = db ? await request(db.transaction(STORE).objectStore(STORE).get(id)) : this._memory.get(id);
    return entry ? this._urlFor(entry) : null;
  }

  dispose() {
    for (const url of this._urls.values()) URL.revokeObjectURL(url);
    this._urls.clear();
    this._db?.close();
    this._db = null;
  }

  _urlFor(entry) {
    if (!this._urls.has(entry.id)) this._urls.set(entry.id, URL.createObjectURL(entry.blob));
    return this._urls.get(entry.id);
  }

  async _open() {
    if (this._db) return this._db;
    if (!window.indexedDB) return null;
    try {
      const open = window.indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' });
      this._db = await request(open);
    } catch {
      this._db = null;
    }
    return this._db;
  }
}
