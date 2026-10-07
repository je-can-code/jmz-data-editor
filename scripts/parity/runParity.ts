/// <reference types="bun-types" />
/**
 * The map editor's engine parity check: the real game, run headlessly with every event frozen and the lighting off,
 * draws each fixture map view by view, and the editor draws the same views; the two are compared pixel by pixel inside
 * the map.
 *
 *   bun run parity [--maps 102,31,94,316] [--sky 337@22:00,337@14:00] [--pages 20,21] [--mode game|snapshot|both]
 *                  [--scratch <base folder>] [--project <game>] [--ui-port 18200] [--api-port 18201] [--display :90]
 *                  [--nw <binary>]
 *
 * Each invocation works in a folder of its own inside the base folder (the system's temporary folder unless --scratch
 * names another), builds the editor afresh there, and leaves its pictures and report there; it prints where.
 *
 * Two passes per view, and a third on a dark map. The tiles pass hides every character on both sides, so what remains
 * is the parallax and the tiles: it must match, within 2 per channel for compositing rounding. The events pass draws
 * events as each side draws them, at the hour the game's clock read when it arrived on the map: the editor shows each
 * event's page as a fresh save would at that hour, while the game, started new straight onto the map, shows whichever
 * page its own state gives, so every differing cell there is either explained by an event the game shows differently
 * (another page, hidden, or drawn otherwise than its page) or listed as unexplained. The events whose pages differ are
 * counted too, the page rule's own measure. The dark pass, on a map whose note declares darkness, draws the tiles alone
 * again under J-Lighting's light mask on both sides, the editor showing only what the game shows of its lighting: a
 * differing cell there is explained only by a light the game shows from another page than the editor's. Any cell left
 * unexplained, in any pass, fails the check.
 *
 * A map drawn at a time of day (--sky; Map337 at 22:00 and at 14:00 unless told otherwise) is arrived at with the game's
 * clock set to that time and stopped, so every event shows the page that hour gives it and the sky is already there. Its
 * events pass is drawn at that hour, and its sky pass draws its tiles with the screen's tone over them and the light
 * mask multiplied over that; the editor draws the same views at the same hour, its sky's tone and its dark the only
 * lighting it shows. A differing cell is explained as in the dark pass, by a light the game shows from another page at
 * that hour.
 *
 * Every map holding an event with a quest-gated page (or the maps --pages names instead, none for an empty list) is
 * visited too, after the drawn maps and before the skies, and compared by its pages alone, nothing drawn: on arrival
 * the game records how it judges each page of each event, every plugin's condition included, and the editor judges the
 * same pages by its own rule at the hour the game's clock read, J-OMNI-Quests' tags against the quests a new game starts
 * with. Each such map prints how many events both show on the same page and how many pages both judge alike, the
 * quest-gated ones counted apart, and a quest-gated page judged differently fails the check.
 *
 * Maps with water or waterfalls are compared at all four animation steps. The game draws on SwiftShader, which is
 * fine for pictures and meaningless for timing. The game runs from a copy in the run's folder, muted, on a virtual
 * display, its lights held steady in the copy's config so that every frame of it is the same frame; nothing here
 * writes to the game's own folder.
 *
 * The snapshot mode is the cheaper day-to-day comparator: ca/tools/mapgen/snapshot.js draws each map whole, and the
 * editor draws it whole too; the differences the engine predicts against snapshot.js (star tiles drawn last, table
 * legs and edges) are counted apart from the rest.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import type { JsonValue } from '../../app/src/mapEditor/core/model/json.ts';
import type { PageRule } from '../../app/src/mapEditor/core/pageRule/pageRule.ts';
import { readPluginEntries } from '../../app/src/services/plugins/PluginsJsReader.ts';
import { startEditorStack } from '../speed/editorStack.ts';
import { openSpeedBrowser } from '../speed/gpuChromium.ts';
import { createRunFolder } from '../speed/runFolder.ts';
import { comparePictures, decodePng, differencePicture, writePng, type CellDifference, type Comparison } from './compareImages.ts';
import type { ProbeCapture, ProbeReport } from './probeTypes.ts';
import { runHeadlessGame } from './headlessGame.ts';
import {
  darkLightsOf,
  editorPagesOf,
  eventsKeyOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  pageDifferencesOf,
  pagesProbeMapFor,
  pagesWords,
  parityPageRule,
  probeMapFor,
  questGatedPagesOf,
  skyProbeMapFor,
  snapshotPredictions,
  startingPartyOf,
  steadyLighting,
  tallyPages,
  TILE,
  timeOfCapture,
  verdictWords,
  type EditorPages,
  type LightingConfigFile,
  type MapFile,
  type PageDifference,
  type PagesTally,
} from './parityRules.ts';

/**
 * One map to draw under its sky, and the time of day to draw it at, in minutes past midnight.
 */
