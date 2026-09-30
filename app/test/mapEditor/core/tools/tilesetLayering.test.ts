import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapDocumentKey, TILESETS_KEY } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { TILESET_MARKS_DOCUMENT, TilesetLayeringSource } from '../../../../src/mapEditor/core/tools/tilesetLayering.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * How a map's tileset layers, for the painting tools.
 *
 * The tools read the map's tileset mode from the tilesets the window holds and its "goes on top" marks from the marks
 * document, and follow both as they change: a tile marked in the palette lays over the ground on the very next
 * stroke. Either one not held yet counts as the defaults, an Area tileset with nothing marked, so painting works
 * before they arrive. The preview asks on every move of the pointer, so an answer is reused while nothing changed.
 */
describe('TilesetLayeringSource', () =>
{
  /**
   * Builds a window holding map 1 on tileset 4, and optionally the tilesets and the marks.
   * @param {{ tilesets?: boolean, marks?: boolean }} held What else the window holds.
   * @returns {{ hub: DocumentHub, map: MapDocument }} The window and the map.
   */
  const windowWith = (held: { tilesets?: boolean; marks?: boolean }) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    const map = hub.adopt(mapDocumentKey(1), buildMapJson() as unknown as JsonValue) as MapDocument;
    if (held.tilesets === true)
    {
      const tileset = { id: 4, flags: [], mode: 0, name: 'Overworld', note: '', tilesetNames: [] };
      hub.adopt(TILESETS_KEY, [ null, null, null, null, tileset ] as unknown as JsonValue);
    }

    if (held.marks === true)
    {
      hub.adopt(TILESET_MARKS_DOCUMENT, { schemaVersion: 1, data: { tilesets: { 4: { tiles: [ 1658 ], kinds: [ 20 ] } } } });
    }

    return { hub, map };
  };

  it('reads the mode from the tilesets and the marks from the marks document', () =>
  {
    // Arrange.
    const { hub, map } = windowWith({ tilesets: true, marks: true });

    // Act.
    const layering = new TilesetLayeringSource(hub).layeringFor(map);

    // Assert.
    expect([ layering.mode, [ ...layering.marks.tiles ], [ ...layering.marks.kinds ] ])
      .toEqual([ 0, [ 1658 ], [ 20 ] ]);
  });

  it('counts an Area tileset with nothing marked until the window holds them', () =>
  {
    // Arrange.
    const { hub, map } = windowWith({});

    // Act.
    const layering = new TilesetLayeringSource(hub).layeringFor(map);

    // Assert.
    expect([ layering.mode, layering.marks.tiles.size, layering.marks.kinds.size ])
      .toEqual([ 1, 0, 0 ]);
  });

  it('reuses an answer while nothing changed, and follows a mark added since', () =>
  {
    // Arrange.
    const { hub, map } = windowWith({ tilesets: true, marks: true });
    const source = new TilesetLayeringSource(hub);
    const first = source.layeringFor(map);

    // Act: asked again, then asked after a kind is marked.
    const again = source.layeringFor(map);
    hub.edit('Mark a tile', [ TILESET_MARKS_DOCUMENT ], transaction =>
    {
      transaction.set(TILESET_MARKS_DOCUMENT, [ 'data', 'tilesets', '4', 'kinds' ], [ 20, 21 ]);
    });
    const after = source.layeringFor(map);

    // Assert.
    expect([ again === first, [ ...after.marks.kinds ] ])
      .toEqual([ true, [ 20, 21 ] ]);
  });
});
