/**
 * The parity check's rules, apart from the browser and the game so they can be tested: which views cover a map,
 * which maps are worth comparing at every animation step, which dark and which under their sky at a time of day, which
 * page the editor shows each event at the hour the game's clock read, what explains a difference in the events pass and
 * in the dark and sky passes, how the game copy's lights are held steady, and which differences the engine predicts
 * against snapshot.js.
 */
import { CommandCatalog } from '../../app/src/mapEditor/core/commands/CommandCatalog.ts';
import type { RmmzMapEvent } from '../../app/src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../app/src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { activePageOf, readEvent, type PageRule } from '../../app/src/mapEditor/core/pageRule/pageRule.ts';
import { ambientPayloadOf } from '../../app/src/mapEditor/modules/lighting/ambientTags.ts';
import { lightsOf, PLUGIN_DEFAULTS } from '../../app/src/mapEditor/modules/lighting/lightTags.ts';
import { NO_SKY_TAG, skyFollowsClock } from '../../app/src/mapEditor/modules/lighting/skyTag.ts';
import { timeModule } from '../../app/src/mapEditor/modules/time/timeModule.ts';
import type { PluginsJsEntry } from '../../app/src/services/plugins/PluginsJsReader.ts';
import type { ProbeEvent, ProbeMap } from './probeTypes.ts';

/**
 * A map cell that differs, as far as the rules read it.
 */
type DifferingCell = {
  readonly x: number;
  readonly y: number;
};

/**
 * One compared view, as far as the verdict reads it: which pass it belongs to, and the differing cells nothing explains.
 */
type JudgedView = {
  readonly pass: 'events' | 'tiles' | 'dark' | 'sky';
  readonly unexplained: readonly DifferingCell[];
};

/**
 * The parts of a map file the check reads.
 */
type MapFile = {
  width: number;
  height: number;
  tilesetId: number;
  data: number[];
  note: string;
  events: (RmmzMapEvent | null)[];
};

/**
 * One lit event as the editor draws it, for explaining the dark and sky passes: the event, the page the editor shows,
 * whose lights it draws (-1 for none), which of its pages give any light, where it stands, at its tile's foot, and the
 * furthest any of its pages reaches, in pixels, since the game may show another of its pages.
 */
type DarkLight = {
  readonly eventId: number;
  readonly pageIndex: number;
  readonly litPages: readonly number[];
  readonly x: number;
  readonly y: number;
  readonly reach: number;
};

/**
 * The page the editor shows each event at one hour, by the event's id: the page a fresh save would show, or -1 for
 * none.
 */
type EditorPages = ReadonlyMap<number, number>;

/**
 * One event that shows another page in the game than in the editor, either one -1 for none.
 */
type PageDifference = {
  readonly id: number;
  readonly game: number;
  readonly editor: number;
};

/**
 * J-Lighting's config as the game copy holds it, as far as holding its lights steady goes: every effect's tuning, and
 * everything else kept as it is.
 */
type LightingConfigFile = {
  readonly light: {
    readonly effects: Readonly<Record<string, Readonly<Record<string, number>>>>;
  };
};

/**
 * The tile size.
 */
const TILE = 48;

/**
 * Reports whether a map holds animated A1 tiles: water, whose surface steps, or waterfalls.
 * @param {MapFile} map The map.
 * @returns {boolean} True when its animation steps are worth comparing.
 */
const animates = (map: MapFile): boolean =>
{
  const cells = map.width * map.height * 4;
  for (let index = 0; index < cells; index++)
  {
    const tileId = map.data[index];
    if (tileId >= 2048 && tileId < 2816)
    {
      // kinds 2 and 3 are the still sea decorations; every other A1 kind moves.
      const kind = Math.floor((tileId - 2048) / 48);
      if (kind !== 2 && kind !== 3)
      {
        return true;
      }
    }
  }

  return false;
};

/**
 * Lists display positions whose screens together cover a whole map along one axis, as the engine would allow them:
 * nothing past the far edge, where Game_Map#setDisplayPos would clamp.
 * @param {number} size The map's size along the axis, in tiles.
 * @param {number} screen The screen's size along it, in tiles.
 * @returns {number[]} The positions.
 */
