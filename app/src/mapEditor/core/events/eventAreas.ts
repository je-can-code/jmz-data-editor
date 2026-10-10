import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { ShownPageReader } from '../pageRule/ShownPages.ts';

/**
 * The tiles an event stands on while one of its pages shows, as J-Pixelistics gives a page an area: a rectangle so many
 * tiles wide and high, running right and down from the tile the event stands on, that tile included. One tile by one is
 * the event's own tile, which every event stands on whatever its page says.
 */
type EventArea = {
  readonly width: number;
  readonly height: number;
};

/**
 * Reads the area a page covers, as a plugin module reads it from the page's comments.
 * @param {RmmzEventPage} page The page.
 * @returns {EventArea | null} The area, or null for a page that declares none.
 */
type AreaReader = (page: RmmzEventPage) => EventArea | null;

/**
 * Where an event's area lies on its map: the part on the map, as a rectangle of tiles whose top-left tile is the event's
 * own, and how many of its columns and rows run past the map's right and bottom edges, the only two it can run past,
 * since it runs right and down from a tile on the map. A part on the map with no width or no height means none of the
 * area is on the map at all, as for an event left off the map when the map was made smaller.
 */
type AreaOnMap = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pastRight: number;
  readonly pastBottom: number;
};

/**
 * One line an event's quick panel shows for an area running past the map's edge: which event, when the panel shows
 * several, and how far it runs.
 */
type AreaLine = {
  readonly key: string;
  readonly text: string;
};

/**
 * One event a quick panel shows, with where the area of the page it shows lies on its map, or null for a page with none.
 */
type ShownArea = {
  readonly id: number;
  readonly name: string;
  readonly onMap: AreaOnMap | null;
};

/**
 * Works out where an event's area lies on its map: the part on the map, cut at the right and bottom edges, and how far
 * past each edge the rest runs.
 * @param {number} x The column the event stands on.
 * @param {number} y The row the event stands on.
 * @param {EventArea} area The area its page covers.
 * @param {number} mapWidth The map's width, in tiles.
 * @param {number} mapHeight The map's height, in tiles.
 * @returns {AreaOnMap} Where it lies.
 */
const areaOnMap = (x: number, y: number, area: EventArea, mapWidth: number, mapHeight: number): AreaOnMap =>
{
  // every column from the map's edge on is past it, and never more columns than the area has.
  const pastRight = Math.min(area.width, Math.max(0, x + area.width - mapWidth));
  const pastBottom = Math.min(area.height, Math.max(0, y + area.height - mapHeight));
  return { x, y, width: area.width - pastRight, height: area.height - pastBottom, pastRight, pastBottom };
};

/**
 * Reports whether an area lies wholly on its map, so nothing of it is cut away.
 * @param {AreaOnMap} onMap Where the area lies.
 * @returns {boolean} True when none of it runs past an edge.
 */
const isWhollyOnMap = (onMap: AreaOnMap): boolean =>
{
  return onMap.pastRight === 0 && onMap.pastBottom === 0;
};

/**
 * Reports whether a tile lies inside the part of an area on the map.
 * @param {AreaOnMap} onMap Where the area lies.
 * @param {number} column The tile's column.
 * @param {number} row The tile's row.
 * @returns {boolean} True inside it.
 */
const areaCovers = (onMap: AreaOnMap, column: number, row: number): boolean =>
{
  return column >= onMap.x && column < onMap.x + onMap.width && row >= onMap.y && row < onMap.y + onMap.height;
};

/**
 * Finds the area of the page an event is shown with on the map: the page the game shows at the window's moment, or its
 * first page while none holds, as the map draws it faded.
 * @param {RmmzMapEvent} event The event.
 * @param {ShownPageReader} pages Picks the page each event is shown with.
 * @param {AreaReader} read Reads a page's area.
 * @returns {EventArea | null} The area, or null when the page shown declares none, or the event has no pages.
 */
const shownAreaOf = (event: RmmzMapEvent, pages: ShownPageReader, read: AreaReader): EventArea | null =>
{
  const page = event.pages[pages.shownPage(event).index];
  return page === undefined
    ? null
    : read(page);
};

/**
 * Words a count of tiles.
 * @param {number} count How many.
 * @returns {string} Such as "1 tile" or "9 tiles".
 */
const tilesWords = (count: number): string =>
{
  return count === 1
    ? '1 tile'
    : `${count} tiles`;
};

/**
 * Says how far an area runs past the map's edges, for an event's quick panel.
 * @param {AreaOnMap} onMap Where the area lies.
 * @returns {string | null} The words, or null for an area wholly on the map.
 */
const pastEdgeWords = (onMap: AreaOnMap): string | null =>
{
  const right = onMap.pastRight > 0 ? [ `${tilesWords(onMap.pastRight)} past the right edge` ] : [];
  const bottom = onMap.pastBottom > 0 ? [ `${tilesWords(onMap.pastBottom)} past the bottom edge` ] : [];
  const runs = [ ...right, ...bottom ];
  return runs.length === 0
    ? null
    : `The trigger area runs ${runs.join(' and ')} of the map, where the player can never go.`;
};

/**
 * Lists what a quick panel says about the areas of the events it shows: one line for each event whose area runs past the
 * map's edge, naming the event when the panel shows several.
 * @param {readonly ShownArea[]} events The events shown, each with where its area lies.
 * @returns {AreaLine[]} The lines, in the order the events are shown.
 */
const areaLines = (events: readonly ShownArea[]): AreaLine[] =>
{
  const severalEvents = events.length > 1;
  return events.flatMap(event =>
  {
    const words = event.onMap === null ? null : pastEdgeWords(event.onMap);
    if (words === null)
    {
      return [];
    }

    // which event it is, when the panel shows more than one.
    const name = event.name === '' ? `Event ${event.id}` : event.name;
    const lead = severalEvents ? `${name}: ` : '';
    return [ { key: `area:${event.id}`, text: `${lead}${words}` } ];
  });
};

export { areaCovers, areaLines, areaOnMap, isWhollyOnMap, pastEdgeWords, shownAreaOf };
export type { AreaLine, AreaOnMap, AreaReader, EventArea, ShownArea };
