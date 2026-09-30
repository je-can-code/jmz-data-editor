import { describe, expect, it } from 'vitest';
import {
  decodeDraggedMaps,
  directionForDrop,
  encodeDraggedMaps,
  historyOwnedBy,
  isMapPanelParams,
  mapPanelId,
  PANEL_COMPONENTS,
} from '../../../../src/mapEditor/core/workspace/panels.ts';

/*
 * The workspace's panels are kept in saved layouts and moved between windows, so the bookkeeping around them owes
 * the shell a few exact answers: a map panel's saved parameters name a real map or are refused; every further view
 * of one map gets its own id; a map dropped on a group's middle stacks as a tab while an edge splits the group;
 * only a list of map ids comes off a drag; and undo follows the panel with focus, the tree to the tree's history,
 * a map (or the properties of one) to that map's, while the history panel and the placeholders leave it alone.
 */
describe('panels', () =>
{
  it('accepts map panel parameters naming a real map id, and nothing else', () =>
  {
    // Arrange.
    const candidates: unknown[] = [ { mapId: 12 }, { mapId: 0 }, { mapId: 1.5 }, { mapId: '12' }, {}, null, 12 ];

    // Act.
    const accepted = candidates.map(isMapPanelParams);

    // Assert.
    expect(accepted)
      .toStrictEqual([ true, false, false, false, false, false, false ]);
  });

  it('names the first view of a map after it, and numbers every further view', () =>
  {
    // Arrange.
    const taken = [ 'map-tree', 'map-12', 'map-12-2', 'map-120' ];

    // Act.
    const ids = [ mapPanelId(12, taken), mapPanelId(120, [ 'map-12' ]), mapPanelId(5, taken) ];

    // Assert.
    expect(ids)
      .toStrictEqual([ 'map-12-3', 'map-120', 'map-5' ]);
  });

  it('stacks a map dropped on a group\'s middle, and splits the group from an edge', () =>
  {
    // Arrange: every place a drop can land.

    // Act.
    const directions = [ directionForDrop('center'), directionForDrop('top'), directionForDrop('bottom'), directionForDrop('left'), directionForDrop('right') ];

    // Assert.
    expect(directions)
      .toStrictEqual([ 'within', 'above', 'below', 'left', 'right' ]);
  });

  it('carries dragged maps as a list of ids, and reads nothing else off a drag', () =>
  {
    // Arrange.
    const encoded = encodeDraggedMaps([ 12, 5 ]);

    // Act.
    const decoded = [ decodeDraggedMaps(encoded), decodeDraggedMaps('[12,"x",0,-1,2.5,7]'), decodeDraggedMaps('{"mapId":12}'), decodeDraggedMaps('not json') ];

    // Assert.
    expect(decoded)
      .toStrictEqual([ [ 12, 5 ], [ 12, 7 ], [], [] ]);
  });

  describe('historyOwnedBy', () =>
  {
    it('hands undo to the map, the tree, or the map the properties show', () =>
    {
      // Arrange: the properties panel shows map 7.

      // Act.
      const owners = [
        historyOwnedBy(PANEL_COMPONENTS.map, { mapId: 12 }, 7),
        historyOwnedBy(PANEL_COMPONENTS.mapTree, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.properties, {}, 7),
      ];

      // Assert.
      expect(owners)
        .toStrictEqual([ 'map:12', 'tree', 'map:7' ]);
    });

    it('owns no history for properties showing no map, and keeps the last one for panels that own none', () =>
    {
      // Arrange: nothing beyond the panels below.

      // Act.
      const owners = [
        historyOwnedBy(PANEL_COMPONENTS.properties, {}, null),
        historyOwnedBy(PANEL_COMPONENTS.history, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.palette, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.map, { mapId: 'broken' }, 7),
      ];

      // Assert.
      expect(owners)
        .toStrictEqual([ null, undefined, undefined, undefined ]);
    });
  });
});
