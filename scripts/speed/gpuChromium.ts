/// <reference types="bun-types" />
/**
 * The launch recipe for measuring the editor's frame times in headless chromium on the machine's real GPU.
 *
 * `--use-angle=vulkan` is the whole recipe. Headless chromium then runs WebGL through ANGLE on Vulkan and
 * composites on the GPU as well, with no window and no display. What each alternative does instead, on
 * the machine this was worked out on (an RX 6950 XT beside the Ryzen's integrated Radeon, Mesa 26.2):
 *
 * - no flags: WebGL on SwiftShader, which is software, so its frame times mean nothing;
 * - adding `--disable-vulkan-surface`, which many headless GPU recipes carry: WebGL stays on the GPU but
 *   compositing falls back to software, so every frame is read back to the CPU;
 * - `--use-angle=gl-egl`: the GPU, but the integrated one, which DRI_PRIME does not move;
 * - `--use-gl=egl`: silently falls back to SwiftShader.
 *
 * None of that is taken on trust. `openSpeedBrowser` reads the renderer from a WebGL2 context and the
 * compositing mode from chrome://gpu, and refuses to hand over a browser that is not what the mode claims.
 *
 * The environment loses WAYLAND_DISPLAY and DISPLAY, so nothing launched here can reach the desktop.
 */
import { chromium } from 'playwright-core';
import type { Browser, Page } from 'playwright-core';

/**
 * Which renderer to launch: the real GPU, or SwiftShader for comparison.
 */
type RenderMode = 'gpu' | 'swiftshader';

/**
 * How to launch the browser.
 */
type LaunchOptions = {
  /** The real GPU, or SwiftShader for comparison. */
  mode: RenderMode;

  /**
   * Unlocks the frame clock, so frames run back to back instead of at 60 Hz. That measures main-thread
   * headroom only: frames then outrun presentation, so it says nothing about dropped frames.
   */
  unthrottled?: boolean;

  /** A chromium binary to use instead of Playwright's own build, such as /usr/lib/chromium/chromium. */
  executablePath?: string;

  /** When given, the GPU renderer's name must match it, which catches a browser on the wrong GPU. */
  expectRenderer?: RegExp;
};

/**
 * What the browser reports about its graphics, read from inside it.
 */
type GpuReport = {
  /** The browser's version. */
  version: string;

  /** The WebGL2 vendor, unmasked. */
  vendor: string;

  /** The WebGL2 renderer, unmasked, which names the GPU and the driver. */
  renderer: string;

  /** Whether WebGL2 exposes GPU timer queries. */
  timerQuery: boolean;

  /** chrome://gpu's status line for compositing. */
  compositing: string;

  /** chrome://gpu's status line for WebGL. */
  webgl: string;
};

/**
 * The part of the report that comes from a WebGL2 context.
 */
type WebGlInfo = Pick<GpuReport, 'vendor' | 'renderer' | 'timerQuery'>;

/**
 * A browser that passed its renderer check, and the report it passed with.
 */
type SpeedBrowser = {
  /** The browser. */
  browser: Browser;

  /** What the browser reported about its graphics. */
  report: GpuReport;
};

/**
 * The editor's window on the desktop it is measured for: 2560x1440 at 1.5 scale, which is a 3840x2160
 * canvas. Playwright's default viewport is about a ninth of those pixels.
 */
const DESKTOP_VIEWPORT = { width: 2560, height: 1440, deviceScaleFactor: 1.5 };

/**
 * The flags per renderer. SwiftShader is named explicitly so the comparison cannot drift onto the GPU. Every launch is
 * muted: a headless browser has no window, but it can still play sound through the machine's speakers.
 */
const MODE_ARGS: Record<RenderMode, string[]> = {
  gpu: [ '--use-angle=vulkan', '--mute-audio', '--disable-audio-output' ],
  swiftshader: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--disable-audio-output' ],
};

/**
 * The flags that unlock the frame clock.
 */
const UNTHROTTLED_ARGS = [ '--disable-frame-rate-limit', '--disable-gpu-vsync' ];

/**
 * Renderer names that mean software rendering.
 */
const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|software/i;

/**
 * The chrome://gpu status of a feature running fully on the GPU. "Hardware accelerated but at reduced
 * performance" is deliberately not this: it is what software compositing reports.
 */
const HARDWARE_STATUS = 'Hardware accelerated';

/**
 * Copies the environment without the variables that lead to a desktop display.
 * @returns {Record<string, string>} The environment to launch the browser with.
 */
const headlessEnvironment = (): Record<string, string> =>
{
  const environment: Record<string, string> = {};
  Object.entries(process.env).forEach(([ key, value ]) =>
  {
    // keep everything except the two ways chromium finds a display.
    if (value !== undefined && key !== 'WAYLAND_DISPLAY' && key !== 'DISPLAY')
    {
      environment[key] = value;
    }
  });

  return environment;
};

/**
 * Launches headless chromium for the given renderer, without checking what it got.
 * @param {LaunchOptions} options The renderer, the frame clock, and the binary.
 * @returns {Promise<Browser>} The browser.
 */
const launchSpeedChromium = async (options: LaunchOptions): Promise<Browser> =>
{
  const { mode, unthrottled = false, executablePath } = options;
  const args = unthrottled ? [ ...MODE_ARGS[mode], ...UNTHROTTLED_ARGS ] : MODE_ARGS[mode];

  // the chromium channel is Playwright's full build in the new headless mode, which composites with the
  // same code as a window does; the default would be the older headless shell.
  return chromium.launch({
    channel: executablePath === undefined ? 'chromium' : undefined,
    executablePath,
    headless: true,
    args,
    env: headlessEnvironment(),
  });
};

