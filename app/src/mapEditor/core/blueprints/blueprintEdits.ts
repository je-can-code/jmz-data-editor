import type { DocumentHub } from '../history/DocumentHub.ts';
import { blueprintHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { isJsonObject, type JsonValue } from '../model/json.ts';
import type { Stamp } from '../stamps/stamp.ts';
import type { BlueprintCopyCount } from './blueprintCopies.ts';
import { withoutBlueprintLink } from './blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, newBlueprintId, savedBlueprintOf, type Blueprint } from './blueprints.ts';

/**
 * What an edit to the blueprints came to: the step it recorded (null when it changed nothing) and the blueprint as it
 * now stands (null once deleted); or why it was refused, in words for the author. A refused edit changes nothing.
 */
type BlueprintOutcome =
  | { readonly ok: true; readonly step: HistoryStep | null; readonly blueprint: Blueprint | null }
  | { readonly ok: false; readonly message: string };

/**
 * How many maps a refused delete names before it sums up the rest.
 */
const MAPS_NAMED = 4;

/**
 * Why a blueprint cannot be named nothing.
 */
const NAME_NEEDED = 'Give the blueprint a name.';

/**
 * Why an edit to a blueprint found none: deleted, or its save undone, in this window or another, since it was shown.
 */
const BLUEPRINT_GONE = 'That blueprint is no longer there.';

/**
 * Finds a blueprint the window holds, by its id.
 * @param {DocumentHub} hub The window's documents; the blueprints document must be held.
 * @param {string} blueprintId The blueprint's id.
 * @returns {Blueprint | null} The blueprint, or null when there is none of that id.
 */
const heldBlueprint = (hub: DocumentHub, blueprintId: string): Blueprint | null =>
{
  return blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId);
};

/**
 * A stamp with its events' links taken out, or why one of them could not lose its link cleanly.
 */
type UnlinkedStamp = { readonly ok: true; readonly stamp: Stamp } | { readonly ok: false; readonly message: string };

/**
 * Takes the links out of a stamp's events, and the placements of other blueprints out of its tiles, so what a blueprint
 * keeps is its own and not copies of another's: a stamp copied off linked copies would otherwise save the links of the
 * blueprint they came from, and placing it would record placements of that blueprint too.
 * @param {Stamp} stamp The stamp.
 * @returns {UnlinkedStamp} The stamp with nothing linked, or, for the author, why an event's note could not lose its link
 * cleanly.
 */
const unlinkedStamp = (stamp: Stamp): UnlinkedStamp =>
{
  const events = [];
  for (const event of stamp.events)
  {
    try
    {
      // spreading keeps the event's own key order, so the note stays where its file put it.
      events.push({ ...event, note: withoutBlueprintLink(event.note) });
    }
    catch (error)
    {
      return { ok: false, message: `in ${event.name}'s note, ${(error as Error).message}.` };
    }
  }

  const { spots: _spots, ...unplaced } = stamp;
  return { ok: true, stamp: { ...unplaced, events } };
};

/**
 * Saves a stamp as a blueprint, as one step in the new blueprint's own history: it is kept under a new id that never
 * changes, with the name given, trimmed, and the stamp as it stands, its events' notes freed of any link to another
 * blueprint. A name of nothing but spaces is refused.
 * @param {DocumentHub} hub The window's documents; the blueprints document must be held.
 * @param {Stamp} stamp The stamp.
 * @param {string} name What the author calls it.
 * @param {() => number} random Draws the new id's characters, a number from 0 up to but not including 1 each time.
 * @returns {BlueprintOutcome} The step and the blueprint, or why it was refused.
 */
