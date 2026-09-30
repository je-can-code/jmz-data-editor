import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../../../../src/mapEditor/core/commands/CommandEditorRegistry.ts';
import { isFieldVisible, readFields } from '../../../../src/mapEditor/core/commands/commandFields.ts';
import { kindForPluginType, pluginCommandEntry } from '../../../../src/mapEditor/core/commands/pluginCommands.ts';
import { renderSentence } from '../../../../src/mapEditor/core/commands/sentence.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * The command catalog is how the editor understands event commands: one declarative entry per command code,
 * saying what inputs it has, when each shows, what sentence its row reads as, where it sits and what words find
 * it. Plugin commands, read from plugin headers, join the same catalog under a "Plugin:" prefix and edit the same
 * way. The catalog owes the list three things: every command in every map resolves to an entry (one it does not
 * know resolves to an entry that leaves it untouched, so nothing is lost), an entry can only name fields it has,
 * and hand-built editors plug in without the generated forms ever leaving a gap.
 *
 * The entries here are fixtures in the format; the real ones are the command-list package's to write.
 */
describe('command catalog', () =>
{
  /**
   * Control Switches in the catalog format: a range, and ON or OFF.
   * @returns {CommandCatalogEntry} The entry.
   */
  const controlSwitches = (): CommandCatalogEntry => ({
    id: 'core:121',
    code: 121,
    name: 'Control Switches',
    category: 'Game Progression',
    keywords: [ 'flag', 'toggle' ],
    fields: [
      { key: 'start', label: 'Switch', param: [ 0 ], kind: 'switch', default: 1 },
      { key: 'end', label: 'Through', param: [ 1 ], kind: 'switch', default: 1 },
      { key: 'value', label: 'Set to', param: [ 2 ], kind: 'select', options: [ { value: 0, label: 'ON' }, { value: 1, label: 'OFF' } ], default: 0 },
    ],
    sentence: 'Switch {start} = {value}',
  });

  /**
   * Control Variables, cut down: an operand type decides which of two fields shows.
   * @returns {CommandCatalogEntry} The entry.
   */
  const controlVariables = (): CommandCatalogEntry => ({
    id: 'core:122',
    code: 122,
    name: 'Control Variables',
    category: 'Game Progression',
    keywords: [ 'math', 'number' ],
    fields: [
      { key: 'variable', label: 'Variable', param: [ 0 ], kind: 'variable' },
      { key: 'operand', label: 'Operand', param: [ 3 ], kind: 'select', options: [ { value: 0, label: 'Constant' }, { value: 1, label: 'Variable' } ] },
      { key: 'constant', label: 'Value', param: [ 4 ], kind: 'number', visibleWhen: { field: 'operand', equals: 0 } },
      { key: 'source', label: 'From', param: [ 4 ], kind: 'variable', visibleWhen: { field: 'operand', oneOf: [ 1 ] } },
    ],
    sentence: parts => `Variable ${parts.text('variable')} = ${parts.value('operand') === 0 ? parts.text('constant') : parts.text('source')}`,
  });

  /**
   * An else, which only exists inside a conditional branch.
   * @returns {CommandCatalogEntry} The entry.
   */
  const branchElse = (): CommandCatalogEntry => ({
    id: 'core:411',
    code: 411,
    name: 'Else',
    category: 'Flow Control',
    keywords: [],
    fields: [],
    sentence: 'Else',
    structural: true,
  });

  /**
   * A catalog holding the fixture entries.
   * @returns {CommandCatalog} The catalog.
   */
  const buildCatalog = (): CommandCatalog =>
  {
    const catalog = new CommandCatalog();
    [ controlSwitches(), controlVariables(), branchElse() ].forEach(entry => catalog.register(entry));
    return catalog;
  };

  /**
   * Builds a command.
   * @param {number} code The code.
   * @param {unknown[]} parameters The parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const command = (code: number, parameters: unknown[]): RmmzEventCommand => ({ code, indent: 0, parameters: parameters as never });

  describe('register', () =>
  {
    it('refuses an entry whose sentence names a field it does not have', () =>
    {
      // Arrange.
      const catalog = new CommandCatalog();

      // Act.
      const register = () => catalog.register({ ...controlSwitches(), id: 'core:999', sentence: 'Switch {swich} = {value}' });

      // Assert.
      expect(register)
        .toThrow('core:999 names fields it does not have: swich');
    });

    it('refuses an entry whose condition names a field it does not have', () =>
    {
      // Arrange.
      const catalog = new CommandCatalog();
      const entry = controlVariables();
      const broken = { ...entry, fields: [ ...entry.fields, { key: 'x', label: 'X', param: [ 5 ], kind: 'number' as const, visibleWhen: { not: { any: [ { all: [ { field: 'ghost', equals: 1 } ] } ] } } } ] };

      // Act.
      const register = () => catalog.register(broken);

      // Assert.
      expect(register)
        .toThrow('core:122 names fields it does not have: ghost');
    });

    it('refuses a second entry with the same id', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const register = () => catalog.register(controlSwitches());

      // Assert.
      expect(register)
        .toThrow('the catalog already has core:121');
    });
  });

  describe('resolve', () =>
  {
    it('finds a built-in command\'s entry by its code', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const entries = [ catalog.resolve(command(121, [ 5, 5, 0 ])).id, catalog.resolve(command(122, [ 1, 1, 0, 0, 3 ])).id ];

      // Assert.
      expect(entries)
        .toStrictEqual([ 'core:121', 'core:122' ]);
    });

    it('stands in for a code nobody described, with no fields to rewrite it', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const entry = catalog.resolve(command(250, [ { name: 'Door', volume: 90, pitch: 100, pan: 0 } ]));

      // Assert.
      expect([ entry.id, entry.name, entry.fields, renderSentence(entry, command(250, [])) ])
        .toStrictEqual([ 'unknown:250', 'Command 250', [], 'Command 250' ]);
    });

    it('finds a plugin command by plugin and command, not by its shared code', () =>
    {
      // Arrange.
      const catalog = buildCatalog();
      catalog.register(pluginCommandEntry({ plugin: 'J-OMNI-Quests', command: 'progress-quest', args: [] }));
      catalog.register(pluginCommandEntry({ plugin: 'J-OMNI-Quests', command: 'unlock-quests', args: [] }));

      // Act.
      const entry = catalog.resolve(command(357, [ 'J-OMNI-Quests', 'unlock-quests', 'Unlock Quests', {} ]));

      // Assert.
      expect(entry.id)
        .toBe('plugin:J-OMNI-Quests:unlock-quests');
    });

    it('stands in for a plugin command whose header was never read', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const entry = catalog.resolve(command(357, [ 'KMS_AreaEvent', 'setArea', '', {} ]));

      // Assert.
      expect([ entry.id, entry.name, entry.continuation, renderSentence(entry, command(357, [])) ])
        .toStrictEqual([ 'plugin:KMS_AreaEvent:setArea', 'Plugin: KMS_AreaEvent setArea', 657, 'Plugin: KMS_AreaEvent setArea' ]);
    });

    it('forgets an entry once unregistered, and says whether it was there', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const removed = [ catalog.unregister('core:121'), catalog.unregister('core:121') ];

      // Assert.
      expect([ removed, catalog.entry('core:121'), catalog.resolve(command(121, [])).id ])
        .toStrictEqual([ [ true, false ], null, 'unknown:121' ]);
    });
  });

  describe('fields', () =>
  {
    it('reads each field from where its path points', () =>
    {
      // Arrange.
      const entry = controlVariables();

      // Act.
      const values = readFields(command(122, [ 7, 7, 0, 1, 12 ]), entry);

      // Assert.
      expect(values)
        .toStrictEqual({ variable: 7, operand: 1, constant: 12, source: 12 });
    });

    it('shows a field only when its condition holds', () =>
    {
      // Arrange.
      const [ , , constant, source ] = controlVariables().fields;

      // Act.
      const visible = [
        isFieldVisible(constant, { operand: 0 }),
        isFieldVisible(source, { operand: 0 }),
        isFieldVisible(constant, { operand: 1 }),
        isFieldVisible(source, { operand: 1 }),
        isFieldVisible({ key: 'x', label: 'X', param: [ 0 ], kind: 'number' }, {}),
      ];

      // Assert.
      expect(visible)
        .toStrictEqual([ true, false, false, true, true ]);
    });

    it('combines conditions', () =>
    {
      // Arrange.
      const field = {
        key: 'x',
        label: 'X',
        param: [ 0 ],
        kind: 'number' as const,
        visibleWhen: { all: [ { field: 'a', equals: 1 }, { not: { field: 'b', equals: 2 } }, { any: [ { field: 'c', equals: 3 }, { field: 'd', oneOf: [ 4, 5 ] } ] } ] },
      };

      // Act.
      const visible = [
        isFieldVisible(field, { a: 1, b: 0, c: 3 }),
        isFieldVisible(field, { a: 1, b: 0, d: 5 }),
        isFieldVisible(field, { a: 1, b: 2, c: 3 }),
        isFieldVisible(field, { a: 1, b: 0, c: 9, d: 9 }),
      ];

      // Assert.
      expect(visible)
        .toStrictEqual([ true, true, false, false ]);
    });
  });

  describe('sentences', () =>
  {
    it('reads a template with names from the lookup and labels for choices', () =>
    {
      // Arrange.
      const entry = controlSwitches();
      const names = (kind: string, id: number) => (kind === 'switch' && id === 12 ? 'Met the chef' : null);

      // Act.
      const sentences = [
        renderSentence(entry, command(121, [ 12, 12, 0 ]), [], names),
        renderSentence(entry, command(121, [ 13, 13, 1 ]), [], names),
      ];

      // Assert.
      expect(sentences)
        .toStrictEqual([ 'Switch #0012 Met the chef = ON', 'Switch #0013 = OFF' ]);
    });

    it('lets a builder say what a template cannot', () =>
    {
      // Arrange.
      const entry = controlVariables();

      // Act.
      const sentences = [ renderSentence(entry, command(122, [ 3, 3, 0, 0, 50 ])), renderSentence(entry, command(122, [ 3, 3, 0, 1, 8 ])) ];

      // Assert.
      expect(sentences)
        .toStrictEqual([ 'Variable #0003 = 50', 'Variable #0003 = #0008' ]);
    });

    it('refuses a builder that reads a field the entry lacks', () =>
    {
      // Arrange.
      const entry: CommandCatalogEntry = { ...branchElse(), id: 'core:900', structural: false, sentence: parts => parts.text('ghost') };

      // Act.
      const render = () => renderSentence(entry, command(900, []));

      // Assert.
      expect(render)
        .toThrow('core:900 has no field "ghost"');
    });

    it('reads sounds, switches of state, empties and structures in words', () =>
    {
      // Arrange.
      const entry: CommandCatalogEntry = {
        id: 'core:250',
        code: 250,
        name: 'Play SE',
        category: 'Audio & Video',
        keywords: [],
        fields: [
          { key: 'sound', label: 'Sound', param: [ 0 ], kind: 'audio' },
          { key: 'flag', label: 'Flag', param: [ 1 ], kind: 'boolean' },
          { key: 'missing', label: 'Missing', param: [ 2 ], kind: 'text' },
          { key: 'shape', label: 'Shape', param: [ 3 ], kind: 'json' },
          { key: 'item', label: 'Item', param: [ 4 ], kind: 'item' },
        ],
        sentence: '{sound}|{flag}|{missing}|{shape}|{item}',
      };

      // Act.
      const sentences = [
        renderSentence(entry, command(250, [ { name: 'Door', volume: 90, pitch: 100, pan: 0 }, true, null, [ 1, 2 ], 7 ])),
        renderSentence(entry, command(250, [ { name: '', volume: 90, pitch: 100, pan: 0 }, false ]), [], (kind, id) => (kind === 'item' ? `n${id}` : null)),
      ];

      // Assert.
      expect(sentences)
        .toStrictEqual([ 'Door|On||[1,2]|#7', 'None|Off|||' ]);
    });
  });

  describe('search', () =>
  {
    it('ranks a name match above a keyword match, and never offers structural codes', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const found = catalog.search('control').map(entry => entry.id);
      const byKeyword = catalog.search('flag').map(entry => entry.id);
      const structural = catalog.search('else');

      // Assert.
      expect([ found, byKeyword, structural ])
        .toStrictEqual([ [ 'core:121', 'core:122' ], [ 'core:121' ], [] ]);
    });

    it('breaks ties by how often the project uses each command, and honours a limit', () =>
    {
      // Arrange.
      const catalog = buildCatalog();
      const usage = new Map([ [ 'core:122', 40 ], [ 'core:121', 3 ] ]);

      // Act.
      const ranked = catalog.search('control', { usage }).map(entry => entry.id);
      const limited = catalog.search('', { usage, limit: 1 }).map(entry => entry.id);

      // Assert.
      expect([ ranked, limited ])
        .toStrictEqual([ [ 'core:122', 'core:121' ], [ 'core:122' ] ]);
    });

    it('matches a word inside a name and a fragment anywhere', () =>
    {
      // Arrange.
      const catalog = buildCatalog();

      // Act.
      const results = [ catalog.search('variables').map(entry => entry.id), catalog.search('witch').map(entry => entry.id), catalog.search('zzz') ];

      // Assert.
      expect(results)
        .toStrictEqual([ [ 'core:122' ], [ 'core:121' ], [] ]);
    });
  });

  describe('plugin commands', () =>
  {
    it('join the catalog under the Plugin prefix, found by plugin, command and words', () =>
    {
      // Arrange.
      const catalog = buildCatalog();
      const entry = pluginCommandEntry({
        plugin: 'J-OMNI-Quests',
        command: 'progress-quest',
        text: 'Progress Quest',
        description: 'Moves a quest objective forward.',
        args: [
          { name: 'questKey', text: 'Quest', type: 'string' },
          { name: 'count', type: 'number', default: '1', min: 1, max: 99 },
        ],
      });

      // Act.
      catalog.register(entry);

      // Assert.
      expect([ entry.name, entry.category, entry.code, catalog.search('objective').map(each => each.id), catalog.search('omni').map(each => each.id) ])
        .toStrictEqual([ 'Plugin: Progress Quest', 'Plugin', 357, [ entry.id ], [ entry.id ] ]);
    });

    it('read their arguments as text from the argument object, and say them in the row', () =>
    {
      // Arrange.
      const entry = pluginCommandEntry({
        plugin: 'J-OMNI-Quests',
        command: 'progress-quest',
        text: 'Progress Quest',
        args: [ { name: 'questKey', text: 'Quest', type: 'string' }, { name: 'silent', type: 'boolean' } ],
      });
      const stored = command(357, [ 'J-OMNI-Quests', 'progress-quest', 'Progress Quest', { questKey: 'chef-01', silent: '' } ]);

      // Act.
      const fields = entry.fields.map(field => [ field.param, field.storage, field.kind ]);
      const sentence = renderSentence(entry, stored);
      const bare = renderSentence(entry, command(357, [ 'J-OMNI-Quests', 'progress-quest', '', {} ]));

      // Assert.
      expect([ fields, sentence, bare ])
        .toStrictEqual([ [ [ [ 3, 'questKey' ], 'string', 'text' ], [ [ 3, 'silent' ], 'string', 'boolean' ] ], 'Progress Quest: Quest chef-01', 'Progress Quest' ]);
    });

    it('edit each header type as the field kind it means', () =>
    {
      // Arrange: header types, simple and compound.

      // Act.
      const kinds = [ 'number', 'switch', 'common_event', 'multiline_string', 'struct<Reward>', 'number[]', 'struct<Reward>[]', 'location', 'mystery' ].map(kindForPluginType);

      // Assert.
      expect(kinds)
        .toStrictEqual([ 'number', 'switch', 'common-event', 'multiline', 'struct', 'list', 'list', 'map-point', 'text' ]);
    });

    it('read a numeric id argument kept as text as the name it points at', () =>
    {
      // Arrange.
      const entry = pluginCommandEntry({ plugin: 'P', command: 'give', args: [ { name: 'item', type: 'item' } ] });

      // Act.
      const sentence = renderSentence(entry, command(357, [ 'P', 'give', '', { item: '12' } ]), [], (_kind, id) => `Potion ${id}`);

      // Assert.
      expect(sentence)
        .toBe('give: item #12 Potion 12');
    });
  });

  describe('CommandEditorRegistry', () =>
  {
    it('finds an entry\'s own editor, then its code\'s, then none', () =>
    {
      // Arrange.
      const registry = new CommandEditorRegistry<string>();
      registry.registerForCode(357, 'plugin command editor');
      registry.registerForEntry('plugin:J-OMNI-Quests:progress-quest', 'quest editor');
      const quest = pluginCommandEntry({ plugin: 'J-OMNI-Quests', command: 'progress-quest', args: [] });
      const other = pluginCommandEntry({ plugin: 'J-OMNI-Quests', command: 'unlock-quests', args: [] });

      // Act.
      const editors = [ registry.editorFor(quest), registry.editorFor(other), registry.editorFor(controlSwitches()) ];

      // Assert.
      expect(editors)
        .toStrictEqual([ 'quest editor', 'plugin command editor', null ]);
    });

    it('refuses a second editor for the same entry or code', () =>
    {
      // Arrange.
      const registry = new CommandEditorRegistry<string>();
      registry.registerForCode(101, 'show text');
      registry.registerForEntry('core:101', 'show text');

      // Act.
      const attempts = [ () => registry.registerForCode(101, 'again'), () => registry.registerForEntry('core:101', 'again') ];

      // Assert.
      expect(attempts[0])
        .toThrow('code 101 already has an editor');
      expect(attempts[1])
        .toThrow('core:101 already has an editor');
    });
  });
});
