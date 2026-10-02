import { cloneJson, isJsonObject, jsonEquals, type JsonValue } from './json.ts';

/**
 * Where a patch lands inside a document: object keys and array indexes, from the root down. A map's event 5,
 * page 1, trigger is {@code ['events', 5, 'pages', 0, 'trigger']}, exactly as the file spells it.
 */
type PatchPath = readonly (string | number)[];

/**
 * Replaces the value at a path. {@code undefined} on either side means the key is absent, which is how an
 * optional field is added or removed. On an array, a set may replace an existing index, append at exactly the
 * length, or remove the last item; anything else would leave holes that do not reverse, so it throws, and
 * growing an array past its end is a {@link SplicePatch}.
 */
type SetPatch = {
  readonly kind: 'set';
  readonly path: PatchPath;
  readonly before: JsonValue | undefined;
  readonly after: JsonValue | undefined;
};

/**
 * Removes {@code removed} from the array at a path, starting at {@code index}, and inserts {@code inserted}
 * in their place. Command lists, pages and move routes change this way.
 */
type SplicePatch = {
  readonly kind: 'splice';
  readonly path: PatchPath;
  readonly index: number;
  readonly removed: readonly JsonValue[];
  readonly inserted: readonly JsonValue[];
};

/**
 * Changes cells of a map's tile data. Each index is a flat position in the map's six-layer array
 * ({@code (z * height + y) * width + x}); {@code before} and {@code after} hold the tile id at the same
 * position in each list.
 */
type TilesPatch = {
  readonly kind: 'tiles';
  readonly indices: readonly number[];
  readonly before: readonly number[];
  readonly after: readonly number[];
};

/**
 * A map's size together with its whole tile array, which is what a resize has to swap as one piece.
 */
type MapTiles = {
  readonly width: number;
  readonly height: number;
  readonly data: readonly number[];
};

/**
 * Changes a map's size and replaces its tile data in the same step.
 */
type ResizePatch = {
  readonly kind: 'resize';
  readonly before: MapTiles;
  readonly after: MapTiles;
};

/**
 * One unit of change to one document; the history step that carries it holds the name. Every patch carries
 * what it replaced as well as what it wrote, so it reverses exactly, and applying one verifies that the
 * document still holds {@code before} first. A patch that finds something else refuses rather than guessing,
 * which is what keeps two histories editing the same map from quietly undoing each other's work.
 */
type Patch = SetPatch | SplicePatch | TilesPatch | ResizePatch;

/**
 * Thrown when a patch finds the document holding something other than what it expects to replace.
 */
class PatchConflictError extends Error
{
  /**
   * The patch that could not be applied.
   */
  readonly patch: Patch;

  /**
   * @param {string} message What was found instead.
   * @param {Patch} patch The patch that could not be applied.
   */
  constructor(message: string, patch: Patch)
  {
    super(message);
    this.name = 'PatchConflictError';
    this.patch = patch;
  }
}

/**
 * Builds the patch that undoes another one.
 * @param {Patch} patch The patch to reverse.
 * @returns {Patch} A patch that restores exactly what the original replaced.
 */
const invertPatch = (patch: Patch): Patch =>
{
  switch (patch.kind)
  {
    case 'set':
      return { kind: 'set', path: patch.path, before: patch.after, after: patch.before };
    case 'splice':
      return {
        kind: 'splice',
        path: patch.path,
        index: patch.index,
        removed: patch.inserted,
        inserted: patch.removed,
      };
    case 'tiles':
      return { kind: 'tiles', indices: patch.indices, before: patch.after, after: patch.before };
    case 'resize':
      return { kind: 'resize', before: patch.after, after: patch.before };
  }
};

/**
 * Describes a path for an error message.
 * @param {PatchPath} path The path.
 * @returns {string} The path joined with slashes, or the root marker.
 */
const describePath = (path: PatchPath): string =>
{
  return path.length === 0
    ? '(root)'
    : path.join('/');
};

/**
 * Reads the value at a path in a JSON tree.
 * @param {unknown} root The tree.
 * @param {PatchPath} path Where to read.
 * @returns {JsonValue | undefined} The value, or undefined when any step of the path is absent.
 */
const readAt = (root: unknown, path: PatchPath): JsonValue | undefined =>
{
  let current: unknown = root;
  for (const segment of path)
  {
    // arrays are addressed by index and objects by key; anything else has no children.
    if (Array.isArray(current) && typeof segment === 'number')
    {
      current = segment >= 0 && segment < current.length
        ? current[segment]
        : undefined;
      continue;
    }

    if (isJsonObject(current) && typeof segment === 'string')
    {
      current = Object.hasOwn(current, segment)
        ? current[segment]
        : undefined;
      continue;
    }

    return undefined;
  }

  return current as JsonValue | undefined;
};

/**
 * Finds the container a path's last segment addresses, so that segment can be read or written.
 * @param {unknown} root The tree.
 * @param {PatchPath} path The full path.
 * @param {Patch} patch The patch being applied, for the error.
 * @returns {unknown} The array or object holding the final segment.
 */
const parentOf = (root: unknown, path: PatchPath, patch: Patch): unknown =>
{
  const parentPath = path.slice(0, -1);
  const parent = readAt(root, parentPath);
  if (Array.isArray(parent) === false && isJsonObject(parent) === false)
  {
    throw new PatchConflictError(`no container at ${describePath(parentPath)}`, patch);
  }

  return parent;
};

/**
 * Writes a value into an array at an index, under the rule that keeps every array set reversible.
 * @param {JsonValue[]} array The array to change.
 * @param {number} index Where to write.
 * @param {JsonValue | undefined} value The value, or undefined to remove the last item.
 * @param {Patch} patch The patch being applied, for the error.
 */
