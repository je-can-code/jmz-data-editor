import { describe, expect, it } from 'vitest';
import { BLUEPRINT_USES_DOCUMENT, usesOf, type PlacedSpot } from '../../../../src/mapEditor/core/blueprints/blueprintUses.ts';
import {
  carrySpans,
  liesWithin,
  resizedSpots,
  spanOnMap,
  spansOnMap,
  spansWithin,
  type PlacementSpan,
} from '../../../../src/mapEditor/core/blueprints/placementSpans.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { Stamp } from '../../../../src/mapEditor/core/stamps/stamp.ts';
import { holdBlueprints, holdBlueprintUses } from '../../support/blueprintFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * How far each placement reaches comes from its blueprint, and that is what says whether whatever moves tiles takes a
 * placement with it. The rules owed:
 *
 * - a placement's span is its blueprint's size from its spot, compared on its blueprint's tile layers, and the cells it
 *   covers are those its tiles went down on: the part placed, for one the map's edge cut off; a placement of a blueprint
 *   the window does not hold, or one gone, or one of events alone, has no span, since nothing says how far it reaches,
 *   and so nothing ever moves it;
 * - a piece of the map lifted off carries a placement only when every one of its cells on the map lies within the piece
 *   and every layer it is compared on is carried; a placement only partly inside, or lifted without its layers, stays;
 * - a resize moves every spot with the tiles under it, and forgets a placement whose cells all lie outside the new size,
 *   keeping one left partly on the map, its spot past the edge if need be, with the cells left as its part placed, which
 *   no later growth gives back; one whose size nothing can tell is judged by its corner, forgotten once that lies past the
 *   new right or bottom edge, where none of it can be left, and kept otherwise;
 * - a piece moved takes its placements with it, and a piece copied records them again where it lands, leaving the
 *   originals, each keeping as its part the cells the map holds where it lands; one landing wholly past the map's edge
 *   is left out.
 *
 * The camp (aa22) is 3 by 2, of ground and objects; the sign (bb33) is 1 by 1 and carries layer 4 alone; the bats
 * (k3x9q2mf) are events alone.
 */

/**
 * Builds a stamp of a size carrying the layers given, every value empty.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {readonly number[]} layers The layers carried.
 * @returns {Stamp} The stamp.
 */
const tilesOf = (width: number, height: number, layers: readonly number[]): Stamp =>
{
  const values = new Array<number>(width * height * layers.length).fill(0);
  return stampOf({ width, height, tiles: { layers: [ ...layers ], values, calledFor: values.map(() => -1) }, events: [] });
};

/**
 * Builds a window holding map 1, 10 by 8, the three blueprints, and the placements given.
 * @param {readonly PlacedSpot[]} spots The placements.
 * @returns {DocumentHub} The window's documents.
 */
const windowWith = (spots: readonly PlacedSpot[]): DocumentHub =>
{
  const hub = new DocumentHub({ clientId: 'window-a' });
  hub.adopt('map:1', { ...buildMapJson(), width: 10, height: 8, data: new Array(10 * 8 * 6).fill(0) } as unknown as JsonValue);
  holdBlueprints(hub, {
    aa22: { name: 'Goblin camp', stamp: tilesOf(3, 2, [ 0, 1, 2, 3, 4, 5 ]) },
    bb33: { name: 'Sign', stamp: tilesOf(1, 1, [ 3 ]) },
    k3x9q2mf: { name: 'Bats', stamp: stampOf({ width: 2, height: 1 }) },
  });
  holdBlueprintUses(hub, spots);
  return hub;
};

/**
 * Builds a span of the camp at a spot.
 * @param {number} x The column.
 * @param {number} y The row.
 * @returns {PlacementSpan} The span.
 */
const camp = (x: number, y: number): PlacementSpan => ({ blueprintId: 'aa22', x, y, width: 3, height: 2, layers: [ 0, 1, 2, 3 ] });

/**
 * The map's size.
 */
const SIZE = { width: 10, height: 8 };

