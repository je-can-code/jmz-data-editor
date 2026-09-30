/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { MapEditorApi } from '../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { CommandCatalogEntry } from '../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandCatalog } from '../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { registerBuiltInCommands } from '../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import type { DatabaseNamesJson } from '../../../src/mapEditor/core/commandList/databaseNames.ts';
import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey } from '../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzEventCommand, RmmzMap } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { wireCommandEditing } from '../../../src/mapEditor/services/commandEditing.ts';
import type { MapEditorServices } from '../../../src/mapEditor/services/MapEditorServices.ts';
import { MapEditorServicesProvider } from '../../../src/mapEditor/services/MapEditorServicesContext.tsx';
import { CommandList } from '../../../src/mapEditor/views/commandList/CommandList.tsx';
import { SoundPlayerContext } from '../../../src/mapEditor/views/commandList/commandListResources.ts';
import { cmd } from '../support/commandFixtures.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * Command editing arrives in two halves, the list with its catalog and the eight hand-built editors with the
 * plugin headers, and this is where one window joins them. It owes the window every hand-built editor registered
 * from the start, and nothing fetched until a list asks. Once asked, it owes the catalog an entry for every command
 * the enabled plugins declare, the editors' pickers the project's names, and one read of each however often it is
 * asked. It tells the header store last, so anything redrawing on the headers finds the catalog and the names
 * already in place, and a project whose headers cannot be read still loses nothing but their plugin commands'
 * forms. In the list, Show Choices and Conditional Branch open in their own editors with the whole block, a merged
 * Show Choices run as one list, and a script arrives with its lines.
 */
