/**
 * Shared clean-up for visitor notes and gifts, and the browser-only layout preview
 * used when editing a demo room in development (`?as=owner`). Real rooms are saved
 * to the server; notes and gifts live there too (see visitor-book.js).
 */

const PREFIX = 'doors:v1';
export const MAX_AUTHOR_LENGTH = 40;
export const MAX_MESSAGE_LENGTH = 280;

export const GIFTS = Object.freeze({
  flower: { label: 'Flower', icon: '🌷' },
  cookie: { label: 'Cookie', icon: '🍪' },
  star: { label: 'Star', icon: '⭐' },
  tea: { label: 'Cup of tea', icon: '🍵' },
});

function cleanText(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Returns a clean note, or null if there is nothing to post. */
export function cleanNote({ author, message }) {
  const text = cleanText(message, MAX_MESSAGE_LENGTH);
  if (!text) return null;
  return { author: cleanText(author, MAX_AUTHOR_LENGTH) || 'A visitor', message: text };
}

/** Returns a clean gift, or null if the gift type is unknown. */
export function cleanGift({ author, gift }) {
  if (!Object.hasOwn(GIFTS, gift)) return null;
  return { author: cleanText(author, MAX_AUTHOR_LENGTH) || 'A visitor', gift };
}

function defaultStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class RoomStore {
  constructor(roomId, storage = defaultStorage()) {
    this.roomId = roomId;
    this.storage = storage;
  }

  /** The owner's saved layout ({ appearance, objects }) for this room, or null. */
  loadLayout() {
    if (!this.storage) return null;
    try {
      const layout = JSON.parse(this.storage.getItem(this._key('layout')) ?? 'null');
      const valid =
        layout &&
        typeof layout === 'object' &&
        Array.isArray(layout.objects) &&
        layout.objects.every((object) => object && typeof object === 'object' && typeof object.catalogId === 'string');
      return valid ? { appearance: layout.appearance ?? {}, objects: layout.objects } : null;
    } catch {
      return null;
    }
  }

  saveLayout({ appearance, objects }) {
    try {
      this.storage?.setItem(this._key('layout'), JSON.stringify({ version: 1, appearance, objects }));
      return true;
    } catch {
      return false;
    }
  }

  clearLayout() {
    this.storage?.removeItem(this._key('layout'));
  }

  _key(kind) {
    return `${PREFIX}:${this.roomId}:${kind}`;
  }
}