describe('spansOnMap', () =>
{
  it('gives each placement on a map its blueprint\'s size and the layers it is compared on', () =>
  {
    // Arrange: the camp and the sign on map 1, and the camp on map 2.
    const hub = windowWith([
      { blueprintId: 'aa22', mapId: 1, x: 2, y: 3 },
      { blueprintId: 'bb33', mapId: 1, x: 0, y: 0 },
      { blueprintId: 'aa22', mapId: 2, x: 5, y: 5 },
    ]);

    // Act.
    const spans = spansOnMap(hub, 1);

    // Assert.
    expect(spans)
      .toStrictEqual([ camp(2, 3), { blueprintId: 'bb33', x: 0, y: 0, width: 1, height: 1, layers: [ 3 ] } ]);
  });

  it('leaves out a placement whose size nothing can tell: of a blueprint gone, or of events alone', () =>
  {
    // Arrange.
    const hub = windowWith([
      { blueprintId: 'zz99', mapId: 1, x: 2, y: 3 },
      { blueprintId: 'k3x9q2mf', mapId: 1, x: 0, y: 0 },
      { blueprintId: 'aa22', mapId: 1, x: 6, y: 0 },
    ]);

    // Act.
    const spans = spansOnMap(hub, 1);

    // Assert.
    expect(spans)
      .toStrictEqual([ camp(6, 0) ]);
  });

  it('tells nothing in a window holding no blueprints, or no record it can read', () =>
  {
    // Arrange: one window holding the record alone, and one holding the blueprints beside something that is no record.
    const recordAlone = new DocumentHub({ clientId: 'window-a' });
    holdBlueprintUses(recordAlone, [ { blueprintId: 'aa22', mapId: 1, x: 2, y: 3 } ]);
    const broken = new DocumentHub({ clientId: 'window-a' });
    holdBlueprints(broken, { aa22: { name: 'Goblin camp', stamp: tilesOf(3, 2, [ 0 ]) } });
    broken.adopt(BLUEPRINT_USES_DOCUMENT, { schemaVersion: 1, data: { maps: [] } });

    // Act.
    const spans = [ spansOnMap(recordAlone, 1), spansOnMap(broken, 1) ];

    // Assert.
    expect(spans)
      .toStrictEqual([ [], [] ]);
  });
});

describe('spanOnMap and liesWithin', () =>
{
  it('finds the part of a placement on the map, and none for one wholly past its edge', () =>
  {
    // Arrange: one hanging past the left edge, one past the right, one wholly below.
    const spans = [ camp(-1, 0), camp(9, 6), camp(0, 8) ];

    // Act.
    const parts = spans.map(span => spanOnMap(span, SIZE.width, SIZE.height));

    // Assert.
    expect(parts)
      .toStrictEqual([ { x: 0, y: 0, width: 2, height: 2 }, { x: 9, y: 6, width: 1, height: 2 }, null ]);
  });

  it('tells a rectangle within another, its edges on the other\'s included, from one reaching a cell past any side', () =>
  {
    // Arrange: an area 4 by 3 at 2, 2, the camp filling its corner, and the camp a cell past each side in turn.
    const area = { x: 2, y: 2, width: 4, height: 3 };
    const inner = [ camp(2, 2), camp(3, 3), camp(1, 2), camp(4, 2), camp(2, 1), camp(2, 4) ];

    // Act.
    const within = inner.map(rect => liesWithin(rect, area));

    // Assert.
    expect(within)
      .toStrictEqual([ true, true, false, false, false, false ]);
  });
});

describe('spansWithin', () =>
{
  it('carries the placements lying wholly within a piece with every layer they are compared on', () =>
  {
    // Arrange: the camp inside the piece, the camp one cell out of it, and the sign inside.
    const spans = [ camp(2, 2), camp(5, 2), { blueprintId: 'bb33', x: 3, y: 4, width: 1, height: 1, layers: [ 3 ] } ];

    // Act.
    const everyLayer = spansWithin(spans, { x: 2, y: 2, width: 4, height: 3 }, [ 0, 1, 2, 3, 4, 5 ], SIZE);
    const layerFour = spansWithin(spans, { x: 2, y: 2, width: 4, height: 3 }, [ 3 ], SIZE);

    // Assert: lifted from layer 4 alone, the camp stays and the sign goes.
    expect([ everyLayer, layerFour ])
      .toStrictEqual([ [ spans[0], spans[2] ], [ spans[2] ] ]);
  });

  it('carries a placement hanging past the map\'s edge by the part of it on the map, and never one wholly off it', () =>
  {
    // Arrange: the camp hanging past the left edge, and one wholly past the top.
    const spans = [ camp(-1, 0), camp(0, -2) ];

    // Act.
    const carried = spansWithin(spans, { x: 0, y: 0, width: 2, height: 2 }, [ 0, 1, 2, 3 ], SIZE);

    // Assert.
    expect(carried)
      .toStrictEqual([ spans[0] ]);
  });
});

