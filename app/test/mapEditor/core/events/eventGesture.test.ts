import { describe, expect, it } from 'vitest';
import { DRAG_SLOP, EventGesture, type GesturePress } from '../../../../src/mapEditor/core/events/eventGesture.ts';
import { REPLACE, type SelectModifiers } from '../../../../src/mapEditor/core/events/selectionRules.ts';

/*
 * The left button on a map does three things, and the map view relies on this gesture to tell them apart without ever
 * guessing wrong. A press on an event picks it, and moving past a few pixels drags the whole selection, while pressing
 * an event already selected must keep the others selected so they drag together (and a click that never moved still
 * leaves that event alone selected, as a click should). Shift and Ctrl presses only change the selection and never
 * drag. A press on the ground, or beside the map, draws a box once it moves, and a still click there clears the
 * selection unless a modifier is held. A drag or box reports only when it reaches a new tile, so a pointer wandering
 * inside one tile costs nothing, and Esc drops either without changing anything. Every step is said, never done, so
 * the view decides what to change.
 */
describe('EventGesture', () =>
{
  /**
   * Builds a press.
   * @param {number | null} eventId The event under the press, or null for the ground.
   * @param {{ x: number, y: number }} cell The tile under it.
   * @param {SelectModifiers} modifiers The modifiers held.
   * @returns {GesturePress} The press, at the tile's middle in a view at zoom 1.
   */
  const pressAt = (eventId: number | null, cell: { x: number; y: number }, modifiers: SelectModifiers = REPLACE): GesturePress =>
  {
    return { point: { x: cell.x * 48 + 24, y: cell.y * 48 + 24 }, cell, eventId, modifiers };
  };

  describe('press', () =>
  {
    it('selects an unselected event alone on a plain press', () =>
    {
      // Arrange.
      const gesture = new EventGesture();

      // Act.
      const step = gesture.press(pressAt(7, { x: 2, y: 2 }), [ 4, 2 ]);

      // Assert.
      expect([ step, gesture.isActive, gesture.isMoving ])
        .toStrictEqual([ { kind: 'select', eventIds: [ 7 ] }, true, false ]);
    });

    it('keeps the whole selection on a plain press on an event already in it', () =>
    {
      // Arrange.
      const gesture = new EventGesture();

      // Act.
      const step = gesture.press(pressAt(2, { x: 1, y: 1 }), [ 4, 2 ]);

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'none' });
    });

    it('adds with Shift and toggles with Ctrl at once', () =>
    {
      // Arrange.
      const adding = new EventGesture();
      const toggling = new EventGesture();

      // Act.
      const added = adding.press(pressAt(7, { x: 2, y: 2 }, { add: true, toggle: false }), [ 4, 2 ]);
      const toggled = toggling.press(pressAt(2, { x: 1, y: 1 }, { add: false, toggle: true }), [ 4, 2 ]);

      // Assert.
      expect([ added, toggled ])
        .toStrictEqual([ { kind: 'select', eventIds: [ 4, 2, 7 ] }, { kind: 'select', eventIds: [ 4 ] } ]);
    });

    it('changes nothing yet on a press on the ground', () =>
    {
      // Arrange.
      const gesture = new EventGesture();

      // Act.
      const step = gesture.press(pressAt(null, { x: 3, y: 0 }), [ 4 ]);

      // Assert.
      expect([ step, gesture.isActive ])
        .toStrictEqual([ { kind: 'none' }, true ]);
    });
  });

  describe('move', () =>
  {
    it('drags the selection once the pointer passes the slop, by the tiles it crossed', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }), []);

      // Act: inside the slop, then past it onto the tile two right and one down.
      const still = gesture.move({ x: 2 * 48 + 24 + DRAG_SLOP, y: 2 * 48 + 24 }, { x: 2, y: 2 });
      const dragged = gesture.move({ x: 4 * 48 + 24, y: 3 * 48 + 24 }, { x: 4, y: 3 });

      // Assert.
      expect([ still, dragged, gesture.isMoving ])
        .toStrictEqual([ { kind: 'none' }, { kind: 'drag', dx: 2, dy: 1 }, true ]);
    });

    it('reports a drag again only when the pointer reaches another tile', () =>
    {
      // Arrange: dragging, one tile right.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }), []);
      gesture.move({ x: 3 * 48 + 24, y: 2 * 48 + 24 }, { x: 3, y: 2 });

      // Act: wandering inside that tile, then onto the next.
      const wander = gesture.move({ x: 3 * 48 + 40, y: 2 * 48 + 10 }, { x: 3, y: 2 });
      const next = gesture.move({ x: 3 * 48 + 24, y: 3 * 48 + 24 }, { x: 3, y: 3 });

      // Assert.
      expect([ wander, next ])
        .toStrictEqual([ { kind: 'none' }, { kind: 'drag', dx: 1, dy: 1 } ]);
    });

    it('draws a box from a press on the ground, carrying the selection it started with and the modifiers', () =>
    {
      // Arrange: 4 was selected, and Shift was held at the press.
      const gesture = new EventGesture();
      const add = { add: true, toggle: false };
      gesture.press(pressAt(null, { x: 0, y: 0 }, add), [ 4 ]);

      // Act.
      const step = gesture.move({ x: 2 * 48 + 24, y: 48 + 24 }, { x: 2, y: 1 });

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'box', from: { x: 0, y: 0 }, to: { x: 2, y: 1 }, before: [ 4 ], modifiers: add });
    });

    it('never drags after a Shift or Ctrl press, however far the pointer goes', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }, { add: true, toggle: false }), []);

      // Act.
      const step = gesture.move({ x: 9 * 48, y: 9 * 48 }, { x: 9, y: 9 });

      // Assert.
      expect([ step, gesture.isMoving ])
        .toStrictEqual([ { kind: 'none' }, false ]);
    });

    it('does nothing with no press', () =>
    {
      // Arrange.
      const gesture = new EventGesture();

      // Act.
      const step = gesture.move({ x: 100, y: 100 }, { x: 2, y: 2 });

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'none' });
    });
  });

  describe('release', () =>
  {
    it('drops a drag by the tiles between the press and the release', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }), []);
      gesture.move({ x: 0, y: 48 * 4 }, { x: 0, y: 4 });

      // Act.
      const step = gesture.release({ x: 1, y: 4 });

      // Assert.
      expect([ step, gesture.isActive ])
        .toStrictEqual([ { kind: 'drop', dx: -1, dy: 2 }, false ]);
    });

    it('selects what a box holds on release, from the tile it started on to the one released on', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(null, { x: -1, y: 0 }), [ 4 ]);
      gesture.move({ x: 2 * 48, y: 2 * 48 }, { x: 2, y: 2 });

      // Act.
      const step = gesture.release({ x: 3, y: 2 });

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'boxed', from: { x: -1, y: 0 }, to: { x: 3, y: 2 }, before: [ 4 ], modifiers: REPLACE });
    });

    it('selects a still-clicked event alone once released, when the press kept the rest for a drag', () =>
    {
      // Arrange: 2 was already selected with 4.
      const gesture = new EventGesture();
      gesture.press(pressAt(2, { x: 1, y: 1 }), [ 4, 2 ]);

      // Act.
      const step = gesture.release({ x: 1, y: 1 });

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'select', eventIds: [ 2 ] });
    });

    it('changes nothing more on release after a press that selected an unselected event', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }), [ 4 ]);

      // Act.
      const step = gesture.release({ x: 2, y: 2 });

      // Assert.
      expect(step)
        .toStrictEqual({ kind: 'none' });
    });

    it('clears the selection on a still plain click on the ground, and keeps it with a modifier', () =>
    {
      // Arrange.
      const plain = new EventGesture();
      const shifted = new EventGesture();
      plain.press(pressAt(null, { x: 3, y: 0 }), [ 4 ]);
      shifted.press(pressAt(null, { x: 3, y: 0 }, { add: true, toggle: false }), [ 4 ]);

      // Act.
      const cleared = plain.release({ x: 3, y: 0 });
      const kept = shifted.release({ x: 3, y: 0 });

      // Assert.
      expect([ cleared, kept ])
        .toStrictEqual([ { kind: 'select', eventIds: [] }, { kind: 'none' } ]);
    });

    it('changes nothing on release after a Shift or Ctrl press, or with no press at all', () =>
    {
      // Arrange.
      const clicked = new EventGesture();
      clicked.press(pressAt(7, { x: 2, y: 2 }, { add: false, toggle: true }), []);
      const idle = new EventGesture();

      // Act.
      const afterClick = clicked.release({ x: 2, y: 2 });
      const unpressed = idle.release({ x: 2, y: 2 });

      // Assert.
      expect([ afterClick, unpressed ])
        .toStrictEqual([ { kind: 'none' }, { kind: 'none' } ]);
    });
  });

  describe('cancel', () =>
  {
    it('drops a drag on show, and then a release does nothing', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(7, { x: 2, y: 2 }), []);
      gesture.move({ x: 4 * 48, y: 2 * 48 }, { x: 4, y: 2 });

      // Act.
      const cancelled = gesture.cancel();
      const released = gesture.release({ x: 4, y: 2 });

      // Assert.
      expect([ cancelled, released, gesture.isActive ])
        .toStrictEqual([ { kind: 'cancel' }, { kind: 'none' }, false ]);
    });

    it('has nothing to drop before the pointer has moved', () =>
    {
      // Arrange.
      const gesture = new EventGesture();
      gesture.press(pressAt(null, { x: 3, y: 0 }), []);

      // Act.
      const step = gesture.cancel();

      // Assert.
      expect([ step, gesture.isActive ])
        .toStrictEqual([ { kind: 'none' }, false ]);
    });
  });
});
