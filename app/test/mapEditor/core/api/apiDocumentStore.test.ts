import { describe, expect, it, vi } from 'vitest';
import { apiDocumentStore } from '../../../../src/mapEditor/core/api/apiDocumentStore.ts';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';

/*
 * The document hub loads and saves by document key; this store turns each key into the right server call. A key
 * routed to the wrong call would load one map into another's window or save the tree over the tilesets, so each
 * kind is checked against its sibling calls. Editor-only documents are held whole in their stored form, and a
 * project that never saved one gets the empty document, stamped with its version, instead of an error.
 */
describe('apiDocumentStore', () =>
{
  /**
   * An API stand-in whose every call is a spy answering a recognisable value.
   * @returns {MapEditorApi} The stand-in.
   */
  const buildApi = (): MapEditorApi => ({
    clientId: 'window-1',
    loadMap: vi.fn(async (mapId: number) => ({ map: mapId }) as never),
    saveMap: vi.fn(async () => undefined),
    deleteMap: vi.fn(async () => undefined),
    loadMapFile: vi.fn(async () => null),
    restoreMapFile: vi.fn(async () => undefined),
    loadMapInfos: vi.fn(async () => [ null, 'infos' ] as never),
    saveMapInfos: vi.fn(async () => undefined),
    loadTilesets: vi.fn(async () => [ null, 'tilesets' ] as never),
    saveTilesets: vi.fn(async () => undefined),
    imageUrl: vi.fn(() => ''),
    loadImage: vi.fn(async () => null),
    audioUrl: vi.fn(() => ''),
    loadPluginSource: vi.fn(async () => null),
    loadPluginList: vi.fn(async () => ''),
    loadEditorData: vi.fn(async (key: string) => (key === 'layouts' ? { schemaVersion: 1, data: { layouts: { main: 1 } } } : null)),
    saveEditorData: vi.fn(async () => undefined),
    fileChangesUrl: vi.fn(() => ''),
  });

  it('loads each kind of document through its own call', async () =>
  {
    // Arrange.
    const store = apiDocumentStore(buildApi());

    // Act.
    const loaded = [
      await store.load('map:12'),
      await store.load('mapinfos'),
      await store.load('tilesets'),
      await store.load('editor-data:layouts'),
    ];

    // Assert.
    expect(loaded)
      .toStrictEqual([
        { map: 12 },
        [ null, 'infos' ],
        [ null, 'tilesets' ],
        { schemaVersion: 1, data: { layouts: { main: 1 } } },
      ]);
  });

  it('starts a never-saved editor document empty, stamped with its version', async () =>
  {
    // Arrange.
    const store = apiDocumentStore(buildApi());

    // Act.
    const loaded = await store.load('editor-data:blueprints');

    // Assert.
    expect(loaded)
      .toStrictEqual({ schemaVersion: 1, data: { blueprints: [] } });
  });

  it('saves each kind of document through its own call', async () =>
  {
    // Arrange.
    const api = buildApi();
    const store = apiDocumentStore(api);
    const content: JsonValue = { any: 'thing' };

    // Act.
    await store.save('map:3', content);
    await store.save('mapinfos', [ null ]);
    await store.save('tilesets', [ null ]);
    await store.save('editor-data:tileset-marks', content);

    // Assert.
    expect([
      vi.mocked(api.saveMap).mock.calls,
      vi.mocked(api.saveMapInfos).mock.calls,
      vi.mocked(api.saveTilesets).mock.calls,
      vi.mocked(api.saveEditorData).mock.calls,
    ])
      .toStrictEqual([ [ [ 3, content ] ], [ [ [ null ] ] ], [ [ [ null ] ] ], [ [ 'tileset-marks', content ] ] ]);
  });

  it('refuses an editor document the editor does not keep', async () =>
  {
    // Arrange.
    const store = apiDocumentStore(buildApi());

    // Act.
    const attempts = [ store.load('editor-data:secrets'), store.save('editor-data:secrets', {}) ];

    // Assert.
    await expect(attempts[0])
      .rejects.toThrow('the editor keeps no document called secrets');
    await expect(attempts[1])
      .rejects.toThrow('the editor keeps no document called secrets');
  });
});
