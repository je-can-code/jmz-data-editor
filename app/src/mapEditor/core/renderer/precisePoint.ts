import type { ScreenPoint } from './camera.ts';

/**
 * How far apart a mouse event's point and the pointer's own point may lie, on each axis, in CSS pixels, and still be
 * the same spot. Chromium reports mouse events (a double-click, a turn of the wheel) in whole CSS pixels, while pointer
 * events keep the fraction a device pixel ratio such as 1.5 leaves on nearly every position; and it cuts a mouse
 * event's position down twice, once on the page and again once measured from the element's own edge, which at such a
 * ratio usually lies on a fraction too. So the mouse event's point lies up to two pixels up and left of the pointer's:
 * NW.js, at 1.5, reported a press at 627.33, 437 and the double-click it made at 627, 436.
 */
const MOUSE_ROUNDING = 2;

/**
 * Finds where a mouse event happened in the view, as precisely as the pointer events before it said. Zoomed out, the
 * two pixels a mouse event's point can lie off the pointer's are enough to cross onto the tile beside the one pressed,
 * and a double-click on an event would place a new event there. The pointer's own point is taken whenever it lies
 * within those two pixels of the mouse event's point; a pointer point from anywhere else, or none at all, leaves the
 * mouse event's own point.
 * @param {ScreenPoint} mouse The mouse event's point in the view, in whole CSS pixels.
 * @param {ScreenPoint | null} pointer The pointer's last point in the view, from a pointer event, or null when none is
 * known.
 * @returns {ScreenPoint} The pointer's point when the two are one spot, and the mouse event's point otherwise.
 */
const precisePoint = (mouse: ScreenPoint, pointer: ScreenPoint | null): ScreenPoint =>
{
  // a pointer point farther away than the rounding can carry it is from another press or another move, not this spot.
  if (pointer === null || Math.abs(pointer.x - mouse.x) >= MOUSE_ROUNDING || Math.abs(pointer.y - mouse.y) >= MOUSE_ROUNDING)
  {
    return mouse;
  }

  return pointer;
};

export { precisePoint };
