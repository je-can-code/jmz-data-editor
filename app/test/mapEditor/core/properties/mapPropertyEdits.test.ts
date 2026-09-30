import { describe, expect, it } from 'vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import {
  editMapProperties,
  labelForProperties,
  previewResize,
  resizeMap,
} from '../../../../src/mapEditor/core/properties/mapPropertyEdits.ts';
import { buildMapJson } from '../../support/fixtures.ts';

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
});
