import {
  parseTransferPlayer,
  TRANSFER_DESIGNATION,
  TRANSFER_DIRECTIONS,
  TRANSFER_FADES,
  TRANSFER_PLAYER_CODE,
  writeTransferPlayer,
  type TransferPlayerModel,
} from '../commands/editors/transferPlayer.ts';
import { SHOW_TEXT_CODE } from '../commands/editors/showText.ts';
import type { MapLocation } from '../locations/LocationPicks.ts';
import type { JsonValue } from '../model/json.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { isEmptyPage, readFlatUnits, readMessage } from './eventPages.ts';
import type { EventEdit, QuickField, QuickModel } from './quickFields.ts';

/**
 * The id the core registers transfers under.
 */
const TRANSFER_KIND_ID = 'core.transfer';

/**
 * What may share a page with its transfer without making the page anything more than a transfer: sounds and music,
 * screen fades, tints, flashes and shakes, waits, animations and balloons, move routes, followers, notes, and the
 * bookkeeping doors and teleports carry along (a common event, a switch recording that a gate is open, a variable, a
 * plugin command). Anything that talks, asks or branches makes the page a scene that happens to end in a transfer,
 * which is not a transfer.
 */
const TRANSFER_COMPANIONS: ReadonlySet<number> = new Set([
  108, 117, 121, 122, 205, 211, 212, 213, 216, 217, 221, 222, 223, 224, 225, 230, 241, 242, 243, 244, 245, 246, 249, 250, 251, 357,
]);

/**
 * What a transfer's other pages may hold, such as a locked door's "it won't open": talk, and the sounds, waits,
 * balloons, animations, routes and screen effects that go with it. Nothing that changes the game, and no comments,
 * since a comment can make a page a plugin's (a battler's tag, say).
 */
const MESSAGE_PAGE_CODES: ReadonlySet<number> = new Set([
  101, 205, 211, 212, 213, 221, 222, 223, 224, 225, 230, 241, 242, 243, 244, 245, 246, 249, 250, 251,
]);

/**
 * The largest tile coordinate a map can have: MZ maps are at most 256 tiles on a side.
 */
const MAX_COORDINATE = 255;

/**
 * One transfer on an event: the page it is on, where its command sits in that page's list, and where it sends the
 * player.
 */
type TransferSpot = {
  readonly pageIndex: number;
  readonly listIndex: number;
  readonly model: TransferPlayerModel;
};

/**
 * Reads a page whose job is to transfer the player: exactly one Transfer Player, naming its map and tile directly,
 * at the top level (so it always happens), with nothing beside it but {@link TRANSFER_COMPANIONS}.
 * @param {RmmzEventPage} page The page.
 * @param {number} pageIndex The page's index in its event.
 * @returns {TransferSpot | null} The transfer, or null when the page is anything else.
 */
const readTransferPage = (page: RmmzEventPage, pageIndex: number): TransferSpot | null =>
{
  const units = readFlatUnits(page.list);
  if (units === null)
  {
    return null;
  }

  const transfers = units.filter(unit => unit.command.code === TRANSFER_PLAYER_CODE);
  const others = units.filter(unit => unit.command.code !== TRANSFER_PLAYER_CODE);
  if (transfers.length !== 1 || others.some(unit => TRANSFER_COMPANIONS.has(unit.command.code) === false))
  {
    return null;
  }

  // a transfer reading its destination from variables goes wherever the game says at the time; this kind edits
  // destinations it can name.
  const [ unit ] = transfers;
  const model = parseTransferPlayer(unit.command);
  return model === null || model.designation !== TRANSFER_DESIGNATION.direct
    ? null
    : { pageIndex, listIndex: unit.index, model };
};

/**
 * Reports whether a page only says something, with the sounds and flourishes that go with it: what a locked door
 * shows until the switch that opens it is on.
 * @param {RmmzEventPage} page The page.
 * @returns {boolean} True for a message page.
 */
const isMessagePage = (page: RmmzEventPage): boolean =>
{
  const units = readFlatUnits(page.list);
  return units !== null
    && units.length > 0
    && units.every(unit => MESSAGE_PAGE_CODES.has(unit.command.code) && (unit.command.code !== SHOW_TEXT_CODE || readMessage(unit) !== null));
};

