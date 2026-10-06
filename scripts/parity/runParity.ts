/// <reference types="bun-types" />
/**
 * The map editor's engine parity check: the real game, run headlessly with every event frozen and the lighting off,
 * draws each fixture map view by view, and the editor draws the same views; the two are compared pixel by pixel inside
 * the map.
 *
 *   bun run parity [--maps 102,31,94,316] [--mode game|snapshot|both] [--scratch <base folder>] [--project <game>]
 *                  [--ui-port 18200] [--api-port 18201] [--display :90] [--nw <binary>]
 *
 * Each invocation works in a folder of its own inside the base folder (the system's temporary folder unless --scratch
 * names another), builds the editor afresh there, and leaves its pictures and report there; it prints where.
 *
 * Two passes per view, and a third on a dark map. The tiles pass hides every character on both sides, so what remains
 * is the parallax and the tiles: it must match, within 2 per channel for compositing rounding. The events pass draws
 * events as each side draws them; the editor shows every event's first page, as MZ's own editor does, while the game
 * shows whichever page's conditions hold, so every differing cell there is either explained by an event the game shows
 * differently (another page, or hidden) or listed as unexplained. The dark pass, on a map whose note declares darkness,
 * draws the tiles alone again under J-Lighting's light mask on both sides, the editor showing only what the game shows
 * of its lighting: a differing cell there is explained only by a light the game shows from another page than the
 * editor's, which reads every event's lights from its first page giving any. Any cell left unexplained, in any pass,
 * fails the check.
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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import { startEditorStack } from '../speed/editorStack.ts';
import { openSpeedBrowser } from '../speed/gpuChromium.ts';
import { createRunFolder } from '../speed/runFolder.ts';
import { comparePictures, decodePng, differencePicture, writePng, type CellDifference, type Comparison } from './compareImages.ts';
import type { ProbeCapture, ProbeReport } from './probeTypes.ts';
import { runHeadlessGame } from './headlessGame.ts';
import {
  darkLightsOf,
  explainCell,
  explainDarkCell,
  gameParityHolds,
  probeMapFor,
  snapshotPredictions,
  steadyLighting,
  TILE,
  type LightingConfigFile,
  type MapFile,
} from './parityRules.ts';

/**
 * The script's settings.
 */
type Options = {
  maps: number[];
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
 * The page's hooks, as far as the check calls them.
 */
type HookWindow = {
  __jmzMapView?: {
    ready: () => boolean;
    info: () => { stats: { loadingImages: number } };
    prepareParity: (options: { events: boolean; step: number; frames: number; lighting?: boolean }) => void;
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
    maps: (flags.get('maps') ?? Object.keys(FIXTURES).join(',')).split(',').map(Number),
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
 * Draws one of the game's captures in the editor.
 * @param {Page} page The page, on the capture's map.
 * @param {ProbeCapture} capture The game's capture.
 * @param {{ width: number, height: number }} screen The screen size.
 * @param {string} file Where to write the editor's picture.
 */
const drawInEditor = async (page: Page, capture: ProbeCapture, screen: { width: number; height: number }, file: string): Promise<void> =>
{
  const url = await page.evaluate(async ({ pass, step, rect }) =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    hooks?.prepareParity({ events: pass === 'events', step, frames: 0, lighting: pass === 'dark' });
    return hooks?.extract(rect) ?? '';
  }, { pass: capture.pass, step: capture.step, rect: { x: capture.display.x * TILE, y: capture.display.y * TILE, ...screen } });
  await saveDataUrl(url, file);
};

/**
 * Compares one capture pair.
 * @param {ProbeCapture} capture The capture.
 * @param {MapFile} map The map.
 * @param {ProbeReport} report The probe's report.
 * @param {string} folder Where the pictures are.
 * @returns {Promise<ViewResult>} What it came to.
 */
const compareCapture = async (capture: ProbeCapture, map: MapFile, report: ProbeReport, folder: string): Promise<ViewResult> =>
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

  const events = report.events[capture.mapId] ?? [];
  const lights = darkLightsOf(map);
  const explained: CellDifference[] = [];
  const unexplained: CellDifference[] = [];
  const reasons = new Set<string>();
  const explain = (cell: CellDifference): string | null =>
  {
    switch (capture.pass)
    {
      case 'events':
        return explainCell(cell, events);
      case 'dark':
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
  for (const mapId of options.maps)
  {
    maps.set(mapId, await readMap(options.project, mapId));
  }

  const probeMaps = options.maps.map(mapId => probeMapFor(mapId, maps.get(mapId) as MapFile, screen));
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
    for (const mapId of options.maps)
    {
      await openEditorMap(page, stack.uiBase, mapId);
      for (const capture of report.captures.filter(each => each.mapId === mapId))
      {
        await drawInEditor(page, capture, report.screen, `${folder}/${capture.file.replace(/^game-/u, 'editor-')}`);
      }
    }
  }
  finally
  {
    await browser.close();
    await stack.stop();
  }

  const results: ViewResult[] = [];
  for (const capture of report.captures)
  {
    results.push(await compareCapture(capture, maps.get(capture.mapId) as MapFile, report, folder));
  }

  await Bun.write(`${options.scratch}/parity-game.json`, JSON.stringify({ report, results }, null, 2));
  return printGameParity(options.maps, results);
};

/**
 * Prints the game comparison, per map and pass; a map that is not dark has no dark pass to print.
 * @param {number[]} maps The maps.
 * @param {ViewResult[]} results Every view.
 * @returns {boolean} True when no view of any pass left a difference unexplained.
 */
const printGameParity = (maps: number[], results: ViewResult[]): boolean =>
{
  maps.forEach(mapId =>
  {
    console.log(`Map${String(mapId).padStart(3, '0')}: ${FIXTURES[mapId] ?? 'fixture'}`);
    [ 'tiles', 'events', 'dark' ].forEach(pass =>
    {
      const mine = results.filter(result => result.capture.mapId === mapId && result.capture.pass === pass);
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
      console.log(`  ${pass.padEnd(6)} ${views} views x ${steps} steps, ${pixels} pixels compared, ${differing} beyond ${TOLERANCE}`
        + ` (max delta ${maxDelta}), ${explained} cells explained  ${verdict}`);
      reasons.slice(0, 8).forEach(reason => console.log(`           ${reason}`));
      if (reasons.length > 8)
      {
        console.log(`           and ${reasons.length - 8} more events shown differently`);
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

  console.log(pass ? 'PARITY: every difference from the game was explained, and every snapshot.js difference was predicted' : 'PARITY: differences need a look');
  process.exit(pass ? 0 : 1);
};

await main();
