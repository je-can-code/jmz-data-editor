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
 *
 * Undo and redo invoked here always act on this history's own head: its newest done step, its most recently
 * undone one. A step shared with other histories can also move because one of those was undone or redone, and
 * then it may sit anywhere in this one; {@link markUndone} and {@link markRedone} take it from wherever it is, so
 * this history stays a truthful list of which of its steps are applied.
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
   * Notes a step as undone: taken out of the done list wherever it sits, and made the next step to redo.
   * @param {HistoryStep} step The step.
   */
  markUndone(step: HistoryStep): void
  {
    this.#done = this.#done.filter(each => each.id !== step.id);
    this.#undone = [ ...this.#undone.filter(each => each.id !== step.id), step ];
  }

  /**
   * Notes a step as redone: taken out of the redo list wherever it sits (or never there, when this history had
   * moved on from it), and made the newest done step, since its patches now apply on top of everything here.
   * @param {HistoryStep} step The step.
   */
  markRedone(step: HistoryStep): void
  {
    this.#undone = this.#undone.filter(each => each.id !== step.id);
    this.#done = [ ...this.#done.filter(each => each.id !== step.id), step ];
  }

  /**
   * Puts a step in the place of the one with its id, wherever that sits, as the part of a step that moved takes the whole
   * step's place once a move left the rest (see DocumentHub's HistoryCheck). A history without that step is left as it is.
   * @param {HistoryStep} step The step.
   */
  replace(step: HistoryStep): void
  {
    this.#done = this.#done.map(each => (each.id === step.id ? step : each));
    this.#undone = this.#undone.map(each => (each.id === step.id ? step : each));
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