const coverAxis = (size: number, screen: number): number[] =>
{
  const end = size - screen;
  if (end <= 0)
  {
    return [ 0 ];
  }

  const positions: number[] = [];
  for (let position = 0; position < end; position += screen)
  {
    positions.push(position);
  }

  positions.push(end);
  return positions;
};

/**
 * Builds what the probe draws for one map: views covering all of it, at every animation step when it animates, and dark
 * as well when its note declares darkness, as J-Lighting reads a note.
 * @param {number} mapId The map.
 * @param {MapFile} map Its file.
 * @param {{ width: number, height: number }} screen The game's screen, in pixels.
 * @returns {ProbeMap} The probe's orders.
 */
const probeMapFor = (mapId: number, map: MapFile, screen: { width: number; height: number }): ProbeMap =>
{
  const xs = coverAxis(map.width, screen.width / TILE);
  const ys = coverAxis(map.height, screen.height / TILE);
  const views = xs.flatMap(x => ys.map(y => ({ x, y })));
  return { mapId, views, steps: animates(map) ? [ 0, 1, 2, 3 ] : [ 0 ], dark: ambientPayloadOf(map.note) !== null };
};

/**
 * Names the events a capture is explained by, as the probe keys them in its report: by the map's id, and by the time of
 * day too for a picture of the map under its sky, since which page an event shows can depend on the hour.
 * @param {{ mapId: number, time?: number }} capture The capture.
 * @returns {string} The key, such as {@code 4} or {@code 337@1320}.
 */
const eventsKeyOf = (capture: { readonly mapId: number; readonly time?: number }): string =>
{
  return capture.time === undefined
    ? String(capture.mapId)
    : `${capture.mapId}@${capture.time}`;
};

/**
 * The time of day the editor draws a capture at, so both sides judge every event's page, and cast any sky, at one hour:
 * the hour the game's clock read when the probe arrived on the capture's map, as the probe reports it under the
 * capture's key, which for a map drawn at a time of day is that time, set and stopped; or, from a game with no clock,
 * the time asked for, if any.
 * @param {{ mapId: number, time?: number }} capture The capture.
 * @param {Readonly<Record<string, number>>} clocks The game's clock on each map, in minutes past midnight, -1 for none.
 * @returns {number | null} The time of day, in minutes past midnight; null when neither the game nor the capture names
 * one, as for any pass in a game with no clock, whose pages no hour decides.
 */
const timeOfCapture = (capture: { readonly mapId: number; readonly time?: number }, clocks: Readonly<Record<string, number>>): number | null =>
{
  const clock = clocks[eventsKeyOf(capture)];
  if (clock >= 0)
  {
    return clock;
  }

  return capture.time ?? null;
};

/**
 * The party a fresh save starts with, as the editor's server reads it: the system's starting members, keeping only
 * those with a row in the actors' file, as the engine's own new game does.
 * @param {readonly number[]} partyMembers The system's starting members.
 * @param {readonly (object | null)[]} actors The actors' file.
 * @returns {number[]} The starting party's actor ids, in order.
 */
const startingPartyOf = (partyMembers: readonly number[], actors: readonly (object | null)[]): number[] =>
{
  return partyMembers.filter(actorId => actors[actorId] !== null && actors[actorId] !== undefined);
};

/**
 * Builds the page rule the editor shows a game by: the engine's conditions on a fresh save with the starting party, and
 * J-TIME's page tags as its module judges them over the game's own plugins, so a game without J-TIME has none.
 * @param {readonly PluginsJsEntry[]} plugins The game's plugins, as js/plugins.js lists them.
 * @param {readonly number[]} party The starting party's actor ids.
 * @returns {PageRule} The rule.
 */
const parityPageRule = (plugins: readonly PluginsJsEntry[], party: readonly number[]): PageRule =>
{
  const registry = new PluginModuleRegistry(new CommandCatalog());
  registry.activate([ timeModule ], plugins);
  return { save: { party }, conditions: registry.pageConditions() };
};

/**
 * Names the page the editor shows each of a map's events at a time of day.
 * @param {MapFile} map The map.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @param {number} timeOfDay The time of day, in minutes past midnight.
 * @returns {EditorPages} Each event's page, -1 for none, by its id.
 */
