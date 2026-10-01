import React, { useContext } from 'react';
import { Box, Checkbox, FormControlLabel } from '@mui/material';
import type { CommandField } from '../../core/commands/catalogTypes.ts';
import { PRIORITY_OPTIONS, TRIGGER_OPTIONS } from '../../core/eventKinds/pageFields.ts';
import { OPTION_LABELS, PAGE_OPTIONS, readPageOptions, type PageOption } from '../../core/eventWindow/pageSettings.ts';
import type { RmmzEventPage } from '../../core/model/rmmzTypes.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { SoundPlayerContext } from '../commandList/commandListResources.ts';
import { FieldControl } from '../commandList/FieldControl.tsx';

/**
 * Where a page draws and collides, as a choice the shared controls draw.
 */
const PRIORITY_FIELD: CommandField = { key: 'priority', label: 'Priority', param: [ 0 ], kind: 'select', options: PRIORITY_OPTIONS };

/**
 * What starts a page running, as a choice the shared controls draw.
 */
const TRIGGER_FIELD: CommandField = { key: 'trigger', label: 'Trigger', param: [ 0 ], kind: 'select', options: TRIGGER_OPTIONS };

/**
 * What the options take: the page, and where a change to an option goes.
 */
type PageOptionsProps = {
  readonly page: RmmzEventPage;
  readonly onChange: (option: PageOption, on: boolean) => void;
};

/**
 * A page's four options, two by two: the walking and stepping animations, direction fix and through.
 * @param {PageOptionsProps} props The page, and where a change goes.
 * @returns {React.JSX.Element} The options.
 */
const PageOptions = (props: PageOptionsProps) =>
{
  const { page, onChange } = props;
  const options = readPageOptions(page);
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
      {PAGE_OPTIONS.map(option => (
        <FormControlLabel
          key={option}
          label={OPTION_LABELS[option]}
          slotProps={{ typography: { variant: 'body2' } }}
          control={<Checkbox size={'small'} checked={options[option]} onChange={event => onChange(option, event.target.checked)}/>}
        />
      ))}
    </Box>
  );
};

/**
 * What the priority and trigger take: the page, and where each change goes.
 */
type PagePriorityTriggerProps = {
  readonly page: RmmzEventPage;
  readonly onPriority: (priority: number) => void;
  readonly onTrigger: (trigger: number) => void;
};

/**
 * A page's priority and trigger, side by side.
 * @param {PagePriorityTriggerProps} props The page, and where each change goes.
 * @returns {React.JSX.Element} The two choices.
 */
const PagePriorityTrigger = (props: PagePriorityTriggerProps) =>
{
  const { page, onPriority, onTrigger } = props;
  const { api } = useMapEditorServices();
  const playSound = useContext(SoundPlayerContext);
  const shared = { names: null, api, playSound };
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
      <FieldControl {...shared} field={PRIORITY_FIELD} value={page.priorityType} onChange={priority => onPriority(Number(priority))}/>
      <FieldControl {...shared} field={TRIGGER_FIELD} value={page.trigger} onChange={trigger => onTrigger(Number(trigger))}/>
    </Box>
  );
};

export { PageOptions, PagePriorityTrigger };
