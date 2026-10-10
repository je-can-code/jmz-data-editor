import type { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { AreaOnMap } from '../../../../src/mapEditor/core/events/eventAreas.ts';
import type { EventFootprint } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { bandEdges, drawFootprint } from '../../../../src/mapEditor/render/scene/footprintDrawing.ts';

/*
 * A footprint is the part of an event's area on the map, drawn as a band inset from its tiles exactly as far as a
 * marker's square is from its tile, 4 world pixels of a 48-pixel tile, with the marker's own rounded corners, so the
 * marker on the event's own tile sits in the band's corner and the two read as one. The band is washed faintly in the
 * marker's colour and outlined in it, an exit's wash a little stronger. An exit strip carries a white chevron on every tile
 * but the event's own, pointing the way the exit sends the player; an exit keeping the player's facing points nowhere.
 * Wherever the map's edge cuts the band, the band runs square right up to the edge, and the cut is marked: a red line along
 * it, and a red badge with an exclamation mark straddling the edge, on the middle of the cut side or the corner where both
 * edges cut.
 */
describe('footprintDrawing', () =>
{
  /**
   * Stands in for pixi's graphics, recording every call made on it in order.
   */
  class RecordingGraphics
  {
    calls: [ string, ...unknown[] ][] = [];

    /**
     * Records one call, and hands back the graphics, as pixi's chain.
     * @param {string} name The call.
     * @param {unknown[]} args What it was handed.
     * @returns {RecordingGraphics} The graphics.
     */
    #record(name: string, args: unknown[]): this
    {
      this.calls.push([ name, ...args ]);
      return this;
    }

    clear(): this
    {
      return this.#record('clear', []);
    }

    roundShape(...args: unknown[]): this
    {
      return this.#record('roundShape', args);
    }

    poly(...args: unknown[]): this
    {
      return this.#record('poly', args);
    }

    circle(...args: unknown[]): this
    {
      return this.#record('circle', args);
    }

    rect(...args: unknown[]): this
    {
      return this.#record('rect', args);
    }

    moveTo(...args: unknown[]): this
    {
      return this.#record('moveTo', args);
    }

    lineTo(...args: unknown[]): this
    {
      return this.#record('lineTo', args);
    }

    fill(...args: unknown[]): this
    {
      return this.#record('fill', args);
    }

    stroke(...args: unknown[]): this
    {
      return this.#record('stroke', args);
    }

    /**
     * The calls of one name, without the name.
     * @param {string} name The call.
     * @returns {unknown[][]} What each was handed.
     */
    named(name: string): unknown[][]
    {
      return this.calls.filter(([ called ]) => called === name).map(([ , ...args ]) => args);
    }
  }

  /**
   * Draws a footprint on a recorder, at the game's 48-pixel tiles.
   * @param {AreaOnMap} onMap Where the area lies.
   * @param {EventFootprint} footprint How it looks.
   * @returns {RecordingGraphics} What was drawn.
   */
  const drawn = (onMap: AreaOnMap, footprint: EventFootprint): RecordingGraphics =>
  {
    const graphics = new RecordingGraphics();
    drawFootprint(graphics as unknown as Graphics, onMap, footprint, 48);
    return graphics;
  };

  /**
   * The radius of a marker's corner on the map: 20 of the atlas's 112 pixels, on a 40-pixel square.
   */
  const CORNER = (20 * 40) / 112;

  /**
   * A 3 by 1 area from 1, 2, wholly on the map.
   */
  const WHOLE: AreaOnMap = { x: 1, y: 2, width: 3, height: 1, pastRight: 0, pastBottom: 0 };

  /**
   * Finds the tip of a chevron drawn as a polygon: its third point.
   * @param {unknown[]} args The polygon's call.
   * @returns {number[]} The tip, rounded to a hundredth.
   */
  const tipOf = (args: unknown[]): number[] =>
  {
    const [ points ] = args as [ number[] ];
    return [ points[4], points[5] ].map(value => Math.round(value * 100) / 100);
  };

  it('draws a band inset from its tiles as far as a marker, rounded as a marker, washed and outlined in its colour', () =>
  {
    // Arrange: a dialogue's colour, no exit.
    const footprint: EventFootprint = { area: { width: 3, height: 1 }, colour: 0x1976d2, exit: null };

    // Act.
    const graphics = drawn(WHOLE, footprint);

    // Assert: drawn afresh; four rounded corners from 52, 100 to 188, 140; a faint wash and an outline; nothing more.
    expect([ graphics.calls[0], graphics.named('roundShape'), graphics.named('fill'), graphics.named('stroke'), graphics.calls.length ])
      .toStrictEqual([
        [ 'clear' ],
        [ [
          [
            { x: 52, y: 100, radius: CORNER },
            { x: 188, y: 100, radius: CORNER },
            { x: 188, y: 140, radius: CORNER },
            { x: 52, y: 140, radius: CORNER },
          ],
          CORNER,
        ] ],
        [ [ { color: 0x1976d2, alpha: 0.2 } ] ],
        [ [ { color: 0x1976d2, alpha: 0.85, width: 2 } ] ],
        4,
      ]);
  });

  it('washes an exit strip a little stronger, with a chevron on every tile but the event\'s own', () =>
  {
    // Arrange: an exit sending the player up.
    const footprint: EventFootprint = { area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: 8 };

    // Act.
    const graphics = drawn(WHOLE, footprint);

    // Assert: the band's wash, then two chevrons in white, on the middles of 2, 2 and 3, 2, each tip above its middle.
    const chevrons = graphics.named('poly');
    expect([ graphics.named('fill'), chevrons.length, chevrons.map(tipOf) ])
      .toStrictEqual([
        [ [ { color: 0x2e7d32, alpha: 0.3 } ], [ { color: 0xffffff, alpha: 0.7 } ], [ { color: 0xffffff, alpha: 0.7 } ] ],
        2,
        [ [ 120, 113.04 ], [ 168, 113.04 ] ],
      ]);
  });

  it('points each chevron the way its exit sends the player', () =>
  {
    // Arrange: one tile beside the event's own, 2, 2, its middle at 120, 120, for each way.
    const strip: AreaOnMap = { x: 1, y: 2, width: 2, height: 1, pastRight: 0, pastBottom: 0 };
    const ways = [ 2, 4, 6, 8 ] as const;

    // Act.
    const tips = ways.map(exit => tipOf(drawn(strip, { area: { width: 2, height: 1 }, colour: 0x2e7d32, exit }).named('poly')[0]));

    // Assert: down, left, right, up.
    expect(tips)
      .toStrictEqual([ [ 120, 126.96 ], [ 113.04, 120 ], [ 126.96, 120 ], [ 120, 113.04 ] ]);
  });

  it('draws no chevron for an exit keeping the player\'s facing, or for a band that is no exit', () =>
  {
    // Arrange.
    const kept: EventFootprint = { area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: 0 };
    const plain: EventFootprint = { area: { width: 3, height: 1 }, colour: 0x2e7d32, exit: null };

    // Act.
    const chevrons = [ drawn(WHOLE, kept), drawn(WHOLE, plain) ].map(graphics => graphics.named('poly').length);

    // Assert.
    expect(chevrons)
      .toStrictEqual([ 0, 0 ]);
  });

  it('runs a band cut at the right edge square to the edge, and marks the cut with a red line and a badge on its middle', () =>
  {
    // Arrange: as Map229's event 3, 6 of its 15 tiles on the 50-wide map, from 44, 39.
    const cut: AreaOnMap = { x: 44, y: 39, width: 6, height: 1, pastRight: 9, pastBottom: 0 };

    // Act.
    const graphics = drawn(cut, { area: { width: 15, height: 1 }, colour: 0x2e7d32, exit: 6 });

    // Assert: square at the edge, 2400 across; the line just inside it from the band's top to its bottom; the badge on
    // the edge, halfway down the band.
    const [ [ corners ] ] = graphics.named('roundShape') as [ { x: number; y: number; radius: number }[] ][];
    const [ badge ] = graphics.named('circle');
    expect([ corners.map(corner => [ corner.x, corner.y, corner.radius ]), graphics.named('moveTo'), graphics.named('lineTo'), badge ])
      .toStrictEqual([
        [ [ 2116, 1876, CORNER ], [ 2400, 1876, 0 ], [ 2400, 1916, 0 ], [ 2116, 1916, CORNER ] ],
        [ [ 2398, 1876 ] ],
        [ [ 2398, 1916 ] ],
        [ 2400, 1896, 48 * 0.21 ],
      ]);
  });

  it('runs a band cut at the bottom edge square to the edge, with the badge on the middle of the bottom', () =>
  {
    // Arrange: as Map268's event 1, the one tile of its three on the 20-high map, at 14, 19.
    const cut: AreaOnMap = { x: 14, y: 19, width: 1, height: 1, pastRight: 0, pastBottom: 2 };

    // Act.
    const graphics = drawn(cut, { area: { width: 1, height: 3 }, colour: 0x2e7d32, exit: 2 });

    // Assert: no chevron, the band being the event's own tile; square along the bottom at 960, rounded on top.
    const [ [ corners ] ] = graphics.named('roundShape') as [ { x: number; y: number; radius: number }[] ][];
    const [ badge ] = graphics.named('circle');
    expect([ corners.map(corner => [ corner.x, corner.y, corner.radius ]), graphics.named('moveTo'), graphics.named('lineTo'), badge, graphics.named('poly') ])
      .toStrictEqual([
        [ [ 676, 916, CORNER ], [ 716, 916, CORNER ], [ 716, 960, 0 ], [ 676, 960, 0 ] ],
        [ [ 676, 958 ] ],
        [ [ 716, 958 ] ],
        [ 696, 960, 48 * 0.21 ],
        [],
      ]);
  });

  it('marks a band cut at both edges along both, with the badge on the corner where they meet', () =>
  {
    // Arrange: 2 by 2 of a 4 by 4 area on a 10 by 7 map, from 8, 5.
    const cut: AreaOnMap = { x: 8, y: 5, width: 2, height: 2, pastRight: 2, pastBottom: 2 };

    // Act.
    const graphics = drawn(cut, { area: { width: 4, height: 4 }, colour: 0x546e7a, exit: null });

    // Assert: square on three corners; one line down the right edge and one along the bottom; the badge on the corner.
    const [ [ corners ] ] = graphics.named('roundShape') as [ { x: number; y: number; radius: number }[] ][];
    const [ badge ] = graphics.named('circle');
    expect([ corners.map(corner => corner.radius), graphics.named('moveTo'), graphics.named('lineTo'), badge ])
      .toStrictEqual([
        [ CORNER, 0, 0, 0 ],
        [ [ 478, 244 ], [ 388, 334 ] ],
        [ [ 478, 336 ], [ 480, 334 ] ],
        [ 480, 336, 48 * 0.21 ],
      ]);
  });

  describe('bandEdges', () =>
  {
    it('insets a band from its tiles on every side the map does not cut', () =>
    {
      // Arrange.
      const areas: AreaOnMap[] = [ WHOLE, { ...WHOLE, pastRight: 1 }, { ...WHOLE, pastBottom: 1 } ];

      // Act.
      const edges = areas.map(area => bandEdges(area, 48));

      // Assert.
      expect(edges)
        .toStrictEqual([
          { left: 52, top: 100, right: 188, bottom: 140 },
          { left: 52, top: 100, right: 192, bottom: 140 },
          { left: 52, top: 100, right: 188, bottom: 144 },
        ]);
    });
  });
});
