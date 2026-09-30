/// <reference types="bun-types" />
/**
 * The map editor's speed script: opens the heavy fixture maps in the real map editor page, in headless chromium on
 * the machine's real GPU (spike S3's recipe), and fails on any speed budget from the plan's D3.
 *
 *   bun run speed [--runs 3] [--seconds 5] [--maps 102,361] [--ui-port 18200] [--api-port 18201]
 *                 [--scratch <folder>] [--project <game>] [--rebuild] [--json <file>]
 *
 * Every map in every run gets a fresh browser, so every open is cold. Per map it measures, with the game look and
 * every overlay on:
 *   - the cold open: navigation start to the first frame that drew the map;
 *   - three camera paths driven from the page's own frame clock: a pan at zoom 1, a zoom sweep from 2x out to the
 *     whole map and back, and the whole map held on screen and drifting;
 *   - a brush stroke: real pointer moves with the left button held, each painting a 3x3 patch through the paint
 *     stand-in (P3's tools do not exist yet), matched to the frames that drew them;
 *   - the warm open: reopening the map after another, once this window holds both;
 *   - dragging events, once P5 provides the hook; until then it reports that it waited.
 *
 * It refuses to time anywhere but the RX 6950 XT: the browser's WebGL renderer and the page's own must both name it
 * (JMZ_SPEED_GPU, or --gpu, overrides the pattern). The exit code is non-zero when any budget is missed.
 */
import { tmpdir } from 'node:os';
import type { Page } from 'playwright-core';
import { BUDGETS, judgeCameraPath, judgeOpen, judgeStrokeFrames } from './budgets.ts';
import type { StrokeResult } from './budgets.ts';
import { startEditorStack } from './editorStack.ts';
import { addFrameRecorder, startRecording, stopRecording } from './frameRecorder.ts';
import { REFRESH_60_HZ, summarize, summarizeFrames } from './frameStats.ts';
import type { RunSummary, Verdict } from './frameStats.ts';
import { newSpeedPage, openSpeedBrowser } from './gpuChromium.ts';
import type { GpuReport } from './gpuChromium.ts';

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
  rebuild: boolean;
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
  warmOpenMs: number;
  drag: string;
  verdicts: Record<string, Verdict>;
};

/**
 * The hooks the page installs when opened with speed=1, as far as this script calls them.
 */
