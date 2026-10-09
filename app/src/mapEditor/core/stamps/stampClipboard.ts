import { isBlueprintId } from '../blueprints/blueprintLink.ts';
import { isJsonObject, type JsonObject } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import { AUTOTILE_SHAPE_COUNT } from '../tiles/tileIds.ts';
import type { Stamp, StampSpot, StampTiles } from './stamp.ts';

/**
 * The mark a stamp on the system clipboard carries, so a paste knows the text there is a stamp copied in the map editor,
 * in this window or any other, and not whatever else was copied last. The NW.js shell hands a page the clipboard's text
 * only when it carries this mark (see nw-app/shellRules.js).
 */
const STAMP_CLIPBOARD_MARKER = 'jmz-map-editor/stamp';

/**
 * The shape of the stamp clipboard this editor writes and reads.
 */
const STAMP_CLIPBOARD_VERSION = 1;

/**
 * How many layers a map's tile data holds, and so the highest layer a stamp may carry, plus one.
 */
const MAP_LAYERS = 6;

/**
 * The largest value one cell holds.
 */
const MAX_CELL_VALUE = 0xffff;

/**
 * Writes a stamp as the text that goes on the system clipboard: the marker, the shape's version, and the stamp.
 * @param {Stamp} stamp The stamp.
 * @returns {string} The JSON text.
 */
const encodeStampClipboard = (stamp: Stamp): string =>
{
  return JSON.stringify({ marker: STAMP_CLIPBOARD_MARKER, version: STAMP_CLIPBOARD_VERSION, stamp });
};

/**
 * Reports whether a value is a whole number from a floor up to a ceiling.
 * @param {unknown} value The value.
 * @param {number} floor The smallest it may be.
 * @param {number} ceiling The largest it may be.
 * @returns {boolean} True for such a number.
 */
const isWholeBetween = (value: unknown, floor: number, ceiling: number = Number.MAX_SAFE_INTEGER): value is number =>
{
  return typeof value === 'number' && Number.isInteger(value) && value >= floor && value <= ceiling;
};

/**
 * Reports whether a value is a list of whole numbers, each from a floor up to a ceiling, of a given length.
 * @param {unknown} value The value.
 * @param {number} length How many it must hold.
 * @param {number} floor The smallest each may be.
 * @param {number} ceiling The largest each may be.
 * @returns {boolean} True for such a list.
 */
const isWholeList = (value: unknown, length: number, floor: number, ceiling: number): value is number[] =>
{
  return Array.isArray(value) && value.length === length && value.every(item => isWholeBetween(item, floor, ceiling));
};

/**
 * Reads a stamp's tiles, refusing any that do not fill its rectangle on layers named once each, bottom to top, with
 * values a map can hold and shapes an autotile can take.
 * @param {unknown} value The tiles as read.
 * @param {number} width The stamp's width.
 * @param {number} height The stamp's height.
 * @returns {StampTiles | null | undefined} The tiles; null for a stamp with none; undefined when they are malformed.
 */
const readTiles = (value: unknown, width: number, height: number): StampTiles | null | undefined =>
{
  if (value === null)
  {
    return null;
  }

  if (isJsonObject(value) === false)
  {
    return undefined;
  }

  const { layers, values, calledFor } = value;
  const ascending = Array.isArray(layers)
    && layers.length > 0
    && layers.every((layer, index) => isWholeBetween(layer, 0, MAP_LAYERS - 1) && (index === 0 || layer > (layers[index - 1] as number)));
  if (ascending === false)
  {
    return undefined;
  }

  const count = (layers as number[]).length * width * height;
  if (isWholeList(values, count, 0, MAX_CELL_VALUE) === false || isWholeList(calledFor, count, -1, AUTOTILE_SHAPE_COUNT - 1) === false)
  {
    return undefined;
  }

  return { layers: layers as number[], values, calledFor };
};

/**
 * Reports whether a value has the shape of a stamp's event: an id, a cell inside the stamp, a name, a note and a list of
 * pages.
 * @param {unknown} value The value.
 * @param {number} width The stamp's width.
 * @param {number} height The stamp's height.
 * @returns {boolean} True when it can be placed as an event.
 */
const isStampEvent = (value: unknown, width: number, height: number): value is RmmzMapEvent =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { id, x, y, name, note, pages } = value;
  return isWholeBetween(id, 1) && isWholeBetween(x, 0, width - 1) && isWholeBetween(y, 0, height - 1)
    && typeof name === 'string' && typeof note === 'string' && Array.isArray(pages);
};

/**
 * Reads a stamp's events, refusing any list that is not of events inside the stamp, each with an id and a cell of its
 * own, as a map holds them.
 * @param {unknown} value The events as read.
 * @param {number} width The stamp's width.
 * @param {number} height The stamp's height.
 * @returns {RmmzMapEvent[] | null} The events, or null when they are malformed.
 */
const readEvents = (value: unknown, width: number, height: number): RmmzMapEvent[] | null =>
{
  if (Array.isArray(value) === false || value.every(event => isStampEvent(event, width, height)) === false)
  {
    return null;
  }

  const events = value as unknown as RmmzMapEvent[];
  const ids = new Set(events.map(event => event.id));
  const cells = new Set(events.map(event => event.y * width + event.x));
  return ids.size === events.length && cells.size === events.length
    ? events
    : null;
};

