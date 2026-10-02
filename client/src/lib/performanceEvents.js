/**
 * A set can be logged from the navbar on any page, so the pages that show
 * sets or ranks listen for this and reload. Same pattern as friendEvents.
 */
const EVENT = 'gymrank:performances-changed';

export function announcePerformancesChanged() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function onPerformancesChanged(handler) {
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
