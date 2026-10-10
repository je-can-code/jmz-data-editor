import React, { useEffect, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Close, OpenInNew } from '@mui/icons-material';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { parseDecimal, parseWholeNumber } from '../../core/properties/propertyInputs.ts';
import type { BattlerChange, NumberRow, SwitchRow } from './battlerEdits.ts';
import { readBattlerPage, ROLES, TRAITS, type BattlerReading, type BattlerValue, type EnemyRecord } from './battlerReading.ts';
import {
  alertWords,
  hiddenRow,
  moveSpeedRow,
  numberRow,
  rolesRow,
  rowOf,
  shared,
  SOURCE_WORDS,
  switchWords,
  teamRow,
  teamWords,
  traitsRow,
  type RowModel,
} from './battlerRows.ts';
import type { BattlerSetup } from './battlerSetup.ts';
import { enemyOptions, type EnemyOption } from './enemyBook.ts';
import { motionLinesOf, motionNamed, MOTIONS, PARAMETER_WORDS, type MotionLine, type MotionValue } from './motionTags.ts';

/**
 * One battler the panel shows: the event, and the page of it the panel reads and changes.
 */
type PickedBattler = {
  readonly event: RmmzMapEvent;
  readonly pageIndex: number;
};

/**
 * What the battler panel shows and does: the picked battlers, what it reads them with, the enemies and the states'
 * names, how a change is made, and how an enemy is opened in the data editor.
 */
type BattlerPanelProps = {
  readonly battlers: readonly PickedBattler[];
  readonly setup: BattlerSetup;
  readonly enemies: readonly (EnemyRecord | null)[];

  /**
   * The project's state names by id, for the passives; null until they arrive.
   */
  readonly stateNames: readonly string[] | null;
  readonly onChange: (change: BattlerChange) => void;
  readonly onOpenEnemy: (enemyId: number) => void;
};

/**
 * What a value box shows while the picked battlers hold different values.
 */
const MIXED = 'Mixed';

/**
 * The widest number a battler's box takes: far past anything a map holds, short of numbers that stop being exact.
 */
const NUMBER_TOP = 999_999;

/**
 * How each number row's box reads a number: whole, or with a fraction, and whether below 0 is allowed.
 */
type NumberSpec = {
  readonly places: number;
  readonly min: number;
};

/**
 * A whole number from 0, as J-ABS reads a battler's senses and alert time.
 */
const WHOLE: NumberSpec = { places: 0, min: 0 };

/**
 * A number from 0 to two places, as J-ABS reads a move speed or an alerted pursuit.
 */
const FRACTION: NumberSpec = { places: 2, min: 0 };

/**
 * A whole number, below 0 too, as J-LevelMaster reads a level.
 */
const SIGNED: NumberSpec = { places: 0, min: -NUMBER_TOP };

/**
 * Reads a number as a row's box takes it, or null for text it refuses.
 * @param {string} text What was typed.
 * @param {NumberSpec} spec How the box reads numbers.
 * @returns {number | null} The number, or null.
 */
const parsedNumber = (text: string, spec: NumberSpec): number | null =>
{
  return spec.places === 0
    ? parseWholeNumber(text, { min: spec.min, max: NUMBER_TOP })
    : parseDecimal(text, { min: spec.min, max: NUMBER_TOP, places: spec.places });
};

/**
 * One row's frame: its name, its control, where its value comes from, the button taking the page's own value out when
 * the page sets one, and a line under it.
 * @param {{ label: string, from: RowModel<unknown>['from'], set: boolean, clearTip: string, note: string | null, onClear: () => void, children: React.ReactNode, testId: string }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const RowFrame = (props: {
  readonly label: string;
  readonly from: RowModel<unknown>['from'];
  readonly set: boolean;
  readonly clearTip: string;
  readonly note: string | null;
  readonly onClear: () => void;
  readonly children: React.ReactNode;
  readonly testId: string;
}) =>
{
  const { label, from, set, clearTip, note, onClear, children, testId } = props;
  const own = from === 'event';
  return (
    <Box
      data-testid={`battler-row-${testId}`}
      sx={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr) auto', alignItems: 'center', columnGap: 1, rowGap: 0.25 }}
    >
      <Typography variant={'body2'} noWrap title={label}>
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        {children}
      </Box>
      <Stack direction={'row'} alignItems={'center'} spacing={0.25} sx={{ justifySelf: 'end' }}>
        <Chip
          size={'small'}
          label={SOURCE_WORDS[from]}
          color={own ? 'primary' : 'default'}
          variant={own ? 'filled' : 'outlined'}
          sx={{ height: 20, fontSize: '0.7rem' }}
          data-testid={`battler-source-${testId}`}
        />
        <Tooltip title={set ? clearTip : ''}>
          <span>
            <IconButton size={'small'} aria-label={clearTip} disabled={set === false} onClick={onClear} sx={{ visibility: set ? 'visible' : 'hidden' }}>
              <Close fontSize={'inherit'}/>
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      {note !== null && (
        <Typography variant={'caption'} color={'text.secondary'} sx={{ gridColumn: '2 / 4', lineHeight: 1.3 }} data-testid={`battler-note-${testId}`}>
          {note}
        </Typography>
      )}
    </Box>
  );
};

/**
 * What a row's button taking the page's own value out says it leaves.
 * @param {RowModel<unknown>} model The row.
 * @returns {string} Such as "Use the enemy's", or "Use the default".
 */
