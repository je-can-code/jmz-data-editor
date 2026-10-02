import { cloneJson, isJsonObject, jsonEquals, type JsonObject, type JsonValue } from './json.ts';
import type { Patch, PatchPath, SetPatch, SplicePatch } from './patches.ts';

/**
 * Builds the set that replaces one value with another at a path.
 * @param {PatchPath} path Where the value sits; never the root.
 * @param {JsonValue | undefined} before The value there now, or undefined when the key is absent.
 * @param {JsonValue | undefined} after The value it becomes, or undefined when the key goes.
 * @returns {SetPatch} The patch.
 */
const setAt = (path: PatchPath, before: JsonValue | undefined, after: JsonValue | undefined): SetPatch =>
{
  return { kind: 'set', path: [ ...path ], before: cloneJson(before), after: cloneJson(after) };
};

/**
 * Builds the splice that swaps a stretch of a list for another stretch.
 * @param {PatchPath} path The list.
 * @param {number} index Where the stretch starts.
 * @param {readonly JsonValue[]} removed The items the list holds there now.
 * @param {readonly JsonValue[]} inserted The items that take their place.
 * @returns {SplicePatch} The patch.
 */
const spliceAt = (path: PatchPath, index: number, removed: readonly JsonValue[], inserted: readonly JsonValue[]): SplicePatch =>
{
  return { kind: 'splice', path: [ ...path ], index, removed: cloneJson([ ...removed ]), inserted: cloneJson([ ...inserted ]) };
};

/**
 * Counts how many items two lists share at their fronts.
 * @param {readonly JsonValue[]} before One list.
 * @param {readonly JsonValue[]} after The other.
 * @returns {number} How many leading items are equal.
 */
const sharedFront = (before: readonly JsonValue[], after: readonly JsonValue[]): number =>
{
  const shorter = Math.min(before.length, after.length);
  let shared = 0;
  while (shared < shorter && jsonEquals(before[shared], after[shared]))
  {
    shared += 1;
  }

  return shared;
};

/**
 * Counts how many items two lists share at their backs, without reaching into the items already shared at their
 * fronts.
 * @param {readonly JsonValue[]} before One list.
 * @param {readonly JsonValue[]} after The other.
 * @param {number} front How many leading items they share.
 * @returns {number} How many trailing items are equal.
 */
const sharedBack = (before: readonly JsonValue[], after: readonly JsonValue[], front: number): number =>
{
  const room = Math.min(before.length, after.length) - front;
  let shared = 0;
  while (shared < room && jsonEquals(before[before.length - 1 - shared], after[after.length - 1 - shared]))
  {
    shared += 1;
  }

  return shared;
};

/**
 * Adds the patches that turn one value into another, somewhere below the root: nothing when they are equal, the
 * patches for their insides when both are lists or both are objects, and one set otherwise.
 * @param {JsonValue} before The value as it is.
 * @param {JsonValue} after The value as it must become.
 * @param {PatchPath} path Where the value sits; never the root.
 * @param {Patch[]} patches Where the patches go, in the order they apply.
 */
const addValuePatches = (before: JsonValue, after: JsonValue, path: PatchPath, patches: Patch[]): void =>
{
  if (jsonEquals(before, after))
  {
    return;
  }

  if (Array.isArray(before) && Array.isArray(after))
  {
    addListPatches(before, after, path, patches);
    return;
  }

  if (isJsonObject(before) && isJsonObject(after))
  {
    addObjectPatches(before, after, path, patches);
    return;
  }

  patches.push(setAt(path, before, after));
};

/**
 * Adds the patches that turn one object into another: a key only one of them has is added or removed by a set, and
 * a key both have changes by the patches for its own value, so nothing that stayed the same is ever addressed.
 * @param {JsonObject} before The object as it is.
 * @param {JsonObject} after The object as it must become.
 * @param {PatchPath} path Where the object sits.
 * @param {Patch[]} patches Where the patches go, in the order they apply.
 */
const addObjectPatches = (before: JsonObject, after: JsonObject, path: PatchPath, patches: Patch[]): void =>
{
  Object.keys(before).forEach(key =>
  {
    if (Object.hasOwn(after, key))
    {
      addValuePatches(before[key], after[key], [ ...path, key ], patches);
      return;
    }

    patches.push(setAt([ ...path, key ], before[key], undefined));
  });

  Object.keys(after)
    .filter(key => Object.hasOwn(before, key) === false)
    .forEach(key => patches.push(setAt([ ...path, key ], undefined, after[key])));
};

/**
 * The most pairs of items two stretches of a list may have for them to be lined up item against item. Lining up
 * costs time and memory in proportion to the pairs, and 250,000 is two stretches of 500 items each, far longer than
 * any list a person edits by hand; a longer stretch is said more roughly instead, but no less exactly.
 */
const MOST_ALIGNED_PAIRS = 250_000;

/**
 * One place where two stretches of a list part ways: how many items they shared since the last such place, then the
 * items the old stretch has there and the items the new one has instead.
 */
type ListGap = {
  readonly keptBefore: number;
  readonly removed: JsonValue[];
  readonly inserted: JsonValue[];
};

/**
 * Lines two stretches of a list up item against item, keeping as many items in common as can be kept in order, and
 * lists the places they part ways. Items are compared by their JSON text, which is exact for files written the same
 * way; two equal items written with their keys in another order merely fail to line up, and are then changed in
 * place into each other, which changes nothing.
 * @param {readonly JsonValue[]} removed The old stretch.
 * @param {readonly JsonValue[]} inserted The new stretch.
 * @returns {ListGap[]} The places they part ways, in order.
 */
