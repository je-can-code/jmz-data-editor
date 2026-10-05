import type { CommandWhereabouts } from '../commands/CommandEditorRegistry.ts';
import { isWholeNumber } from '../commands/editors/commandShape.ts';
import { isMoveRoute, routeSteps, SET_MOVEMENT_ROUTE_CODE } from '../commands/editors/moveRoute.ts';
import { parseDocumentKey } from '../model/documentKeys.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzEventCommand, RmmzEventImage, RmmzEventPage, RmmzMapEvent, RmmzMoveRoute } from '../model/rmmzTypes.ts';
import { face, walkRoute, type Facing, type WalkMap, type Walker } from './routeWalk.ts';

/**
 * The code of Set Event Location.
 */
const SET_EVENT_LOCATION_CODE = 203;

/**
 * Who moves, in the engine's words: the player is -1, and an event is its id.
 */
const PLAYER = -1;

/**
 * Where a route runs, as far as the editor can tell: the map, the event page holding it (none for a common event,
 * which runs wherever it is called from), the commands before it on that list, and who walks it: -1 the player, 0 the
 * event running it, or another event's id.
 */
type RouteSetting = {
  readonly mapId: number;
  readonly page: { readonly eventId: number; readonly pageIndex: number } | null;
  readonly before: readonly RmmzEventCommand[];
  readonly characterId: number;
};

/**
 * Where a route starts, and how the editor knows it:
 * - {@code earlier}: replayed from the routes and placements before it on the page;
 * - {@code placed}: where the walker stands on the map, nothing before it having moved it;
 * - {@code unknown}: nothing says, so the middle of the map.
 */
type RouteStart = {
  readonly walker: Walker;
  readonly from: 'earlier' | 'placed' | 'unknown';
};

/**
 * Works out where a command runs from where the list holding it sits: an event page's list on a map names its map,
 * event and page. Anywhere else, a common event's list above all, there is no map to say.
 * @param {CommandWhereabouts} whereabouts Where the command sits.
 * @param {number} characterId Who moves: -1 the player, 0 the event running it, or another event's id.
 * @returns {RouteSetting | null} The setting, or null when the list is not on a map.
 */
const routeSettingOf = (whereabouts: CommandWhereabouts, characterId: number): RouteSetting | null =>
{
  const { documentKey, listPath, before } = whereabouts;
  const parsed = parseDocumentKey(documentKey);
  if (parsed.kind !== 'map')
  {
    return null;
  }

  // a page's list sits at events/<event>/pages/<page>/list.
  const [ events, eventId, pages, pageIndex, list ] = listPath;
  const onPage = listPath.length === 5 && events === 'events' && pages === 'pages' && list === 'list';
  return {
    mapId: parsed.mapId,
    page: onPage ? { eventId: eventId as number, pageIndex: pageIndex as number } : null,
    before,
    characterId,
  };
};

/**
 * Reads the facing a page's picture shows, as a walker's facing: down unless the picture faces another way.
 * @param {number} direction The picture's direction.
 * @returns {Facing} The facing.
 */
const facingOf = (direction: number): Facing =>
{
  return direction === 4 || direction === 6 || direction === 8 ? direction : 2;
};

/**
 * Finds the page an event moves by: the page holding the route for the event running it, and the first page, the one
 * the editor draws it with, for any other.
 * @param {MapDocument} map The map.
 * @param {RouteSetting} setting Where the route runs.
 * @param {number} eventId The event.
 * @returns {{ event: RmmzMapEvent, page: RmmzEventPage } | null} The event and its page, or null when the map has no
 * such event.
 */
const pageOf = (map: MapDocument, setting: RouteSetting, eventId: number): { event: RmmzMapEvent; page: RmmzEventPage } | null =>
{
  const event = map.event(eventId);
  if (event === null)
  {
    return null;
  }

  const ownPage = setting.page !== null && setting.page.eventId === eventId ? event.pages[setting.page.pageIndex] : undefined;
  return { event, page: ownPage ?? event.pages[0] };
};

