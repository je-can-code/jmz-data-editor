import { cloneJson, isJsonObject, jsonEquals, type JsonObject, type JsonValue } from '../model/json.ts';
import type { PatchPath, SetPatch } from '../model/patches.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * How far into a value a copy's change is said: as one value, as an object whose keys are each said on their own, or as a
 * list whose items are each said on their own.
 */
type Shape =
  | { readonly kind: 'whole' }
  | { readonly kind: 'object'; readonly keys: Readonly<Record<string, Shape>> }
  | { readonly kind: 'list'; readonly items: Shape };

/**
 * A value said as one: a page's picture, its conditions, its move route, the event's name, its note.
 */
const WHOLE: Shape = { kind: 'whole' };

/**
 * A page's command list, said command by command, so a module's tag line, which is one comment command, is said alone.
 */
const COMMANDS: Shape = { kind: 'list', items: WHOLE };

/**
 * A page, said field by field, its command list command by command.
 */
const PAGE: Shape = { kind: 'object', keys: { list: COMMANDS } };

/**
 * An event, said field by field, its pages page by page.
 */
const EVENT: Shape = { kind: 'object', keys: { pages: { kind: 'list', items: PAGE } } };

/**
 * Reports whether two objects hold the same keys, whatever their order.
 * @param {JsonObject} left One object.
 * @param {JsonObject} right The other.
 * @returns {boolean} True when every key of each is a key of the other.
 */
const sameKeys = (left: JsonObject, right: JsonObject): boolean =>
{
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key));
};

/**
 * Adds the sets that turn one value into another, as far into it as its shape says: nothing when the two are equal; the
 * sets for each key of an object whose keys stay the same, and for each item of a list that keeps its length; and one set
 * of the whole value otherwise, since a key or an item coming or going is a change to the value holding it.
 * @param {Shape} shape How far in the value is said.
 * @param {PatchPath} path Where the value sits.
 * @param {JsonValue} before The value as it is.
 * @param {JsonValue} after The value as it must become.
 * @param {SetPatch[]} patches Where the sets go, in the order the value's keys and items come.
 */
const addSets = (shape: Shape, path: PatchPath, before: JsonValue, after: JsonValue, patches: SetPatch[]): void =>
{
  if (jsonEquals(before, after))
  {
    return;
  }

  if (shape.kind === 'object' && isJsonObject(before) && isJsonObject(after) && sameKeys(before, after))
  {
    Object.keys(before).forEach(key => addSets(shape.keys[key] ?? WHOLE, [ ...path, key ], before[key], after[key], patches));
    return;
  }

  if (shape.kind === 'list' && Array.isArray(before) && Array.isArray(after) && before.length === after.length)
  {
    before.forEach((item, index) => addSets(shape.items, [ ...path, index ], item, after[index], patches));
    return;
  }

  patches.push({ kind: 'set', path: [ ...path ], before: cloneJson(before), after: cloneJson(after) });
};

/**
 * Works out the patches that take a copy of a blueprint's event from what it holds to what a change to its blueprint
 * planned for it, each as narrow as the field it changes: a page's picture, speed or trigger alone; the one comment line a
 * module's tag sits on, or the one command that changed, in a command list that keeps its length; the event's name, or
 * its note. So a later edit to any other field of the copy, the speed in one of its comments, say, never reads as an edit
 * to what the change changed, and the change can still be taken back around it. A command list that grows or shrinks
 * changes whole, and so does a page list that does, since every command or page after the change would move.
 *
 * Every patch is a set at a path the copy already holds, so a map's file takes each as its server applies them, checking
 * the value there first.
 * @param {RmmzMapEvent} current The copy as it stands.
 * @param {RmmzMapEvent} planned The copy as the change planned it, with the same id.
 * @returns {SetPatch[]} The sets, in the order the event's fields come; none when the two are the same.
 */
const copyPatches = (current: RmmzMapEvent, planned: RmmzMapEvent): SetPatch[] =>
{
  const patches: SetPatch[] = [];
  addSets(EVENT, [ 'events', current.id ], current as unknown as JsonValue, planned as unknown as JsonValue, patches);
  return patches;
};

export { copyPatches };
