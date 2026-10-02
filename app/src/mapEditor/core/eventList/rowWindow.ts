/**
 * The rows of a long list worth drawing: from the first, included, up to the last, left out.
 */
type RowSpan = {
  readonly start: number;
  readonly end: number;
};

/**
 * How many rows the list draws beyond those showing, above and below, so a quick scroll never shows a gap before the
 * next frame fills it.
 */
const OVERSCAN_ROWS = 8;

/**
 * How many rows the list draws before it knows how tall it is, as on its first frame: enough to fill any panel.
 */
const UNMEASURED_ROWS = 60;

/**
 * Works out which rows of a list its view shows, scrolled so far down: only those, and a few either side, are drawn, so
 * a map holding hundreds of events lists them as quickly as a map holding ten.
 * @param {number} scrollTop How far down the list is scrolled, in pixels.
 * @param {number} viewHeight How tall the part showing rows is, in pixels; 0 before it is measured.
 * @param {number} rowHeight How tall each row is, in pixels.
 * @param {number} count How many rows the list holds.
 * @returns {RowSpan} The rows to draw.
 */
const rowWindow = (scrollTop: number, viewHeight: number, rowHeight: number, count: number): RowSpan =>
{
  if (viewHeight <= 0)
  {
    return { start: 0, end: Math.min(count, UNMEASURED_ROWS) };
  }

  // a list cut short by a search can be scrolled past its new end for a moment, until the view catches up.
  const top = Math.max(0, scrollTop);
  const end = Math.min(count, Math.ceil((top + viewHeight) / rowHeight) + OVERSCAN_ROWS);
  const start = Math.max(0, Math.floor(top / rowHeight) - OVERSCAN_ROWS);
  return { start: Math.min(start, end), end };
};

/**
 * Works out how far to scroll a list for one of its rows to show whole: not at all when it already does, and otherwise
 * just far enough to show it at the nearer edge, as a list scrolls to an item picked elsewhere.
 * @param {number} index Where the row is in the list.
 * @param {number} rowHeight How tall each row is, in pixels.
 * @param {number} scrollTop How far down the list is scrolled now.
 * @param {number} viewHeight How tall the part showing rows is; 0 before it is measured.
 * @returns {number | null} The scroll that shows it, or null when it shows already or the view has no height yet.
 */
const scrollToShow = (index: number, rowHeight: number, scrollTop: number, viewHeight: number): number | null =>
{
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (viewHeight <= 0 || (top >= scrollTop && bottom <= scrollTop + viewHeight))
  {
    return null;
  }

  return top < scrollTop
    ? top
    : bottom - viewHeight;
};

export { OVERSCAN_ROWS, rowWindow, scrollToShow, UNMEASURED_ROWS };
export type { RowSpan };