type SkyFixture = {
  mapId: number;
  time: number;
};

/**
 * The script's settings. The maps compared by their pages alone are null until worked out from the game, which is then
 * every map holding a quest-gated event.
 */
type Options = {
  maps: number[];
  sky: SkyFixture[];
  pages: number[] | null;
  mode: 'game' | 'snapshot' | 'both';
  scratch: string;
  project: string;
  uiPort: number;
  apiPort: number;
  display: string;
  nw: string;
};

/**
 * One compared view.
 */
type ViewResult = {
  capture: ProbeCapture;
  comparison: Comparison;
  explained: CellDifference[];
  unexplained: CellDifference[];
  reasons: string[];
};

/**
 * How the pages of one map's events compared at one hour: how many events the game had on the map, and those it showed
 * on another page than the editor.
 */
type PageComparison = {
  events: number;
  differ: PageDifference[];
};

/**
 * How the game and the editor judged the pages of one map holding quest-gated events, at the hour the game's clock read
 * on arrival, under the key the probe keeps its events by.
 */
type QuestPages = {
  key: string;
  tally: PagesTally;
};

/**
 * The page's hooks, as far as the check calls them.
 */
type HookWindow = {
  __jmzMapView?: {
    ready: () => boolean;
    info: () => { stats: { loadingImages: number } };
    prepareParity: (options: { events: boolean; step: number; frames: number; lighting?: boolean; time?: number }) => void;
    extract: (rect: { x: number; y: number; width: number; height: number }) => Promise<string>;
  };
};

/**
 * The fixtures, and what each one proves.
 */
const FIXTURES: Record<number, string> = {
  102: 'the heavy fixture: water, waterfalls, star tiles, shadows, regions and 108 events',
  31: 'table tiles, which spike S6 saw differ from snapshot.js, under a looping, scrolling parallax',
  94: 'the most waterfalls, 110, beside water, under a still parallax',
  316: 'the most star tiles, 1,123, under a still parallax',
  4: 'dark: a cave at 85%, seven torches alike, kept from the clock by <noToneChange>',
  6: 'dark: a cave at 85%, torches and ghosts of three looks, one of them lit only behind a switch',
  337: 'under the sky: an outdoor map with no darkness of its own, 36 lamps lit only from 18:00 to 05:00 by <hourRangePage>,'
    + ' and 16 creatures out only by day or only by night',
};

/**
 * The maps drawn under their sky, and when: night, when the sky is deepest and every light shows, and the afternoon the
 * game starts in, whose faint dusk still earns a mask.
 */
const SKY_FIXTURES = '337@22:00,337@14:00';

/**
 * A map and a time of day as --sky takes them: the map's id, an at sign, then hours and minutes on a 24-hour clock.
 */
const SKY_FIXTURE = /^(\d+)@([01]?\d|2[0-3]):([0-5]\d)$/u;

/**
 * Reads --sky's list of maps and times.
 * @param {string} list The list, such as {@code 337@22:00,337@14:00}; empty for none.
 * @returns {SkyFixture[]} The maps and times, in the order given.
 */
const parseSkyFixtures = (list: string): SkyFixture[] =>
{
  return list.split(',').filter(entry => entry !== '').map(entry =>
  {
    const match = SKY_FIXTURE.exec(entry);
    if (match === null)
    {
      throw new Error(`--sky takes a map and a time, such as 337@22:00, not ${entry}`);
    }

    const [ , mapId, hours, minutes ] = match;
    return { mapId: Number(mapId), time: (Number(hours) * 60) + Number(minutes) };
  });
};

