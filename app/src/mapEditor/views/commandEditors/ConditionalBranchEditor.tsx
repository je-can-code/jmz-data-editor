import React, { useMemo, useState } from 'react';
import { Alert, Button, TextField, Typography } from '@mui/material';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import type { CommandFieldKind } from '../../core/commands/catalogTypes.ts';
import {
  ACTOR_CHECKS,
  CONDITION_BUTTONS,
  CONDITION_KINDS,
  defaultCondition,
  elseCommandCount,
  parseCondition,
  parseConditionalBranchBlock,
  setActorCheck,
  setEnemyCheck,
  VARIABLE_COMPARISONS,
  writeCondition,
  writeConditionalBranchBlock,
  type BranchCondition,
  type BranchConditionKind,
} from '../../core/commands/editors/conditionalBranch.ts';
import { CharacterField, CheckField, EditorStack, FieldRow, IdField, NumberField, SelectField, UneditableCommand } from './editorFields.tsx';

/**
 * Builds the choices of a list of labels, numbered from 0.
 * @param {readonly string[]} labels The labels.
 * @returns {{ value: number, label: string }[]} The choices.
 */
const indexed = (labels: readonly string[]) => labels.map((label, value) => ({ value, label }));

/**
 * ON and OFF, as MZ stores them for switches.
 */
const ON_OFF = [ { value: 0, label: 'ON' }, { value: 1, label: 'OFF' } ];

/**
 * The four directions a character can face.
 */
const FACINGS = [ { value: 2, label: 'Down' }, { value: 4, label: 'Left' }, { value: 6, label: 'Right' }, { value: 8, label: 'Up' } ];

/**
 * The database kind each actor check names, after "in the party" (which names nothing) and "name" (text).
 */
const ACTOR_CHECK_KINDS: readonly (CommandFieldKind | null)[] = [ null, null, 'class', 'skill', 'weapon', 'armor', 'state' ];

/**
 * What one condition form takes: its condition, and a way to replace it.
 */
type ConditionFormProps<K extends BranchConditionKind> = {
  readonly condition: Extract<BranchCondition, { kind: K }>;
  readonly onChange: (condition: BranchCondition) => void;
};

