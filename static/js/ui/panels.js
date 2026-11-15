import { h } from './dom.js';
import { GIFTS, MAX_MESSAGE_LENGTH } from './room-store.js';
import { embedUrl, PROVIDERS, sourceUrl } from '../media.js';

// Builders for the content shown in the interaction panel. All text goes through
// h(), which uses textContent, so room data and visitor input can't inject HTML.

const COLLECTION_ICONS = { book: '📚', game: '🎮', collectible: '🏆', record: '💿' };
const SAFE_EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{6,20}$/;

export function isSafeEmbedUrl(url) {
  return typeof url === 'string' && SAFE_EMBED.test(url);
}

/** A provider's player. `src` always comes from embedUrl() or isSafeEmbedUrl(). */
function embedFrame(src, title, className) {
  return h('iframe', {
    className,
    src,
    title,
    allow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture',
    referrerpolicy: 'strict-origin-when-cross-origin',
    allowfullscreen: true,
    loading: 'lazy',
    dataset: { testid: 'media-embed' },
  });
}

/** The record player's song: the provider's own player, sized for it. */
export function songBody(ref) {
  const tall = ref.kind !== 'track' && ref.kind !== 'video' && ref.kind !== 'episode';
  return [
    embedFrame(embedUrl(ref), `${PROVIDERS[ref.provider]} player`, `song-embed song-${ref.provider}${tall ? ' is-tall' : ''}`),
    h('p', { className: 'panel-footnote' }, h('a', { href: sourceUrl(ref), target: '_blank', rel: 'noopener noreferrer', text: `Open in ${PROVIDERS[ref.provider]}` })),
  ];
}

function statusLine(owner) {
  return h(
    'p',
    { className: 'panel-status' },
    h('span', { className: `status-dot${owner.online ? ' is-online' : ''}`, 'aria-hidden': 'true' }),
    [owner.online ? 'Online' : 'Offline', owner.status].filter(Boolean).join(' · '),
  );
}

function chips(items) {
  return h('ul', { className: 'panel-chips' }, items.map((item) => h('li', { text: item })));
}

function visitLine(visits) {
  if (!Number.isFinite(visits)) return null;
  const text = visits === 1 ? '1 visitor so far' : `${visits.toLocaleString()} visitors so far`;
  return h('p', { className: 'panel-visits', dataset: { testid: 'visit-count' }, text });
}

/** onEdit is given only to the room's owner; cityLabel is the owner's city, if shared. */
export function profilePanel(owner, { visits = null, onEdit = null, cityLabel = '' } = {}) {
  const name = owner.displayName || owner.username;
  return {
    kind: 'profile',
    kicker: 'About the owner',
    title: name,
    body: [
      h(
        'div',
        { className: 'profile-head' },
        h('span', { className: 'profile-avatar', 'aria-hidden': 'true', text: name.slice(0, 1).toUpperCase() }),
        h('div', {}, h('p', { className: 'profile-handle', text: `@${owner.username}` }), statusLine(owner)),
      ),
      cityLabel && h('p', { className: 'profile-city', dataset: { testid: 'profile-city-label' }, text: `Lives in ${cityLabel}` }),
      owner.bio && h('p', { className: 'panel-text', text: owner.bio }),
      owner.interests.length > 0 && [h('h3', { className: 'panel-subhead', text: 'Into' }), chips(owner.interests)],
      visitLine(visits),
      onEdit &&
        h('div', { className: 'panel-actions' }, h('button', { className: 'button', type: 'button', dataset: { testid: 'edit-profile' }, text: 'Edit your profile', onClick: onEdit })),
    ],
  };
}

function field(label, input) {
  return h('label', { className: 'form-field' }, h('span', { text: label }), input);
}

