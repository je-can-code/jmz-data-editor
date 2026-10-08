/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { StampHistory } from '../../../../src/mapEditor/core/stamps/StampHistory.ts';
import { WindowPaints } from '../../../../src/mapEditor/core/tools/WindowPaint.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { StampsPanel } from '../../../../src/mapEditor/workspace/panels/StampsPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The Stamps panel lists every stamp copied in the window this session, newest first, each with a picture and what it
 * holds, and the map it came from, a stamp copied while the panel is open joining at once. Clicking a stamp takes it up
 * as the brush, for the workspace's own maps, as the palette picks for them; clicking the stamp in hand again, or Esc
 * while the panel has the keys, puts it down and takes up the tool held before. The stamp in hand shows pressed. With
 * no stamp yet, it says how one is made.
 */
describe('StampsPanel', () =>
{
  /**
   * Renders the panel in a workspace with no project server, over a window's stamps.
   * @returns {object} The stamps, the window's paint and the controller.
   */
  const renderPanel = () =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    const stamps = new StampHistory('window-a');
    const paints = new WindowPaints(window);
    const services = { hub, api: null, stamps, paints } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    return { stamps, painting: paints.main.painting, controller };
  };

  /**
   * Reads what each card says, top to bottom.
   * @returns {string[]} The cards' words.
   */
  const cards = (): string[] =>
  {
    return screen.queryAllByTestId('stamp-card').map(card => card.textContent ?? '');
  };

  /**
   * A stamp of three events copied off map 12.
   */
  const threeEvents = () => stampOf({ id: 'window-a:1', mapId: 12, width: 3, events: [ 1, 2, 3 ].map(id => createMapEvent(id, id - 1, 0)) });

  /**
   * A stamp of a piece of tiles from layer 4 copied off map 7.
   */
  const pieceOfLayerFour = () => stampOf({ id: 'window-a:2', mapId: 7, width: 2, events: [], tiles: { layers: [ 3 ], values: [ 10, 11 ], calledFor: [ -1, -1 ] } });

  it('says how a stamp is made while there is none', () =>
  {
    // Arrange: nothing beyond the panel.

    // Act.
    renderPanel();

    // Assert.
    expect([ cards(), screen.queryByText('Copy part of a map with Ctrl+C and it lands here as a stamp, ready to place again.') !== null ])
      .toStrictEqual([ [], true ]);
  });

  it('lists the stamps newest first, each with what it holds and the map it came from, one joining while it is open', () =>
  {
    // Arrange.
    const { stamps } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
    });

    // Act.
    act(() =>
    {
      stamps.add(pieceOfLayerFour());
    });

    // Assert.
    expect(cards())
      .toStrictEqual([ '2 by 1 tiles from layer 4From Map 7', '3 eventsFrom Map 12' ]);
  });

  it('takes a stamp clicked up as the brush, pressed, and puts it down when clicked again, back to the tool held before', () =>
  {
    // Arrange: the pen in hand.
    const { stamps, painting } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
      painting.setTool('pen');
    });

    // Act.
    fireEvent.click(screen.getByTestId('stamp-card'));
    const taken = [ painting.settings.tool, painting.settings.stamp?.id, screen.getByTestId('stamp-card').getAttribute('aria-pressed') ];
    fireEvent.click(screen.getByTestId('stamp-card'));

    // Assert.
    expect([ taken, painting.settings.tool, screen.getByTestId('stamp-card').getAttribute('aria-pressed') ])
      .toStrictEqual([ [ 'stamp', 'window-a:1', 'true' ], 'pen', 'false' ]);
  });

  it('draws each stamp\'s picture, loading the character sheets its events show through the project\'s images', async () =>
  {
    // Arrange: a project whose server has no such sheet, and canvases that record what is drawn on them.
    const drawn: string[] = [];
    const context = {
      clearRect: () => undefined,
      drawImage: () => drawn.push('image'),
      beginPath: () => undefined,
      arc: (x: number, y: number) => drawn.push(`dot ${x},${y}`),
      fill: () => undefined,
      stroke: () => undefined,
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => context) as unknown as HTMLCanvasElement['getContext']);
    const loadImage = vi.fn(async () => null);
    const hub = new DocumentHub({ clientId: 'window-a' });
    const stamps = new StampHistory('window-a');
    const services = {
      hub,
      api: { loadImage },
      stamps,
      paints: new WindowPaints(window),
      openDocument: () => Promise.reject(new Error('no tilesets in this test')),
    } as unknown as MapEditorServices;
    const hero = { ...createMapEvent(1, 0, 0), pages: [ { ...createMapEvent(1, 0, 0).pages[0], image: { tileId: 0, characterName: 'Hero', direction: 2, pattern: 1, characterIndex: 0 } } ] };
    stamps.add(stampOf({ events: [ hero ] }));

    // Act.
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={new WorkspaceController(services)}>
          <StampsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await Promise.resolve();
    });
    getContext.mockRestore();

    // Assert: the sheet asked for, and, missing, the event drawn as a dot in the middle of its one 48-pixel cell.
    expect([ loadImage.mock.calls, drawn.at(-1) ])
      .toStrictEqual([ [ [ 'characters', 'Hero' ] ], 'dot 24,24' ]);
  });

  it('takes up another stamp in place of the one in hand, and puts the one in hand down on Esc', () =>
  {
    // Arrange: two stamps, the older one in hand, with the events in hand before it.
    const { stamps, painting } = renderPanel();
    act(() =>
    {
      stamps.add(threeEvents());
      stamps.add(pieceOfLayerFour());
    });
    fireEvent.click(screen.getAllByTestId('stamp-card')[1]);

    // Act: the newer one clicked, then Esc, then Esc again with nothing in hand.
    fireEvent.click(screen.getAllByTestId('stamp-card')[0]);
    const swapped = painting.settings.stamp?.id;
    const escape = fireEvent.keyDown(screen.getByTestId('stamps-panel'), { key: 'Escape' });
    const again = fireEvent.keyDown(screen.getByTestId('stamps-panel'), { key: 'Escape' });

    // Assert: fireEvent answers false for a key the panel took.
    expect([ swapped, escape, again, painting.settings.tool ])
      .toStrictEqual([ 'window-a:2', false, true, 'events' ]);
  });
});
