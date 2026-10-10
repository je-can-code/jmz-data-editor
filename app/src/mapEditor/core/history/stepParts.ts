import type { DocumentKey } from '../model/documentKeys.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
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
 * Says how much of a patch the file of a document would take now (see DocumentHub's setFileFit).
 */
type FileFit = (key: DocumentKey, patch: Patch) => Patch | null;

/**
 * Says which patches the file of a document held here took a step by, as the step made them: what the step says that file
 * takes in place of the document's own patches (see HistoryStep's fileVersions), or the document's own, which its file
 * holds once the document was saved with the step in it; null when it cannot be told (see DocumentHub's setFileWay).
 */
type FileWay = (key: DocumentKey, step: HistoryStep, direction: MoveDirection) => readonly Patch[] | null;

/**
 * What a document's parts left by a move reach: the paths of its patches, the cells of its tiles, and whether a resize is
 * among them, which gives every cell a new place.
 */
type LeftReach = {
  readonly paths: readonly PatchPath[];
  readonly cells: ReadonlySet<number>;
  readonly resized: boolean;
};

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
 * Reads what a document's parts left by a move reach.
 * @param {readonly Patch[]} left The parts.
 * @returns {LeftReach} What they reach.
 */
const reachOf = (left: readonly Patch[]): LeftReach =>
{
  return {
    paths: left.flatMap(patch => (patch.kind === 'set' || patch.kind === 'splice' ? [ patch.path ] : [])),
    cells: new Set(left.flatMap(patch => (patch.kind === 'tiles' ? patch.indices : []))),
    resized: left.some(patch => patch.kind === 'resize'),
  };
};

/**
 * Reports whether a part left reaches a cell: one of its own, or any once a resize was left.
 * @param {LeftReach} reach What the parts left reach.
 * @param {number} index The cell.
 * @returns {boolean} True when it does.
 */
const reachesCell = (reach: LeftReach, index: number): boolean =>
{
  return reach.resized || reach.cells.has(index);
};

/**
 * Reports whether a part left reaches the data a patch other than a tiles patch changes: a resize when a resize was left,
 * and anything else at a path inside one left, or holding one.
 * @param {LeftReach} reach What the parts left reach.
 * @param {Patch} patch The patch, which is no tiles patch.
 * @returns {boolean} True when it does.
 */
const reachesData = (reach: LeftReach, patch: Exclude<Patch, TilesPatch>): boolean =>
{
  return patch.kind === 'resize'
    ? reach.resized
    : reach.paths.some(path => pathsMeet(path, patch.path));
};

/**
 * Finds the patches the file of a document is likeliest to have taken a step by, as the step made them, when nothing tells
 * which: what the step says the file takes in place of the document's own (see HistoryStep's fileVersions), and the
 * document's own otherwise.
 * @param {HistoryStep} step The step.
 * @param {DocumentKey} key The document.
 * @returns {readonly Patch[]} The patches, in the order they went in.
 */
const likeliestWayOf = (step: HistoryStep, key: DocumentKey): readonly Patch[] =>
{
  const version = step.fileVersions?.find(each => each.document === key);
  return version === undefined
    ? step.entries.filter(entry => entry.document === key).map(entry => entry.patch)
    : version.patches;
};

/**
 * Works out what the file of a document held here takes for a move of a step that left parts of it in the document,
 * judged against the file alone: every patch the file took the step by, those reaching only what moves in the document
 * whole, and of those reaching a part left, as much as the file still holds the step's side of, cell by cell for tiles.
 * The document keeps the edit standing in a part's way on top; its file holds that edit only once the document is saved
 * with it, and until then holds the step's side, which goes back, or comes back, with the rest of the step. So the file
 * goes on following the step whatever becomes of the document's unsaved edits, as a discarded map, or a crash, then shows.
 * Without a way to tell what the file takes, all of it moves, and whoever writes it checks the file.
 * @param {DocumentKey} document The document.
 * @param {readonly Patch[]} way The patches the file took the step by, as the step made them.
 * @param {readonly Patch[]} left The parts the document left.
 * @param {MoveDirection} direction Redo or undo.
 * @param {FileFit | null} fit Says how much of a patch the file would take, or null for no way to tell.
 * @returns {Patch[]} What the file takes, as the step made it, in the order it went in.
 */
const fileShareOf = (document: DocumentKey, way: readonly Patch[], left: readonly Patch[], direction: MoveDirection, fit: FileFit | null): Patch[] =>
{
  const reach = reachOf(left);

  // the file is asked about a patch turned the way it would go in now.
  const takes = (patch: Patch): Patch | null =>
  {
    if (fit === null)
    {
      return patch;
    }

    return fit(document, direction === 'backward' ? invertPatch(patch) : patch);
  };

  return way.flatMap((patch): Patch[] =>
  {
    if (patch.kind !== 'tiles')
    {
      return reachesData(reach, patch) === false || takes(patch) !== null ? [ patch ] : [];
    }

    // the cells a part left reaches go as far as the file takes them; every other cell goes as the document's do.
    const [ reached ] = splitTiles(patch, index => reachesCell(reach, index));
    const taken = reached === null ? null : takes(reached);
    const fitting = new Set(taken === null || taken.kind !== 'tiles' ? [] : taken.indices);
    const [ going ] = splitTiles(patch, index => reachesCell(reach, index) === false || fitting.has(index));
    return going === null ? [] : [ going ];
  });
};

/**
 * Reports whether any of some patches reaches the data of parts left by a move: a cell of theirs, or a path inside one of
 * theirs or holding one.
 * @param {readonly Patch[]} patches The patches.
 * @param {readonly Patch[]} left The parts left.
 * @returns {boolean} True when one does.
 */
const reachesLeft = (patches: readonly Patch[], left: readonly Patch[]): boolean =>
{
  const reach = reachOf(left);
  return patches.some(patch => (patch.kind === 'tiles' ? patch.indices.some(index => reachesCell(reach, index)) : reachesData(reach, patch)));
};

/**
 * Reports whether the file of a document held here keeps the parts a move left on it as the document does, rather than
 * giving them back, or taking them again, with the rest of the step (see {@link fileShareOf}): the document holds some,
 * and what its file takes for the move, when that differs from the document's own, reaches none of them. A file keeping
 * them holds the part left in the step's place, as the document does; one that does not holds neither.
 * @param {HistoryStep} moving The part of the step that moved.
 * @param {HistoryStep} left The part it left on the documents held here.
 * @param {DocumentKey} key The document.
 * @returns {boolean} True when the file keeps the parts left there.
 */
const fileKeepsLeft = (moving: HistoryStep, left: HistoryStep, key: DocumentKey): boolean =>
{
  const parts = left.entries.filter(entry => entry.document === key).map(entry => entry.patch);
  const version = moving.fileVersions?.find(each => each.document === key);
  return parts.length > 0 && (version === undefined || reachesLeft(version.patches, parts) === false);
};

/**
 * Reports whether two lists of patches are the same, patch for patch.
 * @param {readonly Patch[]} left One list.
 * @param {readonly Patch[]} right The other.
 * @returns {boolean} True when they are.
 */
const samePatches = (left: readonly Patch[], right: readonly Patch[]): boolean =>
{
  return jsonEquals(left as unknown as JsonValue, right as unknown as JsonValue);
};

/**
 * Builds the step that moves when parts of a step are left: the same step, by its id, with the parts that move alone. Each
 * document held here that left parts has what its file takes for the move (see {@link fileShareOf}), which becomes that
 * document's file version, unless it is the document's own patches that move and the step had none for it; every other
 * file version stays as the step had it. It still names every document it writes through, even one it no longer changes:
 * its histories still live there, and a step naming a history on a document is moved only by a window holding that
 * document unless the step writes it through, so dropping the name would refuse every later move until that map was open.
 * @param {HistoryStep} step The step whole.
 * @param {readonly EntryPart[]} parts What the move comes to on each of its patches, in their order.
 * @param {ReadonlyMap<DocumentKey, readonly Patch[]>} shares What the file of each document held here that left parts
 * takes for the move, as the step made it.
 * @returns {HistoryStep} The step that moves.
 */
const movingStep = (step: HistoryStep, parts: readonly EntryPart[], shares: ReadonlyMap<DocumentKey, readonly Patch[]>): HistoryStep =>
{
  const entries: StepEntry[] = parts.flatMap(part => (part.moving === null ? [] : [ { document: part.document, patch: part.moving } ]));
  const { fileVersions: _fileVersions, ...rest } = step;
  const movingOn = (key: DocumentKey): Patch[] => entries.filter(entry => entry.document === key).map(entry => entry.patch);
  const had = new Set((step.fileVersions ?? []).map(version => version.document));

  // a file version keeps its place among the step's; a document that had none gains one only when its file takes
  // something other than what moves in the document itself.
  const kept: FileVersion[] = (step.fileVersions ?? []).map(version =>
  {
    const share = shares.get(version.document);
    return share === undefined ? version : { document: version.document, patches: [ ...share ] };
  });
  const gained: FileVersion[] = [ ...shares ]
    .filter(([ document, share ]) => had.has(document) === false && samePatches(share, movingOn(document)) === false)
    .map(([ document, share ]) => ({ document, patches: [ ...share ] }));
  const fileVersions = [ ...kept, ...gained ];
  return {
    ...rest,
    entries,
    ...(step.fileVersions === undefined && gained.length === 0 ? {} : { fileVersions }),
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

export { fileKeepsLeft, filePart, fileShareOf, heldPart, leftPartsOf, likeliestWayOf, movesWhole, movingStep, reachesLeft, splitTiles };
export type { EditOnDocument, EntryPart, FileFit, FileWay, LeftPart, MoveDirection };
