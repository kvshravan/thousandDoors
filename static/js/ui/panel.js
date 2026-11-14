import { makeDismissible } from './dialog.js';

/**
 * One reusable modal panel for object interactions (profile, noticeboard, music...).
 * Content is supplied by the interaction handlers in interactions.js.
 */
export class Panel {
  constructor(dialog) {
    this.dialog = dialog;
    this.kicker = dialog.querySelector('[data-panel-kicker]');
    this.title = dialog.querySelector('[data-panel-title]');
    this.body = dialog.querySelector('[data-panel-body]');
    this.kind = null;
    this._onClose = null;
    this._dismissible = makeDismissible(dialog);
    dialog.addEventListener('close', () => this._finish());
  }

  get isOpen() {
    return this.dialog.open;
  }

  open({ kind, kicker = '', title, body = [], onClose = null }) {
    if (this.dialog.open) this._finish();
    this.kind = kind;
    this.dialog.dataset.kind = kind;
    this.kicker.textContent = kicker;
    this.kicker.hidden = !kicker;
    this.title.textContent = title;
    this.setBody(body);
    this._onClose = onClose;
    this._dismissible.show();
  }

  setBody(body) {
    this.body.replaceChildren(...[body].flat(Infinity).filter(Boolean));
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }

  getDebugInfo() {
    return { open: this.isOpen, kind: this.isOpen ? this.kind : null, title: this.isOpen ? this.title.textContent : null };
  }

  _finish() {
    const onClose = this._onClose;
    this._onClose = null;
    onClose?.();
  }
}
