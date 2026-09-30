/**
 * Names the one map document backed by {@code data/Map###.json}.
 */
type MapDocumentKey = `map:${number}`;

/**
 * Names an editor-only document (blueprints, tileset marks, saved layouts), backed by the editor-data route.
 */
type EditorDataDocumentKey = `editor-data:${string}`;

/**
 * Names one document: a unit of project data that loads, saves and syncs as a whole. Every window that holds
 * the same key holds the same live copy.
 */
type DocumentKey = MapDocumentKey | 'mapinfos' | 'tilesets' | EditorDataDocumentKey;

/**
 * What a document key names, taken apart.
 */
type ParsedDocumentKey =
  | { kind: 'map'; mapId: number }
  | { kind: 'mapinfos' }
  | { kind: 'tilesets' }
  | { kind: 'editor-data'; name: string };

/**
 * The key of the map tree document, {@code data/MapInfos.json}.
 */
const MAP_INFOS_KEY = 'mapinfos';

/**
 * The key of the tilesets document, {@code data/Tilesets.json}.
 */
const TILESETS_KEY = 'tilesets';

/**
 * The shape every editor-data key must have; the server refuses anything else.
 */
const EDITOR_DATA_NAME_PATTERN = /^[a-z0-9-]+$/u;

/**
 * Where a map file lives inside the project, relative to its root.
 */
const MAP_FILE_PATTERN = /^data\/Map(\d{3,})\.json$/u;

/**
 * Builds the key of a map's document.
 * @param {number} mapId The map id.
 * @returns {MapDocumentKey} The key.
 */
const mapDocumentKey = (mapId: number): MapDocumentKey =>
{
  if (Number.isInteger(mapId) === false || mapId < 1)
  {
    throw new Error(`a map id is a positive integer, not ${mapId}`);
  }

  return `map:${mapId}`;
};

/**
 * Reports whether a name can be used as an editor-data key.
 * @param {string} name The candidate name.
 * @returns {boolean} True when it is lowercase letters, digits and hyphens only.
 */
const isEditorDataName = (name: string): boolean =>
{
  return EDITOR_DATA_NAME_PATTERN.test(name);
};

/**
 * Builds the key of an editor-only document.
 * @param {string} name The editor-data name, such as {@code blueprints}.
 * @returns {EditorDataDocumentKey} The key.
 */
const editorDataDocumentKey = (name: string): EditorDataDocumentKey =>
{
  if (isEditorDataName(name) === false)
  {
    throw new Error(`an editor-data name is lowercase letters, digits and hyphens, not "${name}"`);
  }

  return `editor-data:${name}`;
};

/**
 * Takes a document key apart.
 * @param {DocumentKey} key The key.
 * @returns {ParsedDocumentKey} What it names.
 */
const parseDocumentKey = (key: DocumentKey): ParsedDocumentKey =>
{
  if (key === MAP_INFOS_KEY || key === TILESETS_KEY)
  {
    return { kind: key };
  }

  if (key.startsWith('editor-data:'))
  {
    return { kind: 'editor-data', name: key.slice('editor-data:'.length) };
  }

  return { kind: 'map', mapId: Number.parseInt(key.slice('map:'.length), 10) };
};

/**
 * Names the project file a document is saved to, relative to the project root, as the file-change stream
 * reports it.
 * @param {DocumentKey} key The document.
 * @returns {string | null} The path, or null for editor-only documents, whose location is the server's to decide.
 */
const projectPathForDocument = (key: DocumentKey): string | null =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
      return `data/Map${String(parsed.mapId).padStart(3, '0')}.json`;
    case 'mapinfos':
      return 'data/MapInfos.json';
    case 'tilesets':
      return 'data/Tilesets.json';
    case 'editor-data':
      return null;
  }
};

/**
 * Finds the document a changed project file belongs to.
 * @param {string} path The file, relative to the project root with forward slashes, as the change stream sends it.
 * @returns {DocumentKey | null} The document, or null when the file backs no document.
 */
const documentKeyForProjectPath = (path: string): DocumentKey | null =>
{
  if (path === 'data/MapInfos.json')
  {
    return MAP_INFOS_KEY;
  }

  if (path === 'data/Tilesets.json')
  {
    return TILESETS_KEY;
  }

  const match = MAP_FILE_PATTERN.exec(path);
  if (match === null)
  {
    return null;
  }

  // map 0 has no file; a stray Map000.json backs nothing.
  const mapId = Number.parseInt(match[1], 10);
  return mapId > 0
    ? mapDocumentKey(mapId)
    : null;
};

export {
  documentKeyForProjectPath,
  editorDataDocumentKey,
  isEditorDataName,
  MAP_INFOS_KEY,
  mapDocumentKey,
  parseDocumentKey,
  projectPathForDocument,
  TILESETS_KEY,
};
export type { DocumentKey, EditorDataDocumentKey, MapDocumentKey, ParsedDocumentKey };
