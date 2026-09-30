import React, { useState } from 'react';
import { Box, Button, IconButton, List, ListItemButton, ListItemText, TextField, Tooltip, Typography } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { isJsonObject, type JsonObject, type JsonValue } from '../../core/model/json.ts';
import type { RmmzMoveCommand, RmmzMoveRoute } from '../../core/model/rmmzTypes.ts';
import {
  describeMoveStep,
  insertStep,
  MOVE_STEP_KINDS,
  moveStep,
  moveStepKind,
  newMoveStep,
  removeStep,
  replaceStep,
  routeSteps,
  setRouteOption,
  setStepParameter,
  type MoveParameter,
  type MoveRouteMode,
} from '../../core/commands/editors/moveRoute.ts';
import { CheckField, FieldRow, IdField, NumberField, SelectField } from './editorFields.tsx';

/**
 * The groups the step palette shows, in MZ's order.
 */
const GROUPS = [ 'Move', 'Turn', 'Settings' ] as const;

/**
 * Edits a sound: its file and how it plays.
 * @param {{ value: JsonObject, onChange: (value: JsonObject) => void }} props The sound and what to do with a change.
 * @returns {React.JSX.Element} The inputs.
 */
const SoundFields = (props: { value: JsonObject; onChange: (value: JsonObject) => void }) =>
{
  const { value, onChange } = props;
  const number = (key: string, fallback: number) => (typeof value[key] === 'number' ? value[key] : fallback);
  return (
    <FieldRow>
      <TextField size={'small'} label={'Sound effect'} value={String(value['name'] ?? '')} onChange={event => onChange({ ...value, name: event.target.value })}/>
      <NumberField label={'Volume'} value={number('volume', 90)} min={0} max={100} width={90} onChange={volume => onChange({ ...value, volume })}/>
      <NumberField label={'Pitch'} value={number('pitch', 100)} min={50} max={150} width={90} onChange={pitch => onChange({ ...value, pitch })}/>
      <NumberField label={'Pan'} value={number('pan', 0)} min={-100} max={100} width={90} onChange={pan => onChange({ ...value, pan })}/>
    </FieldRow>
  );
};

/**
 * Edits one input of a step, by the kind of input it is.
 * @param {{ parameter: MoveParameter, value: JsonValue | undefined, onChange: (value: JsonValue) => void }} props The input, its value and what to do with a change.
 * @returns {React.JSX.Element} The input.
 */
const StepInput = (props: { parameter: MoveParameter; value: JsonValue | undefined; onChange: (value: JsonValue) => void }) =>
{
  const { parameter, value, onChange } = props;
  const numeric = typeof value === 'number' ? value : Number(parameter.default);
  switch (parameter.kind)
  {
    case 'number':
      return <NumberField label={parameter.label} value={numeric} min={parameter.min} max={parameter.max} onChange={onChange}/>;
    case 'select':
      return <SelectField label={parameter.label} value={numeric} options={parameter.options ?? []} width={170} onChange={onChange}/>;
    case 'switch':
      return <IdField label={parameter.label} kind={'switch'} value={numeric} onChange={onChange}/>;
    case 'audio':
      return <SoundFields value={isJsonObject(value) ? value : { name: '', volume: 90, pitch: 100, pan: 0 }} onChange={onChange}/>;
    case 'character':
    case 'script':
      return (
        <TextField size={'small'} label={parameter.label} value={String(value ?? '')} fullWidth={parameter.kind === 'script'}
          slotProps={{ htmlInput: { spellCheck: false, style: parameter.kind === 'script' ? { fontFamily: 'monospace' } : undefined } }}
          onChange={event => onChange(event.target.value)}/>
      );
  }
};

/**
 * Edits the selected step's inputs.
 * @param {{ step: RmmzMoveCommand, onChange: (step: RmmzMoveCommand) => void }} props The step and what to do with a change.
 * @returns {React.JSX.Element | null} The inputs, or nothing for a step without any.
 */
const StepInputs = (props: { step: RmmzMoveCommand; onChange: (step: RmmzMoveCommand) => void }) =>
{
  const { step, onChange } = props;
  const kind = moveStepKind(step.code);
  if (kind === null || kind.parameters.length === 0)
  {
    return null;
  }

  return (
    <FieldRow>
      {kind.parameters.map((parameter, index) => (
        <StepInput key={parameter.label} parameter={parameter} value={step.parameters?.[index]}
          onChange={value => onChange(setStepParameter(step, index, value))}/>
      ))}
    </FieldRow>
  );
};

