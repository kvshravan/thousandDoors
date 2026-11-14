import { captureRedirect, getSession, me, signOut, takeNext } from './auth.js';
import { h } from './ui/dom.js';

// Runs on every page: finishes a magic-link sign-in and shows the account links.

async function finishSignIn() {
  const result = captureRedirect();
  if (!result) return false;
  if (result.error) {
    window.location.replace(`/signin?error=${encodeURIComponent(result.error)}`);
    return true;
  }
  const next = takeNext();
  const account = await me();
  if (!account) {
    window.location.replace('/signin?error=expired');
  } else if (!account.profile) {
    window.location.replace(`/welcome${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  } else {
    window.location.replace(next ?? `/room/${account.profile.username}`);
  }
  return true;
}

async function renderAccount(nav) {
  if (!nav) return;
  const here = window.location.pathname + window.location.search;
  if (!getSession()) {
    if (window.location.pathname !== '/signin') {
      nav.replaceChildren(
        h('a', { className: 'account-link', href: `/signin?next=${encodeURIComponent(here)}`, dataset: { testid: 'sign-in-link' }, text: 'Sign in' }),
      );
    }
    return;
  }
  const account = await me();
  if (!account) {
    nav.replaceChildren(h('a', { className: 'account-link', href: '/signin', text: 'Sign in' }));
    return;
  }
  const signOutButton = h('button', {
    className: 'account-link account-signout',
    type: 'button',
    dataset: { testid: 'sign-out' },
    text: 'Sign out',
    onClick: async () => {
      await signOut();
      window.location.assign('/');
    },
  });
  const primary = account.profile
    ? h('a', { className: 'account-link', href: `/room/${account.profile.username}`, dataset: { testid: 'my-room-link' }, text: 'My room' })
    : h('a', { className: 'account-link', href: '/welcome', text: 'Finish setting up' });
  nav.replaceChildren(primary, signOutButton);
  nav.dataset.signedIn = 'true';
}

const redirected = await finishSignIn();
if (!redirected) {
  await renderAccount(document.querySelector('[data-account]'));
}
document.documentElement.dataset.appReady = 'true';
