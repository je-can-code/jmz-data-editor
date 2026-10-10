import type { MapCell, MapSize } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';

/**
 * The way a player faces, as RMMZ numbers the four: down, left, right and up, as on a number pad.
 */
type Facing = 2 | 4 | 6 | 8;

/**
 * One edge of a map.
 */
type MapEdge = 'top' | 'bottom' | 'left' | 'right';

/**
 * A strip along one edge of a map, one tile deep, the way a map's edge exits are drawn: which edge, where along it the
 * strip starts, counted from the left along the top and bottom and from the top along the sides, and how many tiles long
 * it is.
 */
type EdgeStrip = {
  readonly edge: MapEdge;
  readonly start: number;
  readonly length: number;
};

/**
 * Each edge's opposite: the edge a player arrives by, having left by this one.
 */
const OPPOSITE_EDGE: Readonly<Record<MapEdge, MapEdge>> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * The way a player faces leaving a map by each edge, which is the way they face arriving on the next: the way they were
 * walking.
 */
const LEAVING_FACING: Readonly<Record<MapEdge, Facing>> = { top: 8, bottom: 2, left: 4, right: 6 };

/**
 * Reports whether an edge runs across the map, from side to side, as the top and bottom do.
 * @param {MapEdge} edge The edge.
 * @returns {boolean} True for the top and the bottom.
 */
const runsAcross = (edge: MapEdge): boolean =>
{
  return edge === 'top' || edge === 'bottom';
};

/**
 * Measures an edge in tiles.
 * @param {MapEdge} edge The edge.
 * @param {MapSize} size The map's size.
 * @returns {number} How many tiles long it is.
 */
const edgeLength = (edge: MapEdge, size: MapSize): number =>
{
  return runsAcross(edge)
    ? size.width
    : size.height;
};

/**
 * Reads where a tile lies along an edge: its column along the top and bottom, its row along the sides.
 * @param {MapCell} cell The tile.
 * @param {MapEdge} edge The edge.
 * @returns {number} Its place along the edge.
 */
const placeAlong = (cell: MapCell, edge: MapEdge): number =>
{
  return runsAcross(edge)
    ? cell.x
    : cell.y;
};

/**
 * Keeps a number between two others.
 * @param {number} value The number.
 * @param {number} low The lowest it may be.
 * @param {number} high The highest it may be.
 * @returns {number} The number, kept between them.
 */
const clamp = (value: number, low: number, high: number): number =>
{
  return Math.min(high, Math.max(low, value));
};

/**
 * Lists the edges a tile lies on: none inside the map, one along an edge, and two in a corner.
 * @param {MapCell} cell The tile, on the map.
 * @param {MapSize} size The map's size.
 * @returns {MapEdge[]} The edges, the top or bottom ahead of a side.
 */
const edgesAt = (cell: MapCell, size: MapSize): MapEdge[] =>
{
  const across: MapEdge[] = [ ...(cell.y === 0 ? [ 'top' as const ] : []), ...(cell.y === size.height - 1 ? [ 'bottom' as const ] : []) ];
  const sides: MapEdge[] = [ ...(cell.x === 0 ? [ 'left' as const ] : []), ...(cell.x === size.width - 1 ? [ 'right' as const ] : []) ];
  return [ ...across, ...sides ];
};

/**
 * Finds the rectangle of tiles a strip covers on its map.
 * @param {EdgeStrip} strip The strip.
 * @param {MapSize} size The map's size.
 * @returns {CellRect} The rectangle, its top-left tile being where the strip's event stands.
 */
const stripRect = (strip: EdgeStrip, size: MapSize): CellRect =>
{
  const { start, length } = strip;
  switch (strip.edge)
  {
    case 'top':
      return { x: start, y: 0, width: length, height: 1 };
    case 'bottom':
      return { x: start, y: size.height - 1, width: length, height: 1 };
    case 'left':
      return { x: 0, y: start, width: 1, height: length };
    case 'right':
      return { x: size.width - 1, y: start, width: 1, height: length };
  }
};

/**
 * Works out a strip dragged along an edge: from the tile the drag began on to the tile under the pointer now, read along
 * the edge the drag began on and kept to it, however far into the map the pointer strays. A drag beginning in a corner
 * runs along the edge the pointer has moved along most, across the map while it has not moved at all. A drag beginning
 * off every edge makes no strip.
 * @param {MapCell} from Where the drag began.
 * @param {MapCell} to Where the pointer is now.
 * @param {MapSize} size The map's size.
 * @returns {EdgeStrip | null} The strip, or null when the drag began off every edge.
 */
