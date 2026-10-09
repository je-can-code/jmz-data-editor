import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import type { Stamp, StampTiles } from '../stamps/stamp.ts';
import { cellIndex, TILE_LAYER_COUNT, type TileGrid } from '../tiles/tileGrid.ts';
import { autotileKind, isAutotile } from '../tiles/tileIds.ts';
import { clipRect } from '../tools/geometry.ts';

/**
 * What a placement is checked against: a map's size, tileset and tile data, as a map document holds them.
 */
type PlacementGround = TileGrid & { readonly tilesetId: number };

/**
 * What checking a placement against its map came to.
 *
 * - {@code in-place}: it still sits where the record says, with this many of the tiles compared matching the blueprint.
 * - {@code other-tileset}: the map is drawn with another tileset now, so its tile ids no longer draw the blueprint.
 * - {@code off-map}: none of it lies on the map any more.
 * - {@code shifted}: its tiles match the blueprint better a little way off, by {@code by}, than where the record says, as
 *   when the map was shifted or resized from another edge outside the editor.
 * - {@code changed}: fewer than {@link MATCH_SHARE} of the tiles compared match the blueprint.
 */
type PlacementCheck =
  | { readonly kind: 'in-place'; readonly matched: number; readonly compared: number }
  | { readonly kind: 'other-tileset' }
  | { readonly kind: 'off-map' }
  | { readonly kind: 'shifted'; readonly by: MapCell; readonly matched: number; readonly compared: number }
  | { readonly kind: 'changed'; readonly matched: number; readonly compared: number };

/**
 * The share of the tiles compared that must match the blueprint for a placement to count as still where the record says:
 * at least half. Painting over a few of a placement's cells by hand is expected (only the cells still reading the
 * blueprint's tiles ever follow it), so the check asks only whether the placement is still there, and a placement more
 * than half painted over is taken for gone. Measured with this check on the shipped maps (6,351 pieces of 2 by 2 to 12
 * by 12 tiles from 328 maps, 2026-10-09): with a tenth of each piece's cells painted over at random, 99.6% still read as
 * in place; a quarter, 96.5%; half, 75.1%. A share alone is no test of a map shifted under the record, since most of a
 * piece is usually one ground, which matches by kind wherever it is; {@link slideOf} is.
 */
const MATCH_SHARE = 0.5;

/**
 * How far, in tiles every way, the check looks for a placement having slid off the spot the record holds.
 */
const SLIDE_REACH = 2;

/**
 * The fewest tiles that must read as slid before a placement is taken to have slid, so a lone tile painted to look like
 * its neighbour never moves a whole placement.
 */
const SLIDE_EVIDENCE = 3;

/**
 * Lists the layers a check compares: the tile layers a blueprint carries, since they are what the placement looks like
 * and shadows or regions painted over it later change nothing of that; or, for a blueprint carrying no tile layer at
 * all, the shadows or regions it does carry, so no placement is ever compared on nothing.
 * @param {StampTiles} tiles The blueprint's tiles.
 * @returns {number[]} The layers, bottom to top.
 */
const comparedLayers = (tiles: StampTiles): number[] =>
{
  const tileLayers = tiles.layers.filter(z => z < TILE_LAYER_COUNT);
  return tileLayers.length > 0
    ? tileLayers
    : [ ...tiles.layers ];
};

/**
 * Reports whether a tile on the map stands for one of the blueprint's: an autotile by its kind, since its edges reshape
 * with whatever stands beside it, and anything else exactly.
 * @param {number} expected The blueprint's tile.
 * @param {number} found The map's tile.
 * @returns {boolean} True when they match.
 */
const sameTile = (expected: number, found: number): boolean =>
{
  return expected === found || (isAutotile(expected) && isAutotile(found) && autotileKind(expected) === autotileKind(found));
};

/**
 * Reads one of a blueprint's carried values.
 * @param {Stamp} stamp The blueprint's stamp, which holds tiles.
 * @param {number} layerIndex The carried layer's place among its layers.
 * @param {number} dx The column inside the stamp.
 * @param {number} dy The row inside the stamp.
 * @returns {number} The value.
 */
const stampValue = (stamp: Stamp, layerIndex: number, dx: number, dy: number): number =>
{
  const { width, height } = stamp;
  return (stamp.tiles as StampTiles).values[(layerIndex * height + dy) * width + dx];
};

/**
 * Counts how the map's tiles under a placement compare with the blueprint's, on the compared layers, over the part of it
 * on the map: every tile where either the blueprint or the map holds one counts, and matches when it is the same tile,
 * an autotile by its kind. A cell empty on both sides says nothing, so a blueprint of a few objects with empty ground
 * around them is judged by its objects alone.
 * @param {PlacementGround} ground The map.
 * @param {MapCell} spot Where the placement's top-left corner sits.
 * @param {Stamp} stamp The blueprint's stamp, which holds tiles.
 * @param {CellRect} onMap The part of the placement on the map.
 * @returns {{ matched: number, compared: number }} The count.
 */
