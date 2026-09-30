/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { IDockviewPanelProps } from 'dockview-react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapTreePanel, type MapTreeParams } from '../../../../src/mapEditor/workspace/panels/MapTreePanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The tree's history lives only as long as the window, so a delete is the one tree operation that can outlive its
 * undo. The tree owes the author a look before anything goes: Delete, from the key or the right-click menu, asks in
 * place above the rows, saying how many maps the delete takes with every branch counted, and nothing is deleted
 * until the author says so. The question blocks nothing else: Escape or Keep withdraws it, and so does picking other
 * maps, since it stood for the ones picked when it was asked.
 *
 * A branch the author closes stays closed. Closing one that holds the picked map picks the branch's own map instead,
 * rather than opening the branch straight back up to show the pick; picks outside it stay. A map picked from
 * elsewhere (a paste, an undone delete) still opens the branches above it.
 */
describe('MapTreePanel', () =>
{
  const { scrollIntoView } = Element.prototype;

  beforeEach(() =>
  {
    // the page under test has no layout to scroll, and the tree scrolls its pick into view.
    Element.prototype.scrollIntoView = () => undefined;
  });

  afterEach(() =>
  {
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  /**
   * Renders the tree panel over the fixture tree, with the deletes it asks for recorded rather than made.
   * @param {number[]} expanded The branches open to begin with: the world and the town, unless said otherwise.
   * @returns {Promise<object>} The controller and the recorded deletes.
   */
  const renderTree = async (expanded: number[] = [ 1, 2 ]) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    const openDocument = async (key: DocumentKey) => hub.adopt(key, buildTreeRows() as unknown as JsonValue);
    const services = { hub, api: {} as MapEditorApi, openDocument } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    const deleteMaps = vi.spyOn(controller, 'deleteMaps').mockResolvedValue(undefined);
    const props = { api: { updateParameters: () => undefined }, params: { expanded } } as unknown as IDockviewPanelProps<MapTreeParams>;
    render(
      <WorkspaceProvider controller={controller}>
        <MapTreePanel {...props}/>
      </WorkspaceProvider>
    );

    await screen.findByText('Town');
    return { controller, deleteMaps };
  };

  /**
   * Reads the question the tree is asking about a delete, without its buttons.
   * @returns {string | null} The question, or null when none is showing.
   */
  const question = (): string | null =>
  {
    return screen.queryByTestId('delete-confirm')?.querySelector('.MuiAlert-message')?.textContent ?? null;
  };

  it('asks how many maps go before deleting a branch, and deletes nothing yet', async () =>
  {
    // Arrange: the town, which holds the inn, is picked.
    const { controller, deleteMaps } = await renderTree();
    act(() => controller.selectTreeMaps([ 2 ]));

    // Act.
    fireEvent.keyDown(screen.getByTestId('map-tree'), { key: 'Delete' });

    // Assert.
    expect([ question(), deleteMaps.mock.calls.length ])
      .toStrictEqual([ 'Delete "Town" and 1 map inside? This removes 2 maps.', 0 ]);
  });

  it('deletes the maps it asked about once the author says so', async () =>
  {
    // Arrange.
    const { controller, deleteMaps } = await renderTree();
    act(() => controller.selectTreeMaps([ 2 ]));
    fireEvent.keyDown(screen.getByTestId('map-tree'), { key: 'Delete' });

    // Act.
    fireEvent.click(within(screen.getByTestId('delete-confirm')).getByRole('button', { name: 'Delete' }));

    // Assert.
    expect([ deleteMaps.mock.calls, screen.queryByTestId('delete-confirm') ])
      .toStrictEqual([ [ [ [ 2 ] ] ], null ]);
  });

  it('asks the same from the right-click menu', async () =>
  {
    // Arrange.
    await renderTree();
    fireEvent.contextMenu(screen.getByText('Cave'));

    // Act.
    fireEvent.click(screen.getByRole('menuitem', { name: /^Delete/u }));

    // Assert.
    expect(question())
      .toBe('Delete "Cave"? This removes 1 map.');
  });

  it('keeps the maps when the author says keep, or presses Escape', async () =>
  {
    // Arrange.
    const { controller, deleteMaps } = await renderTree();
    act(() => controller.selectTreeMaps([ 2 ]));
    fireEvent.keyDown(screen.getByTestId('map-tree'), { key: 'Delete' });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    const afterKeep = screen.queryByTestId('delete-confirm');
    fireEvent.keyDown(screen.getByTestId('map-tree'), { key: 'Delete' });
    fireEvent.keyDown(screen.getByTestId('delete-confirm'), { key: 'Escape' });

    // Assert.
    expect([ afterKeep, screen.queryByTestId('delete-confirm'), deleteMaps.mock.calls.length ])
      .toStrictEqual([ null, null, 0 ]);
  });

  /**
   * Finds the tree's row for a map.
   * @param {string} name The map's name.
   * @returns {HTMLElement} Its row.
   */
  const rowOf = (name: string): HTMLElement =>
  {
    return screen.getByText(name).closest('[role="treeitem"]') as HTMLElement;
  };

  it('closes a branch holding the picked map for good, picking the branch instead', async () =>
  {
    // Arrange: the inn, inside the town, is picked.
    const { controller } = await renderTree();
    act(() => controller.selectTreeMaps([ 3 ]));

    // Act.
    fireEvent.click(within(rowOf('Town')).getByRole('button', { name: 'Close branch' }));

    // Assert.
    expect([ controller.getState().treeSelection, rowOf('Town').getAttribute('aria-expanded'), screen.queryByText('Inn') ])
      .toStrictEqual([ [ 2 ], 'false', null ]);
  });

  it('closes a branch without touching a pick outside it', async () =>
  {
    // Arrange: the cave, beside the town, is picked.
    const { controller } = await renderTree();
    act(() => controller.selectTreeMaps([ 5 ]));

    // Act.
    fireEvent.click(within(rowOf('Town')).getByRole('button', { name: 'Close branch' }));

    // Assert.
    expect([ controller.getState().treeSelection, rowOf('Town').getAttribute('aria-expanded'), screen.queryByText('Inn') ])
      .toStrictEqual([ [ 5 ], 'false', null ]);
  });

  it('still opens the branches above a map picked from elsewhere', async () =>
  {
    // Arrange: only the world is open, so the inn is out of sight inside the closed town.
    const { controller } = await renderTree([ 1 ]);
    const hiddenBefore = screen.queryByText('Inn');

    // Act.
    act(() => controller.selectTreeMaps([ 3 ]));

    // Assert.
    expect([ hiddenBefore, rowOf('Town').getAttribute('aria-expanded'), rowOf('Inn').getAttribute('aria-selected') ])
      .toStrictEqual([ null, 'true', 'true' ]);
  });

  it('withdraws the question when other maps are picked', async () =>
  {
    // Arrange.
    const { controller, deleteMaps } = await renderTree();
    act(() => controller.selectTreeMaps([ 2 ]));
    fireEvent.keyDown(screen.getByTestId('map-tree'), { key: 'Delete' });

    // Act.
    act(() => controller.selectTreeMaps([ 5 ]));

    // Assert.
    expect([ screen.queryByTestId('delete-confirm'), deleteMaps.mock.calls.length ])
      .toStrictEqual([ null, 0 ]);
  });
});
