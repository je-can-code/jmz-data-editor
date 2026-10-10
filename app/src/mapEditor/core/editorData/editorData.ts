import type { MapEditorApi } from '../api/MapEditorApi.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { editorDataDocumentKey, parseDocumentKey, type DocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
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

  /**
   * Whether it is kept alongside other documents rather than saved whole: state the editor saves a part at a time,
   * each part with the document it describes, so it has no unsaved edits of its own, is never written as a whole,
   * and never waits for a choice between two copies (see DocumentHub). The record of where blueprints are placed is
   * one; the rest are documents the author edits as a whole.
   */
  readonly keptAlongside: boolean;
};

/**
 * How every editor-only document is stored: its shape's version beside its data.
 */
type StoredEditorData = {
  schemaVersion: number;
  data: JsonValue;
};

/**
 * What writing an editor-only document came to: written, or nothing to write (saved is false), or held back, with the
 * reason in words for the author.
 */
type EditorDataSaveOutcome =
  | { readonly ok: true; readonly saved: boolean }
  | { readonly ok: false; readonly message: string };

/**
 * Blueprints: saved stamps whose copies stay linked, so changing one changes them all. Keyed by each blueprint's id,
 * which never changes, so every blueprint's edits address it alone (see core/blueprints/blueprints.ts).
 */
const BLUEPRINTS: EditorDataDefinition = { name: 'blueprints', schemaVersion: 1, createEmpty: () => ({ blueprints: {} }), keptAlongside: false };

/**
 * Where blueprints are placed: per map, per blueprint, the cell each placement of the blueprint's tiles was put down at,
 * and for one cut off by the map's edge the part that went down, so the editor can find every placement again (see
 * core/blueprints/blueprintUses.ts). A placement's events need no entry here; each one's note already names its
 * blueprint. It describes the maps on disk, so it is kept alongside them: each map's part is written with that map's
 * file, merged into the record as it stands on disk, and never the record whole. Version 2 added the part placed; a
 * record of version 1 reads as every placement whole.
 */
const BLUEPRINT_USES: EditorDataDefinition = { name: 'blueprint-uses', schemaVersion: 2, createEmpty: () => ({ maps: {} }), keptAlongside: true };

/**
 * "Goes on top" marks: per tileset, the tiles that lay over the ground instead of replacing it. Keyed by
 * tileset id; the layering package shapes the entries.
 */
const TILESET_MARKS: EditorDataDefinition = { name: 'tileset-marks', schemaVersion: 1, createEmpty: () => ({ tilesets: {} }), keptAlongside: false };

/**
 * Saved workspace layouts: which panels are where. Keyed by layout name; the workspace package shapes them.
 */
const LAYOUTS: EditorDataDefinition = { name: 'layouts', schemaVersion: 1, createEmpty: () => ({ layouts: {} }), keptAlongside: false };

/**
 * The level each map's new battlers start at, set in Map Properties while J-ABS's module offers it: per map, keyed by map
 * id, the level J-ABS's battler brush gives every battler it places there, whatever its enemy. A map with none set has no
 * entry. The game never reads it, so it lives here rather than in the map's own file (see
 * modules/jabs/battlerLevelSetting.ts).
 */
const NEW_BATTLER_LEVELS: EditorDataDefinition = { name: 'new-battler-levels', schemaVersion: 1, createEmpty: () => ({ maps: {} }), keptAlongside: false };

/**
 * Every editor-only document the map editor knows.
 */
const EDITOR_DATA_DEFINITIONS: readonly EditorDataDefinition[] = [ BLUEPRINTS, BLUEPRINT_USES, TILESET_MARKS, LAYOUTS, NEW_BATTLER_LEVELS ];

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
 * Reports whether a document is kept alongside others rather than saved whole (see
 * {@link EditorDataDefinition.keptAlongside}).
 * @param {DocumentKey} key The document.
 * @returns {boolean} True for an editor-only document kept alongside others; false for every other document.
 */
const isKeptAlongside = (key: DocumentKey): boolean =>
{
  const parsed = parseDocumentKey(key);
  return parsed.kind === 'editor-data' && editorDataDefinition(parsed.name)?.keptAlongside === true;
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
 * Writes an editor-only document the window holds to disk, as an edit to the blueprints or to the tile marks does at
 * once, so every window and every later session has it. A document with nothing unsaved is left alone. A document
 * flagged in conflict (its file changed on disk, or another window's copy went another way, while this window held
 * edits the file lacks) is held back exactly as the workspace's Save all holds a map back: writing it would put this
 * copy over the other one before the author has chosen between them, and once written it would read as saved, so
 * nothing would be left to warn them.
 * @param {DocumentHub} hub The window's documents; the document must be held.
 * @param {EditorDataDocumentKey} key The document.
 * @param {string} what What the author calls it, in the plural: "blueprints", or "tile marks".
 * @returns {Promise<EditorDataSaveOutcome>} Settles once the file is written, or at once when there is nothing to write
 * or the write is held back; rejects when the write itself fails.
 */
const saveEditorDocument = async (hub: DocumentHub, key: EditorDataDocumentKey, what: string): Promise<EditorDataSaveOutcome> =>
{
  if (hub.isDirty(key) === false)
  {
    return { ok: true, saved: false };
  }

  if (hub.isConflicted(key))
  {
    return { ok: false, message: `The ${what} were not saved: they are waiting for a choice about changes made elsewhere.` };
  }

  await hub.save(key);
  return { ok: true, saved: true };
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
  BLUEPRINT_USES,
  BLUEPRINTS,
  EDITOR_DATA_DEFINITIONS,
  EditorDataClient,
  editorDataDefinition,
  emptyEditorData,
  isKeptAlongside,
  LAYOUTS,
  NEW_BATTLER_LEVELS,
  requireReadable,
  saveEditorDocument,
  TILESET_MARKS,
};
export type { EditorDataDefinition, EditorDataSaveOutcome, StoredEditorData };
