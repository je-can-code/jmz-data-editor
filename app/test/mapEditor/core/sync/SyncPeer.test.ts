import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { routeFileChange } from '../../../../src/mapEditor/core/sync/fileChangeRouting.ts';
import { SyncPeer } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { MemoryChannelNetwork } from '../../support/standIns.ts';

/*
 * Two windows holding the same map hold one live document: a map pane and its event window, or a pane torn out
 * into its own window. The sync peer owes them that. Every step, undo, redo and save made in one window is
 * repeated in the other, so both copies and both histories stay equal; a window opening a document takes the live
 * copy (unsaved edits and history included) from whoever holds it rather than the stale file; and a window that
 * drifts asks the window it drifted from for a fresh copy.
 *
 * The file-change stream echoes every save back to every window. A save made by any window of the session carries
 * that window's id, and every session window ignores it, because sync already carried the content. Only a change
 * from outside the session (MZ, a script) reloads anything. The ids differ by one character in the near miss,
 * which must count as a stranger.
 */
describe('SyncPeer', () =>
{
  const MAP: DocumentKey = 'map:1';

  /**
   * A store over one shared in-memory file per document, as the server would be.
   * @returns {{ store: DocumentStore, files: Map<DocumentKey, JsonValue> }} The store and its files.
   */
  const buildServer = () =>
  {
    const files = new Map<DocumentKey, JsonValue>([ [ MAP, buildMapJson() as unknown as JsonValue ] ]);
    const store: DocumentStore = {
      load: async key => structuredClone(files.get(key) as JsonValue),
      save: async (key, content) =>
      {
        files.set(key, structuredClone(content));
      },
    };

    return { store, files };
  };

  /**
   * One window: a hub and its peer on the shared network.
   * @param {MemoryChannelNetwork} network The channel network.
   * @param {string} clientId The window's id.
   * @param {DocumentStore} store The server.
   * @param {() => number} now The clock.
   * @returns {{ hub: DocumentHub, peer: SyncPeer }} The window.
   */
  const buildWindow = (network: MemoryChannelNetwork, clientId: string, store: DocumentStore, now: () => number = Date.now) =>
  {
    const hub = new DocumentHub({ clientId, store });
    const peer = new SyncPeer({ hub, channel: network.open('jmz-sync'), now, heartbeatMs: 0, snapshotTimeoutMs: 50 });
    peer.start();
    return { hub, peer };
  };

  /**
   * Opens a document the way a window does: the live copy from another window, else the file.
   * @param {{ hub: DocumentHub, peer: SyncPeer }} window The window.
   * @param {MemoryChannelNetwork} network The network, flushed so the request is answered.
   * @param {DocumentKey} key The document.
   * @returns {Promise<void>} Settles once held.
   */
  const open = async (window: { hub: DocumentHub; peer: SyncPeer }, network: MemoryChannelNetwork, key: DocumentKey) =>
  {
    const request = window.peer.requestSnapshot(key);
    network.flush();
    const snapshot = await request;
    if (snapshot !== null)
    {
      window.hub.adoptSnapshot(snapshot);
      return;
    }

    await window.hub.load(key);
  };

  beforeEach(() =>
  {
    vi.useFakeTimers({ toFake: [ 'setTimeout', 'clearTimeout' ] });
  });

  afterEach(() =>
  {
    vi.useRealTimers();
  });

  /**
   * Two windows on one network and server, both holding the map; the first loaded it from the file.
   * @returns {Promise<object>} The windows, network and server.
   */
  const buildPair = async () =>
  {
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const first = buildWindow(network, 'window-A', server.store);
    const second = buildWindow(network, 'window-B', server.store);
    network.flush();

    const opening = open(first, network, MAP);
    await vi.advanceTimersByTimeAsync(60);
    await opening;
    network.flush();
    await open(second, network, MAP);
    network.flush();
    return { network, server, first, second };
  };

  it('opens a document from another window\'s live copy, unsaved edits and history included', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const first = buildWindow(network, 'window-A', server.store);
    await first.hub.load(MAP);
    first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
    const second = buildWindow(network, 'window-B', server.store);
    network.flush();

    // Act.
    await open(second, network, MAP);

    // Assert.
    expect([ second.hub.document(MAP).toJson(), second.hub.history(mapHistoryKey(1)).rows.length, second.hub.isDirty(MAP) ])
      .toStrictEqual([ first.hub.document(MAP).toJson(), 1, true ]);
  });

  it('keeps two copies and their histories equal through edits, undos and redos from both windows', async () =>
  {
    // Arrange.
    const { network, first, second } = await buildPair();

    // Act.
    first.hub.edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles(MAP, [ [ 0, 700 ], [ 7, 701 ] ]));
    network.flush();
    second.hub.edit('Rename event', [ eventHistoryKey(1, 3) ], tx => tx.set(MAP, [ 'events', 3, 'name' ], 'Crate'));
    network.flush();
    second.hub.undo(mapHistoryKey(1));
    network.flush();
    first.hub.redo(mapHistoryKey(1));
    network.flush();

    // Assert.
    expect([
      second.hub.document(MAP).toJson(),
      second.hub.history(mapHistoryKey(1)),
      second.hub.history(eventHistoryKey(1, 3)),
      second.hub.version(MAP),
    ])
      .toStrictEqual([
        first.hub.document(MAP).toJson(),
        first.hub.history(mapHistoryKey(1)),
        first.hub.history(eventHistoryKey(1, 3)),
        first.hub.version(MAP),
      ]);
  });

  it('ignores the echo of a save by this window or another session window, and reloads for a stranger', async () =>
  {
    // Arrange.
    const { network, server, first, second } = await buildPair();
    first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
    network.flush();
    await first.hub.save(MAP);
    network.flush();
    const outsider = structuredClone(server.files.get(MAP)) as { displayName: string };
    outsider.displayName = 'Edited in MZ';
    server.files.set(MAP, outsider as unknown as JsonValue);

    // Act.
    const ownEcho = await routeFileChange({ path: 'data/Map001.json', kind: 'write', client: 'window-A' }, first.hub, first.peer);
    const peerEcho = await routeFileChange({ path: 'data/Map001.json', kind: 'write', client: 'window-A' }, second.hub, second.peer);
    const nearMiss = await routeFileChange({ path: 'data/Map001.json', kind: 'write', client: 'window-AB' }, second.hub, second.peer);

    // Assert.
    expect([ ownEcho, peerEcho, nearMiss, second.hub.document(MAP).toJson() ])
      .toStrictEqual([ 'echo', 'echo', 'reloaded', outsider ]);
  });

  it('treats a change with no client as coming from outside the editor', async () =>
  {
    // Arrange.
    const { server, second } = await buildPair();
    const outsider = structuredClone(server.files.get(MAP)) as { note: string };
    outsider.note = 'changed by a script';
    server.files.set(MAP, outsider as unknown as JsonValue);

    // Act.
    const outcome = await routeFileChange({ path: 'data/Map001.json', kind: 'write', client: '' }, second.hub, second.peer);

    // Assert.
    expect([ outcome, (second.hub.document(MAP).toJson() as { note: string }).note ])
      .toStrictEqual([ 'reloaded', 'changed by a script' ]);
  });

  it('shares the save, so neither window is left thinking the map is unsaved', async () =>
  {
    // Arrange.
    const { network, first, second } = await buildPair();
    second.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
    network.flush();

    // Act.
    await second.hub.save(MAP);
    network.flush();

    // Assert.
    expect([ first.hub.isDirty(MAP), second.hub.isDirty(MAP) ])
      .toStrictEqual([ false, false ]);
  });

  /**
   * Delivers messages and settles the promises they start, twice over, so a request and its answer both land.
   * @param {MemoryChannelNetwork} network The network.
   * @returns {Promise<void>} Settles once quiet.
   */
  const settle = async (network: MemoryChannelNetwork) =>
  {
    for (let round = 0; round < 3; round++)
    {
      network.flush();
      await vi.advanceTimersByTimeAsync(0);
    }
  };

  it('ends two windows that edited in the same instant on the authority\'s copy, not swapped', async () =>
  {
    // Arrange: both edit before either hears the other, so each finds the other's step stale.
    const { network, first, second } = await buildPair();
    first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'From A'));
    second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'From B'));
    const authorityCopy = first.hub.document(MAP).toJson();

    // Act.
    await settle(network);

    // Assert.
    expect([ first.peer.authorityFor(MAP), first.hub.document(MAP).toJson(), second.hub.document(MAP).toJson() ])
      .toStrictEqual([ 'window-A', authorityCopy, authorityCopy ]);
  });

  it('has a drifted authority push its copy to the window it drifted from', async () =>
  {
    // Arrange: the authority falls back to an older copy of itself.
    const { network, first, second } = await buildPair();
    const older = first.hub.snapshot(MAP);
    second.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
    network.flush();
    first.hub.adoptSnapshot(older);

    // Act.
    second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'again'));
    await settle(network);

    // Assert.
    expect([ second.hub.document(MAP).toJson(), second.hub.history(mapHistoryKey(1)) ])
      .toStrictEqual([ first.hub.document(MAP).toJson(), first.hub.history(mapHistoryKey(1)) ]);
  });

  it('adopts a pushed copy only from a window that outranks it', async () =>
  {
    // Arrange: a lower-ranked window pushes a copy it has no standing to push.
    const { network, first, second } = await buildPair();
    const pushed = second.hub.snapshot(MAP);
    const forged = { ...pushed, content: { ...(pushed.content as object), displayName: 'Forged' } };
    const channel = network.open('jmz-sync');
    const before = first.hub.document(MAP).toJson();

    // Act.
    channel.postMessage({ type: 'snapshot', from: 'window-Z', to: 'window-A', requestId: null, snapshot: forged });
    channel.postMessage({ type: 'snapshot', from: 'window-0', to: 'window-A', requestId: null, snapshot: { ...forged, document: 'map:4' } });
    network.flush();

    // Assert.
    expect(first.hub.document(MAP).toJson())
      .toStrictEqual(before);
  });

  it('knows which windows hold what, and forgets a window that said goodbye', async () =>
  {
    // Arrange.
    const { network, first, second } = await buildPair();
    const heldBefore = first.peer.isHeldElsewhere(MAP);

    // Act.
    second.peer.stop();
    network.flush();

    // Assert.
    expect([ heldBefore, first.peer.isHeldElsewhere(MAP), first.peer.isHeldElsewhere('map:2') ])
      .toStrictEqual([ true, false, false ]);
  });

  it('stops counting a window it has not heard from within the liveness window', () =>
  {
    // Arrange.
    let now = 1000;
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const first = buildWindow(network, 'window-A', server.store, () => now);
    const second = new DocumentHub({ clientId: 'window-B' });
    second.adopt(MAP, buildMapJson() as unknown as JsonValue);
    const secondPeer = new SyncPeer({ hub: second, channel: network.open('jmz-sync'), heartbeatMs: 0 });
    secondPeer.start();
    network.flush();

    // Act.
    const fresh = first.peer.isHeldElsewhere(MAP);
    now += 6001;

    // Assert.
    expect([ fresh, first.peer.isHeldElsewhere(MAP) ])
      .toStrictEqual([ true, false ]);
  });

  it('knows every session window\'s id and no other', async () =>
  {
    // Arrange.
    const { first } = await buildPair();

    // Act.
    const known = [ 'window-A', 'window-B', 'window-C', '' ].map(id => first.peer.knowsClient(id));

    // Assert.
    expect(known)
      .toStrictEqual([ true, true, false, false ]);
  });

  it('answers null when nobody holds the document asked for', async () =>
  {
    // Arrange.
    const { network, first } = await buildPair();

    // Act.
    const request = first.peer.requestSnapshot('map:9');
    network.flush();
    await vi.advanceTimersByTimeAsync(60);

    // Assert.
    await expect(request)
      .resolves.toBeNull();
  });

  it('only lets the window asked answer a request addressed to one window', async () =>
  {
    // Arrange.
    const { network, first, second } = await buildPair();
    const third = buildWindow(network, 'window-C', buildServer().store);
    await third.hub.load(MAP);
    third.hub.edit('Mine', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Third'));
    network.flush();

    // Act.
    const request = first.peer.requestSnapshot(MAP, 'window-B');
    network.flush();
    const snapshot = await request;

    // Assert.
    expect(snapshot?.content)
      .toStrictEqual(second.hub.document(MAP).toJson());
  });

  it('ignores posts on the channel that are not sync messages, and its own', async () =>
  {
    // Arrange.
    const { network, first } = await buildPair();
    const stranger = network.open('jmz-sync');
    const version = first.hub.version(MAP);

    // Act.
    stranger.postMessage('noise');
    stranger.postMessage({ type: 'mystery', from: 'x' });
    stranger.postMessage({ type: 'operation', from: 'window-A', operation: { type: 'saved', origin: 'window-A', document: MAP, marker: [ 'z' ] } });
    network.flush();

    // Assert.
    expect([ first.hub.version(MAP), first.hub.isDirty(MAP), first.peer.knowsClient('x') ])
      .toStrictEqual([ version, false, false ]);
  });

  it('closes its channel and stays quiet once stopped', async () =>
  {
    // Arrange.
    const network = new MemoryChannelNetwork();
    const hub = new DocumentHub({ clientId: 'window-A' });
    const channel = network.open('jmz-sync');
    const peer = new SyncPeer({ hub, channel, heartbeatMs: 0 });
    peer.start();

    // Act.
    peer.stop();
    peer.stop();
    hub.adopt(MAP, buildMapJson() as unknown as JsonValue);

    // Assert.
    expect([ channel.closed, channel.sent.map(message => (message as { type: string }).type) ])
      .toStrictEqual([ true, [ 'hello', 'goodbye' ] ]);
  });

  it('repeats its presence on a heartbeat', async () =>
  {
    // Arrange.
    vi.useFakeTimers();
    const network = new MemoryChannelNetwork();
    const hub = new DocumentHub({ clientId: 'window-A' });
    const channel = network.open('jmz-sync');
    const peer = new SyncPeer({ hub, channel, heartbeatMs: 100 });

    // Act.
    peer.start();
    vi.advanceTimersByTime(250);
    peer.stop();
    vi.advanceTimersByTime(250);

    // Assert.
    expect(channel.sent.map(message => (message as { type: string }).type))
      .toStrictEqual([ 'hello', 'presence', 'presence', 'goodbye' ]);
  });
});
