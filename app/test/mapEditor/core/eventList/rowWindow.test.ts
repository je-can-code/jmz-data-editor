import { describe, expect, it } from 'vitest';
import { OVERSCAN_ROWS, rowWindow, scrollToShow, UNMEASURED_ROWS } from '../../../../src/mapEditor/core/eventList/rowWindow.ts';

/*
 * The events list draws only the rows its view shows, so a map holding hundreds of events lists as quickly as one
 * holding ten: the rows under the view, and eight more either side so a quick scroll never shows a gap, never past
 * either end of the list. Before the view is measured, as on its first frame, it draws the first sixty, enough to fill
 * any panel. And a row picked elsewhere is scrolled to only when it does not already show whole, just far enough to show
 * it at the nearer edge.
 */
describe('rowWindow', () =>
{
  describe('rowWindow', () =>
  {
    it('draws the rows under the view and eight more either side', () =>
    {
      // Arrange: rows 26 pixels tall, a view 260 tall scrolled to row 100 of 600.
      const scrollTop = 100 * 26;

      // Act.
      const span = rowWindow(scrollTop, 260, 26, 600);

      // Assert: rows 100 to 109 show, so 92 to 117 are drawn.
      expect([ span, OVERSCAN_ROWS ])
        .toStrictEqual([ { start: 92, end: 118 }, 8 ]);
    });

    it('stops at the top and at the end of the list', () =>
    {
      // Arrange: a view at the very top of 600 rows, and one scrolled to the last rows of 30.
      const atTop = rowWindow(0, 260, 26, 600);

      // Act.
      const atEnd = rowWindow(20 * 26, 260, 26, 30);

      // Assert.
      expect([ atTop, atEnd ])
        .toStrictEqual([ { start: 0, end: 18 }, { start: 12, end: 30 } ]);
    });

    it('draws nothing past the end of a list a search just cut short, until the view catches up', () =>
    {
      // Arrange: scrolled to row 400, while the search left only 20 rows.
      const scrollTop = 400 * 26;

      // Act.
      const span = rowWindow(scrollTop, 260, 26, 20);

      // Assert.
      expect(span)
        .toStrictEqual({ start: 20, end: 20 });
    });

    it('draws the first sixty rows before the view is measured, or every row of a shorter list', () =>
    {
      // Arrange: a view with no height yet, over 600 rows and over 12.
      const counts = [ 600, 12 ];

      // Act.
      const spans = counts.map(count => rowWindow(500, 0, 26, count));

      // Assert.
      expect([ spans, UNMEASURED_ROWS ])
        .toStrictEqual([ [ { start: 0, end: 60 }, { start: 0, end: 12 } ], 60 ]);
    });
  });

  describe('scrollToShow', () =>
  {
    it('leaves a row showing whole where it is', () =>
    {
      // Arrange: a view 260 tall scrolled to 520, showing rows 20 to 29 whole.
      const rows = [ 20, 29 ];

      // Act.
      const scrolls = rows.map(index => scrollToShow(index, 26, 520, 260));

      // Assert.
      expect(scrolls)
        .toStrictEqual([ null, null ]);
    });

    it('scrolls a row above the view to its top, and one below to its bottom', () =>
    {
      // Arrange: the same view; row 19 is just above it, and row 30 just below.
      const rows = [ 19, 30, 200 ];

      // Act.
      const scrolls = rows.map(index => scrollToShow(index, 26, 520, 260));

      // Assert: row 19 at the top; rows 30 and 200 at the bottom.
      expect(scrolls)
        .toStrictEqual([ 494, 546, 4966 ]);
    });

    it('scrolls a row only partly showing until it shows whole', () =>
    {
      // Arrange: scrolled to 530, so row 20 is cut off at the top.
      const index = 20;

      // Act.
      const scroll = scrollToShow(index, 26, 530, 260);

      // Assert.
      expect(scroll)
        .toBe(520);
    });

    it('leaves the scroll alone before the view is measured', () =>
    {
      // Arrange: a view with no height yet.
      const viewHeight = 0;

      // Act.
      const scroll = scrollToShow(300, 26, 0, viewHeight);

      // Assert.
      expect(scroll)
        .toBeNull();
    });
  });
});
