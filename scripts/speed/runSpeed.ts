/// <reference types="bun-types" />
/**
 * The map editor's speed script: opens the heavy fixture maps in the real map editor page, in headless chromium on
 * the machine's real GPU (spike S3's recipe), and fails on any speed budget from the plan's D3.
 *
 *   bun run speed [--runs 3] [--seconds 5] [--maps 102,361] [--ui-port 18200] [--api-port 18201]
 *                 [--scratch <base folder>] [--project <game>] [--json <file>]
 *
 * Each invocation builds the editor afresh in a folder of its own inside the base folder (the system's temporary
 * folder unless --scratch names another), so it always times the code as it stands and never shares a build or a
 * mirror with another run; the folder is removed when the run ends.
 *
 * Every map in every run gets a fresh browser, so every open is cold. Per map it measures, with the game look and
 * every overlay on:
 *   - the cold open: navigation start to the first frame that showed the map complete, sprites and parallax loaded;
 *   - three camera paths driven from the page's own frame clock: a pan at zoom 1, a zoom sweep from 2x out to the
 *     whole map and back, and the whole map held on screen and drifting;
 *   - a brush stroke: real pointer moves with the left button held, one cell apart, each painting a fresh 3x3 patch
 *     of ground with the map view's own pen, through the layering engine and the autotile refresh, matched to the
 *     frames that drew them; and the same again with a stand-in for a plugin module's overlay (two rings around every
 *     event, as heavy as sight rings) switched on, since a tile edit must not redraw those;
 *   - the warm open: reopening the map after another, once this window holds both;
 *   - shown again: the view hidden, as a panel behind another tab is, which lets its GPU context go, then shown, timed
 *     to the first frame drawn on the context it got back; measured last, since it restarts the page's GPU context;
 *   - events, with the whole map on screen and the real mouse: twenty clicks selecting one event after another, a box
 *     drawn from beside the map around every event on it, the top half's events dragged about (on Map361 every tile
 *     holds an event, so the ghosts show blocked tiles and the drop is refused), and a committed drop: the bottom row
 *     emptied, every other event selected and dragged one row down. None of them may drop a frame;
 *   - the event window, last: a real double-click on the map's first event, timed to the first frame of the event's
 *     window showing it, the window taking the map's live copy from the map's page.
 *
 * The page shows the map with its quick panel beside it (quick=1), the two sharing one selection as in the workspace,
 * so whatever the panel renders for a new selection, or for a drop that moves every selected event, lands in the
 * frames measured; the box and the drop also prove the panel followed the selection.
 *
 * It refuses to time anywhere but the RX 6950 XT: the browser's WebGL renderer and the page's own must both name it
 * (JMZ_SPEED_GPU, or --gpu, overrides the pattern). The exit code is non-zero when any budget is missed.
 */
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import { BUDGETS, judgeCameraPath, judgeInteractionFrames, judgeOpen, judgeStrokeFrames } from './budgets.ts';
import type { InteractionResult, StrokeResult } from './budgets.ts';
import { startEditorStack } from './editorStack.ts';
import { addFrameRecorder, startRecording, stopRecording } from './frameRecorder.ts';
import type { Recording } from './frameRecorder.ts';
import { REFRESH_60_HZ, summarize, summarizeFrames } from './frameStats.ts';
import type { RunSummary, Verdict } from './frameStats.ts';
import { newSpeedPage, openSpeedBrowser } from './gpuChromium.ts';
import type { GpuReport } from './gpuChromium.ts';
import { createRunFolder } from './runFolder.ts';

/**
 * The script's settings.
 */
type Options = {
  runs: number;
  seconds: number;
  maps: number[];
  uiPort: number;
  apiPort: number;
  scratch: string;
  project: string;
  expectRenderer: RegExp;
  jsonPath: string | undefined;
};

/**
 * A late frame: how long the gap before it was, and what the frames either side of the gap cost.
 */
type Stall = {
  interval: number;
  before: { work: number; gpu: number };
  after: { work: number; gpu: number };
};

/**
 * What one camera path came to.
 */
type PathResult = {
  summary: RunSummary;
  verdict: Verdict;
  gpuBusy: { mean: number; max: number };
  stalls: Stall[];
};

/**
 * What one map came to in one run.
 */
type MapResult = {
  map: number;
  run: number;
  loadBefore: number;
  loadAfter: number;
  report: GpuReport;
  pageGpu: string;
  info: unknown;
  coldOpenMs: number;
  timings: Record<string, number>;
  paths: Record<string, PathResult>;
  stroke: StrokeResult;
  strokeWithRings: StrokeResult;
  warmOpenMs: number;
  shownAgainMs: number;
  events: EventsResult;
  eventWindow: EventWindowResult;
  verdicts: Record<string, Verdict>;
};

/**
 * What opening one event's window came to: which event, and the time to the first frame of its window showing it,
 * from the double-click on it and from the window's own navigation start.
 */
type EventWindowResult = {
  eventId: number;
  doubleClickToReadyMs: number;
  navigationToReadyMs: number;
};

/**
 * What the event tools report having done, with how many events the map holds.
 */
type EventsState = {
  selected: number;
  moving: boolean;
  ghosts: number;
  drops: number;
  refusedDrops: number;
  total: number;
};

/**
 * What the four interactions with events came to on one map: the clicks, the box, the drag with its drop refused or
 * made, and the committed drop of nearly every event; with how many events the drag and the drop carried.
 */