const editorPagesOf = (map: MapFile, rule: PageRule, timeOfDay: number): EditorPages =>
{
  const pages = new Map<number, number>();
  map.events.forEach(event =>
  {
    if (event !== null)
    {
      pages.set(event.id, activePageOf(readEvent(event, rule), { timeOfDay }));
    }
  });
  return pages;
};

/**
 * Lists the events the game shows another page than the editor does, which is the page rule's own measure: an event
 * the editor has no page for at all, as one a plugin put on the map, counts as showing none there.
 * @param {readonly ProbeEvent[]} events The game's events on the map.
 * @param {EditorPages} editorPages The editor's page for each event.
 * @returns {PageDifference[]} The events that differ, in the game's order.
 */
const pageDifferencesOf = (events: readonly ProbeEvent[], editorPages: EditorPages): PageDifference[] =>
{
  return events.flatMap(event =>
  {
    const editor = editorPages.get(event.id) ?? -1;
    return editor === event.page ? [] : [ { id: event.id, game: event.page, editor } ];
  });
};

/**
 * Words a page as a reason names it.
 * @param {number} pageIndex The page's index, -1 for none.
 * @returns {string} The words, such as "page 2" or "no page".
 */
const pageNameOf = (pageIndex: number): string =>
{
  return pageIndex < 0 ? 'no page' : `page ${pageIndex + 1}`;
};

/**
 * Words the pages an event shows on each side, for a reason.
 * @param {number} game The page the game shows, -1 for none.
 * @param {number} editor The page the editor shows, -1 for none.
 * @returns {string} The words, such as "shows page 2 in the game, page 1 in the editor".
 */
const pagesWords = (game: number, editor: number): string =>
{
  return `shows ${pageNameOf(game)} in the game, ${pageNameOf(editor)} in the editor`;
};

/**
 * Builds what the probe draws for one map under its sky at a time of day: the same views and steps as any pass over the
 * map, drawn at that time. A map with no sky, read from its note as the editor's sky reads it, has nothing the clock
 * changes, so it is refused, rather than compared at an hour it ignores and reported as though the sky matched.
 * @param {number} mapId The map.
 * @param {MapFile} map Its file.
 * @param {{ width: number, height: number }} screen The game's screen, in pixels.
 * @param {number} time The time of day, in minutes past midnight.
 * @returns {ProbeMap} The probe's orders.
 */
const skyProbeMapFor = (mapId: number, map: MapFile, screen: { width: number; height: number }, time: number): ProbeMap =>
{
  // a cave or an interior keeps its sky still at every hour, so it has no sky to compare.
  if (skyFollowsClock(map.note) === false)
  {
    throw new Error(`Map${String(mapId).padStart(3, '0')} has no sky to compare: its note carries ${NO_SKY_TAG}`);
  }

  return { ...probeMapFor(mapId, map, screen), dark: false, time };
};

/**
 * Lists every event with a page giving light, one entry each: the page the editor shows, whose lights it cuts through
 * the dark, the pages giving any, where the event stands, and the furthest any of its pages' lights reaches, since the
 * game may show another of its pages.
 * @param {MapFile} map The map.
 * @param {EditorPages} editorPages The editor's page for each of the map's events, as editorPagesOf names them.
 * @returns {DarkLight[]} The lit events, in id order.
 */
const darkLightsOf = (map: MapFile, editorPages: EditorPages): DarkLight[] =>
{
  return map.events.flatMap(event =>
  {
    if (event === null)
    {
      return [];
    }

    const radii = event.pages.map(page => lightsOf(page, PLUGIN_DEFAULTS).map(light => light.radius));
    const litPages = radii.flatMap((pageRadii, pageIndex) => (pageRadii.length === 0 ? [] : [ pageIndex ]));
    if (litPages.length === 0)
    {
      return [];
    }

    return [ {
      eventId: event.id,
      pageIndex: editorPages.get(event.id) as number,
      litPages,
      x: event.x * TILE + TILE / 2,
      y: event.y * TILE + TILE,
      reach: Math.max(...radii.flat()) * TILE,
    } ];
  });
};

