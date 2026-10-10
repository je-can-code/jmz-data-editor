import { describe, expect, it } from 'vitest';
import {
  closedTiles,
  freshSavePages,
  landingGroundOf,
  landingProblem,
  landingWords,
  type LandingGround,
  type LandingProblem,
} from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent, RmmzTileset } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PassabilityQuery, PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import type { PageRule } from '../../../../src/mapEditor/core/pageRule/pageRule.ts';
import type { ActivePages } from '../../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A transfer's landing is where the game puts the player down, and the check is what the picker and the map trust to
 * say the player could stand there and play on. It owes the engine's own answer: a tile on the map, no event standing
 * there that the player can never share a tile with (as Game_CharacterBase#isCollidedWithEvents finds one, each event
 * read by the page a fresh save shows), and at least one step off it, as Game_CharacterBase#canPass takes a step: the
 * next tile on the map, wrapping round a map that loops, the way out of this tile and the way into the next both open,
 * each read top layer first with star tiles skipped and the tile pictures of events below characters on top, then every
 * plugin rule. Stairs, open only up and down, are landings; a wall, the space beyond a room, and an open tile walled in on
 * every side are not.
 *
 * When it refuses, it says why, in the order it asks: no such map, off the map, an event in the way, then the steps:
 * blocked when the tile's own passage stops every way, the rules' reasons when a rule took a way, and otherwise stuck.
 * Every rule is pinned beside a near miss that differs from it by one thing.
 */

/**
 * The tiles the fixtures paint with, and what their flags make of them.
 */
const Tile = {
  // nothing painted: a star, as tile 0 is in MZ's tilesets.
  none: 0,
  ground: 1,
  wall: 2,
  star: 3,
  stairs: 4,
} as const;

/**
 * A tileset over the fixture tiles: ground lets every way through, a wall none, a star has no say, and stairs stop the
 * ways left and right.
 * @returns {RmmzTileset} The tileset.
 */
const buildTileset = (): RmmzTileset =>
{
  const flags = new Array(16).fill(0);
  flags[Tile.none] = 0x10;
  flags[Tile.ground] = 0;
  flags[Tile.wall] = 0x0f;
  flags[Tile.star] = 0x10;
  flags[Tile.stairs] = 0x06;
  return { id: 4, flags, mode: 1, name: 'Fixture', note: '', tilesetNames: [ '', '', '', '', '', '', '', '', '' ] };
};

/**
 * What one tile of a fixture map holds, by layer, bottom first; left out, ground on the first layer and nothing above.
 */
type Painted = Readonly<Record<string, readonly number[]>>;

/**
 * Builds a fixture map: every tile ground, but the tiles painted otherwise, and the events given.
 * @param {number} width The width.
 * @param {number} height The height.
 * @param {Painted} painted The tiles painted otherwise, by {@code "x,y"}, each layer bottom first.
 * @param {RmmzMapEvent[]} events The events, by id.
 * @param {number} scrollType How the map loops.
 * @returns {MapDocument} The map.
 */
const buildMap = (width: number, height: number, painted: Painted = {}, events: RmmzMapEvent[] = [], scrollType = 0): MapDocument =>
{
  const data = new Array(width * height * 6).fill(0);
  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
      const layers = painted[`${x},${y}`] ?? [ Tile.ground ];
      layers.forEach((tile, z) =>
      {
        data[(z * height + y) * width + x] = tile;
      });
    }
  }

  const slots: (RmmzMapEvent | null)[] = [ null ];
  events.forEach(event =>
  {
    slots[event.id] = event;
  });
  return MapDocument.fromJson('map:1', { ...buildMapJson(), width, height, data, events: slots, scrollType });
};

/**
 * Builds an event standing on a tile with one page, as the page's settings say.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {Partial<RmmzEventPage>} page What its page holds besides a fresh page's.
 * @param {string} name Its name.
 * @returns {RmmzMapEvent} The event.
 */
const standing = (id: number, x: number, y: number, page: Partial<RmmzEventPage>, name = 'Guard'): RmmzMapEvent =>
{
  return { ...createMapEvent(id, x, y), name, pages: [ { ...createEventPage(), ...page } ] };
};

/**
 * Reads every event by its first page, as a page rule with nothing to say does.
 */
const FIRST: ActivePages = freshSavePages(null, 0, null);

