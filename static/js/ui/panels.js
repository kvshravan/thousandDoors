import { h } from './dom.js';
import { GIFTS, MAX_AUTHOR_LENGTH, MAX_MESSAGE_LENGTH } from './room-store.js';

// Builders for the content shown in the interaction panel. All text goes through
// h(), which uses textContent, so room data and visitor input can't inject HTML.

const COLLECTION_ICONS = { book: '📚', game: '🎮', collectible: '🏆', record: '💿' };
const SAFE_EMBED = /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{6,20}$/;

export function isSafeEmbedUrl(url) {
  return typeof url === 'string' && SAFE_EMBED.test(url);
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

export function profilePanel(owner) {
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
      owner.bio && h('p', { className: 'panel-text', text: owner.bio }),
      owner.interests.length > 0 && [h('h3', { className: 'panel-subhead', text: 'Into' }), chips(owner.interests)],
    ],
  };
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
  const screen = isSafeEmbedUrl(media.embedUrl)
    ? h('iframe', {
        className: 'tv-embed',
        src: media.embedUrl,
        title,
        allow: 'encrypted-media; picture-in-picture',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: true,
        loading: 'lazy',
      })
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

export function doorPanel(owner, leaveUrl) {
  return {
    kind: 'door',
    kicker: 'Front door',
    title: `@${owner.username}`,
    body: [
      statusLine(owner),
      h('p', { className: 'panel-text', text: `This is ${owner.displayName || owner.username}'s door. Knocking arrives with the hallway.` }),
      h('a', { className: 'button', href: leaveUrl, dataset: { testid: 'leave-room' }, text: 'Leave the room' }),
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

function namedForm({ testid, placeholder, onSubmit }, ...fields) {
  const author = h('input', {
    name: 'author',
    type: 'text',
    maxlength: MAX_AUTHOR_LENGTH,
    placeholder,
    autocomplete: 'nickname',
    'aria-label': 'Your name',
  });
  const form = h('form', { className: 'panel-form', dataset: { testid } }, author, ...fields);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit({ author: author.value, submitter: event.submitter, form });
  });
  return form;
}

export function noticeboardBody({ notes, status, onPost }) {
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
    namedForm(
      { testid: 'note-form', placeholder: 'Your name (optional)', onSubmit: ({ author }) => onPost({ author, message: message.value }) },
      message,
      h('button', { className: 'button', type: 'submit', text: 'Pin note' }),
    ),
    status && h('p', { className: 'panel-status-message', role: 'status', text: status }),
    h('p', { className: 'panel-footnote', text: 'Notes are saved in this browser until accounts arrive.' }),
  ];
}

export function giftsBody({ gifts, status, onGive }) {
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
    namedForm(
      { testid: 'gift-form', placeholder: 'Your name (optional)', onSubmit: ({ author, submitter }) => onGive({ author, gift: submitter?.value }) },
      h('div', { className: 'gift-buttons' }, buttons),
    ),
    status && h('p', { className: 'panel-status-message', role: 'status', text: status }),
  ];
}
