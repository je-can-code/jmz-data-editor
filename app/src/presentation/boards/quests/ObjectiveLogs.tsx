import { InputAdornment, Stack, TextField } from '@mui/material';
import { Announcement, Bedtime, Block, CancelPresentation, Verified } from '@mui/icons-material';
import { yellow } from '@mui/material/colors';
import OmniObjectiveLogType from './OmniObjectiveLogType.ts';
import OmniObjectiveLogs = Questopedia.OmniObjectiveLogs;

type ObjectiveLogsProps = {
  logs?: OmniObjectiveLogs;
  updateObjectiveLogsFunc: (updatedObjectiveLogs: OmniObjectiveLogs) => void;
};

export default function ObjectiveLogs({ logs, updateObjectiveLogsFunc }: ObjectiveLogsProps)
{
  const handleChange = (input: string, logType: OmniObjectiveLogType) =>
  {
    const updated = { ...logs } as OmniObjectiveLogs;
    switch (logType)
    {
      case OmniObjectiveLogType.Inactive:   updated.inactive  = input; break;
      case OmniObjectiveLogType.Active:     updated.active    = input; break;
      case OmniObjectiveLogType.Completed:  updated.completed = input; break;
      case OmniObjectiveLogType.Failed:     updated.failed    = input; break;
      case OmniObjectiveLogType.Missed:     updated.missed    = input; break;
    }
    updateObjectiveLogsFunc(updated);
  };

  return (
    <Stack spacing={1.5}>
      <TextField
        variant={'outlined'}
        label={'Inactive'}
        value={logs?.inactive ?? ''}
        onChange={event => handleChange(event.target.value, OmniObjectiveLogType.Inactive)}
        size={'small'}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Bedtime sx={{ color: yellow[800] }} fontSize={'small'}/>
              </InputAdornment>
            )
          }
        }}
      />
      <TextField
        variant={'outlined'}
        label={'Active'}
        value={logs?.active ?? ''}
        onChange={event => handleChange(event.target.value, OmniObjectiveLogType.Active)}
        size={'small'}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Announcement color={'primary'} fontSize={'small'}/>
              </InputAdornment>
            )
          }
        }}
      />
      <TextField
        variant={'outlined'}
        label={'Completed'}
        value={logs?.completed ?? ''}
        onChange={event => handleChange(event.target.value, OmniObjectiveLogType.Completed)}
        size={'small'}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Verified color={'success'} fontSize={'small'}/>
              </InputAdornment>
            )
          }
        }}
      />
      <TextField
        variant={'outlined'}
        label={'Failed'}
        value={logs?.failed ?? ''}
        onChange={event => handleChange(event.target.value, OmniObjectiveLogType.Failed)}
        size={'small'}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <CancelPresentation color={'error'} fontSize={'small'}/>
              </InputAdornment>
            )
          }
        }}
      />
      <TextField
        variant={'outlined'}
        label={'Missed'}
        value={logs?.missed ?? ''}
        onChange={event => handleChange(event.target.value, OmniObjectiveLogType.Missed)}
        size={'small'}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position={'start'}>
                <Block color={'secondary'} fontSize={'small'}/>
              </InputAdornment>
            )
          }
        }}
      />
    </Stack>
  );
}