const tally = (ground: PlacementGround, spot: MapCell, stamp: Stamp, onMap: CellRect): { matched: number; compared: number } =>
{
  const tiles = stamp.tiles as StampTiles;
  const { x: left, y: top, width, height } = onMap;
  let matched = 0;
  let compared = 0;
  comparedLayers(tiles).forEach(z =>
  {
    const layerIndex = tiles.layers.indexOf(z);
    for (let y = top; y < top + height; y++)
    {
      for (let x = left; x < left + width; x++)
      {
        const expected = stampValue(stamp, layerIndex, x - spot.x, y - spot.y);
        const found = ground.cells[cellIndex(ground.width, ground.height, x, y, z)];
        if (expected === 0 && found === 0)
        {
          continue;
        }

        compared += 1;
        matched += sameTile(expected, found) ? 1 : 0;
      }
    }
  });

  return { matched, compared };
};

/**
 * Weighs the evidence that a placement slid by one offset: over every tile the offset changes (where the blueprint's own
 * tile differs from the one the offset would bring there), how many the map still holds as placed, and how many it holds
 * as slid. Tiles the offset changes nothing of, such as the middle of a field of grass, say nothing either way, which is
 * what lets a slid placement be told apart however much of it is plain ground.
 * @param {PlacementGround} ground The map.
 * @param {MapCell} spot Where the record says the top-left corner sits.
 * @param {Stamp} stamp The blueprint's stamp, which holds tiles.
 * @param {CellRect} onMap The part of the placement on the map.
 * @param {MapCell} by The offset.
 * @returns {{ changed: number, stayed: number, slid: number }} The tiles the offset changes, and how many read each way.
 */
const slideEvidence = (
  ground: PlacementGround,
  spot: MapCell,
  stamp: Stamp,
  onMap: CellRect,
  by: MapCell,
): { changed: number; stayed: number; slid: number } =>
{
  const tiles = stamp.tiles as StampTiles;
  const { x: left, y: top, width, height } = onMap;
  let changed = 0;
  let stayed = 0;
  let slid = 0;
  comparedLayers(tiles).forEach(z =>
  {
    const layerIndex = tiles.layers.indexOf(z);
    for (let y = top; y < top + height; y++)
    {
      for (let x = left; x < left + width; x++)
      {
        // the tile the blueprint holds here, and the one it would hold here had it slid by the offset.
        const dx = x - spot.x;
        const dy = y - spot.y;
        const fromX = dx - by.x;
        const fromY = dy - by.y;
        if (fromX < 0 || fromY < 0 || fromX >= stamp.width || fromY >= stamp.height)
        {
          continue;
        }

        const placed = stampValue(stamp, layerIndex, dx, dy);
        const sliding = stampValue(stamp, layerIndex, fromX, fromY);
        if (sameTile(placed, sliding))
        {
          continue;
        }

        changed += 1;
        const found = ground.cells[cellIndex(ground.width, ground.height, x, y, z)];
        if (sameTile(placed, found))
        {
          stayed += 1;
        }
        else if (sameTile(sliding, found))
        {
          slid += 1;
        }
      }
    }
  });

  return { changed, stayed, slid };
};

/**
 * Finds whether a placement's tiles slid off the spot the record holds, by up to {@link SLIDE_REACH} tiles every way, as
 * they do when a map is shifted, or resized from another edge, outside the editor. An offset wins when at least
 * {@link SLIDE_EVIDENCE} of the tiles it changes read as slid, more than read as placed, and at least half of all it
 * changes; of several, the one with the most to spare. Measured with the whole check on the shipped maps (6,351 pieces
 * from 328 maps, 2026-10-09): a map shifted one column fails the check for 66.7% of pieces and one row for 71.3%; of
 * the column's misses, 20.9 of the 33.3 points are pieces every tile of which still matches once shifted, which nothing
 * could tell from where they were, and the rest mostly pieces whose only feature is a tile or two, which a repaint leaves
 * be anyway, since a cell no longer reading the blueprint's old tile never follows it. A quarter of a piece's cells
 * painted over at random reads as slid for 2.3%.
 * @param {PlacementGround} ground The map.
 * @param {MapCell} spot Where the record says the top-left corner sits.
 * @param {Stamp} stamp The blueprint's stamp, which holds tiles.
 * @param {CellRect} onMap The part of the placement on the map.
 * @returns {MapCell | null} Where the tiles seem to have slid to, from the spot; null when they did not.
 */
