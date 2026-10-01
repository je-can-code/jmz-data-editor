import { describe, expect, it } from 'vitest';
import type { JsonObject } from '../../../../src/mapEditor/core/model/json.ts';
import {
  chooseCentre,
  hasRoomForCentre,
  isStartPanel,
  isStartTabHidden,
  panelToBringForward,
  refusesDrop,
  type CentreCandidate,
} from '../../../../src/mapEditor/core/workspace/centre.ts';

/*
 * The centre is the one place in the workspace that never goes: the group holding the start panel, where maps open.
 * The dock takes away any group left empty, so the start panel staying there is what keeps the centre at its size when
 * the last map in it closes, is dragged off or is torn out; without it the neighbours spread over the space and the
 * next map lands in a sliver of a side column, which no amount of dragging makes usable.
 *
 * These rules owe the workspace: the start panel's tab hiding exactly while anything else shares its group; the start
 * panel never left in front of a map it shares the centre with; a centre for every restored layout (the start panel's
 * own group, else the roomiest group of maps in the main window, else none, so the layout is laid out afresh, which a
 * saved layout can be told apart for before it is rebuilt); and a refusal of exactly the drops that would carry the
 * start panel, or the whole centre, away, while every map stays free to come and go.
 */
describe('isStartPanel', () =>
{
  it('names the start panel and nothing else', () =>
  {
    // Arrange: the start panel, a map, and a panel whose id merely begins the same way.
    const ids = [ 'start', 'map-7', 'start-2' ];

    // Act.
    const found = ids.map(isStartPanel);

    // Assert.
    expect(found)
      .toStrictEqual([ true, false, false ]);
  });
});

describe('isStartTabHidden', () =>
{
  it('hides the start tab while anything shares its group, and shows it alone', () =>
  {
    // Arrange: the start panel alone, with a map, and with the palette dragged in.
    const groups = [ [ 'start' ], [ 'start', 'map-7' ], [ 'palette', 'start' ] ];

    // Act.
    const hidden = groups.map(isStartTabHidden);

    // Assert.
    expect(hidden)
      .toStrictEqual([ false, true, true ]);
  });
});

describe('panelToBringForward', () =>
{
  it('brings forward the last other panel when the start panel is in front of company', () =>
  {
    // Arrange: two maps came home behind the start panel.
    const panelIds = [ 'map-3', 'start', 'map-9' ];

    // Act.
    const forward = panelToBringForward(panelIds, 'start');

    // Assert.
    expect(forward)
      .toBe('map-9');
  });

  it('leaves a map in front where it is, and the start panel in front of nothing', () =>
  {
    // Arrange: a map in front of the start panel; the start panel alone; nothing in front at all.
    const cases: [ string[], string | null ][] = [ [ [ 'start', 'map-3' ], 'map-3' ], [ [ 'start' ], 'start' ], [ [ 'start', 'map-3' ], null ] ];

    // Act.
    const forward = cases.map(([ panelIds, activeId ]) => panelToBringForward(panelIds, activeId));

    // Assert.
    expect(forward)
      .toStrictEqual([ null, null, null ]);
  });
});

describe('chooseCentre', () =>
{
  /**
   * Builds a group as the rules see it.
   * @param {string} id The group.
   * @param {Partial<CentreCandidate>} rest What else it is.
   * @returns {CentreCandidate} The group.
   */
  const group = (id: string, rest: Partial<CentreCandidate> = {}): CentreCandidate =>
  {
    return { id, inMainWindow: true, panelIds: [], maps: 0, area: 1000, ...rest };
  };

  it('keeps the main window\'s group holding the start panel, however roomy the maps elsewhere', () =>
  {
    // Arrange.
    const groups = [
      group('maps', { panelIds: [ 'map-1', 'map-2' ], maps: 2, area: 900000 }),
      group('centre', { panelIds: [ 'start' ], area: 1000 }),
    ];

    // Act.
    const choice = chooseCentre(groups);

    // Assert.
    expect(choice)
      .toStrictEqual({ kind: 'kept', groupId: 'centre' });
  });

  it('gives the start panel to the roomiest group of maps in the main window, passing over torn-out windows and side panels', () =>
  {
    // Arrange: a layout saved before the centre was permanent, with a start panel left in a torn-out window.
    const groups = [
      group('tree', { panelIds: [ 'map-tree' ], area: 500000 }),
      group('sliver', { panelIds: [ 'map-5' ], maps: 1, area: 20000 }),
      group('middle', { panelIds: [ 'map-301' ], maps: 1, area: 400000 }),
      group('torn', { inMainWindow: false, panelIds: [ 'map-9', 'start' ], maps: 1, area: 2000000 }),
    ];

    // Act.
    const choice = chooseCentre(groups);

    // Assert.
    expect(choice)
      .toStrictEqual({ kind: 'adopted', groupId: 'middle' });
  });

  it('finds no centre when the main window holds neither the start panel nor a map', () =>
  {
    // Arrange: the maps all closed in a layout saved before the centre was permanent, one map still torn out.
    const groups = [ group('tree', { panelIds: [ 'map-tree' ] }), group('torn', { inMainWindow: false, panelIds: [ 'map-9' ], maps: 1 }) ];

    // Act.
    const choice = chooseCentre(groups);

    // Assert.
    expect(choice)
      .toStrictEqual({ kind: 'none' });
  });
});

