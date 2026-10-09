/**
 * Names a blueprint opened as a small map, to be painted and its events edited the way a map's are. It is a map document
 * like any other, built from the blueprint's stamp, and no file of its own backs it: the blueprint lives in the blueprints
 * document, and this is the blueprint laid out as a map while it is open.
 */
type BlueprintMapKey = `blueprint-map:${string}`;

/**
 * Names a map document: the one backed by {@code data/Map###.json}, or a blueprint opened as a small map (see
 * {@link BlueprintMapKey}). Every tool that paints or edits events works on either.
 */
type MapDocumentKey = `map:${number}` | BlueprintMapKey;

/**
 * Names an editor-only document (blueprints, tileset marks, saved layouts), backed by the editor-data route.
 */
type EditorDataDocumentKey = `editor-data:${string}`;

/**
 * Names one document: a unit of project data that loads, saves and syncs as a whole. Every window that holds
 * the same key holds the same live copy.
 */
type DocumentKey = MapDocumentKey | 'mapinfos' | 'tilesets' | 'common-events' | 'system' | EditorDataDocumentKey;

/**
 * What a document key names, taken apart.
 */
type ParsedDocumentKey =
  | { kind: 'map'; mapId: number }
  | { kind: 'blueprint-map'; blueprintId: string }
  | { kind: 'mapinfos' }
  | { kind: 'tilesets' }
  | { kind: 'common-events' }
  | { kind: 'system' }
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
 * The key of the common events document, {@code data/CommonEvents.json}.
 */
const COMMON_EVENTS_KEY = 'common-events';

/**
 * The key of the system document, {@code data/System.json}: the game's settings, which the map editor holds for the
 * names of its switches and variables.
 */
const SYSTEM_KEY = 'system';

/**
 * The shape every editor-data key must have; the server refuses anything else.
 */
const EDITOR_DATA_NAME_PATTERN = /^[a-z0-9-]+$/u;

/**
 * Where a map file lives inside the project, relative to its root.
 */
const MAP_FILE_PATTERN = /^data\/Map(\d{3,})\.json$/u;

/**
 * The project folder the server keeps editor-only documents in, one file per key; the game never reads it.
 */
const EDITOR_DATA_FOLDER = 'jmz-editor';

/**
 * Where an editor-only document lives inside the project, relative to its root.
 */
const EDITOR_DATA_FILE_PATTERN = /^jmz-editor\/([a-z0-9-]+)\.json$/u;

/**
 * The shape of a blueprint id a blueprint opened as a map can be named by: lowercase letters and digits, as every
 * blueprint id is, and at most ten of them, the most a map id spelling it can hold exactly (see {@link blueprintMapId}).
 * The editor makes every id eight long.
 */
const MAPPABLE_BLUEPRINT_ID = /^[a-z0-9]{1,10}$/u;

/**
 * The radix a blueprint's map id spells its id in: one digit for each letter and digit an id is made of.
 */
const BLUEPRINT_ID_RADIX = 36;

/**
 * The digit a blueprint's map id spells before its id, so an id starting with 0 keeps every character it has.
 */
const BLUEPRINT_ID_LEAD = '1';

/**
 * Builds the key a blueprint opened as a map is held under.
 * @param {string} blueprintId The blueprint's id.
 * @returns {BlueprintMapKey} The key.
 */
const blueprintMapKey = (blueprintId: string): BlueprintMapKey =>
{
  if (MAPPABLE_BLUEPRINT_ID.test(blueprintId) === false)
  {
    throw new Error(`a blueprint opens as a map by an id of up to ten lowercase letters and digits, not "${blueprintId}"`);
  }

  return `blueprint-map:${blueprintId}`;
};

/**
 * Reports whether a blueprint can be opened as a map: whether its id is one a map id can spell.
 * @param {string} blueprintId The blueprint's id.
 * @returns {boolean} True when it can.
 */
const isMappableBlueprintId = (blueprintId: string): boolean =>
{
  return MAPPABLE_BLUEPRINT_ID.test(blueprintId);
};

/**
 * Names a blueprint opened as a map by a map id, as every tool that paints or edits events names the map it works on.
 * No map has an id below 1, so a blueprint takes one below zero that spells its id, read as a number in base 36 with a 1
 * in front: every window works out the same number for the same blueprint, and reads the same blueprint back out of it,
 * so a selection, a panel or an event window naming the number names that blueprint and nothing else.
 * @param {string} blueprintId The blueprint's id.
 * @returns {number} The map id, below zero.
 */
const blueprintMapId = (blueprintId: string): number =>
{
  // checking the key checks the id.
  blueprintMapKey(blueprintId);
  return -Number.parseInt(`${BLUEPRINT_ID_LEAD}${blueprintId}`, BLUEPRINT_ID_RADIX);
};

