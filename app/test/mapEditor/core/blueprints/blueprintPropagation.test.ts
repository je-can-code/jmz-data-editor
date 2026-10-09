import { describe, expect, it } from 'vitest';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import {
  BLUEPRINT_MAP_CONFLICTED,
  BLUEPRINT_MAP_STALE,
  BLUEPRINTS_NOT_HELD,
  ONE_BLUEPRINT_AT_A_TIME,
} from '../../../../src/mapEditor/core/blueprints/blueprintPropagation.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, savedBlueprintOf } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { CopyMaps } from '../../../../src/mapEditor/core/blueprints/copyMaps.ts';
import { blueprintHistoryKey, eventHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { HistoryStep } from '../../../../src/mapEditor/core/history/HistoryStep.ts';
import { blueprintMapKey, mapDocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { cellIndex } from '../../../../src/mapEditor/core/tiles/tileGrid.ts';
import {
  a5,
  BLUEPRINT,
  campStamp,
  eventOf,
  groundOf,
  guardPage,
  MAP_HEIGHT,
  MAP_WIDTH,
  propagationWindow,
  settle,
  TEMPLATE_MAP,
  type PropagationWindow,
} from '../../support/propagationFixtures.ts';

/*
 * Every change to a blueprint reaches every copy of it, on every map, as one step: the copies' change is part of the very
 * step that changed the blueprint, whatever tool made it, so one undo takes back all of it, from the blueprint's tab or
 * from any map the step reached. Each copy is reached by the fields the change moved and no more, and the maps follow the
 * step, so a copy, or a cell, changed there since keeps that change when the step is undone, the rest going back, and an
 * edit to some other field of a copy is no hindrance at all; only the blueprint's own content refuses, saying why. A map
 * held in the window takes the change in place, on top of its unsaved edits; a map held with unsaved edits has its file
 * planned apart, so the copies on disk follow by what the disk holds and never by the unsaved edits; a map nobody has open is
 * planned against its file, and the step writes it through. The blueprints keep the blueprint's new content in the same
 * step. A map holding a plugin's patterns is never touched, whatever names it, and a change waits, refused with why, while
 * what it would be planned against is still being found or read. Edits to anything else pass untouched.
 *
 * Maps 1, 2 and 3 each hold one placement of the blueprint at (1, 1), its guard as event 5 and its post as event 6; map 9
 * is J-ABS's action map, which a stray placement and a stray link name. The window holds maps 1 and 2; map 3 is on disk.
 */
describe('blueprintPropagationCheck', () =>
{
  /**
   * The flat index of a cell of the blueprint, on its ground layer.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {number} The index.
   */
  const blueprintCell = (x: number, y: number): number => cellIndex(2, 2, x, y, 0);

  /**
   * Paints cells of the blueprint's ground, as a stroke in its tab does.
   * @param {PropagationWindow} window The window.
   * @param {readonly [ number, number, number ][]} cells Each cell's column, row and new tile.
   * @returns {HistoryStep | null} The step.
   */
  const paintBlueprint = (window: PropagationWindow, cells: readonly [ number, number, number ][]): HistoryStep | null =>
  {
    return window.hub.edit('Paint', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
    {
      tx.tiles(window.blueprintKey, cells.map(([ x, y, value ]) => [ blueprintCell(x, y), value ] as const));
    });
  };

  /**
   * Reads a held map.
   * @param {PropagationWindow} window The window.
   * @param {number} mapId The map.
   * @returns {MapDocument} The map.
   */
  const mapIn = (window: PropagationWindow, mapId: number): MapDocument => window.hub.map(mapDocumentKey(mapId));

  /**
   * Applies a step's patches on one map to a copy of that map's file on disk, as writing it through would.
   * @param {PropagationWindow} window The window.
   * @param {HistoryStep} step The step.
   * @param {number} mapId The map.
   * @returns {MapDocument} The file as the step leaves it.
   */
  const fileAfter = (window: PropagationWindow, step: HistoryStep, mapId: number): MapDocument =>
  {
    const key = mapDocumentKey(mapId);
    const file = MapDocument.fromJson(key, structuredClone(window.disk.get(mapId) as RmmzMap));
    const version = step.fileVersions?.find(each => each.document === key);
    const patches = version === undefined ? step.entries.filter(entry => entry.document === key).map(entry => entry.patch) : version.patches;
    patches.forEach(patch => file.apply(patch));
    return file;
  };

  describe('reaching every copy', () =>
  {
    it('carries a stroke to every placement in one step, joining the blueprint\'s history and every map\'s it reached', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;

      // Assert.
      expect([ step.histories, step.through, [ ...new Set(step.entries.map(entry => entry.document)) ] ])
        .toStrictEqual([
          [ 'blueprint:k3x9q2mf', 'map:1', 'map:2', 'map:3' ],
          [ 'map:3' ],
          [ 'blueprint-map:k3x9q2mf', 'editor-data:blueprints', 'map:1', 'map:2', 'map:3' ],
        ]);
    });

    it('marks every map the change reached as following it, held or written through, and neither the blueprint nor the blueprints', async () =>
    {
      // Arrange: the action map held here too, which the change never reaches.
      const window = await propagationWindow({ held: [ 1, 2, TEMPLATE_MAP ] });

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;

      // Assert.
      expect(step.followers)
        .toStrictEqual([ 'map:1', 'map:2', 'map:3' ]);
    });

    it('repaints the maps held here in place, writes the map nobody has open through to its file, and keeps the blueprint', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;
      const kept = blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT);

      // Assert: the cell beside the one painted follows nowhere.
      expect([
        groundOf(mapIn(window, 1), 1, 1),
        groundOf(mapIn(window, 2), 1, 1),
        groundOf(fileAfter(window, step, 3), 1, 1),
        groundOf(fileAfter(window, step, 3), 2, 1),
        kept?.stamp.tiles?.values,
      ])
        .toStrictEqual([ a5(9), a5(9), a5(9), a5(2), [ a5(9), a5(2), a5(3), a5(4) ] ]);
    });

    it('carries a change to an event\'s fields to every copy of it, and to no copy of another event', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = window.hub.edit('Retitle', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
      {
        tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain');
        tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4);
      }) as HistoryStep;

      // Assert: the posts, 6, and the plain event, 7, are untouched.
      expect([ mapIn(window, 1), mapIn(window, 2), fileAfter(window, step, 3) ].map(map => [ eventOf(map, 5).name, eventOf(map, 5).pages[0].moveSpeed, eventOf(map, 6).name, eventOf(map, 7).name ]))
        .toStrictEqual([ [ 'Captain', 4, 'Post', 'EV007' ], [ 'Captain', 4, 'Post', 'EV007' ], [ 'Captain', 4, 'Post', 'EV007' ] ]);
    });

    it('plans the file of a map held with unsaved edits apart, so its copies on disk follow while the map keeps its own', async () =>
    {
      // Arrange: map 2's copy painted over by hand and its guard sped up, neither saved.
      const window = await propagationWindow();
      window.hub.edit('Paint', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 2, 1, 0), a5(7) ] ]));
      window.hub.edit('Speed', [ mapHistoryKey(2) ], tx => tx.set('map:2', [ 'events', 5, 'pages', 0, 'moveSpeed' ], 5));

      // Act.
      const step = window.hub.edit('Change', [ blueprintHistoryKey(BLUEPRINT) ], tx =>
      {
        tx.tiles(window.blueprintKey, [ [ blueprintCell(1, 0), a5(8) ] ]);
        tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4);
      }) as HistoryStep;
      const file = fileAfter(window, step, 2);

      // Assert: on the map the painted cell stays and the guard keeps its lead; on disk both follow.
      expect([ groundOf(mapIn(window, 2), 2, 1), eventOf(mapIn(window, 2), 5).pages[0].moveSpeed, groundOf(file, 2, 1), eventOf(file, 5).pages[0].moveSpeed, step.fileVersions?.map(each => each.document) ])
        .toStrictEqual([ a5(7), 6, a5(8), 4, [ 'map:2' ] ]);
    });

    it('records no separate file for a map held without unsaved edits, whose file takes the map\'s own change', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;

      // Assert.
      expect('fileVersions' in step)
        .toBe(false);
    });

    it('never touches a map holding a plugin\'s patterns, held here or not, whatever placement or link names it', async () =>
    {
      // Arrange: the action map held here this time, with its stray copy and stray placement.
      const window = await propagationWindow({ held: [ 1, 2, TEMPLATE_MAP ] });
      const before = mapIn(window, TEMPLATE_MAP).toJson();

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;

      // Assert.
      expect([ mapIn(window, TEMPLATE_MAP).toJson(), step.histories.includes(mapHistoryKey(TEMPLATE_MAP)), step.entries.some(entry => entry.document === 'map:9') ])
        .toStrictEqual([ before, false, false ]);
    });

    it('keeps an event moved inside the blueprint in the blueprints alone, since where a copy stands is never linked', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = window.hub.edit('Move', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 2, 'x' ], 0)) as HistoryStep;
      const kept = blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT);

      // Assert.
      expect([ step.histories, [ ...new Set(step.entries.map(entry => entry.document)) ], kept?.stamp.events[1].x, eventOf(mapIn(window, 1), 6).x ])
        .toStrictEqual([ [ 'blueprint:k3x9q2mf' ], [ 'blueprint-map:k3x9q2mf', 'editor-data:blueprints' ], 0, 2 ]);
    });

    it('notes why a copy could not take a change for the where-used list, and forgets it once a change reaches it', async () =>
    {
      // Arrange: map 1's guard given a second page, which no change can pair with its blueprint's one.
      const window = await propagationWindow();
      window.hub.edit('Page', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 5, 'pages' ], [ guardPage(3), guardPage(3) ] as unknown as JsonValue));
      window.hub.edit('Rename', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain'));
      const drifted = window.maps.driftOf(1, 5);

      // Act: the page taken away again, and the next change reaching the guard.
      window.hub.edit('Unpage', [ mapHistoryKey(1) ], tx => tx.set('map:1', [ 'events', 5, 'pages' ], [ guardPage(3) ] as unknown as JsonValue));
      window.hub.edit('Speed up', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4));

      // Assert: the other copies were never drifted; the name the change missed now reads as the guard's own.
      const guard = eventOf(mapIn(window, 1), 5);
      expect([ drifted, window.maps.driftOf(1, 5), window.maps.driftOf(2, 5), guard.name, guard.pages[0].moveSpeed ])
        .toStrictEqual([ 'it has 2 pages and its blueprint had 1 page', null, null, 'Guard', 4 ]);
    });
  });

  describe('undo', () =>
  {
    it('takes back every map, and the blueprint, from the blueprint\'s history, and brings them back on redo', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Act.
      const undone = window.hub.undo(blueprintHistoryKey(BLUEPRINT));
      const afterUndo = [ groundOf(mapIn(window, 1), 1, 1), groundOf(mapIn(window, 2), 1, 1), window.blueprintMap.cells[blueprintCell(0, 0)] ];
      const redone = window.hub.redo(blueprintHistoryKey(BLUEPRINT));

      // Assert: map 3, written through, holds the window up neither way.
      expect([ undone.ok, afterUndo, redone.ok, groundOf(mapIn(window, 1), 1, 1), blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT)?.stamp.tiles?.values[0] ])
        .toStrictEqual([ true, [ a5(1), a5(1), a5(1) ], true, a5(9), a5(9) ]);
    });

    it('reaches each copy by the fields the change moved, never by the whole copy', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = window.hub.edit('Speed up', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4)) as HistoryStep;

      // Assert: the guards change their speed alone, on the maps held here and on map 3's file alike; the posts not at all.
      expect(step.entries.filter(entry => entry.document.startsWith('map:')).map(entry => [ entry.document, entry.patch ]))
        .toStrictEqual([ 'map:1', 'map:2', 'map:3' ].map(map => [ map, { kind: 'set', path: [ 'events', 5, 'pages', 0, 'moveSpeed' ], before: 3, after: 4 } ]));
    });

    it('takes the step back from the map and from the blueprint around a later edit to another field of a copy', async () =>
    {
      // Arrange: the guard sped up in the blueprint, then map 1's guard given a comment in its own event window.
      const mapWindow = await propagationWindow();
      const blueprintWindow = await propagationWindow();
      const later = [ mapWindow, blueprintWindow ].map(window =>
      {
        window.hub.edit('Speed up', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4));
        return window.hub.edit('Edit Comment', [ eventHistoryKey(1, 5) ], tx => tx.splice('map:1', [ 'events', 5, 'pages', 0, 'list' ], 0, 0, [ { code: 108, indent: 0, parameters: [ '<moveSpeed:5.2>' ] } ]));
      });

      // Act.
      const undone = [ mapWindow.hub.undo(mapHistoryKey(1)), blueprintWindow.hub.undo(blueprintHistoryKey(BLUEPRINT)) ];

      // Assert: both guards slow again in each window, the comment still on map 1's guard, and still undoable in its window.
      expect([ mapWindow, blueprintWindow ].map((window, index) => [
        undone[index].ok,
        eventOf(mapIn(window, 1), 5).pages[0].moveSpeed,
        eventOf(mapIn(window, 2), 5).pages[0].moveSpeed,
        eventOf(mapIn(window, 1), 5).pages[0].list[0].parameters,
        window.hub.canUndo(eventHistoryKey(1, 5)).ok && window.hub.history(eventHistoryKey(1, 5)).rows[0].id === later[index]?.id,
      ]))
        .toStrictEqual([ [ true, 3, 3, [ '<moveSpeed:5.2>' ], true ], [ true, 3, 3, [ '<moveSpeed:5.2>' ], true ] ]);
    });

    it('takes back the whole step from any map it reached', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Act.
      const undone = window.hub.undo(mapHistoryKey(2));

      // Assert: the blueprint's own cell reads as its map lays it out, on layer 1.
      expect([ undone.ok, groundOf(mapIn(window, 1), 1, 1), groundOf(mapIn(window, 2), 1, 1), window.blueprintMap.cells[blueprintCell(0, 0)], window.hub.history(blueprintHistoryKey(BLUEPRINT)).position ])
        .toStrictEqual([ true, a5(1), a5(1), a5(1), 0 ]);
    });

    it('takes the step back everywhere but a cell painted over on a map since, which keeps its paint, naming the edit', async () =>
    {
      // Arrange: two cells repainted; map 1's first one painted again by hand.
      const window = await propagationWindow();
      paintBlueprint(window, [ [ 0, 0, a5(9) ], [ 1, 0, a5(8) ] ]);
      const later = window.hub.edit('Paint by hand', [ mapHistoryKey(1) ], tx => tx.tiles('map:1', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0), a5(15) ] ]));

      // Act.
      const undone = window.hub.undo(blueprintHistoryKey(BLUEPRINT));

      // Assert: on map 1 the cell painted by hand keeps its paint and its neighbour goes back; map 2 and the blueprint go
      // back whole.
      expect([
        undone.ok && undone.left,
        [ groundOf(mapIn(window, 1), 1, 1), groundOf(mapIn(window, 1), 2, 1), groundOf(mapIn(window, 2), 1, 1), groundOf(mapIn(window, 2), 2, 1) ],
        [ window.blueprintMap.cells[blueprintCell(0, 0)], window.blueprintMap.cells[blueprintCell(1, 0)] ],
      ])
        .toStrictEqual([
          [ { document: 'map:1', patch: { kind: 'tiles', indices: [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0) ], before: [ a5(1) ], after: [ a5(9) ] }, by: later } ],
          [ a5(15), a5(2), a5(1), a5(2) ],
          [ a5(1), a5(2) ],
        ]);
    });

    it('takes the step back everywhere but a copy\'s field changed by hand since, which keeps the hand\'s value', async () =>
    {
      // Arrange: the guard sped up in the blueprint, then map 1's guard sped up further by hand.
      const window = await propagationWindow();
      window.hub.edit('Speed up', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'pages', 0, 'moveSpeed' ], 4));
      const later = window.hub.edit('Change movement (page 1)', [ eventHistoryKey(1, 5) ], tx => tx.set('map:1', [ 'events', 5, 'pages', 0, 'moveSpeed' ], 6));

      // Act.
      const undone = window.hub.undo(mapHistoryKey(2));

      // Assert.
      expect([ undone.ok && undone.left, eventOf(mapIn(window, 1), 5).pages[0].moveSpeed, eventOf(mapIn(window, 2), 5).pages[0].moveSpeed ])
        .toStrictEqual([
          [ { document: 'map:1', patch: { kind: 'set', path: [ 'events', 5, 'pages', 0, 'moveSpeed' ], before: 3, after: 4 }, by: later } ],
          6,
          3,
        ]);
    });

    it('still refuses an undo from a map once the blueprint itself was changed since in the same place', async () =>
    {
      // Arrange: map 2's corner painted by hand, so the second stroke on the blueprint's corner reaches map 1 alone; then
      // the hand paint undone, leaving the first stroke newest on map 2.
      const window = await propagationWindow();
      paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);
      window.hub.edit('Paint by hand', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0), a5(15) ] ]));
      const again = window.hub.edit('Paint again', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.tiles(window.blueprintKey, [ [ blueprintCell(0, 0), a5(12) ] ]));
      window.hub.undo(mapHistoryKey(2));

      // Act.
      const undone = window.hub.undo(mapHistoryKey(2));

      // Assert: the blueprint's own cell keeps its own history, so the first stroke cannot come out from under the second.
      expect([ undone, window.blueprintMap.cells[blueprintCell(0, 0)] ])
        .toStrictEqual([
          expect.objectContaining({ ok: false, reason: 'conflict', blockedBy: again, message: '"Paint again" later changed what "Paint" changed' }),
          a5(12),
        ]);
    });

    it('takes up the step in a map nobody had open once it is opened from the file the step wrote, and undoes it there', async () =>
    {
      // Arrange: the step written to map 3's file, as the writer would, then map 3 opened from that file.
      const window = await propagationWindow();
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]) as HistoryStep;
      window.maps.follow(step, 'forward', true);
      window.hub.adopt('map:3', fileAfter(window, step, 3).toJson() as unknown as JsonValue);

      // Act.
      const taken = [ window.hub.history(mapHistoryKey(3)).rows.map(row => row.label), window.hub.isDirty('map:3') ];
      const undone = window.hub.undo(mapHistoryKey(3));

      // Assert: taken up, it reads as saved, since its file holds it.
      expect([ taken, undone.ok, groundOf(mapIn(window, 3), 1, 1), groundOf(mapIn(window, 1), 1, 1) ])
        .toStrictEqual([ [ [ 'Paint' ], false ], true, a5(1), a5(1) ]);
    });
  });

  describe('waiting and refusing', () =>
  {
    it('refuses a change until the copies are counted, saying why, and lets it through once they are', async () =>
    {
      // Arrange: nothing read yet.
      const window = await propagationWindow({ settled: false });
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const first = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);
      await settle();
      const second = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert.
      expect([ first, refusals, second?.label ])
        .toStrictEqual([ null, [ 'This blueprint can\'t change until its copies have been found; try again in a moment.' ], 'Paint' ]);
    });

    it('refuses a change while the file of a map nobody has open is still being read', async () =>
    {
      // Arrange: map 3's file read held up.
      const window = await propagationWindow({ pausedReads: [ 3 ] });
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const first = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);
      window.releaseReads();
      await settle();
      const second = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert.
      expect([ first, refusals, second?.label, window.reads ])
        .toStrictEqual([ null, [ 'This blueprint can\'t change until Map 3, which holds a copy, has been read; try again in a moment.' ], 'Paint', [ 3 ] ]);
    });

    it('brings in a map only another window holds, refusing the change until it is held here', async () =>
    {
      // Arrange: another window holds map 3.
      const window = await propagationWindow({ heldElsewhere: [ 3 ] });
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert: its file was never read, being another window's to hold.
      expect([ step, refusals, window.opened.includes('map:3'), window.reads ])
        .toStrictEqual([ null, [ 'This blueprint can\'t change until Map 3, which holds a copy, has been read; try again in a moment.' ], true, [] ]);
    });

    it('refuses a change while a map holding a copy waits for a choice about its file changing on disk', async () =>
    {
      // Arrange.
      const window = await propagationWindow();
      window.hub.edit('Paint', [ mapHistoryKey(2) ], tx => tx.tiles('map:2', [ [ 0, a5(30) ] ]));
      window.hub.flagConflict('map:2', { kind: 'disk', content: null });
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert.
      expect([ step, refusals ])
        .toStrictEqual([ null, [ 'This blueprint can\'t change while Map 2, which holds a copy, waits for a choice about changes made elsewhere.' ] ]);
    });

    it('refuses a change until the plugins are read, since which maps hold their patterns is not known yet', async () =>
    {
      // Arrange: maps kept for a window whose plugins have not switched on.
      const window = await propagationWindow();
      const unread = new CopyMaps({
        hub: window.hub,
        copies: window.counter,
        holders: () => [],
        onHoldingChange: () => () => undefined,
        openDocument: () => Promise.reject(new Error('nothing opens here')),
        readMap: null,
        templates: { revision: 0, listProblem: null, templateMapOf: () => null },
      });

      // Act.
      const waiting = unread.readiness(BLUEPRINT);

      // Assert.
      expect(waiting)
        .toBe('This blueprint can\'t change until the project\'s plugins have been read; try again in a moment.');
    });

    it('refuses a change in a window that no longer holds the blueprints', async () =>
    {
      // Arrange: the blueprints let go of, the blueprint's map still open.
      const window = await propagationWindow();
      window.hub.release(BLUEPRINTS_DOCUMENT);
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act: as the event's own window edits it, in the event's history.
      const step = window.hub.edit('Rename', [ eventHistoryKey(window.blueprintMap.mapId, 1) ], tx => tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain'));

      // Assert.
      expect([ step, refusals ])
        .toStrictEqual([ null, [ BLUEPRINTS_NOT_HELD ] ]);
    });

    it('refuses one step changing two blueprints at once', async () =>
    {
      // Arrange: a second blueprint open as a map too.
      const window = await propagationWindow();
      window.hub.edit('Save', [ blueprintHistoryKey('zz11zz11') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'zz11zz11' ], savedBlueprintOf('Other', campStamp())));
      holdBlueprintMap(window.hub, 'zz11zz11');
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const step = window.hub.edit('Both', [ blueprintHistoryKey(BLUEPRINT), blueprintHistoryKey('zz11zz11') ], tx =>
      {
        tx.set(window.blueprintKey, [ 'events', 1, 'name' ], 'Captain');
        tx.set(blueprintMapKey('zz11zz11'), [ 'events', 1, 'name' ], 'Captain');
      });

      // Assert.
      expect([ step, refusals ])
        .toStrictEqual([ null, [ ONE_BLUEPRINT_AT_A_TIME ] ]);
    });

    it('refuses a change in a tab waiting for a choice about a version of its blueprint found on disk', async () =>
    {
      // Arrange: the tab flagged against a version of the camp found on disk.
      const window = await propagationWindow();
      window.hub.flagConflict(window.blueprintKey, { kind: 'disk', content: window.hub.committedContent(window.blueprintKey) });
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert.
      expect([ step, refusals, groundOf(mapIn(window, 1), 1, 1) ])
        .toStrictEqual([ null, [ BLUEPRINT_MAP_CONFLICTED ], a5(1) ]);
    });

    it('refuses a change in a tab showing its blueprint otherwise than the blueprints keep it, which would put the older one back', async () =>
    {
      // Arrange: the blueprints' camp changed under its tab, which nothing here laid out afresh.
      const window = await propagationWindow();
      const newer = { ...campStamp(), tiles: { layers: [ 0 ], values: [ a5(1), a5(20), a5(3), a5(4) ], calledFor: [ -1, -1, -1, -1 ] } };
      window.hub.edit('Change elsewhere', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', BLUEPRINT, 'stamp' ], savedBlueprintOf('Camp', newer)['stamp']));
      const refusals: string[] = [];
      window.hub.subscribe(event => (event.type === 'refused' ? refusals.push(event.message) : undefined));

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert: the blueprints keep the newer camp.
      expect([ step, refusals, blueprintIn(window.hub.document(BLUEPRINTS_DOCUMENT), BLUEPRINT)?.stamp.tiles?.values ])
        .toStrictEqual([ null, [ BLUEPRINT_MAP_STALE ], [ a5(1), a5(20), a5(3), a5(4) ] ]);
    });

    it('lets a change through in a tab showing its blueprint as the blueprints keep it, whatever order the blueprint lists its events in', async () =>
    {
      // Arrange: the camp's events kept in the other order, as a file written by hand may keep them.
      const window = await propagationWindow();
      const stamp = campStamp();
      const reordered = { ...stamp, events: [ ...stamp.events ].reverse() };
      window.hub.edit('Reorder elsewhere', [ blueprintHistoryKey(BLUEPRINT) ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', BLUEPRINT, 'stamp' ], savedBlueprintOf('Camp', reordered)['stamp']));

      // Act.
      const step = paintBlueprint(window, [ [ 0, 0, a5(9) ] ]);

      // Assert.
      expect([ step?.label, groundOf(mapIn(window, 1), 1, 1) ])
        .toStrictEqual([ 'Paint', a5(9) ]);
    });

    it('lets an edit to anything but a blueprint through untouched', async () =>
    {
      // Arrange.
      const window = await propagationWindow();

      // Act.
      const step = window.hub.edit('Paint', [ mapHistoryKey(1) ], tx => tx.tiles('map:1', [ [ cellIndex(MAP_WIDTH, MAP_HEIGHT, 1, 1, 0), a5(30) ] ])) as HistoryStep;

      // Assert.
      expect([ step.histories, step.entries.map(entry => entry.document), groundOf(mapIn(window, 2), 1, 1) ])
        .toStrictEqual([ [ 'map:1' ], [ 'map:1' ], a5(1) ]);
    });
  });
});
