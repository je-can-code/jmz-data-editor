import type { DocumentConflict } from '../core/history/DocumentHub.ts';
import { mapDocumentKey, parseDocumentKey, type DocumentKey } from '../core/model/documentKeys.ts';

/**
 * What each editor-only document is called.
 */
const EDITOR_DATA_LABELS: Readonly<Record<string, string>> = {
  'blueprints': 'Blueprints',
  'blueprint-uses': 'Blueprint placements',
  'tileset-marks': 'Tileset marks',
  'layouts': 'Saved layouts',
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
 * The words a conflict is shown in: what happened, and the two choices.
 */
type ConflictWording = {
  readonly message: string;
  readonly keepLabel: string;
  readonly takeLabel: string | null;
};

/**
 * Words a conflict for the author: what happened to the document, and what each choice keeps. A file removed from
 * disk offers no version to take, only keeping this window's.
 * @param {DocumentKey} key The document.
 * @param {DocumentConflict} conflict The conflict.
 * @param {string} name What to call the document, where more is known of it than its key says, such as a blueprint's
 * own name; its label by default.
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
      message: `${name} was removed from disk while it had unsaved edits here.`,
      keepLabel: 'Keep my edits',
      takeLabel: null,
    };
  }

  return {
    message: `${name} changed on disk while it had unsaved edits here.`,
    keepLabel: 'Keep my edits',
    takeLabel: 'Load the version on disk',
  };
};

export { describeConflict, documentLabel, documentName, mapLabel };
export type { ConflictWording };
