import { describe, expect, it } from 'vitest';
import {
  parseTransferPlayer,
  setTransferDesignation,
  writeTransferPlayer,
} from '../../../../../src/mapEditor/core/commands/editors/transferPlayer.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Transfer Player holds six whole numbers: how the destination is named (directly, or by variables), the map,
 * x, y, the direction to face and the fade. The editor reads them into named fields and writes them back in the
 * same order, and a command of any other shape reads as null so it is never rewritten by guesswork. Switching
 * how the destination is named starts the three numbers over, since a map id and a variable id mean different
 * things.
 */
describe('transfer player', () =>
{
  /**
   * Builds a Transfer Player command.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const transfer = (parameters: unknown[]): RmmzEventCommand => ({ code: 201, indent: 0, parameters: parameters as never });

  describe('parseTransferPlayer', () =>
  {
    it('reads the six numbers into named fields', () =>
    {
      // Arrange.
      const command = transfer([ 0, 12, 7, 9, 8, 2 ]);

      // Act.
      const model = parseTransferPlayer(command);

      // Assert.
      expect(model)
        .toStrictEqual({ designation: 0, mapId: 12, x: 7, y: 9, direction: 8, fade: 2 });
    });

    it('refuses a command of any other shape', () =>
    {
      // Arrange: five numbers, a fraction, text, and another code.
      const shapes = [
        transfer([ 0, 12, 7, 9, 8 ]),
        transfer([ 0, 12, 7.5, 9, 8, 2 ]),
        transfer([ 0, '12', 7, 9, 8, 2 ]),
        { ...transfer([ 0, 12, 7, 9, 8, 2 ]), code: 202 },
      ];

      // Act.
      const models = shapes.map(parseTransferPlayer);

      // Assert.
      expect(models)
        .toStrictEqual([ null, null, null, null ]);
    });
  });

  describe('writeTransferPlayer', () =>
  {
    it('writes the fields back in MZ\'s order, keeping the command\'s other keys', () =>
    {
      // Arrange.
      const command = { ...transfer([ 0, 1, 1, 1, 0, 0 ]), collapsed: false };

      // Act.
      const written = writeTransferPlayer(command, { designation: 1, mapId: 4, x: 5, y: 6, direction: 2, fade: 1 });

      // Assert.
      expect(JSON.stringify(written))
        .toBe(JSON.stringify({ code: 201, indent: 0, parameters: [ 1, 4, 5, 6, 2, 1 ], collapsed: false }));
    });
  });

  describe('setTransferDesignation', () =>
  {
    it('starts the destination over when switching to variables, and back', () =>
    {
      // Arrange.
      const direct = { designation: 0, mapId: 12, x: 7, y: 9, direction: 8, fade: 2 };

      // Act.
      const variables = setTransferDesignation(direct, 1);
      const backAgain = setTransferDesignation(variables, 0);

      // Assert: the direction and fade carry across.
      expect([ variables, backAgain ])
        .toStrictEqual([
          { designation: 1, mapId: 1, x: 1, y: 1, direction: 8, fade: 2 },
          { designation: 0, mapId: 1, x: 0, y: 0, direction: 8, fade: 2 },
        ]);
    });

    it('leaves the transfer alone when the designation does not change', () =>
    {
      // Arrange.
      const direct = { designation: 0, mapId: 12, x: 7, y: 9, direction: 8, fade: 2 };

      // Act.
      const same = setTransferDesignation(direct, 0);

      // Assert.
      expect(same)
        .toBe(direct);
    });
  });
});
