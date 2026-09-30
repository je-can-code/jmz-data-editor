import { describe, expect, it } from 'vitest';
import { RowClear } from '@services/rows/RowClear.ts';

/**
 * Whole-row Clear is how an author wipes a skill, item or enemy back to nothing, the way RPG Maker MZ's
 * own database does when its Clear command runs on a row. `RowClear` owes the boards two things. A row
 * reset to the table's blank row keeps its own id, because the id is its place in its table and every
 * troop, drop and recipe in the project points at it by that id. And every row outside the cleared run is
 * left exactly as it was: a clear that touched a neighbour would be an edit the author never made and
 * would not think to look for.
 */
describe('RowClear', () =>
{
  /**
   * A stand-in for a board's domain model: built from a row as the table writes it, carrying a method the
   * cleared row has to have, just as a real model has to keep `toRmmz`.
   */
  class Row
  {
    public id: number;
    public name: string;

    constructor(dto: { id: number; name: string })
    {
      this.id = dto.id;
      this.name = dto.name;
    }

    label(): string
    {
      return `${this.id}: ${this.name}`;
    }
  }

  /**
   * Builds a board row out of a row as the table writes it to disk.
   * @param {{ id: number; name: string }} dto The row as the table writes it.
   * @returns {Row} The board row.
   */
  const fromRow = (dto: { id: number; name: string }): Row => new Row(dto);

  /**
   * Builds the rows of a small table, one per name, with ids counting up from 1 the way RMMZ numbers them.
   * @param {string[]} names The name of each row, in table order.
   * @returns {Row[]} The table's rows.
   */
  const tableOf = (names: string[]): Row[] => names.map((name, index) => new Row({ id: index + 1, name }));

  /**
   * A stand-in for a table's blank row, apart from the id every clear overwrites anyway.
   */
  const blankRow = { id: 0, name: '' };

  describe('apply', () =>
  {
    it('resets the selected row to the table\'s blank row, keeping its own id', () =>
    {
      // Arrange- one row, in the middle of a table of three, selected for clearing.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve' ]);

      // Act
      const cleared = RowClear.apply(list, [ 1 ], blankRow, fromRow);

      // Assert- the id came through, the name reset to blank.
      expect(cleared[ 1 ].label())
        .toBe('2: ');
    });

    it('resets every row of a run, each keeping its own id', () =>
    {
      // Arrange- a run over the last two rows of three.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve' ]);

      // Act
      const cleared = RowClear.apply(list, [ 1, 2 ], blankRow, fromRow);

      // Assert
      expect(cleared.map((row) => row.label()))
        .toEqual([ '1: Herb', '2: ', '3: ' ]);
    });

    it('clears rows that are not next to each other, leaving the row between them alone', () =>
    {
      // Arrange- the first and last rows of three are cleared, the middle one is not.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve' ]);

      // Act
      const cleared = RowClear.apply(list, [ 0, 2 ], blankRow, fromRow);

      // Assert
      expect(cleared.map((row) => row.label()))
        .toEqual([ '1: ', '2: Tonic', '3: ' ]);
    });

    it('builds each cleared row through the board\'s own model', () =>
    {
      // Arrange
      const list = tableOf([ 'Herb', 'Tonic' ]);

      // Act
      const [ cleared ] = RowClear.apply(list, [ 0 ], blankRow, fromRow);

      // Assert- a model the board can keep editing and saving, not a bare row.
      expect(cleared)
        .toBeInstanceOf(Row);
      expect(cleared)
        .not.toBe(list[ 0 ]);
    });

    it('leaves the neighbours on both sides of the cleared run exactly as they were', () =>
    {
      // Arrange- the middle row of three is cleared, with a row either side that must survive untouched.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve' ]);

      // Act
      const cleared = RowClear.apply(list, [ 1 ], blankRow, fromRow);

      // Assert- the very same objects, not look-alikes.
      expect(cleared[ 0 ])
        .toBe(list[ 0 ]);
      expect(cleared[ 2 ])
        .toBe(list[ 2 ]);
    });

    it('leaves the list it was given as it was', () =>
    {
      // Arrange
      const list = tableOf([ 'Herb', 'Tonic' ]);

      // Act
      const cleared = RowClear.apply(list, [ 0 ], blankRow, fromRow);

      // Assert- a new list, and the old one still holds the old row.
      expect(cleared)
        .not.toBe(list);
      expect(list[ 0 ].label())
        .toBe('1: Herb');
    });
  });
});