/**
 * Reports whether a light's pool may reach a cell: the square its furthest reach spans about the event's foot, widened
 * by a cell on every side for where the game stands a character a few pixels up.
 * @param {DarkLight} light The light.
 * @param {DifferingCell} cell The cell.
 * @returns {boolean} True when the pool may reach it.
 */
const lightReaches = (light: DarkLight, cell: DifferingCell): boolean =>
{
  const left = Math.floor((light.x - light.reach) / TILE) - 1;
  const right = Math.floor((light.x + light.reach - 1) / TILE) + 1;
  const top = Math.floor((light.y - light.reach) / TILE) - 1;
  const bottom = Math.floor((light.y + light.reach - 1) / TILE) + 1;
  return cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= bottom;
};

/**
 * Explains a differing cell of the dark or sky pass by a light the game shows from another page than the editor does:
 * the editor draws an event's lights from the page a fresh save shows at the hour, while the game draws them from the
 * page its own state shows, which may be another page or none, and one of the two gives light. A cell no such light
 * reaches stays unexplained, since a difference there would be the editor's own; so does one reached only by lights
 * both sides draw from the same page, or by two pages neither of which gives any.
 * @param {DifferingCell} cell The cell.
 * @param {readonly DarkLight[]} lights The map's lit events.
 * @param {readonly ProbeEvent[]} events The game's events on the map.
 * @returns {string | null} Why it differs, or null when nothing explains it.
 */
const explainDarkCell = (cell: DifferingCell, lights: readonly DarkLight[], events: readonly ProbeEvent[]): string | null =>
{
  const pageShown = (light: DarkLight): number => events.find(event => event.id === light.eventId)?.page ?? -1;
  const departs = (light: DarkLight): boolean =>
  {
    const shown = pageShown(light);
    return shown !== light.pageIndex && (light.litPages.includes(shown) || light.litPages.includes(light.pageIndex));
  };
  const departing = lights.find(light => departs(light) && lightReaches(light, cell));
  if (departing === undefined)
  {
    return null;
  }

  return `event ${departing.eventId} ${pagesWords(pageShown(departing), departing.pageIndex)}`;
};

/**
 * Holds every light in J-Lighting's config steady, for a game copy whose frames must match one another: every effect's
 * depth goes to 0, so flicker, pulse and glitch take no brightness away and every light burns at full strength, as the
 * editor draws them; everything else is kept as it is.
 * @param {T} config The config file's content.
 * @returns {T} A copy with every effect's depth at 0.
 */
const steadyLighting = <T extends LightingConfigFile>(config: T): T =>
{
  const effects = Object.fromEntries(Object.entries(config.light.effects).map(([ name, tuning ]) =>
  {
    return [ name, { ...tuning, depth: 0 } ];
  }));
  return { ...config, light: { ...config.light, effects } };
};

/**
 * Reports whether an event's sprite covers a cell: its footprint standing bottom-centre on its own cell, 6 pixels up
 * as a character stands, widened by a margin.
 * @param {ProbeEvent} event The event.
 * @param {{ x: number, y: number }} cell The cell.
 * @param {number} margin How many cells to widen the footprint by on every side.
 * @returns {boolean} True when it covers the cell.
 */
const spriteCovers = (event: ProbeEvent, cell: { x: number; y: number }, margin: number): boolean =>
{
  const centre = event.x * TILE + TILE / 2;
  const bottom = event.y * TILE + TILE - 6;
  const left = Math.floor((centre - event.width / 2) / TILE) - margin;
  const right = Math.floor((centre + event.width / 2 - 1) / TILE) + margin;
  const top = Math.floor((bottom - event.height) / TILE) - margin;
  return cell.x >= left && cell.x <= right && cell.y >= top && cell.y <= event.y + margin;
};

/**
 * Lists every way the game's drawing of an event departs from the editor's: another page than the editor shows, and
 * then the game hiding it, or drawing it otherwise than a plain drawing of the page it shows. An event the editor has
 * no page for, as one a plugin put on the map, counts as showing none there.
 * @param {ProbeEvent} event The game's event.
 * @param {EditorPages} editorPages The editor's page for each event.
 * @returns {string[]} The departures, in words; empty when both sides draw the same page plainly.
 */