/**
 * Makes a fixture map ready to judge, by the rules given and every event's first page unless told otherwise.
 * @param {MapDocument} map The map.
 * @param {readonly PassabilityRule[]} rules The rules.
 * @param {ActivePages} pages Picks each event's page.
 * @returns {LandingGround} The map, ready to judge.
 */
const groundOf = (map: MapDocument, rules: readonly PassabilityRule[] = [], pages: ActivePages = FIRST): LandingGround =>
{
  return landingGroundOf(map, buildTileset(), rules, pages);
};

/**
 * Builds a rule refusing the steps a test names, with a reason, and allowing the rest.
 * @param {(query: PassabilityQuery) => boolean} refuses Which steps it refuses.
 * @param {string} reason Why.
 * @returns {PassabilityRule} The rule.
 */
const refusing = (refuses: (query: PassabilityQuery) => boolean, reason: string): PassabilityRule =>
{
  return { id: 'test.rule', title: 'Test', deny: query => (refuses(query) ? reason : null) };
};

/**
 * The tile one step from a query's tile, as a rule judging where a step goes reads it.
 * @param {PassabilityQuery} query The step.
 * @returns {string} The tile reached, as {@code "x,y"}.
 */
const reached = (query: PassabilityQuery): string =>
{
  const across = (query.direction === 6 ? 1 : 0) - (query.direction === 4 ? 1 : 0);
  const down = (query.direction === 2 ? 1 : 0) - (query.direction === 8 ? 1 : 0);
  return `${query.x + across},${query.y + down}`;
};

