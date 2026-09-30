import { DocumentHub } from '../../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../../src/mapEditor/core/history/historyKeys.ts';
import { mapDocumentKey } from '../../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../../src/mapEditor/core/model/json.ts';
import type { MapDocument } from '../../../../../src/mapEditor/core/model/MapDocument.ts';
import { TilesetMode } from '../../../../../src/mapEditor/core/tiles/autotileShapes.ts';
import type { TilesetLayering } from '../../../../../src/mapEditor/core/tiles/layering.ts';
import { autotileKind, TileId } from '../../../../../src/mapEditor/core/tiles/tileIds.ts';
import type { TilesetMarks } from '../../../../../src/mapEditor/core/tiles/tilesetMarks.ts';
import { buildMapJson } from '../../../support/fixtures.ts';
import { blankGrid, type TestGrid } from '../../tiles/support/tileGridBuilder.ts';

/**
 * A window holding one map, ready to paint: the hub, the map, and its history's key.
 */
type PaintBench = {
  readonly hub: DocumentHub;
  readonly map: MapDocument;
  readonly history: string;
};

/**
 * Builds a map in a window of its own: a blank map of the given size, set up as the caller likes, adopted by a fresh
 * hub so its history starts empty.
 * @param {number} width The width in tiles.
 * @param {number} height The height in tiles.
 * @param {(grid: TestGrid) => void} setUp Writes the tiles the map starts with.
 * @returns {PaintBench} The bench.
 */
const benchWith = (width: number, height: number, setUp: (grid: TestGrid) => void = () => undefined): PaintBench =>
{
  const grid = blankGrid(width, height);
  setUp(grid);
  const json = { ...buildMapJson(), width, height, data: Array.from(grid.cells), events: [ null ] };
  const hub = new DocumentHub({ clientId: 'window-a' });
  const map = hub.adopt(mapDocumentKey(1), json as unknown as JsonValue) as MapDocument;
  return { hub, map, history: mapHistoryKey(1) };
};

/**
 * Builds a tileset's layering with the given tiles and kinds marked to go on top.
 * @param {number[]} tiles The marked plain tiles.
 * @param {number[]} kinds The marked autotile kinds.
 * @param {number} mode The tileset's mode.
 * @returns {TilesetLayering} The layering.
 */
const layeringWith = (tiles: number[] = [], kinds: number[] = [], mode: number = TilesetMode.area): TilesetLayering =>
{
  const marks: TilesetMarks = { tiles: new Set(tiles), kinds: new Set(kinds) };
  return { mode, marks };
};

/**
 * Reads the four tile layers of one cell, autotiles by kind (as "k16") so shapes do not clutter the comparison.
 * @param {{ width: number, height: number, cells: Uint16Array }} grid The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {(number | string)[]} The cell's layers, bottom to top.
 */
const stackAt = (grid: { width: number; height: number; cells: Uint16Array }, x: number, y: number): (number | string)[] =>
{
  return [ 0, 1, 2, 3 ].map((z) =>
  {
    const tileId = grid.cells[(z * grid.height + y) * grid.width + x];
    return tileId >= TileId.A1
      ? `k${autotileKind(tileId)}`
      : tileId;
  });
};

/**
 * Copies a map's cells, so a test can compare the map before and after an edit.
 * @param {MapDocument} map The map.
 * @returns {number[]} The cells.
 */
const cellsOf = (map: MapDocument): number[] =>
{
  return Array.from(map.cells);
};

export { benchWith, cellsOf, layeringWith, stackAt };
export type { PaintBench };