/**
 * Reads the blueprint a map id names, when it names one (see {@link blueprintMapId}).
 * @param {number} mapId The map id.
 * @returns {string | null} The blueprint's id, or null for the id of a map, or a number naming nothing.
 */
const blueprintIdOfMap = (mapId: number): string | null =>
{
  if (Number.isSafeInteger(mapId) === false || mapId >= 0)
  {
    return null;
  }

  const spelled = (-mapId).toString(BLUEPRINT_ID_RADIX);
  const blueprintId = spelled.slice(BLUEPRINT_ID_LEAD.length);
  return spelled.startsWith(BLUEPRINT_ID_LEAD) && MAPPABLE_BLUEPRINT_ID.test(blueprintId)
    ? blueprintId
    : null;
};

/**
 * Reports whether a map id names a blueprint opened as a map rather than a map.
 * @param {number} mapId The map id.
 * @returns {boolean} True for a blueprint's.
 */
const isBlueprintMapId = (mapId: number): boolean =>
{
  return blueprintIdOfMap(mapId) !== null;
};

/**
 * Builds the key of a map's document: the map's own, or, for a map id naming a blueprint, the key the blueprint is held
 * under while it is open as a map.
 * @param {number} mapId The map id.
 * @returns {MapDocumentKey} The key.
 */
const mapDocumentKey = (mapId: number): MapDocumentKey =>
{
  const blueprintId = blueprintIdOfMap(mapId);
  if (blueprintId !== null)
  {
    return blueprintMapKey(blueprintId);
  }

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
  if (key === MAP_INFOS_KEY || key === TILESETS_KEY || key === COMMON_EVENTS_KEY || key === SYSTEM_KEY)
  {
    return { kind: key };
  }

  if (key.startsWith('editor-data:'))
  {
    return { kind: 'editor-data', name: key.slice('editor-data:'.length) };
  }

  if (key.startsWith('blueprint-map:'))
  {
    return { kind: 'blueprint-map', blueprintId: key.slice('blueprint-map:'.length) };
  }

  return { kind: 'map', mapId: Number.parseInt(key.slice('map:'.length), 10) };
};

/**
 * Reads the map id a map document is named by: a map's own, or the one a blueprint opened as a map takes (see
 * {@link blueprintMapId}).
 * @param {DocumentKey} key The document.
 * @returns {number | null} The map id, or null for a document that is no map.
 */
const mapIdOfDocument = (key: DocumentKey): number | null =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
      return parsed.mapId;
    case 'blueprint-map':
      return blueprintMapId(parsed.blueprintId);
    default:
      return null;
  }
};

/**
 * Names the project file a document is saved to, relative to the project root, as the file-change stream
 * reports it. A blueprint opened as a map has no file of its own; it is kept in the blueprints' file.
 * @param {DocumentKey} key The document.
 * @returns {string} The path.
 */
const projectPathForDocument = (key: DocumentKey): string =>
{
  const parsed = parseDocumentKey(key);
  switch (parsed.kind)
  {
    case 'map':
      return `data/Map${String(parsed.mapId).padStart(3, '0')}.json`;
    case 'blueprint-map':
      return `${EDITOR_DATA_FOLDER}/blueprints.json`;
    case 'mapinfos':
      return 'data/MapInfos.json';
    case 'tilesets':
      return 'data/Tilesets.json';
    case 'common-events':
      return 'data/CommonEvents.json';
    case 'system':
      return 'data/System.json';
    case 'editor-data':
      return `${EDITOR_DATA_FOLDER}/${parsed.name}.json`;
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

  if (path === 'data/CommonEvents.json')
  {
    return COMMON_EVENTS_KEY;
  }

  if (path === 'data/System.json')
  {
    return SYSTEM_KEY;
  }

  const editorData = EDITOR_DATA_FILE_PATTERN.exec(path);
  if (editorData !== null)
  {
    return editorDataDocumentKey(editorData[1]);
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
  blueprintIdOfMap,
  blueprintMapId,
  blueprintMapKey,
  COMMON_EVENTS_KEY,
  documentKeyForProjectPath,
  EDITOR_DATA_FOLDER,
  editorDataDocumentKey,
  isBlueprintMapId,
  isEditorDataName,
  isMappableBlueprintId,
  MAP_INFOS_KEY,
  mapDocumentKey,
  mapIdOfDocument,
  parseDocumentKey,
  projectPathForDocument,
  SYSTEM_KEY,
  TILESETS_KEY,
};
export type { BlueprintMapKey, DocumentKey, EditorDataDocumentKey, MapDocumentKey, ParsedDocumentKey };
