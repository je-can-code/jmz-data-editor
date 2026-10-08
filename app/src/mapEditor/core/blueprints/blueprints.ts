import { BLUEPRINTS } from '../editorData/editorData.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { editorDataDocumentKey, type EditorDataDocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import { isJsonObject, type JsonObject, type JsonValue } from '../model/json.ts';
import type { Stamp } from '../stamps/stamp.ts';
import { readStamp } from '../stamps/stampClipboard.ts';
import { isBlueprintId } from './blueprintLink.ts';

/**
 * The document every blueprint lives in: {@code <project>/jmz-editor/blueprints.json}, held in its stored form, the
 * blueprints under {@code data} beside the shape's version.
 *
 * <pre>
 * {
 *   "blueprints": {
 *     "k3x9q2mf": {
 *       "name": "Goblin camp",
 *       "stamp": { "mapId": 16, "tilesetId": 12, "origin": { "x": 4, "y": 7 }, "width": 3, "height": 2, "tiles": null, "events": [ ... ] }
 *     }
 *   }
 * }
 * </pre>
 *
 * Each blueprint sits under its own id, never in a list, so an edit to one addresses it alone: adding or taking away
 * one blueprint never moves another, and the history every blueprint keeps of its own can undo its steps whatever
 * happened to the others since.
 */
const BLUEPRINTS_DOCUMENT: EditorDataDocumentKey = editorDataDocumentKey(BLUEPRINTS.name);

/**
 * How many characters a new blueprint's id has: 36 to the eighth power, near three trillion ids, so two drawn anywhere,
 * in any window or session, all but never match, and few enough to read at a glance in a copy's note.
 */
const BLUEPRINT_ID_LENGTH = 8;

/**
 * The characters a new blueprint's id is drawn from.
 */
const ID_CHARACTERS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * A blueprint: a stamp saved under a name, whose copies stay linked to it.
 */
type Blueprint = {
  /**
   * Its id, which never changes however it is renamed: what every copy's link names it by.
   */
  readonly id: string;

  /**
   * What the author calls it.
   */
  readonly name: string;

  /**
   * The stamp it was saved from, which is what placing it puts down: its events have no links of their own, and their
   * ids are what each copy's link names the event it was made from by. Its own id is {@link blueprintStampId}'s, so a
   * blueprint's stamp is never taken for one of the window's stamps.
   */
  readonly stamp: Stamp;
};

/**
 * Names the stamp a blueprint places, for whatever tells stamps apart by their ids: never one a window's stamp history
 * gives, since those start with the window's own id.
 * @param {string} blueprintId The blueprint's id.
 * @returns {string} The stamp's id.
 */
const blueprintStampId = (blueprintId: string): string =>
{
  return `blueprint:${blueprintId}`;
};

/**
 * Writes what the document keeps of a blueprint under its id: its name, and its stamp without the stamp's id, which
 * is the blueprint's own, in the very order a captured stamp keeps its fields.
 * @param {string} name The blueprint's name.
 * @param {Stamp} stamp Its stamp.
 * @returns {JsonObject} The entry.
 */
const savedBlueprintOf = (name: string, stamp: Stamp): JsonObject =>
{
  const { id: _id, ...content } = stamp;
  return { name, stamp: content as unknown as JsonObject };
};

/**
 * Reads one blueprint out of what the document keeps under its id.
 * @param {string} id The id it is kept under.
 * @param {JsonValue} saved What is kept there.
 * @returns {Blueprint} The blueprint.
 * @throws {Error} When the entry is not a blueprint.
 */
const readBlueprint = (id: string, saved: JsonValue): Blueprint =>
{
  const name = isJsonObject(saved) ? saved['name'] : undefined;
  const content = isJsonObject(saved) ? saved['stamp'] : undefined;
  const stamp = isJsonObject(content) ? readStamp({ ...content, id: blueprintStampId(id) }) : null;
  if (isBlueprintId(id) === false || typeof name !== 'string' || stamp === null)
  {
    throw new Error(`the saved blueprints hold an entry under "${id}" that is not a blueprint`);
  }

  return { id, name, stamp };
};