type EventsResult = {
  click: InteractionResult;
  box: InteractionResult;
  drag: InteractionResult;
  drop: InteractionResult;
  dragged: number;
  dropped: number;
};

/**
 * The hooks the page installs when opened with speed=1, as far as this script calls them.
 */
type PageHooks = {
  ready: () => boolean;
  timings: Record<string, number>;
  info: () => { gpu: { renderer: string } | null; size: number[] | null };
  lookAt: (x: number, y: number, zoom: number) => void;
  zoomToFit: () => void;
  screenOfCell: (x: number, y: number) => { x: number; y: number };
  startPath: (kind: string) => void;
  stopPath: () => void;
  enablePaint: (settings: Record<string, unknown>) => number | null;
  disablePaint: () => void;
  enableModuleRings: () => void;
  paintState: () => { steps: number; redrawnFrames: number };
  enableEveryOverlay: () => void;
  openMap: (mapId: number) => Promise<{ ms: number }>;
  showAgain: () => Promise<{ ms: number; hidden: string; shown: string }>;
  events: {
    state: () => EventsState;
    clear: () => void;
    screenOfEvent: (eventId: number) => { x: number; y: number } | null;
    cellOf: (eventId: number) => { x: number; y: number } | null;
    eventIds: () => number[];
    selectedIds: () => number[];
    removeRow: (y: number) => number;
  };
};

/**
 * The camera paths, in the order they are recorded.
 */
const PATHS = [ 'pan', 'zoom', 'zoomedout' ];

/**
 * How many pointer moves a stroke makes, 4 ms apart, as a hand dragging a pen would.
 */
const STROKE_MOVES = 150;

/**
 * The stroke's brush: 3 cells across and down, so every move paints a column of three and reshapes the autotiles
 * around it.
 */
const STROKE_FOOTPRINT = 3;

/**
 * The map's own canvas on the page; the quick panel beside it may draw canvases of its own.
 */
const MAP_CANVAS = '[data-testid="map-view"] canvas';

/**
 * The quick panel beside the map, and the line it shows while nothing is selected.
 */
const QUICK_PANEL = '[data-testid="map-quick-panel"]';
const QUICK_PANEL_QUIET = 'Pick an event on a map to change its settings here.';

/**
 * How many events the click test picks, one after another.
 */
const EVENT_CLICKS = 20;

/**
 * How many pointer moves a box and a drag make, 4 ms apart.
 */
const BOX_MOVES = 60;
const DRAG_MOVES = 120;

/**
 * Where a drag wanders, in tiles from where it started, before it lets go: down, across, back up past the start, and
 * across again.
 */
const DRAG_WAYPOINTS: readonly { x: number; y: number }[] = [ { x: 0, y: 6 }, { x: 3, y: 6 }, { x: 3, y: -4 }, { x: -2, y: -4 }, { x: -2, y: 2 } ];

/**
 * The renderer every timing must come from unless overridden.
 */
const DEFAULT_GPU = 'RX 6950 XT|NAVI21';

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

  const gpu = flags.get('gpu') ?? process.env['JMZ_SPEED_GPU'] ?? DEFAULT_GPU;
  return {
    runs: Number(flags.get('runs') ?? 3),
    seconds: Number(flags.get('seconds') ?? 5),
    maps: (flags.get('maps') ?? '102,361').split(',').map(Number),
    uiPort: Number(flags.get('ui-port') ?? 18200),
    apiPort: Number(flags.get('api-port') ?? 18201),
    scratch: flags.get('scratch') ?? tmpdir(),
    project: flags.get('project') ?? process.env['JMZ_PROJECT_ROOT'] ?? '',
    expectRenderer: new RegExp(gpu),
    jsonPath: flags.get('json'),
  };
};

/**
 * Reads the one-minute load average, so every run carries how busy the machine was.
 * @returns {Promise<number>} The load average.
 */
const loadAverage = async (): Promise<number> =>
{
  return Number((await Bun.file('/proc/loadavg').text()).split(' ')[0]);
};

/**
 * Finds the RX 6950 XT's busy-percentage file (PCI id 1002:73A5), whichever card number it has today.
 * @returns {Promise<string>} The file, or an empty string when the card is not there.
 */
const gpuBusyFile = async (): Promise<string> =>
{
  for (const card of [ 0, 1, 2, 3 ])
  {
    const uevent = Bun.file(`/sys/class/drm/card${card}/device/uevent`);
    if (await uevent.exists() && (await uevent.text()).includes('PCI_ID=1002:73A5'))
    {
      return `/sys/class/drm/card${card}/device/gpu_busy_percent`;
    }
  }

  return '';
};

/**
 * Samples the card's busy percentage while a path records, which covers every process using it.
 * @param {number} samples How many samples.
 * @param {number} everyMs The gap between samples.
 * @returns {Promise<{ mean: number, max: number }>} The mean and the largest sample, or -1s without the card.
 */
const gpuBusy = async (samples: number, everyMs: number): Promise<{ mean: number; max: number }> =>
{
  const file = await gpuBusyFile();
  if (file === '')
  {
    return { mean: -1, max: -1 };
  }

  const values: number[] = [];
  for (let sample = 0; sample < samples; sample++)
  {
    values.push(Number((await Bun.file(file).text()).trim()));
    await Bun.sleep(everyMs);
  }

  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, max: Math.max(...values) };
};

