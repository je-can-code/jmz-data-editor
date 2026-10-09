import { describe, expect, it } from 'vitest';
import { MapEditorApiError } from '../../../../src/mapEditor/core/api/MapEditorApi.ts';
import { withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import type { CopyGround } from '../../../../src/mapEditor/core/blueprints/copyPlans.ts';
import {
  copyStandingOf,
  lookFailure,
  placementMiddle,
  standingOf,
  whereUsed,
  type LookedMap,
} from '../../../../src/mapEditor/core/blueprints/whereUsed.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { stampOf } from '../../support/stampFixtures.ts';
import { blankGrid, put } from '../tiles/support/tileGridBuilder.ts';

/*
 * Where a blueprint is used, as the Blueprints section lists it: map by map, in id order, each placement of its tiles row
 * by row, and each copy of its events by id. Each placement stands somewhere: still being checked until its map has been
 * looked at; in place, or no longer where it was, with why, by the match check once it has; no longer where it was when
 * its map is gone, a file the server no longer has; and not to be told, with why, when the map could not be read for any
 * other reason, which says nothing about whether it is there. A placement the map's edge cut off keeps the part it put
 * down, is checked by it, and is shown by it: a click shows a placement at the middle of what it put down.
 *
 * Each copy of its events stands somewhere too, once its map has been looked at: following its blueprint, or drifted too
 * far for a change to reach, with why. A copy drifts by what it holds, which the look shows (more or fewer pages than its
 * blueprint's event, a link to an event its blueprint no longer keeps, a note that would read otherwise without its
 * link), or by what the last change to its blueprint found, which only that change could see. An event no longer a copy
 * of the blueprint, and one on a map that is gone or not to be read, stands nowhere that can be told.
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
 * Builds a map 4 by 1 on tileset 4 holding the signpost's object at a column, or nowhere, and no events.
 * @param {number | null} x The column, or null for none.
 * @returns {CopyGround} The map.
 */
const mapWithSign = (x: number | null): CopyGround =>
{
  const grid = blankGrid(4, 1);
  if (x !== null)
  {
    put(grid, x, 0, 3, 10);
  }

  return { ...grid, tilesetId: 4, events: [ null ] };
};

/**
 * The blueprint whose copies are told apart.
 */
const CAMP = 'k3x9q2mf';

/**
 * A blueprint of a guard (event 1, one page) and a chest (event 2, two pages).
 */
const CAMP_STAMP = stampOf({
  width: 2,
  height: 1,
  events: [
    { ...createMapEvent(1, 0, 0), name: 'Guard' },
    { ...createMapEvent(2, 1, 0), name: 'Chest', pages: [ createEventPage(), createEventPage() ] },
  ],
});

/**
 * Builds an event on the map: a copy of one of a blueprint's events, by its link, with a number of pages and whatever
 * its note says besides.
 * @param {number} eventId Its id on the map.
 * @param {{ blueprintId?: string, of?: number, pages?: number, note?: string }} fields The blueprint it is a copy of,
 * the blueprint's event, how many pages it has (one unless told), and its note; a note given is taken as it is, link
 * and all.
 * @returns {RmmzMapEvent} The event.
 */
const copyOn = (
  eventId: number,
  fields: { readonly blueprintId?: string; readonly of?: number; readonly pages?: number; readonly note?: string },
): RmmzMapEvent =>
{
  const { blueprintId = CAMP, of = 1, pages = 1 } = fields;
  const note = fields.note ?? withBlueprintLink('', { blueprintId, eventId: of, differences: [] });
  return { ...createMapEvent(eventId, eventId, 0), note, pages: Array.from({ length: pages }, () => createEventPage()) };
};

/**
 * Looks at a map holding events in their slots by id, slot 0 empty.
 * @param {readonly (RmmzMapEvent | null)[]} events The events from id 1.
 * @returns {LookedMap} The look.
 */
const lookedWith = (events: readonly (RmmzMapEvent | null)[]): LookedMap =>
{
  return { kind: 'looked', ground: { ...blankGrid(8, 1), tilesetId: 4, events: [ null, ...events ] } };
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

  it('keeps the part placed of a placement the map\'s edge cut off, and none for one placed whole', () =>
  {
    // Arrange.
    const spots = [
      { blueprintId: 'aa22', mapId: 3, x: -1, y: 0, placed: { x: 1, y: 0, width: 1, height: 1 } },
      { blueprintId: 'aa22', mapId: 3, x: 2, y: 0 },
    ];

    // Act.
    const uses = whereUsed(spots, []);

    // Assert.
    expect(uses)
      .toStrictEqual([ { mapId: 3, spots: [ { x: -1, y: 0, placed: { x: 1, y: 0, width: 1, height: 1 } }, { x: 2, y: 0 } ], eventIds: [] } ]);
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

  it('checks a placement the map\'s edge cut off by the part it put down, whatever lies where the rest would be', () =>
  {
    // Arrange: the signpost's first cell, its object, put down on the map's last column; the map then grown, an object
    // painted where the cut cell would be.
    const ground = mapWithSign(3);
    const grown = { ...blankGrid(6, 1), tilesetId: 4, events: [ null ] };
    put(grown, 3, 0, 3, 10);
    put(grown, 4, 0, 3, 99);

    // Act.
    const standings = [ ground, grown ].map(each => standingOf({ kind: 'looked', ground: each }, { x: 3, y: 0, placed: { x: 0, y: 0, width: 1, height: 1 } }, SIGNPOST));

    // Assert.
    expect(standings)
      .toStrictEqual([ { kind: 'in-place' }, { kind: 'in-place' } ]);
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

describe('copyStandingOf', () =>
{
  it('is still checking until the map has been looked at', () =>
  {
    // Arrange: no look asked for yet, and one on its way.
    const looks = [ undefined, { kind: 'looking' } ] as const;

    // Act.
    const standings = looks.map(looked => copyStandingOf(looked, 1, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([ { kind: 'checking' }, { kind: 'checking' } ]);
  });

  it('cannot tell where a copy stands on a map that is gone, or one not to be read, and says why', () =>
  {
    // Arrange.
    const looks = [ { kind: 'gone' }, { kind: 'unreadable', message: 'the disk is full' } ] as const;

    // Act.
    const standings = looks.map(looked => copyStandingOf(looked, 1, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'unknown', reason: 'the map is gone' },
        { kind: 'unknown', reason: 'the map could not be read (the disk is full)' },
      ]);
  });

  it('cannot tell where an event stands that is no longer a copy of this blueprint: gone, unlinked, or another\'s', () =>
  {
    // Arrange: a copy that follows (1), an empty slot (2), an event with no link (3), a copy of another blueprint (4), and
    // an id past the last event (5).
    const looked = lookedWith([ copyOn(1, {}), null, copyOn(3, { note: 'a plain event' }), copyOn(4, { blueprintId: 'aaaa' }) ]);

    // Act.
    const standings = [ 1, 2, 3, 4, 5 ].map(eventId => copyStandingOf(looked, eventId, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'following' },
        { kind: 'unknown', reason: 'it is no longer a copy of this blueprint' },
        { kind: 'unknown', reason: 'it is no longer a copy of this blueprint' },
        { kind: 'unknown', reason: 'it is no longer a copy of this blueprint' },
        { kind: 'unknown', reason: 'it is no longer a copy of this blueprint' },
      ]);
  });

  it('takes a copy of an event its blueprint no longer keeps for drifted', () =>
  {
    // Arrange: a copy of the guard, and a copy of event 3, which the blueprint does not keep.
    const looked = lookedWith([ copyOn(1, { of: 1 }), copyOn(2, { of: 3 }) ]);

    // Act.
    const standings = [ 1, 2 ].map(eventId => copyStandingOf(looked, eventId, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([ { kind: 'following' }, { kind: 'drifted', reason: 'its blueprint keeps no such event any more' } ]);
  });

  it('takes a copy with more or fewer pages than its blueprint\'s event for drifted, saying how many each has', () =>
  {
    // Arrange: the chest with its two pages, the chest with one, and the guard with two.
    const looked = lookedWith([ copyOn(1, { of: 2, pages: 2 }), copyOn(2, { of: 2, pages: 1 }), copyOn(3, { of: 1, pages: 2 }) ]);

    // Act.
    const standings = [ 1, 2, 3 ].map(eventId => copyStandingOf(looked, eventId, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'following' },
        { kind: 'drifted', reason: 'it has 1 page and its blueprint has 2 pages' },
        { kind: 'drifted', reason: 'it has 2 pages and its blueprint has 1 page' },
      ]);
  });

  it('takes a copy whose note would read otherwise without its link for drifted, saying why', () =>
  {
    // Arrange: a stray bracket right before the link opens nothing while the link stands, and would open a tag of its own
    // were the link taken out; and a copy whose note is only its link.
    const looked = lookedWith([ copyOn(1, { note: `z<${withBlueprintLink('', { blueprintId: CAMP, eventId: 1, differences: [] })}w> <moveSpeed:6.0>` }), copyOn(2, {}) ]);

    // Act.
    const standings = [ 1, 2 ].map(eventId => copyStandingOf(looked, eventId, CAMP_STAMP, CAMP, null));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'drifted', reason: 'in its note, the game would read the rest of this note differently; look for a stray < in it' },
        { kind: 'following' },
      ]);
  });

  it('takes a copy the last change to its blueprint could not reach for drifted, with the reason it gave', () =>
  {
    // Arrange: one copy, which holds nothing that drifts it, told about with a reason and without one.
    const looked = lookedWith([ copyOn(1, {}) ]);

    // Act.
    const standings = [ 'on page 1, its tag line cannot take the sight it must follow to', null ].map(reason => copyStandingOf(looked, 1, CAMP_STAMP, CAMP, reason));

    // Assert.
    expect(standings)
      .toStrictEqual([
        { kind: 'drifted', reason: 'on page 1, its tag line cannot take the sight it must follow to' },
        { kind: 'following' },
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

  it('finds the middle of the part a placement cut off by the edge put down, which is what the map shows of it', () =>
  {
    // Arrange: a 4 by 3 blueprint whose corner is two columns past the map's left edge, its last two columns placed.
    const spot = { x: -2, y: 0, placed: { x: 2, y: 0, width: 2, height: 3 } };

    // Act.
    const middle = placementMiddle(spot, { width: 4, height: 3 });

    // Assert.
    expect(middle)
      .toStrictEqual({ x: 1, y: 1 });
  });
});
