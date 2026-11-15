/**
 * Songs and videos from YouTube, Spotify, and SoundCloud. A pasted link becomes a
 * reference { provider, kind, id }; that's all a room stores. The embed address is
 * rebuilt here from the reference, so a room can never point an iframe anywhere else.
 * backend/rooms.py checks references with the same rules.
 */

export const PROVIDERS = Object.freeze({ youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud' });

const YOUTUBE_ID = /^[\w-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'episode', 'show', 'artist']);
const SOUNDCLOUD_PATH = /^[a-z0-9_-]{1,64}\/(sets\/)?[a-z0-9_-]{1,120}$/;

/** True for a well-formed reference (optionally only from `providers`). */
export function isMediaRef(ref, providers = Object.keys(PROVIDERS)) {
  if (!ref || typeof ref !== 'object' || !providers.includes(ref.provider)) return false;
  if (ref.provider === 'youtube') return ref.kind === 'video' && YOUTUBE_ID.test(ref.id);
  if (ref.provider === 'spotify') return SPOTIFY_KINDS.has(ref.kind) && SPOTIFY_ID.test(ref.id);
  return ref.kind === (ref.id?.includes('/sets/') ? 'playlist' : 'track') && SOUNDCLOUD_PATH.test(ref.id ?? '');
}

/** A reference from a pasted link (or Spotify URI), or null if it isn't one we know. */
export function parseMediaLink(text) {
  const raw = String(text ?? '').trim();
  const uri = /^spotify:(\w+):([A-Za-z0-9]{22})$/.exec(raw);
  if (uri) return check({ provider: 'spotify', kind: uri[1], id: uri[2] });
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return check({ provider: 'youtube', kind: 'video', id: parts[0] });
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = parts[0] === 'watch' ? url.searchParams.get('v') : ['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : null;
    return check({ provider: 'youtube', kind: 'video', id });
  }
  if (host === 'open.spotify.com') {
    const rest = parts[0]?.startsWith('intl-') ? parts.slice(1) : parts;
    const [kind, id] = rest[0] === 'embed' ? rest.slice(1) : rest;
    return check({ provider: 'spotify', kind, id });
  }
  if (host === 'soundcloud.com') {
    const path = parts.join('/').toLowerCase();
    return check({ provider: 'soundcloud', kind: parts[1] === 'sets' ? 'playlist' : 'track', id: path });
  }
  return null;
}

function check(ref) {
  return isMediaRef(ref) ? ref : null;
}

/** The address of the provider's player for a reference. */
export function embedUrl(ref) {
  if (!isMediaRef(ref)) return null;
  if (ref.provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${ref.id}`;
  if (ref.provider === 'spotify') return `https://open.spotify.com/embed/${ref.kind}/${ref.id}`;
  const track = encodeURIComponent(`https://soundcloud.com/${ref.id}`);
  return `https://w.soundcloud.com/player/?url=${track}&color=%23c8693f&visual=false&show_comments=false`;
}

/** A normal link to the song or video on the provider's site. */
export function sourceUrl(ref) {
  if (!isMediaRef(ref)) return '';
  if (ref.provider === 'youtube') return `https://www.youtube.com/watch?v=${ref.id}`;
  if (ref.provider === 'spotify') return `https://open.spotify.com/${ref.kind}/${ref.id}`;
  return `https://soundcloud.com/${ref.id}`;
}
