import type { CommitCheck, DocumentHub } from '../history/DocumentHub.ts';
import { parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import { jsonEquals } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMap, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { BLUEPRINT_GONE } from './blueprintEdits.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, type Blueprint } from './blueprints.ts';

/**
 * Why a blueprint opened as a map is not resized: it was placed at its old size, and growing it would paint over cells
 * its placements never covered.
 */
const BLUEPRINT_RESIZED = 'A blueprint can\'t be resized: growing it would paint over cells its placements never covered.';

/**
 * Why an event is not added to a blueprint: every map it is used on would have to take a new event too.
 */
const BLUEPRINT_EVENTS_ADDED = 'Events can\'t be added to a blueprint: a new one would have to appear on every map it is used on.';

/**
 * Why an event is not taken out of a blueprint: every copy of it, on every map, would go with it.
 */
const BLUEPRINT_EVENTS_REMOVED = 'Events can\'t be removed from a blueprint: removing one would delete events on every map.';

/**
 * Why a blueprint's event keeps its id: every copy's link names the event it was made from by that id.
 */
const BLUEPRINT_EVENT_IDS = 'A blueprint\'s events keep their ids, since every copy names its event by one.';

/**
 * Why a blueprint opened as a map takes no change to the map's own settings: a blueprint keeps only its tiles and events.
 */
const BLUEPRINT_SETTINGS = 'A blueprint keeps only its tiles and events, so it has no map settings to change.';

/**
 * Why a blueprint of events alone takes no tiles: it carries none, so none would be kept.
 */
const BLUEPRINT_NO_TILES = 'This blueprint holds events alone, so it has no tiles to paint.';

/**
 * Why a blueprint's tiles take no change in a window not holding the blueprints: it cannot tell which layers the
 * blueprint keeps.
 */
const BLUEPRINTS_UNREAD = 'The blueprints aren\'t open in this window, so a blueprint\'s tiles can\'t change here.';

/**
 * The layers a blueprint carries, as far as a window can tell: the layers, bottom to top; null for a blueprint of events
 * alone; or undefined while the window does not hold the blueprints.
 */
type CarriedLayers = readonly number[] | null | undefined;

/**
 * Words one of a map's six layers the way the layer strip and the stack view do: the four tile layers by number, from 1,
 * then the shadows and the regions.
 * @param {number} layer The layer, 0 to 5.
 * @returns {string} The words.
 */
const layerWords = (layer: number): string =>
{
  if (layer === 4)
  {
    return 'the shadows';
  }

  return layer === 5
    ? 'the regions'
    : `layer ${layer + 1}`;
};

/**
 * Says why a change reaches layers a blueprint does not carry: which it carries, and that only those can change.
 * @param {readonly number[]} carried The layers it carries, bottom to top.
 * @returns {string} The words.
 */
const layersKeptMessage = (carried: readonly number[]): string =>
{
  const words = carried.map(layerWords);
  return words.length === 1
    ? `This blueprint keeps ${words[0]} alone, so only that layer can change.`
    : `This blueprint keeps ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]} alone, so only those layers can change.`;
};

/**
 * Lists the ids of the events a map's event list holds, by the slot each stands in.
 * @param {readonly (RmmzMapEvent | null)[]} events The list.
 * @returns {Set<number>} The slots holding an event.
 */
const heldSlots = (events: readonly (RmmzMapEvent | null)[]): Set<number> =>
{
  return new Set(events.flatMap((event, slot) => (event === null ? [] : [ slot ])));
};

/**
 * Says why a change to a blueprint's events cannot stand: one added, one taken away, or one whose id no longer names
 * its slot; or null when the same events stand in the same slots.
 * @param {readonly (RmmzMapEvent | null)[]} before The event list before the change.
 * @param {readonly (RmmzMapEvent | null)[]} after The event list after it.
 * @returns {string | null} Why, or null.
 */
const eventsRefusal = (before: readonly (RmmzMapEvent | null)[], after: readonly (RmmzMapEvent | null)[]): string | null =>
{
  const was = heldSlots(before);
  const now = heldSlots(after);
  if ([ ...now ].some(slot => was.has(slot) === false))
  {
    return BLUEPRINT_EVENTS_ADDED;
  }

  if ([ ...was ].some(slot => now.has(slot) === false))
  {
    return BLUEPRINT_EVENTS_REMOVED;
  }

  return after.some((event, slot) => event !== null && event.id !== slot)
    ? BLUEPRINT_EVENT_IDS
    : null;
};

/**
 * Says why a change to a blueprint's tiles cannot stand: it reached a layer the blueprint does not carry, or any layer of
 * a blueprint carrying none, or a window that cannot tell which layers it carries; or null when every value it changed
 * lies on a layer the blueprint carries, or none changed.
 * @param {readonly number[]} before The tile data before the change.
 * @param {readonly number[]} after The tile data after it, of the same size.
 * @param {number} plane How many cells one layer holds.
 * @param {CarriedLayers} carried The layers the blueprint carries, as far as the window can tell.
 * @returns {string | null} Why, or null.
 */
const tilesRefusal = (before: readonly number[], after: readonly number[], plane: number, carried: CarriedLayers): string | null =>
{
  const changed = new Set<number>();
  before.forEach((value, index) =>
  {
    if (after[index] !== value)
    {
      changed.add(Math.floor(index / plane));
    }
  });

  if (changed.size === 0)
  {
    return null;
  }

  if (carried === undefined)
  {
    return BLUEPRINTS_UNREAD;
  }

  if (carried === null)
  {
    return BLUEPRINT_NO_TILES;
  }

  return [ ...changed ].every(layer => carried.includes(layer))
    ? null
    : layersKeptMessage(carried);
};

/**
 * Says why a change to a blueprint opened as a map cannot stand, in words for the author, by comparing the map as it was
 * with the map as the change leaves it. For now a blueprint's size and its events are fixed: growing it would paint over
 * cells its placements never covered, and removing an event would delete events on every map. So the change may move events
 * about inside it and change anything about them but their ids, and change the tiles of the layers it carries; nothing
 * else. Its size, its set of events, their ids, the map's own settings (which are no part of a blueprint) and every layer
 * it does not carry stay as they are. The first broken rule is the one named, the size first.
 * @param {RmmzMap} before The map before the change.
 * @param {RmmzMap} after The map after it.
 * @param {CarriedLayers} carried The layers the blueprint carries, as far as the window can tell.
 * @returns {string | null} Why it cannot stand, or null when it can.
 */
const blueprintEditRefusal = (before: RmmzMap, after: RmmzMap, carried: CarriedLayers): string | null =>
{
  if (before.width !== after.width || before.height !== after.height)
  {
    return BLUEPRINT_RESIZED;
  }

  const events = eventsRefusal(before.events, after.events);
  if (events !== null)
  {
    return events;
  }

  // everything else at the top of the file is the map's own settings, which are no part of a blueprint.
  const { data: beforeData, events: _beforeEvents, ...beforeSettings } = before;
  const { data: afterData, events: _afterEvents, ...afterSettings } = after;
  if (jsonEquals(beforeSettings, afterSettings) === false)
  {
    return BLUEPRINT_SETTINGS;
  }

  return tilesRefusal(beforeData, afterData, before.width * before.height, carried);
};

/**
 * Finds a blueprint as the window's blueprints hold it, as far as the window can tell.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @param {string} blueprintId The blueprint.
 * @returns {Blueprint | null | undefined} The blueprint; null once the blueprints no longer hold it; undefined while the
 * window does not hold the blueprints.
 */
const heldBlueprintIn = (hub: Pick<DocumentHub, 'has' | 'document'>, blueprintId: string): Blueprint | null | undefined =>
{
  return hub.has(BLUEPRINTS_DOCUMENT)
    ? blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId)
    : undefined;
};

