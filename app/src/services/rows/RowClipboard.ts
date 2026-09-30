import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';

/**
 * The marker every copy carries, so a paste can tell rows copied out of a board apart from any other text that
 * happens to be sitting on the clipboard.
 */
const ROW_CLIPBOARD_FORMAT = 'jmz-data-editor/rows';

/**
 * A database row as it is written to disk. Whatever else it holds, it has an id, and the id is its place in its
 * table.
 */
type DatabaseRow = {
  id: number;
};

/**
 * Rows copied out of one table, in the shape they travel on the clipboard: the marker, the table they came from,
 * and the rows themselves exactly as the table writes them to disk.
 */
type CopiedRows = {
  format: typeof ROW_CLIPBOARD_FORMAT;
  table: string;
  rows: DatabaseRow[];
};

/**
 * A paste that goes ahead: the copied rows land on consecutive rows starting at {@link startIndex}, already cut
 * down to the rows that fit before the table ends.
 */
type RowPasteWrite = {
  outcome: 'paste';

  /**
   * The index of the first row written over.
   */
  startIndex: number;

  /**
   * The copied rows that fit, in the order they land.
   */
  rows: DatabaseRow[];

  /**
   * How many copied rows fell past the end of the table and were left out.
   */
  droppedCount: number;
};

/**
 * What a paste would do, decided before anything is written. It goes ahead, or it is refused because the
 * clipboard holds no copied rows, because the rows came from a different table, or because there is no row to
 * paste onto.
 */
type RowPastePlan =
  | RowPasteWrite
  | { outcome: 'not-rows' }
  | { outcome: 'other-table'; table: string }
  | { outcome: 'no-target' };

/**
 * Whole-row copy and paste for the database boards, the way RPG Maker MZ's own database does it.
 *
 * A copy puts the selected rows on the system clipboard as JSON, marked with the table they came from, so a
 * paste works between two editor windows as well as inside one. A paste lands the copied rows on consecutive
 * rows starting at the one selected. Each row written over takes the copied row's content and keeps its own id,
 * because a row's id is its place in its table and everything else in the project points at it. A paste never
 * grows a table: rows that would fall past its end are left out. And rows copied from one table are refused by
 * any other, because a skill pasted onto an item would be a row the item table cannot read.
 */
class RowClipboard
{
  /**
   * Builds the clipboard text for rows copied out of a table.
   * @param {DatabaseFilenames} table The table the rows were copied from.
   * @param {TRow[]} rows The copied rows, exactly as the table writes them to disk.
   * @returns {string} The JSON text to put on the clipboard.
   */
  static copy<TRow extends DatabaseRow>(table: DatabaseFilenames, rows: TRow[]): string
  {
    // mark the rows with the table they belong to, so a paste can refuse them anywhere else.
    const copied: CopiedRows = {
      format: ROW_CLIPBOARD_FORMAT,
      table,
      rows,
    };

    // indent it, so rows pasted into a text editor by hand are still readable.
    return JSON.stringify(copied, null, 2);
  }

