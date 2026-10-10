import type { MapCell } from '../renderer/camera.ts';
import type { CellRect, GhostTile } from '../renderer/MapRenderer.ts';
import { reshapeCarried, type CellPosition } from '../tiles/autotileRefresh.ts';
import { autotileShapeFor } from '../tiles/autotileShapes.ts';
import type { LayerChoice, Shaping } from '../tiles/layering.ts';
import { cellIndex, TileDraft, type CellChange, type TileGrid } from '../tiles/tileGrid.ts';
import { clipRect, rectContains } from './geometry.ts';

/**
 * Every layer of a map's tile data: the four tile layers, the shadows and the regions.
 */
const ALL_LAYERS: readonly number[] = [ 0, 1, 2, 3, 4, 5 ];

/**
 * A piece of the map lifted by the select tool: where it came from, which layers it carries, and those layers' values
 * cell by cell. Under automatic layering it carries everything, tiles, shadows and regions alike, so moving part of a
 * map moves all of it; under manual layering it carries the chosen layer alone, so the objects on layer 4 can be
 * moved without the ground beneath them.
 */
type TileClip = {
  /**
   * The cells it was lifted from.
   */
  readonly source: CellRect;

  /**
   * The layers it carries, bottom to top.
   */
  readonly layers: readonly number[];

  /**
   * The carried values, layer by layer in the order of {@link layers}, each row by row: layers times width times
   * height of them.
   */
  readonly values: readonly number[];
};

/**
 * Where to put a clip, and how.
 */
type ClipPlacement = {
  /**
   * The cell the clip's top-left corner lands on.
   */
  readonly at: MapCell;

  /**
   * True to move it, emptying the carried layers where it came from; false to copy it, leaving them.
   */
  readonly move: boolean;

  /**
   * Whether autotiles are reshaped where the clip meets its new surroundings, or everything is written exactly as
   * lifted (Shift held).
   */
  readonly shaping: Shaping;

  /**
   * The tileset's mode, which the autotile shapes read.
   */
  readonly mode: number;
};

/**
 * Names the layers a clip carries under a layer choice.
 * @param {LayerChoice} choice The layer choice.
 * @returns {readonly number[]} The layers.
 */
const carriedLayers = (choice: LayerChoice): readonly number[] =>
{
  return choice === 'auto'
    ? ALL_LAYERS
    : [ choice ];
};

/**
 * Lifts a piece of the map into a clip.
 * @param {TileGrid} grid The map.
 * @param {CellRect} rect The cells to lift; the part beyond the map is left out.
 * @param {LayerChoice} choice The layer choice, which decides the layers carried.
 * @returns {TileClip | null} The clip, or null when none of the rectangle lies on the map.
 */
const captureClip = (grid: TileGrid, rect: CellRect, choice: LayerChoice): TileClip | null =>
{
  const source = clipRect(rect, grid.width, grid.height);
  if (source === null)
  {
    return null;
  }

  const layers = carriedLayers(choice);
  const { x: left, y: top, width, height } = source;
  const values: number[] = [];
  layers.forEach(z =>
  {
    for (let y = top; y < top + height; y++)
    {
      for (let x = left; x < left + width; x++)
      {
        values.push(grid.cells[cellIndex(grid.width, grid.height, x, y, z)]);
      }
    }
  });

  return { source, layers, values };
};

/**
 * Reads one carried value of a clip.
 * @param {TileClip} clip The clip.
 * @param {number} layerIndex The carried layer's place in {@link TileClip.layers}.
 * @param {number} dx The column inside the clip.
 * @param {number} dy The row inside the clip.
 * @returns {number} The value.
 */
const clipValue = (clip: TileClip, layerIndex: number, dx: number, dy: number): number =>
{
  const { width, height } = clip.source;
  return clip.values[(layerIndex * height + dy) * width + dx];
};

/**
 * Reshapes, in a draft, the autotiles a placed clip affected, by the rule {@link reshapeCarried} keeps for any piece of
 * map put down: a tile the clip carried keeps the very shape it was lifted in whenever its new neighbours call for the
 * same shape its old ones did, which are read where it came from on the same map, so only the tiles along the clip's
 * edge, which meet new neighbours, are shaped afresh.
 * @param {TileDraft} draft The map with the clip placed.
 * @param {readonly CellPosition[]} changed The cells written: where the clip landed, and where it was lifted from.
 * @param {number} mode The tileset's mode.
 * @param {(x: number, y: number, z: number) => MapCell | null} originOf Where a tile the clip carried came from, or
 * null for a tile the clip did not put there.
 */
