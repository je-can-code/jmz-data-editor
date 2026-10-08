/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { centreOf } from '../../../src/mapEditor/workspace/CentreKeeper.ts';
import { addDefaultPanels } from '../../../src/mapEditor/workspace/defaultLayout.ts';
import { WorkspaceController } from '../../../src/mapEditor/workspace/WorkspaceController.ts';
import { createRealDock, describeGrid, describeGroups, settle, type RealDock } from '../support/realDock.ts';

/*
 * The centre never goes. Closing the last map in it, dragging it into another group or tearing it out into a window of
 * its own leaves the centre where it was, at the size it had, showing the start panel, and the next map opens there,
 * just as large. Before, the dock took the emptied group away, its neighbours spread over the space, and the next map
 * was split off beside the map tree: a pane a quarter of the window high in a side column, which grew only by crushing
 * the tree, the palette and the layers. A map put back from a closed window comes home to the front of the centre, never
 * behind the start panel, whose tab is hidden while maps share its group.
 *
 * The dock here is the real one, in the workspace's default layout on a 1920 by 1032 window; its windows are faked.
 */
describe('CentreKeeper', () =>
{
  let dock: RealDock;
  let stops: (() => void)[];

  beforeEach(() =>
  {
    dock = createRealDock();
    stops = [];
  });

  afterEach(() =>
  {
    stops.forEach(stop => stop());
    dock.dispose();
  });

  /**
   * Lays the workspace out as it starts, with the controller and both keepers watching the dock.
   * @returns {{ api: DockviewApi, controller: WorkspaceController }} The dock and the workspace's controller.
   */
  const layOut = () =>
  {
    const { api } = dock;
    api.layout(1920, 1032);
    const controller = new WorkspaceController({ hub: new DocumentHub({ clientId: 'window-a' }), api: null } as unknown as MapEditorServices);
    controller.attach(api);
    stops.push(controller.centre.attach(api), controller.popouts.attach(api));
    addDefaultPanels(api);
    return { api, controller };
  };

  /**
   * Reads the centre: its panels, the one in front, and its size.
   * @param {DockviewApi} api The dock.
   * @returns {string} Such as "start+map-1, map-1 in front, 1260x1032".
   */
  const centre = (api: DockviewApi): string =>
  {
    const group = centreOf(api);
    if (group === null)
    {
      return 'none';
    }

    const front = group.activePanel?.id ?? 'nothing';
    return `${group.panels.map(panel => panel.id).join('+')}, ${front} in front, ${Math.round(group.api.width)}x${Math.round(group.api.height)}`;
  };

  it('stays where it was when its last map closes, showing the start panel, and opens the next map there at that size', async () =>
  {
    // Arrange: a map opened and closed again.
    const { api, controller } = layOut();
    const first = controller.openMap(1) as IDockviewPanel;
    await settle();
    first.api.close();
    await settle();
    const afterClosing = [ describeGrid(api), centre(api) ];

    // Act.
    controller.openMap(384);
    await settle();

    // Assert: the centre kept its place and size both times; the side columns never moved.
    expect([ afterClosing, describeGrid(api), centre(api) ])
      .toStrictEqual([
        [ [ 'map-tree', 'palette+stamps', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ], 'start, start in front, 1260x1032' ],
        [ 'map-tree', 'palette+stamps', 'layers', 'start+map-384', 'map-properties+quick-settings', 'history+events' ],
        'start+map-384, map-384 in front, 1260x1032',
      ]);
  });

  it('stays, showing the start panel, when its last map is dragged into another group', async () =>
  {
    // Arrange.
    const { api, controller } = layOut();
    const map = controller.openMap(1) as IDockviewPanel;
    await settle();

    // Act: the map dropped among the palette's tabs, as dragging its tab there does.
    map.api.moveTo({ group: (api.getPanel('palette') as IDockviewPanel).group, position: 'center' });
    await settle();

    // Assert.
    expect([ describeGrid(api), centre(api) ])
      .toStrictEqual([
        [ 'map-tree', 'palette+stamps+map-1', 'layers', 'start', 'map-properties+quick-settings', 'history+events' ],
        'start, start in front, 1260x1032',
      ]);
  });

  it('stays when its last map is torn out, and takes the map back in front when its window closes', async () =>
  {
    // Arrange.
    const { api, controller } = layOut();
    const map = controller.openMap(1) as IDockviewPanel;
    await settle();

    // Act: torn out, then the window closed by hand.
    await controller.popouts.tearOutBeside(map);
    await settle();
    const whileTornOut = [ describeGroups(api), centre(api) ];
    dock.popouts[0].closeByHand();
    await settle();

    // Assert.
    expect([ whileTornOut, describeGroups(api), centre(api) ])
      .toStrictEqual([
        [
          [ 'grid:map-tree', 'grid:palette+stamps', 'grid:layers', 'grid:start', 'grid:map-properties+quick-settings', 'grid:history+events', 'popout:map-1' ],
          'start, start in front, 1260x1032',
        ],
        [ 'grid:map-tree', 'grid:palette+stamps', 'grid:layers', 'grid:start+map-1', 'grid:map-properties+quick-settings', 'grid:history+events' ],
        'start+map-1, map-1 in front, 1260x1032',
      ]);
  });

  it('never tears out the start panel', async () =>
  {
    // Arrange.
    const { api, controller } = layOut();

    // Act.
    const opened = await controller.popouts.tearOutBeside(api.getPanel('start') as IDockviewPanel);
    await settle();

    // Assert.
    expect([ opened, dock.popouts.length, centre(api) ])
      .toStrictEqual([ false, 0, 'start, start in front, 1260x1032' ]);
  });

  /**
   * Adds a map to the centre behind whatever is in front there, the way a map put back from a closed window lands.
   * @param {DockviewApi} api The dock.
   */
  const addBehind = (api: DockviewApi) =>
  {
    const group = centreOf(api) as DockviewGroupPanel;
    api.addPanel({ id: 'map-1', component: 'map', title: 'Map 1', position: { referenceGroup: group, direction: 'within' }, inactive: true });
  };

  it('brings a map that landed behind the start panel to the front', async () =>
  {
    // Arrange.
    const { api } = layOut();

    // Act.
    addBehind(api);
    await settle();

    // Assert.
    expect(centre(api))
      .toBe('start+map-1, map-1 in front, 1260x1032');
  });

  it('leaves a map behind the start panel where it landed once it stops watching', async () =>
  {
    // Arrange: the keepers stopped.
    const { api } = layOut();
    stops.splice(0).forEach(stop => stop());

    // Act.
    addBehind(api);
    await settle();

    // Assert: nothing brought it forward.
    expect(centre(api))
      .toBe('start+map-1, start in front, 1260x1032');
  });
});