  /**
   * Reads copied rows back out of clipboard text. The clipboard can hold anything at all- a note, a formula,
   * rows copied from another table- so the text is checked for the marker and the shape of copied rows before
   * any of it is trusted.
   * @param {string} text The text on the clipboard.
   * @returns {CopiedRows | null} The copied rows, or null when the text is not rows copied out of a board.
   */
  static read(text: string): CopiedRows | null
  {
    // text that is not JSON at all is certainly not copied rows.
    let parsed: unknown;
    try
    {
      parsed = JSON.parse(text);
    }
    catch
    {
      return null;
    }

    // JSON without the marker and the shape of copied rows is somebody else's.
    if (RowClipboard.#isCopiedRows(parsed) === false)
    {
      return null;
    }

    return parsed as CopiedRows;
  }

  /**
   * Decides what pasting clipboard text onto a table would write, without writing it. The rows land on
   * consecutive rows starting at the one given, and any that would fall past the end of the table are left out
   * rather than growing it.
   * @param {string} text The text on the clipboard.
   * @param {DatabaseFilenames} table The table being pasted into.
   * @param {number} rowCount How many rows that table holds.
   * @param {number} startIndex The index of the row the paste starts at.
   * @returns {RowPastePlan} The paste to make, or why there is none.
   */
  static plan(text: string, table: DatabaseFilenames, rowCount: number, startIndex: number): RowPastePlan
  {
    // anything that is not copied rows has nothing to paste.
    const copied = RowClipboard.read(text);
    if (copied === null)
    {
      return { outcome: 'not-rows' };
    }

    // rows from another table would be rows this one cannot read.
    if (copied.table !== table)
    {
      return {
        outcome: 'other-table',
        table: copied.table,
      };
    }

    // a paste needs a row of this table to start on.
    if (startIndex < 0 || startIndex >= rowCount)
    {
      return { outcome: 'no-target' };
    }

    // keep only the rows that fit between the start and the end of the table.
    const room = rowCount - startIndex;
    const rows = copied.rows.slice(0, room);

    return {
      outcome: 'paste',
      startIndex,
      rows,
      droppedCount: copied.rows.length - rows.length,
    };
  }

  /**
   * Writes a planned paste into a board's rows. Each row written over becomes the copied row with its own id
   * kept; every other row is handed back exactly as it was. The list comes back the same length it went in, so
   * a paste can never grow a table, even one that changed between planning the paste and writing it.
   *
   * Call it from inside a React state updater, against the list React hands the updater, for the same reason
   * {@link patchAt} asks for it: an edit built from the list the board last drew can undo one made since.
   * @param {TModel[]} list The board's rows as they stand right now.
   * @param {RowPasteWrite} plan The paste to write, from {@link plan}.
   * @param {(row: TRow) => TModel} fromRow Builds a board row out of a row as the table writes it to disk.
   * @returns {TModel[]} A new list holding the pasted rows, and every other row exactly as it was.
   */
  static apply<TModel extends DatabaseRow, TRow extends DatabaseRow>(
    list: TModel[],
    plan: RowPasteWrite,
    fromRow: (row: TRow) => TModel,
  ): TModel[]
  {
    return list.map((entry, index) =>
    {
      // leave every row outside the pasted run exactly as it was.
      const offset = index - plan.startIndex;
      if (offset < 0 || offset >= plan.rows.length)
      {
        return entry;
      }

      // take the copied row's content, but keep this row's own id. the rows carry the marker of this very
      // table, which only this table's own rows are written under, so they are this table's shape.
      const pasted = {
        ...plan.rows[ offset ],
        id: entry.id,
      } as TRow;

      return fromRow(pasted);
    });
  }

  /**
   * Determines whether parsed clipboard JSON is rows copied out of a board: the marker, a table, and at least
   * one row, every one of them an object.
   * @param {unknown} value The parsed clipboard JSON.
   * @returns {boolean} True when it has the shape of copied rows.
   */
  static #isCopiedRows(value: unknown): boolean
  {
    // copied rows are always an object.
    if (RowClipboard.#isObject(value) === false)
    {
      return false;
    }

    // they carry the marker, the table they came from, and at least one row.
    const { format, table, rows } = value as Record<string, unknown>;
    if (format !== ROW_CLIPBOARD_FORMAT || typeof table !== 'string')
    {
      return false;
    }

    if (Array.isArray(rows) === false || rows.length === 0)
    {
      return false;
    }

    // every row is an object, so it can take on the id of the row it lands on.
    return rows.every((row) => RowClipboard.#isObject(row));
  }

  /**
   * Determines whether a parsed JSON value is an object with named fields, rather than a plain value, null, or
   * a list.
   * @param {unknown} value The parsed JSON value.
   * @returns {boolean} True when it is an object with named fields.
   */
  static #isObject(value: unknown): boolean
  {
    return typeof value === 'object' && value !== null && Array.isArray(value) === false;
  }
}

export type { CopiedRows, DatabaseRow, RowPastePlan, RowPasteWrite };
export { ROW_CLIPBOARD_FORMAT, RowClipboard };
