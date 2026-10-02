/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WindowShell } from '../../../../src/core/infrastructure/shell/WindowShell.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { MAP_CONFLICT_MESSAGE } from '../../../../src/mapEditor/core/eventWindow/eventWindowSave.ts';
import { targetHistory } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import { copyPages, decodePageClipboard, encodePageClipboard } from '../../../../src/mapEditor/core/eventWindow/pageOperations.ts';
import { DocumentHub, type DocumentStore } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { DocumentKey } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMap, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { SoundPlayerContext } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { EventWindowView } from '../../../../src/mapEditor/views/EventWindowView.tsx';
import { eventWindowMap, heldEvent, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * The event window is the full editor of one event, in its own window. It owes the author the event's map first (another
 * window's live copy or the file), with a message when it cannot be had, and the map's tileset for the graphic picker,
 * read from the server without the window ever holding the tilesets (a window holding a document counts as keeping its
 * edits, for every other window's close guard); then the event's name, note and pages, and on the page shown its
 * conditions, graphic, movement, options, priority, trigger and commands. Every change is one step in the event's own
 * history, never the map's, with undo and redo from the header and from Ctrl+Z and Ctrl+Y anywhere in the window, and
 * Ctrl+S saves the map with whatever is still being typed, unless the map waits for a choice about changes made
 * elsewhere. The page tabs add, move, copy, paste, duplicate, clear and delete pages from their buttons and keys,
 * showing the page each change lands on; on an event's only page, deleting takes the event off its map, as a step in
 * the map's history. Pages are followed by the page itself, so pages another window adds in front of the one shown
 * never take its place or its half-typed values. The title names the event and its map. When the event goes from the
 * map, a message stands in for the editor until an undo brings the event back.
 *
 * What gets written lives in the services the core tests cover; these check that each control reaches its service.
 * The fixture's event 2 holds pages marked 1, 2 and 3, each with a comment naming it.
 */
describe('EventWindowView', () =>
{
  /**
   * The tilesets the fixture map draws with: tileset 4.
   */
  const TILESETS: JsonValue = [ null, null, null, null, { id: 4, flags: [], mode: 1, name: 'Town', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] } ];

  /**
   * Renders the event window over a real hub.
   * @param {object} options Whether the hub holds the map already, the map, what opening a document does, the store,
   * and what the clipboard holds for a paste from a button.
   * @returns {object} The hub, the store and the opener.
   */
  const renderWindow = (options: {
    held?: boolean;
    map?: RmmzMap;
    open?: (key: DocumentKey) => Promise<unknown>;
    store?: DocumentStore;
    clipboard?: string;
    api?: MapEditorApi;
  } = {}) =>
  {
    const map = options.map ?? eventWindowMap();
    const store = options.store ?? {
      load: vi.fn(async () => map as unknown as JsonValue),
      save: vi.fn(async () => undefined),
    };
    const hub = new DocumentHub({ clientId: 'event-window', store });
    if (options.held !== false)
    {
      hub.adopt('map:1', map as unknown as JsonValue);
    }

    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const openDocument = vi.fn(options.open ?? (async (key: DocumentKey) => hub.load(key)));
    const services = {
      hub,
      catalog,
      commandEditors: new CommandEditorRegistry(),
      api: options.api ?? null,
      pluginHeaders: new PluginHeaderStore(),
      loadCommandResources: async () => undefined,
      openDocument,
      shell: new WindowShell({ channel: null, origin: 'http://ui', openWindow: () => null, readClipboardText: async () => options.clipboard ?? '' }),
    } as unknown as MapEditorServices;
    render(
      <MapEditorServicesProvider services={services}>
        <SoundPlayerContext.Provider value={vi.fn()}>
          <EventWindowView mapId={TARGET.mapId} eventId={TARGET.eventId}/>
        </SoundPlayerContext.Provider>
      </MapEditorServicesProvider>
    );
    return { hub, store, openDocument };
  };

  /**
   * Reads the names in the event's own history, oldest first.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The step names.
   */
  const stepsOf = (hub: DocumentHub): string[] => hub.history(targetHistory(TARGET)).rows.map(row => row.label);

  /**
   * Reads which page tab is shown.
   * @returns {string | null} The shown tab's name.
   */
  const shownTab = (): string | null => screen.getAllByRole('tab').find(tab => tab.getAttribute('aria-selected') === 'true')?.getAttribute('aria-label') ?? null;

  /**
   * Lets the window's loads settle.
   */
  const settle = async (): Promise<void> =>
  {
    await act(async () =>
    {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('holds the map first, and the map alone, then shows the event, its pages and the first page\'s commands', async () =>
  {
    // Arrange: the window holds nothing yet.
    const { hub, openDocument } = renderWindow({ held: false });
    const waiting = screen.queryByLabelText('Opening the event') !== null;

    // Act.
    await settle();

    // Assert.
    expect([
      waiting,
      openDocument.mock.calls.map(([ key ]) => key),
      hub.documentKeys(),
      (screen.getByLabelText('Name') as HTMLInputElement).value,
      screen.getAllByRole('tab').map(tab => tab.getAttribute('aria-label')),
      screen.queryByText('page 1') !== null,
      screen.queryByText('page 2'),
    ])
      .toStrictEqual([ true, [ 'map:1' ], [ 'map:1' ], 'EV002', [ 'Page 1', 'Page 2', 'Page 3' ], true, null ]);
  });

  it('reads the map\'s tileset from the server for the graphic picker\'s tiles, without ever holding the tilesets', async () =>
  {
    // Arrange: a server answering the tilesets; it knows no names or usage, and has no pictures.
    const loadTilesets = vi.fn(async () => TILESETS as unknown as (RmmzTileset | null)[]);
    const api = {
      loadTilesets,
      loadDatabaseNames: async () => Promise.reject(new Error('no names here')),
      loadCommandUsage: async () => Promise.reject(new Error('no usage here')),
      loadImage: async () => null,
    } as unknown as MapEditorApi;
    const { hub, openDocument } = renderWindow({ api });
    await settle();

    // Act: the tile half of the picker.
    fireEvent.click(screen.getByRole('button', { name: 'Tile' }));

    // Assert: the picker browses the tileset's sheets rather than asking for a typed id, and the window holds the map
    // alone. Both checks go through plain DOM queries rather than getByRole/getByLabelText: the tile grid behind the
    // picker draws 256 cells of its own, and testing-library's queries walk every candidate's computed style to tell
    // whether it is hidden from the accessibility tree, which is cheap at the scale most of this suite renders at but
    // measurably slow at this one's, independent of anything either check below actually cares about. A label's own
    // text is exactly what getByLabelText resolves a bare string against, so matching it directly is the same check.
    const tileSheetButtons = [ ...document.querySelectorAll('button') ].filter(button => [ 'B', 'C', 'D', 'E' ].includes(button.textContent ?? '')).length;
    const tileIdField = [ ...document.querySelectorAll('label') ].find(label => label.textContent === 'Tile id') ?? null;
    expect([
      tileSheetButtons,
      tileIdField,
      loadTilesets.mock.calls.length,
      openDocument.mock.calls.length,
      hub.documentKeys(),
    ])
      .toStrictEqual([ 4, null, 1, 0, [ 'map:1' ] ]);
  });

  it('says so when the map cannot be opened', async () =>
  {
    // Arrange.
    renderWindow({ held: false, open: async () => Promise.reject(new Error('the server is down')) });

    // Act.
    await settle();

    // Assert.
    expect(screen.getByText('Map 1 could not be opened: the server is down'))
      .toBeInTheDocument();
  });

  it('titles the window after the event and its map', () =>
  {
    // Arrange: nothing beyond the render; without the project's names, the map reads as its number.

    // Act.
    renderWindow();

    // Assert.
    expect(document.title)
      .toBe('EV002 - Map 1 - jmz-map-editor');
  });

  it('renames the event as a step in its own history, never the map\'s', () =>
  {
    // Arrange.
    const { hub } = renderWindow();
    const name = screen.getByLabelText('Name');

    // Act.
    fireEvent.change(name, { target: { value: 'Gate Guard' } });
    fireEvent.blur(name);

    // Assert.
    expect([ heldEvent(hub).name, stepsOf(hub), hub.history(mapHistoryKey(1)).rows.length, document.title ])
      .toStrictEqual([ 'Gate Guard', [ 'Rename event' ], 0, 'Gate Guard - Map 1 - jmz-map-editor' ]);
  });

  it('writes the note exactly as typed', () =>
  {
    // Arrange.
    const { hub } = renderWindow();
    const note = screen.getByLabelText('Note');

    // Act.
    fireEvent.change(note, { target: { value: '<blueprint:guard>\nline two' } });
    fireEvent.blur(note);

    // Assert.
    expect([ heldEvent(hub).note, stepsOf(hub) ])
      .toStrictEqual([ '<blueprint:guard>\nline two', [ 'Edit event note' ] ]);
  });

  it('turns a condition on, and keeps the pickers of conditions not ticked out of reach', () =>
  {
    // Arrange: no condition of page 1 is ticked.
    const { hub } = renderWindow();
    const reachableBefore = screen.getByTestId('condition-switch1').hasAttribute('inert');

    // Act.
    fireEvent.click(screen.getByLabelText('Use the switch condition'));

    // Assert: the second switch, still unticked, stays out of reach.
    expect([
      reachableBefore,
      screen.getByTestId('condition-switch1').hasAttribute('inert'),
      screen.getByTestId('condition-switch2').hasAttribute('inert'),
      heldEvent(hub).pages[0].conditions.switch1Valid,
      stepsOf(hub),
    ])
      .toStrictEqual([ true, false, true, true, [ 'Turn on switch condition (page 1)' ] ]);
  });

  it('changes an option, the priority and the trigger, each a step', () =>
  {
    // Arrange: page 1 starts by player touch, drawn the same as characters.
    const { hub } = renderWindow();

    // Act.
    fireEvent.click(screen.getByLabelText('Through'));
    fireEvent.mouseDown(screen.getByLabelText('Priority'));
    fireEvent.click(screen.getByRole('option', { name: 'Above characters' }));
    fireEvent.mouseDown(screen.getByLabelText('Trigger'));
    fireEvent.click(screen.getByRole('option', { name: 'Parallel' }));

    // Assert.
    const [ page ] = heldEvent(hub).pages;
    expect([ page.through, page.priorityType, page.trigger, stepsOf(hub) ])
      .toStrictEqual([ true, 2, 4, [ 'Turn on through (page 1)', 'Change priority (page 1)', 'Change trigger (page 1)' ] ]);
  });

  it('mounts the graphic picker and the movement settings on the page, each change a step of the page shown', () =>
  {
    // Arrange: page 1 shows Sheet1, fixed in place.
    const { hub } = renderWindow();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'No image' }));
    fireEvent.mouseDown(screen.getByLabelText('Type'));
    fireEvent.click(screen.getByRole('option', { name: 'Random' }));

    // Assert.
    const [ page ] = heldEvent(hub).pages;
    expect([ page.image.characterName, page.moveType, stepsOf(hub) ])
      .toStrictEqual([ '', 1, [ 'Change graphic (page 1)', 'Change movement (page 1)' ] ]);
  });

  it('shows another page from its tab, with its own commands', () =>
  {
    // Arrange.
    renderWindow();

    // Act.
    fireEvent.click(screen.getByRole('tab', { name: 'Page 2' }));

    // Assert.
    expect([ shownTab(), screen.queryByText('page 2') !== null, screen.queryByText('page 1') ])
      .toStrictEqual([ 'Page 2', true, null ]);
  });

  it('adds a page after the one shown, moves it, and deletes it from the buttons, showing the page each lands on', () =>
  {
    // Arrange.
    const { hub } = renderWindow();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    const added = shownTab();
    fireEvent.click(screen.getByRole('button', { name: 'Move this page right' }));
    const moved = shownTab();
    fireEvent.click(screen.getByRole('button', { name: 'Delete page' }));

    // Assert: back to the three pages, in their order.
    expect([ added, moved, shownTab(), heldEvent(hub).pages, stepsOf(hub) ])
      .toStrictEqual([ 'Page 2', 'Page 3', 'Page 3', [ markedPage(1), markedPage(2), markedPage(3) ], [ 'Add page', 'Move page 2', 'Delete page 3' ] ]);
  });

  it('clears the page shown to blank, keeping it, and offers to delete the event itself on its only page', () =>
  {
    // Arrange: an event of one page.
    const map = eventWindowMap();
    map.events[2]!.pages = [ markedPage(1) ];
    const { hub } = renderWindow({ map });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Clear page' }));

    // Assert: the delete beside it names the event, not a page.
    expect([ heldEvent(hub).pages, screen.queryByRole('button', { name: 'Delete this event' }) !== null, screen.queryByRole('button', { name: 'Delete page' }), stepsOf(hub) ])
      .toStrictEqual([ [ createEventPage() ], true, null, [ 'Clear page 1' ] ]);
  });

  it('deletes the event from its map on its only page, as one step in the map\'s history, and shows it again once the map undoes it', () =>
  {
    // Arrange: an event of one page.
    const map = eventWindowMap();
    map.events[2]!.pages = [ markedPage(1) ];
    const { hub } = renderWindow({ map });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Delete this event' }));
    const gone = [ heldEvent(hub), screen.queryByText('Event 2 is no longer on Map 1. Undoing its deletion in the map brings it back here.') !== null ];
    const mapSteps = hub.history(mapHistoryKey(1)).rows.map(row => row.label);
    act(() =>
    {
      hub.undo(mapHistoryKey(1));
    });

    // Assert: the event's own history never held the step; the map's did, and its undo brought the event back whole.
    expect([ gone, mapSteps, stepsOf(hub), heldEvent(hub).pages, (screen.getByLabelText('Name') as HTMLInputElement).value ])
      .toStrictEqual([ [ null, true ], [ 'Delete event' ], [], [ markedPage(1) ], 'EV002' ]);
  });

  it('deletes the event from the Delete key on its only page, as a step in the map\'s history', () =>
  {
    // Arrange: an event of one page.
    const map = eventWindowMap();
    map.events[2]!.pages = [ markedPage(1) ];
    const { hub } = renderWindow({ map });

    // Act.
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Page 1' }), { key: 'Delete' });

    // Assert.
    expect([ heldEvent(hub), hub.history(mapHistoryKey(1)).rows.map(row => row.label), stepsOf(hub) ])
      .toStrictEqual([ null, [ 'Delete event' ], [] ]);
  });

  it('deletes and duplicates the page shown from the keys while the tabs have focus', () =>
  {
    // Arrange.
    const { hub } = renderWindow();
    const tab = screen.getByRole('tab', { name: 'Page 1' });

    // Act.
    fireEvent.keyDown(tab, { key: 'Delete' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Page 1' }), { key: 'd', ctrlKey: true });

    // Assert.
    expect([ heldEvent(hub).pages, stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(2), markedPage(2), markedPage(3) ], [ 'Delete page 1', 'Duplicate page 1' ] ]);
  });

  it('copies the page shown to the clipboard, and pastes it after the page shown, from the keys', () =>
  {
    // Arrange.
    const { hub } = renderWindow();
    let copied = '';
    const setData = vi.fn((_type: string, text: string) =>
    {
      copied = text;
    });

    // Act.
    fireEvent.copy(screen.getByRole('tab', { name: 'Page 1' }), { clipboardData: { setData } });
    fireEvent.click(screen.getByRole('tab', { name: 'Page 3' }));
    fireEvent.paste(screen.getByRole('tab', { name: 'Page 3' }), { clipboardData: { getData: () => copied } });

    // Assert.
    expect([ heldEvent(hub).pages, shownTab(), stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(1), markedPage(2), markedPage(3), markedPage(1) ], 'Page 4', [ 'Paste page' ] ]);
  });

  it('says so when a paste finds no copied page, changing nothing', () =>
  {
    // Arrange.
    const { hub } = renderWindow();

    // Act.
    fireEvent.paste(screen.getByRole('tab', { name: 'Page 1' }), { clipboardData: { getData: () => 'Hello there' } });

    // Assert.
    expect([ screen.getByText('The clipboard holds no copied page.') !== null, heldEvent(hub).pages.length ])
      .toStrictEqual([ true, 3 ]);
  });

  it('undoes and redoes from the header, and from Ctrl+Z and Ctrl+Y anywhere in the window', () =>
  {
    // Arrange: one rename made.
    const { hub } = renderWindow();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Gate Guard' } });
    fireEvent.blur(name);

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const undone = heldEvent(hub).name;
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    const redone = heldEvent(hub).name;
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    const undoneAgain = heldEvent(hub).name;
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));

    // Assert.
    expect([ undone, redone, undoneAgain, heldEvent(hub).name ])
      .toStrictEqual([ 'EV002', 'Gate Guard', 'EV002', 'Gate Guard' ]);
  });

  it('jumps back to the start from the history list', () =>
  {
    // Arrange: two steps made.
    const { hub } = renderWindow();
    fireEvent.click(screen.getByLabelText('Through'));
    fireEvent.click(screen.getByLabelText('Use the item condition'));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'History' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Start' }));

    // Assert: both undone, both still there to redo.
    expect([ heldEvent(hub).pages[0], hub.history(targetHistory(TARGET)).position ])
      .toStrictEqual([ markedPage(1), 0 ]);
  });

  it('saves the map on Ctrl+S, with the name still being typed', async () =>
  {
    // Arrange: a new name typed, the field still holding it.
    const { hub, store } = renderWindow();
    const name = screen.getByLabelText('Name') as HTMLInputElement;
    name.focus();
    fireEvent.change(name, { target: { value: 'Gate Guard' } });

    // Act.
    await act(async () =>
    {
      fireEvent.keyDown(name, { key: 's', ctrlKey: true });
      await Promise.resolve();
    });

    // Assert.
    const [ [ savedKey, saved ] ] = vi.mocked(store.save).mock.calls;
    expect([ savedKey, (saved as unknown as RmmzMap).events[2]!.name, hub.isDirty('map:1'), stepsOf(hub) ])
      .toStrictEqual([ 'map:1', 'Gate Guard', false, [ 'Rename event' ] ]);
  });

  it('says so when the event goes from the map, and shows it again once an undo brings it back', () =>
  {
    // Arrange.
    const { hub } = renderWindow();

    // Act: another window deletes the event, then undoes it.
    act(() =>
    {
      hub.edit('Delete event', [ mapHistoryKey(1) ], transaction => transaction.set('map:1', [ 'events', 2 ], null));
    });
    const gone = screen.queryByText('Event 2 is no longer on Map 1. Undoing its deletion in the map brings it back here.') !== null;
    act(() =>
    {
      hub.undo(mapHistoryKey(1));
    });

    // Assert.
    expect([ gone, (screen.getByLabelText('Name') as HTMLInputElement).value ])
      .toStrictEqual([ true, 'EV002' ]);
  });

  it('picks a condition\'s switch, a variable\'s value and the self switch through their pickers, each a step', () =>
  {
    // Arrange: the first switch and the variable turned on, so their pickers are in reach; without the project's names,
    // ids are typed as numbers.
    const { hub } = renderWindow();
    fireEvent.click(screen.getByLabelText('Use the switch condition'));
    fireEvent.click(screen.getByLabelText('Use the variable condition'));
    fireEvent.click(screen.getByLabelText('Use the self switch condition'));
    const [ switchPicker ] = screen.getAllByLabelText('Switch');
    const value = screen.getByLabelText('At least');

    // Act.
    fireEvent.change(switchPicker, { target: { value: '7' } });
    fireEvent.blur(switchPicker);
    fireEvent.change(value, { target: { value: '120' } });
    fireEvent.blur(value);
    fireEvent.mouseDown(screen.getByLabelText('Self switch'));
    fireEvent.click(screen.getByRole('option', { name: 'C' }));

    // Assert.
    const [ { conditions } ] = heldEvent(hub).pages;
    expect([ conditions.switch1Id, conditions.variableValue, conditions.selfSwitchCh, stepsOf(hub).slice(3) ])
      .toStrictEqual([ 7, 120, 'C', [ 'Change switch condition (page 1)', 'Change variable condition (page 1)', 'Change self switch condition (page 1)' ] ]);
  });

  it('writes a typed value exactly however large, and refuses out loud one the game cannot hold, writing nothing for it', () =>
  {
    // Arrange: page 1's variable condition turned on, so its value is in reach.
    const { hub } = renderWindow();
    fireEvent.click(screen.getByLabelText('Use the variable condition'));
    const value = screen.getByLabelText('At least');

    // Act: a value well past a hundred million, then one past what the game holds exactly.
    fireEvent.change(value, { target: { value: '123456789012' } });
    fireEvent.blur(value);
    const written = heldEvent(hub).pages[0].conditions.variableValue;
    fireEvent.change(value, { target: { value: '100000000000000000000' } });
    fireEvent.blur(value);

    // Assert: the second was refused, saying so, and left the first in place.
    expect([
      written,
      heldEvent(hub).pages[0].conditions.variableValue,
      screen.queryByText('A variable condition waits for a whole number between -9,007,199,254,740,991 and 9,007,199,254,740,991.') !== null,
      stepsOf(hub),
    ])
      .toStrictEqual([ 123_456_789_012, 123_456_789_012, true, [ 'Turn on variable condition (page 1)', 'Change variable condition (page 1)' ] ]);
  });

  it('duplicates and moves a page from its tab\'s right-click menu, showing the page each lands on', () =>
  {
    // Arrange.
    const { hub } = renderWindow();

    // Act.
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Page 1' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Page 2' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move right' }));

    // Assert: the copy, made second, went third.
    expect([ heldEvent(hub).pages, shownTab(), stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(1), markedPage(2), markedPage(1), markedPage(3) ], 'Page 3', [ 'Duplicate page 1', 'Move page 2' ] ]);
  });

  it('moves a page dragged onto another tab there', () =>
  {
    // Arrange.
    const { hub } = renderWindow();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    // Act.
    fireEvent.dragStart(screen.getByRole('tab', { name: 'Page 1' }), { dataTransfer });
    fireEvent.dragOver(screen.getByRole('tab', { name: 'Page 3' }), { dataTransfer });
    fireEvent.drop(screen.getByRole('tab', { name: 'Page 3' }), { dataTransfer });

    // Assert.
    expect([ heldEvent(hub).pages, shownTab(), stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(2), markedPage(3), markedPage(1) ], 'Page 3', [ 'Move page 1' ] ]);
  });

  it('hands a half-typed value to the page it was typed on, still shown, when another window adds a page in front of it', () =>
  {
    // Arrange: page 2 shown with its variable condition on, and a value half typed into it.
    const { hub } = renderWindow();
    fireEvent.click(screen.getByRole('tab', { name: 'Page 2' }));
    fireEvent.click(screen.getByLabelText('Use the variable condition'));
    const value = screen.getByLabelText('At least');
    fireEvent.change(value, { target: { value: '120' } });

    // Act: the map's window adds a page in front of it, then the field is left.
    act(() =>
    {
      hub.edit('Add page', [ mapHistoryKey(1) ], transaction => transaction.splice('map:1', [ 'events', 2, 'pages' ], 1, 0, [ createEventPage() as unknown as JsonValue ]));
    });
    fireEvent.blur(value);

    // Assert: page 2, third by then, took the value and is still the page shown; the new page is untouched.
    const turnedOn = { ...markedPage(2), conditions: { ...markedPage(2).conditions, variableValid: true, variableValue: 120 } };
    expect([ shownTab(), heldEvent(hub).pages, stepsOf(hub) ])
      .toStrictEqual([
        'Page 3',
        [ markedPage(1), createEventPage(), turnedOn, markedPage(3) ],
        [ 'Turn on variable condition (page 2)', 'Change variable condition (page 3)' ],
      ]);
  });

  it('deletes the page its menu was opened on, though another window adds a page in front of it while the menu is open', () =>
  {
    // Arrange: the menu open on page 2.
    const { hub } = renderWindow();
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Page 2' }));

    // Act: the map's window adds a page first, then Delete is chosen.
    act(() =>
    {
      hub.edit('Add page', [ mapHistoryKey(1) ], transaction => transaction.splice('map:1', [ 'events', 2, 'pages' ], 0, 0, [ createEventPage() as unknown as JsonValue ]));
    });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete page' }));

    // Assert: page 2 went, third by then; page 1 and the new page stay.
    expect([ heldEvent(hub).pages, stepsOf(hub) ])
      .toStrictEqual([ [ createEventPage(), markedPage(1), markedPage(3) ], [ 'Delete page 3' ] ]);
  });

  it('pastes a copied page from the Paste button, reading the clipboard through the window shell', async () =>
  {
    // Arrange: the clipboard holds page 3 of the neighbouring event, as a copy writes it.
    const map = eventWindowMap();
    const clipboard = encodePageClipboard(copyPages(map.events[3]!, [ 2 ])!);
    const { hub } = renderWindow({ map, clipboard });

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert.
    expect([ heldEvent(hub).pages, shownTab(), stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(1), markedPage(3), markedPage(2), markedPage(3) ], 'Page 2', [ 'Paste page' ] ]);
  });

  it('cuts a page from its tab\'s menu once the clipboard has it', async () =>
  {
    // Arrange: a clipboard that keeps what is written to it.
    const { hub } = renderWindow();
    let written = '';
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (text: string) =>
        {
          written = text;
        }),
      },
    });

    // Act.
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Page 2' }));
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Cut' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert.
    expect([ decodePageClipboard(written)?.pages, heldEvent(hub).pages, stepsOf(hub) ])
      .toStrictEqual([ [ markedPage(2) ], [ markedPage(1), markedPage(3) ], [ 'Cut page 2' ] ]);
  });

  it('says so when a save fails, leaving the map unsaved', async () =>
  {
    // Arrange: a store that cannot write, and one edit to save.
    const map = eventWindowMap();
    const store: DocumentStore = { load: vi.fn(async () => map as unknown as JsonValue), save: vi.fn(async () => Promise.reject(new Error('disk full'))) };
    const { hub } = renderWindow({ map, store });
    fireEvent.click(screen.getByLabelText('Through'));

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.getByText('The map was not saved: disk full') !== null, hub.isDirty('map:1') ])
      .toStrictEqual([ true, true ]);
  });

  it('holds back a save while the map waits for a choice about changes made elsewhere, and says so', async () =>
  {
    // Arrange: an unsaved edit, then a change on disk flags the map.
    const { hub, store } = renderWindow();
    fireEvent.click(screen.getByLabelText('Through'));
    act(() =>
    {
      hub.flagConflict('map:1', { kind: 'disk', content: eventWindowMap() as unknown as JsonValue });
    });

    // Act.
    await act(async () =>
    {
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await Promise.resolve();
    });

    // Assert: nothing was written, and the edit is still unsaved.
    expect([ screen.queryByText(MAP_CONFLICT_MESSAGE) !== null, vi.mocked(store.save).mock.calls.length, hub.isDirty('map:1') ])
      .toStrictEqual([ true, 0, true ]);
  });

  it('names the edit in the way of an undo, and forgets the step blocked by it when asked', async () =>
  {
    // Arrange: a rename here, then the same name changed again in the map's own history.
    const { hub } = renderWindow();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Gate Guard' } });
    fireEvent.blur(name);
    act(() =>
    {
      hub.edit('Rename on the map', [ mapHistoryKey(1) ], transaction => transaction.set('map:1', [ 'events', 2, 'name' ], 'Night Guard'));
    });

    // Act.
    await act(async () =>
    {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
      await Promise.resolve();
    });
    const told = screen.queryByText('"Rename event" cannot be undone: "Rename on the map" later changed what "Rename event" changed.') !== null;
    fireEvent.click(screen.getByRole('button', { name: 'Forget it' }));

    // Assert: the name stays as the map left it, and the step is gone from the event's history.
    expect([ told, heldEvent(hub).name, stepsOf(hub) ])
      .toStrictEqual([ true, 'Night Guard', [] ]);
  });

  it('marks its first frame showing the event on the page\'s timeline, once', async () =>
  {
    // Arrange: a clean timeline.
    performance.clearMarks();

    // Act.
    renderWindow();
    await act(async () =>
    {
      await new Promise(resolve =>
      {
        requestAnimationFrame(() => resolve(undefined));
      });
      await new Promise(resolve =>
      {
        requestAnimationFrame(() => resolve(undefined));
      });
    });

    // Assert.
    expect(performance.getEntriesByName('jmz-event-window-ready').length)
      .toBe(1);
  });
});