/**
 * Reads the layers a blueprint carries, as far as a window can tell.
 * @param {Blueprint | undefined} blueprint The blueprint, or undefined while the window does not hold the blueprints.
 * @returns {CarriedLayers} The layers, null for none, or undefined when it cannot tell.
 */
const carriedLayersOf = (blueprint: Blueprint | undefined): CarriedLayers =>
{
  if (blueprint === undefined)
  {
    return undefined;
  }

  return blueprint.stamp.tiles === null
    ? null
    : blueprint.stamp.tiles.layers;
};

/**
 * Lists the blueprints opened as maps an edit changes, each once, in the order it first changed them.
 * @param {Parameters<CommitCheck>[0]} transaction The edit.
 * @returns {{ key: DocumentKey, blueprintId: string }[]} Each one's key and blueprint.
 */
const blueprintMapsIn = (transaction: Parameters<CommitCheck>[0]): { key: DocumentKey; blueprintId: string }[] =>
{
  const keys = [ ...new Set(transaction.entries.map(entry => entry.document)) ];
  return keys.flatMap(key =>
  {
    const parsed = parseDocumentKey(key);
    return parsed.kind === 'blueprint-map'
      ? [ { key, blueprintId: parsed.blueprintId } ]
      : [];
  });
};

/**
 * Builds the check every edit a window makes passes before it becomes a step (see DocumentHub's addCommitCheck), which
 * keeps every blueprint opened as a map to what a blueprint may change (see {@link blueprintEditRefusal}), whatever tool
 * made the edit: the painting tools, the event tools, the quick panel, an event's window, a stamp. A blueprint the
 * blueprints no longer hold takes no change at all. Edits to anything else pass untouched.
 * @param {Pick<DocumentHub, 'has' | 'document'>} hub The window's documents.
 * @returns {CommitCheck} The check.
 */
const blueprintShapeCheck = (hub: Pick<DocumentHub, 'has' | 'document'>): CommitCheck =>
{
  return transaction =>
  {
    for (const { key, blueprintId } of blueprintMapsIn(transaction))
    {
      const blueprint = heldBlueprintIn(hub, blueprintId);
      if (blueprint === null)
      {
        return BLUEPRINT_GONE;
      }

      // the edit is still open, its patches in the map, so the map without them is how it stood before.
      const map = hub.document(key) as MapDocument;
      const patches = transaction.entries.filter(entry => entry.document === key).map(entry => entry.patch);
      const refusal = blueprintEditRefusal(map.toJsonWithout(patches), map.toJson(), carriedLayersOf(blueprint));
      if (refusal !== null)
      {
        return refusal;
      }
    }

    return null;
  };
};

export {
  BLUEPRINT_EVENT_IDS,
  BLUEPRINT_EVENTS_ADDED,
  BLUEPRINT_EVENTS_REMOVED,
  BLUEPRINT_NO_TILES,
  BLUEPRINT_RESIZED,
  BLUEPRINT_SETTINGS,
  blueprintEditRefusal,
  BLUEPRINTS_UNREAD,
  blueprintShapeCheck,
  layersKeptMessage,
};
export type { CarriedLayers };