/**
 * The page's window, as far as the hooks go.
 */
type HookWindow = { __jmzMapView: PageHooks };

/**
 * Records one camera path the page drives itself.
 * @param {Page} page The page.
 * @param {string} kind The path.
 * @param {number} seconds How long to record.
 * @returns {Promise<PathResult>} What it came to.
 */
const measurePath = async (page: Page, kind: string, seconds: number): Promise<PathResult> =>
{
  await page.evaluate(path => (window as unknown as HookWindow).__jmzMapView.startPath(path), kind);
  await page.waitForTimeout(300);
  await startRecording(page);
  const [ busy ] = await Promise.all([ gpuBusy(Math.floor(seconds * 20), 50), page.waitForTimeout(seconds * 1000) ]);
  const recording = await stopRecording(page);
  await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.stopPath());
  const summary = summarizeFrames(recording.frames);

  // every gap of more than a refresh and a half, with what the frames either side of it cost.
  const stalls: Stall[] = [];
  recording.frames.slice(1).forEach((frame, index) =>
  {
    const previous = recording.frames[index];
    const interval = frame.time - previous.time;
    if (interval > REFRESH_60_HZ * 1.5)
    {
      stalls.push({ interval, before: { work: previous.work, gpu: previous.gpu }, after: { work: frame.work, gpu: frame.gpu } });
    }
  });
  return { summary, verdict: judgeCameraPath(summary), gpuBusy: busy, stalls };
};

/**
 * Builds a stroke's path inside the map's part of the view, one cell per move, so every move paints cells the stroke
 * has not covered yet: across a band of rows, down by the brush's height, back across, and so on, snake-wise. A path
 * that came back over its own cells would find them painted already and change nothing there.
 * @param {{ x: number, y: number }} topLeft The screen point of the top-left cell's centre.
 * @param {number} cellPixels How far apart neighbouring cells' centres are on screen.
 * @param {number[]} size The map's size in cells.
 * @param {{ width: number, height: number }} viewport The canvas's size.
 * @returns {{ x: number, y: number }[]} The pointer positions.
 */
const strokePath = (
  topLeft: { x: number; y: number },
  cellPixels: number,
  size: number[],
  viewport: { width: number; height: number }): { x: number; y: number }[] =>
{
  // the columns and rows whose centres are on screen, leaving room at the far edges for the brush.
  const [ width, height ] = size;
  const firstColumn = Math.max(0, Math.ceil((24 - topLeft.x) / cellPixels));
  const lastColumn = Math.min(width - STROKE_FOOTPRINT, Math.floor((viewport.width - 24 - topLeft.x) / cellPixels));
  const firstRow = Math.max(0, Math.ceil((24 - topLeft.y) / cellPixels));
  const lastRow = Math.min(height - STROKE_FOOTPRINT, Math.floor((viewport.height - 24 - topLeft.y) / cellPixels) - STROKE_FOOTPRINT);
  const points: { x: number; y: number }[] = [];
  let column = firstColumn;
  let row = firstRow;
  let direction = 1;
  while (points.length < STROKE_MOVES && row <= lastRow)
  {
    points.push({ x: topLeft.x + column * cellPixels, y: topLeft.y + row * cellPixels });

    // across the band, then down a brush's height and back the other way.
    const next = column + direction;
    if (next < firstColumn || next > lastColumn)
    {
      row += STROKE_FOOTPRINT;
      direction = -direction;
    }
    else
    {
      column = next;
    }
  }

  return points;
};

/**
 * Paints one stroke with the mouse and judges the frames that drew it.
 * @param {Page} page The page.
 * @param {number[]} size The map's size in tiles.
 * @returns {Promise<StrokeResult>} What the stroke came to.
 */
const measureStroke = async (page: Page, size: number[]): Promise<StrokeResult> =>
{
  const [ width, height ] = size;
  const tileId = await page.evaluate(([ x, y, footprint ]) =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    hooks.lookAt(x, y, 1);
    return hooks.enablePaint({ footprint });
  }, [ Math.floor(width / 2), Math.floor(height / 2), STROKE_FOOTPRINT ]);
  if (tileId === null)
  {
    throw new Error('the map view has no map to paint on');
  }

  await page.waitForTimeout(300);
  const [ topLeft, nextCell ] = await page.evaluate(() =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    return [ hooks.screenOfCell(0, 0), hooks.screenOfCell(1, 0) ];
  });

  // the hooks answer in the canvas's own pixels; the mouse moves in the page's, around the view's bars.
  const canvas = await page.locator(MAP_CANVAS).boundingBox();
  if (canvas === null)
  {
    throw new Error('the map view has no canvas to paint on');
  }

  const onPage = (point: { x: number; y: number }) => ({ x: point.x + canvas.x, y: point.y + canvas.y });
  const points = strokePath(topLeft, nextCell.x - topLeft.x, size, { width: canvas.width, height: canvas.height }).map(onPage);

  await startRecording(page);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1))
  {
    await page.mouse.move(point.x, point.y);
    await page.waitForTimeout(4);
  }

  await page.mouse.up();
  await page.waitForTimeout(500);
  const recording = await stopRecording(page);
  const proof = await page.evaluate(() =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    const state = hooks.paintState();
    hooks.disablePaint();
    return state;
  });
  // the stroke runs from the press on; the move that put the pointer in place before it painted nothing.
  const pressed = recording.inputs.findIndex(input => input.type === 'pointerdown');
  const moves = recording.inputs.slice(Math.max(0, pressed)).filter(input => input.type === 'pointermove' || input.type === 'pointerdown');
  return judgeStrokeFrames(moves, recording.frames, proof);
};

