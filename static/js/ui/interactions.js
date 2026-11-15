import { cleanGift, cleanNote } from './room-store.js';
import {
  collectionPanel,
  doorPanel,
  giftsBody,
  mediaPanel,
  musicBody,
  noticeboardBody,
  photosPanel,
  posterPanel,
  profilePanel,
  profileForm,
  secretPanel,
  songBody,
} from './panels.js';
import { isMediaRef } from '../media.js';
import { cityName, loadCities } from '../cities.js';

const WINDOW_VIEWS = { day: 'a sunny day', evening: 'the evening sky', night: 'the night sky' };

/**
 * Maps interaction types (from the catalogue) to handlers. Add a type here
 * instead of adding object-specific click logic elsewhere.
 *
 * Each handler receives { objectId, catalogId, name, type, data, lampOn }.
 * ctx: { photoViewer, panel, music, store, getScene, getRoom, sit, leaveUrl, announce }
 */
export function createInteractionRegistry(ctx) {
  const scene = () => ctx.getScene();
  const owner = () => ctx.getRoom().owner;

  return {
    photograph: async ({ data, name }) => {
      const src = await ctx.images?.resolve(data.imageUrl);
      if (src) ctx.photoViewer.open({ src, caption: data.caption ?? name });
      else ctx.announce?.("This photo is only on its owner's device for now.");
    },
    photos: async ({ data, name }) => {
      const refs = Array.isArray(data.photos) ? data.photos : [];
      const urls = await Promise.all(refs.map((ref) => ctx.images?.resolve(ref) ?? null));
      ctx.panel.open(photosPanel(urls, name));
    },
    lamp: ({ objectId, name }) => {
      const on = scene()?.toggleLamp(objectId);
      if (typeof on === 'boolean') ctx.announce?.(`${name} switched ${on ? 'on' : 'off'}.`);
    },
    profile: () => openProfile(ctx),
    poster: ({ data, name }) => ctx.panel.open(posterPanel(data, name)),
    collection: ({ data, name }) => ctx.panel.open(collectionPanel(data, name)),
    media: ({ data, name }) => ctx.panel.open(mediaPanel(data, name)),
    door: () => ctx.panel.open(doorPanel(owner(), ctx.leaveUrl, ctx.stepOutside, ctx.getRoom().visits)),
    window: ({ objectId }) => {
      const view = scene()?.runAction(objectId, 'cycle');
      if (view) ctx.announce?.(`The window now shows ${WINDOW_VIEWS[view] ?? view}.`);
    },
    seat: ({ objectId }) => ctx.sit(objectId),
    secret: ({ objectId, data }) => {
      scene()?.runAction(objectId, 'setOpen', true);
      ctx.panel.open({ ...secretPanel(data), onClose: () => scene()?.runAction(objectId, 'setOpen', false) });
    },
    music: ({ objectId, data }) => openMusic(ctx, objectId, data),
    noticeboard: ({ objectId, data }) => openNoticeboard(ctx, objectId, data),
    gifts: ({ objectId, data }) => openGifts(ctx, objectId, data),
  };
}

export const INTERACTION_VERBS = Object.freeze({
  photograph: 'View photo',
  photos: 'Look at the photos',
  lamp: 'Switch on or off',
  profile: 'About the owner',
  poster: 'Look closer',
  collection: 'Browse the shelf',
  media: "See what's on",
  door: 'Front door',
  window: 'Change the view',
  seat: 'Sit down',
  secret: 'Open',
  music: 'Play music',
  noticeboard: 'Read and leave notes',
  gifts: 'Leave a gift',
});

export function handleInteraction(registry, event) {
  const handler = registry[event.type];
  if (!handler) {
    console.warn(`[room] No handler for interaction "${event.type}".`);
    return false;
  }
  handler(event);
  return true;
}

/** Visitor contributions shown for a room: seeded mock data plus everyone's additions. */
export function noteCount(ctx, data) {
  return (data.entries ?? []).length + (ctx.store?.list('notes').length ?? 0);
}

