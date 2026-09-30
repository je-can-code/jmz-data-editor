/**
 * The arithmetic behind the speed script's verdicts: percentiles, dropped frames, and which frame drew a
 * given input. Everything here is pure, so it runs outside the browser on what the page recorded, and it
 * is what decides whether a speed budget passed.
 *
 * Times are milliseconds on the page's own clock (`performance.now()` and animation-frame timestamps).
 */

/**
 * One animation frame, as the frame recorder saw it inside the page.
 */
type FrameSample = {
  /** The frame's begin time, as handed to every animation-frame callback in the frame. */
  time: number;

  /** When the first animation-frame callback of the frame started running. */
  firstCallbackAt: number;

  /** When the last animation-frame callback of the frame finished running. */
  lastCallbackEnd: number;

  /** Main-thread time spent inside animation-frame callbacks during the frame. */
  work: number;

  /** GPU time of the WebGL work the frame's callbacks issued, or -1 when it could not be measured. */
  gpu: number;
};

/**
 * One pointer event the page received while recording.
 */
type InputSample = {
  /** The event type: pointerdown, pointermove or pointerup. */
  type: string;

  /** The event's own timestamp: when the browser received the input. */
  timeStamp: number;

  /** When the page's listener saw the event, which is after any queueing inside the renderer. */
  handledAt: number;

  /** How many hardware events the browser folded into this one. */
  coalesced: number;
};

/**
 * One entry from the browser's Event Timing API: its own input-to-next-paint measure, rounded to 8 ms.
 */
type EventTimingSample = {
  /** The event type, such as pointerdown. */
  name: string;

  /** The event's timestamp. */
  startTime: number;

  /** When the event's handlers started running. */
  processingStart: number;

  /** When the event's handlers finished running. */
  processingEnd: number;

  /** From the event's timestamp to the next frame presented after its handlers ran, rounded to 8 ms. */
  duration: number;

  /** The interaction this event belongs to, or 0 when it is not part of one. */
  interactionId: number;
};

/**
 * The distribution of one measured quantity.
 */
type Summary = {
  /** How many values were measured. */
  count: number;

  /** The arithmetic mean. */
  mean: number;

  /** The median, by nearest rank. */
  p50: number;

  /** The 95th percentile, by nearest rank. */
  p95: number;

  /** The 99th percentile, by nearest rank. */
  p99: number;

  /** The largest value. */
  max: number;
};

/**
 * What one recorded stretch of frames came to.
 */
type RunSummary = {
  /** Frames measured after the warm-up was dropped. */
  frames: number;

  /** Frames per second across the measured stretch. */
  fps: number;

  /** Time between consecutive frame begins. */
  intervals: Summary;

  /** Main-thread time in animation-frame callbacks, per frame. */
  work: Summary;

  /** GPU time per frame, over the frames where it could be measured. */
  gpu: Summary;

  /** Main-thread time plus GPU time per frame: a serialized upper bound on what one frame costs. */
  frameCost: Summary;

  /** Refresh ticks that passed without a new frame. */
  droppedFrames: number;
};

/**
 * One input matched to the frame that drew it.
 */
type StrokeSample = {
  /** The input. */
  input: InputSample;

  /** The first frame whose callbacks ran after the input was handled. */
  frame: FrameSample;

  /** From the input's timestamp until that frame's callbacks began: waiting on the frame clock. */
  wait: number;

  /** That frame's main-thread time plus its GPU time. */
  cost: number;

  /** From the input's timestamp until that frame's callbacks and GPU work were done, as an upper bound. */
  toDrawn: number;
};

/**
 * A pass or a fail, with the reasons for a fail.
 */
type Verdict = {
  /** Whether the budget held. */
  pass: boolean;

  /** One line per way the budget failed; empty on a pass. */
  reasons: string[];
};

/**
 * Options for summarizing a stretch of frames.
 */
type SummarizeOptions = {
  /** Frames dropped from the start, where shader compiles and texture uploads land. */
  warmup?: number;

  /** The refresh interval the frame clock ticks at. */
  refreshMs?: number;
};

/**
 * The refresh interval of a 60 Hz display, which is also the interval headless chromium's frame clock
 * ticks at when nothing overrides it.
 */
