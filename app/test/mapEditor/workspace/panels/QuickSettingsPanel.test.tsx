/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { DockviewApi } from 'dockview-react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { MAP_INFOS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { QuickSettingsPanel } from '../../../../src/mapEditor/workspace/panels/QuickSettingsPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { hubWith, oreChest } from '../../support/eventKindFixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The quick settings panel sits in the workspace and shows the events selected in the window, the very selection the
 * map views draw, so the panel and the map's highlight never disagree: whichever map is in focus, the panel shows the
 * events picked on the map the selection is on, with their quick panels. An event the data editor asks to see reaches
 * the panel only through that selection, once its map picks it out; with nothing selected, the panel says how to pick
 * something.
 */
describe('QuickSettingsPanel', () =>
{
  /**
   * The line the panel shows with nothing selected.
   */
  const QUIET = 'Pick an event on a map to change its settings here.';

  /**
   * Renders the panel in a workspace whose window holds map 1, with a chest in slot 3, and waits for the map tree,
   * which the panel needs before it can show any map's events: until then it shows nothing whatever is asked of it.
   * @returns {Promise<WorkspaceController>} The workspace's controller.
   */
  const renderPanel = async (): Promise<WorkspaceController> =>
  {
    const { hub } = hubWith([ oreChest(3) ]);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    const openDocument = async (key: DocumentKey) => hub.adopt(key, (key === MAP_INFOS_KEY ? buildTreeRows() : []) as unknown as JsonValue);
    const api = {
      imageUrl: (folder: string, name: string) => `http://api/${folder}/${name}`,
      listImages: async () => [],
      loadMapInfos: async () => buildTreeRows(),
      loadDatabaseNames: async () => { throw new Error('no names here'); },
      loadCommandUsage: async () => { throw new Error('no counts here'); },
    } as unknown as MapEditorApi;
    const services = { hub, api, modules, openDocument } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);

    // a dock with nothing in it, which takes whatever panel it is given; no map view ever mounts in it.
    controller.attach({ panels: [], addPanel: () => ({ api: {}, group: {} }), getPanel: () => undefined } as unknown as DockviewApi);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <QuickSettingsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await controller.tree?.tree();
    });
    return controller;
  };

  it('asks for a pick while nothing is selected, even with a map in focus', async () =>
  {
    // Arrange.
    const controller = await renderPanel();

    // Act.
    act(() => controller.selectTreeMaps([ 1 ]));

    // Assert.
    expect(screen.getByText(QUIET))
      .toBeInTheDocument();
  });

  it('shows the quick panel of the events selected in the window, whatever map is in focus', async () =>
  {
    // Arrange: map 2 is in focus; the selection is on map 1.
    const controller = await renderPanel();
    act(() => controller.selectTreeMaps([ 2 ]));

    // Act.
    act(() => controller.selection.select(1, [ 3 ]));

    // Assert.
    expect((await screen.findByTestId('quick-kind-core.chest')).textContent)
      .toContain('chest-ore · 1, 1');
  });

  it('shows an event the data editor asks for only once its map picks it out, which selects it', async () =>
  {
    // Arrange: map 1 is in focus, and the data editor asks for its event 3; no map view has picked it out yet.
    const controller = await renderPanel();
    act(() =>
    {
      controller.selectTreeMaps([ 1 ]);
      controller.openMap(1, { focusEventId: 3 });
    });
    const beforeThePick = screen.queryByText(QUIET) !== null;

    // Act: the map's view picks the event out, as it does once the map is open.
    act(() => controller.selection.select(1, [ 3 ]));

    // Assert.
    expect([ beforeThePick, (await screen.findByTestId('quick-kind-core.chest')).textContent?.includes('chest-ore · 1, 1') ])
      .toStrictEqual([ true, true ]);
  });

  it('empties once the selection is cleared', async () =>
  {
    // Arrange.
    const controller = await renderPanel();
    act(() => controller.selection.select(1, [ 3 ]));
    await screen.findByTestId('quick-kind-core.chest');

    // Act.
    act(() => controller.selection.clear());

    // Assert.
    expect([ screen.queryByTestId('quick-kind-core.chest'), screen.getByText(QUIET) !== null ])
      .toStrictEqual([ null, true ]);
  });
});
