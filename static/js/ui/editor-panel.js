import {
  FLOORS,
  ITEM_COLORS,
  ITEM_SIZES,
  LANDSCAPES,
  LIGHT_BRIGHTNESS,
  LIGHT_COLORS,
  LIGHT_EFFECTS,
  LIGHTING_MOODS,
  THEMES,
  WALLPAPERS,
} from '../three/room-config.js';
import { h } from './dom.js';
import { DEMO_PHOTOS } from './image-store.js';

// Catalogue categories, in the order they're shown. Others go at the end.
const CATEGORIES = [
  ['furniture', 'Furniture'],
  ['seating', 'Seating'],
  ['lighting', 'Lighting'],
  ['music', 'Music'],
  ['tech', 'Tech'],
  ['decor', 'Decor'],
  ['wall', 'On the wall'],
  ['hobbies', 'Hobbies'],
];
const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);
const LOOK_GROUPS = [
  {
    key: 'wallpaper',
    label: 'Walls',
    presets: WALLPAPERS,
    swatch: (p) => `linear-gradient(${p.plaster} 0 60%, ${p.wainscot} 60% 100%)`,
  },
  {
    key: 'floor',
    label: 'Floor',
    presets: FLOORS,
    swatch: (p) => `repeating-linear-gradient(90deg, ${p.floorLight} 0 10px, ${p.floorDark} 10px 20px)`,
  },
  {
    key: 'lighting',
    label: 'Lighting',
    presets: LIGHTING_MOODS,
    swatch: (p) => `linear-gradient(${p.hemisphere.sky}, ${p.sun.color})`,
  },
  {
    key: 'landscape',
    label: 'Outside',
    presets: LANDSCAPES,
    swatch: (p) => `linear-gradient(${p.swatch[0]} 0 55%, ${p.swatch[1]} 55% 100%)`,
  },
];
const ORIGINAL_SWATCH = 'repeating-linear-gradient(135deg, #f1e4cf 0 6px, #b07a4f 6px 12px)';

const title = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const swatchColor = (value) => THEMES.cozy[value] ?? value;
const words = (text) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * The editor's HTML panel. It only renders state and reports what the user asked
 * for; the EditorController and page decide what actually happens.
 */
