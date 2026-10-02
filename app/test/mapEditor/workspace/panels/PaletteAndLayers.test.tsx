/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { cellInspector } from '../../../../src/mapEditor/core/palette/cellInspector.ts';
import { TILESET_MARKS_DOCUMENT } from '../../../../src/mapEditor/core/palette/tilesetMarkEdits.ts';
import { WindowPaints } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { LayersPanel } from '../../../../src/mapEditor/workspace/panels/layers/LayersPanel.tsx';
import { PalettePanel } from '../../../../src/mapEditor/workspace/panels/palette/PalettePanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../../support/fixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The palette and the layers panel, mounted in a workspace.
 *
 * The palette shows the tiles of the map with focus and nothing before a map is picked; its tabs follow the sheets
 * the map's tileset names; switching to passability opens the editor every map follows, and closing the palette
 * closes it. A pick in the palette is made to be painted, so with the events in hand it takes up the pen. The layers
 * panel's strip sets the window's layer choice, and its stack view reads the cell under the pointer and fixes a layer
 * as one step in that map's history, handing undo to it. The drawing itself needs a canvas this environment lacks, so
 * what is checked here is the wiring around it.
 */
describe('the palette and the layers panel', () =>
{
  /**
   * A workspace holding the cave (map 5, the 3 by 2 fixture on tileset 4), with tileset 4 naming A1, A2 and B, and
   * no marks saved, the page's own window painting with a linked paint of its own.
   * @returns {{ hub: DocumentHub, controller: WorkspaceController, paint: WindowPaint }} The hub, the workspace, and the
   * page's paint.
   */
  const buildWorkspace = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:5', buildMapJson() as unknown as JsonValue);
    const tileset = { id: 4, flags: new Array<number>(8192).fill(0), mode: 1, name: 'Cave', note: '', tilesetNames: [ 'A1', 'A2', '', '', '', 'B', '', '', '' ] };
    const contents: Partial<Record<DocumentKey, unknown>> = {
      [MAP_INFOS_KEY]: buildTreeRows(),
      [TILESETS_KEY]: [ null, null, null, null, tileset ],
      [TILESET_MARKS_DOCUMENT]: { schemaVersion: 1, data: { tilesets: {} } },
    };
    const openDocument = async (key: DocumentKey) => hub.adopt(key, contents[key] as JsonValue);

    // a server with no pictures and marks already saved, so nothing is seeded.
    const api = {
      clientId: 'window-a',
      loadImage: async () => null,
      loadEditorData: async () => contents[TILESET_MARKS_DOCUMENT],
    } as unknown as MapEditorApi;
    const paints = new WindowPaints(window);
    unlinks.push(paints.main.link());
    const controller = new WorkspaceController({ hub, api, openDocument, paints } as unknown as MapEditorServices);
    return { hub, controller, paint: paints.main };
  };

  /**
   * Unlinks each test's paint once the test is done.
   */
  const unlinks: (() => void)[] = [];

  afterEach(() =>
  {
    unlinks.splice(0).forEach(unlink => unlink());
    cellInspector.forgetMap(5);
  });

  it('asks for a map before one is picked, then shows the tabs its tileset names', async () =>
  {
    // Arrange.
    const { controller } = buildWorkspace();
    render(
      <WorkspaceProvider controller={controller}>
        <PalettePanel/>
      </WorkspaceProvider>
    );
    const before = screen.queryByText('Open a map to see its tiles here.') !== null;

    // Act.
    act(() => controller.selectTreeMaps([ 5 ]));
    await screen.findByTestId('palette');

    // Assert: A and B are there, C to E are not, and the regions always are.
    const enabled = [ 'A', 'B', 'C', 'D', 'E', 'R' ].map(tab => screen.getByRole('tab', { name: tab }).hasAttribute('disabled') === false);
    expect([ before, enabled, screen.getByText('Pick a tile to paint with.') !== null ])
      .toStrictEqual([ true, [ true, true, false, false, false, true ], true ]);
  });

  it('opens the passability editor for every map to follow, and closes it with the palette', async () =>
  {
    // Arrange.
    const { controller, paint } = buildWorkspace();
    const { unmount } = render(
      <WorkspaceProvider controller={controller}>
        <PalettePanel/>
      </WorkspaceProvider>
    );
    act(() => controller.selectTreeMaps([ 5 ]));
    await screen.findByTestId('palette');

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Passability' }));

    // the flag chips read the editor's mode through useSyncExternalStore, which the click above notifies but does not
    // always finish re-rendering for within the same synchronous act the click runs in; waiting for the chip it draws
    // settles that before the mode is read back out, rather than racing it under whatever load the suite is under.
    await waitFor(() => expect(screen.queryByText('Terrain tag')).not.toBeNull());
    const whileOpen = [ paint.mode.getState().editing, screen.queryByText('Terrain tag') !== null ];
    unmount();

    // Assert.
    expect([ whileOpen, paint.mode.getState().editing ])
      .toStrictEqual([ [ 'passability', true ], 'tiles' ]);
  });

  it('sets the window\'s layer from the strip, which its tools paint on', () =>
  {
    // Arrange.
    const { controller, paint } = buildWorkspace();
    render(
      <WorkspaceProvider controller={controller}>
        <LayersPanel/>
      </WorkspaceProvider>
    );

    // Act.
    fireEvent.click(screen.getByRole('button', { name: '3' }));

    // Assert: layer 3 is tile layer 2.
    expect([ paint.selection.layer, paint.painting.settings.strip ])
      .toStrictEqual([ 2, 2 ]);
  });

  it('reads the cell under the pointer and clears one layer as a step in that map\'s history, handing undo to it', async () =>
  {
    // Arrange: the tilesets held, then the pointer over the cave's cell 1, 0, whose layer 1 holds tile 2.
    const { hub, controller } = buildWorkspace();
    await controller.services.openDocument(TILESETS_KEY);
    render(
      <WorkspaceProvider controller={controller}>
        <LayersPanel/>
      </WorkspaceProvider>
    );
    act(() => cellInspector.hover({ mapId: 5, x: 1, y: 0 }));
    await screen.findByTestId('stack-view');

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Clear layer 1' }));

    // Assert: the cell is empty on layer 1, the step is the map's, and undo now acts on the map.
    expect([ hub.map('map:5').cellAt(1, 0, 0), hub.history('map:5').rows.map(row => row.label), controller.getState().activeHistory ])
      .toStrictEqual([ 0, [ 'Clear layer 1 at 1, 0' ], 'map:5' ]);
  });

  it('takes up the pen when the shadow pen is picked with the events in hand, handing the window its brush', async () =>
  {
    // Arrange: a window with the events in hand, its palette on the regions tab.
    const { controller, paint } = buildWorkspace();
    render(
      <WorkspaceProvider controller={controller}>
        <PalettePanel/>
      </WorkspaceProvider>
    );
    act(() => controller.selectTreeMaps([ 5 ]));
    await screen.findByTestId('palette');
    fireEvent.click(screen.getByRole('tab', { name: 'R' }));
    const before = paint.painting.settings.tool;

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Shadow pen' }));

    // Assert: the shadow brush is the window's, and the pen is in hand to draw with it.
    expect([ before, paint.painting.settings.tool, paint.selection.brush.kind, paint.painting.settings.brush?.kind ])
      .toStrictEqual([ 'events', 'pen', 'shadows', 'shadows' ]);
  });
});
