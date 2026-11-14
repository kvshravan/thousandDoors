const BACKDROP_GRACE_MS = 400;

/**
 * Closes a <dialog> on Escape or a backdrop click. Backdrop clicks right after
 * opening are ignored, because the tap that opened the dialog can still produce one.
 */
export function makeDismissible(dialog) {
  let openedAt = 0;
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && performance.now() - openedAt > BACKDROP_GRACE_MS) dialog.close();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.close();
    }
  });
  return {
    show() {
      openedAt = performance.now();
      if (!dialog.open) dialog.showModal();
    },
  };
}
