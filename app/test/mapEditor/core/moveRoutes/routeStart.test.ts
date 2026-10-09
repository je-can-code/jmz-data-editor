import { describe, expect, it } from 'vitest';
import { blueprintMapId } from '../../../../src/mapEditor/core/model/documentKeys.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { createEventPage, createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzEventCommand, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { routeSettingOf, routeStart, walkerImage, type RouteSetting } from '../../../../src/mapEditor/core/moveRoutes/routeStart.ts';
import type { WalkMap } from '../../../../src/mapEditor/core/moveRoutes/routeWalk.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A route's preview starts its walker where the walker will really be when the route runs, as far as the page can
 * tell, and says how it knows. So the setting owes the preview the map, event and page an event page's list belongs
 * to, and nothing for a common event's list, which has no map of its own.
 *
 * The start replays, in order, every Set Movement Route and Set Event Location before the route on its page that moves
 * the same walker, through the map's walls, and names it "earlier" when one did. A Set Event Location given directly
 * places its character, turning it when it names a facing and Direction Fix allows; one given by variables places
 * nothing the editor can know; an exchange swaps two characters, whichever side the walker is on. Commands moving
 * someone else never move the walker, and commands it cannot read are passed over. With nothing before it moving the
 * walker, the route starts where the walker is placed: an event on its tile, facing as its page's picture does, with
 * that page's Direction Fix and Through; the player beside the event that runs the list. With nothing placing it, the
 * event running a common event or an event the map lacks, it starts in the middle of the map.
 */
describe('routeSettingOf', () =>
{
  it('reads the map, the event and the page an event page\'s list belongs to', () =>
  {
    // Arrange.
    const before: RmmzEventCommand[] = [ { code: 230, indent: 0, parameters: [ 30 ] } ];

    // Act.
    const setting = routeSettingOf({ documentKey: 'map:7', listPath: [ 'events', 3, 'pages', 1, 'list' ], before }, 0);

    // Assert.
    expect(setting)
      .toStrictEqual({ mapId: 7, page: { eventId: 3, pageIndex: 1 }, before, characterId: 0 });
  });

  it('reads the event and the page a list of a blueprint opened as a map belongs to, the blueprint being a map to its events', () =>
  {
    // Arrange: nothing beyond the camp's event 3's second page.

    // Act.
    const setting = routeSettingOf({ documentKey: 'blueprint-map:k3x9q2mf', listPath: [ 'events', 3, 'pages', 1, 'list' ], before: [] }, 0);

    // Assert.
    expect(setting)
      .toStrictEqual({ mapId: blueprintMapId('k3x9q2mf'), page: { eventId: 3, pageIndex: 1 }, before: [], characterId: 0 });
  });

  it('names no page for a list on a map that is not a page\'s', () =>
  {
    // Arrange: nothing beyond a list path that is not a page's.

    // Act.
    const setting = routeSettingOf({ documentKey: 'map:7', listPath: [ 'list' ], before: [] }, -1);

    // Assert.
    expect(setting)
      .toStrictEqual({ mapId: 7, page: null, before: [], characterId: -1 });
  });

  it('says nothing for a common event\'s list, which has no map of its own', () =>
  {
    // Arrange: nothing beyond a common event's list.

    // Act.
    const setting = routeSettingOf({ documentKey: 'common-events', listPath: [ 4, 'list' ], before: [] }, 0);

    // Assert.
    expect(setting)
      .toBeNull();
  });
});