/** The owner's profile form. onSave gets { displayName, status, bio, interests, city }. */
export function profileForm(owner, { status = '', busy = false, cities = [], onSave, onCancel }) {
  const name = h('input', { name: 'displayName', maxlength: 40, value: owner.displayName, autocomplete: 'nickname', dataset: { testid: 'profile-name' } });
  const mood = h('input', { name: 'status', maxlength: 80, value: owner.status, placeholder: 'What are you up to?', dataset: { testid: 'profile-status' } });
  const bio = h('textarea', { name: 'bio', rows: '3', maxlength: 280, placeholder: 'A little about you', dataset: { testid: 'profile-bio' } });
  bio.value = owner.bio;
  const interests = h('input', {
    name: 'interests',
    maxlength: 400,
    value: owner.interests.join(', '),
    placeholder: 'plants, jazz, film',
    dataset: { testid: 'profile-interests' },
  });
  const city = h(
    'select',
    { name: 'city', dataset: { testid: 'profile-city' } },
    h('option', { value: '', text: "Don't show" }),
    [...cities].sort((a, b) => a.name.localeCompare(b.name)).map((c) => h('option', { value: c.id, text: c.name })),
  );
  city.value = owner.city ?? '';
  return [
    plainForm(
      'profile-form',
      () =>
        onSave({
          displayName: name.value,
          status: mood.value,
          bio: bio.value,
          interests: interests.value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 12),
          city: city.value || null,
        }),
      field('Display name', name),
      field('Status', mood),
      field('About you', bio),
      field('Interests (separated by commas)', interests),
      field('Your city (doors near you glow for people there)', city),
      h(
        'div',
        { className: 'panel-actions' },
        h('button', { className: 'button', type: 'submit', disabled: busy, dataset: { testid: 'profile-save' }, text: busy ? 'Saving…' : 'Save' }),
        h('button', { className: 'button button-quiet', type: 'button', text: 'Cancel', onClick: onCancel }),
      ),
    ),
    status && h('p', { className: 'panel-status-message', role: 'status', text: status }),
  ];
}

export function posterPanel(data, fallbackTitle) {
  const items = Array.isArray(data.items) ? data.items.map(String) : [];
  return {
    kind: 'poster',
    kicker: data.subtitle || 'Poster',
    title: data.title || fallbackTitle,
    body: [
      data.description && h('p', { className: 'panel-text', text: data.description }),
      items.length > 0 ? h('ol', { className: 'panel-list' }, items.map((item) => h('li', { text: item }))) : null,
    ],
  };
}

export function collectionPanel(data, fallbackTitle) {
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    kind: 'collection',
    kicker: 'On the shelf',
    title: data.title || fallbackTitle,
    body:
      items.length > 0
        ? h(
            'ul',
            { className: 'collection-list' },
            items.map((item) =>
              h(
                'li',
                { className: 'collection-item' },
                h('span', { className: 'collection-icon', 'aria-hidden': 'true', text: COLLECTION_ICONS[item.type] ?? '✨' }),
                h('span', {}, h('strong', { text: item.title }), item.by && h('span', { className: 'muted', text: ` · ${item.by}` })),
              ),
            ),
          )
        : h('p', { className: 'panel-text muted', text: 'Nothing on display yet.' }),
  };
}

export function mediaPanel(data, fallbackTitle) {
  const media = data.media ?? {};
  const title = media.title || fallbackTitle;
  const video = embedUrl(data.video);
  const legacy = isSafeEmbedUrl(media.embedUrl) ? media.embedUrl : null;
  const screen =
    video || legacy
      ? embedFrame(video || legacy, title, 'tv-embed')
      : h(
          'div',
          { className: 'tv-screen', role: 'img', 'aria-label': `Now showing: ${title}` },
          h('span', { className: 'tv-screen-kicker', text: 'Now showing' }),
          h('span', { className: 'tv-screen-title', text: title }),
        );
  return {
    kind: 'media',
    kicker: 'On the TV',
    title,
    body: [
      screen,
      (media.year || media.kind) && h('p', { className: 'muted', text: [media.kind, media.year].filter(Boolean).join(' · ') }),
      media.description && h('p', { className: 'panel-text', text: media.description }),
    ],
  };
}

/** Photos pegged on a photo string. urls[i] is null for a photo kept on another device. */
export function photosPanel(urls, title) {
  const shown = urls.filter(Boolean);
  return {
    kind: 'photos',
    kicker: 'Photos',
    title,
    body:
      shown.length > 0
        ? h(
            'ul',
            { className: 'photo-grid' },
            shown.map((url, i) => h('li', {}, h('img', { src: url, alt: `Photo ${i + 1} of ${shown.length}`, loading: 'lazy' }))),
          )
        : h('p', { className: 'panel-text muted', text: 'No photos here yet.' }),
  };
}

/** The keyboard- and screen-reader-friendly list of everything the viewer can use. */
function guideSteps(steps) {
  return h(
    'ol',
    { className: 'guide-steps' },
    steps.map(([icon, title, text]) =>
      h('li', {}, h('span', { className: 'guide-icon', 'aria-hidden': 'true', text: icon }), h('span', {}, h('strong', { text: title }), ' ', text)),
    ),
  );
}