const clearTipOf = (model: RowModel<unknown>): string =>
{
  return model.note !== null && model.note.startsWith('Default')
    ? 'Use the default'
    : 'Use the enemy\'s';
};

/**
 * A number box committed by leaving it or by Enter, Escape putting back the value, which also follows any change made
 * elsewhere, such as an undo. A number it cannot take is refused and put back.
 * @param {{ value: number | null, mixed: boolean, spec: NumberSpec, unit: string, label: string, onCommit: (value: number) => void }} props The box.
 * @returns {React.JSX.Element} The box.
 */
const NumberBox = (props: {
  readonly value: number | null;
  readonly mixed: boolean;
  readonly spec: NumberSpec;
  readonly unit: string;
  readonly label: string;
  readonly onCommit: (value: number) => void;
}) =>
{
  const { value, mixed, spec, unit, label, onCommit } = props;
  const shown = mixed || value === null ? '' : String(value);
  const [ draft, setDraft ] = useState(shown);
  const parsed = parsedNumber(draft, spec);
  const refused = draft !== shown && draft.trim() !== '' && parsed === null;

  useEffect(() =>
  {
    setDraft(shown);
  }, [ shown ]);

  /**
   * Hands on a number that differs from the value, and puts back the value otherwise.
   */
  const commit = () =>
  {
    if (draft === shown || parsed === null)
    {
      setDraft(shown);
      return;
    }

    onCommit(parsed);
  };

  return (
    <Stack direction={'row'} alignItems={'center'} spacing={0.75}>
      <TextField
        value={draft}
        size={'small'}
        placeholder={mixed ? MIXED : undefined}
        error={refused}
        slotProps={{ htmlInput: { 'aria-label': label, inputMode: spec.places === 0 ? 'numeric' : 'decimal', style: { padding: '3px 8px' } } }}
        onChange={event => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={event =>
        {
          if (event.key === 'Escape')
          {
            setDraft(shown);
            return;
          }

          if (event.key === 'Enter')
          {
            commit();
          }
        }}
        sx={{ width: 76 }}
      />
      {unit !== '' && (
        <Typography variant={'caption'} color={'text.secondary'} noWrap>
          {unit}
        </Typography>
      )}
    </Stack>
  );
};

/**
 * One number of the battler's: its box, where its value comes from, and the button taking the page's own out.
 * @param {{ label: string, unit: string, spec: NumberSpec, model: RowModel<number>, row: NumberRow, onChange: (change: BattlerChange) => void, clearTip?: string, note?: string | null }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const NumberField = (props: {
  readonly label: string;
  readonly unit: string;
  readonly spec: NumberSpec;
  readonly model: RowModel<number>;
  readonly row: NumberRow;
  readonly onChange: (change: BattlerChange) => void;
  readonly clearTip?: string;
  readonly note?: string | null;
}) =>
{
  const { label, unit, spec, model, row, onChange } = props;
  return (
    <RowFrame
      label={label}
      from={model.from}
      set={model.set}
      clearTip={props.clearTip ?? clearTipOf(model)}
      note={props.note === undefined ? model.note : props.note}
      onClear={() => onChange({ row, value: null })}
      testId={row}
    >
      <NumberBox value={model.value} mixed={model.mixed} spec={spec} unit={unit} label={label} onCommit={value => onChange({ row, value })}/>
    </RowFrame>
  );
};

/**
 * One of the battler's switches: ticked, unticked, or both among the picked battlers.
 * @param {{ label: string, model: RowModel<boolean>, row: SwitchRow, onChange: (change: BattlerChange) => void, note?: string | null }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const SwitchField = (props: {
  readonly label: string;
  readonly model: RowModel<boolean>;
  readonly row: SwitchRow;
  readonly onChange: (change: BattlerChange) => void;
  readonly note?: string | null;
}) =>
{
  const { label, model, row, onChange } = props;
  return (
    <RowFrame
      label={label}
      from={model.from}
      set={model.set}
      clearTip={clearTipOf(model)}
      note={props.note === undefined ? model.note : props.note}
      onClear={() => onChange({ row, value: null })}
      testId={row}
    >
      <Checkbox
        size={'small'}
        checked={model.value === true}
        indeterminate={model.mixed}
        onChange={() => onChange({ row, value: model.value !== true })}
        slotProps={{ input: { 'aria-label': label } }}
        sx={{ p: 0.25 }}
      />
    </RowFrame>
  );
};

/**
 * One of the battler's sets, its AI traits or roles: a chip for each word, filled when the battler has it. With the
 * picked battlers holding different sets, the chips stand still and say so.
 * @param {{ label: string, words: readonly string[], model: RowModel<readonly string[]>, row: 'aiTraits' | 'aiRoles', onChange: (change: BattlerChange) => void }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const SetField = (props: {
  readonly label: string;
  readonly words: readonly string[];
  readonly model: RowModel<readonly string[]>;
  readonly row: 'aiTraits' | 'aiRoles';
  readonly onChange: (change: BattlerChange) => void;
}) =>
{
  const { label, words, model, row, onChange } = props;
  const value = model.value ?? [];

  /**
   * Gives every picked battler the set with one word turned on or off.
   * @param {string} word The word.
   */
  const toggle = (word: string) =>
  {
    const next = value.includes(word) ? value.filter(each => each !== word) : [ ...value, word ];
    onChange({ row, value: next });
  };

  return (
    <RowFrame
      label={label}
      from={model.from}
      set={model.set}
      clearTip={row === 'aiRoles' ? 'Take the roles out' : 'Use the enemy\'s'}
      note={model.mixed ? 'Differs between the picked battlers.' : model.note}
      onClear={() => onChange({ row, value: null })}
      testId={row}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {words.map(word => (
          <Chip
            key={word}
            size={'small'}
            label={`${word.charAt(0).toUpperCase()}${word.slice(1)}`}
            color={value.includes(word) ? 'primary' : 'default'}
            variant={value.includes(word) ? 'filled' : 'outlined'}
            disabled={model.mixed}
            onClick={() => toggle(word)}
            sx={{ height: 20, fontSize: '0.7rem' }}
          />
        ))}
      </Box>
    </RowFrame>
  );
};