describe('routeStart', () =>
{
  /**
   * Builds an open 6x6 map, map 7, holding events; a wall lets nothing out and nothing in.
   * @param {readonly RmmzMapEvent[]} events The events.
   * @param {readonly string[]} walls The walls, as "x,y".
   * @returns {{ map: MapDocument, walkMap: WalkMap }} The map, and its passability.
   */
  const buildMap = (events: readonly RmmzMapEvent[], walls: readonly string[] = []) =>
  {
    const width = 6;
    const height = 6;
    const slots = Array.from({ length: Math.max(...events.map(event => event.id)) + 1 }, (_, id) => events.find(event => event.id === id) ?? null);
    const map = MapDocument.fromJson('map:7', { ...buildMapJson(), width, height, data: new Array(width * height * 6).fill(0), events: slots });
    const blocked = new Set(walls);
    const walkMap: WalkMap = { width, height, loopsX: false, loopsY: false, isPassable: (x, y) => blocked.has(`${x},${y}`) === false };
    return { map, walkMap };
  };

  /**
   * Builds an event whose first page faces a way, with its settings.
   * @param {number} id The event.
   * @param {number} x The column.
   * @param {number} y The row.
   * @param {object} page The page's facing, Direction Fix and Through.
   * @returns {RmmzMapEvent} The event.
   */
  const eventAt = (id: number, x: number, y: number, page: { direction?: number; directionFix?: boolean; through?: boolean } = {}): RmmzMapEvent =>
  {
    const event = createMapEvent(id, x, y);
    const [ first ] = event.pages;
    first.image.direction = page.direction ?? 2;
    first.directionFix = page.directionFix ?? false;
    first.through = page.through ?? false;
    return event;
  };

  /**
   * Builds a Set Movement Route.
   * @param {number} characterId Who moves.
   * @param {readonly number[]} codes The steps.
   * @param {boolean} skippable Whether it skips what it cannot do.
   * @returns {RmmzEventCommand} The command.
   */
  const route = (characterId: number, codes: readonly number[], skippable = false): RmmzEventCommand => ({
    code: 205,
    indent: 0,
    parameters: [ characterId, { list: [ ...codes.map(code => ({ code })), { code: 0 } ], repeat: false, skippable, wait: true } ] as JsonValue[],
  });

  /**
   * Builds a Set Event Location.
   * @param {readonly number[]} parameters Who, how, x (or the other event), y, and the facing.
   * @returns {RmmzEventCommand} The command.
   */
  const placement = (parameters: readonly number[]): RmmzEventCommand => ({ code: 203, indent: 0, parameters: [ ...parameters ] });

  /**
   * Builds a setting on event 1's first page of map 7.
   * @param {number} characterId Who moves.
   * @param {readonly RmmzEventCommand[]} before The commands before the route.
   * @returns {RouteSetting} The setting.
   */
  const onEventOne = (characterId: number, before: readonly RmmzEventCommand[] = []): RouteSetting => ({
    mapId: 7,
    page: { eventId: 1, pageIndex: 0 },
    before,
    characterId,
  });

  it('starts the event running the route where it is placed, facing as its page does, when nothing before moves it', () =>
  {
    // Arrange: event 1 at 1, 1 facing left with Through on; an earlier route moves event 2, not event 1.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1, { direction: 4, through: true }), eventAt(2, 4, 4) ]);

    // Act.
    const start = routeStart(onEventOne(0, [ route(2, [ 3 ]) ]), map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 1, y: 1, facing: 4, directionFix: false, through: true }, from: 'placed' });
  });

  it('reads the page holding the route for its own event, and the first page for any other', () =>
  {
    // Arrange: event 1's second page faces up with Direction Fix; event 2's first page faces right.
    const first = eventAt(1, 1, 1);
    const second = createEventPage();
    second.image.direction = 8;
    second.directionFix = true;
    first.pages.push(second);
    const { map, walkMap } = buildMap([ first, eventAt(2, 4, 4, { direction: 6 }) ]);
    const onSecondPage = (characterId: number): RouteSetting => ({ mapId: 7, page: { eventId: 1, pageIndex: 1 }, before: [], characterId });

    // Act.
    const own = routeStart(onSecondPage(0), map, walkMap);
    const other = routeStart(onSecondPage(2), map, walkMap);

    // Assert.
    expect([ own.walker, other.walker ])
      .toStrictEqual([
        { x: 1, y: 1, facing: 8, directionFix: true, through: false },
        { x: 4, y: 4, facing: 6, directionFix: false, through: false },
      ]);
  });

  it('replays the routes before it on the page, whether they name the event as itself or by its id, past other commands', () =>
  {
    // Arrange: two steps right as "this event", a wait, then one step down naming event 1 by its id.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);
    const wait: RmmzEventCommand = { code: 230, indent: 0, parameters: [ 30 ] };

    // Act.
    const start = routeStart(onEventOne(0, [ route(0, [ 3, 3 ]), wait, route(1, [ 1 ]) ]), map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 3, y: 2, facing: 2, directionFix: false, through: false }, from: 'earlier' });
  });

  it('replays earlier routes through the map\'s walls, holding a stuck route where the wall stopped it', () =>
  {
    // Arrange: a wall two to the right of event 1.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ], [ '3,1' ]);

    // Act.
    const start = routeStart(onEventOne(0, [ route(0, [ 3, 3, 3 ]) ]), map, walkMap);

    // Assert.
    expect(start.walker)
      .toStrictEqual({ x: 2, y: 1, facing: 6, directionFix: false, through: false });
  });

  it('places the walker where a Set Event Location puts it, turning it when the command names a facing', () =>
  {
    // Arrange: event 1 placed at 4, 3 facing up, then at 2, 5 keeping that facing.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);

    // Act.
    const turned = routeStart(onEventOne(0, [ placement([ 0, 0, 4, 3, 8 ]) ]), map, walkMap);
    const kept = routeStart(onEventOne(0, [ placement([ 0, 0, 4, 3, 8 ]), placement([ 1, 0, 2, 5, 0 ]) ]), map, walkMap);

    // Assert.
    expect([ turned, kept.walker ])
      .toStrictEqual([
        { walker: { x: 4, y: 3, facing: 8, directionFix: false, through: false }, from: 'earlier' },
        { x: 2, y: 5, facing: 8, directionFix: false, through: false },
      ]);
  });

  it('keeps the facing a Set Event Location names while Direction Fix holds it', () =>
  {
    // Arrange: event 1's page fixes its facing down.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1, { directionFix: true }) ]);

    // Act.
    const start = routeStart(onEventOne(0, [ placement([ 0, 0, 4, 3, 8 ]) ]), map, walkMap);

    // Assert.
    expect(start.walker)
      .toStrictEqual({ x: 4, y: 3, facing: 2, directionFix: true, through: false });
  });

  it('places nothing for a Set Event Location given by variables', () =>
  {
    // Arrange: variables 4 and 5 hold the tile.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);

    // Act.
    const start = routeStart(onEventOne(0, [ placement([ 0, 1, 4, 5, 0 ]) ]), map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 1, y: 1, facing: 2, directionFix: false, through: false }, from: 'placed' });
  });

  it('swaps the walker with another event, from either side of the exchange', () =>
  {
    // Arrange: event 1 at 1, 1 and event 2 at 4, 4.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1), eventAt(2, 4, 4) ]);

    // Act: event 1 swaps with event 2; then event 2 swaps with "this event", back again.
    const swapped = routeStart(onEventOne(0, [ placement([ 0, 2, 2, 0, 0 ]) ]), map, walkMap);
    const back = routeStart(onEventOne(0, [ placement([ 0, 2, 2, 0, 0 ]), placement([ 2, 2, 0, 0, 0 ]) ]), map, walkMap);

    // Assert.
    expect([ swapped, back ])
      .toStrictEqual([
        { walker: { x: 4, y: 4, facing: 2, directionFix: false, through: false }, from: 'earlier' },
        { walker: { x: 1, y: 1, facing: 2, directionFix: false, through: false }, from: 'earlier' },
      ]);
  });

  it('swaps nothing with the event running a common event, which nothing names', () =>
  {
    // Arrange: on a common event, event 2 swaps with "this event", then the route walks event 2.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1), eventAt(2, 4, 4) ]);
    const common: RouteSetting = { mapId: 7, page: null, before: [ placement([ 2, 2, 0, 0, 0 ]) ], characterId: 2 };

    // Act.
    const start = routeStart(common, map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 4, y: 4, facing: 2, directionFix: false, through: false }, from: 'placed' });
  });

  it('swaps nothing with an event the map lacks', () =>
  {
    // Arrange: event 9 is not on the map.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);

    // Act.
    const start = routeStart(onEventOne(0, [ placement([ 0, 2, 9, 0, 0 ]) ]), map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 1, y: 1, facing: 2, directionFix: false, through: false }, from: 'placed' });
  });

  it('starts the player beside the event running the list, and replays the player\'s earlier routes', () =>
  {
    // Arrange: event 1 at 2, 2 facing left.
    const { map, walkMap } = buildMap([ eventAt(1, 2, 2, { direction: 4 }) ]);

    // Act.
    const placed = routeStart(onEventOne(-1), map, walkMap);
    const walked = routeStart(onEventOne(-1, [ route(-1, [ 4 ]) ]), map, walkMap);

    // Assert.
    expect([ placed, walked ])
      .toStrictEqual([
        { walker: { x: 2, y: 2, facing: 2, directionFix: false, through: false }, from: 'placed' },
        { walker: { x: 2, y: 1, facing: 8, directionFix: false, through: false }, from: 'earlier' },
      ]);
  });

  it('starts in the middle of the map when nothing places the walker', () =>
  {
    // Arrange: a common event's "this event", the player there, and an event the map lacks.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);
    const common = (characterId: number): RouteSetting => ({ mapId: 7, page: null, before: [ route(0, [ 3 ]) ], characterId });

    // Act.
    const starts = [ routeStart(common(0), map, walkMap), routeStart(common(-1), map, walkMap), routeStart(onEventOne(9), map, walkMap) ];

    // Assert.
    expect(starts.map(start => [ start.walker.x, start.walker.y, start.from ]))
      .toStrictEqual([ [ 3, 3, 'unknown' ], [ 3, 3, 'unknown' ], [ 3, 3, 'unknown' ] ]);
  });

  it('passes over the commands before it that it cannot read', () =>
  {
    // Arrange: a route whose route is not MZ-shaped, a placement missing its facing, and a route naming no one.
    const { map, walkMap } = buildMap([ eventAt(1, 1, 1) ]);
    const broken: RmmzEventCommand[] = [
      { code: 205, indent: 0, parameters: [ 0, { list: [] } ] },
      { code: 203, indent: 0, parameters: [ 0, 0, 4, 4 ] },
      { code: 205, indent: 0, parameters: [ 'me', { list: [ { code: 0 } ], repeat: false, skippable: false, wait: true } ] },
    ];

    // Act.
    const start = routeStart(onEventOne(0, broken), map, walkMap);

    // Assert.
    expect(start)
      .toStrictEqual({ walker: { x: 1, y: 1, facing: 2, directionFix: false, through: false }, from: 'placed' });
  });
});