export function giftCount(ctx, data) {
  return (data.gifts ?? []).length + (ctx.store?.list('gifts').length ?? 0);
}

function openProfile(ctx) {
  const room = ctx.getRoom();
  let cities = null;
  let editing = false;
  const panelFor = () =>
    profilePanel(room.owner, {
      visits: room.visits,
      cityLabel: cities ? cityName(cities, room.owner.city) : '',
      onEdit: ctx.profile?.canEdit() ? () => edit() : null,
    });
  const show = () => {
    editing = false;
    ctx.panel.open(panelFor());
  };
  const edit = (status = '', busy = false) => {
    editing = true;
    ctx.panel.setBody(
      profileForm(room.owner, {
        status,
        busy,
        cities: cities?.cities ?? [],
        onCancel: show,
        onSave: async (fields) => {
          edit('', true);
          const error = await ctx.profile.save(fields);
          if (error) edit(error);
          else {
            show();
            ctx.announce?.('Your profile is updated.');
          }
        },
      }),
    );
  };
  show();
  // The city list is small; fetch it once, then show the owner's city (and fill the
  // form's list if it's already open).
  loadCities()
    .then((data) => {
      cities = data;
      if (!ctx.panel.isOpen || ctx.panel.kind !== 'profile') return;
      if (editing) edit();
      else if (room.owner.city) ctx.panel.setBody(panelFor().body);
    })
    .catch(() => {});
}

function openMusic(ctx, objectId, data) {
  if (isMediaRef(data.song)) {
    // A real song: the provider's player does the playing.
    ctx.music.stop();
    ctx.panel.open({ kind: 'music', kicker: 'Record player', title: `On the record player`, body: songBody(data.song) });
    return;
  }
  const track = data.track ?? { title: 'Silence', artist: '', notes: [] };
  const render = () => {
    const playing = ctx.music.playing && ctx.music.sourceId === objectId;
    ctx.panel.setBody(
      musicBody({
        track,
        playing,
        supported: ctx.music.supported,
        onToggle: () => {
          if (playing) ctx.music.stop();
          else ctx.music.play(track, objectId);
          render();
        },
      }),
    );
  };
  ctx.panel.open({ kind: 'music', kicker: 'Record player', title: track.title, body: [] });
  render();
}

function openNoticeboard(ctx, objectId, data) {
  const seeded = (data.entries ?? []).map((entry) => cleanNote(entry)).filter(Boolean);
  const render = (status = '') =>
    ctx.panel.setBody(
      noticeboardBody({
        notes: [...seeded, ...ctx.store.list('notes')],
        status,
        signedIn: ctx.store.signedIn,
        onPost: async (note) => {
          if (!note.message.trim()) {
            render('Write something first.');
            return;
          }
          const result = await ctx.store.add('notes', note);
          if (result.error) {
            render(result.error);
            return;
          }
          ctx.getScene()?.runAction(objectId, 'setCount', noteCount(ctx, data));
          render('Pinned! Thanks for stopping by.');
        },
      }),
    );
  const name = ctx.getRoom().owner.displayName;
  ctx.panel.open({ kind: 'noticeboard', kicker: 'Noticeboard', title: name ? `Notes for ${name}` : 'Notes', body: [] });
  render();
}

function openGifts(ctx, objectId, data) {
  const seeded = (data.gifts ?? []).map((entry) => cleanGift(entry ?? {})).filter(Boolean);
  const render = (status = '') =>
    ctx.panel.setBody(
      giftsBody({
        gifts: [...seeded, ...ctx.store.list('gifts')],
        status,
        signedIn: ctx.store.signedIn,
        onGive: async (gift) => {
          const result = await ctx.store.add('gifts', gift);
          if (result.error) {
            render(result.error);
            return;
          }
          ctx.getScene()?.runAction(objectId, 'setCount', giftCount(ctx, data));
          render('Your gift is on the table.');
        },
      }),
    );
  ctx.panel.open({ kind: 'gifts', kicker: 'Gift table', title: 'Gifts', body: [] });
  render();
}
