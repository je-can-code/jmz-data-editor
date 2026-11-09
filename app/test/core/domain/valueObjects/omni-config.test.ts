import { describe, expect, it } from 'vitest';
import {
  createMonsterType,
  hydrateMonsterType,
  hydrateOmniConfig,
  moveMonsterType,
} from '@core/domain/valueObjects/omni-config.ts';

/**
 * The Omnipedia board writes back the whole file, and the game reads it the moment it boots, so what the board holds
 * in memory is what the Monsterpedia shows next launch. Three things decide that, and all of them fail quietly:
 *
 *   - reading: every page has to come through with all four of its fields, so the board never saves a page with
 *     something missing that the game then refuses to boot over
 *   - adding: a new page must never take a key another page already uses, or two pages would claim the same enemies
 *   - moving: the order of the pages is the order the game flips through them, and the first is where the
 *     Monsterpedia opens, so a move must swap exactly two neighbors and never wrap a page around to the other end
 */
describe('hydrateOmniConfig', () =>
{
  it('reads a file without a list of pages as no pages at all', () =>
  {
    // Arrange - a file the editor never wrote, holding an object where the list belongs.
    const source = { monsterTypes: { key: 'enemy' } };

    // Act
    const config = hydrateOmniConfig(source);

    // Assert
    expect(config)
      .toEqual({ monsterTypes: [] });
  });

  it('carries every page through as written, in the order written', () =>
  {
    // Arrange - one page showing stats and one leaving them out, so neither value can stand in for the other.
    const source = {
      monsterTypes: [
        { key: 'enemy', name: 'Monsterpedia', iconIndex: 14, showsStats: true },
        { key: 'destructible', name: 'Destructapedia', iconIndex: 216, showsStats: false },
      ],
    };

    // Act
    const config = hydrateOmniConfig(source);

    // Assert
    expect(config)
      .toEqual({
        monsterTypes: [
          { key: 'enemy', name: 'Monsterpedia', iconIndex: 14, showsStats: true },
          { key: 'destructible', name: 'Destructapedia', iconIndex: 216, showsStats: false },
        ],
      });
  });
});

describe('hydrateMonsterType', () =>
{
  it('keys a page with no key after its place in the file, with no name, no icon, and its stats left out', () =>
  {
    // Arrange - a hand-edited entry missing every field.
    const source = {};

    // Act
    const monsterType = hydrateMonsterType(source, 2);

    // Assert
    expect(monsterType)
      .toEqual({ key: 'type_2', name: '', iconIndex: 0, showsStats: false });
  });
});

describe('createMonsterType', () =>
{
  it('starts a new page on the plain key when nothing uses it, showing its stats', () =>
  {
    // Arrange
    const monsterTypes = [ { key: 'enemy', name: 'Monsterpedia', iconIndex: 14, showsStats: true } ];

    // Act
    const added = createMonsterType(monsterTypes);

    // Assert
    expect(added)
      .toEqual({ key: 'newType', name: '', iconIndex: 0, showsStats: true });
  });

  it('numbers a new page past every key already taken', () =>
  {
    // Arrange - the plain key and its first numbered sibling are both in use.
    const monsterTypes = [
      { key: 'newType', name: '', iconIndex: 0, showsStats: true },
      { key: 'newType2', name: '', iconIndex: 0, showsStats: true },
    ];

    // Act
    const added = createMonsterType(monsterTypes);

    // Assert
    expect(added.key)
      .toBe('newType3');
  });
});

describe('moveMonsterType', () =>
{
  const enemy = { key: 'enemy', name: 'Monsterpedia', iconIndex: 14, showsStats: true };
  const destructible = { key: 'destructible', name: 'Destructapedia', iconIndex: 216, showsStats: false };
  const summon = { key: 'summon', name: 'Summons', iconIndex: 77, showsStats: true };

  it('swaps a page with the neighbor before it when moved earlier, leaving the rest in place', () =>
  {
    // Arrange
    const monsterTypes = [ enemy, destructible, summon ];

    // Act
    const moved = moveMonsterType(monsterTypes, 2, -1);

    // Assert
    expect(moved)
      .toEqual([ enemy, summon, destructible ]);
  });

  it('swaps a page with the neighbor after it when moved later', () =>
  {
    // Arrange
    const monsterTypes = [ enemy, destructible, summon ];

    // Act
    const moved = moveMonsterType(monsterTypes, 0, 1);

    // Assert
    expect(moved)
      .toEqual([ destructible, enemy, summon ]);
  });

  it('leaves the first page first when it is moved earlier, rather than wrapping it to the end', () =>
  {
    // Arrange
    const monsterTypes = [ enemy, destructible, summon ];

    // Act
    const moved = moveMonsterType(monsterTypes, 0, -1);

    // Assert
    expect(moved)
      .toEqual([ enemy, destructible, summon ]);
  });

  it('leaves the last page last when it is moved later', () =>
  {
    // Arrange
    const monsterTypes = [ enemy, destructible, summon ];

    // Act
    const moved = moveMonsterType(monsterTypes, 2, 1);

    // Assert
    expect(moved)
      .toEqual([ enemy, destructible, summon ]);
  });
});
