/**
 * A point in CSS pixels: on the screen, or in a window's page.
 */
type Point = {
  readonly x: number;
  readonly y: number;
};

/**
 * A size in CSS pixels.
 */
type Size = {
  readonly width: number;
  readonly height: number;
};

/**
 * A rectangle on the screen in CSS pixels: a window's bounds, or the part of the screen windows may use.
 */
type ScreenRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

/**
 * The smallest a torn-out window opens, however small its panel was while docked.
 */
const TORN_OUT_MIN_SIZE: Size = { width: 720, height: 540 };

/**
 * Where the pointer ends up in a window torn out by a drag, from the window's top left corner: over the new window's
 * first tab, the way a browser hands a dragged-off tab its new window.
 */
const GRAB_OFFSET: Point = { x: 48, y: 16 };

/**
 * How far off its panel's place a window torn out by a button opens, so it never lands exactly over the spot.
 */
const BESIDE_OFFSET = 32;

/**
 * Reports whether a drag was let go beyond the window it started in: past any edge of its page, over its frame,
 * another window or the desktop.
 * @param {Point} point Where it was let go, from the page's top left corner.
 * @param {Size} page The page's size.
 * @returns {boolean} True when the point lies outside the page.
 */
const releasedOutside = (point: Point, page: Size): boolean =>
{
  return point.x < 0 || point.y < 0 || point.x >= page.width || point.y >= page.height;
};

/**
 * Keeps a number within a range, the low end winning when the range is empty.
 * @param {number} value The number.
 * @param {number} low The smallest allowed.
 * @param {number} high The largest allowed.
 * @returns {number} The number, moved into the range.
 */
const clamp = (value: number, low: number, high: number): number =>
{
  return Math.max(low, Math.min(value, high));
};

/**
 * Sizes a torn-out window: the size its panel had while docked, never smaller than a torn-out window opens, and never
 * larger than the screen.
 * @param {Size} panel The panel's docked size.
 * @param {ScreenRect} screen The part of the screen windows may use.
 * @returns {Size} The window's size.
 */
const tornOutSize = (panel: Size, screen: ScreenRect): Size =>
{
  return {
    width: Math.round(Math.min(Math.max(panel.width, TORN_OUT_MIN_SIZE.width), screen.width)),
    height: Math.round(Math.min(Math.max(panel.height, TORN_OUT_MIN_SIZE.height), screen.height)),
  };
};

/**
 * Places a window as near a wanted top left corner as it can go while staying wholly on the screen.
 * @param {Point} corner Where its top left corner is wanted.
 * @param {Size} size Its size.
 * @param {ScreenRect} screen The part of the screen windows may use.
 * @returns {ScreenRect} Its bounds.
 */
const keepOnScreen = (corner: Point, size: Size, screen: ScreenRect): ScreenRect =>
{
  return {
    left: Math.round(clamp(corner.x, screen.left, screen.left + screen.width - size.width)),
    top: Math.round(clamp(corner.y, screen.top, screen.top + screen.height - size.height)),
    width: size.width,
    height: size.height,
  };
};

/**
 * Places the window a tab dragged out of its window lands in: where it was let go, with the pointer over the new
 * window's tab, sized from where its panel was docked and kept on the screen.
 * @param {Point} drop Where the drag was let go, on the screen.
 * @param {Size} panel The panel's docked size.
 * @param {ScreenRect} screen The part of the screen windows may use.
 * @returns {ScreenRect} The window's bounds.
 */
const windowAtDrop = (drop: Point, panel: Size, screen: ScreenRect): ScreenRect =>
{
  return keepOnScreen({ x: drop.x - GRAB_OFFSET.x, y: drop.y - GRAB_OFFSET.y }, tornOutSize(panel, screen), screen);
};

/**
 * Places the window a panel torn out by a button lands in: a little off where the panel was docked, sized from it and
 * kept on the screen.
 * @param {ScreenRect} docked Where the panel was docked, on the screen.
 * @param {ScreenRect} screen The part of the screen windows may use.
 * @returns {ScreenRect} The window's bounds.
 */
const windowBeside = (docked: ScreenRect, screen: ScreenRect): ScreenRect =>
{
  return keepOnScreen({ x: docked.left + BESIDE_OFFSET, y: docked.top + BESIDE_OFFSET }, tornOutSize(docked, screen), screen);
};

export { releasedOutside, TORN_OUT_MIN_SIZE, windowAtDrop, windowBeside };
export type { Point, ScreenRect, Size };
