import { describe, expect, it } from 'vitest';

import RPG_DropHelper from '@services/utils/DropHelper.ts';

describe('DropHelper', () =>
{
  it('exposes numeric Types constants (Item=1, Weapon=2, Armor=3)', () =>
  {
    expect(RPG_DropHelper.Types.Item)
      .toBe(1);
    expect(RPG_DropHelper.Types.Weapon)
      .toBe(2);
    expect(RPG_DropHelper.Types.Armor)
      .toBe(3);
  });

  it('TypeFromLetter maps letters and words case-insensitively', () =>
  {
    // items
    expect(RPG_DropHelper.TypeFromLetter('i'))
      .toBe(RPG_DropHelper.Types.Item);
    expect(RPG_DropHelper.TypeFromLetter('Item' as any))
      .toBe(RPG_DropHelper.Types.Item);

    // weapons
    expect(RPG_DropHelper.TypeFromLetter('w'))
      .toBe(RPG_DropHelper.Types.Weapon);
    expect(RPG_DropHelper.TypeFromLetter('WEAPON' as any))
      .toBe(RPG_DropHelper.Types.Weapon);

    // armors
    expect(RPG_DropHelper.TypeFromLetter('a'))
      .toBe(RPG_DropHelper.Types.Armor);
    expect(RPG_DropHelper.TypeFromLetter('Armor' as any))
      .toBe(RPG_DropHelper.Types.Armor);
  });

  it('TypeFromLetter throws for invalid letters/words', () =>
  {
    expect(() => RPG_DropHelper.TypeFromLetter('x' as any))
      .toThrowError('invalid item type letter provided: [x].');
    expect(() => RPG_DropHelper.TypeFromLetter('' as any))
      .toThrowError();
  });

  it('LetterFromType maps 1/2/3 to i/w/a and throws otherwise', () =>
  {
    expect(RPG_DropHelper.LetterFromType(1))
      .toBe('i');
    expect(RPG_DropHelper.LetterFromType(2))
      .toBe('w');
    expect(RPG_DropHelper.LetterFromType(3))
      .toBe('a');

    expect(() => RPG_DropHelper.LetterFromType(0))
      .toThrowError('invalid drop type (kind): [0].');
    expect(() => RPG_DropHelper.LetterFromType(4))
      .toThrowError('invalid drop type (kind): [4].');
  });
});
