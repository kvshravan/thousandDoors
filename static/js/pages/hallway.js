import { Engine } from '../three/engine.js';
import { doorColor } from '../three/hallway/doors.js';
import { HallwayControls, HallwayScene } from '../three/hallway/hallway-scene.js';
import { detectQuality, isWebGL2Available } from '../three/quality.js';
import { HallwayMusic } from '../ui/hallway-music.js';
import { me } from '../auth.js';
import { citiesNear, cityName } from '../cities.js';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const CLAIM_URL = '/welcome';
const FADE_MS = 450;
const MUSIC_KEY = 'doors:hallway-music';
const CITY_KEY = 'doors:city';

function savedCity() {
  try {
    return window.localStorage.getItem(CITY_KEY) || '';
  } catch {
    return '';
  }
}

/** Colours the little door swatches in the server-rendered lists. */
function paintSwatches(root) {
  for (const link of root.querySelectorAll('[data-color]')) {
    link.style.setProperty('--door', doorColor(link.dataset.color || null));
  }
}

class HallwayPage {
  constructor(root) {
    this.root = root;
    this.stage = root.querySelector('#hallway-stage');
    this.announcer = root.querySelector('#hallway-announcer');
    this.tooltip = root.querySelector('#hallway-tooltip');
    this.card = root.querySelector('#door-card');
    this.rideHud = root.querySelector('#hallway-ride');
    this.dialog = root.querySelector('#find-dialog');
    this.search = this.dialog.querySelector('input[type="search"]');
    this.fade = root.querySelector('#hallway-fade');
    this.fallback = root.querySelector('#hallway-fallback');
    this.dock = root.querySelector('.hallway-dock');
    this.rideButton = root.querySelector('[data-action="ride"]');
    this.lookButton = root.querySelector('[data-action="overview"]');
    this.soundButton = root.querySelector('[data-action="sound"]');
    this.music = new HallwayMusic();
    this._setUpMusic();
    this.doors = JSON.parse(root.querySelector('#hallway-doors').textContent);
    this.cities = JSON.parse(root.querySelector('#hallway-cities').textContent);
    this.citySelect = this.dialog.querySelector('[data-city-select]');
    this.nearCountBadge = root.querySelector('[data-near-count]');
    this.city = '';
    this.near = new Set();
    this.reducedMotion = prefersReducedMotion();
    this.state = 'idle';
    this.engine = null;
    this.view = null;
    this.selected = null;
    this._hoverPoint = null;
    this._hoverQueued = false;

    paintSwatches(root);
    root.addEventListener('click', (event) => this._onClick(event));
    this.search.addEventListener('input', () => this._filter());
    this.citySelect.addEventListener('change', () => this._chooseCity(this.citySelect.value));
    document.addEventListener('keydown', (event) => this._onKey(event));
    // Coming back with the browser's Back button can restore the page mid-arrival.
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) this._resetArrival();
    });
    // Before the vault is built, so doors near you get the rails nearest you.
    this._setCity(savedCity(), { sort: true });
  }

  mount() {
    if (!isWebGL2Available()) {
      this.state = 'unsupported';
      this.fallback.hidden = false;
      this.dock.hidden = true;
      return;
    }
    const override = new URLSearchParams(window.location.search).get('quality');
    const quality = detectQuality(override);
    this.engine = new Engine(this.stage, { quality, onContextLost: () => this._lost() });
    this.view = new HallwayScene({ quality, doors: this.doors, reducedMotion: this.reducedMotion });
    this.view.setNear(this.near);
    this.engine.setView(this.view);
    this.engine.start();

    const canvas = this.engine.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A vast hallway of doors gliding along rails');
    canvas.setAttribute('aria-describedby', 'hallway-keys-help');
    this.controls = new HallwayControls(this.view, canvas, {
      onTap: (x, y) => this._onTap(x, y),
      onHover: (x, y) => this._queueHover(x, y),
    });

    if (this.reducedMotion) {
      this.rideButton.disabled = true;
      this.rideButton.title = 'Riding is off while your device asks for reduced motion.';
    }
    this.state = 'ready';
    this._useProfileCity();
  }

  // ---- Doors near you ----

  /** Signed in with a city on your profile, and none picked in this browser: use it. */
  async _useProfileCity() {
    if (savedCity()) return;
    const city = (await me())?.profile?.city;
    if (city && !savedCity()) this._setCity(city);
  }

  _chooseCity(cityId) {
    try {
      if (cityId) window.localStorage.setItem(CITY_KEY, cityId);
      else window.localStorage.removeItem(CITY_KEY);
    } catch {
      // Not remembered; it still works for this visit.
    }
    this._setCity(cityId);
    const count = this.near.size;
    this._announce(cityId ? `${count} ${count === 1 ? 'door glows' : 'doors glow'} near ${cityName(this.cities, cityId)}.` : 'Nearby doors are off.');
  }

  /**
   * Which doors are near `cityId` (none if empty). With sort, those doors move to the
   * front of the door list, so the vault puts them on the rails closest to you.
   */
  _setCity(cityId, { sort = false } = {}) {
    this.city = this.cities.cities.some((city) => city.id === cityId) ? cityId : '';
    const cities = citiesNear(this.cities, this.city);
    this.near = new Set(this.doors.filter((door) => door.city && cities.has(door.city)).map((door) => door.id));
    if (sort) this.doors = [...this.doors.filter((d) => this.near.has(d.id)), ...this.doors.filter((d) => !this.near.has(d.id))];
    this.citySelect.value = this.city;
    this.view?.setNear(this.near);
    this.nearCountBadge.hidden = this.near.size === 0;
    this.nearCountBadge.textContent = `${this.near.size} near you`;
    for (const list of this.root.querySelectorAll('[data-door-list]')) {
      const items = [...list.children];
      for (const item of items) {
        const near = this.near.has(item.dataset.room);
        item.classList.toggle('is-near', near);
        item.querySelector('[data-near-badge]').hidden = !near;
      }
      // Near doors first, otherwise in the server's order.
      items.sort((a, b) => Number(this.near.has(b.dataset.room)) - Number(this.near.has(a.dataset.room)) || a.dataset.order - b.dataset.order);
      list.append(...items);
    }
  }

  // ---- Picking doors ----

  _queueHover(x, y) {
    this._hoverPoint = x === null ? null : { x, y };
    if (this._hoverQueued) return;
    this._hoverQueued = true;
    requestAnimationFrame(() => {
      this._hoverQueued = false;
      this._hover(this._hoverPoint);
    });
  }

  _hover(point) {
    if (!this.view || this.view.arrival) return;
    const slot = point ? this.view.pick(point.x, point.y, this.engine.canvas) : null;
    if (!this.selected) this.view.highlight(slot);
    this.engine.canvas.style.cursor = slot ? 'pointer' : '';
    if (!slot) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.textContent = slot.door ? `${slot.door.name}’s door` : 'Unclaimed door';
    this.tooltip.style.transform = `translate(${point.x + 14}px, ${point.y + 14}px)`;
    this.tooltip.hidden = false;
  }

  _onTap(x, y) {
    if (!this.view || this.view.arrival) return;
    const slot = this.view.pick(x, y, this.engine.canvas);
    if (this.view.mode === 'ride') {
      if (slot) this._ride(slot);
      return;
    }
    if (slot) this._openCard(slot);
    else this._closeCard();
  }

  _openCard(slot) {
    this.selected = slot;
    this.view.highlight(slot);
    this.tooltip.hidden = true;
    const { door } = slot;
    this.card.querySelector('[data-card-name]').textContent = door ? `${door.name}’s door` : 'An unclaimed door';
    const visits = door?.visits ? ` · ${door.visits.toLocaleString()} ${door.visits === 1 ? 'visitor' : 'visitors'}` : '';
    const where = door?.city ? `${this.near.has(door.id) ? 'Near you · ' : ''}${cityName(this.cities, door.city)}` : '';
    this.card.querySelector('[data-card-where]').textContent = where;
    this.card.querySelector('[data-card-where]').hidden = !where;
    this.card.classList.toggle('is-near', Boolean(door && this.near.has(door.id)));
    this.card.querySelector('[data-card-status]').textContent = door
      ? `${door.status || 'Knock and step inside.'}${visits}`
      : 'Nobody lives here yet. Make it yours.';
    this.card.querySelector('[data-card-swatch]').style.background = door ? doorColor(door.color) : slot.base.getStyle();
    const visit = this.card.querySelector('[data-card-visit]');
    visit.href = door ? `/room/${door.id}` : CLAIM_URL;
    visit.textContent = door ? 'Open the door' : 'Claim it';
    this.card.querySelector('[data-action="ride-card"]').hidden = this.reducedMotion;
    this.card.hidden = false;
    this._announce(door ? `${door.name}’s door. Open the door, or ride it.` : 'An unclaimed door.');
  }

  _closeCard() {
    this.selected = null;
    this.card.hidden = true;
    this.view?.highlight(null);
  }

  // ---- Music ----

  _setUpMusic() {
    if (!this.music.supported) return;
    this.soundButton.hidden = false;
    let wanted = true;
    try {
      wanted = window.localStorage.getItem(MUSIC_KEY) !== 'off';
    } catch {
      // Storage blocked: on, as by default.
    }
    this._soundLabel(wanted);
    // On by default, but browsers only allow sound after a click or key press, so it
    // starts with the first one (the Music button handles its own clicks). Later
    // gestures wake it again if the browser kept it suspended.
    const wake = (event) => {
      if (event.target.closest?.('[data-action="sound"]')) return;
      if (this._musicWanted) this._startMusic();
    };
    document.addEventListener('pointerdown', wake, true);
    document.addEventListener('keydown', wake, true);
  }

  get _musicWanted() {
    return this.soundButton.getAttribute('aria-pressed') === 'true';
  }

  _toggleMusic() {
    const on = !this._musicWanted;
    if (on) this._startMusic();
    else this.music.stop();
    this._soundLabel(on);
    try {
      window.localStorage.setItem(MUSIC_KEY, on ? 'on' : 'off');
    } catch {
      // Not remembered; that's fine.
    }
  }

  _startMusic() {
    if (document.body.classList.contains('is-arriving')) return;
    this.music.start();
    this.music.setMode(this.view?.mode === 'ride' ? 'ride' : 'overview');
  }

  _soundLabel(on) {
    this.soundButton.setAttribute('aria-pressed', String(on));
  }

  // ---- Riding ----

  _ride(slot = null) {
    if (!this.view || this.reducedMotion) return;
    this._closeCard();
    const rider = this.view.ride(slot);
    if (!rider) return;
    this.music.setMode('ride');
    this.rideHud.querySelector('[data-ride-name]').textContent = rider.door ? rider.door.name : 'an unclaimed door';
    this.rideHud.querySelector('[data-action="visit-ride"]').textContent = rider.door ? 'Open it' : 'Claim it';
    this.rideHud.hidden = false;
    this._setMode('ride');
    this._announce(`Riding ${rider.door ? `${rider.door.name}’s door` : 'an unclaimed door'}. Tap another door to hop on it.`);
  }

  _hopOff() {
    this.view?.hopOff();
    this.music.setMode('overview');
    this.rideHud.hidden = true;
    this._setMode('overview');
  }

  _setMode(mode) {
    this.lookButton.setAttribute('aria-pressed', String(mode === 'overview'));
    this.rideButton.setAttribute('aria-pressed', String(mode === 'ride'));
  }

  // ---- Arriving ----

  /** Glides the door in, opens it, and goes through to the room (or to claiming it). */
  async arrive(slot) {
    if (!slot.door) {
      window.location.assign(CLAIM_URL);
      return;
    }
    if (document.body.classList.contains('is-arriving')) return;
    document.body.classList.add('is-arriving');
    this._closeCard();
    this.rideHud.hidden = true;
    this.tooltip.hidden = true;
    this._announce(`Opening ${slot.door.name}’s door…`);
    const url = `/room/${encodeURIComponent(slot.door.id)}?from=hallway`;
    this.arrivingTo = url;
    let fadedAt = null;
    const fadeIn = () => {
      fadedAt ??= performance.now();
      this.fade.classList.add('is-on');
      this.music.fadeOut(0.9);
    };
    await this.view.arrive(slot, { onOpen: () => this.music.creak(), onEnter: fadeIn });
    fadeIn();
    // Let the warm light finish filling the screen.
    const left = FADE_MS - (performance.now() - fadedAt);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
    if (this.arrivingTo === url) window.location.assign(url);
  }

  _resetArrival() {
    this.arrivingTo = null;
    document.body.classList.remove('is-arriving');
    this.fade.classList.remove('is-on');
    this.view?.resetArrival();
    this.rideHud.hidden = true;
    this._setMode('overview');
  }

  // ---- Find a door ----

  _filter() {
    const query = this.search.value.trim().toLowerCase();
    let shown = 0;
    for (const item of this.dialog.querySelectorAll('[data-name]')) {
      const match = !query || item.dataset.name.includes(query);
      item.hidden = !match;
      if (match) shown += 1;
    }
    this.dialog.querySelector('[data-door-empty]').hidden = shown > 0;
  }

  _openFind() {
    this.search.value = '';
    this._filter();
    this.dialog.showModal();
    this.search.focus();
  }

  // ---- Events ----

  _onClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const roomLink = event.target.closest('a[data-room], a[data-card-visit]');
    if (action === 'overview') this._hopOff();
    else if (action === 'ride') this._ride();
    else if (action === 'hop-off') this._hopOff();
    else if (action === 'find') this._openFind();
    else if (action === 'sound') this._toggleMusic();
    else if (action === 'close-card') this._closeCard();
    else if (action === 'ride-card' && this.selected) this._ride(this.selected);
    else if (action === 'visit-ride' && this.view?.rider) this.arrive(this.view.rider);
    else if (roomLink && this.state === 'ready' && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
      const slot = roomLink.dataset.room ? this.view.fleet.slotForRoom(roomLink.dataset.room) : this.selected;
      if (!slot) return;
      event.preventDefault();
      if (this.dialog.open) this.dialog.close();
      this.arrive(slot);
    }
  }

  _onKey(event) {
    if (event.key !== 'Escape' || this.dialog.open) return;
    if (!this.card.hidden) this._closeCard();
    else if (this.view?.mode === 'ride') this._hopOff();
  }

  _announce(message) {
    this.announcer.textContent = '';
    window.setTimeout(() => {
      this.announcer.textContent = message;
    }, 50);
  }

  _lost() {
    this.state = 'error';
    this.fallback.hidden = false;
    this.dock.hidden = true;
  }

  getDebugInfo() {
    return {
      state: this.state,
      engine: this.engine?.getDebugInfo() ?? null,
      scene: this.view?.getDebugInfo() ?? null,
      selected: this.selected ? (this.selected.door?.id ?? 'unclaimed') : null,
      city: this.city,
      music: this.music.state,
    };
  }
}

