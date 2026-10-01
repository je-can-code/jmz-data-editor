/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry, type CommandEditorProps } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { PluginHeaderStore } from '../../../../src/mapEditor/core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { writeClipboard } from '../../../../src/mapEditor/core/commandList/commandClipboard.ts';
import type { DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzEventCommand, RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { MapEditorServices } from '../../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { CommandList } from '../../../../src/mapEditor/views/commandList/CommandList.tsx';
import { SoundPlayerContext, type SoundPlayer } from '../../../../src/mapEditor/views/commandList/commandListResources.ts';
import { cmd } from '../../support/commandFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The command list is the author's whole way into a list, so it owes them what the plan promises, wired to the
 * services that decide what gets written: every row reads as its sentence (with the project's names once they
 * arrive), blocks fold (starting as MZ left them), a click unfolds a command into its inputs and every change lands
 * as one named step, typing finds a command and adds it where the focus is, Delete and Ctrl+Z work, the clipboard
 * carries marked JSON and ignores anything else, and the editors that change a block's shape get the whole block.
 * The logic behind each of these is tested in its service; this proves the list reaches it. No sound ever plays:
 * the window's player is a stub.
 */
describe('CommandList', () =>
{
  /**
   * The path to event 1's first page's list.
   */
  const PATH = [ 'events', 1, 'pages', 0, 'list' ] as const;

  /**
   * A page: a sound, a wait, a branch MZ left folded holding a message, and a loop.
   * @returns {RmmzEventCommand[]} The list.
   */
  const buildList = (): RmmzEventCommand[] => [
    cmd(250, 0, [ { name: 'Heal1', volume: 90, pitch: 100, pan: 0 } ]),
    cmd(230, 0, [ 30 ]),
    { ...cmd(111, 0, [ 0, 1, 0 ]), collapsed: true },
    cmd(101, 1, [ '', 0, 0, 2, 'Harold' ]),
    cmd(401, 1, [ 'Hidden away.' ]),
    cmd(0, 1),
    cmd(412, 0),
    cmd(112, 0),
    cmd(0, 1),
    cmd(413, 0),
    cmd(0, 0),
  ];

  /**
   * A server stand-in: names for switch 1, no usage, and sound addresses.
   * @returns {MapEditorApi} The stand-in.
   */
  const buildApi = (): MapEditorApi => ({
    audioUrl: (folder: string, name: string) => `audio/${folder}/${name}`,
    loadDatabaseNames: async (): Promise<DatabaseNamesJson> => ({
      switches: [ '', 'Door Open' ],
      variables: [],
      actors: [],
      classes: [],
      skills: [],
      items: [],
      weapons: [],
      armors: [],
      enemies: [],
      troops: [],
      states: [],
      animations: [],
      tilesets: [],
      commonEvents: [],
      maps: [ '', 'Town' ],
      equipTypes: [],
    }),
    loadCommandUsage: async () => ({ events: 0, codes: {}, pluginCommands: [] }),
  }) as unknown as MapEditorApi;

  /**
   * Renders a list over a real hub and the built-in catalog, and lets the names arrive.
   * @param {object} options The editors registered, the sound player, and the window shell's clipboard read.
   * @returns {Promise<object>} The hub, the list element and the player.
   */
  const renderList = async (options: { registry?: CommandEditorRegistry; playSound?: SoundPlayer; readClipboard?: (marker: string) => Promise<string | null> } = {}) =>
  {
    const map: RmmzMap = buildMapJson();
    (map.events[1] as NonNullable<RmmzMap['events'][number]>).pages[0].list = buildList();
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', map as never);
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const services = {
      hub,
      catalog,
      commandEditors: options.registry ?? new CommandEditorRegistry(),
      api: buildApi(),
      pluginHeaders: new PluginHeaderStore(),
      loadCommandResources: async () => undefined,
      shell: { readClipboard: options.readClipboard ?? (async () => null) },
    } as unknown as MapEditorServices;
    const playSound = options.playSound ?? vi.fn<SoundPlayer>();
    render(
      <MapEditorServicesProvider services={services}>
        <SoundPlayerContext.Provider value={playSound}>
          <CommandList documentKey={'map:1'} path={PATH} histories={[ eventHistoryKey(1, 1) ]} label={'Page 1'}/>
        </SoundPlayerContext.Provider>
      </MapEditorServicesProvider>
    );
    await act(async () =>
    {
      await Promise.resolve();
    });
    return { hub, list: screen.getByRole('list', { name: 'Page 1' }), playSound };
  };

  /**
   * Reads the list as the document holds it.
   * @param {DocumentHub} hub The hub.
   * @returns {RmmzEventCommand[]} The commands.
   */
  const commandsOf = (hub: DocumentHub): RmmzEventCommand[] => hub.document('map:1').valueAt(PATH) as unknown as RmmzEventCommand[];

  /**
   * Lists the event's history.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The step names.
   */
  const historyOf = (hub: DocumentHub): string[] => hub.history(eventHistoryKey(1, 1)).rows.map(row => row.label);

  it('reads every row as its sentence with the project\'s names, a branch MZ left folded still folded', async () =>
  {
    // Arrange: nothing beyond the render.

    // Act.
    await renderList();

    // Assert.
    expect([
      screen.queryByText('Play SE: Heal1 (90, 100, 0)') !== null,
      screen.queryByText('Wait 30 frames') !== null,
      screen.queryByText('If switch #0001 Door Open is ON') !== null,
      screen.queryByText('3 more folded away') !== null,
      screen.queryByText('Hidden away.'),
      screen.getAllByText('Add a command').length,
    ])
      .toStrictEqual([ true, true, true, true, null, 2 ]);
  });

  it('unfolds a folded branch from its chevron', async () =>
  {
    // Arrange.
    await renderList();

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Unfold' }));

    // Assert.
    expect(screen.getByText('Hidden away.'))
      .toBeInTheDocument();
  });

  it('unfolds a command into its inputs on a click, and folds it back on another', async () =>
  {
    // Arrange.
    await renderList();

    // Act.
    fireEvent.click(screen.getByText('Wait 30 frames'));
    const opened = screen.queryByLabelText('Frames');
    fireEvent.click(screen.getByText('Wait 30 frames'));

    // Assert.
    expect([ opened !== null, screen.queryByLabelText('Frames') ])
      .toStrictEqual([ true, null ]);
  });

  it('saves an input when the author is done with it, as one named step', async () =>
  {
    // Arrange.
    const { hub } = await renderList();
    fireEvent.click(screen.getByText('Wait 30 frames'));
    const frames = screen.getByLabelText('Frames');

    // Act: two keystrokes, then leaving the box.
    fireEvent.change(frames, { target: { value: '9' } });
    fireEvent.change(frames, { target: { value: '90' } });
    fireEvent.blur(frames);

    // Assert.
    expect([ commandsOf(hub)[1].parameters, historyOf(hub), screen.queryByText('Wait 90 frames') !== null ])
      .toStrictEqual([ [ 90 ], [ 'Edit Wait' ], true ]);
  });

  it('deletes the selected command with Delete, and brings it back with Ctrl+Z', async () =>
  {
    // Arrange.
    const { hub, list } = await renderList();
    fireEvent.click(screen.getByText('Wait 30 frames'), { ctrlKey: true });

    // Act.
    fireEvent.keyDown(list, { key: 'Delete' });
    const afterDelete = commandsOf(hub).map(command => command.code);
    fireEvent.keyDown(list, { key: 'z', ctrlKey: true });

    // Assert.
    expect([ afterDelete.slice(0, 2), commandsOf(hub).map(command => command.code).slice(0, 2), historyOf(hub) ])
      .toStrictEqual([ [ 250, 111 ], [ 250, 230 ], [ 'Delete command' ] ]);
  });

  it('finds a command by typing, and adds it where the focus is with its inputs open', async () =>
  {
    // Arrange: the focus on the wait.
    const { hub, list } = await renderList();
    fireEvent.click(screen.getByText('Wait 30 frames'), { ctrlKey: true });

    // Act.
    fireEvent.keyDown(list, { key: 't' });
    const search = screen.getByRole('textbox', { name: 'Find a command' });
    fireEvent.change(search, { target: { value: 'transfer' } });
    const offered = within(screen.getByRole('listbox', { name: 'Matching commands' })).getAllByRole('option').map(option => option.textContent);
    fireEvent.keyDown(search, { key: 'Enter' });

    // Assert: the transfer lands above the wait, as MZ inserts above the selected line.
    expect([ offered[0], commandsOf(hub).map(command => command.code).slice(0, 3), historyOf(hub), screen.queryByLabelText('Location') !== null ])
      .toStrictEqual([ 'Transfer PlayerMovement', [ 250, 201, 230 ], [ 'Add Transfer Player' ], true ]);
  });

  it('copies the selection to the clipboard as marked JSON, and pastes it back at the focus', async () =>
  {
    // Arrange.
    const { hub, list } = await renderList();
    fireEvent.click(screen.getByText('Wait 30 frames'), { ctrlKey: true });
    const written: string[] = [];

    // Act.
    fireEvent.copy(list, { clipboardData: { setData: (_type: string, text: string) => written.push(text) } });
    fireEvent.paste(list, { clipboardData: { getData: () => written[0] } });

    // Assert.
    expect([ JSON.parse(written[0]).format, commandsOf(hub).map(command => command.code).slice(0, 3), historyOf(hub) ])
      .toStrictEqual([ 'jmz-map-editor/commands', [ 250, 230, 230 ], [ 'Paste command' ] ]);
  });

  it('pastes from the menu what the window shell reads, asking for copied commands alone', async () =>
  {
    // Arrange: a wait copied, which the window shell's read hands over.
    const copied = JSON.stringify({ format: 'jmz-map-editor/commands', version: 1, commands: [ cmd(230, 0, [ 30 ]) ] });
    const readClipboard = vi.fn(async (_marker: string) => copied);
    const { hub } = await renderList({ readClipboard });
    fireEvent.contextMenu(screen.getByText('Wait 30 frames'), { clientX: 5, clientY: 5 });

    // Act.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert: the copy lands above the wait, as a paste does at the focus.
    expect([ readClipboard.mock.calls, commandsOf(hub).map(command => command.code).slice(0, 3), historyOf(hub) ])
      .toStrictEqual([ [ [ 'jmz-map-editor/commands' ] ], [ 250, 230, 230 ], [ 'Paste command' ] ]);
  });

  it('says so when the menu\'s paste cannot read the clipboard, and pastes nothing', async () =>
  {
    // Arrange: a read that comes back with nothing, as one the shell never answered does.
    const { hub } = await renderList({ readClipboard: async () => null });
    fireEvent.contextMenu(screen.getByText('Wait 30 frames'), { clientX: 5, clientY: 5 });

    // Act.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Paste' }));
    await act(async () =>
    {
      await Promise.resolve();
    });

    // Assert.
    expect([ screen.queryByText('The clipboard could not be read here; press Ctrl+V to paste instead.') !== null, historyOf(hub) ])
      .toStrictEqual([ true, [] ]);
  });

  it('pastes nothing from text that is not commands, and says so', async () =>
  {
    // Arrange.
    const { hub, list } = await renderList();

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => 'just some words' } });

    // Assert.
    expect([ screen.queryByText('The clipboard holds no commands to paste.') !== null, historyOf(hub) ])
      .toStrictEqual([ true, [] ]);
  });

  it('refuses a paste of half a block, and says why', async () =>
  {
    // Arrange.
    const { hub, list } = await renderList();
    const half = JSON.stringify({ format: 'jmz-map-editor/commands', version: 1, commands: [ cmd(111, 0, [ 0, 1, 0 ]), cmd(0, 1) ] });

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => half } });

    // Assert.
    expect([ screen.queryByText(/do not read as whole commands/u) !== null, historyOf(hub) ])
      .toStrictEqual([ true, [] ]);
  });

  it('hands a registered block editor the whole block, and records its change as one step', async () =>
  {
    // Arrange: a stand-in for the Conditional Branch editor, which takes the branch's message away.
    const registry = new CommandEditorRegistry();
    const Stub = (props: CommandEditorProps) => (
      <button type={'button'} onClick={() => props.block?.onChange([ cmd(111, 0, [ 0, 2, 0 ]), cmd(0, 1), cmd(412, 0) ])}>
        {`block of ${props.block?.commands.length ?? 0}`}
      </button>
    );
    registry.registerForCode(111, Stub);
    const { hub } = await renderList({ registry });

    // Act.
    fireEvent.click(screen.getByText('If switch #0001 Door Open is ON'));
    const shown = screen.getByRole('button', { name: 'block of 5' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'block of 5' }));

    // Assert.
    expect([ shown, commandsOf(hub).slice(2, 5), historyOf(hub) ])
      .toStrictEqual([ 'block of 5', [ cmd(111, 0, [ 0, 2, 0 ]), cmd(0, 1), cmd(412, 0) ], [ 'Edit Conditional Branch' ] ]);
  });

  it('keeps a merged Show Choices open on its first command when its editor reshapes the whole run', async () =>
  {
    // Arrange: two Show Choices back to back, opened from the second, whose editor folds them into one.
    const registry = new CommandEditorRegistry();
    const Stub = (props: CommandEditorProps) => (
      <button type={'button'} onClick={() => props.block?.onChange([ cmd(102, 0, [ [ 'A', 'B' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(402, 0, [ 1, 'B' ]), cmd(0, 1), cmd(404, 0) ])}>
        {`choices of ${props.block?.commands.length ?? 0}`}
      </button>
    );
    registry.registerForCode(102, Stub);
    const { hub } = await renderList({ registry });
    act(() =>
    {
      hub.edit('Two lists', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [
        cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0),
        cmd(102, 0, [ [ 'B' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'B' ]), cmd(0, 1), cmd(404, 0),
      ] as never));
    });

    // Act.
    fireEvent.click(screen.getByText('Choices: B (cannot cancel)'));
    const shown = screen.getByRole('button', { name: 'choices of 8' }).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'choices of 8' }));

    // Assert: the run is one list now, and its editor is still open, on the run's first command.
    expect([ shown, commandsOf(hub).slice(0, 6).map(command => command.code), screen.queryByRole('button', { name: 'choices of 6' }) !== null ])
      .toStrictEqual([ 'choices of 8', [ 102, 402, 0, 402, 0, 404 ], true ]);
  });

  it('keeps Sell\'s commands under Sell when the generated form removes Buy from before it', async () =>
  {
    // Arrange: Buy and Sell, each branch waiting its own time, edited in the generated form.
    const { hub } = await renderList();
    act(() =>
    {
      hub.edit('Shop', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [
        cmd(102, 0, [ [ 'Buy', 'Sell' ], -1, 0, 2, 0 ]),
        cmd(402, 0, [ 0, 'Buy' ]), cmd(230, 1, [ 11 ]), cmd(0, 1),
        cmd(402, 0, [ 1, 'Sell' ]), cmd(230, 1, [ 22 ]), cmd(0, 1),
        cmd(404, 0),
      ] as never));
    });
    fireEvent.click(screen.getByText('Choices: Buy / Sell (cannot cancel)'));

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Remove #1' }));

    // Assert.
    expect(commandsOf(hub).slice(0, 5))
      .toStrictEqual([ cmd(102, 0, [ [ 'Sell' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'Sell' ]), cmd(230, 1, [ 22 ]), cmd(0, 1), cmd(404, 0) ]);
  });

  /**
   * Puts a wait at the top and another inside a branch at the top of the list, so rows sit at two depths.
   * @param {DocumentHub} hub The hub.
   */
  const addTwoDepths = (hub: DocumentHub) => act(() =>
  {
    hub.edit('Two depths', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [
      cmd(230, 0, [ 12 ]), cmd(111, 0, [ 0, 2, 0 ]), cmd(230, 1, [ 34 ]), cmd(0, 1), cmd(412, 0),
    ] as never));
  });

  it('duplicates a selection Ctrl-clicked across depths as siblings inside the body the copies land in', async () =>
  {
    // Arrange: both waits selected, one at the top and one inside the branch.
    const { hub, list } = await renderList();
    addTwoDepths(hub);
    fireEvent.click(screen.getByText('Wait 12 frames'), { ctrlKey: true });
    fireEvent.click(screen.getByText('Wait 34 frames'), { ctrlKey: true });

    // Act.
    fireEvent.keyDown(list, { key: 'd', ctrlKey: true });

    // Assert: the copies follow the inner wait at its indent.
    expect(commandsOf(hub).slice(0, 7))
      .toStrictEqual([ cmd(230, 0, [ 12 ]), cmd(111, 0, [ 0, 2, 0 ]), cmd(230, 1, [ 34 ]), cmd(230, 1, [ 12 ]), cmd(230, 1, [ 34 ]), cmd(0, 1), cmd(412, 0) ]);
  });

  it('cuts a selection Ctrl-clicked across depths and pastes it back, nothing lost and nothing refused', async () =>
  {
    // Arrange: both waits selected and cut.
    const { hub, list } = await renderList();
    addTwoDepths(hub);
    fireEvent.click(screen.getByText('Wait 12 frames'), { ctrlKey: true });
    fireEvent.click(screen.getByText('Wait 34 frames'), { ctrlKey: true });
    const written: string[] = [];
    fireEvent.cut(list, { clipboardData: { setData: (_type: string, text: string) => written.push(text) } });

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => written[0] } });

    // Assert: both back above the branch, where the focus went after the cut, as siblings, with no notice.
    expect([ commandsOf(hub).slice(0, 5), screen.queryByRole('alert') ])
      .toStrictEqual([ [ cmd(230, 0, [ 12 ]), cmd(230, 0, [ 34 ]), cmd(111, 0, [ 0, 2, 0 ]), cmd(0, 1), cmd(412, 0) ], null ]);
  });

  /**
   * Puts two Show Choices back to back at the top of the list, one choice window to HIME_LargeChoices.
   * @param {DocumentHub} hub The hub.
   */
  const addMergedRun = (hub: DocumentHub) => act(() =>
  {
    hub.edit('Merged run', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [
      cmd(102, 0, [ [ 'C' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'C' ]), cmd(0, 1), cmd(404, 0),
      cmd(102, 0, [ [ 'D' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'D' ]), cmd(0, 1), cmd(404, 0),
    ] as never));
  });

  it('pastes at a merged Show Choices run\'s second command before the whole run, keeping it one window', async () =>
  {
    // Arrange: the focus on the run's second Show Choices.
    const { hub, list } = await renderList();
    addMergedRun(hub);
    fireEvent.click(screen.getByText('Choices: D (cannot cancel)'));

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => writeClipboard([ cmd(230, 0, [ 77 ]) ]) } });

    // Assert.
    expect(commandsOf(hub).slice(0, 6).map(command => command.code))
      .toStrictEqual([ 230, 102, 402, 0, 404, 102 ]);
  });

  it('adds from a search opened on a merged run\'s second command before the whole run, showing the search there', async () =>
  {
    // Arrange: the focus on the run's second Show Choices.
    const { hub, list } = await renderList();
    addMergedRun(hub);
    fireEvent.click(screen.getByText('Choices: D (cannot cancel)'), { ctrlKey: true });

    // Act.
    fireEvent.keyDown(list, { key: 'w' });
    const search = screen.getByRole('textbox', { name: 'Find a command' });
    const shownAboveFirst = search.compareDocumentPosition(screen.getByText('Choices: C (cannot cancel)')) === Node.DOCUMENT_POSITION_FOLLOWING;
    fireEvent.change(search, { target: { value: 'wait' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    // Assert.
    expect([ shownAboveFirst, commandsOf(hub).slice(0, 6).map(command => command.code) ])
      .toStrictEqual([ true, [ 230, 102, 402, 0, 404, 102 ] ]);
  });

  it('pastes a command aimed above the comment setting the event\'s area just below it, and says so', async () =>
  {
    // Arrange: a page opening with its area comment, the focus on it.
    const { hub, list } = await renderList();
    act(() =>
    {
      hub.edit('Area', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [ cmd(108, 0, [ '<areaEvent:3x1>' ]) ] as never));
    });
    fireEvent.click(document.querySelector('[data-command-index="0"]') as HTMLElement, { ctrlKey: true });

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => writeClipboard([ cmd(230, 0, [ 77 ]) ]) } });

    // Assert.
    expect([ commandsOf(hub).slice(0, 2), screen.queryByText(/below the comment that sets this event's area/u) !== null ])
      .toStrictEqual([ [ cmd(108, 0, [ '<areaEvent:3x1>' ]), cmd(230, 0, [ 77 ]) ], true ]);
  });

  /**
   * Lays the rows out one above the other, 20 pixels each, as a browser would, since the test page has no layout.
   * @returns {{ mockRestore: () => void }} The stand-in, to restore after the test.
   */
  const layOutRows = () => vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function measure(this: HTMLElement)
  {
    const top = [ ...document.querySelectorAll('[role="listitem"]') ].indexOf(this) * 20;
    return { top, bottom: top + 20, height: 20, left: 0, right: 400, width: 400, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });

  it('drops where the marker was even when another window changed the list mid-drag', async () =>
  {
    // Arrange: the sound picked up and held over the lower half of the loop's end row, below the loop.
    const { hub } = await renderList();
    const layout = layOutRows();
    const [ handle ] = screen.getAllByLabelText('Drag to move');
    fireEvent.pointerDown(handle, { button: 0, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 135, pointerId: 1 });
    act(() =>
    {
      hub.edit('Elsewhere', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 1, 1, []));
    });

    // Act.
    fireEvent.pointerUp(handle, { clientY: 135, pointerId: 1 });
    layout.mockRestore();

    // Assert: the sound follows the loop, just before the list's end, where the marker was.
    expect(commandsOf(hub).map(command => command.code))
      .toStrictEqual([ 111, 101, 401, 0, 412, 112, 0, 413, 250, 0 ]);
  });

  it('adds the else from the menu to the branch as it stands, when another window changed the list meanwhile', async () =>
  {
    // Arrange: the menu opened on the branch, then two waits arrive above it from another window.
    const { hub } = await renderList();
    fireEvent.contextMenu(screen.getByText('If switch #0001 Door Open is ON'), { clientX: 5, clientY: 5 });
    act(() =>
    {
      hub.edit('Elsewhere', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 0, 0, [ cmd(230, 0, [ 1 ]), cmd(230, 0, [ 2 ]) ] as never));
    });

    // Act.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add an else branch' }));

    // Assert: the else closes the branch where it is now.
    expect(commandsOf(hub).slice(4, 11).map(command => `${command.code}@${command.indent}`))
      .toStrictEqual([ '111@0', '101@1', '401@1', '0@1', '411@0', '0@1', '412@0' ]);
  });

  it('closes the menu when another window removes the command it was opened on', async () =>
  {
    // Arrange: the menu opened on the wait.
    const { hub } = await renderList();
    fireEvent.contextMenu(screen.getByText('Wait 30 frames'), { clientX: 5, clientY: 5 });
    const openBefore = screen.queryByRole('menuitem', { name: 'Add a command here' }) !== null;

    // Act.
    act(() =>
    {
      hub.edit('Elsewhere', [ eventHistoryKey(1, 1) ], tx => tx.splice('map:1', PATH, 1, 1, []));
    });

    // Assert: open before, and gone once its closing settles.
    expect(openBefore)
      .toBe(true);
    await waitFor(() =>
    {
      expect(screen.queryByRole('menu'))
        .toBeNull();
    });
  });

  it('plays a command\'s sound through the window\'s player', async () =>
  {
    // Arrange.
    const playSound = vi.fn<SoundPlayer>();
    await renderList({ playSound });

    // Act.
    fireEvent.click(screen.getByRole('button', { name: 'Play Heal1' }));

    // Assert.
    expect(playSound.mock.calls)
      .toStrictEqual([ [ 'audio/se/Heal1', { folder: 'se', name: 'Heal1', volume: 90, pitch: 100 } ] ]);
  });

  it('adds at the end of a body from its end row', async () =>
  {
    // Arrange.
    const { hub } = await renderList();
    const [ , topEnd ] = screen.getAllByText('Add a command');

    // Act.
    fireEvent.click(topEnd);
    const search = screen.getByRole('textbox', { name: 'Find a command' });
    fireEvent.change(search, { target: { value: 'erase event' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    // Assert.
    expect(commandsOf(hub).map(command => command.code).slice(-2))
      .toStrictEqual([ 214, 0 ]);
  });

  it('follows the document when it changes elsewhere', async () =>
  {
    // Arrange.
    const { hub } = await renderList();

    // Act.
    act(() =>
    {
      hub.edit('Elsewhere', [ eventHistoryKey(1, 1) ], tx => tx.set('map:1', [ ...PATH, 1, 'parameters' ], [ 45 ]));
    });

    // Assert.
    expect(screen.getByText('Wait 45 frames'))
      .toBeInTheDocument();
  });

  it('pastes what another window copied, however deep it was, at the list\'s end when nothing is focused', async () =>
  {
    // Arrange: a loop copied from inside a branch elsewhere.
    const { hub, list } = await renderList();
    const copied = writeClipboard([ cmd(112, 2), cmd(113, 3), cmd(0, 3), cmd(413, 2) ]);

    // Act.
    fireEvent.paste(list, { clipboardData: { getData: () => copied } });

    // Assert.
    expect(commandsOf(hub).slice(-5).map(command => `${command.code}@${command.indent}`))
      .toStrictEqual([ '112@0', '113@1', '0@1', '413@0', '0@0' ]);
  });
});