/**
 * Reports whether a value is the part of a blueprint a placement put down: absent, for one put down whole, or a rectangle
 * inside the blueprint, at least one tile each way.
 * @param {unknown} value The value.
 * @param {number} spanWidth The blueprint's width.
 * @param {number} spanHeight The blueprint's height.
 * @returns {boolean} True when it is.
 */
const isPlacedPart = (value: unknown, spanWidth: number, spanHeight: number): boolean =>
{
  if (value === undefined)
  {
    return true;
  }

  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { x, y, width, height } = value;
  return isWholeBetween(x, 0, spanWidth - 1) && isWholeBetween(y, 0, spanHeight - 1)
    && isWholeBetween(width, 1, spanWidth - (x as number)) && isWholeBetween(height, 1, spanHeight - (y as number));
};

/**
 * Reports whether a value has the shape of a placement a stamp's tiles hold: a blueprint's id, a cell, and a size, the
 * placement reaching into the stamp, and the part of the blueprint it put down when that was not the whole.
 * @param {unknown} value The value.
 * @param {number} width The stamp's width.
 * @param {number} height The stamp's height.
 * @returns {boolean} True when it can be recorded wherever the stamp lands.
 */
const isStampSpot = (value: unknown, width: number, height: number): value is StampSpot =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { blueprintId, x, y, width: spanWidth, height: spanHeight, placed } = value;
  return typeof blueprintId === 'string' && isBlueprintId(blueprintId)
    && isWholeBetween(spanWidth, 1) && isWholeBetween(spanHeight, 1)
    && isWholeBetween(x, 1 - (spanWidth as number), width - 1) && isWholeBetween(y, 1 - (spanHeight as number), height - 1)
    && isPlacedPart(placed, spanWidth as number, spanHeight as number);
};

/**
 * Reads the placements a stamp's tiles hold, refusing any list that is not of placements reaching into the stamp. A stamp
 * holding none, which is most of them, has no list at all.
 * @param {unknown} value The placements as read, or undefined for none.
 * @param {number} width The stamp's width.
 * @param {number} height The stamp's height.
 * @returns {StampSpot[] | null | undefined} The placements; undefined when the stamp has none; null when they are
 * malformed.
 */
const readSpots = (value: unknown, width: number, height: number): StampSpot[] | null | undefined =>
{
  if (value === undefined)
  {
    return undefined;
  }

  // each is built field by field, so nothing a spot does not hold comes along, and its part only when it has one.
  return Array.isArray(value) && value.length > 0 && value.every(spot => isStampSpot(spot, width, height))
    ? (value as unknown as StampSpot[]).map(({ blueprintId, x, y, width: spanWidth, height: spanHeight, placed }) => ({
      blueprintId,
      x,
      y,
      width: spanWidth,
      height: spanHeight,
      ...(placed === undefined ? {} : { placed: { x: placed.x, y: placed.y, width: placed.width, height: placed.height } }),
    }))
    : null;
};

/**
 * Reads a stamp out of what some JSON holds, refusing anything that is not a whole stamp holding something: the
 * clipboard's stamp, and every stamp a blueprint is saved with, which is kept in the very same shape.
 * @param {JsonObject} value The stamp as read.
 * @returns {Stamp | null} The stamp, or null when it is malformed.
 */
const readStamp = (value: JsonObject): Stamp | null =>
{
  const { id, mapId, tilesetId, origin, width, height } = value;
  const placed = typeof id === 'string' && id.length > 0
    && isWholeBetween(mapId, 1) && isWholeBetween(tilesetId, 0)
    && isJsonObject(origin) && isWholeBetween(origin['x'], 0) && isWholeBetween(origin['y'], 0)
    && isWholeBetween(width, 1) && isWholeBetween(height, 1);
  if (placed === false)
  {
    return null;
  }

  // placements are only ever held by tiles.
  const tiles = readTiles(value['tiles'], width as number, height as number);
  const events = readEvents(value['events'], width as number, height as number);
  const spots = readSpots(value['spots'], width as number, height as number);
  if (tiles === undefined || events === null || (tiles === null && events.length === 0) || spots === null || (tiles === null && spots !== undefined))
  {
    return null;
  }

  // built field by field, in the order a captured stamp has them, so the same stamp reads back the same.
  const corner = origin as JsonObject;
  const stamp: Stamp = {
    id: id as string,
    mapId: mapId as number,
    tilesetId: tilesetId as number,
    origin: { x: corner['x'] as number, y: corner['y'] as number },
    width: width as number,
    height: height as number,
    tiles,
    events,
  };

  return spots === undefined
    ? stamp
    : { ...stamp, spots };
};

/**
 * Reads the text on the system clipboard as a stamp. Anything else, such as a line of dialogue copied from a text box,
 * or a stamp in a shape this editor does not write, reads as nothing, so a paste of it changes nothing.
 * @param {string} text The clipboard's text.
 * @returns {Stamp | null} The stamp, or null when the text is not a stamp clipboard.
 */
const decodeStampClipboard = (text: string): Stamp | null =>
{
  let parsed: unknown;
  try
  {
    parsed = JSON.parse(text);
  }
  catch
  {
    return null;
  }

  if (isJsonObject(parsed) === false || parsed['marker'] !== STAMP_CLIPBOARD_MARKER || parsed['version'] !== STAMP_CLIPBOARD_VERSION)
  {
    return null;
  }

  const { stamp } = parsed;
  return isJsonObject(stamp)
    ? readStamp(stamp)
    : null;
};

export { decodeStampClipboard, encodeStampClipboard, readStamp, STAMP_CLIPBOARD_MARKER, STAMP_CLIPBOARD_VERSION };
