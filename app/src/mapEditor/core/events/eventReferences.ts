import type { JsonValue } from '../model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';

/**
 * Finds which of a command's parameters name a character, by command code: what RMMZ hands to
 * {@code Game_Interpreter.character}, which reads -1 as the player, 0 as the event running the command, and anything
 * above as the event with that id on the map. Each entry follows the engine's own command, in {@code rmmz_objects.js}.
 * Commands not listed name no event by id; a script or a plugin's parameters may, but no reading of them is safe.
 */
const CHARACTER_PARAMETERS: Readonly<Record<number, (parameters: readonly JsonValue[]) => readonly number[]>> = {
  // conditional branch on a character's direction (command111, case 6).
  111: parameters => (parameters[0] === 6 ? [ 1 ] : []),

  // control variables from game data (operand 3) about a character (5) (command122, gameDataOperand).
  122: parameters => (parameters[3] === 3 && parameters[4] === 5 ? [ 5 ] : []),

  // set event location: the event moved, and, when it exchanges places (any designation but 0 and 1, as the engine
  // reads it), the other event too (command203).
  203: parameters => (parameters[1] === 0 || parameters[1] === 1 ? [ 0 ] : [ 0, 2 ]),

  // set movement route (command205), show animation (command212) and show balloon icon (command213).
  205: () => [ 0 ],
  212: () => [ 0 ],
  213: () => [ 0 ],

  // get location info designated by a character (any designation but 0 and 1, as the engine reads it) (command285).
  285: parameters => (parameters[2] === 0 || parameters[2] === 1 ? [] : [ 3 ]),
};

/**
 * Rewires one command's references to the group: each character parameter naming a copied event names its copy.
 * @param {RmmzEventCommand} command The command.
 * @param {ReadonlyMap<number, number>} newIds The group's old ids, to their copies' new ids.
 * @returns {RmmzEventCommand} The command itself when it names none of the group, or a rewired copy.
 */
const rewireCommand = (command: RmmzEventCommand, newIds: ReadonlyMap<number, number>): RmmzEventCommand =>
{
  const named = CHARACTER_PARAMETERS[command.code]?.(command.parameters) ?? [];
  const moved = named.filter(index => newIds.has(command.parameters[index] as number));
  if (moved.length === 0)
  {
    return command;
  }

  // only a copied event's id moves; the player (-1), the event itself (0) and events left behind stay as they are.
  const parameters = [ ...command.parameters ];
  moved.forEach(index =>
  {
    parameters[index] = newIds.get(parameters[index] as number) as number;
  });
  return { ...command, parameters };
};

/**
 * Rewires a pasted event's references to the rest of its group: every command on its pages naming one of the copied
 * events by its old id names that event's copy instead, so a door that moves its own guard still moves its own guard
 * once both are pasted. References to the player, to the event itself and to events outside the group are left as
 * they are, as MZ leaves them.
 * @param {RmmzMapEvent} event The pasted event.
 * @param {ReadonlyMap<number, number>} newIds The group's old ids, to their copies' new ids.
 * @returns {RmmzMapEvent} The event with its references rewired; commands that name none of the group are the
 * event's own objects, not copies.
 */
const rewireGroupReferences = (event: RmmzMapEvent, newIds: ReadonlyMap<number, number>): RmmzMapEvent =>
{
  const pages = event.pages.map((page): RmmzEventPage => ({ ...page, list: page.list.map(command => rewireCommand(command, newIds)) }));
  return { ...event, pages };
};

export { rewireGroupReferences };
