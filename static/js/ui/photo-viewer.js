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
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dialog.close();
      }
    });
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
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }
}
