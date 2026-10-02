import type { JsonValue } from '../../model/json.ts';
import type { RmmzEventCommand } from '../../model/rmmzTypes.ts';
import { bodyEnd, createCommand, isNumber, isWholeNumber, withParameters } from './commandShape.ts';

/**
 * The code of Conditional Branch.
 */
const CONDITIONAL_BRANCH_CODE = 111;

/**
 * The code of the Else line inside a conditional branch.
 */
const BRANCH_ELSE_CODE = 411;

/**
 * The code of the line that ends a conditional branch.
 */
const BRANCH_END_CODE = 412;

/**
 * What a conditional branch tests. Every kind MZ offers has its own shape, with the numbers kept exactly as MZ
 * stores them (a switch's value is 0 for ON and 1 for OFF, comparisons are indexes into MZ's lists), so writing
 * one back never changes what it means.
 */
type BranchCondition =
  | { readonly kind: 'switch'; readonly switchId: number; readonly value: number }
  | {
    readonly kind: 'variable';
    readonly variableId: number;
    readonly operandType: number;
    readonly operand: number;
    readonly comparison: number;
  }
  | { readonly kind: 'selfSwitch'; readonly letter: string; readonly value: number }
  | { readonly kind: 'timer'; readonly seconds: number; readonly comparison: number }
  | { readonly kind: 'actor'; readonly actorId: number; readonly check: number; readonly operand: number | string | null }
  | { readonly kind: 'enemy'; readonly enemyIndex: number; readonly check: number; readonly stateId: number | null }
  | { readonly kind: 'character'; readonly characterId: number; readonly direction: number }
  | { readonly kind: 'gold'; readonly amount: number; readonly comparison: number }
  | { readonly kind: 'item'; readonly itemId: number }
  | { readonly kind: 'weapon'; readonly weaponId: number; readonly includeEquipment: boolean }
  | { readonly kind: 'armor'; readonly armorId: number; readonly includeEquipment: boolean }
  | { readonly kind: 'button'; readonly button: string; readonly how: number | null }
  | { readonly kind: 'script'; readonly script: string }
  | { readonly kind: 'vehicle'; readonly vehicleId: number };

/**
 * The kinds of condition.
 */
type BranchConditionKind = BranchCondition['kind'];

/**
 * How one kind of condition is stored: the type number MZ writes first, how to read the values after it, and
 * how to write them.
 */
type ConditionCodec = {
  readonly type: number;
  readonly decode: (values: readonly JsonValue[]) => BranchCondition | null;
  readonly encode: (condition: BranchCondition) => JsonValue[];
};

/**
 * Reads the values of an actor condition: in the party needs nothing more, a name is text, and the rest are ids.
 * @param {readonly JsonValue[]} values The values after the type.
 * @returns {BranchCondition | null} The condition, or null when not MZ-shaped.
 */
const decodeActor = (values: readonly JsonValue[]): BranchCondition | null =>
{
  const [ actorId, check, operand ] = values;
  if (isWholeNumber(actorId) === false || isWholeNumber(check) === false)
  {
    return null;
  }

  if (check === 0)
  {
    return values.length === 2 ? { kind: 'actor', actorId, check, operand: null } : null;
  }

  const operandShaped = check === 1
    ? typeof operand === 'string'
    : isWholeNumber(operand);
  return values.length === 3 && operandShaped
    ? { kind: 'actor', actorId, check, operand: operand as number | string }
    : null;
};

/**
 * Reads the values of an enemy condition: appeared needs nothing more, a state names its id.
 * @param {readonly JsonValue[]} values The values after the type.
 * @returns {BranchCondition | null} The condition, or null when not MZ-shaped.
 */
const decodeEnemy = (values: readonly JsonValue[]): BranchCondition | null =>
{
  const [ enemyIndex, check, stateId ] = values;
  if (isWholeNumber(enemyIndex) === false || isWholeNumber(check) === false)
  {
    return null;
  }

  if (check === 0)
  {
    return values.length === 2 ? { kind: 'enemy', enemyIndex, check, stateId: null } : null;
  }

  return values.length === 3 && isWholeNumber(stateId)
    ? { kind: 'enemy', enemyIndex, check, stateId }
    : null;
};

/**
 * Reads the values of a variable condition.
 * @param {readonly JsonValue[]} values The values after the type.
 * @returns {BranchCondition | null} The condition, or null when not MZ-shaped.
 */
