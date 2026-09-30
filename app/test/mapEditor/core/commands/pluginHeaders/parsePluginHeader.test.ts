import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePluginHeader } from '../../../../../src/mapEditor/core/commands/pluginHeaders/parsePluginHeader.ts';
import { readPluginEntries } from '../../../../../src/services/plugins/PluginsJsReader.ts';
import { locateGameProject } from '../../../../support/gameProject.ts';

/*
 * Plugin commands come from plugin headers: MZ reads a plugin's /*: comment for its @command and @arg tags, and
 * /*~struct~ comments for the structs those arguments use. The parser owes the plugin command editor every
 * command with every argument typed exactly as the header says, and nothing a plugin did not declare: plugin
 * sources are full of JSDoc (@type {string}) that must never be mistaken for a header, headers are written with
 * and without leading asterisks, descriptions run over several lines, options may have values or not, and a
 * struct's colon is sometimes left off. A translated header is only read when there is no untranslated one.
 *
 * The real headers are checked against the game's own plugins, and skip when the game is not present.
 */
describe('parsePluginHeader', () =>
{
  it('reads each command with its arguments, and each argument\'s tags', () =>
  {
    // Arrange.
    const source = [
      '/*:',
      ' * @target MZ',
      ' * @plugindesc Quests.',
      ' * @param menu-switch',
      ' * @type switch',
      ' * @default 101',
      ' *',
      ' * @command finalize-quest',
      ' * @text Finalize Quest',
      ' * @desc Flags a quest as finalized.',
      ' * @arg key',
      ' * @type string',
      ' * @arg state',
      ' * @text Finalized State',
      ' * @type select',
      ' * @option Completed',
      ' * @value 0',
      ' * @option Failed',
      ' * @value 1',
      ' * @default 0',
      ' * @arg count',
      ' * @type number',
      ' * @min -1',
      ' * @max 99',
      ' * @decimals 2',
      ' * @arg tracked',
      ' * @type boolean',
      ' * @on Track',
      ' * @off Ignore',
      ' * @arg face',
      ' * @type file',
      ' * @dir img/faces/',
      ' * @require 1',
      ' */',
    ].join('\n');

    // Act.
    const header = parsePluginHeader('j/omni/ext/J-OMNI-Quests', source);

    // Assert: the plugin setting before the command is no argument.
    expect(header)
      .toStrictEqual({
        plugin: 'j/omni/ext/J-OMNI-Quests',
        description: 'Quests.',
        commands: [ {
          plugin: 'j/omni/ext/J-OMNI-Quests',
          command: 'finalize-quest',
          text: 'Finalize Quest',
          description: 'Flags a quest as finalized.',
          args: [
            { name: 'key', type: 'string' },
            { name: 'state', text: 'Finalized State', type: 'select', default: '0', options: [ { value: '0', label: 'Completed' }, { value: '1', label: 'Failed' } ] },
            { name: 'count', type: 'number', min: -1, max: 99, decimals: 2 },
            { name: 'tracked', type: 'boolean', on: 'Track', off: 'Ignore' },
            { name: 'face', type: 'file', dir: 'img/faces/', require: true },
          ],
        } ],
        structs: [],
      });
  });

  it('carries a description over the lines after its tag, up to a blank line', () =>
  {
    // Arrange: J-ABS writes its descriptions starting on the line after the tag.
    const source = [
      '/*:',
      ' * @command Set JABS Skill',
      ' * @desc',
      ' * Assigns a skill to a slot.',
      ' * Unlearned skills are removed.',
      ' *',
      ' * this is help, not description',
      ' * @arg actorId',
      ' * @type actor',
      ' * @desc',
      ' * The actor.',
      ' * Never "none".',
      ' */',
    ].join('\n');

    // Act.
    const [ command ] = parsePluginHeader('j/abs/J-ABS', source).commands;

    // Assert.
    expect([ command.description, command.args[0].description ])
      .toStrictEqual([ 'Assigns a skill to a slot.\nUnlearned skills are removed.', 'The actor.\nNever "none".' ]);
  });

  it('reads an option with no value as its own text, and an argument with no type as text', () =>
  {
    // Arrange.
    const source = '/*:\n * @command Unlock\n * @arg Slot\n * @type select\n * @option Tool\n * @option Dodge\n * @arg note\n */';

    // Act.
    const [ command ] = parsePluginHeader('P', source).commands;

    // Assert.
    expect(command.args)
      .toStrictEqual([
        { name: 'Slot', type: 'select', options: [ { value: 'Tool', label: 'Tool' }, { value: 'Dodge', label: 'Dodge' } ] },
        { name: 'note', type: 'string' },
      ]);
  });

  it('reads headers written without leading asterisks', () =>
  {
    // Arrange: HIME's style.
    const source = '/*:\n@plugindesc v1.2 - Combines choices\ninto one list.\n@command go\n@text Go\n@arg speed\n@type number\n */';

    // Act.
    const header = parsePluginHeader('others/HIME_LargeChoices', source);

    // Assert.
    expect([ header.description, header.commands.map(command => [ command.command, command.text, command.args ]) ])
      .toStrictEqual([ 'v1.2 - Combines choices\ninto one list.', [ [ 'go', 'Go', [ { name: 'speed', type: 'number' } ] ] ] ]);
  });

  it('never reads JSDoc or a stray @arg as part of the header', () =>
  {
    // Arrange: an @arg before any command, and a JSDoc block with tags after the header.
    const source = [
      '/*:',
      ' * @arg orphan',
      ' * @type number',
      ' * @command real',
      ' */',
      '/**',
      ' * @command fake',
      ' * @type {string}',
      ' */',
      '/* @command alsoFake */',
    ].join('\n');

    // Act.
    const header = parsePluginHeader('P', source);

    // Assert.
    expect(header.commands)
      .toStrictEqual([ { plugin: 'P', command: 'real', args: [] } ]);
  });

  it('keeps the first of two commands with the same name, and ignores a command with no name', () =>
  {
    // Arrange.
    const source = '/*:\n * @command go\n * @text First\n * @command go\n * @text Second\n * @command\n * @text Nameless\n */';

    // Act.
    const header = parsePluginHeader('P', source);

    // Assert.
    expect(header.commands)
      .toStrictEqual([ { plugin: 'P', command: 'go', text: 'First', args: [] } ]);
  });

  it('reads structs with or without their colon, in the header\'s language', () =>
  {
    // Arrange: a Japanese header first, an untranslated one after, and structs in both styles.
    const source = [
      '/*:ja',
      ' * @command go',
      ' * @text 行く',
      ' */',
      '/*:',
      ' * @command go',
      ' * @text Go',
      ' * @arg reward',
      ' * @type struct<Reward>[]',
      ' */',
      '/*~struct~Reward:ja',
      ' * @param item',
      ' * @text アイテム',
      ' */',
      '/*~struct~Reward:',
      ' * @param item',
      ' * @type item',
      ' * @param count',
      ' * @type number',
      ' * @default 1',
      ' */',
      '/*~struct~soundEffect',
      ' * @param name',
      ' * @type file',
      ' */',
    ].join('\n');

    // Act.
    const header = parsePluginHeader('P', source);

    // Assert.
    expect([ header.commands[0].text, header.structs ])
      .toStrictEqual([
        'Go',
        [
          { name: 'Reward', params: [ { name: 'item', type: 'item' }, { name: 'count', type: 'number', default: '1' } ] },
          { name: 'soundEffect', params: [ { name: 'name', type: 'file' } ] },
        ],
      ]);
  });

  it('falls back to English, then to the first translation, when there is no untranslated header', () =>
  {
    // Arrange.
    const english = '/*:ja\n * @command a\n */\n/*:en\n * @command b\n */';
    const onlyJapanese = '/*:ja\n * @command c\n */\n/*:zh\n * @command d\n */';

    // Act.
    const commands = [ english, onlyJapanese ].map(source => parsePluginHeader('P', source).commands.map(command => command.command));

    // Assert.
    expect(commands)
      .toStrictEqual([ [ 'b' ], [ 'c' ] ]);
  });

  it('declares nothing for a plugin with no header', () =>
  {
    // Arrange: a separator plugin, which is only a comment line.
    const source = '// --------------------------';

    // Act.
    const header = parsePluginHeader('--------------------------', source);

    // Assert.
    expect(header)
      .toStrictEqual({ plugin: '--------------------------', description: '', commands: [], structs: [] });
  });

  it('ignores a value tag before any option, and a number tag that is no number', () =>
  {
    // Arrange.
    const source = '/*:\n * @command go\n * @arg pick\n * @value 3\n * @min lots\n * @max\n */';

    // Act.
    const [ command ] = parsePluginHeader('P', source).commands;

    // Assert.
    expect(command.args)
      .toStrictEqual([ { name: 'pick', type: 'string' } ]);
  });

  describe.skipIf(locateGameProject() === null)('the game\'s own plugins', () =>
  {
    const project = locateGameProject() as string;

    /**
     * Reads one of the game's plugins.
     * @param {string} name The plugin's name as plugins.js spells it.
     * @returns {ReturnType<typeof parsePluginHeader>} Its header.
     */
    const read = (name: string) => parsePluginHeader(name, readFileSync(`${project}/js/plugins/${name}.js`, 'utf8'));

    it('reads J-OMNI-Quests\' four commands, a list, a select with values and a boolean with labels', () =>
    {
      // Arrange: the plugin behind most of the game's plugin commands.

      // Act.
      const header = read('j/omni/ext/J-OMNI-Quests');

      // Assert.
      expect(header.commands.map(command => [ command.command, command.text, command.args.map(arg => [ arg.name, arg.type ]) ]))
        .toStrictEqual([
          [ 'unlock-quests', 'Unlock Quest(s)', [ [ 'keys', 'string[]' ] ] ],
          [ 'progress-quest', 'Progress Quest', [ [ 'key', 'string' ] ] ],
          [ 'finalize-quest', 'Finalize Quest', [ [ 'key', 'string' ], [ 'state', 'select' ] ] ],
          [ 'set-quest-tracking', 'Set Quest Tracking', [ [ 'key', 'string' ], [ 'trackingState', 'boolean' ] ] ],
        ]);
      expect([ header.commands[2].args[1].options, header.commands[3].args[1] ])
        .toStrictEqual([
          [ { value: '0', label: 'Completed' }, { value: '1', label: 'Failed' }, { value: '2', label: 'Missed' } ],
          {
            name: 'trackingState',
            description: 'True if the quest should be tracked, false otherwise.',
            type: 'boolean',
            default: 'true',
            on: 'Start Tracking Quest',
            off: 'Stop Tracking Quest',
          },
        ]);
    });

    it('reads J-ABS\' commands and its struct, past thousands of lines of JSDoc', () =>
    {
      // Arrange: J-ABS declares a struct for a plugin setting.

      // Act.
      const header = read('j/abs/J-ABS');
      const setSkill = header.commands.find(command => command.command === 'Set JABS Skill');

      // Assert.
      expect([ header.commands.length, setSkill?.args.map(arg => arg.name), setSkill?.args[3].options?.length, header.structs ])
        .toStrictEqual([
          13,
          [ 'actorId', 'skillId', 'itemId', 'slot', 'locked' ],
          8,
          [ {
            name: 'ElementalIconStruct',
            params: [
              { name: 'elementId', description: 'The id of the element to match an icon to.', type: 'number', default: '0' },
              { name: 'iconIndex', description: 'The index of the icon for this element.', type: 'number', default: '64' },
            ],
          } ],
        ]);
    });

    it('reads J-ABS-Charge\'s struct, whose header leaves off the colon', () =>
    {
      // Arrange.

      // Act.
      const header = read('j/abs/ext/J-ABS-Charge');

      // Assert.
      expect(header.structs.map(struct => [ struct.name, struct.params.map(param => [ param.name, param.type, param.min, param.max ]) ]))
        .toStrictEqual([ [ 'soundEffect', [ [ 'name', 'file', undefined, undefined ], [ 'volume', 'number', 0, 100 ], [ 'pitch', 'number', 50, 150 ], [ 'pan', 'number', -100, 100 ] ] ] ]);
    });

    it('reads HIME_LargeChoices, written without asterisks, as offering no commands', () =>
    {
      // Arrange.

      // Act.
      const header = read('others/HIME_LargeChoices');

      // Assert.
      expect([ header.description, header.commands ])
        .toStrictEqual([ 'v1.2 - Combines multiple show choice commands into a single,\nlarge list.', [] ]);
    });

    it('reads every enabled plugin without failing', () =>
    {
      // Arrange: every enabled plugin with a file.
      const names = readPluginEntries(readFileSync(`${project}/js/plugins.js`, 'utf8'))
        .filter(entry => entry.status && existsSync(`${project}/js/plugins/${entry.name}.js`))
        .map(entry => entry.name);

      // Act.
      const headers = names.map(read);

      // Assert: plenty of plugins, and at least the 26 that offer commands today.
      expect([ headers.length > 50, headers.filter(header => header.commands.length > 0).length >= 26 ])
        .toStrictEqual([ true, true ]);
    });
  });
});
