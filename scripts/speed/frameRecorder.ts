/**
 * The frame-time recorder: a script installed into the page before anything else runs, which times every
 * animation frame without the page's cooperation.
 *
 * Per frame it records the frame's begin time (from which dropped frames follow), the main-thread time
 * spent in animation-frame callbacks, and the GPU time of the WebGL2 work those callbacks issued, measured
 * with EXT_disjoint_timer_query_webgl2. It also records every pointer event and the browser's own Event
 * Timing entries, so an input can be matched to the frame that drew it.
 *
 * It works by wrapping requestAnimationFrame and HTMLCanvasElement.getContext, so a renderer needs no
 * changes to be measured. It measures WebGL2 only, and only work issued inside animation-frame callbacks,
 * which is where the map renderer draws. A page that runs timer queries of its own cannot be measured,
 * since a context allows one at a time.
 *
 * Each timer query brackets a single callback and is flushed as the callback returns. With ANGLE on
 * Vulkan, a query left open across the gap between frames also counts the GPU sitting idle, waiting for
 * the next submission: on the probe page that read 5.85 ms per frame instead of 0.61 ms.
 */
import type { Page } from 'playwright-core';
import type { EventTimingSample, FrameSample, InputSample } from './frameStats.ts';

/**
 * Everything the recorder hands back when it stops.
 */
type Recording = {
  /** Every frame that ran while recording, in order. */
  frames: FrameSample[];

  /** Every pointer event received while recording, in order. */
  inputs: InputSample[];

  /** The browser's Event Timing entries of 16 ms or more; shorter ones are never reported. */
  eventTimings: EventTimingSample[];

  /** How many WebGL2 contexts the page created. */
  contexts: number;

  /** Whether any of those contexts exposed GPU timer queries. */
  timerQuery: boolean;
};

/**
 * What the recorder installs on the page's window.
 */
type FrameRecorderApi = {
  /** Clears anything recorded before and starts recording. */
  start: () => void;

  /** Stops recording, waits for outstanding GPU timings, and hands everything over. */
  stop: () => Promise<Recording>;
};

declare global
{
  interface Window
  {
    __frameRecorder: FrameRecorderApi;
  }
}

/**
 * Installs the recorder into the page. Playwright serializes this function and runs it in the page before
 * any page script, so it must stay self-contained: nothing from this module's scope survives the trip.
 */
