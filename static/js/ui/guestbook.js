/** Read-only guestbook panel. Signing arrives with accounts (Milestone 6). */
export class GuestbookPanel {
  constructor(dialog) {
    this.dialog = dialog;
    this.list = dialog.querySelector('[data-guestbook-list]');
    this.empty = dialog.querySelector('[data-guestbook-empty]');
    this.title = dialog.querySelector('[data-guestbook-title]');
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

  open({ entries = [], roomName = '' } = {}) {
    this.title.textContent = roomName ? `${roomName} guestbook` : 'Guestbook';
    this.list.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement('li');
        item.className = 'guestbook-entry';
        const message = document.createElement('p');
        message.className = 'guestbook-message';
        message.textContent = String(entry.message ?? '');
        const author = document.createElement('p');
        author.className = 'guestbook-author';
        author.textContent = `— ${String(entry.author ?? 'A visitor')}`;
        item.append(message, author);
        return item;
      }),
    );
    this.empty.hidden = entries.length > 0;
    if (!this.dialog.open) this.dialog.showModal();
  }

  close() {
    if (this.dialog.open) this.dialog.close();
  }
}
