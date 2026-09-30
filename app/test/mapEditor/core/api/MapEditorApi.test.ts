import { describe, expect, it } from 'vitest';
import { HttpMapEditorApi, MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { envelope, stubFetch } from '../../support/standIns.ts';

/*
 * Every call the map editor makes to the server goes through this client, so it owes the rest of the editor the
 * contract exactly as written. JSON reads come back in the server's envelope and are unwrapped here, and a body
 * that is not an envelope is an error, never a quiet undefined: a route that changed shape must fail on its first
 * call. Saves are PUTs of the raw RMMZ shape (no envelope, nothing extra, since the server decodes strictly), each
 * carrying this window's id in X-Jmz-Client so the window can recognise its own save when the change stream echoes
 * it. Missing files answer null where the contract says 404 means "absent", and throw where it means "broken".
 */
describe('HttpMapEditorApi', () =>
{
  const BASE = 'http://127.0.0.1:18151';

  /**
   * Builds a client over a stubbed fetch.
   * @param {(url: string, method: string) => Response} answer Builds each response.
   * @returns {{ api: HttpMapEditorApi, requests: ReturnType<typeof stubFetch>['requests'] }} The client and its record.
   */
  const buildApi = (answer: (url: string, method: string) => Response) =>
  {
    const { fetch, requests } = stubFetch(request => answer(request.url, request.method));
    const api = new HttpMapEditorApi({ apiBase: `${BASE}/`, clientId: 'window-7', fetch });
    return { api, requests };
  };

  describe('reading JSON', () =>
  {
    it('reads a map from its route and unwraps the envelope', async () =>
    {
      // Arrange.
      const map = buildMapJson();
      const { api, requests } = buildApi(() => envelope(map));

      // Act.
      const loaded = await api.loadMap(12);

      // Assert.
      expect([ loaded, requests.map(request => `${request.method} ${request.url}`) ])
        .toStrictEqual([ map, [ `GET ${BASE}/api/maps/12` ] ]);
    });

    it('reads the map tree and the tilesets from their routes', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(url => envelope(url.endsWith('mapinfos') ? [ null, { id: 1 } ] : [ null, { id: 2 } ]));

      // Act.
      const loaded = [ await api.loadMapInfos(), await api.loadTilesets() ];

      // Assert.
      expect([ loaded, requests.map(request => request.url) ])
        .toStrictEqual([ [ [ null, { id: 1 } ], [ null, { id: 2 } ] ], [ `${BASE}/api/mapinfos`, `${BASE}/api/tilesets` ] ]);
    });

    it('reads the common events, command usage and database names from their routes', async () =>
    {
      // Arrange: each route answers something recognisable.
      const answers: Record<string, unknown> = {
        'common-events': [ null, { id: 1 } ],
        'command-usage': { events: 2, codes: { 250: 1 }, pluginCommands: [] },
        'database-names': { switches: [ '', 'Door' ] },
      };
      const { api, requests } = buildApi(url => envelope(answers[url.slice(`${BASE}/api/`.length)]));

      // Act.
      const loaded = [ await api.loadCommonEvents(), await api.loadCommandUsage(), await api.loadDatabaseNames() ];

      // Assert.
      expect([ loaded, requests.map(request => `${request.method} ${request.url}`) ])
        .toStrictEqual([
          [ [ null, { id: 1 } ], { events: 2, codes: { 250: 1 }, pluginCommands: [] }, { switches: [ '', 'Door' ] } ],
          [ `GET ${BASE}/api/common-events`, `GET ${BASE}/api/command-usage`, `GET ${BASE}/api/database-names` ],
        ]);
    });

    it('refuses a body that is not the envelope, even one carrying data', async () =>
    {
      // Arrange: the document raw, and a near miss with data but no path.
      const { api } = buildApi(url => new Response(JSON.stringify(url.endsWith('12') ? buildMapJson() : { data: {} })));

      // Act.
      const loads = [ api.loadMap(12), api.loadMap(13) ];

      // Assert.
      await expect(loads[0])
        .rejects.toThrow('GET /api/maps/12 did not answer in the API envelope');
      await expect(loads[1])
        .rejects.toThrow('GET /api/maps/13 did not answer in the API envelope');
    });

    it('refuses a body that is not JSON at all', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('<html>'));

      // Act.
      const load = api.loadMapInfos();

      // Assert.
      await expect(load)
        .rejects.toThrow('GET /api/mapinfos did not answer with JSON');
    });

    it('raises the error an envelope carries', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response(JSON.stringify({ path: '/p', error: 'decoding data/Map012.json: unknown field "x"' })));

      // Act.
      const load = api.loadMap(12);

      // Assert.
      await expect(load)
        .rejects.toThrow('GET /api/maps/12: decoding data/Map012.json: unknown field "x"');
    });

    it('raises a failed status with the server\'s words and the status on the error', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('data/Map099.json does not exist\n', { status: 404 }));

      // Act.
      const error = await api.loadMap(99).catch((caught: unknown) => caught);

      // Assert.
      expect([ error instanceof MapEditorApiError, (error as MapEditorApiError).status, (error as Error).message ])
        .toStrictEqual([ true, 404, 'GET /api/maps/99 answered 404: data/Map099.json does not exist' ]);
    });

    it('refuses a map id no map can have, before asking the server', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(() => envelope({}));

      // Act.
      const loads = [ api.loadMap(0), api.loadMap(2.5) ];

      // Assert.
      await expect(loads[0])
        .rejects.toThrow(/positive integer/u);
      await expect(loads[1])
        .rejects.toThrow(/positive integer/u);
      expect(requests)
        .toHaveLength(0);
    });
  });

  describe('saving', () =>
  {
    it('puts the raw map with this window\'s id', async () =>
    {
      // Arrange.
      const map = buildMapJson();
      const { api, requests } = buildApi(() => new Response(null, { status: 204 }));

      // Act.
      await api.saveMap(12, map);

      // Assert.
      const [ request ] = requests;
      expect([ request.method, request.url, request.headers['x-jmz-client'], request.headers['content-type'], JSON.parse(request.body as string) ])
        .toStrictEqual([ 'PUT', `${BASE}/api/maps/12`, 'window-7', 'application/json', map ]);
    });

    it('puts the map tree, the tilesets and editor data to their routes', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(() => new Response(null, { status: 204 }));

      // Act.
      await api.saveMapInfos([ null ]);
      await api.saveTilesets([ null ]);
      await api.saveEditorData('tileset-marks', { schemaVersion: 1, data: {} });

      // Assert.
      expect(requests.map(request => `${request.method} ${request.url} ${request.body}`))
        .toStrictEqual([
          `PUT ${BASE}/api/mapinfos [null]`,
          `PUT ${BASE}/api/tilesets [null]`,
          `PUT ${BASE}/api/editor-data/tileset-marks {"schemaVersion":1,"data":{}}`,
        ]);
    });

    it('posts the common events to the database route the data editor shares, with this window\'s id', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(() => envelope(null));
      const rows = [ null, { id: 1, list: [ { code: 0, indent: 0, parameters: [] } ], name: 'Heal', switchId: 1, trigger: 0 } ];

      // Act.
      await api.saveCommonEvents(rows);

      // Assert.
      const [ request ] = requests;
      expect([ request.method, request.url, request.headers['x-jmz-client'], request.headers['content-type'], JSON.parse(request.body as string) ])
        .toStrictEqual([ 'POST', `${BASE}/api/common-events`, 'window-7', 'application/json', rows ]);
    });

    it('raises a refused common events save as a POST', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('json: unknown field "extra"', { status: 400 }));

      // Act.
      const save = api.saveCommonEvents([ null ]);

      // Assert.
      await expect(save)
        .rejects.toThrow('POST /api/common-events answered 400: json: unknown field "extra"');
    });

    it('raises the server\'s refusal, naming the field it refused', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('json: unknown field "extra"', { status: 400 }));

      // Act.
      const save = api.saveMap(12, { ...buildMapJson(), extra: true } as unknown as RmmzMap);

      // Assert.
      await expect(save)
        .rejects.toThrow('PUT /api/maps/12 answered 400: json: unknown field "extra"');
    });
  });

  describe('assets', () =>
  {
    it('builds image and sound addresses with names encoded', () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response(null));

      // Act.
      const urls = [ api.imageUrl('characters', '$Big Monster'), api.imageUrl('characters', '!Door1'), api.audioUrl('se', 'Door open') ];

      // Assert.
      expect(urls)
        .toStrictEqual([
          `${BASE}/api/img/characters/%24Big%20Monster`,
          `${BASE}/api/img/characters/!Door1`,
          `${BASE}/api/audio/se/Door%20open`,
        ]);
    });

    it('reads an image, and answers null for a missing one', async () =>
    {
      // Arrange.
      const { api } = buildApi(url => (url.endsWith('Outside_A1')
        ? new Response(new Uint8Array([ 137, 80, 78, 71 ]), { headers: { 'Content-Type': 'image/png' } })
        : new Response('not found', { status: 404 })));

      // Act.
      const found = await api.loadImage('tilesets', 'Outside_A1');
      const missing = await api.loadImage('tilesets', 'Nowhere');

      // Assert.
      expect([ found?.size, missing ])
        .toStrictEqual([ 4, null ]);
    });

    it('lists a folder\'s images, and nothing when the server leaves an empty list out of its envelope', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(url => envelope(url.endsWith('faces') ? [ 'Actor1', 'face_je' ] : undefined));

      // Act.
      const faces = await api.listImages('faces');
      const none = await api.listImages('parallaxes');

      // Assert.
      expect([ faces, none, requests.map(request => request.url) ])
        .toStrictEqual([ [ 'Actor1', 'face_je' ], [], [ `${BASE}/api/img/faces`, `${BASE}/api/img/parallaxes` ] ]);
    });

    it('raises a server failure on an image rather than calling it missing', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('boom', { status: 500 }));

      // Act.
      const load = api.loadImage('faces', 'Actor1');

      // Assert.
      await expect(load)
        .rejects.toThrow('GET img/faces/Actor1 answered 500: boom');
    });

    it('reads plugin source by path with each folder encoded, and null when missing', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(url => (url.includes('J-ABS')
        ? new Response('/*: @command x */')
        : new Response('', { status: 404 })));

      // Act.
      const found = await api.loadPluginSource('j/abs/J-ABS');
      const missing = await api.loadPluginSource('my plugins/Gone');

      // Assert.
      expect([ found, missing, requests.map(request => request.url) ])
        .toStrictEqual([
          '/*: @command x */',
          null,
          [ `${BASE}/api/plugin-source/j/abs/J-ABS`, `${BASE}/api/plugin-source/my%20plugins/Gone` ],
        ]);
    });

    it('raises a server failure on plugin source', async () =>
    {
      // Arrange.
      const { api } = buildApi(() => new Response('', { status: 500 }));

      // Act.
      const load = api.loadPluginSource('j/abs/J-ABS');

      // Assert.
      await expect(load)
        .rejects.toThrow('GET plugin-source/j/abs/J-ABS answered 500');
    });

    it('reads the plugin list from the existing route', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(() => new Response('var $plugins = [];'));

      // Act.
      const text = await api.loadPluginList();

      // Assert.
      expect([ text, requests[0].url ])
        .toStrictEqual([ 'var $plugins = [];', `${BASE}/api/plugin-metadata` ]);
    });
  });

  describe('editor data', () =>
  {
    it('reads a saved document, and null for one never saved', async () =>
    {
      // Arrange.
      const { api } = buildApi(url => (url.endsWith('layouts')
        ? envelope({ schemaVersion: 1, data: { layouts: {} } })
        : new Response(JSON.stringify({ path: '/p', error: 'jmz-editor/blueprints.json does not exist' }), { status: 404 })));

      // Act.
      const saved = await api.loadEditorData('layouts');
      const never = await api.loadEditorData('blueprints');

      // Assert.
      expect([ saved, never ])
        .toStrictEqual([ { schemaVersion: 1, data: { layouts: {} } }, null ]);
    });

    it('refuses a key the server would refuse, before asking it', async () =>
    {
      // Arrange.
      const { api, requests } = buildApi(() => envelope({}));

      // Act.
      const attempts = [ api.loadEditorData('Layouts'), api.saveEditorData('../escape', {}) ];

      // Assert.
      await expect(attempts[0])
        .rejects.toThrow(/lowercase letters/u);
      await expect(attempts[1])
        .rejects.toThrow(/lowercase letters/u);
      expect(requests)
        .toHaveLength(0);
    });
  });

  it('names the change stream\'s address', () =>
  {
    // Arrange.
    const { api } = buildApi(() => new Response(null));

    // Act.
    const url = api.fileChangesUrl();

    // Assert.
    expect(url)
      .toBe(`${BASE}/api/file-changes`);
  });
});
