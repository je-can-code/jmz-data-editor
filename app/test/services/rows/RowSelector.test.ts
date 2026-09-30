import { describe, expect, it } from 'vitest';
import { RowSelector } from '@services/rows/RowSelector.ts';

/**
 * A copy takes whichever rows are selected, and a paste starts at the topmost of them, so the selection
 * decides exactly which rows end up written over on disk. `RowSelector` owes the boards three things. A Shift
 * click selects a run from where the author started to where they clicked, in either direction. A run only
 * lasts while the board still shows the row it ended on: once the author moves on by the search box or the
 * arrow keys, the run is gone, so a copy can never take rows they are no longer looking at. And a copy only
 * ever takes rows the list actually has, even when the list was reloaded shorter underneath the run.
 */
describe('RowSelector', () =>
{
  describe('single', () =>
  {
    it('selects the one row, as a run that starts and ends on it', () =>
    {
      // Arrange- nothing to set up; a single row needs only its index.

      // Act
      const selection = RowSelector.single(4);

      // Assert
      expect(selection)
        .toEqual({ anchor: 4, head: 4 });
    });
  });

  describe('resolve', () =>
  {
    it('keeps a run that still ends on the row the board shows', () =>
    {
      // Arrange- a run from row 2 down to row 5, with the board showing row 5.
      const selection = { anchor: 2, head: 5 };

      // Act
      const resolved = RowSelector.resolve(selection, 5);

      // Assert
      expect(resolved)
        .toBe(selection);
    });

    it('collapses a run onto the board\'s row once the board has moved elsewhere', () =>
    {
      // Arrange- the same run, but the search box has since jumped the board to row 9.
      const selection = { anchor: 2, head: 5 };

      // Act
      const resolved = RowSelector.resolve(selection, 9);

      // Assert
      expect(resolved)
        .toEqual({ anchor: 9, head: 9 });
    });

    it('selects the board\'s row alone when no run has been made', () =>
    {
      // Arrange- nothing Shift-clicked yet.
      const selection = null;

      // Act
      const resolved = RowSelector.resolve(selection, 3);

      // Assert
      expect(resolved)
        .toEqual({ anchor: 3, head: 3 });
    });
  });

  describe('extend', () =>
  {
    it('widens a run from the row it started on to the row Shift-clicked', () =>
    {
      // Arrange- a run from 2 to 5, still showing 5.
      const selection = { anchor: 2, head: 5 };

      // Act
      const extended = RowSelector.extend(selection, 5, 8);

      // Assert- still anchored at 2, now ending on 8.
      expect(extended)
        .toEqual({ anchor: 2, head: 8 });
    });

    it('extends from the row the board shows when no run has been made', () =>
    {
      // Arrange- the board shows row 6 and nothing has been Shift-clicked.
      const selection = null;

      // Act
      const extended = RowSelector.extend(selection, 6, 3);

      // Assert- a run upward from 6 to 3.
      expect(extended)
        .toEqual({ anchor: 6, head: 3 });
    });

    it('extends from the row the board shows, not from a run it has moved away from', () =>
    {
      // Arrange- a run from 2 to 5 was left behind when the arrow keys moved the board to row 7.
      const selection = { anchor: 2, head: 5 };

      // Act
      const extended = RowSelector.extend(selection, 7, 9);

      // Assert- anchored at 7, where the author actually is.
      expect(extended)
        .toEqual({ anchor: 7, head: 9 });
    });
  });

  describe('forContextMenu', () =>
  {
    it('keeps the run when the row right-clicked is inside it', () =>
    {
      // Arrange- a run from 2 to 5, right-clicked on row 3.
      const selection = { anchor: 2, head: 5 };

      // Act
      const chosen = RowSelector.forContextMenu(selection, 5, 3);

      // Assert
      expect(chosen)
        .toBe(selection);
    });

    it('selects the row right-clicked alone when it is outside the run', () =>
    {
      // Arrange- the same run, right-clicked on row 6, just past its end.
      const selection = { anchor: 2, head: 5 };

      // Act
      const chosen = RowSelector.forContextMenu(selection, 5, 6);

      // Assert
      expect(chosen)
        .toEqual({ anchor: 6, head: 6 });
    });

    it('judges the right click against the board\'s row when the run has been left behind', () =>
    {
      // Arrange- a run from 2 to 5 left behind for row 9; row 3 was inside that run, but is not selected now.
      const selection = { anchor: 2, head: 5 };

      // Act
      const chosen = RowSelector.forContextMenu(selection, 9, 3);

      // Assert
      expect(chosen)
        .toEqual({ anchor: 3, head: 3 });
    });
  });

  describe('contains', () =>
  {
    it('counts both ends of the run as inside it', () =>
    {
      // Arrange
      const selection = { anchor: 2, head: 5 };

      // Act
      const containsFirst = RowSelector.contains(selection, 2);
      const containsLast = RowSelector.contains(selection, 5);

      // Assert
      expect(containsFirst)
        .toBe(true);
      expect(containsLast)
        .toBe(true);
    });

    it('counts the rows just outside either end as outside it', () =>
    {
      // Arrange
      const selection = { anchor: 2, head: 5 };

      // Act
      const containsBefore = RowSelector.contains(selection, 1);
      const containsAfter = RowSelector.contains(selection, 6);

      // Assert
      expect(containsBefore)
        .toBe(false);
      expect(containsAfter)
        .toBe(false);
    });

    it('reads a run made upward the same as one made downward', () =>
    {
      // Arrange- Shift-clicked from 5 up to 2.
      const selection = { anchor: 5, head: 2 };

      // Act
      const containsMiddle = RowSelector.contains(selection, 3);
      const containsAfter = RowSelector.contains(selection, 6);

      // Assert
      expect(containsMiddle)
        .toBe(true);
      expect(containsAfter)
        .toBe(false);
    });
  });

  describe('first', () =>
  {
    it('is the topmost row of the run, whichever end that is', () =>
    {
      // Arrange- one run made downward, one upward.
      const downward = { anchor: 2, head: 5 };
      const upward = { anchor: 5, head: 2 };

      // Act
      const firstDownward = RowSelector.first(downward);
      const firstUpward = RowSelector.first(upward);

      // Assert
      expect(firstDownward)
        .toBe(2);
      expect(firstUpward)
        .toBe(2);
    });
  });

  describe('last', () =>
  {
    it('is the bottommost row of the run, whichever end that is', () =>
    {
      // Arrange
      const downward = { anchor: 2, head: 5 };
      const upward = { anchor: 5, head: 2 };

      // Act
      const lastDownward = RowSelector.last(downward);
      const lastUpward = RowSelector.last(upward);

      // Assert
      expect(lastDownward)
        .toBe(5);
      expect(lastUpward)
        .toBe(5);
    });
  });

  describe('indices', () =>
  {
    it('lists every row of the run, topmost first', () =>
    {
      // Arrange- a run made upward, from 5 to 2, in a list of ten.
      const selection = { anchor: 5, head: 2 };

      // Act
      const indices = RowSelector.indices(selection, 10);

      // Assert
      expect(indices)
        .toEqual([ 2, 3, 4, 5 ]);
    });

    it('lists the one row of a single selection', () =>
    {
      // Arrange
      const selection = { anchor: 4, head: 4 };

      // Act
      const indices = RowSelector.indices(selection, 10);

      // Assert
      expect(indices)
        .toEqual([ 4 ]);
    });

    it('leaves out the rows of a run that reach past the end of the list', () =>
    {
      // Arrange- a run from 2 to 5, but the list was reloaded and now holds only four rows.
      const selection = { anchor: 2, head: 5 };

      // Act
      const indices = RowSelector.indices(selection, 4);

      // Assert
      expect(indices)
        .toEqual([ 2, 3 ]);
    });

    it('leaves out the rows of a run that reach before the start of the list', () =>
    {
      // Arrange- a run whose top end lies before the first row.
      const selection = { anchor: -2, head: 1 };

      // Act
      const indices = RowSelector.indices(selection, 4);

      // Assert
      expect(indices)
        .toEqual([ 0, 1 ]);
    });

    it('lists nothing for a list with no rows', () =>
    {
      // Arrange- a board whose table has not loaded, still pointing at row 0.
      const selection = { anchor: 0, head: 0 };

      // Act
      const indices = RowSelector.indices(selection, 0);

      // Assert
      expect(indices)
        .toEqual([]);
    });
  });
});
