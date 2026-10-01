/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { EventSelection } from '../../../../src/mapEditor/core/events/EventSelection.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { MapWithQuickPanel, wantsQuickPanel } from '../../../../src/mapEditor/views/quickPanel/MapWithQuickPanel.tsx';
import { hubWith, oreChest } from '../../support/eventKindFixtures.ts';

// the map view draws through the GPU, which this test has no use for: the panel beside it is what is under test.
vi.mock('../../../../src/mapEditor/render/MapView.tsx', () => ({ MapView: () => null }));

/*
 * The map page can stand a map's quick panel beside it (?quick=1), the two sharing one selection as they do in the
 * workspace, so the speed script measures selecting and dragging events with the panel's renders counted. The panel
 * must follow that selection, showing the events picked on this map and nothing for a pick on any other, and the page
 * asks for it only with quick=1.
 */
describe('MapWithQuickPanel', () =>
{
  /**
   * Renders map 1, holding a chest in slot 3, with its quick panel and a selection the test drives.
   * @returns {EventSelection} The selection the map and the panel share.
   */
  const renderPage = (): EventSelection =>
  {
    const { hub } = hubWith([ oreChest(3) ]);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    const selection = new EventSelection();
    render(
      <MapEditorServicesProvider services={{ hub, api: null, modules } as unknown as MapEditorServices}>
        <MapWithQuickPanel mapId={1} selection={selection}/>
      </MapEditorServicesProvider>
    );
    return selection;
  };

  it('shows the quick panel of the events selected on its map', () =>
  {
    // Arrange.
    const selection = renderPage();

    // Act.
    act(() => selection.select(1, [ 3 ]));

    // Assert.
    expect(screen.getByTestId('quick-kind-core.chest').textContent)
      .toContain('chest-ore · 1, 1');
  });

  it('shows nothing for events picked on another map', () =>
  {
    // Arrange: map 2 holds no chest in this window, so a pick there must not read map 1's slot 3.
    const selection = renderPage();

    // Act.
    act(() => selection.select(2, [ 3 ]));

    // Assert.
    expect([ screen.queryByTestId('quick-kind-core.chest'), screen.getByText('Pick an event on a map to change its settings here.') !== null ])
      .toStrictEqual([ null, true ]);
  });

  it('is asked for by the map page with quick=1, and only then', () =>
  {
    // Arrange: the page's query strings, with and without it.
    const searches = [ '?map=361&quick=1', '?map=361', '?map=361&quick=0', '?quick=yes' ];

    // Act.
    const wanted = searches.map(wantsQuickPanel);

    // Assert.
    expect(wanted)
      .toStrictEqual([ true, false, false, false ]);
  });
});
