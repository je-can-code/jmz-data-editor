import { cloneJson, isJsonObject, jsonEquals, type JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand, RmmzMoveCommand, RmmzMoveRoute } from '../../model/rmmzTypes.ts';
import { createCommand, isWholeNumber, withParameters } from './commandShape.ts';

/**
 * The code of Set Movement Route.
 */
const SET_MOVEMENT_ROUTE_CODE = 205;

/**
 * The code of the lines after Set Movement Route that repeat each step of its route, for display.
 */
const MOVE_ROUTE_LINE_CODE = 505;

/**
 * The step code that ends every route.
 */
const ROUTE_END_CODE = 0;

/**
 * Where a route is edited: a Set Movement Route command, or an event page's own movement. Only a command can
 * make the event wait for the route, and the two end their routes differently.
 */
type MoveRouteMode = 'command' | 'page';

/**
 * One input of a route step.
 */
type MoveParameter = {
  readonly label: string;
  readonly kind: 'number' | 'select' | 'switch' | 'character' | 'audio' | 'script';
  readonly default: JsonValue;
  readonly min?: number;
  readonly max?: number;
  readonly options?: readonly { readonly value: number; readonly label: string }[];
};

/**
 * One kind of route step: its code, what the editor calls it, the group it sits in, and its inputs.
 */
type MoveStepKind = {
  readonly code: number;
  readonly name: string;
  readonly group: 'Move' | 'Turn' | 'Settings';
  readonly parameters: readonly MoveParameter[];
};

/**
 * The speeds a character can move at, as MZ names them.
 */
const MOVE_SPEEDS = [
  { value: 1, label: '1: x8 Slower' },
  { value: 2, label: '2: x4 Slower' },
  { value: 3, label: '3: x2 Slower' },
  { value: 4, label: '4: Normal' },
  { value: 5, label: '5: x2 Faster' },
  { value: 6, label: '6: x4 Faster' },
] as const;

/**
 * How often a character moves on its own, as MZ names it.
 */
const MOVE_FREQUENCIES = [
  { value: 1, label: '1: Lowest' },
  { value: 2, label: '2: Lower' },
  { value: 3, label: '3: Normal' },
  { value: 4, label: '4: Higher' },
  { value: 5, label: '5: Highest' },
] as const;

/**
 * The ways a character's sprite can blend with what is behind it.
 */
const BLEND_MODES = [
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Additive' },
  { value: 2, label: 'Multiply' },
  { value: 3, label: 'Screen' },
] as const;

/**
 * Builds a step kind with no inputs.
 * @param {number} code The step code.
 * @param {string} name What the editor calls it.
 * @param {MoveStepKind['group']} group Its group.
 * @returns {MoveStepKind} The kind.
 */
const plain = (code: number, name: string, group: MoveStepKind['group']): MoveStepKind =>
{
  return { code, name, group, parameters: [] };
};

/**
 * Every step a route can take, in MZ's order, which is also its codes' order.
 */
