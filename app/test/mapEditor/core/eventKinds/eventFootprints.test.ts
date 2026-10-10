import { describe, expect, it } from 'vitest';
import { colourNumber, exitWayOf, footprintReaderFor, type FootprintSource } from '../../../../src/mapEditor/core/eventKinds/eventFootprints.ts';
import { TRANSFER_KIND_ID } from '../../../../src/mapEditor/core/eventKinds/transferKind.ts';
import type { EventArea } from '../../../../src/mapEditor/core/events/eventAreas.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { EventKindDefinition } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { command, event, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * An event shows the area its page covers in the colour of its marker, so the two read as one: a kind's own colour, or
 * the trigger's slate for an event no kind names a symbol for. A transfer whose page sends the player on shows its area as
 * an exit strip, pointing the way the transfer turns the player, or nowhere for one keeping the player's facing; a
 * transfer's page that sends nobody anywhere, such as a locked door's message, is no exit. A page covering only its own
 * tile, by declaring nothing or one tile by one, shows nothing. The modules are read whenever an event is drawn, so a
 * reader built before they switch on reads them once they have.
 */
describe('eventFootprints', () =>
{
  /**
   * The window's modules as a footprint reads them: a page's area from its first comment's two numbers, and a kind for
   * each event by id.
   * @param {Record<number, Partial<EventKindDefinition>>} kinds The kinds, by event id; an event not named has none.
   * @returns {FootprintSource} The modules.
   */
  const modulesWith = (kinds: Record<number, Partial<EventKindDefinition>> = {}): FootprintSource => ({
    areaOf: (read: RmmzEventPage): EventArea | null =>
    {
      const found = read.list.find(each => each.code === 108);
      const [ width, height ] = String(found?.parameters[0] ?? '').split('x').map(Number);
      return found === undefined ? null : { width, height };
    },
    kindOf: (shown: RmmzMapEvent) => (kinds[shown.id] ?? null) as EventKindDefinition | null,
  });

  /**
   * The transfer kind, as the core registers it.
   */
  const TRANSFER: Partial<EventKindDefinition> = { id: TRANSFER_KIND_ID, marker: 'transfer' };

  describe('footprintReaderFor', () =>
  {
    it('shows a transfer\'s area as an exit strip in its marker\'s green, pointing the way it turns the player', () =>
    {
      // Arrange: an exit along a map's top edge, sending the player up, and one along its right edge, sending them right.
      const up = event(1, [ transferPage([ 0, 5, 3, 4, 8, 0 ], [ command(108, [ '7x1' ]) ]) ]);
      const right = event(2, [ transferPage([ 0, 5, 3, 4, 6, 0 ], [ command(108, [ '1x5' ]) ]) ]);
      const read = footprintReaderFor(modulesWith({ 1: TRANSFER, 2: TRANSFER }));

      // Act.
      const footprints = [ read(up, 3, up.pages[0]), read(right, 3, right.pages[0]) ];

      // Assert.
      expect(footprints)
        .toStrictEqual([
          { area: { width: 7, height: 1 }, colour: 0x2e7d32, exit: 8 },
          { area: { width: 1, height: 5 }, colour: 0x2e7d32, exit: 6 },
        ]);
    });

    it('shows an exit keeping the player\'s facing pointing nowhere', () =>
    {
      // Arrange.
      const kept = event(1, [ transferPage([ 0, 5, 3, 4, 0, 0 ], [ command(108, [ '3x1' ]) ]) ]);

      // Act.
      const footprint = footprintReaderFor(modulesWith({ 1: TRANSFER }))(kept, 3, kept.pages[0]);

      // Assert.
      expect(footprint)
        .toStrictEqual({ area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: 0 });
    });

    it('shows a transfer\'s message page as no exit, in the transfer\'s green, and its transfer page as one', () =>
    {
      // Arrange: a locked exit whose first page only says so, and whose second transfers, with modules giving every page
      // a 3 by 1 area.
      const locked = event(1, [ page(text([ 'It will not budge.' ])), transferPage([ 0, 5, 3, 4, 2, 0 ]) ]);
      const modules: FootprintSource = { ...modulesWith({ 1: TRANSFER }), areaOf: () => ({ width: 3, height: 1 }) };
      const read = footprintReaderFor(modules);

      // Act.
      const footprints = locked.pages.map(each => read(locked, 3, each));

      // Assert.
      expect(footprints)
        .toStrictEqual([
          { area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: null },
          { area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: 2 },
        ]);
    });

    it('shows any other event\'s area in its kind\'s colour, or the trigger\'s slate with no kind naming one, as no exit', () =>
    {
      // Arrange: a dialogue, and an event no kind claims; each page transfers, which only a transfer's makes an exit.
      const talk = event(1, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '2x2' ]) ]) ]);
      const unclaimed = event(2, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '2x2' ]) ]) ]);
      const read = footprintReaderFor(modulesWith({ 1: { id: 'core.dialogue', marker: 'dialogue' } }));

      // Act.
      const footprints = [ read(talk, 3, talk.pages[0]), read(unclaimed, 3, unclaimed.pages[0]) ];

      // Assert.
      expect(footprints)
        .toStrictEqual([
          { area: { width: 2, height: 2 }, colour: 0x1976d2, exit: null },
          { area: { width: 2, height: 2 }, colour: 0x546e7a, exit: null },
        ]);
    });

    it('shows nothing for a page declaring no area, or only its own tile', () =>
    {
      // Arrange: a transfer with no area, and one whose area is one tile by one.
      const bare = event(1, [ transferPage() ]);
      const single = event(2, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '1x1' ]) ]) ]);
      const read = footprintReaderFor(modulesWith({ 1: TRANSFER, 2: TRANSFER }));

      // Act.
      const footprints = [ read(bare, 3, bare.pages[0]), read(single, 3, single.pages[0]) ];

      // Assert.
      expect(footprints)
        .toStrictEqual([ null, null ]);
    });

    it('reads a page one tile wide or high but longer the other way as the area it is', () =>
    {
      // Arrange: areas one tile by two, and two tiles by one, near misses of a single tile.
      const tall = event(1, [ page([ command(108, [ '1x2' ]) ]) ]);
      const wide = event(2, [ page([ command(108, [ '2x1' ]) ]) ]);
      const read = footprintReaderFor(modulesWith());

      // Act.
      const areas = [ read(tall, 3, tall.pages[0])?.area, read(wide, 3, wide.pages[0])?.area ];

      // Assert.
      expect(areas)
        .toStrictEqual([ { width: 1, height: 2 }, { width: 2, height: 1 } ]);
    });

    it('reads the modules as they stand when an event is drawn, not when the reader was built', () =>
    {
      // Arrange: modules reading no area until they switch on.
      let on = false;
      const modules: FootprintSource = { ...modulesWith(), areaOf: () => (on ? { width: 4, height: 1 } : null) };
      const read = footprintReaderFor(modules);
      const strip = event(1, [ page([]) ]);
      const before = read(strip, 3, strip.pages[0]);

      // Act.
      on = true;
      const after = read(strip, 3, strip.pages[0]);

      // Assert.
      expect([ before, after?.area ])
        .toStrictEqual([ null, { width: 4, height: 1 } ]);
    });
  });

  describe('exitWayOf', () =>
  {
    it('reads the way each transfer page turns the player, and none from a page that is not one of its transfers', () =>
    {
      // Arrange: one event with a page for each facing, then a message page, and a page held by another event.
      const ways = [ 2, 4, 6, 8, 0 ];
      const exit = event(1, [ ...ways.map(way => transferPage([ 0, 5, 3, 4, way, 0 ])), page(text([ 'Locked.' ])) ]);
      const elsewhere = transferPage([ 0, 5, 3, 4, 2, 0 ]);

      // Act.
      const read = [ ...exit.pages.map(each => exitWayOf(exit, each)), exitWayOf(exit, elsewhere) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 2, 4, 6, 8, 0, null, null ]);
    });

    it('reads none from an event that is no transfer at all', () =>
    {
      // Arrange: a page that talks before it transfers, which makes it a scene.
      const scene = event(1, [ page([ ...text([ 'Off we go!' ]), command(201, [ 0, 5, 3, 4, 2, 0 ]) ]) ]);

      // Act.
      const way = exitWayOf(scene, scene.pages[0]);

      // Assert.
      expect(way)
        .toBeNull();
    });
  });

  describe('colourNumber', () =>
  {
    it('reads a CSS colour as the number a renderer draws with', () =>
    {
      // Arrange.
      const colours = [ '#2e7d32', '#ffffff', '#000000' ];

      // Act.
      const numbers = colours.map(colourNumber);

      // Assert.
      expect(numbers)
        .toStrictEqual([ 0x2e7d32, 0xffffff, 0 ]);
    });
  });
});