/**
 * Edits a variable condition: the variable, the comparison, and a constant or another variable to compare with.
 * @param {ConditionFormProps<'variable'>} props The condition and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const VariableForm = ({ condition, onChange }: ConditionFormProps<'variable'>) =>
{
  return (
    <FieldRow>
      <IdField label={'Variable'} kind={'variable'} value={condition.variableId} onChange={variableId => onChange({ ...condition, variableId })}/>
      <SelectField label={'Is'} value={condition.comparison} options={indexed(VARIABLE_COMPARISONS)} width={80}
        onChange={comparison => onChange({ ...condition, comparison })}/>
      <SelectField label={'Than'} value={condition.operandType} options={indexed([ 'Constant', 'Variable' ])} width={120}
        onChange={operandType => onChange({ ...condition, operandType, operand: operandType === 0 ? 0 : 1 })}/>
      {condition.operandType === 0
        ? <NumberField label={'Value'} value={condition.operand} width={130} onChange={operand => onChange({ ...condition, operand })}/>
        : <IdField label={'Variable'} kind={'variable'} value={condition.operand} onChange={operand => onChange({ ...condition, operand })}/>}
    </FieldRow>
  );
};

/**
 * Edits an actor condition: the actor, what to check, and the name or row it checks for.
 * @param {ConditionFormProps<'actor'>} props The condition and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const ActorForm = ({ condition, onChange }: ConditionFormProps<'actor'>) =>
{
  const kind = ACTOR_CHECK_KINDS.at(condition.check) ?? null;
  return (
    <FieldRow>
      <IdField label={'Actor'} kind={'actor'} value={condition.actorId} onChange={actorId => onChange({ ...condition, actorId })}/>
      <SelectField label={'Check'} value={condition.check} options={indexed(ACTOR_CHECKS)} width={140}
        onChange={check => onChange(setActorCheck(condition, check))}/>
      {condition.check === 1
        ? <TextField size={'small'} label={'Name'} value={String(condition.operand ?? '')} onChange={event => onChange({ ...condition, operand: event.target.value })}/>
        : null}
      {kind === null || typeof condition.operand !== 'number'
        ? null
        : <IdField label={ACTOR_CHECKS[condition.check]} kind={kind} value={condition.operand} onChange={operand => onChange({ ...condition, operand })}/>}
    </FieldRow>
  );
};

/**
 * Edits an enemy condition: which troop member, and whether it has appeared or has a state.
 * @param {ConditionFormProps<'enemy'>} props The condition and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const EnemyForm = ({ condition, onChange }: ConditionFormProps<'enemy'>) =>
{
  return (
    <FieldRow>
      <SelectField label={'Enemy'} value={condition.enemyIndex} options={indexed(Array.from({ length: 8 }, (_, index) => `#${index + 1}`))} width={100}
        onChange={enemyIndex => onChange({ ...condition, enemyIndex })}/>
      <SelectField label={'Check'} value={condition.check} options={indexed([ 'Appeared', 'State' ])} width={120}
        onChange={check => onChange(setEnemyCheck(condition, check))}/>
      {condition.stateId === null
        ? null
        : <IdField label={'State'} kind={'state'} value={condition.stateId} onChange={stateId => onChange({ ...condition, stateId })}/>}
    </FieldRow>
  );
};

/**
 * Edits a timer condition, in minutes and seconds as MZ shows it.
 * @param {ConditionFormProps<'timer'>} props The condition and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const TimerForm = ({ condition, onChange }: ConditionFormProps<'timer'>) =>
{
  const minutes = Math.floor(condition.seconds / 60);
  const seconds = condition.seconds % 60;
  return (
    <FieldRow>
      <SelectField label={'Timer is'} value={condition.comparison} options={indexed([ 'At least', 'At most' ])} width={120}
        onChange={comparison => onChange({ ...condition, comparison })}/>
      <NumberField label={'Minutes'} value={minutes} min={0} max={99} width={90} onChange={next => onChange({ ...condition, seconds: next * 60 + seconds })}/>
      <NumberField label={'Seconds'} value={seconds} min={0} max={59} width={90} onChange={next => onChange({ ...condition, seconds: minutes * 60 + next })}/>
    </FieldRow>
  );
};

/**
 * Edits a weapon or armor condition: the row, and whether equipped ones count.
 * @param {{ label: string, kind: CommandFieldKind, id: number, includeEquipment: boolean, onChange: (id: number, includeEquipment: boolean) => void }} props The row and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const EquipmentForm = (props: { label: string; kind: CommandFieldKind; id: number; includeEquipment: boolean; onChange: (id: number, includeEquipment: boolean) => void }) =>
{
  const { label, kind, id, includeEquipment, onChange } = props;
  return (
    <FieldRow>
      <IdField label={label} kind={kind} value={id} onChange={next => onChange(next, includeEquipment)}/>
      <CheckField label={'Include equipped'} checked={includeEquipment} onChange={next => onChange(id, next)}/>
    </FieldRow>
  );
};

/**
 * Edits whatever kind of condition the branch tests.
 * @param {{ condition: BranchCondition, onChange: (condition: BranchCondition) => void }} props The condition and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const ConditionFields = (props: { condition: BranchCondition; onChange: (condition: BranchCondition) => void }) =>
{
  const { condition, onChange } = props;
  switch (condition.kind)
  {
    case 'switch':
      return (
        <FieldRow>
          <IdField label={'Switch'} kind={'switch'} value={condition.switchId} onChange={switchId => onChange({ ...condition, switchId })}/>
          <SelectField label={'Is'} value={condition.value} options={ON_OFF} width={90} onChange={value => onChange({ ...condition, value })}/>
        </FieldRow>
      );
    case 'variable':
      return <VariableForm condition={condition} onChange={onChange}/>;
    case 'selfSwitch':
      return (
        <FieldRow>
          <SelectField label={'Self switch'} value={condition.letter} options={[ 'A', 'B', 'C', 'D' ].map(letter => ({ value: letter, label: letter }))} width={110}
            onChange={letter => onChange({ ...condition, letter })}/>
          <SelectField label={'Is'} value={condition.value} options={ON_OFF} width={90} onChange={value => onChange({ ...condition, value })}/>
        </FieldRow>
      );
    case 'timer':
      return <TimerForm condition={condition} onChange={onChange}/>;
    case 'actor':
      return <ActorForm condition={condition} onChange={onChange}/>;
    case 'enemy':
      return <EnemyForm condition={condition} onChange={onChange}/>;
    case 'character':
      return (
        <FieldRow>
          <CharacterField label={'Character'} value={condition.characterId} onChange={characterId => onChange({ ...condition, characterId })}/>
          <SelectField label={'Is facing'} value={condition.direction} options={FACINGS} width={110} onChange={direction => onChange({ ...condition, direction })}/>
        </FieldRow>
      );
    case 'gold':
      return (
        <FieldRow>
          <SelectField label={'Gold is'} value={condition.comparison} options={indexed([ 'At least', 'At most', 'Less than' ])} width={130}
            onChange={comparison => onChange({ ...condition, comparison })}/>
          <NumberField label={'Amount'} value={condition.amount} min={0} width={140} onChange={amount => onChange({ ...condition, amount })}/>
        </FieldRow>
      );
    case 'item':
      return <IdField label={'Item'} kind={'item'} value={condition.itemId} onChange={itemId => onChange({ ...condition, itemId })}/>;
    case 'weapon':
      return <EquipmentForm label={'Weapon'} kind={'weapon'} id={condition.weaponId} includeEquipment={condition.includeEquipment}
        onChange={(weaponId, includeEquipment) => onChange({ ...condition, weaponId, includeEquipment })}/>;
    case 'armor':
      return <EquipmentForm label={'Armor'} kind={'armor'} id={condition.armorId} includeEquipment={condition.includeEquipment}
        onChange={(armorId, includeEquipment) => onChange({ ...condition, armorId, includeEquipment })}/>;
    case 'button':
      return (
        <FieldRow>
          <SelectField label={'Button'} value={condition.button} options={CONDITION_BUTTONS} width={130} onChange={button => onChange({ ...condition, button })}/>
          <SelectField label={'Is'} value={condition.how ?? 0} options={indexed([ 'Pressed', 'Triggered', 'Repeated' ])} width={130}
            onChange={how => onChange({ ...condition, how })}/>
        </FieldRow>
      );
    case 'script':
      return (
        <TextField size={'small'} fullWidth label={'Script'} value={condition.script}
          slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }}
          onChange={event => onChange({ ...condition, script: event.target.value })}/>
      );
    case 'vehicle':
      return <SelectField label={'Riding'} value={condition.vehicleId} options={indexed([ 'Boat', 'Ship', 'Airship' ])} width={130}
        onChange={vehicleId => onChange({ ...condition, vehicleId })}/>;
  }
};

/**
 * The Else checkbox, which asks once more before removing an Else that holds commands.
 * @param {{ hasElse: boolean, held: number, onChange: (hasElse: boolean) => void }} props Whether there is an Else, what it holds, and what to do with a change.
 * @returns {React.JSX.Element} The checkbox.
 */
