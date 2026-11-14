/**
 * Who may interact with a room object. The owner sets a level per object;
 * the viewer's relationship to the owner decides access.
 */

export const PERMISSION_LEVELS = Object.freeze(['everyone', 'followers', 'friends', 'owner']);
export const RELATIONSHIPS = Object.freeze(['stranger', 'follower', 'friend', 'owner']);

const LEVEL_RANK = { everyone: 0, followers: 1, friends: 2, owner: 3 };
const RELATIONSHIP_RANK = { stranger: 0, follower: 1, friend: 2, owner: 3 };

/** Unknown levels fail closed (owner only). */
export function normalizeLevel(level, fallback = 'everyone') {
  if (level === undefined || level === null) return fallback;
  return level in LEVEL_RANK ? level : 'owner';
}

export function normalizeRelationship(relationship) {
  return relationship in RELATIONSHIP_RANK ? relationship : 'stranger';
}

export function canInteract(level, relationship) {
  return RELATIONSHIP_RANK[normalizeRelationship(relationship)] >= LEVEL_RANK[normalizeLevel(level, 'owner')];
}
