import type { QuickControl } from '../eventKinds/quickFields.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { mapDocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import { applyPropertyChanges, type MapPropertyChanges } from './mapPropertyEdits.ts';

/**
 * One setting a module offers among a map's properties, such as how dark J-Lighting makes the map: what it is called,
 * the control it shows (any control a quick panel shows), its value as the map holds it, what the history panel calls a
 * change to it, a line of context under it, and how a new value is written.
 */
type MapPropertyField = {
  /**
   * Names the setting within its module's section: {@code lighting.darkness}.
   */
  readonly key: string;

  readonly label: string;

  readonly control: QuickControl;

  readonly value: JsonValue;

  readonly step: string;

  readonly hint?: string;

  /**
   * Works out the map properties a new value changes, from the map as it was read; a value that cannot be written
   * throws, saying why.
   * @param {JsonValue} value The new value.
   * @returns {MapPropertyChanges} The properties and their new values.
   */
  readonly write: (value: JsonValue) => MapPropertyChanges;
};

/**
 * What a module's section offers for one map: a line about the map as a whole above its settings, or null for none,
 * and the settings.
 */
type MapPropertiesModel = {
  readonly note: string | null;
  readonly fields: readonly MapPropertyField[];
};

/**
 * Works out what a module's section offers for a map, from the map as it stands.
 */
type MapPropertiesSource = (map: MapDocument) => MapPropertiesModel;

/**
 * The changes a setting's new value makes on a map, and the name of the step they make.
 */
type PlannedChanges = {
  readonly step: string;
  readonly changes: MapPropertyChanges;
};

/**
 * Works out the changes a setting's new value makes, from the map as it stands at that moment, never from what a panel
 * read earlier, so a change made meanwhile (in another window, say) is never written over.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {MapPropertiesSource} source The section.
 * @param {string} key The setting.
 * @param {JsonValue} value Its new value.
 * @returns {PlannedChanges | null} The changes, or null when the map no longer offers the setting.
 */
const planChanges = (hub: DocumentHub, mapId: number, source: MapPropertiesSource, key: string, value: JsonValue): PlannedChanges | null =>
{
  const field = source(hub.map(mapDocumentKey(mapId))).fields.find(each => each.key === key);
  return field === undefined
    ? null
    : { step: field.step, changes: field.write(value) };
};

/**
 * Gives a module's setting a new value as one step in the map's own history, so it undoes from the map, its properties
 * or the history panel alike, like any other change to a map's properties. A value the map already holds records
 * nothing.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {MapPropertiesSource} source The section offering the setting.
 * @param {string} key The setting.
 * @param {JsonValue} value Its new value.
 * @returns {HistoryStep | null} The step, or null when nothing changed or the map no longer offers the setting.
 */
const editModuleProperty = (
  hub: DocumentHub,
  mapId: number,
  source: MapPropertiesSource,
  key: string,
  value: JsonValue,
): HistoryStep | null =>
{
  const planned = planChanges(hub, mapId, source, key, value);
  if (planned === null)
  {
    return null;
  }

  return hub.edit(planned.step, [ mapHistoryKey(mapId) ], tx => applyPropertyChanges(tx, mapId, planned.changes));
};

/**
 * A module's setting changed continuously, as a slider is dragged or a colour picked: every value it passes through shows
 * on the map at once, and the whole drag becomes one step of the map's history when it ends, named as a single change
 * would be, or no step at all when it ends where it began.
 *
 * Each value is worked out afresh: the value before it is taken back first, so the open edit only ever holds one value's
 * changes, each worked out from the map as it stands. While a value is showing the map's edit is open, so nothing else
 * edits the map until the drag ends; a value the map already holds leaves nothing open at all.
 */
class ModulePropertyDrag
{
  #hub: DocumentHub;

  #mapId: number;

  #source: MapPropertiesSource;

  #key: string;

  #transaction: Transaction | null = null;

  #finished = false;

  /**
   * @param {DocumentHub} hub The window's documents; the map must be held.
   * @param {number} mapId The map.
   * @param {MapPropertiesSource} source The section offering the setting.
   * @param {string} key The setting.
   */
  constructor(hub: DocumentHub, mapId: number, source: MapPropertiesSource, key: string)
  {
    this.#hub = hub;
    this.#mapId = mapId;
    this.#source = source;
    this.#key = key;
  }

  /**
   * The setting it changes.
   * @returns {string} The setting's key.
   */
  get key(): string
  {
    return this.#key;
  }

  /**
   * Shows a new value on the map, in place of the value shown before. A value that cannot be written leaves the map as it
   * was before the drag, and says why.
   * @param {JsonValue} value The value.
   */
  move(value: JsonValue): void
  {
    if (this.#finished)
    {
      return;
    }

    this.#takeBack();
    const planned = planChanges(this.#hub, this.#mapId, this.#source, this.#key, value);
    if (planned === null)
    {
      return;
    }

    const transaction = this.#hub.begin(planned.step, [ mapHistoryKey(this.#mapId) ]);
    applyPropertyChanges(transaction, this.#mapId, planned.changes);

    // a value the map already holds changes nothing, and keeps nothing open.
    if (transaction.entries.length === 0)
    {
      transaction.cancel();
      return;
    }

    this.#transaction = transaction;
  }

  /**
   * Ends the drag with the value it shows, as one step.
   * @returns {HistoryStep | null} The step, or null when the drag changed nothing or had already ended.
   */
  commit(): HistoryStep | null
  {
    if (this.#finished)
    {
      return null;
    }

    this.#finished = true;
    const transaction = this.#transaction;
    this.#transaction = null;
    return transaction === null
      ? null
      : transaction.commit();
  }

  /**
   * Ends the drag by putting back what it changed, leaving nothing in the history.
   */
  cancel(): void
  {
    if (this.#finished)
    {
      return;
    }

    this.#finished = true;
    this.#takeBack();
  }

  /**
   * Takes back the value shown, if one is.
   */
  #takeBack(): void
  {
    const transaction = this.#transaction;
    this.#transaction = null;
    if (transaction !== null)
    {
      transaction.cancel();
    }
  }
}

export { editModuleProperty, ModulePropertyDrag };
export type { MapPropertiesModel, MapPropertiesSource, MapPropertyField };
