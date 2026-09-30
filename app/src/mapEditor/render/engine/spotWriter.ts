import {
  FLOOR_AUTOTILE_TABLE,
  WALL_AUTOTILE_TABLE,
  WATERFALL_AUTOTILE_TABLE,
  type ShapeQuadrants,
} from '../../core/tiles/autotileTables.ts';
import { TileAnimation, waterfallIndex, waterSurfaceIndex, type TileAnimationKind } from './animation.ts';
import {
  autotileKind,
  autotileShape,
  isAutotile,
  isHigherTile,
  isShadowingTile,
  isTableTile,
  isTileA1,
  isTileA2,
  isTileA3,
  isVisibleTile,
  normalTileCell,
  normalTileSheet,
} from './tileIds.ts';

/**
 * The map layer a shadow rect belongs to; tile rects carry their own layer, 0 to 3.
 */
const SHADOW_LAYER = 4;

/**
 * The sheet number of a shadow rect, which the tilemap fills with half-transparent black instead of a picture.
 */
const SHADOW_SHEET = -1;

/**
 * Receives one rect in the engine's terms, exactly what Tilemap#_addSpot hands its layers, plus where it came from.
 * @param {boolean} upper True when the rect draws above characters (a star tile), false for the layer below them.
 * @param {number} layer The map layer it comes from: 0 to 3 for tiles, 4 for a shadow. A table's edge, drawn onto
 * the cell beneath the table, counts as layer 1, the table's own.
 * @param {number} sheet The tileset sheet it is cut from, 0 to 8 (A1 to A5, then B to E), or -1 for a shadow.
 * @param {number} sx The source's left edge on the sheet.
 * @param {number} sy The source's top edge on the sheet.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {TileAnimationKind} animation How the picture moves between animation steps.
 */
type RectSink = (
  upper: boolean,
  layer: number,
  sheet: number,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
  animation: TileAnimationKind,
) => void;

/**
 * The parts of a map and its tileset the drawing reads.
 */
type TileSource = {
  readonly width: number;
  readonly height: number;

  /**
   * The six layers flattened, in RMMZ's layout.
   */
  readonly data: ArrayLike<number>;

  /**
   * The tileset's flags, one per tile id.
   */
  readonly flags: ArrayLike<number>;

  /**
   * Whether the map loops across, so reads off one edge land on the other, as the engine's tilemap does.
   */
  readonly horizontalWrap: boolean;

  /**
   * Whether the map loops down.
   */
  readonly verticalWrap: boolean;
};

/**
 * How the spot writer draws; everything else follows the engine.
 */
type SpotOptions = {
  readonly tileSize: number;

  /**
   * The animation step whose pictures the rects show. The renderer builds at 0 and lets the shader move them.
   */
  readonly animationFrame: number;

  /**
   * Whether shadows draw. The game never draws them (J-Base empties Tilemap#_addShadow), so the editor's game look
   * leaves them out and a switch shows them.
   */
  readonly shadows: boolean;
};

/**
 * Where one autotile kind's block sits on its sheet, and how to cut it.
 */
type AutotileBlock = {
  readonly sheet: number;
  readonly bx: number;
  readonly by: number;
  readonly table: readonly ShapeQuadrants[];
  readonly animation: TileAnimationKind;
};

/**
 * Brings a coordinate back onto a looping map, as the engine's Number#mod does.
 * @param {number} value The coordinate.
 * @param {number} size The map's size along it.
 * @returns {number} The coordinate on the map.
 */
const wrap = (value: number, size: number): number =>
{
  return ((value % size) + size) % size;
};

/**
 * Reads one layer of one cell as Tilemap#_readMapData does: wrapping on looping maps, and 0 off the map otherwise.
 * @param {TileSource} source The map.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} z The layer: 0 to 3 tiles, 4 shadows, 5 regions.
 * @returns {number} The value stored there, or 0.
 */
const readMapData = (source: TileSource, x: number, y: number, z: number): number =>
{
  const { width, height } = source;
  const column = source.horizontalWrap
    ? wrap(x, width)
    : x;
  const row = source.verticalWrap
    ? wrap(y, height)
    : y;
  if (column < 0 || column >= width || row < 0 || row >= height)
  {
    return 0;
  }

  return source.data[(z * height + row) * width + column] || 0;
};

/**
 * Places an A1 kind on its sheet at an animation step, as the A1 branch of Tilemap#_addAutotile: kinds 0 and 1 are
 * the animated seas, 2 and 3 their still decorations, and from 4 on each even kind is water and each odd kind the
 * waterfall beside it.
 * @param {number} kind The A1 kind, 0 to 15.
 * @param {number} frame The animation step.
 * @returns {AutotileBlock} The block.
 */