const saveBlueprint = (hub: DocumentHub, stamp: Stamp, name: string, random: () => number): BlueprintOutcome =>
{
  const trimmed = name.trim();
  if (trimmed === '')
  {
    return { ok: false, message: NAME_NEEDED };
  }

  const unlinked = unlinkedStamp(stamp);
  if (unlinked.ok === false)
  {
    return { ok: false, message: `This stamp can't be saved as a blueprint: ${unlinked.message}` };
  }

  const blueprintId = newBlueprintId(id => heldBlueprint(hub, id) !== null, random);
  const step = hub.edit(`Save blueprint "${trimmed}"`, [ blueprintHistoryKey(blueprintId) ], tx =>
  {
    tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', blueprintId ], savedBlueprintOf(trimmed, unlinked.stamp));
  });

  return { ok: true, step, blueprint: heldBlueprint(hub, blueprintId) };
};

/**
 * Renames a blueprint, as one step in its own history; its id, and so every copy's link, stays as it was. The name is
 * trimmed; a name of nothing but spaces is refused, and the name it already has changes nothing.
 * @param {DocumentHub} hub The window's documents; the blueprints document must be held.
 * @param {string} blueprintId The blueprint.
 * @param {string} name Its new name.
 * @returns {BlueprintOutcome} The step and the renamed blueprint, or why it was refused.
 */
const renameBlueprint = (hub: DocumentHub, blueprintId: string, name: string): BlueprintOutcome =>
{
  const blueprint = heldBlueprint(hub, blueprintId);
  const trimmed = name.trim();
  if (blueprint === null)
  {
    return { ok: false, message: BLUEPRINT_GONE };
  }

  if (trimmed === '')
  {
    return { ok: false, message: NAME_NEEDED };
  }

  if (trimmed === blueprint.name)
  {
    return { ok: true, step: null, blueprint };
  }

  const step = hub.edit(`Rename "${blueprint.name}" to "${trimmed}"`, [ blueprintHistoryKey(blueprintId) ], tx =>
  {
    tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', blueprintId, 'name' ], trimmed);
  });

  return { ok: true, step, blueprint: heldBlueprint(hub, blueprintId) };
};

/**
 * Words where a blueprint is used, for a refused delete: each map by name, by map id, the first few named and the rest
 * summed up.
 * @param {BlueprintCopyCount} copies Where the blueprint is used.
 * @param {(mapId: number) => string} mapName Names a map as the author knows it.
 * @returns {string} The words, such as "Forest Path and Goblin Den".
 */
const mapsPhrase = (copies: BlueprintCopyCount, mapName: (mapId: number) => string): string =>
{
  const named = copies.maps.slice(0, MAPS_NAMED).map(({ mapId }) => mapName(mapId));
  const others = copies.maps.length - named.length;
  if (others > 0)
  {
    named.push(others === 1 ? '1 other map' : `${others} other maps`);
  }

  return named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
};

/**
 * Words how a blueprint is still used, never calling its placements and its linked events by one name: how many times its
 * tiles are placed, and how many events are linked to it, whichever there are.
 * @param {BlueprintCopyCount} copies Where the blueprint is used, with how many of those uses are placements.
 * @returns {string} The words, such as "is still placed 3 times and has 15 linked events", or "still has 1 linked event".
 */
const usesPhrase = (copies: BlueprintCopyCount): string =>
{
  const placements = copies.placements ?? 0;
  const events = copies.total - placements;
  const eventWords = events === 1 ? '1 linked event' : `${events} linked events`;
  if (placements === 0)
  {
    return `still has ${eventWords}`;
  }

  const placed = `is still placed ${placements === 1 ? 'once' : `${placements} times`}`;
  return events === 0
    ? placed
    : `${placed} and has ${eventWords}`;
};

/**
 * Says why a blueprint must not go while it is still used, in the words a refused delete uses: how many times it is
 * placed and how many events are linked to it, and on which maps, or that its linked events are still being counted, or
 * cannot be, since it could have some nobody has counted yet. Whatever would take it away is refused in these words: a
 * delete, the undo of its save, the redo of its delete.
 * @param {string} name The blueprint's name.
 * @param {BlueprintCopyCount | null} copies Where it is used across the project, or null while that cannot be told.
 * @param {(mapId: number) => string} mapName Names a map as the author knows it.
 * @returns {string | null} Why, with no full stop of its own, or null when nothing uses it.
 */