/**
 * Picks evenly spread items from a list.
 * @param {readonly T[]} items The list.
 * @param {number} count How many to pick.
 * @returns {T[]} The picks, in list order.
 */
const spread = <T>(items: readonly T[], count: number): T[] =>
{
  if (items.length <= count)
  {
    return [ ...items ];
  }

  return Array.from({ length: count }, (_, index) => items[Math.floor((index * items.length) / count)]);
};

/**
 * Builds the pointer positions along straight lines through some points, evenly spaced.
 * @param {readonly { x: number, y: number }[]} points The points, the first being where the pointer starts.
 * @param {number} moves How many positions in all, the last being the final point.
 * @returns {{ x: number, y: number }[]} The positions, not including the start.
 */
const alongPath = (points: readonly { x: number; y: number }[], moves: number): { x: number; y: number }[] =>
{
  const legs = points.slice(1).map((point, index) => ({ from: points[index], to: point }));
  const lengths = legs.map(leg => Math.hypot(leg.to.x - leg.from.x, leg.to.y - leg.from.y));
  const total = lengths.reduce((sum, length) => sum + length, 0) || 1;
  const positions: { x: number; y: number }[] = [];
  for (let step = 1; step <= moves; step++)
  {
    // walk the legs to the share of the whole path this step reaches.
    let travel = (step / moves) * total;
    let leg = 0;
    while (leg < legs.length - 1 && travel > lengths[leg])
    {
      travel -= lengths[leg];
      leg += 1;
    }

    const { from, to } = legs[leg];
    const share = lengths[leg] === 0 ? 1 : Math.min(1, travel / lengths[leg]);
    positions.push({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });
  }

  return positions;
};

/**
 * Moves the mouse along positions with the left button held, 4 ms apart, as a hand dragging would.
 * @param {Page} page The page.
 * @param {{ x: number, y: number }} start Where the button goes down.
 * @param {readonly { x: number, y: number }[]} positions Where the pointer goes after.
 * @param {() => Promise<void>} midway Run halfway along, before the button comes up.
 */
const dragMouse = async (
  page: Page, start: { x: number; y: number }, positions: readonly { x: number; y: number }[], midway: () => Promise<void> = async () => undefined): Promise<void> =>
{
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [ index, position ] of positions.entries())
  {
    await page.mouse.move(position.x, position.y);
    await page.waitForTimeout(4);
    if (index === Math.floor(positions.length / 2))
    {
      await midway();
    }
  }

  await page.mouse.up();
};

/**
 * What the event measurements share: the page, the map's size, where the mouse goes to reach a tile or an event, and
 * what the event tools report.
 */
type EventProbe = {
  readonly page: Page;
  readonly width: number;
  readonly height: number;
  readonly cellPoint: (x: number, y: number) => Promise<{ x: number; y: number }>;
  readonly eventPoint: (eventId: number) => Promise<{ x: number; y: number }>;
  readonly cellOf: (eventId: number) => Promise<{ x: number; y: number }>;
  readonly state: () => Promise<EventsState>;
  readonly selectedIds: () => Promise<number[]>;
  readonly clear: () => Promise<void>;
};

/**
 * Builds the probe the event measurements work through, with the whole map on screen.
 * @param {Page} page The page.
 * @param {number[]} size The map's size in tiles.
 * @returns {Promise<EventProbe>} The probe.
 */
const eventProbe = async (page: Page, size: number[]): Promise<EventProbe> =>
{
  const [ width, height ] = size;

  // the hooks answer in the canvas's own pixels; the mouse moves in the page's, around the view's bars.
  const canvas = await page.locator(MAP_CANVAS).boundingBox();
  if (canvas === null)
  {
    throw new Error('the map view has no canvas to click on');
  }

  const onPage = (point: { x: number; y: number }) => ({
    x: Math.min(canvas.x + canvas.width - 2, Math.max(canvas.x + 2, point.x + canvas.x)),
    y: Math.min(canvas.y + canvas.height - 2, Math.max(canvas.y + 2, point.y + canvas.y)),
  });

  return {
    page,
    width,
    height,
    cellPoint: async (x: number, y: number) =>
      onPage(await page.evaluate(([ cx, cy ]) => (window as unknown as HookWindow).__jmzMapView.screenOfCell(cx, cy), [ x, y ])),
    eventPoint: async (eventId: number) =>
    {
      const point = await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.events.screenOfEvent(id), eventId);
      if (point === null)
      {
        throw new Error(`event ${eventId} is not on the map`);
      }

      return onPage(point);
    },
    cellOf: async (eventId: number) =>
    {
      const cell = await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.events.cellOf(id), eventId);
      if (cell === null)
      {
        throw new Error(`event ${eventId} is not on the map`);
      }

      return cell;
    },
    state: () => page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.events.state()),
    selectedIds: () => page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.events.selectedIds()),
    clear: () => page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.events.clear()),
  };
};

