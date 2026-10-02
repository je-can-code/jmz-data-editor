/**
 * A run of rows selected together in a board's list, from the row a Shift click extended from to the row the
 * board is showing. A single selected row is a run whose two ends are the same row.
 */
type RowSelection = {
  /**
   * The row the run was started from, which a Shift click extends away from.
   */
  anchor: number;

  /**
   * The row the run ends on, which is the row the board is showing.
   */
  head: number;
};

/**
 * Decides which rows of a board's list are selected, so a copy can take several rows at once.
 *
 * A board keeps selecting one row the way it always has: that row is the one it shows. A Shift click widens
 * the selection into a run from where it started to the row clicked, the way RPG Maker MZ's database lists
 * do. A run only lasts while the board is still showing the row it ends on; once the board moves to another
 * row by any other road- the search box, the arrow keys, a link from another board- the run collapses onto
 * that row, so a copy never takes rows the author has stopped looking at.
 */
class RowSelector
{
  /**
   * A selection of one row alone.
   * @param {number} index The row to select.
   * @returns {RowSelection} A run that starts and ends on that row.
   */
  static single(index: number): RowSelection
  {
    return {
      anchor: index,
      head: index,
    };
  }

  /**
   * The selection as it stands, given the row the board is showing now.
   * @param {RowSelection | null} selection The run last made in the list, or null when none has been made.
   * @param {number} selectedIndex The row the board is showing.
   * @returns {RowSelection} The run, when it still ends on the row the board shows, or that row alone.
   */
  static resolve(selection: RowSelection | null, selectedIndex: number): RowSelection
  {
    // fall back to the board's row alone when there is no run, or the board has left the run behind.
    if (selection === null || RowSelector.isLeftBehind(selection, selectedIndex))
    {
      return RowSelector.single(selectedIndex);
    }

    return selection;
  }

  /**
   * Determines whether the board has moved off the row a run ended on. A run left behind is gone for good: a
   * list forgets it rather than keeping it around, so the board coming back to that row later, say by the
   * arrow keys, finds that row alone selected rather than the whole run come back.
   * @param {RowSelection} selection The run last made in the list.
   * @param {number} selectedIndex The row the board is showing.
   * @returns {boolean} True when the board is showing any row other than the one the run ended on.
   */
  static isLeftBehind(selection: RowSelection, selectedIndex: number): boolean
  {
    return selection.head !== selectedIndex;
  }

  /**
   * Widens the selection to a Shift-clicked row: the run keeps the row it started from and now ends on the
   * row clicked, which becomes the row the board shows.
   * @param {RowSelection | null} selection The run last made in the list, or null when none has been made.
   * @param {number} selectedIndex The row the board is showing.
   * @param {number} index The row Shift-clicked.
   * @returns {RowSelection} The widened run.
   */
  static extend(selection: RowSelection | null, selectedIndex: number, index: number): RowSelection
  {
    // extend from where the current run started, or from the row the board shows when there is no run.
    const { anchor } = RowSelector.resolve(selection, selectedIndex);

    return {
      anchor,
      head: index,
    };
  }

  /**
   * The selection a right click leaves behind, before its menu opens. Right-clicking inside the run keeps it,
   * so the menu acts on every row selected; right-clicking any other row selects that row alone, so the menu
   * acts on the row under the cursor rather than on rows somewhere else.
   * @param {RowSelection | null} selection The run last made in the list, or null when none has been made.
   * @param {number} selectedIndex The row the board is showing.
   * @param {number} index The row right-clicked.
   * @returns {RowSelection} The selection the menu acts on.
   */
  static forContextMenu(selection: RowSelection | null, selectedIndex: number, index: number): RowSelection
  {
    // leave the run as it is when the right click lands inside it.
    const current = RowSelector.resolve(selection, selectedIndex);
    if (RowSelector.contains(current, index))
    {
      return current;
    }

    // select the row under the cursor anywhere else, since that is the row the menu is for.
    return RowSelector.single(index);
  }

  /**
   * Determines whether a row is inside a run.
   * @param {RowSelection} selection The run.
   * @param {number} index The row to look for.
   * @returns {boolean} True when the row lies between the run's two ends, either end included.
   */
  static contains(selection: RowSelection, index: number): boolean
  {
    return index >= RowSelector.first(selection) && index <= RowSelector.last(selection);
  }

  /**
   * The index of the topmost row in a run, which is where a paste starts.
   * @param {RowSelection} selection The run.
   * @returns {number} The lower of the run's two ends.
   */
  static first(selection: RowSelection): number
  {
    return Math.min(selection.anchor, selection.head);
  }

  /**
   * The index of the bottommost row in a run.
   * @param {RowSelection} selection The run.
   * @returns {number} The higher of the run's two ends.
   */
  static last(selection: RowSelection): number
  {
    return Math.max(selection.anchor, selection.head);
  }

  /**
   * The rows of a run that exist in a list, in list order, which are the rows a copy takes. A run reaching
   * past either end of the list- a list reloaded shorter underneath it, or one with no rows yet- only yields
   * the rows the list actually has.
   * @param {RowSelection} selection The run.
   * @param {number} rowCount How many rows the list holds.
   * @returns {number[]} The index of every selected row that exists, topmost first.
   */
  static indices(selection: RowSelection, rowCount: number): number[]
  {
    // clamp the run to the rows the list actually holds.
    const first = Math.max(0, RowSelector.first(selection));
    const last = Math.min(rowCount - 1, RowSelector.last(selection));

    // collect every row from the top of the run to the bottom.
    const indices: number[] = [];
    for (let index = first; index <= last; index++)
    {
      indices.push(index);
    }

    return indices;
  }
}

export type { RowSelection };
export { RowSelector };
