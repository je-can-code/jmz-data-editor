import type { DocumentHub } from '../history/DocumentHub.ts';
import type { Transaction } from '../history/Transaction.ts';
import type { MapCell } from '../renderer/camera.ts';
import type { CellRect } from '../renderer/MapRenderer.ts';
import { clipRect } from '../tools/geometry.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, type Blueprint } from './blueprints.ts';
import { changeMapSpots, readableUses, sameSpot, spotsOnMap, type BlueprintSpot } from './blueprintUses.ts';
import { comparedLayers } from './placementMatch.ts';

/**
 * A placement the record holds, with what its blueprint says of it: the cells it spans from its spot, and the layers its
 * tiles are compared on, which are the layers that make it what it is.
 */
type PlacementSpan = BlueprintSpot & {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly number[];
};

/**
 * What a resize does to a map's placements: the spots kept, each moved with the tiles under it, and the placements left
 * wholly outside the new size, which go with the tiles there.
 */
type ResizedSpots = {
  readonly kept: readonly BlueprintSpot[];
  readonly lost: readonly BlueprintSpot[];
};

/**
 * Finds a blueprint the window holds, for its size and layers; nothing when the window does not hold the blueprints, the
 * blueprint is gone, or its entry cannot be read.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {string} blueprintId The blueprint.
 * @returns {Blueprint | null} The blueprint, or null.
 */
const knownBlueprint = (hub: Pick<DocumentHub, 'has' | 'document'>, blueprintId: string): Blueprint | null =>
{
  if (hub.has(BLUEPRINTS_DOCUMENT) === false)
  {
    return null;
  }

  try
  {
    return blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId);
  }
  catch
  {
    return null;
  }
};

/**
 * Lists the placements the record holds on a map whose size the window can tell, each with its blueprint's size and the
 * layers its tiles are compared on: what says whether a resize leaves a placement on the map, and whether a piece of the
 * map lifted off carries one whole. A placement of a blueprint the window does not hold, or one that is gone, is left
 * out, since nothing says how far it reaches; whatever moves tiles leaves its spot where it is.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @returns {PlacementSpan[]} The placements, in the record's order.
 */
const spansOnMap = (hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number): PlacementSpan[] =>
{
  const uses = readableUses(hub);
  if (uses === null)
  {
    return [];
  }

  return spotsOnMap(uses, mapId).flatMap(spot =>
  {
    const blueprint = knownBlueprint(hub, spot.blueprintId);
    const { stamp } = blueprint ?? { stamp: null };
    return stamp === null || stamp.tiles === null
      ? []
      : [ { ...spot, width: stamp.width, height: stamp.height, layers: comparedLayers(stamp.tiles) } ];
  });
};

/**
 * Finds the part of a placement on a map of a size.
 * @param {PlacementSpan} span The placement.
 * @param {number} width The map's width.
 * @param {number} height The map's height.
 * @returns {CellRect | null} The part on the map, or null when none of it is.
 */
const spanOnMap = (span: PlacementSpan, width: number, height: number): CellRect | null =>
{
  return clipRect(span, width, height);
};

/**
 * Reports whether one rectangle lies wholly within another.
 * @param {CellRect} inner The rectangle that may lie within.
 * @param {CellRect} outer The rectangle it may lie within.
 * @returns {boolean} True when every cell of the first is a cell of the second.
 */
const liesWithin = (inner: CellRect, outer: CellRect): boolean =>
{
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
};

/**
 * Lists the placements a piece of a map lifted off carries whole, so they travel with it: those with some of their tiles
 * on the map, all of those inside the piece, and every layer they are compared on among the layers it carries. A
 * placement only partly inside, or lifted without its layers, stays where it is, and its spot with it; whatever the
 * piece took from it shows when it is next checked.
 * @param {readonly PlacementSpan[]} spans The map's placements.
 * @param {CellRect} area The cells the piece was lifted from, all on the map.
 * @param {readonly number[]} layers The layers the piece carries.
 * @param {{ width: number, height: number }} size The map's size.
 * @returns {PlacementSpan[]} The placements it carries.
 */
