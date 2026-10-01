import React, { useContext } from 'react';
import { Box, Checkbox, Typography } from '@mui/material';
import type { CommandField } from '../../core/commands/catalogTypes.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import {
  CONDITION_NOUNS,
  readPageConditions,
  SELF_SWITCH_LETTERS,
  VARIABLE_VALUE_LIMIT,
  type ConditionChange,
  type ConditionKind,
  type IdConditionKind,
  type PageConditionRow,
} from '../../core/eventWindow/pageConditions.ts';
import type { RmmzEventConditions } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { SoundPlayerContext } from '../commandList/commandListResources.ts';
import { FieldControl } from '../commandList/FieldControl.tsx';

/**
 * The picker each id condition shows, as a field the shared controls draw: a switch, a variable, an item or an actor,
 * each picked by name.
 */
const ID_FIELDS: Readonly<Record<IdConditionKind, CommandField>> = {
  switch1: { key: 'switch1', label: 'Switch', param: [ 0 ], kind: 'switch' },
  switch2: { key: 'switch2', label: 'Switch', param: [ 0 ], kind: 'switch' },
  variable: { key: 'variable', label: 'Variable', param: [ 0 ], kind: 'variable' },
  item: { key: 'item', label: 'Item', param: [ 0 ], kind: 'item' },
  actor: { key: 'actor', label: 'Actor', param: [ 0 ], kind: 'actor' },
};

/**
 * The value a variable condition waits for, as a number field.
 */
const VALUE_FIELD: CommandField = {
  key: 'value',
  label: 'At least',
  param: [ 0 ],
  kind: 'number',
  min: -VARIABLE_VALUE_LIMIT,
  max: VARIABLE_VALUE_LIMIT,
};

/**
 * The self switch a self switch condition waits for, as a choice of its four letters.
 */
const LETTER_FIELD: CommandField = {
  key: 'letter',
  label: 'Self switch',
  param: [ 0 ],
  kind: 'select',
  options: SELF_SWITCH_LETTERS.map(letter => ({ value: letter, label: letter })),
};

/**
 * The words after each condition's picker, finishing what it waits for.
 */
const CONDITION_ENDINGS: Readonly<Record<ConditionKind, string>> = {
  switch1: 'is ON',
  switch2: 'is ON',
  variable: '',
  selfSwitch: 'is ON',
  item: 'is held',
  actor: 'in party',
};

/**
 * What a condition row draws with: the page's conditions, the project's names, and where a change goes.
 */
type ConditionRowProps = {
  readonly row: PageConditionRow;
  readonly names: DatabaseNamesJson | null;
  readonly onChange: (change: ConditionChange) => void;
};

/**
 * The pickers of one condition: its switch, variable, row or self switch, and a variable's value.
 * @param {ConditionRowProps} props The condition, the names, and where a change goes.
 * @returns {React.JSX.Element} The pickers.
 */
const ConditionPickers = (props: ConditionRowProps) =>
{
  const { row, names, onChange } = props;
  const { api } = useMapEditorServices();
  const playSound = useContext(SoundPlayerContext);
  const shared = { names, api, playSound };

  if (row.kind === 'selfSwitch')
  {
    return <FieldControl {...shared} field={LETTER_FIELD} value={row.letter} onChange={letter => onChange({ kind: row.kind, part: 'letter', value: String(letter) })}/>;
  }

  const picker = <FieldControl {...shared} field={ID_FIELDS[row.kind]} value={row.id} onChange={id => onChange({ kind: row.kind, part: 'id', value: Number(id) })}/>;
  if (row.kind !== 'variable')
  {
    return picker;
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 104px', gap: 1 }}>
      {picker}
      <FieldControl {...shared} field={VALUE_FIELD} value={row.value} onChange={value => onChange({ kind: 'variable', part: 'value', value: Number(value) })}/>
    </Box>
  );
};

/**
 * One condition: a box saying whether the page waits for it, its pickers, and the words finishing it. The pickers of a
 * condition the page does not wait for are greyed and out of reach, as MZ shows them, keeping their values.
 * @param {ConditionRowProps} props The condition, the names, and where a change goes.
 * @returns {React.JSX.Element} The row.
 */
const ConditionRow = (props: ConditionRowProps) =>
{
  const { row, onChange } = props;
  return (
    <>
      <Checkbox
        size={'small'}
        checked={row.enabled}
        slotProps={{ input: { 'aria-label': `Use the ${CONDITION_NOUNS[row.kind]}` } }}
        onChange={event => onChange({ kind: row.kind, part: 'enabled', value: event.target.checked })}
      />
      <Box inert={row.enabled === false} sx={{ opacity: row.enabled ? 1 : 0.5, minWidth: 0 }} data-testid={`condition-${row.kind}`}>
        <ConditionPickers {...props}/>
      </Box>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ whiteSpace: 'nowrap' }}>
        {CONDITION_ENDINGS[row.kind]}
      </Typography>
    </>
  );
};

/**
 * What the conditions section takes: the page's conditions, the project's names, and where a change goes.
 */
type PageConditionsProps = {
  readonly conditions: RmmzEventConditions;
  readonly names: DatabaseNamesJson | null;
  readonly onChange: (change: ConditionChange) => void;
};

/**
 * A page's conditions, in MZ's order: two switches, a variable at or above a value, a self switch, an item held and an
 * actor in the party. The page is the one that runs only while every condition ticked here holds.
 * @param {PageConditionsProps} props The conditions, the names, and where a change goes.
 * @returns {React.JSX.Element} The section.
 */
const PageConditions = (props: PageConditionsProps) =>
{
  const { conditions, names, onChange } = props;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 1, rowGap: 1.25, alignItems: 'center' }}>
      {readPageConditions(conditions).map(row => <ConditionRow key={row.kind} row={row} names={names} onChange={onChange}/>)}
    </Box>
  );
};

export { PageConditions };