/**
 * Words a time of day as a 24-hour clock writes it.
 * @param {number} time The time of day, in minutes past midnight.
 * @returns {string} The time, such as 22:00.
 */
const clockOf = (time: number): string =>
{
  return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
};

/**
 * Holds the game copy's lights steady for the run: every effect's depth in its config.lighting.json goes to 0, so each
 * frame of the game shows every light at full strength, as the editor draws them while effects do not animate. The copy
 * gets a fresh file of its own, so not even a link could lead the write back to the game's.
 * @param {string} copy The game copy.
 */
const holdLightsSteady = (copy: string): void =>
{
  const file = `${copy}/data/config.lighting.json`;
  if (existsSync(file) === false)
  {
    return;
  }

  const steady = steadyLighting(JSON.parse(readFileSync(file, 'utf8')) as LightingConfigFile);
  rmSync(file);
  writeFileSync(file, JSON.stringify(steady, null, 2));
};

/**
 * How far a colour may drift and still match: compositing rounds premultiplied alpha differently in the two pipelines.
 */
const TOLERANCE = 2;

/**
 * Reads --pages's list of maps compared by their pages alone.
 * @param {string | undefined} list The list, such as {@code 20,21}; empty for none; left out, to be worked out from the
 * game.
 * @returns {number[] | null} The maps, in the order given, or null to work them out.
 */
const parsePageMaps = (list: string | undefined): number[] | null =>
{
  if (list === undefined)
  {
    return null;
  }

  return list === '' ? [] : list.split(',').map(Number);
};

/**
 * Reads the settings from the command line.
 * @param {string[]} argv The arguments after the script's name.
 * @returns {Options} The settings.
 */
const parseOptions = (argv: string[]): Options =>
{
  const flags = new Map<string, string>();
  argv.forEach((argument, index) =>
  {
    if (argument.startsWith('--'))
    {
      const next = argv[index + 1];
      flags.set(argument.slice(2), next === undefined || next.startsWith('--') ? 'true' : next);
    }
  });

  return {
    maps: (flags.get('maps') ?? '102,31,94,316,4,6').split(',').map(Number),
    sky: parseSkyFixtures(flags.get('sky') ?? SKY_FIXTURES),
    pages: parsePageMaps(flags.get('pages')),
    mode: (flags.get('mode') ?? 'both') as Options['mode'],
    scratch: flags.get('scratch') ?? tmpdir(),
    project: flags.get('project') ?? process.env['JMZ_PROJECT_ROOT'] ?? '',
    uiPort: Number(flags.get('ui-port') ?? 18200),
    apiPort: Number(flags.get('api-port') ?? 18201),
    display: flags.get('display') ?? ':90',
    nw: flags.get('nw') ?? 'nw',
  };
};

/**
 * Reads a map file.
 * @param {string} project The game.
 * @param {number} mapId The map.
 * @returns {Promise<MapFile>} The file's content.
 */
const readMap = async (project: string, mapId: number): Promise<MapFile> =>
{
  return Bun.file(`${project}/data/Map${String(mapId).padStart(3, '0')}.json`).json() as Promise<MapFile>;
};

/**
 * Reads the page rule the editor shows the game by, from the game's own files: its plugins, for J-TIME's and
 * J-OMNI-Quests' page tags; its quest config, for the quests a new game starts with, when it has one; and its starting
 * party.
 * @param {string} project The game.
 * @returns {Promise<PageRule>} The rule.
 */
const readPageRule = async (project: string): Promise<PageRule> =>
{
  const plugins = readPluginEntries(await Bun.file(`${project}/js/plugins.js`).text());
  const system = await Bun.file(`${project}/data/System.json`).json() as { partyMembers: number[] };
  const actors = await Bun.file(`${project}/data/Actors.json`).json() as (object | null)[];
  const questFile = `${project}/data/config.quest.json`;
  const configs = new Map<string, JsonValue | null>(existsSync(questFile) ? [ [ 'quest', await Bun.file(questFile).json() as JsonValue ] ] : []);
  return parityPageRule(plugins, startingPartyOf(system.partyMembers, actors), configs);
};

/**
 * Finds every map of the game holding an event with a quest-gated page.
 * @param {string} project The game.
 * @returns {Promise<number[]>} The maps' ids, in order.
 */
