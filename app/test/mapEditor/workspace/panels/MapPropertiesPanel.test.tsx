/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MapEditorApiError, type MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { MapArrival } from '../../../../src/mapEditor/core/properties/arrivals.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapPropertiesPanel } from '../../../../src/mapEditor/workspace/panels/MapPropertiesPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { buildMapJson } from '../../support/fixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * A resize moves the map's tiles and events, and never touches another map, so every transfer landing on the map
 * keeps naming the old tile numbers. The resize form owes the author the list of those transfers before the resize
 * is made: each one whose tile the anchor moves or cuts off, from the maps on disk and from the maps open here as
 * they stand, and none when every landing tile stays put. While the list is being checked, the resize waits.
 *
 * The map being resized is the cave, a 3 by 2 fixture; the town's door lands on its tile 1, 0.
 */
describe('MapPropertiesPanel', () =>
{
  const TOWN_DOOR: MapArrival = { mapId: 2, mapName: 'Town', eventId: 1, eventName: 'Door', pageIndex: 0, x: 1, y: 0 };

  /**
   * Renders the properties panel on the cave, with the server answering the given transfers into it.
   * @param {() => Promise<MapArrival[]>} loadArrivals What the server answers.
   * @returns {Promise<object>} The hub.
   */
  const renderCave = async (loadArrivals: () => Promise<MapArrival[]>) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:5', buildMapJson() as unknown as JsonValue);
    const openDocument = async (key: DocumentKey) =>
    {
      const content = key === MAP_INFOS_KEY ? buildTreeRows() : [ null ];
      return hub.adopt(key === MAP_INFOS_KEY ? MAP_INFOS_KEY : TILESETS_KEY, content as unknown as JsonValue);
    };
    const api = { loadArrivals: vi.fn(loadArrivals) } as unknown as MapEditorApi;
    const controller = new WorkspaceController({ hub, api, openDocument } as unknown as MapEditorServices);
    render(
      <WorkspaceProvider controller={controller}>
        <MapPropertiesPanel/>
      </WorkspaceProvider>
    );

    act(() => controller.selectTreeMaps([ 5 ]));
    await screen.findByLabelText('Width');
    return { hub };
  };

  /**
   * Widens the cave to five tiles, keeping the given edge in place.
   * @param {string} anchor The anchor's name, as the picker reads it.
   */
  const widenKeeping = (anchor: string) =>
  {
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('radio', { name: anchor }));
  };

  it('lists a transfer whose landing tile the resize moves, before the resize is made', async () =>
  {
    // Arrange.
    const { hub } = await renderCave(async () => [ TOWN_DOOR ]);

    // Act: pinned at the right edge, every tile moves two to the right.
    widenKeeping('Right');

    // Assert.
    expect((await screen.findByTestId('resize-transfers')).textContent)
      .toBe('1 transfer lands on this map and will not follow the resize:Town, "Door" (page 1) lands on 1, 0; that spot moves to 3, 0.');
    expect([ hub.map('map:5').width, screen.getByRole('button', { name: 'Resize' }) ])
      .toStrictEqual([ 3, expect.objectContaining({ disabled: false }) ]);
  });

  it('lists nothing when every landing tile stays where it was', async () =>
  {
    // Arrange.
    await renderCave(async () => [ TOWN_DOOR ]);

    // Act: pinned at the top left, no tile moves.
    widenKeeping('Top left');

    // Assert: once the check is in, there is nothing to warn about.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resize' }))
      .toBeEnabled());
    expect(screen.queryByTestId('resize-transfers'))
      .toBeNull();
  });

  it('lists a transfer on a map open here that is not saved yet', async () =>
  {
    // Arrange: the town is open here with a hatch into the cave the disk has never seen.
    const { hub } = await renderCave(async () => []);
    const hatch = {
      ...createMapEvent(4, 0, 0),
      name: 'Hatch',
      pages: [ { ...createEventPage(), list: [ { code: 201, indent: 0, parameters: [ 0, 5, 2, 1, 2, 0 ] }, { code: 0, indent: 0, parameters: [] } ] } ],
    };
    act(() =>
    {
      hub.adopt('map:2', { ...buildMapJson(), events: [ null, null, null, null, hatch ] } as unknown as JsonValue);
    });

    // Act.
    widenKeeping('Right');

    // Assert.
    expect((await screen.findByTestId('resize-transfers')).textContent)
      .toBe('1 transfer lands on this map and will not follow the resize:Town, "Hatch" (page 1) lands on 2, 1; that spot moves to 4, 1.');
  });

  it('says when the transfers landing on the map could not be checked', async () =>
  {
    // Arrange.
    await renderCave(async () =>
    {
      throw new MapEditorApiError('GET /api/maps/5/arrivals answered 500: Map002.json cannot be read', 500);
    });

    // Act.
    widenKeeping('Right');

    // Assert.
    expect(await screen.findByText('The transfers landing on this map could not be checked: GET /api/maps/5/arrivals answered 500: Map002.json cannot be read'))
      .toBeInTheDocument();
  });
});
