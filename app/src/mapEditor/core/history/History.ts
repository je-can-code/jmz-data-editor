import type { HistoryKey } from './historyKeys.ts';
import type { HistoryStep } from './HistoryStep.ts';

/**
 * One row of the history panel.
 */
type HistoryRow = {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
};

/**
 * What the history panel draws: every step by name, oldest first, and how many of them are done. Clicking a
 * row jumps to it, the way paint programs do it.
 */
type HistoryView = {
  readonly key: HistoryKey;
  readonly rows: readonly HistoryRow[];
  readonly position: number;
};

/**
 * One undo history: the steps done, oldest first, and the steps undone, with the next to redo last.
 */
class History
{
  readonly key: HistoryKey;

  #done: HistoryStep[] = [];

  #undone: HistoryStep[] = [];

  /**
   * @param {HistoryKey} key The history this is.
   * @param {readonly HistoryStep[]} done The steps done, oldest first.
   * @param {readonly HistoryStep[]} undone The steps undone, next to redo last.
   */
  constructor(key: HistoryKey, done: readonly HistoryStep[] = [], undone: readonly HistoryStep[] = [])
  {
    this.key = key;
    this.#done = [ ...done ];
    this.#undone = [ ...undone ];
  }

  /**
   * The steps done, oldest first.
   * @returns {readonly HistoryStep[]} The steps.
   */
  get done(): readonly HistoryStep[]
  {
    return this.#done;
  }

  /**
   * The steps undone, with the next to redo last.
   * @returns {readonly HistoryStep[]} The steps.
   */
  get undone(): readonly HistoryStep[]
  {
    return this.#undone;
  }

  /**
   * The step an undo here would reverse.
   * @returns {HistoryStep | null} The newest done step, or null when there is none.
   */
  lastDone(): HistoryStep | null
  {
    return this.#done[this.#done.length - 1] ?? null;
  }

  /**
   * The step a redo here would reapply.
   * @returns {HistoryStep | null} The most recently undone step, or null when there is none.
   */
  nextRedo(): HistoryStep | null
  {
    return this.#undone[this.#undone.length - 1] ?? null;
  }

  /**
   * Reports whether a step is anywhere in this history.
   * @param {string} stepId The step's id.
   * @returns {'done' | 'undone' | null} Where it is, or null when it is not here.
   */
  stateOf(stepId: string): 'done' | 'undone' | null
  {
    if (this.#done.some(step => step.id === stepId))
    {
      return 'done';
    }

    return this.#undone.some(step => step.id === stepId)
      ? 'undone'
      : null;
  }

  /**
   * Records a new step. Whatever could be redone can no longer be, so it is dropped and handed back for the
   * caller to drop from every other history it was in.
   * @param {HistoryStep} step The new step.
   * @returns {HistoryStep[]} The steps that can no longer be redone.
   */
  record(step: HistoryStep): HistoryStep[]
  {
    const dropped = this.#undone;
    this.#undone = [];
    this.#done.push(step);
    return dropped;
  }

  /**
   * Moves the newest done step to the redo list.
   * @param {HistoryStep} step The step, which must be the newest done.
   */
  markUndone(step: HistoryStep): void
  {
    if (this.lastDone() !== step)
    {
      throw new Error(`${step.label} is not the newest step in ${this.key}`);
    }

    this.#done.pop();
    this.#undone.push(step);
  }

  /**
   * Moves the next redo step back to the done list.
   * @param {HistoryStep} step The step, which must be the next to redo.
   */
  markRedone(step: HistoryStep): void
  {
    if (this.nextRedo() !== step)
    {
      throw new Error(`${step.label} is not the next step to redo in ${this.key}`);
    }

    this.#undone.pop();
    this.#done.push(step);
  }

  /**
   * Drops a step from wherever it sits.
   * @param {string} stepId The step's id.
   * @returns {boolean} True when the step was here.
   */
  drop(stepId: string): boolean
  {
    const before = this.#done.length + this.#undone.length;
    this.#done = this.#done.filter(step => step.id !== stepId);
    this.#undone = this.#undone.filter(step => step.id !== stepId);
    return this.#done.length + this.#undone.length !== before;
  }

  /**
   * Builds what the history panel draws.
   * @returns {HistoryView} Every step by name, oldest first, with the done ones first.
   */
  view(): HistoryView
  {
    const done = this.#done.map(step => ({ id: step.id, label: step.label, done: true }));
    const undone = [ ...this.#undone ]
      .reverse()
      .map(step => ({ id: step.id, label: step.label, done: false }));

    return { key: this.key, rows: [ ...done, ...undone ], position: done.length };
  }
}

export { History };
export type { HistoryRow, HistoryView };