const a1Block = (kind: number, frame: number): AutotileBlock =>
{
  const water = waterSurfaceIndex(frame);
  if (kind === 0 || kind === 1)
  {
    return { sheet: 0, bx: water * 2, by: kind === 0 ? 0 : 3, table: FLOOR_AUTOTILE_TABLE, animation: TileAnimation.water };
  }

  if (kind === 2 || kind === 3)
  {
    return { sheet: 0, bx: 6, by: kind === 2 ? 0 : 3, table: FLOOR_AUTOTILE_TABLE, animation: TileAnimation.none };
  }

  const tx = kind % 8;
  const ty = Math.floor(kind / 8);
  const bx = Math.floor(tx / 4) * 8;
  const by = ty * 6 + (Math.floor(tx / 2) % 2) * 3;
  if (kind % 2 === 0)
  {
    return { sheet: 0, bx: bx + water * 2, by, table: FLOOR_AUTOTILE_TABLE, animation: TileAnimation.water };
  }

  return { sheet: 0, bx: bx + 6, by: by + waterfallIndex(frame), table: WATERFALL_AUTOTILE_TABLE, animation: TileAnimation.waterfall };
};

/**
 * Places any autotile's kind on its sheet, as Tilemap#_addAutotile does before it cuts the quarters.
 * @param {number} tileId The autotile id.
 * @param {number} frame The animation step, which only A1 reads.
 * @returns {AutotileBlock} The block.
 */
const autotileBlock = (tileId: number, frame: number): AutotileBlock =>
{
  const kind = autotileKind(tileId);
  const tx = kind % 8;
  const ty = Math.floor(kind / 8);
  if (isTileA1(tileId))
  {
    return a1Block(kind, frame);
  }

  if (isTileA2(tileId))
  {
    return { sheet: 1, bx: tx * 2, by: (ty - 2) * 3, table: FLOOR_AUTOTILE_TABLE, animation: TileAnimation.none };
  }

  if (isTileA3(tileId))
  {
    return { sheet: 2, bx: tx * 2, by: (ty - 6) * 2, table: WALL_AUTOTILE_TABLE, animation: TileAnimation.none };
  }

  // A4 alternates rows of wall tops (floor shapes) and wall faces (wall shapes), two and a half rows apart.
  const wallFace = ty % 2 === 1;
  return {
    sheet: 3,
    bx: tx * 2,
    by: Math.floor((ty - 10) * 2.5 + (wallFace ? 0.5 : 0)),
    table: wallFace ? WALL_AUTOTILE_TABLE : FLOOR_AUTOTILE_TABLE,
    animation: TileAnimation.none,
  };
};

/**
 * Emits a B to E or A5 tile, as Tilemap#_addNormalTile.
 * @param {RectSink} sink Where the rect goes.
 * @param {boolean} upper Whether it draws above characters.
 * @param {number} layer The map layer it comes from.
 * @param {number} tileId The tile id.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {number} size The tile size.
 */
const addNormalTile = (
  sink: RectSink, upper: boolean, layer: number, tileId: number, dx: number, dy: number, size: number): void =>
{
  const { column, row } = normalTileCell(tileId);
  sink(upper, layer, normalTileSheet(tileId), column * size, row * size, dx, dy, size, size, TileAnimation.none);
};

/**
 * Emits an autotile's four quarters, as Tilemap#_addAutotile, splitting a table's legs the way the engine does.
 * @param {TileSource} source The map, for the table flag.
 * @param {RectSink} sink Where the rects go.
 * @param {boolean} upper Whether it draws above characters.
 * @param {number} layer The map layer it comes from.
 * @param {number} tileId The autotile id.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {SpotOptions} options The tile size and animation step.
 */
const addAutotile = (
  source: TileSource, sink: RectSink, upper: boolean, layer: number, tileId: number, dx: number, dy: number,
  options: SpotOptions): void =>
{
  const { sheet, bx, by, table, animation } = autotileBlock(tileId, options.animationFrame);
  const isTable = isTableTile(source.flags, tileId);
  const quarters = table[autotileShape(tileId)];
  const w1 = options.tileSize / 2;
  const h1 = options.tileSize / 2;
  for (let index = 0; index < 4; index++)
  {
    const [ qsx, qsy ] = quarters[index];
    const sx1 = (bx * 2 + qsx) * w1;
    const sy1 = (by * 2 + qsy) * h1;
    const dx1 = dx + (index % 2) * w1;
    const dy1 = dy + Math.floor(index / 2) * h1;

    // a table's quarter on the leg rows draws the middle row, then the leg's lower half over its bottom.
    if (isTable && (qsy === 1 || qsy === 5))
    {
      const qsx2 = qsy === 1
        ? (4 - qsx) % 4
        : qsx;
      sink(upper, layer, sheet, (bx * 2 + qsx2) * w1, (by * 2 + 3) * h1, dx1, dy1, w1, h1, animation);
      sink(upper, layer, sheet, sx1, sy1, dx1, dy1 + h1 / 2, w1, h1 / 2, animation);
      continue;
    }

    sink(upper, layer, sheet, sx1, sy1, dx1, dy1, w1, h1, animation);
  }
};

/**
 * Emits the lower edge of the table above onto this cell, as Tilemap#_addTableEdge. It always draws below
 * characters, and counts as layer 1, where the table is.
 * @param {RectSink} sink Where the rects go.
 * @param {number} tileId The table tile in the cell above.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {number} size The tile size.
 */
