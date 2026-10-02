import React, { useEffect, useRef, useState } from 'react';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { MuiSnackbarSeverity } from '@core/enums/MuiSnackbar.ts';
import { pageWindowShell } from '@core/infrastructure/shell/WindowShell.ts';
import {
  type DatabaseRow,
  type RowPastePlan,
  type RowPasteWrite,
  ROW_CLIPBOARD_FORMAT,
  RowClipboard,
} from '@services/rows/RowClipboard.ts';
import { RowClear } from '@services/rows/RowClear.ts';
import { type RowSelection, RowSelector } from '@services/rows/RowSelector.ts';
import type {
  RowClipboardMenuPosition,
  RowClipboardMenuProps,
} from '@presentation/components/board/RowClipboardMenu.tsx';

/**
 * What a database board tells {@link useRowClipboard} about its rows and how it edits them.
 */
type RowClipboardOptions<TModel extends DatabaseRow, TRow extends DatabaseRow> = {
  /**
   * The table the board lists, written into every copy and checked on every paste.
   */
  table: DatabaseFilenames;

  /**
   * The row the board has selected and is showing.
   */
  selectedIndex: number;

  /**
   * Selects a row the way a plain click on the board's list does.
   */
  onSelectIndex: (index: number) => void;

  /**
   * The focusable element around the board's list. Ctrl+C and Ctrl+V act on the rows only while it has focus.
   */
  listWrapperRef: React.RefObject<HTMLDivElement | null>;

  /**
   * The board's rows as they stand right now, including any edit the board has not yet written into them.
   */
  getRows: () => TModel[];

  /**
   * A board row exactly as its table writes it to disk.
   */
  toRow: (model: TModel) => TRow;

  /**
   * Builds a board row out of a row as its table writes it to disk.
   */
  fromRow: (row: TRow) => TModel;

  /**
   * The table's blank row, exactly as RPG Maker MZ's own database writes a brand-new row of it. A Clear
   * resets the selected rows to this, apart from the id each one keeps.
   */
  blankRow: TRow;

  /**
   * Hands a paste- or a clear, which writes the same way- to the board as an edit like any other, as an
   * updater run against its rows.
   */
  applyPaste: (update: (rows: TModel[]) => TModel[]) => void;

  /**
   * Tells the author how a copy or a paste went.
   */
  notify: (message: string, severity: MuiSnackbarSeverity) => void;

  /**
   * Reads the clipboard for the menu's paste, which has no clipboard event to carry it, asking for the clipboard the
   * given marker names; null when it could not be read. Left out, the page's window shell reads it, through the
   * NW.js shell where the page's own read would wait forever.
   */
  readClipboard?: (marker: string) => Promise<string | null>;
};

/**
 * Reads the clipboard through the page's window shell.
 * @param {string} marker The marker the wanted clipboard carries.
 * @returns {Promise<string | null>} The text, or null when it could not be read.
 */
const readThroughShell = (marker: string): Promise<string | null> =>
{
  return pageWindowShell().readClipboard(marker);
};

/**
 * What a board's list needs from {@link useRowClipboard} to offer copy and paste.
 */
type RowClipboardHandle = {
  /**
   * Determines whether a row is part of the selection, so the list can highlight it.
   */
  isSelected: (index: number) => boolean;

  /**
   * Selects a clicked row, widening the selection into a run when Shift is held.
   */
  onRowClick: (index: number, event: React.MouseEvent) => void;

  /**
   * Opens the copy and paste menu on a right-clicked row.
   */
  onRowContextMenu: (index: number, event: React.MouseEvent) => void;

  /**
   * Clears the selection when the list sees the Del key, the way {@link menu}'s Clear item does from the
   * mouse. Every other key is left alone, for the board's own key handling to see.
   */
  onListKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;

  /**
   * Everything the list's {@link RowClipboardMenu} needs.
   */
  menu: RowClipboardMenuProps;

  /**
   * Changes every time a paste writes over the row the board is showing. A pasted row keeps its id, so a
   * board keys the row's editors on this alongside the id: anything they hold for the row, like formulas
   * typed but not yet applied, then starts over rather than outliving the content it was typed against.
   */
  pasteRevision: number;
};

/**
 * The rows a copy takes, as clipboard text, and how many there are.
 */
type RowCopy = {
  text: string;
  count: number;
};

