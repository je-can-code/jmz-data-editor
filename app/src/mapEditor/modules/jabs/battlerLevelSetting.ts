import { NEW_BATTLER_LEVELS, saveEditorDocument, type EditorDataSaveOutcome } from '../../core/editorData/editorData.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { mapHistoryKey } from '../../core/history/historyKeys.ts';
import type { HistoryStep } from '../../core/history/HistoryStep.ts';
import { editorDataDocumentKey, type EditorDataDocumentKey } from '../../core/model/documentKeys.ts';
import type { PatchPath } from '../../core/model/patches.ts';
import { parseWholeNumber } from '../../core/properties/propertyInputs.ts';

/**
 * The document the level each map's new battlers start at lives in: {@code <project>/jmz-editor/new-battler-levels.json},
 * held in its stored form, each map's level under {@code data.maps}, keyed by the map's id. The game never reads it, and
 * no map's own file ever holds it.
 */
const NEW_BATTLER_LEVELS_DOCUMENT: EditorDataDocumentKey = editorDataDocumentKey(NEW_BATTLER_LEVELS.name);

/**
 * The widest level the setting takes, as the battler panel's level box takes one: far past anything a map holds, below
 * 0 too, since J-LevelMaster reads a minus sign.
 */
const LEVEL_TOP = 999_999;

/**
 * Reads what was typed into the setting's box in Map Properties: nothing at all clears it, and a whole number from
 * -999,999 to 999,999 sets it.
 * @param {string} text What was typed.
 * @returns {{ level: number | null } | null} The level typed, null within it for none; null for text the box refuses.
 */
const typedLevel = (text: string): { readonly level: number | null } | null =>
{
  if (text.trim() === '')
  {
    return { level: null };
  }

  const level = parseWholeNumber(text, { min: -LEVEL_TOP, max: LEVEL_TOP });
  return level === null
    ? null
    : { level };
};

/**
 * Names where a map's level sits in the document.
 * @param {number} mapId The map.
 * @returns {PatchPath} The path.
 */
const levelPath = (mapId: number): PatchPath =>
{
  return [ 'data', 'maps', String(mapId) ];
};

/**
 * Reads the level a map's new battlers start at, as set in Map Properties, from the document the window holds.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {number} mapId The map.
 * @returns {number | null} The level, or null when none is set for the map, or the window does not hold the document.
 * @throws {Error} When the map's entry is not a whole number, which the editor never writes.
 */
const levelSetFor = (hub: Pick<DocumentHub, 'has' | 'document'>, mapId: number): number | null =>
{
  if (hub.has(NEW_BATTLER_LEVELS_DOCUMENT) === false)
  {
    return null;
  }

  const saved = hub.document(NEW_BATTLER_LEVELS_DOCUMENT).valueAt(levelPath(mapId));
  if (saved === undefined)
  {
    return null;
  }

  // a file changed by hand is refused loudly rather than read as some other level.
  if (typeof saved !== 'number' || Number.isSafeInteger(saved) === false)
  {
    throw new Error(`the saved new battler levels give map ${mapId} ${JSON.stringify(saved)}, which is not a level`);
  }

  return saved;
};

/**
 * Sets the level a map's new battlers start at, or clears it, as one step in the map's own history, so it undoes from the
 * map, its properties or the history panel alike, like any other change made in Map Properties. The step changes the
 * editor's own document alone, never the map's file. A map already holding the value records nothing.
 * @param {DocumentHub} hub The window's documents; the map and the levels document must be held.
 * @param {number} mapId The map.
 * @param {number | null} level The level, a whole number, or null to clear it.
 * @returns {HistoryStep | null} The step, or null when the map already holds the value.
 * @throws {Error} When the level is not a whole number.
 */
const setNewBattlerLevel = (hub: DocumentHub, mapId: number, level: number | null): HistoryStep | null =>
{
  if (level !== null && Number.isSafeInteger(level) === false)
  {
    throw new Error(`a level is a whole number, not ${level}`);
  }

  const label = level === null ? 'Clear new battler level' : 'Change new battler level';
  return hub.edit(label, [ mapHistoryKey(mapId) ], tx =>
  {
    // a map with no level set has no entry at all, so clearing one takes its entry out.
    tx.set(NEW_BATTLER_LEVELS_DOCUMENT, levelPath(mapId), level ?? undefined);
  });
};

/**
 * Writes the levels to disk, as every change made in Map Properties does at once, the way the tile marks are kept: nothing
 * when nothing is unsaved, and nothing while they wait for the author's choice about changes made elsewhere, which writing
 * them would put this copy over (see saveEditorDocument). An undo or a redo afterwards is saved with the rest.
 * @param {DocumentHub} hub The window's documents; the levels document must be held.
 * @returns {Promise<EditorDataSaveOutcome>} Settles once the file is written, or at once when there is nothing to write
 * or the write is held back; rejects when the write itself fails.
 */
const saveNewBattlerLevels = (hub: DocumentHub): Promise<EditorDataSaveOutcome> =>
{
  return saveEditorDocument(hub, NEW_BATTLER_LEVELS_DOCUMENT, 'new battler levels');
};

export { LEVEL_TOP, levelSetFor, NEW_BATTLER_LEVELS_DOCUMENT, saveNewBattlerLevels, setNewBattlerLevel, typedLevel };
