import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { isWholeNumber, withParameters } from './commandShape.ts';

/**
 * The code of Transfer Player.
 */
const TRANSFER_PLAYER_CODE = 201;

/**
 * How a transfer names where it goes: the map and tile themselves, or variables holding them.
 */
const TRANSFER_DESIGNATION = {
  direct: 0,
  variables: 1,
} as const;

/**
 * The directions a transfer can leave the player facing; 0 keeps whatever way they faced.
 */
const TRANSFER_DIRECTIONS = [
  { value: 0, label: 'Keep facing' },
  { value: 2, label: 'Down' },
  { value: 4, label: 'Left' },
  { value: 6, label: 'Right' },
  { value: 8, label: 'Up' },
] as const;

/**
 * The screen fades a transfer can use.
 */
const TRANSFER_FADES = [
  { value: 0, label: 'Fade to black' },
  { value: 1, label: 'Fade to white' },
  { value: 2, label: 'No fade' },
] as const;

/**
 * A Transfer Player command read for editing. With the variables designation, the map, x and y hold variable
 * ids rather than the values themselves.
 */
type TransferPlayerModel = {
  readonly designation: number;
  readonly mapId: number;
  readonly x: number;
  readonly y: number;
  readonly direction: number;
  readonly fade: number;
};

/**
 * Reads a Transfer Player command.
 * @param {RmmzEventCommand} command The command.
 * @returns {TransferPlayerModel | null} The model, or null when the command is not MZ-shaped.
 */
const parseTransferPlayer = (command: RmmzEventCommand): TransferPlayerModel | null =>
{
  const { code, parameters } = command;
  if (code !== TRANSFER_PLAYER_CODE || parameters.length !== 6 || parameters.every(isWholeNumber) === false)
  {
    return null;
  }

  const [ designation, mapId, x, y, direction, fade ] = parameters as number[];
  return { designation, mapId, x, y, direction, fade };
};

/**
 * Writes a Transfer Player model back into its command.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {TransferPlayerModel} model Where it should now send the player.
 * @returns {RmmzEventCommand} The command.
 */
const writeTransferPlayer = (command: RmmzEventCommand, model: TransferPlayerModel): RmmzEventCommand =>
{
  const { designation, mapId, x, y, direction, fade } = model;
  return withParameters(command, [ designation, mapId, x, y, direction, fade ]);
};

/**
 * Switches how the transfer names its destination. The numbers mean different things either side of the
 * switch (a map id against a variable id), so they start over rather than carrying across.
 * @param {TransferPlayerModel} model The transfer.
 * @param {number} designation The new designation.
 * @returns {TransferPlayerModel} The transfer with the new designation.
 */
const setTransferDesignation = (model: TransferPlayerModel, designation: number): TransferPlayerModel =>
{
  if (designation === model.designation)
  {
    return model;
  }

  return designation === TRANSFER_DESIGNATION.direct
    ? { ...model, designation, mapId: 1, x: 0, y: 0 }
    : { ...model, designation, mapId: 1, x: 1, y: 1 };
};

export {
  parseTransferPlayer,
  setTransferDesignation,
  TRANSFER_DESIGNATION,
  TRANSFER_DIRECTIONS,
  TRANSFER_FADES,
  TRANSFER_PLAYER_CODE,
  writeTransferPlayer,
};
export type { TransferPlayerModel };