const departuresFromEditor = (event: ProbeEvent, editorPages: EditorPages): string[] =>
{
  const editor = editorPages.get(event.id) ?? -1;
  const pages = editor === event.page ? [] : [ pagesWords(event.page, editor) ];
  return [ ...pages, ...(event.visible ? event.departures : [ 'is hidden in the game' ]) ];
};

/**
 * Explains a differing cell of the events pass by an event around it that the game draws differently from the editor:
 * one showing another page than the page a fresh save shows at the hour, which is the editor's, or one the game hides
 * or draws otherwise than its page. A cell under an event both sides draw alike stays unexplained however much its
 * neighbours move: a difference there would be the editor's own.
 * @param {DifferingCell} cell The cell.
 * @param {readonly ProbeEvent[]} events The game's events on the map.
 * @param {EditorPages} editorPages The editor's page for each event.
 * @returns {string | null} Why it differs, or null when nothing explains it.
 */
const explainCell = (cell: DifferingCell, events: readonly ProbeEvent[], editorPages: EditorPages): string | null =>
{
  const departs = (event: ProbeEvent): boolean => departuresFromEditor(event, editorPages).length > 0;
  if (events.some(event => departs(event) === false && spriteCovers(event, cell, 0)))
  {
    return null;
  }

  // what hangs off a departing sprite (gauges, a squash) reaches a cell further.
  const departing = events.find(event => departs(event) && spriteCovers(event, cell, 1));
  if (departing === undefined)
  {
    return null;
  }

  return `event ${departing.id} ${departuresFromEditor(departing, editorPages).join(', ')}`;
};

/**
 * Decides whether the editor matched the game: no view of either pass may keep a differing cell nothing explains. The
 * tiles pass explains nothing, so any difference there fails it; the events pass fails on a difference that no event
 * the game draws its own way accounts for, since that difference would be the editor's own.
 * @param {readonly JudgedView[]} views Every compared view.
 * @returns {boolean} True when nothing is left unexplained.
 */
const gameParityHolds = (views: readonly JudgedView[]): boolean =>
{
  return views.every(view => view.unexplained.length === 0);
};

/**
 * Lists the cells where the engine predicts snapshot.js to draw differently: a star tile under a later non-star tile,
 * which the engine draws last, and a table or the cell under one, whose legs and edge snapshot.js leaves out.
 * @param {MapFile} map The map.
 * @param {readonly number[]} flags The tileset's flags.
 * @returns {Map<string, string>} The reason, by "x,y".
 */
const snapshotPredictions = (map: MapFile, flags: readonly number[]): Map<string, string> =>
{
  const { width, height, data } = map;
  const read = (x: number, y: number, z: number): number => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[(z * height + y) * width + x] ?? 0);
  const isStar = (id: number): boolean => id > 0 && ((flags[id] ?? 0) & 0x10) !== 0;
  const isTable = (id: number): boolean => id >= 2816 && id < 4352 && ((flags[id] ?? 0) & 0x80) !== 0;
  const predicted = new Map<string, string>();
  for (let y = 0; y < height; y++)
  {
    for (let x = 0; x < width; x++)
    {
      const ids = [ 0, 1, 2, 3 ].map(z => read(x, y, z));
      if (ids.some((id, index) => isStar(id) && ids.slice(index + 1).some(above => above > 0 && isStar(above) === false)))
      {
        predicted.set(`${x},${y}`, 'star tile drawn above a later layer');
      }

      if (ids.some(isTable) || (isTable(read(x, y - 1, 1)) && isTable(ids[1]) === false))
      {
        predicted.set(`${x},${y}`, 'table legs or edge');
      }
    }
  }

  return predicted;
};

export {
  animates,
  coverAxis,
  darkLightsOf,
  editorPagesOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  lightReaches,
  pageDifferencesOf,
  pagesWords,
  parityPageRule,
  probeMapFor,
  skyProbeMapFor,
  snapshotPredictions,
  spriteCovers,
  startingPartyOf,
  steadyLighting,
  TILE,
  timeOfCapture,
};
export type { DarkLight, EditorPages, JudgedView, LightingConfigFile, MapFile, PageDifference };