/**
 * Names a table the way the editor's navigation does: Skills, Items, Enemies.
 * @param {string} table The table's file name.
 * @returns {string} The table's name without its extension.
 */
const tableLabel = (table: string): string =>
{
  return table.replace(/\.json$/i, '');
};

/**
 * Counts rows in a sentence.
 * @param {number} count How many rows.
 * @returns {string} The count, with "row" or "rows" after it.
 */
const rowCountLabel = (count: number): string =>
{
  return `${count} ${count === 1 ? 'row' : 'rows'}`;
};

/**
 * Reports a paste that went ahead, including any rows left out at the end of the list.
 * @param {RowPasteWrite} plan The paste that was made.
 * @returns {string} The outcome, for the author.
 */
const describePaste = (plan: RowPasteWrite): string =>
{
  // report a plain count when every copied row found a row to land on.
  if (plan.droppedCount === 0)
  {
    return `Pasted ${rowCountLabel(plan.rows.length)}.`;
  }

  // otherwise say how many ran off the end of the list, which a paste never grows.
  const copiedCount = plan.rows.length + plan.droppedCount;
  return `Pasted ${plan.rows.length} of ${copiedCount} rows; the list ends there.`;
};

/**
 * Explains a paste that was refused.
 * @param {Exclude<RowPastePlan, RowPasteWrite>} plan The refused paste.
 * @param {DatabaseFilenames} table The table the author was pasting into.
 * @returns {string} Why nothing was pasted, for the author.
 */
const describeRefusal = (plan: Exclude<RowPastePlan, RowPasteWrite>, table: DatabaseFilenames): string =>
{
  switch (plan.outcome)
  {
    case 'other-table':
      return `${tableLabel(plan.table)} rows cannot be pasted into ${tableLabel(table)}.`;
    case 'no-target':
      return 'Select a row to paste onto.';
    case 'not-rows':
      return 'There are no copied rows to paste.';
  }
};

/**
 * Whole-row copy, paste and clear for a database board's list, the way RPG Maker MZ's database does it:
 * Shift-click a run of rows, copy them with Ctrl+C or the right-click menu, select where they should go,
 * and paste them with Ctrl+V or the menu- or reset them to the table's blank row with the Del key or the
 * menu's Clear item. The rows travel on the system clipboard, so a paste works between two editor windows
 * as well as inside one.
 *
 * The shortcuts ride the browser's own copy and paste events, which reach a focused list without any
 * permission prompt. The menu items have no such event to ride, so they use the async clipboard; reading it
 * asks the author for permission the first time, and when that is refused the menu says so and the paste is
 * dropped rather than falling back to anything remembered here, which could be stale. The Del key rides no
 * such browser event- it is ordinary key handling on the list itself, so it needs no such permission.
 *
 * What a paste writes is decided by {@link RowClipboard}, what a clear writes by {@link RowClear}, and
 * which rows are selected by {@link RowSelector}; this hook only routes the list's clicks, keys and menu to
 * them, and hands the result to the board.
 * @param {RowClipboardOptions<TModel, TRow>} options The board's table, selection, rows and edit path.
 * @returns {RowClipboardHandle} What the board's list needs to offer copy, paste and clear.
 */
