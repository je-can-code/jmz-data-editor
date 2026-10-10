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
 * What one document's file takes for a step where the file differs from the document: a map holding unsaved edits when a
 * blueprint's change reached it, whose copies on disk are not the ones it holds. The document takes the step's entries
 * on top of its unsaved edits; the file takes these, made against what the file held, and none at all when nothing the
 * step changes was in the file yet. Whoever writes the step to disk writes these in place of the document's entries.
 *
 * A move that leaves parts of a step in a document under edits made since says here too what that document's file took
 * for the move, judged against the file alone: the parts left whose edits are not on disk go with the rest in the file,
 * which the document's own entries, holding what moved in the document alone, cannot say (see stepParts' fileShareOf).
 */
type FileVersion = {
  readonly document: DocumentKey;
  readonly patches: readonly Patch[];
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
   * The documents the step changes on disk alone, present only on a step that has any: no window held them when it was
   * made, as a map nobody has open holding a copy of a blueprint the step changed. Their patches sit among the entries
   * like any other's, made against their files; no window needs to hold them to move the step, and whoever writes the
   * step writes them to their files, while a window holding one by then changes it in place.
   */
  readonly through?: readonly DocumentKey[];

  /**
   * What the files of documents held with unsaved edits take in place of the documents' own entries (see
   * {@link FileVersion}), present only on a step that has any.
   */
  readonly fileVersions?: readonly FileVersion[];

  /**
   * The documents whose patches follow the step's own change rather than being made for their own sake, present only on a
   * step that has any: the maps a blueprint's change reached, whose copies follow their blueprint. Undoing or redoing the
   * step moves each of its patches on these only where nothing changed the same data since, and leaves the rest as they
   * stand rather than refusing, the way a cell painted over by hand keeps its paint when the change is made: a copy changed
   * since keeps that change. Every other document the step changes moves with it whole, or refuses it.
   */
  readonly followers?: readonly DocumentKey[];

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

/**
 * Reports whether a step changes a document on disk alone (see {@link HistoryStep.through}).
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The document.
 * @returns {boolean} True when the step writes the document through.
 */
const writesThrough = (step: HistoryStep, key: DocumentKey): boolean =>
{
  return step.through !== undefined && step.through.includes(key);
};

/**
 * Reports whether a document follows a step's own change (see {@link HistoryStep.followers}).
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The document.
 * @returns {boolean} True when the step's patches on it may be left where something changed them since.
 */
const isFollowerOf = (step: HistoryStep, key: DocumentKey): boolean =>
{
  return step.followers !== undefined && step.followers.includes(key);
};

export { documentsOfStep, documentsTouchedBy, isFollowerOf, writesThrough };
export type { DocumentHeads, FileEffect, FileVersion, HistoryStep, StepEntry };
