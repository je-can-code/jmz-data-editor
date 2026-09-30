import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { routeFileChange } from '../../../../src/mapEditor/core/sync/fileChangeRouting.ts';
import { compareLineages } from '../../../../src/mapEditor/core/sync/SyncProtocol.ts';
import { SyncPeer } from '../../../../src/mapEditor/core/sync/SyncPeer.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { MemoryChannelNetwork } from '../../support/standIns.ts';

/*
 * Two windows holding the same map hold one live document: a map pane and its event window, or a pane torn out
 * into its own window. The sync peer owes them that, and owes the author that no edit is ever thrown away
 * without them choosing to.
 *
 * Every step, undo, redo, forget and save made in one window is repeated in the other, so both copies and both
 * histories stay equal, and a window opening a document takes the live copy from whoever holds it.
 *
 * When two copies are found to differ, their lineages decide. A copy that is only behind takes the other, which
 * holds everything it did. Two copies that went different ways (a window that loaded a stale file and edited it,
 * while another held unsaved work) are both kept, both windows are flagged with the other's copy, and nothing
 * changes until the author chooses; then both windows end on the chosen copy. The two windows never trade offers
 * forever over it.
 *
 * The close guard's question is answered here too: does another live window hold exactly this window's latest
 * state of a document? A window holding an older copy, or one that said goodbye, does not.
 *
 * The file-change stream echoes every save; a save by any session window is ignored everywhere, and only a
 * change from outside the session reloads anything. The ids differ by one character in the near miss.
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
    const peer = new SyncPeer({ hub, channel: network.open('jmz-sync'), now, heartbeatMs: 0, snapshotTimeoutMs: 50, discoveryMs: 20 });
    peer.start();
    return { hub, peer };
  };

  /**
   * Delivers messages and settles the promises and timers they start, until the network is quiet.
   * @param {MemoryChannelNetwork} network The network.
   * @returns {Promise<number>} How many messages were delivered in all.
   */
  const settle = async (network: MemoryChannelNetwork): Promise<number> =>
  {
    let delivered = 0;
    for (let round = 0; round < 10; round++)
    {
      delivered += network.flush();
      await vi.advanceTimersByTimeAsync(0);
    }

    return delivered;
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
   * Two windows on one network and server, both holding the map at the same state; the first loaded it.
   * @returns {Promise<object>} The windows, network and server.
   */
  const buildPair = async () =>
  {
    const network = new MemoryChannelNetwork();
    const server = buildServer();
    const first = buildWindow(network, 'window-A', server.store);
    const second = buildWindow(network, 'window-B', server.store);
    network.flush();
    await first.hub.load(MAP);
    network.flush();
    const request = second.peer.requestSnapshot(MAP);
    network.flush();
    second.hub.adoptSnapshot(await request as never);
    network.flush();
    return { network, server, first, second };
  };

  describe('keeping copies in step', () =>
  {
    it('hands a document\'s live copy to a window opening it, unsaved edits and history included', async () =>
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
      const request = second.peer.requestSnapshot(MAP);
      network.flush();
      second.hub.adoptSnapshot(await request as never);

      // Assert.
      expect([ second.hub.document(MAP).toJson(), second.hub.history(mapHistoryKey(1)).rows.length, second.hub.isDirty(MAP) ])
        .toStrictEqual([ first.hub.document(MAP).toJson(), 1, true ]);
    });

    it('keeps two copies, their histories and lineages equal through edits, undos, redos and forgets from both windows', async () =>
    {
      // Arrange.
      const { network, first, second } = await buildPair();

      // Act.
      first.hub.edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles(MAP, [ [ 0, 700 ], [ 7, 701 ] ]));
      network.flush();
      const renamed = second.hub.edit('Rename event', [ eventHistoryKey(1, 3) ], tx => tx.set(MAP, [ 'events', 3, 'name' ], 'Crate'));
      network.flush();
      second.hub.undo(mapHistoryKey(1));
      network.flush();
      first.hub.redo(mapHistoryKey(1));
      network.flush();
      first.hub.forgetStep(renamed?.id as string);
      network.flush();

      // Assert.
      expect([
        second.hub.document(MAP).toJson(),
        second.hub.history(mapHistoryKey(1)),
        second.hub.history(eventHistoryKey(1, 3)),
        second.hub.lineage(MAP),
        first.hub.isConflicted(MAP) || second.hub.isConflicted(MAP),
      ])
        .toStrictEqual([
          first.hub.document(MAP).toJson(),
          first.hub.history(mapHistoryKey(1)),
          first.hub.history(eventHistoryKey(1, 3)),
          first.hub.lineage(MAP),
          false,
        ]);
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
  });

  describe('copies that differ', () =>
  {
    it('lets a window that is only behind take the fresher copy without flagging anything', async () =>
    {
      // Arrange: the second window falls back to an older copy of its own, as if it had missed an operation.
      const { network, first, second } = await buildPair();
      const older = second.hub.snapshot(MAP);
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      second.hub.adoptSnapshot(older);

      // Act.
      first.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'again'));
      await settle(network);

      // Assert.
      expect([ second.hub.document(MAP).toJson(), second.hub.lineage(MAP), first.hub.isConflicted(MAP), second.hub.isConflicted(MAP) ])
        .toStrictEqual([ first.hub.document(MAP).toJson(), first.hub.lineage(MAP), false, false ]);
    });

    it('hands the fresher copy to a window that fell behind even when the fresher one is the lower id', async () =>
    {
      // Arrange: now the first window (the lower id) is the one that fell behind.
      const { network, first, second } = await buildPair();
      const older = first.hub.snapshot(MAP);
      second.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      first.hub.adoptSnapshot(older);

      // Act.
      second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'again'));
      await settle(network);

      // Assert: nothing was lost; the behind window caught up.
      const firstCopy = first.hub.document(MAP).toJson() as { displayName: string; note: string };
      expect([ firstCopy.displayName, firstCopy.note, first.hub.lineage(MAP), first.hub.isConflicted(MAP) ])
        .toStrictEqual([ 'Harbor', 'again', second.hub.lineage(MAP), false ]);
    });

    it('keeps both copies and flags both windows when a stale window\'s edit meets unsaved work', async () =>
    {
      // Arrange: the main window renames the map, unsaved; a new window loaded the stale file on its own and edits it.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const main = buildWindow(network, 'window-B', server.store);
      await main.hub.load(MAP);
      main.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      const stale = buildWindow(network, 'window-A', server.store);
      await stale.hub.load(MAP);
      network.flush();

      // Act.
      stale.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'stale edit'));
      await settle(network);

      // Assert: each copy is untouched, and each window holds the other's copy beside its own.
      const mainCopy = main.hub.document(MAP).toJson() as { displayName: string; note: string };
      const staleCopy = stale.hub.document(MAP).toJson() as { displayName: string; note: string };
      const mainConflict = main.hub.conflict(MAP);
      const staleConflict = stale.hub.conflict(MAP);
      expect([
        [ mainCopy.displayName, mainCopy.note ],
        [ staleCopy.displayName, staleCopy.note ],
        mainConflict?.kind === 'window' && [ mainConflict.peer, (mainConflict.theirs.content as { note: string }).note ],
        staleConflict?.kind === 'window' && [ staleConflict.peer, (staleConflict.theirs.content as { displayName: string }).displayName ],
      ])
        .toStrictEqual([
          [ 'Harbor', '' ],
          [ 'Test Town', 'stale edit' ],
          [ 'window-A', 'stale edit' ],
          [ 'window-B', 'Harbor' ],
        ]);
    });

    it('settles two windows editing in the same instant into a flagged conflict, without trading offers forever', async () =>
    {
      // Arrange: both edit before either hears the other.
      const { network, first, second } = await buildPair();
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'From A'));
      second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'From B'));

      // Act.
      const delivered = await settle(network);
      const afterward = await settle(network);

      // Assert.
      expect([
        first.hub.isConflicted(MAP),
        second.hub.isConflicted(MAP),
        (first.hub.document(MAP).toJson() as { displayName: string }).displayName,
        (second.hub.document(MAP).toJson() as { note: string }).note,
        delivered < 40,
        afterward,
      ])
        .toStrictEqual([ true, true, 'From A', 'From B', true, 0 ]);
    });

    it('ends both windows on this window\'s copy when the author keeps it', async () =>
    {
      // Arrange.
      const { network, first, second } = await buildPair();
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'From A'));
      second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'From B'));
      await settle(network);

      // Act.
      const resolved = first.peer.resolveConflict(MAP, 'mine');
      await settle(network);

      // Assert.
      expect([ resolved, second.hub.document(MAP).toJson(), second.hub.lineage(MAP), first.hub.isConflicted(MAP), second.hub.isConflicted(MAP) ])
        .toStrictEqual([ true, first.hub.document(MAP).toJson(), first.hub.lineage(MAP), false, false ]);
    });

    it('ends both windows on the other copy, and anything newer in it, when the author takes it', async () =>
    {
      // Arrange: after the conflict, the other window edits again before the author chooses here.
      const { network, first, second } = await buildPair();
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'From A'));
      second.hub.edit('Retag', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'note' ], 'From B'));
      await settle(network);
      second.hub.edit('Retitle', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'parallaxName' ], 'Sky'));
      await settle(network);

      // Act.
      const resolved = first.peer.resolveConflict(MAP, 'theirs');
      await settle(network);

      // Assert.
      const copy = first.hub.document(MAP).toJson() as { displayName: string; note: string; parallaxName: string };
      expect([ resolved, [ copy.displayName, copy.note, copy.parallaxName ], first.hub.lineage(MAP), first.hub.isConflicted(MAP), second.hub.isConflicted(MAP) ])
        .toStrictEqual([ true, [ 'Test Town', 'From B', 'Sky' ], second.hub.lineage(MAP), false, false ]);
    });

    it('settles nothing when there is no conflict with another window', async () =>
    {
      // Arrange: a disk conflict is the hub's to settle, not the peer's.
      const { first } = await buildPair();
      first.hub.flagConflict(MAP, { kind: 'disk', content: null });

      // Act.
      const results = [ first.peer.resolveConflict(MAP, 'mine'), first.peer.resolveConflict('map:9', 'theirs') ];

      // Assert.
      expect([ results, first.hub.isConflicted(MAP) ])
        .toStrictEqual([ [ false, false ], true ]);
    });

    it('ignores a resolution offer for a document it holds no conflict on, taking only what is fresher', async () =>
    {
      // Arrange: a stray "take mine" carrying a stale copy.
      const { network, first, second } = await buildPair();
      const stale = second.hub.snapshot(MAP);
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      const channel = network.open('jmz-sync');

      // Act.
      channel.postMessage({ type: 'offer', from: 'window-Z', to: 'window-A', snapshot: stale, resolution: true });
      await settle(network);

      // Assert.
      expect([ (first.hub.document(MAP).toJson() as { displayName: string }).displayName, first.hub.isConflicted(MAP) ])
        .toStrictEqual([ 'Harbor', false ]);
    });

    it('compares lineages as same, behind, ahead or diverged', () =>
    {
      // Arrange: lineages sharing a start.

      // Act.
      const relations = [
        compareLineages([ 'a', 'b' ], [ 'a', 'b' ]),
        compareLineages([ 'a' ], [ 'a', 'b' ]),
        compareLineages([ 'a', 'b' ], [ 'a' ]),
        compareLineages([ 'a', 'b' ], [ 'a', 'c' ]),
        compareLineages([ 'x' ], [ 'a', 'b' ]),
      ];

      // Assert.
      expect(relations)
        .toStrictEqual([ 'same', 'behind', 'ahead', 'diverged', 'diverged' ]);
    });
  });

  describe('file changes', () =>
  {
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
  });

  describe('who holds what', () =>
  {
    it('counts another window as holding the latest state only at this window\'s head', async () =>
    {
      // Arrange.
      const { network, first, second } = await buildPair();
      const atSameHead = first.peer.sharesLatest(MAP);

      // Act: an edit moves this window's head; the other window's presence catches up once it applies it.
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      const beforeItHears = first.peer.sharesLatest(MAP);
      network.flush();
      network.flush();

      // Assert.
      expect([ atSameHead, beforeItHears, first.peer.sharesLatest(MAP), second.peer.sharesLatest(MAP), first.peer.holders(MAP) ])
        .toStrictEqual([ true, false, true, true, [ 'window-B' ] ]);
    });

    it('never counts a window holding an older copy as holding the latest state', async () =>
    {
      // Arrange: a window that loaded the file while another held unsaved edits.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const main = buildWindow(network, 'window-A', server.store);
      await main.hub.load(MAP);
      main.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      const stale = buildWindow(network, 'window-B', server.store);
      await stale.hub.load(MAP);

      // Act.
      network.flush();

      // Assert: the stale window holds the map, but not the main window's state of it.
      expect([ main.peer.holders(MAP), main.peer.sharesLatest(MAP) ])
        .toStrictEqual([ [ 'window-B' ], false ]);
    });

    it('forgets a window that said goodbye', async () =>
    {
      // Arrange.
      const { network, first, second } = await buildPair();
      const before = first.peer.sharesLatest(MAP);

      // Act.
      second.peer.stop();
      network.flush();

      // Assert.
      expect([ before, first.peer.sharesLatest(MAP), first.peer.holders(MAP), first.peer.sharesLatest('map:2') ])
        .toStrictEqual([ true, false, [], false ]);
    });

    it('stops counting a window it has not heard from within the liveness window', () =>
    {
      // Arrange.
      let now = 1000;
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const first = buildWindow(network, 'window-A', server.store, () => now);
      first.hub.adopt(MAP, buildMapJson() as unknown as JsonValue);
      const second = new DocumentHub({ clientId: 'window-B' });
      second.adopt(MAP, buildMapJson() as unknown as JsonValue);
      const secondPeer = new SyncPeer({ hub: second, channel: network.open('jmz-sync'), heartbeatMs: 0 });
      secondPeer.start();
      network.flush();

      // Act.
      const fresh = first.peer.sharesLatest(MAP);
      now += 6001;

      // Assert.
      expect([ fresh, first.peer.sharesLatest(MAP), first.peer.holders(MAP) ])
        .toStrictEqual([ true, false, [] ]);
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

    it('settles discovery once the other windows have had time to answer', async () =>
    {
      // Arrange.
      const network = new MemoryChannelNetwork();
      const window = buildWindow(network, 'window-A', buildServer().store);
      let discovered = false;
      window.peer.whenDiscovered().then(() =>
      {
        discovered = true;
      });

      // Act.
      await vi.advanceTimersByTimeAsync(10);
      const early = discovered;
      await vi.advanceTimersByTimeAsync(15);

      // Assert.
      expect([ early, discovered ])
        .toStrictEqual([ false, true ]);
    });
  });

  describe('snapshot requests', () =>
  {
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

    it('lets only the window asked answer a request addressed to one window', async () =>
    {
      // Arrange: a third window holds the map, but the request is addressed to one that does not.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const asker = buildWindow(network, 'window-A', server.store);
      buildWindow(network, 'window-B', server.store);
      const holder = buildWindow(network, 'window-C', server.store);
      await holder.hub.load(MAP);
      network.flush();

      // Act.
      const request = asker.peer.requestSnapshot(MAP, 'window-B');
      network.flush();
      await vi.advanceTimersByTimeAsync(60);

      // Assert.
      await expect(request)
        .resolves.toBeNull();
    });
  });

  describe('the channel', () =>
  {
    it('ignores posts that are not sync messages, and posts claiming to be its own', async () =>
    {
      // Arrange.
      const { network, first } = await buildPair();
      const stranger = network.open('jmz-sync');
      const lineage = [ ...first.hub.lineage(MAP) ];

      // Act.
      stranger.postMessage('noise');
      stranger.postMessage({ type: 'mystery', from: 'x' });
      stranger.postMessage({ type: 'operation', from: 'window-A', operation: { type: 'saved', origin: 'window-A', document: MAP, marker: [ 'z' ] } });
      network.flush();

      // Assert.
      expect([ first.hub.lineage(MAP), first.hub.isDirty(MAP), first.peer.knowsClient('x') ])
        .toStrictEqual([ lineage, false, false ]);
    });

    it('closes its channel and stays quiet once stopped', () =>
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

    it('repeats its presence on a heartbeat, and whenever a head moves', () =>
    {
      // Arrange.
      vi.useFakeTimers();
      const network = new MemoryChannelNetwork();
      const hub = new DocumentHub({ clientId: 'window-A' });
      const channel = network.open('jmz-sync');
      const peer = new SyncPeer({ hub, channel, heartbeatMs: 100 });

      // Act.
      peer.start();
      hub.adopt(MAP, buildMapJson() as unknown as JsonValue);
      vi.advanceTimersByTime(250);
      peer.stop();
      vi.advanceTimersByTime(250);

      // Assert.
      expect(channel.sent.map(message => (message as { type: string }).type))
        .toStrictEqual([ 'hello', 'presence', 'presence', 'presence', 'goodbye' ]);
    });
  });
});
