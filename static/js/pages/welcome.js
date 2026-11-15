import { api, errorMessage, getSession, me } from '../auth.js';

const form = document.querySelector('#welcome-form');
const status = document.querySelector('#welcome-status');
const preview = document.querySelector('[data-preview]');
const next = new URLSearchParams(window.location.search).get('next');

function show(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

async function start() {
  if (!getSession()) {
    window.location.replace('/signin?next=/welcome');
    return;
  }
  const account = await me();
  if (!account) {
    window.location.replace('/signin?error=expired');
    return;
  }
  if (account.profile) {
    window.location.replace(`/room/${account.profile.username}`);
    return;
  }
  // Suggest a username from the email address.
  const suggestion = (account.user.email.split('@')[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20);
  form.username.value = suggestion.length >= 3 ? suggestion : '';
  preview.textContent = form.username.value || 'yourname';
  // Google sign-ins come with a name.
  const name = getSession()?.user?.name;
  if (name && !form.displayName.value) form.displayName.value = name.slice(0, form.displayName.maxLength);
  form.hidden = false;
  form.username.focus();
}

form.username.addEventListener('input', () => {
  form.username.value = form.username.value.toLowerCase();
  preview.textContent = form.username.value || 'yourname';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.username.checkValidity()) {
    show('Usernames are 3–20 lowercase letters, numbers, - or _.', true);
    form.username.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  show('Building your room…');
  const result = await api('/api/me/profile', {
    method: 'POST',
    json: { username: form.username.value, displayName: form.displayName.value },
  });
  button.disabled = false;
  if (!result.ok) {
    show(errorMessage(result), true);
    form.username.focus();
    return;
  }
  // A brand-new room lands in the editor, with a few tips.
  const safeNext = next?.startsWith('/') && !next.startsWith('//') && !['/', '/welcome'].includes(next) ? next : null;
  window.location.assign(safeNext ?? `${result.data.roomUrl}?new=1`);
});

start();
