import type { DocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { Patch } from '../model/patches.ts';
import type { DocumentSnapshot } from './DocumentHub.ts';
import { homeDocumentOf, type HistoryKey } from './historyKeys.ts';

/**
 * One patch, addressed to the document it changes.
 */
type StepEntry = {
  readonly document: DocumentKey;
  readonly patch: Patch;
};

/**
 * A whole file a step creates or removes beside its patches, which is what the map tree does when it creates,
 * deletes, pastes or duplicates a map: the map's row changes by patch, and its file appears or goes. {@code before}
 * is the file's content before the step and {@code after} its content after, null meaning there is no file.
 *
 * The hub records these with the step and never performs them, and they are not among the documents the step
 * touches: a deleted map is not held anywhere, and undoing its deletion must not wait for it to be. Whoever moves
 * such a step performs its files, after checking each one still holds what the step left there.
 *
 * A side may also carry the file's exact text, when the step read it: putting the file back then writes those very
 * bytes, so a delete that is undone leaves the file exactly as it was, key order and spelling included, where its
 * content alone would come back in the server's layout.
 *
 * The before side may also carry the copy of the document the window held when the step was made, histories and
 * unsaved edits included ({@code beforeHeld}). The file is what the disk had; the held copy is what the author was
 * working on. Putting the file back then brings that copy back too, so undoing the delete of a map being edited
 * returns it with its own undo history, and with its unsaved edits still unsaved rather than written to disk.
 *
 * Either side of a map's file may also carry its placements of blueprints as the record on disk holds them beside that
 * file ({@code beforePlacements}, {@code afterPlacements}): its entry in the record, or null for none. They go to disk
 * whenever the file does, so the record describes the maps on disk; a side that does not say leaves the record alone.
 */
type FileEffect = {
  readonly document: DocumentKey;
  readonly before: JsonValue | null;
  readonly after: JsonValue | null;
  readonly beforeText?: string;
  readonly afterText?: string;
  readonly beforeHeld?: DocumentSnapshot;
  readonly beforePlacements?: JsonValue;
  readonly afterPlacements?: JsonValue;
};

/**
 * One undoable step: a named group of patches, possibly across several documents, recorded in every history
 * it belongs to.
 *
 * A step in more than one history is a transaction (a door pair touches two maps; a blueprint propagating
 * touches the blueprint and every map with a copy), and it undoes as one step from any of them. A step is
 * either applied or not: while applied it is in the done list of every history it belongs to; once undone it
 * stays redoable from each of its histories until that history records something new.
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
   * The whole files the step creates or removes, present only on a step that has any.
   */
  readonly files?: readonly FileEffect[];

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
 * The latest operation each touched document had seen just before an operation, by id: how another window checks
 * it is applying the operation to the very state the maker saw, and not merely one of the same age.
 */
type DocumentHeads = Readonly<Partial<Record<DocumentKey, string>>>;

/**
 * Lists the documents a step's patches change, each once, in first-touched order.
 * @param {HistoryStep} step The step.
 * @returns {DocumentKey[]} The documents.
 */
const documentsOfStep = (step: HistoryStep): DocumentKey[] =>
{
  return [ ...new Set(step.entries.map(entry => entry.document)) ];
};

/**
 * Lists every document an operation on a step touches: the ones its patches change, and the ones its histories
 * live on, since a history is part of its document's state.
 * @param {HistoryStep} step The step.
 * @returns {DocumentKey[]} The documents.
 */
const documentsTouchedBy = (step: HistoryStep): DocumentKey[] =>
{
  return [ ...new Set([ ...documentsOfStep(step), ...step.histories.map(homeDocumentOf) ]) ];
};

export { documentsOfStep, documentsTouchedBy };
export type { DocumentHeads, FileEffect, HistoryStep, StepEntry };