const REFRESH_60_HZ = 1000 / 60;

/**
 * The summary of nothing, returned when there were no values to measure.
 */
const EMPTY_SUMMARY: Summary = {
  count: 0,
  mean: 0,
  p50: 0,
  p95: 0,
  p99: 0,
  max: 0,
};

/**
 * Picks a percentile from values already sorted ascending, by nearest rank.
 * @param {number[]} sorted The values, sorted ascending; never empty.
 * @param {number} fraction The percentile as a fraction, such as 0.95.
 * @returns {number} The value at that rank.
 */
const nearestRank = (sorted: number[], fraction: number): number =>
{
  // nearest rank: the smallest value with at least this fraction of values at or below it.
  const rank = Math.ceil(fraction * sorted.length);

  // clamp so a fraction of 0 still names the first value.
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index];
};

/**
 * Summarizes a list of values into their count, mean, percentiles and maximum.
 * @param {number[]} values The measured values, in any order.
 * @returns {Summary} Their distribution, or all zeroes when there were none.
 */
const summarize = (values: number[]): Summary =>
{
  // nothing measured summarizes to zeroes rather than to NaN.
  if (values.length === 0)
  {
    return { ...EMPTY_SUMMARY };
  }

  // sort a copy, so the caller's array keeps its order.
  const sorted = [ ...values ].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);

  return {
    count: sorted.length,
    mean: total / sorted.length,
    p50: nearestRank(sorted, 0.5),
    p95: nearestRank(sorted, 0.95),
    p99: nearestRank(sorted, 0.99),
    max: sorted[sorted.length - 1],
  };
};

/**
 * Counts the refresh ticks one frame interval skipped. The frame clock ticks at a fixed interval, so an
 * interval of two ticks means one tick passed with no new frame: one dropped frame.
 * @param {number} interval The time between two consecutive frame begins.
 * @param {number} refreshMs The refresh interval the frame clock ticks at.
 * @returns {number} How many ticks passed without a frame; 0 for an on-time frame.
 */
const missedTicks = (interval: number, refreshMs: number): number =>
{
  // round to whole ticks, since scheduling jitter moves a frame begin by a fraction of a millisecond.
  const ticks = Math.round(interval / refreshMs);
  return Math.max(0, ticks - 1);
};

/**
 * Counts dropped frames across a list of frame intervals.
 * @param {number[]} intervals The times between consecutive frame begins.
 * @param {number} refreshMs The refresh interval the frame clock ticks at.
 * @returns {number} The total number of ticks that passed without a frame.
 */
const countDroppedFrames = (intervals: number[], refreshMs: number = REFRESH_60_HZ): number =>
{
  // each interval contributes the ticks it skipped.
  return intervals.reduce((sum, interval) => sum + missedTicks(interval, refreshMs), 0);
};

/**
 * Turns consecutive frame begin times into the intervals between them.
 * @param {FrameSample[]} frames The frames, in the order they ran.
 * @returns {number[]} One interval fewer than there are frames.
 */
const frameIntervals = (frames: FrameSample[]): number[] =>
{
  // pair each frame with the one before it.
  return frames.slice(1).map((frame, index) => frame.time - frames[index].time);
};

/**
 * Summarizes a recorded stretch of frames.
 * @param {FrameSample[]} samples The frames, in the order they ran.
 * @param {SummarizeOptions} options How many warm-up frames to drop, and the refresh interval.
 * @returns {RunSummary} What the stretch came to.
 */
const summarizeFrames = (samples: FrameSample[], options: SummarizeOptions = {}): RunSummary =>
{
  const { warmup = 0, refreshMs = REFRESH_60_HZ } = options;

  // drop the warm-up, where one-off costs would read as dropped frames.
  const frames = samples.slice(warmup);
  const intervals = frameIntervals(frames);
  const span = intervals.reduce((sum, interval) => sum + interval, 0);

  // a frame without a GPU measurement counts toward work but not toward GPU time.
  const measured = frames.filter(frame => frame.gpu >= 0);

  return {
    frames: frames.length,
    fps: span > 0 ? intervals.length / (span / 1000) : 0,
    intervals: summarize(intervals),
    work: summarize(frames.map(frame => frame.work)),
    gpu: summarize(measured.map(frame => frame.gpu)),
    frameCost: summarize(frames.map(frame => frame.work + Math.max(0, frame.gpu))),
    droppedFrames: countDroppedFrames(intervals, refreshMs),
  };
};

