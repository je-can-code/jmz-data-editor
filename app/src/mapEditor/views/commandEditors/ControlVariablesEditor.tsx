import React, { useMemo } from 'react';
import { TextField } from '@mui/material';
import type { CommandEditorProps } from '../../core/commands/CommandEditorRegistry.ts';
import {
  GAME_DATA_TYPES,
  LAST_GAME_DATA,
  OPERAND_KINDS,
  OTHER_GAME_DATA,
  parseControlVariables,
  setGameDataType,
  setOperandKind,
  VARIABLE_OPERATIONS,
  writeControlVariables,
  type ControlVariablesModel,
  type VariableOperand,
} from '../../core/commands/editors/controlVariables.ts';
import { CharacterField, EditorStack, FieldRow, IdField, NumberField, SelectField, UneditableCommand } from './editorFields.tsx';

/**
 * The largest number MZ's dialog lets a constant or a random bound reach, either way.
 */
const MAX_CONSTANT = 99999999;

/**
 * Whether the command changes one variable or a range.
 */
const SPANS = [
  { value: 0, label: 'One variable' },
  { value: 1, label: 'A range' },
];

/**
 * Builds the choices of a list of labels, numbered from 0.
 * @param {readonly string[]} labels The labels.
 * @returns {{ value: number, label: string }[]} The choices.
 */
const indexed = (labels: readonly string[]) => labels.map((label, value) => ({ value, label }));

/**
 * The eight places in a party or a troop, as MZ numbers them.
 */
const MEMBERS = indexed(Array.from({ length: 8 }, (_, index) => `#${index + 1}`));

/**
 * Edits game data: which data, and its details.
 * @param {{ operand: Extract<VariableOperand, { kind: 'gameData' }>, model: ControlVariablesModel, change: (next: ControlVariablesModel) => void }} props The data and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const GameDataFields = (props: {
  operand: Extract<VariableOperand, { kind: 'gameData' }>;
  model: ControlVariablesModel;
  change: (next: ControlVariablesModel) => void;
}) =>
{
  const { operand, model, change } = props;
  const type = GAME_DATA_TYPES.find(each => each.type === operand.type);
  const setParam1 = (param1: number) => change({ ...model, operand: { ...operand, param1 } });
  const setParam2 = (param2: number) => change({ ...model, operand: { ...operand, param2 } });
  const firstDetail: Record<string, React.JSX.Element> = {
    'item': <IdField label={'Item'} kind={'item'} value={operand.param1} onChange={setParam1}/>,
    'weapon': <IdField label={'Weapon'} kind={'weapon'} value={operand.param1} onChange={setParam1}/>,
    'armor': <IdField label={'Armor'} kind={'armor'} value={operand.param1} onChange={setParam1}/>,
    'actor': <IdField label={'Actor'} kind={'actor'} value={operand.param1} onChange={setParam1}/>,
    'enemy-index': <SelectField label={'Enemy'} value={operand.param1} options={MEMBERS} width={100} onChange={setParam1}/>,
    'character': <CharacterField label={'Character'} value={operand.param1} onChange={setParam1}/>,
    'party-index': <SelectField label={'Party member'} value={operand.param1} options={MEMBERS} width={130} onChange={setParam1}/>,
    'other': <SelectField label={'Value'} value={operand.param1} options={indexed(OTHER_GAME_DATA)} width={180} onChange={setParam1}/>,
    'last': <SelectField label={'Value'} value={operand.param1} options={indexed(LAST_GAME_DATA)} width={240} onChange={setParam1}/>,
  };

  return (
    <FieldRow>
      <SelectField label={'Game data'} value={operand.type} options={GAME_DATA_TYPES.map(each => ({ value: each.type, label: each.label }))}
        width={150} onChange={next => change(setGameDataType(model, next))}/>
      {type === undefined ? null : firstDetail[type.param1]}
      {type?.param2 === undefined
        ? null
        : <SelectField label={'Detail'} value={operand.param2} options={indexed(type.param2)} width={150} onChange={setParam2}/>}
    </FieldRow>
  );
};

/**
 * Edits whatever the operand is.
 * @param {{ model: ControlVariablesModel, change: (next: ControlVariablesModel) => void }} props The command and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const OperandFields = (props: { model: ControlVariablesModel; change: (next: ControlVariablesModel) => void }) =>
{
  const { model, change } = props;
  const { operand } = model;
  const set = (next: VariableOperand) => change({ ...model, operand: next });
  switch (operand.kind)
  {
    case 'constant':
      return <NumberField label={'Value'} value={operand.value} min={-MAX_CONSTANT} max={MAX_CONSTANT} width={140} onChange={value => set({ ...operand, value })}/>;
    case 'variable':
      return <IdField label={'Variable'} kind={'variable'} value={operand.variableId} onChange={variableId => set({ ...operand, variableId })}/>;
    case 'random':
      return (
        <FieldRow>
          <NumberField label={'From'} value={operand.min} min={-MAX_CONSTANT} max={MAX_CONSTANT} width={140} onChange={min => set({ ...operand, min })}/>
          <NumberField label={'To'} value={operand.max} min={-MAX_CONSTANT} max={MAX_CONSTANT} width={140} onChange={max => set({ ...operand, max })}/>
        </FieldRow>
      );
    case 'gameData':
      return <GameDataFields operand={operand} model={model} change={change}/>;
    case 'script':
      return (
        <TextField size={'small'} fullWidth label={'Script'} value={operand.script}
          slotProps={{ htmlInput: { spellCheck: false, style: { fontFamily: 'monospace' } } }}
          onChange={event => set({ ...operand, script: event.target.value })}/>
      );
  }
};

/**
 * Edits a Control Variables command: the variable or range it changes, how, and what with, every kind of
 * operand MZ offers included.
 * @param {CommandEditorProps} props The command and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const ControlVariablesEditor = (props: CommandEditorProps) =>
{
  const { command, onChange } = props;
  const model = useMemo(() => parseControlVariables(command), [ command ]);
  if (model === null)
  {
    return <UneditableCommand command={command}/>;
  }

  const change = (next: ControlVariablesModel) => onChange(writeControlVariables(command, next), []);
  const ranged = model.end !== model.start;

  return (
    <EditorStack>
      <FieldRow>
        <SelectField label={'Changes'} value={ranged ? 1 : 0} options={SPANS} width={150}
          onChange={span => change({ ...model, end: span === 1 ? model.start + 1 : model.start })}/>
        {ranged
          ? (
            <>
              <NumberField label={'From variable'} value={model.start} min={1} max={model.end} width={130} onChange={start => change({ ...model, start })}/>
              <NumberField label={'To variable'} value={model.end} min={model.start} width={130} onChange={end => change({ ...model, end })}/>
            </>
          )
          : <IdField label={'Variable'} kind={'variable'} value={model.start} onChange={id => change({ ...model, start: id, end: id })}/>}
        <SelectField label={'Operation'} value={model.operation} options={VARIABLE_OPERATIONS} width={140}
          onChange={operation => change({ ...model, operation })}/>
      </FieldRow>
      <FieldRow>
        <SelectField label={'Operand'} value={model.operand.kind} options={OPERAND_KINDS.map(({ kind, label }) => ({ value: kind, label }))}
          width={150} onChange={kind => change(setOperandKind(model, kind))}/>
        <OperandFields model={model} change={change}/>
      </FieldRow>
    </EditorStack>
  );
};

export { ControlVariablesEditor };