/**
 * The battler's team: allies, enemies or neither, or a team of another number, which a page naming one keeps. While the
 * battler is inanimate it is always neutral, and the choice waits.
 * @param {{ model: RowModel<number>, inanimate: boolean, onChange: (change: BattlerChange) => void }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const TeamField = (props: { readonly model: RowModel<number>; readonly inanimate: boolean; readonly onChange: (change: BattlerChange) => void }) =>
{
  const { model, inanimate, onChange } = props;
  const teams = [ 0, 1, 2 ];
  const options = model.value === null || teams.includes(model.value) ? teams : [ ...teams, model.value ];
  return (
    <RowFrame label={'Team'} from={model.from} set={model.set} clearTip={clearTipOf(model)} note={model.note} onClear={() => onChange({ row: 'team', value: null })} testId={'team'}>
      <TextField
        select
        size={'small'}
        value={model.mixed || model.value === null ? '' : String(model.value)}
        disabled={inanimate}
        slotProps={{ htmlInput: { 'aria-label': 'Team' }, select: { displayEmpty: true, renderValue: selected => (selected === '' ? MIXED : teamWords(Number(selected))), SelectDisplayProps: { style: { padding: '3px 8px' } } } }}
        onChange={event => onChange({ row: 'team', value: Number(event.target.value) })}
        sx={{ minWidth: 110 }}
      >
        {options.map(team => (
          <MenuItem key={team} value={String(team)}>
            {teamWords(team)}
          </MenuItem>
        ))}
      </TextField>
    </RowFrame>
  );
};

/**
 * The enemy the picked battlers fight as, picked by name, and a button opening it in the data editor.
 * @param {{ enemyIds: readonly number[], enemies: readonly (EnemyRecord | null)[], onChange: (change: BattlerChange) => void, onOpenEnemy: (enemyId: number) => void }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const EnemyField = (props: {
  readonly enemyIds: readonly number[];
  readonly enemies: readonly (EnemyRecord | null)[];
  readonly onChange: (change: BattlerChange) => void;
  readonly onOpenEnemy: (enemyId: number) => void;
}) =>
{
  const { enemyIds, enemies, onChange, onOpenEnemy } = props;
  const { value, mixed } = shared(enemyIds);
  const options = enemyOptions(enemies, enemyIds);
  const picked = mixed ? null : options.find(option => option.id === value) ?? null;
  const missing = value !== null && mixed === false && (enemies[value] ?? null) === null && enemies.length > 0;
  return (
    <Box data-testid={'battler-row-enemy'} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 0.5, alignItems: 'center' }}>
      <Autocomplete<EnemyOption, false, false>
        size={'small'}
        options={options}
        value={picked}
        getOptionLabel={option => option.label}
        isOptionEqualToValue={(option, other) => option.id === other.id}
        onChange={(_event, option) =>
        {
          // emptying the box picks no enemy, and a battler always fights as one.
          if (option !== null)
          {
            onChange({ row: 'enemy', value: option.id });
          }
        }}
        renderInput={params => <TextField {...params} label={'Enemy'} placeholder={mixed ? MIXED : undefined}/>}
      />
      <Tooltip title={'Open in the data editor'}>
        <span>
          <IconButton size={'small'} aria-label={'Open the enemy in the data editor'} disabled={mixed || value === null} onClick={() => onOpenEnemy(value as number)}>
            <OpenInNew fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
      {missing && (
        <Typography variant={'caption'} color={'error'} sx={{ gridColumn: '1 / 3' }}>
          {`The database has no enemy ${value}; the game cannot build this battler.`}
        </Typography>
      )}
    </Box>
  );
};

/**
 * Names a state for its chip, or its id while the names are not in.
 * @param {number} stateId The state.
 * @param {readonly string[] | null} stateNames The states' names, or null.
 * @returns {string} The name.
 */