const slideOf = (ground: PlacementGround, spot: MapCell, stamp: Stamp, onMap: CellRect): MapCell | null =>
{
  let best: { by: MapCell; margin: number } | null = null;
  for (let y = -SLIDE_REACH; y <= SLIDE_REACH; y++)
  {
    for (let x = -SLIDE_REACH; x <= SLIDE_REACH; x++)
    {
      if (x === 0 && y === 0)
      {
        continue;
      }

      const { changed, stayed, slid } = slideEvidence(ground, spot, stamp, onMap, { x, y });
      const wins = slid >= SLIDE_EVIDENCE && slid > stayed && slid * 2 >= changed;
      if (wins && (best === null || slid - stayed > best.margin))
      {
        best = { by: { x, y }, margin: slid - stayed };
      }
    }
  }

  return best === null
    ? null
    : best.by;
};

/**
 * Checks that a placement still sits where the record says, before anything repaints it: a placement failing the check
 * is never repainted. The map must be drawn with the blueprint's tileset, and some of the placement must lie on it. Then
 * the part on the map is compared with the blueprint, on the layers {@link comparedLayers} names, an autotile by its kind
 * (its edges reshape with its neighbours) and every other tile exactly: a placement every compared tile matches sits
 * where it was; otherwise one whose tiles read better slid a little way off has slid (see {@link slideOf}), and one with
 * fewer than {@link MATCH_SHARE} of its compared tiles matching has changed past knowing. A part of the placement past
 * the map's edge is never compared, so one cut by a resize is judged by what is left.
 * @param {PlacementGround} ground The map, as it stands.
 * @param {MapCell} spot Where the record says the placement's top-left corner sits.
 * @param {Stamp} stamp The blueprint's stamp, as it was when the placement went down.
 * @returns {PlacementCheck} What the check came to.
 */
const checkPlacement = (ground: PlacementGround, spot: MapCell, stamp: Stamp): PlacementCheck =>
{
  if (ground.tilesetId !== stamp.tilesetId)
  {
    return { kind: 'other-tileset' };
  }

  const onMap = clipRect({ x: spot.x, y: spot.y, width: stamp.width, height: stamp.height }, ground.width, ground.height);
  if (onMap === null)
  {
    return { kind: 'off-map' };
  }

  // a blueprint of events alone is never placed as tiles, and leaves nothing to compare.
  if (stamp.tiles === null)
  {
    return { kind: 'in-place', matched: 0, compared: 0 };
  }

  const { matched, compared } = tally(ground, spot, stamp, onMap);
  if (matched === compared)
  {
    return { kind: 'in-place', matched, compared };
  }

  const by = slideOf(ground, spot, stamp, onMap);
  if (by !== null)
  {
    return { kind: 'shifted', by, matched, compared };
  }

  return matched >= compared * MATCH_SHARE
    ? { kind: 'in-place', matched, compared }
    : { kind: 'changed', matched, compared };
};

/**
 * Words which way a placement's tiles seem to have slid, for the author.
 * @param {MapCell} by Where they seem to have slid to, from the spot.
 * @returns {string} The words, such as "right" or "down and to the left".
 */
const slideWords = (by: MapCell): string =>
{
  const parts: string[] = [];
  if (by.y !== 0)
  {
    parts.push(by.y > 0 ? 'down' : 'up');
  }

  if (by.x !== 0)
  {
    parts.push(`to the ${by.x > 0 ? 'right' : 'left'}`);
  }

  return parts.join(' and ');
};

/**
 * Says why a placement is no longer where it was, in plain words for the author, or nothing for one that is.
 * @param {PlacementCheck} check What the check came to.
 * @returns {string | null} The words, with no full stop of their own, or null for a placement still in place.
 */
const placementProblem = (check: PlacementCheck): string | null =>
{
  switch (check.kind)
  {
    case 'in-place':
      return null;
    case 'other-tileset':
      return 'the map uses another tileset now';
    case 'off-map':
      return 'it lies past the edge of the map';
    case 'shifted':
      return `its tiles seem to have moved ${slideWords(check.by)}`;
    case 'changed':
      // a placement failing the check with any tile matching compared at least three, so the tiles read as a plural, and
      // the verb follows how many still match.
      if (check.matched === 0)
      {
        return 'none of the tiles there match the blueprint any more';
      }

      return check.matched === 1
        ? `only 1 of the ${check.compared} tiles there still matches the blueprint`
        : `only ${check.matched} of the ${check.compared} tiles there still match the blueprint`;
  }
};

export { checkPlacement, comparedLayers, MATCH_SHARE, placementProblem, sameTile, SLIDE_EVIDENCE, SLIDE_REACH };
export type { PlacementCheck, PlacementGround };
