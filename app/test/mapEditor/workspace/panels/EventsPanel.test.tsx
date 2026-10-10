/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { DockviewApi } from 'dockview-react';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { holdBlueprintMap } from '../../../../src/mapEditor/core/blueprints/blueprintMaps.ts';
import { BLUEPRINTS_DOCUMENT } from '../../../../src/mapEditor/core/blueprints/blueprints.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { blueprintMapId, MAP_INFOS_KEY, type DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { EventsPanel } from '../../../../src/mapEditor/workspace/panels/EventsPanel.tsx';
import { WorkspaceController } from '../../../../src/mapEditor/workspace/WorkspaceController.ts';
import { WorkspaceProvider } from '../../../../src/mapEditor/workspace/workspaceHooks.tsx';
import { storedBlueprints } from '../../support/blueprintFixtures.ts';
import { command, event, hubWith, oreChest, page, transferPage } from '../../support/eventKindFixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { buildTreeRows } from '../../support/treeFixtures.ts';

/*
 * The events list is how an author sees how busy a map is and finds an event without hunting the map for it, so it owes
 * him every event on the map in focus, each row saying what the map would: id, name beside the marker the map draws for
 * it, position, kind, trigger and page count, under a count of the events and of each kind. A search narrows it and
 * says how many of the map's events still show; a column heading sorts it, and a second click flips the way. It follows
 * the window's selection both ways: a click selects an event and asks its map to centre on it, Shift adds the rows from
 * the last one clicked and Ctrl adds or takes out one, the arrow keys step through the rows and Enter opens the event,
 * a double-click opens the event's window, and an event picked anywhere else shows its row highlighted. Edits from
 * anywhere show at once, and with no map in focus, no events, or nothing matching, it says so.
 *
 * Map 1, World, holds: the door to the cave (2) at 0, 1, a transfer on the player's touch; the ore chest (3) at 1, 1,
 * with two pages; the opening scene (5) at 2, 0 on autorun; and the weather (6) at 2, 1, a parallel process. Its one
 * view is on screen in the centre.
 */
