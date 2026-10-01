/**
 * The speed budgets from the plan's D3, as the speed script judges them, and the verdicts it reaches. Pure, so the
 * rules can be read and tested apart from the browser.
 */
import { countDroppedFrames, REFRESH_60_HZ, summarize } from './frameStats.ts';
import type { FrameSample, InputSample, RunSummary, Summary, Verdict } from './frameStats.ts';

/**
 * The budgets, in milliseconds unless named otherwise.
 */
const BUDGETS = {
  /** Panning and zooming, the whole map on screen included, never drop a frame. */
  cameraDroppedFrames: 0,

  /** Every frame that draws a brush stroke's input costs less than one refresh. */
  strokeFrameMs: REFRESH_60_HZ,

  /** No frame is dropped between the stroke's first input and its last. */
  strokeDroppedFrames: 0,

  /** A map opens in under half a second cold: from navigation start to the first frame that showed it complete. */
  coldOpenMs: 500,

  /**
   * And near-instantly after that: reopening a map this window already holds. The plan gives no number; 100 ms (six
   * frames) is this script's reading of "near-instantly".
   */
  warmOpenMs: 100,

  /**
   * A map panel brought back from behind another tab, whose view let its GPU context go while hidden, draws as fast as
   * a warm open: from being shown to its first frame drawn on the context it got back.
   */
  shownAgainMs: 100,

  /**
   * An event window opens in under half a second: from the double-click on the event to the first frame of the
   * event's own window showing it, the map's live copy taken from the window holding it.
   */
  eventWindowOpenMs: 500,
} as const;

/**
 * One stroke input matched to the frame that drew it.
 */
type StrokeFrame = {
  readonly input: InputSample;
  readonly frame: FrameSample;
  readonly cost: number;
};

/**
 * What one stroke came to.
 */
type StrokeResult = {
  readonly inputs: number;
  readonly matched: number;
  readonly frames: number;
  readonly dropped: number;
  readonly cost: Summary;
  readonly work: Summary;
  readonly gpu: Summary;
  readonly verdict: Verdict;
};

/**
 * Matches each stroke input to the first frame whose callbacks began after the page handled it: the renderer draws
 * pending edits in its next frame, so that frame is the one that drew the input.
 * @param {readonly InputSample[]} inputs The stroke's pointer moves, in order.
 * @param {readonly FrameSample[]} frames The recorded frames, in order.
 * @returns {StrokeFrame[]} One match per input that some frame came after.
 */
const matchStrokeFrames = (inputs: readonly InputSample[], frames: readonly FrameSample[]): StrokeFrame[] =>
{
  const matches: StrokeFrame[] = [];
  inputs.forEach(input =>
  {
    const frame = frames.find(candidate => candidate.firstCallbackAt >= input.handledAt);
    if (frame !== undefined)
    {
      matches.push({ input, frame, cost: frame.work + Math.max(0, frame.gpu) });
    }
  });

  return matches;
};

/**
 * What the page's pen reports it did during a stroke: how many pointer events it painted, and how many frames
 * rebuilt chunks. A stroke whose pen never touched the map would otherwise pass on frames with nothing to do.
 */
type PaintProof = {
  readonly steps: number;
  readonly redrawnFrames: number;
};

/**
 * Judges a brush stroke: every input painted, every frame that drew an input under one refresh, the stroke's frames
 * really redrawn, and no frame dropped between the frame that drew the first input and the frame that drew the last.
 * @param {readonly InputSample[]} inputs The stroke's pointer moves.
 * @param {readonly FrameSample[]} frames The recorded frames.
 * @param {PaintProof} proof What the pen reports it did.
 * @returns {StrokeResult} What the stroke came to.
 */
const judgeStrokeFrames = (inputs: readonly InputSample[], frames: readonly FrameSample[], proof: PaintProof): StrokeResult =>
{
  const matches = matchStrokeFrames(inputs, frames);
  const drawing = [ ...new Set(matches.map(match => match.frame)) ];
  const first = drawing.length > 0 ? frames.indexOf(drawing[0]) : -1;
  const last = drawing.length > 0 ? frames.indexOf(drawing[drawing.length - 1]) : -1;
  const during = first >= 0 ? frames.slice(first, last + 1) : [];
  const intervals = during.slice(1).map((frame, index) => frame.time - during[index].time);
  const dropped = countDroppedFrames(intervals);
  const cost = summarize(drawing.map(frame => frame.work + Math.max(0, frame.gpu)));

  const reasons: string[] = [];
  if (matches.length === 0)
  {
    reasons.push('no stroke input was matched to a frame');
  }

  // a stroke that never painted proves nothing about painting.
  if (proof.steps < inputs.length)
  {
    reasons.push(`the pen painted ${proof.steps} of ${inputs.length} inputs`);
  }

  if (proof.redrawnFrames < drawing.length)
  {
    reasons.push(`only ${proof.redrawnFrames} of ${drawing.length} stroke frames redrew any chunk`);
  }

  if (cost.max >= BUDGETS.strokeFrameMs)
  {
    reasons.push(`worst stroke frame ${cost.max.toFixed(2)} ms`);
  }

  if (dropped > BUDGETS.strokeDroppedFrames)
  {
    reasons.push(`${dropped} frames dropped mid-stroke`);
  }

  return {
    inputs: inputs.length,
    matched: matches.length,
    frames: drawing.length,
    dropped,
    cost,
    work: summarize(drawing.map(frame => frame.work)),
    gpu: summarize(drawing.filter(frame => frame.gpu >= 0).map(frame => frame.gpu)),
    verdict: { pass: reasons.length === 0, reasons },
  };
};