describe('resizedSpots', () =>
{
  it('moves every spot with the tiles under it, forgetting a placement wholly outside the new size', () =>
  {
    // Arrange: the map cut to 6 by 8 from the left, so the old map moves four cells left; the camp at 0, 0 falls wholly
    // outside, the camp at 2, 3 hangs past the new left edge, and the camp at 6, 5 stays whole.
    const spots = [ { blueprintId: 'aa22', x: 0, y: 0 }, { blueprintId: 'aa22', x: 2, y: 3 }, { blueprintId: 'aa22', x: 6, y: 5 } ];

    // Act.
    const resized = resizedSpots(spots, [ camp(0, 0), camp(2, 3), camp(6, 5) ], { x: -4, y: 0 }, { width: 6, height: 8 });

    // Assert: the camp hanging past the edge keeps its last column, the one the map still holds, as its part placed.
    expect(resized)
      .toStrictEqual({
        kept: [ { blueprintId: 'aa22', x: -2, y: 3, placed: { x: 2, y: 0, width: 1, height: 2 } }, { blueprintId: 'aa22', x: 2, y: 5 } ],
        lost: [ { blueprintId: 'aa22', x: 0, y: 0 } ],
      });
  });

  it('never gives a placement back the cells a resize cut off, however far the map grows again', () =>
  {
    // Arrange: the camp cut to its last column by a resize from the left, as above.
    const [ cut ] = resizedSpots([ { blueprintId: 'aa22', x: 2, y: 3 } ], [ camp(2, 3) ], { x: -4, y: 0 }, { width: 6, height: 8 }).kept;
    const span = { ...camp(cut.x, cut.y), ...cut };

    // Act: the map grown back by four on the left, then by four more.
    const grown = resizedSpots([ cut ], [ span ], { x: 4, y: 0 }, { width: 10, height: 8 }).kept;
    const grownAgain = resizedSpots(grown, [ { ...span, ...grown[0] } ], { x: 4, y: 0 }, { width: 14, height: 8 }).kept;

    // Assert.
    expect([ grown, grownAgain ])
      .toStrictEqual([
        [ { blueprintId: 'aa22', x: 2, y: 3, placed: { x: 2, y: 0, width: 1, height: 2 } } ],
        [ { blueprintId: 'aa22', x: 6, y: 3, placed: { x: 2, y: 0, width: 1, height: 2 } } ],
      ]);
  });

  it('forgets a cut placement once the cells it put down all lie outside, though its whole blueprint would still reach in', () =>
  {
    // Arrange: the camp at 7, 0 holding its first column alone, then the map cut to 7 wide from the right.
    const cut = { blueprintId: 'aa22', x: 7, y: 0, placed: { x: 0, y: 0, width: 1, height: 2 } };

    // Act.
    const resized = resizedSpots([ cut ], [ { ...camp(7, 0), ...cut } ], { x: 0, y: 0 }, { width: 7, height: 8 });

    // Assert.
    expect(resized)
      .toStrictEqual({ kept: [], lost: [ cut ] });
  });

  it('keeps a placement whose size nothing can tell, moved, while its corner may still reach onto the map', () =>
  {
    // Arrange: placements of a blueprint gone, one moved far past the new left edge, one onto the new map's last cell.
    const spots = [ { blueprintId: 'zz99', x: 0, y: 0 }, { blueprintId: 'zz99', x: 9, y: 7 } ];

    // Act.
    const resized = resizedSpots(spots, [], { x: -4, y: 0 }, { width: 6, height: 8 });

    // Assert.
    expect(resized)
      .toStrictEqual({ kept: [ { blueprintId: 'zz99', x: -4, y: 0 }, { blueprintId: 'zz99', x: 5, y: 7 } ], lost: [] });
  });

  it('forgets a placement whose size nothing can tell once its corner lies past the new right or bottom edge', () =>
  {
    // Arrange: the map cut to 6 by 8 from the right and the bottom, so nothing moves; placements of a blueprint gone, with
    // their corners one past the new right edge, one past the new bottom edge, and one on the map beside each.
    const spots = [
      { blueprintId: 'zz99', x: 6, y: 0 },
      { blueprintId: 'zz99', x: 5, y: 0 },
      { blueprintId: 'zz99', x: 0, y: 8 },
      { blueprintId: 'zz99', x: 0, y: 7 },
    ];

    // Act.
    const resized = resizedSpots(spots, [], { x: 0, y: 0 }, { width: 6, height: 8 });

    // Assert.
    expect(resized)
      .toStrictEqual({
        kept: [ { blueprintId: 'zz99', x: 5, y: 0 }, { blueprintId: 'zz99', x: 0, y: 7 } ],
        lost: [ { blueprintId: 'zz99', x: 6, y: 0 }, { blueprintId: 'zz99', x: 0, y: 8 } ],
      });
  });
});