const questGatedMapIds = async (project: string): Promise<number[]> =>
{
  const files = readdirSync(`${project}/data`).filter(name => /^Map\d{3,}\.json$/u.test(name)).sort();
  const mapIds: number[] = [];
  for (const file of files)
  {
    const map = await Bun.file(`${project}/data/${file}`).json() as MapFile;
    if (questGatedPagesOf(map).size > 0)
    {
      mapIds.push(Number.parseInt(file.slice('Map'.length), 10));
    }
  }

  return mapIds;
};

/**
 * Names the page the editor shows each of a capture's map's events, at the hour the capture is drawn at; a game with no
 * clock has no hour to give, and then its rule holds no tag that reads one, so any hour answers alike.
 * @param {ProbeCapture} capture The capture.
 * @param {MapFile} map The map.
 * @param {ProbeReport} report The probe's report.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @returns {EditorPages} Each event's page, -1 for none.
 */
const editorPagesFor = (capture: ProbeCapture, map: MapFile, report: ProbeReport, rule: PageRule): EditorPages =>
{
  return editorPagesOf(map, rule, timeOfCapture(capture, report.clocks) ?? 0);
};

/**
 * Writes a data URL's PNG to a file.
 * @param {string} url The data URL.
 * @param {string} file Where.
 */
const saveDataUrl = async (url: string, file: string): Promise<void> =>
{
  await Bun.write(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
};

/**
 * Opens a map in the editor page and waits for it to draw.
 * @param {Page} page The page.
 * @param {string} uiBase The UI's origin.
 * @param {number} mapId The map.
 */
const openEditorMap = async (page: Page, uiBase: string, mapId: number): Promise<void> =>
{
  await page.goto(`${uiBase}/map.html?map=${mapId}&speed=1`);
  await page.waitForFunction(() => (window as unknown as HookWindow).__jmzMapView?.ready() === true, null, { timeout: 60_000 });

  // the character sheets and the parallax load after the first frame; the pictures must wait for them.
  await page.waitForFunction(() => (window as unknown as HookWindow).__jmzMapView?.info().stats.loadingImages === 0, null, { timeout: 60_000 });
};

/**
 * Draws one of the game's captures in the editor, at the hour the capture was drawn at in the game.
 * @param {Page} page The page, on the capture's map.
 * @param {ProbeCapture} capture The game's capture.
 * @param {ProbeReport} report The probe's report.
 * @param {string} file Where to write the editor's picture.
 */
const drawInEditor = async (page: Page, capture: ProbeCapture, report: ProbeReport, file: string): Promise<void> =>
{
  const url = await page.evaluate(async ({ pass, step, time, rect }) =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    hooks?.prepareParity({ events: pass === 'events', step, frames: 0, lighting: pass === 'dark' || pass === 'sky', time: time ?? undefined });
    return hooks?.extract(rect) ?? '';
  }, { pass: capture.pass, step: capture.step, time: timeOfCapture(capture, report.clocks), rect: { x: capture.display.x * TILE, y: capture.display.y * TILE, ...report.screen } });
  await saveDataUrl(url, file);
};

/**
 * Compares one capture pair.
 * @param {ProbeCapture} capture The capture.
 * @param {MapFile} map The map.
 * @param {ProbeReport} report The probe's report.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @param {string} folder Where the pictures are.
 * @returns {Promise<ViewResult>} What it came to.
 */