const page = new HallwayPage(document);
page.mount();

if (document.documentElement.dataset.debug === '1') {
  window.__hallway = {
    get state() {
      return page.state;
    },
    info: () => page.getDebugInfo(),
    /** Client point of a door: by room id, 'claimed' or 'unclaimed' for any such one; or null. */
    pointFor: (roomId) => {
      const { view, engine } = page;
      if (!view) return null;
      const all = view.fleet.slots;
      let slots = [view.fleet.slotForRoom(roomId)];
      if (roomId === 'unclaimed') slots = all.filter((s) => !s.door);
      else if (roomId === 'claimed') slots = all.filter((s) => s.door);
      for (const slot of slots) {
        const point = slot && view.screenPoint(slot, engine.canvas);
        // Skip doors hidden behind the page's own bars and cards.
        if (point && document.elementFromPoint(point.x, point.y) === engine.canvas) {
          return { ...point, id: slot.door?.id ?? null };
        }
      }
      return null;
    },
    /** 0 freezes the doors (so tests can click one), 1 is normal speed. */
    setTimeScale: (scale) => {
      if (page.view) page.view.timeScale = scale;
    },
    /**
     * Freezes the doors at a moment when the given door ('claimed', 'unclaimed', or a
     * room id) can be clicked, and returns its client point (or null).
     */
    bringIntoView: async (roomId) => {
      const { view, engine } = page;
      if (!view) return null;
      view.timeScale = 0;
      // Hold the camera still too (no idle drift).
      view.idle = -1e9;
      const start = view.time;
      for (let step = 0; step < 480; step += 1) {
        view.time = start + step * 0.25;
        view.fleet.update(view.time);
        const point = window.__hallway.pointFor(roomId);
        if (point) {
          view.dirty = true;
          await engine.waitForFrame();
          return point;
        }
      }
      return null;
    },
    /** Slows the arrival down (for looking at it), 1 is normal speed. */
    setArrivalRate: (rate) => {
      if (page.view) page.view.arrivalRate = rate;
    },
    waitForFrame: () => page.engine?.waitForFrame(),
  };
}