describe('landingGroundOf', () =>
{
  it('lands on an open tile with an open tile beside it', () =>
  {
    // Arrange: a 5 by 3 map of open ground.
    const ground = groundOf(buildMap(5, 3));

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toBeNull();
  });

  it('refuses every tile off the map, saying how big the map is, and lands on the last tile on it', () =>
  {
    // Arrange: a 5 by 3 map.
    const ground = groundOf(buildMap(5, 3));

    // Act: past each edge, then the far corner.
    const problems = [ ground.problemAt(5, 0), ground.problemAt(0, 3), ground.problemAt(-1, 0), ground.problemAt(0, -1), ground.problemAt(4, 2) ];

    // Assert.
    const off = { kind: 'off-map', width: 5, height: 3 };
    expect(problems)
      .toStrictEqual([ off, off, off, off, null ]);
  });

  it('refuses a tile whose tiles let no one through any way', () =>
  {
    // Arrange: a wall at 2, 1, on the bottom layer.
    const ground = groundOf(buildMap(5, 3, { '2,1': [ Tile.wall ] }));

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'blocked' });
  });

  it('skips a star tile over a blocked one, which still blocks, where an open tile over it decides instead', () =>
  {
    // Arrange: a star over a wall at 1, 1, and open ground over a wall at 3, 1.
    const ground = groundOf(buildMap(5, 3, { '1,1': [ Tile.wall, Tile.star ], '3,1': [ Tile.wall, Tile.ground ] }));

    // Act.
    const problems = [ ground.problemAt(1, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'blocked' }, null ]);
  });

  it('refuses a tile with nothing painted on it, which is all star tiles', () =>
  {
    // Arrange: nothing on any layer at 2, 1.
    const ground = groundOf(buildMap(5, 3, { '2,1': [ Tile.none ] }));

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'blocked' });
  });

  it('lands on stairs, which let the player off them up and down though not to either side', () =>
  {
    // Arrange: stairs at 2, 1 between walls to the left and right.
    const ground = groundOf(buildMap(5, 3, { '1,1': [ Tile.wall ], '2,1': [ Tile.stairs ], '3,1': [ Tile.wall ] }));

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toBeNull();
  });

  it('refuses an open tile walled in on every side, and lands on one with a single way out', () =>
  {
    // Arrange: 2, 1 walled in on all four sides; 2, 4 walled in on three, open below.
    const walls = { '2,0': [ Tile.wall ], '1,1': [ Tile.wall ], '3,1': [ Tile.wall ], '2,2': [ Tile.wall ] };
    const three = { '2,3': [ Tile.wall ], '1,4': [ Tile.wall ], '3,4': [ Tile.wall ] };
    const ground = groundOf(buildMap(5, 6, { ...walls, ...three }));

    // Act.
    const problems = [ ground.problemAt(2, 1), ground.problemAt(2, 4) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'stuck' }, null ]);
  });

  it('refuses a tile whose next tile refuses the way in, though its own way out is open', () =>
  {
    // Arrange: 0, 0 in the corner, with stairs to its right, which refuse a step in from the side, and a wall below.
    const ground = groundOf(buildMap(3, 3, { '1,0': [ Tile.stairs ], '0,1': [ Tile.wall ] }));

    // Act.
    const problem = ground.problemAt(0, 0);

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'stuck' });
  });

  it('wraps round a map that loops across, where a map that does not stops at its edge', () =>
  {
    // Arrange: 0, 0 with walls to its right and below, on a map that does not loop and on one that loops across.
    const painted = { '1,0': [ Tile.wall ], '0,1': [ Tile.wall ] };
    const grounds = [ groundOf(buildMap(4, 3, painted, [], 0)), groundOf(buildMap(4, 3, painted, [], 2)) ];

    // Act.
    const problems = grounds.map(ground => ground.problemAt(0, 0));

    // Assert: the looping map's step left reaches 3, 0, which is open.
    expect(problems)
      .toStrictEqual([ { kind: 'stuck' }, null ]);
  });

  it('counts the tile picture of an event below characters as one of the tiles, and not one with Through on', () =>
  {
    // Arrange: a wall's picture below characters at 1, 1, and the same picture with Through at 3, 1.
    const wall = { image: { ...createEventPage().image, tileId: Tile.wall }, priorityType: 0 };
    const events = [ standing(1, 1, 1, wall), standing(2, 3, 1, { ...wall, through: true }) ];
    const ground = groundOf(buildMap(5, 3, {}, events));

    // Act.
    const problems = [ ground.problemAt(1, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'blocked' }, null ]);
  });

  it('refuses a tile an event stands on with characters, and lands beside it', () =>
  {
    // Arrange: a guard, same as characters, at 2, 1.
    const ground = groundOf(buildMap(5, 3, {}, [ standing(4, 2, 1, { priorityType: 1 }) ]));

    // Act.
    const problems = [ ground.problemAt(2, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'occupied', eventId: 4, name: 'Guard' }, null ]);
  });

  it('lands on a tile whose event is below or above characters, or goes Through', () =>
  {
    // Arrange: an event below characters, one above, and one with characters but Through.
    const events = [
      standing(1, 1, 1, { priorityType: 0 }),
      standing(2, 2, 1, { priorityType: 2 }),
      standing(3, 3, 1, { priorityType: 1, through: true }),
    ];
    const ground = groundOf(buildMap(5, 3, {}, events));

    // Act.
    const problems = [ ground.problemAt(1, 1), ground.problemAt(2, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ null, null, null ]);
  });

  it('reads each event by the page the pages show, and an event showing none as nothing at all', () =>
  {
    // Arrange: three events with characters on their first page and below them on their second; the pages show the
    // first event's first page, the second's second, and none of the third's.
    const twoPages = (id: number, x: number) => ({
      ...createMapEvent(id, x, 1),
      name: `Event ${id}`,
      pages: [ { ...createEventPage(), priorityType: 1 }, { ...createEventPage(), priorityType: 0 } ],
    });
    const shown = new Map([ [ 1, 0 ], [ 2, 1 ], [ 3, -1 ] ]);
    const pages: ActivePages = { activePage: event => shown.get(event.id) as number };
    const ground = groundOf(buildMap(5, 3, {}, [ twoPages(1, 1), twoPages(2, 2), twoPages(3, 3) ]), [], pages);

    // Act.
    const problems = [ ground.problemAt(1, 1), ground.problemAt(2, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'occupied', eventId: 1, name: 'Event 1' }, null, null ]);
  });

  it('names the first event in the way, and the event before the tiles', () =>
  {
    // Arrange: two guards on a wall at 2, 1.
    const events = [ standing(6, 2, 1, { priorityType: 1 }, 'First'), standing(7, 2, 1, { priorityType: 1 }, 'Second') ];
    const ground = groundOf(buildMap(5, 3, { '2,1': [ Tile.wall ] }, events));

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'occupied', eventId: 6, name: 'First' });
  });

  it('refuses a tile every way off which a rule refuses, giving its reason, and lands where one way is left', () =>
  {
    // Arrange: a rule refusing every way out of 2, 1, and every way out of 3, 1 but down.
    const rule = refusing(query => (query.x === 2 && query.y === 1) || (query.x === 3 && query.y === 1 && query.direction !== 2), 'A ledge.');
    const ground = groundOf(buildMap(5, 3), [ rule ]);

    // Act.
    const problems = [ ground.problemAt(2, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'denied', reasons: [ 'A ledge.' ] }, null ]);
  });

  it('reads a rule refusing the way back onto a tile from every side, as a region kept clear does', () =>
  {
    // Arrange: a rule refusing every step onto 2, 1, from whichever side.
    const ground = groundOf(buildMap(5, 3), [ refusing(query => reached(query) === '2,1', 'Region 10 keeps everyone out.') ]);

    // Act: the tile itself, and the tile beside it, whose other ways are open.
    const problems = [ ground.problemAt(2, 1), ground.problemAt(3, 1) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'denied', reasons: [ 'Region 10 keeps everyone out.' ] }, null ]);
  });

  it('gives each rule\'s reason once, in the order the ways are tried, beside ways the tiles stop', () =>
  {
    // Arrange: 2, 1 with a wall above; a rule refusing the way down and the way left, another the way right.
    const below = refusing(query => query.x === 2 && query.y === 1 && (query.direction === 2 || query.direction === 4), 'A ledge.');
    const right = refusing(query => query.x === 2 && query.y === 1 && query.direction === 6, 'A fence.');
    const ground = groundOf(buildMap(5, 3, { '2,0': [ Tile.wall ] }), [ below, right ]);

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'denied', reasons: [ 'A ledge.', 'A fence.' ] });
  });

  it('calls a tile blocked when its own tiles stop every way, whatever a rule would say', () =>
  {
    // Arrange: a wall at 2, 1, and a rule refusing every step.
    const ground = groundOf(buildMap(5, 3, { '2,1': [ Tile.wall ] }), [ refusing(() => true, 'Nowhere.') ]);

    // Act.
    const problem = ground.problemAt(2, 1);

    // Assert: the rule is never asked about a step the tiles stop.
    expect(problem)
      .toStrictEqual({ kind: 'blocked' });
  });

  it('keeps the map it judges', () =>
  {
    // Arrange.
    const map = buildMap(5, 3);

    // Act.
    const ground = groundOf(map);

    // Assert.
    expect(ground.map)
      .toBe(map);
  });
});