export class EditorPanel {
  constructor(root, { catalog, modelsUrl, onAdd, onAppearance, onCommand, onUpload }) {
    this.root = root;
    this.catalogList = root.querySelector('[data-editor-catalog]');
    this.filterList = root.querySelector('[data-editor-filters]');
    this.searchInput = root.querySelector('[data-editor-search]');
    this.emptyNote = root.querySelector('[data-editor-empty]');
    this.itemPanel = root.querySelector('[data-editor-item]');
    this.lookList = root.querySelector('[data-editor-look]');
    this.selection = root.querySelector('[data-editor-selection]');
    this.selectionName = root.querySelector('[data-editor-selection-name]');
    this.status = root.querySelector('[data-editor-status]');
    this.tabs = [...root.querySelectorAll('[role="tab"]')];
    this.onAdd = onAdd;
    this.onAppearance = onAppearance;
    this.onCommand = onCommand;
    this.onUpload = onUpload;
    this.filter = 'all';
    this.library = [...DEMO_PHOTOS];
    this._lastSelectedId = null;
    this._itemKey = null;
    this._lastState = null;
    this._swipedAt = -Infinity;
    this._touchPress = null;
    this._touchActivated = null;

    root.addEventListener('click', (event) => {
      // Already handled on touch release (see _watchTouchTaps). The click that follows
      // can land on whatever has moved under the finger since, so drop it.
      const touched = this._touchActivated;
      this._touchActivated = null;
      if (
        event.isTrusted &&
        touched &&
        performance.now() - touched.at < 800 &&
        Math.hypot(event.clientX - touched.x, event.clientY - touched.y) < 30
      ) {
        event.preventDefault();
        return;
      }
      const button = event.target.closest('button');
      if (!button || !root.contains(button) || button.disabled) return;
      this._activate(button);
    });
    this._watchTouchTaps();
    this._watchHandle(root.querySelector('[data-sheet-toggle]'));
    // The 3D view and the floating toolbar sit just above the phone sheet.
    new ResizeObserver(() => {
      if (!this.root.hidden) document.documentElement.style.setProperty('--editor-height', `${this.root.offsetHeight}px`);
    }).observe(root);
    this.itemPanel.addEventListener('change', (event) => {
      const { target } = event;
      if (target.matches('[data-light-brightness]')) this.onCommand('light-brightness', target.value);
      else if (target.matches('[data-photo-upload]') && target.files?.[0]) {
        this.onUpload?.(target.files[0]);
        target.value = '';
      }
    });
    this.itemPanel.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.target.querySelector('[data-text-input]');
      if (input) this.onCommand('text', input.value);
    });
    this.searchInput.addEventListener('input', () => this._applyFilter());
    root.querySelector('[role="tablist"]').addEventListener('keydown', (event) => this._onTabKey(event));
    // Long lists are one Tab stop each; arrow keys move inside them.
    for (const container of [this.catalogList, this.filterList, this.itemPanel, this.lookList]) {
      // Within the item panel each option group (colour, size) is its own stop.
      const scope = (target) => target.closest?.('[role="group"]') ?? container;
      container.addEventListener('keydown', (event) => this._onGridKey(event, scope(event.target)));
      container.addEventListener('focusin', (event) => this._rove(scope(event.target), event.target));
    }

    this._renderCatalog(catalog, modelsUrl);
    this._renderLook();
    this._resetRoving(this.catalogList);
    this._resetRoving(this.filterList);
    this._resetRoving(this.lookList);
  }

  get visible() {
    return !this.root.hidden;
  }

  get sheet() {
    return this.root.dataset.sheet;
  }

  /**
   * On phones the panel is a bottom sheet: 'peek' shows just the tabs (and the room
   * gets most of the screen), 'open' shows the lists. Wider screens ignore it.
   */
  setSheet(state) {
    this.root.dataset.sheet = state;
    const handle = this.root.querySelector('[data-sheet-toggle]');
    handle.setAttribute('aria-expanded', String(state === 'open'));
    handle.setAttribute('aria-label', state === 'open' ? 'Hide the editor panel' : 'Show the editor panel');
  }

  show(appearance) {
    this.root.hidden = false;
    this._showTab('add');
    this.setSheet('peek');
    this.setAppearance(appearance);
    this._lastSelectedId = null;
    this._itemKey = null;
    this.render({ selected: null, pending: null, valid: true, busy: false, message: '' });
  }

  hide() {
    this.root.hidden = true;
  }

  setAppearance(appearance) {
    for (const button of this.lookList.querySelectorAll('[data-look-key]')) {
      button.setAttribute('aria-pressed', String(appearance[button.dataset.lookKey] === button.dataset.lookValue));
    }
  }

  setBusy(busy) {
    for (const button of this.root.querySelectorAll('[data-add-item], [data-editor-command="save"]')) {
      button.disabled = busy;
    }
  }

  /** The photos an owner can pick from: [{ ref, url?, name, local? }] (uploads and bundled demos). */
  setPhotoLibrary(photos, { account = false } = {}) {
    this.library = [...photos];
    this.accountMode = account;
    this._itemKey = null;
    if (this._lastState) this._renderItem(this._lastState);
  }

  render(state) {
    const { selected, pending, valid, message } = state;
    this.selection.hidden = !selected;
    if (selected) {
      const riders = selected.children.length;
      this.selectionName.textContent = riders > 0 ? `${selected.name} (+${riders} on top)` : selected.name;
      this._command('rotate-left').hidden = !selected.canRotate;
      this._command('rotate-right').hidden = !selected.canRotate;
      this._command('delete').hidden = !selected.canDelete;
      this.root.querySelector('[data-editor-nudge]').hidden = !selected.canMove;
      this.root.querySelector('[data-sheet-open="item"]').hidden = !(
        selected.canRecolor || selected.canResize || selected.light || selected.text || selected.photos
      );
    }
    this.root.dataset.pending = pending ? 'true' : 'false';
    this._command('place').hidden = !pending;
    this.status.textContent = message;
    this.status.classList.toggle('is-warning', !valid);
    for (const button of this.catalogList.querySelectorAll('[data-add-item]')) {
      button.setAttribute('aria-pressed', String(Boolean(pending) && pending.startsWith(`${button.dataset.addItem}-`)));
    }

    // Picking something in the room opens its options; adding from the catalogue doesn't,
    // so several things can be added in a row.
    const id = selected?.id ?? null;
    if (id !== this._lastSelectedId) {
      if (id && id !== pending) this._showTab('item');
      else if (!id && this._currentTab() === 'item') {
        this._showTab('add');
        this.setSheet('peek');
      }
      this._lastSelectedId = id;
    }
    this._renderItem(state);
  }

  _command(name) {
    return this.root.querySelector(`[data-editor-command="${name}"]`);
  }

  _currentTab() {
    return this.tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tab;
  }

  /** Phones: a tab opens the sheet; tapping the open tab again folds it away. */
  _onTabClick(name) {
    if (this.sheet === 'open' && this._currentTab() === name) this.setSheet('peek');
    else this.setSheet('open');
    this._showTab(name);
  }

  /** Does what a panel button asks. Returns false for buttons it doesn't handle. */
  _activate(button) {
    const { dataset } = button;
    if (dataset.addItem) {
      // Phones: get the panel out of the way so the item can be placed.
      this.setSheet('peek');
      this.onAdd(dataset.addItem);
    } else if (dataset.lookKey) this.onAppearance({ [dataset.lookKey]: dataset.lookValue });
    else if (dataset.editorCommand) this.onCommand(dataset.editorCommand, dataset.value);
    else if (dataset.filter) this._setFilter(dataset.filter);
    else if (dataset.tab) this._onTabClick(dataset.tab);
    else if (dataset.sheetOpen) {
      this._showTab(dataset.sheetOpen);
      this.setSheet('open');
    } else if (dataset.sheetToggle !== undefined) {
      if (performance.now() - this._swipedAt > 400) this.setSheet(this.sheet === 'open' ? 'peek' : 'open');
    } else return false;
    return true;
  }

  /**
   * After a swipe or drag in the room, Chrome on phones can swallow the click of the
   * next tap (it treats it as stopping the swipe), so a button would need two taps.
   * Touch taps on the panel's buttons act on release instead; the click that may
   * follow is then ignored. Scrolling cancels the pointer, so lists still scroll.
   */
  _watchTouchTaps() {
    this.root.addEventListener('pointerdown', (event) => {
      const button = event.target.closest?.('button');
      this._touchPress =
        event.pointerType === 'touch' && button && !('sheetToggle' in button.dataset)
          ? { id: event.pointerId, button, x: event.clientX, y: event.clientY }
          : null;
    });
    this.root.addEventListener('pointercancel', () => {
      this._touchPress = null;
    });
    this.root.addEventListener('pointerup', (event) => {
      const press = this._touchPress;
      this._touchPress = null;
      if (!press || press.id !== event.pointerId || press.button.disabled) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) return;
      if (this._activate(press.button)) this._touchActivated = { x: event.clientX, y: event.clientY, at: performance.now() };
    });
    // touchend comes right after pointerup; cancelling it stops the browser's emulated
    // mouse events and click for a tap that was already handled.
    this.root.addEventListener(
      'touchend',
      (event) => {
        if (this._touchActivated && performance.now() - this._touchActivated.at < 100) event.preventDefault();
      },
      { passive: false },
    );
  }

  /** Swiping the handle up or down opens or folds the sheet. */
  _watchHandle(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (event) => {
      start = { id: event.pointerId, y: event.clientY };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointerup', (event) => {
      if (!start || start.id !== event.pointerId) return;
      const dy = event.clientY - start.y;
      start = null;
      if (Math.abs(dy) < 20) return;
      this._swipedAt = performance.now();
      this.setSheet(dy < 0 ? 'open' : 'peek');
    });
    handle.addEventListener('pointercancel', () => {
      start = null;
    });
  }

  _showTab(name) {
    for (const tab of this.tabs) {
      const selected = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of this.root.querySelectorAll('[data-tabpanel]')) {
      panel.hidden = panel.dataset.tabpanel !== name;
    }
  }

  /** Arrow keys move between tabs, as in the WAI-ARIA tabs pattern. */
  _onTabKey(event) {
    const index = this.tabs.indexOf(event.target);
    if (index < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = this.tabs[(index + step + this.tabs.length) % this.tabs.length];
    this._showTab(next.dataset.tab);
    next.focus();
  }

  // ---- Roving focus: one Tab stop per list, arrow keys inside it ----

  _rovingButtons(container) {
    // Ignore the editor itself being hidden; only hidden parts of this list count.
    return [...container.querySelectorAll('button')].filter((button) => {
      const hiddenAncestor = button.closest('[hidden]');
      return !button.hidden && !(hiddenAncestor && container.contains(hiddenAncestor));
    });
  }

  _rove(container, target) {
    if (!(target instanceof HTMLButtonElement)) return;
    for (const button of container.querySelectorAll('button')) button.tabIndex = button === target ? 0 : -1;
  }

  _resetRoving(container) {
    const buttons = this._rovingButtons(container);
    const keep =
      buttons.find((button) => button.getAttribute('aria-pressed') === 'true' && !button.dataset.addItem) ??
      buttons.find((button) => button.tabIndex === 0) ??
      buttons[0];
    for (const button of container.querySelectorAll('button')) button.tabIndex = button === keep ? 0 : -1;
  }

  _onGridKey(event, container) {
    const current = event.target;
    if (!(current instanceof HTMLButtonElement)) return;
    const buttons = this._rovingButtons(container);
    const index = buttons.indexOf(current);
    if (index < 0) return;
    let next = null;
    if (event.key === 'ArrowRight') next = buttons[index + 1];
    else if (event.key === 'ArrowLeft') next = buttons[index - 1];
    else if (event.key === 'Home') next = buttons[0];
    else if (event.key === 'End') next = buttons.at(-1);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') next = this._vertical(buttons, current, event.key === 'ArrowDown');
    else return;
    event.preventDefault();
    if (next) {
      this._rove(container, next);
      next.focus();
    }
  }

  /** The nearest button in the next row below (or above) current. */
  _vertical(buttons, current, down) {
    const from = current.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      const dy = down ? rect.top - from.top : from.top - rect.top;
      if (dy < 4) continue;
      const score = dy * 1000 + Math.abs(rect.left - from.left);
      if (score < bestScore) {
        best = button;
        bestScore = score;
      }
    }
    return best;
  }

  // ---- Add: catalogue with category filters and search ----

  _renderCatalog(catalog, modelsUrl) {
    const base = new URL(modelsUrl, window.location.href);
    const groups = new Map();
    for (const item of catalog.items()) {
      if (item.addable === false || item.placement === 'fixed') continue;
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    const order = CATEGORIES.map(([key]) => key);
    const rank = (key) => (order.includes(key) ? order.indexOf(key) : order.length);
    const categories = [...groups.keys()].sort((a, b) => rank(a) - rank(b));

    this.filterList.replaceChildren(
      ...['all', ...categories].map((key) =>
        h('button', {
          className: 'editor-filter',
          type: 'button',
          dataset: { filter: key },
          'aria-pressed': String(key === this.filter),
          text: key === 'all' ? 'All' : (CATEGORY_LABELS[key] ?? title(key)),
        }),
      ),
    );
    this.catalogList.replaceChildren(
      ...categories.map((category) =>
        h(
          'section',
          { className: 'editor-group', dataset: { category } },
          h('h3', { className: 'editor-group-title', text: CATEGORY_LABELS[category] ?? title(category) }),
          h(
            'div',
            { className: 'editor-items' },
            groups.get(category).map((item) =>
              h(
                'button',
                {
                  className: 'editor-item',
                  type: 'button',
                  dataset: { addItem: item.id, search: [item.name, ...(item.tags ?? []), CATEGORY_LABELS[category] ?? category].join(' ').toLowerCase() },
                  'aria-pressed': 'false',
                },
                item.thumbnail
                  ? h('img', { src: new URL(item.thumbnail, base).href, alt: '', loading: 'lazy' })
                  : h('span', { className: 'editor-item-icon', 'aria-hidden': 'true', text: item.icon ?? item.name.charAt(0) }),
                h('span', { className: 'editor-item-name', text: item.name }),
              ),
            ),
          ),
        ),
      ),
    );
  }

  _setFilter(filter) {
    this.filter = filter;
    for (const button of this.filterList.querySelectorAll('[data-filter]')) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === filter));
    }
    this._applyFilter();
  }

  _applyFilter() {
    const query = words(this.searchInput.value);
    let shown = 0;
    for (const group of this.catalogList.querySelectorAll('[data-category]')) {
      const inCategory = this.filter === 'all' || group.dataset.category === this.filter;
      let visible = 0;
      for (const button of group.querySelectorAll('[data-add-item]')) {
        const haystack = words(button.dataset.search);
        // Every typed word must start some word of the item's name, tags, or category.
        const match = inCategory && query.every((word) => haystack.some((candidate) => candidate.startsWith(word)));
        button.hidden = !match;
        if (match) visible += 1;
      }
      group.hidden = visible === 0;
      shown += visible;
    }
    const search = this.searchInput.value.trim();
    this.emptyNote.hidden = shown > 0;
    this.emptyNote.textContent = search ? `Nothing matches “${search}”.` : 'Nothing here yet.';
    this._resetRoving(this.catalogList);
  }

  // ---- Item: options for the selected thing ----

  _renderItem(state) {
    this._lastState = state;
    const { selected, busy } = state;
    this.itemPanel.setAttribute('aria-busy', String(Boolean(busy)));
    const key = selected
      ? JSON.stringify([
          selected.id,
          selected.color,
          selected.size,
          selected.canRecolor,
          selected.canResize,
          selected.light,
          selected.text?.value,
          selected.photos?.value,
          this.library.map((photo) => photo.ref),
        ])
      : 'none';
    if (key === this._itemKey) return;
    // Keep keyboard focus on the same control when the panel redraws.
    const focusKey = this.itemPanel.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    this._itemKey = key;

    if (!selected) {
      this.itemPanel.replaceChildren(h('p', { className: 'editor-empty', text: 'Select something in your room to change how it looks.' }));
      return;
    }
    const groups = [
      selected.canRecolor && this._colorGroup(selected),
      selected.canResize && this._sizeGroup(selected),
      selected.light && this._lightGroup(selected.light),
      selected.text && this._textGroup(selected.text),
      selected.photos && this._photoGroup(selected.photos),
    ].filter(Boolean);
    if (groups.length === 0) {
      groups.push(h('p', { className: 'editor-empty', text: `The ${selected.name.toLowerCase()} has no options yet.` }));
    }
    this.itemPanel.replaceChildren(h('h3', { className: 'editor-item-title', text: selected.name }), ...groups);
    for (const group of this.itemPanel.querySelectorAll('[role="group"]')) this._resetRoving(group);
    if (focusKey) this.itemPanel.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  _section(title, ...children) {
    return h('section', { className: 'editor-group' }, h('h3', { className: 'editor-group-title', text: title }), ...children);
  }

  /** A row of toggle buttons (one Tab stop; arrows move). options: [[value, label, extra]]. */
  _choices(label, command, options, current, className) {
    return h(
      'div',
      { className, role: 'group', 'aria-label': label },
      options.map(([value, text, extra = {}]) =>
        h('button', {
          className: extra.className ?? '',
          type: 'button',
          dataset: { editorCommand: command, value: value ?? '', key: `${command}:${value ?? ''}` },
          'aria-pressed': String(current === value),
          // Swatches show colour only; their name is in aria-label and title.
          text: extra.swatch ? null : text,
          ...extra.attrs,
        }),
      ),
    );
  }

  _colorGroup(selected) {
    const options = [
      [null, 'Original', ORIGINAL_SWATCH],
      ...Object.entries(ITEM_COLORS).map(([name, c]) => [name, c.label, swatchColor(c.value)]),
    ].map(([value, label, background]) => [
      value,
      label,
      { className: 'editor-color', swatch: true, attrs: { 'aria-label': `Colour: ${label}`, title: label, style: `background: ${background}` } },
    ]);
    return this._section('Colour', this._choices('Colour', 'color', options, selected.color ?? null, 'editor-colors'));
  }

  _sizeGroup(selected) {
    const options = Object.entries(ITEM_SIZES).map(([name, preset]) => [
      name,
      preset.label,
      { className: 'editor-size', attrs: { 'aria-label': `Size: ${preset.label}` } },
    ]);
    return this._section('Size', this._choices('Size', 'size', options, selected.size, 'editor-sizes'));
  }

  _lightGroup(light) {
    const colors = Object.entries(LIGHT_COLORS).map(([name, preset]) => [
      name,
      preset.label,
      {
        className: 'editor-color',
        swatch: true,
        attrs: {
          'aria-label': `Light colour: ${preset.label}`,
          title: preset.label,
          style: `background: ${preset.bulbs ? `conic-gradient(${preset.bulbs.join(', ')})` : preset.value}`,
        },
      },
    ]);
    const effects = Object.entries(LIGHT_EFFECTS).map(([name, preset]) => [
      name,
      preset.label,
      { className: 'editor-size', attrs: { 'aria-label': `Effect: ${preset.label}` } },
    ]);
    const percent = Math.round(light.brightness * 100);
    return this._section(
      'Light',
      h(
        'div',
        { className: 'editor-light-row' },
        h('button', {
          className: 'editor-toggle',
          type: 'button',
          role: 'switch',
          'aria-checked': String(light.on),
          dataset: { editorCommand: 'light-on', value: String(!light.on), key: 'light-on' },
          text: light.on ? 'On' : 'Off',
          'aria-label': 'Light',
        }),
        h(
          'label',
          { className: 'editor-range' },
          h('span', { text: `Brightness ${percent}%` }),
          h('input', {
            type: 'range',
            min: LIGHT_BRIGHTNESS.min,
            max: LIGHT_BRIGHTNESS.max,
            step: LIGHT_BRIGHTNESS.step,
            value: light.brightness,
            'aria-label': 'Brightness',
            'aria-valuetext': `${percent}%`,
            dataset: { lightBrightness: '', key: 'light-brightness' },
          }),
        ),
      ),
      this._choices('Light colour', 'light-color', colors, light.color, 'editor-colors'),
      this._choices('Effect', 'light-effect', effects, light.effect, 'editor-sizes editor-effects'),
    );
  }

  _textGroup(text) {
    return this._section(
      text.label ?? 'Text',
      h(
        'form',
        { className: 'editor-text' },
        h('input', {
          className: 'editor-search',
          type: 'text',
          value: text.value,
          maxlength: text.maxLength ?? 24,
          'aria-label': text.label ?? 'Text',
          autocomplete: 'off',
          dataset: { textInput: '', key: 'text-input', testid: 'editor-text' },
        }),
        h('button', { className: 'chip chip-accent', type: 'submit', text: 'Update', dataset: { key: 'text-submit' } }),
      ),
    );
  }

  _photoGroup(photos) {
    const single = photos.max === 1;
    const urlFor = (ref) => this.library.find((photo) => photo.ref === ref)?.url ?? (ref.startsWith('/static/') ? ref : null);
    const nameFor = (ref) => this.library.find((photo) => photo.ref === ref)?.name ?? 'Photo';
    const current =
      !single &&
      h(
        'ol',
        { className: 'editor-photo-current', 'aria-label': 'Photos on the string' },
        photos.value.map((ref, i) =>
          h(
            'li',
            {},
            urlFor(ref)
              ? h('img', { src: urlFor(ref), alt: '' })
              : h('span', { className: 'editor-photo-missing', text: '?' }),
            h('button', {
              className: 'editor-photo-remove',
              type: 'button',
              dataset: { editorCommand: 'photo-remove', value: String(i), key: `photo-remove:${i}` },
              'aria-label': `Remove photo ${i + 1}: ${nameFor(ref)}`,
              text: '×',
            }),
          ),
        ),
      );
    const library = h(
      'div',
      { className: 'editor-photo-library', role: 'group', 'aria-label': single ? 'Choose a photo' : 'Add a photo' },
      this.library.map((photo) =>
        h(
          'button',
          {
            className: 'editor-photo',
            type: 'button',
            dataset: { editorCommand: 'photo-use', value: photo.ref, key: `photo-use:${photo.ref}` },
            'aria-label': `${single ? 'Use' : 'Add'} photo: ${photo.name}`,
            'aria-pressed': single ? String(photos.value[0] === photo.ref) : null,
          },
          h('img', { src: photo.url ?? photo.ref, alt: '', loading: 'lazy' }),
        ),
      ),
    );
    const upload = h(
      'label',
      { className: 'chip editor-upload' },
      h('input', {
        type: 'file',
        accept: 'image/png,image/jpeg,image/webp,image/gif',
        className: 'sr-only',
        dataset: { photoUpload: '', testid: 'photo-upload', key: 'photo-upload' },
      }),
      h('span', { text: 'Upload a photo' }),
    );
    const localCount = this.library.filter((photo) => photo.local).length;
    const migrate =
      this.accountMode &&
      localCount > 0 &&
      h('button', {
        className: 'chip editor-migrate',
        type: 'button',
        dataset: { editorCommand: 'photos-migrate', key: 'photos-migrate', testid: 'photos-migrate' },
        text: `Move ${localCount} photo${localCount === 1 ? '' : 's'} from this browser to your account`,
      });
    const note = h('p', {
      className: 'editor-note',
      text: this.accountMode
        ? 'Uploads are saved to your account, so every visitor sees them.'
        : 'Uploads stay in this browser (demo room preview).',
    });
    return this._section(single ? 'Photo' : `Photos (${photos.value.length} of ${photos.max})`, current, library, upload, migrate, note);
  }

  // ---- Look: walls, floor, lighting ----

  _renderLook() {
    this.lookList.replaceChildren(
      ...LOOK_GROUPS.map(({ key, label, presets, swatch }) =>
        h(
          'section',
          { className: 'editor-group' },
          h('h3', { className: 'editor-group-title', text: label }),
          h(
            'div',
            { className: 'editor-swatches' },
            Object.entries(presets).map(([name, preset]) =>
              h(
                'button',
                {
                  className: 'editor-swatch',
                  type: 'button',
                  dataset: { lookKey: key, lookValue: name },
                  'aria-pressed': 'false',
                  'aria-label': `${label}: ${preset.label ?? title(name)}`,
                },
                h('span', { className: 'editor-swatch-chip', style: `background: ${swatch(preset)}`, 'aria-hidden': 'true' }),
                h('span', { text: preset.label ?? title(name) }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
