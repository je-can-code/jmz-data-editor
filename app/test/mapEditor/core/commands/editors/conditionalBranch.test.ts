import { describe, expect, it } from 'vitest';
import {
  CONDITION_KINDS,
  defaultCondition,
  elseCommandCount,
  newConditionalBranch,
  parseCondition,
  parseConditionalBranchBlock,
  setActorCheck,
  setEnemyCheck,
  writeCondition,
  writeConditionalBranchBlock,
  type BranchCondition,
} from '../../../../../src/mapEditor/core/commands/editors/conditionalBranch.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A conditional branch stores a type number and then exactly the values that type needs; MZ writes fourteen
 * types, and two of them (actor and enemy) change length with what they check. The editor reads every type into
 * its own shape and writes each back in exactly MZ's shape, so a condition's meaning survives any edit; a shape
 * MZ never writes reads as null. As a whole block (the branch through its end), the editor can add or remove the
 * Else while carrying both bodies across untouched.
 */
describe('conditional branch', () =>
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
   * Builds a conditional branch.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const branch = (parameters: unknown[]): RmmzEventCommand => command(111, 0, parameters);

  /**
   * Every type of condition as MZ stores it, with what it reads as.
   */
  const everyType: [ unknown[], BranchCondition ][] = [
    [ [ 0, 7, 1 ], { kind: 'switch', switchId: 7, value: 1 } ],
    [ [ 1, 4, 0, 3, 5 ], { kind: 'variable', variableId: 4, operandType: 0, operand: 3, comparison: 5 } ],
    [ [ 2, 'B', 0 ], { kind: 'selfSwitch', letter: 'B', value: 0 } ],
    [ [ 3, 30, 1 ], { kind: 'timer', seconds: 30, comparison: 1 } ],
    [ [ 4, 3, 0 ], { kind: 'actor', actorId: 3, check: 0, operand: null } ],
    [ [ 4, 3, 1, 'Ralph' ], { kind: 'actor', actorId: 3, check: 1, operand: 'Ralph' } ],
    [ [ 4, 3, 6, 12 ], { kind: 'actor', actorId: 3, check: 6, operand: 12 } ],
    [ [ 5, 2, 0 ], { kind: 'enemy', enemyIndex: 2, check: 0, stateId: null } ],
    [ [ 5, 2, 1, 4 ], { kind: 'enemy', enemyIndex: 2, check: 1, stateId: 4 } ],
    [ [ 6, -1, 8 ], { kind: 'character', characterId: -1, direction: 8 } ],
    [ [ 7, 2500, 2 ], { kind: 'gold', amount: 2500, comparison: 2 } ],
    [ [ 8, 123 ], { kind: 'item', itemId: 123 } ],
    [ [ 9, 5, true ], { kind: 'weapon', weaponId: 5, includeEquipment: true } ],
    [ [ 10, 6, false ], { kind: 'armor', armorId: 6, includeEquipment: false } ],
    [ [ 11, 'ok', 1 ], { kind: 'button', button: 'ok', how: 1 } ],
    [ [ 11, 'cancel' ], { kind: 'button', button: 'cancel', how: null } ],
    [ [ 12, '$gameParty.gold() > 10' ], { kind: 'script', script: '$gameParty.gold() > 10' } ],
    [ [ 13, 2 ], { kind: 'vehicle', vehicleId: 2 } ],
  ];

  describe('parseCondition', () =>
  {
    it('reads every type of condition MZ writes', () =>
    {
      // Arrange: the table above.

      // Act.
      const conditions = everyType.map(([ parameters ]) => parseCondition(branch(parameters)));

      // Assert.
      expect(conditions)
        .toStrictEqual(everyType.map(([ , condition ]) => condition));
    });

    it('refuses values that do not fit their type', () =>
    {
      // Arrange: each differs from a valid condition in one way.
      const shapes = [
        [ 0, 7 ],
        [ 0, 7, 1, 0 ],
        [ 1, 4, 0, 3 ],
        [ 2, 1, 0 ],
        [ 4, 3, 0, 1 ],
        [ 4, 3, 1, 2 ],
        [ 4, 3, 2, 'Ralph' ],
        [ 5, 2, 1 ],
        [ 8, 1.5 ],
        [ 9, 5, 1 ],
        [ 11, 'ok', 'x' ],
        [ 11, 1 ],
        [ 12, 3 ],
        [ 14, 0 ],
      ];

      // Act.
      const conditions = shapes.map(parameters => parseCondition(branch(parameters)));

      // Assert.
      expect(conditions)
        .toStrictEqual(shapes.map(() => null));
    });

    it('refuses a command that is not a conditional branch', () =>
    {
      // Arrange: a switch test, stored under the Control Switches code.
      const other = command(121, 0, [ 0, 7, 1 ]);

      // Act.
      const condition = parseCondition(other);

      // Assert.
      expect(condition)
        .toBeNull();
    });
  });

  describe('writeCondition', () =>
  {
    it('writes every type back in exactly the shape MZ stores it', () =>
    {
      // Arrange: a switch test, rewritten as every type.
      const original = { ...branch([ 0, 1, 0 ]), collapsed: true };

      // Act.
      const written = everyType.map(([ , condition ]) => writeCondition(original, condition));

      // Assert: the parameters match, and the folded flag stays.
      expect(written.map(each => each.parameters))
        .toStrictEqual(everyType.map(([ parameters ]) => parameters));
      expect(written.every(each => each.collapsed === true))
        .toBe(true);
    });
  });

  describe('defaultCondition', () =>
  {
    it('gives every kind a starting condition that writes as a valid condition of that kind', () =>
    {
      // Arrange: every kind the editor offers.
      const kinds = CONDITION_KINDS.map(({ kind }) => kind);

      // Act.
      const roundTrips = kinds.map(kind => parseCondition(writeCondition(branch([ 0, 1, 0 ]), defaultCondition(kind)))?.kind);

      // Assert.
      expect(roundTrips)
        .toStrictEqual(kinds);
    });
  });

  describe('setActorCheck and setEnemyCheck', () =>
  {
    it('drop the extra value for in the party, and start a name empty and an id at 1', () =>
    {
      // Arrange.
      const skill: BranchCondition = { kind: 'actor', actorId: 2, check: 3, operand: 40 };

      // Act.
      const checks = [ setActorCheck(skill, 0), setActorCheck(skill, 1), setActorCheck(skill, 5) ];

      // Assert.
      expect(checks)
        .toStrictEqual([
          { kind: 'actor', actorId: 2, check: 0, operand: null },
          { kind: 'actor', actorId: 2, check: 1, operand: '' },
          { kind: 'actor', actorId: 2, check: 5, operand: 1 },
        ]);
    });

    it('switch an enemy between appeared and a state', () =>
    {
      // Arrange.
      const appeared: BranchCondition = { kind: 'enemy', enemyIndex: 1, check: 0, stateId: null };

      // Act.
      const state = setEnemyCheck(appeared, 1);
      const back = setEnemyCheck(state, 0);

      // Assert.
      expect([ state, back ])
        .toStrictEqual([ { kind: 'enemy', enemyIndex: 1, check: 1, stateId: 1 }, appeared ]);
    });

    it('leave a condition alone for the same check, or one of another kind', () =>
    {
      // Arrange.
      const skill: BranchCondition = { kind: 'actor', actorId: 2, check: 3, operand: 40 };
      const appeared: BranchCondition = { kind: 'enemy', enemyIndex: 1, check: 0, stateId: null };

      // Act.
      const results = [ setActorCheck(skill, 3), setActorCheck(appeared, 1), setEnemyCheck(appeared, 0), setEnemyCheck(skill, 1) ];

      // Assert.
      expect(results)
        .toStrictEqual([ skill, appeared, appeared, skill ]);
    });
  });

  describe('as a block', () =>
  {
    /**
     * A branch with a body of one line, and an Else with a body of one line, as MZ writes them.
     * @returns {RmmzEventCommand[]} The block.
     */
    const withElse = (): RmmzEventCommand[] => [
      { ...branch([ 0, 1, 0 ]), indent: 1 },
      command(250, 2, [ { name: 'Door', volume: 90, pitch: 100, pan: 0 } ]),
      command(0, 2),
      command(411, 1),
      command(355, 2, [ 'run();' ]),
      command(0, 2),
      command(412, 1),
    ];

    /**
     * The same branch without its Else.
     * @returns {RmmzEventCommand[]} The block.
     */
    const withoutElse = (): RmmzEventCommand[] => [ ...withElse().slice(0, 3), withElse()[6] ];

    it('reads the condition and whether there is an Else', () =>
    {
      // Arrange: the two blocks above.

      // Act.
      const models = [ parseConditionalBranchBlock(withElse()), parseConditionalBranchBlock(withoutElse()) ];

      // Assert.
      expect(models)
        .toStrictEqual([
          { condition: { kind: 'switch', switchId: 1, value: 0 }, hasElse: true },
          { condition: { kind: 'switch', switchId: 1, value: 0 }, hasElse: false },
        ]);
    });

    it('refuses a block MZ never writes: two Elses, a stray line at the branch\'s indent, or no end', () =>
    {
      // Arrange.
      const twoElses = [ ...withElse().slice(0, 6), command(411, 1), command(0, 2), command(412, 1) ];
      const stray = [ ...withoutElse().slice(0, 3), command(250, 1, []), command(412, 1) ];
      const unended = withElse().slice(0, 6);
      const shallower = [ ...withoutElse().slice(0, 2), command(0, 0), command(412, 1) ];

      // Act.
      const models = [ twoElses, stray, unended, shallower, [] ].map(parseConditionalBranchBlock);

      // Assert.
      expect(models)
        .toStrictEqual([ null, null, null, null, null ]);
    });

    it('refuses a block whose condition MZ never writes', () =>
    {
      // Arrange.
      const block = withoutElse();
      block[0] = { ...block[0], parameters: [ 99 ] };

      // Act.
      const model = parseConditionalBranchBlock(block);

      // Assert.
      expect(model)
        .toBeNull();
    });

    it('adds an empty Else, as MZ does', () =>
    {
      // Arrange.
      const block = withoutElse();

      // Act.
      const written = writeConditionalBranchBlock(block, { condition: { kind: 'item', itemId: 3 }, hasElse: true });

      // Assert.
      expect(written)
        .toStrictEqual([
          { ...branch([ 8, 3 ]), indent: 1 },
          block[1],
          block[2],
          command(411, 1),
          command(0, 2),
          command(412, 1),
        ]);
    });

    it('removes the Else with its body, and keeps an existing Else\'s body when kept', () =>
    {
      // Arrange.
      const block = withElse();

      // Act.
      const removed = writeConditionalBranchBlock(block, { condition: { kind: 'switch', switchId: 1, value: 0 }, hasElse: false });
      const kept = writeConditionalBranchBlock(block, { condition: { kind: 'switch', switchId: 1, value: 0 }, hasElse: true });

      // Assert.
      expect([ removed, kept ])
        .toStrictEqual([ withoutElse(), withElse() ]);
    });

    it('refuses to write a block it could not read', () =>
    {
      // Arrange.
      const unended = withElse().slice(0, 6);

      // Act.
      const write = () => writeConditionalBranchBlock(unended, { condition: { kind: 'item', itemId: 3 }, hasElse: true });

      // Assert.
      expect(write)
        .toThrow('only a block parseConditionalBranchBlock read can be written back');
    });

    it('counts what an Else holds besides its closing line', () =>
    {
      // Arrange: the Else holds one script line; the block without one holds nothing.

      // Act.
      const counts = [ elseCommandCount(withElse()), elseCommandCount(withoutElse()), elseCommandCount([]) ];

      // Assert.
      expect(counts)
        .toStrictEqual([ 1, 0, 0 ]);
    });

    it('builds a new branch as MZ does, with or without an Else', () =>
    {
      // Arrange: a branch nested one level deep.

      // Act.
      const plain = newConditionalBranch(1, false);
      const full = newConditionalBranch(1, true);

      // Assert.
      expect([ plain, full ])
        .toStrictEqual([
          [ command(111, 1, [ 0, 1, 0 ]), command(0, 2), command(412, 1) ],
          [ command(111, 1, [ 0, 1, 0 ]), command(0, 2), command(411, 1), command(0, 2), command(412, 1) ],
        ]);
    });
  });
});
