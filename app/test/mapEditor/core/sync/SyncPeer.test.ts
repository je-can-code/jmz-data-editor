import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { FileChangeRouter } from '../../../../src/mapEditor/core/sync/fileChangeRouting.ts';
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
 * holds everything it did, and a window offered a copy older than its own hands its own back, since that may be
 * the only way the other window ever catches up. Two copies that went different ways (a window that loaded a
 * stale file and edited it, while another held unsaved work) are both kept, both windows are flagged with the
 * other's copy, and nothing changes until the author chooses; then both windows end on the chosen copy. The two
 * windows never trade offers forever over it.
 *
 * The close guard's question is answered here too: does another live window hold exactly this window's latest
 * state of a document? A window holding an older copy, or one that said goodbye, does not.
 *
 * The file-change stream echoes every save; a save by any session window is ignored everywhere, and records nothing,
 * while a change from outside the session becomes one "Externally modified" step. The ids differ by one character in
 * the near miss. Only the window reading the stream reads a changed file, once, and hands that version to the others,
 * so every window ends on the one same step with the same lineage, even when a second write lands before another
 * window could have read the first, which then becomes a later step everywhere; nobody is flagged over it, and undo
 * and redo of it travel like any step's. Windows holding unsaved edits are flagged instead, with nothing recorded. A
 * save naming a step this window has never seen is not taken, since it would mark the copy saved against a file that
 * holds something else.
 */
