/**
 * The navbar shows a count of pending friend requests, and the friends page
 * changes that count without navigating. Rather than lifting the whole
 * friends state into a context for one number, the page announces a change
 * and the navbar refetches.
 */
const EVENT = 'gymrank:friends-changed';

export function announceFriendsChanged() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onFriendsChanged(handler) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
