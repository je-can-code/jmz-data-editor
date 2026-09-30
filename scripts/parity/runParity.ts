/// <reference types="bun-types" />
/**
 * The map editor's engine parity check: the real game, run headlessly with every event frozen and the lighting off,
 * draws each fixture map view by view, and the editor draws the same views; the two are compared pixel by pixel inside
 * the map.
 *
 *   bun run parity [--maps 102,31,94,316] [--mode game|snapshot|both] [--scratch <folder>] [--project <game>]
 *                  [--ui-port 18200] [--api-port 18201] [--display :90] [--nw <binary>] [--rebuild]
 *
 * Two passes per view. The tiles pass hides every character on both sides, so what remains is the parallax and the
 * tiles: it must match, within 2 per channel for compositing rounding, and it decides the exit code. The events pass
 * draws events as each side draws them; the editor shows every event's first page, as MZ's own editor does, while the
 * game shows whichever page's conditions hold, so every differing cell there is either explained by an event the game
 * shows differently (another page, or hidden) or listed as unexplained.
 *
 * Maps with water or waterfalls are compared at all four animation steps. The game draws on SwiftShader, which is
 * fine for pictures and meaningless for timing. The game runs from a copy in the scratch folder, muted, on a virtual
 * display; nothing here writes to the game's own folder.
 *
 * The snapshot mode is the cheaper day-to-day comparator: ca/tools/mapgen/snapshot.js draws each map whole, and the
 * editor draws it whole too; the differences the engine predicts against snapshot.js (star tiles drawn last, table
 * legs and edges) are counted apart from the rest.
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import { startEditorStack } from '../speed/editorStack.ts';
import { openSpeedBrowser } from '../speed/gpuChromium.ts';
import { comparePictures, decodePng, differencePicture, writePng, type CellDifference, type Comparison } from './compareImages.ts';
import type { ProbeCapture, ProbeEvent, ProbeMap, ProbeReport } from './gameProbe.ts';
import { runHeadlessGame } from './headlessGame.ts';

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
  rebuild: boolean;
};

/**
 * The parts of a map file the check reads.
 */
type MapFile = {
  width: number;
  height: number;
  tilesetId: number;
  data: number[];
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
    prepareParity: (options: { events: boolean; step: number; frames: number }) => void;
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
};

/**
 * The tile size, and the screen the game draws, in tiles.
 */
const TILE = 48;

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
    scratch: flags.get('scratch') ?? `${tmpdir()}/jmz-parity`,
    project: flags.get('project') ?? process.env['JMZ_PROJECT_ROOT'] ?? '',
    uiPort: Number(flags.get('ui-port') ?? 18200),
    apiPort: Number(flags.get('api-port') ?? 18201),
    display: flags.get('display') ?? ':90',
    nw: flags.get('nw') ?? 'nw',
    rebuild: flags.has('rebuild'),
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
      const kind = Math.floor((tileId - 2048) / 48);
      if (kind === 0 || kind === 1 || kind >= 4)
      {
        return true;
      }
    }
  }

  return false;
};

/**
 * Lists display positions whose screens together cover a whole map, as the engine would clamp them.
 * @param {number} size The map's size along one axis, in tiles.
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
 * Builds what the probe draws for one map.
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
  return { mapId, views, steps: animates(map) ? [ 0, 1, 2, 3 ] : [ 0 ] };
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
    hooks?.prepareParity({ events: pass === 'events', step, frames: 0 });
    return hooks?.extract(rect) ?? '';
  }, { pass: capture.pass, step: capture.step, rect: { x: capture.display.x * TILE, y: capture.display.y * TILE, ...screen } });
  await saveDataUrl(url, file);
};

/**
 * Explains a differing cell of the events pass by the events around it that the game shows differently from the
 * editor's first page.
 * @param {CellDifference} cell The cell.
 * @param {readonly ProbeEvent[]} events The game's events on the map.
 * @returns {string | null} Why it differs, or null when nothing explains it.
 */
const explainCell = (cell: CellDifference, events: readonly ProbeEvent[]): string | null =>
{
  // a character sprite covers its own cell and can reach up two cells and across one on each side.
  const nearby = events.filter(event => Math.abs(event.x - cell.x) <= 1 && cell.y <= event.y && cell.y >= event.y - 2);
  const hidden = nearby.find(event => event.visible === false);
  if (hidden !== undefined)
  {
    return `event ${hidden.id} is hidden in the game`;
  }

  const otherPage = nearby.find(event => event.page !== 0);
  if (otherPage !== undefined)
  {
    return `event ${otherPage.id} shows page ${otherPage.page + 1} in the game; the editor shows page 1`;
  }

  return null;
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
  const explained: CellDifference[] = [];
  const unexplained: CellDifference[] = [];
  const reasons = new Set<string>();
  comparison.cells.forEach(cell =>
  {
    const reason = capture.pass === 'events' ? explainCell(cell, events) : null;
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
    { projectRoot: options.project, scratch: options.scratch, display: options.display, nwBinary: options.nw, timeoutMs: 10 * 60_000 },
    { outDir: folder, maps: probeMaps, tickLimit: 6000 });
  if (report.phase !== 'done')
  {
    throw new Error(`the game's probe ended in "${report.phase}": ${report.errors.join('; ')}`);
  }

  const stack = await startEditorStack({ projectRoot: options.project, scratch: `${options.scratch}/editor`, uiPort: options.uiPort, apiPort: options.apiPort, rebuild: options.rebuild });
  const { browser } = await openSpeedBrowser({ mode: 'swiftshader' });
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
 * Prints the game comparison, per map and pass.
 * @param {number[]} maps The maps.
 * @param {ViewResult[]} results Every view.
 * @returns {boolean} True when every tiles pass matched.
 */
const printGameParity = (maps: number[], results: ViewResult[]): boolean =>
{
  let tilesMatch = true;
  maps.forEach(mapId =>
  {
    console.log(`Map${String(mapId).padStart(3, '0')}: ${FIXTURES[mapId] ?? 'fixture'}`);
    [ 'tiles', 'events' ].forEach(pass =>
    {
      const mine = results.filter(result => result.capture.mapId === mapId && result.capture.pass === pass);
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

      if (pass === 'tiles' && unexplained.length > 0)
      {
        tilesMatch = false;
      }
    });
  });

  return tilesMatch;
};

/**
 * Lists the cells where the engine predicts snapshot.js to draw differently: a star tile under a non-star tile, which
 * the engine draws last, and a table or the cell under one, whose legs and edge snapshot.js leaves out.
 * @param {MapFile} map The map.
 * @param {number[]} flags The tileset's flags.
 * @returns {Map<string, string>} The reason, by "x,y".
 */
const snapshotPredictions = (map: MapFile, flags: number[]): Map<string, string> =>
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
  const stack = await startEditorStack({ projectRoot: options.project, scratch: `${options.scratch}/editor`, uiPort: options.uiPort, apiPort: options.apiPort, rebuild: options.rebuild });
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
  const options = parseOptions(process.argv.slice(2));
  if (options.project === '')
  {
    throw new Error('name the game with --project or JMZ_PROJECT_ROOT');
  }

  let pass = true;
  if (options.mode !== 'snapshot')
  {
    pass = await runGameParity(options) && pass;
  }

  if (options.mode !== 'game')
  {
    pass = await runSnapshotParity(options) && pass;
  }

  console.log(pass ? 'PARITY: every tiles pass matched the game, and every snapshot.js difference was predicted' : 'PARITY: differences need a look');
  process.exit(pass ? 0 : 1);
};

await main();
