import { describe, expect, it } from 'vitest';
import type { DocumentKey } from '../../../src/mapEditor/core/model/documentKeys.ts';
import type { EditorDocument } from '../../../src/mapEditor/core/model/EditorDocument.ts';
import { TilesetsDocument } from '../../../src/mapEditor/core/model/JsonDocument.ts';
import type { JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { HeadlessMapRenderer } from '../../../src/mapEditor/core/renderer/HeadlessMapRenderer.ts';
import type { TextureImage } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { MapViewController, type MapImages } from '../../../src/mapEditor/render/MapViewController.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * A map view opens a map through the window's services, so it shows the live copy another window holds when there
 * is one, and keeps its renderer's tileset current: a map switched to another tileset, or a tileset whose flags were
 * edited, redraws with what it has now. Opening another map replaces the one before, and a slow open that a later one
 * overtook must never land on top of it.
 */

/**
 * Builds a tileset row.
 * @param {number} id The tileset id.
 * @returns {RmmzTileset} The row.
 */
const tilesetRow = (id: number): RmmzTileset => ({ id, flags: [ id ], mode: 1, name: `Set ${id}`, note: '', tilesetNames: [ `A1-${id}`, '', '', '', '', `B-${id}`, '', '', '' ] });

/**
 * Builds the documents a view opens: maps 1 and 2 (tileset 4) and map 3 (a tileset that does not exist), and the
 * tilesets, with every open waiting on a gate the test opens.
 * @returns {object} The opener, the documents and the gates.
 */
const buildDocuments = () =>
{
  const tilesets = new TilesetsDocument('tilesets', [ null, null, null, null, tilesetRow(4), tilesetRow(5) ] as unknown as JsonValue);
  const maps = new Map<number, MapDocument>([ 1, 2, 3 ].map(id =>
  {
    const json = buildMapJson();
    json.tilesetId = id === 3 ? 9 : 4;
    return [ id, MapDocument.fromJson(`map:${id}`, json) ];
  }));
  const gates = new Map<DocumentKey, (() => void)[]>();
  const openDocument = (key: DocumentKey): Promise<EditorDocument> =>
  {
    const document: EditorDocument = key === 'tilesets'
      ? tilesets
      : maps.get(Number(key.slice('map:'.length))) as MapDocument;
    return new Promise(resolve =>
    {
      gates.set(key, [ ...gates.get(key) ?? [], () => resolve(document) ]);
    });
  };
  const release = (key: DocumentKey) =>
  {
    (gates.get(key) ?? []).forEach(open => open());
    gates.delete(key);
  };
  return { opener: { openDocument }, maps, tilesets, release };
};

/**
 * Builds pictures that name the tileset they were loaded for.
 * @returns {MapImages & { loads: string[] }} The pictures, and every tileset they were asked for.
 */
const buildImages = () =>
{
  const loads: string[] = [];
  const images: MapImages & { loads: string[] } = {
    loads,
    image: async () => null,
    tilesetSheets: async (tileset: RmmzTileset) =>
    {
      loads.push(tileset.name);
      return tileset.tilesetNames.map(name => (name === '' ? null : { name } as unknown as TextureImage));
    },
  };
  return images;
};

/**
 * Lets pending promises settle.
 * @returns {Promise<void>} Settles on the next macrotask.
 */
const settle = () => new Promise(resolve =>
{
  setTimeout(resolve, 0);
});

describe('MapViewController', () =>
{
  it('opens a map with its tileset\'s sheets, and hands the renderer the pictures events draw with', async () =>
  {
    // Arrange.
    const { opener, maps, release } = buildDocuments();
    const images = buildImages();
    const renderer = new HeadlessMapRenderer();
    const controller = new MapViewController(renderer, opener, images);

    // Act.
    const opening = controller.open(1);
    release('map:1');
    release('tilesets');
    const opened = await opening;

    // Assert.
    const { state } = renderer;
    expect([ opened === maps.get(1), state.document === maps.get(1), state.tileset?.tileset.name, state.tileset?.sheets.length, state.textures === images, controller.map === maps.get(1) ])
      .toStrictEqual([ true, true, 'Set 4', 9, true, true ]);
  });

  it('refuses a map whose tileset does not exist, naming both', async () =>
  {
    // Arrange.
    const { opener, release } = buildDocuments();
    const controller = new MapViewController(new HeadlessMapRenderer(), opener, buildImages());

    // Act.
    const opening = controller.open(3);
    release('map:3');
    release('tilesets');
    const failure = await opening.catch((error: Error) => error.message);

    // Assert.
    expect(failure)
      .toBe('map 3 draws with tileset 9, which does not exist');
  });

  it('never lands an open that a later open overtook', async () =>
  {
    // Arrange: map 1's open waits while map 2's goes through.
    const { opener, maps, release } = buildDocuments();
    const renderer = new HeadlessMapRenderer();
    const controller = new MapViewController(renderer, opener, buildImages());
    const first = controller.open(1);
    const second = controller.open(2);

    // Act.
    release('map:2');
    release('tilesets');
    await settle();
    release('map:1');
    const results = await Promise.all([ first, second ]);

    // Assert.
    expect([ results[0], results[1] === maps.get(2), renderer.state.document === maps.get(2) ])
      .toStrictEqual([ null, true, true ]);
  });

  it('reloads the sheets when the map moves to another tileset, and when the tilesets change', async () =>
  {
    // Arrange.
    const { opener, maps, tilesets, release } = buildDocuments();
    const images = buildImages();
    const renderer = new HeadlessMapRenderer();
    const controller = new MapViewController(renderer, opener, images);
    const opening = controller.open(1);
    release('map:1');
    release('tilesets');
    await opening;
    const map = maps.get(1) as MapDocument;

    // Act: the map moves to tileset 5, then tileset 5's flags are edited, then an unrelated property changes.
    map.apply(map.setPatch([ 'tilesetId' ], 5));
    await settle();
    tilesets.apply({ kind: 'set', path: [ 5, 'flags', 0 ], before: 5, after: 6 });
    await settle();
    map.apply(map.setPatch([ 'displayName' ], 'Renamed'));
    await settle();

    // Assert.
    expect([ images.loads, renderer.state.tileset?.tileset.flags ])
      .toStrictEqual([ [ 'Set 4', 'Set 5', 'Set 5' ], [ 6 ] ]);
  });

  it('stops following a map once closed', async () =>
  {
    // Arrange.
    const { opener, maps, release } = buildDocuments();
    const images = buildImages();
    const controller = new MapViewController(new HeadlessMapRenderer(), opener, images);
    const opening = controller.open(1);
    release('map:1');
    release('tilesets');
    await opening;
    const map = maps.get(1) as MapDocument;

    // Act.
    controller.close();
    map.apply(map.setPatch([ 'tilesetId' ], 5));
    await settle();

    // Assert.
    expect([ images.loads, controller.map ])
      .toStrictEqual([ [ 'Set 4' ], null ]);
  });
});