const MOVE_STEP_KINDS: readonly MoveStepKind[] = [
  plain(1, 'Move Down', 'Move'),
  plain(2, 'Move Left', 'Move'),
  plain(3, 'Move Right', 'Move'),
  plain(4, 'Move Up', 'Move'),
  plain(5, 'Move Lower Left', 'Move'),
  plain(6, 'Move Lower Right', 'Move'),
  plain(7, 'Move Upper Left', 'Move'),
  plain(8, 'Move Upper Right', 'Move'),
  plain(9, 'Move at Random', 'Move'),
  plain(10, 'Move toward Player', 'Move'),
  plain(11, 'Move away from Player', 'Move'),
  plain(12, '1 Step Forward', 'Move'),
  plain(13, '1 Step Backward', 'Move'),
  {
    code: 14,
    name: 'Jump',
    group: 'Move',
    parameters: [
      { label: 'X', kind: 'number', default: 0, min: -100, max: 100 },
      { label: 'Y', kind: 'number', default: 0, min: -100, max: 100 },
    ],
  },
  { code: 15, name: 'Wait', group: 'Move', parameters: [ { label: 'Frames', kind: 'number', default: 60, min: 1, max: 999 } ] },
  plain(16, 'Turn Down', 'Turn'),
  plain(17, 'Turn Left', 'Turn'),
  plain(18, 'Turn Right', 'Turn'),
  plain(19, 'Turn Up', 'Turn'),
  plain(20, 'Turn 90° Right', 'Turn'),
  plain(21, 'Turn 90° Left', 'Turn'),
  plain(22, 'Turn 180°', 'Turn'),
  plain(23, 'Turn 90° Right or Left', 'Turn'),
  plain(24, 'Turn at Random', 'Turn'),
  plain(25, 'Turn toward Player', 'Turn'),
  plain(26, 'Turn away from Player', 'Turn'),
  { code: 27, name: 'Switch ON', group: 'Settings', parameters: [ { label: 'Switch', kind: 'switch', default: 1 } ] },
  { code: 28, name: 'Switch OFF', group: 'Settings', parameters: [ { label: 'Switch', kind: 'switch', default: 1 } ] },
  { code: 29, name: 'Change Speed', group: 'Settings', parameters: [ { label: 'Speed', kind: 'select', default: 4, options: MOVE_SPEEDS } ] },
  {
    code: 30,
    name: 'Change Frequency',
    group: 'Settings',
    parameters: [ { label: 'Frequency', kind: 'select', default: 3, options: MOVE_FREQUENCIES } ],
  },
  plain(31, 'Walking Animation ON', 'Settings'),
  plain(32, 'Walking Animation OFF', 'Settings'),
  plain(33, 'Stepping Animation ON', 'Settings'),
  plain(34, 'Stepping Animation OFF', 'Settings'),
  plain(35, 'Direction Fix ON', 'Settings'),
  plain(36, 'Direction Fix OFF', 'Settings'),
  plain(37, 'Through ON', 'Settings'),
  plain(38, 'Through OFF', 'Settings'),
  plain(39, 'Transparent ON', 'Settings'),
  plain(40, 'Transparent OFF', 'Settings'),
  {
    code: 41,
    name: 'Change Image',
    group: 'Settings',
    parameters: [
      { label: 'Image', kind: 'character', default: '' },
      { label: 'Index', kind: 'number', default: 0, min: 0, max: 7 },
    ],
  },
  { code: 42, name: 'Change Opacity', group: 'Settings', parameters: [ { label: 'Opacity', kind: 'number', default: 255, min: 0, max: 255 } ] },
  { code: 43, name: 'Change Blend Mode', group: 'Settings', parameters: [ { label: 'Blend', kind: 'select', default: 0, options: BLEND_MODES } ] },
  {
    code: 44,
    name: 'Play SE',
    group: 'Settings',
    parameters: [ { label: 'Sound', kind: 'audio', default: { name: '', volume: 90, pitch: 100, pan: 0 } } ],
  },
  { code: 45, name: 'Script', group: 'Settings', parameters: [ { label: 'Script', kind: 'script', default: '' } ] },
];

/**
 * Finds a step kind by its code.
 * @param {number} code The step code.
 * @returns {MoveStepKind | null} The kind, or null for a code MZ never writes.
 */
const moveStepKind = (code: number): MoveStepKind | null =>
{
  return MOVE_STEP_KINDS.find(kind => kind.code === code) ?? null;
};

/**
 * Builds a new step as MZ writes one: its code, its inputs at their defaults when it has any, and an empty indent.
 * @param {number} code The step code.
 * @returns {RmmzMoveCommand} The step.
 */
const newMoveStep = (code: number): RmmzMoveCommand =>
{
  const kind = moveStepKind(code);
  if (kind === null || kind.parameters.length === 0)
  {
    return { code, indent: null };
  }

  return { code, parameters: kind.parameters.map(parameter => cloneJson(parameter.default)), indent: null };
};

