/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import DatabaseFilenames from '@core/enums/DatabaseFilenames.ts';
import { MuiSnackbarSeverity } from '@core/enums/MuiSnackbar.ts';
import { RowClipboard } from '@services/rows/RowClipboard.ts';
import { useRowClipboard } from '@presentation/hooks/useRowClipboard.ts';

/**
 * `useRowClipboard` is the only thing standing between a board's list and the clipboard, and what it routes
 * ends up written over rows on disk. It owes the boards four things. Ctrl+C and Ctrl+V act on the rows only
 * while the list has focus, so copying a formula out of a field, or pasting one into a field, never touches a
 * row. A paste reaches the board through the board's own edit path, so it saves like any other change. A
 * Shift click widens the selection, so several rows copy at once. And the menu's paste reports a refused
 * clipboard rather than pasting anything remembered from before, which could be stale.
 */
describe('useRowClipboard', () =>
{
  type Row = { id: number; name: string };

  let list: HTMLDivElement;
  let field: HTMLInputElement;
  let listWrapperRef: React.RefObject<HTMLDivElement | null>;

  beforeEach(() =>
  {
    // a focusable list, and a text field elsewhere on the page that can take focus away from it.
    list = document.createElement('div');
    list.tabIndex = 0;
    field = document.createElement('input');
    document.body.append(list, field);
    listWrapperRef = { current: list };
  });

  afterEach(() =>
  {
    list.remove();
    field.remove();
  });

  /**
   * Builds the rows of a small table, with ids counting up from 1 the way RMMZ numbers them.
   * @param {string[]} names The name of each row, in table order.
   * @returns {Row[]} The table's rows.
   */
  const tableOf = (names: string[]): Row[] => names.map((name, index) => ({ id: index + 1, name }));

  /**
   * Renders the hook over a table, with every callback a spy.
   * @param {Row[]} rows The board's rows.
   * @param {number} selectedIndex The row the board shows at first.
   * @returns The rendered hook, and the spies standing in for the board.
   */
  const renderOver = (rows: Row[], selectedIndex: number) =>
  {
    const onSelectIndex = vi.fn();
    const applyPaste = vi.fn();
    const notify = vi.fn();
    const rendered = renderHook(
      (props: { selectedIndex: number }) => useRowClipboard<Row, Row>({
        table: DatabaseFilenames.Items,
        selectedIndex: props.selectedIndex,
        onSelectIndex,
        listWrapperRef,
        getRows: () => rows,
        toRow: (row) => ({ ...row }),
        fromRow: (row) => ({ ...row }),
        applyPaste,
        notify,
      }),
      { initialProps: { selectedIndex } },
    );

    return { ...rendered, onSelectIndex, applyPaste, notify };
  };

  /**
   * Raises a clipboard event the way the browser does for Ctrl+C and Ctrl+V: on the focused element,
   * bubbling up to the page, carrying the clipboard's data.
   * @param {HTMLElement} target Where the event lands.
   * @param {'copy' | 'paste'} type Which shortcut raised it.
   * @param {string} text The text on the clipboard, for a paste.
   * @returns The event, and what was written to its clipboard data.
   */
  const raise = (target: HTMLElement, type: 'copy' | 'paste', text: string = '') =>
  {
    const written: string[] = [];
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        getData: () => text,
        setData: (_format: string, data: string) => written.push(data),
      },
    });
    act(() =>
    {
      target.dispatchEvent(event);
    });

    return { event, written };
  };

  /**
   * Stands in for the async clipboard the menu reads and writes.
   * @param {Partial<Clipboard>} clipboard The clipboard methods the test needs.
   */
  const stubClipboard = (clipboard: Partial<Clipboard>) =>
  {
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  };

  /**
   * A click as the list hands it on, carrying whether Shift was held.
   * @param {boolean} shiftKey Whether Shift was held.
   * @returns {React.MouseEvent} The click.
   */
  const clickWith = (shiftKey: boolean): React.MouseEvent => ({ shiftKey }) as React.MouseEvent;

  /**
   * A right click as the list hands it on, at a point on the screen.
   * @returns The right click, and a spy on whether the browser's own menu was held back.
   */
  const rightClick = () =>
  {
    const preventDefault = vi.fn();
    const event = { preventDefault, clientX: 40, clientY: 120 } as unknown as React.MouseEvent;
    return { event, preventDefault };
  };

  describe('the paste shortcut', () =>
  {
    it('pastes onto the selected row through the board\'s own edit path while the list has focus', () =>
    {
      // Arrange- a copied row with id 9, pasted onto the middle row, whose id is 2.
      const rows = tableOf([ 'Herb', 'Tonic', 'Salve' ]);
      const { applyPaste, notify } = renderOver(rows, 1);
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      list.focus();

      // Act
      const { event } = raise(list, 'paste', text);

      // Assert- the board's updater lands the copy under the row's own id, and the rest stay put.
      const [ [ update ] ] = applyPaste.mock.calls;
      expect(update(rows))
        .toEqual([ { id: 1, name: 'Herb' }, { id: 2, name: 'Potion' }, { id: 3, name: 'Salve' } ]);
      expect(notify)
        .toHaveBeenCalledWith('Pasted 1 row.', MuiSnackbarSeverity.Success);
      expect(event.defaultPrevented)
        .toBe(true);
    });

    it('leaves a paste alone while focus is in a field elsewhere on the page', () =>
    {
      // Arrange- the same paste as above, but the author is typing in a field.
      const { applyPaste, notify } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve' ]), 1);
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      field.focus();

      // Act
      const { event } = raise(field, 'paste', text);

      // Assert- nothing written, nothing said, and the field keeps its paste.
      expect(applyPaste)
        .not.toHaveBeenCalled();
      expect(notify)
        .not.toHaveBeenCalled();
      expect(event.defaultPrevented)
        .toBe(false);
    });

    it('still pastes onto the rows when the event lands on the page rather than on the list', () =>
    {
      // Arrange- a caret left in some field makes the browser aim the event there, though the list has focus.
      const { applyPaste } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      list.focus();

      // Act
      raise(document.body, 'paste', text);

      // Assert
      expect(applyPaste)
        .toHaveBeenCalledTimes(1);
    });

    it('refuses rows copied from another table, and names both tables', () =>
    {
      // Arrange- a skill, pasted onto an item.
      const { applyPaste, notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      const text = RowClipboard.copy(DatabaseFilenames.Skills, [ { id: 3, name: 'Fire' } ]);
      list.focus();

      // Act
      raise(list, 'paste', text);

      // Assert
      expect(applyPaste)
        .not.toHaveBeenCalled();
      expect(notify)
        .toHaveBeenCalledWith('Skills rows cannot be pasted into Items.', MuiSnackbarSeverity.Warning);
    });

    it('says there is nothing to paste when the clipboard holds other text', () =>
    {
      // Arrange
      const { applyPaste, notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      list.focus();

      // Act
      raise(list, 'paste', 'a.atk * 4');

      // Assert
      expect(applyPaste)
        .not.toHaveBeenCalled();
      expect(notify)
        .toHaveBeenCalledWith('There are no copied rows to paste.', MuiSnackbarSeverity.Warning);
    });

    it('asks for a row to paste onto when the list has none', () =>
    {
      // Arrange- a table that has not loaded yet.
      const { applyPaste, notify } = renderOver([], 0);
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      list.focus();

      // Act
      raise(list, 'paste', text);

      // Assert
      expect(applyPaste)
        .not.toHaveBeenCalled();
      expect(notify)
        .toHaveBeenCalledWith('Select a row to paste onto.', MuiSnackbarSeverity.Warning);
    });

    it('reports a paste cut short by the end of the list', () =>
    {
      // Arrange- three rows copied, pasted onto the second of three.
      const { notify } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve' ]), 1);
      const text = RowClipboard.copy(DatabaseFilenames.Items, tableOf([ 'Potion', 'Ether', 'Elixir' ]));
      list.focus();

      // Act
      raise(list, 'paste', text);

      // Assert
      expect(notify)
        .toHaveBeenCalledWith('Pasted 2 of 3 rows; the list ends there.', MuiSnackbarSeverity.Success);
    });
  });

  describe('the copy shortcut', () =>
  {
    it('puts the selected row on the clipboard, marked with its table, while the list has focus', () =>
    {
      // Arrange
      const { notify } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve' ]), 1);
      list.focus();

      // Act
      const { event, written } = raise(list, 'copy');

      // Assert- the middle row alone, under the Items marker, in place of whatever the browser would copy.
      expect(RowClipboard.read(written[ 0 ]))
        .toEqual({ format: 'jmz-data-editor/rows', table: 'Items.json', rows: [ { id: 2, name: 'Tonic' } ] });
      expect(event.defaultPrevented)
        .toBe(true);
      expect(notify)
        .toHaveBeenCalledWith('Copied 1 row.', MuiSnackbarSeverity.Success);
    });

    it('leaves a copy alone while focus is in a field elsewhere on the page', () =>
    {
      // Arrange
      const { notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      field.focus();

      // Act
      const { event, written } = raise(field, 'copy');

      // Assert- the field's own text is what gets copied.
      expect(written)
        .toEqual([]);
      expect(event.defaultPrevented)
        .toBe(false);
      expect(notify)
        .not.toHaveBeenCalled();
    });

    it('copies nothing from a list with no rows', () =>
    {
      // Arrange
      renderOver([], 0);
      list.focus();

      // Act
      const { event, written } = raise(list, 'copy');

      // Assert
      expect(written)
        .toEqual([]);
      expect(event.defaultPrevented)
        .toBe(false);
    });
  });

  describe('clicking rows', () =>
  {
    it('widens the selection into a run on a Shift click, and a copy takes the whole run', () =>
    {
      // Arrange- the board shows the first row, then the author Shift-clicks the third.
      const { result, rerender, onSelectIndex } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve', 'Balm' ]), 0);
      act(() =>
      {
        result.current.onRowClick(0, clickWith(false));
      });

      // Act
      act(() =>
      {
        result.current.onRowClick(2, clickWith(true));
      });
      rerender({ selectedIndex: 2 });

      // Assert- the board moves to the row clicked, and the run covers the first three rows, not the fourth.
      expect(onSelectIndex)
        .toHaveBeenLastCalledWith(2);
      expect([ 0, 1, 2, 3 ].map((index) => result.current.isSelected(index)))
        .toEqual([ true, true, true, false ]);
      list.focus();
      const { written } = raise(list, 'copy');
      expect(RowClipboard.read(written[ 0 ])?.rows.map((row) => row.id))
        .toEqual([ 1, 2, 3 ]);
    });

    it('starts over on the row clicked when Shift is not held', () =>
    {
      // Arrange- a run from the first row to the third.
      const { result, rerender } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve', 'Balm' ]), 0);
      act(() =>
      {
        result.current.onRowClick(2, clickWith(true));
      });
      rerender({ selectedIndex: 2 });

      // Act
      act(() =>
      {
        result.current.onRowClick(3, clickWith(false));
      });
      rerender({ selectedIndex: 3 });

      // Assert
      expect([ 0, 1, 2, 3 ].map((index) => result.current.isSelected(index)))
        .toEqual([ false, false, false, true ]);
    });

    it('puts keyboard focus on the list, so the shortcuts act on its rows', () =>
    {
      // Arrange- focus starts in a field.
      const { result } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      field.focus();

      // Act
      act(() =>
      {
        result.current.onRowClick(1, clickWith(false));
      });

      // Assert
      expect(document.activeElement)
        .toBe(list);
    });
  });

  describe('the right-click menu', () =>
  {
    it('selects a row outside the selection and opens the menu where the cursor is', () =>
    {
      // Arrange- the board shows the first row.
      const { result, onSelectIndex } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve' ]), 0);
      const { event, preventDefault } = rightClick();

      // Act
      act(() =>
      {
        result.current.onRowContextMenu(2, event);
      });

      // Assert
      expect(onSelectIndex)
        .toHaveBeenCalledWith(2);
      expect(result.current.menu.position)
        .toEqual({ top: 120, left: 40 });
      expect(preventDefault)
        .toHaveBeenCalled();
    });

    it('keeps the selection when the row right-clicked is already in it', () =>
    {
      // Arrange- a run from the first row to the third.
      const { result, rerender, onSelectIndex } = renderOver(tableOf([ 'Herb', 'Tonic', 'Salve' ]), 0);
      act(() =>
      {
        result.current.onRowClick(2, clickWith(true));
      });
      rerender({ selectedIndex: 2 });
      onSelectIndex.mockClear();

      // Act
      act(() =>
      {
        result.current.onRowContextMenu(1, rightClick().event);
      });

      // Assert- the board stays where it is, and the run is intact.
      expect(onSelectIndex)
        .not.toHaveBeenCalled();
      expect(result.current.isSelected(0))
        .toBe(true);
    });

    it('closes without doing anything', () =>
    {
      // Arrange- the menu is open.
      const { result, applyPaste } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);
      act(() =>
      {
        result.current.onRowContextMenu(0, rightClick().event);
      });

      // Act
      act(() =>
      {
        result.current.menu.onClose();
      });

      // Assert
      expect(result.current.menu.position)
        .toBeNull();
      expect(applyPaste)
        .not.toHaveBeenCalled();
    });

    it('copies the selected rows to the clipboard from the menu', async () =>
    {
      // Arrange
      const writeText = vi.fn(() => Promise.resolve());
      stubClipboard({ writeText });
      const { result, notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 1);

      // Act
      await act(async () =>
      {
        await result.current.menu.onCopy();
      });

      // Assert
      const [ [ text ] ] = writeText.mock.calls as unknown as [ [ string ] ];
      expect(RowClipboard.read(text)?.rows)
        .toEqual([ { id: 2, name: 'Tonic' } ]);
      expect(notify)
        .toHaveBeenCalledWith('Copied 1 row.', MuiSnackbarSeverity.Success);
    });

    it('says so when the clipboard will not take the copy', async () =>
    {
      // Arrange
      stubClipboard({ writeText: () => Promise.reject(new Error('denied')) });
      const { result, notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 1);

      // Act
      await act(async () =>
      {
        await result.current.menu.onCopy();
      });

      // Assert
      expect(notify)
        .toHaveBeenCalledWith('Could not copy those rows.', MuiSnackbarSeverity.Error);
    });

    it('copies nothing from the menu of a list with no rows', async () =>
    {
      // Arrange
      const writeText = vi.fn(() => Promise.resolve());
      stubClipboard({ writeText });
      const { result } = renderOver([], 0);

      // Act
      await act(async () =>
      {
        await result.current.menu.onCopy();
      });

      // Assert
      expect(writeText)
        .not.toHaveBeenCalled();
    });

    it('pastes what the clipboard holds from the menu', async () =>
    {
      // Arrange
      const text = RowClipboard.copy(DatabaseFilenames.Items, [ { id: 9, name: 'Potion' } ]);
      stubClipboard({ readText: () => Promise.resolve(text) });
      const rows = tableOf([ 'Herb', 'Tonic' ]);
      const { result, applyPaste } = renderOver(rows, 0);

      // Act
      await act(async () =>
      {
        await result.current.menu.onPaste();
      });

      // Assert
      const [ [ update ] ] = applyPaste.mock.calls;
      expect(update(rows))
        .toEqual([ { id: 1, name: 'Potion' }, { id: 2, name: 'Tonic' } ]);
    });

    it('pastes nothing and says why when the author has not allowed clipboard access', async () =>
    {
      // Arrange
      stubClipboard({ readText: () => Promise.reject(new Error('denied')) });
      const { result, applyPaste, notify } = renderOver(tableOf([ 'Herb', 'Tonic' ]), 0);

      // Act
      await act(async () =>
      {
        await result.current.menu.onPaste();
      });

      // Assert
      expect(applyPaste)
        .not.toHaveBeenCalled();
      expect(notify)
        .toHaveBeenCalledWith(
          'Pasting from the menu needs clipboard access. Ctrl+V works without it.',
          MuiSnackbarSeverity.Warning,
        );
    });
  });
});