/**
 * Reads an event as a transfer: at least one transfer page, and every other page empty or only a message (a door
 * that says it is locked until a switch opens it). A door whose other page is a battler, a scene or a check that
 * changes the game is more than a transfer, and is left for a kind that knows it.
 * @param {RmmzMapEvent} event The event.
 * @returns {TransferSpot[] | null} Its transfers in page order, or null when it is not a transfer.
 */
const readTransfers = (event: RmmzMapEvent): TransferSpot[] | null =>
{
  const spots: TransferSpot[] = [];
  for (const [ pageIndex, page ] of event.pages.entries())
  {
    const spot = isEmptyPage(page)
      ? null
      : readTransferPage(page, pageIndex);
    if (spot !== null)
    {
      spots.push(spot);
      continue;
    }

    if (isEmptyPage(page) === false && isMessagePage(page) === false)
    {
      return null;
    }
  }

  return spots.length > 0
    ? spots
    : null;
};

/**
 * Recognises a transfer: an event whose pages send the player somewhere, and do nothing more.
 * @param {RmmzMapEvent} event The event.
 * @returns {boolean} True for a transfer.
 */
const isTransfer = (event: RmmzMapEvent): boolean =>
{
  return readTransfers(event) !== null;
};

/**
 * Builds the settings of one transfer: the map, the tile, the two picked together on the map, the way the player faces
 * and the fade.
 * @param {RmmzMapEvent} event The event.
 * @param {TransferSpot} spot The transfer.
 * @param {number} ordinal Which of the event's transfers it is, from 0; the keys use it, so several transfers that
 * each hold one share their settings whatever page it sits on.
 * @param {boolean} several Whether the event has more than one transfer, which names each by its page.
 * @returns {QuickField[]} The settings.
 */
const transferFields = (event: RmmzMapEvent, spot: TransferSpot, ordinal: number, several: boolean): QuickField[] =>
{
  const { pageIndex, listIndex, model } = spot;
  const command = event.pages[pageIndex].list[listIndex];
  const section = several ? `Page ${pageIndex + 1}` : '';
  const key = `transfer.${ordinal}`;

  /**
   * Rewrites the transfer with some of its values changed.
   * @param {Partial<TransferPlayerModel>} changes The new values.
   * @returns {EventEdit[]} The edit.
   */
  const write = (changes: Partial<TransferPlayerModel>): EventEdit[] => [ {
    kind: 'set',
    path: [ 'pages', pageIndex, 'list', listIndex ],
    value: writeTransferPlayer(command, { ...model, ...changes }) as unknown as JsonValue,
  } ];

  const coordinate = { kind: 'number', min: 0, max: MAX_COORDINATE } as const;
  const place: MapLocation = { mapId: model.mapId, x: model.x, y: model.y };
  return [
    { key: `${key}.map`, label: 'Map', section, control: { kind: 'map' }, value: model.mapId, step: 'Change transfer destination', write: value => write({ mapId: value as number }) },
    { key: `${key}.x`, label: 'X', section, control: coordinate, value: model.x, step: 'Change transfer destination', write: value => write({ x: value as number }) },
    { key: `${key}.y`, label: 'Y', section, control: coordinate, value: model.y, step: 'Change transfer destination', write: value => write({ y: value as number }) },
    { key: `${key}.place`, label: 'Pick on the map', section, control: { kind: 'place' }, value: place, step: 'Change transfer destination', write: value => write(value as unknown as MapLocation) },
    { key: `${key}.direction`, label: 'Facing', section, control: { kind: 'select', options: TRANSFER_DIRECTIONS }, value: model.direction, step: 'Change transfer facing', write: value => write({ direction: value as number }) },
    { key: `${key}.fade`, label: 'Fade', section, control: { kind: 'select', options: TRANSFER_FADES }, value: model.fade, step: 'Change transfer fade', write: value => write({ fade: value as number }) },
  ];
};

/**
 * What a transfer's quick panel offers: each transfer's destination, facing and fade.
 * @param {RmmzMapEvent} event The event.
 * @returns {QuickModel} The settings; none for an event that is not a transfer.
 */
const transferQuickModel = (event: RmmzMapEvent): QuickModel =>
{
  const spots = readTransfers(event) ?? [];
  const several = spots.length > 1;
  return {
    fields: spots.flatMap((spot, ordinal) => transferFields(event, spot, ordinal, several)),
    actions: [],
  };
};

export { isMessagePage, isTransfer, MESSAGE_PAGE_CODES, readTransfers, TRANSFER_COMPANIONS, TRANSFER_KIND_ID, transferQuickModel };
export type { TransferSpot };
