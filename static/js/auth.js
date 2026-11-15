/**
 * Sign-in with Supabase Auth (email magic links or OAuth such as Google), without
 * supabase-js.
 *
 * 1. sendMagicLink(email) asks Supabase to email a sign-in link, or
 *    signInWithProvider('google') sends the browser to Supabase, which hands off to
 *    the provider.
 * 2. Either way the browser lands back on /signin with the session in the URL
 *    fragment (#access_token=…&refresh_token=…); captureRedirect() stores it.
 * 3. api() sends `Authorization: Bearer <access token>` to Flask, refreshing the
 *    token shortly before it expires.
 *
 * The session lives in localStorage under "doors:auth". Only the publishable key is
 * used here; it's meant for browsers.
 */

const STORAGE_KEY = 'doors:auth';
const NEXT_KEY = 'doors:next';
const NEXT_TTL_MS = 60 * 60 * 1000;
const REFRESH_MARGIN_S = 60;
const root = document.documentElement;
const SUPABASE_URL = (root.dataset.supabaseUrl || '').replace(/\/$/, '');
const PUBLISHABLE_KEY = root.dataset.supabaseKey || '';

let refreshing = null;
let mePromise = null;
let arrivedSignedIn = false;

function read() {
  try {
    const session = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    return session?.access_token ? session : null;
  } catch {
    return null;
  }
}

function write(session) {
  mePromise = null;
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: signed in for this page only.
  }
}

/** The user id and email inside an access token (not verified here; Flask verifies it). */
function claims(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')));
  } catch {
    return {};
  }
}

export function getSession() {
  return read();
}

export const isConfigured = () => Boolean(SUPABASE_URL && PUBLISHABLE_KEY);

/** True when this page load carried a sign-in redirect (app.js is finishing it). */
export const isFinishingSignIn = () => arrivedSignedIn || /access_token=|error_description=/.test(window.location.hash);

/** Stores a session arriving in the URL fragment. Returns { signedIn } or { error }. */
export function captureRedirect() {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get('access_token');
  const error = fragment.get('error_description');
  if (!token && !error) return null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  arrivedSignedIn = true;
  if (error) return { error: error.replace(/\+/g, ' ') };
  const payload = claims(token);
  const expiresIn = Number(fragment.get('expires_in') || 3600);
  write({
    access_token: token,
    refresh_token: fragment.get('refresh_token') || '',
    expires_at: Number(fragment.get('expires_at')) || Math.floor(Date.now() / 1000) + expiresIn,
    user: { id: payload.sub, email: payload.email ?? '', name: payload.user_metadata?.full_name ?? '' },
  });
  return { signedIn: true };
}

/** The Supabase URL that starts an OAuth sign-in and returns to /signin. */
export function providerSignInUrl(provider) {
  const params = new URLSearchParams({ provider, redirect_to: `${window.location.origin}/signin` });
  return `${SUPABASE_URL}/auth/v1/authorize?${params}`;
}

/** Leaves for the provider's sign-in page. `next` is where to go after signing in. */
export function signInWithProvider(provider, next = null) {
  if (!isConfigured()) throw new Error("Sign-in isn't set up on this server yet.");
  rememberNext(next);
  window.location.assign(providerSignInUrl(provider));
}

/** Emails a magic link. `next` is where to go after signing in. */
export async function sendMagicLink(email, next = null) {
  if (!isConfigured()) throw new Error("Sign-in isn't set up on this server yet.");
  rememberNext(next);
  const redirect = `${window.location.origin}/signin`;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirect)}`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 429) throw new Error('Too many sign-in emails. Wait a minute and try again.');
    throw new Error(body.msg || body.error_description || 'Could not send the sign-in email.');
  }
}

// localStorage rather than sessionStorage: the emailed link usually opens in a new tab,
// and leaving for an OAuth provider can start a fresh session store.
function rememberNext(next) {
  try {
    if (next) window.localStorage.setItem(NEXT_KEY, JSON.stringify({ path: next, until: Date.now() + NEXT_TTL_MS }));
    else window.localStorage.removeItem(NEXT_KEY);
  } catch {
    // Storage blocked: land on the default page instead.
  }
}

/** Where to go after signing in (set when sign-in started), cleared once read. */
export function takeNext() {
  let saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(NEXT_KEY) ?? 'null');
    window.localStorage.removeItem(NEXT_KEY);
  } catch {
    return null;
  }
  const next = saved && saved.until > Date.now() ? String(saved.path) : null;
  // Only same-site paths, never another origin.
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

async function refresh(session) {
  if (!session.refresh_token || !isConfigured()) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at ?? Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
      user: {
        id: data.user?.id ?? session.user?.id,
        email: data.user?.email ?? session.user?.email,
        name: data.user?.user_metadata?.full_name ?? session.user?.name ?? '',
      },
    };
    write(next);
    return next;
  } catch {
    write(null);
    return null;
  }
}

/** A current access token, refreshed if it's about to expire, or null when signed out. */
export async function accessToken() {
  let session = read();
  if (!session) return null;
  if (session.expires_at - Date.now() / 1000 < REFRESH_MARGIN_S) {
    refreshing ??= refresh(session).finally(() => {
      refreshing = null;
    });
    session = await refreshing;
  }
  return session?.access_token ?? null;
}

export async function signOut() {
  const session = read();
  write(null);
  if (session && isConfigured()) {
    // Best effort: revoke the refresh token on the server too.
    fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {});
  }
}

/**
 * Calls the Flask API. Returns { ok, status, data }. `json` sends a JSON body; `form`
 * sends FormData (uploads).
 */
export async function api(path, { method = 'GET', json, form } = {}) {
  const headers = { Accept: 'application/json' };
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  let response;
  try {
    response = await fetch(path, { method, headers, body });
  } catch {
    return { ok: false, status: 0, data: { error: { message: "Couldn't reach the server. Check your connection." } } };
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && token) write(null);
  return { ok: response.ok, status: response.status, data };
}

/** The signed-in user and their profile ({ user, profile }), or null. Cached per page. */
export function me() {
  if (!read()) return Promise.resolve(null);
  mePromise ??= api('/api/me').then((result) => (result.ok ? result.data : null));
  return mePromise;
}

/** A message from an API error response. */
export function errorMessage(result, fallback = 'Something went wrong. Try again.') {
  return result?.data?.error?.message || fallback;
}