const reshapeFromOrigins = (
  draft: TileDraft,
  changed: readonly CellPosition[],
  mode: number,
  originOf: (x: number, y: number, z: number) => MapCell | null,
): void =>
{
  reshapeCarried(draft, changed, mode, (x, y, z, kind) =>
  {
    // what the tile's neighbours called for at its origin, on the map as it stood before the clip moved.
    const origin = originOf(x, y, z);
    return origin === null
      ? null
      : autotileShapeFor(draft.base, origin.x, origin.y, kind, mode);
  });
};

/**
 * Plans putting a clip down: its carried layers written where its top-left corner lands, with the part beyond the map
 * dropped, and for a move the carried layers emptied where it came from first, so a move that overlaps its own source
 * lands whole. The autotiles around both places are then reshaped (see {@link reshapeFromOrigins}), unless Shift is
 * held, when everything goes down exactly as lifted and nothing around it is touched.
 * @param {TileGrid} grid The map as it stands, from which the clip was lifted.
 * @param {TileClip} clip The clip.
 * @param {ClipPlacement} placement Where it goes and how.
 * @returns {CellChange[]} The cells to change, in index order.
 */
const planPlaceClip = (grid: TileGrid, clip: TileClip, placement: ClipPlacement): CellChange[] =>
{
  const { at, move, shaping, mode } = placement;
  const { source, layers } = clip;
  const { x: left, y: top, width, height } = source;
  const draft = new TileDraft(grid);
  const changed: CellPosition[] = [];
  if (move)
  {
    for (let y = top; y < top + height; y++)
    {
      for (let x = left; x < left + width; x++)
      {
        layers.forEach(z => draft.setTile(x, y, z, 0));
        changed.push([ x, y ]);
      }
    }
  }

  // write every carried layer where the clip lands; setTile drops whatever falls beyond the map.
  for (let dy = 0; dy < height; dy++)
  {
    for (let dx = 0; dx < width; dx++)
    {
      layers.forEach((z, layerIndex) => draft.setTile(at.x + dx, at.y + dy, z, clipValue(clip, layerIndex, dx, dy)));
      changed.push([ at.x + dx, at.y + dy ]);
    }
  }

  if (shaping === 'auto')
  {
    const landed: CellRect = { x: at.x, y: at.y, width, height };
    reshapeFromOrigins(draft, changed, mode, (x, y, z) =>
    {
      // only a tile the clip carried onto this layer of this cell has an origin elsewhere.
      if (rectContains(landed, { x, y }) === false || layers.includes(z) === false)
      {
        return null;
      }

      return { x: left + x - at.x, y: top + y - at.y };
    });
  }

  return draft.changes();
};

/**
 * Lists the ghosts a clip shows while it is dragged: every tile it carries on the four tile layers, where it would
 * land, as lifted. The part beyond the map, and empty layers, show nothing.
 * @param {TileClip} clip The clip.
 * @param {MapCell} at The cell its top-left corner would land on.
 * @param {TileGrid} grid The map, for its size.
 * @returns {GhostTile[]} The ghosts, bottom layer first.
 */
const clipGhosts = (clip: TileClip, at: MapCell, grid: TileGrid): GhostTile[] =>
{
  const ghosts: GhostTile[] = [];
  const { width, height } = clip.source;
  clip.layers.forEach((z, layerIndex) =>
  {
    if (z > 3)
    {
      return;
    }

    for (let dy = 0; dy < height; dy++)
    {
      for (let dx = 0; dx < width; dx++)
      {
        const tileId = clipValue(clip, layerIndex, dx, dy);
        const x = at.x + dx;
        const y = at.y + dy;
        if (tileId !== 0 && x >= 0 && y >= 0 && x < grid.width && y < grid.height)
        {
          ghosts.push({ x, y, layer: z, tileId });
        }
      }
    }
  });

  return ghosts;
};

export { ALL_LAYERS, captureClip, carriedLayers, clipGhosts, planPlaceClip, reshapeFromOrigins };
export type { ClipPlacement, TileClip };