const compareCapture = async (capture: ProbeCapture, map: MapFile, report: ProbeReport, rule: PageRule, folder: string): Promise<ViewResult> =>
{
  const game = await decodePng(`${folder}/${capture.file}`);
  const editor = await decodePng(`${folder}/${capture.file.replace(/^game-/u, 'editor-')}`);
  const origin = { x: -capture.display.x * TILE, y: -capture.display.y * TILE };
  const region = { x: origin.x, y: origin.y, width: map.width * TILE, height: map.height * TILE };
  const comparison = comparePictures(game, editor, region, origin, TILE, TOLERANCE);
  if (comparison.differingPixels > 0)
  {
    await writePng(differencePicture(game, editor, TOLERANCE), `${folder}/${capture.file.replace(/^game-/u, 'diff-')}`);
  }

  const events = report.events[eventsKeyOf(capture)] ?? [];
  const editorPages = editorPagesFor(capture, map, report, rule);
  const lights = darkLightsOf(map, editorPages);
  const explained: CellDifference[] = [];
  const unexplained: CellDifference[] = [];
  const reasons = new Set<string>();
  const explain = (cell: CellDifference): string | null =>
  {
    switch (capture.pass)
    {
      case 'events':
        return explainCell(cell, events, editorPages);
      case 'dark':
      case 'sky':
        return explainDarkCell(cell, lights, events);
      case 'tiles':
        return null;
    }
  };
  comparison.cells.forEach(cell =>
  {
    const reason = explain(cell);
    if (reason === null)
    {
      unexplained.push(cell);
      return;
    }

    explained.push(cell);
    reasons.add(reason);
  });

  return { capture, comparison, explained, unexplained, reasons: [ ...reasons ] };
};

/**
 * Runs the game and the editor over the fixtures and compares every view.
 * @param {Options} options The settings.
 * @returns {Promise<boolean>} True when every tiles pass matched.
 */
const runGameParity = async (options: Options): Promise<boolean> =>
{
  const folder = `${options.scratch}/views`;
  mkdirSync(folder, { recursive: true });
  const screen = { width: 1920, height: 1080 };
  const maps = new Map<number, MapFile>();
  const mapIds = [ ...new Set([ ...options.maps, ...options.sky.map(fixture => fixture.mapId) ]) ];

  // the maps compared by their pages alone: those holding quest-gated events, unless the run names others, leaving out
  // any already drawn, whose pages are judged with the rest of what is drawn there.
  const pageMapIds = (options.pages ?? await questGatedMapIds(options.project)).filter(mapId => mapIds.includes(mapId) === false);
  for (const mapId of [ ...mapIds, ...pageMapIds ])
  {
    maps.set(mapId, await readMap(options.project, mapId));
  }

  // the skies come last, so the game has always arrived somewhere before its clock is set for one; the maps compared by
  // their pages alone come before them, so their pages are judged at the game's own hour.
  const probeMaps = [
    ...options.maps.map(mapId => probeMapFor(mapId, maps.get(mapId) as MapFile, screen)),
    ...pageMapIds.map(pagesProbeMapFor),
    ...options.sky.map(fixture => skyProbeMapFor(fixture.mapId, maps.get(fixture.mapId) as MapFile, screen, fixture.time)),
  ];
  const report = await runHeadlessGame(
    {
      projectRoot: options.project,
      scratch: options.scratch,
      display: options.display,
      nwBinary: options.nw,
      timeoutMs: 10 * 60_000,
      prepare: holdLightsSteady,
    },
    { outDir: folder, maps: probeMaps, tickLimit: 6000 });
  if (report.phase !== 'done')
  {
    throw new Error(`the game's probe ended in "${report.phase}": ${report.errors.join('; ')}`);
  }

  // the editor draws on SwiftShader reached as the game reaches it, so its light pictures rasterise as the game's do.
  const stack = await startEditorStack({ projectRoot: options.project, scratch: `${options.scratch}/editor`, uiPort: options.uiPort, apiPort: options.apiPort });
  const { browser } = await openSpeedBrowser({ mode: 'swiftshader-as-game' });
  try
  {
    const page = await browser.newPage({ viewport: screen, deviceScaleFactor: 1 });
    for (const mapId of mapIds)
    {
      await openEditorMap(page, stack.uiBase, mapId);
      for (const capture of report.captures.filter(each => each.mapId === mapId))
      {
        await drawInEditor(page, capture, report, `${folder}/${capture.file.replace(/^game-/u, 'editor-')}`);
      }
    }
  }
  finally
  {
    await browser.close();
    await stack.stop();
  }

  const rule = await readPageRule(options.project);
  const results: ViewResult[] = [];
  const pages = new Map<string, PageComparison>();
  for (const capture of report.captures)
  {
    const map = maps.get(capture.mapId) as MapFile;
    results.push(await compareCapture(capture, map, report, rule, folder));

    // the pages are compared once for each map and hour, whichever capture comes to them first.
    const key = eventsKeyOf(capture);
    if (pages.has(key) === false)
    {
      const events = report.events[key];
      pages.set(key, { events: events.length, differ: pageDifferencesOf(events, editorPagesFor(capture, map, report, rule)) });
    }
  }

  const quests = questPagesOf(report, maps, pageMapIds, rule);
  await Bun.write(`${options.scratch}/parity-game.json`, JSON.stringify({ report, results, pages: Object.fromEntries(pages), quests }, null, 2));
  const drawn = printGameParity(mapIds, results, pages);
  return printQuestPages(quests) && drawn;
};

