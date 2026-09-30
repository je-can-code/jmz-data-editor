import { describe, expect, it } from 'vitest';
import {
  defaultOperand,
  parseControlVariables,
  setGameDataType,
  setOperandKind,
  writeControlVariables,
  type ControlVariablesModel,
} from '../../../../../src/mapEditor/core/commands/editors/controlVariables.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Control Variables stores the variables it changes, how, an operand code, and then as many values as that
 * operand needs: one for a constant, a variable or a script, two for a random range, three for game data. The
 * editor reads every operand kind into its own shape and writes each back in exactly the shape MZ writes, so a
 * command's length always matches its operand. Anything short, long or mistyped reads as null and is left alone.
 */
describe('control variables', () =>
{
  /**
   * Builds a Control Variables command.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const control = (parameters: unknown[]): RmmzEventCommand => ({ code: 122, indent: 0, parameters: parameters as never });

  describe('parseControlVariables', () =>
  {
    it('reads every kind of operand into its own shape', () =>
    {
      // Arrange: one command per operand, as the game stores them.
      const commands = [
        control([ 1, 1, 1, 0, -5 ]),
        control([ 2, 3, 0, 1, 14 ]),
        control([ 4, 4, 0, 2, 1, 6 ]),
        control([ 11, 11, 0, 3, 5, -1, 0 ]),
        control([ 27, 27, 0, 4, '$gameTimer.elapsedFrames()' ]),
      ];

      // Act.
      const operands = commands.map(command => parseControlVariables(command)?.operand);

      // Assert.
      expect(operands)
        .toStrictEqual([
          { kind: 'constant', value: -5 },
          { kind: 'variable', variableId: 14 },
          { kind: 'random', min: 1, max: 6 },
          { kind: 'gameData', type: 5, param1: -1, param2: 0 },
          { kind: 'script', script: '$gameTimer.elapsedFrames()' },
        ]);
    });

    it('reads the variables changed and how', () =>
    {
      // Arrange: a range, divided.
      const command = control([ 2, 5, 4, 0, 3 ]);

      // Act.
      const model = parseControlVariables(command);

      // Assert.
      expect(model)
        .toStrictEqual({ start: 2, end: 5, operation: 4, operand: { kind: 'constant', value: 3 } });
    });

    it('refuses values that do not fit the operand, an unknown operand, or another code', () =>
    {
      // Arrange: each differs from a valid command in one way.
      const shapes = [
        control([ 1, 1, 0, 0 ]),
        control([ 1, 1, 0, 0, 1, 2 ]),
        control([ 1, 1, 0, 2, 1 ]),
        control([ 1, 1, 0, 3, 0, 1 ]),
        control([ 1, 1, 0, 4, 12 ]),
        control([ 1, 1, 0, 1, 'x' ]),
        control([ 1, 1, 0, 5, 1 ]),
        control([ 1, '1', 0, 0, 1 ]),
        { ...control([ 1, 1, 0, 0, 1 ]), code: 121 },
      ];

      // Act.
      const models = shapes.map(parseControlVariables);

      // Assert.
      expect(models)
        .toStrictEqual(shapes.map(() => null));
    });
  });

  describe('writeControlVariables', () =>
  {
    it('writes each operand in exactly the shape MZ writes for it', () =>
    {
      // Arrange: one command, rewritten with each operand.
      const command = control([ 1, 1, 0, 0, 0 ]);
      const base = { start: 3, end: 3, operation: 1 };
      const operands: ControlVariablesModel['operand'][] = [
        { kind: 'constant', value: 7 },
        { kind: 'variable', variableId: 9 },
        { kind: 'random', min: -2, max: 2 },
        { kind: 'gameData', type: 3, param1: 1, param2: 12 },
        { kind: 'script', script: 'Math.PI' },
      ];

      // Act.
      const written = operands.map(operand => writeControlVariables(command, { ...base, operand }).parameters);

      // Assert.
      expect(written)
        .toStrictEqual([
          [ 3, 3, 1, 0, 7 ],
          [ 3, 3, 1, 1, 9 ],
          [ 3, 3, 1, 2, -2, 2 ],
          [ 3, 3, 1, 3, 3, 1, 12 ],
          [ 3, 3, 1, 4, 'Math.PI' ],
        ]);
    });
  });

  describe('setOperandKind', () =>
  {
    it('starts a new kind of operand at its defaults, and keeps the operand when the kind is the same', () =>
    {
      // Arrange.
      const model: ControlVariablesModel = { start: 1, end: 1, operation: 0, operand: { kind: 'constant', value: 42 } };

      // Act.
      const switched = setOperandKind(model, 'random');
      const same = setOperandKind(model, 'constant');

      // Assert.
      expect([ switched.operand, same ])
        .toStrictEqual([ { kind: 'random', min: 0, max: 0 }, model ]);
    });
  });

  describe('defaultOperand', () =>
  {
    it('starts every kind where MZ\'s dialog starts it', () =>
    {
      // Arrange: every kind.
      const kinds = [ 'constant', 'variable', 'random', 'gameData', 'script' ] as const;

      // Act.
      const operands = kinds.map(defaultOperand);

      // Assert.
      expect(operands)
        .toStrictEqual([
          { kind: 'constant', value: 0 },
          { kind: 'variable', variableId: 1 },
          { kind: 'random', min: 0, max: 0 },
          { kind: 'gameData', type: 0, param1: 1, param2: 0 },
          { kind: 'script', script: '' },
        ]);
    });
  });

  describe('setGameDataType', () =>
  {
    it('starts ids at 1 and indexes at 0 when the game data changes', () =>
    {
      // Arrange: reading an actor's TP.
      const model: ControlVariablesModel = { start: 1, end: 1, operation: 0, operand: { kind: 'gameData', type: 3, param1: 4, param2: 12 } };

      // Act.
      const actorToArmor = setGameDataType(model, 2);
      const actorToCharacter = setGameDataType(model, 5);

      // Assert.
      expect([ actorToArmor.operand, actorToCharacter.operand ])
        .toStrictEqual([
          { kind: 'gameData', type: 2, param1: 1, param2: 0 },
          { kind: 'gameData', type: 5, param1: 0, param2: 0 },
        ]);
    });

    it('leaves the command alone for the same data, or when it reads no game data', () =>
    {
      // Arrange.
      const reading: ControlVariablesModel = { start: 1, end: 1, operation: 0, operand: { kind: 'gameData', type: 3, param1: 4, param2: 12 } };
      const constant: ControlVariablesModel = { start: 1, end: 1, operation: 0, operand: { kind: 'constant', value: 1 } };

      // Act.
      const results = [ setGameDataType(reading, 3), setGameDataType(constant, 2) ];

      // Assert.
      expect(results[0])
        .toBe(reading);
      expect(results[1])
        .toBe(constant);
    });
  });
});
