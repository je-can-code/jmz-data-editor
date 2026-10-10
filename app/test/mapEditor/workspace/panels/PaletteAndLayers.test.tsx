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
import type { Brush } from '../../../../src/mapEditor/core/tools/brush.ts';
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
   * no marks saved, the page's own window painting with a linked paint of its own. Map 6, on tileset 4 too, opens from
   * its file once the workspace's openMap6 lets it, so whatever waits for it can be seen waiting, and map6Opened settles
   * once it is held.
   * @returns {{ hub: DocumentHub, controller: WorkspaceController, paint: WindowPaint, openMap6: () => void, map6Opened:
   * Promise<void> }} The hub, the workspace, the page's paint, what lets map 6 open, and what settles once it has.
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
      'map:6': buildMapJson(),
    };
    let openMap6 = (): void => undefined;
    let opened = (): void => undefined;
    const map6Opens = new Promise<void>(resolve =>
    {
      openMap6 = resolve;
    });
    const map6Opened = new Promise<void>(resolve =>
    {
      opened = resolve;
    });
    const openDocument = async (key: DocumentKey) =>
    {
      // map 6 waits for the test to let it open, and says when it has.
      if (key !== 'map:6')
      {
        return hub.adopt(key, contents[key] as JsonValue);
      }

      await map6Opens;
      const document = hub.adopt(key, contents[key] as JsonValue);
      opened();
      return document;
    };

    // a server with no pictures and marks already saved, so nothing is seeded.
    const api = {
      clientId: 'window-a',
      loadImage: async () => null,
      loadEditorData: async () => contents[TILESET_MARKS_DOCUMENT],
    } as unknown as MapEditorApi;
    const paints = new WindowPaints(window);
    unlinks.push(paints.main.link());
    const controller = new WorkspaceController({ hub, api, openDocument, paints } as unknown as MapEditorServices);
    return { hub, controller, paint: paints.main, openMap6: () => openMap6(), map6Opened };
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

    // the palette above mounted off a tree and a tileset that load through promises the render kicks off but does not
    // await, so its subscription to the mode (the effect behind useSyncExternalStore) can still be unregistered when
    // this click fires; the store flips with no one listening, and only the chip's own later catch-up render shows it.
    // waiting for the chip settles that before the mode is read back out, rather than racing it under suite load.
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

  /**
   * A brush of tile 2 on a tileset, as the eyedropper hands the window one picked off a map drawn with it.
   * @param {number} tilesetId The tileset.
   * @returns {Brush} The brush.
   */
  const eyedropped = (tilesetId: number): Brush => ({ kind: 'tiles', tilesetId, width: 1, height: 1, cells: [ 2 ] });

  /**
   * Shows the cave's palette, then puts a brush in the window's hand as the eyedropper does.
   * @param {Brush} brush The brush.
   * @returns {Promise<ReturnType<typeof buildWorkspace>>} The workspace.
   */
  const caveWithBrush = async (brush: Brush) =>
  {
    const workspace = buildWorkspace();
    render(
      <WorkspaceProvider controller={workspace.controller}>
        <PalettePanel/>
      </WorkspaceProvider>
    );
    act(() => workspace.controller.selectTreeMaps([ 5 ]));
    await screen.findByTestId('palette');
    act(() => workspace.paint.painting.setBrush(brush));
    return workspace;
  };

  /**
   * Picks map 6 alone in the tree before it is open, so the palette goes out of view while it waits for the map, as it
   * does while a blueprint's tab opens, then lets the map open, the palette coming back with every effect of its showing
   * run before this settles.
   * @param {ReturnType<typeof buildWorkspace>} workspace The workspace.
   * @returns {Promise<boolean>} Whether the palette went out of view meanwhile and is back.
   */
  const comeBackOnMap6 = async (workspace: ReturnType<typeof buildWorkspace>): Promise<boolean> =>
  {
    act(() => workspace.controller.selectTreeMaps([ 6 ]));
    const waited = screen.queryByText('Open a map to see its tiles here.') !== null;
    await act(async () =>
    {
      workspace.openMap6();
      await workspace.map6Opened;
    });
    return waited && screen.queryByTestId('palette') !== null;
  };

  it('keeps a brush the eyedropper picked when the palette comes back into view on its tileset, as a map opening brings it', async () =>
  {
    // Arrange: a brush picked off the cave, which draws with tileset 4.
    const workspace = await caveWithBrush(eyedropped(4));

    // Act: map 6, on tileset 4 too, picked before it is open.
    const waited = await comeBackOnMap6(workspace);

    // Assert.
    expect([ waited, workspace.paint.painting.settings.brush, workspace.paint.selection.brush ])
      .toStrictEqual([ true, eyedropped(4), eyedropped(4) ]);
  });

  it('hands the window the pick its palette remembers when it comes into view on a tileset the brush in hand is not from', async () =>
  {
    // Arrange: the cave's shadow pen picked, then a brush from tileset 7 put in hand.
    const workspace = await caveWithBrush(eyedropped(7));
    fireEvent.click(screen.getByRole('tab', { name: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shadow pen' }));
    act(() => workspace.paint.painting.setBrush(eyedropped(7)));

    // Act.
    const waited = await comeBackOnMap6(workspace);

    // Assert: the shadow pen tileset 4's palette remembers is back in hand.
    expect([ waited, workspace.paint.painting.settings.brush ])
      .toStrictEqual([ true, { kind: 'shadows', tilesetId: 4, width: 1, height: 1, cells: [] } ]);
  });

  it('replaces a brush the eyedropper picked with a pick in the palette once it is back in view', async () =>
  {
    // Arrange: a brush picked off the cave, kept as the palette came back on map 6.
    const workspace = await caveWithBrush(eyedropped(4));
    await comeBackOnMap6(workspace);

    // Act.
    fireEvent.click(screen.getByRole('tab', { name: 'R' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shadow pen' }));

    // Assert.
    expect(workspace.paint.painting.settings.brush)
      .toStrictEqual({ kind: 'shadows', tilesetId: 4, width: 1, height: 1, cells: [] });
  });

  it('leaves a brush the eyedropper picked in hand when only the palette\'s tab changes', async () =>
  {
    // Arrange.
    const workspace = await caveWithBrush(eyedropped(4));

    // Act.
    fireEvent.click(screen.getByRole('tab', { name: 'B' }));

    // Assert: the tab changed, and the brush did not.
    expect([ screen.getByRole('tab', { name: 'B' }).getAttribute('aria-selected'), workspace.paint.painting.settings.brush ])
      .toStrictEqual([ 'true', eyedropped(4) ]);
  });
});
