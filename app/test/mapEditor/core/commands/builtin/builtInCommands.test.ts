import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry, CommandField } from '../../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandCatalog } from '../../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { BUILT_IN_ENTRIES, registerBuiltInCommands } from '../../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { conditionFields } from '../../../../../src/mapEditor/core/commands/commandFields.ts';
import { renderSentence, type NameLookup } from '../../../../../src/mapEditor/core/commands/sentence.ts';
import type { JsonValue } from '../../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { locateGameProject } from '../../../../support/gameProject.ts';

/*
 * The built-in catalog is the editor's whole understanding of RMMZ's event commands: one entry per code, saying
 * what inputs it has, when each shows, what its row reads as and how a fresh one starts. It owes the list four
 * things. Every code the engine runs or MZ writes has an entry, so no row is ever a mystery. Every entry only names
 * fields it has, and every field it offers starts at a value its own control can show. A fresh command built from
 * an entry reads as a sentence. And the sentences read right: the right name for an id, the right branch of a
 * command whose shape depends on a choice, notes only when they apply.
 */
describe('built-in commands', () =>
{
  /**
   * Names rows the way the database would, so sentences can be checked with names in them.
   * @param {string} kind The kind of row.
   * @param {number} id The row id.
   * @returns {string | null} A name for a few known rows, null for the rest.
   */
  const names: NameLookup = (kind, id) =>
  {
    const known: Record<string, string> = {
      'switch:1': 'Door Open',
      'switch:4': 'Gate',
      'variable:2': 'Coins',
      'actor:1': 'Harold',
      'item:45': 'Potion',
      'map:2': 'Town',
      'common-event:31': 'Heal Party',
      'state:9': 'Poison',
    };
    return known[`${kind}:${id}`] ?? null;
  };

  /**
   * Builds a catalog of the built-in commands.
   * @returns {CommandCatalog} The catalog.
   */
  const buildCatalog = (): CommandCatalog =>
  {
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    return catalog;
  };

  /**
   * Reads a command's sentence through the catalog.
   * @param {number} code The code.
   * @param {JsonValue[]} parameters The parameters.
   * @param {RmmzEventCommand[]} continuation The lines continuing it.
   * @returns {string} The sentence.
   */
  const sentenceOf = (code: number, parameters: JsonValue[], continuation: RmmzEventCommand[] = []): string =>
  {
    const command: RmmzEventCommand = { code, indent: 0, parameters };
    return renderSentence(buildCatalog().resolve(command), command, continuation, names);
  };

  /**
   * Lists an entry's fields, its continuation fields included.
   * @param {CommandCatalogEntry} entry The entry.
   * @returns {CommandField[]} The fields.
   */
  const allFields = (entry: CommandCatalogEntry): CommandField[] => [ ...entry.fields, ...entry.continuationFields ?? [] ];

  describe('coverage', () =>
  {
    it('has an entry for every command code RMMZ writes, each code once', () =>
    {
      // Arrange: every code of MZ's command window, and every code that lives inside another command.
      const codes = [
        0, 101, 102, 103, 104, 105, 108, 109, 111, 112, 113, 115, 117, 118, 119, 121, 122, 123, 124, 125, 126, 127,
        128, 129, 132, 133, 134, 135, 136, 137, 138, 139, 140, 201, 202, 203, 204, 205, 206, 211, 212, 213, 214, 216,
        217, 221, 222, 223, 224, 225, 230, 231, 232, 233, 234, 235, 236, 241, 242, 243, 244, 245, 246, 249, 250, 251,
        261, 281, 282, 283, 284, 285, 301, 302, 303, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323,
        324, 325, 326, 331, 332, 333, 334, 335, 336, 337, 339, 340, 342, 351, 352, 353, 354, 355, 356, 357, 401, 402,
        403, 404, 405, 408, 409, 411, 412, 413, 505, 601, 602, 603, 604, 605, 655, 657,
      ];

      // Act.
      const covered = BUILT_IN_ENTRIES.map(entry => entry.code).sort((left, right) => left - right);

      // Assert.
      expect(covered)
        .toStrictEqual(codes);
    });

    it.skipIf(locateGameProject() === null)('has an entry for every command the game\'s engine runs', () =>
    {
      // Arrange: the engine's own interpreter, which runs a command code by calling commandNNN.
      const source = readFileSync(`${locateGameProject()}/js/rmmz_objects.js`, 'utf8');
      const run = [ ...source.matchAll(/Game_Interpreter\.prototype\.command(\d+)\s*=/gu) ].map(([ , code ]) => Number(code));

      // Act.
      const missing = run.filter(code => BUILT_IN_ENTRIES.some(entry => entry.code === code) === false);

      // Assert: the engine runs over a hundred codes, and each has an entry.
      expect([ run.length > 100, missing ])
        .toStrictEqual([ true, [] ]);
    });
  });

  describe('entries', () =>
  {
    it('register into a catalog, which checks every sentence and condition names only fields the entry has', () =>
    {
      // Arrange: nothing beyond the catalog built below.

      // Act.
      const catalog = buildCatalog();

      // Assert.
      expect(catalog.entries().length)
        .toBe(BUILT_IN_ENTRIES.length);
    });

    it('give every field a key unique within its entry', () =>
    {
      // Arrange.
      const duplicated: string[] = [];

      // Act.
      BUILT_IN_ENTRIES.forEach(entry =>
      {
        [ entry.fields, entry.continuationFields ?? [] ].forEach(fields =>
        {
          const keys = fields.map(field => field.key);
          keys.filter((key, position) => keys.indexOf(key) !== position).forEach(key => duplicated.push(`${entry.id}.${key}`));
        });
      });

      // Assert.
      expect(duplicated)
        .toStrictEqual([]);
    });

    it('start every choice at one of its own options', () =>
    {
      // Arrange.
      const strays: string[] = [];

      // Act.
      BUILT_IN_ENTRIES.flatMap(entry => allFields(entry).map(field => ({ entry, field })))
        .filter(({ field }) => field.kind === 'select' || field.kind === 'self-switch')
        .forEach(({ entry, field }) =>
        {
          const offered = (field.options ?? []).some(option => option.value === field.default);
          if (offered === false)
          {
            strays.push(`${entry.id}.${field.key}`);
          }
        });

      // Assert.
      expect(strays)
        .toStrictEqual([]);
    });

    it('name only their own continuation fields in continuation conditions', () =>
    {
      // Arrange.
      const strays: string[] = [];

      // Act.
      BUILT_IN_ENTRIES.forEach(entry =>
      {
        const fields = entry.continuationFields ?? [];
        const keys = new Set(fields.map(field => field.key));
        fields.flatMap(field => (field.visibleWhen === undefined ? [] : conditionFields(field.visibleWhen)))
          .filter(key => keys.has(key) === false)
          .forEach(key => strays.push(`${entry.id}.${key}`));
      });

      // Assert.
      expect(strays)
        .toStrictEqual([]);
    });

    it('give every command the list offers a fresh shape that reads as a sentence', () =>
    {
      // Arrange.
      const offered = BUILT_IN_ENTRIES.filter(entry => entry.structural !== true);

      // Act.
      const sentences = offered.map(entry =>
      {
        const command: RmmzEventCommand = { code: entry.code, indent: 0, parameters: [ ...entry.defaultParameters ?? [] ] as JsonValue[] };
        return { id: entry.id, fresh: entry.defaultParameters !== undefined, sentence: renderSentence(entry, command, [], names) };
      });

      // Assert.
      expect(sentences.filter(({ fresh, sentence }) => fresh === false || sentence.trim() === ''))
        .toStrictEqual([]);
    });

    it('mark only the codes that live inside other commands as structural', () =>
    {
      // Arrange.
      const inside = [ 0, 401, 402, 403, 404, 405, 408, 409, 411, 412, 413, 505, 601, 602, 603, 604, 605, 655, 657 ];

      // Act.
      const structural = BUILT_IN_ENTRIES.filter(entry => entry.structural === true).map(entry => entry.code);

      // Assert.
      expect(structural)
        .toStrictEqual(inside);
    });
  });

  describe('sentences', () =>
  {
    it('reads one switch, and a range of them, by name', () =>
    {
      // Arrange: a single switch and a range beside it.

      // Act.
      const read = [ sentenceOf(121, [ 1, 1, 0 ]), sentenceOf(121, [ 1, 4, 1 ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Switch #0001 Door Open = ON', 'Switches #0001 Door Open to #0004 Gate = OFF' ]);
    });

    it('reads each kind of variable operand in its own words', () =>
    {
      // Arrange: a constant, a variable, a random range, game data, and a script.

      // Act.
      const read = [
        sentenceOf(122, [ 2, 2, 1, 0, 5 ]),
        sentenceOf(122, [ 2, 2, 0, 1, 2 ]),
        sentenceOf(122, [ 2, 2, 0, 2, 1, 6 ]),
        sentenceOf(122, [ 2, 2, 0, 3, 3, 1, 0 ]),
        sentenceOf(122, [ 2, 2, 2, 4, 'Math.random()' ]),
      ];

      // Assert.
      expect(read)
        .toStrictEqual([
          'Variable #0002 Coins += 5',
          'Variable #0002 Coins = #0002 Coins',
          'Variable #0002 Coins = random 1 to 6',
          'Variable #0002 Coins = Level of #1 Harold',
          'Variable #0002 Coins -= script: Math.random()',
        ]);
    });

    it('reads a conditional branch by what it tests', () =>
    {
      // Arrange: a switch, a variable against a constant, an actor's state, and a script.

      // Act.
      const read = [
        sentenceOf(111, [ 0, 1, 0 ]),
        sentenceOf(111, [ 1, 2, 0, 10, 1 ]),
        sentenceOf(111, [ 4, 1, 6, 9 ]),
        sentenceOf(111, [ 12, 'a > b' ]),
      ];

      // Assert.
      expect(read)
        .toStrictEqual([
          'If switch #0001 Door Open is ON',
          'If variable #0002 Coins ≥ 10',
          'If #1 Harold is affected by #9 Poison',
          'If script: a > b',
        ]);
    });

    it('reads Show Text with its speaker, without one, and with no text', () =>
    {
      // Arrange.
      const lines = [ { code: 401, indent: 0, parameters: [ 'Hello.' ] }, { code: 401, indent: 0, parameters: [ 'Again.' ] } ];

      // Act.
      const read = [
        sentenceOf(101, [ 'Actor1', 0, 0, 2, 'Harold' ], lines),
        sentenceOf(101, [ '', 0, 0, 2, '' ], lines),
        sentenceOf(101, [ '', 0, 0, 2, '' ]),
      ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Harold: Hello. Again.', 'Hello. Again.', '(no text)' ]);
    });

    it('notes a transfer\'s facing and fade only when they are not the defaults', () =>
    {
      // Arrange: a plain transfer, and one facing up with no fade.

      // Act.
      const read = [ sentenceOf(201, [ 0, 2, 16, 12, 0, 0 ]), sentenceOf(201, [ 0, 2, 16, 12, 8, 2 ]), sentenceOf(201, [ 1, 5, 6, 7, 0, 0 ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([
          'Transfer to #2 Town (16, 12)',
          'Transfer to #2 Town (16, 12) (facing Up, no fade)',
          'Transfer to the map in #0005 at (#0006, #0007)',
        ]);
    });

    it('reads a character as the player, this event, or an event by id', () =>
    {
      // Arrange.

      // Act.
      const read = [ sentenceOf(212, [ -1, 33, false ]), sentenceOf(212, [ 0, 33, true ]), sentenceOf(212, [ 5, 33, false ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Show animation #33 on Player', 'Show animation #33 on This Event (wait)', 'Show animation #33 on Event #5' ]);
    });

    it('reads a move route by its first steps and sums up the rest', () =>
    {
      // Arrange.
      const route: JsonValue = {
        list: [ { code: 17 }, { code: 14, parameters: [ 1, -2 ] }, { code: 15, parameters: [ 30 ] }, { code: 1 }, { code: 2 }, { code: 0 } ],
        repeat: false,
        skippable: true,
        wait: true,
      };

      // Act.
      const read = sentenceOf(205, [ -1, route ]);

      // Assert.
      expect(read)
        .toBe('Move route for Player: Turn Left, Jump +1, -2, Wait 30 frames, Move Down and 1 more (skip if blocked, wait)');
    });

    it('reads a sound with its volume, pitch and pan, and no sound as None', () =>
    {
      // Arrange.

      // Act.
      const read = [ sentenceOf(250, [ { name: 'Heal1', volume: 90, pitch: 100, pan: 0 } ]), sentenceOf(249, [ { name: '', volume: 100, pitch: 100, pan: 0 } ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Play SE: Heal1 (90, 100, 0)', 'Play ME: None (100, 100, 0)' ]);
    });

    it('reads a shop by its first good and how many more follow', () =>
    {
      // Arrange.
      const more = [ { code: 605, indent: 0, parameters: [ 0, 46, 0, 0 ] }, { code: 605, indent: 0, parameters: [ 0, 47, 0, 0 ] } ];

      // Act.
      const read = [ sentenceOf(302, [ 0, 45, 0, 0, true ], more), sentenceOf(302, [ 0, 45, 0, 0, false ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Shop: #45 Potion and 2 more (purchase only)', 'Shop: #45 Potion' ]);
    });

    it('reads amounts with their sign, from a constant or a variable', () =>
    {
      // Arrange.

      // Act.
      const read = [ sentenceOf(126, [ 45, 0, 0, 16 ]), sentenceOf(125, [ 1, 1, 2 ]), sentenceOf(311, [ 0, 0, 1, 0, 100, true ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Items: #45 Potion + 16', 'Gold - #0002 Coins', 'HP of Entire Party - 100 (can knock out)' ]);
    });

    it('reads a comment and a script across their lines', () =>
    {
      // Arrange.
      const commentLines = [ { code: 408, indent: 0, parameters: [ '<icon:2565>' ] } ];
      const scriptLines = [ { code: 655, indent: 0, parameters: [ 'b();' ] }, { code: 655, indent: 0, parameters: [ 'c();' ] } ];

      // Act.
      const read = [ sentenceOf(108, [ '<text:Guide>' ], commentLines), sentenceOf(355, [ 'a();' ], scriptLines), sentenceOf(355, [ 'a();' ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ '<text:Guide> <icon:2565>', 'Script: a(); (and 2 more lines)', 'Script: a();' ]);
    });

    it('reads Show Choices with its choices and how cancelling works', () =>
    {
      // Arrange.

      // Act.
      const read = [ sentenceOf(102, [ [ 'Yes', 'No' ], -2, 0, 2, 0 ]), sentenceOf(102, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'Choices: Yes / No (cancel has its own branch)', 'Choices: Yes / No' ]);
    });

    it('reads the codes inside blocks in MZ\'s words', () =>
    {
      // Arrange.

      // Act.
      const read = [ sentenceOf(402, [ 0, 'Heal me!' ]), sentenceOf(403, [ 6, null ]), sentenceOf(411, []), sentenceOf(412, []), sentenceOf(413, []) ];

      // Assert.
      expect(read)
        .toStrictEqual([ 'When Heal me!', 'When cancelled', 'Else', 'End', 'Repeat above' ]);
    });

    it('reads every kind of conditional branch in its own words', () =>
    {
      // Arrange: one of each test, and every check an actor or an enemy can make.
      const cases: [ unknown[], string ][] = [
        [ [ 1, 2, 1, 3, 5 ], 'If variable #0002 Coins ≠ #0003' ],
        [ [ 2, 'B', 1 ], 'If self switch B is OFF' ],
        [ [ 3, 65, 1 ], 'If the timer ≤ 1:05' ],
        [ [ 4, 1, 0 ], 'If #1 Harold is in the party' ],
        [ [ 4, 1, 1, 'Bob' ], 'If #1 Harold is named "Bob"' ],
        [ [ 4, 1, 2, 3 ], 'If #1 Harold is class #3' ],
        [ [ 4, 1, 3, 4 ], 'If #1 Harold knows #4' ],
        [ [ 4, 1, 4, 5 ], 'If #1 Harold has #5 equipped' ],
        [ [ 4, 1, 5, 6 ], 'If #1 Harold has #6 equipped' ],
        [ [ 4, 1, 9 ], 'If #1 Harold (9)' ],
        [ [ 5, 0, 0 ], 'If enemy #1 has appeared' ],
        [ [ 5, 1, 1, 9 ], 'If enemy #2 is affected by #9 Poison' ],
        [ [ 6, -1, 8 ], 'If Player is facing Up' ],
        [ [ 7, 500, 2 ], 'If gold < 500' ],
        [ [ 8, 45 ], 'If the party has #45 Potion' ],
        [ [ 9, 2, true ], 'If the party has #2 (counting equipped)' ],
        [ [ 10, 3, false ], 'If the party has #3' ],
        [ [ 11, 'ok', 1 ], 'If the OK button is being triggered' ],
        [ [ 11, 'cancel' ], 'If the Cancel button is being pressed' ],
        [ [ 13, 2 ], 'If the player is riding the Airship' ],
        [ [ 99 ], 'If (99)' ],
      ];

      // Act.
      const read = cases.map(([ parameters ]) => sentenceOf(111, parameters as JsonValue[]));

      // Assert.
      expect(read)
        .toStrictEqual(cases.map(([ , sentence ]) => sentence));
    });

    it('reads every kind of game data and operation a variable can take', () =>
    {
      // Arrange.
      const cases: [ unknown[], string ][] = [
        [ [ 2, 2, 0, 3, 0, 45 ], 'Variable #0002 Coins = the number of #45 Potion' ],
        [ [ 2, 2, 0, 3, 1, 2 ], 'Variable #0002 Coins = the number of #2' ],
        [ [ 2, 2, 0, 3, 2, 3 ], 'Variable #0002 Coins = the number of #3' ],
        [ [ 2, 2, 0, 3, 4, 1, 3 ], 'Variable #0002 Coins = Max MP of enemy #2' ],
        [ [ 2, 2, 0, 3, 5, -1, 2 ], 'Variable #0002 Coins = Direction of Player' ],
        [ [ 2, 2, 0, 3, 6, 2 ], 'Variable #0002 Coins = the actor id of party Member #3' ],
        [ [ 2, 2, 0, 3, 7, 2 ], 'Variable #0002 Coins = Gold' ],
        [ [ 2, 2, 0, 3, 8, 0 ], 'Variable #0002 Coins = Last Used Skill ID' ],
        [ [ 2, 2, 0, 3, 9 ], 'Variable #0002 Coins = 9' ],
        [ [ 2, 2, 3, 0, 2 ], 'Variable #0002 Coins *= 2' ],
        [ [ 2, 2, 4, 0, 2 ], 'Variable #0002 Coins /= 2' ],
        [ [ 2, 2, 5, 0, 2 ], 'Variable #0002 Coins %= 2' ],
        [ [ 2, 2, 9, 0, 2 ], 'Variable #0002 Coins 9 2' ],
        [ [ 2, 2, 0, 9 ], 'Variable #0002 Coins = 9' ],
        [ [ 1, 2, 0, 0, 7 ], 'Variables #0001 to #0002 Coins = 7' ],
      ];

      // Act.
      const read = cases.map(([ parameters ]) => sentenceOf(122, parameters as JsonValue[]));

      // Assert.
      expect(read)
        .toStrictEqual(cases.map(([ , sentence ]) => sentence));
    });

    it('reads the party, actor and battle commands with their notes only when they apply', () =>
    {
      // Arrange.
      const cases: [ number, unknown[], string ][] = [
        [ 127, [ 2, 1, 0, 1, true ], 'Weapons: #2 - 1 (including equipped)' ],
        [ 128, [ 3, 0, 0, 1, true ], 'Armors: #3 + 1' ],
        [ 129, [ 1, 0, true ], 'Add #1 Harold to the party (initialized)' ],
        [ 129, [ 1, 1, false ], 'Remove #1 Harold from the party' ],
        [ 313, [ 1, 2, 1, 9 ], 'Remove #9 Poison from the actor in #0002 Coins' ],
        [ 314, [ 0, 1 ], 'Recover all: #1 Harold' ],
        [ 316, [ 0, 0, 0, 0, 1, true ], 'Level of Entire Party + 1 (show level up)' ],
        [ 317, [ 0, 1, 2, 0, 0, 5 ], 'Attack of #1 Harold + 5' ],
        [ 318, [ 0, 1, 1, 4 ], '#1 Harold forgets #4' ],
        [ 319, [ 1, 1, 2 ], 'Equip #1 Harold with #2 in slot 1' ],
        [ 319, [ 1, 2, 0 ], 'Equip #1 Harold with None in slot 2' ],
        [ 321, [ 1, 3, true ], 'Change #1 Harold\'s class to #3 (keeping EXP)' ],
        [ 325, [ 1, 'Line one\nline two' ], 'Profile of #1 Harold: "Line one line two"' ],
        [ 331, [ -1, 1, 0, 50, true ], 'HP of enemy Entire Troop - 50 (can knock out)' ],
        [ 333, [ 0, 1, 9 ], 'Remove #9 Poison from enemy #1' ],
        [ 337, [ 0, 5, true ], 'Show animation #5 on the entire troop' ],
        [ 339, [ 1, 1, 7, -1 ], 'Force #1 Harold to use #7 on Random' ],
        [ 339, [ 0, 2, 7, 0 ], 'Force enemy #3 to use #7 on Index 1' ],
        [ 301, [ 1, 5, false, true ], 'Battle: the troop in #0005 (can lose)' ],
        [ 301, [ 2, 0, true, false ], 'Battle: a random encounter (can escape)' ],
        [ 285, [ 3, 6, 2, -1, 0 ], '#0003 = Region ID at Player' ],
        [ 285, [ 3, 1, 1, 4, 5 ], '#0003 = Event ID at (#0004, #0005)' ],
        [ 203, [ 5, 2, 7, 0, 4 ], 'Swap Event #5 with Event #7 (facing Left)' ],
        [ 203, [ 0, 1, 4, 5, 0 ], 'Move This Event to (#0004, #0005)' ],
        [ 124, [ 1 ], 'Stop the timer' ],
        [ 124, [ 0, 125 ], 'Start the timer at 2:05' ],
      ];

      // Act.
      const read = cases.map(([ code, parameters ]) => sentenceOf(code, parameters as JsonValue[]));

      // Assert.
      expect(read)
        .toStrictEqual(cases.map(([ , , sentence ]) => sentence));
    });

    it('reads a common event call by name', () =>
    {
      // Arrange.

      // Act.
      const read = sentenceOf(117, [ 31 ]);

      // Assert.
      expect(read)
        .toBe('Run common event #31 Heal Party');
    });
  });
});