describe('hasRoomForCentre', () =>
{
  /**
   * Builds a saved layout: the tree in one group of the main window beside a second group, and a torn-out window.
   * @param {string[]} beside The second group's panels.
   * @param {string[]} tornOut The torn-out window's panels.
   * @returns {JsonObject} The layout, as the dock serializes it.
   */
  const saved = (beside: string[], tornOut: string[]): JsonObject =>
  {
    const leaf = (views: string[]) => ({ type: 'leaf', data: { views, activeView: views[0] ?? null, id: views.join('+') }, size: 100 });
    const panel = (id: string) => ({ id, contentComponent: /^map-\d+$/u.test(id) ? 'map' : id, title: id });
    const all = [ 'map-tree', ...beside, ...tornOut ];
    return {
      grid: { root: { type: 'branch', data: [ leaf([ 'map-tree' ]), { type: 'branch', data: [ leaf(beside) ], size: 100 } ], size: 100 }, width: 200, height: 100, orientation: 'HORIZONTAL' },
      panels: Object.fromEntries(all.map(id => [ id, panel(id) ])),
      popoutGroups: [ { data: { views: tornOut, id: 'torn' }, position: null } ],
    } as unknown as JsonObject;
  };

  it('finds room in a main window showing the start panel, or a map nested in a column', () =>
  {
    // Arrange.
    const layouts = [ saved([ 'start' ], []), saved([ 'map-301' ], []) ];

    // Act.
    const room = layouts.map(hasRoomForCentre);

    // Assert.
    expect(room)
      .toStrictEqual([ true, true ]);
  });

  it('finds none when the only maps are torn out, beside panels that are not maps, nor in a layout with no grid', () =>
  {
    // Arrange: a map only in a torn-out window, the properties beside the tree, and a layout missing its grid.
    const layouts = [ saved([ 'map-properties' ], [ 'map-12' ]), { panels: {} } as unknown as JsonObject ];

    // Act.
    const room = layouts.map(hasRoomForCentre);

    // Assert.
    expect(room)
      .toStrictEqual([ false, false ]);
  });
});

describe('refusesDrop', () =>
{
  it('refuses the start panel dragged anywhere, and the centre dragged whole', () =>
  {
    // Arrange.
    const drags = [ { groupId: 'centre', panelId: 'start' }, { groupId: 'centre', panelId: null } ];

    // Act.
    const refused = drags.map(drag => refusesDrop(drag, 'centre'));

    // Assert.
    expect(refused)
      .toStrictEqual([ true, true ]);
  });

  it('lets a map leave the centre, another group move whole, and drags from outside the dock land', () =>
  {
    // Arrange: a map dragged out of the centre, a side group dragged whole, and a drag carrying nothing of the dock's.
    const drags = [ { groupId: 'centre', panelId: 'map-7' }, { groupId: 'side', panelId: null }, undefined ];

    // Act.
    const refused = drags.map(drag => refusesDrop(drag, 'centre'));

    // Assert.
    expect(refused)
      .toStrictEqual([ false, false, false ]);
  });

  it('refuses no whole group while there is no centre', () =>
  {
    // Arrange.
    const drag = { groupId: 'side', panelId: null };

    // Act.
    const refused = refusesDrop(drag, null);

    // Assert.
    expect(refused)
      .toBe(false);
  });
});
