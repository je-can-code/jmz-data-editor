import type { DatabaseNamesJson } from '../commandList/databaseNames.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import type { Transaction } from '../history/Transaction.ts';
import { mapDocumentKey, type MapDocumentKey } from '../model/documentKeys.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { PatchPath } from '../model/patches.ts';
import type { RmmzEventImage, RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * One change a quick panel makes to one event, addressed inside the event: {@code ['pages', 0, 'trigger']}, or the
 * empty path for the whole event. A field's edits apply in order, so a splice is addressed against the list as the
 * edits before it left it.
 */
type EventEdit =
  | { readonly kind: 'set'; readonly path: PatchPath; readonly value: JsonValue }
  | {
    readonly kind: 'splice';
    readonly path: PatchPath;
    readonly index: number;
    readonly deleteCount: number;
    readonly inserted: readonly JsonValue[];
  };

/**
 * One choice of a select field.
 */
type QuickOption = {
  readonly value: number;
  readonly label: string;
};

/**
 * The control a quick field shows, which also says what its value holds:
 * - {@code number}: a whole number within the bounds;
 * - {@code select}: one of the choices' numbers;
 * - {@code text}: text, over several lines when {@code multiline};
 * - {@code row}: the id of an item, weapon or armor, picked by name;
 * - {@code map}: a map id, picked from the map tree;
 * - {@code graphic}: a page's picture, as {@link GraphicValue}.
 */
type QuickControl =
  | { readonly kind: 'number'; readonly min: number; readonly max: number }
  | { readonly kind: 'select'; readonly options: readonly QuickOption[] }
  | { readonly kind: 'text'; readonly multiline: boolean }
  | { readonly kind: 'row'; readonly list: 'item' | 'weapon' | 'armor' }
  | { readonly kind: 'map' }
  | { readonly kind: 'graphic' };

/**
 * What a graphic field holds: the character sheet and which of its characters, or a tile. Facing and frame are
 * fields of their own, so several events can share a sheet while each keeps its own facing.
 */
type GraphicValue = {
  readonly characterName: string;
  readonly characterIndex: number;
  readonly tileId: number;
};

/**
 * One setting a kind offers for one event: what it is called, the control it shows, its value, and how a new value
 * is written. Fields with the same key mean the same thing on every event of the kind, which is how several
 * selected events show the settings they share.
 */
type QuickField = {
  /**
   * Names the setting across events: {@code reward.0.amount}, {@code transfer.0.map}.
   */
  readonly key: string;

  /**
   * What the panel calls it.
   */
  readonly label: string;

  /**
   * The heading it sits under, or empty for none.
   */
  readonly section: string;

  /**
   * The control, which also says what the value holds.
   */
  readonly control: QuickControl;

  /**
   * The value as the event holds it.
   */
  readonly value: JsonValue;

  /**
   * What the history panel calls a change to it.
   */
  readonly step: string;

  /**
   * A line of context under the control, such as who speaks a message.
   */
  readonly hint?: string;

  /**
   * The whole picture a graphic field belongs to, facing and frame included, for its preview.
   */
  readonly preview?: RmmzEventImage;

  /**
   * Works out the edits that give the event a new value.
   * @param {JsonValue} value The new value.
   * @returns {EventEdit[]} The edits, in order.
   */
  readonly write: (value: JsonValue) => EventEdit[];
};

/**
 * Something a kind can do to an event at a click, such as adding a reward or making a chest.
 */
type QuickAction = {
  /**
   * Names the action across events, like a field's key.
   */
  readonly key: string;

  /**
   * What its button says.
   */
  readonly label: string;

  /**
   * The heading it sits under, or empty for none.
   */
  readonly section: string;

  /**
   * What the history panel calls it.
   */
  readonly step: string;

  /**
   * Works out the edits it makes.
   * @returns {EventEdit[]} The edits, in order.
   */
  readonly run: () => EventEdit[];
};

/**
 * What a kind offers for one event.
 */
type QuickModel = {
  readonly fields: readonly QuickField[];
  readonly actions: readonly QuickAction[];
};

/**
 * What a kind can read besides the event: the map's other events (a new chest borrows the look of one already on
 * the map), and the project's names, once they have arrived.
 */
type QuickContext = {
  readonly events: readonly (RmmzMapEvent | null)[];
  readonly names: DatabaseNamesJson | null;
};

/**
 * Builds what a kind offers for one event. It is asked about events of its own kind, and answers any other event
 * with nothing at all, so a selection that changed since it was read never gets a write meant for something else.
 */
type QuickModelSource = (event: RmmzMapEvent, context: QuickContext) => QuickModel;

/**
 * A setting every selected event has, with the control to show and the value to show in it: the value they all
 * hold, or none when they differ.
 */
type SharedField = {
  readonly key: string;
  readonly label: string;
  readonly section: string;
  readonly control: QuickControl;
  readonly step: string;
  readonly value: JsonValue | null;
  readonly mixed: boolean;
  readonly hint?: string;
  readonly preview?: RmmzEventImage;
};

/**
 * An action every selected event offers.
 */
type SharedAction = {
  readonly key: string;
  readonly label: string;
  readonly section: string;
  readonly step: string;
};

/**
 * Finds the entries every model has under the same key, in the order the first model lists them.
 * @param {readonly (readonly T[])[]} lists Each model's entries.
 * @param {(entry: T, other: T) => boolean} matches Whether an entry in another model is the same setting.
 * @returns {T[][]} For each shared key, the entry from every model, in model order.
 */
const sharedEntries = <T extends { readonly key: string }>(
  lists: readonly (readonly T[])[],
  matches: (entry: T, other: T) => boolean,
): T[][] =>
{
  const [ first, ...rest ] = lists;
  if (first === undefined)
  {
    return [];
  }

  return first.flatMap(entry =>
  {
    const others = rest.map(list => list.find(other => other.key === entry.key && matches(entry, other)));
    return others.every(other => other !== undefined)
      ? [ [ entry, ...others as T[] ] ]
      : [];
  });
};

/**
 * Works out the settings several events share: every key each of them has, shown with the same control. Where
 * they all hold the same value it is shown; where they differ, the field says so and holds none.
 * @param {readonly QuickModel[]} models What the kind offers for each event.
 * @returns {SharedField[]} The shared settings, in the order the first event lists them.
 */
const sharedFields = (models: readonly QuickModel[]): SharedField[] =>
{
  return sharedEntries(models.map(model => model.fields), (entry, other) => jsonEquals(entry.control, other.control))
    .map(members =>
    {
      const [ first ] = members;
      const same = members.every(member => jsonEquals(member.value, first.value));
      const hinted = members.every(member => member.hint === first.hint);
      return {
        key: first.key,
        label: first.label,
        section: first.section,
        control: first.control,
        step: first.step,
        value: same ? first.value : null,
        mixed: same === false,
        ...(hinted && first.hint !== undefined ? { hint: first.hint } : {}),
        ...(first.preview === undefined ? {} : { preview: first.preview }),
      };
    });
};

/**
 * Works out the actions several events share.
 * @param {readonly QuickModel[]} models What the kind offers for each event.
 * @returns {SharedAction[]} The shared actions, in the order the first event lists them.
 */
const sharedActions = (models: readonly QuickModel[]): SharedAction[] =>
{
  return sharedEntries(models.map(model => model.actions), () => true)
    .map(([ first ]) => ({ key: first.key, label: first.label, section: first.section, step: first.step }));
};

/**
 * Applies one event's edits inside a transaction, addressed to the event's slot in the map.
 * @param {Transaction} tx The open transaction.
 * @param {MapDocumentKey} key The map's document.
 * @param {number} eventId The event.
 * @param {readonly EventEdit[]} edits The edits, in order.
 */
const applyEventEdits = (tx: Transaction, key: MapDocumentKey, eventId: number, edits: readonly EventEdit[]): void =>
{
  edits.forEach(edit =>
  {
    const path = [ 'events', eventId, ...edit.path ];
    if (edit.kind === 'set')
    {
      tx.set(key, path, edit.value);
      return;
    }

    tx.splice(key, path, edit.index, edit.deleteCount, edit.inserted);
  });
};

/**
 * What one event currently offers, read from the live map: nothing for a slot that is empty now.
 * @param {MapDocument} map The map, as it stands.
 * @param {number} eventId The event.
 * @param {QuickModelSource} source The kind.
 * @param {QuickContext} context The rest of what the kind reads.
 * @returns {QuickModel} What it offers.
 */
const liveModel = (map: MapDocument, eventId: number, source: QuickModelSource, context: QuickContext): QuickModel =>
{
  const event = map.event(eventId);
  return event === null
    ? { fields: [], actions: [] }
    : source(event, { ...context, events: map.events });
};

/**
 * Gives a setting a new value on every selected event that has it, as one step in the map's own history, so it
 * undoes from the map like any other edit to its events. Each event's edits are worked out from the map as it
 * stands at that moment, never from what a panel read earlier, so a change made meanwhile (in another window,
 * say) is never written over by an edit addressed to where things used to be. An event that no longer has the
 * setting is left alone.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The selected events.
 * @param {QuickModelSource} source The kind the events are.
 * @param {QuickContext} context The rest of what the kind reads.
 * @param {string} key The setting.
 * @param {JsonValue} value Its new value.
 * @returns {HistoryStep | null} The step, or null when nothing changed.
 */
const editQuickField = (
  hub: DocumentHub,
  mapId: number,
  eventIds: readonly number[],
  source: QuickModelSource,
  context: QuickContext,
  key: string,
  value: JsonValue,
): HistoryStep | null =>
{
  const documentKey = mapDocumentKey(mapId);
  const map = hub.map(documentKey);
  const targets = eventIds.flatMap(eventId =>
  {
    const field = liveModel(map, eventId, source, context).fields.find(each => each.key === key);
    return field === undefined ? [] : [ { eventId, field } ];
  });

  const [ first ] = targets;
  if (first === undefined)
  {
    return null;
  }

  // every event's edits are worked out before any is applied, against the map as it stood when the edit began.
  const edits = targets.map(({ eventId, field }) => ({ eventId, edits: field.write(value) }));
  return hub.edit(first.field.step, [ mapHistoryKey(mapId) ], tx =>
  {
    edits.forEach(each => applyEventEdits(tx, documentKey, each.eventId, each.edits));
  });
};

/**
 * Runs an action on every selected event that offers it, as one step in the map's own history, worked out from
 * the map as it stands, like {@link editQuickField}.
 * @param {DocumentHub} hub The window's documents; the map must be held.
 * @param {number} mapId The map.
 * @param {readonly number[]} eventIds The selected events.
 * @param {QuickModelSource} source The kind the events are.
 * @param {QuickContext} context The rest of what the kind reads.
 * @param {string} key The action.
 * @returns {HistoryStep | null} The step, or null when nothing changed.
 */
const runQuickAction = (
  hub: DocumentHub,
  mapId: number,
  eventIds: readonly number[],
  source: QuickModelSource,
  context: QuickContext,
  key: string,
): HistoryStep | null =>
{
  const documentKey = mapDocumentKey(mapId);
  const map = hub.map(documentKey);
  const targets = eventIds.flatMap(eventId =>
  {
    const action = liveModel(map, eventId, source, context).actions.find(each => each.key === key);
    return action === undefined ? [] : [ { eventId, action } ];
  });

  const [ first ] = targets;
  if (first === undefined)
  {
    return null;
  }

  const edits = targets.map(({ eventId, action }) => ({ eventId, edits: action.run() }));
  return hub.edit(first.action.step, [ mapHistoryKey(mapId) ], tx =>
  {
    edits.forEach(each => applyEventEdits(tx, documentKey, each.eventId, each.edits));
  });
};

/**
 * The selected events of one kind.
 */
type KindGroup<K> = {
  readonly kind: K;
  readonly eventIds: readonly number[];
};

/**
 * A selection sorted by kind: a group per kind, in the order each kind first appears; the events no kind
 * recognises; and the ids whose slot is empty now.
 */
type SelectionGroups<K> = {
  readonly groups: readonly KindGroup<K>[];
  readonly unclaimed: readonly number[];
  readonly missing: readonly number[];
};

/**
 * Sorts a selection by kind, so each kind's panel is handed only its own events.
 * @param {readonly (RmmzMapEvent | null)[]} events The map's events, by id.
 * @param {readonly number[]} eventIds The selection.
 * @param {(event: RmmzMapEvent) => K | null} kindOf Finds an event's kind, or null when none recognises it.
 * @returns {SelectionGroups<K>} The groups.
 */
const groupSelection = <K>(
  events: readonly (RmmzMapEvent | null)[],
  eventIds: readonly number[],
  kindOf: (event: RmmzMapEvent) => K | null,
): SelectionGroups<K> =>
{
  const groups: { kind: K; eventIds: number[] }[] = [];
  const unclaimed: number[] = [];
  const missing: number[] = [];
  [ ...new Set(eventIds) ].forEach(eventId =>
  {
    const event = events[eventId] ?? null;
    if (event === null)
    {
      missing.push(eventId);
      return;
    }

    const kind = kindOf(event);
    if (kind === null)
    {
      unclaimed.push(eventId);
      return;
    }

    const group = groups.find(each => each.kind === kind);
    if (group === undefined)
    {
      groups.push({ kind, eventIds: [ eventId ] });
      return;
    }

    group.eventIds.push(eventId);
  });

  return { groups, unclaimed, missing };
};

/**
 * Works out the edits that give a page's picture a new character sheet, character or tile, leaf by leaf, so only
 * what changes is written and the picture keeps its layout.
 * @param {number} pageIndex The page.
 * @param {GraphicValue} value The new sheet, character and tile.
 * @returns {EventEdit[]} The edits.
 */
const graphicEdits = (pageIndex: number, value: GraphicValue): EventEdit[] =>
{
  return [
    { kind: 'set', path: [ 'pages', pageIndex, 'image', 'tileId' ], value: value.tileId },
    { kind: 'set', path: [ 'pages', pageIndex, 'image', 'characterName' ], value: value.characterName },
    { kind: 'set', path: [ 'pages', pageIndex, 'image', 'characterIndex' ], value: value.characterIndex },
  ];
};

/**
 * Reads a page picture's sheet, character and tile as a graphic field holds them.
 * @param {RmmzEventImage} image The picture.
 * @returns {GraphicValue} The value.
 */
const graphicValue = (image: RmmzEventImage): GraphicValue =>
{
  return { characterName: image.characterName, characterIndex: image.characterIndex, tileId: image.tileId };
};

export {
  editQuickField,
  graphicEdits,
  graphicValue,
  groupSelection,
  runQuickAction,
  sharedActions,
  sharedFields,
};
export type {
  EventEdit,
  GraphicValue,
  KindGroup,
  QuickAction,
  QuickContext,
  QuickControl,
  QuickField,
  QuickModel,
  QuickModelSource,
  QuickOption,
  SelectionGroups,
  SharedAction,
  SharedField,
};