const spansWithin = (
  spans: readonly PlacementSpan[],
  area: CellRect,
  layers: readonly number[],
  size: { readonly width: number; readonly height: number },
): PlacementSpan[] =>
{
  return spans.filter(span =>
  {
    const onMap = spanOnMap(span, size.width, size.height);
    return onMap !== null && liesWithin(onMap, area) && span.layers.every(layer => layers.includes(layer));
  });
};

/**
 * Works out a map's placements after a resize: every spot moves with the tiles under it, by the resize's offset, and a
 * placement whose blueprint says it lies wholly outside the new size goes, as an event left outside does, its tiles being
 * gone with the rest outside. A placement left partly on the map stays, its spot past the edge if need be, and is judged
 * from then on by the part still on the map. A placement whose size nothing can tell stays too.
 * @param {readonly BlueprintSpot[]} spots The map's spots as they stand.
 * @param {readonly PlacementSpan[]} spans What the window can tell of how far each reaches.
 * @param {MapCell} offset How far the old map moves inside the new one.
 * @param {{ width: number, height: number }} size The new size.
 * @returns {ResizedSpots} The spots kept, moved, and the placements lost, where they stood.
 */
const resizedSpots = (
  spots: readonly BlueprintSpot[],
  spans: readonly PlacementSpan[],
  offset: MapCell,
  size: { readonly width: number; readonly height: number },
): ResizedSpots =>
{
  const kept: BlueprintSpot[] = [];
  const lost: BlueprintSpot[] = [];
  spots.forEach(spot =>
  {
    const moved = { ...spot, x: spot.x + offset.x, y: spot.y + offset.y };
    const span = spans.find(each => sameSpot(each, spot)) ?? null;
    const outside = span !== null && spanOnMap({ ...span, x: moved.x, y: moved.y }, size.width, size.height) === null;
    if (outside)
    {
      lost.push(spot);
      return;
    }

    kept.push(moved);
  });

  return { kept, lost };
};

/**
 * Takes the placements a piece of a map carries along with it, inside the open transaction that puts the piece down
 * elsewhere on the same map, as the select tool's drag does: moved, each spot goes where the piece took its tiles; copied,
 * each is recorded again there too, the piece being as much a copy of its blueprint as the tiles it came from. A
 * placement the piece puts down wholly past the map's edge is left out, its tiles being dropped there.
 * @param {Transaction} tx The open transaction.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @param {readonly PlacementSpan[]} carried The placements the piece holds whole (see {@link spansWithin}).
 * @param {MapCell} by How far the piece goes.
 * @param {{ width: number, height: number }} size The map's size.
 * @param {boolean} copy True when the piece is copied, leaving its tiles where they were.
 */
const carrySpans = (
  tx: Transaction,
  hub: Pick<DocumentHub, 'has' | 'document'>,
  mapId: number,
  carried: readonly PlacementSpan[],
  by: MapCell,
  size: { readonly width: number; readonly height: number },
  copy: boolean,
): void =>
{
  if (carried.length === 0)
  {
    return;
  }

  const landed = carried
    .map(span => ({ ...span, x: span.x + by.x, y: span.y + by.y }))
    .filter(span => spanOnMap(span, size.width, size.height) !== null)
    .map(({ blueprintId, x, y }) => ({ blueprintId, x, y }));
  changeMapSpots(tx, hub, mapId, spots => [
    ...(copy ? spots : spots.filter(spot => carried.some(each => sameSpot(each, spot)) === false)),
    ...landed,
  ]);
};

export { carrySpans, liesWithin, resizedSpots, spanOnMap, spansOnMap, spansWithin };
export type { PlacementSpan, ResizedSpots };