const addTableEdge = (sink: RectSink, tileId: number, dx: number, dy: number, size: number): void =>
{
  const kind = autotileKind(tileId);
  const bx = (kind % 8) * 2;
  const by = (Math.floor(kind / 8) - 2) * 3;
  const quarters = FLOOR_AUTOTILE_TABLE[autotileShape(tileId)];
  const w1 = size / 2;
  const h1 = size / 2;
  for (let index = 0; index < 2; index++)
  {
    const [ qsx, qsy ] = quarters[2 + index];
    sink(false, 1, 1, (bx * 2 + qsx) * w1, (by * 2 + qsy) * h1 + h1 / 2, dx + index * w1, dy, w1, h1 / 2, TileAnimation.none);
  }
};

/**
 * Emits the shadow quarters a cell's shadow bits name, as Tilemap#_addShadow: each is half-transparent black, below
 * characters.
 * @param {RectSink} sink Where the rects go.
 * @param {number} shadowBits The cell's shadow layer value.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {number} size The tile size.
 */
const addShadow = (sink: RectSink, shadowBits: number, dx: number, dy: number, size: number): void =>
{
  if ((shadowBits & 0x0f) === 0)
  {
    return;
  }

  const w1 = size / 2;
  const h1 = size / 2;
  for (let index = 0; index < 4; index++)
  {
    if ((shadowBits & (1 << index)) !== 0)
    {
      const dx1 = dx + (index % 2) * w1;
      const dy1 = dy + Math.floor(index / 2) * h1;
      sink(false, SHADOW_LAYER, SHADOW_SHEET, 0, 0, dx1, dy1, w1, h1, TileAnimation.none);
    }
  }
};

/**
 * Emits one tile to the layer its star flag picks, as Tilemap#_addSpotTile and Tilemap#_addTile.
 * @param {TileSource} source The map.
 * @param {RectSink} sink Where the rects go.
 * @param {number} layer The map layer the tile sits on.
 * @param {number} tileId The tile id.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {SpotOptions} options How to draw.
 */
const addSpotTile = (
  source: TileSource, sink: RectSink, layer: number, tileId: number, dx: number, dy: number, options: SpotOptions): void =>
{
  if (isVisibleTile(tileId) === false)
  {
    return;
  }

  const upper = isHigherTile(source.flags, tileId);
  if (isAutotile(tileId))
  {
    addAutotile(source, sink, upper, layer, tileId, dx, dy, options);
    return;
  }

  addNormalTile(sink, upper, layer, tileId, dx, dy, options.tileSize);
};

/**
 * Emits everything one cell draws, in the engine's order: layers 0 and 1, the shadow, the edge of a table above,
 * then layers 2 and 3. A port of Tilemap#_addSpot, whose overpass branch MZ never takes.
 * @param {TileSource} source The map.
 * @param {number} mx The column.
 * @param {number} my The row.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {RectSink} sink Where the rects go.
 * @param {SpotOptions} options How to draw.
 */
const writeSpot = (
  source: TileSource, mx: number, my: number, dx: number, dy: number, sink: RectSink, options: SpotOptions): void =>
{
  const tileId0 = readMapData(source, mx, my, 0);
  const tileId1 = readMapData(source, mx, my, 1);
  const upperTileId1 = readMapData(source, mx, my - 1, 1);

  addSpotTile(source, sink, 0, tileId0, dx, dy, options);
  addSpotTile(source, sink, 1, tileId1, dx, dy, options);
  if (options.shadows)
  {
    addShadow(sink, readMapData(source, mx, my, SHADOW_LAYER), dx, dy, options.tileSize);
  }

  // a table's lower edge hangs onto the cell beneath, unless that cell holds a table too or a wall.
  const { flags } = source;
  if (isTableTile(flags, upperTileId1) && isTableTile(flags, tileId1) === false && isShadowingTile(tileId0) === false)
  {
    addTableEdge(sink, upperTileId1, dx, dy, options.tileSize);
  }

  addSpotTile(source, sink, 2, readMapData(source, mx, my, 2), dx, dy, options);
  addSpotTile(source, sink, 3, readMapData(source, mx, my, 3), dx, dy, options);
};

/**
 * Emits one tile on its own, as the engine would draw it on a layer: what a ghost preview shows before a click places
 * it. Only the tile itself draws; no neighbour or table edge is consulted.
 * @param {TileSource} source The map, for the tileset's flags.
 * @param {number} layer The layer the tile would sit on.
 * @param {number} tileId The tile id.
 * @param {number} dx The destination's left edge.
 * @param {number} dy The destination's top edge.
 * @param {RectSink} sink Where the rects go.
 * @param {SpotOptions} options How to draw.
 */
const writeTile = (
  source: TileSource, layer: number, tileId: number, dx: number, dy: number, sink: RectSink, options: SpotOptions): void =>
{
  addSpotTile(source, sink, layer, tileId, dx, dy, options);
};

export { readMapData, SHADOW_LAYER, SHADOW_SHEET, writeSpot, writeTile };
export type { RectSink, SpotOptions, TileSource };
