import { FLOORS, LIGHTING_MOODS, WALLPAPERS } from '../three/room-config.js';
import { h } from './dom.js';

const CATEGORY_ORDER = ['furniture', 'decorations', 'entertainment', 'social', 'personal'];
const CATEGORY_LABELS = {
  furniture: 'Furniture',
  decorations: 'Decorations',
  entertainment: 'Entertainment',
  social: 'Social',
  personal: 'Personal',
};
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
];

const title = (name) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * The editor's HTML panel. It only renders state and reports what the user asked
 * for; the EditorController and page decide what actually happens.
 */
export class EditorPanel {
  constructor(root, { catalog, modelsUrl, onAdd, onAppearance, onCommand }) {
    this.root = root;
    this.catalogList = root.querySelector('[data-editor-catalog]');
    this.lookList = root.querySelector('[data-editor-look]');
    this.selection = root.querySelector('[data-editor-selection]');
    this.selectionName = root.querySelector('[data-editor-selection-name]');
    this.status = root.querySelector('[data-editor-status]');
    this.tabs = [...root.querySelectorAll('[role="tab"]')];
    this.onAdd = onAdd;
    this.onAppearance = onAppearance;
    this.onCommand = onCommand;

    root.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || !root.contains(button)) return;
      if (button.dataset.addItem) this.onAdd(button.dataset.addItem);
      else if (button.dataset.lookKey) this.onAppearance({ [button.dataset.lookKey]: button.dataset.lookValue });
      else if (button.dataset.editorCommand) this.onCommand(button.dataset.editorCommand);
      else if (button.dataset.tab) this._showTab(button.dataset.tab);
    });

    this._renderCatalog(catalog, modelsUrl);
    this._renderLook();
  }

  get visible() {
    return !this.root.hidden;
  }

  show(appearance) {
    this.root.hidden = false;
    this._showTab('add');
    this.setAppearance(appearance);
    this.render({ selected: null, pending: null, valid: true, message: '' });
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

  render(state) {
    const { selected, pending, valid, message } = state;
    this.selection.hidden = !selected;
    if (selected) {
      const riders = selected.children.length;
      this.selectionName.textContent = riders > 0 ? `${selected.name} (+${riders} on top)` : selected.name;
    }
    this.root.dataset.pending = pending ? 'true' : 'false';
    this.root.querySelector('[data-editor-command="place"]').hidden = !pending;
    this.status.textContent = message;
    this.status.classList.toggle('is-warning', !valid);
    for (const button of this.catalogList.querySelectorAll('[data-add-item]')) {
      button.setAttribute('aria-pressed', String(Boolean(pending) && pending.startsWith(`${button.dataset.addItem}-`)));
    }
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

  _renderCatalog(catalog, modelsUrl) {
    const groups = new Map();
    for (const item of catalog.items()) {
      if (item.placement !== 'floor') continue;
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    }
    const ordered = [...groups.keys()].sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b));
    this.catalogList.replaceChildren(
      ...ordered.map((category) =>
        h(
          'section',
          { className: 'editor-group' },
          h('h3', { className: 'editor-group-title', text: CATEGORY_LABELS[category] ?? title(category) }),
          h(
            'div',
            { className: 'editor-items' },
            groups.get(category).map((item) =>
              h(
                'button',
                { className: 'editor-item', type: 'button', dataset: { addItem: item.id }, 'aria-pressed': 'false' },
                item.thumbnail
                  ? h('img', { src: new URL(item.thumbnail, new URL(modelsUrl, window.location.href)).href, alt: '', loading: 'lazy' })
                  : h('span', { className: 'editor-item-icon', 'aria-hidden': 'true', text: item.name.charAt(0) }),
                h('span', { className: 'editor-item-name', text: item.name }),
              ),
            ),
          ),
        ),
      ),
    );
  }

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
                  'aria-label': `${label}: ${title(name)}`,
                },
                h('span', { className: 'editor-swatch-chip', style: `background: ${swatch(preset)}`, 'aria-hidden': 'true' }),
                h('span', { text: title(name) }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
