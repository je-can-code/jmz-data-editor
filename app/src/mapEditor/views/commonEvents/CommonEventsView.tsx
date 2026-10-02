import React, { useContext, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Redo, Save, Undo } from '@mui/icons-material';
import type { CommandField } from '../../core/commands/catalogTypes.ts';
import {
  COMMON_EVENT_TRIGGERS,
  commonEventListPath,
  listCommonEvents,
  setCommonEventProperty,
  type CommonEventRow,
} from '../../core/commandList/commonEvents.ts';
import { commonEventHistoryKey } from '../../core/history/historyKeys.ts';
import { COMMON_EVENTS_KEY } from '../../core/model/documentKeys.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { CommandList } from '../commandList/CommandList.tsx';
import { SoundPlayerContext, useCommandListResources } from '../commandList/commandListResources.ts';
import { CommitTextField } from '../commandList/CommitTextField.tsx';
import { FieldControl } from '../commandList/FieldControl.tsx';
import { useDocumentRevision, useHubChanges } from '../commandList/useCommandListState.ts';

/**
 * The trigger picker, as a field the shared controls draw.
 */
const TRIGGER_FIELD: CommandField = { key: 'trigger', label: 'Trigger', param: [ 0 ], kind: 'select', options: COMMON_EVENT_TRIGGERS };

/**
 * The switch picker, as a field the shared controls draw.
 */
const SWITCH_FIELD: CommandField = { key: 'switchId', label: 'Runs while switch is ON', param: [ 0 ], kind: 'switch' };

/**
 * One common event's header: its name, how it starts, its switch, and undo and redo for its own history.
 * @param {{ row: CommonEventRow, onProblem: (message: string) => void }} props The common event, and where a failure is told.
 * @returns {React.JSX.Element} The header.
 */
const CommonEventHeader = (props: { readonly row: CommonEventRow; readonly onProblem: (message: string) => void }) =>
{
  const { row, onProblem } = props;
  const { hub, api } = useMapEditorServices();
  const { names } = useCommandListResources(api);
  const playSound = useContext(SoundPlayerContext);
  const history = commonEventHistoryKey(row.id);
  useHubChanges(hub);

  /**
   * Runs a change, telling any failure rather than losing it.
   * @param {() => void} change The change.
   */
  const attempt = (change: () => void) =>
  {
    try
    {
      change();
    }
    catch (error)
    {
      onProblem((error as Error).message);
    }
  };

  return (
    <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'} sx={{ p: 1.5 }}>
      <Box sx={{ width: 260 }}>
        <CommitTextField
          label={'Name'}
          size={'small'}
          fullWidth
          value={row.name}
          onCommit={name => attempt(() => setCommonEventProperty(hub, row.id, 'name', name))}
        />
      </Box>
      <Box sx={{ width: 160 }}>
        <FieldControl
          field={TRIGGER_FIELD}
          value={row.trigger}
          names={names}
          api={api}
          playSound={playSound}
          onChange={trigger => attempt(() => setCommonEventProperty(hub, row.id, 'trigger', Number(trigger)))}
        />
      </Box>
      {row.trigger !== 0 && (
        <Box sx={{ width: 280 }}>
          <FieldControl
            field={SWITCH_FIELD}
            value={row.switchId}
            names={names}
            api={api}
            playSound={playSound}
            onChange={switchId => attempt(() => setCommonEventProperty(hub, row.id, 'switchId', Number(switchId)))}
          />
        </Box>
      )}
      <Box sx={{ flex: 1 }}/>
      <Tooltip title={'Undo (Ctrl+Z)'}>
        <span>
          <IconButton aria-label={'Undo'} disabled={hub.canUndo(history).ok === false} onClick={() => attempt(() => hub.undo(history))}>
            <Undo/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'Redo (Ctrl+Y)'}>
        <span>
          <IconButton aria-label={'Redo'} disabled={hub.canRedo(history).ok === false} onClick={() => attempt(() => hub.redo(history))}>
            <Redo/>
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
};

/**
 * The common events once loaded: the list of them on the left, and the chosen one's header and commands.
 * @returns {React.JSX.Element} The workspace.
 */
