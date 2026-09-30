import type { DocumentKey } from '../model/documentKeys.ts';
import type { Patch } from '../model/patches.ts';
import type { HistoryKey } from './historyKeys.ts';

/**
 * One patch, addressed to the document it changes.
 */
type StepEntry = {
  readonly document: DocumentKey;
  readonly patch: Patch;
};

/**
 * One undoable step: a named group of patches, possibly across several documents, recorded in every history
 * it belongs to.
 *
 * A step in more than one history is a transaction (a door pair touches two maps; a blueprint propagating
 * touches the blueprint and every map with a copy), and it undoes as one step from any of them. A step is
 * always in the same state in all of its histories: done in all, undone in all, or gone from all.
 *
 * Steps are plain data, so they travel between windows and move with a torn-out panel intact.
 */
type HistoryStep = {
  /**
   * Unique across every window: the making window's client id and a counter.
   */
  readonly id: string;

  /**
   * What the history panel lists, such as "Paint" or "Place door pair".
   */
  readonly label: string;

  /**
   * Every history the step is recorded in.
   */
  readonly histories: readonly HistoryKey[];

  /**
   * The patches, in the order they were applied; undo applies their inverses in reverse.
   */
  readonly entries: readonly StepEntry[];

  /**
   * The client id of the window that made the step.
   */
  readonly origin: string;

  /**
   * When the step was committed, in epoch milliseconds.
   */
  readonly at: number;
};

/**
 * The version each touched document stood at just before an operation, which is how another window checks it
 * is applying the operation to the same state the maker saw.
 */
type DocumentVersions = Readonly<Partial<Record<DocumentKey, number>>>;

/**
 * Lists the documents a step touches, each once, in first-touched order.
 * @param {HistoryStep} step The step.
 * @returns {DocumentKey[]} The documents.
 */
const documentsOfStep = (step: HistoryStep): DocumentKey[] =>
{
  return [ ...new Set(step.entries.map(entry => entry.document)) ];
};

export { documentsOfStep };
export type { DocumentVersions, HistoryStep, StepEntry };
