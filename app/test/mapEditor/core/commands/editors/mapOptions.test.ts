import { describe, expect, it } from 'vitest';
import { mapLabel, mapOptions } from '../../../../../src/mapEditor/core/commands/editors/mapOptions.ts';
import type { RmmzMapInfo } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * Map pickers (Transfer Player's destination) list the maps the way the map tree shows them, so the author finds
 * a map where they already know it is: each map under its parent, siblings in their tree order rather than by
 * id. Every map is listed exactly once, even one whose parent is gone or one caught in a parent loop.
 */
describe('map options', () =>
{
  /**
   * Builds a map tree row.
   * @param {number} id The map id.
   * @param {number} parentId Its parent.
   * @param {number} order Its place among the tree's rows.
   * @param {string} name Its name.
   * @returns {RmmzMapInfo} The row.
   */
  const info = (id: number, parentId: number, order: number, name: string): RmmzMapInfo => ({
    id, parentId, order, name, expanded: false, scrollX: 0, scrollY: 0,
  });

  describe('mapOptions', () =>
  {
    it('lists each map under its parent, siblings by tree order, not by id', () =>
    {
      // Arrange: the town (3) comes before the field (1) in the tree, and the inn sits inside the town.
      const infos = [ null, info(1, 0, 3, 'Field'), info(2, 3, 2, 'Inn'), info(3, 0, 1, 'Town'), null ];

      // Act.
      const options = mapOptions(infos);

      // Assert.
      expect(options)
        .toStrictEqual([
          { id: 3, name: 'Town', depth: 0 },
          { id: 2, name: 'Inn', depth: 1 },
          { id: 1, name: 'Field', depth: 0 },
        ]);
    });

    it('lists a map whose parent is gone at the top, and maps caught in a parent loop once each, last', () =>
    {
      // Arrange: map 5's parent does not exist; maps 6 and 7 are each other's parent.
      const infos = [ null, info(5, 99, 2, 'Orphan'), info(6, 7, 3, 'Loop A'), info(7, 6, 4, 'Loop B'), info(8, 0, 1, 'Root') ];

      // Act.
      const options = mapOptions(infos);

      // Assert.
      expect(options.map(option => [ option.id, option.depth ]))
        .toStrictEqual([ [ 8, 0 ], [ 5, 0 ], [ 6, 0 ], [ 7, 0 ] ]);
    });

    it('breaks a tie in order by id, and ignores a map naming itself as its parent', () =>
    {
      // Arrange.
      const infos = [ null, info(4, 0, 1, 'Second'), info(2, 0, 1, 'First'), info(9, 9, 2, 'Self') ];

      // Act.
      const options = mapOptions(infos);

      // Assert.
      expect(options.map(option => option.id))
        .toStrictEqual([ 2, 4, 9 ]);
    });
  });

  describe('mapLabel', () =>
  {
    it('pads the id to three digits, and drops the space for a nameless map', () =>
    {
      // Arrange: a named map, and one with no name.

      // Act.
      const labels = [ mapLabel(7, 'Chef Town'), mapLabel(1204, 'Big'), mapLabel(12, '') ];

      // Assert.
      expect(labels)
        .toStrictEqual([ '007 Chef Town', '1204 Big', '012' ]);
    });
  });
});