/**
 * How to use a room, shown on a first visit and from the Help button. `touch` words it
 * for phones; owners (`canEdit`) also hear about the editor.
 */
export function roomGuide({ roomName, touch, canEdit, onEdit, onDone }) {
  const steps = [
    touch
      ? ['👆', 'Look and walk.', 'Drag to look around, and tap the floor to walk there. Overview (⤢) shows the whole room.']
      : ['🖱️', 'Look and walk.', 'Drag to look around. Click the floor, or use W A S D, to walk. Overview shows the whole room.'],
    touch
      ? ['✨', 'Tap things.', 'Most things do something: tap the record player, a photo, the bookshelf, the TV, or a sofa to sit on it.']
      : ['✨', 'Point at things, then click.', 'Anything that glows and shows a label does something: play the record player, open a photo, browse the bookshelf, sit on the sofa.'],
    ['📌', 'Say hi.', 'Pin a note on the noticeboard or leave a gift on the table by the door.'],
    ['☰', 'Lost?', 'Things here lists everything you can use.'],
    ['🚪', 'Knock on more doors.', 'Hallway takes you back to the rails.'],
  ];
  if (canEdit) steps.splice(3, 0, ['✎', 'Make it yours.', 'Edit room lets you add, move, and recolour things.']);
  return {
    kind: 'guide',
    kicker: 'How it works',
    title: canEdit ? 'Welcome home' : `Welcome to ${roomName}`,
    body: [
      guideSteps(steps),
      h(
        'div',
        { className: 'panel-actions' },
        canEdit ? h('button', { className: 'button', type: 'button', dataset: { testid: 'guide-edit' }, text: 'Start decorating', onClick: onEdit }) : null,
        h('button', { className: canEdit ? 'button button-quiet' : 'button', type: 'button', dataset: { testid: 'guide-done' }, text: canEdit ? 'Look around first' : 'Got it', onClick: onDone }),
      ),
    ],
  };
}

/** Tips for decorating, shown over the open editor when someone first gets their room. */
export function editGuide({ touch, onDone }) {
  const steps = touch
    ? [
        ['➕', 'Add things.', 'Pick something in the panel below, then tap the floor or a wall where it should go.'],
        ['👆', 'Move things.', 'Tap something to select it, then drag it. The toolbar turns, nudges, and recolours it.'],
        ['🎨', 'Change the look.', 'The Look tab has walls, floors, lighting, and the view outside.'],
        ['💾', 'Save.', 'Tap Save at the top when you’re done. Edit room brings this back any time.'],
      ]
    : [
        ['➕', 'Add things.', 'Pick something in the panel, then click in the room where it should go.'],
        ['🖱️', 'Move things.', 'Drag them around. R turns, Delete removes; click something to change its colour and size.'],
        ['🎨', 'Change the look.', 'The Look tab has walls, floors, lighting, and the view outside.'],
        ['💾', 'Save.', 'Press Save when you’re done. Edit room brings this back any time.'],
      ];
  return {
    kind: 'guide',
    kicker: 'Your room is ready',
    title: 'Make it yours',
    body: [
      h('p', { className: 'muted', text: 'This is your room. Everyone who knocks on your door sees it, so decorate it with things you love. Your desk holds your profile.' }),
      guideSteps(steps),
      h('div', { className: 'panel-actions' }, h('button', { className: 'button', type: 'button', dataset: { testid: 'guide-done' }, text: 'Start decorating', onClick: onDone })),
    ],
  };
}

export function thingsPanel(items, verbs, onChoose) {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
  return {
    kind: 'things',
    kicker: 'In this room',
    title: 'Things here',
    body:
      sorted.length > 0
        ? h(
            'ul',
            { className: 'things-list' },
            sorted.map((item) =>
              h(
                'li',
                {},
                h(
                  'button',
                  { className: 'things-item', type: 'button', dataset: { objectId: item.objectId }, onClick: () => onChoose(item) },
                  h('span', { className: 'things-name', text: item.name }),
                  h('span', { className: 'things-verb muted', text: verbs[item.type] ?? '' }),
                ),
              ),
            ),
          )
        : h('p', { className: 'muted', text: "There's nothing you can use here yet." }),
  };
}