/**
 * What an interaction with events came to: clicking events, drawing a box around them, or dragging them.
 */
type InteractionResult = {
  readonly inputs: number;
  readonly matched: number;
  readonly frames: number;
  readonly dropped: number;
  readonly cost: Summary;
  readonly work: Summary;
  readonly verdict: Verdict;
};

/**
 * What the page reports an interaction did, so one that never reached the events cannot pass on idle frames.
 */
type InteractionProof = {
  readonly ok: boolean;
  readonly reason: string;
};

/**
 * Judges an interaction with events, which must never drop a frame (D3: "selecting, box-selecting and dragging events
 * on Map361 never drops a frame"): every frame that drew an input under one refresh, no frame dropped between the frame
 * that drew the first input and the frame that drew the last, and the page's proof that the interaction happened.
 * @param {readonly InputSample[]} inputs The interaction's pointer events.
 * @param {readonly FrameSample[]} frames The recorded frames.
 * @param {InteractionProof} proof What the page reports the interaction did.
 * @returns {InteractionResult} What the interaction came to.
 */
const judgeInteractionFrames = (
  inputs: readonly InputSample[], frames: readonly FrameSample[], proof: InteractionProof): InteractionResult =>
{
  const matches = matchStrokeFrames(inputs, frames);
  const drawing = [ ...new Set(matches.map(match => match.frame)) ];
  const first = drawing.length > 0 ? frames.indexOf(drawing[0]) : -1;
  const last = drawing.length > 0 ? frames.indexOf(drawing[drawing.length - 1]) : -1;
  const during = first >= 0 ? frames.slice(first, last + 1) : [];
  const intervals = during.slice(1).map((frame, index) => frame.time - during[index].time);
  const dropped = countDroppedFrames(intervals);
  const cost = summarize(drawing.map(frame => frame.work + Math.max(0, frame.gpu)));

  const reasons: string[] = [];
  if (matches.length === 0)
  {
    reasons.push('no input was matched to a frame');
  }

  if (proof.ok === false)
  {
    reasons.push(proof.reason);
  }

  if (cost.max >= REFRESH_60_HZ)
  {
    reasons.push(`worst frame ${cost.max.toFixed(2)} ms`);
  }

  if (dropped > 0)
  {
    reasons.push(`${dropped} frames dropped`);
  }

  return {
    inputs: inputs.length,
    matched: matches.length,
    frames: drawing.length,
    dropped,
    cost,
    work: summarize(drawing.map(frame => frame.work)),
    verdict: { pass: reasons.length === 0, reasons },
  };
};

/**
 * Judges a camera path: the frame clock never ticked without a new frame.
 * @param {RunSummary} run The recorded stretch.
 * @returns {Verdict} The verdict.
 */
const judgeCameraPath = (run: RunSummary): Verdict =>
{
  if (run.frames < 2)
  {
    return { pass: false, reasons: [ 'fewer than two frames were recorded' ] };
  }

  return run.droppedFrames > BUDGETS.cameraDroppedFrames
    ? { pass: false, reasons: [ `${run.droppedFrames} dropped frames (longest interval ${run.intervals.max.toFixed(1)} ms)` ] }
    : { pass: true, reasons: [] };
};

/**
 * Judges an open against a budget.
 * @param {number} ms How long the open took, or a negative number when it never finished.
 * @param {number} budgetMs The budget.
 * @param {string} what Which open, for the reason.
 * @returns {Verdict} The verdict.
 */
const judgeOpen = (ms: number, budgetMs: number, what: string): Verdict =>
{
  if (ms < 0)
  {
    return { pass: false, reasons: [ `the ${what} never finished` ] };
  }

  return ms < budgetMs
    ? { pass: true, reasons: [] }
    : { pass: false, reasons: [ `${what} took ${ms.toFixed(0)} ms, over ${budgetMs} ms` ] };
};

export { BUDGETS, judgeCameraPath, judgeInteractionFrames, judgeOpen, judgeStrokeFrames, matchStrokeFrames };
export type { InteractionProof, InteractionResult, PaintProof, StrokeFrame, StrokeResult };
