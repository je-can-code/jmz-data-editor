import type { DocumentConflict, DocumentHub } from '../core/history/DocumentHub.ts';
import { MAP_INFOS_KEY, mapDocumentKey, parseDocumentKey, type DocumentKey } from '../core/model/documentKeys.ts';
import type { RmmzMapInfo } from '../core/model/rmmzTypes.ts';

/**
 * What each editor-only document is called.
 */
const EDITOR_DATA_LABELS: Readonly<Record<string, string>> = {
  'blueprints': 'Blueprints',
  'blueprint-uses': 'Blueprint placements',
  'tileset-marks': 'Tileset marks',
  'layouts': 'Saved layouts',
  'new-battler-levels': 'New battler levels',
};

/**
 * Names a document the way the author thinks of it. A blueprint opened as a map is named for what it is; its own name
 * lives in the blueprints, which a label read from the key alone cannot reach.
 * @param {DocumentKey} key The document.
 * @returns {string} Its name, such as "Map 12" or "The map tree".
 */
const documentLabel = (key: DocumentKey): string =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
      return `Map ${parsed.mapId}`;
    case 'blueprint-map':
      return 'A blueprint';
    case 'mapinfos':
      return 'The map tree';
    case 'tilesets':
      return 'The tilesets';
    case 'common-events':
      return 'The common events';
    case 'system':
      return 'The switch and variable names';
    case 'editor-data':
      return EDITOR_DATA_LABELS[parsed.name] ?? parsed.name;
  }
};

/**
 * Names a map by its label alone, as a window knowing no map's name in the tree does.
 * @param {number} mapId The map.
 * @returns {string} Its label, such as "Map 12".
 */
const mapLabel = (mapId: number): string =>
{
  return documentLabel(mapDocumentKey(mapId));
};

/**
 * Names a document in words for the author, where a window knows more of it than its key says: a map as the map tree
 * shows it, by the name the window gives it, or by its label where that name is blank; anything else by its label.
 * @param {DocumentKey} key The document.
 * @param {(mapId: number) => string} mapName Names a map as the map tree shows it.
 * @returns {string} Its name, such as "Riverside Stroll", "Map 12" or "The map tree".
 */
const documentName = (key: DocumentKey, mapName: (mapId: number) => string): string =>
{
  const parsed = parseDocumentKey(key);
  if (parsed.kind !== 'map')
  {
    return documentLabel(key);
  }

  // a map the tree gives no name shows in it by its id alone, which its label says.
  const name = mapName(parsed.mapId);
  return name.trim() === ''
    ? documentLabel(key)
    : name;
};

/**
 * Reads a map's name from the map tree this window holds, for a window with nothing more to go on: handed to
 * {@link documentName}, it names a map in what the window tells the author as the tree shows it, and by its label where
 * the window holds no tree, or the tree gives the map no name.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @returns {string} Its name, such as "Bearcat Congregation"; empty where the tree this window holds does not name it.
 */
const heldTreeName = (hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number): string =>
{
  const row = hub.has(MAP_INFOS_KEY) ? hub.document(MAP_INFOS_KEY).valueAt([ mapId ]) as RmmzMapInfo | null | undefined : null;
  return row === null || row === undefined ? '' : row.name;
};

/**
 * The words a conflict is shown in: what happened, and the choices, the first absent where nothing is to be chosen.
 */
type ConflictWording = {
  readonly message: string;
  readonly keepLabel: string | null;
  readonly takeLabel: string | null;
};

/**
 * Words a conflict for the author: what happened to the document, and what each choice keeps. A file removed from
 * disk is no choice at all: this window's copy is the only one left, and saving it puts the file back, which is all the
 * words say.
 * @param {DocumentKey} key The document.
 * @param {DocumentConflict} conflict The conflict.
 * @param {string} name What to call the document, where more is known of it than its key says, such as a map's name in
 * the tree or a blueprint's own name; its label by default.
 * @returns {ConflictWording} The words.
 */
const describeConflict = (key: DocumentKey, conflict: DocumentConflict, name = documentLabel(key)): ConflictWording =>
{
  if (conflict.kind === 'window')
  {
    return {
      message: `${name} was changed in another window at the same time as this one.`,
      keepLabel: 'Keep this window\'s version',
      takeLabel: 'Use the other window\'s version',
    };
  }

  if (conflict.content === null)
  {
    return {
      message: `${name}'s file was deleted from disk. Save to put it back.`,
      keepLabel: null,
      takeLabel: null,
    };
  }

  return {
    message: `${name} changed on disk while it had unsaved edits here.`,
    keepLabel: 'Keep my edits',
    takeLabel: 'Load the version on disk',
  };
};

export { describeConflict, documentLabel, documentName, heldTreeName, mapLabel };
export type { ConflictWording };
