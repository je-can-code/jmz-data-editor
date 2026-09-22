import {
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { INTENSITIES } from '@core/domain/valueObjects/weather-knobs.ts';
import type { WeatherFace } from '@core/domain/valueObjects/weather-config.ts';

/** The six parts of a day, in the order they run. */
const PHASES = [
  { id: 0, label: 'Moontide' },
  { id: 1, label: 'Dawn' },
  { id: 2, label: 'Morning' },
  { id: 3, label: 'Afternoon' },
  { id: 4, label: 'Evening' },
  { id: 5, label: 'Night' },
];

/** The four seasons, named as the config names them. */
const SEASONS = [ 'spring', 'summer', 'autumn', 'winter' ];

/**
 * Editor for the conditions the sky can be in, and the faces each one wears.
 *
 * A **condition** is a state the sky walks between - rain, overcast, snow. A **face** is the look
 * it is actually drawn with at a particular season and hour, and the two are separate because a
 * clear summer afternoon and a clear winter afternoon are the same state and completely different
 * pictures.
 *
 * **Faces are tried in order and the first that matches wins**, so a rule naming both a season and
 * a time of day belongs above one naming only the time of day. A rule that names neither matches
 * always, which makes it a rule nothing beneath it can ever reach.
 */
const WeatherConditionsPanel = ({ condition }: { condition: string; }) =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();

  if (weatherConfig === null)
  {
    return null;
  }

  const type = weatherConfig.sky.types[ condition ];

  if (type === undefined)
  {
    return null;
  }

  const looks = Object.keys(weatherConfig.presetIcons);

  const patchType = (patch: Partial<typeof type>) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          types: {
            ...previous!.sky.types,
            [ condition ]: {
              ...previous!.sky.types[ condition ],
              ...patch,
            },
          },
        },
      }
    ));
  };

  const toggleIntensity = (strength: string) =>
  {
    const has = type.intensities.includes(strength);

    // ordered weakest first rather than in the order they were clicked, because the list is a
    // range and reads as one.
    const next = has
      ? type.intensities.filter(entry => entry !== strength)
      : INTENSITIES.filter(entry => entry === strength || type.intensities.includes(entry));

    patchType({ intensities: next });
  };

  const patchFace = (index: number, patch: Partial<WeatherFace>) =>
  {
    patchType({
      faces: type.faces.map((face, position) => (position === index ? {
        ...face,
        ...patch,
      } : face)),
    });
  };

  const toggleFacePhase = (index: number, phase: number) =>
  {
    const face = type.faces[ index ];
    const has = face.phases.includes(phase);
    const next = has
      ? face.phases.filter(entry => entry !== phase)
      : PHASES.map(entry => entry.id)
        .filter(entry => entry === phase || face.phases.includes(entry));

    patchFace(index, { phases: next });
  };

  const toggleFaceSeason = (index: number, season: string) =>
  {
    const face = type.faces[ index ];
    const has = face.seasons.includes(season);
    const next = has
      ? face.seasons.filter(entry => entry !== season)
      : SEASONS.filter(entry => entry === season || face.seasons.includes(entry));

    patchFace(index, { seasons: next });
  };

  const addFace = () =>
  {
    patchType({
      faces: [ ...type.faces, {
        seasons: [],
        phases: [],
        preset: type.preset,
      } ],
    });
  };

  const removeFace = (index: number) =>
  {
    patchType({ faces: type.faces.filter((_face, position) => position !== index) });
  };

  return (
    <Box>
      <Stack direction={'row'} spacing={2} alignItems={'center'} sx={{ mb: 2 }}>
        <TextField
          select
          size={'small'}
          label={'Normally drawn as'}
          sx={{ minWidth: 200 }}
          value={type.preset}
          onChange={event => patchType({ preset: event.target.value })}
        >
          {looks.map(look => (
            <MenuItem key={look} value={look}>
              {look}
            </MenuItem>
          ))}
        </TextField>

        <Box>
          <Typography variant={'caption'} color={'text.secondary'}>
            Can be
          </Typography>
          <Stack direction={'row'}>
            {INTENSITIES.map(strength => (
              <FormControlLabel
                key={strength}
                label={strength}
                control={
                  <Checkbox
                    size={'small'}
                    checked={type.intensities.includes(strength)}
                    onChange={() => toggleIntensity(strength)}
                  />
                }
              />
            ))}
          </Stack>
        </Box>
      </Stack>

      <Stack direction={'row'} alignItems={'center'} sx={{ mb: 1 }}>
        <Typography variant={'subtitle2'} sx={{ flexGrow: 1 }}>
          Drawn differently when
        </Typography>
        <Button size={'small'} startIcon={<Add/>} onClick={addFace}>
          Add a rule
        </Button>
      </Stack>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 1 }}>
        Tried top to bottom; the first rule that matches wins. Ticking nothing on a row means it
        matches every one of them.
      </Typography>

      {type.faces.length === 0 && (
        <Typography variant={'body2'} color={'text.disabled'}>
          Always drawn the same way.
        </Typography>
      )}

      <Stack spacing={1}>
        {type.faces.map((face, index) => (
          <Paper key={index} variant={'outlined'} sx={{ p: 1.5 }}>
            <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ flexWrap: 'wrap', gap: 1 }}>
              <TextField
                select
                size={'small'}
                label={'Drawn as'}
                sx={{ minWidth: 170 }}
                value={face.preset}
                onChange={event => patchFace(index, { preset: event.target.value })}
              >
                {looks.map(look => (
                  <MenuItem key={look} value={look}>
                    {look}
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction={'row'} spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {PHASES.map(phase => (
                  <Chip
                    key={phase.id}
                    size={'small'}
                    label={phase.label}
                    color={face.phases.includes(phase.id) ? 'primary' : 'default'}
                    variant={face.phases.includes(phase.id) ? 'filled' : 'outlined'}
                    onClick={() => toggleFacePhase(index, phase.id)}
                  />
                ))}
              </Stack>

              <Stack direction={'row'} spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {SEASONS.map(season => (
                  <Chip
                    key={season}
                    size={'small'}
                    label={season}
                    color={face.seasons.includes(season) ? 'secondary' : 'default'}
                    variant={face.seasons.includes(season) ? 'filled' : 'outlined'}
                    onClick={() => toggleFaceSeason(index, season)}
                  />
                ))}
              </Stack>

              <IconButton size={'small'} aria-label={'Remove this rule'} onClick={() => removeFace(index)}>
                <Delete fontSize={'small'}/>
              </IconButton>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
};

export default WeatherConditionsPanel;