export function doorPanel(owner, leaveUrl, onStepOutside = null, visits = null) {
  return {
    kind: 'door',
    kicker: 'Front door',
    title: `@${owner.username}`,
    body: [
      statusLine(owner),
      h('p', { className: 'panel-text', text: `This is ${owner.displayName || owner.username}'s door. Knocking arrives with the hallway.` }),
      visitLine(visits),
      h(
        'div',
        { className: 'panel-actions' },
        onStepOutside &&
          h('button', { className: 'button', type: 'button', dataset: { testid: 'step-outside' }, text: 'Step outside', onClick: onStepOutside }),
        h('a', { className: 'button button-quiet', href: leaveUrl, dataset: { testid: 'leave-room' }, text: 'Leave the room' }),
      ),
    ],
  };
}

export function secretPanel(data) {
  const secret = data.secret ?? {};
  const items = Array.isArray(secret.items) ? secret.items.map(String) : [];
  return {
    kind: 'secret',
    kicker: 'Secret chest',
    title: secret.title || 'Something hidden',
    body: [
      secret.message && h('p', { className: 'panel-text secret-note', text: secret.message }),
      items.length > 0 && h('ul', { className: 'panel-list' }, items.map((item) => h('li', { text: item }))),
    ],
  };
}

export function musicBody({ track, playing, supported, onToggle }) {
  return [
    h(
      'div',
      { className: 'music-card' },
      h('span', { className: `music-disc${playing ? ' is-spinning' : ''}`, 'aria-hidden': 'true' }),
      h('div', {}, h('p', { className: 'music-title', text: track.title }), h('p', { className: 'muted', text: track.artist })),
    ),
    supported
      ? h('button', {
          className: 'button',
          type: 'button',
          dataset: { testid: 'music-toggle' },
          'aria-pressed': String(playing),
          text: playing ? 'Pause' : 'Play',
          onClick: onToggle,
        })
      : h('p', { className: 'muted', text: "Audio isn't available in this browser." }),
    track.note && h('p', { className: 'panel-text muted', text: track.note }),
  ];
}

function signInPrompt(what) {
  const here = window.location.pathname + window.location.search;
  return h(
    'p',
    { className: 'panel-footnote', dataset: { testid: 'sign-in-prompt' } },
    h('a', { href: `/signin?next=${encodeURIComponent(here)}`, text: 'Sign in' }),
    ` to ${what}.`,
  );
}

function plainForm(testid, onSubmit, ...fields) {
  const form = h('form', { className: 'panel-form', dataset: { testid } }, ...fields);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({ submitter: event.submitter, form });
  });
  return form;
}

export function noticeboardBody({ notes, status, signedIn, onPost }) {
  const message = h('textarea', {
    name: 'message',
    rows: '3',
    maxlength: MAX_MESSAGE_LENGTH,
    placeholder: 'Leave a note…',
    'aria-label': 'Your note',
    required: true,
  });
  return [
    notes.length > 0
      ? h(
          'ul',
          { className: 'note-list' },
          notes.map((note) =>
            h('li', { className: 'note' }, h('p', { className: 'note-message', text: note.message }), h('p', { className: 'note-author', text: `— ${note.author}` })),
          ),
        )
      : h('p', { className: 'muted', text: 'No notes yet. Be the first!' }),
    signedIn
      ? plainForm('note-form', () => onPost({ message: message.value }), message, h('button', { className: 'button', type: 'submit', text: 'Pin note' }))
      : signInPrompt('pin a note'),
    status && h('p', { className: 'panel-status-message', role: 'status', text: status }),
  ];
}

export function giftsBody({ gifts, status, signedIn, onGive }) {
  const buttons = Object.entries(GIFTS).map(([id, gift]) =>
    h('button', { className: 'gift-button', type: 'submit', value: id, dataset: { gift: id } }, h('span', { 'aria-hidden': 'true', text: gift.icon }), ` ${gift.label}`),
  );
  return [
    gifts.length > 0
      ? h(
          'ul',
          { className: 'gift-list' },
          gifts.map((entry) => h('li', { text: `${GIFTS[entry.gift].icon} ${GIFTS[entry.gift].label} from ${entry.author}` })),
        )
      : h('p', { className: 'muted', text: 'The table is empty for now.' }),
    h('h3', { className: 'panel-subhead', text: 'Leave a gift' }),
    signedIn
      ? plainForm('gift-form', ({ submitter }) => onGive({ gift: submitter?.value }), h('div', { className: 'gift-buttons' }, buttons))
      : signInPrompt('leave a gift'),
    status && h('p', { className: 'panel-status-message', role: 'status', text: status }),
  ];
}