/**
 * Draws a box with the mouse from beside the map's top-left corner down to a row, every column included.
 * @param {EventProbe} probe The probe.
 * @param {number} lastRow The last row inside the box; the map's height reaches past the bottom.
 * @param {number} moves How many pointer moves the box takes.
 * @returns {Promise<void>} Settles once the button is up.
 */
const boxRows = async (probe: EventProbe, lastRow: number, moves: number): Promise<void> =>
{
  const from = await probe.cellPoint(-1, -1);
  const to = await probe.cellPoint(probe.width, lastRow);
  await dragMouse(probe.page, from, alongPath([ from, to ], moves));
};

/**
 * Records an interaction's frames and inputs: starts recording, runs it, lets its last frames land, and stops.
 * @param {Page} page The page.
 * @param {() => Promise<void>} interact The interaction.
 * @param {number} settleMs How long to keep recording after it.
 * @returns {Promise<Recording>} What was recorded.
 */
const recordInteraction = async (page: Page, interact: () => Promise<void>, settleMs = 400): Promise<Recording> =>
{
  await startRecording(page);
  await interact();
  await page.waitForTimeout(settleMs);
  return stopRecording(page);
};

/**
 * Reports whether the quick panel beside the map shows its line for nothing selected, rather than any event's settings.
 * @param {Page} page The page.
 * @returns {Promise<boolean>} True while it shows nothing picked.
 */
const quickPanelIsQuiet = async (page: Page): Promise<boolean> =>
{
  return (await page.locator(QUICK_PANEL).innerText()).includes(QUICK_PANEL_QUIET);
};

/**
 * Clicks twenty events spread over the map, one after another, each selecting one event alone.
 * @param {EventProbe} probe The probe.
 * @returns {Promise<InteractionResult>} What the clicks came to.
 */
const measureClicks = async (probe: EventProbe): Promise<InteractionResult> =>
{
  const ids = await probe.page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.events.eventIds());
  const points: { x: number; y: number }[] = [];
  for (const id of spread(ids, EVENT_CLICKS))
  {
    points.push(await probe.eventPoint(id));
  }

  const recording = await recordInteraction(probe.page, async () =>
  {
    for (const point of points)
    {
      await probe.page.mouse.move(point.x, point.y);
      await probe.page.mouse.down();
      await probe.page.mouse.up();
      await probe.page.waitForTimeout(40);
    }
  });
  const after = await probe.state();
  return judgeInteractionFrames(recording.inputs, recording.frames, {
    ok: after.selected === 1,
    reason: `the clicks left ${after.selected} events selected, not 1`,
  });
};

/**
 * Draws a box from beside the map around every event on it.
 * @param {EventProbe} probe The probe.
 * @returns {Promise<InteractionResult>} What the box came to.
 */
const measureBox = async (probe: EventProbe): Promise<InteractionResult> =>
{
  await probe.clear();
  const quietBefore = await quickPanelIsQuiet(probe.page);
  const recording = await recordInteraction(probe.page, () => boxRows(probe, probe.height, BOX_MOVES));
  const after = await probe.state();
  const quietAfter = await quickPanelIsQuiet(probe.page);
  return judgeInteractionFrames(recording.inputs, recording.frames, {
    ok: after.total > 0 && after.selected === after.total && quietBefore && quietAfter === false,
    reason: `the box selected ${after.selected} of ${after.total} events, and the quick panel ${quietAfter ? 'never showed them' : 'showed them'}`,
  });
};

/**
 * Selects the top half's events, drags them about by their bottom-right event, and lets go: the ghosts follow, red on
 * every tile another event holds, and the drop lands or is refused.
 * @param {EventProbe} probe The probe.
 * @returns {Promise<{ result: InteractionResult, dragged: number }>} What the drag came to, and how many events it carried.
 */
const measureDrag = async (probe: EventProbe): Promise<{ result: InteractionResult; dragged: number }> =>
{
  await probe.clear();
  await boxRows(probe, Math.max(0, Math.floor(probe.height / 2) - 1), 20);
  await probe.page.waitForTimeout(150);
  const half = await probe.selectedIds();
  const [ handle ] = half.slice(-1);
  const handleCell = await probe.cellOf(handle);
  const start = await probe.eventPoint(handle);
  const waypoints = [ start ];
  for (const offset of DRAG_WAYPOINTS)
  {
    waypoints.push(await probe.cellPoint(handleCell.x + offset.x, handleCell.y + offset.y));
  }

  const before = await probe.state();
  let ghostsMidway = 0;
  const recording = await recordInteraction(probe.page, () => dragMouse(probe.page, start, alongPath(waypoints, DRAG_MOVES), async () =>
  {
    ghostsMidway = (await probe.state()).ghosts;
  }));
  const after = await probe.state();
  const ended = after.drops + after.refusedDrops - before.drops - before.refusedDrops;
  const result = judgeInteractionFrames(recording.inputs, recording.frames, {
    ok: ghostsMidway === half.length && ended === 1,
    reason: `the drag showed ${ghostsMidway} of ${half.length} ghosts midway and ended ${ended} drops`,
  });
  return { result, dragged: half.length };
};

/**
 * Empties the bottom row, selects every other event and drags them all one row down: a drop moving nearly every event
 * on the map.
 * @param {EventProbe} probe The probe.
 * @returns {Promise<{ result: InteractionResult, dropped: number }>} What the drop came to, and how many events it moved.
 */
