/**
 * The parity check's rules, apart from the browser and the game so they can be tested: which views cover a map,
 * which maps are worth comparing at every animation step, which dark and which under their sky at a time of day, which
 * page the editor shows each event at the hour the game's clock read, how the game and the editor judge each page of
 * the maps holding quest-gated events, and of those holding time-gated events at each season's date, with a fixture map
 * of the date's own tags, what explains a difference in the events pass and in the dark and sky passes, how the game
 * copy's lights are held steady, which differences the engine predicts against snapshot.js, and how a map's weather is
 * read on both sides and compared, by its numbers rather than its pixels, and where each side draws it, J-Weather-Time's
 * sky held over it at a season and an hour or held off.
 */
import { CommandCatalog } from '../../app/src/mapEditor/core/commands/CommandCatalog.ts';
import { createEventPage, createMapEvent } from '../../app/src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../app/src/mapEditor/core/model/json.ts';
import type { RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../app/src/mapEditor/core/model/rmmzTypes.ts';
import { PluginModuleRegistry } from '../../app/src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { activePageOf, pageHolds, readEvent, type PageMoment, type PageRule } from '../../app/src/mapEditor/core/pageRule/pageRule.ts';
import { newMapContent } from '../../app/src/mapEditor/core/tree/treePlans.ts';
import { ambientPayloadOf } from '../../app/src/mapEditor/modules/lighting/ambientTags.ts';
import { lightsOf, PLUGIN_DEFAULTS } from '../../app/src/mapEditor/modules/lighting/lightTags.ts';
import { NO_SKY_TAG, skyFollowsClock } from '../../app/src/mapEditor/modules/lighting/skyTag.ts';
import { questModule } from '../../app/src/mapEditor/modules/quest/questModule.ts';
import { readQuestTags } from '../../app/src/mapEditor/modules/quest/questTags.ts';
import { timeModule } from '../../app/src/mapEditor/modules/time/timeModule.ts';
import { dateOfSeason, SEASON_NAMES, seasonOfMonth, type GameDate } from '../../app/src/mapEditor/modules/time/timeSnapshot.ts';
import { readTimeTags } from '../../app/src/mapEditor/modules/time/timeTags.ts';
import type { PluginsJsEntry } from '../../app/src/services/plugins/PluginsJsReader.ts';
import type { ProbeEvent, ProbeMap, ProbeMoment, ProbeSpread, ProbeVerdicts, WeatherDepthProbe, WeatherLayerProbe } from './probeTypes.ts';

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
 * One event that shows another page in the game than in the editor, either one -1 for none, and the game's null where
 * picking its page threw.
 */
type PageDifference = {
  readonly id: number;
  readonly game: number | null;
  readonly editor: number;
};

/**
 * One page the game and the editor judge differently: the event, the page's index, whether it holds in the game, null
 * where judging it threw there, and whether it holds in the editor.
 */
type VerdictDifference = {
  readonly id: number;
  readonly page: number;
  readonly game: boolean | null;
  readonly editor: boolean;
};

/**
 * How the game and the editor judged one map's events at one moment, counting the gated apart, the quest-gated or the
 * time-gated: the events the game has there, and those on the editor's page; the events with a gated page, and those on
 * the editor's page; every page of the events both sides have, and those both judge alike; the gated pages, and those
 * both judge alike; and the gated pages judged differently.
 */
type PagesTally = {
  readonly events: number;
  readonly eventsAlike: number;
  readonly gatedEvents: number;
  readonly gatedEventsAlike: number;
  readonly pages: number;
  readonly pagesAlike: number;
  readonly gatedPages: number;
  readonly gatedPagesAlike: number;
  readonly gatedDiffer: readonly VerdictDifference[];
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
 * One map whose weather is read, and the time of day to read it at, in minutes past midnight; left out, the game's own
 * hour on arrival.
 */
type WeatherFixture = {
  readonly mapId: number;
  readonly time?: number;
};

/**
 * One moment every time-gated page is judged at: a season, by J-TIME's number for it, whose date the clock moves the
 * game's start to, and a time of day, in minutes past midnight.
 */
type SeasonFixture = {
  readonly season: number;
  readonly time: number;
};

/**
 * One map whose weather is read under a sky: the condition and the strength J-Weather-Time's sky is set to, as the
 * plugin names them, and the season, by J-TIME's number for it, and time of day, in minutes past midnight, both sides'
 * clocks are set to.
 */
type SkyWeatherFixture = {
  readonly mapId: number;
  readonly condition: string;
  readonly strength: string;
  readonly season: number;
  readonly time: number;
};

/**
 * A map's weather as one side draws it, as far as the comparison reads it: the weather it resolved, and every layer.
 */
type WeatherSide = {
  readonly current: { readonly preset: string; readonly intensity: string } | null;
  readonly layers: readonly WeatherLayerProbe[];
};

/**
 * One check of the weather comparison: what is compared, how each side reads, and whether they agree.
 */
type WeatherCheck = {
  readonly name: string;
  readonly game: string;
  readonly editor: string;
  readonly holds: boolean;
};

/**
 * Where the editor draws a map's weather in its own tree: the world's layers by name, the game container's layers by
 * name, how many filters the game container carries (the tone's, while a tone is cast), the weather's index in the game
 * container, and the game container's and the lighting's indexes in the world.
 */
type EditorWeatherDepth = {
  readonly world: readonly string[];
  readonly game: readonly string[];
  readonly gameFilters: number;
  readonly weatherIndex: number;
  readonly gameIndex: number;
  readonly lightingIndex: number;
};

/**
 * How far a mean may stray between the two sides, as a share of the wider of the two spreads: the particles are rolled
 * at random on both sides, so their numbers agree by their spread, never to the digit.
 */
const MEAN_TOLERANCE = 0.2;

/**
 * How many standard errors a mean may stray between the two sides, when that is more than {@link MEAN_TOLERANCE} allows:
 * a few particles' mean strays far by chance alone, eight sunbeams' by a good part of their range, where thousands of
 * raindrops' stray by a hair, so a small population is held to what chance makes of it rather than to a share that
 * suits a large one.
 */
const MEAN_ERRORS = 3;

/**
 * How many standard errors a share of a population may stray between the two sides, on screen or in its second life:
 * each side's share is one draw from the same chance, so a small population strays more by chance alone, 33 bubbles by
 * about a tenth, where two thousand flakes stray by about a hundredth.
 */
const SHARE_ERRORS = 3;

/**
 * The least a share may stray by however large the population, so a share at nothing or at all of it, whose standard
 * error is nothing, is not held to the digit.
 */
const SHARE_FLOOR = 0.05;

/**
 * The engine's blend numbers by pixi's names for them: 0 normal, 1 add, 2 multiply.
 */
const ENGINE_BLENDS: readonly string[] = [ 'normal', 'add', 'multiply' ];

/**
 * The maps whose weather the check reads unless told otherwise, one per look Chef Adventure uses, most used first
 * (fog on 28 maps, motes on 20, embers and snow on 11, rain on 9, leaves on 2, submerged on 1), each read at the
 * game's own hour; then a snowy map with its own darkness read at night, under the sky's tone and the dark.
 */
const WEATHER_FIXTURES = '65,102,245,316,220,16,191,309@22:00';

/**
 * A map and an optional time of day as --weather takes them: the map's id, then, after an at sign, hours and minutes on
 * a 24-hour clock.
 */
const WEATHER_FIXTURE = /^(\d+)(?:@([01]?\d|2[0-3]):([0-5]\d))?$/u;

/**
 * The moments every time-gated page is judged at unless told otherwise: Summer's date at four hours, so each span Chef
 * Adventure ships is seen open and shut (the small hours, the morning, the evening before 18:00 and the night), and
 * Spring's and Autumn's at one hour each, both on the minute a span closes, so a span's end is seen exactly.
 */
const SEASON_FIXTURES = 'summer@02:00,summer@10:00,summer@17:00,summer@22:00,spring@05:00,autumn@16:00';

/**
 * A season and a time of day as --seasons takes them: the season's name, in any case, or J-TIME's number for it, then,
 * after an at sign, hours and minutes on a 24-hour clock.
 */
const SEASON_FIXTURE = /^(spring|summer|autumn|winter|[0-3])@([01]?\d|2[0-3]):([0-5]\d)$/iu;

/**
 * The maps whose weather the check reads under a sky unless told otherwise. Map337, an outdoor map naming no weather of
 * its own, under every condition Chef Adventure's sky has and every face it wears: heavy rain, light snow and clouds in
 * Winter; clear's starfall on a winter night, fireflies on a summer night, scorcher on a summer afternoon, frigid on a
 * winter morning and its own sun on a spring morning; maple on an autumn afternoon; sakura in Spring; a monsoon, and a
 * light mist, in Autumn. Then Map016, an outdoor map naming leaves, under a heavy sky, and Map220, naming rain, under a
 * light one, so a map's own look runs at the sky's strength; and under a heavy rain, Map056, kept from the sky by
 * <noToneChange>, and Map364, an outdoor map opting out with <noWeather>, both staying clear.
 */
const SKY_WEATHER_FIXTURES = [
  '337:rain:heavy@winter@12:00',
  '337:snow:light@winter@09:00',
  '337:overcast:moderate@winter@15:00',
  '337:clear:moderate@winter@22:00',
  '337:clear:heavy@summer@22:00',
  '337:clear:light@summer@14:00',
  '337:clear:moderate@winter@10:00',
  '337:clear:moderate@spring@10:00',
  '337:breezy:heavy@autumn@16:00',
  '337:sakura:moderate@spring@08:00',
  '337:monsoon:heavy@autumn@18:00',
  '337:mist:light@autumn@06:00',
  '16:rain:heavy@winter@12:00',
  '220:overcast:light@winter@12:00',
  '56:rain:heavy@winter@12:00',
  '364:rain:heavy@winter@12:00',
].join(',');

/**
 * A map read under a sky as --sky-weather takes it: the map's id, a colon, the sky's condition, a colon and its
 * strength, then, after an at sign, the season's name, in any case, or J-TIME's number for it, and after another, hours
 * and minutes on a 24-hour clock.
 */
const SKY_WEATHER_FIXTURE = /^(\d+):([a-zA-Z][a-zA-Z0-9_-]*):([a-zA-Z][a-zA-Z0-9_-]*)@(spring|summer|autumn|winter|[0-3])@([01]?\d|2[0-3]):([0-5]\d)$/iu;

/**
 * How many layers a map file holds: four of tiles, then shadows, then regions.
 */
const MAP_LAYERS = 6;

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
 * Builds the page rule the editor shows a game by: the engine's conditions on a fresh save with the starting party,
 * J-TIME's page tags as its module judges them, and J-OMNI-Quests' as its module judges them against the quests a new
 * game starts with, each over the game's own plugins, so a game without either plugin has none of its tags.
 * @param {readonly PluginsJsEntry[]} plugins The game's plugins, as js/plugins.js lists them.
 * @param {readonly number[]} party The starting party's actor ids.
 * @param {ReadonlyMap<string, JsonValue | null>} configs The game's config files the modules read, by the name the
 * server serves each under ({@code quest} for config.quest.json); left out, none were read.
 * @returns {PageRule} The rule.
 */
const parityPageRule = (plugins: readonly PluginsJsEntry[], party: readonly number[], configs: ReadonlyMap<string, JsonValue | null> = new Map()): PageRule =>
{
  const registry = new PluginModuleRegistry(new CommandCatalog());
  registry.activate([ timeModule, questModule ], plugins, configs);
  return { save: { party }, conditions: registry.pageConditions() };
};

/**
 * Names the page the editor shows each of a map's events at a moment: a time of day, and the season the clock is in.
 * @param {MapFile} map The map.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @param {PageMoment} moment The moment, its time of day in minutes past midnight.
 * @returns {EditorPages} Each event's page, -1 for none, by its id.
 */
const editorPagesOf = (map: MapFile, rule: PageRule, moment: PageMoment): EditorPages =>
{
  const pages = new Map<number, number>();
  map.events.forEach(event =>
  {
    if (event !== null)
    {
      pages.set(event.id, activePageOf(readEvent(event, rule), moment));
    }
  });
  return pages;
};

/**
 * Lists the events the game shows another page than the editor does, which is the page rule's own measure: an event
 * the editor has no page for at all, as one a plugin put on the map, counts as showing none there.
 * @param {readonly ProbeVerdicts[]} events The game's events on the map, each with the page it shows.
 * @param {EditorPages} editorPages The editor's page for each event.
 * @returns {PageDifference[]} The events that differ, in the game's order.
 */
const pageDifferencesOf = (events: readonly ProbeVerdicts[], editorPages: EditorPages): PageDifference[] =>
{
  return events.flatMap(event =>
  {
    const editor = editorPages.get(event.id) ?? -1;
    return editor === event.page ? [] : [ { id: event.id, game: event.page, editor } ];
  });
};

/**
 * Builds what the probe does on a map whose pages alone are compared, as on each map holding quest-gated events: it
 * arrives there, records how the game shows each event and judges each of its pages, and draws nothing.
 * @param {number} mapId The map.
 * @returns {ProbeMap} The probe's orders.
 */
const pagesProbeMapFor = (mapId: number): ProbeMap =>
{
  return { mapId, views: [], steps: [ 0 ], dark: false };
};

/**
 * Lists the pages of a map's events that carry what a reading finds, such as a plugin's page tags.
 * @param {MapFile} map The map.
 * @param {(page: RmmzEventPage) => boolean} carries Whether a page carries it.
 * @returns {Map<number, number[]>} Each such event's pages carrying it, by index, by the event's id; an event with none
 * has no entry.
 */
const pagesCarrying = (map: MapFile, carries: (page: RmmzEventPage) => boolean): Map<number, number[]> =>
{
  const gated = new Map<number, number[]>();
  map.events.forEach(event =>
  {
    const pages = event === null ? [] : event.pages.flatMap((page, index) => (carries(page) ? [ index ] : []));
    if (event !== null && pages.length > 0)
    {
      gated.set(event.id, pages);
    }
  });
  return gated;
};

/**
 * Lists the pages of a map's events carrying any of J-OMNI-Quests' page tags, as its module reads them.
 * @param {MapFile} map The map.
 * @returns {Map<number, number[]>} Each quest-gated event's quest-gated pages, by index, by the event's id; an event with
 * none has no entry.
 */
const questGatedPagesOf = (map: MapFile): Map<number, number[]> =>
{
  return pagesCarrying(map, page => readQuestTags(page).length > 0);
};

/**
 * Lists the pages of a map's events carrying any of J-TIME's page tags, as its module reads them: those gated by the
 * time of day, by the date, or by both.
 * @param {MapFile} map The map.
 * @returns {Map<number, number[]>} Each time-gated event's time-gated pages, by index, by the event's id; an event with
 * none has no entry.
 */
const timeGatedPagesOf = (map: MapFile): Map<number, number[]> =>
{
  return pagesCarrying(map, page => readTimeTags(page).length > 0);
};

/**
 * Judges every page of a map's events as the editor does at a moment: whether each holds, as the page rule asks of
 * each page when it picks one.
 * @param {MapFile} map The map.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @param {PageMoment} moment The moment: a time of day, in minutes past midnight, and the season the clock is in.
 * @returns {Map<number, boolean[]>} Whether each page holds, by index, by the event's id.
 */
const editorVerdictsOf = (map: MapFile, rule: PageRule, moment: PageMoment): Map<number, boolean[]> =>
{
  const verdicts = new Map<number, boolean[]>();
  map.events.forEach(event =>
  {
    if (event !== null)
    {
      verdicts.set(event.id, readEvent(event, rule).pages.map(page => pageHolds(page, moment)));
    }
  });
  return verdicts;
};

/**
 * Lists the pages the game judges otherwise than the editor, the editor's pages compared one by one with how the game
 * judged the same page; a page whose judging threw in the game differs whatever the editor says. An event the editor has
 * no pages for, as one a plugin put on the map, has nothing to compare and is passed over.
 * @param {readonly ProbeVerdicts[]} events The game's events on the map, with how it judged each page.
 * @param {ReadonlyMap<number, readonly boolean[]>} verdicts The editor's judgement of each page, by the event's id.
 * @returns {VerdictDifference[]} The pages judged differently, in the game's order of events, then by page.
 */
const verdictDifferencesOf = (events: readonly ProbeVerdicts[], verdicts: ReadonlyMap<number, readonly boolean[]>): VerdictDifference[] =>
{
  return events.flatMap(event =>
  {
    const editor = verdicts.get(event.id) ?? [];
    return editor.flatMap((held, page) =>
    {
      const game = event.meets[page] ?? null;
      return game === held ? [] : [ { id: event.id, page, game, editor: held } ];
    });
  });
};

/**
 * Tallies how the game and the editor judged one map's events at one moment, the gated apart: which events each shows on
 * the same page, and which pages each judges alike.
 * @param {MapFile} map The map.
 * @param {readonly ProbeVerdicts[]} events The game's events on the map, as the probe recorded them.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @param {PageMoment} moment The moment the game's clock read: its time of day, in minutes past midnight, and the
 * season.
 * @param {ReadonlyMap<number, readonly number[]>} gated The pages counted apart, by index, by the event's id; the
 * quest-gated unless told otherwise.
 * @returns {PagesTally} The tally.
 */
const tallyPages = (
  map: MapFile,
  events: readonly ProbeVerdicts[],
  rule: PageRule,
  moment: PageMoment,
  gated: ReadonlyMap<number, readonly number[]> = questGatedPagesOf(map)): PagesTally =>
{
  const shownElsewhere = new Set(pageDifferencesOf(events, editorPagesOf(map, rule, moment)).map(difference => difference.id));
  const gatedEvents = events.filter(event => gated.has(event.id));
  const verdicts = editorVerdictsOf(map, rule, moment);
  const differ = verdictDifferencesOf(events, verdicts);
  const gatedDiffer = differ.filter(difference => (gated.get(difference.id) ?? []).includes(difference.page));
  const pages = events.reduce((sum, event) => sum + (verdicts.get(event.id) ?? []).length, 0);
  const gatedPages = gatedEvents.reduce((sum, event) => sum + (gated.get(event.id) ?? []).length, 0);
  return {
    events: events.length,
    eventsAlike: events.filter(event => shownElsewhere.has(event.id) === false).length,
    gatedEvents: gatedEvents.length,
    gatedEventsAlike: gatedEvents.filter(event => shownElsewhere.has(event.id) === false).length,
    pages,
    pagesAlike: pages - differ.length,
    gatedPages,
    gatedPagesAlike: gatedPages - gatedDiffer.length,
    gatedDiffer,
  };
};

/**
 * Words how a page is judged on each side, for a page judged differently.
 * @param {VerdictDifference} difference The page.
 * @returns {string} The words, such as "event 52 page 3 holds in the game, does not hold in the editor".
 */
const verdictWords = (difference: VerdictDifference): string =>
{
  const held = (holds: boolean): string => (holds ? 'holds' : 'does not hold');
  const game = difference.game === null
    ? 'stops the game when judged'
    : `${held(difference.game)} in the game`;
  return `event ${difference.id} page ${difference.page + 1} ${game}, ${held(difference.editor)} in the editor`;
};

/**
 * Words a page as a reason names it.
 * @param {number | null} pageIndex The page's index, -1 for none, or null where picking one threw.
 * @returns {string} The words, such as "page 2", "no page" or "no page it could pick".
 */
const pageNameOf = (pageIndex: number | null): string =>
{
  if (pageIndex === null)
  {
    return 'no page it could pick';
  }

  return pageIndex < 0 ? 'no page' : `page ${pageIndex + 1}`;
};

/**
 * Words the pages an event shows on each side, for a reason.
 * @param {number | null} game The page the game shows, -1 for none, or null where picking one threw.
 * @param {number} editor The page the editor shows, -1 for none.
 * @returns {string} The words, such as "shows page 2 in the game, page 1 in the editor".
 */
const pagesWords = (game: number | null, editor: number): string =>
{
  return `shows ${pageNameOf(game)} in the game, ${pageNameOf(editor)} in the editor`;
};

/**
 * Reads --seasons's list of moments to judge every time-gated page at.
 * @param {string} list The list, such as {@code summer@22:00,spring@05:00}; empty for none.
 * @returns {SeasonFixture[]} The seasons and times, in the order given.
 */
const parseSeasonFixtures = (list: string): SeasonFixture[] =>
{
  return list.split(',').filter(entry => entry !== '').map(entry =>
  {
    const match = SEASON_FIXTURE.exec(entry);
    if (match === null)
    {
      throw new Error(`--seasons takes seasons, each at a time, such as summer@22:00 or 1@22:00, not ${entry}`);
    }

    const [ , season, hours, minutes ] = match;
    const named = SEASON_NAMES.findIndex(name => name.toLowerCase() === season.toLowerCase());
    return { season: named >= 0 ? named : Number(season), time: (Number(hours) * 60) + Number(minutes) };
  });
};

/**
 * Names a season fixture as the probe keys its judgements: the season's name in lower case, then the time of day.
 * @param {SeasonFixture} fixture The fixture.
 * @returns {string} The key, such as {@code summer@1320}.
 */
const seasonKeyOf = (fixture: SeasonFixture): string =>
{
  return `${SEASON_NAMES[fixture.season].toLowerCase()}@${fixture.time}`;
};

/**
 * Builds the moment the game's clock is set to for a season fixture: the date the season moves the game's start to,
 * exactly as the editor's clock moves it, at the fixture's time of day, on the start's own second.
 * @param {GameDate} start The date a new game starts on, and the second, as the editor reads them.
 * @param {SeasonFixture} fixture The season and the time of day.
 * @returns {ProbeMoment} The moment.
 */
const seasonMomentOf = (start: GameDate, fixture: SeasonFixture): ProbeMoment =>
{
  const date = dateOfSeason(start, fixture.season);
  const { years, months, days, seconds } = date;
  return { key: seasonKeyOf(fixture), years, months, days, hours: Math.floor(fixture.time / 60), minutes: fixture.time % 60, seconds };
};

/**
 * Builds what the probe does on a map whose pages are judged at moments: it arrives there, judges every page at each
 * moment with the game's clock set to it, and draws nothing.
 * @param {number} mapId The map.
 * @param {readonly ProbeMoment[]} moments The moments.
 * @returns {ProbeMap} The probe's orders.
 */
const seasonProbeMapFor = (mapId: number, moments: readonly ProbeMoment[]): ProbeMap =>
{
  return { mapId, views: [], steps: [ 0 ], dark: false, moments: [ ...moments ] };
};

/**
 * Lists the page tags reading the date that hold on one date, with a near miss on each side of each: its day, month and
 * year and those either side; a span of days, of months, of years and of the whole day around it, the same spans just
 * before it and just after, and spans of days and of months that close in the next month or year without being open yet.
 * @param {GameDate} date The date.
 * @returns {string[]} The tags, each one comment line.
 */
const dateTagsAround = (date: GameDate): string[] =>
{
  const { days, months, years } = date;
  const wholeDay = (day: number): string => `<fullDateRangePage:[0,0,${day},${months},${years}]-[59,23,${day},${months},${years}]>`;
  return [
    `<dayPage:${days}>`,
    `<dayPage:${days - 1}>`,
    `<dayPage:${days + 1}>`,
    `<monthPage:${months}>`,
    `<monthPage:${months - 1}>`,
    `<monthPage:${months + 1}>`,
    `<yearPage:${years}>`,
    `<yearPage:${years - 1}>`,
    `<yearPage:${years + 1}>`,
    `<dayRangePage:${days - 1}-${days + 1}>`,
    `<dayRangePage:${days - 3}-${days - 1}>`,
    `<dayRangePage:${days + 1}-${days + 3}>`,
    `<dayRangePage:${days + 1}-${days}>`,
    `<monthRangePage:${months}-${months}>`,
    `<monthRangePage:${months - 2}-${months - 1}>`,
    `<monthRangePage:${months + 1}-${months + 2}>`,
    `<monthRangePage:${months + 1}-${months}>`,
    `<yearRangePage:${years}-${years + 1}>`,
    `<yearRangePage:${years - 1}-${years}>`,
    `<yearRangePage:${years + 1}-${years + 2}>`,
    wholeDay(days),
    wholeDay(days - 1),
    wholeDay(days + 1),
  ];
};

/**
 * Builds the date fixture: a blank map, in the game copy only, of events whose pages ask for the date, since a game may
 * ship none, as Chef Adventure does, and the season moves nothing else. Each tag that holds on any date given, and its
 * near misses, has an event of its own on one page; every season, by name and by number, has one; each date's season
 * gated by a night's hours shares a page; and one event has a page for each season after a plain first page, so the
 * page it shows names the season.
 * @param {readonly GameDate[]} dates The dates the fixture is judged on.
 * @param {number} tilesetId The tileset the blank map draws with.
 * @returns {RmmzMap} The map's file.
 */
const dateFixtureMap = (dates: readonly GameDate[], tilesetId: number): RmmzMap =>
{
  const seasons = SEASON_NAMES.map(name => `<seasonOfYearPage:${name.toLowerCase()}>`);
  const numbered = SEASON_NAMES.map((_name, season) => `<seasonOfYearPage:${season}>`);
  const singles = [ ...new Set([ ...seasons, ...numbered, ...dates.flatMap(dateTagsAround) ]) ].map(line => [ [ line ] ]);
  const byNight = [ ...new Set(dates.map(date => seasons[seasonOfMonth(date.months)])) ].map(line => [ [ line, '<hourRangePage:18-5>' ] ]);
  const pageLists = [ ...singles, ...byNight, [ [], ...seasons.map(line => [ line ]) ] ];
  const blank = newMapContent(tilesetId);
  const events = pageLists.map((lines, index) =>
  {
    const pages = lines.map(comments => ({
      ...createEventPage(),
      list: [ ...comments.map(text => ({ code: 108, indent: 0, parameters: [ text ] })), { code: 0, indent: 0, parameters: [] } ],
    }));
    return { ...createMapEvent(index + 1, index % blank.width, Math.floor(index / blank.width)), pages };
  });

  // a tile for every event, the map growing downward past MZ's new size should there be more of them than it holds.
  const height = Math.max(blank.height, Math.ceil(events.length / blank.width));
  return { ...blank, height, data: new Array<number>(blank.width * height * MAP_LAYERS).fill(0), events: [ null, ...events ] };
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

/**
 * Reads --weather's list of maps, each with an optional time of day.
 * @param {string} list The list, such as {@code 65,102,309@22:00}; empty for none.
 * @returns {WeatherFixture[]} The maps and times, in the order given.
 */
const parseWeatherFixtures = (list: string): WeatherFixture[] =>
{
  return list.split(',').filter(entry => entry !== '').map(entry =>
  {
    const match = WEATHER_FIXTURE.exec(entry);
    if (match === null)
    {
      throw new Error(`--weather takes maps, each with an optional time, such as 65 or 309@22:00, not ${entry}`);
    }

    const [ , mapId, hours, minutes ] = match;
    return hours === undefined
      ? { mapId: Number(mapId) }
      : { mapId: Number(mapId), time: (Number(hours) * 60) + Number(minutes) };
  });
};

/**
 * Builds what the probe does on a map read for its weather: it arrives there, at the time of day asked for if any, and
 * reads the weather with the display in the middle of the map, so the game's whole screen lies on the map and the
 * editor's weather falls over the same stretch of it.
 * @param {WeatherFixture} fixture The map, and the time to read it at.
 * @param {MapFile} map Its file.
 * @param {{ width: number, height: number }} screen The game's screen, in pixels.
 * @returns {ProbeMap} The probe's orders.
 */
const weatherProbeMapFor = (fixture: WeatherFixture, map: MapFile, screen: { width: number; height: number }): ProbeMap =>
{
  const weather = {
    x: Math.max(0, Math.floor((map.width - (screen.width / TILE)) / 2)),
    y: Math.max(0, Math.floor((map.height - (screen.height / TILE)) / 2)),
  };
  return fixture.time === undefined
    ? { mapId: fixture.mapId, views: [], steps: [ 0 ], dark: false, weather }
    : { mapId: fixture.mapId, views: [], steps: [ 0 ], dark: false, weather, time: fixture.time };
};

/**
 * Reads --sky-weather's list of maps, each under a sky at a season and an hour.
 * @param {string} list The list, such as {@code 337:rain:heavy@winter@12:00}; empty for none.
 * @returns {SkyWeatherFixture[]} The maps and skies, in the order given.
 */
const parseSkyWeatherFixtures = (list: string): SkyWeatherFixture[] =>
{
  return list.split(',').filter(entry => entry !== '').map(entry =>
  {
    const match = SKY_WEATHER_FIXTURE.exec(entry);
    if (match === null)
    {
      throw new Error(`--sky-weather takes maps under a sky, at a season and an hour, such as 337:rain:heavy@winter@12:00, not ${entry}`);
    }

    const [ , mapId, condition, strength, season, hours, minutes ] = match;
    const named = SEASON_NAMES.findIndex(name => name.toLowerCase() === season.toLowerCase());
    return {
      mapId: Number(mapId),
      condition,
      strength,
      season: named >= 0 ? named : Number(season),
      time: (Number(hours) * 60) + Number(minutes),
    };
  });
};

/**
 * Names a map read under a sky as the probe keys its weather: the map, the sky's condition and strength, the season's
 * name in lower case and the time of day.
 * @param {SkyWeatherFixture} fixture The fixture.
 * @returns {string} The key, such as {@code 337:rain:heavy@winter@720}.
 */
const skyWeatherKeyOf = (fixture: SkyWeatherFixture): string =>
{
  return `${fixture.mapId}:${fixture.condition}:${fixture.strength}@${SEASON_NAMES[fixture.season].toLowerCase()}@${fixture.time}`;
};

/**
 * Builds what the probe does on a map read under a sky: it arrives there on the date the editor's clock moves the
 * game's start to for the fixture's season, at the fixture's hour, the clock stopped, holds J-Weather-Time's sky in the
 * fixture's condition at its strength, and reads the weather as it reads any map's, with the display in the middle of
 * the map.
 * @param {SkyWeatherFixture} fixture The map, the sky, the season and the hour.
 * @param {MapFile} map Its file.
 * @param {{ width: number, height: number }} screen The game's screen, in pixels.
 * @param {GameDate} start The date a new game starts on, and the second, as the editor reads them.
 * @returns {ProbeMap} The probe's orders.
 */
const skyWeatherProbeMapFor = (fixture: SkyWeatherFixture, map: MapFile, screen: { width: number; height: number }, start: GameDate): ProbeMap =>
{
  const { weather } = weatherProbeMapFor({ mapId: fixture.mapId }, map, screen);
  const { years, months, days, seconds } = seasonMomentOf(start, { season: fixture.season, time: fixture.time });
  return {
    mapId: fixture.mapId,
    views: [],
    steps: [ 0 ],
    dark: false,
    weather,
    time: fixture.time,
    date: { years, months, days, seconds },
    sky: { type: fixture.condition, intensity: fixture.strength, key: skyWeatherKeyOf(fixture) },
  };
};

/**
 * Compares what each side's sky hands J-Weather: the face it wears, its strength and its condition, all exact, since
 * both sides pick them from the same config the same way.
 * @param {unknown} game What J-Weather-Time handed J-Weather in the game.
 * @param {unknown} editor What the editor's sky told its renderer.
 * @returns {WeatherCheck} The check.
 */
const compareSky = (game: unknown, editor: unknown): WeatherCheck =>
{
  return { name: 'sky', game: JSON.stringify(game), editor: JSON.stringify(editor), holds: canonicalJson(game) === canonicalJson(editor) };
};

/**
 * Writes a value with its keys in order, so two objects holding the same values compare alike whatever order their keys
 * were written in.
 * @param {unknown} value The value.
 * @returns {string} The value as JSON, keys sorted at every depth.
 */
const canonicalJson = (value: unknown): string =>
{
  const sorted = (node: unknown): unknown =>
  {
    if (Array.isArray(node))
    {
      return node.map(sorted);
    }

    if (node !== null && typeof node === 'object')
    {
      return Object.fromEntries(Object.keys(node).sort().map(key => [ key, sorted((node as Record<string, unknown>)[key]) ]));
    }

    return node;
  };
  return JSON.stringify(sorted(value));
};

/**
 * Words a spread for a line of the report.
 * @param {ProbeSpread} spread The spread.
 * @returns {string} Its least, mean and greatest, such as "6.80..9.35..11.90".
 */
const spreadWords = (spread: ProbeSpread): string =>
{
  const at = (value: number): string => (Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(3));
  return `${at(spread.min)}..${at(spread.mean)}..${at(spread.max)}`;
};

/**
 * Reports whether two spreads of a randomly rolled number agree: their means within {@link MEAN_TOLERANCE} of the wider
 * spread, or, for populations small enough that chance strays further, within {@link MEAN_ERRORS} standard errors of
 * the difference between the two means, from each side's standard deviation and how many it is of; and each side's
 * range reaching into the other's. A spread without its deviation, or of an untold number, strays by nothing.
 * @param {ProbeSpread} game The game's spread.
 * @param {ProbeSpread} editor The editor's.
 * @param {number} gameCount How many the game's spread is of; untold, too many to stray.
 * @param {number} editorCount How many the editor's spread is of; untold, too many to stray.
 * @returns {boolean} True when they agree.
 */
const spreadsAgree = (game: ProbeSpread, editor: ProbeSpread, gameCount = Number.POSITIVE_INFINITY, editorCount = Number.POSITIVE_INFINITY): boolean =>
{
  const width = Math.max(game.max - game.min, editor.max - editor.min);
  const strayOf = (spread: ProbeSpread, count: number): number => ((spread.sd ?? 0) ** 2) / Math.max(count, 1);
  const chance = MEAN_ERRORS * Math.sqrt(strayOf(game, gameCount) + strayOf(editor, editorCount));
  const close = Math.abs(game.mean - editor.mean) <= Math.max(MEAN_TOLERANCE * width, chance) + 1e-9;
  const overlap = game.min <= editor.max + 1e-9 && editor.min <= game.max + 1e-9;
  return close && overlap;
};

/**
 * Reports whether two shares of populations agree: within {@link SHARE_ERRORS} standard errors of the difference
 * between two draws of their pooled chance, and never held tighter than {@link SHARE_FLOOR}.
 * @param {number} game The game's share.
 * @param {number} gameCount How many the game's share is of.
 * @param {number} editor The editor's share.
 * @param {number} editorCount How many the editor's share is of.
 * @returns {boolean} True when they agree.
 */
const sharesAgree = (game: number, gameCount: number, editor: number, editorCount: number): boolean =>
{
  const pooled = ((game * gameCount) + (editor * editorCount)) / Math.max(gameCount + editorCount, 1);
  const error = Math.sqrt(pooled * (1 - pooled) * ((1 / Math.max(gameCount, 1)) + (1 / Math.max(editorCount, 1))));
  return Math.abs(game - editor) <= Math.max(SHARE_ERRORS * error, SHARE_FLOOR);
};

/**
 * Compares one layer of a map's weather on both sides: the layer as J-Weather resolved it, which must match to the
 * digit, since both sides fold the same config the same way; its pictures and their sizes, its particle count, tint and
 * blend, all exact; how many particles wait, exact; and, since particles are rolled at random on both sides, the spread
 * of their speeds across and down, their widths and heights, turns, lifetimes and strengths by {@link spreadsAgree}, and
 * the shares on screen and in a second life by {@link sharesAgree}.
 * @param {number} index The layer's place in the look, from 0.
 * @param {WeatherLayerProbe} game The game's layer.
 * @param {WeatherLayerProbe} editor The editor's.
 * @returns {WeatherCheck[]} The checks.
 */
const compareWeatherLayer = (index: number, game: WeatherLayerProbe, editor: WeatherLayerProbe): WeatherCheck[] =>
{
  const name = (what: string): string => `layer ${index + 1} ${what}`;
  const exact = (what: string, left: unknown, right: unknown): WeatherCheck =>
    ({ name: name(what), game: JSON.stringify(left), editor: JSON.stringify(right), holds: canonicalJson(left) === canonicalJson(right) });

  // every spread but the strength's is of the first-life particles alone; the strength's is of every particle.
  const countOf = (layer: WeatherLayerProbe, what: string): number => (what === 'strength' ? layer.stats.count : layer.stats.firstLife);
  const spread = (what: string, pick: (layer: WeatherLayerProbe) => ProbeSpread): WeatherCheck => ({
    name: name(what),
    game: spreadWords(pick(game)),
    editor: spreadWords(pick(editor)),
    holds: spreadsAgree(pick(game), pick(editor), countOf(game, what), countOf(editor, what)),
  });
  const share = (what: string, pick: (layer: WeatherLayerProbe) => number): WeatherCheck =>
    ({ name: name(what), game: pick(game).toFixed(3), editor: pick(editor).toFixed(3), holds: sharesAgree(pick(game), game.stats.count, pick(editor), editor.stats.count) });
  const gameBlend = typeof game.blend === 'number' ? ENGINE_BLENDS[game.blend] ?? String(game.blend) : game.blend;
  const secondShare = (layer: WeatherLayerProbe): number => (layer.stats.count === 0 ? 0 : layer.stats.secondLife / layer.stats.count);
  return [
    exact('effect', game.layer, editor.layer),
    exact('picture', [ game.asset, game.pictureSize ], [ editor.asset, editor.pictureSize ]),
    exact('stage picture', [ game.becomesAsset, game.becomesPictureSize ], [ editor.becomesAsset, editor.becomesPictureSize ]),
    exact('count', game.stats.count, editor.stats.count),
    exact('tint', game.tint, editor.tint),
    exact('blend', gameBlend, editor.blend),
    exact('waiting', game.stats.waiting, editor.stats.waiting),
    spread('speed across', layer => layer.stats.velocityX),
    spread('speed down', layer => layer.stats.velocityY),
    spread('width', layer => layer.stats.scaleX),
    spread('height', layer => layer.stats.scaleY),
    spread('turn', layer => layer.stats.rotation),
    spread('life', layer => layer.stats.life),
    spread('strength', layer => layer.stats.opacity),
    share('on screen', layer => layer.stats.onScreen),
    share('second life', secondShare),
  ];
};

/**
 * Compares a map's weather on both sides: the weather each resolved, how many layers each draws, and every layer by
 * {@link compareWeatherLayer}.
 * @param {WeatherSide} game The game's weather.
 * @param {WeatherSide} editor The editor's.
 * @returns {WeatherCheck[]} The checks.
 */
const compareWeather = (game: WeatherSide, editor: WeatherSide): WeatherCheck[] =>
{
  const weather: WeatherCheck = {
    name: 'weather',
    game: JSON.stringify(game.current),
    editor: JSON.stringify(editor.current),
    holds: canonicalJson(game.current) === canonicalJson(editor.current),
  };
  const layers: WeatherCheck = {
    name: 'layers',
    game: String(game.layers.length),
    editor: String(editor.layers.length),
    holds: game.layers.length === editor.layers.length,
  };
  const each = game.layers.flatMap((layer, index) => (editor.layers[index] === undefined ? [] : compareWeatherLayer(index, layer, editor.layers[index])));
  return [ weather, layers, ...each ];
};

/**
 * Judges where the game draws its weather: inside the base sprite, whose colour filter casts the screen's tone, after
 * the tilemap, so over the map and every character, and beneath J-Lighting's mask, which sits in the spriteset above the
 * base sprite.
 * @param {WeatherDepthProbe} depth Where the game's weather plane sits.
 * @returns {{ holds: boolean, words: string }} Whether it sits there, and where it sits, in words.
 */
const gameWeatherDepth = (depth: WeatherDepthProbe): { holds: boolean; words: string } =>
{
  const tilemap = depth.base.indexOf('Tilemap');
  const toned = depth.baseFilters.includes('ColorFilter');
  const holds = toned && depth.planeIndex > tilemap && tilemap >= 0 && depth.maskIndex > depth.baseIndex;
  const words = `plane is child ${depth.planeIndex + 1} of ${depth.base.length} in the base sprite [${depth.base.join(', ')}],`
    + ` filtered by [${depth.baseFilters.join(', ')}]; base sprite is spriteset child ${depth.baseIndex + 1},`
    + ` light mask child ${depth.maskIndex + 1} of [${depth.spriteset.join(', ')}]; tone ${JSON.stringify(depth.tone)}`;
  return { holds, words };
};

/**
 * Judges where the editor draws its weather: inside the game container, the one a screen tone colours, after the events
 * above characters, and beneath the lighting, which sits in the world above the game container.
 * @param {EditorWeatherDepth} depth Where the editor's weather sits.
 * @returns {{ holds: boolean, words: string }} Whether it sits there, and where it sits, in words.
 */
const editorWeatherDepth = (depth: EditorWeatherDepth): { holds: boolean; words: string } =>
{
  const upper = depth.game.indexOf('upperTiles');
  const holds = depth.weatherIndex > upper && upper >= 0 && depth.lightingIndex > depth.gameIndex;
  const words = `weather is child ${depth.weatherIndex + 1} of ${depth.game.length} in the game container [${depth.game.join(', ')}],`
    + ` which carries ${depth.gameFilters} tone filter(s); game container is world child ${depth.gameIndex + 1},`
    + ` lighting child ${depth.lightingIndex + 1}`;
  return { holds, words };
};

export {
  animates,
  canonicalJson,
  compareSky,
  compareWeather,
  coverAxis,
  editorWeatherDepth,
  gameWeatherDepth,
  parseSkyWeatherFixtures,
  parseWeatherFixtures,
  sharesAgree,
  SKY_WEATHER_FIXTURES,
  skyWeatherKeyOf,
  skyWeatherProbeMapFor,
  spreadsAgree,
  WEATHER_FIXTURES,
  weatherProbeMapFor,
  darkLightsOf,
  dateFixtureMap,
  dateTagsAround,
  editorPagesOf,
  editorVerdictsOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  lightReaches,
  pageDifferencesOf,
  pagesProbeMapFor,
  pagesWords,
  parityPageRule,
  parseSeasonFixtures,
  probeMapFor,
  questGatedPagesOf,
  SEASON_FIXTURES,
  seasonKeyOf,
  seasonMomentOf,
  seasonProbeMapFor,
  skyProbeMapFor,
  snapshotPredictions,
  spriteCovers,
  startingPartyOf,
  steadyLighting,
  tallyPages,
  TILE,
  timeGatedPagesOf,
  timeOfCapture,
  verdictDifferencesOf,
  verdictWords,
};
export type {
  DarkLight,
  EditorPages,
  EditorWeatherDepth,
  JudgedView,
  LightingConfigFile,
  MapFile,
  PageDifference,
  PagesTally,
  SeasonFixture,
  SkyWeatherFixture,
  VerdictDifference,
  WeatherCheck,
  WeatherFixture,
  WeatherSide,
};
