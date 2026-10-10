import { describe, expect, it } from 'vitest';
import type { RmmzEventCommand, RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { planBattlerChange, type BattlerChange, type BattlerContext } from '../../../../src/mapEditor/modules/jabs/battlerEdits.ts';
import type { JabsDefaults } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import { motionDefaultsFrom } from '../../../../src/mapEditor/modules/jabs/motionTags.ts';
import { applyEdits, command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler panel writes what an author sets into the page's own comment tags, in place, under the light panel's rule:
 * a value goes over the line the game reads (the last of its tag), a value the page lacks goes on a new line at the end of
 * the comment holding the enemy, as the game's battlers keep their tags together, and clearing a row takes every line of
 * its tag out, so the enemy's value applies. Nothing else on the page moves, and a change is refused, whole, when the game
 * would read any other tag differently, or this one otherwise than meant. A line is never rewritten when it already reads
 * as asked, so a page left as it is takes no edit at all.
 */
describe('planBattlerChange', () =>
{
  /**
   * J-ABS's defaults as Chef Adventure sets them.
   */
  const DEFAULTS: JabsDefaults = {
    sight: 4,
    pursuit: 6,
    alertedSightBoost: 2,
    alertedPursuitBoost: 4,
    alertDuration: 300,
    canIdle: true,
    showHpBar: true,
    showName: true,
    inanimate: false,
  };

  /**
   * The enemies and defaults a change is read against: enemy 5 a slime sensing 3 tiles, with J-Motion's own defaults.
   */
  const CONTEXT: BattlerContext = {
    enemyOf: enemyId => (enemyId === 5 ? { id: 5, name: 'Slime', note: '<sight:3>\n<aiTrait:healer>' } : null),
    defaults: DEFAULTS,
    motionDefaults: motionDefaultsFrom(null),
  };

  /**
   * One comment line.
   * @param {string} text The line.
   * @param {number} code 108 for a comment's first line, 408 for a later one.
   * @param {number} indent The line's indent.
   * @returns {RmmzEventCommand} The command.
   */
  const line = (text: string, code = 108, indent = 0): RmmzEventCommand => command(code, [ text ], indent);

  /**
   * Applies a change to a page as the panel would, and reads back its command list as code and text.
   * @param {RmmzEventPage} before The page.
   * @param {BattlerChange} change The change.
   * @returns {(string | number)[][]} The list after, each command's code and first parameter.
   */
  const listAfter = (before: RmmzEventPage, change: BattlerChange): (string | number)[][] =>
  {
    const edits = planBattlerChange(before, 0, change, CONTEXT);
    const after = applyEdits(event(1, [ before ]), edits);
    return after.pages[0].list.map(each => [ each.code, each.code === 0 ? '' : String(each.parameters[0]) ]);
  };

  /**
   * The slime's page as the game lays most battlers out: the motion alone, then the enemy with its speed, then a light
   * the panel never touches, and a Show Text.
   * @returns {RmmzEventPage} The page.
   */
  const slime = (): RmmzEventPage => page([
    line('<motion:[stretch]>'),
    line('<enemyId:5>'),
    line('<moveSpeed:4.0>', 408),
    line('<light:[2, #ffbb73]>'),
    command(101, [ '', 0, 0, 2, '' ]),
    command(401, [ '<sight:9>' ]),
  ]);

  it('writes a value over the last line of its tag, which the game reads, keeping how the line writes it', () =>
  {
    // Arrange: two speed lines, the earlier one the game ignores.
    const before = page([ line('<enemyId:5>'), line('<moveSpeed:3.5>', 408), line('<moveSpeed: 4.0>', 408) ]);

    // Act.
    const after = listAfter(before, { row: 'moveSpeed', value: 4.5 });

    // Assert: the earlier line untouched, the later one keeping its space and its one place.
    expect(after)
      .toStrictEqual([ [ 108, '<enemyId:5>' ], [ 408, '<moveSpeed:3.5>' ], [ 408, '<moveSpeed: 4.5>' ], [ 0, '' ] ]);
  });

  it('puts a value the page lacks on a new line at the end of the comment holding the enemy, never inside any other', () =>
  {
    // Arrange.
    const before = slime();

    // Act.
    const after = listAfter(before, { row: 'sight', value: 6 });

    // Assert: after the speed, the enemy's comment's last line, and before the light's comment; the Show Text's quoted
    // tag stays as it was.
    expect(after)
      .toStrictEqual([
        [ 108, '<motion:[stretch]>' ],
        [ 108, '<enemyId:5>' ],
        [ 408, '<moveSpeed:4.0>' ],
        [ 408, '<sight:6>' ],
        [ 108, '<light:[2, #ffbb73]>' ],
        [ 101, '' ],
        [ 401, '<sight:9>' ],
        [ 0, '' ],
      ]);
  });

  it('writes a new line with the comment\'s own indent, and a new move speed to one place as the game writes them', () =>
  {
    // Arrange: a battler whose comment sits inside a branch.
    const before = page([ line('<enemyId:5>', 108, 1), line('<sight:2>', 408, 1) ]);

    // Act.
    const edits = planBattlerChange(before, 0, { row: 'moveSpeed', value: 4 }, CONTEXT);

    // Assert.
    expect(edits)
      .toStrictEqual([ { kind: 'splice', path: [ 'pages', 0, 'list' ], index: 2, deleteCount: 0, inserted: [ { code: 408, indent: 1, parameters: [ '<moveSpeed:4.0>' ] } ] } ]);
  });

  it('takes every line of a tag out on a clear, the last first, so the enemy\'s value applies', () =>
  {
    // Arrange: two sight lines, the first starting a comment the second carries on.
    const before = page([ line('<enemyId:5>'), line('<sight:1>'), line('<sight:2>', 408), line('<pursuit:8>', 408) ]);

    // Act.
    const after = listAfter(before, { row: 'sight', value: null });

    // Assert: the pursuit line, left at the head of what remains of its comment, now starts it.
    expect(after)
      .toStrictEqual([ [ 108, '<enemyId:5>' ], [ 108, '<pursuit:8>' ], [ 0, '' ] ]);
  });

  it('changes nothing where the page already reads as asked, or a clear finds nothing to take out', () =>
  {
    // Arrange.
    const before = slime();

    // Act.
    const edits = [
      planBattlerChange(before, 0, { row: 'moveSpeed', value: 4 }, CONTEXT),
      planBattlerChange(before, 0, { row: 'sight', value: null }, CONTEXT),
      planBattlerChange(before, 0, { row: 'enemy', value: 5 }, CONTEXT),
    ];

    // Assert: 4.0 already reads as 4.
    expect(edits)
      .toStrictEqual([ [], [], [] ]);
  });

  it('refuses a value the game would read otherwise: a fraction where it reads whole numbers, or one below 0', () =>
  {
    // Arrange: one row the page sets and one it does not, each given a value it cannot hold.
    const before = page([ line('<enemyId:5>'), line('<sight:3>', 408) ]);

    // Act.
    const refusals = [
      () => planBattlerChange(before, 0, { row: 'sight', value: 3.5 }, CONTEXT),
      () => planBattlerChange(before, 0, { row: 'pursuit', value: 2.5 }, CONTEXT),
      () => planBattlerChange(before, 0, { row: 'alertDuration', value: -1 }, CONTEXT),
    ].map(plan =>
    {
      try
      {
        plan();
        return 'written';
      }
      catch (error)
      {
        return (error as Error).message;
      }
    });

    // Assert: the alerted pursuit's fractions are fine, so the pursuit row is the only near miss allowed through.
    expect(refusals)
      .toStrictEqual([ 'its sight cannot be 3.5 as the game reads it', 'the game would not read that back as written', 'the game would not read that back as written' ]);
  });

  it('refuses any change to a page naming no enemy', () =>
  {
    // Arrange.
    const before = page([ line('<sight:3>') ]);

    // Act.
    const plan = () => planBattlerChange(before, 0, { row: 'sight', value: 4 }, CONTEXT);

    // Assert.
    expect(plan)
      .toThrow('this page no longer names an enemy');
  });

  it('writes a switch\'s word over its last line, keeping the tag as written, and adds one where the page names neither', () =>
  {
    // Arrange: a lowercase off-word with a space after the colon.
    const named = page([ line('<enemyId:5>'), line('<jabsConfig: nohpBar>', 408) ]);
    const unnamed = page([ line('<enemyId:5>'), line('<jabsConfig:noIdle>', 408) ]);

    // Act.
    const after = [ listAfter(named, { row: 'hpBar', value: true }), listAfter(unnamed, { row: 'inanimate', value: true }) ];

    // Assert: the idle line, another switch of the same tag, stays.
    expect(after)
      .toStrictEqual([
        [ [ 108, '<enemyId:5>' ], [ 408, '<jabsConfig: showHpBar>' ], [ 0, '' ] ],
        [ [ 108, '<enemyId:5>' ], [ 408, '<jabsConfig:noIdle>' ], [ 408, '<jabsConfig:inanimate>' ], [ 0, '' ] ],
      ]);
  });

  it('gives the page the AI traits asked for, a line each, taking out those left out and never a role written as a trait', () =>
  {
    // Arrange: two traits and the older leader role.
    const before = page([ line('<enemyId:5>'), line('<aiTrait:careful>', 408), line('<aiTrait:leader>', 408), line('<aiTrait:buffer>', 408) ]);

    // Act.
    const after = listAfter(before, { row: 'aiTraits', value: [ 'berserker', 'careful' ] });

    // Assert: the buffer goes; the berserker joins at the end of the enemy's comment.
    expect(after)
      .toStrictEqual([ [ 108, '<enemyId:5>' ], [ 408, '<aiTrait:careful>' ], [ 408, '<aiTrait:leader>' ], [ 408, '<aiTrait:berserker>' ], [ 0, '' ] ]);
  });

  it('takes every trait line out for no traits at all, as a page can never say it has none', () =>
  {
    // Arrange.
    const before = page([ line('<enemyId:5>'), line('<aiTrait:careful>', 408) ]);

    // Act.
    const after = [ listAfter(before, { row: 'aiTraits', value: [] }), listAfter(before, { row: 'aiTraits', value: null }) ];

    // Assert.
    expect(after)
      .toStrictEqual([ [ [ 108, '<enemyId:5>' ], [ 0, '' ] ], [ [ 108, '<enemyId:5>' ], [ 0, '' ] ] ]);
  });

  it('counts a role written as an older AI trait among the page\'s roles, taking it out when that role is left out', () =>
  {
    // Arrange: a leader written the older way, and a guardian.
    const before = page([ line('<enemyId:5>'), line('<aiTrait:LEADER>', 408), line('<aiRole:guardian>', 408) ]);

    // Act.
    const after = [ listAfter(before, { row: 'aiRoles', value: [ 'leader', 'ward' ] }), listAfter(before, { row: 'aiRoles', value: [ 'guardian' ] }) ];

    // Assert: a new role is written the way J-ABS writes roles now.
    expect(after)
      .toStrictEqual([
        [ [ 108, '<enemyId:5>' ], [ 408, '<aiTrait:LEADER>' ], [ 408, '<aiRole:ward>' ], [ 0, '' ] ],
        [ [ 108, '<enemyId:5>' ], [ 408, '<aiRole:guardian>' ], [ 0, '' ] ],
      ]);
  });

  it('writes the passives over the first passive line, with its separator, taking any later one out', () =>
  {
    // Arrange: two passive lines, the first writing a space after its comma.
    const several = page([ line('<enemyId:5>'), line('<passive:[1, 2]>', 408), line('<passive:[3]>', 408) ]);
    const none = page([ line('<enemyId:5>') ]);

    // Act.
    const after = [ listAfter(several, { row: 'passives', value: [ 1, 3, 9 ] }), listAfter(none, { row: 'passives', value: [ 371, 372 ] }) ];

    // Assert: a new line is written as the game writes them, with no space.
    expect(after)
      .toStrictEqual([
        [ [ 108, '<enemyId:5>' ], [ 408, '<passive:[1, 3, 9]>' ], [ 0, '' ] ],
        [ [ 108, '<enemyId:5>' ], [ 408, '<passive:[371,372]>' ], [ 0, '' ] ],
      ]);
  });

  it('writes the enemy over the line the game reads it from', () =>
  {
    // Arrange.
    const before = page([ line('<enemyId:4>'), line('<enemyId: 5>', 408) ]);

    // Act.
    const after = listAfter(before, { row: 'enemy', value: 12 });

    // Assert.
    expect(after)
      .toStrictEqual([ [ 108, '<enemyId:4>' ], [ 408, '<enemyId: 12>' ], [ 0, '' ] ]);
  });

  it('writes a team with J-ABS\'s own spelling, the one its pattern reads', () =>
  {
    // Arrange.
    const before = page([ line('<enemyId:5>') ]);

    // Act.
    const after = listAfter(before, { row: 'team', value: 0 });

    // Assert.
    expect(after)
      .toStrictEqual([ [ 108, '<enemyId:5>' ], [ 408, '<teamId:0>' ], [ 0, '' ] ]);
  });

  it('changes a motion in place, filling a setting left out ahead of one given with the project\'s default', () =>
  {
    // Arrange: two motions; the second is changed, its cycle given and its depth left out.
    const before = page([ line('<motion:[float]>'), line('<motion:[stretch]>'), line('<enemyId:5>') ]);

    // Act.
    const after = listAfter(before, { row: 'motion', motion: 1, value: { type: 'swing', values: [ null, '200' ], sync: true } });

    // Assert: J-Motion fills settings by place, so the angle left out is written as its default.
    expect(after)
      .toStrictEqual([ [ 108, '<motion:[float]>' ], [ 108, '<motion:[swing, 8, 200, sync]>' ], [ 108, '<enemyId:5>' ], [ 0, '' ] ]);
  });

  it('adds a motion after the last one, or where new tags go when the page has none, and takes one off', () =>
  {
    // Arrange.
    const moving = page([ line('<motion:[float]>'), line('<enemyId:5>') ]);
    const still = page([ line('<enemyId:5>') ]);

    // Act.
    const after = [
      listAfter(moving, { row: 'motion', motion: null, value: null }),
      listAfter(still, { row: 'motion', motion: null, value: { type: 'ghost', values: [], sync: false } }),
      listAfter(moving, { row: 'motion', motion: 0, value: null }),
    ];

    // Assert.
    expect(after)
      .toStrictEqual([
        [ [ 108, '<motion:[float]>' ], [ 408, '<motion:[stretch]>' ], [ 108, '<enemyId:5>' ], [ 0, '' ] ],
        [ [ 108, '<enemyId:5>' ], [ 408, '<motion:[ghost]>' ], [ 0, '' ] ],
        [ [ 108, '<enemyId:5>' ], [ 0, '' ] ],
      ]);
  });

  it('refuses a motion no longer on the page, a motion the game does not know, and a setting it cannot write', () =>
  {
    // Arrange.
    const before = page([ line('<motion:[float]>'), line('<enemyId:5>') ]);

    // Act.
    const refusals = [
      { row: 'motion', motion: 3, value: null },
      { row: 'motion', motion: 0, value: { type: 'wobble', values: [], sync: false } },
      { row: 'motion', motion: 0, value: { type: 'spin', values: [ '60', 'sideways' ], sync: false } },
    ].map(change =>
    {
      try
      {
        planBattlerChange(before, 0, change as BattlerChange, CONTEXT);
        return 'written';
      }
      catch (error)
      {
        return (error as Error).message;
      }
    });

    // Assert.
    expect(refusals)
      .toStrictEqual([ 'that motion is no longer on this page', 'wobble is not a motion the game knows', 'a spin\'s direction cannot be sideways' ]);
  });

  it('keeps every line no row writes where it was, a light inside the enemy\'s comment among them', () =>
  {
    // Arrange: a light carried on the enemy's own comment, and a level the page lacks.
    const before = page([ line('<enemyId:5>'), line('<light:[3]>', 408) ]);

    // Act.
    const edits = planBattlerChange(before, 0, { row: 'level', value: 12 }, CONTEXT);
    const after = applyEdits(event(1, [ before ]), edits).pages[0].list.map(each => each.parameters[0]);

    // Assert: the light keeps its line, and the level joins after it, in the enemy's comment.
    expect(after)
      .toStrictEqual([ '<enemyId:5>', '<light:[3]>', '<level:12>', undefined ]);
  });
});