/**
 * Orders blueprints the way the panel lists them: by name, as a person sorts words, and blueprints of one name by id,
 * so the order never shuffles between reads.
 * @param {Blueprint} left One blueprint.
 * @param {Blueprint} right The other.
 * @returns {number} Below zero to put the left first.
 */
const byName = (left: Blueprint, right: Blueprint): number =>
{
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id);
};

/**
 * Reads every blueprint out of the document's data, in the panel's order. Anything that is not a blueprints document is
 * refused loudly rather than read as no blueprints, since saving over it would lose it.
 * @param {JsonValue | undefined} data The document's data, as the editor-data client loads it.
 * @returns {Blueprint[]} The blueprints, by name.
 * @throws {Error} When the data is not a blueprints document.
 */
const readBlueprints = (data: JsonValue | undefined): Blueprint[] =>
{
  const kept = isJsonObject(data) ? data['blueprints'] : undefined;
  if (isJsonObject(kept) === false)
  {
    throw new Error('the saved blueprints are not a blueprints document');
  }

  return Object.entries(kept).map(([ id, saved ]) => readBlueprint(id, saved)).sort(byName);
};

/**
 * Reads every blueprint the document holds.
 * @param {EditorDocument} document The blueprints document, in its stored form.
 * @returns {Blueprint[]} The blueprints, by name.
 */
const blueprintsOf = (document: EditorDocument): Blueprint[] =>
{
  return readBlueprints(document.valueAt([ 'data' ]));
};

/**
 * Finds one blueprint in the document by its id.
 * @param {EditorDocument} document The blueprints document, in its stored form.
 * @param {string} blueprintId The blueprint's id.
 * @returns {Blueprint | null} The blueprint, or null when the document holds none of that id.
 */
const blueprintIn = (document: EditorDocument, blueprintId: string): Blueprint | null =>
{
  const saved = document.valueAt([ 'data', 'blueprints', blueprintId ]);
  return saved === undefined
    ? null
    : readBlueprint(blueprintId, saved);
};

/**
 * Says whether the blueprint a copy's link names is still there.
 */
type LiveBlueprint = (blueprintId: string) => boolean;

/**
 * Reads which blueprints a window has, for telling a link to one that is gone, as the blueprints stand whenever it is
 * asked: deleted, or its save undone, here or in another window.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @returns {LiveBlueprint | null} Whether a blueprint is there, by its id; null while the window does not hold the
 * blueprints, when no link can be told dead.
 */
const liveBlueprintsIn = (hub: Pick<DocumentHub, 'has' | 'document'>): LiveBlueprint | null =>
{
  if (hub.has(BLUEPRINTS_DOCUMENT) === false)
  {
    return null;
  }

  return (blueprintId: string) => hub.document(BLUEPRINTS_DOCUMENT).valueAt([ 'data', 'blueprints', blueprintId ]) !== undefined;
};

/**
 * Makes a new blueprint's id: {@link BLUEPRINT_ID_LENGTH} lowercase letters and digits drawn at random, drawn again in
 * the unlikely case that the document holds that id already. That check sees every blueprint the document holds now,
 * another window's included, since every window holding the document keeps the same copy of it, and two windows saving
 * at the same moment have their copies flagged as gone different ways, for the author to choose between. Nothing
 * remembers the id of a blueprint that is gone, deleted or its save undone, so only the size of the draw keeps a link
 * left behind by one from ever being read as a link to a new one: a chance of one in near three trillion for each id
 * drawn.
 * @param {(id: string) => boolean} taken Whether an id is in use.
 * @param {() => number} random Draws a number from 0 up to but not including 1.
 * @returns {string} The id.
 */
const newBlueprintId = (taken: (id: string) => boolean, random: () => number): string =>
{
  let id = '';
  do
  {
    id = Array.from({ length: BLUEPRINT_ID_LENGTH }, () => ID_CHARACTERS[Math.floor(random() * ID_CHARACTERS.length)]).join('');
  }
  while (taken(id));

  return id;
};

export {
  BLUEPRINT_ID_LENGTH,
  BLUEPRINTS_DOCUMENT,
  blueprintIn,
  blueprintsOf,
  blueprintStampId,
  liveBlueprintsIn,
  newBlueprintId,
  readBlueprints,
  savedBlueprintOf,
};
export type { Blueprint, LiveBlueprint };