/**
 * Builds a new, empty route the way MZ starts one: a command's route waits for itself and runs once; a page's
 * repeats. The two end their step lists differently, exactly as MZ writes them.
 * @param {MoveRouteMode} mode Where the route lives.
 * @returns {RmmzMoveRoute} The route.
 */
const newMoveRoute = (mode: MoveRouteMode): RmmzMoveRoute =>
{
  return mode === 'command'
    ? { list: [ { code: ROUTE_END_CODE } ], repeat: false, skippable: false, wait: true }
    : { list: [ { code: ROUTE_END_CODE, parameters: [] } ], repeat: true, skippable: false, wait: false };
};

/**
 * Splits a route's list into its steps and the step ending it.
 * @param {RmmzMoveRoute} route The route.
 * @returns {{ steps: RmmzMoveCommand[], end: RmmzMoveCommand | null }} Its steps, and its end step when it has one.
 */
const splitRoute = (route: RmmzMoveRoute): { steps: RmmzMoveCommand[]; end: RmmzMoveCommand | null } =>
{
  const last = route.list.at(-1);
  return last !== undefined && last.code === ROUTE_END_CODE
    ? { steps: route.list.slice(0, -1), end: last }
    : { steps: [ ...route.list ], end: null };
};

/**
 * Lists a route's steps, without the step ending it.
 * @param {RmmzMoveRoute} route The route.
 * @returns {RmmzMoveCommand[]} The steps.
 */
const routeSteps = (route: RmmzMoveRoute): RmmzMoveCommand[] =>
{
  return splitRoute(route).steps;
};

/**
 * Builds a route with new steps, keeping its end step and every other key where it was.
 * @param {RmmzMoveRoute} route The route.
 * @param {readonly RmmzMoveCommand[]} steps Its new steps.
 * @returns {RmmzMoveRoute} The route.
 */
const withSteps = (route: RmmzMoveRoute, steps: readonly RmmzMoveCommand[]): RmmzMoveRoute =>
{
  const { end } = splitRoute(route);
  return { ...cloneJson(route), list: cloneJson([ ...steps, ...(end === null ? [] : [ end ]) ]) };
};

/**
 * Adds a step at a place in the route.
 * @param {RmmzMoveRoute} route The route.
 * @param {number} index Where the step goes, from 0 to the number of steps.
 * @param {RmmzMoveCommand} step The step.
 * @returns {RmmzMoveRoute} The route with the step.
 */
const insertStep = (route: RmmzMoveRoute, index: number, step: RmmzMoveCommand): RmmzMoveRoute =>
{
  const steps = routeSteps(route);
  const place = Math.max(0, Math.min(index, steps.length));
  return withSteps(route, [ ...steps.slice(0, place), step, ...steps.slice(place) ]);
};

/**
 * Removes a step from the route.
 * @param {RmmzMoveRoute} route The route.
 * @param {number} index The step.
 * @returns {RmmzMoveRoute} The route without it.
 */
const removeStep = (route: RmmzMoveRoute, index: number): RmmzMoveRoute =>
{
  return withSteps(route, routeSteps(route).filter((_step, place) => place !== index));
};

/**
 * Moves a step to another place in the route.
 * @param {RmmzMoveRoute} route The route.
 * @param {number} from The step's place.
 * @param {number} to Its new place.
 * @returns {RmmzMoveRoute} The route in its new order.
 */
const moveStep = (route: RmmzMoveRoute, from: number, to: number): RmmzMoveRoute =>
{
  const steps = routeSteps(route);
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length)
  {
    return route;
  }

  const [ moved ] = steps.splice(from, 1);
  steps.splice(to, 0, moved);
  return withSteps(route, steps);
};

/**
 * Replaces a step of the route.
 * @param {RmmzMoveRoute} route The route.
 * @param {number} index The step.
 * @param {RmmzMoveCommand} step Its replacement.
 * @returns {RmmzMoveRoute} The route.
 */
