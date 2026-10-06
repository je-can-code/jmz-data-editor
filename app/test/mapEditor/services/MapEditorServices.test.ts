import { describe, expect, it, vi } from 'vitest';
import { WindowShell } from '../../../src/core/infrastructure/shell/WindowShell.ts';
import type { CloseTarget } from '../../../src/mapEditor/core/closeGuard.ts';
import { BUILT_IN_ENTRIES } from '../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { mapHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import { createMapEditorServices, type MapEditorEnvironment } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { buildMapJson } from '../support/fixtures.ts';
import { envelope, FakeEventSource, MemoryChannelNetwork, stubFetch } from '../support/standIns.ts';

/*
 * The composition root wires one window together: a hub over the server, a sync peer, the shared change stream,
 * the window shell, the close guard and conflict settling. It owes later packages a window that is already whole
 * once started.
 *
 * A window opening a document takes another window's live copy whenever one exists, even when it opened a moment
 * ago and has not heard from anyone yet; loading the stale file instead is how edits get lost. A change on the
 * stream from outside the session reaches the hub, the echo of a session save does not. Closing asks whenever no
 * other live window holds exactly this window's unsaved state, and a closing window says goodbye at once, so no
 * window keeps counting it. Conflicts settle only the way the author chooses. And a stop leaves nothing listening.
 * A started window reads js/plugins.js and switches on the modules whose plugins it enables; one that cannot read it
 * keeps the core's kinds alone. It reads the modules' configs again whenever one of them changes on disk, and when the
 * stream comes back after dropping, so a config fixed by hand shows at once. A started window's painting tools paint with what the palette and the layer strip
 * pick, and any other window the page draws into, a torn-out map's, paints with a paint of its own.
 *
 * A window has one clock. It starts where the game does once a module offering it switches on, follows the game's
 * starting time while the author leaves it be, and keeps the hour the author picks however often the modules switch on
 * afresh.
 */