const decodeVariable = (values: readonly JsonValue[]): BranchCondition | null =>
{
  const [ variableId, operandType, operand, comparison ] = values;
  return values.length === 4
    && isWholeNumber(variableId)
    && isWholeNumber(operandType)
    && isNumber(operand)
    && isWholeNumber(comparison)
    ? { kind: 'variable', variableId, operandType, operand, comparison }
    : null;
};

/**
 * Reads the values of a button condition. Older MZ versions stored no second value, and the engine reads that
 * as "is being pressed"; it is kept absent rather than filled in.
 * @param {readonly JsonValue[]} values The values after the type.
 * @returns {BranchCondition | null} The condition, or null when not MZ-shaped.
 */
const decodeButton = (values: readonly JsonValue[]): BranchCondition | null =>
{
  const [ button, how ] = values;
  if (typeof button !== 'string')
  {
    return null;
  }

  if (values.length === 1)
  {
    return { kind: 'button', button, how: null };
  }

  return values.length === 2 && isWholeNumber(how)
    ? { kind: 'button', button, how }
    : null;
};

/**
 * Builds the codec of a condition stored as whole numbers only.
 * @param {number} type The type number.
 * @param {number} count How many numbers follow it.
 * @param {(numbers: number[]) => BranchCondition} build Makes the condition from them.
 * @param {(condition: BranchCondition) => number[]} write Lists them from the condition.
 * @returns {ConditionCodec} The codec.
 */
const numbersCodec = (
  type: number,
  count: number,
  build: (numbers: number[]) => BranchCondition,
  write: (condition: BranchCondition) => number[],
): ConditionCodec =>
{
  return {
    type,
    decode: values => (values.length === count && values.every(isWholeNumber) ? build(values as number[]) : null),
    encode: write,
  };
};

/**
 * Builds the codec of an item-like condition: an id, and whether equipment counts.
 * @param {number} type The type number.
 * @param {(id: number, includeEquipment: boolean) => BranchCondition} build Makes the condition.
 * @param {(condition: BranchCondition) => JsonValue[]} write Lists its values.
 * @returns {ConditionCodec} The codec.
 */
const equipmentCodec = (
  type: number,
  build: (id: number, includeEquipment: boolean) => BranchCondition,
  write: (condition: BranchCondition) => JsonValue[],
): ConditionCodec =>
{
  return {
    type,
    decode: values =>
    {
      const [ id, includeEquipment ] = values;
      return values.length === 2 && isWholeNumber(id) && typeof includeEquipment === 'boolean'
        ? build(id, includeEquipment)
        : null;
    },
    encode: write,
  };
};

/**
 * Every kind of condition, by kind, in MZ's order. Each reads exactly the values MZ writes for it, so a
 * condition it does not recognise is left alone rather than rewritten.
 */