const stateLabel = (stateId: number, stateNames: readonly string[] | null): string =>
{
  const name = stateNames === null ? '' : stateNames[stateId] ?? '';
  return name === '' ? `State ${stateId}` : name;
};

/**
 * The passive states the picked battlers start with: the enemy's own, which stay, and those the page adds, which come
 * off one by one, and a picker adding another.
 * @param {{ readings: readonly BattlerReading[], stateNames: readonly string[] | null, onChange: (change: BattlerChange) => void }} props The row.
 * @returns {React.JSX.Element} The row.
 */
const PassivesField = (props: { readonly readings: readonly BattlerReading[]; readonly stateNames: readonly string[] | null; readonly onChange: (change: BattlerChange) => void }) =>
{
  const { readings, stateNames, onChange } = props;
  const own = shared(readings.map(reading => reading.passives.event));
  const enemy = shared(readings.map(reading => reading.passives.enemy));
  const added = own.value ?? [];
  const set = readings.some(reading => reading.passives.event.length > 0);
  const options = (stateNames ?? []).flatMap((name, id) => (id > 0 && name !== '' && name.startsWith('==') === false ? [ { id, label: `${String(id).padStart(4, '0')} ${name}` } ] : []));
  const enemyWords = enemy.mixed ? 'differ between the picked battlers' : (enemy.value ?? []).map(id => stateLabel(id, stateNames)).join(', ');
  return (
    <RowFrame
      label={'Passives'}
      from={set ? 'event' : 'enemy'}
      set={set}
      clearTip={'Take this battler\'s passives out'}
      note={own.mixed ? 'Differs between the picked battlers.' : `The enemy's: ${enemyWords === '' ? 'none' : enemyWords}. This battler's add to them.`}
      onClear={() => onChange({ row: 'passives', value: null })}
      testId={'passives'}
    >
      <Stack spacing={0.5}>
        {added.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {added.map((stateId, index) => (
              <Chip
                key={`${stateId}-${index}`}
                size={'small'}
                color={'primary'}
                label={stateLabel(stateId, stateNames)}
                disabled={own.mixed}
                onDelete={() => onChange({ row: 'passives', value: added.filter((_, at) => at !== index) })}
                sx={{ height: 20, fontSize: '0.7rem' }}
              />
            ))}
          </Box>
        )}
        <Autocomplete<{ id: number; label: string }, false, false>
          size={'small'}
          options={options}
          value={null}
          disabled={own.mixed}
          blurOnSelect
          clearOnBlur
          getOptionLabel={option => option.label}
          onChange={(_event, option) =>
          {
            if (option !== null)
            {
              onChange({ row: 'passives', value: [ ...added, option.id ] });
            }
          }}
          renderInput={params => <TextField {...params} placeholder={'Add a passive'} slotProps={{ htmlInput: { ...params.inputProps, 'aria-label': 'Add a passive' } }}/>}
        />
      </Stack>
    </RowFrame>
  );
};

