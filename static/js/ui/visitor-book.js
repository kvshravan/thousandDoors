import { api, errorMessage, getSession } from '../auth.js';
import { cleanGift, cleanNote } from './room-store.js';

const CLEAN = { notes: cleanNote, gifts: cleanGift };

/**
 * Notes and gifts visitors leave in a room, shared through the server. Anyone can
 * read them; leaving one needs an account with a username (it's signed with it).
 */
export class VisitorBook {
  /** `initial` ({ notes, gifts }) comes with the room, saving two requests. */
  constructor(roomId, initial = null) {
    this.roomId = roomId;
    this.entries = { notes: [], gifts: [] };
    if (initial) {
      for (const kind of Object.keys(this.entries)) this.entries[kind] = this._clean(kind, initial[kind]);
    }
  }

  get signedIn() {
    return Boolean(getSession());
  }

  async load() {
    await Promise.all(
      Object.keys(this.entries).map(async (kind) => {
        const result = await api(`/api/rooms/${encodeURIComponent(this.roomId)}/${kind}`);
        if (result.ok) this.entries[kind] = this._clean(kind, result.data.entries);
      }),
    );
  }

  list(kind) {
    return this.entries[kind] ?? [];
  }

  /** Leaves a note ({ message }) or gift ({ gift }). Returns { entry } or { error, signIn }. */
  async add(kind, payload) {
    if (!this.signedIn) return { error: 'Sign in to leave one.', signIn: true };
    const result = await api(`/api/rooms/${encodeURIComponent(this.roomId)}/${kind}`, { method: 'POST', json: payload });
    if (!result.ok) return { error: errorMessage(result), signIn: result.status === 401 };
    const [entry] = this._clean(kind, [result.data.entry]);
    if (entry) this.entries[kind] = [...this.entries[kind], entry];
    return { entry };
  }

  _clean(kind, entries) {
    return (Array.isArray(entries) ? entries : []).map((entry) => CLEAN[kind](entry ?? {})).filter(Boolean);
  }
}