describe('MapEditorServices', () =>
{
  /**
   * A window stand-in keeping its listeners by event.
   * @returns {{ target: CloseTarget, fire: (type: 'beforeunload' | 'pagehide') => boolean, count: () => number }} The window.
   */
  const buildWindowTarget = () =>
  {
    const listeners = new Map<string, ((event: Event) => void)[]>();
    const target: CloseTarget = {
      addEventListener: (type, listener) => listeners.set(type, [ ...listeners.get(type) ?? [], listener ]),
      removeEventListener: (type, listener) => listeners.set(type, (listeners.get(type) ?? []).filter(each => each !== listener)),
    };
    const fire = (type: 'beforeunload' | 'pagehide') =>
    {
      const event = { preventDefault: vi.fn(), returnValue: 'x' };
      [ ...listeners.get(type) ?? [] ].forEach(listener => listener(event as unknown as Event));
      return event.preventDefault.mock.calls.length > 0;
    };
    const count = () => [ ...listeners.values() ].reduce((total, each) => total + each.length, 0);

    return { target, fire, count };
  };

  /**
   * A window's environment over stand-ins, sharing a channel network and a server file with any other window.
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
    const window = buildWindowTarget();
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
      closeTarget: window.target,
      fetch,
    };

    const setFile = (next: ReturnType<typeof buildMapJson>) =>
    {
      files = next;
    };

    return { environment, sources, requests, window, setFile };
  };

  /**
   * Delivers channel messages while a promise runs, as a real channel would, until it settles. A real channel
   * delivers each message as a task, after whatever the page was already doing, so each round yields first and
   * delivers second; delivering at once would answer questions before the page had even asked them.
   * @param {MemoryChannelNetwork} network The channel network.
   * @param {Promise<T>} promise The work.
   * @returns {Promise<T>} Its result.
   */
  const pump = async <T>(network: MemoryChannelNetwork, promise: Promise<T>): Promise<T> =>
  {
    // watch the work itself, so a rejection is observed the moment it happens and handed to the caller.
    let settled = false;
    const markSettled = () =>
    {
      settled = true;
    };
    promise.then(markSettled, markSettled);
    while (settled === false)
    {
      await new Promise(resolve =>
      {
        setTimeout(resolve, 5);
      });
      network.flush();
    }

    network.flush();
    return promise;
  };

  /**
   * Lets pending promises and timers settle.
   * @returns {Promise<void>} Settles after a turn of the event loop.
   */
  const settle = () => new Promise<void>(resolve =>
  {
    setTimeout(resolve, 0);
  });

  /**
   * A window started on the network, holding the map it opened from the file, renamed and unsaved.
   * @param {MemoryChannelNetwork} network The channel network.
   * @returns {Promise<{ services: MapEditorServices, window: ReturnType<typeof buildWindowTarget> }>} The window.
   */
  const buildEditedWindow = async (network: MemoryChannelNetwork) =>
  {
    const { environment, window } = buildEnvironment(network, 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    await pump(network, services.openDocument('map:1'));
    services.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
    network.flush();
    return { services, window };
  };

  it('builds a whole window: its view, its client, a hub over the server, the built-in commands, and the core\'s event kinds with no module on yet', () =>
  {
    // Arrange.
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');

    // Act.
    const services = createMapEditorServices(environment);

    // Assert.
    expect([
      services.clientId,
      services.view,
      services.api?.clientId,
      services.hub.clientId,
      services.catalog.entries().map(entry => entry.id),
      services.modules.eventKinds().map(kind => kind.id),
      services.modules.paletteEntries(),
    ])
      .toStrictEqual([
        'window-a',
        { kind: 'event', mapId: 1, eventId: 3 },
        'window-a',
        'window-a',
        BUILT_IN_ENTRIES.map(entry => entry.id),
        [ 'core.chest', 'core.transfer', 'core.dialogue', 'core.decor' ],
        [],
      ]);
  });

  it('wires command editing: every hand-built editor registered, and the plugin headers read into the catalog once a list asks', async () =>
  {
    // Arrange: a server answering the plugin list, one plugin's source, and everything else in the envelope.
    const { fetch, requests } = stubFetch(request =>
    {
      if (request.url.endsWith('/api/plugin-metadata'))
      {
        return new Response('var $plugins = [\n{"name":"j/time/J-TIME","status":true,"description":"","parameters":{}}\n];');
      }

      return request.url.endsWith('/api/plugin-source/j/time/J-TIME')
        ? new Response('/*:\n * @command stopTime\n * @text Stop TIME\n */')
        : envelope({});
    });
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices({ ...environment, fetch });
    const askedBefore = requests.length;
    const handBuilt = [ 101, 102, 111, 122, 201, 205, 355, 357 ]
      .every(code => services.commandEditors.editorFor(services.catalog.resolve({ code, indent: 0, parameters: [] })) !== null);

    // Act.
    await services.loadCommandResources();

    // Assert.
    expect([
      askedBefore,
      handBuilt,
      services.catalog.entry('plugin:j/time/J-TIME:stopTime')?.name,
      services.pluginHeaders.library().headers().map(header => header.plugin),
    ])
      .toStrictEqual([ 0, true, 'Plugin: J-TIME Stop TIME', [ 'j/time/J-TIME' ] ]);
  });

  it('switches on the shipped modules once started, from the plugins js/plugins.js enables, and reads nothing before', async () =>
  {
    // Arrange: a project with J-ABS enabled, its action map being map 2.
    const { fetch, requests } = stubFetch(request => (request.url.endsWith('/api/plugin-metadata')
      ? new Response('var $plugins = [\n{"name":"j/abs/J-ABS","status":true,"description":"","parameters":{"actionMapId":"2"}}\n];')
      : envelope({})));
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices({ ...environment, fetch });
    const askedBefore = requests.length;
    const swing = createMapEvent(32, 0, 0);

    // Act.
    services.start();
    await vi.waitFor(() =>
    {
      expect(services.modules.isActive('jabs'))
        .toBe(true);
    });

    // Assert: on the action map the pattern is nobody's; on another map it is decor.
    expect([ askedBefore, services.modules.kindOf(swing, 2), services.modules.kindOf(swing, 3)?.id ])
      .toStrictEqual([ 0, null, 'core.decor' ]);
    services.stop();
  });

  it('switches the modules on afresh when a config one of them reads changes on disk, or the stream comes back', async () =>
  {
    // Arrange: a project enabling J-Lighting whose config's light colour is no colour, so J-Lighting says so.
    let lightColor = 'white';
    const { fetch, requests } = stubFetch(request =>
    {
      if (request.url.endsWith('/api/plugin-metadata'))
      {
        return new Response('var $plugins = [\n{"name":"j/lighting/J-Lighting","status":true,"description":"","parameters":{}}\n];');
      }

      // the server serves every effect, as its model declares.
      const tuning = { depth: 0.2, period: 40, chance: 0, variance: 0.18 };
      const effects = { flicker: tuning, pulse: tuning, glitch: tuning };
      return request.url.endsWith('/api/config/lighting')
        ? envelope({ light: { radius: 5, color: lightColor, intensity: 0, effects }, ambient: { color: '#000000' } })
        : envelope({});
    });
    const { environment, sources } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices({ ...environment, fetch });
    services.start();
    await vi.waitFor(() =>
    {
      expect(services.modules.notices().length)
        .toBe(1);
    });
    const configReads = () => requests.filter(request => request.url.endsWith('/api/config/lighting')).length;
    const readsBefore = configReads();

    // Act: another file changes, then the config is fixed and its change announced.
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: '' });
    await settle();
    const readsAfterMap = configReads();
    lightColor = '#ffbb73';
    sources[0].emitChange({ path: 'data/config.lighting.json', kind: 'write', client: '' });
    await vi.waitFor(() =>
    {
      expect(services.modules.notices().length)
        .toBe(0);
    });

    // Assert: a map's change read no config; the config's change read it again; the stream coming back reads it too.
    sources[0].emit('error');
    sources[0].emit('open');
    await vi.waitFor(() =>
    {
      expect(configReads())
        .toBe(readsBefore + 2);
    });
    expect(readsAfterMap)
      .toBe(readsBefore);
    services.stop();
  });

  it('starts the window\'s clock where the game does once the lighting module offers one, keeping the author\'s hour after', async () =>
  {
    // Arrange: a project enabling J-Lighting, J-Lighting-Time and J-TIME, whose game starts at the hour the test says.
    let startingHour = '14';
    const { fetch } = stubFetch(request =>
    {
      if (request.url.endsWith('/api/plugin-metadata'))
      {
        const time = `{"name":"j/time/J-TIME","status":true,"description":"","parameters":{"useRealTime":"false","startingHour":"${startingHour}","startingMinute":"0"}}`;
        return new Response(`var $plugins = [\n{"name":"j/lighting/J-Lighting","status":true,"description":"","parameters":{}},\n`
          + `{"name":"j/lighting/ext/J-Lighting-Time","status":true,"description":"","parameters":{}},\n${time}\n];`);
      }

      // the server serves every effect, and the curve, as its models declare.
      const tuning = { depth: 0.2, period: 40, chance: 0, variance: 0.18 };
      const night = { tone: [ -34, -14, 40, 95 ], darkness: 0.55 };
      return request.url.endsWith('/api/config/lighting')
        ? envelope({ light: { radius: 5, color: '#ffffff', intensity: 0, effects: { flicker: tuning, pulse: tuning, glitch: tuning } }, ambient: { color: '#000000' } })
        : envelope({ phases: { Night: night }, sequence: [ 'Night', 'Night', 'Night', 'Night', 'Night', 'Night', 'Night' ] });
    });
    const { environment, sources } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices({ ...environment, fetch });
    const before = services.clock.time();

    // Act: started; then the game made to start at 9:00, after the author moved the clock to 22:00.
    services.start();
    await vi.waitFor(() =>
    {
      expect(services.modules.clockOffer())
        .not.toBeNull();
    });
    const started = services.clock.time();
    services.clock.set(1320);
    startingHour = '9';
    sources[0].emitChange({ path: 'js/plugins.js', kind: 'write', client: '' });
    sources[0].emitChange({ path: 'data/config.lighting-time.json', kind: 'write', client: '' });
    await vi.waitFor(() =>
    {
      expect(services.modules.clockOffer()?.startsAt)
        .toBe(540);
    });

    // Assert: midnight before the modules switched on, the game's 14:00 once they did, and the author's 22:00 kept.
    expect([ before, started, services.clock.time() ])
      .toStrictEqual([ 0, 840, 1320 ]);
    services.stop();
  });

  it('keeps the core\'s kinds alone when js/plugins.js cannot be read', async () =>
  {
    // Arrange: a server that answers the plugin list with an error.
    const { fetch, requests } = stubFetch(request => (request.url.endsWith('/api/plugin-metadata')
      ? new Response('broken', { status: 500 })
      : envelope({})));
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices({ ...environment, fetch });

    // Act.
    services.start();
    await vi.waitFor(() =>
    {
      expect(requests.some(request => request.url.endsWith('/api/plugin-metadata')))
        .toBe(true);
    });
    await settle();

    // Assert.
    expect([ services.modules.isActive('jabs'), services.modules.revision ])
      .toStrictEqual([ false, 0 ]);
    services.stop();
  });

  it('opens a document from the file when no other window holds it, and hands back the same one after', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const { environment } = buildEnvironment(network, 'window-a');
    const services = createMapEditorServices(environment);
    services.start();

    // Act.
    const document = await pump(network, services.openDocument('map:1'));
    const again = await services.openDocument('map:1');

    // Assert.
    expect([ document.toJson(), again === document ])
      .toStrictEqual([ buildMapJson(), true ]);
    services.stop();
  });

  it('gives a window that opened a moment ago the live copy, not the stale file, before anyone has answered it', async () =>
  {
    // Arrange: the second window asks for the map at once, before a single presence has reached it.
    const network = new MemoryChannelNetwork();
    const first = await buildEditedWindow(network);
    const secondWindow = buildEnvironment(network, 'window-b');
    const second = createMapEditorServices(secondWindow.environment);
    second.start();

    // Act.
    const document = await pump(network, second.openDocument('map:1'));

    // Assert: the unsaved rename arrived, and the stale file was never fetched.
    expect([ (document.toJson() as { displayName: string }).displayName, secondWindow.requests.filter(request => request.url.includes('/api/maps/')).length ])
      .toStrictEqual([ 'Harbor', 0 ]);
    first.services.stop();
    second.stop();
  });

  it('takes the live copy the moment the window holding it answers, without waiting out the discovery window', async () =>
  {
    // Arrange: the first window holds the map with an unsaved rename; the second notes when its discovery is over.
    const network = new MemoryChannelNetwork();
    const first = await buildEditedWindow(network);
    const secondWindow = buildEnvironment(network, 'window-b');
    const second = createMapEditorServices(secondWindow.environment);
    second.start();
    let discovered = false;
    second.sync.whenDiscovered().then(() =>
    {
      discovered = true;
    });

    // Act.
    const document = await pump(network, second.openDocument('map:1'));

    // Assert: the live copy was in hand while discovery still had time to run.
    expect([ (document.toJson() as { displayName: string }).displayName, discovered ])
      .toStrictEqual([ 'Harbor', false ]);
    first.services.stop();
    second.stop();
  });

  it('asks before closing when the only other window holding the map holds an older copy of it', async () =>
  {
    // Arrange: a second window that loaded the stale file itself holds the map, but not the rename.
    const network = new MemoryChannelNetwork();
    const first = await buildEditedWindow(network);
    const second = createMapEditorServices(buildEnvironment(network, 'window-b').environment);
    second.start();
    await pump(network, second.hub.load('map:1'));

    // Act.
    const asked = first.window.fire('beforeunload');

    // Assert.
    expect([ first.services.sync.holders('map:1'), asked ])
      .toStrictEqual([ [ 'window-b' ], true ]);
    first.services.stop();
    second.stop();
  });

  it('closes without asking while another window holds exactly this state, and asks once that window is gone', async () =>
  {
    // Arrange: the second window took the live copy, rename and all.
    const network = new MemoryChannelNetwork();
    const first = await buildEditedWindow(network);
    const secondWindow = buildEnvironment(network, 'window-b');
    const second = createMapEditorServices(secondWindow.environment);
    second.start();
    await pump(network, second.openDocument('map:1'));
    const whileShared = first.window.fire('beforeunload');

    // Act: the second window's page goes, which stops it and says goodbye.
    secondWindow.window.fire('pagehide');
    network.flush();

    // Assert.
    expect([ whileShared, first.window.fire('beforeunload'), secondWindow.window.count() ])
      .toStrictEqual([ false, true, 0 ]);
    first.services.stop();
  });

  it('sends outside changes on the stream to the hub, and ignores the echo of its own save', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const { environment, sources, setFile } = buildEnvironment(network, 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    await pump(network, services.openDocument('map:1'));
    const changed = buildMapJson();
    changed.note = 'from outside';
    setFile(changed);

    // Act.
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: 'window-a' });
    await settle();
    const afterEcho = (services.hub.document('map:1').toJson() as { note: string }).note;
    sources[0].emitChange({ path: 'data/Map001.json', kind: 'write', client: '' });
    await settle();

    // Assert: only the outside change became a step.
    expect([ sources.length, afterEcho, (services.hub.document('map:1').toJson() as { note: string }).note ])
      .toStrictEqual([ 1, '', 'from outside' ]);
    expect(services.hub.history(mapHistoryKey(1)).rows.map(row => row.label))
      .toStrictEqual([ 'Externally modified' ]);
    services.stop();
  });

  it('re-reads clean documents when the stream comes back after dropping', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const { environment, sources, setFile } = buildEnvironment(network, 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    await pump(network, services.openDocument('map:1'));
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

  describe('resolveConflict', () =>
  {
    it('loads the version on disk, or keeps this window\'s edits, as the author chooses', async () =>
    {
      // Arrange: two windows each with the same disk conflict.
      const network = new MemoryChannelNetwork();
      const windows = [ 'window-a', 'window-c' ].map(clientId => createMapEditorServices(buildEnvironment(network, clientId).environment));
      for (const services of windows)
      {
        services.hub.adopt('map:1', buildMapJson() as never);
        services.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
        services.hub.flagConflict('map:1', { kind: 'disk', content: { ...buildMapJson(), displayName: 'On disk' } as never });
      }

      // Act.
      const choices = [ windows[0].resolveConflict('map:1', 'theirs'), windows[1].resolveConflict('map:1', 'mine') ];

      // Assert.
      expect([
        choices,
        (windows[0].hub.document('map:1').toJson() as { displayName: string }).displayName,
        (windows[1].hub.document('map:1').toJson() as { displayName: string }).displayName,
        windows[0].hub.isConflicted('map:1') || windows[1].hub.isConflicted('map:1'),
      ])
        .toStrictEqual([ [ true, true ], 'On disk', 'Harbor', false ]);
    });

    it('offers no version to take when the file was removed, and settles nothing without a conflict', () =>
    {
      // Arrange.
      const services = createMapEditorServices(buildEnvironment(new MemoryChannelNetwork(), 'window-a').environment);
      services.hub.adopt('map:1', buildMapJson() as never);
      services.hub.adopt('map:2', buildMapJson() as never);
      services.hub.flagConflict('map:1', { kind: 'disk', content: null });

      // Act.
      const choices = [ services.resolveConflict('map:1', 'theirs'), services.resolveConflict('map:2', 'mine') ];

      // Assert.
      expect([ choices, services.hub.isConflicted('map:1') ])
        .toStrictEqual([ [ false, false ], true ]);
    });

    it('hands a conflict with another window to the sync peer', async () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const services = createMapEditorServices(buildEnvironment(network, 'window-a').environment);
      services.start();
      services.hub.adopt('map:1', buildMapJson() as never);
      services.hub.flagConflict('map:1', { kind: 'window', peer: 'window-b', theirs: services.hub.snapshot('map:1') });
      const resolve = vi.spyOn(services.sync, 'resolveConflict');

      // Act.
      const settled = services.resolveConflict('map:1', 'mine');

      // Assert.
      expect([ settled, resolve.mock.calls ])
        .toStrictEqual([ true, [ [ 'map:1', 'mine' ] ] ]);
      services.stop();
    });
  });

  it('works without a server: no stream, and a hub that cannot load files', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const { environment, sources } = buildEnvironment(network, 'window-a', null);
    const services = createMapEditorServices(environment);

    // Act.
    services.start();
    const opening = pump(network, services.openDocument('map:1'));

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
    const { environment, sources, window } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();

    // Act.
    services.stop();

    // Assert.
    expect([ window.count(), sources[0].closed ])
      .toStrictEqual([ 0, true ]);
  });

  it('paints with what the palette and the layer strip pick once started, and stops following them once stopped', () =>
  {
    // Arrange: a started window.
    const { environment } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();

    // Act: layer 3 picked on the strip, then the window stopped and layer 2 picked.
    const { selection, painting } = services.paints.main;
    selection.setLayer(2);
    const whileStarted = painting.settings.strip;
    services.stop();
    selection.setLayer(1);

    // Assert.
    expect([ whileStarted, painting.settings.strip ])
      .toStrictEqual([ 2, 2 ]);
  });

  it('paints in the page\'s own window with the paint it started, and in any other window with one of that window\'s own', () =>
  {
    // Arrange: a started window, and another window the page draws into, as a torn-out panel's is.
    const { environment, window } = buildEnvironment(new MemoryChannelNetwork(), 'window-a');
    const services = createMapEditorServices(environment);
    services.start();
    const tornOut = {};

    // Act.
    const own = services.paints.forWindow(window.target);
    const other = services.paints.forWindow(tornOut);

    // Assert.
    expect([ own === services.paints.main, other === services.paints.main, services.paints.forWindow(tornOut) === other ])
      .toStrictEqual([ true, false, true ]);
    services.stop();
  });
});
