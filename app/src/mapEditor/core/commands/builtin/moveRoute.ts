import { isJsonObject, type JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand, RmmzMoveCommand } from '../../model/rmmzTypes.ts';
import { audioPhrase } from './phrases.ts';

/**
 * The code of the lines under Set Movement Route that repeat its steps, one per step, for MZ's list to show.
 */
const MOVE_ROUTE_LINE_CODE = 505;

/**
 * What each move route step is called, by its code. Steps with parameters say them after the name.
 */
const MOVE_STEP_NAMES: Readonly<Record<number, string>> = {
  1: 'Move Down',
  2: 'Move Left',
  3: 'Move Right',
  4: 'Move Up',
  5: 'Move Lower Left',
  6: 'Move Lower Right',
  7: 'Move Upper Left',
  8: 'Move Upper Right',
  9: 'Move at Random',
  10: 'Move toward Player',
  11: 'Move away from Player',
  12: '1 Step Forward',
  13: '1 Step Backward',
  14: 'Jump',
  15: 'Wait',
  16: 'Turn Down',
  17: 'Turn Left',
  18: 'Turn Right',
  19: 'Turn Up',
  20: 'Turn 90° Right',
  21: 'Turn 90° Left',
  22: 'Turn 180°',
  23: 'Turn 90° Right or Left',
  24: 'Turn at Random',
  25: 'Turn toward Player',
  26: 'Turn away from Player',
  27: 'Switch ON',
  28: 'Switch OFF',
  29: 'Speed',
  30: 'Frequency',
  31: 'Walking Animation ON',
  32: 'Walking Animation OFF',
  33: 'Stepping Animation ON',
  34: 'Stepping Animation OFF',
  35: 'Direction Fix ON',
  36: 'Direction Fix OFF',
  37: 'Through ON',
  38: 'Through OFF',
  39: 'Transparent ON',
  40: 'Transparent OFF',
  41: 'Image',
  42: 'Opacity',
  43: 'Blend Mode',
  44: 'Play SE',
  45: 'Script',
};

/**
 * Says one move route step: its name, and its parameters when it has any.
 * @param {JsonValue | undefined} value The step.
 * @returns {string} Such as "Jump +1, -2", "Wait 30 frames" or "Play SE Jump1 (90, 100, 0)".
 */
const moveStepPhrase = (value: JsonValue | undefined): string =>
{
  if (isJsonObject(value) === false || typeof value['code'] !== 'number')
  {
    return JSON.stringify(value ?? null);
  }

  const { code } = value;
  const name = MOVE_STEP_NAMES[code] ?? `Step ${code}`;
  const parameters = Array.isArray(value['parameters'])
    ? value['parameters']
    : [];
  if (code === 14)
  {
    const [ x, y ] = parameters.map(each => Number(each));
    return `${name} ${x >= 0 ? '+' : ''}${x}, ${y >= 0 ? '+' : ''}${y}`;
  }

  if (code === 15)
  {
    return `${name} ${String(parameters[0] ?? 0)} frames`;
  }

  if (code === 44)
  {
    return `${name} ${audioPhrase(parameters[0])}`;
  }

  return parameters.length === 0
    ? name
    : `${name} ${parameters.map(each => (typeof each === 'object' ? JSON.stringify(each) : String(each))).join(', ')}`;
};

/**
 * Builds the lines MZ writes under Set Movement Route: one per step of its route, the route's closing empty step
 * left out, each at the command's indent.
 * @param {RmmzEventCommand} command The Set Movement Route command.
 * @returns {RmmzEventCommand[]} Its lines.
 */
const moveRouteLines = (command: RmmzEventCommand): RmmzEventCommand[] =>
{
  const [ , route ] = command.parameters;
  const steps = isJsonObject(route) && Array.isArray(route['list'])
    ? route['list'] as RmmzMoveCommand[]
    : [];

  // the route ends with an empty step, which MZ never lists.
  const last = steps[steps.length - 1];
  const shown = last !== undefined && last.code === 0
    ? steps.slice(0, -1)
    : steps;
  return shown.map(step => ({ code: MOVE_ROUTE_LINE_CODE, indent: command.indent, parameters: [ step as unknown as JsonValue ] }));
};

export { MOVE_ROUTE_LINE_CODE, moveRouteLines, moveStepPhrase };
