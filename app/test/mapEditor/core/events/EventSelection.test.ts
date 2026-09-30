import { describe, expect, it } from 'vitest';
import { EventSelection, NOTHING_SELECTED } from '../../../../src/mapEditor/core/events/EventSelection.ts';

/*
 * A window has one event selection, on one map at a time: the map views draw it and act on it, and the quick panel
 * reads it. Its readers depend on three promises. Reading it hands back the same object until it changes, which is
 * what React's useSyncExternalStore needs to avoid rendering forever. Every change is heard, and a change to nothing
 * (the same events again) is not, so nobody re-renders for nothing. And it holds only what is really selected: each
 * event once, nothing at all when the list is empty, and never an event its map no longer holds, while the events
 * that do remain stay selected in their order.
 */
describe('EventSelection', () =>
{
  describe('select', () =>
  {
    it('selects events on one map, each once, in the order picked', () =>
    {
      // Arrange.
      const selection = new EventSelection();

      // Act.
      selection.select(12, [ 4, 2, 4, 9 ]);

      // Assert.
      expect(selection.get())
        .toStrictEqual({ mapId: 12, eventIds: [ 4, 2, 9 ] });
    });

    it('replaces a selection on another map rather than adding to it', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4 ]);

      // Act.
      selection.select(30, [ 1 ]);

      // Assert.
      expect([ selection.get(), selection.eventsOn(12), selection.eventsOn(30) ])
        .toStrictEqual([ { mapId: 30, eventIds: [ 1 ] }, [], [ 1 ] ]);
    });

    it('selects nothing at all for an empty list, whatever map it names', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4 ]);

      // Act.
      selection.select(12, []);

      // Assert.
      expect(selection.get())
        .toBe(NOTHING_SELECTED);
    });

    it('tells every listener about a change, and keeps the same object while nothing changes', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      const heard: number[] = [];
      selection.subscribe(() => heard.push(selection.get().eventIds.length));
      selection.select(12, [ 4, 2 ]);
      const first = selection.get();

      // Act: the same events again, then a different order, which is a change.
      selection.select(12, [ 4, 2 ]);
      const unchanged = selection.get();
      selection.select(12, [ 2, 4 ]);

      // Assert.
      expect([ heard, unchanged === first, selection.get() === first ])
        .toStrictEqual([ [ 2, 2 ], true, false ]);
    });

    it('stops telling a listener once it stops listening', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      const heard: string[] = [];
      const stop = selection.subscribe(() => heard.push('first'));
      selection.subscribe(() => heard.push('second'));

      // Act.
      stop();
      selection.select(12, [ 4 ]);

      // Assert.
      expect(heard)
        .toStrictEqual([ 'second' ]);
    });
  });

  describe('clear', () =>
  {
    it('selects nothing, telling listeners once, and never again while nothing is selected', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4 ]);
      let heard = 0;
      selection.subscribe(() =>
      {
        heard += 1;
      });

      // Act.
      selection.clear();
      selection.clear();

      // Assert.
      expect([ selection.get(), heard ])
        .toStrictEqual([ NOTHING_SELECTED, 1 ]);
    });
  });

  describe('eventsOn', () =>
  {
    it('reads the events selected on a map, and none for a map the selection is not on', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4, 2 ]);

      // Act.
      const onIt = selection.eventsOn(12);
      const elsewhere = selection.eventsOn(13);

      // Assert.
      expect([ onIt, elsewhere ])
        .toStrictEqual([ [ 4, 2 ], [] ]);
    });
  });

  describe('keepExisting', () =>
  {
    it('drops the events a map no longer holds and keeps the rest in their order', () =>
    {
      // Arrange: event 9's paste was undone; 4 and 2 are still there.
      const selection = new EventSelection();
      selection.select(12, [ 4, 9, 2 ]);

      // Act.
      selection.keepExisting(12, id => id !== 9);

      // Assert.
      expect(selection.get())
        .toStrictEqual({ mapId: 12, eventIds: [ 4, 2 ] });
    });

    it('leaves the selection alone, the same object and unheard, when every event is still there', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4, 2 ]);
      const before = selection.get();
      let heard = 0;
      selection.subscribe(() =>
      {
        heard += 1;
      });

      // Act.
      selection.keepExisting(12, () => true);

      // Assert.
      expect([ selection.get() === before, heard ])
        .toStrictEqual([ true, 0 ]);
    });

    it('never touches a selection on another map', () =>
    {
      // Arrange.
      const selection = new EventSelection();
      selection.select(12, [ 4 ]);

      // Act: map 13 holds none of its events, but the selection is not on map 13.
      selection.keepExisting(13, () => false);

      // Assert.
      expect(selection.get())
        .toStrictEqual({ mapId: 12, eventIds: [ 4 ] });
    });
  });
});