/**
 * Finds where an event stands on the map before anything moves it: its tile, the way its page's picture faces, and
 * that page's Direction Fix and Through.
 * @param {MapDocument} map The map.
 * @param {RouteSetting} setting Where the route runs.
 * @param {number} eventId The event.
 * @returns {Walker | null} The event as it stands, or null when the map has no such event.
 */
const placedEvent = (map: MapDocument, setting: RouteSetting, eventId: number): Walker | null =>
{
  const found = pageOf(map, setting, eventId);
  if (found === null)
  {
    return null;
  }

  const { event, page } = found;
  return { x: event.x, y: event.y, facing: facingOf(page.image.direction), directionFix: page.directionFix, through: page.through };
};

/**
 * Names who a command moves, in the engine's words, as Game_Interpreter#character reads it: the player for any
 * number below 0, the event running the list for 0, and another event by its id.
 * @param {number} characterId The command's character.
 * @param {RouteSetting} setting Where the list runs.
 * @returns {number | null} -1 for the player, an event's id, or null for the event running a common event, which
 * nothing here can name.
 */
const moverOf = (characterId: number, setting: RouteSetting): number | null =>
{
  if (characterId < 0)
  {
    return PLAYER;
  }

  if (characterId > 0)
  {
    return characterId;
  }

  return setting.page === null ? null : setting.page.eventId;
};

/**
 * Keeps track of where everyone a list moves stands as its commands are replayed, starting each at their placed spot
 * the first time anything asks. The player starts on the event running the list, since a player sets an event off
 * from beside it; on a common event there is no event, so the player's start is unknown.
 */
class Positions
{
  #map: MapDocument;

  #setting: RouteSetting;

  #walkers = new Map<number, Walker | null>();

  /**
   * @param {MapDocument} map The map.
   * @param {RouteSetting} setting Where the list runs.
   */
  constructor(map: MapDocument, setting: RouteSetting)
  {
    this.#map = map;
    this.#setting = setting;
  }

  /**
   * Reads where someone stands now.
   * @param {number} mover -1 for the player, or an event's id.
   * @returns {Walker | null} Where they stand, or null when nothing places them.
   */
  get(mover: number): Walker | null
  {
    const known = this.#walkers.get(mover);
    if (known !== undefined)
    {
      return known;
    }

    const placed = this.#placed(mover);
    this.#walkers.set(mover, placed);
    return placed;
  }

  /**
   * Records where someone stands now.
   * @param {number} mover -1 for the player, or an event's id.
   * @param {Walker} walker Where they stand.
   */
  set(mover: number, walker: Walker): void
  {
    this.#walkers.set(mover, walker);
  }