const alignStretches = (removed: readonly JsonValue[], inserted: readonly JsonValue[]): ListGap[] =>
{
  const oldKeys = removed.map(item => JSON.stringify(item));
  const newKeys = inserted.map(item => JSON.stringify(item));
  const width = inserted.length + 1;

  // common[a * width + b] is how many items the old stretch from a and the new stretch from b can keep in order.
  const common = new Uint32Array((removed.length + 1) * width);
  for (let a = removed.length - 1; a >= 0; a--)
  {
    for (let b = inserted.length - 1; b >= 0; b--)
    {
      common[a * width + b] = oldKeys[a] === newKeys[b]
        ? common[(a + 1) * width + b + 1] + 1
        : Math.max(common[(a + 1) * width + b], common[a * width + b + 1]);
    }
  }

  // walk both stretches together, keeping what lines up and gathering everything between into gaps.
  const gaps: ListGap[] = [];
  let kept = 0;
  let gap: ListGap | null = null;
  let a = 0;
  let b = 0;
  while (a < removed.length || b < inserted.length)
  {
    if (a < removed.length && b < inserted.length && oldKeys[a] === newKeys[b])
    {
      if (gap !== null)
      {
        gaps.push(gap);
        gap = null;
      }

      kept += 1;
      a += 1;
      b += 1;
      continue;
    }

    if (gap === null)
    {
      gap = { keptBefore: kept, removed: [], inserted: [] };
      kept = 0;
    }

    // take out an old item while that still leaves as much in common as putting a new one in would.
    if (b >= inserted.length || (a < removed.length && common[(a + 1) * width + b] >= common[a * width + b + 1]))
    {
      gap.removed.push(removed[a]);
      a += 1;
    }
    else
    {
      gap.inserted.push(inserted[b]);
      b += 1;
    }
  }

  return gap === null
    ? gaps
    : [ ...gaps, gap ];
};

/**
 * Adds the patches for one place two stretches part ways, where the list stands at a given index: the items both
 * sides have there change in place, each by the patches for its own value, and whatever one side has beyond the
 * other is added or taken off right after them, by one splice.
 * @param {ListGap} gap The place.
 * @param {PatchPath} path The list.
 * @param {number} position Where the place starts in the list as the patches before these left it.
 * @param {Patch[]} patches Where the patches go, in the order they apply.
 */
const addGapPatches = (gap: ListGap, path: PatchPath, position: number, patches: Patch[]): void =>
{
  const paired = Math.min(gap.removed.length, gap.inserted.length);
  for (let offset = 0; offset < paired; offset++)
  {
    addValuePatches(gap.removed[offset], gap.inserted[offset], [ ...path, position + offset ], patches);
  }

  if (gap.removed.length !== gap.inserted.length)
  {
    patches.push(spliceAt(path, position + paired, gap.removed.slice(paired), gap.inserted.slice(paired)));
  }
};

/**
 * Adds the patches that turn one list into another. The items the two share at either end stay where they are, and
 * the stretch between is lined up item against item, so an item inserted into or taken out of the middle of a list
 * is one splice, the items behind it untouched, and an item changed where it stands is changed in place. A stretch
 * too long to line up is changed item by item when it kept its length, which moves nothing, and is one splice over
 * the whole stretch when it grew or shrank.
 * @param {readonly JsonValue[]} before The list as it is.
 * @param {readonly JsonValue[]} after The list as it must become.
 * @param {PatchPath} path Where the list sits; the root itself is allowed, since a splice never replaces it.
 * @param {Patch[]} patches Where the patches go, in the order they apply.
 */
const addListPatches = (before: readonly JsonValue[], after: readonly JsonValue[], path: PatchPath, patches: Patch[]): void =>
{
  const start = sharedFront(before, after);
  const back = sharedBack(before, after, start);
  const removed = before.slice(start, before.length - back);
  const inserted = after.slice(start, after.length - back);

  if (removed.length * inserted.length > MOST_ALIGNED_PAIRS)
  {
    const whole: ListGap = { keptBefore: 0, removed, inserted };
    if (removed.length === inserted.length)
    {
      addGapPatches(whole, path, start, patches);
      return;
    }

    patches.push(spliceAt(path, start, removed, inserted));
    return;
  }

  // each gap's patches leave the list holding the new items there, so the next gap starts after them.
  let position = start;
  alignStretches(removed, inserted).forEach(gap =>
  {
    position += gap.keptBefore;
    addGapPatches(gap, path, position, patches);
    position += gap.inserted.length;
  });
};

/**
 * Works out the patches that turn one whole document's content into another, the way an edit would have made them:
 * applied in order they reach exactly the new content, and reversed newest first they come back to the old one.
 * Only what differs is addressed, down to the smallest value that changed, so every edit elsewhere in the document
 * still finds its own data where it left it and can be undone around them.
 *
 * The root itself can never be replaced by a patch, so when the two contents are not the same kind of value (a list
 * that became an object, say) nothing can say the difference, and there is no answer.
 * @param {JsonValue} before The content as it is.
 * @param {JsonValue} after The content as it must become.
 * @returns {Patch[] | null} The patches, empty when the two are equal, or null when the root would have to change.
 */
const patchesBetween = (before: JsonValue, after: JsonValue): Patch[] | null =>
{
  const patches: Patch[] = [];
  if (jsonEquals(before, after))
  {
    return patches;
  }

  if (Array.isArray(before) && Array.isArray(after))
  {
    addListPatches(before, after, [], patches);
    return patches;
  }

  if (isJsonObject(before) && isJsonObject(after))
  {
    addObjectPatches(before, after, [], patches);
    return patches;
  }

  return null;
};

export { patchesBetween };
