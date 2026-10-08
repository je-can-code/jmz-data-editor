import { boundsOf } from '../events/eventPlacement.ts';
import { cloneJson } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { autotileShapeFor } from '../tiles/autotileShapes.ts';
import type { LayerChoice } from '../tiles/layering.ts';
import { gridReader, TILE_LAYER_COUNT } from '../tiles/tileGrid.ts';
import { autotileKind, isAutotile } from '../tiles/tileIds.ts';
import { captureClip } from '../tools/tileClip.ts';
import { rectContains } from '../tools/geometry.ts';

/**
 * A stamp's piece of the tile data: the layers it carries, bottom to top, and their values, the way the select tool
 * lifts a piece of the map (see captureClip): all six layers, tiles, shadows and regions alike, when it was copied under
 * automatic layering, or the one layer chosen under manual layering.
 */
type StampTiles = {
  /**
   * The layers carried, bottom to top: 0 to 3 are the tile layers, 4 the shadows and 5 the regions.
   */
  readonly layers: readonly number[];

  /**
   * The carried values, layer by layer in the order of {@link layers}, each row by row: layers times the stamp's width
   * times its height of them.
   */
  readonly values: readonly number[];

  /**
   * For each value, the shape its neighbours called for on the map it was copied from, when it is an autotile on a tile
   * layer, and -1 for anything else. A placed autotile keeps the very shape it was copied in whenever its new neighbours
   * call for this same shape, so a shape drawn by hand survives being stamped, and only what meets new neighbours along
   * the stamp's edge is shaped afresh. It is what the select tool reads off the map itself when it moves a piece, which
   * a stamp cannot do once it lands on another map, or on this one changed since.
   */
  readonly calledFor: readonly number[];
};

/**
 * Anything captured off a map: one event, a group of events, a piece of the tile data, or tiles and events together. It
 * is a plain value, whole and on its own, so it can be placed on any map any number of times, travel to another window
 * as JSON, and be kept by whatever wants to keep it.
 *
 * The stamp is a rectangle of cells, {@link width} by {@link height}. Its tiles, when it has any, fill that rectangle;
 * its events stand on cells inside it, their {@code x} and {@code y} counted from its top-left corner, and every other
 * field of each is exactly as the map held it, the id included, so that commands naming one another follow the copies.
 */
type Stamp = {
  /**
   * Unique across every window: the copying window's own prefix and a counter (see StampHistory).
   */
  readonly id: string;

  /**
   * The map it was copied from.
   */
  readonly mapId: number;

  /**
   * That map's tileset, whose pictures the tile ids draw: on a map with another tileset they would draw others.
   */
  readonly tilesetId: number;

  /**
   * Where its top-left corner sat on the map it was copied from, where a paste with no tile under the pointer puts it.
   */
  readonly origin: MapCell;

  /**
   * How many cells across.
   */
  readonly width: number;

  /**
   * How many cells down.
   */
  readonly height: number;

  /**
   * Its piece of the tile data, or null for a stamp of events alone.
   */
  readonly tiles: StampTiles | null;

  /**
   * Its events, in id order, standing where they stood inside the stamp.
   */
  readonly events: readonly RmmzMapEvent[];
};

/**
 * What a stamp is captured from: a map's size, tileset, tile data and events. A {@link MapDocument} is one.
 */
type StampSource = Pick<MapDocument, 'mapId' | 'tilesetId' | 'width' | 'height' | 'cells' | 'eventIds' | 'event'>;

/**
 * Copies events into a stamp, each standing where it stood relative to the stamp's corner: a whole copy, every page,
 * command and note, exactly as the map holds it, but for where it stands.
 * @param {StampSource} map The map.
 * @param {readonly number[]} eventIds The events, in id order.
 * @param {MapCell} corner The stamp's top-left corner on the map.
 * @returns {RmmzMapEvent[]} The copies.
 */
const copyEventsFrom = (map: StampSource, eventIds: readonly number[], corner: MapCell): RmmzMapEvent[] =>
{
  return eventIds.map(id =>
  {
    // spreading keeps the file's own key order, so a copy placed again saves in the order MZ wrote it.
    const event = cloneJson(map.event(id) as RmmzMapEvent);
    return { ...event, x: event.x - corner.x, y: event.y - corner.y };
  });
};

/**
 * Captures events as a stamp: the smallest rectangle holding them all, and whole copies of them, in id order, so their
 * order among themselves survives every placement.
 * @param {StampSource} map The map.
 * @param {readonly number[]} eventIds The events; ids the map does not hold are passed over.
 * @param {string} id The stamp's id.
 * @returns {Stamp | null} The stamp, or null when the map holds none of the events.
 */
const captureEventsStamp = (map: StampSource, eventIds: readonly number[], id: string): Stamp | null =>
{
  const ids = [ ...new Set(eventIds) ].filter(eventId => map.event(eventId) !== null).sort((left, right) => left - right);
  const bounds = boundsOf(ids.map(eventId => map.event(eventId) as RmmzMapEvent));
  if (bounds === null)
  {
    return null;
  }

  const origin = { x: bounds.x, y: bounds.y };
  return {
    id,
    mapId: map.mapId,
    tilesetId: map.tilesetId,
    origin,
    width: bounds.width,
    height: bounds.height,
    tiles: null,
    events: copyEventsFrom(map, ids, origin),
  };
};

/**
 * Works out, for each carried value, the shape its neighbours call for on the map it is copied from: the shape an
 * autotile on a tile layer would take there, and -1 for anything else (see {@link StampTiles.calledFor}).
 * @param {StampSource} map The map.
 * @param {CellRect} source The cells carried.
 * @param {readonly number[]} layers The layers carried.
 * @param {readonly number[]} values The values carried, layer by layer, each row by row.
 * @param {number} mode The tileset's mode, which the shapes read.
 * @returns {number[]} The shapes, one per value.
 */
