import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemNames } from '../../../../src/mapEditor/core/commandList/ProjectNames.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { SYSTEM_HISTORY_KEY } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { SYSTEM_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { renameEntry } from '../../../../src/mapEditor/core/system/systemNames.ts';
import { SyncPeer } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { SystemNamesFollower, type FollowSources } from '../../../../src/mapEditor/core/sync/SystemNamesFollower.ts';
import { MemoryChannelNetwork } from '../../support/standIns.ts';

/*
 * Every window shows a switch by the name System.json holds for it right now, renames nobody has saved yet included, so
 * a rename in the Switches & Variables window reads by its new name in every window at once.
 *
 * Only the window renaming them holds System.json; every other window only looks at it, since a window holding a copy it
 * cannot save would let the renaming window close without asking. So the window holding it follows its own copy as it
 * changes, undo included, and every other window looks again whenever a window holding it moves it on, takes it up or
 * lets it go, and whenever its file changes on disk: the live copy where some window holds one, the file where none
 * does, so a renaming window closed without saving leaves the names as the file has them. A window holding nothing
 * where nobody holds System.json looks at nothing, the names it read from the server being the file's already. Looks
 * may finish out of order, and only the latest counts; once stopped, nothing more is taken.
 */
describe('SystemNamesFollower', () =>
{
  /**
   * System.json as the file holds it: three switches and one variable.
   * @returns {JsonValue} The settings.
   */
  const buildSystem = (): JsonValue => ({
    gameTitle: 'Chef Adventure',
    switches: [ '', 'partner-visible', 'suspicious castle', 'mayor wolf defeated.' ],
    variables: [ '', 'Enemies Defeated' ],
  });

  /**
   * A store over one shared in-memory file per document, as the server would be, counting its reads.
   * @returns {{ store: DocumentStore, files: Map<DocumentKey, JsonValue>, reads: () => number }} The store, its files, and
   * how many times a file was read.
   */
  const buildServer = () =>
  {
    let reads = 0;
    const files = new Map<DocumentKey, JsonValue>([ [ SYSTEM_KEY, buildSystem() ] ]);
    const store: DocumentStore = {
      load: async key =>
      {
        reads += 1;
        return structuredClone(files.get(key) as JsonValue);
      },
      save: async (key, content) =>
      {
        files.set(key, structuredClone(content));
      },
    };

    return { store, files, reads: () => reads };
  };

  /**
   * One window: a hub, its peer on the shared network, and the names it follows, recorded.
   * @param {MemoryChannelNetwork} network The channel network.
   * @param {string} clientId The window's id.
   * @param {DocumentStore} store The server.
   * @returns {{ hub: DocumentHub, peer: SyncPeer, follower: SystemNamesFollower, followed: SystemNames[] }} The window.
   */
  const buildWindow = (network: MemoryChannelNetwork, clientId: string, store: DocumentStore) =>
  {
    const hub = new DocumentHub({ clientId, store });
    const peer = new SyncPeer({ hub, channel: network.open('jmz-sync'), heartbeatMs: 0, snapshotTimeoutMs: 50, discoveryMs: 20 });
    peer.start();
    const followed: SystemNames[] = [];
    const follower = new SystemNamesFollower({ hub, sync: peer }, { followSystem: system => followed.push(system) });
    return { hub, peer, follower, followed };
  };

  /**
   * Delivers messages and settles the promises and timers they start, until the network is quiet.
   * @param {MemoryChannelNetwork} network The network.
   */
  const settle = async (network: MemoryChannelNetwork): Promise<void> =>
  {
    for (let round = 0; round < 10; round++)
    {
      network.flush();
      await vi.advanceTimersByTimeAsync(25);
    }
  };

  /**
   * Reads the second switch's name from the last names a window followed.
   * @param {SystemNames[]} followed The names followed, in order.
   * @returns {string | undefined} The name, or undefined when nothing was followed.
   */
  const lastSecondSwitch = (followed: readonly SystemNames[]): string | undefined => followed.at(-1)?.switches[2];

  beforeEach(() =>
  {
    vi.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] });
  });

  afterEach(() =>
  {
    vi.useRealTimers();
  });

  it('follows the copy this window holds, every rename and undo as it lands', async () =>
  {
    // Arrange: the Switches & Variables window, holding System.json.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const window = buildWindow(network, 'window-names', server.store);
    await window.hub.load(SYSTEM_KEY);
    window.follower.start();

    // Act: switch 2 renamed, then the rename undone.
    renameEntry(window.hub, 'switches', 2, 'after the vampire');
    const renamed = lastSecondSwitch(window.followed);
    window.hub.undo(SYSTEM_HISTORY_KEY);

    // Assert.
    expect([ window.followed.length, renamed, lastSecondSwitch(window.followed) ])
      .toStrictEqual([ 3, 'after the vampire', 'suspicious castle' ]);
  });

  it('shows another window\'s unsaved rename at once, without ever holding System.json', async () =>
  {
    // Arrange: an event window following, and the Switches & Variables window holding System.json.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const eventWindow = buildWindow(network, 'window-event', server.store);
    eventWindow.follower.start();
    const namesWindow = buildWindow(network, 'window-names', server.store);
    await namesWindow.hub.load(SYSTEM_KEY);
    await settle(network);

    // Act: switch 2 renamed there, not saved.
    renameEntry(namesWindow.hub, 'switches', 2, 'after the vampire');
    await settle(network);

    // Assert.
    expect([ lastSecondSwitch(eventWindow.followed), eventWindow.hub.has(SYSTEM_KEY), namesWindow.peer.sharesLatest(SYSTEM_KEY) ])
      .toStrictEqual([ 'after the vampire', false, false ]);
  });

  it('takes the file\'s names once the window renaming them closes without saving', async () =>
  {
    // Arrange: an event window following a rename made in the Switches & Variables window.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const eventWindow = buildWindow(network, 'window-event', server.store);
    eventWindow.follower.start();
    const namesWindow = buildWindow(network, 'window-names', server.store);
    await namesWindow.hub.load(SYSTEM_KEY);
    renameEntry(namesWindow.hub, 'switches', 2, 'after the vampire');
    await settle(network);
    const whileOpen = lastSecondSwitch(eventWindow.followed);

    // Act: the Switches & Variables window closes.
    namesWindow.peer.stop();
    await settle(network);

    // Assert.
    expect([ whileOpen, lastSecondSwitch(eventWindow.followed) ])
      .toStrictEqual([ 'after the vampire', 'suspicious castle' ]);
  });

  it('looks at nothing while nobody holds System.json, until its file changes on disk', async () =>
  {
    // Arrange: a window following, nobody holding System.json, and its file renamed by someone else.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const window = buildWindow(network, 'window-event', server.store);
    window.follower.start();
    await settle(network);
    const before = [ window.followed.length, server.reads() ];
    server.files.set(SYSTEM_KEY, { ...buildSystem() as object, switches: [ '', 'a', 'castle on disk', 'c' ] });

    // Act: the file's change heard.
    window.follower.refresh();
    await settle(network);

    // Assert.
    expect([ before, server.reads(), lastSecondSwitch(window.followed) ])
      .toStrictEqual([ [ 0, 0 ], 1, 'castle on disk' ]);
  });

  it('leaves its own copy to follow itself when its file changes on disk', async () =>
  {
    // Arrange: the window holding System.json, following it.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const window = buildWindow(network, 'window-names', server.store);
    await window.hub.load(SYSTEM_KEY);
    window.follower.start();
    const reads = server.reads();

    // Act: the file's change heard.
    window.follower.refresh();
    await settle(network);

    // Assert: nothing read for it, and the one set of names it started with.
    expect([ server.reads() - reads, window.followed.length ])
      .toStrictEqual([ 0, 1 ]);
  });

  it('looks elsewhere once it lets its own copy go', async () =>
  {
    // Arrange: the window holding System.json with an unsaved rename, following it.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const window = buildWindow(network, 'window-names', server.store);
    await window.hub.load(SYSTEM_KEY);
    window.follower.start();
    renameEntry(window.hub, 'switches', 2, 'after the vampire');

    // Act: it lets System.json go.
    window.hub.release(SYSTEM_KEY);
    await settle(network);

    // Assert: the file's names, nobody else holding it.
    expect(lastSecondSwitch(window.followed))
      .toBe('suspicious castle');
  });

  it('takes the latest look only, whichever finishes first', async () =>
  {
    // Arrange: a window holding nothing, whose two reads of the file finish in the order the test chooses.
    const answers: ((content: JsonValue) => void)[] = [];
    const followed: SystemNames[] = [];
    const sources: FollowSources = {
      hub: {
        has: () => false,
        document: () =>
        {
          throw new Error('nothing held');
        },
        readFile: () => new Promise<JsonValue>(resolve =>
        {
          answers.push(resolve);
        }),
        subscribe: () => () => undefined,
      },
      sync: {
        whenHeldOrDiscovered: async () => undefined,
        holders: () => [],
        requestSnapshot: async () => null,
        onHoldingChange: () => () => undefined,
      },
    };
    const follower = new SystemNamesFollower(sources, { followSystem: system => followed.push(system) });
    follower.start();
    follower.refresh();
    follower.refresh();
    await vi.advanceTimersByTimeAsync(0);

    // Act: the second read answers first, then the first.
    answers[1]({ switches: [ '', 'latest' ], variables: [ '' ] });
    await vi.advanceTimersByTimeAsync(0);
    answers[0]({ switches: [ '', 'older' ], variables: [ '' ] });
    await vi.advanceTimersByTimeAsync(0);

    // Assert.
    expect(followed.map(system => system.switches[1]))
      .toStrictEqual([ 'latest' ]);
  });

  it('takes nothing more once stopped, a look on its way included', async () =>
  {
    // Arrange: an event window following the Switches & Variables window.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const eventWindow = buildWindow(network, 'window-event', server.store);
    const stop = eventWindow.follower.start();
    const namesWindow = buildWindow(network, 'window-names', server.store);
    await namesWindow.hub.load(SYSTEM_KEY);
    await settle(network);
    const before = eventWindow.followed.length;

    // Act: a rename heard, the follower stopped before its look lands, then another rename.
    renameEntry(namesWindow.hub, 'switches', 2, 'after the vampire');
    network.flush();
    stop();
    await settle(network);
    renameEntry(namesWindow.hub, 'switches', 2, 'long after the vampire');
    await settle(network);

    // Assert.
    expect(eventWindow.followed.length)
      .toBe(before);
  });
});