describe('wireCommandEditing', () =>
{
  /**
   * A js/plugins.js listing one enabled plugin with one command.
   */
  const PLUGIN_LIST = 'var $plugins = [\n{"name":"j/time/J-TIME","status":true,"description":"","parameters":{}}\n];';

  /**
   * J-TIME's header: one command, named for the author.
   */
  const TIME_SOURCE = '/*:\n * @plugindesc Time.\n * @command stopTime\n * @text Stop TIME\n */';

  /**
   * The project's names: switch 1 is named, as is map 1.
   * @returns {DatabaseNamesJson} The names.
   */
  const buildNames = (): DatabaseNamesJson => ({
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
  });

  /**
   * A server stand-in counting what it is asked for.
   * @param {object} options Whether reading the plugin list fails, and what a plugin's source waits for.
   * @returns {{ api: MapEditorApi, asked: string[] }} The server and what it was asked, in order.
   */
  const buildApi = (options: { failHeaders?: boolean; sourcesWaitFor?: Promise<void> } = {}) =>
  {
    const asked: string[] = [];
    const api = {
      audioUrl: (folder: string, name: string) => `audio/${folder}/${name}`,
      loadPluginList: async () =>
      {
        asked.push('plugins');
        if (options.failHeaders === true)
        {
          throw new Error('no plugins.js');
        }

        return PLUGIN_LIST;
      },
      loadPluginSource: async (path: string) =>
      {
        asked.push(`source ${path}`);
        await options.sourcesWaitFor;
        return TIME_SOURCE;
      },
      loadDatabaseNames: async () =>
      {
        asked.push('names');
        return buildNames();
      },
      loadCommandUsage: async () => ({ events: 0, codes: {}, pluginCommands: [] }),
    } as unknown as MapEditorApi;
    return { api, asked };
  };

  /**
   * A catalog of the built-in commands, and an empty registry.
   * @returns {{ catalog: CommandCatalog, registry: CommandEditorRegistry }} The pieces.
   */
  const buildParts = () =>
  {
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    return { catalog, registry: new CommandEditorRegistry() };
  };

  /**
   * The id of the entry J-TIME's command becomes.
   */
  const STOP_TIME_ID = 'plugin:j/time/J-TIME:stopTime';

  it('registers every hand-built editor at once, and asks the server for nothing until a list does', () =>
  {
    // Arrange.
    const { api, asked } = buildApi();
    const { catalog, registry } = buildParts();

    // Act.
    wireCommandEditing(api, catalog, registry);

    // Assert.
    const handBuilt = [ 101, 102, 111, 122, 201, 205, 355, 357, 121 ]
      .map(code => registry.editorFor(catalog.resolve({ code, indent: 0, parameters: [] })) !== null);
    expect([ handBuilt, asked, catalog.entry(STOP_TIME_ID) ])
      .toStrictEqual([ [ true, true, true, true, true, true, true, true, false ], [], null ]);
  });

  it('hands the editors that read lines their lines: the catalog declares each one\'s continuation', () =>
  {
    // Arrange.
    const { catalog } = buildParts();

    // Act.
    const continuations = [ 101, 205, 355, 357 ].map(code => catalog.resolve({ code, indent: 0, parameters: [] }).continuation);

    // Assert.
    expect(continuations)
      .toStrictEqual([ 401, 505, 655, 657 ]);
  });

  it('reads the headers and names once, putting both in place before telling the header store', async () =>
  {
    // Arrange: a listener noting what it finds when the store tells it.
    const { api, asked } = buildApi();
    const { catalog, registry } = buildParts();
    const editing = wireCommandEditing(api, catalog, registry);
    const seen: unknown[] = [];
    editing.headers.subscribe(() => seen.push([ catalog.entry(STOP_TIME_ID)?.name, editing.environment.names?.('switch') ]));

    // Act.
    await Promise.all([ editing.load(), editing.load() ]);
    await editing.load();

    // Assert.
    expect([ seen, asked, editing.headers.library().withCommands().map(header => header.plugin) ])
      .toStrictEqual([
        [ [ 'Plugin: J-TIME Stop TIME', [ { id: 1, name: 'Door Open' } ] ] ],
        [ 'plugins', 'names', 'source j/time/J-TIME' ],
        [ 'j/time/J-TIME' ],
      ]);
  });

  it('keeps an entry already in the catalog for a command the headers declare', async () =>
  {
    // Arrange: a module registered its own entry for J-TIME's command first.
    const { api } = buildApi();
    const { catalog, registry } = buildParts();
    const own: CommandCatalogEntry = { id: STOP_TIME_ID, code: 357, name: 'Plugin: the module\'s own', category: 'Plugin', keywords: [], fields: [], sentence: 'x' };
    catalog.register(own);
    const editing = wireCommandEditing(api, catalog, registry);

    // Act.
    await editing.load();

    // Assert.
    expect(catalog.entry(STOP_TIME_ID))
      .toBe(own);
  });

  it('still reads the names, and tells the store, when the headers cannot be read', async () =>
  {
    // Arrange.
    const { api } = buildApi({ failHeaders: true });
    const { catalog, registry } = buildParts();
    const editing = wireCommandEditing(api, catalog, registry);
    const told = vi.fn();
    editing.headers.subscribe(told);

    // Act.
    await editing.load();

    // Assert.
    expect([ told.mock.calls.length, editing.headers.library().headers(), catalog.entries().length, editing.environment.names?.('map') ])
      .toStrictEqual([ 1, [], buildParts().catalog.entries().length, [ { id: 1, name: 'Town' } ] ]);
  });

  it('settles at once without a server, with nothing to read', async () =>
  {
    // Arrange.
    const { catalog, registry } = buildParts();
    const editing = wireCommandEditing(null, catalog, registry);
    const told = vi.fn();
    editing.headers.subscribe(told);

    // Act.
    await editing.load();

    // Assert.
    expect([ told.mock.calls.length, editing.environment.names?.('switch') ])
      .toStrictEqual([ 0, [] ]);
  });

  describe('in a command list', () =>
  {
    /**
     * The path to event 1's first page's list.
     */
    const PATH = [ 'events', 1, 'pages', 0, 'list' ] as const;

    /**
     * A page: a Show Choices run HIME_LargeChoices merges, a branch, a two-line script and a plugin command.
     * @returns {RmmzEventCommand[]} The list.
     */
    const buildList = (): RmmzEventCommand[] => [
      cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0),
      cmd(102, 0, [ [ 'B' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'B' ]), cmd(0, 1), cmd(404, 0),
      cmd(111, 0, [ 0, 1, 0 ]), cmd(230, 1, [ 30 ]), cmd(0, 1), cmd(412, 0),
      cmd(355, 0, [ 'a();' ]), cmd(655, 0, [ 'b();' ]),
      cmd(357, 0, [ 'j/time/J-TIME', 'stopTime', 'Stop TIME', {} ]),
      cmd(0, 0),
    ];

    /**
     * Renders a list over services wired the way a window wires them, and lets everything the list asked for land.
     * @param {Promise<void>} sourcesWaitFor What the plugins' sources wait for; nothing unless given.
     * @returns {Promise<{ loaded: () => Promise<void> }>} A way to wait for the headers, once let through.
     */
    const renderWired = async (sourcesWaitFor?: Promise<void>) =>
    {
      const map: RmmzMap = buildMapJson();
      (map.events[1] as NonNullable<RmmzMap['events'][number]>).pages[0].list = buildList();
      const hub = new DocumentHub({ clientId: 'window-a' });
      hub.adopt('map:1', map as never);
      const { api } = buildApi({ sourcesWaitFor });
      const { catalog, registry } = buildParts();
      const editing = wireCommandEditing(api, catalog, registry);
      const services = {
        hub,
        catalog,
        commandEditors: registry,
        api,
        pluginHeaders: editing.headers,
        loadCommandResources: editing.load,
      } as unknown as MapEditorServices;
      render(
        <MapEditorServicesProvider services={services}>
          <SoundPlayerContext.Provider value={vi.fn()}>
            <CommandList documentKey={'map:1'} path={PATH} histories={[ eventHistoryKey(1, 1) ]} label={'Page 1'}/>
          </SoundPlayerContext.Provider>
        </MapEditorServicesProvider>
      );
      const loaded = () => act(async () =>
      {
        await editing.load();
      });
      if (sourcesWaitFor === undefined)
      {
        await loaded();
      }
      else
      {
        // everything but the headers lands: the names, the usage counts.
        await act(async () =>
        {
          await new Promise(resolve =>
          {
            setTimeout(resolve, 0);
          });
        });
      }

      return { loaded };
    };

    it('redraws a plugin command in its header\'s words once the headers arrive, after everything else has', async () =>
    {
      // Arrange: the list shows while the plugin's source is still on its way.
      let release = () => undefined as void;
      const held = new Promise<void>(resolve =>
      {
        release = resolve;
      });
      const { loaded } = await renderWired(held);
      const before = screen.queryByText('Plugin: j/time/J-TIME stopTime') !== null;

      // Act.
      release();
      await loaded();

      // Assert.
      expect([ before, screen.queryByText('Stop TIME') !== null, screen.queryByText(/stopTime/u) ])
        .toStrictEqual([ true, true, null ]);
    });

    it('opens a merged Show Choices run from its second command as one list, in its own editor', async () =>
    {
      // Arrange.
      await renderWired();

      // Act.
      fireEvent.click(screen.getByText('Choices: B (cannot cancel)'));

      // Assert.
      expect([
        (screen.getByLabelText('Choice 1') as HTMLInputElement).value,
        (screen.getByLabelText('Choice 2') as HTMLInputElement).value,
        screen.queryByText('Shown as one list, kept as 2 commands of up to six.') !== null,
      ])
        .toStrictEqual([ 'A', 'B', true ]);
    });

    it('opens a conditional branch in its own editor, with its Else and the project\'s names', async () =>
    {
      // Arrange.
      await renderWired();

      // Act.
      fireEvent.click(screen.getByText('If switch #0001 Door Open is ON'));

      // Assert.
      expect([ screen.getByLabelText('Else branch') instanceof HTMLInputElement, screen.queryByDisplayValue('0001 Door Open') !== null ])
        .toStrictEqual([ true, true ]);
    });

    it('opens a script with the lines continuing it', async () =>
    {
      // Arrange.
      await renderWired();

      // Act.
      fireEvent.click(document.querySelector('[data-command-index="12"]') as HTMLElement);

      // Assert.
      expect((screen.getByLabelText('Script') as HTMLTextAreaElement).value)
        .toBe('a();\nb();');
    });
  });
});