/**
 * One setting of a motion: what the line writes, or the project's default greyed in its place, committed by leaving the
 * box or by Enter; an emptied box goes back to the default.
 * @param {{ label: string, unit: string, written: string, fallback: string, onCommit: (value: string | null) => void }} props The box.
 * @returns {React.JSX.Element} The box.
 */
const MotionValueBox = (props: {
  readonly label: string;
  readonly unit: string;
  readonly written: string;
  readonly fallback: string;
  readonly onCommit: (value: string | null) => void;
}) =>
{
  const { label, unit, written, fallback, onCommit } = props;
  const [ draft, setDraft ] = useState(written);

  useEffect(() =>
  {
    setDraft(written);
  }, [ written ]);

  /**
   * Hands on what was typed, when it differs from what the line writes.
   */
  const commit = () =>
  {
    if (draft.trim() === written)
    {
      return;
    }

    onCommit(draft.trim() === '' ? null : draft.trim());
  };

  return (
    <TextField
      size={'small'}
      label={unit === '' ? label : `${label} (${unit})`}
      value={draft}
      placeholder={fallback}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { style: { padding: '3px 8px' } } }}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event =>
      {
        if (event.key === 'Escape')
        {
          setDraft(written);
          return;
        }

        if (event.key === 'Enter')
        {
          commit();
        }
      }}
      sx={{ width: 96 }}
    />
  );
};

/**
 * One motion line: the motion, each of its settings with the project's default shown until one is typed, whether it
 * moves in step with every other character declaring it, and a button taking it off. A motion the panel does not know is
 * shown as written, and can only come off.
 * @param {{ line: MotionLine, index: number, setup: BattlerSetup, onChange: (change: BattlerChange) => void }} props The line.
 * @returns {React.JSX.Element} The line.
 */
const MotionLineField = (props: { readonly line: MotionLine; readonly index: number; readonly setup: BattlerSetup; readonly onChange: (change: BattlerChange) => void }) =>
{
  const { line, index, setup, onChange } = props;
  const motion = motionNamed(line.type);
  const remove = (
    <Tooltip title={'Take this motion off'}>
      <IconButton size={'small'} aria-label={'Take this motion off'} onClick={() => onChange({ row: 'motion', motion: index, value: null })}>
        <Close fontSize={'inherit'}/>
      </IconButton>
    </Tooltip>
  );

  if (line.known === false || motion === null)
  {
    return (
      <Stack direction={'row'} alignItems={'center'} spacing={0.5} data-testid={`battler-motion-${index}`}>
        <Typography variant={'body2'} sx={{ fontFamily: 'monospace', flex: 1 }} noWrap title={line.text}>
          {line.text}
        </Typography>
        {remove}
      </Stack>
    );
  }

  /**
   * Writes the line anew with one thing changed.
   * @param {Partial<MotionValue>} change What changes.
   */
  const write = (change: Partial<MotionValue>) =>
  {
    const values = motion.parameters.map((_, at) => line.values[at] ?? null);
    onChange({ row: 'motion', motion: index, value: { type: line.type, values, sync: line.sync, ...change } });
  };

  return (
    <Box data-testid={`battler-motion-${index}`} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 0.75 }}>
      <Stack direction={'row'} alignItems={'center'} spacing={0.5}>
        <TextField
          select
          size={'small'}
          value={line.type}
          slotProps={{ htmlInput: { 'aria-label': 'Motion' }, select: { SelectDisplayProps: { style: { padding: '3px 8px' } } } }}
          onChange={event => onChange({ row: 'motion', motion: index, value: { type: event.target.value, values: [], sync: line.sync } })}
          sx={{ minWidth: 104 }}
        >
          {MOTIONS.map(each => (
            <MenuItem key={each.type} value={each.type}>
              {each.label}
            </MenuItem>
          ))}
        </TextField>
        <Tooltip title={'Moves in step with every other character with this motion, rather than at its own moment'}>
          <Stack direction={'row'} alignItems={'center'}>
            <Checkbox size={'small'} checked={line.sync} onChange={() => write({ sync: line.sync === false })} slotProps={{ input: { 'aria-label': 'In step' } }} sx={{ p: 0.25 }}/>
            <Typography variant={'caption'}>In step</Typography>
          </Stack>
        </Tooltip>
        <Box sx={{ flex: 1 }}/>
        {remove}
      </Stack>
      <Typography variant={'caption'} color={'text.secondary'} component={'div'} sx={{ mt: 0.25 }}>
        {motion.does}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
        {motion.parameters.map((parameter, at) => (
          <MotionValueBox
            key={parameter}
            label={PARAMETER_WORDS[parameter].label}
            unit={PARAMETER_WORDS[parameter].unit}
            written={line.values[at] ?? ''}
            fallback={String(setup.motionDefaults(line.type, parameter))}
            onCommit={value =>
            {
              const values = motion.parameters.map((_, other) => (other === at ? value : line.values[other] ?? null));
              onChange({ row: 'motion', motion: index, value: { type: line.type, values, sync: line.sync } });
            }}
          />
        ))}
      </Box>
    </Box>
  );
};