const measureDrop = async (probe: EventProbe): Promise<{ result: InteractionResult; dropped: number }> =>
{
  await probe.page.evaluate(y => (window as unknown as HookWindow).__jmzMapView.events.removeRow(y), probe.height - 1);
  await probe.clear();
  await boxRows(probe, probe.height, 20);
  await probe.page.waitForTimeout(150);
  const everything = await probe.selectedIds();
  const [ mover ] = everything;
  const moverCell = await probe.cellOf(mover);
  const from = await probe.eventPoint(mover);
  const to = await probe.cellPoint(moverCell.x, moverCell.y + 1);
  const before = await probe.state();
  const recording = await recordInteraction(probe.page, () => dragMouse(probe.page, from, alongPath([ from, to ], 8)), 500);
  const after = await probe.state();
  const landed = await probe.cellOf(mover);
  const panelShowsThem = await quickPanelIsQuiet(probe.page) === false;
  const result = judgeInteractionFrames(recording.inputs, recording.frames, {
    ok: after.drops === before.drops + 1 && landed.y === moverCell.y + 1 && panelShowsThem,
    reason: `the drop of ${everything.length} events did not land one row down with the quick panel showing them`,
  });
  return { result, dropped: everything.length };
};

/**
 * Selects, box-selects and drags events on the map on show with the real mouse, the whole map on screen and every
 * overlay on, and judges each interaction's frames: none may drop a frame.
 * @param {Page} page The page.
 * @param {number[]} size The map's size in tiles.
 * @returns {Promise<EventsResult>} What each interaction came to.
 */
const measureEvents = async (page: Page, size: number[]): Promise<EventsResult> =>
{
  await page.evaluate(() =>
  {
    const view = (window as unknown as HookWindow).__jmzMapView;
    view.zoomToFit();
    view.events.clear();
  });
  await page.waitForTimeout(400);

  const probe = await eventProbe(page, size);
  const click = await measureClicks(probe);
  const box = await measureBox(probe);
  const drag = await measureDrag(probe);
  const drop = await measureDrop(probe);
  return { click, box, drag: drag.result, drop: drop.result, dragged: drag.dragged, dropped: drop.dropped };
};

/**
 * Opens an event's window the way the author does, with a real double-click on the event, and times it to the first
 * frame of the window showing the event. With no NW.js shell to relay to, the page opens the window itself, as a popup
 * the browser hands over as a new page, and the window takes the map's live copy from this page over the sync channel.
 * The popup shares this page's process, where the shell gives every window a process of its own, so this times the
 * window's loading and its copy of the map rather than a new process starting.
 * @param {Page} page The map page.
 * @returns {Promise<EventWindowResult>} What it came to.
 */
const measureEventWindow = async (page: Page): Promise<EventWindowResult> =>
{
  // the map's first event, centred and close up, so the double-click lands on it alone.
  const eventId = await page.evaluate(() =>
  {
    const view = (window as unknown as HookWindow).__jmzMapView;
    view.events.clear();
    const [ first ] = view.events.eventIds();
    const cell = view.events.cellOf(first) as { x: number; y: number };
    view.lookAt(cell.x, cell.y, 2);
    return first;
  });
  await page.waitForTimeout(400);

  const box = await page.locator(MAP_CANVAS).boundingBox();
  const at = await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.events.screenOfEvent(id), eventId);
  if (box === null || at === null)
  {
    throw new Error(`event ${eventId} is not on screen to double-click`);
  }

  // the clock is read before the double-click, so the time measured is never short of the real one.
  const opened = page.context().waitForEvent('page', { timeout: 15_000 });
  const clickedAt = await page.evaluate(() => performance.timeOrigin + performance.now());
  await page.mouse.dblclick(box.x + at.x, box.y + at.y);
  const eventPage = await opened;
  await eventPage.waitForFunction(() => performance.getEntriesByName('jmz-event-window-ready').length > 0, null, { timeout: 15_000 });
  const ready = await eventPage.evaluate(() =>
  {
    const [ mark ] = performance.getEntriesByName('jmz-event-window-ready');
    return { origin: performance.timeOrigin, startTime: mark.startTime };
  });
  await eventPage.close();
  return { eventId, doubleClickToReadyMs: ready.origin + ready.startTime - clickedAt, navigationToReadyMs: ready.startTime };
};

/**
 * Opens one map in a fresh browser and measures everything the budgets cover.
 * @param {Options} options The settings.
 * @param {string} uiBase The UI's origin.
 * @param {number} mapId The map.
 * @param {number} run The run's number.
 * @returns {Promise<MapResult>} What it came to.
 */
