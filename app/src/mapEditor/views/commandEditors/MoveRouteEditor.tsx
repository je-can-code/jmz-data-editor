import React, { useState } from 'react';
import { Box, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { isJsonObject, type JsonObject, type JsonValue } from '../../core/model/json.ts';
import type { RmmzMoveCommand, RmmzMoveRoute } from '../../core/model/rmmzTypes.ts';
import {
  describeMoveStep,
  insertStep,
  moveStepKind,
  newMoveStep,
  routeSteps,
  setRouteOption,
  setStepParameter,
  type MoveParameter,
  type MoveRouteMode,
} from '../../core/commands/editors/moveRoute.ts';
import { numpadStep } from '../../core/moveRoutes/routeKeys.ts';
import { moveRun, removeRun, replaceRun, runOfStep, setRunCount, stepRuns, type StepRun } from '../../core/moveRoutes/routeRuns.ts';
import type { RouteSetting } from '../../core/moveRoutes/routeStart.ts';
import type { MapCell } from '../../core/renderer/camera.ts';
import { isTextEntry } from '../../core/workspace/shortcuts.ts';
import { RoutePads } from '../moveRoute/RoutePads.tsx';
import { RoutePreview } from '../moveRoute/RoutePreview.tsx';
import { CheckField, DraftTextField, FieldRow, IdField, NumberField, SelectField } from './editorFields.tsx';

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
      <DraftTextField size={'small'} label={'Sound effect'} value={String(value['name'] ?? '')} onText={name => onChange({ ...value, name })}/>
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
        <DraftTextField size={'small'} label={parameter.label} value={String(value ?? '')} fullWidth={parameter.kind === 'script'}
          slotProps={{ htmlInput: { spellCheck: false, style: parameter.kind === 'script' ? { fontFamily: 'monospace' } : undefined } }}
          onText={onChange}/>
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

  /**
   * Where the route runs and who walks it, for the map showing where it goes; left out, or null, where there is no
   * map to show it on.
   */
  readonly setting?: RouteSetting | null;
};

/**
 * Where the author put a route's walker on the preview, kept for the map and the walker it was put down for.
 */
type PlacedStart = {
  readonly mapId: number;
  readonly characterId: number;
  readonly cell: MapCell;
};

/**
 * Names a run of steps the way the list shows it: the step, and how many times over when more than once.
 * @param {StepRun} run The run.
 * @returns {string} Such as "Move Left ×3".
 */
const runLabel = (run: StepRun): string =>
{
  return run.count > 1
    ? `${describeMoveStep(run.step)} ×${run.count}`
    : describeMoveStep(run.step);
};

/**
 * Edits the run of steps selected: how many times over it goes, its order among the others, taking it away, and its
 * inputs, which every step in the run shares.
 * @param {{ route: RmmzMoveRoute, runs: readonly StepRun[], index: number, onChange: (route: RmmzMoveRoute) => void, onSelect: (index: number | null) => void }} props
 * The route, its runs, the run selected, and what to do with a change and with the selection.
 * @returns {React.JSX.Element} The controls.
 */
const RunControls = (props: {
  readonly route: RmmzMoveRoute;
  readonly runs: readonly StepRun[];
  readonly index: number;
  readonly onChange: (route: RmmzMoveRoute) => void;
  readonly onSelect: (index: number | null) => void;
}) =>
{
  const { route, runs, index, onChange, onSelect } = props;
  const run = runs[index];
  const moveBy = (by: -1 | 1) =>
  {
    onChange(moveRun(route, runs, index, by));
    onSelect(index + by);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
      <Typography variant={'body2'} sx={{ fontWeight: 600 }}>{describeMoveStep(run.step)}</Typography>
      <NumberField label={'Times'} value={run.count} min={1} max={99} width={90} onChange={count => onChange(setRunCount(route, run, count))}/>
      <Tooltip title={'Move up'}>
        <span>
          <IconButton size={'small'} aria-label={'Move step up'} disabled={index === 0} onClick={() => moveBy(-1)}>
            <ArrowUpwardIcon fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Move down'}>
        <span>
          <IconButton size={'small'} aria-label={'Move step down'} disabled={index === runs.length - 1} onClick={() => moveBy(1)}>
            <ArrowDownwardIcon fontSize={'small'}/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Remove'}>
        <IconButton size={'small'} aria-label={'Remove step'} onClick={() =>
        {
          onChange(removeRun(route, run));
          onSelect(null);
        }}>
          <DeleteOutlineIcon fontSize={'small'}/>
        </IconButton>
      </Tooltip>
      <StepInputs step={run.step} onChange={step => onChange(replaceRun(route, run, step))}/>
    </Box>
  );
};

