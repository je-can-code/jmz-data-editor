import { describe, expect, it } from 'vitest';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { FileChange } from '../../../../src/mapEditor/core/sync/FileChangeFeed.ts';
import { FileChangeRouter, type RoutingPeers } from '../../../../src/mapEditor/core/sync/fileChangeRouting.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * Routing decides what a change on the server's stream means for the documents every window holds, and it owes them
 * one version of each change. Every window hears the change, but only the window reading the stream reads the file,
 * once, and hands that very version to every other window as it takes it itself; a window that read the file for
 * itself a moment later could read a second write's version and record a different step, and two windows holding
 * different versions of one change is how an older version comes to be saved over a newer one. For the same reason
 * reads happen one after another, so a slow read never lands after a newer one.
 *
 * Echoes of session saves are skipped (the sync suite proves that across two windows, with a near miss), and so is a
 * file no window holds. A removed file is handed over as removed and never read. After the stream reconnects, the
 * reading window re-reads every document held anywhere except its own with unsaved edits, which differ from disk by
 * definition; flagging those would cry wolf on every reconnect. A map whose file was removed is read all the same: it
 * reads as unsaved for that alone, and its file may have come back while nothing was announced.
 */
describe('fileChangeRouting', () =>
{
  /**
   * A write to a map's file from outside the editor.
   * @param {number} mapId The map.
   * @returns {FileChange} The change.
   */
  const outsideWrite = (mapId: number): FileChange => ({ path: `data/Map00${mapId}.json`, kind: 'write', client: '' });

  /**
   * The other windows as routing sees them: the session's client ids, who holds what, and every version handed over.
   * @param {Record<string, string[]>} holding The documents each other window holds, by client id.
   * @returns {RoutingPeers & { posts: [ DocumentKey, JsonValue | null, boolean ][] }} The peers and their record.
   */
  const buildPeers = (holding: Record<string, DocumentKey[]> = {}) =>
  {
    const posts: [ DocumentKey, JsonValue | null, boolean ][] = [];
    const peers: RoutingPeers & { posts: typeof posts } = {
      posts,
      knowsClient: clientId => clientId === 'window-a' || Object.hasOwn(holding, clientId),
      holders: key => Object.keys(holding).filter(clientId => holding[clientId].includes(key)),
      documentsHeldElsewhere: () => [ ...new Set(Object.values(holding).flat()) ],
      postOutside: (key, content, recheck) => posts.push([ key, content, recheck ]),
    };

    return peers;
  };

  /**
   * A hub holding maps 1 and 2 over files that can be changed behind its back, counting every read.
   * @returns {{ hub: DocumentHub, files: Map<DocumentKey, JsonValue>, reads: DocumentKey[] }} The hub, the files and the reads.
   */
  const buildHub = () =>
  {
    const files = new Map<DocumentKey, JsonValue>([
      [ 'map:1', buildMapJson() as unknown as JsonValue ],
      [ 'map:2', buildMapJson() as unknown as JsonValue ],
      [ 'map:3', buildMapJson() as unknown as JsonValue ],
    ]);
    const reads: DocumentKey[] = [];
    const store: DocumentStore = {
      load: async key =>
      {
        reads.push(key);
        if (files.has(key) === false)
        {
          throw new Error(`${key} has no file`);
        }

        return structuredClone(files.get(key) as JsonValue);
      },
      save: async () => undefined,
    };
    const hub = new DocumentHub({ clientId: 'window-a', store });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    return { hub, files, reads };
  };

  /**
   * Changes a map's note in its file.
   * @param {Map<DocumentKey, JsonValue>} files The files.
   * @param {DocumentKey} key The map.
   * @param {string} note The new note.
   */
  const changeOnDisk = (files: Map<DocumentKey, JsonValue>, key: DocumentKey, note: string) =>
  {
    files.set(key, { ...(files.get(key) as object), note } as JsonValue);
  };

  /**
   * Reads a held map's note.
   * @param {DocumentHub} hub The hub.
   * @param {DocumentKey} key The map.
   * @returns {string} The note.
   */
  const noteOf = (hub: DocumentHub, key: DocumentKey): string => (hub.document(key).toJson() as { note: string }).note;

  /**
   * Lets every promise and timer already started settle.
   * @returns {Promise<void>} Settles after a turn of the event loop.
   */
  const settleTurns = () => new Promise<void>(resolve =>
  {
    setTimeout(resolve, 0);
  });

  describe('route', () =>
  {
    it('reads a changed file once, hands that version to the other windows and takes it here as a step', async () =>
    {
      // Arrange: map 2 beside it is held too, and does not change.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      changeOnDisk(files, 'map:1', 'changed outside');

      // Act.
      const outcome = await router.route(outsideWrite(1));

      // Assert.
      expect([ outcome, reads, peers.posts, noteOf(hub, 'map:1'), hub.history(mapHistoryKey(2)).rows ])
        .toStrictEqual([ 'recorded', [ 'map:1' ], [ [ 'map:1', files.get('map:1'), false ] ], 'changed outside', [] ]);
    });

    it('leaves every change to the window reading the stream, reading and handing over nothing itself', async () =>
    {
      // Arrange: this window follows.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1' ] });
      const router = new FileChangeRouter(hub, peers, () => false);
      changeOnDisk(files, 'map:1', 'changed outside');

      // Act.
      const outcomes = [ await router.route(outsideWrite(1)), await router.recheck() ];

      // Assert.
      expect([ outcomes, reads, peers.posts, noteOf(hub, 'map:1') ])
        .toStrictEqual([ [ 'follower', [] ], [], [], '' ]);
    });

    it('skips the echo of a session window\'s save without reading it', async () =>
    {
      // Arrange: the file holds something else, so a read would show.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      changeOnDisk(files, 'map:1', 'changed outside');

      // Act.
      const outcomes = [
        await router.route({ ...outsideWrite(1), client: 'window-a' }),
        await router.route({ ...outsideWrite(1), client: 'window-b' }),
      ];

      // Assert.
      expect([ outcomes, reads, peers.posts ])
        .toStrictEqual([ [ 'echo', 'echo' ], [], [] ]);
    });

    it('leaves alone a file backing nothing any window holds', async () =>
    {
      // Arrange: map 3 has a file but nobody holds it, and the actors back no document at all.
      const { hub, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1' ] });
      const router = new FileChangeRouter(hub, peers, () => true);

      // Act.
      const outcomes = [
        await router.route(outsideWrite(3)),
        await router.route({ path: 'data/Actors.json', kind: 'write', client: '' }),
      ];

      // Assert.
      expect([ outcomes, reads, peers.posts ])
        .toStrictEqual([ [ 'untracked', 'untracked' ], [], [] ]);
    });

    it('reads a file only another window holds, and hands it over without taking it here', async () =>
    {
      // Arrange: only the other window holds map 3.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:3' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      changeOnDisk(files, 'map:3', 'changed outside');

      // Act.
      const outcome = await router.route(outsideWrite(3));

      // Assert.
      expect([ outcome, reads, peers.posts, hub.has('map:3') ])
        .toStrictEqual([ 'ignored', [ 'map:3' ], [ [ 'map:3', files.get('map:3'), false ] ], false ]);
    });

    it('hands a removed file over as removed, without reading it, and flags it here keeping what it holds', async () =>
    {
      // Arrange.
      const { hub, reads } = buildHub();
      const peers = buildPeers();
      const router = new FileChangeRouter(hub, peers, () => true);
      const before = hub.document('map:2').toJson();

      // Act.
      const outcome = await router.route({ path: 'data/Map002.json', kind: 'remove', client: '' });

      // Assert.
      expect([ outcome, reads, peers.posts, hub.conflict('map:2'), hub.isConflicted('map:1'), hub.document('map:2').toJson() ])
        .toStrictEqual([ 'conflicted', [], [ [ 'map:2', null, false ] ], { kind: 'disk', content: null }, false, before ]);
    });

    it('hands nobody a file that holds nothing its document could be, and leaves the document as it was', async () =>
    {
      // Arrange: the map's file loses a cell, so it no longer fits its size.
      const { hub, files } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      const broken = structuredClone(files.get('map:1')) as { data: number[] };
      broken.data.pop();
      files.set('map:1', broken as unknown as JsonValue);
      const before = hub.document('map:1').toJson();

      // Act.
      const outcome = await router.route(outsideWrite(1));

      // Assert.
      expect([ outcome, peers.posts, hub.document('map:1').toJson(), hub.isConflicted('map:1') ])
        .toStrictEqual([ 'unholdable', [], before, false ]);
    });

    it('reads one change after another, so a slow read never lands after a newer one', async () =>
    {
      // Arrange: each read answers with the file as it stood when asked, but only when let go, and the newest answer
      // is let go first, as a busy server may answer.
      let onDisk = { ...buildMapJson(), note: 'first write' } as unknown as JsonValue;
      const answers: (() => void)[] = [];
      const store: DocumentStore = {
        load: () =>
        {
          const asked = structuredClone(onDisk);
          return new Promise(resolve =>
          {
            answers.push(() => resolve(asked));
          });
        },
        save: async () => undefined,
      };
      const hub = new DocumentHub({ clientId: 'window-a', store });
      hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
      const peers = buildPeers();
      const router = new FileChangeRouter(hub, peers, () => true);

      // Act: two changes, the second write landing while the first read is still out.
      const first = router.route(outsideWrite(1));
      await settleTurns();
      onDisk = { ...buildMapJson(), note: 'second write' } as unknown as JsonValue;
      const second = router.route(outsideWrite(1));
      await settleTurns();
      while (answers.length > 0)
      {
        (answers.pop() as () => void)();
        await settleTurns();
      }
      const outcomes = [ await first, await second ];

      // Assert: both versions were taken, in the order they were written, and the newer one stands.
      expect([ outcomes, peers.posts.map(([ , content ]) => (content as { note: string }).note), noteOf(hub, 'map:1') ])
        .toStrictEqual([ [ 'recorded', 'recorded' ], [ 'first write', 'second write' ], 'second write' ]);
    });
  });

  describe('recheck', () =>
  {
    it('re-reads the clean documents held here and every document held elsewhere, and hands each over', async () =>
    {
      // Arrange: map 1 has unsaved edits here; map 2 is clean; only the other window holds map 3.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:1', 'map:3' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      hub.edit('Rename', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'displayName' ], 'Harbor'));
      changeOnDisk(files, 'map:1', 'changed while the stream was down');
      changeOnDisk(files, 'map:2', 'changed while the stream was down');

      // Act.
      const outcomes = await router.recheck();

      // Assert: the unsaved map is neither read nor flagged.
      expect([ outcomes, reads, peers.posts.map(([ key, , recheck ]) => [ key, recheck ]), hub.isConflicted('map:1'), noteOf(hub, 'map:2') ])
        .toStrictEqual([ [ 'recorded', 'ignored' ], [ 'map:2', 'map:3' ], [ [ 'map:2', true ], [ 'map:3', true ] ], false, 'changed while the stream was down' ]);
    });

    it('re-reads a map here whose file was removed, though it reads as unsaved, and takes the file back once it is there', async () =>
    {
      // Arrange: map 1's file was removed, then came back as it was while the stream was down; map 2 holds an unsaved
      // rename, so it is not read.
      const { hub, reads } = buildHub();
      const peers = buildPeers();
      const router = new FileChangeRouter(hub, peers, () => true);
      hub.applyOutsideContent('map:1', null);
      hub.edit('Rename', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'displayName' ], 'Harbor'));
      const removed = hub.isDirty('map:1');

      // Act.
      const outcomes = await router.recheck();

      // Assert.
      expect([ removed, outcomes, reads, hub.isDirty('map:1'), hub.isConflicted('map:1'), hub.isDirty('map:2') ])
        .toStrictEqual([ true, [ 'unchanged' ], [ 'map:1' ], false, false, true ]);
    });

    it('leaves a document it cannot read, or cannot take, for its next change, and goes on to the rest', async () =>
    {
      // Arrange: the other window holds a map whose file is gone and one whose file lost a cell; map 2 changed.
      const { hub, files, reads } = buildHub();
      const peers = buildPeers({ 'window-b': [ 'map:9', 'map:3' ] });
      const router = new FileChangeRouter(hub, peers, () => true);
      const broken = structuredClone(files.get('map:3')) as { data: number[] };
      broken.data.pop();
      files.set('map:3', broken as unknown as JsonValue);
      changeOnDisk(files, 'map:2', 'changed while the stream was down');

      // Act.
      const outcomes = await router.recheck();

      // Assert.
      expect([ outcomes, reads, peers.posts.map(([ key ]) => key) ])
        .toStrictEqual([ [ 'unchanged', 'recorded' ], [ 'map:1', 'map:2', 'map:9', 'map:3' ], [ 'map:1', 'map:2' ] ]);
    });
  });
});
