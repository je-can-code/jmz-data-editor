import type { DocumentKey } from '../model/documentKeys.ts';
import { invertPatch, type Patch, type PatchPath, type TilesPatch } from '../model/patches.ts';
import type { FileVersion, HistoryStep, StepEntry } from './HistoryStep.ts';
import { patchInterference } from './patchInterference.ts';

/**
 * Which way a step moves: redone, or undone.
 */
type MoveDirection = 'forward' | 'backward';

/**
 * One part of a step an undo or a redo left as it stands, on a document following the step's change (see HistoryStep's
 * followers), because something changed the same data since: a copy of a blueprint whose field was changed by hand after
 * the blueprint's change reached it, say.
 */
type LeftPart = {
  /**
   * The document the part is on.
   */
  readonly document: DocumentKey;

  /**
   * The part, as the step made it: one of its patches, or, of a tiles patch, the cells left.
   */
  readonly patch: Patch;

  /**
   * The newest edit in its way that this window recorded, or null when what stands in its way is a file changed on disk,
   * which no step here recorded.
   */
  readonly by: HistoryStep | null;
};

/**
 * One of a step's patches, as a move of the step comes to on it: the part that moves, and the part left, either of which
 * may be nothing, with the edit in the left part's way.
 */
type EntryPart = {
  readonly document: DocumentKey;
  readonly moving: Patch | null;
  readonly left: Patch | null;
  readonly by: HistoryStep | null;
};

/**
 * One edit that went into a document after a step, or in or out of it since the step's undo, with its patches on that
 * document.
 */
type EditOnDocument = {
  readonly step: HistoryStep;
  readonly patches: readonly Patch[];
};

/**
 * Says how much of a patch the file of a document no window here holds would take now (see DocumentHub's setFileFit).
 */
type FileFit = (key: DocumentKey, patch: Patch) => Patch | null;

/**
 * Splits a tiles patch by its cells.
 * @param {TilesPatch} patch The patch.
 * @param {(index: number) => boolean} keeps Says whether a cell goes in the first part.
 * @returns {[ TilesPatch | null, TilesPatch | null ]} The cells kept and the rest, each null when it has no cell.
 */
const splitTiles = (patch: TilesPatch, keeps: (index: number) => boolean): [ TilesPatch | null, TilesPatch | null ] =>
{
  const kept: TilesPatch = { kind: 'tiles', indices: [], before: [], after: [] };
  const rest: TilesPatch = { kind: 'tiles', indices: [], before: [], after: [] };
  patch.indices.forEach((index, position) =>
  {
    const part = keeps(index) ? kept : rest;
    (part.indices as number[]).push(index);
    (part.before as number[]).push(patch.before[position]);
    (part.after as number[]).push(patch.after[position]);
  });

  return [ kept.indices.length === 0 ? null : kept, rest.indices.length === 0 ? null : rest ];
};

/**
 * The whole of a patch, moving.
 * @param {DocumentKey} document The document it is on.
 * @param {Patch} patch The patch.
 * @returns {EntryPart} The part.
 */
const movesWhole = (document: DocumentKey, patch: Patch): EntryPart =>
{
  return { document, moving: patch, left: null, by: null };
};

/**
 * The whole of a patch, left.
 * @param {DocumentKey} document The document it is on.
 * @param {Patch} patch The patch.
 * @param {HistoryStep | null} by The edit in its way, or null for a file changed on disk.
 * @returns {EntryPart} The part.
 */
const leftWhole = (document: DocumentKey, patch: Patch, by: HistoryStep | null): EntryPart =>
{
  return { document, moving: null, left: patch, by };
};

/**
 * Works out what a move of a step comes to on one of its tiles patches on a document held here: the cells no edit in the
 * way painted move, and those one did stay, with the newest edit that painted any of them; a resize in the way gives every
 * cell a new place, so nothing moves.
 * @param {DocumentKey} document The document.
 * @param {TilesPatch} patch The patch.
 * @param {readonly EditOnDocument[]} edits The edits in the way, newest first.
 * @returns {EntryPart} The part.
 */
const heldTilesPart = (document: DocumentKey, patch: TilesPatch, edits: readonly EditOnDocument[]): EntryPart =>
{
  const resized = edits.find(edit => edit.patches.some(other => other.kind === 'resize'));
  if (resized !== undefined)
  {
    return leftWhole(document, patch, resized.step);
  }

  // the newest edit painting a cell is the one standing in its way.
  const painters = new Map<number, number>();
  edits.forEach((edit, order) => edit.patches.forEach(other =>
  {
    if (other.kind === 'tiles')
    {
      other.indices.filter(index => painters.has(index) === false).forEach(index => painters.set(index, order));
    }
  }));

  const [ moving, left ] = splitTiles(patch, index => painters.has(index) === false);
  if (left === null)
  {
    return movesWhole(document, patch);
  }

  const newest = Math.min(...left.indices.map(index => painters.get(index) as number));
  return { document, moving, left, by: edits[newest].step };
};

/**
 * Works out what a move of a step comes to on one of its patches on a document held here that follows its change: the
 * patch moves unless an edit in its way changed the same data, moved where it sits, or would be moved by it, the very
 * test that refuses any other step (see patchInterference), and then it stays as it stands; a tiles patch is worked out
 * cell by cell. An undo is in the way of the edits made after the step; a redo of those made or undone since its undo.
 * @param {DocumentKey} document The document.
 * @param {Patch} patch The patch.
 * @param {readonly EditOnDocument[]} edits The edits in the way, newest first.
 * @param {MoveDirection} direction Redo or undo.
 * @returns {EntryPart} The part.
 */
