import { describe, expect, it, vi } from 'vitest';
import { blueprintMapId } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { DocumentChange } from '../../../../src/mapEditor/core/model/EditorDocument.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { invertPatch, PatchConflictError, type Patch } from '../../../../src/mapEditor/core/model/patches.ts';
import { MapDocument, MapLayer } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map document is one map, live: the six layers as a typed array, the events as the sparse list RMMZ keeps,
 * and every property. It owes its callers a faithful file (what goes in comes out), cells that can only hold
 * real tile ids (a value the typed array would wrap is refused on the way in rather than saved as something
 * else), and changes that happen only through patches, each checked against what it replaces and each heard
 * by every listener. A new event's id lies past the end of the list, so an id a delete emptied is never handed
 * out again to answer for the event that held it. The round-trip test proves the first promise over every
 * shipped map; these prove the rest on a small map whose cells all differ, so a write to the wrong index shows.
 */
describe('MapDocument', () =>
{
  /**
   * Builds the fixture map as a document.
   * @param {(json: RmmzMap) => void} adjust Optional changes to the file before loading it.
   * @returns {MapDocument} The document.
   */
  const buildDocument = (adjust?: (json: RmmzMap) => void): MapDocument =>
  {
    const json = buildMapJson();
    adjust?.(json);
    return MapDocument.fromJson('map:7', json);
  };

  describe('fromJson', () =>
  {
    it('refuses tile data of the wrong length for the size', () =>
    {
      // Arrange.
      const json = buildMapJson();
      json.data.pop();

      // Act.
      const load = () => MapDocument.fromJson('map:7', json);

      // Assert.
      expect(load)
        .toThrow(/holds 36 cells, not 35/u);
    });

    it('refuses a cell that is not a whole number', () =>
    {
      // Arrange.
      const json = buildMapJson();
      json.data[4] = 1.5;

      // Act.
      const load = () => MapDocument.fromJson('map:7', json);

      // Assert.
      expect(load)
        .toThrow(/cell 4 holds 1.5/u);
    });

    it('refuses a cell the typed array would wrap', () =>
    {
      // Arrange.
      const json = buildMapJson();
      json.data[9] = 70000;

      // Act.
      const load = () => MapDocument.fromJson('map:7', json);

      // Assert.
      expect(load)
        .toThrow(/cell 9 holds 70000/u);
    });

    it('refuses a negative cell', () =>
    {
      // Arrange.
      const json = buildMapJson();
      json.data[0] = -1;

      // Act.
      const load = () => MapDocument.fromJson('map:7', json);

      // Assert.
      expect(load)
        .toThrow(/cell 0 holds -1/u);
    });

    it('refuses a size that is not whole tiles', () =>
    {
      // Arrange.
      const json = buildMapJson();
      json.width = 2.5;

      // Act.
      const load = () => MapDocument.fromJson('map:7', json);

      // Assert.
      expect(load)
        .toThrow(/whole number of tiles/u);
    });

    it('refuses a file without an events list', () =>
    {
      // Arrange.
      const json = buildMapJson() as unknown as Record<string, unknown>;
      delete json['events'];

      // Act.
      const load = () => MapDocument.fromJson('map:7', json as unknown as RmmzMap);

      // Assert.
      expect(load)
        .toThrow(/events list/u);
    });

    it('keeps its own copy, so changing the file object afterwards changes nothing', () =>
    {
      // Arrange.
      const json = buildMapJson();
      const document = MapDocument.fromJson('map:7', json);

      // Act.
      json.displayName = 'Changed';
      json.data[0] = 999;
      (json.events[1] as { x: number }).x = 50;

      // Assert.
      expect([ document.property('displayName'), document.cells[0], document.event(1)?.x ])
        .toStrictEqual([ 'Test Town', 1, 0 ]);
    });
  });

  describe('reading', () =>
  {
    it('reports its map id, size and tileset', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const facts = [ document.mapId, document.width, document.height, document.tilesetId ];

      // Assert.
      expect(facts)
        .toStrictEqual([ 7, 3, 2, 4 ]);
    });

    it('reports, for a blueprint opened as a map, the id below zero that names the blueprint', () =>
    {
      // Arrange: the camp's map beside one of another blueprint whose id differs by a character.
      const camp = MapDocument.fromJson('blueprint-map:k3x9q2mf', buildMapJson());
      const other = MapDocument.fromJson('blueprint-map:k3x9q2mg', buildMapJson());

      // Act.
      const ids = [ camp.mapId, other.mapId ];

      // Assert.
      expect(ids)
        .toStrictEqual([ blueprintMapId('k3x9q2mf'), blueprintMapId('k3x9q2mg') ]);
      expect(ids[0])
        .not.toBe(ids[1]);
    });

    it('addresses cells in RMMZ order: layer, then row, then column', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const indexes = [ document.cellIndex(0, 0, 0), document.cellIndex(2, 1, 0), document.cellIndex(1, 0, MapLayer.region) ];

      // Assert.
      expect(indexes)
        .toStrictEqual([ 0, 5, 31 ]);
    });

    it('reads a cell and its neighbours distinctly', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const cells = [ document.cellAt(1, 1, 2), document.cellAt(2, 1, 2), document.cellAt(1, 0, 2) ];

      // Assert.
      expect(cells)
        .toStrictEqual([ 17, 18, 14 ]);
    });

    it('reads zero outside the map', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const cells = [ document.cellAt(-1, 0, 0), document.cellAt(3, 0, 0), document.cellAt(0, 2, 0), document.cellAt(0, 0, 6) ];

      // Assert.
      expect(cells)
        .toStrictEqual([ 0, 0, 0, 0 ]);
    });

    it('finds events by id and answers null for empty or missing slots', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const names = [ document.event(1)?.name, document.event(2), document.event(3)?.name, document.event(40) ];

      // Assert.
      expect(names)
        .toStrictEqual([ 'Door', null, 'Chest', null ]);
    });

    it('lists the ids of the events that exist', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const ids = document.eventIds();

      // Assert.
      expect(ids)
        .toStrictEqual([ 1, 3 ]);
    });

    it('offers the slot past the end of the list for a new event, never an empty slot inside it', () =>
    {
      // Arrange: slots 2 and 4 are empty, so something may still name either id.
      const document = buildDocument();

      // Act.
      const id = document.nextFreeEventId();

      // Assert.
      expect(id)
        .toBe(5);
    });

    it('offers the end of the list when no slot is empty', () =>
    {
      // Arrange.
      const document = buildDocument(json =>
      {
        json.events = [ null, createMapEvent(1, 0, 0) ];
      });

      // Act.
      const id = document.nextFreeEventId();

      // Assert.
      expect(id)
        .toBe(2);
    });

    it('offers slot 1 on a map with no events at all', () =>
    {
      // Arrange.
      const document = buildDocument(json =>
      {
        json.events = [];
      });

      // Act.
      const id = document.nextFreeEventId();

      // Assert.
      expect(id)
        .toBe(1);
    });

    it('reads values by patch path, the tile data included', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const values = [ document.valueAt([ 'events', 3, 'name' ]), document.valueAt([ 'data', 5 ]), document.valueAt([ 'ghost' ]) ];

      // Assert.
      expect(values)
        .toStrictEqual([ 'Chest', 6, undefined ]);
    });
  });

  describe('apply', () =>
  {
    it('changes the listed cells and no others', () =>
    {
      // Arrange.
      const document = buildDocument();
      const expected = buildMapJson().data;
      expected[2] = 500;
      expected[20] = 600;

      // Act.
      document.apply({ kind: 'tiles', indices: [ 2, 20 ], before: [ 3, 21 ], after: [ 500, 600 ] });

      // Assert.
      expect(Array.from(document.cells))
        .toStrictEqual(expected);
    });

    it('writes no cell at all when one of them conflicts', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const apply = () => document.apply({ kind: 'tiles', indices: [ 2, 20 ], before: [ 3, 99 ], after: [ 500, 600 ] });

      // Assert.
      expect(apply)
        .toThrow(/cell 20 no longer holds/u);
      expect(Array.from(document.cells))
        .toStrictEqual(buildMapJson().data);
    });

    it('refuses a cell outside the map', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const apply = () => document.apply({ kind: 'tiles', indices: [ 36 ], before: [ 0 ], after: [ 1 ] });

      // Assert.
      expect(apply)
        .toThrow(/outside the map/u);
    });

    it('refuses a tile id the cells cannot hold', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const apply = () => document.apply({ kind: 'tiles', indices: [ 0 ], before: [ 1 ], after: [ 65536 ] });

      // Assert.
      expect(apply)
        .toThrow(/cannot hold 65536/u);
    });

    it('refuses a tiles patch whose lists disagree in length', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const apply = () => document.apply({ kind: 'tiles', indices: [ 0, 1 ], before: [ 1 ], after: [ 5, 6 ] });

      // Assert.
      expect(apply)
        .toThrow(/one before and one after/u);
    });

    it('swaps size and tiles together on a resize', () =>
    {
      // Arrange.
      const document = buildDocument();
      const data = Array.from({ length: 12 }, (_, index) => 100 + index);

      // Act.
      document.apply(document.resizePatch({ width: 2, height: 1, data }));

      // Assert.
      expect([ document.width, document.height, Array.from(document.cells) ])
        .toStrictEqual([ 2, 1, data ]);
    });

    it('refuses a resize made against a different map state', () =>
    {
      // Arrange.
      const document = buildDocument();
      const stale = document.resizePatch({ width: 1, height: 1, data: [ 1, 2, 3, 4, 5, 6 ] });
      document.apply({ kind: 'tiles', indices: [ 0 ], before: [ 1 ], after: [ 2 ] });

      // Act.
      const apply = () => document.apply(stale);

      // Assert.
      expect(apply)
        .toThrow(/no longer has the size/u);
    });

    it('refuses a set that would touch the size or tile data behind the typed array', () =>
    {
      // Arrange.
      const document = buildDocument();
      const attempts: Patch[] = [
        { kind: 'set', path: [ 'width' ], before: 3, after: 4 },
        { kind: 'set', path: [ 'height' ], before: 2, after: 4 },
        { kind: 'set', path: [ 'data' ], before: undefined, after: [] },
      ];

      // Act.
      const failures = attempts.filter(patch =>
      {
        try
        {
          document.apply(patch);
          return false;
        }
        catch (error)
        {
          return error instanceof PatchConflictError;
        }
      });

      // Assert.
      expect(failures)
        .toHaveLength(3);
    });

    it('changes one field of one event and leaves its neighbour alone', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      document.apply(document.setPatch([ 'events', 3, 'pages', 0, 'trigger' ], 3));

      // Assert.
      expect([ document.event(3)?.pages[0].trigger, document.event(1)?.pages[0].trigger ])
        .toStrictEqual([ 3, 0 ]);
    });

    it('puts a new event into an empty slot with a set', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const patch = document.placeEventPatch(createMapEvent(2, 1, 1));
      document.apply(patch);

      // Assert.
      expect([ patch.kind, document.eventIds(), document.events.length ])
        .toStrictEqual([ 'set', [ 1, 2, 3 ], 5 ]);
    });

    it('grows the list with empty slots to place an event past its end', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const patch = document.placeEventPatch(createMapEvent(7, 1, 1));
      document.apply(patch);

      // Assert.
      expect([ patch.kind, document.events.length, document.events[5], document.events[6], document.event(7)?.name ])
        .toStrictEqual([ 'splice', 8, null, null, 'EV007' ]);
    });

    it('empties an event slot and keeps the list its length', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      document.apply(document.removeEventPatch(3));

      // Assert.
      expect([ document.eventIds(), document.events.length ])
        .toStrictEqual([ [ 1 ], 5 ]);
    });

    it('comes back to exactly the original file after every change is undone', () =>
    {
      // Arrange.
      const document = buildDocument();
      const original = document.toJson();
      const applied: Patch[] = [];
      const steps: (() => Patch)[] = [
        () => document.tilesPatch([ [ 0, 40 ], [ 35, 41 ] ]),
        () => document.placeEventPatch(createMapEvent(9, 2, 0)),
        () => document.setPatch([ 'events', 1, 'meta' ], {}),
        () => document.removeEventPatch(3),
        () => document.setPatch([ 'displayName' ], 'Renamed'),
        () => document.resizePatch({ width: 1, height: 1, data: [ 9, 9, 9, 9, 9, 9 ] }),
      ];

      // Act.
      steps.forEach(build =>
      {
        const patch = build();
        document.apply(patch);
        applied.push(patch);
      });
      applied.reverse().forEach(patch => document.apply(invertPatch(patch)));

      // Assert.
      expect(document.toJson())
        .toStrictEqual(original);
    });
  });

  describe('listeners', () =>
  {
    it('hears each patch with the new revision', () =>
    {
      // Arrange.
      const document = buildDocument();
      const heard: DocumentChange[] = [];
      document.subscribe(change => heard.push(change));
      const patch = document.setPatch([ 'note' ], 'hello');

      // Act.
      document.apply(patch);

      // Assert.
      expect(heard)
        .toStrictEqual([ { kind: 'patched', key: 'map:7', patch, revision: 1 } ]);
    });

    it('hears nothing about a patch that was refused', () =>
    {
      // Arrange.
      const document = buildDocument();
      const listener = vi.fn();
      document.subscribe(listener);

      // Act.
      const apply = () => document.apply({ kind: 'set', path: [ 'note' ], before: 'stale', after: 'x' });

      // Assert.
      expect(apply)
        .toThrow(PatchConflictError);
      expect([ listener.mock.calls.length, document.revision ])
        .toStrictEqual([ 0, 0 ]);
    });

    it('stops hearing once unsubscribed', () =>
    {
      // Arrange.
      const document = buildDocument();
      const listener = vi.fn();
      const unsubscribe = document.subscribe(listener);

      // Act.
      unsubscribe();
      document.apply(document.setPatch([ 'note' ], 'hello'));

      // Assert.
      expect(listener)
        .not.toHaveBeenCalled();
    });

    it('hears a whole replacement', () =>
    {
      // Arrange.
      const document = buildDocument();
      const heard: DocumentChange[] = [];
      document.subscribe(change => heard.push(change));
      const next = buildMapJson();
      next.displayName = 'From disk';

      // Act.
      document.replace(next as never);

      // Assert.
      expect([ heard, document.property('displayName') ])
        .toStrictEqual([ [ { kind: 'replaced', key: 'map:7', revision: 1 } ], 'From disk' ]);
    });
  });

  describe('patch builders', () =>
  {
    it('leaves unchanged and repeated cells out of a tiles patch', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const patch = document.tilesPatch([ [ 0, 1 ], [ 1, 50 ], [ 1, 60 ], [ 2, 70 ] ]);

      // Assert.
      expect(patch)
        .toStrictEqual({ kind: 'tiles', indices: [ 1, 2 ], before: [ 2, 3 ], after: [ 50, 70 ] });
    });

    it('captures the whole current map in a resize patch', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const patch = document.resizePatch({ width: 1, height: 1, data: [ 1, 2, 3, 4, 5, 6 ] });

      // Assert.
      expect(patch.before)
        .toStrictEqual({ width: 3, height: 2, data: buildMapJson().data });
    });
  });

  describe('patchesTo', () =>
  {
    it('names only the cells that changed in one tiles patch, and each changed field by its own path', () =>
    {
      // Arrange: two cells, the display name and the chest's name change; the door beside the chest does not.
      const document = buildDocument();
      const next = buildMapJson();
      next.data[4] = 99;
      next.data[20] = 98;
      next.displayName = 'Harbor';
      (next.events[3] as { name: string }).name = 'Crate';

      // Act.
      const patches = document.patchesTo(next as never);

      // Assert.
      expect(patches)
        .toStrictEqual([
          { kind: 'tiles', indices: [ 4, 20 ], before: [ 5, 21 ], after: [ 99, 98 ] },
          { kind: 'set', path: [ 'displayName' ], before: 'Test Town', after: 'Harbor' },
          { kind: 'set', path: [ 'events', 3, 'name' ], before: 'Chest', after: 'Crate' },
        ]);
    });

    it('swaps size and tiles in one resize when the size changed, and never sets the size by itself', () =>
    {
      // Arrange.
      const document = buildDocument();
      const next = { ...buildMapJson(), width: 1, height: 1, data: [ 7, 7, 7, 7, 7, 7 ] };

      // Act.
      const patches = document.patchesTo(next as never);

      // Assert.
      expect(patches)
        .toStrictEqual([
          { kind: 'resize', before: { width: 3, height: 2, data: buildMapJson().data }, after: { width: 1, height: 1, data: [ 7, 7, 7, 7, 7, 7 ] } },
        ]);
    });

    it('comes to exactly the new file when applied, and back to exactly the old one when reversed', () =>
    {
      // Arrange: tiles, fields, a new event and a removed key, all at once.
      const document = buildDocument();
      const original = document.toJson();
      const next = buildMapJson();
      next.data[0] = 50;
      next.note = 'changed outside';
      next.events.push({ ...createMapEvent(5, 1, 1), name: 'New' });
      delete (next as Partial<RmmzMap>).encounterList;
      const patches = document.patchesTo(next as never);

      // Act.
      patches.forEach(patch => document.apply(patch));
      const applied = document.toJson();
      [ ...patches ].reverse().forEach(patch => document.apply(invertPatch(patch)));

      // Assert.
      expect([ applied, document.toJson() ])
        .toStrictEqual([ next, original ]);
    });

    it('says nothing for the same file, and applies nothing while working the patches out', () =>
    {
      // Arrange.
      const document = buildDocument();
      const changed = buildMapJson();
      changed.note = 'elsewhere';

      // Act.
      const same = document.patchesTo(buildMapJson() as never);
      document.patchesTo(changed as never);

      // Assert.
      expect([ same, document.revision, document.property('note') ])
        .toStrictEqual([ [], 0, '' ]);
    });

    it('refuses a file that is not a map, or holds a cell that is not a tile id', () =>
    {
      // Arrange.
      const document = buildDocument();
      const badCell = buildMapJson();
      badCell.data[3] = -1;

      // Act.
      const attempts = [ () => document.patchesTo({ displayName: 'no events' }), () => document.patchesTo(badCell as never) ];

      // Assert.
      expect(attempts[0])
        .toThrow(/events list/u);
      expect(attempts[1])
        .toThrow(/not a tile id/u);
    });
  });

  describe('matches', () =>
  {
    it('holds the very file it was built from, and one changed since once it takes that change', () =>
    {
      // Arrange: the fixture file, and one with a cell and the name changed.
      const document = buildDocument();
      const changed = { ...buildMapJson(), displayName: 'Harbor' };
      changed.data[3] = 900;

      // Act.
      const atFirst = [ document.matches(buildMapJson() as unknown as JsonValue), document.matches(changed as unknown as JsonValue) ];
      document.apply(document.tilesPatch([ [ 3, 900 ] ]));
      document.apply(document.setPatch([ 'displayName' ], 'Harbor'));

      // Assert.
      expect([ atFirst, document.matches(changed as unknown as JsonValue), document.matches(buildMapJson() as unknown as JsonValue) ])
        .toStrictEqual([ [ true, false ], true, false ]);
    });

    it('tells apart a file differing by one cell, one event, a field more, or tile data of another length', () =>
    {
      // Arrange: the fixture file four ways, each a near miss.
      const document = buildDocument();
      const cell = buildMapJson();
      cell.data[5] = 901;
      const event = buildMapJson();
      event.events[1] = { ...(event.events[1] as NonNullable<RmmzMap['events'][number]>), name: 'Renamed' };
      const extra = { ...buildMapJson(), meta: {} };
      const shorter = { ...buildMapJson(), data: buildMapJson().data.slice(1) };

      // Act.
      const found = [ cell, event, extra, shorter ].map(file => document.matches(file as unknown as JsonValue));

      // Assert.
      expect(found)
        .toStrictEqual([ false, false, false, false ]);
    });

    it('holds no file that is not a map file at all', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const found = [ document.matches(null), document.matches([ 1, 2 ]), document.matches({ ...buildMapJson(), data: 'cells' } as unknown as JsonValue) ];

      // Assert.
      expect(found)
        .toStrictEqual([ false, false, false ]);
    });
  });

  describe('toJson', () =>
  {
    it('hands back a copy the caller can change freely', () =>
    {
      // Arrange.
      const document = buildDocument();

      // Act.
      const saved = document.toJson();
      saved.displayName = 'Mutated';
      saved.data[0] = 777;

      // Assert.
      expect([ document.property('displayName'), document.cells[0] ])
        .toStrictEqual([ 'Test Town', 1 ]);
    });
  });
});
