import { describe, expect, it } from 'vitest';
import { apiDocumentStore } from '../../../../src/mapEditor/core/api/apiDocumentStore.ts';
import { MapEditorApiError, type MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { TREE_HISTORY_KEY, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { jsonEquals } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzMapInfo } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { TREE_ROOT } from '../../../../src/mapEditor/core/tree/MapTreeModel.ts';
import { MapTreeService, type TreeOutcome } from '../../../../src/mapEditor/core/tree/MapTreeService.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The tree service is the map tree's one way in, and what it owes is simple to say: MapInfos.json and the map files
 * always agree with the tree on screen, and every tree operation round-trips through undo.
 *
 * So each operation is one step in the tree history, written through at once, in the order that never leaves the
 * tree naming a map without a file (new files, then the tree, then removals, which the server refuses while the
 * tree still lists the map; the disk here refuses the same way). Undo and redo write the files back and take them
 * away again, byte for byte, and refuse, changing nothing, when a file is no longer what the step left there, so an
 * edited map is never silently deleted or written over. A write that fails partway leaves the tree, the files and
 * the history as they were, putting back only what it touched. When even that fails, nothing is lost: the step
 * stays in the history holding every file, the tree never lists a map whose file is missing, the outcome is an
 * alarm, and moving the step again once the disk recovers finishes the job. A stray file the tree does not list is
 * never written over.
 *
 * The disk holds five maps whose files all differ, in a tree with a branch two deep and a free slot (4).
 */
describe('MapTreeService', () =>
{
  /**
   * A map file told apart by its display name and tileset.
   * @param {number} mapId The map.
   * @returns {RmmzMap} The file.
   */
  const fileFor = (mapId: number): RmmzMap => ({ ...buildMapJson(), displayName: `file ${mapId}`, tilesetId: mapId + 10 });

  /**
   * Writes a map file's text with its keys in reverse order, the way no writer of ours would: a text that comes back
   * exactly can only have been kept, never rebuilt.
   * @param {RmmzMap} map The map.
   * @returns {string} The text.
   */
  const oddText = (map: RmmzMap): string =>
  {
    const reversed = Object.fromEntries(Object.entries(map).reverse());
    return JSON.stringify(reversed, null, 1);
  };

  /**
   * An in-memory project behind a stand-in server that keeps the real routes' rules: 404 for a missing map, no
   * removing a map the tree still lists, a restore only where no file is, and a save of unchanged content keeping
   * the file's text as it was.
   * @returns {object} The server, its files, their texts and the tree, a log of its writes, and switches to make writes fail.
   */
  const buildDisk = () =>
  {
    const maps = new Map<number, RmmzMap>([ 1, 2, 3, 5, 6 ].map(id => [ id, fileFor(id) ]));
    const texts = new Map<number, string>([ ...maps.entries() ].map(([ id, map ]) => [ id, oddText(map) ]));
    const state = { infos: buildTreeRows() };
    const writes: string[] = [];
    const failing = new Set<string>();
    const missing = (mapId: number) => new MapEditorApiError(`GET /api/maps/${mapId} answered 404`, 404);

    /**
     * Fails a write when the test asked it to.
     * @param {string} write The write, as the log names it.
     */
    const maybeFail = (write: string) =>
    {
      writes.push(write);
      if (failing.has(write))
      {
        throw new MapEditorApiError('the disk is full', 500);
      }
    };

    const api = {
      clientId: 'window-a',
      loadMap: async (mapId: number) =>
      {
        const map = maps.get(mapId);
        if (map === undefined)
        {
          throw missing(mapId);
        }

        return structuredClone(map);
      },
      loadMapFile: async (mapId: number) => texts.get(mapId) ?? null,
      saveMap: async (mapId: number, map: RmmzMap) =>
      {
        maybeFail(`write ${mapId}`);
        if (jsonEquals(maps.get(mapId), map) === false)
        {
          texts.set(mapId, JSON.stringify(map));
        }

        maps.set(mapId, structuredClone(map));
      },
      restoreMapFile: async (mapId: number, text: string) =>
      {
        maybeFail(`restore ${mapId}`);
        if (maps.has(mapId))
        {
          throw new MapEditorApiError(`data/Map${mapId}.json already exists; only a removed map can be restored`, 409);
        }

        maps.set(mapId, JSON.parse(text) as RmmzMap);
        texts.set(mapId, text);
      },
      deleteMap: async (mapId: number) =>
      {
        maybeFail(`delete ${mapId}`);
        if (state.infos[mapId] !== null && state.infos[mapId] !== undefined)
        {
          throw new MapEditorApiError(`map ${mapId} is still in the map tree`, 409);
        }

        texts.delete(mapId);
        if (maps.delete(mapId) === false)
        {
          throw missing(mapId);
        }
      },
      loadMapInfos: async () => structuredClone(state.infos),
      saveMapInfos: async (infos: readonly (RmmzMapInfo | null)[]) =>
      {
        writes.push('write tree');
        if (failing.has('write tree'))
        {
          throw new MapEditorApiError('the disk is full', 500);
        }

        state.infos = structuredClone([ ...infos ]);
      },
    } as unknown as MapEditorApi;

    return { api, maps, texts, state, writes, failing };
  };

  /**
   * A tree service over a real hub and the disk above.
   * @returns {object} The service, the hub and the disk.
   */
  const buildService = () =>
  {
    const disk = buildDisk();
    const hub = new DocumentHub({ clientId: 'window-a', store: apiDocumentStore(disk.api), now: () => 1000 });
    const service = new MapTreeService({ hub, api: disk.api, openDocument: key => hub.load(key) });
    return { service, hub, ...disk };
  };

  /**
   * Reads the names of the steps in the tree history, done ones first.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} "label" for done steps and "(label)" for undone ones.
   */
  const historyOf = (hub: DocumentHub): string[] =>
  {
    return hub.history(TREE_HISTORY_KEY).rows.map(row => (row.done ? row.label : `(${row.label})`));
  };

  /**
   * Unwraps a successful outcome, failing the test with the message otherwise.
   * @param {TreeOutcome} outcome The outcome.
   * @returns {object} The outcome's step and selection.
   */
  const succeeded = (outcome: TreeOutcome) =>
  {
    if (outcome.ok === false)
    {
      throw new Error(outcome.message);
    }

    return outcome;
  };

  describe('creating', () =>
  {
    it('writes the new map\'s file with its parent\'s tileset, then the tree, as one step', async () =>
    {
      // Arrange.
      const { service, hub, maps, state, writes } = buildService();

      // Act.
      const outcome = succeeded(await service.create(2));

      // Assert.
      expect([ outcome.selection, historyOf(hub), writes ])
        .toStrictEqual([ [ 4 ], [ 'Create "MAP004"' ], [ 'write 4', 'write tree' ] ]);
      expect([ maps.get(4)?.tilesetId, maps.get(4)?.width, state.infos[4]?.parentId, hub.isDirty('mapinfos') ])
        .toStrictEqual([ 12, 17, 2, false ]);
    });

    it('round-trips through undo and redo, file and row together', async () =>
    {
      // Arrange.
      const { service, maps, state } = buildService();
      await service.create(TREE_ROOT);
      const created = structuredClone(maps.get(4));

      // Act.
      const undone = succeeded(await service.undo());
      const afterUndo = [ maps.has(4), structuredClone(state.infos) ];
      const redone = succeeded(await service.redo());

      // Assert.
      expect([ undone.selection, afterUndo ])
        .toStrictEqual([ [], [ false, buildTreeRows() ] ]);
      expect([ redone.selection, maps.get(4), state.infos[4]?.name, maps.get(4)?.tilesetId ])
        .toStrictEqual([ [ 4 ], created, 'MAP004', 1 ]);
    });

    it('has the new map\'s file on disk before its row appears in the tree, and again when a redo brings it back', async () =>
    {
      // Arrange: note whether the file is there each time the row appears.
      const { service, hub, maps } = buildService();
      await service.tree();
      const seen: [ string, boolean ][] = [];
      hub.subscribe(event =>
      {
        if (event.type === 'committed' || event.type === 'redone')
        {
          seen.push([ event.type, maps.has(4) ]);
        }
      });

      // Act.
      succeeded(await service.create(TREE_ROOT));
      succeeded(await service.undo());
      succeeded(await service.redo());

      // Assert.
      expect(seen)
        .toStrictEqual([ [ 'committed', true ], [ 'redone', true ] ]);
    });

    it('passes over a free id whose file already exists, leaving that stray file alone', async () =>
    {
      // Arrange: a map file the tree does not list sits in slot 4.
      const { service, maps } = buildService();
      maps.set(4, fileFor(40));

      // Act.
      const outcome = succeeded(await service.create(TREE_ROOT));

      // Assert.
      expect([ outcome.selection, maps.get(4)?.displayName, maps.get(7)?.width ])
        .toStrictEqual([ [ 7 ], 'file 40', 17 ]);
    });

    it('refuses to undo when the new map has been edited since, and changes nothing', async () =>
    {
      // Arrange: the new map is open here with an unsaved edit.
      const { service, hub, maps, state } = buildService();
      await service.create(TREE_ROOT);
      await hub.load('map:4');
      hub.edit('Rename map', [ mapHistoryKey(4) ], tx => tx.set('map:4', [ 'displayName' ], 'Mine'));

      // Act.
      const outcome = await service.undo();

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, message: '"Create "MAP004"" cannot undo: map 4 has changed since, and those changes would be lost.' });
      expect([ maps.has(4), state.infos[4]?.name, historyOf(hub) ])
        .toStrictEqual([ true, 'MAP004', [ 'Create "MAP004"' ] ]);
    });
  });

  describe('renaming and moving', () =>
  {
    it('renames through the tree alone, and undoes back to the old name', async () =>
    {
      // Arrange.
      const { service, hub, state, writes } = buildService();

      // Act.
      succeeded(await service.rename(5, 'Crystal Cave'));
      const renamed = state.infos[5]?.name;
      succeeded(await service.undo());

      // Assert.
      expect([ renamed, state.infos[5]?.name, writes, historyOf(hub) ])
        .toStrictEqual([ 'Crystal Cave', 'Cave', [ 'write tree', 'write tree' ], [ '(Rename "Cave" to "Crystal Cave")' ] ]);
    });

    it('records nothing for a rename to the same name', async () =>
    {
      // Arrange.
      const { service, hub, writes } = buildService();

      // Act.
      const outcome = succeeded(await service.rename(5, 'Cave'));

      // Assert.
      expect([ outcome.step, historyOf(hub), writes ])
        .toStrictEqual([ null, [], [] ]);
    });

    it('nests a branch under another map, and undoes to the tree exactly as it was', async () =>
    {
      // Arrange.
      const { service, state } = buildService();

      // Act.
      succeeded(await service.move([ 2 ], { parentId: 6, beforeId: null }));
      const moved = [ state.infos[2]?.parentId, state.infos[3]?.order ];
      succeeded(await service.undo());

      // Assert.
      expect([ moved, state.infos ])
        .toStrictEqual([ [ 6, 5 ], buildTreeRows() ]);
    });

    it('refuses a move inside the map\'s own branch, recording nothing', async () =>
    {
      // Arrange.
      const { service, hub, writes } = buildService();

      // Act.
      const outcome = await service.move([ 1 ], { parentId: 3, beforeId: null });

      // Assert.
      expect([ outcome, historyOf(hub), writes ])
        .toStrictEqual([ { ok: false, message: 'A map cannot move inside itself.' }, [], [] ]);
    });
  });

  describe('deleting', () =>
  {
    it('takes the branch\'s rows out first, then its files, and lets the window go of the ones it held', async () =>
    {
      // Arrange: the town is open here.
      const { service, hub, maps, state, writes } = buildService();
      await hub.load('map:2');

      // Act.
      succeeded(await service.remove([ 2 ]));

      // Assert.
      expect([ writes, maps.has(2), maps.has(3), maps.has(5), state.infos[2], state.infos[3], hub.has('map:2') ])
        .toStrictEqual([ [ 'write tree', 'delete 2', 'delete 3' ], false, false, true, null, null, false ]);
    });

    it('writes every file back on undo, byte for byte as it was, and takes them away again on redo', async () =>
    {
      // Arrange.
      const { service, hub, maps, texts, state, writes } = buildService();
      await service.remove([ 2 ]);
      writes.length = 0;

      // Act.
      const undone = succeeded(await service.undo());
      const afterUndo = [ texts.get(2), texts.get(3), structuredClone(state.infos), [ ...writes ] ];
      succeeded(await service.redo());

      // Assert: the files come back as their own texts, key order and all.
      expect([ undone.selection, afterUndo ])
        .toStrictEqual([ [ 2, 3 ], [ oddText(fileFor(2)), oddText(fileFor(3)), buildTreeRows(), [ 'restore 2', 'restore 3', 'write tree' ] ] ]);
      expect([ maps.has(2), maps.has(3), historyOf(hub) ])
        .toStrictEqual([ false, false, [ 'Delete "Town" and 1 map inside' ] ]);
    });

    it('has every file of a branch back on disk before its rows reappear on undo, and takes the rows out first on redo', async () =>
    {
      // Arrange: note which files are there each time the rows move.
      const { service, hub, maps } = buildService();
      await service.remove([ 2 ]);
      const seen: [ string, boolean, boolean ][] = [];
      hub.subscribe(event =>
      {
        if (event.type === 'undone' || event.type === 'redone')
        {
          seen.push([ event.type, maps.has(2), maps.has(3) ]);
        }
      });

      // Act.
      succeeded(await service.undo());
      succeeded(await service.redo());

      // Assert.
      expect(seen)
        .toStrictEqual([ [ 'undone', true, true ], [ 'redone', true, true ] ]);
    });

    it('writes a file back from its content when the text read was not that same file', async () =>
    {
      // Arrange: the text on disk differs from the content handed out, as if it changed between the two reads.
      const { service, maps, texts, writes } = buildService();
      texts.set(6, oddText({ ...fileFor(6), displayName: 'changed between reads' }));
      await service.remove([ 6 ]);
      writes.length = 0;

      // Act.
      succeeded(await service.undo());

      // Assert.
      expect([ writes[0], maps.get(6) ])
        .toStrictEqual([ 'write 6', fileFor(6) ]);
    });

    it('keeps a held map\'s unsaved edits in what the undo writes back, from its content since its file is older', async () =>
    {
      // Arrange.
      const { service, hub, maps, writes } = buildService();
      await hub.load('map:5');
      hub.edit('Rename map', [ mapHistoryKey(5) ], tx => tx.set('map:5', [ 'displayName' ], 'Edited, never saved'));
      await service.remove([ 5 ]);
      writes.length = 0;

      // Act.
      succeeded(await service.undo());

      // Assert.
      expect([ maps.get(5)?.displayName, writes[0] ])
        .toStrictEqual([ 'Edited, never saved', 'write 5' ]);
    });

    it('writes a held map back byte for byte when it had no unsaved edits', async () =>
    {
      // Arrange.
      const { service, hub, texts } = buildService();
      await hub.load('map:5');
      await service.remove([ 5 ]);

      // Act.
      succeeded(await service.undo());

      // Assert.
      expect(texts.get(5))
        .toBe(oddText(fileFor(5)));
    });

    it('refuses to redo a delete once the map it would remove has been edited, and changes nothing', async () =>
    {
      // Arrange: the restored map was saved with a change.
      const { service, hub, maps, state } = buildService();
      await service.remove([ 5 ]);
      await service.undo();
      maps.set(5, { ...fileFor(5), displayName: 'Changed after the undo' });

      // Act.
      const outcome = await service.redo();

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, message: '"Delete "Cave"" cannot redo: map 5 has changed since, and those changes would be lost.' });
      expect([ maps.has(5), state.infos[5]?.name, historyOf(hub) ])
        .toStrictEqual([ true, 'Cave', [ '(Delete "Cave")' ] ]);
    });

    it('refuses to undo a delete when a file lands where the map was just after the check, rather than write over it', async () =>
    {
      // Arrange: the check finds no file for the cave, and one is written the moment it has looked.
      const { service, hub, api, maps, state } = buildService();
      await service.remove([ 5 ]);
      const loadMap = api.loadMap.bind(api);
      api.loadMap = (mapId: number) =>
      {
        const answer = loadMap(mapId);
        maps.set(5, fileFor(50));
        return answer;
      };

      // Act.
      const outcome = await service.undo();

      // Assert: the newcomer is untouched, and the delete is still done.
      expect([ outcome, maps.get(5)?.displayName, state.infos[5], historyOf(hub) ])
        .toStrictEqual([
          { ok: false, message: '"Delete "Cave"" cannot undo: map 5 has a file again, which it would write over.' },
          'file 50',
          null,
          [ 'Delete "Cave"' ],
        ]);
    });

    it('refuses to undo a delete when a file has appeared where the map was, rather than write over it', async () =>
    {
      // Arrange.
      const { service, maps } = buildService();
      await service.remove([ 5 ]);
      maps.set(5, fileFor(50));

      // Act.
      const outcome = await service.undo();

      // Assert.
      expect([ outcome, maps.get(5)?.displayName ])
        .toStrictEqual([ { ok: false, message: '"Delete "Cave"" cannot undo: map 5 has a file again, which it would write over.' }, 'file 50' ]);
    });
  });

  describe('copying, pasting and duplicating', () =>
  {
    it('pastes the files as they were when copied, and undoes the paste away', async () =>
    {
      // Arrange: the copied map changes after it was copied.
      const { service, hub, maps, state } = buildService();
      const copied = await service.copy([ 5 ]);
      maps.set(5, { ...fileFor(5), displayName: 'Changed after copying' });

      // Act.
      const pasted = succeeded(await service.paste(copied.ok ? copied.copies : [], 6));
      const afterPaste = [ maps.get(4)?.displayName, state.infos[4]?.name, state.infos[4]?.parentId ];
      succeeded(await service.undo());

      // Assert.
      expect([ pasted.selection, afterPaste, historyOf(hub) ])
        .toStrictEqual([ [ 4 ], [ 'file 5', 'Cave', 6 ], [ '(Paste "Cave")' ] ]);
      expect([ maps.has(4), state.infos ])
        .toStrictEqual([ false, buildTreeRows() ]);
    });

    it('refuses to copy a map with no file', async () =>
    {
      // Arrange.
      const { service, maps } = buildService();
      maps.delete(6);

      // Act.
      const outcome = await service.copy([ 6 ]);

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, message: 'Map 6 has no file.' });
    });

    it('duplicates a map right after itself, and undoes the copy away', async () =>
    {
      // Arrange.
      const { service, maps, state } = buildService();

      // Act.
      const outcome = succeeded(await service.duplicate([ 5 ]));
      const afterDuplicate = [ maps.get(4)?.displayName, state.infos[4]?.parentId, state.infos[4]?.order, state.infos[6]?.order ];
      succeeded(await service.undo());

      // Assert.
      expect([ outcome.selection, afterDuplicate, maps.has(4), state.infos ])
        .toStrictEqual([ [ 4 ], [ 'file 5', 1, 5, 6 ], false, buildTreeRows() ]);
    });
  });

  describe('failures', () =>
  {
    it('leaves the tree, the files and the history as they were when a new file cannot be written', async () =>
    {
      // Arrange.
      const { service, hub, maps, state, failing } = buildService();
      failing.add('write 4');

      // Act.
      const outcome = await service.create(TREE_ROOT);

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, message: '"Create "MAP004"" could not be saved: the disk is full' });
      expect([ maps.has(4), state.infos, hub.document('mapinfos').toJson(), historyOf(hub) ])
        .toStrictEqual([ false, buildTreeRows(), buildTreeRows(), [] ]);
    });

    it('puts removed files back when the tree cannot be written during a delete, leaving the file untouched', async () =>
    {
      // Arrange.
      const { service, hub, maps, texts, state, failing } = buildService();
      failing.add('write tree');

      // Act.
      const outcome = await service.remove([ 5 ]);

      // Assert: the file was never removed, so putting it back leaves its text exactly as it was.
      expect([ outcome.ok, maps.get(5), texts.get(5), state.infos, hub.document('mapinfos').toJson(), historyOf(hub) ])
        .toStrictEqual([ false, fileFor(5), oddText(fileFor(5)), buildTreeRows(), buildTreeRows(), [] ]);
    });

    it('puts back only the file it removed when a later file of the branch cannot be removed, then forgets the step', async () =>
    {
      // Arrange: the town's file goes, then the inn's cannot.
      const { service, hub, maps, texts, state, writes, failing } = buildService();
      failing.add('delete 3');

      // Act.
      const outcome = await service.remove([ 2 ]);

      // Assert: the town comes back byte for byte, the inn was never touched, and the tree lists both again.
      expect([ outcome, writes ])
        .toStrictEqual([
          { ok: false, message: '"Delete "Town" and 1 map inside" could not be saved: the disk is full' },
          [ 'write tree', 'delete 2', 'delete 3', 'restore 2', 'write tree' ],
        ]);
      expect([ texts.get(2), maps.get(3), state.infos, historyOf(hub) ])
        .toStrictEqual([ oddText(fileFor(2)), fileFor(3), buildTreeRows(), [] ]);
    });

    it('puts a removed file back over one written in its place meanwhile, since putting back is its whole job', async () =>
    {
      // Arrange: once the town's file is gone, something writes a file there, and then the inn's cannot be removed.
      const { service, hub, api, maps, state, failing } = buildService();
      failing.add('delete 3');
      const deleteMap = api.deleteMap.bind(api);
      api.deleteMap = async (mapId: number) =>
      {
        if (mapId === 3)
        {
          maps.set(2, fileFor(20));
        }

        return deleteMap(mapId);
      };

      // Act.
      const outcome = await service.remove([ 2 ]);

      // Assert.
      expect([ outcome.ok, maps.get(2), state.infos, historyOf(hub) ])
        .toStrictEqual([ false, fileFor(2), buildTreeRows(), [] ]);
    });

    it('keeps the step and never lists a missing map when a failed delete cannot be put back either', async () =>
    {
      // Arrange: the inn's file cannot be removed, and then the town's cannot be written back.
      const { service, hub, maps, state, failing } = buildService();
      failing.add('delete 3');
      failing.add('restore 2');

      // Act.
      const outcome = await service.remove([ 2 ]);

      // Assert: the town's only copy stays with the step, and the tree agrees with the disk about it.
      expect(outcome)
        .toStrictEqual({
          ok: false,
          alarm: true,
          message: '"Delete "Town" and 1 map inside" could not be saved: the disk is full. Putting it back failed too: map 2\'s file '
            + 'could not be written back (the disk is full). Nothing is lost: the map tree\'s history still holds every map it touched. '
            + 'Keep this window open, and undo or redo it once saving works again.',
        });
      expect([ maps.has(2), maps.has(3), state.infos[2], state.infos[3], hub.document('mapinfos').toJson(), historyOf(hub) ])
        .toStrictEqual([ false, true, null, null, state.infos, [ 'Delete "Town" and 1 map inside' ] ]);
    });

    it('brings a branch whose put-back failed back on undo once saving works, keeping the file still in place', async () =>
    {
      // Arrange: the double failure above, then the disk recovers.
      const { service, maps, texts, state, writes, failing } = buildService();
      failing.add('delete 3');
      failing.add('restore 2');
      await service.remove([ 2 ]);
      failing.clear();
      writes.length = 0;

      // Act.
      const outcome = succeeded(await service.undo());

      // Assert: the town is written back byte for byte; the inn, still there as it was, is left alone.
      expect([ outcome.selection, writes, texts.get(2), texts.get(3), maps.get(3), state.infos ])
        .toStrictEqual([ [ 2, 3 ], [ 'restore 2', 'write tree' ], oddText(fileFor(2)), oddText(fileFor(3)), fileFor(3), buildTreeRows() ]);
    });

    it('moves an undo back when its files cannot be written', async () =>
    {
      // Arrange.
      const { service, hub, maps, state, failing } = buildService();
      await service.remove([ 5 ]);
      failing.add('restore 5');

      // Act.
      const outcome = await service.undo();

      // Assert.
      expect([ outcome.ok, maps.has(5), state.infos[5], historyOf(hub) ])
        .toStrictEqual([ false, false, null, [ 'Delete "Cave"' ] ]);
    });

    it('refuses a plan the tree moved away from while it waited on the server', async () =>
    {
      // Arrange: reading the files for the delete gives another change time to land on the tree.
      const { service, hub, api, state } = buildService();
      await service.tree();
      const loadMap = api.loadMap.bind(api);
      api.loadMap = async (mapId: number) =>
      {
        hub.edit('Rename elsewhere', [ TREE_HISTORY_KEY ], tx => tx.set('mapinfos', [ 6, 'name' ], 'Elsewhere'));
        return loadMap(mapId);
      };

      // Act.
      const outcome = await service.remove([ 5 ]);

      // Assert.
      expect([ outcome, state.infos[5]?.name, historyOf(hub) ])
        .toStrictEqual([ { ok: false, message: 'The map tree changed while "Delete "Cave"" was being worked out; try it again.' }, 'Cave', [ 'Rename elsewhere' ] ]);
    });

    it('refuses a new map when the tree moves on while its file is written, and takes the file away again', async () =>
    {
      // Arrange: writing the new file gives another change time to land on the tree.
      const { service, hub, api, maps } = buildService();
      await service.tree();
      const saveMap = api.saveMap.bind(api);
      api.saveMap = async (mapId: number, map: RmmzMap) =>
      {
        hub.edit('Rename elsewhere', [ TREE_HISTORY_KEY ], tx => tx.set('mapinfos', [ 6, 'name' ], 'Elsewhere'));
        return saveMap(mapId, map);
      };

      // Act.
      const outcome = await service.create(TREE_ROOT);

      // Assert.
      expect([ outcome, maps.has(4), historyOf(hub) ])
        .toStrictEqual([ { ok: false, message: 'The map tree changed while "Create "MAP004"" was being worked out; try it again.' }, false, [ 'Rename elsewhere' ] ]);
    });

    it('refuses an undo when the tree moves on while its files are written, and takes the files away again', async () =>
    {
      // Arrange: writing the town back gives another change time to land on the tree.
      const { service, hub, api, maps, state } = buildService();
      await service.remove([ 5 ]);
      const restoreMapFile = api.restoreMapFile.bind(api);
      api.restoreMapFile = async (mapId: number, text: string) =>
      {
        hub.edit('Rename elsewhere', [ TREE_HISTORY_KEY ], tx => tx.set('mapinfos', [ 6, 'name' ], 'Elsewhere'));
        return restoreMapFile(mapId, text);
      };

      // Act.
      const outcome = await service.undo();

      // Assert: the rename is now the newest step, so the delete is not the one to undo.
      expect([ outcome, maps.has(5), state.infos[5], historyOf(hub) ])
        .toStrictEqual([
          { ok: false, message: 'The map tree changed while "Delete "Cave"" was being written; try it again.' },
          false,
          null,
          [ 'Delete "Cave"', 'Rename elsewhere' ],
        ]);
    });

    it('names the later edit that blocks an undo, and changes nothing', async () =>
    {
      // Arrange: a history of the tree's own document renames the new map after it was created.
      const { service, hub, maps } = buildService();
      await service.create(TREE_ROOT);
      hub.edit('Rename elsewhere', [ 'mapinfos' ], tx => tx.set('mapinfos', [ 4, 'name' ], 'Elsewhere'));

      // Act.
      const outcome = await service.undo();

      // Assert.
      expect([ outcome, maps.has(4) ])
        .toStrictEqual([ { ok: false, message: '"Create "MAP004"" cannot undo: "Rename elsewhere" changed the same maps since.' }, true ]);
    });

    it('says there is nothing to undo or redo in an empty tree history', async () =>
    {
      // Arrange.
      const { service } = buildService();

      // Act.
      const outcomes = [ await service.undo(), await service.redo() ];

      // Assert.
      expect(outcomes)
        .toStrictEqual([ { ok: false, message: 'Nothing to undo in the map tree.' }, { ok: false, message: 'Nothing to redo in the map tree.' } ]);
    });
  });

  describe('history jumps and queueing', () =>
  {
    it('jumps back before the first step and forward again, files and all', async () =>
    {
      // Arrange.
      const { service, hub, maps, state } = buildService();
      await service.create(TREE_ROOT);
      await service.rename(4, 'Well');
      await service.remove([ 6 ]);
      const [ first, second ] = hub.history(TREE_HISTORY_KEY).rows;

      // Act.
      succeeded(await service.jumpTo(null));
      const atStart = [ maps.has(4), maps.has(6), structuredClone(state.infos) ];
      succeeded(await service.jumpTo(second.id));

      // Assert.
      expect(atStart)
        .toStrictEqual([ false, true, buildTreeRows() ]);
      expect([ maps.has(4), maps.has(6), state.infos[4]?.name, hub.history(TREE_HISTORY_KEY).position, first.label ])
        .toStrictEqual([ true, true, 'Well', 2, 'Create "MAP004"' ]);
    });

    it('refuses a jump to a step the tree history does not hold', async () =>
    {
      // Arrange.
      const { service } = buildService();

      // Act.
      const outcome = await service.jumpTo('elsewhere#1');

      // Assert.
      expect(outcome)
        .toStrictEqual({ ok: false, message: 'That step is not in the map tree\'s history.' });
    });

    it('runs operations one behind another, each seeing the tree the last one left', async () =>
    {
      // Arrange.
      const { service, state } = buildService();

      // Act: both start before either finishes.
      const outcomes = await Promise.all([ service.create(TREE_ROOT), service.create(TREE_ROOT) ]);

      // Assert.
      expect([ outcomes.map(outcome => outcome.ok && outcome.selection), state.infos[4]?.order, state.infos[7]?.order ])
        .toStrictEqual([ [ [ 4 ], [ 7 ] ], 6, 7 ]);
    });
  });
});