/**
 * What the route editor takes.
 */
type MoveRouteEditorProps = {
  /**
   * The route.
   */
  readonly route: RmmzMoveRoute;

  /**
   * Hands on the route after every change.
   */
  readonly onChange: (route: RmmzMoveRoute) => void;

  /**
   * Where the route lives: a Set Movement Route command, which can make the event wait for it, or a page's own
   * movement, which cannot.
   */
  readonly mode: MoveRouteMode;
};

/**
 * Edits a move route, for Set Movement Route and for an event page's movement alike: the steps in order, each
 * step's inputs, a palette of every step MZ offers, and the route's options. A new step goes after the one
 * selected, or at the end; the step ending the route is never shown or touched.
 * @param {MoveRouteEditorProps} props The route, where it lives, and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const MoveRouteEditor = (props: MoveRouteEditorProps) =>
{
  const { route, onChange, mode } = props;
  const steps = routeSteps(route);
  const [ selected, setSelected ] = useState<number | null>(null);
  const current = selected !== null && selected < steps.length ? selected : null;

  const add = (code: number) =>
  {
    const at = current === null ? steps.length : current + 1;
    onChange(insertStep(route, at, newMoveStep(code)));
    setSelected(at);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Box sx={{ flex: '1 1 260px', minWidth: 240, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <List dense disablePadding aria-label={'Route steps'} sx={{ maxHeight: 280, overflowY: 'auto' }}>
            {steps.length === 0
              ? <Typography variant={'body2'} color={'text.secondary'} sx={{ p: 1.5 }}>No steps yet. Pick one from the list beside this.</Typography>
              : steps.map((step, index) => (
                <ListItemButton key={index} selected={index === current} onClick={() => setSelected(index === current ? null : index)}>
                  <ListItemText primary={describeMoveStep(step)} slotProps={{ primary: { variant: 'body2', noWrap: true } }}/>
                </ListItemButton>
              ))}
          </List>
        </Box>
        <Box sx={{ flex: '2 1 320px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {GROUPS.map(group => (
            <Box key={group}>
              <Typography variant={'overline'} color={'text.secondary'}>{group}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {MOVE_STEP_KINDS.filter(kind => kind.group === group).map(kind => (
                  <Button key={kind.code} size={'small'} variant={'outlined'} sx={{ textTransform: 'none', py: 0 }} onClick={() => add(kind.code)}>
                    {kind.name}
                  </Button>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      {current === null
        ? null
        : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant={'body2'} sx={{ fontWeight: 600 }}>{describeMoveStep(steps[current])}</Typography>
            <Tooltip title={'Move up'}>
              <span>
                <IconButton size={'small'} aria-label={'Move step up'} disabled={current === 0} onClick={() =>
                {
                  onChange(moveStep(route, current, current - 1));
                  setSelected(current - 1);
                }}><ArrowUpwardIcon fontSize={'small'}/></IconButton>
              </span>
            </Tooltip>
            <Tooltip title={'Move down'}>
              <span>
                <IconButton size={'small'} aria-label={'Move step down'} disabled={current === steps.length - 1} onClick={() =>
                {
                  onChange(moveStep(route, current, current + 1));
                  setSelected(current + 1);
                }}><ArrowDownwardIcon fontSize={'small'}/></IconButton>
              </span>
            </Tooltip>
            <Tooltip title={'Remove'}>
              <IconButton size={'small'} aria-label={'Remove step'} onClick={() =>
              {
                onChange(removeStep(route, current));
                setSelected(null);
              }}><DeleteOutlineIcon fontSize={'small'}/></IconButton>
            </Tooltip>
            <StepInputs step={steps[current]} onChange={step => onChange(replaceStep(route, current, step))}/>
          </Box>
        )}
      <FieldRow>
        <CheckField label={'Repeat'} checked={route.repeat} onChange={checked => onChange(setRouteOption(route, 'repeat', checked))}/>
        <CheckField label={'Skip steps that cannot be taken'} checked={route.skippable} onChange={checked => onChange(setRouteOption(route, 'skippable', checked))}/>
        {mode === 'command'
          ? <CheckField label={'Wait until it finishes'} checked={route.wait} onChange={checked => onChange(setRouteOption(route, 'wait', checked))}/>
          : null}
      </FieldRow>
    </Box>
  );
};

export { MoveRouteEditor };
export type { MoveRouteEditorProps };