const CONDITION_CODECS: Readonly<Record<BranchConditionKind, ConditionCodec>> = {
  switch: numbersCodec(0, 2, ([ switchId, value ]) => ({ kind: 'switch', switchId, value }),
    condition => (condition.kind === 'switch' ? [ condition.switchId, condition.value ] : [])),
  variable: {
    type: 1,
    decode: decodeVariable,
    encode: condition => (condition.kind === 'variable'
      ? [ condition.variableId, condition.operandType, condition.operand, condition.comparison ]
      : []),
  },
  selfSwitch: {
    type: 2,
    decode: values =>
    {
      const [ letter, value ] = values;
      return values.length === 2 && typeof letter === 'string' && isWholeNumber(value)
        ? { kind: 'selfSwitch', letter, value }
        : null;
    },
    encode: condition => (condition.kind === 'selfSwitch' ? [ condition.letter, condition.value ] : []),
  },
  timer: numbersCodec(3, 2, ([ seconds, comparison ]) => ({ kind: 'timer', seconds, comparison }),
    condition => (condition.kind === 'timer' ? [ condition.seconds, condition.comparison ] : [])),
  actor: {
    type: 4,
    decode: decodeActor,
    encode: condition =>
    {
      if (condition.kind !== 'actor')
      {
        return [];
      }

      return condition.operand === null
        ? [ condition.actorId, condition.check ]
        : [ condition.actorId, condition.check, condition.operand ];
    },
  },
  enemy: {
    type: 5,
    decode: decodeEnemy,
    encode: condition =>
    {
      if (condition.kind !== 'enemy')
      {
        return [];
      }

      return condition.stateId === null
        ? [ condition.enemyIndex, condition.check ]
        : [ condition.enemyIndex, condition.check, condition.stateId ];
    },
  },
  character: numbersCodec(6, 2, ([ characterId, direction ]) => ({ kind: 'character', characterId, direction }),
    condition => (condition.kind === 'character' ? [ condition.characterId, condition.direction ] : [])),
  gold: numbersCodec(7, 2, ([ amount, comparison ]) => ({ kind: 'gold', amount, comparison }),
    condition => (condition.kind === 'gold' ? [ condition.amount, condition.comparison ] : [])),
  item: numbersCodec(8, 1, ([ itemId ]) => ({ kind: 'item', itemId }),
    condition => (condition.kind === 'item' ? [ condition.itemId ] : [])),
  weapon: equipmentCodec(9, (weaponId, includeEquipment) => ({ kind: 'weapon', weaponId, includeEquipment }),
    condition => (condition.kind === 'weapon' ? [ condition.weaponId, condition.includeEquipment ] : [])),
  armor: equipmentCodec(10, (armorId, includeEquipment) => ({ kind: 'armor', armorId, includeEquipment }),
    condition => (condition.kind === 'armor' ? [ condition.armorId, condition.includeEquipment ] : [])),
  button: {
    type: 11,
    decode: decodeButton,
    encode: condition =>
    {
      if (condition.kind !== 'button')
      {
        return [];
      }

      return condition.how === null
        ? [ condition.button ]
        : [ condition.button, condition.how ];
    },
  },
  script: {
    type: 12,
    decode: values => (values.length === 1 && typeof values[0] === 'string' ? { kind: 'script', script: values[0] } : null),
    encode: condition => (condition.kind === 'script' ? [ condition.script ] : []),
  },
  vehicle: numbersCodec(13, 1, ([ vehicleId ]) => ({ kind: 'vehicle', vehicleId }),
    condition => (condition.kind === 'vehicle' ? [ condition.vehicleId ] : [])),
};

/**
 * The kinds of condition in MZ's order, with the words the editor uses for them.
 */
const CONDITION_KINDS: readonly { readonly kind: BranchConditionKind; readonly label: string }[] = [
  { kind: 'switch', label: 'Switch' },
  { kind: 'variable', label: 'Variable' },
  { kind: 'selfSwitch', label: 'Self Switch' },
  { kind: 'timer', label: 'Timer' },
  { kind: 'actor', label: 'Actor' },
  { kind: 'enemy', label: 'Enemy' },
  { kind: 'character', label: 'Character' },
  { kind: 'gold', label: 'Gold' },
  { kind: 'item', label: 'Item' },
  { kind: 'weapon', label: 'Weapon' },
  { kind: 'armor', label: 'Armor' },
  { kind: 'button', label: 'Button' },
  { kind: 'script', label: 'Script' },
  { kind: 'vehicle', label: 'Vehicle' },
];

/**
 * The comparisons a variable condition can make, in MZ's order.
 */
const VARIABLE_COMPARISONS = [ '=', '≥', '≤', '>', '<', '≠' ] as const;

/**
 * What an actor condition can check, in MZ's order; every check but "in the party" names something more.
 */
const ACTOR_CHECKS = [ 'In the Party', 'Name', 'Class', 'Skill', 'Weapon', 'Armor', 'State' ] as const;

/**
 * The buttons a button condition can watch, as the engine names them.
 */
const CONDITION_BUTTONS = [
  { value: 'ok', label: 'OK' },
  { value: 'cancel', label: 'Cancel' },
  { value: 'shift', label: 'Shift' },
  { value: 'down', label: 'Down' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'up', label: 'Up' },
  { value: 'pageup', label: 'Pageup' },
  { value: 'pagedown', label: 'Pagedown' },
] as const;

/**
 * Reads what a conditional branch tests.
 * @param {RmmzEventCommand} command The Conditional Branch command.
 * @returns {BranchCondition | null} The condition, or null when the command is not MZ-shaped.
 */
const parseCondition = (command: RmmzEventCommand): BranchCondition | null =>
{
  const { code, parameters } = command;
  const [ type, ...values ] = parameters;
  const codec = Object.values(CONDITION_CODECS).find(each => each.type === type);
  if (code !== CONDITIONAL_BRANCH_CODE || codec === undefined)
  {
    return null;
  }

  return codec.decode(values);
};

