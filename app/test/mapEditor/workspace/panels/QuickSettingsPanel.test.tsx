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
 * The quick settings panel sits in the workspace and shows the event picked out on the map in focus, such as the one
 * the data editor asked to see, with that event's quick panel; with nothing picked, it says how to pick something.
 */
describe('QuickSettingsPanel', () =>
{
  /**
   * Renders the panel in a workspace whose window holds a map with a chest in slot 3.
   * @returns {WorkspaceController} The workspace's controller.
   */
  const renderPanel = (): WorkspaceController =>
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

    // a dock with nothing in it, which takes whatever panel it is given.
    controller.attach({ panels: [], addPanel: () => ({ api: {}, group: {} }), getPanel: () => undefined } as unknown as DockviewApi);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <QuickSettingsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    return controller;
  };

  it('asks for a pick while no event on the map in focus is picked', () =>
  {
    // Arrange.
    const controller = renderPanel();

    // Act.
    act(() => controller.selectTreeMaps([ 1 ]));

    // Assert.
    expect(screen.getByText('Pick an event on a map to change its settings here.'))
      .toBeInTheDocument();
  });

  it('shows the quick panel of the event picked out on the map in focus', async () =>
  {
    // Arrange.
    const controller = renderPanel();

    // Act: the data editor asks for map 1's event 3, which is what picks it out.
    act(() =>
    {
      controller.selectTreeMaps([ 1 ]);
      controller.openMap(1, { focusEventId: 3 });
    });

    // Assert.
    expect((await screen.findByTestId('quick-kind-core.chest')).textContent)
      .toContain('chest-ore · 1, 1');
  });
});
