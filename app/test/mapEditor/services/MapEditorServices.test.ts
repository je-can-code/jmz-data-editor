import { describe, expect, it, vi } from 'vitest';
import { WindowShell } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import type { CloseTarget } from '../../../src/mapEditor/core/closeGuard.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEditorServices, type MapEditorEnvironment } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { buildMapJson } from '../support/fixtures.ts';
import { envelope, FakeEventSource, MemoryChannelNetwork, stubFetch } from '../support/standIns.ts';

/*
 * The composition root wires one window together: a hub over the server, a sync peer, the shared change stream,
 * the window shell and the close guard. It owes later packages a window that is already whole once started:
 * documents open from another window's live copy before the file, a change on the stream from outside the session
 * reaches the hub while the echo of a session save does not, and closing asks only while this window holds the only
 * copy of unsaved edits. And it owes a clean stop, leaving nothing listening.
 */
describe('MapEditorServices', () =>
{
  /**
   * A window's environment over stand-ins, sharing a channel network with any other window built on it.
   * @param {MemoryChannelNetwork} network The channel network.
   * @param {string} clientId The window's id.
   * @param {string | null} apiBase The server, or null for none.
   * @returns {object} The environment and the stand-ins behind it.
   */
  const buildEnvironment = (network: MemoryChannelNetwork, clientId: string, apiBase: string | null = 'http://api') =>
  {
    const sources: FakeEventSource[] = [];
    let files = buildMapJson();
    const { fetch, requests } = stubFetch(request =>
    {
      if (request.method === 'PUT')
      {
        files = JSON.parse(request.body as string);
        return new Response(null, { status: 204 });
      }

      return envelope(files);
    });
    const listeners: ((event: BeforeUnloadEvent) => void)[] = [];
    const closeTarget: CloseTarget = {
      addEventListener: (_type, listener) => listeners.push(listener),
      removeEventListener: (_type, listener) => listeners.splice(listeners.indexOf(listener), 1),
    };
    const environment: MapEditorEnvironment = {
      apiBase,
      search: '?view=event&map=1&event=3',
      createClientId: () => clientId,
      openChannel: name => network.open(name),
      openEventSource: url =>
      {
        const source = new FakeEventSource(url);
        sources.push(source);
        return source;
      },
      locks: null,
      shell: new WindowShell({ channel: null, origin: 'http://ui', openWindow: () => null }),
      closeTarget,
      fetch,
    };

    const setFile = (next: ReturnType<typeof buildMapJson>) =>
    {
      files = next;
    };

    return { environment, sources, requests, listeners, setFile };
  };

  /**
   * Fires a close at the window stand-in.
   * @param {((event: BeforeUnloadEvent) => void)[]} listeners Its listeners.
   * @returns {boolean} Whether closing was held up.
   */
  const tryToClose = (listeners: ((event: BeforeUnloadEvent) => void)[]) =>
  {
    const event = { preventDefault: vi.fn(), returnValue: 'x' };
    listeners.forEach(listener => listener(event as unknown as BeforeUnloadEvent));
    return event.preventDefault.mock.calls.length > 0;
  };

  /**
   * Lets pending promises and timers settle.
   * @returns {Promise<void>} Settles after a turn of the event loop.
   */
  const settle = () => new Promise<void>(resolve =>
  {
    setTimeout(resolve, 0);
  });

  it('builds a whole window: its view, its client, a hub over the server, and empty registries ready to fill', () =>
  {
    // Arrange.
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');

    // Act.
    const services = createMapEditorServices(environment);

    // Assert.
    expect([ services.clientId, services.view, services.api?.clientId, services.hub.clientId, services.catalog.entries(), services.modules.eventKinds() ])
      .toStrictEqual([ 'window-a', { kind: 'event', mapId: 1, eventId: 3 }, 'window-a', 'window-a', [], [] ]);
  });

  it('opens a document from the file when no other window holds it', async () =>
  {
    // Arrange.
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();

    // Act.
    const document = await services.openDocument('map:1');
    const again = await services.openDocument('map:1');

    // Assert.
    expect([ document.toJson(), again === document ])
      .toStrictEqual([ buildMapJson(), true ]);
    services.stop();
  });

  it('opens a document from another window\'s live copy, unsaved edits included', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const first = createMapEditorServices(buildEnvironment(network, 'window-a').environment);
    const second = createMapEditorServices(buildEnvironment(network, 'window-b').environment);
    first.start();
    second.start();
    network.flush();
    await first.openDocument('map:1');
    first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    network.flush();

    // Act.
    const opening = second.openDocument('map:1');
    network.flush();
    const document = await opening;

    // Assert.
    expect((document.toJson() as { displayName: string }).displayName)
      .toBe('Harbor');
    first.stop();
    second.stop();
  });

  it('opens a document from the file at once when the window holding it has not been heard from', async () =>
  {
    // Arrange: the other window holds the map, but its presence has not been delivered.
    const network = new MemoryChannelNetwork();
    const first = createMapEditorServices(buildEnvironment(network, 'window-a').environment);
    const secondWindow = buildEnvironment(network, 'window-b');
    const second = createMapEditorServices(secondWindow.environment);
    first.start();
    second.start();
    await first.openDocument('map:1');

    // Act.
    const started = Date.now();
    await second.openDocument('map:1');

    // Assert: no wait on an answer, and the file came from the server.
    expect([ Date.now() - started < 200, secondWindow.requests.map(request => request.url) ])
      .toStrictEqual([ true, [ 'http://api/api/maps/1' ] ]);
    first.stop();
    second.stop();
  });

  it('sends outside changes on the stream to the hub, and ignores the echo of its own save', async () =>
  {
    // Arrange.
    const { environment, sources, setFile } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    await services.openDocument('map:1');
    const changed = buildMapJson();
    changed.note = 'from outside';
    setFile(changed);

    // Act.
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: 'window-a' });
    await settle();
    const afterEcho = (services.hub.document('map:1').toJson() as { note: string }).note;
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: '' });
    await settle();

    // Assert.
    expect([ sources.length, afterEcho, (services.hub.document('map:1').toJson() as { note: string }).note ])
      .toStrictEqual([ 1, '', 'from outside' ]);
    services.stop();
  });

  it('re-reads clean documents when the stream comes back after dropping', async () =>
  {
    // Arrange.
    const { environment, sources, setFile } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    await services.openDocument('map:1');
    const changed = buildMapJson();
    changed.note = 'missed while down';
    setFile(changed);

    // Act.
    sources[0].emit('error');
    sources[0].emit('open');
    await settle();

    // Assert.
    expect((services.hub.document('map:1').toJson() as { note: string }).note)
      .toBe('missed while down');
    services.stop();
  });

  it('asks before closing only while this window holds the only copy of unsaved edits', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const firstWindow = buildEnvironment(network, 'window-a');
    const first = createMapEditorServices(firstWindow.environment);
    first.start();
    await first.openDocument('map:1');
    const clean = tryToClose(firstWindow.listeners);
    first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    const aloneWithEdits = tryToClose(firstWindow.listeners);
    const second = createMapEditorServices(buildEnvironment(network, 'window-b').environment);
    second.start();
    const opening = second.openDocument('map:1');
    network.flush();
    await opening;
    network.flush();

    // Act.
    const sharedWithEdits = tryToClose(firstWindow.listeners);

    // Assert.
    expect([ clean, aloneWithEdits, sharedWithEdits ])
      .toStrictEqual([ false, true, false ]);
    first.stop();
    second.stop();
  });

  it('works without a server: no stream, and a hub that cannot load files', async () =>
  {
    // Arrange.
    const { environment, sources } = buildEnvironment(new MemoryChannelNetwork(), 'window-a', null);
    const services = createMapEditorServices(environment);

    // Act.
    services.start();
    const opening = services.openDocument('map:1');

    // Assert.
    await expect(opening)
      .rejects.toThrow(/no store/u);
    expect([ services.api, sources.length ])
      .toStrictEqual([ null, 0 ]);
    services.stop();
  });

  it('leaves nothing listening once stopped', () =>
  {
    // Arrange.
    const { environment, sources, listeners } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();

    // Act.
    services.stop();

    // Assert.
    expect([ listeners.length, sources[0].closed ])
      .toStrictEqual([ 0, true ]);
  });
});