  /**
   * Finds where someone stands before the list moves them.
   * @param {number} mover -1 for the player, or an event's id.
   * @returns {Walker | null} Where they stand, or null when nothing places them.
   */
  #placed(mover: number): Walker | null
  {
    if (mover !== PLAYER)
    {
      return placedEvent(this.#map, this.#setting, mover);
    }

    const { page } = this.#setting;
    const beside = page === null ? null : placedEvent(this.#map, this.#setting, page.eventId);
    return beside === null
      ? null
      : { x: beside.x, y: beside.y, facing: 2, directionFix: false, through: false };
  }
}

/**
 * Replays a Set Movement Route before the route: whoever it moves walks it, from wherever they stand by then.
 * @param {RmmzEventCommand} command The command.
 * @param {RouteSetting} setting Where the list runs.
 * @param {Positions} positions Where everyone stands.
 * @param {WalkMap} walkMap The map's passability.
 * @returns {readonly number[]} Who it moved.
 */
const replayRoute = (command: RmmzEventCommand, setting: RouteSetting, positions: Positions, walkMap: WalkMap): readonly number[] =>
{
  const [ characterId, route ] = command.parameters;
  const mover = isWholeNumber(characterId) ? moverOf(characterId, setting) : null;
  const walker = mover === null ? null : positions.get(mover);
  if (mover === null || walker === null || isMoveRoute(route) === false)
  {
    return [];
  }

  const moveRoute = route as unknown as RmmzMoveRoute;
  positions.set(mover, walkRoute(walker, routeSteps(moveRoute), walkMap, moveRoute.skippable).end);
  return [ mover ];
};

/**
 * Replays a Set Event Location before the route, as Game_Interpreter#command203: a tile given directly moves its
 * character there; a tile in variables could be anywhere, so it moves nothing the editor can know; an exchange swaps
 * two characters. A facing other than 0 turns the character after, Direction Fix allowing.
 * @param {RmmzEventCommand} command The command.
 * @param {RouteSetting} setting Where the list runs.
 * @param {Positions} positions Where everyone stands.
 * @returns {readonly number[]} Who it moved.
 */
const replayPlacement = (command: RmmzEventCommand, setting: RouteSetting, positions: Positions): readonly number[] =>
{
  const { parameters } = command;
  const [ characterId, designation, x, y, direction ] = parameters as number[];
  const mover = parameters.length === 5 && parameters.every(isWholeNumber) ? moverOf(characterId, setting) : null;
  const walker = mover === null ? null : positions.get(mover);
  if (mover === null || walker === null || designation === 1)
  {
    return [];
  }

  // a tile given directly moves only this character; an exchange swaps it with the other.
  const moved: number[] = [ mover ];
  let located: Walker | null = null;
  if (designation === 0)
  {
    located = { ...walker, x, y };
  }
  else
  {
    const other = moverOf(x, setting);
    const partner = other === null ? null : positions.get(other);
    if (other !== null && partner !== null)
    {
      positions.set(other, { ...partner, x: walker.x, y: walker.y });
      located = { ...walker, x: partner.x, y: partner.y };
      moved.push(other);
    }
  }

  if (located === null)
  {
    return [];
  }

  positions.set(mover, direction > 0 ? face(located, facingOf(direction)) : located);
  return moved;
};

/**
 * Finds the picture a route's walker is drawn with: the page picture of the event that walks it. The player, the event
 * running a common event, and an event the map lacks have none the map can show.
 * @param {RouteSetting} setting Where the route runs.
 * @param {MapDocument} map The map.
 * @returns {RmmzEventImage | null} The picture, or null when there is none to show.
 */
const walkerImage = (setting: RouteSetting, map: MapDocument): RmmzEventImage | null =>
{
  const mover = moverOf(setting.characterId, setting);
  const found = mover === null || mover === PLAYER ? null : pageOf(map, setting, mover);
  return found === null ? null : found.page.image;
};

/**
 * Works out where a route starts: where the routes and placements before it on the same page leave its walker,
 * replayed in order through the map's passability, every earlier command counted however it is nested, since
 * cutscenes run mostly straight through. With nothing before it moving the walker, the route starts where the walker
 * is placed; with nothing placing it either, such as the event running a common event, in the middle of the map.
 * @param {RouteSetting} setting Where the route runs.
 * @param {MapDocument} map The map.
 * @param {WalkMap} walkMap The map's passability.
 * @returns {RouteStart} Where the route starts, and how the editor knows.
 */
const routeStart = (setting: RouteSetting, map: MapDocument, walkMap: WalkMap): RouteStart =>
{
  const positions = new Positions(map, setting);
  const mover = moverOf(setting.characterId, setting);
  let replayed = false;
  setting.before.forEach(command =>
  {
    let moved: readonly number[] = [];
    if (command.code === SET_MOVEMENT_ROUTE_CODE)
    {
      moved = replayRoute(command, setting, positions, walkMap);
    }
    else if (command.code === SET_EVENT_LOCATION_CODE)
    {
      moved = replayPlacement(command, setting, positions);
    }

    replayed ||= mover !== null && moved.includes(mover);
  });

  const walker = mover === null ? null : positions.get(mover);
  if (walker === null)
  {
    const middle = { x: Math.floor(walkMap.width / 2), y: Math.floor(walkMap.height / 2) };
    return { walker: { ...middle, facing: 2, directionFix: false, through: false }, from: 'unknown' };
  }

  return { walker, from: replayed ? 'earlier' : 'placed' };
};

export { routeSettingOf, routeStart, walkerImage };
export type { RouteSetting, RouteStart };
