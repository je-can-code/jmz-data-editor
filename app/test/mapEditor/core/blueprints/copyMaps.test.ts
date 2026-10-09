import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { BlueprintCopyCounter } from '../../../../src/mapEditor/core/blueprints/blueprintCopies.ts';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { BLUEPRINT_USES_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { CopyMaps } from '../../../../src/mapEditor/core/blueprints/copyMaps.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import { storedUses } from '../../support/blueprintFixtures.ts';
import {
  a5,
  BLUEPRINT,
  campMap,
  eventOf,
  groundOf,
  MAP_HEIGHT,
  MAP_WIDTH,
  propagationWindow,
  settle,
  TEMPLATE_MAP,
  type PropagationWindow,
} from '../../support/propagationFixtures.ts';

/*
 * A window keeps the maps a change to one of its open blueprints may reach, as their files hold them, so every change is
 * planned for the disk by what the disk holds and never by a map's unsaved edits. The maps are every map the record
 * places the blueprint on and every map holding a copy of its events, here, elsewhere or on disk; never a map holding a
 * plugin's patterns, and never one whose file the server no longer has. A change waits, saying why, until each is known:
 * a map held here without unsaved edits is known from the map at once; any other is read from disk, never while a write
 * of this window's to it is on its way, which the read could miss.
 *
 * Each kept file follows every blueprint change, made, undone or redone, exactly as the writer writes it, so it is the
 * file as it will be once every write has landed; one that fits neither way is forgotten, and a change about to move
 * names it first. A failed write forgets the files it would have changed. A map's save keeps its file as the save left
 * it; a map let go of, or one whose file changed on disk by anything but this session, is read again. A map opened here
 * from a file this window wrote through takes up the steps that file holds, or, holding something else, has its file
 * forgotten.
 *
 * Maps 1, 2 and 3 each hold one placement of the blueprint at (1, 1), its guard as event 5 and its post as event 6; map 9
 * is J-ABS's action map. The window holds maps 1 and 2; map 3 is on disk.
 */
describe('CopyMaps', () =>
{
  /**
   * Paints the blueprint's top-left ground cell, as a stroke in its tab does.
   * @param {PropagationWindow} window The window.
   * @param {number} value The new tile.
   * @returns {HistoryStep} The step.
   */
  const paintBlueprint = (window: PropagationWindow, value: number): HistoryStep =>
  {
    return window.hub.edit('Paint', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
    {
      tx.tiles(window.blueprintKey, [ [ cellIndex(2, 2, 0, 0, 0), value ] ]);
    }) as HistoryStep;
  };

  /**
   * Renames the blueprint's guard, which every copy of it follows.
   * @param {PropagationWindow} window The window.
   * @returns {HistoryStep} The step.
   */
  const renameGuard = (window: PropagationWindow): HistoryStep =>
  {
    return window.hub.edit('Rename', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
    {
      tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain');
    }) as HistoryStep;
  };

  /**
   * Paints a cell of a held map by hand, well away from the placement.
   * @param {PropagationWindow} window The window.
   * @param {number} mapId The map.
   * @param {number} value The new tile.
   * @returns {HistoryStep} The step.
   */
  const paintByHand = (window: PropagationWindow, mapId: number, value: number): HistoryStep =>
  {
    return window.hub.edit('Paint by hand', [ mapHistoryKey(mapId) ], tx =>
    {
      tx.tiles(mapDocumentKey(mapId), [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 5, 5, 0), value ] ]);
    }) as HistoryStep;
  };

  /**
   * Keeps a second set of maps for the window, reading files as the test says.
   * @param {PropagationWindow} window The window.
   * @param {(mapId: number) => Promise<RmmzMap>} readMap Reads a map's file.
   * @returns {CopyMaps} The maps, started.
   */
  const keptWith = (window: PropagationWindow, readMap: (mapId: number) => Promise<RmmzMap>): CopyMaps =>
  {
    const maps = new CopyMaps({
      hub: window.hub,
      copies: window.counter,
      holders: () => [],
      onHoldingChange: () => () => undefined,
      openDocument: async key => window.hub.document(key),
      readMap,
      templates: { revision: 1, listProblem: null, templateMapOf: mapId => (mapId === TEMPLATE_MAP ? { owner: 'J-ABS', holds: 'action templates' } : null) },
    });
    maps.start();
    return maps;
  };

  /**
   * Reads files only when the test lets each one land.
   * @returns {{ readMap: (mapId: number) => Promise<RmmzMap>, pending: { mapId: number, land: () => void }[] }} The
   * reader, and the reads on their way, oldest first, each landing the map's file as the fixture has it.
   */
  const heldUpReads = () =>
  {
    const pending: { readonly mapId: number; readonly land: () => void }[] = [];
    const readMap = (mapId: number): Promise<RmmzMap> => new Promise(resolve =>
    {
      pending.push({ mapId, land: () => resolve(campMap()) });
    });
    return { readMap, pending };
  };

  /**
   * Reads a kept file, which the test knows is kept.
   * @param {PropagationWindow} window The window.
   * @param {number} mapId The map.
   * @returns {MapDocument} The file.
   */
  const fileOf = (window: PropagationWindow, mapId: number): MapDocument => window.maps.file(mapId) as MapDocument;

  describe('mapsWithCopies', () =>
  {
    it('lists every map placing the blueprint or holding a copy of its events, held or on disk, and no plugin\'s map', async () =>
    {
      // Arrange: the record placing it on map 1 alone; maps 2 and 3 hold copies of its events all the same, and map 4 a
      // copy of another blueprint's.
      const window = await propagationWindow({ spots: [ { blueprintId: BLUEPRINT, mapId: 1, x: 1, y: 1 } ] });
      const other = campMap();
      other.events[5] = { ...(other.events[5] as RmmzMapEvent), note: withBlueprintLink('', { blueprintId: 'zz11zz11', eventId: 1, differences: [] }) };
      other.events[6] = null;
      window.disk.set(4, other);
      window.counter.readAgain();
      await settle();

      // Act.
      const mapIds = window.maps.mapsWithCopies(BLUEPRINT);

      // Assert.
      expect(mapIds)
        .toStrictEqual([ 1, 2, 3 ]);
    });

    it('leaves out a map whose file the server no longer has, once a read finds it gone, so a change can go ahead', async () =>
    {
      // Arrange: map 3's file deleted outside the editor.
      const window = await propagationWindow();
      window.disk.delete(3);

      // Act.
      window.maps.fileChanged('data/Map003.json', false);
      await settle();

      // Assert.
      expect([ window.maps.mapsWithCopies(BLUEPRINT), window.maps.readiness(BLUEPRINT), window.reads ])
        .toStrictEqual([ [ 1, 2 ], null, [ 3, 3 ] ]);
    });

    it('still lists the maps holding copies when the record cannot be read, and reads no placement from it', async () =>
    {
      // Arrange: a record holding a list where its maps should be.
      const window = await propagationWindow();
      window.hub.release(BLUEPRINT_USES_DOCUMENT);
      window.hub.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });

      // Act.
      const found = [ window.maps.mapsWithCopies(BLUEPRINT), window.maps.fileSpots(1, BLUEPRINT) ];

      // Assert.
      expect(found)
        .toStrictEqual([ [ 1, 2, 3 ], [] ]);
    });
  });

  describe('readiness', () =>
  {
    it('refuses a change while the copies on disk cannot be counted, in a window with a disk to count them on', async () =>
    {
      // Arrange: notes that cannot be read, in a window reading map files and in one with no disk at all; the record
      // places the blueprint on the maps held here alone.
      const window = await propagationWindow({ spots: [ { blueprintId: BLUEPRINT, mapId: 1, x: 1, y: 1 } ] });
      const counter = new BlueprintCopyCounter({ hub: window.hub, readNotes: () => Promise.reject(new Error('the notes could not be read')) });
      counter.start();
      await counter.settled();
      const kept = (readMap: ((mapId: number) => Promise<RmmzMap>) | null) => new CopyMaps({
        hub: window.hub,
        copies: counter,
        holders: () => [],
        onHoldingChange: () => () => undefined,
        openDocument: key => Promise.resolve(window.hub.document(key)),
        readMap,
        templates: { revision: 1, listProblem: null, templateMapOf: () => null },
      });

      // Act.
      const answers = [ kept(async () => campMap()).readiness(BLUEPRINT), kept(null).readiness(BLUEPRINT) ];

      // Assert: the window with no disk reaches what it holds, which is all there is to reach.
      expect(answers)
        .toStrictEqual([ 'This blueprint can\'t change while its copies on disk can\'t be counted.', null ]);
    });

    it('says why the plugin list could not be read while a map holds a copy, and lets a blueprint with none through', async () =>
    {
      // Arrange: a window whose plugin list failed to read, and a second blueprint that nothing copies.
      const window = await propagationWindow();
      const unread = new CopyMaps({
        hub: window.hub,
        copies: window.counter,
        holders: () => [],
        onHoldingChange: () => () => undefined,
        openDocument: () => Promise.reject(new Error('nothing opens here')),
        readMap: null,
        templates: { revision: 0, listProblem: 'js/plugins.js is missing', templateMapOf: () => null },
      });

      // Act.
      const answers = [ unread.readiness(BLUEPRINT), unread.readiness('zz11zz11') ];

      // Assert.
      expect(answers)
        .toStrictEqual([ 'This blueprint can\'t change while the project\'s plugin list can\'t be read (js/plugins.js is missing).', null ]);
    });
  });

  describe('files', () =>
  {
    it('knows a held map\'s file from the map itself, reading only the file of a map nobody holds', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const files = [ fileOf(window, 1).toJson(), fileOf(window, 3).toJson(), window.maps.file(4) ];

      // Assert: map 4 holds nothing of the blueprint, so nothing keeps it.
      expect([ files, window.reads ])
        .toStrictEqual([ [ window.hub.map('map:1').toJson(), window.disk.get(3), null ], [ 3 ] ]);
    });

    it('keeps a map\'s file as a save left it: the map with every step since the save taken back out', async () =>
    {
      // Arrange: two edits by hand on map 1, the first saved by something outside the hub.
      const window = await propagationWindow();
      const saved = paintByHand(window, 1, a5(20));
      paintByHand(window, 1, a5(21));

      // Act.
      window.hub.noteSaved('map:1', [ saved.id ]);

      // Assert.
      expect([ groundOf(fileOf(window, 1), 5, 5), groundOf(window.hub.map('map:1'), 5, 5) ])
        .toStrictEqual([ a5(20), a5(21) ]);
    });

    it('forgets a map\'s file when a save leaves it holding steps the map does not', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      paintByHand(window, 1, a5(20));

      // Act.
      window.hub.noteSaved('map:1', [ 'a step from elsewhere' ]);

      // Assert: map 2 keeps its file.
      expect([ window.maps.file(1), window.maps.file(2) === null ])
        .toStrictEqual([ null, false ]);
    });

    it('forgets the file of a map let go of, and reads it from disk instead', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      window.hub.release('map:2');
      const forgotten = window.maps.file(2);
      await settle();

      // Assert.
      expect([ forgotten, window.maps.file(1) === null, window.reads, fileOf(window, 2).toJson() ])
        .toStrictEqual([ null, false, [ 3, 2 ], window.disk.get(2) ]);
    });

    it('takes the record\'s placements as they stand for a map whose file holds a step undone here since', async () =>
    {
      // Arrange: an edit by hand on map 1, saved, then undone.
      const window = await propagationWindow();
      const saved = paintByHand(window, 1, a5(20));
      window.hub.noteSaved('map:1', [ saved.id ]);
      window.hub.undo(mapHistoryKey(1));

      // Act.
      const spots = window.maps.fileSpots(1, BLUEPRINT);

      // Assert.
      expect([ window.hub.isDirty('map:1'), spots ])
        .toStrictEqual([ true, [ { blueprintId: BLUEPRINT, x: 1, y: 1 } ] ]);
    });

    it('gathers a map the record newly places the blueprint on, reading its file', async () =>
    {
      // Arrange: map 4 on disk, holding the blueprint's tiles where a placement is about to be recorded.
      const window = await propagationWindow();
      window.disk.set(4, campMap());

      // Act.
      window.hub.edit('Place', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
      {
        const { data } = storedUses([ { blueprintId: BLUEPRINT, mapId: 4, x: 1, y: 1 } ]) as { data: { maps: Record<string, JsonValue> } };
        tx.set(BLUEPRINT_USES_DOCUMENT, [ 'data', 'maps', '4' ], data.maps['4']);
      });
      await settle();

      // Assert.
      expect([ window.reads, window.maps.file(4) === null ])
        .toStrictEqual([ [ 3, 4 ], false ]);
    });
  });

  describe('follow', () =>
  {
    it('moves the kept files through a change to the copies\' events, made and undone, saying what each file takes', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      const step = renameGuard(window);

      // Act.
      const taken = window.maps.follow(step, 'forward', false);
      const afterMade = [ eventOf(fileOf(window, 1), 5).name, eventOf(fileOf(window, 3), 5).name ];
      window.maps.follow(step, 'backward', false);

      // Assert: the posts, which the change did not touch, stay.
      expect([
        [ ...taken.keys() ],
        taken.get(3),
        afterMade,
        eventOf(fileOf(window, 1), 5).name,
        eventOf(fileOf(window, 3), 5).name,
        eventOf(fileOf(window, 3), 6).name,
      ])
        .toStrictEqual([
          [ 1, 2, 3 ],
          step.entries.filter(entry => entry.document === 'map:3').map(entry => entry.patch),
          [ 'Captain', 'Captain' ],
          'Guard',
          'Guard',
          'Post',
        ]);
    });

    it('takes no step but a change to a blueprint, which reaches no file', async () =>
    {
      // Arrange: an edit by hand on map 1, and a change to the blueprint.
      const window = await propagationWindow();
      const byHand = paintByHand(window, 1, a5(20));
      const change = paintBlueprint(window, a5(9));

      // Act.
      const taken = [ window.maps.follow(byHand, 'forward', false).size, window.maps.follow(change, 'forward', false).size ];

      // Assert: map 1's file never took the paint by hand, its cell still blank.
      expect([ taken, window.maps.misfit(byHand, 'forward'), groundOf(fileOf(window, 1), 5, 5) ])
        .toStrictEqual([ [ 0, 3 ], null, 0 ]);
    });

    it('names a kept file that holds neither way a change reaches it, then forgets it, handing on the first way', async () =>
    {
      // Arrange: the change made, then map 3's copy painted over on disk and its file read again.
      const window = await propagationWindow();
      const step = paintBlueprint(window, a5(9));
      (window.disk.get(3) as RmmzMap).data[cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0)] = a5(20);
      window.maps.fileChanged('data/Map003.json', false);
      await settle();

      // Act.
      const misfit = window.maps.misfit(step, 'forward');
      const taken = window.maps.follow(step, 'forward', false);

      // Assert: the held maps fit, so only map 3 is named.
      expect([ misfit, window.maps.file(3), taken.get(3), window.maps.misfit(step, 'backward') ])
        .toStrictEqual([ 3, null, step.entries.filter(entry => entry.document === 'map:3').map(entry => entry.patch), null ]);
    });

    it('reads a file changed on disk again only once this window\'s write to it has landed, which the read could miss', async () =>
    {
      // Arrange: the change on its way to disk.
      const window = await propagationWindow();
      const step = paintBlueprint(window, a5(9));
      window.maps.follow(step, 'forward', true);

      // Act.
      window.maps.fileChanged('data/Map003.json', false);
      await settle();
      const waiting = [ window.maps.readiness(BLUEPRINT), [ ...window.reads ] ];
      window.maps.landed([ 3 ], true);
      await settle();

      // Assert.
      expect([ waiting, window.reads, window.maps.file(3) === null ])
        .toStrictEqual([
          [ 'This blueprint can\'t change until Map 3, which holds a copy, has been read; try again in a moment.', [ 3 ] ],
          [ 3, 3 ],
          false,
        ]);
    });

    it('forgets the files a failed write would have changed, and reads them again', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      const step = paintBlueprint(window, a5(9));
      window.maps.follow(step, 'forward', true);

      // Act.
      window.maps.landed([ 3 ], false);
      const forgotten = window.maps.file(3);
      await settle();

      // Assert: read afresh, the file holds what the disk does, which the failed write never reached.
      expect([ forgotten, window.reads, groundOf(fileOf(window, 3), 1, 1) ])
        .toStrictEqual([ null, [ 3, 3 ], a5(1) ]);
    });

    it('drops a read that lands after a write to its map started, reading again once the write has landed', async () =>
    {
      // Arrange: a second set of maps whose read of map 3 is held up while the change starts on its way.
      const window = await propagationWindow();
      const { readMap, pending } = heldUpReads();
      const maps = keptWith(window, readMap);
      const step = paintBlueprint(window, a5(9));
      maps.follow(step, 'forward', true);

      // Act.
      pending[0].land();
      await settle();
      const dropped = [ maps.file(3), pending.length ];
      maps.landed([ 3 ], true);
      await settle();
      pending[1].land();
      await settle();

      // Assert.
      expect([ dropped, pending.map(read => read.mapId), maps.file(3) === null ])
        .toStrictEqual([ [ null, 1 ], [ 3, 3 ], false ]);
    });

    it('never takes a map whose read failed for any reason but a missing file for gone', async () =>
    {
      // Arrange: a second set of maps whose reads the server fails.
      const window = await propagationWindow();
      const maps = keptWith(window, () => Promise.reject(new MapEditorApiError('GET /api/maps/3 answered 500', 500, 'the disk is busy')));
      await settle();

      // Act.
      const found = [ maps.mapsWithCopies(BLUEPRINT), maps.readiness(BLUEPRINT) ];

      // Assert.
      expect(found)
        .toStrictEqual([ [ 1, 2, 3 ], 'This blueprint can\'t change until Map 3, which holds a copy, has been read; try again in a moment.' ]);
    });
  });

  describe('fileChanged', () =>
  {
    it('reads a kept file again when it changes on disk, unless this session wrote it or the window holds the map', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act: a write of this session's, a held map, a file no map is, then a change from outside.
      window.maps.fileChanged('data/Map003.json', true);
      window.maps.fileChanged('data/Map001.json', false);
      window.maps.fileChanged('data/Tilesets.json', false);
      await settle();
      const before = [ ...window.reads ];
      window.maps.fileChanged('data/Map003.json', false);
      await settle();

      // Assert.
      expect([ before, window.reads ])
        .toStrictEqual([ [ 3 ], [ 3, 3 ] ]);
    });
  });

  describe('maps opened from a file this window wrote', () =>
  {
    it('forgets the file of a map opened from a file holding something other than the steps written through to it', async () =>
    {
      // Arrange: the change written through to map 3, then map 3 opened from a file that never took it.
      const window = await propagationWindow();
      const step = paintBlueprint(window, a5(9));
      window.maps.follow(step, 'forward', true);

      // Act.
      window.hub.adopt('map:3', campMap() as unknown as JsonValue);

      // Assert.
      expect([ window.maps.file(3), window.hub.history(mapHistoryKey(3)).rows ])
        .toStrictEqual([ null, [] ]);
    });
  });
});
