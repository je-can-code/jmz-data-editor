import { describe, expect, it } from 'vitest';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  editMapProperties,
  labelForProperties,
  placementsLostByResize,
  previewResize,
  resizeMap,
} from '../../../../src/mapEditor/core/properties/mapPropertyEdits.ts';
import type { ResizeAnchor } from '../../../../src/mapEditor/core/properties/resizeMap.ts';
import { holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { mapWithEvents } from '../../support/eventFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * Every change the map properties form makes is one named step in the map's own history, so it undoes from
 * wherever the map has focus, like any other edit to it. A change that changes nothing records nothing. A resize
 * is one step too, tiles, event positions and the events left outside all together, and one undo puts the map back
 * exactly as its file had it. A second map in the hub proves each step touches only its own map.
 */
describe('mapPropertyEdits', () =>
{
  /**
   * A hub holding two fixture maps.
   * @returns {DocumentHub} The hub.
   */
  const buildHub = (): DocumentHub =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', buildMapJson() as unknown as JsonValue);
    hub.adopt('map:2', buildMapJson() as unknown as JsonValue);
    return hub;
  };

  /**
   * Reads a held map's file.
   * @param {DocumentHub} hub The hub.
   * @param {number} mapId The map.
   * @returns {RmmzMap} The file.
   */
  const fileOf = (hub: DocumentHub, mapId: number): RmmzMap => hub.document(`map:${mapId}`).toJson() as unknown as RmmzMap;

  describe('editMapProperties', () =>
  {
    it('changes a property as one named step on that map alone, and undoes it', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = editMapProperties(hub, 1, { displayName: 'Harbor' });
      const changed = [ fileOf(hub, 1).displayName, fileOf(hub, 2).displayName ];
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, step?.histories, changed, fileOf(hub, 1) ])
        .toStrictEqual([ 'Change display name', [ 'map:1' ], [ 'Harbor', 'Test Town' ], buildMapJson() ]);
    });

    it('names properties the form shows together by what they share, and different ones generally', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const together = editMapProperties(hub, 1, { autoplayBgm: true, bgm: { name: 'Harbor', pan: 0, pitch: 100, volume: 80 } });
      const apart = editMapProperties(hub, 1, { note: 'n', disableDashing: true });

      // Assert.
      expect([ together?.label, apart?.label, fileOf(hub, 1).bgm.volume, fileOf(hub, 1).disableDashing ])
        .toStrictEqual([ 'Change music', 'Change map properties', 80, true ]);
    });

    it('records nothing for values the map already holds, or for no changes at all', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const steps = [ editMapProperties(hub, 1, { displayName: 'Test Town' }), editMapProperties(hub, 1, {}) ];

      // Assert.
      expect([ steps, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ [ null, null ], [] ]);
    });

    it('labels every property the form edits', () =>
    {
      // Arrange: one property from each group.

      // Act.
      const labels = [ labelForProperties([ 'tilesetId' ]), labelForProperties([ 'parallaxSx', 'parallaxShow' ]), labelForProperties([ 'encounterStep' ]) ];

      // Assert.
      expect(labels)
        .toStrictEqual([ 'Change tileset', 'Change parallax', 'Change encounters' ]);
    });
  });

  describe('resizeMap', () =>
  {
    it('resizes tiles and events as one step, and one undo puts the file back exactly', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = resizeMap(hub, 1, 2, 1, 'bottom-right');
      const resized = fileOf(hub, 1);
      hub.undo(mapHistoryKey(1));

      // Assert: the door fell outside and went; the chest moved into the corner.
      expect([ step?.label, resized.width, resized.height, resized.data.length, resized.events[1], resized.events[3]?.x, resized.events[3]?.y ])
        .toStrictEqual([ 'Resize to 2 by 1', 2, 1, 12, null, 1, 0 ]);
      expect([ fileOf(hub, 1), fileOf(hub, 2) ])
        .toStrictEqual([ buildMapJson(), buildMapJson() ]);
    });

    it('redoes a resize exactly after it was undone', () =>
    {
      // Arrange.
      const hub = buildHub();
      resizeMap(hub, 1, 5, 4, 'center');
      const resized = fileOf(hub, 1);
      hub.undo(mapHistoryKey(1));

      // Act.
      hub.redo(mapHistoryKey(1));

      // Assert.
      expect(fileOf(hub, 1))
        .toStrictEqual(resized);
    });

    it('records nothing when the size stays the same, whatever the anchor', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = resizeMap(hub, 1, 3, 2, 'bottom-right');

      // Assert.
      expect([ step, hub.history(mapHistoryKey(1)).rows ])
        .toStrictEqual([ null, [] ]);
    });

    it('previews which events a resize would remove without changing the map', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const plan = previewResize(hub.map('map:1'), 2, 1, 'top-left');

      // Assert.
      expect([ plan.dropped, fileOf(hub, 1) ])
        .toStrictEqual([ [ 3 ], buildMapJson() ]);
    });
  });

  /*
   * A resize moves every placement of a blueprint recorded on the map with the tiles under it, by the anchor's shift, in
   * the same step; a placement left wholly outside the new size goes with the tiles there, and one left partly on the map
   * stays, its spot past the edge if need be. One whose blueprint is gone, so nothing tells how far it reaches, stays,
   * moved. No other map's placements move, and a window holding no record resizes as it always has.
   *
   * Map 1 is 6 by 4, with the camp (aa22, 2 by 2) placed at 0, 0, 2, 1 and 4, 2; map 2 has the camp at 0, 0 too.
   */
  describe('resizeMap with blueprints placed', () =>
  {
    /**
     * The camp's placements on map 1.
     */
    const CAMPS: readonly PlacedSpot[] = [
      { blueprintId: 'aa22', mapId: 1, x: 0, y: 0 },
      { blueprintId: 'aa22', mapId: 1, x: 2, y: 1 },
      { blueprintId: 'aa22', mapId: 1, x: 4, y: 2 },
    ];

    /**
     * Builds a window holding maps 1 and 2, the camp, and its placements, beside any others given.
     * @param {readonly PlacedSpot[]} others More placements.
     * @returns {DocumentHub} The hub.
     */
    const placedHub = (others: readonly PlacedSpot[] = []): DocumentHub =>
    {
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('map:1', mapWithEvents(6, 4, [ null ]) as unknown as JsonValue);
      hub.adopt('map:2', mapWithEvents(6, 4, [ null ]) as unknown as JsonValue);
      const values = [ 0, 0, 0, 0 ];
      holdBlueprints(hub, { aa22: { name: 'Goblin camp', stamp: stampOf({ width: 2, height: 2, tiles: { layers: [ 0 ], values, calledFor: [ -1, -1, -1, -1 ] }, events: [] }) } });
      holdBlueprintUses(hub, [ ...CAMPS, { blueprintId: 'aa22', mapId: 2, x: 0, y: 0 }, ...others ]);
      return hub;
    };

    /**
     * Reads the corners of the placements on a map, row by row.
     * @param {DocumentHub} hub The hub.
     * @param {number} mapId The map.
     * @returns {string[]} Each placement as "blueprint x,y".
     */
    const cornersOn = (hub: DocumentHub, mapId: number): string[] =>
    {
      return usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)).filter(spot => spot.mapId === mapId).map(spot => `${spot.blueprintId} ${spot.x},${spot.y}`);
    };

    it.each([
      [ 'top-left', [ 'aa22 0,0', 'aa22 2,1', 'aa22 4,2' ] ],
      [ 'top', [ 'aa22 1,0', 'aa22 3,1', 'aa22 5,2' ] ],
      [ 'top-right', [ 'aa22 2,0', 'aa22 4,1', 'aa22 6,2' ] ],
      [ 'left', [ 'aa22 0,1', 'aa22 2,2', 'aa22 4,3' ] ],
      [ 'center', [ 'aa22 1,1', 'aa22 3,2', 'aa22 5,3' ] ],
      [ 'right', [ 'aa22 2,1', 'aa22 4,2', 'aa22 6,3' ] ],
      [ 'bottom-left', [ 'aa22 0,2', 'aa22 2,3', 'aa22 4,4' ] ],
      [ 'bottom', [ 'aa22 1,2', 'aa22 3,3', 'aa22 5,4' ] ],
      [ 'bottom-right', [ 'aa22 2,2', 'aa22 4,3', 'aa22 6,4' ] ],
    ] as const)('grown to 8 by 6 kept %s, moves every placement with the tiles under it in the same step', (anchor, corners) =>
    {
      // Arrange.
      const hub = placedHub();

      // Act.
      const step = resizeMap(hub, 1, 8, 6, anchor as ResizeAnchor);

      // Assert: one step, on map 1's history, map 2's placement staying.
      expect([ step?.histories, cornersOn(hub, 1), cornersOn(hub, 2) ])
        .toStrictEqual([ [ mapHistoryKey(1) ], corners, [ 'aa22 0,0' ] ]);
    });

    it('forgets a placement left wholly outside the new size and keeps one left partly on it, which one undo brings back', () =>
    {
      // Arrange.
      const hub = placedHub();

      // Act: cut to 3 by 2 from the top left; the camp at 4, 2 falls outside, the camp at 2, 1 keeps one of its cells.
      resizeMap(hub, 1, 3, 2, 'top-left');
      const resized = cornersOn(hub, 1);
      hub.undo(mapHistoryKey(1));
      const undone = cornersOn(hub, 1);
      hub.redo(mapHistoryKey(1));

      // Assert.
      expect([ resized, undone, cornersOn(hub, 1) ])
        .toStrictEqual([ [ 'aa22 0,0', 'aa22 2,1' ], [ 'aa22 0,0', 'aa22 2,1', 'aa22 4,2' ], [ 'aa22 0,0', 'aa22 2,1' ] ]);
    });

    it('keeps a placement past the new left edge when the map is cut from the left, its spot outside the map', () =>
    {
      // Arrange.
      const hub = placedHub();

      // Act: cut to 3 wide keeping the right edge, so the old map moves three left.
      resizeMap(hub, 1, 3, 4, 'right');

      // Assert: the camp at 0, 0 is gone; the camp at 2, 1 hangs a cell past the left edge.
      expect(cornersOn(hub, 1))
        .toStrictEqual([ 'aa22 -1,1', 'aa22 1,2' ]);
    });

    it('keeps a placement whose blueprint is gone, moved, since nothing says how far it reaches', () =>
    {
      // Arrange: a placement of a blueprint no longer kept, far to the right.
      const hub = placedHub([ { blueprintId: 'zz99', mapId: 1, x: 5, y: 0 } ]);

      // Act: cut to 2 wide keeping the left edge.
      resizeMap(hub, 1, 2, 4, 'top-left');

      // Assert.
      expect(cornersOn(hub, 1))
        .toStrictEqual([ 'aa22 0,0', 'zz99 5,0' ]);
    });

    it('resizes as it always has in a window holding no record', () =>
    {
      // Arrange.
      const hub = buildHub();

      // Act.
      const step = resizeMap(hub, 1, 2, 1, 'bottom-right');

      // Assert.
      expect(step?.entries.every(entry => entry.document === 'map:1'))
        .toBe(true);
    });

    it('lists the placements a resize would leave wholly outside, before it is made, and none without a record', () =>
    {
      // Arrange.
      const hub = placedHub();
      const plan = previewResize(hub.map('map:1'), 3, 2, 'top-left');

      // Act.
      const lost = [ placementsLostByResize(hub, 1, plan), placementsLostByResize(buildHub(), 1, plan) ];

      // Assert.
      expect([ lost, cornersOn(hub, 1) ])
        .toStrictEqual([ [ [ { blueprintId: 'aa22', x: 4, y: 2 } ], [] ], [ 'aa22 0,0', 'aa22 2,1', 'aa22 4,2' ] ]);
    });
  });
});
