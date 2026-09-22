import {
  Alert,
  Box,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';

/**
 * Editor for the numbers events see.
 *
 * The weather is mirrored into two game variables so a conditional branch can ask about it - a
 * merchant who packs up in a storm, creatures that only come out in the rain. The mirror is
 * one-way: editing a variable by hand changes what that event sees and changes nothing about the
 * sky.
 *
 * **The ids beneath are declared rather than counted.** A look's number never changes once
 * events have been written against it, because renumbering does not error - it quietly makes
 * every one of those conditions mean something else.
 */
const WeatherWiringTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();

  if (weatherConfig === null)
  {
    return null;
  }

  const { variables } = weatherConfig;

  const setVariable = (key: 'weatherType' | 'weatherIntensity', value: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        variables: {
          ...previous!.variables,
          [ key ]: value,
        },
      }
    ));
  };

  const setEnabled = (enabled: boolean) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        variables: {
          ...previous!.variables,
          enabled,
        },
      }
    ));
  };

  const setNothingLabel = (nothingLabel: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        nothingLabel,
      }
    ));
  };

  const setPresetId = (look: string, id: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetIds: {
          ...previous!.presetIds,
          [ look ]: id,
        },
      }
    ));
  };

  const setIntensityId = (strength: string, id: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        intensityIds: {
          ...previous!.intensityIds,
          [ strength ]: id,
        },
      }
    ));
  };

  const pointingNowhere = variables.enabled
    && (variables.weatherType === 0 || variables.weatherIntensity === 0);

  const looks = Object.keys(weatherConfig.presetIds);
  const duplicates = looks.filter(look =>
    looks.some(other => other !== look && weatherConfig.presetIds[ other ] === weatherConfig.presetIds[ look ]));

  return (
    <Box sx={{ p: 2 }}>
      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          How weather is worded
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Weather reads as its picture, its name, then its strength in brackets - and the
          <code> \weather[]</code> text code puts exactly that into a line of dialogue. The only
          word worth choosing is the one for having none, since it has to finish somebody&apos;s
          sentence.
        </Typography>

        <TextField
          size={'small'}
          label={'When nothing is falling, call it'}
          sx={{ minWidth: 280 }}
          value={weatherConfig.nothingLabel}
          helperText={'Reads as: "Looks like <this> out there."'}
          onChange={event => setNothingLabel(event.target.value)}
        />
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          What events can see
        </Typography>

        <FormControlLabel
          label={'Report the weather into game variables'}
          control={
            <Switch
              checked={variables.enabled}
              onChange={event => setEnabled(event.target.checked)}
            />
          }
        />

        {pointingNowhere && (
          <Alert severity={'warning'} sx={{ my: 2 }}>
            Reporting is on but a variable is set to zero, so nothing is written anywhere.
          </Alert>
        )}

        <Stack direction={'row'} spacing={2} sx={{ mt: 2 }}>
          <TextField
            size={'small'}
            type={'number'}
            label={'Weather goes in variable'}
            disabled={variables.enabled === false}
            value={variables.weatherType}
            onChange={event => setVariable('weatherType', Number(event.target.value))}
          />
          <TextField
            size={'small'}
            type={'number'}
            label={'Strength goes in variable'}
            disabled={variables.enabled === false}
            value={variables.weatherIntensity}
            onChange={event => setVariable('weatherIntensity', Number(event.target.value))}
          />
        </Stack>
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          The number each look reports as
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Give a new look the next free number. Changing an existing one silently changes the
          meaning of every event condition already written against it.
        </Typography>

        {duplicates.length > 0 && (
          <Alert severity={'error'} sx={{ mb: 2 }}>
            {`Sharing a number: ${duplicates.join(', ')}. Events cannot tell them apart.`}
          </Alert>
        )}

        <Table size={'small'}>
          <TableHead>
            <TableRow>
              <TableCell>look</TableCell>
              <TableCell>reports as</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {looks.map(look => (
              <TableRow key={look}>
                <TableCell>
                  {look}
                </TableCell>
                <TableCell>
                  <TextField
                    size={'small'}
                    type={'number'}
                    sx={{ width: 110 }}
                    value={weatherConfig.presetIds[ look ]}
                    onChange={event => setPresetId(look, Number(event.target.value))}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          The number each strength reports as
        </Typography>

        <Stack direction={'row'} spacing={2}>
          {Object.keys(weatherConfig.intensityIds)
            .map(strength => (
              <TextField
                key={strength}
                size={'small'}
                type={'number'}
                label={strength}
                sx={{ width: 130 }}
                value={weatherConfig.intensityIds[ strength ]}
                onChange={event => setIntensityId(strength, Number(event.target.value))}
              />
            ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default WeatherWiringTab;
