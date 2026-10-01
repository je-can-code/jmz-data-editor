import { describe, expect, it } from 'vitest';
import { precisePoint } from '../../../../src/mapEditor/core/renderer/precisePoint.ts';

/*
 * Chromium reports pointer events at the pointer's exact spot, fractions included, and mouse events (a double-click, a
 * turn of the wheel) in whole CSS pixels, cut down twice: once on the page and again once measured from the element's
 * own edge. At a device pixel ratio of 1 the two always agree; at 1.5 a mouse event's spot lies up to two pixels up and
 * left of the pointer's, which zoomed out is another tile. The map acts on the pointer's spot for every mouse event
 * made by the pointer at that spot, so a double-click opens the event its press selected rather than placing a new one
 * on the tile beside it; a pointer spot from anywhere farther off is another press or another move, and leaves the
 * mouse event's own spot. The numbers below are the ones NW.js reported at 1.5.
 */
describe('precisePoint', () =>
{
  it('takes the press\'s own spot for a double-click reported in whole pixels at a device pixel ratio of 1.5', () =>
  {
    // Arrange: NW.js at 1.5 reported the presses at 627.33, 437 and the double-click they made at 627, 436.
    const press = { x: 627.3333740234375, y: 437 };

    // Act.
    const point = precisePoint({ x: 627, y: 436 }, press);

    // Assert.
    expect(point)
      .toStrictEqual({ x: 627.3333740234375, y: 437 });
  });

  it('takes the pointer\'s spot up to just under two pixels off on either axis, either way, and the mouse event\'s own from two', () =>
  {
    // Arrange: a mouse event at 100, 100, against pointer spots just inside and just outside two pixels each way.
    const mouse = { x: 100, y: 100 };
    const pointers = [
      { x: 101.99, y: 101.99 },
      { x: 98.01, y: 98.01 },
      { x: 102, y: 100.5 },
      { x: 100.5, y: 102 },
      { x: 98, y: 100.5 },
      { x: 100.5, y: 98 },
    ];

    // Act.
    const points = pointers.map(pointer => precisePoint(mouse, pointer));

    // Assert.
    expect(points)
      .toStrictEqual([
        { x: 101.99, y: 101.99 },
        { x: 98.01, y: 98.01 },
        { x: 100, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 100 },
      ]);
  });

  it('keeps the mouse event\'s own spot when no pointer spot is known', () =>
  {
    // Arrange: no press or move has been seen.

    // Act.
    const point = precisePoint({ x: 12, y: 34 }, null);

    // Assert.
    expect(point)
      .toStrictEqual({ x: 12, y: 34 });
  });
});