const installFrameRecorder = (): void =>
{
  // the two constants of the timer query extension, which is all the recorder uses of it.
  type TimerQuery = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

  // a query in flight, tied to the frame whose GPU time it measures.
  type PendingQuery = { query: WebGLQuery; frame: FrameSample };

  // one WebGL2 context the page created, with the query in progress and those awaiting results.
  type TrackedContext = {
    gl: WebGL2RenderingContext;
    timer: TimerQuery | null;
    active: PendingQuery | null;
    pending: PendingQuery[];
  };

  // the untouched originals, called by the wrappers below.
  type GetContext = (this: HTMLCanvasElement, contextId: string, options?: unknown) => RenderingContext | null;
  const originalGetContext = HTMLCanvasElement.prototype.getContext as GetContext;
  const originalRequestFrame = window.requestAnimationFrame.bind(window);

  const contexts: TrackedContext[] = [];
  let recording = false;
  let collectingEventTimings = false;
  let frames: FrameSample[] = [];
  let inputs: InputSample[] = [];
  let eventTimings: EventTimingSample[] = [];
  let current: FrameSample | null = null;

  /**
   * Starts a GPU timer query on every context, measuring the callback about to run.
   * @param {FrameSample} frame The frame the callback belongs to, which the reading is added to.
   */
  const beginQueries = (frame: FrameSample): void =>
  {
    contexts.forEach(tracked =>
    {
      // a lost context, or one without timer queries, cannot be measured.
      if (tracked.timer === null || tracked.gl.isContextLost())
      {
        return;
      }

      const query = tracked.gl.createQuery();
      tracked.gl.beginQuery(tracked.timer.TIME_ELAPSED_EXT, query);
      tracked.active = { query, frame };
    });
  };

  /**
   * Ends the running GPU timer query on every context and queues it for its result.
   */
  const endQueries = (): void =>
  {
    contexts.forEach(tracked =>
    {
      if (tracked.active === null || tracked.timer === null)
      {
        return;
      }

      tracked.gl.endQuery(tracked.timer.TIME_ELAPSED_EXT);

      // flush now: ANGLE on Vulkan otherwise holds the closing timestamp until the next submission, and
      // the reading stretches across the idle gap between frames.
      tracked.gl.flush();
      tracked.pending.push(tracked.active);
      tracked.active = null;
    });
  };

  /**
   * Reads every finished GPU timer query on one context into the frame it measured.
   * @param {TrackedContext} tracked The context whose queries to read.
   */
  const collectContext = (tracked: TrackedContext): void =>
  {
    const { gl, timer, pending } = tracked;
    if (timer === null)
    {
      return;
    }

    // results arrive in order, so stop at the first one that is not ready.
    while (pending.length > 0 && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE) === true)
    {
      const finished = pending.shift() as PendingQuery;
      const disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT) === true;
      const nanoseconds = gl.getQueryParameter(finished.query, gl.QUERY_RESULT) as number;
      gl.deleteQuery(finished.query);

      // a disjoint reading spans a clock change and means nothing, so the frame stays unmeasured.
      if (!disjoint)
      {
        finished.frame.gpu = Math.max(0, finished.frame.gpu) + nanoseconds / 1e6;
      }
    }
  };

  /**
   * Reads every finished GPU timer query on every context.
   */
  const collectQueries = (): void =>
  {
    contexts.forEach(collectContext);
  };

  /**
   * Finds the frame the running callback belongs to, starting a new one on the frame's first callback.
   * @param {number} time The frame's begin time, as handed to the callback.
   * @param {number} now When the callback started running.
   * @returns {FrameSample} The frame's sample, which the callback's timing is added to.
   */
  const frameAt = (time: number, now: number): FrameSample =>
  {
    if (current !== null && current.time === time)
    {
      return current;
    }

    // a new frame is a good moment to read whatever earlier frames' queries have finished.
    const frame: FrameSample = { time, firstCallbackAt: now, lastCallbackEnd: now, work: 0, gpu: -1 };
    collectQueries();
    frames.push(frame);
    current = frame;
    return frame;
  };

  /**
   * Runs one animation-frame callback, adding its main-thread time and GPU time to its frame.
   * @param {FrameRequestCallback} callback The page's callback.
   * @param {number} time The frame's begin time.
   */
  const timeCallback = (callback: FrameRequestCallback, time: number): void =>
  {
    // outside a recording the callback runs untouched.
    if (!recording)
    {
      callback(time);
      return;
    }

    const start = performance.now();
    const frame = frameAt(time, start);
    beginQueries(frame);
    try
    {
      callback(time);
    }
    finally
    {
      // read the clock before ending the queries, so the flush is not counted as the page's work.
      const end = performance.now();
      endQueries();
      frame.work += end - start;
      frame.lastCallbackEnd = end;
    }
  };

  // time every animation-frame callback the page asks for.
  window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  {
    return originalRequestFrame(time => timeCallback(callback, time));
  };

  // track every WebGL2 context the page creates, so its GPU time can be measured.
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, contextId: string, options?: unknown)
  {
    const context = originalGetContext.call(this, contextId, options);
    if (contextId === 'webgl2' && context !== null && !contexts.some(tracked => tracked.gl === context))
    {
      const gl = context as WebGL2RenderingContext;
      contexts.push({ gl, timer: gl.getExtension('EXT_disjoint_timer_query_webgl2'), active: null, pending: [] });
    }

    return context;
  } as typeof HTMLCanvasElement.prototype.getContext;

  /**
   * Records one pointer event, before the page's own handlers see it.
   * @param {PointerEvent} event The event.
   */
  const recordInput = (event: PointerEvent): void =>
  {
    if (!recording)
    {
      return;
    }

    const coalesced = Math.max(1, event.getCoalescedEvents().length);
    inputs.push({ type: event.type, timeStamp: event.timeStamp, handledAt: performance.now(), coalesced });
  };

  // capture on the window, so the recorder sees each event before any handler the page added.
  [ 'pointerdown', 'pointermove', 'pointerup' ].forEach(type =>
  {
    window.addEventListener(type, recordInput as EventListener, { capture: true, passive: true });
  });

  /**
   * Keeps the browser's Event Timing entries, which carry its own input-to-next-paint measure.
   * @param {PerformanceEntryList} entries The entries the observer delivered.
   */
  const keepEventTimings = (entries: PerformanceEntryList): void =>
  {
    if (!collectingEventTimings)
    {
      return;
    }

    (entries as PerformanceEventTiming[]).forEach(entry =>
    {
      const { name, startTime, processingStart, processingEnd, duration } = entry;
      const { interactionId } = entry as PerformanceEventTiming & { interactionId: number };
      eventTimings.push({ name, startTime, processingStart, processingEnd, duration, interactionId });
    });
  };

  // 16 ms is the lowest threshold the browser allows, so faster events are never reported.
  const eventObserver = new PerformanceObserver(list => keepEventTimings(list.getEntries()));
  eventObserver.observe({ type: 'event', durationThreshold: 16, buffered: false } as PerformanceObserverInit);

  /**
   * Requests frames for as long as the recording runs, so frames are seen even when the page is idle.
   */
  const pump = (): void =>
  {
    if (recording)
    {
      window.requestAnimationFrame(pump);
    }
  };

  /**
   * Clears anything recorded before and starts recording.
   */
  const start = (): void =>
  {
    frames = [];
    inputs = [];
    eventTimings = [];
    current = null;
    recording = true;
    collectingEventTimings = true;
    window.requestAnimationFrame(pump);
  };

  /**
   * Stops recording, waits a few frames for outstanding GPU timings, and hands everything over.
   * @returns {Promise<Recording>} Everything recorded.
   */
  const stop = (): Promise<Recording> =>
  {
    recording = false;
    current = null;

    return new Promise(resolve =>
    {
      let polls = 0;
      const poll = (): void =>
      {
        collectQueries();
        polls += 1;

        // results lag the GPU by a frame or two; give up after two seconds' worth of frames.
        const waiting = contexts.some(tracked => tracked.pending.length > 0 && !tracked.gl.isContextLost());
        if (waiting && polls < 120)
        {
          originalRequestFrame(poll);
          return;
        }

        // take whatever Event Timing entries are still queued, then stop collecting them.
        keepEventTimings(eventObserver.takeRecords());
        collectingEventTimings = false;

        const timerQuery = contexts.some(tracked => tracked.timer !== null);
        resolve({ frames, inputs, eventTimings, contexts: contexts.length, timerQuery });
      };

      originalRequestFrame(poll);
    });
  };

  window.__frameRecorder = { start, stop };
};

/**
 * Installs the recorder into a page. Call it before the page navigates, since it runs ahead of page
 * scripts only from the next navigation on.
 * @param {Page} page The page to record.
 */
const addFrameRecorder = async (page: Page): Promise<void> =>
{
  await page.addInitScript(installFrameRecorder);
};

/**
 * Starts recording in a page that has the recorder installed.
 * @param {Page} page The page to record.
 */
const startRecording = async (page: Page): Promise<void> =>
{
  await page.evaluate(() => window.__frameRecorder.start());
};

/**
 * Stops recording in a page and hands back everything it recorded.
 * @param {Page} page The page being recorded.
 * @returns {Promise<Recording>} Everything recorded since the recording started.
 */
const stopRecording = async (page: Page): Promise<Recording> =>
{
  return page.evaluate(() => window.__frameRecorder.stop());
};

export { addFrameRecorder, installFrameRecorder, startRecording, stopRecording };

export type { FrameRecorderApi, Recording };