/**
 * Matches one input to the frame that drew it: the first frame whose callbacks started after the input
 * was handled. That is only the frame that drew it when the renderer draws pending edits in its next
 * animation-frame callback, which is the renderer's contract.
 * @param {InputSample} input The input.
 * @param {FrameSample[]} frames The frames, in the order they ran.
 * @returns {StrokeSample[]} The match as a one-item list, or an empty list when no frame came after it.
 */
const attributeInput = (input: InputSample, frames: FrameSample[]): StrokeSample[] =>
{
  // the callbacks' start, not the frame's begin time, since input is dispatched after a frame begins.
  const frame = frames.find(candidate => candidate.firstCallbackAt >= input.handledAt);
  if (frame === undefined)
  {
    return [];
  }

  // the GPU time is -1 when it was not measured, which must not shorten the bound.
  const gpu = Math.max(0, frame.gpu);

  return [
    {
      input,
      frame,
      wait: frame.firstCallbackAt - input.timeStamp,
      cost: frame.work + gpu,
      toDrawn: frame.lastCallbackEnd + gpu - input.timeStamp,
    },
  ];
};

/**
 * Matches every input to the frame that drew it, leaving out inputs no recorded frame came after.
 * @param {InputSample[]} inputs The inputs, in the order they arrived.
 * @param {FrameSample[]} frames The frames, in the order they ran.
 * @returns {StrokeSample[]} One match per input that a frame came after.
 */
const attributeInputs = (inputs: InputSample[], frames: FrameSample[]): StrokeSample[] =>
{
  // flatten, so an input with no frame after it simply drops out.
  return inputs.flatMap(input => attributeInput(input, frames));
};

/**
 * Judges the pan and zoom budget: the frame clock never ticked without a new frame.
 * @param {RunSummary} run The recorded stretch of panning or zooming.
 * @param {number} maxDropped How many dropped frames the budget allows.
 * @returns {Verdict} A pass, or a fail naming how many frames were dropped.
 */
const judgeSmoothness = (run: RunSummary, maxDropped: number = 0): Verdict =>
{
  // a run with no frames at all proves nothing, so it cannot pass.
  if (run.frames < 2)
  {
    return { pass: false, reasons: [ 'fewer than two frames were recorded' ] };
  }

  if (run.droppedFrames > maxDropped)
  {
    const worst = run.intervals.max.toFixed(1);
    return { pass: false, reasons: [ `${run.droppedFrames} dropped frames (longest interval ${worst} ms)` ] };
  }

  return { pass: true, reasons: [] };
};

/**
 * Judges the brush budget: every frame that drew a stroke input cost less than one frame.
 * @param {StrokeSample[]} strokes The stroke's inputs, each matched to the frame that drew it.
 * @param {number} budgetMs The most one frame may cost.
 * @returns {Verdict} A pass, or a fail naming the slowest frame.
 */
const judgeStroke = (strokes: StrokeSample[], budgetMs: number = REFRESH_60_HZ): Verdict =>
{
  // a stroke nothing drew proves nothing, so it cannot pass.
  if (strokes.length === 0)
  {
    return { pass: false, reasons: [ 'no stroke input was matched to a frame' ] };
  }

  const over = strokes.filter(stroke => stroke.cost > budgetMs);
  if (over.length > 0)
  {
    const worst = Math.max(...over.map(stroke => stroke.cost)).toFixed(1);
    return { pass: false, reasons: [ `${over.length} stroke frames over ${budgetMs.toFixed(1)} ms (worst ${worst} ms)` ] };
  }

  return { pass: true, reasons: [] };
};

export {
  REFRESH_60_HZ,
  attributeInputs,
  countDroppedFrames,
  judgeSmoothness,
  judgeStroke,
  summarize,
  summarizeFrames,
};

export type {
  EventTimingSample,
  FrameSample,
  InputSample,
  RunSummary,
  StrokeSample,
  Summary,
  SummarizeOptions,
  Verdict,
};