/**
 * Reads one feature's status line from chrome://gpu's text.
 * @param {string} text The page's text.
 * @param {string} feature The feature's label, such as Compositing.
 * @returns {string} Its status, or an empty string when the line is missing.
 */
const featureStatus = (text: string, feature: string): string =>
{
  const line = text.split('\n').find(candidate => candidate.startsWith(`${feature}: `));
  return line === undefined ? '' : line.slice(feature.length + 2).trim();
};

/**
 * Reads chrome://gpu's text, which lives in the shadow tree of its info view.
 * @param {Page} page A page on chrome://gpu.
 * @returns {Promise<string>} The page's text.
 */
const readGpuPageText = async (page: Page): Promise<string> =>
{
  // the feature list is filled in after load, so wait for its heading.
  await page.waitForFunction(() =>
  {
    // a shadow root's text is always a string; the DOM typings only allow for a document's null.
    const view = document.querySelector('info-view');
    return view !== null && view.shadowRoot !== null && (view.shadowRoot.textContent as string).includes('Compositing');
  });

  return page.evaluate(() =>
  {
    const view = document.querySelector('info-view') as HTMLElement;
    const children = Array.from((view.shadowRoot as ShadowRoot).children) as HTMLElement[];
    return children.map(child => child.innerText).join('\n');
  });
};

/**
 * Reads the unmasked WebGL2 renderer and whether timer queries are there, from a blank page.
 * @param {Page} page A blank page.
 * @returns {Promise<WebGlInfo>} What WebGL2 reports.
 */
const readWebGlRenderer = async (page: Page): Promise<WebGlInfo> =>
{
  return page.evaluate(() =>
  {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null)
    {
      return { vendor: '', renderer: 'no WebGL2 context', timerQuery: false };
    }

    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const timerQuery = gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null;
    if (info === null)
    {
      return { vendor: '', renderer: 'renderer info unavailable', timerQuery };
    }

    return {
      vendor: String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL)),
      renderer: String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)),
      timerQuery,
    };
  });
};

/**
 * Reads what the browser reports about its graphics, from a WebGL2 context and from chrome://gpu.
 * @param {Browser} browser The browser to ask.
 * @returns {Promise<GpuReport>} The report.
 */
const readGpuReport = async (browser: Browser): Promise<GpuReport> =>
{
  const page = await browser.newPage();
  try
  {
    const webgl = await readWebGlRenderer(page);
    await page.goto('chrome://gpu');
    const text = await readGpuPageText(page);

    return {
      version: browser.version(),
      ...webgl,
      compositing: featureStatus(text, 'Compositing'),
      webgl: featureStatus(text, 'WebGL'),
    };
  }
  finally
  {
    await page.close();
  }
};

/**
 * Lists what disqualifies a report from being a real GPU measurement.
 * @param {GpuReport} report The browser's report.
 * @param {RegExp | undefined} expectRenderer When given, the renderer's name must match it.
 * @returns {string[]} One line per problem; empty when the report is a real GPU.
 */
const hardwareProblems = (report: GpuReport, expectRenderer: RegExp | undefined): string[] =>
{
  const problems: string[] = [];
  if (SOFTWARE_RENDERER.test(report.renderer))
  {
    problems.push(`WebGL is on a software renderer: ${report.renderer}`);
  }

  if (report.webgl !== HARDWARE_STATUS)
  {
    problems.push(`chrome://gpu reports WebGL as "${report.webgl}"`);
  }

  if (report.compositing !== HARDWARE_STATUS)
  {
    problems.push(`chrome://gpu reports compositing as "${report.compositing}"`);
  }

  if (!report.timerQuery)
  {
    problems.push('WebGL2 has no timer queries, so GPU time cannot be measured');
  }

  if (expectRenderer !== undefined && !expectRenderer.test(report.renderer))
  {
    problems.push(`the renderer "${report.renderer}" does not match ${expectRenderer}`);
  }

  return problems;
};

/**
 * Lists what disqualifies a report from being the SwiftShader comparison.
 * @param {GpuReport} report The browser's report.
 * @returns {string[]} One line per problem; empty when the report is SwiftShader.
 */
const softwareProblems = (report: GpuReport): string[] =>
{
  return /SwiftShader/.test(report.renderer) ? [] : [ `expected SwiftShader, got ${report.renderer}` ];
};

/**
 * Launches headless chromium for the given renderer and checks, from inside the browser, that it got it.
 * @param {LaunchOptions} options The renderer, the frame clock, the binary, and the GPU to expect.
 * @returns {Promise<SpeedBrowser>} The browser and its report.
 */
const openSpeedBrowser = async (options: LaunchOptions): Promise<SpeedBrowser> =>
{
  const browser = await launchSpeedChromium(options);
  try
  {
    const report = await readGpuReport(browser);
    const problems = options.mode === 'gpu' ? hardwareProblems(report, options.expectRenderer) : softwareProblems(report);
    if (problems.length > 0)
    {
      throw new Error(`refusing to measure in ${options.mode} mode: ${problems.join('; ')}`);
    }

    return { browser, report };
  }
  catch (error)
  {
    // never leave a browser running behind a failed check.
    await browser.close();
    throw error;
  }
};

/**
 * Opens a page sized like the editor's window on the desktop.
 * @param {Browser} browser The browser.
 * @returns {Promise<Page>} The page, in a fresh context.
 */
const newSpeedPage = async (browser: Browser): Promise<Page> =>
{
  const { width, height, deviceScaleFactor } = DESKTOP_VIEWPORT;
  return browser.newPage({ viewport: { width, height }, deviceScaleFactor });
};

export {
  DESKTOP_VIEWPORT,
  launchSpeedChromium,
  newSpeedPage,
  openSpeedBrowser,
  readGpuReport,
};

export type { GpuReport, LaunchOptions, RenderMode, SpeedBrowser };
