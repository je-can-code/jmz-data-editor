import type { DocumentHub } from '../history/DocumentHub.ts';
import { blueprintMapKey } from '../model/documentKeys.ts';
import { cloneJson, type JsonValue } from '../model/json.ts';
import { MAP_LAYER_COUNT, type MapDocument } from '../model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { Stamp, StampTiles } from '../stamps/stamp.ts';
import { cellsToReshape, type CellPosition } from '../tiles/autotileRefresh.ts';
import { autotileShapeFor } from '../tiles/autotileShapes.ts';
import { cellIndex, gridReader, TILE_LAYER_COUNT, type TileGrid } from '../tiles/tileGrid.ts';
import { autotileKind, isAutotile } from '../tiles/tileIds.ts';
import { newMapContent } from '../tree/treePlans.ts';
import { BLUEPRINT_GONE } from './blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn } from './blueprints.ts';

/**
 * A blueprint's tiles as the field model reads them: the layers it carries, bottom to top, and their values, layer by
 * layer, each row by row, as a stamp keeps them (see StampTiles), less the shapes the stamp remembers its autotiles were
 * called for in, which only placing the blueprint reads.
 */
type BlueprintTiles = Pick<StampTiles, 'layers' | 'values'>;

/**
 * Everything a blueprint holds that a change to it can move: its tiles, or null for a blueprint of events alone, and its
 * events in id order, each standing where it stands inside the blueprint.
 */
type BlueprintContent = {
  readonly tiles: BlueprintTiles | null;
  readonly events: readonly RmmzMapEvent[];
};

/**
 * A blueprint opened as a map, as its content is read: its size, its six layers of tile data, and its events in their
 * slots by id. A map document is one, and so is a map file once its data is in a typed array (see {@link mapFileGrid}).
 */
type BlueprintMapSource = TileGrid & { readonly events: readonly (RmmzMapEvent | null)[] };

/**
 * Lays a blueprint's stamp out as the small map it opens as: a map file the stamp's size, drawing with the stamp's tileset,
 * each layer the stamp carries holding its values and every other layer empty; its events in their slots by id, each
 * standing where it stands inside the stamp, whole, its id kept, since that id is what every copy's link names it by; and
 * the settings a new map starts with, which a blueprint has none of its own.
 * @param {Stamp} stamp The blueprint's stamp.
 * @returns {RmmzMap} The map file.
 */
const blueprintMapContent = (stamp: Stamp): RmmzMap =>
{
  const { width, height, tilesetId, tiles, events } = stamp;
  const data = new Array<number>(width * height * MAP_LAYER_COUNT).fill(0);
  if (tiles !== null)
  {
    // each carried layer's values lie row by row, layer after layer, as the stamp keeps them.
    const plane = width * height;
    tiles.layers.forEach((z, layerIndex) =>
    {
      for (let inLayer = 0; inLayer < plane; inLayer++)
      {
        data[cellIndex(width, height, inLayer % width, Math.floor(inLayer / width), z)] = tiles.values[layerIndex * plane + inLayer];
      }
    });
  }

  // slot 0 is never an event, and every other slot up to the last event stays empty unless one stands in it.
  const slots: (RmmzMapEvent | null)[] = events.length === 0
    ? []
    : new Array<RmmzMapEvent | null>(Math.max(...events.map(event => event.id)) + 1).fill(null);
  events.forEach(event =>
  {
    slots[event.id] = cloneJson(event);
  });

  return { ...newMapContent(tilesetId), width, height, data, events: slots };
};

/**
 * Reads a map file as what a blueprint's content is read from, its data put in a typed array.
 * @param {RmmzMap} file The map file.
 * @returns {BlueprintMapSource} The same map, as a grid with its events.
 */
const mapFileGrid = (file: RmmzMap): BlueprintMapSource =>
{
  return { width: file.width, height: file.height, cells: Uint16Array.from(file.data), events: file.events };
};

/**
 * Reads what a blueprint opened as a map holds as the blueprint's content: the values of the layers the blueprint carries,
 * whatever any other layer holds, and every event, in id order, as it stands there.
 * @param {BlueprintMapSource} map The blueprint opened as a map, or a file of it.
 * @param {readonly number[] | null} carried The layers the blueprint carries, bottom to top, or null for a blueprint of
 * events alone.
 * @returns {BlueprintContent} The content, copied, so nothing read here follows the map's later edits.
 */
const blueprintContentOf = (map: BlueprintMapSource, carried: readonly number[] | null): BlueprintContent =>
{
  const { width, height, cells, events } = map;
  const plane = width * height;
  const tiles = carried === null
    ? null
    : { layers: [ ...carried ], values: carried.flatMap(z => Array.from(cells.subarray(z * plane, (z + 1) * plane))) };

  return { tiles, events: events.filter((event): event is RmmzMapEvent => event !== null).map(event => cloneJson(event)) };
};

/**
 * Lists the cells whose tiles on a tile layer differ from what a blueprint's stamp held there, each once.
 * @param {StampTiles} before The tiles the stamp held.
 * @param {readonly number[]} values The values the same layers hold now.
 * @param {number} width The blueprint's width.
 * @param {number} plane How many cells one layer holds.
 * @returns {CellPosition[]} The cells.
 */
