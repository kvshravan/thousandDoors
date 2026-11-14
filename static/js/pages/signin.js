import { getSession, me, sendMagicLink } from '../auth.js';

const form = document.querySelector('#signin-form');
const status = document.querySelector('#signin-status');
const params = new URLSearchParams(window.location.search);
const next = params.get('next');

const ERRORS = {
  expired: 'That sign-in link has expired or was already used. Ask for a new one.',
};

function show(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

if (params.get('error')) show(ERRORS[params.get('error')] ?? params.get('error'), true);

// Already signed in (and not arriving from a link, which app.js handles): go on.
if (getSession() && !window.location.hash) {
  me().then((account) => {
    if (!account) return;
    if (!account.profile) window.location.replace('/welcome');
    else window.location.replace(next?.startsWith('/') && !next.startsWith('//') ? next : `/room/${account.profile.username}`);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = form.email.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    show('Enter your email address.', true);
    form.email.focus();
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  show('Sending…');
  try {
    await sendMagicLink(email, next);
    show(`Check ${email} for a sign-in link. You can close this tab.`);
    form.hidden = true;
  } catch (error) {
    show(error.message, true);
  } finally {
    button.disabled = false;
  }
});
