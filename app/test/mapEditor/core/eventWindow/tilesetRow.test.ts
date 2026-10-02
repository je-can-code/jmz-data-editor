import { describe, expect, it, vi } from 'vitest';
import { loadTilesetRow } from '../../../../src/mapEditor/core/eventWindow/tilesetRow.ts';
import type { RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * The event window's graphic picker cuts tile pictures from the one tileset the map draws with, and reads that row
 * straight from the server rather than holding the tilesets document: a window holding a document counts as keeping a
 * copy of it, which would let the window editing the tilesets close without asking about edits the event window can
 * neither show nor save. It owes the picker exactly the row asked for, and nothing for an id the project has no row at.
 */
describe('tilesetRow', () =>
{
  /**
   * Builds a tileset row told apart by its id and name.
   * @param {number} id The row's id.
   * @returns {RmmzTileset} The row.
   */
  const tileset = (id: number): RmmzTileset => ({ id, flags: [], mode: 1, name: `Tileset ${id}`, note: '', tilesetNames: [ '', '', '', '', '', `B${id}`, '', '', '' ] });

  describe('loadTilesetRow', () =>
  {
    it('reads the one row asked for, not its neighbours', async () =>
    {
      // Arrange: rows 1, 2 and 3 side by side.
      const source = { loadTilesets: vi.fn(async () => [ null, tileset(1), tileset(2), tileset(3) ]) };

      // Act.
      const row = await loadTilesetRow(source, 2);

      // Assert.
      expect([ row, source.loadTilesets.mock.calls.length ])
        .toStrictEqual([ tileset(2), 1 ]);
    });

    it('reads nothing for the empty first slot or an id past the last row', async () =>
    {
      // Arrange.
      const source = { loadTilesets: vi.fn(async () => [ null, tileset(1) ]) };

      // Act.
      const rows = [ await loadTilesetRow(source, 0), await loadTilesetRow(source, 9) ];

      // Assert: and the row that is there still reads.
      expect([ rows, await loadTilesetRow(source, 1) ])
        .toStrictEqual([ [ null, null ], tileset(1) ]);
    });
  });
});
