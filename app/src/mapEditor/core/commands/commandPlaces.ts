import type { MapLocation } from '../locations/LocationPicks.ts';
import type { CommandCatalogEntry, CommandPlace } from './catalogTypes.ts';
import type { FieldValues } from './commandFields.ts';
import { applyFieldChange, type CommandDraft } from './fieldValues.ts';

/**
 * Lists the places whose picker goes after a field: those the field finishes, as their y, with all three of their
 * fields showing. A place partly hidden, such as one given by variables instead, has nothing to pick.
 * @param {readonly CommandPlace[]} places The entry's places.
 * @param {string} key The field.
 * @param {ReadonlySet<string>} shown The keys of the fields showing.
 * @returns {CommandPlace[]} The places to offer a picker for after the field.
 */
const placesEndingAt = (places: readonly CommandPlace[], key: string, shown: ReadonlySet<string>): CommandPlace[] =>
{
  return places.filter(place => place.y === key && shown.has(place.map) && shown.has(place.x) && shown.has(place.y));
};

/**
 * Reads a place out of a form's values, where a picker for it starts.
 * @param {FieldValues} values The form's values.
 * @param {CommandPlace} place The place.
 * @returns {MapLocation} The map and the tile the place names now.
 */
const placeIn = (values: FieldValues, place: CommandPlace): MapLocation =>
{
  return { mapId: values[place.map] as number, x: values[place.x] as number, y: values[place.y] as number };
};

/**
 * Writes a place picked on the map into a command, the map first and then the tile, each the way the form writes
 * that field, so the result is what typing all three would have made.
 * @param {CommandCatalogEntry} entry The command's entry.
 * @param {CommandDraft} draft The command and its lines.
 * @param {CommandPlace} place The place.
 * @param {MapLocation} location The map and the tile picked.
 * @returns {CommandDraft} The command and its lines, with the place picked.
 */
const applyPlace = (entry: CommandCatalogEntry, draft: CommandDraft, place: CommandPlace, location: MapLocation): CommandDraft =>
{
  const withMap = applyFieldChange(entry, draft, place.map, location.mapId);
  const withX = applyFieldChange(entry, withMap, place.x, location.x);
  return applyFieldChange(entry, withX, place.y, location.y);
};

export { applyPlace, placeIn, placesEndingAt };
