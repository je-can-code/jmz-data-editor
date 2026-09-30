/**
 * The frame budget at 60 frames a second, in milliseconds.
 */
const FRAME_BUDGET_MS = 1000 / 60;

/**
 * What the speed script reads back from a renderer: how long frames took over a stretch of interaction.
 */
type FrameTimings = {
  readonly frames: number;
  readonly averageMs: number;
  readonly p95Ms: number;
  readonly worstMs: number;
  readonly overBudget: number;
};

/**
 * Keeps the most recent frame durations and sums them up. A renderer records one duration per frame; the speed
 * script resets it, drives an interaction, and fails when the summary breaks a budget.
 */
class FrameTimeRecorder
{
  #capacity: number;

  #samples: number[] = [];

  /**
   * @param {number} capacity How many recent frames to keep.
   */
  constructor(capacity = 600)
  {
    this.#capacity = capacity;
  }

  /**
   * Notes one frame's duration.
   * @param {number} milliseconds How long the frame took.
   */
  record(milliseconds: number): void
  {
    this.#samples.push(milliseconds);
    if (this.#samples.length > this.#capacity)
    {
      this.#samples.shift();
    }
  }

  /**
   * Forgets every frame so far.
   */
  reset(): void
  {
    this.#samples = [];
  }

  /**
   * Sums up the frames kept.
   * @returns {FrameTimings} The summary; all zeros before any frame.
   */
  summary(): FrameTimings
  {
    const frames = this.#samples.length;
    if (frames === 0)
    {
      return { frames: 0, averageMs: 0, p95Ms: 0, worstMs: 0, overBudget: 0 };
    }

    const sorted = [ ...this.#samples ].sort((left, right) => left - right);
    const total = sorted.reduce((sum, sample) => sum + sample, 0);
    const p95Index = Math.min(frames - 1, Math.ceil(frames * 0.95) - 1);

    return {
      frames,
      averageMs: total / frames,
      p95Ms: sorted[p95Index],
      worstMs: sorted[frames - 1],
      overBudget: sorted.filter(sample => sample > FRAME_BUDGET_MS).length,
    };
  }
}

export { FRAME_BUDGET_MS, FrameTimeRecorder };
export type { FrameTimings };