const heldPart = (document: DocumentKey, patch: Patch, edits: readonly EditOnDocument[], direction: MoveDirection): EntryPart =>
{
  if (patch.kind === 'tiles')
  {
    return heldTilesPart(document, patch, edits);
  }

  // undoing, the step's patch came first; redoing, it goes back on top of the edits.
  const blocking = edits.find(edit => edit.patches.some(other => (direction === 'backward' ? patchInterference(patch, other) : patchInterference(other, patch)) !== null));
  return blocking === undefined
    ? movesWhole(document, patch)
    : leftWhole(document, patch, blocking.step);
};

/**
 * Works out what a move of a step comes to on one of its patches on a document no window here holds, which follows its
 * change and which the step writes through to its file: the patch moves as far as the file would take it now, cell by
 * cell for tiles, and the rest stays as the file holds it. Without a way to tell, it all moves, and whoever writes it
 * checks the file.
 * @param {DocumentKey} document The document.
 * @param {Patch} patch The patch, as the step made it.
 * @param {MoveDirection} direction Redo or undo.
 * @param {FileFit | null} fit Says how much of a patch the file would take, or null for no way to tell.
 * @returns {EntryPart} The part.
 */
const filePart = (document: DocumentKey, patch: Patch, direction: MoveDirection, fit: FileFit | null): EntryPart =>
{
  if (fit === null)
  {
    return movesWhole(document, patch);
  }

  const taken = fit(document, direction === 'backward' ? invertPatch(patch) : patch);
  if (taken === null)
  {
    return leftWhole(document, patch, null);
  }

  if (patch.kind !== 'tiles' || taken.kind !== 'tiles')
  {
    return movesWhole(document, patch);
  }

  const fitting = new Set(taken.indices);
  const [ moving, left ] = splitTiles(patch, index => fitting.has(index));
  return { document, moving, left, by: null };
};

/**
 * Reports whether one path lies inside another, either way, so the two reach the same data.
 * @param {PatchPath} left One path.
 * @param {PatchPath} right The other.
 * @returns {boolean} True when either is a prefix of the other.
 */
const pathsMeet = (left: PatchPath, right: PatchPath): boolean =>
{
  const shorter = Math.min(left.length, right.length);
  return left.slice(0, shorter).every((segment, index) => segment === right[index]);
};

/**
 * Narrows what a document's file takes for a step to what moves (see HistoryStep's fileVersions), when the document left
 * parts of it: a patch of the file reaching the same data as a part left, and a cell of it left in the document, stay in
 * the file as they are, so the file still holds what the document does but for its unsaved edits.
 * @param {FileVersion} version What the file takes for the step.
 * @param {readonly Patch[]} left The parts the document left.
 * @returns {FileVersion} What the file takes for the move.
 */
const fileVersionMoving = (version: FileVersion, left: readonly Patch[]): FileVersion =>
{
  if (left.length === 0)
  {
    return version;
  }

  const paths = left.flatMap(patch => (patch.kind === 'set' || patch.kind === 'splice' ? [ patch.path ] : []));
  const cells = new Set(left.flatMap(patch => (patch.kind === 'tiles' ? patch.indices : [])));
  const resized = left.some(patch => patch.kind === 'resize');
  const patches = version.patches.flatMap((patch): Patch[] =>
  {
    switch (patch.kind)
    {
      case 'tiles':
      {
        const [ moving ] = splitTiles(patch, index => resized === false && cells.has(index) === false);
        return moving === null ? [] : [ moving ];
      }
      case 'resize':
        return resized ? [] : [ patch ];
      default:
        return paths.some(path => pathsMeet(path, patch.path)) ? [] : [ patch ];
    }
  });

  return { document: version.document, patches };
};

/**
 * Builds the step that moves when parts of a step are left: the same step, by its id, with the parts that move alone,
 * every file it reaches taking only those, and none it no longer changes named as written through.
 * @param {HistoryStep} step The step whole.
 * @param {readonly EntryPart[]} parts What the move comes to on each of its patches, in their order.
 * @returns {HistoryStep} The step that moves.
 */
const movingStep = (step: HistoryStep, parts: readonly EntryPart[]): HistoryStep =>
{
  const entries: StepEntry[] = parts.flatMap(part => (part.moving === null ? [] : [ { document: part.document, patch: part.moving } ]));
  const { through: _through, fileVersions: _fileVersions, ...rest } = step;
  const through = (step.through ?? []).filter(key => entries.some(entry => entry.document === key));
  const leftOn = (key: DocumentKey): Patch[] => parts.flatMap(part => (part.document === key && part.left !== null ? [ part.left ] : []));
  const fileVersions = step.fileVersions?.map(version => fileVersionMoving(version, leftOn(version.document)));
  return {
    ...rest,
    entries,
    ...(through.length > 0 ? { through } : {}),
    ...(fileVersions === undefined ? {} : { fileVersions }),
  };
};

/**
 * Lists the parts a move left, each with the edit in its way.
 * @param {readonly EntryPart[]} parts What the move comes to on each of a step's patches.
 * @returns {LeftPart[]} The parts left, in the order of the patches they come from.
 */
const leftPartsOf = (parts: readonly EntryPart[]): LeftPart[] =>
{
  return parts.flatMap(part => (part.left === null ? [] : [ { document: part.document, patch: part.left, by: part.by } ]));
};

export { filePart, heldPart, leftPartsOf, movesWhole, movingStep, splitTiles };
export type { EditOnDocument, EntryPart, FileFit, LeftPart, MoveDirection };
