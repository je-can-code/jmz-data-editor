/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MapEditorApiError, type MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { blueprintMapId, MAP_INFOS_KEY, TILESETS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { MapArrival } from '../../../../src/mapEditor/core/properties/arrivals.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { lightingModule } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapPropertiesPanel } from '../../../../src/mapEditor/workspace/panels/MapPropertiesPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * A resize moves the map's tiles and events, and never touches another map, so every transfer landing on the map
 * keeps naming the old tile numbers. The resize form owes the author the list of those transfers before the resize
 * is made: each one whose tile the anchor moves or cuts off, from the maps on disk and from the maps open here as
 * they stand, and none when every landing tile stays put. While the list is being checked, the resize waits. It warns
 * too of every copy of a blueprint the new size would leave wholly outside, and the record of where blueprints are
 * placed moves with the map.
 *
 * The sections the plugin modules add, such as J-Lighting's darkness, show once the modules switch on, which can be
 * after the panel first drew, and sit just above the note they write into; while no module adds one, there are none.
 *
 * The map being resized is the cave, a 3 by 2 fixture; the town's door lands on its tile 1, 0.
 */
describe('MapPropertiesPanel', () =>
{
  const TOWN_DOOR: MapArrival = { mapId: 2, mapName: 'Town', eventId: 1, eventName: 'Door', pageIndex: 0, x: 1, y: 0 };

  /**
   * Renders the properties panel on the cave, with the server answering the given transfers into it, and the window's
   * plugin modules not yet switched on.
   * @param {() => Promise<MapArrival[]>} loadArrivals What the server answers.
   * @param {string} note The cave's note.
   * @param {readonly PlacedSpot[]} placed Placements of a blueprint two cells wide (aa22), which the window holds with
   * the record of them.
   * @returns {Promise<object>} The hub, and the window's plugin modules.
   */
  const renderCave = async (loadArrivals: () => Promise<MapArrival[]>, note = '', placed: readonly PlacedSpot[] = []) =>
  {
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:5', { ...buildMapJson(), note } as unknown as JsonValue);
    const lanterns = stampOf({ width: 2, tiles: { layers: [ 3 ], values: [ 10, 10 ], calledFor: [ -1, -1 ] }, events: [] });
    holdBlueprints(hub, { aa22: { name: 'Lanterns', stamp: lanterns } });
    holdBlueprintUses(hub, placed);
    const openDocument = async (key: DocumentKey) =>
    {
      const content = key === MAP_INFOS_KEY ? buildTreeRows() : [ null ];
      return hub.adopt(key === MAP_INFOS_KEY ? MAP_INFOS_KEY : TILESETS_KEY, content as unknown as JsonValue);
    };
    const api = { loadArrivals: vi.fn(loadArrivals) } as unknown as MapEditorApi;
    const modules = new PluginModuleRegistry(new CommandCatalog());
    const controller = new WorkspaceController({ hub, api, openDocument, modules } as unknown as MapEditorServices);
    render(
      <WorkspaceProvider controller={controller}>
        <MapPropertiesPanel/>
      </WorkspaceProvider>
    );

    act(() => controller.selectTreeMaps([ 5 ]));
    await screen.findByLabelText('Width');
    return { hub, modules };
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

  it('warns which copies of blueprints a resize would leave outside, before it is made, and moves the record with the map', async () =>
  {
    // Arrange: a pair of lanterns placed on the cave at 2, 1, hanging past its right edge, and another at 0, 0.
    const { hub } = await renderCave(async () => [], '', [ { blueprintId: 'aa22', mapId: 5, x: 2, y: 1 }, { blueprintId: 'aa22', mapId: 5, x: 0, y: 0 } ]);

    // Act: two wide keeping the top left, which leaves the pair at 2, 1 wholly outside; then keeping the right edge,
    // which leaves part of each on the map, and made.
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Top left' }));
    const leftKept = screen.queryByTestId('resize-placements')?.textContent;
    fireEvent.click(screen.getByRole('radio', { name: 'Right' }));
    const rightKept = screen.queryByTestId('resize-placements');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resize' }))
      .toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Resize' }));
    await waitFor(() => expect(hub.map('map:5').width)
      .toBe(2));

    // Assert: the pair that was at 0, 0 hangs a cell past the new left edge.
    expect([ leftKept, rightKept, usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)).map(spot => [ spot.x, spot.y ]) ])
      .toStrictEqual([ '1 blueprint copy lies outside the new size and will be removed.', null, [ [ -1, 0 ], [ 1, 1 ] ] ]);
  });

  it('shows the sections plugin modules add once they switch on, just above the note they write into', async () =>
  {
    // Arrange: the cave at 85%, before js/plugins.js has been read.
    const { modules } = await renderCave(async () => [], '<ambient:[85]>');
    const before = screen.queryByTestId('map-section-lighting.map');
    const lighting = { name: 'j/lighting/J-Lighting', status: true, description: '', parameters: {} };

    // Act.
    act(() =>
    {
      modules.activate([ lightingModule ], [ lighting ]);
    });

    // Assert: the section, holding the cave's darkness, sits right before the note.
    const section = screen.getByTestId('map-section-lighting.map');
    const noteBox = screen.getByRole('textbox', { name: 'Note' });
    expect([
      before,
      (within(section).getByRole('textbox', { name: 'Darkness' }) as HTMLInputElement).value,
      section.compareDocumentPosition(noteBox) === Node.DOCUMENT_POSITION_FOLLOWING,
      section.nextElementSibling?.textContent,
    ])
      .toStrictEqual([ null, '85', true, 'Note' ]);
  });

  it('shows no module sections while no module adds any', async () =>
  {
    // Arrange: J-Lighting is off.
    const { modules } = await renderCave(async () => []);
    const lighting = { name: 'j/lighting/J-Lighting', status: false, description: '', parameters: {} };

    // Act.
    act(() =>
    {
      modules.activate([ lightingModule ], [ lighting ]);
    });

    // Assert.
    expect(screen.queryByTestId('map-section-lighting.map'))
      .toBeNull();
  });

  /*
   * A blueprint keeps none of a map's settings, and its size and events are fixed for now, so its properties show what
   * it holds instead of a map's form: the layers it keeps, its size with why it stays, and its events with why none is
   * added or taken away. There is no Resize to press, and nothing there writes anything.
   */
  describe('for a blueprint opened as a map', () =>
  {
    /**
     * Renders the properties panel on a blueprint open as a map, the one the properties show.
     * @param {Stamp} stamp The blueprint's stamp.
     * @returns {Promise<DocumentHub>} The window's documents.
     */
    const renderBlueprint = async (stamp: Stamp) =>
    {
      const hub = new DocumentHub({ clientId: 'window-a' });
      holdBlueprints(hub, { k3x9q2mf: { name: 'Lantern row', stamp } });
      holdBlueprintMap(hub, 'k3x9q2mf');
      const openDocument = async (key: DocumentKey) =>
      {
        const content = key === MAP_INFOS_KEY ? buildTreeRows() : [ null, null, null, null, { id: 4, flags: [], mode: 1, name: 'Cave', note: '', tilesetNames: [] } ];
        return hub.has(key) ? hub.document(key) : hub.adopt(key === MAP_INFOS_KEY ? MAP_INFOS_KEY : TILESETS_KEY, content as unknown as JsonValue);
      };
      const modules = new PluginModuleRegistry(new CommandCatalog());
      const controller = new WorkspaceController({ hub, api: {}, openDocument, modules } as unknown as MapEditorServices);
      render(
        <WorkspaceProvider controller={controller}>
          <MapPropertiesPanel/>
        </WorkspaceProvider>
      );

      // the blueprint's panel taking focus makes it the one the properties show.
      act(() => controller.panelActivated({ api: { component: 'map', location: { type: 'grid' } }, params: { mapId: blueprintMapId('k3x9q2mf') } } as never));
      await screen.findByTestId('blueprint-properties');
      return hub;
    };

    it('shows the layer a blueprint keeps, its size and its events, each with why it stays, and no map settings', async () =>
    {
      // Arrange: a row of lanterns on layer 4, two cells wide, with one event.
      const lanterns = stampOf({ width: 2, tiles: { layers: [ 3 ], values: [ 10, 10 ], calledFor: [ -1, -1 ] } });

      // Act.
      await renderBlueprint(lanterns);

      // Assert.
      const section = screen.getByTestId('blueprint-properties');
      expect([
        section.textContent,
        screen.queryByRole('button', { name: 'Resize' }),
        screen.queryByLabelText('Display name'),
      ])
        .toStrictEqual([
          'Lantern rowA blueprint drawn with Cave.TilesLayer 4 alone, 2 by 1.Size2 by 1A blueprint can\'t be resized: growing it would paint over cells its copies never owned.Events1 eventIts events can be moved and changed, but none added or removed: removing one would delete events on every map.',
          null,
          null,
        ]);
    });

    it('says a blueprint of events alone keeps no tiles', async () =>
    {
      // Arrange: one event, two cells wide.

      // Act.
      await renderBlueprint(stampOf({ width: 2 }));

      // Assert.
      expect([ screen.queryByText('None: it holds events alone.') !== null, screen.queryByText('1 event') !== null ])
        .toStrictEqual([ true, true ]);
    });

    it('says a blueprint of every layer keeps them all', async () =>
    {
      // Arrange: every layer, two cells wide, and no events.
      const values = new Array<number>(12).fill(0);

      // Act.
      await renderBlueprint(stampOf({ width: 2, tiles: { layers: [ 0, 1, 2, 3, 4, 5 ], values, calledFor: values.map(() => -1) }, events: [] }));

      // Assert.
      expect([ screen.queryByText('Every layer, 2 by 1.') !== null, screen.queryByText('0 events') !== null ])
        .toStrictEqual([ true, true ]);
    });
  });
});