describe('landingProblem', () =>
{
  it('refuses a landing on a map that does not exist, naming it', () =>
  {
    // Arrange: no map to judge.

    // Act.
    const problem = landingProblem(null, { mapId: 327, x: 4, y: 5 });

    // Assert.
    expect(problem)
      .toStrictEqual({ kind: 'no-map', mapId: 327 });
  });

  it('judges a landing on a map that does, at its tile', () =>
  {
    // Arrange: a wall at 2, 1.
    const ground = groundOf(buildMap(5, 3, { '2,1': [ Tile.wall ] }));

    // Act.
    const problems = [ landingProblem(ground, { mapId: 1, x: 2, y: 1 }), landingProblem(ground, { mapId: 1, x: 3, y: 1 }) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'blocked' }, null ]);
  });
});

describe('landingWords', () =>
{
  it('says why the player cannot land, for every reason', () =>
  {
    // Arrange: one of each.
    const problems: LandingProblem[] = [
      { kind: 'no-map', mapId: 327 },
      { kind: 'off-map', width: 10, height: 15 },
      { kind: 'occupied', eventId: 4, name: 'Guard' },
      { kind: 'occupied', eventId: 5, name: '' },
      { kind: 'blocked' },
      { kind: 'denied', reasons: [ 'Region 10 keeps everyone out.', 'Terrain tag 1 keeps everyone off.' ] },
      { kind: 'stuck' },
    ];

    // Act.
    const words = problems.map(landingWords);

    // Assert.
    expect(words)
      .toStrictEqual([
        'Map 327 does not exist.',
        'That tile is off the map, which is 10 by 15 tiles.',
        'Guard (event 4) stands there, and the player cannot share its tile.',
        'An event (event 5) stands there, and the player cannot share its tile.',
        'The tiles there let no one through.',
        'There is no way off it. Region 10 keeps everyone out. Terrain tag 1 keeps everyone off.',
        'There is no way off it: every tile around it is blocked.',
      ]);
  });
});