const copiesKeepIt = (name: string, copies: BlueprintCopyCount | null, mapName: (mapId: number) => string): string | null =>
{
  if (copies === null)
  {
    return `"${name}" can't be deleted until its linked events have been counted`;
  }

  if (copies.total === 0)
  {
    return null;
  }

  return `"${name}" ${usesPhrase(copies)}, on ${mapsPhrase(copies, mapName)}, so it can't be deleted`;
};

/**
 * Deletes a blueprint, as one step in its own history, but only once nothing is a copy of it: a blueprint with copies is
 * refused, saying how many there are and on which maps, since every one of them names it. So is one whose copies are
 * still being counted, or cannot be, since it could have copies nobody has counted yet.
 * @param {DocumentHub} hub The window's documents; the blueprints document must be held.
 * @param {string} blueprintId The blueprint.
 * @param {BlueprintCopyCount | null} copies Its copies across the project, or null while they cannot be told.
 * @param {(mapId: number) => string} mapName Names a map as the author knows it.
 * @returns {BlueprintOutcome} The step, or why it was refused.
 */
const deleteBlueprint = (
  hub: DocumentHub,
  blueprintId: string,
  copies: BlueprintCopyCount | null,
  mapName: (mapId: number) => string,
): BlueprintOutcome =>
{
  const blueprint = heldBlueprint(hub, blueprintId);
  if (blueprint === null)
  {
    return { ok: false, message: BLUEPRINT_GONE };
  }

  const kept = copiesKeepIt(blueprint.name, copies, mapName);
  if (kept !== null)
  {
    return { ok: false, message: `${kept}.` };
  }

  const step = hub.edit(`Delete blueprint "${blueprint.name}"`, [ blueprintHistoryKey(blueprintId) ], tx =>
  {
    tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', blueprintId ], undefined);
  });

  return { ok: true, step, blueprint: null };
};

/**
 * Reads the name a value written to a blueprint's entry carries: the entry's name, or the name itself.
 * @param {JsonValue | undefined} value The value: a whole entry, a name, or nothing.
 * @returns {string | null} The name, or null when it carries none.
 */
const nameCarried = (value: JsonValue | undefined): string | null =>
{
  if (typeof value === 'string')
  {
    return value;
  }

  const name = isJsonObject(value) ? value['name'] : undefined;
  return typeof name === 'string' ? name : null;
};

/**
 * Finds the name a blueprint last had, from the steps of its own history, for a blueprint the blueprints no longer hold:
 * one deleted, or its save undone, whose history still lists its steps by the name it had. A step saving it, renaming it
 * or deleting it writes its name, which reads as the name after the step, or, for a delete, the name it went with.
 * @param {readonly HistoryStep[]} steps The history's steps, the one holding its latest name first: those done, newest
 * first, then those undone, the next to redo first.
 * @param {string} blueprintId The blueprint.
 * @returns {string | null} The name, or null when no step names it.
 */
const nameInSteps = (steps: readonly HistoryStep[], blueprintId: string): string | null =>
{
  for (const step of steps)
  {
    const patches = step.entries.filter(entry => entry.document === BLUEPRINTS_DOCUMENT).map(entry => entry.patch).reverse();
    for (const patch of patches)
    {
      // a save or a delete writes the whole entry, and a rename its name alone.
      const [ data, blueprints, id, field ] = patch.kind === 'set' ? patch.path : [];
      const reaches = data === 'data' && blueprints === 'blueprints' && id === blueprintId && (field === undefined || field === 'name');
      const name = reaches && patch.kind === 'set' ? nameCarried(patch.after) ?? nameCarried(patch.before) : null;
      if (name !== null)
      {
        return name;
      }
    }
  }

  return null;
};

export { BLUEPRINT_GONE, copiesKeepIt, deleteBlueprint, nameInSteps, renameBlueprint, saveBlueprint };
export type { BlueprintOutcome };
