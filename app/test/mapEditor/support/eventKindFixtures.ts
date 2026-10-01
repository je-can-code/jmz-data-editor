import { DocumentHub } from '../../../src/mapEditor/core/history/DocumentHub.ts';
import type { EventEdit } from '../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { createEventPage, createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import { cloneJson, type JsonValue } from '../../../src/mapEditor/core/model/json.ts';
import { applyJsonPatch, createSetPatch, createSplicePatch } from '../../../src/mapEditor/core/model/patches.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMap, RmmzMapEvent } from '../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMapJson } from './fixtures.ts';

/**
 * Builds one command.
 * @param {number} code The command code.
 * @param {JsonValue[]} parameters Its parameters.
 * @param {number} indent Its indent.
 * @returns {RmmzEventCommand} The command.
 */
const command = (code: number, parameters: JsonValue[] = [], indent = 0): RmmzEventCommand =>
{
  return { code, indent, parameters };
};

/**
 * Builds a Show Text and its lines.
 * @param {string[]} lines The text, one entry per line.
 * @param {number} indent Its indent.
 * @param {string} faceName The face sheet, or empty.
 * @returns {RmmzEventCommand[]} The command and its lines.
 */
const text = (lines: string[], indent = 0, faceName = ''): RmmzEventCommand[] =>
{
  return [ command(101, [ faceName, 0, 0, 2, '' ], indent), ...lines.map(line => command(401, [ line ], indent)) ];
};

/**
 * Builds a page running the given commands, closed with the empty command, over MZ's fresh page.
 * @param {RmmzEventCommand[]} list The commands, without the closing one.
 * @param {Partial<RmmzEventPage>} overrides Anything else to change on the page.
 * @returns {RmmzEventPage} The page.
 */
const page = (list: RmmzEventCommand[], overrides: Partial<RmmzEventPage> = {}): RmmzEventPage =>
{
  return { ...createEventPage(), list: [ ...list, command(0) ], ...overrides };
};

/**
 * Builds an event with the given pages.
 * @param {number} id The event id.
 * @param {RmmzEventPage[]} pages The pages.
 * @param {Partial<RmmzMapEvent>} overrides Anything else to change on the event.
 * @returns {RmmzMapEvent} The event.
 */
const event = (id: number, pages: RmmzEventPage[], overrides: Partial<RmmzMapEvent> = {}): RmmzMapEvent =>
{
  return { ...createMapEvent(id, 1, 1), pages, ...overrides };
};

/**
 * The opening route every shipped chest turns through, and the lines repeating its steps.
 * @returns {RmmzEventCommand[]} The route command and its lines.
 */
const chestRoute = (): RmmzEventCommand[] =>
{
  const steps: JsonValue[] = [ { code: 36 }, { code: 17 }, { code: 15, parameters: [ 3 ] }, { code: 18 }, { code: 15, parameters: [ 3 ] } ];
  return [
    command(205, [ 0, { repeat: false, skippable: false, wait: true, list: [ ...steps, { code: 0 } ] } ]),
    ...steps.map(step => command(505, [ step ])),
  ];
};

/**
 * The closed page picture of the glass chests the game ships.
 */
const CLOSED_GLASS = { tileId: 0, characterName: '$chest-glass-2', direction: 2, pattern: 0, characterIndex: 0 };

/**
 * The open page picture of the glass chests the game ships.
 */
const OPEN_GLASS = { tileId: 0, characterName: '$chest-glass-2', direction: 6, pattern: 2, characterIndex: 0 };

/**
 * Builds a chest shaped like the game's "chest-ore": the sound, the route, self switch A, a line, a found line,
 * ten of item 32, then two more lines; its opened page says it is empty.
 * @param {number} id The event id.
 * @param {RmmzEventCommand[]} opening The closed page's commands, when a test wants others.
 * @returns {RmmzMapEvent} The chest.
 */
const oreChest = (id: number, opening?: RmmzEventCommand[]): RmmzMapEvent =>
{
  const commands = opening ?? [
    command(250, [ { name: 'Chest1', volume: 90, pitch: 100, pan: 0 } ]),
    ...chestRoute(),
    command(123, [ 'A', 0 ]),
    ...text([ 'A bundle of ore!' ], 0, 'face_je'),
    ...text([ '"Silver Ore" x10 was found!' ]),
    command(126, [ 32, 0, 0, 10 ]),
    ...text([ 'We will make', 'a weapon of it.' ], 0, 'face_je'),
  ];

  return event(id, [
    page(commands, { image: { ...CLOSED_GLASS }, directionFix: true, walkAnime: false, priorityType: 1 }),
    page(text([ 'Nothing to see here.' ]), {
      conditions: { ...createEventPage().conditions, selfSwitchValid: true },
      image: { ...OPEN_GLASS },
      directionFix: true,
      walkAnime: false,
      priorityType: 1,
    }),
  ], { name: 'chest-ore' });
};

/**
 * Builds the page of a plain transfer: a footstep sound, then the transfer.
 * @param {number[]} transfer The Transfer Player parameters: designation, map, x, y, direction, fade.
 * @param {RmmzEventCommand[]} extra More commands to put before the transfer.
 * @returns {RmmzEventPage} The page.
 */
const transferPage = (transfer: number[] = [ 0, 5, 3, 4, 2, 0 ], extra: RmmzEventCommand[] = []): RmmzEventPage =>
{
  return page([ ...extra, command(250, [ { name: 'Move1', volume: 90, pitch: 100, pan: 0 } ]), command(201, transfer) ], { trigger: 1 });
};

/**
 * Builds a hub holding the fixture map with the given events in their slots.
 * @param {RmmzMapEvent[]} events The events; each goes in the slot its id names.
 * @returns {{ hub: DocumentHub, map: RmmzMap }} The hub, and the map file it started from.
 */
const hubWith = (events: RmmzMapEvent[]): { hub: DocumentHub; map: RmmzMap } =>
{
  const map = buildMapJson();
  const size = Math.max(map.events.length, ...events.map(each => each.id + 1));
  map.events = Array.from({ length: size }, (_, id) => events.find(each => each.id === id) ?? null);
  const hub = new DocumentHub({ clientId: 'window-a' });
  hub.adopt('map:1', cloneJson(map) as unknown as JsonValue);
  return { hub, map };
};

/**
 * Reads an event from a hub's fixture map.
 * @param {DocumentHub} hub The hub.
 * @param {number} id The event id.
 * @returns {RmmzMapEvent | null} The event.
 */
const eventIn = (hub: DocumentHub, id: number): RmmzMapEvent | null =>
{
  return hub.map('map:1').event(id);
};

/**
 * Applies a field's edits to a copy of an event, as the hub would apply them to its slot.
 * @param {RmmzMapEvent} target The event.
 * @param {readonly EventEdit[]} edits The edits.
 * @returns {RmmzMapEvent} The edited copy.
 */
const applyEdits = (target: RmmzMapEvent, edits: readonly EventEdit[]): RmmzMapEvent =>
{
  const root = { event: cloneJson(target) as unknown as JsonValue };
  edits.forEach(edit =>
  {
    const path = [ 'event', ...edit.path ];
    const patch = edit.kind === 'set'
      ? createSetPatch(root, path, edit.value)
      : createSplicePatch(root, path, edit.index, edit.deleteCount, edit.inserted);
    applyJsonPatch(root, patch);
  });

  return root.event as unknown as RmmzMapEvent;
};

export { applyEdits, chestRoute, CLOSED_GLASS, command, event, eventIn, hubWith, OPEN_GLASS, oreChest, page, text, transferPage };