const shapesCalledFor = (map: StampSource, source: CellRect, layers: readonly number[], values: readonly number[], mode: number): number[] =>
{
  const reader = gridReader(map);
  const { x: left, y: top, width, height } = source;
  return values.map((value, index) =>
  {
    // unfold the flat index into the carried layer and the cell it came from.
    const layer = layers[Math.floor(index / (width * height))];
    const inLayer = index % (width * height);
    if (layer >= TILE_LAYER_COUNT || isAutotile(value) === false)
    {
      return -1;
    }

    return autotileShapeFor(reader, left + (inLayer % width), top + Math.floor(inLayer / width), autotileKind(value), mode);
  });
};

/**
 * Captures a piece of the map as a stamp, the way the select tool lifts one: under automatic layering every layer,
 * tiles, shadows and regions alike, with the events standing on it, so a piece of a map comes away whole; under manual
 * layering the chosen layer alone and no events, so the objects on one layer can be taken without the ground beneath
 * them or what stands there. The part of the rectangle beyond the map is left out.
 * @param {StampSource} map The map.
 * @param {CellRect} rect The cells.
 * @param {LayerChoice} choice The layer choice, which decides the layers carried and whether events come along.
 * @param {number} mode The map's tileset mode, which the carried autotiles' shapes are read in.
 * @param {string} id The stamp's id.
 * @returns {Stamp | null} The stamp, or null when none of the rectangle lies on the map.
 */
const captureAreaStamp = (map: StampSource, rect: CellRect, choice: LayerChoice, mode: number, id: string): Stamp | null =>
{
  const clip = captureClip(map, rect, choice);
  if (clip === null)
  {
    return null;
  }

  // the events standing on the piece come along only when every layer does.
  const { source, layers, values } = clip;
  const standing = choice === 'auto'
    ? map.eventIds().filter(eventId =>
    {
      const event = map.event(eventId) as RmmzMapEvent;
      return rectContains(source, event);
    })
    : [];

  const origin = { x: source.x, y: source.y };
  return {
    id,
    mapId: map.mapId,
    tilesetId: map.tilesetId,
    origin,
    width: source.width,
    height: source.height,
    tiles: { layers, values, calledFor: shapesCalledFor(map, source, layers, values, mode) },
    events: copyEventsFrom(map, standing, origin),
  };
};

/**
 * Words a stamp's size as a piece of the tile data: "1 tile", or "20 by 15 tiles".
 * @param {{ width: number, height: number }} size The size.
 * @returns {string} The words.
 */
const tilesPhrase = (size: { readonly width: number; readonly height: number }): string =>
{
  return size.width * size.height === 1
    ? '1 tile'
    : `${size.width} by ${size.height} tiles`;
};

/**
 * Words what a stamp holds, or what of it went down, after a verb, for the history panel and for messages: "event" for
 * one event alone, as the rest of the editor words one event, "3 events", "20 by 15 tiles", or both, as "20 by 15 tiles
 * and 1 event"; and "nothing" when it holds neither.
 * @param {{ width: number, height: number } | null} tiles The size of the tiles, or null for none.
 * @param {number} events How many events.
 * @returns {string} The words.
 */
const contentsPhrase = (tiles: { readonly width: number; readonly height: number } | null, events: number): string =>
{
  if (tiles === null)
  {
    if (events === 0)
    {
      return 'nothing';
    }

    return events === 1 ? 'event' : `${events} events`;
  }

  if (events === 0)
  {
    return tilesPhrase(tiles);
  }

  return `${tilesPhrase(tiles)} and ${events === 1 ? '1 event' : `${events} events`}`;
};

/**
 * Words what a stamp holds, after a verb (see {@link contentsPhrase}).
 * @param {Stamp} stamp The stamp.
 * @returns {string} The words.
 */
const stampContents = (stamp: Stamp): string =>
{
  return contentsPhrase(stamp.tiles === null ? null : stamp, stamp.events.length);
};

/**
 * Words what a stamp holds for the Stamps panel, on a line of its own: its tiles and the one layer they were taken from,
 * when it was one, and how many events, such as "20 by 15 tiles, 3 events", "12 by 6 tiles from layer 4" or "1 event".
 * @param {Stamp} stamp The stamp.
 * @returns {string} The words.
 */
const stampCaption = (stamp: Stamp): string =>
{
  const { tiles, events } = stamp;
  const eventWords = events.length === 1 ? '1 event' : `${events.length} events`;
  if (tiles === null)
  {
    return eventWords;
  }

  const [ only ] = tiles.layers;
  const layerWords = tiles.layers.length === 1 ? ` from layer ${only + 1}` : '';
  const tileWords = `${tilesPhrase(stamp)}${layerWords}`;
  return events.length === 0
    ? tileWords
    : `${tileWords}, ${eventWords}`;
};

/**
 * Names what a stamp is, whatever its id: the map and the place it came from, and everything it carries. Two stamps
 * with the same name are the same piece of the same map, copied twice with nothing changed between, which the stamp
 * history keeps only once.
 * @param {Stamp} stamp The stamp.
 * @returns {string} The name.
 */
const stampContentKey = (stamp: Stamp): string =>
{
  const { id: _id, ...content } = stamp;
  return JSON.stringify(content);
};

export { captureAreaStamp, captureEventsStamp, contentsPhrase, stampCaption, stampContentKey, stampContents };
export type { Stamp, StampSource, StampTiles };