/**
 * The motions the picked battlers' pages declare, each changeable, with a button adding one. Battlers declaring
 * different motions are shown none, and say so.
 * @param {{ battlers: readonly PickedBattler[], setup: BattlerSetup, onChange: (change: BattlerChange) => void }} props The section.
 * @returns {React.JSX.Element} The section.
 */
const MotionsField = (props: { readonly battlers: readonly PickedBattler[]; readonly setup: BattlerSetup; readonly onChange: (change: BattlerChange) => void }) =>
{
  const { battlers, setup, onChange } = props;
  const lines = battlers.map(({ event, pageIndex }) => motionLinesOf(event.pages[pageIndex]));
  const alike = shared(lines.map(each => each.map(line => [ line.type, ...line.values, line.sync ? 'sync' : '' ])));
  const [ first ] = lines;
  return (
    <Box data-testid={'battler-row-motion'}>
      <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
        <Typography variant={'body2'}>Motion</Typography>
        <Button size={'small'} startIcon={<Add/>} disabled={alike.mixed} onClick={() => onChange({ row: 'motion', motion: null, value: null })}>
          Add motion
        </Button>
      </Stack>
      {alike.mixed && (
        <Typography variant={'caption'} color={'text.secondary'}>
          The picked battlers move differently.
        </Typography>
      )}
      {alike.mixed === false && first !== undefined && first.length === 0 && (
        <Typography variant={'caption'} color={'text.secondary'}>
          Stands still.
        </Typography>
      )}
      <Stack spacing={0.75} sx={{ mt: 0.5 }}>
        {alike.mixed === false && first !== undefined && first.map((line, index) => (
          <MotionLineField key={`${index}-${line.type}`} line={line} index={index} setup={setup} onChange={onChange}/>
        ))}
      </Stack>
    </Box>
  );
};

/**
 * Names a section of the panel.
 * @param {{ title: string }} props The section's name.
 * @returns {React.JSX.Element} The heading.
 */
const Heading = (props: { readonly title: string }) =>
{
  return (
    <Typography variant={'overline'} color={'text.secondary'} sx={{ display: 'block', lineHeight: 2, mt: 0.5 }}>
      {props.title}
    </Typography>
  );
};

/**
 * The battler panel: everything the picked battlers fight with, row by row, as the game builds each one from its page,
 * its enemy's database note and J-ABS's defaults. Each row shows the value the battler fights with and marks where it
 * comes from: this battler's own page, its enemy, the default, or being inanimate. A row the page sets says what taking
 * it out would leave, and its button takes the page's own value out, so the enemy's applies. A change to a row writes
 * the page's own tag, in place, for every picked battler at once; with several picked, a row they hold differently says
 * so.
 * @param {BattlerPanelProps} props The battlers and what the panel reads them with.
 * @returns {React.JSX.Element} The panel.
 */
