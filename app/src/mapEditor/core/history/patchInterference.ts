import type { Patch, PatchPath, ResizePatch, SetPatch, SplicePatch, TilesPatch } from '../model/patches.ts';

/**
 * How a later patch on one document bears on an earlier one, seen from the earlier one's side: what would go
 * wrong if the earlier patch were taken back out while the later one stayed.
 *
 * - {@code overlap}: the later patch changed some of the same data, so taking the earlier one out would overwrite
 *   that change.
 * - {@code moved}: the later patch moved where the earlier one's data sits, so taking the earlier one out would
 *   change whatever sits at its old place now. A resize moves every cell; adding or removing items in a list moves
 *   every item after them.
 * - {@code would-move}: taking the earlier patch out would itself move where the later one's data sits, in the same
 *   ways, so the later patch would no longer find its data where it left it, and neither would anyone reading the
 *   list by position (an event's id is its place in the list).
 */
type Interference = 'overlap' | 'moved' | 'would-move';

/**
 * A run of items in one list: where it starts, how many items it took out, and how many it put in their place.
 */
type ItemRun = {
  readonly index: number;
  readonly removed: number;
  readonly inserted: number;
};

/**
 * Where a set or splice lands, reduced to what decides whether another patch can pass it: a whole value at a path,
 * or a run of items in one list.
 */
type Footprint =
  | { readonly kind: 'value'; readonly path: PatchPath }
  | { readonly kind: 'items'; readonly list: PatchPath; readonly run: ItemRun };

/**
 * Reports whether one path lies inside another, or is it.
 * @param {PatchPath} outer The shorter path.
 * @param {PatchPath} inner The longer path.
 * @returns {boolean} True when {@code outer} is a prefix of {@code inner}.
 */
const isPathPrefix = (outer: PatchPath, inner: PatchPath): boolean =>
{
  return outer.length <= inner.length && outer.every((segment, index) => segment === inner[index]);
};

/**
 * Reports whether a patch works on a map's tiles rather than on its JSON.
 * @param {Patch} patch The patch.
 * @returns {boolean} True for a tiles or resize patch.
 */
const isGridPatch = (patch: Patch): patch is TilesPatch | ResizePatch =>
{
  return patch.kind === 'tiles' || patch.kind === 'resize';
};

/**
 * Reduces a set or splice to its footprint. A splice works on a run of items, and so does a set that appends to a
 * list or takes its last item off (a numeric last step with nothing before, or nothing after), since either one
 * changes the list's length just as a splice at its end would. Every other set replaces one value.
 * @param {SetPatch | SplicePatch} patch The patch.
 * @returns {Footprint} Where it lands.
 */
const footprintOf = (patch: SetPatch | SplicePatch): Footprint =>
{
  if (patch.kind === 'splice')
  {
    return {
      kind: 'items',
      list: patch.path,
      run: { index: patch.index, removed: patch.removed.length, inserted: patch.inserted.length },
    };
  }

  const last = patch.path[patch.path.length - 1];
  if (typeof last === 'number' && (patch.before === undefined || patch.after === undefined))
  {
    return {
      kind: 'items',
      list: patch.path.slice(0, -1),
      run: { index: last, removed: patch.before === undefined ? 0 : 1, inserted: patch.after === undefined ? 0 : 1 },
    };
  }

  return { kind: 'value', path: patch.path };
};

/**
 * The path a footprint reaches down to: a value's own path, or the list a run of items sits in.
 * @param {Footprint} footprint The footprint.
 * @returns {PatchPath} The path.
 */
const pathOf = (footprint: Footprint): PatchPath =>
{
  return footprint.kind === 'value'
    ? footprint.path
    : footprint.list;
};

/**
 * Finds the list two footprints meet in: the outermost list one of them edits items of, when the other reaches
 * down into that same list too.
 * @param {Footprint} earlier One footprint.
 * @param {Footprint} later The other.
 * @returns {PatchPath | null} The list, or null when neither edits a list the other reaches into.
 */
const meetingList = (earlier: Footprint, later: Footprint): PatchPath | null =>
{
  const lists = [ earlier, later ]
    .flatMap(footprint => footprint.kind === 'items' ? [ footprint.list ] : [])
    .filter(list => isPathPrefix(list, pathOf(earlier)) && isPathPrefix(list, pathOf(later)))
    .sort((left, right) => left.length - right.length);

  return lists[0] ?? null;
};

/**
 * Reads a footprint as a run of items in a list it reaches into. A run in that very list is itself; anything
 * deeper sits inside one item and changes that item alone, without moving any other.
 * @param {PatchPath} list The list.
 * @param {Footprint} footprint The footprint, which reaches into the list.
 * @returns {ItemRun | null} The run, or null when the footprint holds the whole list instead (a value set on the
 * list itself) or reaches into it by a key rather than a position, so it shares whatever the list holds.
 */