/**
 * Writes a condition back into its command, in exactly the shape MZ writes for that kind.
 * @param {RmmzEventCommand} command The command as it stood.
 * @param {BranchCondition} condition What it should now test.
 * @returns {RmmzEventCommand} The command.
 */
const writeCondition = (command: RmmzEventCommand, condition: BranchCondition): RmmzEventCommand =>
{
  const codec = CONDITION_CODECS[condition.kind];
  return withParameters(command, [ codec.type, ...codec.encode(condition) ]);
};

/**
 * Builds the condition a kind starts with when the author switches to it, as MZ's own dialog would.
 * @param {BranchConditionKind} kind The kind.
 * @returns {BranchCondition} The starting condition.
 */
const defaultCondition = (kind: BranchConditionKind): BranchCondition =>
{
  const defaults: Readonly<Record<BranchConditionKind, BranchCondition>> = {
    switch: { kind: 'switch', switchId: 1, value: 0 },
    variable: { kind: 'variable', variableId: 1, operandType: 0, operand: 0, comparison: 0 },
    selfSwitch: { kind: 'selfSwitch', letter: 'A', value: 0 },
    timer: { kind: 'timer', seconds: 0, comparison: 0 },
    actor: { kind: 'actor', actorId: 1, check: 0, operand: null },
    enemy: { kind: 'enemy', enemyIndex: 0, check: 0, stateId: null },
    character: { kind: 'character', characterId: -1, direction: 2 },
    gold: { kind: 'gold', amount: 0, comparison: 0 },
    item: { kind: 'item', itemId: 1 },
    weapon: { kind: 'weapon', weaponId: 1, includeEquipment: false },
    armor: { kind: 'armor', armorId: 1, includeEquipment: false },
    button: { kind: 'button', button: 'ok', how: 0 },
    script: { kind: 'script', script: '' },
    vehicle: { kind: 'vehicle', vehicleId: 0 },
  };

  return defaults[kind];
};

/**
 * Switches what an actor condition checks. In the party needs nothing more; a name starts empty, and anything
 * else starts at the first id.
 * @param {BranchCondition} condition An actor condition.
 * @param {number} check The new check.
 * @returns {BranchCondition} The condition making that check.
 */
const setActorCheck = (condition: BranchCondition, check: number): BranchCondition =>
{
  if (condition.kind !== 'actor' || condition.check === check)
  {
    return condition;
  }

  if (check === 0)
  {
    return { ...condition, check, operand: null };
  }

  return { ...condition, check, operand: check === 1 ? '' : 1 };
};

/**
 * Switches what an enemy condition checks: appeared needs nothing more, a state starts at the first.
 * @param {BranchCondition} condition An enemy condition.
 * @param {number} check The new check.
 * @returns {BranchCondition} The condition making that check.
 */
const setEnemyCheck = (condition: BranchCondition, check: number): BranchCondition =>
{
  if (condition.kind !== 'enemy' || condition.check === check)
  {
    return condition;
  }

  return { ...condition, check, stateId: check === 0 ? null : 1 };
};

/**
 * A conditional branch block read for editing: its condition, and whether it has an Else.
 */
type ConditionalBranchBlockModel = {
  readonly condition: BranchCondition;
  readonly hasElse: boolean;
};

/**
 * The parts of a conditional branch block, in order.
 */
type BranchBlockParts = {
  readonly opener: RmmzEventCommand;
  readonly thenBody: readonly RmmzEventCommand[];
  readonly elseLine: RmmzEventCommand | null;
  readonly elseBody: readonly RmmzEventCommand[];
  readonly end: RmmzEventCommand;
};

/**
 * Splits a conditional branch block (from the branch through its end) into its parts. Everything between the
 * branch's own lines sits deeper than it; anything else means the block is not MZ-shaped.
 * @param {readonly RmmzEventCommand[]} commands The block.
 * @returns {BranchBlockParts | null} The parts, or null when not MZ-shaped.
 */
