/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
   * @param {object} options The editors registered, and the sound player.
   * @returns {Promise<object>} The hub, the list element and the player.
   */
  const renderList = async (options: { registry?: CommandEditorRegistry; playSound?: SoundPlayer } = {}) =>
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