describe('SyncPeer', () =>
{
  const MAP: DocumentKey = 'map:1';

  /**
   * A write to the map's file from outside the editor, as the stream announces it.
   */
  const OUTSIDE_WRITE = { path: 'data/Map001.json', kind: 'write', client: '' } as const;

  /**
   * Reads the names in a window's history of the map, oldest first.
   * @param {DocumentHub} hub The window's hub.
   * @returns {string[]} The step names.
   */
  const labelsOf = (hub: DocumentHub): string[] => hub.history(mapHistoryKey(1)).rows.map(row => row.label);

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

    it('hands its newer copy back to a window that offered an older one, which takes it', async () =>
    {
      // Arrange: the second window falls back to an older copy of its own, and an offer of that copy reaches the first
      // window as if the second had sent it. No operation is on its way, so only the first window can catch it up.
      const { network, first, second } = await buildPair();
      const older = second.hub.snapshot(MAP);
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      second.hub.adoptSnapshot(older);
      const stranger = network.open('jmz-sync');
      const offers: unknown[] = [];
      stranger.addEventListener('message', event =>
      {
        const message = event.data as { type: string; from: string; to: string; snapshot: { lineage: string[] } };
        if (message.type === 'offer')
        {
          offers.push([ message.from, message.to, message.snapshot.lineage ]);
        }
      });

      // Act.
      stranger.postMessage({ type: 'offer', from: 'window-B', to: 'window-A', snapshot: older, resolution: false });
      await settle(network);

      // Assert: one copy went back, the first window's own, and the second window now holds it, with nobody flagged.
      expect([
        offers,
        second.hub.document(MAP).toJson(),
        second.hub.lineage(MAP),
        first.hub.isConflicted(MAP) || second.hub.isConflicted(MAP),
      ])
        .toStrictEqual([
          [ [ 'window-A', 'window-B', first.hub.lineage(MAP) ] ],
          first.hub.document(MAP).toJson(),
          first.hub.lineage(MAP),
          false,
        ]);
    });

    it('hands nothing back for a copy offered at its own state, so two windows never trade the same copy', async () =>
    {
      // Arrange: an offer of exactly the copy the first window holds.
      const { network, first } = await buildPair();
      const same = first.hub.snapshot(MAP);
      const stranger = network.open('jmz-sync');
      const offers: unknown[] = [];
      stranger.addEventListener('message', event =>
      {
        if ((event.data as { type: string }).type === 'offer')
        {
          offers.push(event.data);
        }
      });

      // Act.
      stranger.postMessage({ type: 'offer', from: 'window-B', to: 'window-A', snapshot: same, resolution: false });
      await settle(network);

      // Assert.
      expect([ offers, first.hub.lineage(MAP), first.hub.isConflicted(MAP) ])
        .toStrictEqual([ [], same.lineage, false ]);
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
    it('skips the echo of a save by this window or another session window, and records a stranger\'s change in both', async () =>
    {
      // Arrange: the file already holds an outside version when the echoes arrive, so an echo let through would show.
      const { network, server, first, second } = await buildPair();
      const reading = new FileChangeRouter(first.hub, first.peer, () => true);
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      await first.hub.save(MAP);
      network.flush();
      const outsider = structuredClone(server.files.get(MAP)) as { displayName: string };
      outsider.displayName = 'Edited in MZ';
      server.files.set(MAP, outsider as unknown as JsonValue);

      // Act.
      const ownEcho = await reading.route({ ...OUTSIDE_WRITE, client: 'window-A' });
      const peerEcho = await reading.route({ ...OUTSIDE_WRITE, client: 'window-B' });
      await settle(network);
      const afterEchoes = [ labelsOf(first.hub), labelsOf(second.hub) ];
      const nearMiss = await reading.route({ ...OUTSIDE_WRITE, client: 'window-AB' });
      await settle(network);

      // Assert.
      expect([ ownEcho, peerEcho, afterEchoes, nearMiss, labelsOf(second.hub), second.hub.document(MAP).toJson() ])
        .toStrictEqual([ 'echo', 'echo', [ [ 'Rename' ], [ 'Rename' ] ], 'recorded', [ 'Rename', 'Externally modified' ], outsider ]);
    });

    it('treats a change with no client as coming from outside the editor', async () =>
    {
      // Arrange.
      const { server, second } = await buildPair();
      const reading = new FileChangeRouter(second.hub, second.peer, () => true);
      const outsider = structuredClone(server.files.get(MAP)) as { note: string };
      outsider.note = 'changed by a script';
      server.files.set(MAP, outsider as unknown as JsonValue);

      // Act.
      const outcome = await reading.route(OUTSIDE_WRITE);

      // Assert.
      expect([ outcome, (second.hub.document(MAP).toJson() as { note: string }).note, labelsOf(second.hub) ])
        .toStrictEqual([ 'recorded', 'changed by a script', [ 'Externally modified' ] ]);
    });
  });

  describe('outside changes in several windows', () =>
  {
    /**
     * Renames the map in its file on the server, as MZ or a script would.
     * @param {{ files: Map<DocumentKey, JsonValue> }} server The server.
     */
    const renameOutside = (server: { files: Map<DocumentKey, JsonValue> }) =>
    {
      server.files.set(MAP, { ...(server.files.get(MAP) as object), displayName: 'Edited in MZ' } as JsonValue);
    };

    /**
     * Reads what a window holds of the map: its title, and whether it is unsaved.
     * @param {DocumentHub} hub The window's hub.
     * @returns {[ string, boolean ]} The title and the unsaved state.
     */
    const stateOf = (hub: DocumentHub): [ string, boolean ] => [ (hub.document(MAP).toJson() as { displayName: string }).displayName, hub.isDirty(MAP) ];

    /**
     * Routes one change the way both windows hear it: the first window reads the change stream for everyone, and the
     * second follows. Messages already posted are delivered before the second window hears it.
     * @param {object} pair The two windows and their network.
     * @returns {Promise<string[]>} What each window made of the change.
     */
    const hearInBoth = async (pair: Awaited<ReturnType<typeof buildPair>>): Promise<string[]> =>
    {
      const { network, first, second } = pair;
      const outcomes = [
        await new FileChangeRouter(first.hub, first.peer, () => true).route(OUTSIDE_WRITE),
        await new FileChangeRouter(second.hub, second.peer, () => false).route(OUTSIDE_WRITE),
      ];
      await settle(network);
      return outcomes;
    };

    it('ends both windows on the one step the reading window read, saved, with neither flagged', async () =>
    {
      // Arrange: a server counting its reads.
      const pair = await buildPair();
      const { server, first, second } = pair;
      renameOutside(server);
      const load = vi.spyOn(server.store, 'load');

      // Act.
      const outcomes = await hearInBoth(pair);

      // Assert: the file was read once, for both.
      expect([ outcomes, load.mock.calls.length, [ ...second.hub.lineage(MAP) ], second.hub.history(mapHistoryKey(1)), [ stateOf(first.hub), stateOf(second.hub) ] ])
        .toStrictEqual([ [ 'recorded', 'follower' ], 1, [ ...first.hub.lineage(MAP) ], first.hub.history(mapHistoryKey(1)), [ [ 'Edited in MZ', false ], [ 'Edited in MZ', false ] ] ]);
      expect([ labelsOf(first.hub), first.hub.isConflicted(MAP), second.hub.isConflicted(MAP) ])
        .toStrictEqual([ [ 'Externally modified' ], false, false ]);
    });

    it('takes a second write landing between the windows\' reads as a later step in both, never as a different first step', async () =>
    {
      // Arrange: the file is written again the moment it has been read once, before any other window could read it.
      const pair = await buildPair();
      const { server, first, second } = pair;
      renameOutside(server);
      const read = server.store.load;
      let reads = 0;
      server.store.load = async key =>
      {
        const content = await read(key);
        reads += 1;
        server.files.set(MAP, { ...(content as object), displayName: 'Written again' } as JsonValue);
        return content;
      };

      // Act: both windows hear the first write, then both hear the second.
      const outcomes = [ ...await hearInBoth(pair), ...await hearInBoth(pair) ];

      // Assert: one version per write in both, the newer one standing.
      expect([ outcomes, reads, labelsOf(first.hub), labelsOf(second.hub), [ ...second.hub.lineage(MAP) ], [ stateOf(first.hub), stateOf(second.hub) ] ])
        .toStrictEqual([
          [ 'recorded', 'follower', 'recorded', 'follower' ],
          2,
          [ 'Externally modified', 'Externally modified' ],
          [ 'Externally modified', 'Externally modified' ],
          [ ...first.hub.lineage(MAP) ],
          [ [ 'Written again', false ], [ 'Written again', false ] ],
        ]);
      expect(first.hub.isConflicted(MAP) || second.hub.isConflicted(MAP))
        .toBe(false);
    });

    it('undoes the step in both windows from either one, back to the version the editor had, and redoes it in both', async () =>
    {
      // Arrange.
      const pair = await buildPair();
      const { network, server, first, second } = pair;
      renameOutside(server);
      await hearInBoth(pair);

      // Act: undo in the second window, then redo in the first.
      second.hub.undo(mapHistoryKey(1));
      await settle(network);
      const afterUndo = [ stateOf(first.hub), stateOf(second.hub) ];
      first.hub.redo(mapHistoryKey(1));
      await settle(network);

      // Assert.
      expect([ afterUndo, [ stateOf(first.hub), stateOf(second.hub) ], first.hub.isConflicted(MAP) || second.hub.isConflicted(MAP) ])
        .toStrictEqual([ [ [ 'Test Town', true ], [ 'Test Town', true ] ], [ [ 'Edited in MZ', false ], [ 'Edited in MZ', false ] ], false ]);
    });

    it('flags both windows holding unsaved edits, and records nothing in either', async () =>
    {
      // Arrange: an unsaved rename, shared by both windows, when the file changes.
      const pair = await buildPair();
      const { network, server, first, second } = pair;
      first.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      await settle(network);
      renameOutside(server);

      // Act.
      const outcomes = await hearInBoth(pair);

      // Assert.
      expect([ outcomes, [ labelsOf(first.hub), labelsOf(second.hub) ], [ stateOf(first.hub), stateOf(second.hub) ], [ first.hub.conflict(MAP)?.kind, second.hub.conflict(MAP)?.kind ] ])
        .toStrictEqual([ [ 'conflicted', 'follower' ], [ [ 'Rename' ], [ 'Rename' ] ], [ [ 'Harbor', true ], [ 'Harbor', true ] ], [ 'disk', 'disk' ] ]);
    });

    it('refuses another window\'s save naming a step this window has never seen, and works out whose copy is ahead', async () =>
    {
      // Arrange: a stray save of the map names a step no window here ever made.
      const { network, first } = await buildPair();
      const stranger = network.open('jmz-sync');
      const events: string[] = [];
      first.hub.subscribe(event => events.push(event.type));

      // Act.
      stranger.postMessage({ type: 'operation', from: 'window-B', operation: { type: 'saved', origin: 'window-B', document: MAP, marker: [ 'window-B#99' ] } });
      await settle(network);

      // Assert: the copy stays clean and unflagged; the difference was announced, and the other copy found to be the same.
      expect([ events, first.hub.isDirty(MAP), first.hub.isConflicted(MAP) ])
        .toStrictEqual([ [ 'out-of-sync' ], false, false ]);
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

    it('tells a window that holds nothing whenever another takes a document up, moves it on, or lets it go', async () =>
    {
      // Arrange: a window holding nothing, listening, and another window that will hold the map.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const watcher = buildWindow(network, 'window-A', server.store);
      const heard: DocumentKey[] = [];
      const stop = watcher.peer.onHoldingChange(key => heard.push(key));
      const holder = buildWindow(network, 'window-B', server.store);
      network.flush();

      // Act: the map taken up, renamed, its presence repeated unchanged, the window gone; then the map heard of again
      // after the listener stopped.
      await holder.hub.load(MAP);
      network.flush();
      holder.hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set(MAP, [ 'displayName' ], 'Harbor'));
      network.flush();
      network.flush();
      holder.peer.stop();
      network.flush();
      stop();
      const later = buildWindow(network, 'window-C', server.store);
      await later.hub.load(MAP);
      network.flush();

      // Assert: once taken up, once moved on, once gone, and nothing for the hello of a window holding nothing.
      expect(heard)
        .toStrictEqual([ MAP, MAP, MAP ]);
    });

    it('says nothing when a window repeats what it holds', async () =>
    {
      // Arrange: two windows holding the map at one head, the first listening.
      const { network, first, second } = await buildPair();
      const heard: DocumentKey[] = [];
      first.peer.onHoldingChange(key => heard.push(key));

      // Act: the second window answers a hello from a newcomer, repeating what it holds.
      buildWindow(network, 'window-C', buildServer().store);
      network.flush();

      // Assert.
      expect([ heard, first.peer.holders(MAP) ])
        .toStrictEqual([ [], [ second.hub.clientId ] ]);
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

    it('ends a wait for a document the moment a window holding it answers, long before discovery is over', async () =>
    {
      // Arrange: window A holds the map; window B has just said hello and waits to hear who holds it.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const holder = buildWindow(network, 'window-A', server.store);
      await holder.hub.load(MAP);
      network.flush();
      const opener = buildWindow(network, 'window-B', server.store);
      const heard: string[] = [];
      opener.peer.whenHeldOrDiscovered(MAP).then(() => heard.push('held'));
      opener.peer.whenDiscovered().then(() => heard.push('discovered'));

      // Act: the hello and its answer cross, with no time passing at all.
      await settle(network);

      // Assert.
      expect([ heard, opener.peer.holders(MAP) ])
        .toStrictEqual([ [ 'held' ], [ 'window-A' ] ]);
    });

    it('ends a wait at once for a document a window was already heard holding', async () =>
    {
      // Arrange: window B has heard window A answer holding the map.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const holder = buildWindow(network, 'window-A', server.store);
      await holder.hub.load(MAP);
      const opener = buildWindow(network, 'window-B', server.store);
      await settle(network);
      let held = false;

      // Act: nothing is delivered and no time passes.
      opener.peer.whenHeldOrDiscovered(MAP).then(() =>
      {
        held = true;
      });
      await vi.advanceTimersByTimeAsync(0);

      // Assert.
      expect(held)
        .toBe(true);
    });

    it('waits out discovery when the windows that answer hold other documents', async () =>
    {
      // Arrange: window A holds map 1 only; window B waits for map 2.
      const network = new MemoryChannelNetwork();
      const server = buildServer();
      const holder = buildWindow(network, 'window-A', server.store);
      await holder.hub.load(MAP);
      const opener = buildWindow(network, 'window-B', server.store);
      let held = false;
      opener.peer.whenHeldOrDiscovered('map:2').then(() =>
      {
        held = true;
      });

      // Act: A's answer arrives, then discovery runs out.
      await settle(network);
      const afterAnswer = held;
      await vi.advanceTimersByTimeAsync(25);

      // Assert.
      expect([ afterAnswer, held ])
        .toStrictEqual([ false, true ]);
    });

    it('lets go of every wait when it stops, since nobody will be heard from after', async () =>
    {
      // Arrange: a lone window waiting to hear who holds the map.
      const network = new MemoryChannelNetwork();
      const lone = buildWindow(network, 'window-A', buildServer().store);
      let held = false;
      lone.peer.whenHeldOrDiscovered(MAP).then(() =>
      {
        held = true;
      });

      // Act: no time passes before it stops.
      lone.peer.stop();
      await vi.advanceTimersByTimeAsync(0);

      // Assert.
      expect(held)
        .toBe(true);
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
