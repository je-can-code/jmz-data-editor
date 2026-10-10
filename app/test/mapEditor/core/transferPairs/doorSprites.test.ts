import { describe, expect, it } from 'vitest';
import {
  defaultDoorLook,
  doorLookChoices,
  doorLookKey,
  doorLookName,
  MZ_DOOR,
  sameDoorLook,
} from '../../../../src/mapEditor/core/transferPairs/doorSprites.ts';

/*
 * The door's picture follows the author's habit: a new door starts as the picture the project's doors use most, which the
 * server lists first, and only a project with no doors at all falls back to MZ's own door sheet. The pictures offered are
 * the project's own, most used first, and a picture chosen that none of them is still heads the list, so a choice never
 * drops out of its own list. Two pictures are the same only when the sheet, the character and the frame all are.
 */
describe('doorSprites', () =>
{
  const DUNGEON = { characterName: '!EX_Dungeon_Doors', characterIndex: 4, direction: 2, pattern: 2, doors: 6 };
  const TOWN = { characterName: '!doors', characterIndex: 2, direction: 2, pattern: 1, doors: 5 };

  describe('defaultDoorLook', () =>
  {
    it('starts a door as the picture the project\'s doors use most, without its count', () =>
    {
      // Arrange: the server's list, most used first.
      const sprites = [ DUNGEON, TOWN ];

      // Act.
      const look = defaultDoorLook(sprites);

      // Assert.
      expect(look)
        .toStrictEqual({ characterName: '!EX_Dungeon_Doors', characterIndex: 4, direction: 2, pattern: 2 });
    });

    it('starts a door as MZ\'s own in a project with no doors', () =>
    {
      // Arrange: nothing to count.

      // Act.
      const look = defaultDoorLook([]);

      // Assert.
      expect(look)
        .toBe(MZ_DOOR);
    });
  });

  describe('sameDoorLook', () =>
  {
    it('tells pictures apart by sheet, character, pose and frame', () =>
    {
      // Arrange: the town door counted otherwise, and a near miss in each part.
      const recounted = { ...TOWN, doors: 1 };
      const misses = [
        { ...TOWN, characterName: '!Door1' },
        { ...TOWN, characterIndex: 3 },
        { ...TOWN, direction: 4 },
        { ...TOWN, pattern: 0 },
      ];

      // Act.
      const same = [ sameDoorLook(TOWN, recounted), ...misses.map(miss => sameDoorLook(TOWN, miss)) ];

      // Assert.
      expect(same)
        .toStrictEqual([ true, false, false, false, false ]);
    });
  });

  describe('doorLookChoices', () =>
  {
    it('offers the project\'s pictures as they are when the one chosen is among them', () =>
    {
      // Arrange.
      const chosen = { characterName: '!doors', characterIndex: 2, direction: 2, pattern: 1 };

      // Act.
      const choices = doorLookChoices([ DUNGEON, TOWN ], chosen);

      // Assert.
      expect(choices)
        .toStrictEqual([ DUNGEON, TOWN ]);
    });

    it('puts a picture chosen that no door uses ahead of the project\'s, counted as used by none', () =>
    {
      // Arrange: MZ's own door, which no door of the project uses.
      const chosen = MZ_DOOR;

      // Act.
      const choices = doorLookChoices([ DUNGEON ], chosen);

      // Assert.
      expect(choices)
        .toStrictEqual([ { ...MZ_DOOR, doors: 0 }, DUNGEON ]);
    });
  });

  describe('doorLookName and doorLookKey', () =>
  {
    it('names a picture by its sheet and its character from 1, a sheet of one character by the sheet alone', () =>
    {
      // Arrange: a sheet of eight characters, and a sheet of one.
      const gate = { characterName: '!$Gate1', characterIndex: 0, direction: 2, pattern: 2 };

      // Act.
      const names = [ doorLookName(DUNGEON), doorLookName(gate) ];
      const keys = [ doorLookKey(DUNGEON), doorLookKey(gate) ];

      // Assert.
      expect([ names, keys ])
        .toStrictEqual([ [ 'EX_Dungeon_Doors 5', 'Gate1' ], [ '!EX_Dungeon_Doors#4#2#2', '!$Gate1#0#2#2' ] ]);
    });
  });
});
