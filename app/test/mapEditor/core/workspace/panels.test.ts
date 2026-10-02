import { describe, expect, it } from 'vitest';
import {
  decodeDraggedMaps,
  directionForDrop,
  encodeDraggedMaps,
  historyOwnedBy,
  isCollapsibleKind,
  isMapPanelParams,
  mapPanelId,
  minimumWidthFor,
  PANEL_COMPONENTS,
  withPanelMinimums,
} from '../../../../src/mapEditor/core/workspace/panels.ts';

/*
 * The workspace's panels are kept in saved layouts and moved between windows, so the bookkeeping around them owes
 * the shell a few exact answers: a map panel's saved parameters name a real map or are refused; every further view
 * of one map gets its own id; a map dropped on a group's middle stacks as a tab while an edge splits the group;
 * only a list of map ids comes off a drag; and undo follows the panel with focus, the tree to the tree's history,
 * a map (or the properties, quick settings or events list of one) to that map's, while the history panel and the
 * placeholders leave it alone. Side panels are never squeezed below a readable width, while maps keep only the dock's small
 * minimum so any number can sit side by side; a saved layout comes back with the minimums panels have now, whatever
 * it was saved with.
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
    it('hands undo to the map, the tree, or the map the properties, quick settings and events list show', () =>
    {
      // Arrange: the properties panel, the quick settings and the events list show map 7.

      // Act.
      const owners = [
        historyOwnedBy(PANEL_COMPONENTS.map, { mapId: 12 }, 7),
        historyOwnedBy(PANEL_COMPONENTS.mapTree, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.properties, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.quick, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.events, {}, 7),
      ];

      // Assert.
      expect(owners)
        .toStrictEqual([ 'map:12', 'tree', 'map:7', 'map:7', 'map:7' ]);
    });

    it('owns no history for the panels following a map while none is in focus, and keeps the last one for panels that own none', () =>
    {
      // Arrange: nothing beyond the panels below.

      // Act.
      const owners = [
        historyOwnedBy(PANEL_COMPONENTS.properties, {}, null),
        historyOwnedBy(PANEL_COMPONENTS.quick, {}, null),
        historyOwnedBy(PANEL_COMPONENTS.events, {}, null),
        historyOwnedBy(PANEL_COMPONENTS.history, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.palette, {}, 7),
        historyOwnedBy(PANEL_COMPONENTS.map, { mapId: 'broken' }, 7),
      ];

      // Assert.
      expect(owners)
        .toStrictEqual([ null, null, null, undefined, undefined, undefined ]);
    });
  });

  describe('minimum widths', () =>
  {
    it('keeps the side panels readable and leaves maps and the start panel to the dock', () =>
    {
      // Arrange: every kind of panel.
      const kinds = Object.values(PANEL_COMPONENTS);

      // Act.
      const minimums = Object.fromEntries(kinds.map(kind => [ kind, minimumWidthFor(kind) ?? null ]));

      // Assert.
      expect(minimums)
        .toStrictEqual({
          'map': null,
          'map-tree': 240,
          'history': 240,
          'map-properties': 300,
          'palette': 240,
          'layers': 240,
          'quick-settings': 300,
          'events': 300,
          'start': null,
        });
    });

    it('gives a saved layout\'s panels the minimums their kinds have now, clearing any their kinds no longer keep', () =>
    {
      // Arrange: a layout saved before minimums existed, with a stale one on a map, and an entry that is no panel.
      const saved = {
        grid: {},
        panels: {
          'map-properties': { id: 'map-properties', contentComponent: 'map-properties', title: 'Map properties' },
          'map-12': { id: 'map-12', contentComponent: 'map', params: { mapId: 12 }, minimumWidth: 500 },
          'history': { id: 'history', contentComponent: 'history', minimumWidth: 90 },
          'odd': 7,
        },
      };

      // Act.
      const sized = withPanelMinimums(saved);

      // Assert.
      expect(sized['panels'])
        .toStrictEqual({
          'map-properties': { id: 'map-properties', contentComponent: 'map-properties', title: 'Map properties', minimumWidth: 300 },
          'map-12': { id: 'map-12', contentComponent: 'map', params: { mapId: 12 } },
          'history': { id: 'history', contentComponent: 'history', minimumWidth: 240 },
          'odd': 7,
        });
    });

    it('leaves a layout without panels as it was', () =>
    {
      // Arrange.
      const saved = { grid: {} };

      // Act.
      const sized = withPanelMinimums(saved);

      // Assert.
      expect(sized)
        .toBe(saved);
    });
  });

  describe('isCollapsibleKind', () =>
  {
    it('collapses every side panel, never a map and never the start panel', () =>
    {
      // Arrange: every registered kind, map and start among them.
      const kinds = Object.values(PANEL_COMPONENTS);

      // Act.
      const collapsible = kinds.map(isCollapsibleKind);

      // Assert.
      expect(Object.fromEntries(kinds.map((kind, index) => [ kind, collapsible[index] ])))
        .toStrictEqual({
          'map': false,
          'map-tree': true,
          'history': true,
          'map-properties': true,
          'palette': true,
          'layers': true,
          'quick-settings': true,
          'events': true,
          'start': false,
        });
    });
  });
});
