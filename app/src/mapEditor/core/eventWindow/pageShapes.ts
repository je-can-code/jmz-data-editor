import { isJsonObject, type JsonObject, type JsonValue } from '../model/json.ts';
import type { RmmzEventPage } from '../model/rmmzTypes.ts';

/**
 * The kinds of value a page's keys hold: an object, a list, a whole number, any number, true or false, or text.
 */
type ValueKind = 'object' | 'list' | 'whole' | 'number' | 'boolean' | 'text';

/**
 * The kind of value each of a page's own keys holds: an object for its conditions, picture and route, a list for its
 * commands, a whole number for its settings, and true or false for its options.
 */
const PAGE_KEY_KINDS: Readonly<Record<keyof RmmzEventPage, ValueKind>> = {
  conditions: 'object',
  directionFix: 'boolean',
  image: 'object',
  list: 'list',
  moveFrequency: 'whole',
  moveRoute: 'object',
  moveSpeed: 'whole',
  moveType: 'whole',
  priorityType: 'whole',
  stepAnime: 'boolean',
  through: 'boolean',
  trigger: 'whole',
  walkAnime: 'boolean',
};

/**
 * The kind of value each key of a page's conditions holds.
 */
const CONDITION_KEY_KINDS: Readonly<Record<string, ValueKind>> = {
  actorId: 'whole',
  actorValid: 'boolean',
  itemId: 'whole',
  itemValid: 'boolean',
  selfSwitchCh: 'text',
  selfSwitchValid: 'boolean',
  switch1Id: 'whole',
  switch1Valid: 'boolean',
  switch2Id: 'whole',
  switch2Valid: 'boolean',
  variableId: 'whole',
  variableValid: 'boolean',
  variableValue: 'number',
};

/**
 * The kind of value each key of a page's picture holds.
 */
const IMAGE_KEY_KINDS: Readonly<Record<string, ValueKind>> = {
  tileId: 'whole',
  characterName: 'text',
  direction: 'whole',
  pattern: 'whole',
  characterIndex: 'whole',
};

/**
 * The kind of value each key of a move route holds.
 */
const ROUTE_KEY_KINDS: Readonly<Record<string, ValueKind>> = {
  list: 'list',
  repeat: 'boolean',
  skippable: 'boolean',
  wait: 'boolean',
};

/**
 * Reports whether a value is of a kind.
 * @param {JsonValue | undefined} value The value.
 * @param {ValueKind} kind The kind.
 * @returns {boolean} True when it is.
 */
const isOfKind = (value: JsonValue | undefined, kind: ValueKind): boolean =>
{
  switch (kind)
  {
    case 'object':
      return isJsonObject(value);
    case 'list':
      return Array.isArray(value);
    case 'whole':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'text':
      return typeof value === 'string';
  }
};

/**
 * Reports whether a value is an object holding every key a shape names, each of the kind it names.
 * @param {JsonValue | undefined} value The value.
 * @param {Readonly<Record<string, ValueKind>>} kinds The shape.
 * @returns {boolean} True when it matches.
 */
const matchesShape = (value: JsonValue | undefined, kinds: Readonly<Record<string, ValueKind>>): boolean =>
{
  return isJsonObject(value) && Object.entries(kinds).every(([ key, kind ]) => isOfKind(value[key], kind));
};

/**
 * Reports whether a value is shaped like an event command: a whole code, an indent of zero or more, and parameters.
 * @param {JsonValue} value The value.
 * @returns {boolean} True when it is one.
 */
const isCommand = (value: JsonValue): boolean =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { code, indent, parameters } = value;
  return Number.isInteger(code) && Number.isInteger(indent) && (indent as number) >= 0 && Array.isArray(parameters);
};

/**
 * Reports whether a command list holds nothing but commands and ends the way MZ ends every list, with the empty
 * command at the top level; a page holding anything else would stop the game when it ran.
 * @param {readonly JsonValue[]} list The list.
 * @returns {boolean} True when it is a whole list.
 */
const isWholeCommandList = (list: readonly JsonValue[]): boolean =>
{
  const last = list.at(-1);
  return list.every(isCommand)
    && isJsonObject(last)
    && last['code'] === 0
    && last['indent'] === 0;
};

/**
 * Reports whether a value is a move route as MZ writes one: its steps, each an object with a whole code and the last
 * the route's end, and whether it repeats, can be skipped and is waited for.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True when it can stand as a route.
 */
const isMoveRoute = (value: JsonValue | undefined): boolean =>
{
  if (matchesShape(value, ROUTE_KEY_KINDS) === false)
  {
    return false;
  }

  const steps = (value as JsonObject)['list'] as JsonValue[];
  const last = steps.at(-1);
  return steps.every(step => isJsonObject(step) && Number.isInteger(step['code']))
    && isJsonObject(last)
    && last['code'] === 0;
};

/**
 * Reports whether a value is a page's picture as MZ writes one: a tile, or a character sheet's name and which of its
 * characters, with the way it faces and its frame.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True when it can stand as a picture.
 */
const isEventImage = (value: JsonValue | undefined): boolean =>
{
  return matchesShape(value, IMAGE_KEY_KINDS);
};

/**
 * Reports whether a value has the whole shape of an event page, as MZ writes one: every key, each of its kind, with
 * conditions, a picture and a route of their own shapes, and a whole command list.
 * @param {JsonValue} value The value.
 * @returns {boolean} True when it can stand as a page.
 */
const isEventPage = (value: JsonValue): boolean =>
{
  if (matchesShape(value, PAGE_KEY_KINDS) === false)
  {
    return false;
  }

  const page = value as JsonObject;
  return matchesShape(page['conditions'], CONDITION_KEY_KINDS)
    && isEventImage(page['image'])
    && isMoveRoute(page['moveRoute'])
    && isWholeCommandList(page['list'] as JsonValue[]);
};

export { isEventImage, isEventPage, isMoveRoute, isWholeCommandList };
