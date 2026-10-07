import {
  COMMON_EVENTS_KEY,
  editorDataDocumentKey,
  MAP_INFOS_KEY,
  mapDocumentKey,
  parseDocumentKey,
  SYSTEM_KEY,
  type DocumentKey,
} from '../model/documentKeys.ts';
import type { Patch } from '../model/patches.ts';

/**
 * Names one undo history. History follows the thing being edited, not the window showing it: every map, every
 * event window and every blueprint keeps its own, docked or torn out, and undo acts on whichever has focus.
 *
 * A history is homed on one document, the one its thing lives in (an event's history lives on its map), and a
 * window holds exactly the histories of the documents it holds.
 */
type HistoryKey = string;

/**
 * The editor-data name blueprints are kept under.
 */
const BLUEPRINTS_DATA_NAME = 'blueprints';

/**
 * The history of the map tree: creating, renaming, nesting, reordering and deleting maps.
 */
const TREE_HISTORY_KEY: HistoryKey = 'tree';

/**
 * Names a map's own history: painting, and placing, moving and deleting its events.
 * @param {number} mapId The map id.
 * @returns {HistoryKey} The key.
 */
const mapHistoryKey = (mapId: number): HistoryKey =>
{
  return mapDocumentKey(mapId);
};

/**
 * Names an event window's history: everything edited inside one event.
 * @param {number} mapId The map the event is on.
 * @param {number} eventId The event id.
 * @returns {HistoryKey} The key.
 */
const eventHistoryKey = (mapId: number, eventId: number): HistoryKey =>
{
  if (Number.isInteger(eventId) === false || eventId < 1)
  {
    throw new Error(`an event id is a positive integer, not ${eventId}`);
  }

  return `event:${mapDocumentKey(mapId).slice('map:'.length)}:${eventId}`;
};

/**
 * Names a blueprint's history. Undoing a blueprint change rolls every copy of it back with it.
 * @param {string} blueprintId The blueprint's id.
 * @returns {HistoryKey} The key.
 */
const blueprintHistoryKey = (blueprintId: string): HistoryKey =>
{
  if (blueprintId.length === 0)
  {
    throw new Error('a blueprint needs an id');
  }

  return `blueprint:${blueprintId}`;
};

/**
 * Names a common event's history: everything edited inside one common event, which is a thing of its own the
 * way an event window is, so undo in one never reaches another.
 * @param {number} commonEventId The common event's id.
 * @returns {HistoryKey} The key.
 */
const commonEventHistoryKey = (commonEventId: number): HistoryKey =>
{
  if (Number.isInteger(commonEventId) === false || commonEventId < 1)
  {
    throw new Error(`a common event id is a positive integer, not ${commonEventId}`);
  }

  return `common-event:${commonEventId}`;
};

/**
 * Names the history of a document with no finer scope, such as the tilesets.
 * @param {DocumentKey} key The document.
 * @returns {HistoryKey} The key, which is the document key itself.
 */
const documentHistoryKey = (key: DocumentKey): HistoryKey =>
{
  return key;
};

/**
 * The history of the switch and variable names: every rename, and every change to how many switches or variables the
 * game has. It is the system document's own, since the names are all the map editor changes there.
 */
const SYSTEM_HISTORY_KEY: HistoryKey = documentHistoryKey(SYSTEM_KEY);

/**
 * Finds the document a history lives on.
 * @param {HistoryKey} key The history.
 * @returns {DocumentKey} Its home document.
 */
const homeDocumentOf = (key: HistoryKey): DocumentKey =>
{
  if (key === TREE_HISTORY_KEY)
  {
    return MAP_INFOS_KEY;
  }

  if (key.startsWith('event:'))
  {
    const [ , mapId ] = key.split(':');
    return mapDocumentKey(Number.parseInt(mapId, 10));
  }

  if (key.startsWith('blueprint:'))
  {
    return editorDataDocumentKey(BLUEPRINTS_DATA_NAME);
  }

  if (key.startsWith('common-event:'))
  {
    return COMMON_EVENTS_KEY;
  }

  // a map's own history, and every document-wide one, share the document's key.
  return key as DocumentKey;
};

/**
 * Lists the common events one patch to the common events document reaches: the one its path starts inside, or, for
 * a splice of the list itself, every one it takes out or puts in. A place in the list is a common event's id, since
 * MZ keeps every slot, emptying a common event rather than taking it out, and only grows or shrinks the list at its
 * end. Slot 0 is never a common event, and a tiles patch reaches none, having no path at all.
 * @param {Patch} patch The patch.
 * @returns {number[]} The common event ids, ascending.
 */
const commonEventsReachedBy = (patch: Patch): number[] =>
{
  if (patch.kind === 'tiles' || patch.kind === 'resize')
  {
    return [];
  }

  if (patch.kind === 'splice' && patch.path.length === 0)
  {
    const span = Math.max(patch.removed.length, patch.inserted.length);
    return Array.from({ length: span }, (_, offset) => patch.index + offset).filter(id => id > 0);
  }

  const [ first ] = patch.path;
  return typeof first === 'number' && first > 0
    ? [ first ]
    : [];
};

/**
 * Names the histories an outside change to a document's file is recorded in: the history of whatever the change
 * touched, so undo reaches it from wherever the person works on that thing. A map's change goes in the map's own
 * history, and the map tree's in the tree's. Each common event keeps a history of its own, so a change to the common
 * events goes in the history of every common event it touched, as one step across them, and in none of the others.
 * Every other document keeps one history for the whole of it.
 * @param {DocumentKey} key The document whose file changed.
 * @param {readonly Patch[]} patches The patches that say the change, as the document worked them out.
 * @returns {HistoryKey[]} The histories; never empty.
 */
const outsideChangeHistories = (key: DocumentKey, patches: readonly Patch[]): HistoryKey[] =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
      return [ mapHistoryKey(parsed.mapId) ];
    case 'mapinfos':
      return [ TREE_HISTORY_KEY ];
    case 'common-events':
    {
      // a change that reached no common event at all (slot 0, say) still needs a history to be undone from.
      const reached = [ ...new Set(patches.flatMap(commonEventsReachedBy)) ].sort((left, right) => left - right);
      return reached.length === 0
        ? [ documentHistoryKey(key) ]
        : reached.map(commonEventHistoryKey);
    }
    default:
      return [ documentHistoryKey(key) ];
  }
};

export {
  BLUEPRINTS_DATA_NAME,
  blueprintHistoryKey,
  commonEventHistoryKey,
  documentHistoryKey,
  eventHistoryKey,
  homeDocumentOf,
  mapHistoryKey,
  outsideChangeHistories,
  SYSTEM_HISTORY_KEY,
  TREE_HISTORY_KEY,
};
export type { HistoryKey };