type PageHooks = {
  ready: () => boolean;
  timings: Record<string, number>;
  info: () => { gpu: { renderer: string } | null; size: number[] | null };
  lookAt: (x: number, y: number, zoom: number) => void;
  screenOfCell: (x: number, y: number) => { x: number; y: number };
  startPath: (kind: string) => void;
  stopPath: () => void;
  enablePaint: (settings: Record<string, unknown>) => void;
  disablePaint: () => void;
  paintState: () => { steps: number; redrawnFrames: number };
  enableEveryOverlay: () => void;
  openMap: (mapId: number) => Promise<{ ms: number }>;
  dragEvents: null | ((options: unknown) => Promise<unknown>);
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
    scratch: flags.get('scratch') ?? `${tmpdir()}/jmz-speed`,
    project: flags.get('project') ?? process.env['JMZ_PROJECT_ROOT'] ?? '',
    rebuild: flags.has('rebuild'),
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
 * Builds a stroke's path inside the map's part of the view: sweeping across and back, drifting down.
 * @param {{ x: number, y: number }} topLeft The screen point of the top-left cell's centre.
 * @param {{ x: number, y: number }} bottomRight The screen point of the bottom-right cell's centre.
 * @param {{ width: number, height: number }} viewport The page's viewport.
 * @returns {{ x: number, y: number }[]} The pointer positions.
 */
const strokePath = (
  topLeft: { x: number; y: number },
  bottomRight: { x: number; y: number },
  viewport: { width: number; height: number }): { x: number; y: number }[] =>
{
  const left = Math.max(topLeft.x, 24);
  const top = Math.max(topLeft.y, 24);
  const right = Math.min(bottomRight.x, viewport.width - 24);
  const bottom = Math.min(bottomRight.y, viewport.height - 60);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const points: { x: number; y: number }[] = [];
  for (let step = 0; step < STROKE_MOVES; step++)
  {
    // a triangle wave across, so the stroke stays on the map however narrow it is.
    const travel = (step * 8) % (width * 2);
    const x = travel <= width ? left + travel : left + width * 2 - travel;
    points.push({ x, y: top + ((step * 3) % height) });
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
  await page.evaluate(([ x, y ]) =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    hooks.lookAt(x, y, 1);
    hooks.enablePaint({ layer: 0, footprint: 3 });
  }, [ Math.floor(width / 2), Math.floor(height / 2) ]);
  await page.waitForTimeout(300);
  const [ topLeft, bottomRight ] = await page.evaluate(([ right, bottom ]) =>
  {
    const hooks = (window as unknown as HookWindow).__jmzMapView;
    return [ hooks.screenOfCell(0, 0), hooks.screenOfCell(right, bottom) ];
  }, [ width - 1, height - 1 ]);

  // the hooks answer in the canvas's own pixels; the mouse moves in the page's, around the view's bars.
  const canvas = await page.locator('canvas').boundingBox();
  if (canvas === null)
  {
    throw new Error('the map view has no canvas to paint on');
  }

  const onPage = (point: { x: number; y: number }) => ({ x: point.x + canvas.x, y: point.y + canvas.y });
  const points = strokePath(topLeft, bottomRight, { width: canvas.width, height: canvas.height }).map(onPage);

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
  const moves = recording.inputs.filter(input => input.type === 'pointermove' || input.type === 'pointerdown');
  return judgeStrokeFrames(moves, recording.frames, proof);
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
    await page.goto(`${uiBase}/map.html?map=${mapId}&speed=1`);
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
    const coldOpenMs = timings['firstFrameAt'] ?? -1;
    await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.enableEveryOverlay());
    await page.waitForTimeout(1000);

    const paths: Record<string, PathResult> = {};
    for (const kind of PATHS)
    {
      paths[kind] = await measurePath(page, kind, options.seconds);
    }

    const stroke = await measureStroke(page, info.size ?? [ 1, 1 ]);

    // warm: another map, then this one again, both now held by the window.
    const other = options.maps.find(candidate => candidate !== mapId) ?? mapId;
    await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.openMap(id), other);
    const warm = await page.evaluate(id => (window as unknown as HookWindow).__jmzMapView.openMap(id), mapId);
    const hasDrag = await page.evaluate(() => (window as unknown as HookWindow).__jmzMapView.dragEvents !== null);
    await page.close();

    const verdicts: Record<string, Verdict> = {
      coldOpen: judgeOpen(coldOpenMs, BUDGETS.coldOpenMs, 'cold open'),
      warmOpen: judgeOpen(warm.ms, BUDGETS.warmOpenMs, 'warm open'),
      stroke: stroke.verdict,
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
      warmOpenMs: warm.ms,
      drag: hasDrag ? 'hook present but not yet measured by this script' : 'waits for P5, which provides the drag hook',
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
  PATHS.forEach(kind =>
  {
    const { summary, verdict, gpuBusy: busy, stalls } = result.paths[kind];
    console.log(`  ${kind.padEnd(9)} frames ${String(summary.frames).padStart(4)} dropped ${summary.droppedFrames}`
      + ` int.max ${cell(summary.intervals.max, 1)} work p50 ${cell(summary.work.p50)} p99 ${cell(summary.work.p99)}`
      + ` gpu p50 ${cell(summary.gpu.p50)} p99 ${cell(summary.gpu.p99)} busy ${busy.mean.toFixed(0)}%  ${verdictText(verdict)}`);
    stalls.forEach(stall => console.log(`            stall ${stall.interval.toFixed(1)} ms: before work ${stall.before.work.toFixed(2)} gpu`
      + ` ${stall.before.gpu.toFixed(2)}, after work ${stall.after.work.toFixed(2)} gpu ${stall.after.gpu.toFixed(2)}`));
  });
  const { stroke } = result;
  console.log(`  stroke    inputs ${stroke.inputs} matched ${stroke.matched} frames ${stroke.frames} dropped ${stroke.dropped}`
    + ` cost p50 ${cell(stroke.cost.p50)} max ${cell(stroke.cost.max)} work max ${cell(stroke.work.max)}  ${verdictText(stroke.verdict)}`);
  console.log(`  drag      ${result.drag}`);
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
    PATHS.forEach(kind =>
    {
      line(`${kind} dropped frames`, mine.map(result => result.paths[kind].summary.droppedFrames));
      line(`${kind} main-thread p99 (ms)`, mine.map(result => result.paths[kind].summary.work.p99));
      line(`${kind} gpu p99 (ms)`, mine.map(result => result.paths[kind].summary.gpu.p99));
    });
    line('stroke frame cost max (ms)', mine.map(result => result.stroke.cost.max));
    line('stroke dropped mid-stroke', mine.map(result => result.stroke.dropped));
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

  const stack = await startEditorStack({
    projectRoot: options.project,
    scratch: options.scratch,
    uiPort: options.uiPort,
    apiPort: options.apiPort,
    rebuild: options.rebuild,
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
