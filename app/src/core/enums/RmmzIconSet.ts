/**
 * Vanilla MZ {@code IconSet} grid: each cell is this many pixels in the source bitmap.
 */
const RMMZ_ICON_SET_CELL_PX = 32;

/**
 * @param imageWidth Natural width of {@code IconSet.png}.
 * @param imageHeight Natural height of {@code IconSet.png}.
 * @param cellPx Source pixels per icon (default MZ {@link RMMZ_ICON_SET_CELL_PX}).
 * @returns Horizontal and vertical icon counts (floored).
 */
function iconGridDimensions(
  imageWidth: number,
  imageHeight: number,
  cellPx: number = RMMZ_ICON_SET_CELL_PX
): { cols: number; rows: number }
{
  if (
    !Number.isFinite(imageWidth)
    || !Number.isFinite(imageHeight)
    || imageWidth <= 0
    || imageHeight <= 0
    || cellPx <= 0
  )
  {
    return {
      cols: 0,
      rows: 0,
    };
  }
  const cols = Math.floor(imageWidth / cellPx);
  const rows = Math.floor(imageHeight / cellPx);
  return {
    cols,
    rows,
  };
}

/**
 * @param cols Grid width in icons.
 * @param rows Grid height in icons.
 * @returns Total icon slots ({@code cols * rows}).
 */
function iconSlotCount(
  cols: number,
  rows: number
): number
{
  if (cols <= 0 || rows <= 0)
  {
    return 0;
  }
  return cols * rows;
}

export {
  RMMZ_ICON_SET_CELL_PX,
  iconGridDimensions,
  iconSlotCount,
};