/**
 * Tallies the pages of every map the probe recorded that holds quest-gated events, or that the run compares by its
 * pages alone, at the hour the game's clock read there on arrival, or midnight in a game with no clock.
 * @param {ProbeReport} report The probe's report.
 * @param {ReadonlyMap<number, MapFile>} maps Every map the probe visited, by id.
 * @param {readonly number[]} pageMapIds The maps compared by their pages alone.
 * @param {PageRule} rule The rule the editor shows the game by.
 * @returns {QuestPages[]} The tallies, by the key the probe keeps each map's events under.
 */
const questPagesOf = (report: ProbeReport, maps: ReadonlyMap<number, MapFile>, pageMapIds: readonly number[], rule: PageRule): QuestPages[] =>
{
  return Object.entries(report.events).flatMap(([ key, events ]) =>
  {
    const mapId = Number.parseInt(key, 10);
    const map = maps.get(mapId) as MapFile;
    if (pageMapIds.includes(mapId) === false && questGatedPagesOf(map).size === 0)
    {
      return [];
    }

    const clock = report.clocks[key];
    return [ { key, tally: tallyPages(map, events, rule, clock >= 0 ? clock : 0) } ];
  });
};

/**
 * Words the map, and the hour when there is one, that the probe keeps a map's events under.
 * @param {string} key The key, such as {@code 20} or {@code 337@1320}.
 * @returns {string} The words, such as Map020 or Map337 at 22:00.
 */
const keyWords = (key: string): string =>
{
  const [ mapId, time ] = key.split('@');
  const map = `Map${mapId.padStart(3, '0')}`;
  return time === undefined ? map : `${map} at ${clockOf(Number(time))}`;
};

/**
 * Prints how the game and the editor judged the pages of each map holding quest-gated events, then in all: the
 * quest-gated events both show on the same page, and the quest-gated pages both judge alike, with those judged
 * differently; then the same for every event and page on those maps.
 * @param {readonly QuestPages[]} quests The tallies.
 * @returns {boolean} True when every quest-gated page was judged alike.
 */
const printQuestPages = (quests: readonly QuestPages[]): boolean =>
{
  if (quests.length === 0)
  {
    return true;
  }

  console.log('Quest-gated events, as a fresh save shows them at the hour the game\'s clock read on arrival:');
  quests.forEach(({ key, tally }) =>
  {
    console.log(`  ${keyWords(key).padEnd(8)} ${tally.gatedEventsAlike} of ${tally.gatedEvents} quest-gated events on the editor's page,`
      + ` ${tally.gatedPagesAlike} of ${tally.gatedPages} quest-gated pages judged alike;`
      + ` all ${tally.events} events: ${tally.eventsAlike} on the editor's page, ${tally.pagesAlike} of ${tally.pages} pages judged alike`);
    tally.gatedDiffer.slice(0, 8).forEach(difference => console.log(`           ${verdictWords(difference)}`));
    if (tally.gatedDiffer.length > 8)
    {
      console.log(`           and ${tally.gatedDiffer.length - 8} more`);
    }
  });

  const total = (pick: (tally: PagesTally) => number): number => quests.reduce((sum, { tally }) => sum + pick(tally), 0);
  console.log(`  in all: ${total(tally => tally.gatedEventsAlike)} of ${total(tally => tally.gatedEvents)} quest-gated events on the editor's page,`
    + ` ${total(tally => tally.gatedPagesAlike)} of ${total(tally => tally.gatedPages)} quest-gated pages judged alike;`
    + ` ${total(tally => tally.pagesAlike)} of ${total(tally => tally.pages)} pages on these maps judged alike`);
  return quests.every(({ tally }) => tally.gatedDiffer.length === 0);
};

