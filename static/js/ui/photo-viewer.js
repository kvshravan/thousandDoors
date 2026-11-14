import { makeDismissible } from './dialog.js';

/** Modal viewer for photographs placed in a room. */
export class PhotoViewer {
  constructor(dialog) {
    this.dialog = dialog;
    this.image = dialog.querySelector('[data-photo-image]');
    this.caption = dialog.querySelector('[data-photo-caption]');
    this.error = dialog.querySelector('[data-photo-error]');
    this.image.addEventListener('error', () => {
      if (!this.image.getAttribute('src')) return;
      this.image.hidden = true;
      this.error.hidden = false;
    });
    this.image.addEventListener('load', () => {
      this.image.hidden = false;
      this.error.hidden = true;
    });
    this._dismissible = makeDismissible(dialog);
  }

  get isOpen() {
    return this.dialog.open;
  }

  open({ src, caption }) {
    this.error.hidden = true;
    this.image.hidden = false;
    this.image.alt = caption || 'Photo';
    this.image.src = src;
    this.caption.textContent = caption || '';
    this.caption.hidden = !caption;
    this._dismissible.show();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }
}
