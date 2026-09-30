import { describe, expect, it } from 'vitest';
import type { ProbeEvent } from '../../../../scripts/parity/probeTypes.ts';
import {
  animates,
  coverAxis,
  explainCell,
  probeMapFor,
  snapshotPredictions,
  spriteCovers,
  type MapFile,
} from '../../../../scripts/parity/parityRules.ts';

/*
 * The parity check's verdict rests on these rules. The views must cover every cell of a map as the engine would
 * allow the display to sit; maps with moving water must be compared at every animation step; a difference in the
 * events pass counts as explained only by an event the game draws differently from its first page, and never under
 * a plainly drawn event, however much its neighbours move; and snapshot.js differences count as predicted only on
 * star-order and table cells.
 */

/**
 * Builds a map file with the given tiles on layer 1, by cell index.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {Record<number, number>} tiles Tile ids by (z * height + y) * width + x.
 * @returns {MapFile} The map.
 */
const mapFile = (width: number, height: number, tiles: Record<number, number> = {}): MapFile =>
{
  const data = new Array<number>(width * height * 6).fill(0);
  Object.entries(tiles).forEach(([ index, id ]) =>
  {
    data[Number(index)] = id;
  });
  return { width, height, tilesetId: 1, data };
};

/**
 * Builds an event as the probe reports it.
 * @param {Partial<ProbeEvent>} overrides What differs from a plainly drawn 48x48 character at (5, 5).
 * @returns {ProbeEvent} The event.
 */
const probeEvent = (overrides: Partial<ProbeEvent> = {}): ProbeEvent => ({
  id: 1,
  page: 0,
  visible: true,
  characterName: 'Actor1',
  tileId: 0,
  x: 5,
  y: 5,
  width: 48,
  height: 48,
  departures: [],
  ...overrides,
});

describe('parityRules', () =>
{
  describe('coverAxis and probeMapFor', () =>
  {
    it('covers a map with screens stepping a screen at a time, the last flush with the far edge', () =>
    {
      // Arrange: 75 tiles against a 40-tile screen; 30 against 22.5; 40 against 40.
      const axes: [ number, number ][] = [ [ 75, 40 ], [ 30, 22.5 ], [ 40, 40 ], [ 20, 40 ] ];

      // Act.
      const positions = axes.map(([ size, screen ]) => coverAxis(size, screen));

      // Assert.
      expect(positions)
        .toStrictEqual([ [ 0, 35 ], [ 0, 7.5 ], [ 0 ], [ 0 ] ]);
    });

    it('asks for every view of a map, at all four animation steps only when it has moving water', () =>
    {
      // Arrange: a 50x30 map with a waterfall (A1 kind 5) and one with only a still sea decoration (kind 2).
      const moving = mapFile(50, 30, { 0: 2048 + 5 * 48 });
      const still = mapFile(50, 30, { 0: 2048 + 2 * 48 });

      // Act.
      const orders = [ probeMapFor(7, moving, { width: 1920, height: 1080 }), probeMapFor(8, still, { width: 1920, height: 1080 }) ];

      // Assert.
      expect(orders)
        .toStrictEqual([
          { mapId: 7, views: [ { x: 0, y: 0 }, { x: 0, y: 7.5 }, { x: 10, y: 0 }, { x: 10, y: 7.5 } ], steps: [ 0, 1, 2, 3 ] },
          { mapId: 8, views: [ { x: 0, y: 0 }, { x: 0, y: 7.5 }, { x: 10, y: 0 }, { x: 10, y: 7.5 } ], steps: [ 0 ] },
        ]);
    });

    it('counts water only on the four tile layers', () =>
    {
      // Arrange: a sea tile on the region layer of a 1x1 map, where no tile draws.
      const map = mapFile(1, 1, { 5: 2048 });

      // Act.
      const moving = animates(map);

      // Assert.
      expect(moving)
        .toBe(false);
    });
  });

  describe('spriteCovers', () =>
  {
    it('covers the cells a sprite reaches, standing on its cell\'s bottom centre, and more with a margin', () =>
    {
      // Arrange: a 96x96 sprite at (5, 5) reaches from x 4 to 6 and up to row 3.
      const big = probeEvent({ width: 96, height: 96 });

      // Act.
      const covered = [ [ 4, 3 ], [ 6, 5 ], [ 7, 5 ], [ 5, 2 ], [ 5, 6 ] ].map(([ x, y ]) => spriteCovers(big, { x, y }, 0));
      const withMargin = [ [ 7, 5 ], [ 5, 6 ] ].map(([ x, y ]) => spriteCovers(big, { x, y }, 1));

      // Assert.
      expect([ covered, withMargin ])
        .toStrictEqual([ [ true, true, false, false, false ], [ true, true ] ]);
    });
  });

  describe('explainCell', () =>
  {
    const cell = { x: 5, y: 5, pixels: 10, maxDelta: 40 };

    it('explains a cell by an event the game draws its own way, or hides', () =>
    {
      // Arrange.
      const swaying = probeEvent({ departures: [ 'scaled 1.02x0.98' ] });
      const hidden = probeEvent({ visible: false });

      // Act.
      const reasons = [ explainCell(cell, [ swaying ]), explainCell(cell, [ hidden ]) ];

      // Assert.
      expect(reasons)
        .toStrictEqual([ 'event 1 scaled 1.02x0.98', 'event 1 is hidden in the game' ]);
    });

    it('leaves a cell unexplained under a plainly drawn event, however much a neighbour moves', () =>
    {
      // Arrange: a plain chest on the cell, a swaying battler beside it.
      const chest = probeEvent({ id: 2 });
      const battler = probeEvent({ id: 3, x: 6, departures: [ 'scaled 1.02x0.98' ] });

      // Act.
      const reason = explainCell(cell, [ chest, battler ]);

      // Assert.
      expect(reason)
        .toBeNull();
    });

    it('leaves a cell unexplained with no event near it', () =>
    {
      // Arrange: a departing event far away.
      const far = probeEvent({ x: 20, y: 20, departures: [ 'opacity 128' ] });

      // Act.
      const reason = explainCell(cell, [ far ]);

      // Assert.
      expect(reason)
        .toBeNull();
    });
  });

  describe('snapshotPredictions', () =>
  {
    it('predicts a star tile under a later non-star tile, a table, and the cell under a layer 2 table', () =>
    {
      // Arrange: a 3x2 map; (0,0) star on layer 1 under a plain B tile on layer 3; (1,0) a table on layer 2; (2,0) a
      // star alone; tile 2 is a star, tile 3 plain, tile 2816 a table.
      const flags: number[] = [];
      flags[2] = 0x10;
      flags[2816] = 0x80;
      const map = mapFile(3, 2, { 0: 2, [(2 * 2 + 0) * 3 + 0]: 3, [(1 * 2 + 0) * 3 + 1]: 2816, 2: 2 });

      // Act.
      const predicted = [ ...snapshotPredictions(map, flags).entries() ];

      // Assert: (2,0)'s star has nothing above it, so it draws the same either way.
      expect(predicted)
        .toStrictEqual([
          [ '0,0', 'star tile drawn above a later layer' ],
          [ '1,0', 'table legs or edge' ],
          [ '1,1', 'table legs or edge' ],
        ]);
    });
  });
});