const measureMap = async (options: Options, uiBase: string, mapId: number, run: number): Promise<MapResult> =>
{
  const loadBefore = await loadAverage();
  const { browser, report } = await openSpeedBrowser({ mode: 'gpu', expectRenderer: options.expectRenderer });
  try
  {
    const page = await newSpeedPage(browser);
    await addFrameRecorder(page);
    await page.goto(`${uiBase}/map.html?map=${mapId}&speed=1&quick=1`);
    await page.waitForFunction(() =>
    {
      const hooks = (window as unknown as { __jmzMapView?: PageHooks }).__jmzMapView;
      return hooks !== undefined && hooks.ready();
    }, null, { timeout: 30_000 });

    // the page's own context must be on the card too, or nothing it times means anything.
    const info = await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.info());
    const pageGpu = info.gpu?.renderer ?? '';
    if (options.expectRenderer.test(pageGpu) === false)
    {
      throw new Error(`refusing to time: the page draws on "${pageGpu}", not ${options.expectRenderer}`);
    }

    const timings = await page.evaluate(() => ({ ...(window as unknown as HookWindow).__jmzMapView.timings }));
    const coldOpenMs = timings['drawnAt'] ?? -1;
    await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.enableEveryOverlay());
    await page.waitForTimeout(1000);

    const paths: Record<string, PathResult> = {};
    for (const kind of PATHS)
    {
      paths[kind] = await measurePath(page, kind, options.seconds);
    }

    const stroke = await measureStroke(page, info.size ?? [ 1, 1 ]);
    const events = await measureEvents(page, info.size ?? [ 1, 1 ]);

    // again with a module overlay as heavy as sight rings around every event, which painting must not redraw.
    await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.enableModuleRings());
    await page.waitForTimeout(300);
    const strokeWithRings = await measureStroke(page, info.size ?? [ 1, 1 ]);

    // warm: another map, then this one again, both now held by the window.
    const other = options.maps.find(candidate => candidate !== mapId) ?? mapId;
    await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.openMap(id), other);
    const warm = await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.openMap(id), mapId);

    // last, since the context it gets back is a new one the frame recorder has not seen.
    const shown = await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.showAgain());
    if (shown.hidden !== 'hidden' || shown.shown !== 'drawing')
    {
      throw new Error(`the view did not let its context go and draw again: hidden "${shown.hidden}", shown "${shown.shown}"`);
    }

    // after every frame recording, since the window it opens shares this page's process.
    const eventWindow = await measureEventWindow(page);
    await page.close();

    const verdicts: Record<string, Verdict> = {
      coldOpen: judgeOpen(coldOpenMs, BUDGETS.coldOpenMs, 'cold open'),
      warmOpen: judgeOpen(warm.ms, BUDGETS.warmOpenMs, 'warm open'),
      shownAgain: judgeOpen(shown.ms, BUDGETS.shownAgainMs, 'shown again'),
      eventWindow: judgeOpen(eventWindow.doubleClickToReadyMs, BUDGETS.eventWindowOpenMs, 'event window open'),
      stroke: stroke.verdict,
      strokeWithRings: strokeWithRings.verdict,
      eventClick: events.click.verdict,
      eventBox: events.box.verdict,
      eventDrag: events.drag.verdict,
      eventDrop: events.drop.verdict,
    };
    PATHS.forEach(kind =>
    {
      verdicts[kind] = paths[kind].verdict;
    });

    return {
      map: mapId,
      run,
      loadBefore,
      loadAfter: await loadAverage(),
      report,
      pageGpu,
      info,
      coldOpenMs,
      timings,
      paths,
      stroke,
      strokeWithRings,
      warmOpenMs: warm.ms,
      shownAgainMs: shown.ms,
      events,
      eventWindow,
      verdicts,
    };
  }
  finally
  {
    await browser.close();
  }
};

/**
 * Formats a number for the tables.
 * @param {number} value The number.
 * @param {number} digits Digits after the point.
 * @returns {string} The number, right-aligned.
 */
const cell = (value: number, digits = 2): string =>
{
  return value.toFixed(digits).padStart(8);
};

/**
 * Words a verdict.
 * @param {Verdict} verdict The verdict.
 * @returns {string} PASS, or FAIL with its reasons.
 */
const verdictText = (verdict: Verdict): string =>
{
  return verdict.pass ? 'PASS' : `FAIL ${verdict.reasons.join('; ')}`;
};

/**
 * Prints one map's run.
 * @param {MapResult} result The result.
 */
const printMap = (result: MapResult): void =>
{
  console.log(`Map${result.map} run ${result.run}: load ${result.loadBefore.toFixed(2)} -> ${result.loadAfter.toFixed(2)}`);
  console.log(`  cold open ${cell(result.coldOpenMs, 1)} ms  ${verdictText(result.verdicts['coldOpen'])}`);
  console.log(`  warm open ${cell(result.warmOpenMs, 1)} ms  ${verdictText(result.verdicts['warmOpen'])}`);
  console.log(`  shown again ${cell(result.shownAgainMs, 1)} ms  ${verdictText(result.verdicts['shownAgain'])}`);
  console.log(`  event window ${cell(result.eventWindow.doubleClickToReadyMs, 1)} ms from the double-click on event ${result.eventWindow.eventId}`
    + ` (${cell(result.eventWindow.navigationToReadyMs, 1)} ms from its navigation)  ${verdictText(result.verdicts['eventWindow'])}`);
  PATHS.forEach(kind =>
  {
    const { summary, verdict, gpuBusy: busy, stalls } = result.paths[kind];
    console.log(`  ${kind.padEnd(9)} frames ${String(summary.frames).padStart(4)} dropped ${summary.droppedFrames}`
      + ` int.max ${cell(summary.intervals.max, 1)} work p50 ${cell(summary.work.p50)} p99 ${cell(summary.work.p99)}`
      + ` gpu p50 ${cell(summary.gpu.p50)} p99 ${cell(summary.gpu.p99)} busy ${busy.mean.toFixed(0)}%  ${verdictText(verdict)}`);
    stalls.forEach(stall => console.log(`            stall ${stall.interval.toFixed(1)} ms: before work ${stall.before.work.toFixed(2)} gpu`
      + ` ${stall.before.gpu.toFixed(2)}, after work ${stall.after.work.toFixed(2)} gpu ${stall.after.gpu.toFixed(2)}`));
  });
  const strokes: [ string, StrokeResult ][] = [ [ 'stroke', result.stroke ], [ '+rings', result.strokeWithRings ] ];
  strokes.forEach(([ label, stroke ]) =>
  {
    console.log(`  ${label.padEnd(9)} inputs ${stroke.inputs} matched ${stroke.matched} frames ${stroke.frames} dropped ${stroke.dropped}`
      + ` cost p50 ${cell(stroke.cost.p50)} max ${cell(stroke.cost.max)} work max ${cell(stroke.work.max)}  ${verdictText(stroke.verdict)}`);
  });
  const { events } = result;
  const interaction = (label: string, outcome: InteractionResult) =>
  {
    console.log(`  ${label.padEnd(9)} inputs ${String(outcome.inputs).padStart(4)} frames ${String(outcome.frames).padStart(4)}`
      + ` dropped ${outcome.dropped} cost p50 ${cell(outcome.cost.p50)} max ${cell(outcome.cost.max)} work max ${cell(outcome.work.max)}`
      + `  ${verdictText(outcome.verdict)}`);
  };
  interaction('click', events.click);
  interaction('box', events.box);
  interaction(`drag ${events.dragged}`, events.drag);
  interaction(`drop ${events.dropped}`, events.drop);
};

