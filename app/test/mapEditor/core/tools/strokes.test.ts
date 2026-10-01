import { describe, expect, it } from 'vitest';
import { applyTileEdit, FreehandTrail, PaintStroke, QuarterTrail } from '../../../../src/mapEditor/core/tools/strokes.ts';
import { benchWith, cellsOf } from './support/paintFixtures.ts';

/*
 * Strokes.
 *
 * A freehand stroke paints every cell the pointer passes over, however fast it is dragged, each cell once, and the
 * whole stroke, from press to release, lands as one step of the map's history that one undo takes back. Changes show
 * on the map as they are made; a stroke that changed nothing leaves nothing in the history, and a cancelled stroke
 * leaves the map as it found it.
 */
describe('FreehandTrail', () =>
{
  it('covers the cells between two far-apart moves, with no gaps', () =>
  {
    // Arrange: a one-cell footprint.
    const trail = new FreehandTrail(1, 1);
    trail.moveTo({ x: 0, y: 0 });

    // Act: a jump four cells right.
    const cells = trail.moveTo({ x: 4, y: 0 });

    // Assert.
    expect(cells)
      .toEqual([ { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 } ]);
  });

  it('lays the whole footprint at each step, and never covers a cell twice in one stroke', () =>
  {
    // Arrange: a 2x2 footprint pressed at 0, 0.
    const trail = new FreehandTrail(2, 2);
    const first = trail.moveTo({ x: 0, y: 0 });

    // Act: one step right, then back where it started.
    const second = trail.moveTo({ x: 1, y: 0 });
    const back = trail.moveTo({ x: 0, y: 0 });

    // Assert: the new column only, and nothing on the way back.
    expect([ first.length, second, back ])
      .toEqual([ 4, [ { x: 2, y: 0 }, { x: 2, y: 1 } ], [] ]);
  });
});

describe('QuarterTrail', () =>
{
  it('crosses the quarters between two moves in half-tile steps, each once', () =>
  {
    // Arrange: pressed on tile 0, 0's top-left quarter.
    const trail = new QuarterTrail();
    const first = trail.moveTo({ x: 0, y: 0, quarter: 0 });

    // Act: across to tile 1's top-right quarter, then back onto the start.
    const across = trail.moveTo({ x: 1, y: 0, quarter: 1 });
    const back = trail.moveTo({ x: 0, y: 0, quarter: 0 });

    // Assert.
    expect([ first, across, back ])
      .toEqual([
        [ { x: 0, y: 0, quarter: 0 } ],
        [ { x: 0, y: 0, quarter: 1 }, { x: 1, y: 0, quarter: 0 }, { x: 1, y: 0, quarter: 1 } ],
        [],
      ]);
  });
});

describe('PaintStroke', () =>
{
  it('shows each change at once and records the whole stroke as one step that one undo takes back', () =>
  {
    // Arrange.
    const { hub, map, history } = benchWith(3, 1);
    const before = cellsOf(map);
    const stroke = new PaintStroke(hub, map, 'Paint tiles');

    // Act: two changes, then the release.
    stroke.apply([ [ 0, 10 ] ]);
    const midway = map.cellAt(0, 0, 0);
    stroke.apply([ [ 1, 11 ] ]);
    const step = stroke.commit();
    const painted = cellsOf(map);
    hub.undo(history);

    // Assert.
    expect([ midway, step?.label, hub.history(history).rows.length, painted.slice(0, 2), cellsOf(map) ])
      .toEqual([ 10, 'Paint tiles', 1, [ 10, 11 ], before ]);
  });

  it('leaves nothing in the history for a stroke that changed nothing', () =>
  {
    // Arrange.
    const { hub, map, history } = benchWith(2, 1);
    const stroke = new PaintStroke(hub, map, 'Paint tiles');

    // Act.
    stroke.apply([]);
    const step = stroke.commit();

    // Assert.
    expect([ step, hub.history(history).rows ])
      .toEqual([ null, [] ]);
  });

  it('puts the map back as it was when cancelled, and paints nothing more once finished', () =>
  {
    // Arrange.
    const { hub, map, history } = benchWith(2, 1);
    const before = cellsOf(map);
    const stroke = new PaintStroke(hub, map, 'Paint tiles');
    stroke.apply([ [ 0, 10 ] ]);

    // Act.
    stroke.cancel();
    stroke.apply([ [ 1, 11 ] ]);

    // Assert.
    expect([ cellsOf(map), hub.history(history).rows, stroke.isOpen, stroke.commit() ])
      .toEqual([ before, [], false, null ]);
  });
});

describe('applyTileEdit', () =>
{
  it('makes an edit as one named step, and nothing at all when there is nothing to change', () =>
  {
    // Arrange.
    const { hub, map, history } = benchWith(2, 1);

    // Act.
    const empty = applyTileEdit(hub, map, 'Fill', []);
    const filled = applyTileEdit(hub, map, 'Fill', [ [ 0, 10 ], [ 1, 10 ] ]);

    // Assert.
    expect([ empty, filled?.label, hub.history(history).rows.map(row => row.label), map.cellAt(1, 0, 0) ])
      .toEqual([ null, 'Fill', [ 'Fill' ], 10 ]);
  });
});
