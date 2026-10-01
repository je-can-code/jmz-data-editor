import React, { useState } from 'react';
import { Box, Button, IconButton, ListItemText, Menu, MenuItem, Stack, Tooltip, Typography } from '@mui/material';
import { History, Redo, Save, Undo } from '@mui/icons-material';
import type { HistoryView } from '../../core/history/History.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { CommitTextField } from '../commandList/CommitTextField.tsx';

/**
 * What the header takes: the event, its history and save state, and where each choice goes.
 */
type EventHeaderProps = {
  readonly event: RmmzMapEvent;

  /**
   * The event's own history, oldest step first.
   */
  readonly history: HistoryView;

  /**
   * Whether the map holds edits its file does not, and whether a save is under way.
   */
  readonly dirty: boolean;
  readonly saving: boolean;

  readonly onRename: (name: string) => void;
  readonly onNote: (note: string) => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onJump: (stepId: string | null) => void;
  readonly onSave: () => void;
};

/**
 * The top of an event window: the event's name and note, undo and redo of its own history (each naming the step it
 * would move), the whole history to jump through, and saving the map. The note is the editor's own; anything the
 * author writes there is kept exactly.
 * @param {EventHeaderProps} props The event, its history and save state, and where each choice goes.
 * @returns {React.JSX.Element} The header.
 */
const EventHeader = (props: EventHeaderProps) =>
{
  const { event, history, dirty, saving, onRename, onNote, onUndo, onRedo, onJump, onSave } = props;
  const [ historyAnchor, setHistoryAnchor ] = useState<HTMLElement | null>(null);
  const { rows, position } = history;
  const undoStep = rows[position - 1] ?? null;
  const redoStep = rows[position] ?? null;

  /**
   * Jumps through the history and closes the list.
   * @param {string | null} stepId The step to end on, or null for the start.
   */
  const jump = (stepId: string | null) =>
  {
    setHistoryAnchor(null);
    onJump(stepId);
  };

  return (
    <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'} sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Box sx={{ width: 240, flex: 'none' }}>
        <CommitTextField label={'Name'} size={'small'} fullWidth value={event.name} onCommit={onRename}/>
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CommitTextField label={'Note'} size={'small'} fullWidth multiline maxRows={3} value={event.note} onCommit={onNote}/>
      </Box>
      <Tooltip title={undoStep === null ? 'Nothing to undo' : `Undo ${undoStep.label} (Ctrl+Z)`}>
        <span>
          <IconButton aria-label={'Undo'} disabled={undoStep === null} onClick={onUndo}>
            <Undo/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={redoStep === null ? 'Nothing to redo' : `Redo ${redoStep.label} (Ctrl+Y)`}>
        <span>
          <IconButton aria-label={'Redo'} disabled={redoStep === null} onClick={onRedo}>
            <Redo/>
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={'History'}>
        <span>
          <IconButton aria-label={'History'} disabled={rows.length === 0} onClick={click => setHistoryAnchor(click.currentTarget)}>
            <History/>
          </IconButton>
        </span>
      </Tooltip>
      <Menu anchorEl={historyAnchor} open={historyAnchor !== null} onClose={() => setHistoryAnchor(null)}>
        <MenuItem selected={position === 0} onClick={() => jump(null)}>
          <ListItemText primary={'Start'} slotProps={{ primary: { variant: 'body2', color: 'text.secondary' } }}/>
        </MenuItem>
        {rows.map((row, index) => (
          <MenuItem key={row.id} selected={position === index + 1} onClick={() => jump(row.id)}>
            <ListItemText primary={row.label} slotProps={{ primary: { variant: 'body2', sx: { opacity: row.done ? 1 : 0.45 } } }}/>
          </MenuItem>
        ))}
      </Menu>
      <Stack alignItems={'center'} sx={{ flex: 'none' }}>
        <Button variant={'contained'} size={'small'} startIcon={<Save/>} disabled={dirty === false || saving} onClick={onSave}>
          Save
        </Button>
        <Typography variant={'caption'} color={'text.secondary'}>
          {dirty ? 'Unsaved changes' : 'Saved'}
        </Typography>
      </Stack>
    </Stack>
  );
};

export { EventHeader };