const stripFromDrag = (from: MapCell, to: MapCell, size: MapSize): EdgeStrip | null =>
{
  const edges = edgesAt(from, size);
  if (edges.length === 0)
  {
    return null;
  }

  // a corner lies on two edges; the drag's own direction says which it follows.
  const across = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
  const edge = edges.find(each => runsAcross(each) === across) ?? edges[0];
  const first = placeAlong(from, edge);
  const last = clamp(placeAlong(to, edge), 0, edgeLength(edge, size) - 1);
  return { edge, start: Math.min(first, last), length: Math.abs(last - first) + 1 };
};

/**
 * Works out the strip a pair's other end starts as: on the other map's opposite edge, as long as the first strip, or as
 * long as that edge where it is shorter, and centred along it, the earlier of two middles when it cannot be exactly.
 * @param {EdgeStrip} strip The first end's strip.
 * @param {MapSize} size The other map's size.
 * @returns {EdgeStrip} The other end's strip.
 */
const partnerStrip = (strip: EdgeStrip, size: MapSize): EdgeStrip =>
{
  const edge = OPPOSITE_EDGE[strip.edge];
  const length = Math.min(strip.length, edgeLength(edge, size));
  return { edge, start: Math.floor((edgeLength(edge, size) - length) / 2), length };
};

/**
 * Moves a strip along its edge to centre on a tile's place along it, as near as the edge allows: where the author clicks
 * to move a pair's other end.
 * @param {EdgeStrip} strip The strip.
 * @param {MapCell} cell The tile, anywhere on the map.
 * @param {MapSize} size The map's size.
 * @returns {EdgeStrip} The strip, moved.
 */
const stripCentredOn = (strip: EdgeStrip, cell: MapCell, size: MapSize): EdgeStrip =>
{
  const start = placeAlong(cell, strip.edge) - Math.floor(strip.length / 2);
  return { ...strip, start: clamp(start, 0, edgeLength(strip.edge, size) - strip.length) };
};

/**
 * Finds the middle of a strip, along its edge: its one middle tile, or the later of its two. The shipped edge pairs land
 * on either of two middles about as often; this is the one they land on a little more.
 * @param {EdgeStrip} strip The strip.
 * @returns {number} The middle's place along the edge.
 */
const stripMiddle = (strip: EdgeStrip): number =>
{
  return strip.start + Math.floor(strip.length / 2);
};

/**
 * Finds where a player arriving through a strip lands: one tile in from the strip's edge, at its middle, as the shipped
 * edge pairs land, clear of the strip that would send them straight back.
 * @param {EdgeStrip} strip The strip they arrive by.
 * @param {MapSize} size Its map's size.
 * @returns {MapCell} The tile they land on.
 */
const arrivalThrough = (strip: EdgeStrip, size: MapSize): MapCell =>
{
  const middle = stripMiddle(strip);
  switch (strip.edge)
  {
    case 'top':
      return { x: middle, y: 1 };
    case 'bottom':
      return { x: middle, y: size.height - 2 };
    case 'left':
      return { x: 1, y: middle };
    case 'right':
      return { x: size.width - 2, y: middle };
  }
};

/**
 * Reads the way a player faces arriving on the next map, having left by an edge: the way they were walking.
 * @param {MapEdge} edge The edge they left by.
 * @returns {Facing} The way they face.
 */
const facingLeaving = (edge: MapEdge): Facing =>
{
  return LEAVING_FACING[edge];
};

/**
 * Finds where a player entering a building lands: one tile north of the exit placed inside, the exit being the dip in the
 * bottom wall they leave by again.
 * @param {MapCell} exit The exit's tile.
 * @returns {MapCell} The tile they land on.
 */
const insideArrival = (exit: MapCell): MapCell =>
{
  return { x: exit.x, y: exit.y - 1 };
};

/**
 * Finds where a player leaving a building lands: one tile below the door they went in by.
 * @param {MapCell} door The door's tile.
 * @returns {MapCell} The tile they land on.
 */
const outsideArrival = (door: MapCell): MapCell =>
{
  return { x: door.x, y: door.y + 1 };
};

export {
  arrivalThrough,
  edgeLength,
  edgesAt,
  facingLeaving,
  insideArrival,
  OPPOSITE_EDGE,
  outsideArrival,
  partnerStrip,
  stripCentredOn,
  stripFromDrag,
  stripMiddle,
  stripRect,
};
export type { EdgeStrip, Facing, MapEdge };