const writeArrayIndex = (array: JsonValue[], index: number, value: JsonValue | undefined, patch: Patch): void =>
{
  // removing is only possible at the end, where it is the exact reverse of an append.
  if (value === undefined)
  {
    if (index !== array.length - 1)
    {
      throw new PatchConflictError(`can only remove the last item, not index ${index} of ${array.length}`, patch);
    }

    array.pop();
    return;
  }

  // writing is possible over an existing item or exactly one past the end.
  if (Number.isInteger(index) === false || index < 0 || index > array.length)
  {
    throw new PatchConflictError(`index ${index} is outside an array of ${array.length}; use a splice`, patch);
  }

  array[index] = cloneJson(value);
};

/**
 * Writes a value at a path in a JSON tree, in place.
 * @param {unknown} root The tree; only its insides change.
 * @param {PatchPath} path Where to write; never the root itself.
 * @param {JsonValue | undefined} value The value, or undefined to remove the key.
 * @param {Patch} patch The patch being applied, for the error.
 */
const writeAt = (root: unknown, path: PatchPath, value: JsonValue | undefined, patch: Patch): void =>
{
  const parent = parentOf(root, path, patch);
  const segment = path[path.length - 1];

  if (Array.isArray(parent))
  {
    if (typeof segment !== 'number')
    {
      throw new PatchConflictError(`an array cannot be addressed by key "${segment}"`, patch);
    }

    writeArrayIndex(parent, segment, value, patch);
    return;
  }

  // objects take string keys only, so a stray number never becomes a key by accident.
  if (typeof segment !== 'string')
  {
    throw new PatchConflictError(`an object cannot be addressed by index ${segment}`, patch);
  }

  const object = parent as Record<string, JsonValue>;
  if (value === undefined)
  {
    delete object[segment];
    return;
  }

  object[segment] = cloneJson(value);
};

/**
 * Applies a set or splice patch to a JSON tree in place, after checking that the tree still holds what the
 * patch expects to replace. The root itself cannot be replaced this way; a document swaps its root instead.
 * @param {unknown} root The tree to change.
 * @param {SetPatch | SplicePatch} patch The change.
 */
const applyJsonPatch = (root: unknown, patch: SetPatch | SplicePatch): void =>
{
  if (patch.kind === 'set')
  {
    if (patch.path.length === 0)
    {
      throw new PatchConflictError('the root cannot be set; replace the document instead', patch);
    }

    // the document must still hold what this patch replaced, or it would overwrite someone else's change.
    const current = readAt(root, patch.path);
    if (jsonEquals(current, patch.before) === false)
    {
      throw new PatchConflictError(`${describePath(patch.path)} no longer holds the value this change replaced`, patch);
    }

    writeAt(root, patch.path, patch.after, patch);
    return;
  }

  // a splice needs an array, holding exactly the removed items at the index.
  const array = readAt(root, patch.path);
  if (Array.isArray(array) === false)
  {
    throw new PatchConflictError(`no array at ${describePath(patch.path)}`, patch);
  }

  const current = array.slice(patch.index, patch.index + patch.removed.length);
  if (patch.index < 0 || patch.index > array.length || jsonEquals(current, patch.removed) === false)
  {
    throw new PatchConflictError(`${describePath(patch.path)} no longer holds the items this change removed`, patch);
  }

  array.splice(patch.index, patch.removed.length, ...cloneJson(patch.inserted as JsonValue[]));
};

/**
 * Builds a set patch against the current state of a tree, capturing what it replaces.
 * @param {unknown} root The tree as it stands.
 * @param {PatchPath} path Where to write.
 * @param {JsonValue | undefined} after The new value, or undefined to remove the key.
 * @returns {SetPatch} The patch.
 */
const createSetPatch = (root: unknown, path: PatchPath, after: JsonValue | undefined): SetPatch =>
{
  return {
    kind: 'set',
    path: [ ...path ],
    before: cloneJson(readAt(root, path)),
    after: cloneJson(after),
  };
};

/**
 * Builds a splice patch against the current state of a tree, capturing the items it removes.
 * @param {unknown} root The tree as it stands.
 * @param {PatchPath} path The array to change.
 * @param {number} index Where to start.
 * @param {number} deleteCount How many items to remove.
 * @param {readonly JsonValue[]} inserted What to insert in their place.
 * @returns {SplicePatch} The patch.
 */
const createSplicePatch = (
  root: unknown,
  path: PatchPath,
  index: number,
  deleteCount: number,
  inserted: readonly JsonValue[],
): SplicePatch =>
{
  const array = readAt(root, path);
  const removed = Array.isArray(array)
    ? array.slice(index, index + deleteCount)
    : [];

  return {
    kind: 'splice',
    path: [ ...path ],
    index,
    removed: cloneJson(removed),
    inserted: cloneJson([ ...inserted ]),
  };
};

/**
 * Reports whether a patch changes nothing, so a transaction can leave it out of history.
 * @param {Patch} patch The patch.
 * @returns {boolean} True when applying it would leave the document as it was.
 */
const isNoopPatch = (patch: Patch): boolean =>
{
  switch (patch.kind)
  {
    case 'set':
      return jsonEquals(patch.before, patch.after);
    case 'splice':
      return jsonEquals(patch.removed, patch.inserted);
    case 'tiles':
      return jsonEquals(patch.before, patch.after);
    case 'resize':
      return jsonEquals(patch.before, patch.after);
  }
};

export {
  applyJsonPatch,
  createSetPatch,
  createSplicePatch,
  describePath,
  invertPatch,
  isNoopPatch,
  PatchConflictError,
  readAt,
};
export type { MapTiles, Patch, PatchPath, ResizePatch, SetPatch, SplicePatch, TilesPatch };