/**
 * Prints the spread of the headline numbers across runs, per map.
 * @param {MapResult[]} results Every result.
 * @param {number[]} maps The maps.
 */
const printSpread = (results: MapResult[], maps: number[]): void =>
{
  const line = (label: string, values: number[]) =>
  {
    const { p50, max } = summarize(values);
    console.log(`  ${label.padEnd(34)} min ${cell(Math.min(...values))}  median ${cell(p50)}  max ${cell(max)}`);
  };

  maps.forEach(map =>
  {
    const mine = results.filter(result => result.map === map);
    console.log(`Map${map} across ${mine.length} runs:`);
    line('cold open (ms)', mine.map(result => result.coldOpenMs));
    line('warm open (ms)', mine.map(result => result.warmOpenMs));
    line('shown again (ms)', mine.map(result => result.shownAgainMs));
    line('event window open (ms)', mine.map(result => result.eventWindow.doubleClickToReadyMs));
    PATHS.forEach(kind =>
    {
      line(`${kind} dropped frames`, mine.map(result => result.paths[kind].summary.droppedFrames));
      line(`${kind} main-thread p99 (ms)`, mine.map(result => result.paths[kind].summary.work.p99));
      line(`${kind} gpu p99 (ms)`, mine.map(result => result.paths[kind].summary.gpu.p99));
    });
    line('stroke frame cost max (ms)', mine.map(result => result.stroke.cost.max));
    line('stroke dropped mid-stroke', mine.map(result => result.stroke.dropped));
    line('stroke with rings cost max (ms)', mine.map(result => result.strokeWithRings.cost.max));
    line('stroke with rings dropped', mine.map(result => result.strokeWithRings.dropped));
    ([ 'click', 'box', 'drag', 'drop' ] as const).forEach(kind =>
    {
      line(`event ${kind} dropped frames`, mine.map(result => result.events[kind].dropped));
      line(`event ${kind} frame cost max (ms)`, mine.map(result => result.events[kind].cost.max));
    });
  });
};

/**
 * Runs the script.
 */
const main = async (): Promise<void> =>
{
  const options = parseOptions(process.argv.slice(2));
  if (options.project === '')
  {
    throw new Error('name the game with --project or JMZ_PROJECT_ROOT');
  }

  // this run's own folder, built into afresh, so nothing another run left or is doing can reach what gets timed.
  const runFolder = createRunFolder(options.scratch, 'jmz-speed-');
  const stack = await startEditorStack({
    projectRoot: options.project,
    scratch: runFolder,
    uiPort: options.uiPort,
    apiPort: options.apiPort,
  }).catch((error: unknown) =>
  {
    rmSync(runFolder, { recursive: true, force: true });
    throw error;
  });
  const results: MapResult[] = [];
  try
  {
    for (let run = 1; run <= options.runs; run++)
    {
      for (const map of options.maps)
      {
        const result = await measureMap(options, stack.uiBase, map, run);
        if (results.length === 0)
        {
          console.log(`gpu: ${result.pageGpu} | compositing: ${result.report.compositing} | chromium ${result.report.version}`);
        }

        printMap(result);
        results.push(result);
      }
    }
  }
  finally
  {
    await stack.stop();
    rmSync(runFolder, { recursive: true, force: true });
  }

  printSpread(results, options.maps);
  if (options.jsonPath !== undefined)
  {
    const { jsonPath, ...kept } = options;
    await Bun.write(jsonPath, JSON.stringify({ options: { ...kept, expectRenderer: String(kept.expectRenderer) }, budgets: BUDGETS, results }, null, 2));
  }

  const missed = results.some(result => Object.values(result.verdicts).some(verdict => verdict.pass === false));
  console.log(missed ? 'FAIL: at least one budget was missed' : 'PASS: every budget measured held');
  process.exit(missed ? 1 : 0);
};

await main();