const BattlerPanel = (props: BattlerPanelProps) =>
{
  const { battlers, setup, enemies, stateNames, onChange, onOpenEnemy } = props;
  const enemyOf = (enemyId: number) => enemies[enemyId] ?? null;
  const readings = battlers.map(({ event, pageIndex }) => readBattlerPage(event.pages[pageIndex], enemyOf, setup.defaults) as BattlerReading);
  const enemyInanimate = readings.map(reading => reading.inanimate.enemy ?? setup.defaults.inanimate);
  const values = (pick: (reading: BattlerReading) => BattlerValue<number>) => readings.map(pick);
  const inanimate = rowOf(readings.map(reading => reading.inanimate), switchWords, value => value.enemy ?? setup.defaults.inanimate);
  return (
    <Stack spacing={0.75} data-testid={'battler-panel'}>
      <EnemyField enemyIds={readings.map(reading => reading.enemyId)} enemies={enemies} onChange={onChange} onOpenEnemy={onOpenEnemy}/>
      {setup.levels && <NumberField label={'Level'} unit={''} spec={SIGNED} model={numberRow(values(reading => reading.level), 0)} row={'level'} onChange={onChange}/>}
      <NumberField
        label={'Move speed'}
        unit={''}
        spec={FRACTION}
        model={moveSpeedRow(readings, battlers.map(({ event, pageIndex }) => event.pages[pageIndex].moveSpeed))}
        row={'moveSpeed'}
        clearTip={'Use the page\'s speed'}
        onChange={onChange}
      />
      <Heading title={'Senses'}/>
      <NumberField label={'Sight'} unit={'tiles'} spec={WHOLE} model={numberRow(values(reading => reading.sight), setup.defaults.sight)} row={'sight'} onChange={onChange}/>
      <NumberField label={'Pursuit'} unit={'tiles'} spec={WHOLE} model={numberRow(values(reading => reading.pursuit), setup.defaults.pursuit)} row={'pursuit'} onChange={onChange}/>
      <NumberField
        label={'Alerted sight'}
        unit={'more tiles'}
        spec={WHOLE}
        model={numberRow(values(reading => reading.alertedSightBoost), setup.defaults.alertedSightBoost)}
        row={'alertedSightBoost'}
        onChange={onChange}
      />
      <NumberField
        label={'Alerted pursuit'}
        unit={'more tiles'}
        spec={FRACTION}
        model={numberRow(values(reading => reading.alertedPursuitBoost), setup.defaults.alertedPursuitBoost)}
        row={'alertedPursuitBoost'}
        onChange={onChange}
      />
      <NumberField
        label={'Stays alerted'}
        unit={'frames'}
        spec={WHOLE}
        model={numberRow(values(reading => reading.alertDuration), setup.defaults.alertDuration, alertWords)}
        row={'alertDuration'}
        onChange={onChange}
      />
      <Heading title={'AI'}/>
      <SetField label={'Traits'} words={TRAITS} model={traitsRow(readings)} row={'aiTraits'} onChange={onChange}/>
      <SetField label={'Roles'} words={ROLES} model={rolesRow(readings)} row={'aiRoles'} onChange={onChange}/>
      <Heading title={'On the map'}/>
      <SwitchField
        label={'Inanimate'}
        model={inanimate}
        row={'inanimate'}
        note={inanimate.value === true ? 'Neutral, with no HP bar, name or idling unless set below.' : inanimate.note}
        onChange={onChange}
      />
      <TeamField model={teamRow(readings)} inanimate={inanimate.value === true} onChange={onChange}/>
      <SwitchField label={'Idles'} model={hiddenRow(readings.map(reading => reading.idle), setup.defaults.canIdle, enemyInanimate)} row={'idle'} onChange={onChange}/>
      <SwitchField label={'HP bar'} model={hiddenRow(readings.map(reading => reading.hpBar), setup.defaults.showHpBar, enemyInanimate)} row={'hpBar'} onChange={onChange}/>
      <SwitchField label={'Name'} model={hiddenRow(readings.map(reading => reading.name), setup.defaults.showName, enemyInanimate)} row={'name'} onChange={onChange}/>
      {setup.passives && <PassivesField readings={readings} stateNames={stateNames} onChange={onChange}/>}
      {setup.motions && <MotionsField battlers={battlers} setup={setup} onChange={onChange}/>}
    </Stack>
  );
};

export { BattlerPanel };
export type { BattlerPanelProps, PickedBattler };
