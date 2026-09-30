import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { BUILT_IN_ENTRIES } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { pluginCommandEntry } from '../../../../src/mapEditor/core/commands/pluginCommands.ts';
import { readCommandTree } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { createCommandUnit } from '../../../../src/mapEditor/core/commandList/newCommand.ts';
import { cmd, MZ_STRUCTURE } from '../../support/commandFixtures.ts';

/*
 * The search inserts a fresh command, and a fresh command must be exactly what MZ would first write: its default
 * parameters, the lines it needs, and for a block the whole block (bodies ended, branches present, closer in place),
 * so the list it lands in stays well formed from the first keystroke. Every command the list offers is built here.
 */
describe('newCommand', () =>
{
  /**
   * Finds a built-in entry by code.
   * @param {number} code The code.
   * @returns {CommandCatalogEntry} The entry.
   */
  const entryOf = (code: number): CommandCatalogEntry => BUILT_IN_ENTRIES.find(entry => entry.code === code) as CommandCatalogEntry;

  describe('createCommandUnit', () =>
  {
    it('builds a plain command from its default parameters, as a copy', () =>
    {
      // Arrange.
      const entry = entryOf(121);

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect([ unit, unit[0].parameters === entry.defaultParameters ])
        .toStrictEqual([ [ cmd(121, 0, [ 1, 1, 0 ]) ], false ]);
    });

    it('builds a whole block around a block\'s opener', () =>
    {
      // Arrange.
      const entry = entryOf(111);

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect(unit)
        .toStrictEqual([ cmd(111, 0, [ 0, 1, 0 ]), cmd(0, 1), cmd(412, 0) ]);
    });

    it('builds lines that mirror the command', () =>
    {
      // Arrange: a move route with one step.
      const entry: CommandCatalogEntry = {
        ...entryOf(205),
        defaultParameters: [ -1, { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: false, wait: true } ],
      };

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect(unit.map(command => command.code))
        .toStrictEqual([ 205, 505 ]);
    });

    it('builds a plugin command with its plugin, command, words and argument defaults, and a line per argument', () =>
    {
      // Arrange.
      const entry = pluginCommandEntry({
        plugin: 'j/omni/J-OMNI-Quests',
        command: 'progress-quest',
        text: 'Progress Quest',
        args: [ { name: 'questKey', text: 'Quest', type: 'string', default: 'main-001' }, { name: 'count', type: 'number', default: '1' } ],
      });

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect(unit)
        .toStrictEqual([
          cmd(357, 0, [ 'j/omni/J-OMNI-Quests', 'progress-quest', 'Progress Quest', { questKey: 'main-001', count: '1' } ]),
          cmd(657, 0, [ 'Quest = main-001' ]),
          cmd(657, 0, [ 'count = 1' ]),
        ]);
    });

    it('builds a plugin command with no arguments and a name without the prefix as they are', () =>
    {
      // Arrange.
      const entry: CommandCatalogEntry = { ...pluginCommandEntry({ plugin: 'p', command: 'go', args: [] }), name: 'Go' };

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect(unit)
        .toStrictEqual([ cmd(357, 0, [ 'p', 'go', 'Go', {} ]) ]);
    });

    it('builds from the fields\' defaults when an entry gives no parameters', () =>
    {
      // Arrange.
      const entry: CommandCatalogEntry = { ...entryOf(230), defaultParameters: undefined };

      // Act.
      const unit = createCommandUnit(entry, MZ_STRUCTURE);

      // Assert.
      expect(unit)
        .toStrictEqual([ cmd(230, 0, [ 60 ]) ]);
    });

    it('builds every command the list offers as a well-formed unit', () =>
    {
      // Arrange.
      const offered = BUILT_IN_ENTRIES.filter(entry => entry.structural !== true);

      // Act.
      const strays = offered.filter(entry =>
      {
        const unit = createCommandUnit(entry, MZ_STRUCTURE);
        const tree = readCommandTree([ ...unit, cmd(0, 0) ], MZ_STRUCTURE);
        return tree.irregular !== 0 || tree.root.nodes.length !== 1;
      }).map(entry => entry.id);

      // Assert.
      expect(strays)
        .toStrictEqual([]);
    });
  });
});
