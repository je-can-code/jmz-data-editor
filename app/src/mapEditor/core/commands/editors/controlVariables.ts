import type { JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { isNumber, isWholeNumber, withParameters } from './commandShape.ts';

/**
 * The code of Control Variables.
 */
const CONTROL_VARIABLES_CODE = 122;

/**
 * What the value is worked out from. Each kind keeps its own numbers, stored after the operand code: a constant
 * or a variable one number, a random range two, game data three (which data, then two details), a script its
 * code.
 */
type VariableOperand =
  | { readonly kind: 'constant'; readonly value: number }
  | { readonly kind: 'variable'; readonly variableId: number }
  | { readonly kind: 'random'; readonly min: number; readonly max: number }
  | { readonly kind: 'gameData'; readonly type: number; readonly param1: number; readonly param2: number }
  | { readonly kind: 'script'; readonly script: string };

/**
 * The kinds of operand.
 */
type VariableOperandKind = VariableOperand['kind'];

/**
 * A Control Variables command read for editing: the variables it changes (one, or a range), how, and from what.
 */
type ControlVariablesModel = {
  /**
   * The first variable changed.
   */
  readonly start: number;

  /**
   * The last variable changed; the same as the first for a single variable.
   */
  readonly end: number;

  /**
   * How the value is applied: 0 set, 1 add, 2 subtract, 3 multiply, 4 divide, 5 remainder.
   */
  readonly operation: number;

  /**
   * What the value is worked out from.
   */
  readonly operand: VariableOperand;
};

/**
 * How one kind of operand is stored: the code MZ writes for it, how to read its numbers, and how to write them.
 */
type OperandCodec = {
  readonly code: number;
  readonly decode: (values: readonly JsonValue[]) => VariableOperand | null;
  readonly encode: (operand: VariableOperand) => JsonValue[];
};

/**
 * Every kind of operand, by kind. Each reads exactly the numbers MZ writes for it, and nothing short or long of
 * them, so a command it does not recognise is left alone rather than rewritten.
 */
const OPERAND_CODECS: Readonly<Record<VariableOperandKind, OperandCodec>> = {
  constant: {
    code: 0,
    decode: values => (values.length === 1 && isNumber(values[0]) ? { kind: 'constant', value: values[0] } : null),
    encode: operand => (operand.kind === 'constant' ? [ operand.value ] : []),
  },
  variable: {
    code: 1,
    decode: values => (values.length === 1 && isWholeNumber(values[0]) ? { kind: 'variable', variableId: values[0] } : null),
    encode: operand => (operand.kind === 'variable' ? [ operand.variableId ] : []),
  },
  random: {
    code: 2,
    decode: values =>
    {
      const [ min, max ] = values;
      return values.length === 2 && isNumber(min) && isNumber(max)
        ? { kind: 'random', min, max }
        : null;
    },
    encode: operand => (operand.kind === 'random' ? [ operand.min, operand.max ] : []),
  },
  gameData: {
    code: 3,
    decode: values =>
    {
      const [ type, param1, param2 ] = values;
      return values.length === 3 && isWholeNumber(type) && isWholeNumber(param1) && isWholeNumber(param2)
        ? { kind: 'gameData', type, param1, param2 }
        : null;
    },
    encode: operand => (operand.kind === 'gameData' ? [ operand.type, operand.param1, operand.param2 ] : []),
  },
  script: {
    code: 4,
    decode: values => (values.length === 1 && typeof values[0] === 'string' ? { kind: 'script', script: values[0] } : null),
    encode: operand => (operand.kind === 'script' ? [ operand.script ] : []),
  },
};

/**
 * The operand kinds in MZ's order, with the words the editor uses for them.
 */
const OPERAND_KINDS: readonly { readonly kind: VariableOperandKind; readonly label: string }[] = [
  { kind: 'constant', label: 'Constant' },
  { kind: 'variable', label: 'Variable' },
  { kind: 'random', label: 'Random' },
  { kind: 'gameData', label: 'Game Data' },
  { kind: 'script', label: 'Script' },
];

/**
 * The ways a value can be applied, in MZ's order.
 */
const VARIABLE_OPERATIONS = [
  { value: 0, label: 'Set' },
  { value: 1, label: 'Add' },
  { value: 2, label: 'Subtract' },
  { value: 3, label: 'Multiply' },
  { value: 4, label: 'Divide' },
  { value: 5, label: 'Remainder' },
] as const;

/**
 * The game data a variable can read, in MZ's order: what the first detail picks, and the choices of the second
 * when the data has one.
 */
const GAME_DATA_TYPES: readonly {
  readonly type: number;
  readonly label: string;
  readonly param1: 'item' | 'weapon' | 'armor' | 'actor' | 'enemy-index' | 'character' | 'party-index' | 'other' | 'last';
  readonly param2?: readonly string[];
}[] = [
  { type: 0, label: 'Item', param1: 'item' },
  { type: 1, label: 'Weapon', param1: 'weapon' },
  { type: 2, label: 'Armor', param1: 'armor' },
  {
    type: 3,
    label: 'Actor',
    param1: 'actor',
    param2: [ 'Level', 'EXP', 'HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'TP' ],
  },
  {
    type: 4,
    label: 'Enemy',
    param1: 'enemy-index',
    param2: [ 'HP', 'MP', 'Max HP', 'Max MP', 'Attack', 'Defense', 'M.Attack', 'M.Defense', 'Agility', 'Luck', 'TP' ],
  },
  { type: 5, label: 'Character', param1: 'character', param2: [ 'Map X', 'Map Y', 'Direction', 'Screen X', 'Screen Y' ] },
  { type: 6, label: 'Party', param1: 'party-index' },
  { type: 7, label: 'Other', param1: 'other' },
  { type: 8, label: 'Last', param1: 'last' },
];

/**
 * What "Other" game data can read, by its first detail.
 */
const OTHER_GAME_DATA = [
  'Map ID', 'Party Members', 'Gold', 'Steps', 'Play Time', 'Timer', 'Save Count', 'Battle Count', 'Win Count', 'Escape Count',
] as const;

/**
 * What "Last" game data can read, by its first detail.
 */
const LAST_GAME_DATA = [
  'Last Used Skill ID', 'Last Used Item ID', 'Last Actor ID to Act', 'Last Enemy Index to Act', 'Last Target Actor ID',
  'Last Target Enemy Index',
] as const;

/**
 * Finds the operand kind stored under a code.
 * @param {JsonValue | undefined} code The stored code.
 * @returns {OperandCodec | null} Its codec, or null for a code MZ never writes.
 */
const codecForCode = (code: JsonValue | undefined): OperandCodec | null =>
{
  return Object.values(OPERAND_CODECS).find(codec => codec.code === code) ?? null;
};

/**
 * Reads a Control Variables command.
 * @param {RmmzEventCommand} command The command.
 * @returns {ControlVariablesModel | null} The model, or null when the command is not MZ-shaped.
 */
const parseControlVariables = (command: RmmzEventCommand): ControlVariablesModel | null =>
{
  const { code, parameters } = command;
  const [ start, end, operation, operandCode, ...values ] = parameters;
  const codec = codecForCode(operandCode);
  if (code !== CONTROL_VARIABLES_CODE
    || isWholeNumber(start) === false
    || isWholeNumber(end) === false
    || isWholeNumber(operation) === false
    || codec === null)
  {
    return null;
  }

  const operand = codec.decode(values);
  return operand === null
    ? null
    : { start, end, operation, operand };
};

/**
 * Writes a Control Variables model back into its command, in exactly the shape MZ writes for its operand.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {ControlVariablesModel} model What it should now do.
 * @returns {RmmzEventCommand} The command.
 */
const writeControlVariables = (command: RmmzEventCommand, model: ControlVariablesModel): RmmzEventCommand =>
{
  const { start, end, operation, operand } = model;
  const codec = OPERAND_CODECS[operand.kind];
  return withParameters(command, [ start, end, operation, codec.code, ...codec.encode(operand) ]);
};

/**
 * Builds the operand a kind starts with when the author switches to it.
 * @param {VariableOperandKind} kind The kind.
 * @returns {VariableOperand} The starting operand.
 */
const defaultOperand = (kind: VariableOperandKind): VariableOperand =>
{
  switch (kind)
  {
    case 'constant':
      return { kind, value: 0 };
    case 'variable':
      return { kind, variableId: 1 };
    case 'random':
      return { kind, min: 0, max: 0 };
    case 'gameData':
      return { kind, type: 0, param1: 1, param2: 0 };
    case 'script':
      return { kind, script: '' };
  }
};

/**
 * Switches the operand to another kind, keeping it when the kind is already the one asked for.
 * @param {ControlVariablesModel} model The command.
 * @param {VariableOperandKind} kind The new kind.
 * @returns {ControlVariablesModel} The command with that kind of operand.
 */
const setOperandKind = (model: ControlVariablesModel, kind: VariableOperandKind): ControlVariablesModel =>
{
  return model.operand.kind === kind
    ? model
    : { ...model, operand: defaultOperand(kind) };
};

/**
 * Switches which game data the operand reads. The details mean different things for each kind of data, so they
 * start over at that data's first choice.
 * @param {ControlVariablesModel} model The command, whose operand is game data.
 * @param {number} type The game data.
 * @returns {ControlVariablesModel} The command reading that data.
 */
const setGameDataType = (model: ControlVariablesModel, type: number): ControlVariablesModel =>
{
  if (model.operand.kind !== 'gameData' || model.operand.type === type)
  {
    return model;
  }

  // ids start at 1; indexes and the character's "this event" start at 0.
  const startsAtOne = type <= 3;
  return { ...model, operand: { kind: 'gameData', type, param1: startsAtOne ? 1 : 0, param2: 0 } };
};

export {
  CONTROL_VARIABLES_CODE,
  defaultOperand,
  GAME_DATA_TYPES,
  LAST_GAME_DATA,
  OPERAND_KINDS,
  OTHER_GAME_DATA,
  parseControlVariables,
  setGameDataType,
  setOperandKind,
  VARIABLE_OPERATIONS,
  writeControlVariables,
};
export type { ControlVariablesModel, VariableOperand, VariableOperandKind };