const useRowClipboard = <TModel extends DatabaseRow, TRow extends DatabaseRow>(
  options: RowClipboardOptions<TModel, TRow>,
): RowClipboardHandle =>
{
  const {
    table,
    selectedIndex,
    onSelectIndex,
    listWrapperRef,
    getRows,
    toRow,
    fromRow,
    blankRow,
    applyPaste,
    notify,
    readClipboard = readThroughShell,
  } = options;

  const [ selection, setSelection ] = useState<RowSelection | null>(null);
  const [ menuPosition, setMenuPosition ] = useState<RowClipboardMenuPosition | null>(null);
  const [ pasteRevision, setPasteRevision ] = useState(0);

  // the row the board showed when this last drew, so a move can be told apart from a board still catching up
  // to the row just clicked.
  const [ trackedIndex, setTrackedIndex ] = useState(selectedIndex);

  // forget a run once the board moves off the row it ended on, so coming back to that row later finds it alone
  // selected rather than the whole run back again. adjust it while drawing, which is safe because the tracked
  // row matches on the very next pass and the check cannot fire twice.
  if (selectedIndex !== trackedIndex)
  {
    setTrackedIndex(selectedIndex);
    if (selection !== null && RowSelector.isLeftBehind(selection, selectedIndex))
    {
      setSelection(null);
    }
  }

  // resolve the run against the row the board is showing right now.
  const activeSelection = RowSelector.resolve(selection, selectedIndex);

  /**
   * Builds the clipboard text for the selected rows.
   * @returns {RowCopy} The text and how many rows it holds; no rows when the list has none to copy.
   */
  const buildCopy = (): RowCopy =>
  {
    // take the selected rows that exist, as their table writes them to disk.
    const rows = getRows();
    const indices = RowSelector.indices(activeSelection, rows.length);
    const copied = indices.map((index) => toRow(rows[ index ]));

    return {
      text: RowClipboard.copy(table, copied),
      count: copied.length,
    };
  };

  /**
   * Pastes clipboard text onto the selection, starting at its topmost row, and reports how it went.
   * @param {string} text The text on the clipboard.
   */
  const paste = (text: string): void =>
  {
    // decide what the paste writes before writing any of it.
    const rows = getRows();
    const plan = RowClipboard.plan(text, table, rows.length, RowSelector.first(activeSelection));
    if (plan.outcome !== 'paste')
    {
      notify(describeRefusal(plan, table), MuiSnackbarSeverity.Warning);
      return;
    }

    // write it the way the board writes any other edit.
    applyPaste((current) => RowClipboard.apply(current, plan, fromRow));
    notify(describePaste(plan), MuiSnackbarSeverity.Success);

    // start the shown row's editors over when the paste lands on it, since the row keeps its id through it.
    if (RowClipboard.writesOver(plan, selectedIndex))
    {
      setPasteRevision((revision) => revision + 1);
    }
  };

  /**
   * Resets the selection to the table's blank row, keeping each row's own id, and reports how many rows
   * were reset.
   */
  const handleClear = (): void =>
  {
    // there is nothing to clear when the run has no row left in it, such as an empty list.
    const rows = getRows();
    const indices = RowSelector.indices(activeSelection, rows.length);
    if (indices.length === 0)
    {
      notify('Select a row to clear.', MuiSnackbarSeverity.Warning);
      return;
    }

    // write it the way the board writes any other edit.
    applyPaste((current) => RowClear.apply(current, indices, blankRow, fromRow));
    notify(`Cleared ${rowCountLabel(indices.length)}.`, MuiSnackbarSeverity.Success);

    // the shown row always lies inside its own run, so its editors start over the same way a paste does.
    setPasteRevision((revision) => revision + 1);
  };

  /**
   * Determines whether keyboard focus is on this board's list.
   * @returns {boolean} True when the list, or something inside it, has focus.
   */
  const isListFocused = (): boolean =>
  {
    const list = listWrapperRef.current;
    return list !== null && list.contains(document.activeElement);
  };

  /**
   * Answers the browser's copy event, which Ctrl+C raises, by putting the selected rows on the clipboard.
   * @param {ClipboardEvent} event The copy event.
   */
  const handleCopyEvent = (event: ClipboardEvent): void =>
  {
    // leave a copy made anywhere else on the page to whatever has focus there.
    if (isListFocused() === false || event.clipboardData === null)
    {
      return;
    }

    // copy nothing from an empty list.
    const copy = buildCopy();
    if (copy.count === 0)
    {
      return;
    }

    // replace what the browser would have copied with the rows.
    event.clipboardData.setData('text/plain', copy.text);
    event.preventDefault();
    notify(`Copied ${rowCountLabel(copy.count)}.`, MuiSnackbarSeverity.Success);
  };

  /**
   * Answers the browser's paste event, which Ctrl+V raises, by pasting the clipboard onto the selection.
   * @param {ClipboardEvent} event The paste event.
   */
  const handlePasteEvent = (event: ClipboardEvent): void =>
  {
    // leave a paste made anywhere else on the page to whatever has focus there.
    if (isListFocused() === false || event.clipboardData === null)
    {
      return;
    }

    // keep the browser from handling the paste itself, since the list is not a text box.
    event.preventDefault();
    paste(event.clipboardData.getData('text/plain'));
  };

  // keep the newest handlers where the page-wide listeners and the menu's async continuations can reach
  // them, so neither ever acts on a selection or a list from an earlier draw.
  const latestRef = useRef({ handleCopyEvent, handlePasteEvent, paste });
  latestRef.current = { handleCopyEvent, handlePasteEvent, paste };

  useEffect(() =>
  {
    // listen page-wide and let the handlers check where focus is, because the events land on the page rather
    // than on the list whenever a text box elsewhere still holds a caret.
    const onCopy = (event: ClipboardEvent) => latestRef.current.handleCopyEvent(event);
    const onPaste = (event: ClipboardEvent) => latestRef.current.handlePasteEvent(event);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);

    return () =>
    {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  /**
   * Copies the selected rows from the menu, through the async clipboard.
   */
  const handleMenuCopy = async (): Promise<void> =>
  {
    setMenuPosition(null);

    // copy nothing from an empty list.
    const copy = buildCopy();
    if (copy.count === 0)
    {
      return;
    }

    try
    {
      await navigator.clipboard.writeText(copy.text);
      notify(`Copied ${rowCountLabel(copy.count)}.`, MuiSnackbarSeverity.Success);
    }
    catch
    {
      notify('Could not copy those rows.', MuiSnackbarSeverity.Error);
    }
  };

  /**
   * Pastes onto the selected rows from the menu, reading the row clipboard through the window shell: under NW.js the
   * shell reads it, handing over copied rows and nothing else; in a browser the page reads it, which asks the author's
   * permission the first time and can be refused.
   */
  const handleMenuPaste = async (): Promise<void> =>
  {
    setMenuPosition(null);
    const text = await readClipboard(ROW_CLIPBOARD_FORMAT);
    if (text === null)
    {
      notify('Pasting from the menu needs clipboard access. Ctrl+V works without it.', MuiSnackbarSeverity.Warning);
      return;
    }

    // paste against the board as it stands now, not as it stood when the menu was opened.
    latestRef.current.paste(text);
  };

  /**
   * Clears the selected rows from the menu.
   */
  const handleMenuClear = (): void =>
  {
    setMenuPosition(null);
    handleClear();
  };

  /**
   * Clears the selection when the Del key reaches the list. Every other key is left alone, so the board's
   * own key handling- arrow-key navigation, say- still sees it.
   * @param {React.KeyboardEvent<HTMLDivElement>} event The key event from the list.
   */
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void =>
  {
    if (event.key !== 'Delete')
    {
      return;
    }

    event.preventDefault();
    handleClear();
  };

  /**
   * Selects a clicked row, widening the selection into a run when Shift is held.
   * @param {number} index The row clicked.
   * @param {React.MouseEvent} event The click, carrying which modifier keys were held.
   */
  const handleRowClick = (index: number, event: React.MouseEvent): void =>
  {
    // widen the run on a Shift click, and start over on the row clicked otherwise.
    const next = event.shiftKey
      ? RowSelector.extend(selection, selectedIndex, index)
      : RowSelector.single(index);
    setSelection(next);
    onSelectIndex(index);

    // keep keyboard focus on the list, so Ctrl+C and Ctrl+V act on its rows.
    listWrapperRef.current?.focus();
  };

  /**
   * Opens the copy and paste menu on a right-clicked row, selecting it first unless it is already selected.
   * @param {number} index The row right-clicked.
   * @param {React.MouseEvent} event The right click, carrying where the menu should open.
   */
  const handleRowContextMenu = (index: number, event: React.MouseEvent): void =>
  {
    // replace the browser's own menu with this one.
    event.preventDefault();

    // move the selection to the row under the cursor when the right click lands outside it.
    const next = RowSelector.forContextMenu(selection, selectedIndex, index);
    setSelection(next);
    if (next.head !== selectedIndex)
    {
      onSelectIndex(next.head);
    }

    // focus the list, so it gets focus back when the menu closes and the shortcuts keep working.
    listWrapperRef.current?.focus();
    setMenuPosition({
      top: event.clientY,
      left: event.clientX,
    });
  };

  return {
    isSelected: (index: number) => RowSelector.contains(activeSelection, index),
    onRowClick: handleRowClick,
    onRowContextMenu: handleRowContextMenu,
    onListKeyDown: handleListKeyDown,
    menu: {
      position: menuPosition,
      onCopy: handleMenuCopy,
      onPaste: handleMenuPaste,
      onClear: handleMenuClear,
      onClose: () => setMenuPosition(null),
    },
    pasteRevision,
  };
};

export { useRowClipboard };
export type { RowClipboardHandle, RowClipboardOptions };
