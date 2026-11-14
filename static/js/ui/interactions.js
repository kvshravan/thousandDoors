/**
 * Maps interaction types (from the catalogue) to handlers. Add a type here
 * instead of adding object-specific click logic elsewhere.
 *
 * Each handler receives { objectId, catalogId, name, type, data, lampOn }.
 */
export function createInteractionRegistry({ photoViewer, guestbook, getScene, getRoomName }) {
  return {
    photograph: ({ data, name }) => photoViewer.open({ src: data.imageUrl, caption: data.caption ?? name }),
    guestbook: ({ data }) => guestbook.open({ entries: data.entries ?? [], roomName: getRoomName() }),
    lamp: ({ objectId }) => getScene()?.toggleLamp(objectId),
  };
}

export const INTERACTION_VERBS = Object.freeze({
  photograph: 'View photo',
  guestbook: 'Read the guestbook',
  lamp: 'Switch on or off',
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