/**
 * The order the passes of one map and hour print in.
 */
const PASS_ORDER: readonly ProbeCapture['pass'][] = [ 'tiles', 'events', 'dark', 'sky' ];

/**
 * Prints how the pages of one map's events compared at one hour, beneath its events pass.
 * @param {PageComparison} comparison The comparison.
 */
const printPages = (comparison: PageComparison): void =>
{
  const { events, differ } = comparison;
  console.log(`           pages: ${events - differ.length} of ${events} events on the editor's page, ${differ.length} on another`);
  differ.slice(0, 8).forEach(({ id, game, editor }) => console.log(`             event ${id} ${pagesWords(game, editor)}`));
  if (differ.length > 8)
  {
    console.log(`             and ${differ.length - 8} more`);
  }
};

/**
 * Prints the game comparison, per map, hour and pass: the passes drawn at the game's own hour first, then each time of
 * day the map was drawn at, in the order asked for; a map that is not dark has no dark pass to print. Beneath each
 * events pass go the events whose pages differ.
 * @param {number[]} maps The maps.
 * @param {ViewResult[]} results Every view.
 * @param {Map<string, PageComparison>} pages The pages compared, by map and hour, as the probe keys its events.
 * @returns {boolean} True when no view of any pass left a difference unexplained.
 */
const printGameParity = (maps: number[], results: ViewResult[], pages: Map<string, PageComparison>): boolean =>
{
  maps.forEach(mapId =>
  {
    console.log(`Map${String(mapId).padStart(3, '0')}: ${FIXTURES[mapId] ?? 'fixture'}`);

    // each pass as it comes, once for every time of day it was drawn at.
    const times = [ undefined, ...new Set(results.flatMap(result => (result.capture.mapId === mapId && result.capture.time !== undefined ? [ result.capture.time ] : []))) ];
    const passes = times.flatMap(time => PASS_ORDER.map(pass => ({ pass, time })));
    passes.forEach(({ pass, time }) =>
    {
      const mine = results.filter(result => result.capture.mapId === mapId && result.capture.pass === pass && result.capture.time === time);
      if (mine.length === 0)
      {
        return;
      }

      const pixels = mine.reduce((sum, result) => sum + result.comparison.comparedPixels, 0);
      const differing = mine.reduce((sum, result) => sum + result.comparison.differingPixels, 0);
      const maxDelta = Math.max(0, ...mine.map(result => result.comparison.maxDelta));
      const unexplained = mine.flatMap(result => result.unexplained.map(cell => `(${cell.x},${cell.y}) s${result.capture.step}`));
      const explained = mine.reduce((sum, result) => sum + result.explained.length, 0);
      const reasons = [ ...new Set(mine.flatMap(result => result.reasons)) ];
      const views = new Set(mine.map(result => `${result.capture.display.x},${result.capture.display.y}`)).size;
      const steps = new Set(mine.map(result => result.capture.step)).size;
      const verdict = unexplained.length === 0 ? 'MATCH' : `DIFFER at ${unexplained.length} cells: ${unexplained.slice(0, 12).join(' ')}`;
      const label = time === undefined ? pass : `${pass} ${clockOf(time)}`;
      console.log(`  ${label.padEnd(12)} ${views} views x ${steps} steps, ${pixels} pixels compared, ${differing} beyond ${TOLERANCE}`
        + ` (max delta ${maxDelta}), ${explained} cells explained  ${verdict}`);
      reasons.slice(0, 8).forEach(reason => console.log(`           ${reason}`));
      if (reasons.length > 8)
      {
        console.log(`           and ${reasons.length - 8} more events shown differently`);
      }

      if (pass === 'events')
      {
        printPages(pages.get(eventsKeyOf({ mapId, time })) as PageComparison);
      }
    });
  });

  return gameParityHolds(results.map(result => ({ pass: result.capture.pass, unexplained: result.unexplained })));
};

/**
 * Compares the editor's whole-map drawing with snapshot.js, per map.
 * @param {Options} options The settings.
 * @returns {Promise<boolean>} True when every difference was one the engine predicts.
 */
