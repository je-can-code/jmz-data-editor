import type { MapEditorApi } from '../api/MapEditorApi.ts';
import { editorDataDocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
import { isJsonObject, type JsonObject, type JsonValue } from '../model/json.ts';

/**
 * One kind of editor-only document: data only the editor reads, kept inside the project so it is versioned
 * with the game, and never touching a file the game loads.
 */
type EditorDataDefinition = {
  /**
   * Its editor-data key, which is also the last part of its document key.
   */
  readonly name: string;

  /**
   * The version of its shape. A document saved by a newer editor refuses to load rather than being rewritten by
   * an editor that does not understand it.
   */
  readonly schemaVersion: number;

  /**
   * What a project that has never saved one starts with.
   */
  readonly createEmpty: () => JsonObject;
};

/**
 * How every editor-only document is stored: its shape's version beside its data.
 */
type StoredEditorData = {
  schemaVersion: number;
  data: JsonValue;
};

/**
 * Blueprints: saved stamps whose copies stay linked, so changing one changes them all. Keyed by each blueprint's id,
 * which never changes, so every blueprint's edits address it alone (see core/blueprints/blueprints.ts).
 */
const BLUEPRINTS: EditorDataDefinition = { name: 'blueprints', schemaVersion: 1, createEmpty: () => ({ blueprints: {} }) };

/**
 * "Goes on top" marks: per tileset, the tiles that lay over the ground instead of replacing it. Keyed by
 * tileset id; the layering package shapes the entries.
 */
const TILESET_MARKS: EditorDataDefinition = { name: 'tileset-marks', schemaVersion: 1, createEmpty: () => ({ tilesets: {} }) };

/**
 * Saved workspace layouts: which panels are where. Keyed by layout name; the workspace package shapes them.
 */
const LAYOUTS: EditorDataDefinition = { name: 'layouts', schemaVersion: 1, createEmpty: () => ({ layouts: {} }) };

/**
 * Every editor-only document the map editor knows.
 */
const EDITOR_DATA_DEFINITIONS: readonly EditorDataDefinition[] = [ BLUEPRINTS, TILESET_MARKS, LAYOUTS ];

/**
 * Builds the stored form of an empty document.
 * @param {EditorDataDefinition} definition The kind of document.
 * @returns {StoredEditorData} The empty document, stamped with its version.
 */
const emptyEditorData = (definition: EditorDataDefinition): StoredEditorData =>
{
  return { schemaVersion: definition.schemaVersion, data: definition.createEmpty() };
};

/**
 * Finds an editor-data definition by name.
 * @param {string} name The editor-data key.
 * @returns {EditorDataDefinition | null} The definition, or null for a name the editor does not know.
 */
const editorDataDefinition = (name: string): EditorDataDefinition | null =>
{
  return EDITOR_DATA_DEFINITIONS.find(definition => definition.name === name) ?? null;
};

/**
 * Checks a stored document before the editor uses it.
 * @param {EditorDataDefinition} definition The kind of document.
 * @param {JsonValue} stored What the server holds.
 * @returns {StoredEditorData} The same document, known to be readable.
 */
const requireReadable = (definition: EditorDataDefinition, stored: JsonValue): StoredEditorData =>
{
  if (isJsonObject(stored) === false || typeof stored['schemaVersion'] !== 'number' || Object.hasOwn(stored, 'data') === false)
  {
    throw new Error(`the saved ${definition.name} is not an editor-data document`);
  }

  const { schemaVersion } = stored as unknown as StoredEditorData;
  if (schemaVersion > definition.schemaVersion)
  {
    throw new Error(`the saved ${definition.name} was written by a newer editor (version ${schemaVersion})`);
  }

  return stored as unknown as StoredEditorData;
};

/**
 * Reads and writes editor-only documents through the server. A project that has never saved one gets the
 * empty document, so nothing downstream has to tell "absent" from "empty".
 */
class EditorDataClient
{
  #api: MapEditorApi;

  /**
   * @param {MapEditorApi} api The server client.
   */
  constructor(api: MapEditorApi)
  {
    this.#api = api;
  }

  /**
   * Reads a document in its stored form.
   * @param {EditorDataDefinition} definition The kind of document.
   * @returns {Promise<StoredEditorData>} The document, or the empty one when none is saved.
   */
  async load(definition: EditorDataDefinition): Promise<StoredEditorData>
  {
    const stored = await this.#api.loadEditorData(definition.name);
    return stored === null
      ? emptyEditorData(definition)
      : requireReadable(definition, stored);
  }

  /**
   * Writes a document's data, stamped with its shape's version.
   * @param {EditorDataDefinition} definition The kind of document.
   * @param {JsonValue} data The data.
   * @returns {Promise<void>} Settles once written.
   */
  save(definition: EditorDataDefinition, data: JsonValue): Promise<void>
  {
    const stored: StoredEditorData = { schemaVersion: definition.schemaVersion, data };
    return this.#api.saveEditorData(definition.name, stored as unknown as JsonValue);
  }

  /**
   * Names the document key an editor-only document syncs under.
   * @param {EditorDataDefinition} definition The kind of document.
   * @returns {EditorDataDocumentKey} The key.
   */
  static documentKey(definition: EditorDataDefinition): EditorDataDocumentKey
  {
    return editorDataDocumentKey(definition.name);
  }
}

export {
  BLUEPRINTS,
  EDITOR_DATA_DEFINITIONS,
  EditorDataClient,
  editorDataDefinition,
  emptyEditorData,
  LAYOUTS,
  requireReadable,
  TILESET_MARKS,
};
export type { EditorDataDefinition, StoredEditorData };