describe('carrySpans', () =>
{
  it('moves a moved piece\'s placements with it, leaving every other where it was, as part of the step moving it', () =>
  {
    // Arrange: the camp at 2, 2, carried, and the sign at 0, 0, not.
    const hub = windowWith([ { blueprintId: 'aa22', mapId: 1, x: 2, y: 2 }, { blueprintId: 'bb33', mapId: 1, x: 0, y: 0 } ]);

    // Act.
    const step = hub.edit('Move tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [ camp(2, 2) ], { x: 3, y: -1 }, SIZE, false));

    // Assert.
    expect([ step === null, usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)) ])
      .toStrictEqual([ false, [ { blueprintId: 'aa22', x: 5, y: 1, mapId: 1 }, { blueprintId: 'bb33', x: 0, y: 0, mapId: 1 } ] ]);
  });

  it('records a copied piece\'s placements again where it lands, the originals staying', () =>
  {
    // Arrange.
    const hub = windowWith([ { blueprintId: 'aa22', mapId: 1, x: 2, y: 2 } ]);

    // Act.
    hub.edit('Copy tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [ camp(2, 2) ], { x: 3, y: -1 }, SIZE, true));

    // Assert: row by row, as the record keeps them.
    expect(usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)))
      .toStrictEqual([ { blueprintId: 'aa22', x: 5, y: 1, mapId: 1 }, { blueprintId: 'aa22', x: 2, y: 2, mapId: 1 } ]);
  });

  it('leaves out a placement put down wholly past the map\'s edge, and changes nothing when the piece carries none', () =>
  {
    // Arrange.
    const hub = windowWith([ { blueprintId: 'aa22', mapId: 1, x: 7, y: 2 } ]);

    // Act.
    hub.edit('Move tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [ camp(7, 2) ], { x: 3, y: 0 }, SIZE, false));
    const moved = usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));
    const none = hub.edit('Move tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [], { x: 1, y: 0 }, SIZE, false));

    // Assert.
    expect([ moved, none ])
      .toStrictEqual([ [], null ]);
  });

  it('keeps as a moved placement\'s part the cells the map holds where it lands, and no more once back on the map', () =>
  {
    // Arrange: the camp at 6, 2.
    const hub = windowWith([ { blueprintId: 'aa22', mapId: 1, x: 6, y: 2 } ]);

    // Act: moved two right, so its last column falls past the edge, then two left again.
    hub.edit('Move tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [ camp(6, 2) ], { x: 2, y: 0 }, SIZE, false));
    const [ pastEdge ] = usesOf(hub.document(BLUEPRINT_USES_DOCUMENT));
    const { mapId: _mapId, ...cut } = pastEdge;
    hub.edit('Move tiles', [ mapHistoryKey(1) ], tx => carrySpans(tx, hub, 1, [ { ...camp(8, 2), ...cut } ], { x: -2, y: 0 }, SIZE, false));

    // Assert: the column dropped past the edge never comes back.
    expect([ pastEdge, usesOf(hub.document(BLUEPRINT_USES_DOCUMENT)) ])
      .toStrictEqual([
        { blueprintId: 'aa22', x: 8, y: 2, placed: { x: 0, y: 0, width: 2, height: 2 }, mapId: 1 },
        [ { blueprintId: 'aa22', x: 6, y: 2, placed: { x: 0, y: 0, width: 2, height: 2 }, mapId: 1 } ],
      ]);
  });
});

describe('spanOnMap with a part placed', () =>
{
  it('finds a cut placement\'s cells on the map by its part, never the cells the edge cut off', () =>
  {
    // Arrange: the camp at 8, 0 holding its first two columns, on a map grown to 12 wide since.
    const span = { ...camp(8, 0), placed: { x: 0, y: 0, width: 2, height: 2 } };

    // Act.
    const cells = [ spanOnMap(span, 12, 8), spanOnMap(camp(8, 0), 12, 8) ];

    // Assert.
    expect(cells)
      .toStrictEqual([ { x: 8, y: 0, width: 2, height: 2 }, { x: 8, y: 0, width: 3, height: 2 } ]);
  });
});
