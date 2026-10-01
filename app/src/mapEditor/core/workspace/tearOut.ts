import { isJsonObject, type JsonObject } from '../model/json.ts';

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

/**
 * Where a panel torn out of the main window came from: the group it left, its place among that group's tabs, and the
 * panels beside it there. Closing its window puts it back in that group at that place; should the group have gone by
 * then, it joins whichever group now holds the panels it sat beside.
 */
type PanelOrigin = {
  readonly groupId: string;
  readonly index: number | null;
  readonly siblings: readonly string[];
};

/**
 * One group of the dock, as the rules for putting panels back see it.
 */
type DockGroupState = {
  readonly id: string;
  readonly inMainWindow: boolean;
  readonly panelIds: readonly string[];
};

/**
 * A panel on its way back into the main window, from a window that closed or by being put back.
 */
type ReturningPanel = {
  readonly id: string;
  readonly isMap: boolean;
  readonly origin: PanelOrigin | undefined;
};

/**
 * Where one returning panel goes: into a group as a tab, at a place among its tabs, or last for null.
 */
type ReturnPlace = {
  readonly groupId: string;
  readonly index: number | null;
};

/**
 * Records where a panel sits in a group, as its origin should it be torn out.
 * @param {DockGroupState} group The group holding it.
 * @param {string} panelId The panel.
 * @returns {PanelOrigin} Its origin.
 */
const originIn = (group: DockGroupState, panelId: string): PanelOrigin =>
{
  return {
    groupId: group.id,
    index: Math.max(0, group.panelIds.indexOf(panelId)),
    siblings: group.panelIds.filter(id => id !== panelId),
  };
};

/**
 * Plans where panels coming back into the main window go, so none is left wherever the dock happened to drop it:
 * - a torn-out panel goes back into the group it left, at its old place among the tabs;
 * - if that group has gone, into the group now holding a panel it sat beside, one not itself on its way back;
 * - a map with neither (one opened straight into a torn-out window) joins the maps: the group the workspace opens maps
 *   into, or else wherever another returning map is going;
 * - anything else keeps the place the dock gave it, and has no entry.
 * @param {readonly ReturningPanel[]} returning The panels coming back.
 * @param {readonly DockGroupState[]} groups Every group, wherever it is.
 * @param {string | null} mapsGroupId The group maps open into, among those not wholly on their way back, or null.
 * @returns {Map<string, ReturnPlace>} Where each panel goes, by panel id.
 */
const planReturns = (returning: readonly ReturningPanel[], groups: readonly DockGroupState[], mapsGroupId: string | null): Map<string, ReturnPlace> =>
{
  const coming = new Set(returning.map(panel => panel.id));
  const home = groups.filter(group => group.inMainWindow);

  // a group counts as settled while it holds anything that is not on its way back.
  const settled = home.filter(group => group.panelIds.some(id => coming.has(id) === false));
  const places = new Map<string, ReturnPlace>();
  returning.forEach(panel =>
  {
    const { origin } = panel;
    if (origin === undefined)
    {
      return;
    }

    if (home.some(group => group.id === origin.groupId))
    {
      places.set(panel.id, { groupId: origin.groupId, index: origin.index });
      return;
    }

    const beside = settled.find(group => group.panelIds.some(id => origin.siblings.includes(id)));
    if (beside !== undefined)
    {
      places.set(panel.id, { groupId: beside.id, index: null });
    }
  });

  // maps with nowhere of their own go among the maps, or else along with a map that has somewhere to go.
  const placedMap = returning
    .map(panel => (panel.isMap ? places.get(panel.id) : undefined))
    .find(place => place !== undefined);
  const mapsHome = mapsGroupId ?? placedMap?.groupId ?? null;
  if (mapsHome !== null)
  {
    returning
      .filter(panel => panel.isMap && places.has(panel.id) === false)
      .forEach(panel => places.set(panel.id, { groupId: mapsHome, index: null }));
  }

  return places;
};

/**
 * The key a saved layout keeps torn-out panels' origins under, beside the dock's own keys. The dock reads only the keys
 * it knows, so this one rides along untouched.
 */
const TORN_OUT_KEY = 'tornOut';

/**
 * Reads one saved origin, refusing anything that does not read as one.
 * @param {unknown} value The saved value.
 * @returns {PanelOrigin | null} The origin, or null.
 */
const readOrigin = (value: unknown): PanelOrigin | null =>
{
  if (isJsonObject(value) === false || typeof value['groupId'] !== 'string')
  {
    return null;
  }

  const { groupId, index, siblings } = value;
  return {
    groupId,
    index: typeof index === 'number' && Number.isInteger(index) && index >= 0 ? index : null,
    siblings: Array.isArray(siblings) ? siblings.filter((id): id is string => typeof id === 'string') : [],
  };
};

/**
 * Reads the origins a saved layout keeps for its torn-out panels, skipping any entry that does not read as one.
 * @param {JsonObject} saved The saved layout.
 * @returns {Map<string, PanelOrigin>} The origins, by panel id.
 */
const readOrigins = (saved: JsonObject): Map<string, PanelOrigin> =>
{
  const kept = saved[TORN_OUT_KEY];
  const origins = new Map<string, PanelOrigin>();
  if (isJsonObject(kept))
  {
    Object.entries(kept).forEach(([ panelId, value ]) =>
    {
      const origin = readOrigin(value);
      if (origin !== null)
      {
        origins.set(panelId, origin);
      }
    });
  }

  return origins;
};

/**
 * Adds the torn-out panels' origins to a layout about to be saved, so a torn-out window brought back with the layout
 * still returns its panels home when it closes.
 * @param {JsonObject} layout The layout, as the dock serializes it.
 * @param {ReadonlyMap<string, PanelOrigin>} origins The origins, by panel id.
 * @returns {JsonObject} The layout with its origins, or unchanged when there are none.
 */
const withOrigins = (layout: JsonObject, origins: ReadonlyMap<string, PanelOrigin>): JsonObject =>
{
  if (origins.size === 0)
  {
    return layout;
  }

  const kept: JsonObject = {};
  origins.forEach((origin, panelId) =>
  {
    kept[panelId] = { groupId: origin.groupId, index: origin.index, siblings: [ ...origin.siblings ] };
  });
  return { ...layout, [TORN_OUT_KEY]: kept };
};

export {
  originIn,
  planReturns,
  readOrigins,
  releasedOutside,
  TORN_OUT_KEY,
  TORN_OUT_MIN_SIZE,
  windowAtDrop,
  windowBeside,
  withOrigins,
};
export type { DockGroupState, PanelOrigin, Point, ReturningPanel, ReturnPlace, ScreenRect, Size };
