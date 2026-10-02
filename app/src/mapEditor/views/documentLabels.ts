import type { DocumentConflict } from '../core/history/DocumentHub.ts';
import { parseDocumentKey, type DocumentKey } from '../core/model/documentKeys.ts';

/**
 * What each editor-only document is called.
 */
const EDITOR_DATA_LABELS: Readonly<Record<string, string>> = {
  'blueprints': 'Blueprints',
  'tileset-marks': 'Tileset marks',
  'layouts': 'Saved layouts',
};

/**
 * Names a document the way the author thinks of it.
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
    case 'mapinfos':
      return 'The map tree';
    case 'tilesets':
      return 'The tilesets';
    case 'common-events':
      return 'The common events';
    case 'editor-data':
      return EDITOR_DATA_LABELS[parsed.name] ?? parsed.name;
  }
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
 * @returns {ConflictWording} The words.
 */
const describeConflict = (key: DocumentKey, conflict: DocumentConflict): ConflictWording =>
{
  const name = documentLabel(key);
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

export { describeConflict, documentLabel };
export type { ConflictWording };