const splitBranchBlock = (commands: readonly RmmzEventCommand[]): BranchBlockParts | null =>
{
  const [ opener ] = commands;
  const end = commands.at(-1);
  if (opener === undefined || end === undefined || commands.length < 2
    || opener.code !== CONDITIONAL_BRANCH_CODE || end.code !== BRANCH_END_CODE || end.indent !== opener.indent)
  {
    return null;
  }

  // every line at the branch's own indent between its first and last is an Else; there can be at most one.
  const inner = commands.slice(1, -1);
  const own = inner
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => command.indent <= opener.indent);
  const [ elseAt ] = own;
  if (own.length > 1 || (elseAt !== undefined && (elseAt.command.code !== BRANCH_ELSE_CODE || elseAt.command.indent !== opener.indent)))
  {
    return null;
  }

  return elseAt === undefined
    ? { opener, thenBody: inner, elseLine: null, elseBody: [], end }
    : {
      opener,
      thenBody: inner.slice(0, elseAt.index),
      elseLine: elseAt.command,
      elseBody: inner.slice(elseAt.index + 1),
      end,
    };
};

/**
 * Reads a conditional branch block, from the branch through its end.
 * @param {readonly RmmzEventCommand[]} commands The block.
 * @returns {ConditionalBranchBlockModel | null} The model, or null when not MZ-shaped.
 */
const parseConditionalBranchBlock = (commands: readonly RmmzEventCommand[]): ConditionalBranchBlockModel | null =>
{
  const parts = splitBranchBlock(commands);
  const condition = parts === null
    ? null
    : parseCondition(parts.opener);
  return parts === null || condition === null
    ? null
    : { condition, hasElse: parts.elseLine !== null };
};

/**
 * Writes a conditional branch block back. The branch's own lines take the new condition; the bodies go back
 * exactly as they were. Adding an Else adds an empty one, as MZ does; removing it removes its body with it.
 * @param {readonly RmmzEventCommand[]} commands The block as it stood, which {@link parseConditionalBranchBlock} read.
 * @param {ConditionalBranchBlockModel} model What it should now be.
 * @returns {RmmzEventCommand[]} The block.
 */
const writeConditionalBranchBlock = (
  commands: readonly RmmzEventCommand[],
  model: ConditionalBranchBlockModel,
): RmmzEventCommand[] =>
{
  const parts = splitBranchBlock(commands);
  if (parts === null)
  {
    throw new Error('only a block parseConditionalBranchBlock read can be written back');
  }

  const { opener, thenBody, elseLine, elseBody, end } = parts;
  const head = [ writeCondition(opener, model.condition), ...thenBody ];
  if (model.hasElse === false)
  {
    return [ ...head, end ];
  }

  return elseLine === null
    ? [ ...head, createCommand(BRANCH_ELSE_CODE, opener.indent, []), bodyEnd(opener.indent), end ]
    : [ ...head, elseLine, ...elseBody, end ];
};

/**
 * Counts the commands an Else holds besides the empty line closing it, so removing it can say what goes with it.
 * @param {readonly RmmzEventCommand[]} commands The block.
 * @returns {number} How many commands the Else holds.
 */
const elseCommandCount = (commands: readonly RmmzEventCommand[]): number =>
{
  const parts = splitBranchBlock(commands);
  return parts === null
    ? 0
    : parts.elseBody.filter(command => command.code !== 0).length;
};

/**
 * Builds a new conditional branch block as MZ does: a switch test, an empty body, and an Else when asked for.
 * @param {number} indent The indent the block sits at.
 * @param {boolean} withElse True to include an empty Else.
 * @returns {RmmzEventCommand[]} The block.
 */
const newConditionalBranch = (indent: number, withElse: boolean): RmmzEventCommand[] =>
{
  const opener = writeCondition(createCommand(CONDITIONAL_BRANCH_CODE, indent, []), defaultCondition('switch'));
  const elsePart = withElse
    ? [ createCommand(BRANCH_ELSE_CODE, indent, []), bodyEnd(indent) ]
    : [];
  return [ opener, bodyEnd(indent), ...elsePart, createCommand(BRANCH_END_CODE, indent, []) ];
};

export {
  ACTOR_CHECKS,
  BRANCH_ELSE_CODE,
  BRANCH_END_CODE,
  CONDITION_BUTTONS,
  CONDITION_KINDS,
  CONDITIONAL_BRANCH_CODE,
  defaultCondition,
  elseCommandCount,
  newConditionalBranch,
  parseCondition,
  parseConditionalBranchBlock,
  setActorCheck,
  setEnemyCheck,
  VARIABLE_COMPARISONS,
  writeCondition,
  writeConditionalBranchBlock,
};
export type { BranchCondition, BranchConditionKind, ConditionalBranchBlockModel };
