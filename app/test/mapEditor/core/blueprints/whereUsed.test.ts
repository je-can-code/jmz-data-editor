import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import type { PlacementGround } from '../../../../src/mapEditor/core/blueprints/placementMatch.ts';
import { lookFailure, placementMiddle, standingOf, whereUsed } from '../../../../src/mapEditor/core/blueprints/whereUsed.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { blankGrid, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * Where a blueprint is used, as the Blueprints section lists it: map by map, in id order, each placement of its tiles row
 * by row, and each copy of its events by id. Each placement stands somewhere: still being checked until its map has been
 * looked at; in place, or no longer where it was, with why, by the match check once it has; no longer where it was when
 * its map is gone, a file the server no longer has; and not to be told, with why, when the map could not be read for any
 * other reason, which says nothing about whether it is there. A click shows a placement at its middle.
 */

/**
 * A blueprint of one object, 2 by 1, on tileset 4.
 */
const SIGNPOST = (() =>
{
  const values = [ 0, 0, 0, 0, 0, 0, 10, 0 ];
  return stampOf({ width: 2, height: 1, tiles: { layers: [ 0, 1, 2, 3 ], values, calledFor: values.map(() => -1) }, events: [] });
})();

/**
 * Builds a map 4 by 1 on tileset 4 holding the signpost's object at a column, or nowhere.
 * @param {number | null} x The column, or null for none.
 * @returns {PlacementGround} The map.
 */
const mapWithSign = (x: number | null): PlacementGround =>
{
  const grid = blankGrid(4, 1);
  if (x !== null)
  {
    put(grid, x, 0, 3, 10);
  }

  return { ...grid, tilesetId: 4 };
};

describe('whereUsed', () =>
{
  it('lists every map a blueprint is used on, by id, its placements row by row and its events\' copies by id', () =>
  {
    // Arrange: placements on maps 16 and 3, and copies of its events on maps 16 and 20.
    const spots = [
      { blueprintId: 'aa22', mapId: 16, x: 9, y: 4 },
      { blueprintId: 'aa22', mapId: 3, x: 1, y: 1 },
      { blueprintId: 'aa22', mapId: 16, x: 2, y: 4 },
      { blueprintId: 'aa22', mapId: 16, x: 30, y: 0 },
    ];
    const copies = [
      { mapId: 20, eventId: 5, blueprintId: 'aa22', blueprintEventId: 1 },
      { mapId: 16, eventId: 12, blueprintId: 'aa22', blueprintEventId: 1 },
      { mapId: 16, eventId: 7, blueprintId: 'aa22', blueprintEventId: 2 },
    ];

    // Act.
    const uses = whereUsed(spots, copies);

    // Assert.
    expect(uses)
      .toStrictEqual([
        { mapId: 3, spots: [ { x: 1, y: 1 } ], eventIds: [] },
        { mapId: 16, spots: [ { x: 30, y: 0 }, { x: 2, y: 4 }, { x: 9, y: 4 } ], eventIds: [ 7, 12 ] },
        { mapId: 20, spots: [], eventIds: [ 5 ] },
      ]);
  });

  it('lists nothing for a blueprint used nowhere', () =>
  {
    // Arrange: nothing.

    // Act.
    const uses = whereUsed([], []);

    // Assert.
    expect(uses)
      .toStrictEqual([]);
  });
});

describe('lookFailure', () =>
{
  it('takes a map whose file the server no longer has for gone, and any other failure for a map not to be read', () =>
  {
    // Arrange: a missing file, a failing server, and something thrown that is no error at all.
    const failures = [
      new MapEditorApiError('GET /api/maps/16 answered 404', 404),
      new MapEditorApiError('GET /api/maps/16 answered 500', 500, 'the disk is full'),
      'gone wrong',
    ];

    // Act.
    const looks = failures.map(lookFailure);

    // Assert.
    expect(looks)
      .toStrictEqual([
        { kind: 'gone' },
        { kind: 'unreadable', message: 'GET /api/maps/16 answered 500' },
        { kind: 'unreadable', message: 'gone wrong' },
      ]);
  });
});

describe('standingOf', () =>
{
  it('is still checking until the map has been looked at', () =>
  {
    // Arrange: no look asked for yet, and one on its way.

    // Act.
    const standings = [ standingOf(undefined, { x: 0, y: 0 }, SIGNPOST), standingOf({ kind: 'looking' }, { x: 0, y: 0 }, SIGNPOST) ];

    // Assert.
    expect(standings)
      .toStrictEqual([ { kind: 'checking' }, { kind: 'checking' } ]);
  });

  it('checks a placement against its blueprint once the map is there: in place, or no longer where it was, with why', () =>
  {
    // Arrange: the sign where the record says, and the sign gone.
    const looks = [ mapWithSign(1), mapWithSign(null) ].map(ground => ({ kind: 'looked', ground }) as const);

    // Act.
    const standings = looks.map(looked => standingOf(looked, { x: 1, y: 0 }, SIGNPOST));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'in-place' },
        { kind: 'lost', reason: 'none of the tiles there match the blueprint any more' },
      ]);
  });

  it('takes a placement on a map that is gone for no longer where it was, and one on a map not to be read for unknown', () =>
  {
    // Arrange.
    const looks = [ { kind: 'gone' }, { kind: 'unreadable', message: 'the disk is full' } ] as const;

    // Act.
    const standings = looks.map(looked => standingOf(looked, { x: 1, y: 0 }, SIGNPOST));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'lost', reason: 'the map is gone' },
        { kind: 'unknown', reason: 'the map could not be read (the disk is full)' },
      ]);
  });
});

describe('placementMiddle', () =>
{
  it('finds the middle cell of a placement, rounding toward its corner', () =>
  {
    // Arrange: an odd size and an even one.
    const sizes = [ { width: 3, height: 5 }, { width: 4, height: 2 } ];

    // Act.
    const middles = sizes.map(size => placementMiddle({ x: 10, y: -1 }, size));

    // Assert.
    expect(middles)
      .toStrictEqual([ { x: 11, y: 1 }, { x: 12, y: 0 } ]);
  });
});
