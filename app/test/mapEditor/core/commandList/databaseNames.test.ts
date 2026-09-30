import { describe, expect, it } from 'vitest';
import { isNamedKind, nameLookup, namedRows, type DatabaseNamesJson } from '../../../../src/mapEditor/core/commandList/databaseNames.ts';

/*
 * Rows read "Switch #0012 Door Open" rather than "Switch 12" because a lookup turns each id into its name, and the
 * pickers offer rows by name. Both owe the list the name from the right list for each kind of id (a switch's from
 * the switches, never the variables), nothing for an id with no row, and plain numbers until the names arrive.
 */
describe('databaseNames', () =>
{
  /**
   * A project's names, a few per list, the rest empty.
   * @returns {DatabaseNamesJson} The names.
   */
  const buildNames = (): DatabaseNamesJson => ({
    switches: [ '', 'Door Open', 'Gate' ],
    variables: [ '', 'Coins' ],
    actors: [ '', 'Harold', '', 'Therese' ],
    classes: [],
    skills: [],
    items: [ '', 'Potion' ],
    weapons: [],
    armors: [],
    enemies: [],
    troops: [],
    states: [],
    animations: [],
    tilesets: [],
    commonEvents: [ '', 'Heal Party' ],
    maps: [ '', 'Town' ],
    equipTypes: [ '', 'Weapon' ],
  });

  describe('nameLookup', () =>
  {
    it('names an id from its own kind\'s list', () =>
    {
      // Arrange.
      const names = nameLookup(buildNames());

      // Act.
      const found = [ names('switch', 1), names('variable', 1), names('common-event', 1), names('map', 1) ];

      // Assert.
      expect(found)
        .toStrictEqual([ 'Door Open', 'Coins', 'Heal Party', 'Town' ]);
    });

    it('names nothing for an id past the list, a kind no list names, or before the names arrive', () =>
    {
      // Arrange.
      const names = nameLookup(buildNames());
      const early = nameLookup(null);

      // Act.
      const found = [ names('switch', 9), names('number', 1), early('switch', 1) ];

      // Assert.
      expect(found)
        .toStrictEqual([ null, null, null ]);
    });
  });

  describe('namedRows', () =>
  {
    it('offers every id from 1, with its name, empty ones included', () =>
    {
      // Arrange.
      const names = buildNames();

      // Act.
      const rows = namedRows(names, 'actor');

      // Assert.
      expect(rows)
        .toStrictEqual([ { id: 1, name: 'Harold' }, { id: 2, name: '' }, { id: 3, name: 'Therese' } ]);
    });

    it('offers nothing for a kind no list names, or before the names arrive', () =>
    {
      // Arrange.

      // Act.
      const rows = [ namedRows(buildNames(), 'text'), namedRows(null, 'switch') ];

      // Assert.
      expect(rows)
        .toStrictEqual([ [], [] ]);
    });
  });

  describe('isNamedKind', () =>
  {
    it('knows the kinds a list names from the kinds none does', () =>
    {
      // Arrange.

      // Act.
      const answers = [ isNamedKind('switch'), isNamedKind('troop'), isNamedKind('event'), isNamedKind('number') ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, false, false ]);
    });
  });
});