const replaceStep = (route: RmmzMoveRoute, index: number, step: RmmzMoveCommand): RmmzMoveRoute =>
{
  return withSteps(route, routeSteps(route).map((each, place) => (place === index ? step : each)));
};

/**
 * Changes one input of a step, keeping the step's own layout.
 * @param {RmmzMoveCommand} step The step.
 * @param {number} index The input.
 * @param {JsonValue} value Its new value.
 * @returns {RmmzMoveCommand} The step.
 */
const setStepParameter = (step: RmmzMoveCommand, index: number, value: JsonValue): RmmzMoveCommand =>
{
  const parameters = [ ...step.parameters ?? [] ];
  parameters[index] = cloneJson(value);
  return { ...cloneJson(step), parameters };
};

/**
 * Changes one of the route's options.
 * @param {RmmzMoveRoute} route The route.
 * @param {'repeat' | 'skippable' | 'wait'} option The option.
 * @param {boolean} value Its new value.
 * @returns {RmmzMoveRoute} The route.
 */
const setRouteOption = (route: RmmzMoveRoute, option: 'repeat' | 'skippable' | 'wait', value: boolean): RmmzMoveRoute =>
{
  return { ...cloneJson(route), [option]: value };
};

/**
 * Writes a number with its sign, as MZ shows a jump.
 * @param {JsonValue | undefined} value The number.
 * @returns {string} The signed number.
 */
const signed = (value: JsonValue | undefined): string =>
{
  const number = typeof value === 'number' ? value : 0;
  return number >= 0 ? `+${number}` : String(number);
};

/**
 * Names the option a stored value picks.
 * @param {readonly { value: number, label: string }[]} options The options.
 * @param {JsonValue | undefined} value The stored value.
 * @returns {string} The option's label, or the value when no option matches.
 */
const optionLabel = (options: readonly { readonly value: number; readonly label: string }[], value: JsonValue | undefined): string =>
{
  return options.find(option => option.value === value)?.label ?? String(value);
};

/**
 * Describes the inputs of a step that has any, the way MZ's route list shows them.
 * @param {number} code The step code.
 * @param {readonly JsonValue[]} parameters The step's inputs.
 * @returns {string} The description of its inputs.
 */
const describeInputs = (code: number, parameters: readonly JsonValue[]): string =>
{
  const [ first, second ] = parameters;
  switch (code)
  {
    case 14:
      return `${signed(first)}, ${signed(second)}`;
    case 15:
      return `${String(first)} frames`;
    case 27:
    case 28:
      return `#${String(first).padStart(4, '0')}`;
    case 29:
      return optionLabel(MOVE_SPEEDS, first);
    case 30:
      return optionLabel(MOVE_FREQUENCIES, first);
    case 41:
      return first === '' ? 'None' : `${String(first)} (${String(second)})`;
    case 43:
      return optionLabel(BLEND_MODES, first);
    case 44:
      return isJsonObject(first)
        ? `${first['name'] === '' ? 'None' : String(first['name'])} (${String(first['volume'])}, ${String(first['pitch'])}, ${String(first['pan'])})`
        : '';
    default:
      return String(first);
  }
};

/**
 * Describes a step the way MZ's route list shows it: its name, then its inputs.
 * @param {RmmzMoveCommand} step The step.
 * @returns {string} The description.
 */
const describeMoveStep = (step: RmmzMoveCommand): string =>
{
  const kind = moveStepKind(step.code);
  if (kind === null)
  {
    return `Step ${step.code}`;
  }

  return kind.parameters.length === 0
    ? kind.name
    : `${kind.name}: ${describeInputs(step.code, step.parameters ?? [])}`;
};

/**
 * A Set Movement Route command read for editing: whose route it is, and the route.
 */
type SetMovementRouteModel = {
  /**
   * Who moves: -1 the player, 0 this event, or another event's id.
   */
  readonly characterId: number;

  /**
   * The route.
   */
  readonly route: RmmzMoveRoute;
};

