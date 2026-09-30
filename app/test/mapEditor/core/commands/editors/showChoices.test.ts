import { describe, expect, it } from 'vitest';
import {
  cancelBranchCommandCount,
  insertChoice,
  mergedCancel,
  mergedDefault,
  moveChoice,
  newChoiceList,
  parseChoiceList,
  removeChoice,
  setChoiceText,
  writeChoiceList,
  type ChoiceListModel,
} from '../../../../../src/mapEditor/core/commands/editors/showChoices.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Chef Adventure runs HIME_LargeChoices, which merges consecutive Show Choices commands into one list: the
 * choices run on, a later command's cancel or default (counted from where its choices start) overrides the
 * first's, and only the first command's window settings are used. The editor edits the merged list as one and
 * owes the game two things: an untouched list comes back in exactly the commands, settings and bytes it arrived
 * as, and an edited list writes settings HIME reads back as exactly what the author chose. Each command still
 * holds at most six choices, so a list that grows spills into the next command, or a new one.
 */
describe('show choices', () =>
{
  /**
   * Builds a command.
   * @param {number} code The code.
   * @param {number} indent The indent.
   * @param {unknown[]} parameters The parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const command = (code: number, indent: number, parameters: unknown[] = []): RmmzEventCommand => ({ code, indent, parameters: parameters as never });

  /**
   * Builds one Show Choices command with its branches, as MZ writes it: each choice's branch runs one script
   * naming the choice, and a cancel branch follows when cancel is set to run one.
   * @param {string[]} texts The choices.
   * @param {number[]} settings Cancel, default, position and background.
   * @returns {RmmzEventCommand[]} The commands.
   */
  const block = (texts: string[], settings: [ number, number, number, number ]): RmmzEventCommand[] => [
    command(102, 0, [ texts, ...settings ]),
    ...texts.flatMap((text, index) => [ command(402, 0, [ index, text ]), command(355, 1, [ `picked(${JSON.stringify(text)});` ]), command(0, 1) ]),
    ...(settings[0] === -2 ? [ command(403, 0, [ 6, null ]), command(355, 1, [ 'cancelled();' ]), command(0, 1) ] : []),
    command(404, 0),
  ];

  /**
   * Eight choices over two commands, as the debug room's quest giver has them: the first command disallows
   * cancel and highlights its first choice, the second makes its second choice the cancel.
   * @returns {RmmzEventCommand[]} The commands.
   */
  const eightChoices = (): RmmzEventCommand[] => [
    ...block([ 'a', 'b', 'c', 'd', 'e', 'f' ], [ -1, 0, 1, 0 ]),
    ...block([ 'g', 'h' ], [ 1, -1, 1, 0 ]),
  ];

  /**
   * Nine choices over two commands that both ask for the cancel branch and both name their first choice as the
   * default, as a shop in the game has them. HIME lets the second command's default win.
   * @returns {RmmzEventCommand[]} The commands.
   */
  const bothCancelling = (): RmmzEventCommand[] => [
    ...block([ 'a', 'b', 'c', 'd', 'e' ], [ -2, 0, 2, 0 ]),
    ...block([ 'f', 'g', 'h', 'i' ], [ -2, 0, 2, 0 ]),
  ];

  /**
   * Reads commands that must be MZ-shaped.
   * @param {RmmzEventCommand[]} commands The commands.
   * @returns {ChoiceListModel} The model.
   */
  const read = (commands: RmmzEventCommand[]): ChoiceListModel =>
  {
    const model = parseChoiceList(commands);
    if (model === null)
    {
      throw new Error('the fixture is not MZ-shaped');
    }

    return model;
  };

  /**
   * Lists each Show Choices command's parameters in written commands.
   * @param {RmmzEventCommand[]} commands The commands.
   * @returns {unknown[]} The parameters of each Show Choices.
   */
  const openers = (commands: RmmzEventCommand[]): unknown[] => commands.filter(each => each.code === 102).map(each => each.parameters);

  describe('mergedCancel and mergedDefault', () =>
  {
    it('let a later command override with a choice of its own or the cancel branch, and pass over its neutral values', () =>
    {
      // Arrange: sizes 6 and 2.
      const sizes = [ 6, 2 ];

      // Act.
      const cancels = [ mergedCancel([ -1, 1 ], sizes), mergedCancel([ 3, -2 ], sizes), mergedCancel([ 3, -1 ], sizes), mergedCancel([ -2, -1 ], sizes) ];
      const defaults = [ mergedDefault([ 0, -1 ], sizes), mergedDefault([ 0, 1 ], sizes), mergedDefault([ -1, -1 ], sizes) ];

      // Assert.
      expect([ cancels, defaults ])
        .toStrictEqual([ [ 7, -2, 3, -2 ], [ 0, 7, -1 ] ]);
    });
  });

  describe('parseChoiceList', () =>
  {
    it('reads one command\'s choices, branches and settings', () =>
    {
      // Arrange.
      const commands = block([ 'Yes', 'No' ], [ 1, 0, 2, 1 ]);

      // Act.
      const model = read(commands);

      // Assert.
      expect([ model.choices.map(choice => [ choice.text, choice.body ]), model.cancelType, model.defaultType, model.position, model.background, model.blocks.length ])
        .toStrictEqual([ [ [ 'Yes', commands.slice(2, 4) ], [ 'No', commands.slice(5, 7) ] ], 1, 0, 2, 1, 1 ]);
    });

    it('merges consecutive commands into one list, counting a later command\'s cancel from where its choices start', () =>
    {
      // Arrange.
      const commands = eightChoices();

      // Act.
      const model = read(commands);

      // Assert.
      expect([ model.choices.map(choice => choice.text).join(''), model.blocks.map(each => each.size), model.cancelType, model.defaultType, model.position ])
        .toStrictEqual([ 'abcdefgh', [ 6, 2 ], 7, 0, 1 ]);
    });

    it('lets a later command\'s default win, as HIME does, and keeps each command\'s cancel branch', () =>
    {
      // Arrange.
      const commands = bothCancelling();

      // Act.
      const model = read(commands);

      // Assert.
      expect([ model.cancelType, model.defaultType, model.blocks.map(each => each.cancelBranch?.body) ])
        .toStrictEqual([ -2, 5, [ commands.slice(17, 19), commands.slice(34, 36) ] ]);
    });

    it('accepts a cancel pointing at a slot the command left empty, as MZ\'s six-slot dialog allows', () =>
    {
      // Arrange: three choices, cancel on the fourth slot.
      const commands = block([ 'a', 'b', 'c' ], [ 3, 0, 2, 0 ]);

      // Act.
      const model = parseChoiceList(commands);

      // Assert.
      expect(model?.cancelType)
        .toBe(3);
    });

    it('refuses lists MZ never writes', () =>
    {
      // Arrange: each differs from a valid list in one way.
      const valid = block([ 'Yes', 'No' ], [ 1, 0, 2, 0 ]);
      const missingBranch = [ ...valid.slice(0, 4), valid[7] ];
      const renumbered = valid.map((each, index) => (index === 4 ? command(402, 0, [ 5, 'No' ]) : each));
      const strayBranch = [ ...valid.slice(0, 7), command(403, 0, [ 6, null ]), command(0, 1), valid[7] ];
      const missingCancel = block([ 'Yes', 'No' ], [ -2, 0, 2, 0 ]).filter(each => each.code !== 403);
      const strayLine = [ ...valid.slice(0, 7), command(250, 0, [ {} ]), valid[7] ];
      const unended = valid.slice(0, 7);
      const trailing = [ ...valid, command(101, 0, [ '', 0, 0, 2, '' ]) ];
      const outOfSlots = block([ 'Yes', 'No' ], [ 6, 0, 2, 0 ]);
      const numberChoice = valid.map((each, index) => (index === 0 ? command(102, 0, [ [ 'Yes', 2 ], 1, 0, 2, 0 ]) : each));
      const shortSettings = valid.map((each, index) => (index === 0 ? command(102, 0, [ [ 'Yes', 'No' ], 1 ]) : each));

      // Act.
      const models = [ missingBranch, renumbered, strayBranch, missingCancel, strayLine, unended, trailing, outOfSlots, numberChoice, shortSettings, [] ]
        .map(parseChoiceList);

      // Assert.
      expect(models)
        .toStrictEqual(models.map(() => null));
    });
  });

  describe('writeChoiceList', () =>
  {
    it('writes an untouched list back exactly as it arrived, one command or several', () =>
    {
      // Arrange: a folded branch, which carries its flag, is part of what must survive.
      const single = block([ 'Yes', 'No' ], [ 1, 0, 2, 1 ]);
      single[4] = { ...single[4], collapsed: true };
      const fixtures = [ single, eightChoices(), bothCancelling(), block([ 'a', 'b', 'c' ], [ 3, 0, 2, 0 ]) ];

      // Act.
      const written = fixtures.map(fixture => writeChoiceList(read(fixture)));

      // Assert.
      expect(written.map(each => JSON.stringify(each)))
        .toStrictEqual(fixtures.map(each => JSON.stringify(each)));
    });

    it('writes a choice\'s new text into its command and its "When" line', () =>
    {
      // Arrange.
      const model = setChoiceText(read(eightChoices()), 7, 'never mind');

      // Act.
      const written = writeChoiceList(model);

      // Assert.
      expect([ openers(written)[1], written.filter(each => each.code === 402).at(-1)?.parameters ])
        .toStrictEqual([ [ [ 'g', 'never mind' ], 1, -1, 1, 0 ], [ 1, 'never mind' ] ]);
    });

    it('stores a cancel on another command\'s choice the way HIME reads it: that command names it, the rest pass', () =>
    {
      // Arrange: cancel moves from the eighth choice to the third.
      const model = { ...read(eightChoices()), cancelType: 2 };

      // Act.
      const written = writeChoiceList(model);

      // Assert: HIME reads the written settings back as the third choice.
      expect([ openers(written).map(each => (each as unknown[])[1]), read(written).cancelType ])
        .toStrictEqual([ [ 2, -1 ], 2 ]);
    });

    it('puts a newly asked-for cancel branch on the last command, empty, as MZ writes one', () =>
    {
      // Arrange.
      const model = { ...read(eightChoices()), cancelType: -2 };

      // Act.
      const written = writeChoiceList(model);

      // Assert.
      expect([ openers(written).map(each => (each as unknown[])[1]), written.slice(-3) ])
        .toStrictEqual([ [ -1, -2 ], [ command(403, 0, [ 6, null ]), command(0, 1), command(404, 0) ] ]);
    });

    it('drops every cancel branch once cancel is disallowed', () =>
    {
      // Arrange.
      const model = { ...read(bothCancelling()), cancelType: -1 };

      // Act.
      const written = writeChoiceList(model);

      // Assert.
      expect([ openers(written).map(each => (each as unknown[])[1]), written.some(each => each.code === 403) ])
        .toStrictEqual([ [ -1, -1 ], false ]);
    });

    it('stores a default on the command holding it, or nowhere for none', () =>
    {
      // Arrange.
      const model = read(eightChoices());

      // Act.
      const onSecond = openers(writeChoiceList({ ...model, defaultType: 6 })).map(each => (each as unknown[])[2]);
      const none = openers(writeChoiceList({ ...model, defaultType: -1 })).map(each => (each as unknown[])[2]);

      // Assert.
      expect([ onSecond, none ])
        .toStrictEqual([ [ -1, 0 ], [ -1, -1 ] ]);
    });

    it('keeps the commands\' own settings when they still mean the same after a choice goes', () =>
    {
      // Arrange: the third choice goes, so the cancel on "h" is now the seventh choice.
      const model = removeChoice(read(eightChoices()), 2);

      // Act.
      const written = writeChoiceList(model);

      // Assert: the second command still stores its own second choice.
      expect([ model.cancelType, openers(written) ])
        .toStrictEqual([ 6, [ [ [ 'a', 'b', 'd', 'e', 'f' ], -1, 0, 1, 0 ], [ [ 'g', 'h' ], 1, -1, 1, 0 ] ] ]);
    });

    it('changes only the first command\'s window settings, which are the only ones HIME uses', () =>
    {
      // Arrange: the second command stores its own, different window settings.
      const commands = [ ...block([ 'a', 'b', 'c', 'd', 'e', 'f' ], [ -1, 0, 1, 0 ]), ...block([ 'g' ], [ -1, -1, 0, 2 ]) ];

      // Act.
      const written = writeChoiceList({ ...read(commands), position: 2, background: 1 });

      // Assert.
      expect(openers(written).map(each => (each as unknown[]).slice(3)))
        .toStrictEqual([ [ 2, 1 ], [ 0, 2 ] ]);
    });

    it('refuses a model whose commands do not hold its choices', () =>
    {
      // Arrange.
      const model = read(eightChoices());
      const broken = { ...model, choices: model.choices.slice(1) };

      // Act.
      const write = () => writeChoiceList(broken);

      // Assert.
      expect(write)
        .toThrow('the commands hold 6+2 choices, but the list has 7');
    });
  });

  describe('insertChoice', () =>
  {
    it('grows the command holding the place, with an empty branch, and keeps cancel and default on their choices', () =>
    {
      // Arrange: cancel is "No", default "Yes".
      const model = read(block([ 'Yes', 'No' ], [ 1, 0, 2, 0 ]));

      // Act.
      const grown = insertChoice(model, 0, 'Maybe');
      const written = writeChoiceList(grown);

      // Assert.
      expect([ grown.cancelType, grown.defaultType, openers(written), written.slice(1, 3) ])
        .toStrictEqual([ 2, 1, [ [ [ 'Maybe', 'Yes', 'No' ], 2, 1, 2, 0 ] ], [ command(402, 0, [ 0, 'Maybe' ]), command(0, 1) ] ]);
    });

    it('spills a full command\'s last choice into the next one', () =>
    {
      // Arrange.
      const model = read(eightChoices());

      // Act.
      const written = writeChoiceList(insertChoice(model, 1, 'new'));

      // Assert: "f" moves on to the second command, and the cancel stays on "h".
      expect(openers(written))
        .toStrictEqual([ [ [ 'a', 'new', 'b', 'c', 'd', 'e' ], -1, 0, 1, 0 ], [ [ 'f', 'g', 'h' ], 2, -1, 1, 0 ] ]);
    });

    it('opens a new command past a full last one, with settings HIME passes over', () =>
    {
      // Arrange.
      const model = read(block([ 'a', 'b', 'c', 'd', 'e', 'f' ], [ 5, 0, 1, 1 ]));

      // Act.
      const written = writeChoiceList(insertChoice(model, 99, 'g'));

      // Assert.
      expect(openers(written))
        .toStrictEqual([ [ [ 'a', 'b', 'c', 'd', 'e', 'f' ], 5, 0, 1, 1 ], [ [ 'g' ], -1, -1, 1, 1 ] ]);
    });
  });

  describe('removeChoice', () =>
  {
    it('removes a choice with its branch, and falls back when cancel or default pointed at it', () =>
    {
      // Arrange: cancel and default both on the second of three.
      const model = read(block([ 'a', 'b', 'c' ], [ 1, 1, 2, 0 ]));

      // Act.
      const shrunk = removeChoice(model, 1);

      // Assert.
      expect([ shrunk.choices.map(choice => choice.text), shrunk.choices.map(choice => choice.body[0].parameters), shrunk.cancelType, shrunk.defaultType ])
        .toStrictEqual([ [ 'a', 'c' ], [ [ 'picked("a");' ], [ 'picked("c");' ] ], -1, -1 ]);
    });

    it('drops a command left empty, handing its cancel branch to the command before it', () =>
    {
      // Arrange: only the second command has the cancel branch.
      const commands = [ ...block([ 'a', 'b', 'c', 'd', 'e', 'f' ], [ -1, 0, 2, 0 ]), ...block([ 'g' ], [ -2, -1, 2, 0 ]) ];

      // Act.
      const written = writeChoiceList(removeChoice(read(commands), 6));

      // Assert: one command, which now carries the cancel branch and its body.
      expect([ openers(written), written.slice(-4) ])
        .toStrictEqual([
          [ [ [ 'a', 'b', 'c', 'd', 'e', 'f' ], -2, 0, 2, 0 ] ],
          [ command(403, 0, [ 6, null ]), command(355, 1, [ 'cancelled();' ]), command(0, 1), command(404, 0) ],
        ]);
    });

    it('keeps the only command even when its last choice goes, and ignores a place with no choice', () =>
    {
      // Arrange.
      const model = read(block([ 'a' ], [ -1, 0, 2, 0 ]));

      // Act.
      const emptied = removeChoice(model, 0);
      const ignored = removeChoice(model, 3);

      // Assert.
      expect([ emptied.blocks.map(each => each.size), emptied.defaultType, ignored ])
        .toStrictEqual([ [ 0 ], -1, model ]);
    });
  });

  describe('moveChoice', () =>
  {
    it('moves a choice with its branch across commands, renumbering the "When" lines and following cancel and default', () =>
    {
      // Arrange: "h" (the cancel) moves to the front.
      const model = read(eightChoices());

      // Act.
      const moved = moveChoice(model, 7, 0);
      const written = writeChoiceList(moved);

      // Assert.
      expect([ moved.cancelType, moved.defaultType, openers(written), written.slice(1, 3) ])
        .toStrictEqual([
          0,
          1,
          [ [ [ 'h', 'a', 'b', 'c', 'd', 'e' ], 0, 1, 1, 0 ], [ [ 'f', 'g' ], -1, -1, 1, 0 ] ],
          [ command(402, 0, [ 0, 'h' ]), command(355, 1, [ 'picked("h");' ]) ],
        ]);
    });

    it('leaves the list alone for the same place or a place with no choice', () =>
    {
      // Arrange.
      const model = read(eightChoices());

      // Act.
      const results = [ moveChoice(model, 2, 2), moveChoice(model, -1, 2), moveChoice(model, 2, 8) ];

      // Assert.
      expect(results)
        .toStrictEqual([ model, model, model ]);
    });
  });

  describe('cancelBranchCommandCount', () =>
  {
    it('counts what the cancel branches hold besides their closing lines', () =>
    {
      // Arrange: two cancel branches of one script each, and a list with none.

      // Act.
      const counts = [ cancelBranchCommandCount(read(bothCancelling())), cancelBranchCommandCount(read(eightChoices())) ];

      // Assert.
      expect(counts)
        .toStrictEqual([ 2, 0 ]);
    });
  });

  describe('newChoiceList', () =>
  {
    it('builds MZ\'s new Show Choices, which reads back as a list', () =>
    {
      // Arrange: a list nested one level deep.

      // Act.
      const commands = newChoiceList(1);
      const model = parseChoiceList(commands);

      // Assert.
      expect([ commands[0], model?.choices.map(choice => choice.text), model?.cancelType, model?.defaultType ])
        .toStrictEqual([ command(102, 1, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]), [ 'Yes', 'No' ], 1, 0 ]);
    });
  });
});
