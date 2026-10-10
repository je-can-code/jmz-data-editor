import { describe, expect, it } from 'vitest';
import { entriesMatching, type PreviewEntry } from '../../../../src/mapEditor/core/preview/previewList.ts';

/*
 * A module's list in the Switches & Variables window is searched the way the switches and variables are: by whatever
 * names each thing, its title or its detail (a quest by the name the player sees or its key), in any case, keeping the
 * list's own order. A search of nothing, or of spaces alone, finds everything, so clearing the box brings the whole list
 * back. A search naming one thing never finds a neighbour that merely sits beside it.
 */
describe('previewList', () =>
{
  /**
   * An entry with nothing to choose, as far as a search reads it.
   * @param {string} key Its key, which is also its detail.
   * @param {string} title Its title.
   * @returns {PreviewEntry} The entry.
   */
  const entry = (key: string, title: string): PreviewEntry => ({
    key,
    title,
    detail: key,
    choice: { id: 'quest', label: `Show quest ${key} as`, options: [], value: '', set: false },
    rows: [],
  });

  /**
   * Cecil's two quests and Viktor's first, as the list shows them.
   */
  const ENTRIES: readonly PreviewEntry[] = [ entry('cecil-001', 'Drills'), entry('cecil-002', 'The Patrol Route'), entry('viktor-001', 'Old Debts') ];

  describe('entriesMatching', () =>
  {
    it('finds every entry, in order, for a search of nothing or of spaces alone', () =>
    {
      // Arrange.
      const searches = [ '', '   ' ];

      // Act.
      const found = searches.map(search => entriesMatching(ENTRIES, search).map(each => each.key));

      // Assert.
      expect(found)
        .toStrictEqual([ [ 'cecil-001', 'cecil-002', 'viktor-001' ], [ 'cecil-001', 'cecil-002', 'viktor-001' ] ]);
    });

    it('finds an entry by its title in any case, leaving out its neighbours', () =>
    {
      // Arrange: part of the second quest's name, in capitals, with spaces either side.
      const search = '  PATROL ';

      // Act.
      const found = entriesMatching(ENTRIES, search).map(each => each.key);

      // Assert.
      expect(found)
        .toStrictEqual([ 'cecil-002' ]);
    });

    it('finds entries by their detail, and only the one a whole key names among keys alike', () =>
    {
      // Arrange: the start every key of Cecil's shares, and the whole key of his first quest.
      const searches = [ 'cecil', 'cecil-001' ];

      // Act.
      const found = searches.map(search => entriesMatching(ENTRIES, search).map(each => each.key));

      // Assert.
      expect(found)
        .toStrictEqual([ [ 'cecil-001', 'cecil-002' ], [ 'cecil-001' ] ]);
    });

    it('finds nothing for a search no title or detail holds', () =>
    {
      // Arrange.
      const search = 'castle';

      // Act.
      const found = entriesMatching(ENTRIES, search);

      // Assert.
      expect(found)
        .toStrictEqual([]);
    });
  });
});