describe('closedTiles', () =>
{
  it('joins each row\'s closed tiles into runs, and a run into the same run on the rows below', () =>
  {
    // Arrange: walls filling columns 0 and 1 of rows 0 to 2, a lone wall at 4, 0, and a run of three on row 3.
    const walls: Record<string, number[]> = {};
    [ '0,0', '1,0', '0,1', '1,1', '0,2', '1,2', '4,0', '2,3', '3,3', '4,3' ].forEach(cell =>
    {
      walls[cell] = [ Tile.wall ];
    });
    const ground = groundOf(buildMap(5, 4, walls));

    // Act.
    const rectangles = closedTiles(ground);

    // Assert: the open tile at 4, 1, under the lone wall, still has ways off it, so it lands.
    expect(rectangles)
      .toStrictEqual([
        { x: 0, y: 0, width: 2, height: 3 },
        { x: 4, y: 0, width: 1, height: 1 },
        { x: 2, y: 3, width: 3, height: 1 },
      ]);
  });

  it('keeps runs of different widths apart, row to row', () =>
  {
    // Arrange: two walls on row 0, and three below them on row 1.
    const ground = groundOf(buildMap(4, 3, { '0,0': [ Tile.wall ], '1,0': [ Tile.wall ], '0,1': [ Tile.wall ], '1,1': [ Tile.wall ], '2,1': [ Tile.wall ] }));

    // Act.
    const rectangles = closedTiles(ground);

    // Assert.
    expect(rectangles)
      .toStrictEqual([ { x: 0, y: 0, width: 2, height: 1 }, { x: 0, y: 1, width: 3, height: 1 } ]);
  });

  it('lists nothing on a map the player can land anywhere on', () =>
  {
    // Arrange: open ground.
    const ground = groundOf(buildMap(4, 3));

    // Act.
    const rectangles = closedTiles(ground);

    // Assert.
    expect(rectangles)
      .toStrictEqual([]);
  });
});

describe('freshSavePages', () =>
{
  /**
   * A rule with one condition, shown only from 18:00, on pages whose first command is a comment saying "night", and
   * only in the season numbered 2, on pages whose comment says "summer".
   */
  const RULE: PageRule = {
    save: { party: [] },
    conditions: [ {
      id: 'test.moments',
      read: page =>
      {
        const [ first ] = page.list;
        const said = first.code === 108 ? String(first.parameters[0]) : '';
        if (said === 'night')
        {
          return { followsClock: true, holds: moment => moment.timeOfDay >= 1080, words: [] };
        }

        return said === 'summer'
          ? { followsClock: false, followsDate: true, holds: moment => moment.season === 2, words: [] }
          : null;
      },
    } ],
  };

  /**
   * Builds an event whose second page carries a comment.
   * @param {string} said What the comment says.
   * @returns {RmmzMapEvent} The event.
   */
  const gated = (said: string): RmmzMapEvent =>
  {
    const second = { ...createEventPage(), list: [ { code: 108, indent: 0, parameters: [ said ] }, { code: 0, indent: 0, parameters: [] } ] };
    return { ...createMapEvent(1, 0, 0), pages: [ createEventPage(), second ] };
  };

  it('shows the page the rule picks at the clock\'s time of day', () =>
  {
    // Arrange.
    const event = gated('night');

    // Act.
    const shown = [ freshSavePages(RULE, 600, null).activePage(event), freshSavePages(RULE, 1200, null).activePage(event) ];

    // Assert.
    expect(shown)
      .toStrictEqual([ 0, 1 ]);
  });

  it('shows the page the rule picks in the clock\'s season', () =>
  {
    // Arrange.
    const event = gated('summer');

    // Act.
    const shown = [ freshSavePages(RULE, 600, null).activePage(event), freshSavePages(RULE, 600, 2).activePage(event) ];

    // Assert.
    expect(shown)
      .toStrictEqual([ 0, 1 ]);
  });

  it('shows a page waiting for a switch only once it is on, which on a fresh save it never is', () =>
  {
    // Arrange: a second page waiting for switch 4.
    const event = gated('');
    event.pages[1] = { ...event.pages[1], conditions: { ...event.pages[1].conditions, switch1Valid: true, switch1Id: 4 } };

    // Act.
    const shown = freshSavePages(RULE, 600, null).activePage(event);

    // Assert.
    expect(shown)
      .toBe(0);
  });

  it('shows every event\'s first page without a rule', () =>
  {
    // Arrange.
    const event = gated('night');

    // Act.
    const shown = freshSavePages(null, 1200, null).activePage(event);

    // Assert.
    expect(shown)
      .toBe(0);
  });
});