const runIn = (list: PatchPath, footprint: Footprint): ItemRun | null =>
{
  if (footprint.kind === 'items' && footprint.list.length === list.length)
  {
    return footprint.run;
  }

  const position = pathOf(footprint)[list.length];
  return typeof position === 'number'
    ? { index: position, removed: 1, inserted: 1 }
    : null;
};

/**
 * Relates two runs in one list, the earlier one made first and the later one made on top of it. Both are measured
 * where they meet, after the earlier edit and before the later one, so the earlier run covers the items it put in
 * and the later run the items it took out.
 * @param {ItemRun} earlier The earlier run.
 * @param {ItemRun} later The later run.
 * @returns {Interference | null} How they bear on each other, or null when neither does.
 */
const runInterference = (earlier: ItemRun, later: ItemRun): Interference | null =>
{
  const earlierEnd = earlier.index + earlier.inserted;
  const laterEnd = later.index + later.removed;
  if (earlier.index < laterEnd && later.index < earlierEnd)
  {
    return 'overlap';
  }

  // apart, the run in front moves the other one only when it changes the list's length.
  if (earlierEnd <= later.index)
  {
    return earlier.inserted === earlier.removed
      ? null
      : 'would-move';
  }

  return later.inserted === later.removed
    ? null
    : 'moved';
};

/**
 * Relates two sets or splices on one document.
 * @param {Footprint} earlier Where the earlier patch landed.
 * @param {Footprint} later Where the later patch landed.
 * @returns {Interference | null} How they bear on each other, or null when neither does.
 */
const jsonInterference = (earlier: Footprint, later: Footprint): Interference | null =>
{
  const list = meetingList(earlier, later);
  if (list === null)
  {
    // with no list between them, they share data only when one holds the other.
    return isPathPrefix(pathOf(earlier), pathOf(later)) || isPathPrefix(pathOf(later), pathOf(earlier))
      ? 'overlap'
      : null;
  }

  const earlierRun = runIn(list, earlier);
  const laterRun = runIn(list, later);
  return earlierRun === null || laterRun === null
    ? 'overlap'
    : runInterference(earlierRun, laterRun);
};

/**
 * Relates two patches on one map's tiles. A resize rewrites every cell and gives every cell a new index, so it
 * bears on every other tile patch; two strokes bear on each other only through a cell both painted.
 * @param {TilesPatch | ResizePatch} earlier The earlier patch.
 * @param {TilesPatch | ResizePatch} later The later patch.
 * @returns {Interference | null} How they bear on each other, or null when neither does.
 */
const gridInterference = (earlier: TilesPatch | ResizePatch, later: TilesPatch | ResizePatch): Interference | null =>
{
  if (earlier.kind === 'resize')
  {
    return later.kind === 'resize'
      ? 'overlap'
      : 'would-move';
  }

  if (later.kind === 'resize')
  {
    return 'moved';
  }

  const painted = new Set(earlier.indices);
  return later.indices.some(index => painted.has(index))
    ? 'overlap'
    : null;
};

/**
 * Reports whether a patch only adds or takes away empty slots at a place in a list, holding nothing of its own: the room
 * a new event's id needs when it lies past the end of the map's list, made before the event is put in it. Taking such a
 * patch back out only shortens the list, so where an edit after it stands further along, the slots can stay as they are,
 * empty, rather than move that edit to another id.
 * @param {Patch} patch The patch.
 * @returns {boolean} True for a splice whose every item, taken out or put in, is an empty slot.
 */
const isSlotSplice = (patch: Patch): boolean =>
{
  return patch.kind === 'splice'
    && patch.removed.length + patch.inserted.length > 0
    && [ ...patch.removed, ...patch.inserted ].every(item => item === null);
};

/**
 * Relates two patches on one document, the later one applied after the earlier. This is the whole test for taking
 * a step back out from under later edits: the patches of each step it passes still find their data where they left
 * it, so both can be undone later in either order, while every patch it catches would write to the wrong place or
 * over another edit. Nothing is ever rebased from one address to another.
 *
 * Tiles live apart from everything a set or splice may touch (a map refuses those on its size and tile data), so a
 * tile patch and a JSON patch never bear on each other.
 * @param {Patch} earlier The earlier patch.
 * @param {Patch} later The later patch.
 * @returns {Interference | null} How the later patch bears on the earlier one, or null when the two are
 * independent.
 */
const patchInterference = (earlier: Patch, later: Patch): Interference | null =>
{
  if (isGridPatch(earlier) && isGridPatch(later))
  {
    return gridInterference(earlier, later);
  }

  if (isGridPatch(earlier) || isGridPatch(later))
  {
    return null;
  }

  return jsonInterference(footprintOf(earlier), footprintOf(later));
};

export { isSlotSplice, patchInterference };
export type { Interference };