const ElseToggle = (props: { hasElse: boolean; held: number; onChange: (hasElse: boolean) => void }) =>
{
  const { hasElse, held, onChange } = props;
  const [ confirming, setConfirming ] = useState(false);
  return (
    <>
      <CheckField label={'Else branch'} checked={hasElse} onChange={checked =>
      {
        if (checked === false && held > 0)
        {
          setConfirming(true);
          return;
        }

        onChange(checked);
      }}/>
      {confirming
        ? (
          <Alert severity={'warning'} variant={'outlined'} action={(
            <>
              <Button size={'small'} color={'inherit'} onClick={() => setConfirming(false)}>Keep</Button>
              <Button size={'small'} color={'inherit'} onClick={() =>
              {
                setConfirming(false);
                onChange(false);
              }}>Remove</Button>
            </>
          )}>
            {held === 1 ? 'The Else holds a command, which goes with it.' : `The Else holds ${held} commands, which go with it.`}
          </Alert>
        )
        : null}
    </>
  );
};

/**
 * Edits a Conditional Branch: every kind of condition MZ offers, and whether it has an Else. Adding or removing
 * the Else changes the block, so it is offered when the list hands the editor the whole block.
 * @param {CommandEditorProps} props The command, its block when handed over, and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const ConditionalBranchEditor = (props: CommandEditorProps) =>
{
  const { command, onChange, block } = props;
  const blockModel = useMemo(() => (block === undefined ? null : parseConditionalBranchBlock(block.commands)), [ block ]);
  const condition = useMemo(() => blockModel?.condition ?? parseCondition(command), [ blockModel, command ]);
  if (condition === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const changeCondition = (next: BranchCondition) =>
  {
    if (block !== undefined && blockModel !== null)
    {
      block.onChange(writeConditionalBranchBlock(block.commands, { ...blockModel, condition: next }));
      return;
    }

    onChange(writeCondition(command, next), []);
  };

  return (
    <EditorStack>
      <FieldRow>
        <SelectField label={'When'} value={condition.kind} options={CONDITION_KINDS.map(({ kind, label }) => ({ value: kind, label }))} width={150}
          onChange={kind => changeCondition(kind === condition.kind ? condition : defaultCondition(kind))}/>
      </FieldRow>
      <ConditionFields condition={condition} onChange={changeCondition}/>
      {block === undefined || blockModel === null
        ? <Typography variant={'caption'} color={'text.secondary'}>The Else is changed from the command list.</Typography>
        : (
          <ElseToggle hasElse={blockModel.hasElse} held={elseCommandCount(block.commands)}
            onChange={hasElse => block.onChange(writeConditionalBranchBlock(block.commands, { ...blockModel, hasElse }))}/>
        )}
    </EditorStack>
  );
};

export { ConditionalBranchEditor };
