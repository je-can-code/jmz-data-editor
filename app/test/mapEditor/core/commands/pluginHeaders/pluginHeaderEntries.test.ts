import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { parsePluginHeader } from '../../../../../src/mapEditor/core/commands/pluginHeaders/parsePluginHeader.ts';
import type { PluginHeader } from '../../../../../src/mapEditor/core/commands/pluginHeaders/pluginHeader.ts';
import { pluginHeaderEntries } from '../../../../../src/mapEditor/core/commands/pluginHeaders/pluginHeaderEntries.ts';
import { readPluginEntries } from '../../../../../src/services/plugins/PluginsJsReader.ts';
import { locateGameProject } from '../../../../support/gameProject.ts';

/*
 * Plugin commands join the command list as catalog entries, one per command a header declares, so they are
 * searched, shown and edited like built-in commands. Each entry reads "Plugin: <plugin> <command>" (the plugin
 * by its file name, the command by the name its plugin gives it), which keeps same-named commands of different
 * plugins apart. Its id is what a stored plugin command resolves to, so it must name the plugin exactly as
 * js/plugins.js does. Every enabled plugin's entries must register in one catalog without a clash.
 */
describe('pluginHeaderEntries', () =>
{
  /**
   * Two plugins that both offer a "call-menu".
   * @returns {PluginHeader[]} The headers.
   */
  const headers = (): PluginHeader[] => [
    {
      plugin: 'j/jafting/ext/J-JAFTING-Creation',
      description: '',
      commands: [
        { plugin: 'j/jafting/ext/J-JAFTING-Creation', command: 'call-menu', text: 'Call the Creation Menu', args: [] },
        { plugin: 'j/jafting/ext/J-JAFTING-Creation', command: 'unlock-recipes', args: [ { name: 'recipeKeys', type: 'string[]', text: 'Recipe Keys' } ] },
      ],
      structs: [],
    },
    {
      plugin: 'j/jafting/ext/J-JAFTING-Refinement',
      description: '',
      commands: [ { plugin: 'j/jafting/ext/J-JAFTING-Refinement', command: 'call-menu', text: 'Call the Refinement Menu', args: [] } ],
      structs: [],
    },
  ];

  it('names each entry by plugin file name and command, and ids it by the plugin as plugins.js spells it', () =>
  {
    // Arrange: the headers above.

    // Act.
    const entries = pluginHeaderEntries(headers());

    // Assert: a command with no text is named by its own name.
    expect(entries.map(entry => [ entry.id, entry.name, entry.category, entry.code ]))
      .toStrictEqual([
        [ 'plugin:j/jafting/ext/J-JAFTING-Creation:call-menu', 'Plugin: J-JAFTING-Creation Call the Creation Menu', 'Plugin', 357 ],
        [ 'plugin:j/jafting/ext/J-JAFTING-Creation:unlock-recipes', 'Plugin: J-JAFTING-Creation unlock-recipes', 'Plugin', 357 ],
        [ 'plugin:j/jafting/ext/J-JAFTING-Refinement:call-menu', 'Plugin: J-JAFTING-Refinement Call the Refinement Menu', 'Plugin', 357 ],
      ]);
  });

  it('types each argument as a field read from the command\'s arguments', () =>
  {
    // Arrange: the headers above.

    // Act.
    const [ , unlock ] = pluginHeaderEntries(headers());

    // Assert.
    expect(unlock.fields.map(field => [ field.key, field.label, field.kind, field.param, field.storage ]))
      .toStrictEqual([ [ 'recipeKeys', 'Recipe Keys', 'list', [ 3, 'recipeKeys' ], 'string' ] ]);
  });

  it('gives a stored plugin command its entry once registered', () =>
  {
    // Arrange.
    const catalog = new CommandCatalog();
    pluginHeaderEntries(headers()).forEach(entry => catalog.register(entry));

    // Act.
    const entry = catalog.resolve({ code: 357, indent: 0, parameters: [ 'j/jafting/ext/J-JAFTING-Refinement', 'call-menu', 'Call the Refinement Menu', {} ] });

    // Assert.
    expect(entry.name)
      .toBe('Plugin: J-JAFTING-Refinement Call the Refinement Menu');
  });

  it('contributes a plugin listed twice only once', () =>
  {
    // Arrange.
    const [ first ] = headers();

    // Act.
    const entries = pluginHeaderEntries([ first, first ]);

    // Assert.
    expect(entries.map(entry => entry.id))
      .toStrictEqual([ 'plugin:j/jafting/ext/J-JAFTING-Creation:call-menu', 'plugin:j/jafting/ext/J-JAFTING-Creation:unlock-recipes' ]);
  });

  it.skipIf(locateGameProject() === null)('registers every enabled plugin\'s commands in one catalog without a clash', () =>
  {
    // Arrange: every enabled plugin the game ships.
    const project = locateGameProject() as string;
    const parsed = readPluginEntries(readFileSync(`${project}/js/plugins.js`, 'utf8'))
      .filter(entry => entry.status && existsSync(`${project}/js/plugins/${entry.name}.js`))
      .map(entry => parsePluginHeader(entry.name, readFileSync(`${project}/js/plugins/${entry.name}.js`, 'utf8')));
    const catalog = new CommandCatalog();

    // Act.
    pluginHeaderEntries(parsed).forEach(entry => catalog.register(entry));

    // Assert: a hundred or so, and the quest commands findable by search.
    expect([ catalog.entries().length >= 100, catalog.search('progress quest').map(entry => entry.name)[0] ])
      .toStrictEqual([ true, 'Plugin: J-OMNI-Quests Progress Quest' ]);
  });
});
