/**
 * The attribute a map view's drawing area carries, so a panel bringing a map forward can tell when the keys sit in some
 * other map's view.
 */
const MAP_VIEW_ATTRIBUTE = 'data-map-view';

/**
 * Reports whether a map panel just brought forward should take the keyboard into its map, so Ctrl+V, Ctrl+C, Delete
 * and the rest act on the map in view straight away rather than only after a click on it. It takes the keys from places
 * that hold them only by accident of how the map came forward: nowhere at all (a tab closed, the window refocused), the
 * tab just clicked, or another map's view, which the author has just moved away from. It never takes them from anywhere
 * the author is working: a box being typed in, a list such as the events list that brought the map forward to show an
 * event, or anywhere inside the panel itself, such as the map clicked on or a torn-out map's own palette.
 * @param {Element | null} active What has the keys now: the window's focused element.
 * @param {Element} panel The panel brought forward.
 * @returns {boolean} True when the map should take the keys.
 */
const takesKeysOnArrival = (active: Element | null, panel: Element): boolean =>
{
  // nothing has the keys, as after a tab closes: the map now in view takes them.
  if (active === null || active === panel.ownerDocument.body)
  {
    return true;
  }

  // the keys already sit somewhere in the panel, where the author put them.
  if (panel.contains(active))
  {
    return false;
  }

  // a tab holds the keys only because it was clicked to bring the map forward; another map's view, only because the
  // author was working there before moving to this map.
  return active.closest('[role="tab"]') !== null || active.closest(`[${MAP_VIEW_ATTRIBUTE}]`) !== null;
};

export { MAP_VIEW_ATTRIBUTE, takesKeysOnArrival };
