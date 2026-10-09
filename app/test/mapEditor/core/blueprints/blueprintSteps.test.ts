import { describe, expect, it } from 'vitest';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { blueprintMapContent } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { blueprintChangesIn, blueprintStepChange, pageLineage, type BlueprintStepChange } from '../../../../src/mapEditor/core/blueprints/blueprintSteps.ts';
import { planCopyChange } from '../../../../src/mapEditor/core/blueprints/copyChanges.ts';
import { followTiles } from '../../../../src/mapEditor/core/blueprints/copyTiles.ts';
import { moveEvents } from '../../../../src/mapEditor/core/events/eventMoves.ts';
import { addPage, clearPage, deletePage, duplicatePage, movePage, pastePages } from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import { setPageTrigger } from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import { pageListPath, recordEventStep, renameEvent, type EventWindowTarget } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import type { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { blueprintHistoryKey, mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { Patch } from '../../../../src/mapEditor/core/model/patches.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { TilesetMode } from '../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import { applyTileEdit } from '../../../../src/mapEditor/core/tools/strokes.ts';
import { openedBlueprint } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { markedPage } from '../../support/eventWindowFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { blankGrid, cellOf } from '../tiles/support/tileGridBuilder.ts';

/*
 * Every step on a blueprint must carry what the field model needs to turn it into one change across every map: the
 * blueprint's tiles and events before the step and after it, the tile values it changed, and every event it changed, each
 * before and after, which is what the copy planner takes (see planCopyChange). Where a step adds pages to an event, takes
 * them away, copies or moves them, the planner must also know which page before the step each page after it continues,
 * since each copy's pages, and whatever its link keeps of them, go the same way; a page that pairs wrongly would hand a
 * copy's offsets to another page. So a page added or copied continues none, a page taken away is continued by none, a page
 * moved continues itself in its new place, and a page changed where it stands continues itself. Every tool's step reads the
 * same: a stroke, a move, a rename, a page's setting, a command list's edit and each page operation are checked here as the
 * tools make them, the moment each step is made.
 *
 * The blueprint is 3 by 2, carrying every layer, ground on layer 1, with event 2 holding pages marked 1, 2 and 3, and
 * event 5 holding one page marked 4.
 */
describe('blueprintSteps', () =>
{
  /**
   * The blueprint fixture's stamp.
   * @returns {Stamp} The stamp.
   */
  const campStamp = (): Stamp => stampOf({
    width: 3,
    height: 2,
    tiles: { layers: [ 0, 1, 2, 3, 4, 5 ], values: new Array(36).fill(0).fill(1536, 0, 6), calledFor: new Array(36).fill(-1) },
    events: [
      { ...createMapEvent(2, 0, 0), pages: [ markedPage(1), markedPage(2), markedPage(3) ] },
      { ...createMapEvent(5, 2, 1), pages: [ markedPage(4) ] },
    ],
  });

  /**
   * Opens the blueprint fixture, with event 2's window target.
   * @returns {ReturnType<typeof openedBlueprint> & { target: EventWindowTarget }} The window, the map and the target.
   */
  const openCamp = () =>
  {
    const opened = openedBlueprint('k3x9q2mf', campStamp());
    const target: EventWindowTarget = { mapId: opened.mapId, eventId: 2 };
    return { ...opened, target };
  };

  /**
   * Runs an edit and reads what each step it made did to the blueprints, the moment each step is made.
   * @param {DocumentHub} hub The window's documents.
   * @param {() => unknown} edit The edit.
   * @returns {BlueprintStepChange[][]} For each step, what it did to each blueprint it changed.
   */
  const stepsOf = (hub: DocumentHub, edit: () => unknown): BlueprintStepChange[][] =>
  {
    const read: BlueprintStepChange[][] = [];
    const stop = hub.subscribe(event =>
    {
      if (event.type === 'committed')
      {
        read.push(blueprintChangesIn(hub, event.step.entries));
      }
    });
    edit();
    stop();
    return read;
  };

  /**
   * Reads the one change one step made to one blueprint.
   * @param {DocumentHub} hub The window's documents.
   * @param {() => unknown} edit The edit, which makes one step.
   * @returns {BlueprintStepChange} The change.
   */
  const changeOf = (hub: DocumentHub, edit: () => unknown): BlueprintStepChange =>
  {
    const [ [ change ] ] = stepsOf(hub, edit);
    return change;
  };

  /**
   * Reads the marks of an event's pages off their sheets, 0 for a fresh page, which shows none.
   * @param {RmmzMapEvent} event The event.
   * @returns {number[]} The marks.
   */
  const marksOf = (event: RmmzMapEvent): number[] =>
  {
    return event.pages.map(page => (page.image.characterName === '' ? 0 : Number.parseInt(page.image.characterName.slice('Sheet'.length), 10)));
  };

  describe('blueprintChangesIn', () =>
  {
    it('says what a stroke did: the tiles before and after, every value it changed, and no event', () =>
    {
      // Arrange.
      const { hub, map } = openCamp();

      // Act.
      const change = changeOf(hub, () => applyTileEdit(hub, map, 'Paint', [ [ map.cellIndex(1, 0, 0), 1537 ], [ map.cellIndex(2, 1, 3), 10 ] ]));

      // Assert: the values in the order the field model lists them, layer by layer, row by row.
      expect([ change.blueprintId, change.before.tiles?.values.slice(0, 6), change.after.tiles?.values.slice(0, 6), change.after.tiles?.values[23], change.cells, change.events ])
        .toStrictEqual([
          'k3x9q2mf',
          [ 1536, 1536, 1536, 1536, 1536, 1536 ],
          [ 1536, 1537, 1536, 1536, 1536, 1536 ],
          10,
          [ { dx: 1, dy: 0, layer: 0, before: 1536, after: 1537 }, { dx: 2, dy: 1, layer: 3, before: 0, after: 10 } ],
          [],
        ]);
    });

    it('says what moving an event did, the event before and after with its pages where they were, and no tile', () =>
    {
      // Arrange.
      const { hub, mapId } = openCamp();

      // Act.
      const change = changeOf(hub, () => moveEvents(hub, mapId, [ 5 ], -1, 0));

      // Assert.
      const [ moved ] = change.events;
      expect([ change.events.length, [ moved.before.id, moved.before.x ], [ moved.after.id, moved.after.x ], Object.hasOwn(moved, 'pages'), change.cells ])
        .toStrictEqual([ 1, [ 5, 2 ], [ 5, 1 ], false, [] ]);
    });

    it('says what renaming an event and changing a page\'s trigger did, the pages where they were', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const steps = stepsOf(hub, () =>
      {
        renameEvent(hub, target, 'Guard');
        setPageTrigger(hub, target, 1, 3);
      });

      // Assert.
      const [ [ renamed ], [ triggered ] ] = steps;
      expect([
        [ renamed.events[0].before.name, renamed.events[0].after.name, Object.hasOwn(renamed.events[0], 'pages') ],
        [ triggered.events[0].before.pages[1].trigger, triggered.events[0].after.pages[1].trigger, Object.hasOwn(triggered.events[0], 'pages') ],
      ])
        .toStrictEqual([ [ 'EV002', 'Guard', false ], [ 2, 3, false ] ]);
    });

    it('says what an edit to a page\'s commands did, the page continuing itself', () =>
    {
      // Arrange: page 3's comment taken out, as the command list does.
      const { hub, target, map } = openCamp();

      // Act.
      const change = changeOf(hub, () => recordEventStep(hub, target, 'Delete command', tx => tx.splice(map.key, pageListPath(target, 2), 0, 1, [])));

      // Assert.
      const [ edited ] = change.events;
      expect([ edited.before.pages[2].list.length, edited.after.pages[2].list.length, Object.hasOwn(edited, 'pages') ])
        .toStrictEqual([ 2, 1, false ]);
    });

    it('reads a page added as continuing no page, every page after it continuing its own', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const change = changeOf(hub, () => addPage(hub, target, 0));

      // Assert.
      const [ added ] = change.events;
      expect([ marksOf(added.before), marksOf(added.after), added.pages ])
        .toStrictEqual([ [ 1, 2, 3 ], [ 1, 0, 2, 3 ], [ 0, null, 1, 2 ] ]);
    });

    it('reads a page taken away as continued by no page', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const change = changeOf(hub, () => deletePage(hub, target, 1));

      // Assert.
      const [ taken ] = change.events;
      expect([ marksOf(taken.after), taken.pages ])
        .toStrictEqual([ [ 1, 3 ], [ 0, 2 ] ]);
    });

    it('reads a page duplicated, or pasted, as a new page continuing none, however like another page it is', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const [ [ duplicated ], [ pasted ] ] = stepsOf(hub, () =>
      {
        duplicatePage(hub, target, 0);
        pastePages(hub, target, 3, { marker: 'jmz-map-editor/pages', version: 1, pages: [ markedPage(2), markedPage(9) ] });
      });

      // Assert.
      expect([ marksOf(duplicated.events[0].after), duplicated.events[0].pages, marksOf(pasted.events[0].after), pasted.events[0].pages ])
        .toStrictEqual([ [ 1, 1, 2, 3 ], [ 0, null, 1, 2 ], [ 1, 1, 2, 3, 2, 9 ], [ 0, 1, 2, 3, null, null ] ]);
    });

    it('reads a page moved, either way, as continuing itself in its new place', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const [ [ later ], [ earlier ] ] = stepsOf(hub, () =>
      {
        movePage(hub, target, 0, 2);
        movePage(hub, target, 2, 1);
      });

      // Assert: page 1 went last; then, back in second place.
      expect([ marksOf(later.events[0].after), later.events[0].pages, marksOf(earlier.events[0].after), earlier.events[0].pages ])
        .toStrictEqual([ [ 2, 3, 1 ], [ 1, 2, 0 ], [ 2, 1, 3 ], [ 0, 2, 1 ] ]);
    });

    it('reads a page cleared as continuing itself, the pages left where they were', () =>
    {
      // Arrange.
      const { hub, target } = openCamp();

      // Act.
      const change = changeOf(hub, () => clearPage(hub, target, 1));

      // Assert.
      const [ cleared ] = change.events;
      expect([ marksOf(cleared.after), Object.hasOwn(cleared, 'pages') ])
        .toStrictEqual([ [ 1, 0, 3 ], false ]);
    });

    it('lists every event one step changed, in id order, and leaves out the ones it left as they were', () =>
    {
      // Arrange.
      const { hub, map, mapId } = openCamp();

      // Act.
      const change = changeOf(hub, () => hub.edit('Rename both', [ mapHistoryKey(mapId) ], tx =>
      {
        tx.set(map.key, [ 'events', 5, 'name' ], 'Lamp');
        tx.set(map.key, [ 'events', 2, 'name' ], 'Goblin');
        tx.set(map.key, [ 'events', 2, 'name' ], 'EV002');
      }));

      // Assert: event 2 was renamed and named back within the step, so it did not change.
      expect(change.events.map(each => [ each.before.id, each.after.name ]))
        .toStrictEqual([ [ 5, 'Lamp' ] ]);
    });

    it('reads nothing of a step that changed no blueprint', () =>
    {
      // Arrange: a map beside the open blueprint, and a rename of the blueprint itself.
      const { hub } = openCamp();
      hub.adopt('map:4', mapWithEvents(3, 3, [ null, [ 0, 0 ] ]) as unknown as JsonValue);

      // Act.
      const steps = stepsOf(hub, () =>
      {
        hub.edit('Rename map event', [ mapHistoryKey(4) ], tx => tx.set('map:4', [ 'events', 1, 'name' ], 'Door'));
        hub.edit('Rename blueprint', [ blueprintHistoryKey('k3x9q2mf') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'k3x9q2mf', 'name' ], 'Camp 2'));
      });

      // Assert.
      expect(steps)
        .toStrictEqual([ [], [] ]);
    });

    it('reads no tiles for a blueprint of events alone, whatever its map\'s layers hold', () =>
    {
      // Arrange: a blueprint of one event, its map's tile data changed under it as no tool can, with a rename.
      const { map } = openedBlueprint('k3x9q2mf', stampOf());
      const patches: Patch[] = [ map.tilesPatch([ [ 0, 7 ] ]), map.setPatch([ 'events', 1, 'name' ], 'Lamp') ];
      patches.forEach(patch => map.apply(patch));

      // Act.
      const change = blueprintStepChange(map, patches, null);

      // Assert.
      expect([ change.before.tiles, change.after.tiles, change.cells, change.events.map(each => each.after.name) ])
        .toStrictEqual([ null, null, [], [ 'Lamp' ] ]);
    });

    it('refuses to read a step on a blueprint the blueprints no longer hold', () =>
    {
      // Arrange: the blueprint deleted, then its map changed as no tool would let it be.
      const { hub, map } = openCamp();
      hub.edit('Delete blueprint', [ blueprintHistoryKey('k3x9q2mf') ], tx => tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', 'k3x9q2mf' ], undefined));
      const entries = [ { document: map.key, patch: map.setPatch([ 'events', 2, 'name' ], 'Guard') } ];

      // Act.
      const read = () => blueprintChangesIn(hub, entries);

      // Assert.
      expect(read)
        .toThrow('the blueprints hold no blueprint k3x9q2mf, which a step changed');
    });
  });

  describe('blueprintStepChange', () =>
  {
    it('refuses a map that is no blueprint opened as a map', () =>
    {
      // Arrange.
      const map = MapDocument.fromJson('map:4', mapWithEvents(3, 3, [ null, [ 0, 0 ] ]));

      // Act.
      const read = () => blueprintStepChange(map, [], null);

      // Assert.
      expect(read)
        .toThrow('map:4 is no blueprint opened as a map');
    });

    it('refuses a step that added or took away an event, which no step on a blueprint may', () =>
    {
      // Arrange: an event put in slot 3, as no tool can in a blueprint.
      const map = MapDocument.fromJson('blueprint-map:k3x9q2mf', blueprintMapContent(campStamp()));
      const patch = map.setPatch([ 'events', 3 ], createMapEvent(3, 1, 1) as unknown as JsonValue);
      map.apply(patch);

      // Act.
      const read = () => blueprintStepChange(map, [ patch ], [ 0, 1, 2, 3, 4, 5 ]);

      // Assert.
      expect(read)
        .toThrow('a step on a blueprint added or took away one of its events');
    });
  });

  describe('pageLineage', () =>
  {
    /**
     * An event 2 holding pages of the marks given.
     * @param {readonly number[]} marks The pages' marks, 0 for a fresh page.
     * @returns {RmmzMapEvent} The event.
     */
    const withPages = (marks: readonly number[]): RmmzMapEvent => ({
      ...createMapEvent(2, 0, 0),
      pages: marks.map(mark => (mark === 0 ? createEventPage() : markedPage(mark))),
    });

    /**
     * A page as patches carry it.
     * @param {number} mark The page's mark.
     * @returns {JsonValue} The page.
     */
    const pageJson = (mark: number): JsonValue => markedPage(mark) as unknown as JsonValue;

    it('pairs a whole list set at once by place while it keeps its count, and by equal pages when it does not', () =>
    {
      // Arrange: the list set whole, once keeping three pages, once dropping the middle one.
      const kept: Patch = { kind: 'set', path: [ 'events', 2, 'pages' ], before: [ 1, 2, 3 ].map(pageJson), after: [ 3, 2, 1 ].map(pageJson) };
      const dropped: Patch = { kind: 'set', path: [ 'events', 2, 'pages' ], before: [ 1, 2, 3 ].map(pageJson), after: [ 1, 3 ].map(pageJson) };

      // Act.
      const lineages = [
        pageLineage(withPages([ 1, 2, 3 ]), withPages([ 3, 2, 1 ]), [ kept ]),
        pageLineage(withPages([ 1, 2, 3 ]), withPages([ 1, 3 ]), [ dropped ]),
      ];

      // Assert.
      expect(lineages)
        .toStrictEqual([ undefined, [ 0, 2 ] ]);
    });

    it('follows the whole event set at once, and a page put on the end or taken off it by a set of its place', () =>
    {
      // Arrange.
      const wholeEvent: Patch = {
        kind: 'set',
        path: [ 'events', 2 ],
        before: withPages([ 1, 2 ]) as unknown as JsonValue,
        after: withPages([ 2 ]) as unknown as JsonValue,
      };
      const onEnd: Patch = { kind: 'set', path: [ 'events', 2, 'pages', 2 ], before: undefined, after: pageJson(9) };
      const offEnd: Patch = { kind: 'set', path: [ 'events', 2, 'pages', 1 ], before: pageJson(2), after: undefined };

      // Act.
      const lineages = [
        pageLineage(withPages([ 1, 2 ]), withPages([ 2 ]), [ wholeEvent ]),
        pageLineage(withPages([ 1, 2 ]), withPages([ 1, 2, 9 ]), [ onEnd ]),
        pageLineage(withPages([ 1, 2 ]), withPages([ 1 ]), [ offEnd ]),
      ];

      // Assert.
      expect(lineages)
        .toStrictEqual([ [ 1 ], [ 0, 1, null ], [ 0 ] ]);
    });

    it('reads past patches to other events, to a page\'s own fields and to the tiles', () =>
    {
      // Arrange: event 3's pages spliced, a field of event 2's first page set, and the tiles.
      const patches: Patch[] = [
        { kind: 'splice', path: [ 'events', 3, 'pages' ], index: 0, removed: [ pageJson(1) ], inserted: [] },
        { kind: 'set', path: [ 'events', 2, 'pages', 0, 'trigger' ], before: 1, after: 2 },
        { kind: 'tiles', indices: [ 0 ], before: [ 0 ], after: [ 1 ] },
      ];

      // Act.
      const lineage = pageLineage(withPages([ 1, 2 ]), withPages([ 1, 2 ]), patches);

      // Assert.
      expect(lineage)
        .toBeUndefined();
    });

    it('reads past a splice of the events after the event, or before it keeping their count, and refuses one moving it', () =>
    {
      // Arrange: a splice growing the list past slot 2, one replacing slot 1 alone, and one putting an event in front.
      const past: Patch = { kind: 'splice', path: [ 'events' ], index: 4, removed: [], inserted: [ null ] };
      const before: Patch = { kind: 'splice', path: [ 'events' ], index: 1, removed: [ null ], inserted: [ null ] };
      const inFront: Patch = { kind: 'splice', path: [ 'events' ], index: 0, removed: [], inserted: [ null ] };

      // Act.
      const lineages = [ pageLineage(withPages([ 1 ]), withPages([ 1 ]), [ past ]), pageLineage(withPages([ 1 ]), withPages([ 1 ]), [ before ]) ];
      const moved = () => pageLineage(withPages([ 1 ]), withPages([ 1 ]), [ inFront ]);

      // Assert.
      expect(lineages)
        .toStrictEqual([ undefined, undefined ]);
      expect(moved)
        .toThrow('moved one of its events to another slot');
    });

    it('follows a splice of the events replacing the event\'s own slot as the whole event set at once', () =>
    {
      // Arrange: slot 2 replaced with the event holding its second page alone.
      const replaced: Patch = {
        kind: 'splice',
        path: [ 'events' ],
        index: 2,
        removed: [ withPages([ 1, 2 ]) as unknown as JsonValue ],
        inserted: [ withPages([ 2 ]) as unknown as JsonValue ],
      };

      // Act.
      const lineage = pageLineage(withPages([ 1, 2 ]), withPages([ 2 ]), [ replaced ]);

      // Assert.
      expect(lineage)
        .toStrictEqual([ 1 ]);
    });

    it('pairs the lists whole when the patches cannot account for the pages after the step', () =>
    {
      // Arrange: a page gone with no patch saying so.

      // Act.
      const lineage = pageLineage(withPages([ 1, 2, 3 ]), withPages([ 1, 3 ]), []);

      // Assert.
      expect(lineage)
        .toStrictEqual([ 0, 2 ]);
    });
  });

  /*
   * What a step carries is exactly what the field model takes: a change read off a step plans each copy of the event, and
   * follows each placement's cells, with nothing to translate. Nothing here writes a copy; the second half does.
   */
  describe('what the field model takes', () =>
  {
    it('plans a copy of the event from a step adding a page, the new page landing on the copy where it landed on the blueprint', () =>
    {
      // Arrange: a copy of event 2 on another map, as its id 7 there, linked to it.
      const { hub, target } = openCamp();
      const change = changeOf(hub, () => addPage(hub, target, 0));
      const copy: RmmzMapEvent = {
        ...campStamp().events[0],
        id: 7,
        note: withBlueprintLink('', { blueprintId: 'k3x9q2mf', eventId: 2, differences: [] }),
      };

      // Act.
      const planned = planCopyChange(change.events[0], copy, { tags: [] });

      // Assert.
      expect([ planned.kind, planned.kind === 'changes' ? marksOf(planned.event) : null ])
        .toStrictEqual([ 'changes', [ 1, 0, 2, 3 ] ]);
    });

    it('follows a placement\'s cells from a stroke\'s change, the cells holding what the blueprint held', () =>
    {
      // Arrange: a placement of the blueprint at 2, 1 on an empty 6 by 4 map, as its ground went down.
      const { hub, map } = openCamp();
      const change = changeOf(hub, () => applyTileEdit(hub, map, 'Paint', [ [ map.cellIndex(1, 0, 0), 1537 ] ]));
      const grid = blankGrid(6, 4);
      for (let x = 2; x < 5; x++)
      {
        for (let y = 1; y < 3; y++)
        {
          grid.cells[(0 * 4 + y) * 6 + x] = 1536;
        }
      }

      // Act.
      const followed = followTiles(grid, { x: 2, y: 1 }, change.cells, TilesetMode.area);

      // Assert.
      expect([ followed.followed, followed.writes.map(([ index, value ]) => [ index, value ]), cellOf(grid, 3, 1, 0) ])
        .toStrictEqual([ [ { x: 3, y: 1, layer: 0 } ], [ [ 9, 1537 ] ], 1536 ]);
    });
  });
});