const runSnapshotParity = async (options: Options): Promise<boolean> =>
{
  const folder = `${options.scratch}/snapshots`;
  mkdirSync(folder, { recursive: true });
  const tilesets = await Bun.file(`${options.project}/data/Tilesets.json`).json() as ({ flags: number[] } | null)[];
  const snapshotScript = `${options.project}/../tools/mapgen/snapshot.js`;
  const stack = await startEditorStack({ projectRoot: options.project, scratch: `${options.scratch}/editor`, uiPort: options.uiPort, apiPort: options.apiPort });
  const { browser } = await openSpeedBrowser({ mode: 'swiftshader' });
  let allPredicted = true;
  try
  {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    for (const mapId of options.maps)
    {
      const map = await readMap(options.project, mapId);
      const snapshot = `${folder}/snapshot-${mapId}.png`;
      const editorFile = `${folder}/editor-${mapId}.png`;

      // snapshot.js writes where --out says, which is always this run's own folder.
      const child = Bun.spawn([ 'bun', snapshotScript, String(mapId), '--no-events', '--out', snapshot ], { stdout: 'ignore', stderr: 'pipe' });
      if (await child.exited !== 0)
      {
        throw new Error(`snapshot.js failed on map ${mapId}: ${await new Response(child.stderr).text()}`);
      }

      await openEditorMap(page, stack.uiBase, mapId);
      const url = await page.evaluate(async rect =>
      {
        const hooks = (window as unknown as HookWindow).__jmzMapView;
        hooks?.prepareParity({ events: false, step: 0, frames: 0 });
        return hooks?.extract(rect) ?? '';
      }, { x: 0, y: 0, width: map.width * TILE, height: map.height * TILE });
      await saveDataUrl(url, editorFile);

      const comparison = comparePictures(await decodePng(snapshot), await decodePng(editorFile), { x: 0, y: 0, width: map.width * TILE, height: map.height * TILE }, { x: 0, y: 0 }, TILE, TOLERANCE);
      const predictions = snapshotPredictions(map, tilesets[map.tilesetId]?.flags ?? []);
      const unpredicted = comparison.cells.filter(cell => predictions.has(`${cell.x},${cell.y}`) === false);
      const byReason = new Map<string, number>();
      comparison.cells.forEach(cell =>
      {
        const reason = predictions.get(`${cell.x},${cell.y}`);
        if (reason !== undefined)
        {
          byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
        }
      });
      const explained = [ ...byReason.entries() ].map(([ reason, count ]) => `${count} ${reason}`).join(', ');
      console.log(`Map${String(mapId).padStart(3, '0')} vs snapshot.js: ${comparison.cells.length} cells differ (${explained || 'none predicted'}),`
        + ` ${unpredicted.length} unpredicted${unpredicted.length > 0 ? `: ${unpredicted.slice(0, 12).map(cell => `(${cell.x},${cell.y})`).join(' ')}` : ''}`);
      if (unpredicted.length > 0)
      {
        allPredicted = false;
        await writePng(differencePicture(await decodePng(snapshot), await decodePng(editorFile), TOLERANCE), `${folder}/diff-${mapId}.png`);
      }
    }
  }
  finally
  {
    await browser.close();
    await stack.stop();
  }

  return allPredicted;
};

/**
 * Runs the check.
 */
const main = async (): Promise<void> =>
{
  const parsed = parseOptions(process.argv.slice(2));
  if (parsed.project === '')
  {
    throw new Error('name the game with --project or JMZ_PROJECT_ROOT');
  }

  // this run's own folder, built into afresh, so no earlier build is compared and no other run can wipe this one's copy.
  const options = { ...parsed, scratch: createRunFolder(parsed.scratch, 'jmz-parity-') };
  console.log(`pictures and report in ${options.scratch}`);

  let pass = true;
  if (options.mode !== 'snapshot')
  {
    pass = await runGameParity(options) && pass;
  }

  if (options.mode !== 'game')
  {
    pass = await runSnapshotParity(options) && pass;
  }

  console.log(pass
    ? 'PARITY: every difference from the game was explained, every quest-gated page was judged alike, and every snapshot.js difference was predicted'
    : 'PARITY: differences need a look');
  process.exit(pass ? 0 : 1);
};

await main();
