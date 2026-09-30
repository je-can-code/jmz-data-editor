import { describe, expect, it } from 'vitest';
import {
  autotileKind,
  autotileShape,
  isAutotile,
  isHigherTile,
  isShadowingTile,
  isTableTile,
  isTileA1,
  isTileA2,
  isTileA3,
  isTileA4,
  isTileA5,
  isVisibleTile,
  normalTileCell,
  normalTileSheet,
} from '../../../../src/mapEditor/render/engine/tileIds.ts';

/*
 * Every rect the renderer draws starts from a tile id, so these predicates decide which sheet a tile is cut from,
 * whether it draws above characters and whether it is a table. They must agree with the engine's Tilemap statics at
 * every sheet boundary, since a tile one id past a boundary belongs to the next sheet and would otherwise be cut from
 * the wrong picture. Each boundary is tested from both sides.
 */
describe('tileIds', () =>
{
  describe('sheet ranges', () =>
  {
    it('puts each id on its sheet, and the ids either side of each boundary on the neighbouring sheets', () =>
    {
      // Arrange: the last and first ids of each sheet.
      const ids = [ 1535, 1536, 2047, 2048, 2815, 2816, 4351, 4352, 5887, 5888, 8191, 8192 ];

      // Act.
      const sheets = ids.map(id => [ isTileA5(id), isTileA1(id), isTileA2(id), isTileA3(id), isTileA4(id) ].indexOf(true));

      // Assert: -1 is none of the A sheets (B to E below, nothing above).
      expect(sheets)
        .toStrictEqual([ -1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, -1 ]);
    });

    it('draws ids from 1 up to the last A4 shape, and nothing else', () =>
    {
      // Arrange.
      const ids = [ 0, 1, 8191, 8192 ];

      // Act.
      const visible = ids.map(isVisibleTile);

      // Assert.
      expect(visible)
        .toStrictEqual([ false, true, true, false ]);
    });

    it('counts autotiles from the first A1 id', () =>
    {
      // Arrange.
      const ids = [ 2047, 2048 ];

      // Act.
      const autotiles = ids.map(isAutotile);

      // Assert.
      expect(autotiles)
        .toStrictEqual([ false, true ]);
    });

    it('stops a table edge only on A3 and A4', () =>
    {
      // Arrange: an A2 tile, the first A3, the last A4 and a B tile.
      const ids = [ 4351, 4352, 8191, 40 ];

      // Act.
      const shadowing = ids.map(isShadowingTile);

      // Assert.
      expect(shadowing)
        .toStrictEqual([ false, true, true, false ]);
    });
  });

  describe('autotileKind and autotileShape', () =>
  {
    it('splits an autotile id into its kind and shape, 48 shapes to a kind', () =>
    {
      // Arrange: kind 0 shape 0, kind 0 shape 47, kind 1 shape 0, and A2's first tile (kind 16).
      const ids = [ 2048, 2095, 2096, 2816 ];

      // Act.
      const parts = ids.map(id => [ autotileKind(id), autotileShape(id) ]);

      // Assert.
      expect(parts)
        .toStrictEqual([ [ 0, 0 ], [ 0, 47 ], [ 1, 0 ], [ 16, 0 ] ]);
    });
  });

  describe('isHigherTile and isTableTile', () =>
  {
    it('reads the star flag, and nothing else, for drawing above characters', () =>
    {
      // Arrange: tile 1 has the star, tile 2 every other bit, tile 3 no flags.
      const flags = [ 0, 0x10, 0xffef, 0 ];

      // Act.
      const higher = [ 1, 2, 3, 99 ].map(id => isHigherTile(flags, id));

      // Assert.
      expect(higher)
        .toStrictEqual([ true, false, false, false ]);
    });

    it('calls an A2 tile with the counter flag a table, and no other sheet', () =>
    {
      // Arrange: an A2 tile and an A3 tile both flagged, and an A2 tile without the flag.
      const flags: number[] = [];
      flags[2816] = 0x80;
      flags[2817] = 0;
      flags[4352] = 0x80;

      // Act.
      const tables = [ 2816, 2817, 4352 ].map(id => isTableTile(flags, id));

      // Assert.
      expect(tables)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('normalTileSheet and normalTileCell', () =>
  {
    it('cuts B to E tiles from sheets 5 to 8 and A5 from sheet 4, eight to a row in two columns', () =>
    {
      // Arrange: B 0, B 9 (second row), B 128 (right column), C 0, E 255, A5 1536.
      const ids = [ 0, 9, 128, 256, 1023, 1536 ];

      // Act.
      const cuts = ids.map(id => [ normalTileSheet(id), normalTileCell(id) ]);

      // Assert.
      expect(cuts)
        .toStrictEqual([
          [ 5, { column: 0, row: 0 } ],
          [ 5, { column: 1, row: 1 } ],
          [ 5, { column: 8, row: 0 } ],
          [ 6, { column: 0, row: 0 } ],
          [ 8, { column: 15, row: 15 } ],
          [ 4, { column: 0, row: 0 } ],
        ]);
    });
  });
});