/**
 * Edits a move route, for Set Movement Route and for an event page's movement alike. Where the route runs is known, a
 * map shows where it goes: the walker where it starts, the path step by step through the map's walls, and the walker
 * again where the selected step leaves it, with a click on the map starting it elsewhere. Beside it the steps are
 * listed as runs ("Move Left ×3"), each run's count, order and inputs edited together; beneath them, the pads add
 * steps: moves and turns on compasses, settings as ON and OFF pairs. The number pad types moves as the pad is laid out,
 * and turns with Shift held. A new step goes after the run selected, or at the end; the step ending the route is never
 * shown or touched.
 * @param {MoveRouteEditorProps} props The route, where it lives and runs, and what to do with a change.
 * @returns {React.JSX.Element} The editor.
 */
const MoveRouteEditor = (props: MoveRouteEditorProps) =>
{
  const { route, onChange, mode, setting = null } = props;
  const steps = routeSteps(route);
  const runs = stepRuns(steps);
  const [ selected, setSelected ] = useState<number | null>(null);
  const [ placed, setPlaced ] = useState<PlacedStart | null>(null);
  const current = selected !== null && selected < runs.length ? selected : null;

  // a walker the author put down stays where they put it while the same walker walks the route on the same map.
  const keepsPlace = placed !== null && setting !== null && placed.mapId === setting.mapId && placed.characterId === setting.characterId;
  const startAt = keepsPlace ? placed.cell : null;

  // the walker is shown where the selected run leaves it.
  const shownStep = current === null ? null : runs[current].start + runs[current].count - 1;

  /**
   * Adds a step after the run selected, or at the end, and selects the run that holds it.
   * @param {number} code The step's code.
   */
  const add = (code: number) =>
  {
    const at = current === null ? steps.length : runs[current].start + runs[current].count;
    const next = insertStep(route, at, newMoveStep(code));
    onChange(next);
    setSelected(runOfStep(stepRuns(routeSteps(next)), at));
  };

  /**
   * Types a step from the number pad, leaving every other key, and every key pressed in a text field, alone.
   * @param {React.KeyboardEvent} event The key.
   */
  const onKeyDown = (event: React.KeyboardEvent) =>
  {
    const code = isTextEntry(event.target as HTMLElement) ? null : numpadStep(event.code, event.shiftKey);
    if (code !== null)
    {
      event.preventDefault();
      event.stopPropagation();
      add(code);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }} onKeyDown={onKeyDown}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {setting === null
          ? null
          : (
            <Box sx={{ flex: '2 1 340px', minWidth: 260 }}>
              <RoutePreview
                setting={setting}
                steps={steps}
                skippable={route.skippable}
                startAt={startAt}
                shownStep={shownStep}
                onStartAt={cell => setPlaced(cell === null ? null : { mapId: setting.mapId, characterId: setting.characterId, cell })}
              />
            </Box>
          )}
        <Box sx={{ flex: '1 1 220px', minWidth: 200, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <List dense disablePadding aria-label={'Route steps'} sx={{ maxHeight: 300, overflowY: 'auto' }}>
            {runs.length === 0
              ? <Typography variant={'body2'} color={'text.secondary'} sx={{ p: 1.5 }}>No steps yet. Add one from the pads below, or type it on the number pad.</Typography>
              : runs.map((run, index) => (
                <ListItemButton key={run.start} selected={index === current} onClick={() => setSelected(index === current ? null : index)}>
                  <ListItemText primary={runLabel(run)} slotProps={{ primary: { variant: 'body2', noWrap: true } }}/>
                </ListItemButton>
              ))}
          </List>
        </Box>
      </Box>
      {current === null
        ? null
        : <RunControls route={route} runs={runs} index={current} onChange={onChange} onSelect={setSelected}/>}
      <RoutePads onAdd={add}/>
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