describe('EventsPanel', () =>
{
  /**
   * The events on map 1.
   * @returns {RmmzMapEvent[]} The events.
   */
  const worldEvents = (): RmmzMapEvent[] => [
    event(2, [ transferPage() ], { name: 'door to cave', x: 0, y: 1 }),
    oreChest(3),
    event(5, [ page([ command(121, [ 1, 1, 0 ]) ], { trigger: 3 }) ], { name: 'opening scene', x: 2, y: 0 }),
    event(6, [ page([ command(230, [ 60 ]) ], { trigger: 4 }) ], { name: 'weather', x: 2, y: 1 }),
  ];

  /**
   * Renders the panel in a workspace whose window holds map 1 with the given events, its one view on screen, and waits
   * for the map tree, which the panel needs before it can name any map.
   * @param {RmmzMapEvent[]} events The events on map 1.
   * @returns {Promise<object>} The controller, the hub, the windows the shell was asked for, and the reveals heard.
   */
  const renderPanel = async (events: RmmzMapEvent[] = worldEvents()) =>
  {
    const { hub } = hubWith(events);
    const modules = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(modules);
    const openDocument = async (key: DocumentKey) => hub.adopt(key, (key === MAP_INFOS_KEY ? buildTreeRows() : []) as unknown as JsonValue);
    const api = { loadMapInfos: async () => buildTreeRows() } as unknown as MapEditorApi;
    const opened: unknown[] = [];
    const shell = {
      open: (request: unknown) =>
      {
        opened.push(request);
        return 'opened';
      },
    };
    const services = { hub, api, modules, openDocument, shell } as unknown as MapEditorServices;
    const controller = new WorkspaceController(services);

    // the dock holds map 1's one view, on screen, so a click on a row reveals the event there.
    const view = { id: 'map-1', params: { mapId: 1 }, group: { id: 'main' }, api: { component: 'map', isVisible: true, location: { type: 'grid' } } };
    controller.attach({ panels: [ view ], getPanel: (id: string) => (id === view.id ? view : undefined) } as unknown as DockviewApi);
    const reveals: string[] = [];
    controller.selection.onReveal(request => reveals.push(`${request.mapId}:${request.eventId}`));
    render(
      <MapEditorServicesProvider services={services}>
        <WorkspaceProvider controller={controller}>
          <EventsPanel/>
        </WorkspaceProvider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await controller.tree?.tree();
    });
    return { controller, hub, opened, reveals };
  };

  /**
   * Renders the panel with map 1 in focus.
   * @param {RmmzMapEvent[]} events The events on map 1.
   * @returns {Promise<object>} What renderPanel hands back.
   */
  const renderWorld = async (events?: RmmzMapEvent[]) =>
  {
    const rendered = await renderPanel(events);
    act(() => rendered.controller.selectTreeMaps([ 1 ]));
    return rendered;
  };

  /**
   * Reads each row the list draws, top to bottom, as the words in its cells.
   * @returns {string[][]} The rows.
   */
  const shownRows = (): string[][] =>
  {
    return screen.queryAllByTestId(/^event-row-/u).map(row => within(row).getAllByRole('gridcell').map(cell => cell.textContent ?? ''));
  };

  /**
   * Reads the ids of the rows the list draws, top to bottom.
   * @returns {string[]} The ids.
   */
  const shownIds = (): string[] =>
  {
    return shownRows().map(([ id ]) => id);
  };

  /**
   * Finds one event's row.
   * @param {number} id The event.
   * @returns {HTMLElement} The row.
   */
  const rowOf = (id: number): HTMLElement =>
  {
    return screen.getByTestId(`event-row-${id}`);
  };

  /**
   * Reads which rows show as selected.
   * @returns {string[]} The ids of the selected rows.
   */
  const highlighted = (): string[] =>
  {
    return screen.queryAllByTestId(/^event-row-/u).filter(row => row.getAttribute('aria-selected') === 'true').map(row => row.getAttribute('data-testid') ?? '');
  };

  it('asks for a map while none is in focus', async () =>
  {
    // Arrange: nothing picked in the tree, and no map focused.

    // Act.
    await renderPanel();

    // Assert.
    expect(screen.getByText('Pick a map in the tree, or open one, to list its events here.'))
      .toBeInTheDocument();
  });

  it('lists every event of the map in focus with its id, name, position, kind, trigger and pages, under the counts', async () =>
  {
    // Arrange.

    // Act.
    await renderWorld();

    // Assert: each row with its marker, and the kinds counted the most numerous first.
    const markers = screen.queryAllByTestId(/^event-row-/u).map(row => within(row).getByRole('img').getAttribute('aria-label'));
    const chips = Array.from(screen.getByTestId('event-kind-counts').querySelectorAll('.MuiChip-label')).map(chip => chip.textContent);
    expect([ screen.getByText('World') !== null, screen.getByTestId('event-count').textContent, shownRows(), markers, chips ])
      .toStrictEqual([
        true,
        '4 events',
        [
          [ '2', 'door to cave', '0, 1', 'Transfer', 'Player touch', '1' ],
          [ '3', 'chest-ore', '1, 1', 'Chest', 'Action button', '2' ],
          [ '5', 'opening scene', '2, 0', '', 'Autorun', '1' ],
          [ '6', 'weather', '2, 1', '', 'Parallel', '1' ],
        ],
        [ 'Transfer', 'Chest', 'Autorun', 'Parallel' ],
        [ 'Other 2', 'Chest 1', 'Transfer 1' ],
      ]);
  });

  it('narrows the list to a search, saying how many of the map\'s events still show', async () =>
  {
    // Arrange.
    await renderWorld();

    // Act: a word of one name, then a kind.
    fireEvent.change(screen.getByLabelText('Search the events'), { target: { value: 'WEATHER' } });
    const byName = [ shownIds(), screen.getByTestId('event-count').textContent ];
    fireEvent.change(screen.getByLabelText('Search the events'), { target: { value: 'transfer' } });

    // Assert.
    expect([ byName, shownIds(), screen.getByTestId('event-count').textContent ])
      .toStrictEqual([ [ [ '6' ], '1 of 4 events' ], [ '2' ], '1 of 4 events' ]);
  });

  it('says when a search matches nothing, and when the map has no events at all', async () =>
  {
    // Arrange: the world, searched for something it lacks.
    await renderWorld();

    // Act.
    fireEvent.change(screen.getByLabelText('Search the events'), { target: { value: 'dragon' } });

    // Assert.
    expect([ shownIds(), screen.getByText('No events match this search.') !== null ])
      .toStrictEqual([ [], true ]);
  });

  it('says a map with no events has none yet, counting none', async () =>
  {
    // Arrange: map 1 holding nothing.

    // Act.
    await renderWorld([]);

    // Assert.
    expect([ screen.getByText('This map has no events yet.') !== null, screen.getByTestId('event-count').textContent, screen.queryByTestId('event-kind-counts') ])
      .toStrictEqual([ true, '0 events', null ]);
  });

  it('sorts by the column whose heading is clicked, and the other way on a second click', async () =>
  {
    // Arrange.
    await renderWorld();

    // Act: by name, then by name the other way, then by trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    const byName = shownIds();
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    const backwards = shownIds();
    fireEvent.click(screen.getByRole('button', { name: 'Trigger' }));

    // Assert: the heading sorted by says so.
    const sorted = screen.getAllByRole('columnheader').map(heading => heading.getAttribute('aria-sort'));
    expect([ byName, backwards, shownIds(), sorted ])
      .toStrictEqual([
        [ '3', '2', '5', '6' ],
        [ '6', '5', '2', '3' ],
        [ '3', '2', '5', '6' ],
        [ 'none', 'none', 'none', 'none', 'ascending', 'none' ],
      ]);
  });

  it('selects an event and asks its map to centre on it when its row is clicked, highlighting the row', async () =>
  {
    // Arrange.
    const { controller, reveals } = await renderWorld();

    // Act.
    fireEvent.click(rowOf(5));

    // Assert.
    expect([ controller.selection.get(), reveals, highlighted() ])
      .toStrictEqual([ { mapId: 1, eventIds: [ 5 ] }, [ '1:5' ], [ 'event-row-5' ] ]);
  });

  it('adds every row from the last one clicked with Shift, and adds or takes out one with Ctrl, centring on none', async () =>
  {
    // Arrange: the door clicked first.
    const { controller, reveals } = await renderWorld();
    fireEvent.click(rowOf(2));

    // Act: Shift on the opening scene, then Ctrl on the chest, which takes it out, and Ctrl on the weather, which adds it.
    fireEvent.click(rowOf(5), { shiftKey: true });
    const range = controller.selection.get().eventIds;
    fireEvent.click(rowOf(3), { ctrlKey: true });
    fireEvent.click(rowOf(6), { ctrlKey: true });

    // Assert: only the plain click asked the map to centre.
    expect([ range, controller.selection.get().eventIds, highlighted(), reveals ])
      .toStrictEqual([ [ 2, 3, 5 ], [ 2, 5, 6 ], [ 'event-row-2', 'event-row-5', 'event-row-6' ], [ '1:2' ] ]);
  });

  it('opens the event\'s window on a double-click', async () =>
  {
    // Arrange.
    const { opened } = await renderWorld();

    // Act.
    fireEvent.doubleClick(rowOf(3));

    // Assert.
    expect(opened)
      .toStrictEqual([ { path: '/map.html?view=event&map=1&event=3', name: 'jmz-event-1-3', width: 1240, height: 820 } ]);
  });

  it('lists a blueprint\'s events under its name once its panel has focus, and opens one\'s window by the blueprint', async () =>
  {
    // Arrange: the camp, holding the ore chest alone, open as a map beside map 1, the blueprints as the window read them.
    const { controller, hub, opened } = await renderPanel();
    act(() =>
    {
      hub.reload(BLUEPRINTS_DOCUMENT, storedBlueprints({ k3x9q2mf: { name: 'Goblin camp', stamp: stampOf({ width: 2, height: 2, events: [ { ...oreChest(3), x: 1, y: 1 } ] }) } }) as JsonValue);
      holdBlueprintMap(hub, 'k3x9q2mf');
    });
    const mapId = blueprintMapId('k3x9q2mf');

    // Act.
    act(() => controller.panelActivated({ api: { component: 'map', location: { type: 'grid' } }, params: { mapId } } as never));
    const rows = shownRows();
    fireEvent.doubleClick(rowOf(3));

    // Assert.
    expect([ screen.getByText('Goblin camp') !== null, rows, opened ])
      .toStrictEqual([
        true,
        [ [ '3', 'chest-ore', '1, 1', 'Chest', 'Action button', '2' ] ],
        [ { path: '/map.html?view=event&blueprint=k3x9q2mf&event=3', name: 'jmz-blueprint-event-k3x9q2mf-3', width: 1240, height: 820 } ],
      ]);
  });

  it('says a blueprint of tiles alone has no events', async () =>
  {
    // Arrange: the camp, a blueprint with no events, open as a map, the blueprints as the window read them.
    const { controller, hub } = await renderPanel();
    act(() =>
    {
      hub.reload(BLUEPRINTS_DOCUMENT, storedBlueprints({ k3x9q2mf: { name: 'Goblin camp', stamp: stampOf({ events: [], tiles: { layers: [ 0 ], values: [ 1536 ], calledFor: [ -1 ] } }) } }) as JsonValue);
      holdBlueprintMap(hub, 'k3x9q2mf');
    });

    // Act.
    act(() => controller.panelActivated({ api: { component: 'map', location: { type: 'grid' } }, params: { mapId: blueprintMapId('k3x9q2mf') } } as never));

    // Assert.
    expect(screen.queryByText('This blueprint has no events.') !== null)
      .toBe(true);
  });

  it('steps through the rows with the arrow keys, centring on each, and opens the event picked last with Enter', async () =>
  {
    // Arrange: the list sorted by id, with the chest picked.
    const { controller, opened, reveals } = await renderWorld();
    fireEvent.click(rowOf(3));
    const grid = screen.getByRole('grid');

    // Act: down twice, which stops at the last row, up once, then Enter.
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowDown' });
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    fireEvent.keyDown(grid, { key: 'Enter' });

    // Assert.
    expect([ reveals, controller.selection.get().eventIds, opened ])
      .toStrictEqual([
        [ '1:3', '1:5', '1:6', '1:6', '1:5' ],
        [ 5 ],
        [ { path: '/map.html?view=event&map=1&event=5', name: 'jmz-event-1-5', width: 1240, height: 820 } ],
      ]);
  });

  it('leaves the keys of a focused heading to the heading, opening nothing on its Enter', async () =>
  {
    // Arrange: the chest picked, and the Name heading focused.
    const { opened } = await renderWorld();
    fireEvent.click(rowOf(3));

    // Act.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Name' }), { key: 'Enter' });

    // Assert.
    expect(opened)
      .toStrictEqual([]);
  });

  it('opens nothing on Enter while nothing on the map is selected', async () =>
  {
    // Arrange: the selection is on another map.
    const { controller, opened } = await renderWorld();
    act(() => controller.selection.select(2, [ 3 ]));

    // Act.
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'Enter' });

    // Assert.
    expect([ opened, highlighted() ])
      .toStrictEqual([ [], [] ]);
  });

  it('highlights the row of an event picked anywhere else, such as on the map', async () =>
  {
    // Arrange.
    const { controller } = await renderWorld();

    // Act.
    act(() => controller.selection.select(1, [ 6, 2 ]));

    // Assert.
    expect(highlighted())
      .toStrictEqual([ 'event-row-2', 'event-row-6' ]);
  });

  it('follows the map live: an event renamed and moved elsewhere shows so at once', async () =>
  {
    // Arrange.
    const { hub } = await renderWorld();

    // Act: the weather renamed and moved, as from another window or the event's own.
    act(() =>
    {
      hub.edit('Rename the weather', [ mapHistoryKey(1) ], tx =>
      {
        tx.set('map:1', [ 'events', 6, 'name' ], 'storm');
        tx.set('map:1', [ 'events', 6, 'x' ], 0);
      });
    });

    // Assert.
    expect(shownRows()[3])
      .toStrictEqual([ '6', 'storm', '0, 1', '', 'Parallel', '1' ]);
  });

  it('draws only the first rows of a long list before it knows how tall it is, while counting every event', async () =>
  {
    // Arrange: two hundred events, one per slot.
    const many = Array.from({ length: 200 }, (_, index) => event(index + 1, [ page([]) ], { name: `slime ${index + 1}` }));

    // Act.
    await renderWorld(many);

    // Assert.
    expect([ screen.getByTestId('event-count').textContent, shownIds().length, shownIds()[59] ])
      .toStrictEqual([ '200 events', 60, '60' ]);
  });
});
