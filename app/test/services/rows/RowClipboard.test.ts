import { describe, expect, it } from 'vitest';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { ROW_CLIPBOARD_FORMAT, RowClipboard, type RowPasteWrite } from '@services/rows/RowClipboard.ts';

/**
 * Whole-row copy and paste is how an author builds a new skill, item or enemy from one that already works,
 * the way RPG Maker MZ's database lets them, and what a paste writes goes straight to disk on the next save.
 * `RowClipboard` owes the boards four things. A row pasted over keeps its own id, because the id is its place
 * in its table and every troop, drop and recipe in the project points at it by that id. Rows copied from one
 * table are refused by every other, because a skill written into Items.json is a row the game cannot read as
 * an item. Several rows land on consecutive rows from the one selected, and never past the end of the table,
 * because growing a table is a separate decision from pasting into it. And every row outside the pasted run is
 * left exactly as it was: a paste that touched a neighbour would be an edit the author never made and would
 * not think to look for.
 */
describe('RowClipboard', () =>
{
  /**
   * A stand-in for a board's domain model: built from a row as the table writes it, carrying a method the
   * pasted row has to have, just as a real model has to keep `toRmmz`.
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
   * Builds a paste that goes ahead, as {@link RowClipboard.plan} hands one back, with nothing left out.
   * @param {number} startIndex The index of the first row written over.
   * @param {TRow[]} rows The copied rows to land, in order.
   * @returns {RowPasteWrite} The paste.
   */
  const planOf = <TRow extends { id: number }>(startIndex: number, rows: TRow[]): RowPasteWrite => ({
    outcome: 'paste',
    startIndex,
    rows,
    droppedCount: 0,
  });

  describe('copy', () =>
  {
    it('marks the copied rows with the table they came from', () =>
    {
      // Arrange
      const rows = [ { id: 7, name: 'Potion' }, { id: 8, name: 'Hi-Potion' } ];

      // Act
      const text = RowClipboard.copy(DatabaseFilenames.Items, rows);

      // Assert- the marker, the table, and the rows exactly as given.
      expect(JSON.parse(text))
        .toEqual({
          format: 'jmz-data-editor/rows',
          table: 'Items.json',
          rows: [ { id: 7, name: 'Potion' }, { id: 8, name: 'Hi-Potion' } ],
        });
    });
  });

  describe('read', () =>
  {
    it('reads rows back out of text a copy wrote', () =>
    {
      // Arrange
      const text = RowClipboard.copy(DatabaseFilenames.Skills, [ { id: 3, name: 'Fire' } ]);

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toEqual({
          format: ROW_CLIPBOARD_FORMAT,
          table: 'Skills.json',
          rows: [ { id: 3, name: 'Fire' } ],
        });
    });

    it('turns away text that is not JSON, like a formula copied from a field', () =>
    {
      // Arrange
      const text = 'a.atk * 4 - b.def * 2';

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away JSON that is a plain value rather than an object', () =>
    {
      // Arrange
      const text = '42';

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away JSON null', () =>
    {
      // Arrange
      const text = 'null';

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away a bare list of rows that carries no marker', () =>
    {
      // Arrange- rows copied out of a data file by hand, rather than out of a board.
      const text = JSON.stringify([ { id: 1, name: 'Potion' } ]);

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away an object whose marker is not this editor\'s', () =>
    {
      // Arrange- everything else is exactly right.
      const text = JSON.stringify({ format: 'something-else/rows', table: 'Items.json', rows: [ { id: 1 } ] });

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away copied rows that do not say which table they came from', () =>
    {
      // Arrange
      const text = JSON.stringify({ format: ROW_CLIPBOARD_FORMAT, table: 4, rows: [ { id: 1 } ] });

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away copied rows whose rows are not a list', () =>
    {
      // Arrange
      const text = JSON.stringify({ format: ROW_CLIPBOARD_FORMAT, table: 'Items.json', rows: { id: 1 } });

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away copied rows with no rows in them', () =>
    {
      // Arrange
      const text = JSON.stringify({ format: ROW_CLIPBOARD_FORMAT, table: 'Items.json', rows: [] });

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });

    it('turns away copied rows when any one of them is not an object', () =>
    {
      // Arrange- the first row is fine, the second is a plain number.
      const text = JSON.stringify({ format: ROW_CLIPBOARD_FORMAT, table: 'Items.json', rows: [ { id: 1 }, 2 ] });

      // Act
      const copied = RowClipboard.read(text);

      // Assert
      expect(copied)
        .toBeNull();
    });
  });

  describe('plan', () =>
  {
    it('lands the copied rows on consecutive rows from the one selected', () =>
    {
      // Arrange- two rows copied, pasted into a table of five starting at its second row.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 5, 1);

      // Assert- both rows fit, so nothing is left out.
      expect(plan)
        .toEqual({
          outcome: 'paste',
          startIndex: 1,
          rows: [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ],
          droppedCount: 0,
        });
    });

    it('stops at the end of the table rather than growing it, and counts what it left out', () =>
    {
      // Arrange- three rows copied, pasted onto the second-to-last row of a table of four.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [
        { id: 7, name: 'Potion' },
        { id: 8, name: 'Ether' },
        { id: 9, name: 'Elixir' },
      ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 4, 2);

      // Assert- the first two land on the last two rows, and the third has nowhere to go.
      expect(plan)
        .toEqual({
          outcome: 'paste',
          startIndex: 2,
          rows: [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ],
          droppedCount: 1,
        });
    });

    it('lands the copied rows on the very first row of the table', () =>
    {
      // Arrange- the first row is the edge the table starts on, and it is still a row to paste onto.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 4, 0);

      // Assert
      expect(plan)
        .toEqual({
          outcome: 'paste',
          startIndex: 0,
          rows: [ { id: 7, name: 'Potion' } ],
          droppedCount: 0,
        });
    });

    it('lands a single row on the very last row of the table', () =>
    {
      // Arrange- the last row is the edge the table ends on, and it is still a row to paste onto.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 4, 3);

      // Assert
      expect(plan)
        .toEqual({
          outcome: 'paste',
          startIndex: 3,
          rows: [ { id: 7, name: 'Potion' } ],
          droppedCount: 0,
        });
    });

    it('refuses rows copied from a different table, naming that table', () =>
    {
      // Arrange- a skill, pasted onto an item.
      const text = RowClipboard.copy(DatabaseFilenames.Skills, [ { id: 3, name: 'Fire' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 5, 1);

      // Assert
      expect(plan)
        .toEqual({
          outcome: 'other-table',
          table: 'Skills.json',
        });
    });

    it('has nothing to paste when the clipboard holds something other than copied rows', () =>
    {
      // Arrange
      const text = 'Potion';

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 5, 1);

      // Assert
      expect(plan)
        .toEqual({ outcome: 'not-rows' });
    });

    it('has no row to paste onto when the start is past the end of the table', () =>
    {
      // Arrange- a table of four has no row at index four.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 4, 4);

      // Assert
      expect(plan)
        .toEqual({ outcome: 'no-target' });
    });

    it('has no row to paste onto when the start is before the first row', () =>
    {
      // Arrange
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 4, -1);

      // Assert
      expect(plan)
        .toEqual({ outcome: 'no-target' });
    });

    it('has no row to paste onto when the table is empty', () =>
    {
      // Arrange- a table that has not loaded yet holds no rows at all.
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 7, name: 'Potion' } ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, 0, 0);

      // Assert
      expect(plan)
        .toEqual({ outcome: 'no-target' });
    });
  });

  describe('writesOver', () =>
  {
    it('counts both ends of the pasted run as written over', () =>
    {
      // Arrange- two rows landing on rows 1 and 2.
      const plan = planOf(1, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ]);

      // Act
      const firstWrittenOver = RowClipboard.writesOver(plan, 1);
      const lastWrittenOver = RowClipboard.writesOver(plan, 2);

      // Assert
      expect(firstWrittenOver)
        .toBe(true);
      expect(lastWrittenOver)
        .toBe(true);
    });

    it('counts the rows just outside either end of the pasted run as left alone', () =>
    {
      // Arrange- the same two rows landing on rows 1 and 2, with rows 0 and 3 on either side.
      const plan = planOf(1, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ]);

      // Act
      const beforeWrittenOver = RowClipboard.writesOver(plan, 0);
      const afterWrittenOver = RowClipboard.writesOver(plan, 3);

      // Assert
      expect(beforeWrittenOver)
        .toBe(false);
      expect(afterWrittenOver)
        .toBe(false);
    });
  });

  describe('apply', () =>
  {
    it('gives each row pasted over the copied row\'s content and keeps its own id', () =>
    {
      // Arrange- rows copied from ids 7 and 8, landing on the rows with ids 2 and 3.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve', 'Balm' ]);
      const plan = planOf(1, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ]);

      // Act
      const pasted = RowClipboard.apply(list, plan, fromRow);

      // Assert- the names came across, the ids did not.
      expect(pasted[ 1 ].label())
        .toBe('2: Potion');
      expect(pasted[ 2 ].label())
        .toBe('3: Ether');
    });

    it('builds each row pasted over through the board\'s own model', () =>
    {
      // Arrange
      const list = tableOf([ 'Herb', 'Tonic' ]);
      const plan = planOf(0, [ { id: 7, name: 'Potion' } ]);

      // Act
      const [ pasted ] = RowClipboard.apply(list, plan, fromRow);

      // Assert- a model the board can keep editing and saving, not a bare row.
      expect(pasted)
        .toBeInstanceOf(Row);
      expect(pasted)
        .not.toBe(list[ 0 ]);
    });

    it('leaves the neighbours on both sides of the pasted run exactly as they were', () =>
    {
      // Arrange- a run over the two middle rows, with a row either side that must survive untouched.
      const list = tableOf([ 'Herb', 'Tonic', 'Salve', 'Balm' ]);
      const plan = planOf(1, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' } ]);

      // Act
      const pasted = RowClipboard.apply(list, plan, fromRow);

      // Assert- the very same objects, not look-alikes.
      expect(pasted[ 0 ])
        .toBe(list[ 0 ]);
      expect(pasted[ 3 ])
        .toBe(list[ 3 ]);
      expect(pasted[ 3 ].label())
        .toBe('4: Balm');
    });

    it('leaves the list it was given as it was', () =>
    {
      // Arrange
      const list = tableOf([ 'Herb', 'Tonic' ]);
      const plan = planOf(0, [ { id: 7, name: 'Potion' } ]);

      // Act
      const pasted = RowClipboard.apply(list, plan, fromRow);

      // Assert- a new list, and the old one still holds the old row.
      expect(pasted)
        .not.toBe(list);
      expect(list[ 0 ].label())
        .toBe('1: Herb');
    });

    it('never grows the table, even when it shrank after the paste was planned', () =>
    {
      // Arrange- a paste planned for three rows at index one, written into a table that now holds only two.
      const list = tableOf([ 'Herb', 'Tonic' ]);
      const plan = planOf(1, [ { id: 7, name: 'Potion' }, { id: 8, name: 'Ether' }, { id: 9, name: 'Elixir' } ]);

      // Act
      const pasted = RowClipboard.apply(list, plan, fromRow);

      // Assert- still two rows; the one that fit was pasted, the rest had nowhere to go.
      expect(pasted.map((row) => row.label()))
        .toEqual([ '1: Herb', '2: Potion' ]);
    });

    it('pastes what a copy put on the clipboard, from one board window to another', () =>
    {
      // Arrange- rows copied in one window arrive in the other as nothing but the clipboard text.
      const source = tableOf([ 'Potion', 'Ether', 'Elixir' ]);
      const text = RowClipboard.copy(DatabaseFilenames.Items, source.slice(0, 2));
      const target = tableOf([ 'Herb', 'Tonic', 'Salve', 'Balm' ]);

      // Act
      const plan = RowClipboard.plan(text, DatabaseFilenames.Items, target.length, 2) as RowPasteWrite;
      const pasted = RowClipboard.apply(target, plan, fromRow);

      // Assert- the last two rows took the copies, under their own ids.
      expect(pasted.map((row) => row.label()))
        .toEqual([ '1: Herb', '2: Tonic', '3: Potion', '4: Ether' ]);
    });
  });
});