describe('walkerImage', () =>
{
  /**
   * Builds map 7 with event 1, whose two pages wear different characters, and event 2 wearing a third.
   * @returns {MapDocument} The map.
   */
  const buildMap = (): MapDocument =>
  {
    const first = createMapEvent(1, 1, 1);
    first.pages[0].image = { tileId: 0, characterName: 'Actor1', direction: 2, pattern: 1, characterIndex: 0 };
    const second = createEventPage();
    second.image = { tileId: 0, characterName: 'Actor2', direction: 4, pattern: 1, characterIndex: 3 };
    first.pages.push(second);
    const other = createMapEvent(2, 4, 4);
    other.pages[0].image = { tileId: 0, characterName: 'People1', direction: 8, pattern: 1, characterIndex: 5 };
    return MapDocument.fromJson('map:7', { ...buildMapJson(), events: [ null, first, other ] });
  };

  /**
   * Builds a setting on event 1's second page of map 7.
   * @param {number} characterId Who walks the route.
   * @returns {RouteSetting} The setting.
   */
  const onSecondPage = (characterId: number): RouteSetting => ({ mapId: 7, page: { eventId: 1, pageIndex: 1 }, before: [], characterId });

  it('pictures the event running the route as the page holding it, and any other event as its first page', () =>
  {
    // Arrange.
    const map = buildMap();

    // Act.
    const pictures = [ walkerImage(onSecondPage(0), map), walkerImage(onSecondPage(1), map), walkerImage(onSecondPage(2), map) ];

    // Assert: "this event" and event 1 by id are the same event, on the page holding the route.
    expect(pictures.map(image => image?.characterName))
      .toStrictEqual([ 'Actor2', 'Actor2', 'People1' ]);
  });

  it('has no picture for the player, the event running a common event, or an event the map lacks', () =>
  {
    // Arrange.
    const map = buildMap();
    const common: RouteSetting = { mapId: 7, page: null, before: [], characterId: 0 };

    // Act.
    const pictures = [ walkerImage(onSecondPage(-1), map), walkerImage(common, map), walkerImage(onSecondPage(9), map) ];

    // Assert.
    expect(pictures)
      .toStrictEqual([ null, null, null ]);
  });
});
