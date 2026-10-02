import { describe, expect, it } from 'vitest';
import {
  MARKER_STYLES,
  MARKER_SYMBOLS,
  markerSymbolFor,
  TRIGGER_MARKERS,
  triggerMarker,
} from '../../../../src/mapEditor/core/eventKinds/eventMarkers.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * An event whose page draws no picture would be invisible on the map, so it draws a marker holding a symbol, and the
 * symbol is the whole of what the author learns about it at a glance: what it is, when a kind recognises it, and
 * otherwise what starts it running. A kind's own symbol always wins, so a chest's marker reads as a chest whatever its
 * trigger; an event no kind claims, or one claimed by a kind naming no symbol, shows its first page's trigger, which is
 * the page the map shows. Every symbol has a colour and words of its own, and the kinds' colours differ from each other
 * and from the triggers' shared slate, so a map's kinds read by colour alone.
 */
describe('eventMarkers', () =>
{
  /**
   * Builds an event whose pages start on the given triggers, in order.
   * @param {number[]} triggers Each page's trigger.
   * @returns {RmmzMapEvent} The event.
   */
  const withTriggers = (...triggers: number[]): RmmzMapEvent =>
  {
    return { ...createMapEvent(1, 0, 0), pages: triggers.map(trigger => ({ ...createEventPage(), trigger })) };
  };

  describe('triggerMarker', () =>
  {
    it('shows each of MZ\'s five triggers by its own symbol, and the action button for any other number', () =>
    {
      // Arrange: MZ's triggers in order, then numbers MZ never writes.
      const triggers = [ 0, 1, 2, 3, 4, 5, -1 ];

      // Act.
      const symbols = triggers.map(triggerMarker);

      // Assert.
      expect(symbols)
        .toStrictEqual([ 'action-button', 'player-touch', 'event-touch', 'autorun', 'parallel', 'action-button', 'action-button' ]);
    });
  });

  describe('markerSymbolFor', () =>
  {
    it('shows the symbol the kind claiming the event names, whatever its trigger', () =>
    {
      // Arrange: a parallel event claimed by a kind naming the battler's symbol.
      const event = withTriggers(4);

      // Act.
      const symbol = markerSymbolFor(event, { marker: 'battler' });

      // Assert.
      expect(symbol)
        .toBe('battler');
    });

    it('shows the first page\'s trigger for an event no kind claims, never a later page\'s', () =>
    {
      // Arrange: autorun first, parallel second; then parallel first, autorun second.
      const events = [ withTriggers(3, 4), withTriggers(4, 3) ];

      // Act.
      const symbols = events.map(event => markerSymbolFor(event, null));

      // Assert.
      expect(symbols)
        .toStrictEqual([ 'autorun', 'parallel' ]);
    });

    it('shows the trigger for an event whose kind names no symbol of its own', () =>
    {
      // Arrange: a player-touch event claimed by a kind with nothing to show.
      const event = withTriggers(1);

      // Act.
      const symbol = markerSymbolFor(event, {});

      // Assert.
      expect(symbol)
        .toBe('player-touch');
    });

    it('shows the action button for an event with no pages at all, as a fresh page would start', () =>
    {
      // Arrange.
      const event = withTriggers();

      // Act.
      const symbol = markerSymbolFor(event, null);

      // Assert.
      expect(symbol)
        .toBe('action-button');
    });
  });

  describe('MARKER_STYLES', () =>
  {
    it('gives every symbol words of its own, and the triggers the words MZ\'s trigger list uses', () =>
    {
      // Arrange: every symbol.

      // Act.
      const labels = MARKER_SYMBOLS.map(symbol => MARKER_STYLES[symbol].label);
      const triggerLabels = TRIGGER_MARKERS.map(symbol => MARKER_STYLES[symbol].label);

      // Assert.
      expect([ new Set(labels).size, triggerLabels ])
        .toStrictEqual([ MARKER_SYMBOLS.length, [ 'Action button', 'Player touch', 'Event touch', 'Autorun', 'Parallel' ] ]);
    });

    it('colours every kind apart from every other kind and from the triggers, which share one colour', () =>
    {
      // Arrange: the kinds' symbols, which are every symbol no trigger shows.
      const kinds = MARKER_SYMBOLS.filter(symbol => TRIGGER_MARKERS.includes(symbol) === false);

      // Act.
      const kindColours = kinds.map(symbol => MARKER_STYLES[symbol].colour);
      const triggerColours = new Set(TRIGGER_MARKERS.map(symbol => MARKER_STYLES[symbol].colour));

      // Assert: six kinds, six colours, none of them the triggers' one.
      expect([ kinds, new Set(kindColours).size, triggerColours.size, kindColours.some(colour => triggerColours.has(colour)) ])
        .toStrictEqual([ [ 'chest', 'transfer', 'dialogue', 'decor', 'battler', 'light' ], 6, 1, false ]);
    });
  });
});