/**
 * Reports whether a value is a route shaped the way MZ stores one: its step list, ending in the end step, and
 * its three options, with nothing else.
 * @param {JsonValue | undefined} value The value.
 * @returns {boolean} True for an MZ-shaped route.
 */
const isMoveRoute = (value: JsonValue | undefined): boolean =>
{
  if (isJsonObject(value) === false)
  {
    return false;
  }

  const { list, repeat, skippable, wait } = value;
  const keys = Object.keys(value).sort().join(',');
  return keys === 'list,repeat,skippable,wait'
    && Array.isArray(list)
    && list.length > 0
    && list.every(step => isJsonObject(step) && isWholeNumber(step['code']))
    && (list.at(-1) as { code: number }).code === ROUTE_END_CODE
    && typeof repeat === 'boolean'
    && typeof skippable === 'boolean'
    && typeof wait === 'boolean';
};

/**
 * Builds the lines MZ writes after Set Movement Route: one per step, each repeating the step, at the command's
 * indent. Nothing reads them but the event list's display.
 * @param {RmmzMoveRoute} route The route.
 * @param {number} indent The command's indent.
 * @returns {RmmzEventCommand[]} The lines.
 */
const moveRouteLines = (route: RmmzMoveRoute, indent: number): RmmzEventCommand[] =>
{
  return routeSteps(route).map(step => createCommand(MOVE_ROUTE_LINE_CODE, indent, [ step as unknown as JsonValue ]));
};

/**
 * Reads a Set Movement Route command and the lines repeating its steps.
 * @param {RmmzEventCommand} command The command.
 * @param {readonly RmmzEventCommand[]} continuation The 505 lines after it.
 * @returns {SetMovementRouteModel | null} The model, or null when the command or its lines are not MZ-shaped.
 */
const parseSetMovementRoute = (
  command: RmmzEventCommand,
  continuation: readonly RmmzEventCommand[],
): SetMovementRouteModel | null =>
{
  const { code, parameters, indent } = command;
  const [ characterId, route ] = parameters;
  if (code !== SET_MOVEMENT_ROUTE_CODE || parameters.length !== 2 || isWholeNumber(characterId) === false || isMoveRoute(route) === false)
  {
    return null;
  }

  // the lines are always rebuilt from the route, so they must already be exactly what rebuilding makes.
  const model = { characterId, route: cloneJson(route) as unknown as RmmzMoveRoute };
  return jsonEquals(moveRouteLines(model.route, indent), continuation)
    ? model
    : null;
};

/**
 * Writes a Set Movement Route model back as the command and the lines repeating its steps.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {SetMovementRouteModel} model Whose route it is, and the route.
 * @returns {{ command: RmmzEventCommand, continuation: RmmzEventCommand[] }} The command and its lines.
 */
const writeSetMovementRoute = (
  command: RmmzEventCommand,
  model: SetMovementRouteModel,
): { command: RmmzEventCommand; continuation: RmmzEventCommand[] } =>
{
  const { characterId, route } = model;
  return {
    command: withParameters(command, [ characterId, route as unknown as JsonValue ]),
    continuation: moveRouteLines(route, command.indent),
  };
};

export {
  BLEND_MODES,
  describeMoveStep,
  insertStep,
  MOVE_FREQUENCIES,
  MOVE_ROUTE_LINE_CODE,
  MOVE_SPEEDS,
  MOVE_STEP_KINDS,
  moveRouteLines,
  moveStep,
  moveStepKind,
  newMoveRoute,
  newMoveStep,
  parseSetMovementRoute,
  removeStep,
  replaceStep,
  routeSteps,
  SET_MOVEMENT_ROUTE_CODE,
  setRouteOption,
  setStepParameter,
  writeSetMovementRoute,
};
export type { MoveParameter, MoveRouteMode, MoveStepKind, SetMovementRouteModel };
