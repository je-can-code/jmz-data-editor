import { EventMoveType } from '../model/eventModel.ts';
import type { RmmzEventPage, RmmzMoveRoute } from '../model/rmmzTypes.ts';

/**
 * The four movement fields the movement settings section edits, exactly as RMMZ stores them on a page.
 */
type EventMovementFields = Pick<RmmzEventPage, 'moveType' | 'moveSpeed' | 'moveFrequency' | 'moveRoute'>;

/**
 * One choice of {@link EventMovementFields.moveType}, in RMMZ's own order and wording.
 */
const MOVE_TYPE_OPTIONS = [
  { value: EventMoveType.fixed, label: 'Fixed' },
  { value: EventMoveType.random, label: 'Random' },
  { value: EventMoveType.approach, label: 'Approach' },
  { value: EventMoveType.custom, label: 'Custom' },
] as const;

/**
 * Reports whether a move type runs its own route, which is the only one of the four the route editor shows for.
 * Fixed, random and approach all ignore {@code moveRoute} entirely, so it sits unused rather than cleared: a page
 * switched away from Custom and back finds its route exactly as it left it.
 * @param {number} moveType One of {@link MOVE_TYPE_OPTIONS}.
 * @returns {boolean} True for Custom.
 */
const usesCustomRoute = (moveType: number): boolean =>
{
  return moveType === EventMoveType.custom;
};

/**
 * Changes how the page moves on its own. The route is left untouched, whichever way the change runs: a type that
 * does not use it does not need it cleared, and a type that does should find whatever was there before.
 * @param {EventMovementFields} fields The page's movement fields.
 * @param {number} moveType One of {@link MOVE_TYPE_OPTIONS}.
 * @returns {EventMovementFields} The fields with the new type.
 */
const withMoveType = (fields: EventMovementFields, moveType: number): EventMovementFields =>
{
  return { ...fields, moveType };
};

/**
 * Changes how fast the page moves on its own.
 * @param {EventMovementFields} fields The page's movement fields.
 * @param {number} moveSpeed One of {@link MOVE_SPEEDS}.
 * @returns {EventMovementFields} The fields with the new speed.
 */
const withMoveSpeed = (fields: EventMovementFields, moveSpeed: number): EventMovementFields =>
{
  return { ...fields, moveSpeed };
};

/**
 * Changes how often the page moves on its own.
 * @param {EventMovementFields} fields The page's movement fields.
 * @param {number} moveFrequency One of {@link MOVE_FREQUENCIES}.
 * @returns {EventMovementFields} The fields with the new frequency.
 */
const withMoveFrequency = (fields: EventMovementFields, moveFrequency: number): EventMovementFields =>
{
  return { ...fields, moveFrequency };
};

/**
 * Replaces the page's own route, as edited by the move route editor. Only read while {@link usesCustomRoute} is
 * true, but kept for every move type so a page can carry a prepared route before Custom is ever picked.
 * @param {EventMovementFields} fields The page's movement fields.
 * @param {RmmzMoveRoute} moveRoute The route.
 * @returns {EventMovementFields} The fields with the new route.
 */
const withMoveRoute = (fields: EventMovementFields, moveRoute: RmmzMoveRoute): EventMovementFields =>
{
  return { ...fields, moveRoute };
};

/**
 * A page's movement, read for editing. Nothing is derived beyond the stored fields themselves: unlike the image,
 * where a tile and a character sheet compete for one mode, a page's move type already says outright which of the
 * four ways it moves.
 */
type EventMovementModel = EventMovementFields;

/**
 * Reads a page's movement fields for the movement settings.
 * @param {EventMovementFields} fields The fields as stored.
 * @returns {EventMovementModel} The model.
 */
const parseEventMovement = (fields: EventMovementFields): EventMovementModel =>
{
  const { moveType, moveSpeed, moveFrequency, moveRoute } = fields;
  return { moveType, moveSpeed, moveFrequency, moveRoute };
};

/**
 * Writes the movement settings' model back in RMMZ's own field order.
 * @param {EventMovementModel} model The model.
 * @returns {EventMovementFields} The fields.
 */
const writeEventMovement = (model: EventMovementModel): EventMovementFields =>
{
  const { moveFrequency, moveRoute, moveSpeed, moveType } = model;
  return { moveFrequency, moveRoute, moveSpeed, moveType };
};

export {
  MOVE_TYPE_OPTIONS,
  parseEventMovement,
  usesCustomRoute,
  withMoveFrequency,
  withMoveRoute,
  withMoveSpeed,
  withMoveType,
  writeEventMovement,
};
export type { EventMovementFields, EventMovementModel };
