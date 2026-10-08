import type { DocumentHub } from '../history/DocumentHub.ts';
import { createDocument } from '../model/createDocument.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { isJsonObject } from '../model/json.ts';
import { invertPatch, PatchConflictError, type Patch } from '../model/patches.ts';
import type { HistoryDirection, MoveGuard } from '../workspace/HistoryRouter.ts';
import type { BlueprintCopyCounter } from './blueprintCopies.ts';
import { copiesKeepIt } from './blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT } from './blueprints.ts';

/**
 * What the guard reads copies from: the window's counter, which it starts when nothing has asked for a count yet.
 */
type CopiesSource = Pick<BlueprintCopyCounter, 'start' | 'countOf'>;

/**
 * Lists the ids of the blueprints a copy of the blueprints document holds.
 * @param {EditorDocument} document The blueprints document, in its stored form.
 * @returns {string[]} The ids; none for a document holding no list of blueprints.
 */
const blueprintIdsIn = (document: EditorDocument): string[] =>
{
  const kept = document.valueAt([ 'data', 'blueprints' ]);
  return isJsonObject(kept)
    ? Object.keys(kept)
    : [];
};

/**
 * Reads what the author calls a blueprint the document holds, for the words of a refusal.
 * @param {EditorDocument} document The blueprints document, in its stored form.
 * @param {string} blueprintId The blueprint.
 * @returns {string} Its name, or its id when its entry carries no name.
 */
const nameIn = (document: EditorDocument, blueprintId: string): string =>
{
  const name = document.valueAt([ 'data', 'blueprints', blueprintId, 'name' ]);
  return typeof name === 'string'
    ? name
    : blueprintId;
};

/**
 * Works out which blueprints moving a step would take away: those the document holds now and would hold no longer, its
 * patches on the blueprints undone newest first, or redone in order, on a copy, exactly as the hub would move them.
 * @param {EditorDocument} document The blueprints document as it stands.
 * @param {readonly Patch[]} patches The step's patches on it, in the order they were made.
 * @param {HistoryDirection} direction Undo or redo.
 * @returns {string[] | null} The ids, none when the step takes none away; null when its patches do not fit the document
 * as it stands, which the hub refuses on its own.
 */
const blueprintsTakenAway = (document: EditorDocument, patches: readonly Patch[], direction: HistoryDirection): string[] | null =>
{
  const after = createDocument(BLUEPRINTS_DOCUMENT, document.toJson());
  const moving = direction === 'backward'
    ? [ ...patches ].reverse().map(invertPatch)
    : patches;
  try
  {
    moving.forEach(patch => after.apply(patch));
  }
  catch (error)
  {
    if ((error instanceof PatchConflictError) === false)
    {
      throw error;
    }

    return null;
  }

  const kept = new Set(blueprintIdsIn(after));
  return blueprintIdsIn(document).filter(blueprintId => kept.has(blueprintId) === false);
};

/**
 * Builds the guard every undo, redo and history jump passes before it moves a step: a step whose move would take away a
 * blueprint something is still a copy of is refused, in the very words a delete of it is refused in, since that is what
 * the move would be. Undoing a blueprint's save takes it away, and so does redoing its delete, or undoing a change made
 * to the blueprints' file outside the editor that brought it. Whatever is a copy of it keeps naming it, so it stays
 * while it has copies on any map, and while its copies are still being counted, or cannot be, since it could have some
 * nobody has counted yet; which is why a guard that finds the copies not counted yet starts the counting. A step that
 * touches no blueprint, or takes none away, as a rename's undo does, passes.
 * @param {DocumentHub} hub The window's documents.
 * @param {CopiesSource} copies The window's count of every blueprint's copies.
 * @param {(mapId: number) => string} mapName Names a map as the author knows it.
 * @returns {MoveGuard} The guard.
 */
const blueprintsKeptGuard = (hub: DocumentHub, copies: CopiesSource, mapName: (mapId: number) => string): MoveGuard =>
{
  return (step, direction) =>
  {
    const patches = step.entries.filter(entry => entry.document === BLUEPRINTS_DOCUMENT).map(entry => entry.patch);
    if (patches.length === 0)
    {
      return null;
    }

    // the hub moves a step only with every document it touches held, so the blueprints are held here.
    const document = hub.document(BLUEPRINTS_DOCUMENT);
    const taken = blueprintsTakenAway(document, patches, direction) ?? [];
    if (taken.length > 0)
    {
      copies.start();
    }

    // the first blueprint taken away that copies still name says why.
    const reasons = taken.map(blueprintId => copiesKeepIt(nameIn(document, blueprintId), copies.countOf(blueprintId), mapName));
    return reasons.find(reason => reason !== null) ?? null;
  };
};

export { blueprintsKeptGuard };
export type { CopiesSource };
