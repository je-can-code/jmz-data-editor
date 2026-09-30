import {
  editorDataDocumentKey,
  MAP_INFOS_KEY,
  mapDocumentKey,
  type DocumentKey,
} from '../model/documentKeys.ts';

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
 * Names the history of a document with no finer scope, such as the tilesets.
 * @param {DocumentKey} key The document.
 * @returns {HistoryKey} The key, which is the document key itself.
 */
const documentHistoryKey = (key: DocumentKey): HistoryKey =>
{
  return key;
};

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

  // a map's own history, and every document-wide one, share the document's key.
  return key as DocumentKey;
};

export {
  BLUEPRINTS_DATA_NAME,
  blueprintHistoryKey,
  documentHistoryKey,
  eventHistoryKey,
  homeDocumentOf,
  mapHistoryKey,
  TREE_HISTORY_KEY,
};
export type { HistoryKey };