const CommonEventsWorkspace = () =>
{
  const { hub } = useMapEditorServices();
  useDocumentRevision(hub, COMMON_EVENTS_KEY);
  useHubChanges(hub);
  const [ filter, setFilter ] = useState('');
  const [ chosenId, setChosenId ] = useState<number | null>(null);
  const [ problem, setProblem ] = useState<string | null>(null);
  const [ saving, setSaving ] = useState(false);

  const content = hub.document(COMMON_EVENTS_KEY).valueAt([]);
  const rows = listCommonEvents(content, filter);
  const all = listCommonEvents(content, '');
  const chosen = all.find(row => row.id === chosenId) ?? all[0] ?? null;
  const dirty = hub.isDirty(COMMON_EVENTS_KEY);

  /**
   * Writes the common events to disk.
   */
  const save = () =>
  {
    setSaving(true);
    setProblem(null);
    hub.save(COMMON_EVENTS_KEY)
      .catch((error: unknown) => setProblem(`The common events were not saved: ${(error as Error).message}`))
      .finally(() => setSaving(false));
  };

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <Box sx={{ width: 280, flex: 'none', display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', minHeight: 0 }}>
        <Box sx={{ p: 1 }}>
          <TextField size={'small'} fullWidth placeholder={'Find a common event'} value={filter} onChange={event => setFilter(event.target.value)}/>
        </Box>
        <List dense sx={{ flex: 1, overflowY: 'auto' }} aria-label={'Common events'}>
          {rows.map(row => (
            <ListItemButton key={row.id} selected={chosen?.id === row.id} onClick={() => setChosenId(row.id)}>
              <ListItemText
                primary={`${String(row.id).padStart(4, '0')} ${row.name}`}
                secondary={`${row.commands} ${row.commands === 1 ? 'command' : 'commands'}`}
              />
              {row.trigger !== 0 && <Chip size={'small'} label={COMMON_EVENT_TRIGGERS[row.trigger]?.label ?? row.trigger}/>}
            </ListItemButton>
          ))}
        </List>
        <Divider/>
        <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ p: 1 }}>
          <Button size={'small'} variant={'contained'} startIcon={<Save/>} disabled={dirty === false || saving} onClick={save}>
            Save
          </Button>
          <Typography variant={'caption'} color={'text.secondary'}>{dirty ? 'Unsaved changes' : 'Saved'}</Typography>
        </Stack>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {problem !== null && <Alert severity={'error'} onClose={() => setProblem(null)} sx={{ m: 1 }}>{problem}</Alert>}
        {chosen === null
          ? <Typography sx={{ p: 2 }} color={'text.secondary'}>This project has no common events.</Typography>
          : (
            <>
              <CommonEventHeader row={chosen} onProblem={setProblem}/>
              <Divider/>
              <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
                <CommandList
                  key={chosen.id}
                  documentKey={COMMON_EVENTS_KEY}
                  path={commonEventListPath(chosen.id)}
                  histories={[ commonEventHistoryKey(chosen.id) ]}
                  label={`Commands of common event ${chosen.id}`}
                />
              </Box>
            </>
          )}
      </Box>
    </Box>
  );
};

/**
 * The common events: every one in a list, and the chosen one's commands in the same command list the event window
 * uses, with its name, trigger and switch above. It reads {@code data/CommonEvents.json} through the route the data
 * editor uses and saves it the way maps are saved, in MZ's own layout, and each common event keeps its own undo
 * history. A workspace panel can mount it anywhere; it fills whatever space it is given.
 * @returns {React.JSX.Element} The view.
 */
const CommonEventsView = () =>
{
  const { hub, openDocument } = useMapEditorServices();
  const [ ready, setReady ] = useState(() => hub.has(COMMON_EVENTS_KEY));
  const [ problem, setProblem ] = useState<string | null>(null);

  useEffect(() =>
  {
    if (ready)
    {
      return undefined;
    }

    // the document may arrive from another window's copy, with its unsaved edits, before the file.
    let live = true;
    openDocument(COMMON_EVENTS_KEY)
      .then(() => live && setReady(true))
      .catch((error: unknown) => live && setProblem((error as Error).message));
    return () =>
    {
      live = false;
    };
  }, [ ready, openDocument ]);

  if (problem !== null)
  {
    return <Alert severity={'error'} sx={{ m: 2 }}>{`The common events could not be opened: ${problem}`}</Alert>;
  }

  return ready
    ? <CommonEventsWorkspace/>
    : <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress aria-label={'Opening the common events'}/></Box>;
};

export { CommonEventsView };