const changedTileCells = (before: StampTiles, values: readonly number[], width: number, plane: number): CellPosition[] =>
{
  const seen = new Set<number>();
  const cells: CellPosition[] = [];
  before.values.forEach((value, index) =>
  {
    // only the four tile layers are read by autotiles; shadows and regions shape nothing.
    const inLayer = index % plane;
    const layer = before.layers[Math.floor(index / plane)];
    if (layer >= TILE_LAYER_COUNT || values[index] === value || seen.has(inLayer))
    {
      return;
    }

    seen.add(inLayer);
    cells.push([ inLayer % width, Math.floor(inLayer / width) ]);
  });

  return cells;
};

/**
 * Works out, for each value a blueprint's tiles hold now, the shape its neighbours call for (see StampTiles.calledFor): what
 * the stamp remembered, for every autotile whose neighbourhood nothing changed, since that was read off the map the stamp
 * was copied from, beyond the blueprint's own edges; and read afresh off the blueprint, as it stands, for every autotile a
 * change could have reshaped, each changed cell and every cell around it whose shape reads it (see cellsToReshape). Anything
 * but an autotile on a tile layer calls for nothing.
 * @param {TileGrid} map The blueprint opened as a map.
 * @param {StampTiles} before The tiles the blueprint's stamp held.
 * @param {readonly number[]} values The values the same layers hold now.
 * @param {number} mode The tileset's mode, which the shapes read.
 * @returns {number[]} The shapes, one per value, -1 where nothing is called for.
 */
const shapesNowCalledFor = (map: TileGrid, before: StampTiles, values: readonly number[], mode: number): number[] =>
{
  const { width, height } = map;
  const plane = width * height;
  const reader = gridReader(map);
  const reshaped = new Set(cellsToReshape(reader, changedTileCells(before, values, width, plane)).map(([ x, y ]) => y * width + x));
  return values.map((value, index) =>
  {
    const inLayer = index % plane;
    const layer = before.layers[Math.floor(index / plane)];
    if (layer >= TILE_LAYER_COUNT || isAutotile(value) === false)
    {
      return -1;
    }

    return reshaped.has(inLayer) === false && value === before.values[index]
      ? before.calledFor[index]
      : autotileShapeFor(reader, inLayer % width, Math.floor(inLayer / width), autotileKind(value), mode);
  });
};

/**
 * Builds the stamp a blueprint keeps from the blueprint opened as a map, as it stands: what its stamp knew of where it was
 * copied from (the map, the tileset, the corner and the size), the layers it carries holding what the map holds there, the
 * shapes its autotiles call for (see {@link shapesNowCalledFor}), and every event as it stands there. It is the way back
 * from {@link blueprintMapContent}: a map nothing has changed gives back the very stamp it was laid out from.
 * @param {BlueprintMapSource} map The blueprint opened as a map.
 * @param {Stamp} previous The stamp the blueprint kept before, which the map was laid out from, and changed since.
 * @param {number} mode The tileset's mode, which the shapes read.
 * @returns {Stamp} The stamp the blueprint keeps now.
 */
const blueprintStampOf = (map: BlueprintMapSource, previous: Stamp, mode: number): Stamp =>
{
  const { id, mapId, tilesetId, origin, width, height, tiles: before } = previous;
  const content = blueprintContentOf(map, before === null ? null : before.layers);
  const tiles = before === null || content.tiles === null
    ? null
    : { ...content.tiles, calledFor: shapesNowCalledFor(map, before, content.tiles.values, mode) };

  return { id, mapId, tilesetId, origin: { ...origin }, width, height, tiles, events: content.events };
};

/**
 * Holds a blueprint opened as a map, laid out afresh from the blueprint as the window's blueprints hold it, unless the
 * window holds it already, as it is. What opens a blueprint asks the other windows first, since one may hold it with
 * changes the blueprints lack; this is what it falls back to.
 * @param {Pick<DocumentHub, 'has' | 'document' | 'adopt'>} hub The window's documents; the blueprints must be held.
 * @param {string} blueprintId The blueprint.
 * @returns {MapDocument} The blueprint, as a map.
 * @throws {Error} When the blueprints hold no blueprint of that id, in words for the author.
 */
const holdBlueprintMap = (hub: Pick<DocumentHub, 'has' | 'document' | 'adopt'>, blueprintId: string): MapDocument =>
{
  const key = blueprintMapKey(blueprintId);
  if (hub.has(key))
  {
    return hub.document(key) as MapDocument;
  }

  const blueprint = blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId);
  if (blueprint === null)
  {
    throw new Error(BLUEPRINT_GONE);
  }

  return hub.adopt(key, blueprintMapContent(blueprint.stamp) as unknown as JsonValue) as MapDocument;
};

export { blueprintContentOf, blueprintMapContent, blueprintStampOf, holdBlueprintMap, mapFileGrid };
export type { BlueprintContent, BlueprintMapSource, BlueprintTiles };
