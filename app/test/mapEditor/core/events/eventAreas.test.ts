import { describe, expect, it } from 'vitest';
import {
  areaCovers,
  areaLines,
  areaOnMap,
  isWhollyOnMap,
  pastEdgeWords,
  shownAreaOf,
  type AreaOnMap,
} from '../../../../src/mapEditor/core/events/eventAreas.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PageShown, ShownPageReader } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * An event's area runs right and down from the tile it stands on, its own tile included, as J-Pixelistics puts it. On a
 * map the area is cut at the right and bottom edges, the only two it can run past, and what is cut away is counted, so
 * the map can mark the cut and the quick panel can say how far the area runs off the map, where the player can never go.
 * A tile is covered only by the part on the map. The area an event shows is the area of the page every map view shows it
 * with: the page the game shows, or its first while none holds, as the map draws it faded. A panel showing several events
 * names each one whose area runs off, and says nothing of an area wholly on the map.
 */
describe('eventAreas', () =>
{
  describe('areaOnMap', () =>
  {
    it('keeps an area wholly on the map whole, right up to the edges', () =>
    {
      // Arrange: a 3 by 2 area whose last column and row are the map's last, on a 10 by 8 map.
      const area = { width: 3, height: 2 };

      // Act.
      const onMap = areaOnMap(7, 6, area, 10, 8);

      // Assert.
      expect(onMap)
        .toStrictEqual({ x: 7, y: 6, width: 3, height: 2, pastRight: 0, pastBottom: 0 });
    });

    it('cuts an area at the right edge and counts the columns past it', () =>
    {
      // Arrange: as Map229's event 3, a 15 by 1 strip from 44, 39 on a 50 by 40 map.
      const area = { width: 15, height: 1 };

      // Act.
      const onMap = areaOnMap(44, 39, area, 50, 40);

      // Assert.
      expect(onMap)
        .toStrictEqual({ x: 44, y: 39, width: 6, height: 1, pastRight: 9, pastBottom: 0 });
    });

    it('cuts an area at the bottom edge and counts the rows past it', () =>
    {
      // Arrange: as Map268's event 1, a 1 by 3 strip from 14, 19 on a 35 by 20 map.
      const area = { width: 1, height: 3 };

      // Act.
      const onMap = areaOnMap(14, 19, area, 35, 20);

      // Assert.
      expect(onMap)
        .toStrictEqual({ x: 14, y: 19, width: 1, height: 1, pastRight: 0, pastBottom: 2 });
    });

    it('cuts an area at both edges at once', () =>
    {
      // Arrange: a 4 by 4 area from 8, 5 on a 10 by 7 map.
      const area = { width: 4, height: 4 };

      // Act.
      const onMap = areaOnMap(8, 5, area, 10, 7);

      // Assert.
      expect(onMap)
        .toStrictEqual({ x: 8, y: 5, width: 2, height: 2, pastRight: 2, pastBottom: 2 });
    });

    it('leaves nothing on the map of an event standing off it, counting no more than the area has', () =>
    {
      // Arrange: a 3 by 1 area from 12, 0 on a map made 10 wide after the event was placed.
      const area = { width: 3, height: 1 };

      // Act.
      const onMap = areaOnMap(12, 0, area, 10, 5);

      // Assert.
      expect(onMap)
        .toStrictEqual({ x: 12, y: 0, width: 0, height: 1, pastRight: 3, pastBottom: 0 });
    });
  });

  describe('isWhollyOnMap', () =>
  {
    it('says an area is wholly on the map only while nothing of it runs past either edge', () =>
    {
      // Arrange: one whole, one cut at the right, one cut at the bottom.
      const areas: AreaOnMap[] = [
        { x: 0, y: 0, width: 2, height: 1, pastRight: 0, pastBottom: 0 },
        { x: 0, y: 0, width: 2, height: 1, pastRight: 1, pastBottom: 0 },
        { x: 0, y: 0, width: 2, height: 1, pastRight: 0, pastBottom: 1 },
      ];

      // Act.
      const whole = areas.map(isWhollyOnMap);

      // Assert.
      expect(whole)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('areaCovers', () =>
  {
    it('covers every tile of the part on the map, and no tile just beside it on any side', () =>
    {
      // Arrange: a 3 by 2 part from 4, 5.
      const onMap: AreaOnMap = { x: 4, y: 5, width: 3, height: 2, pastRight: 0, pastBottom: 0 };
      const inside = [ [ 4, 5 ], [ 6, 5 ], [ 4, 6 ], [ 6, 6 ] ];
      const beside = [ [ 3, 5 ], [ 7, 5 ], [ 4, 4 ], [ 4, 7 ] ];

      // Act.
      const covered = [ ...inside, ...beside ].map(([ column, row ]) => areaCovers(onMap, column, row));

      // Assert.
      expect(covered)
        .toStrictEqual([ true, true, true, true, false, false, false, false ]);
    });
  });

  describe('shownAreaOf', () =>
  {
    /**
     * Picks the same page for every event.
     * @param {PageShown} shown The page.
     * @returns {ShownPageReader} The reader.
     */
    const showing = (shown: PageShown): ShownPageReader => ({ shownPage: () => shown });

    /**
     * Reads a page's area as its first comment's width, one tile high, or none for a page without a comment.
     * @param {RmmzEventPage} read The page.
     * @returns {{ width: number, height: number } | null} The area.
     */
    const firstComment = (read: RmmzEventPage) =>
    {
      const [ first ] = read.list;
      return first.code === 108 ? { width: Number(first.parameters[0]), height: 1 } : null;
    };

    it('reads the area of the page the event is shown with, faded or not', () =>
    {
      // Arrange: page 1 covers 3 tiles, page 2 covers 5.
      const shownEvent = event(1, [ page([ command(108, [ '3' ]) ]), page([ command(108, [ '5' ]) ]) ]);

      // Act.
      const areas = [ showing({ index: 1, faded: false }), showing({ index: 0, faded: true }) ]
        .map(pages => shownAreaOf(shownEvent, pages, firstComment));

      // Assert.
      expect(areas)
        .toStrictEqual([ { width: 5, height: 1 }, { width: 3, height: 1 } ]);
    });

    it('reads none for an event with no pages at all', () =>
    {
      // Arrange.
      const bare: RmmzMapEvent = event(1, []);

      // Act.
      const area = shownAreaOf(bare, showing({ index: 0, faded: true }), firstComment);

      // Assert.
      expect(area)
        .toBeNull();
    });
  });

  describe('pastEdgeWords', () =>
  {
    it('says how many tiles run past each edge, one tile alone, and nothing for an area wholly on the map', () =>
    {
      // Arrange.
      const areas: AreaOnMap[] = [
        { x: 44, y: 39, width: 6, height: 1, pastRight: 9, pastBottom: 0 },
        { x: 14, y: 19, width: 1, height: 1, pastRight: 0, pastBottom: 1 },
        { x: 8, y: 5, width: 2, height: 2, pastRight: 2, pastBottom: 3 },
        { x: 0, y: 0, width: 2, height: 2, pastRight: 0, pastBottom: 0 },
      ];

      // Act.
      const words = areas.map(pastEdgeWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'The trigger area runs 9 tiles past the right edge of the map, where the player can never go.',
          'The trigger area runs 1 tile past the bottom edge of the map, where the player can never go.',
          'The trigger area runs 2 tiles past the right edge and 3 tiles past the bottom edge of the map, where the player can never go.',
          null,
        ]);
    });
  });

  describe('areaLines', () =>
  {
    const PAST: AreaOnMap = { x: 44, y: 39, width: 6, height: 1, pastRight: 9, pastBottom: 0 };
    const WHOLE: AreaOnMap = { x: 1, y: 1, width: 3, height: 1, pastRight: 0, pastBottom: 0 };

    it('says how far a lone event\'s area runs off the map without naming it', () =>
    {
      // Arrange.
      const events = [ { id: 3, name: 'Transfer (Forest)', onMap: PAST } ];

      // Act.
      const lines = areaLines(events);

      // Assert.
      expect(lines)
        .toStrictEqual([ { key: 'area:3', text: 'The trigger area runs 9 tiles past the right edge of the map, where the player can never go.' } ]);
    });

    it('names each of several events whose area runs off, by number when it has no name, and says nothing of the rest', () =>
    {
      // Arrange: one running off with a name, one wholly on the map, one with no area, one running off without a name.
      const events = [
        { id: 3, name: 'exit', onMap: PAST },
        { id: 4, name: 'stairs', onMap: WHOLE },
        { id: 5, name: 'sign', onMap: null },
        { id: 6, name: '', onMap: PAST },
      ];

      // Act.
      const lines = areaLines(events);

      // Assert.
      expect(lines.map(line => [ line.key, line.text.slice(0, line.text.indexOf(':') + 1) ]))
        .toStrictEqual([ [ 'area:3', 'exit:' ], [ 'area:6', 'Event 6:' ] ]);
    });
  });
});
