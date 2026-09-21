import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { useActors } from '@presentation/context/resources/actors.context.tsx';
import type { WeatherVoiceLine } from '@core/domain/valueObjects/weather-config.ts';

/** The strengths a look can be written for, plus the catch-all that covers the ones it is not. */
const STRENGTHS = [ 'any', 'light', 'moderate', 'heavy' ];

/** The key holding lines for standing somewhere with no weather at all. */
const SHELTERED = 'none';

/**
 * Editor for what somebody travelling with you says about the weather.
 *
 * A look written only under **Any** uses those lines whatever the weather's strength, which is how
 * fifteen looks cost fifteen sets of lines rather than forty-five. Writing a strength as well
 * replaces the catch-all for that strength alone - worth doing where a drizzle and a downpour want
 * genuinely different words, and not worth doing anywhere else.
 *
 * Only party members ever speak, so a line given to somebody who has not joined yet simply never
 * appears.
 */
const WeatherVoicesTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();
  const { data: actors } = useActors();
  const [ selected, setSelected ] = useState<string>(SHELTERED);

  if (weatherConfig === null)
  {
    return null;
  }

  // every look that can be drawn, plus the sheltered case, which is not a look but is somewhere a
  // player stands constantly.
  const looks = [ SHELTERED, ...Object.keys(weatherConfig.presetIds) ];
  const voices = weatherConfig.sky.voices;
  const written = voices[ selected ] ?? {};

  const speakers = (actors ?? []).filter(actor => actor !== null && actor.id > 0);

  const nameOf = (actorId: number): string =>
  {
    const actor = speakers.find(candidate => candidate.id === actorId);

    return actor ? actor.name : `Actor ${String(actorId)}`;
  };

  const linesAt = (strength: string): WeatherVoiceLine[] =>
  {
    return written[ strength ] ?? [];
  };

  const replaceLines = (strength: string, lines: WeatherVoiceLine[]) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          voices: {
            ...previous!.sky.voices,
            [ selected ]: {
              ...(previous!.sky.voices[ selected ] ?? {}),
              [ strength ]: lines,
            },
          },
        },
      }
    ));
  };

  const addLine = (strength: string) =>
  {
    const firstSpeaker = speakers.length > 0 ? speakers[ 0 ].id : 1;

    replaceLines(strength, [ ...linesAt(strength), {
      who: firstSpeaker,
      says: '',
    } ]);
  };

  const editLine = (strength: string, index: number, patch: Partial<WeatherVoiceLine>) =>
  {
    const next = linesAt(strength)
      .map((line, position) => (position === index ? {
        ...line,
        ...patch,
      } : line));

    replaceLines(strength, next);
  };

  const removeLine = (strength: string, index: number) =>
  {
    replaceLines(strength, linesAt(strength)
      .filter((_line, position) => position !== index));
  };

  const countFor = (look: string): number =>
  {
    const entry = voices[ look ] ?? {};

    return Object.keys(entry)
      .reduce((total, strength) => total + entry[ strength ].length, 0);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
        One of these is picked at random each time the forecast is opened. Two or more per look
        keeps it feeling like a person rather than a sign.
      </Typography>

      <Stack direction={'row'} spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {looks.map(look => (
          <Chip
            key={look}
            label={`${look === SHELTERED ? 'Sheltered' : look} (${String(countFor(look))})`}
            color={look === selected ? 'primary' : 'default'}
            variant={countFor(look) > 0 ? 'filled' : 'outlined'}
            onClick={() => setSelected(look)}
          />
        ))}
      </Stack>

      {speakers.length === 0 && (
        <Alert severity={'info'} sx={{ mb: 2 }}>
          No actors loaded, so lines can only be given a number rather than a name.
        </Alert>
      )}

      {STRENGTHS.map(strength => (
        <Paper key={strength} variant={'outlined'} sx={{ p: 2, mb: 2 }}>
          <Stack direction={'row'} alignItems={'center'} spacing={1} sx={{ mb: 1 }}>
            <Typography variant={'subtitle1'} sx={{ flexGrow: 1, textTransform: 'capitalize' }}>
              {strength}
            </Typography>
            <Button size={'small'} startIcon={<Add/>} onClick={() => addLine(strength)}>
              Add a line
            </Button>
          </Stack>

          {strength === 'any' && (
            <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 1 }}>
              Used at every strength this look is not separately written for.
            </Typography>
          )}

          {linesAt(strength).length === 0 && (
            <Typography variant={'body2'} color={'text.disabled'}>
              Nothing written.
            </Typography>
          )}

          <Stack spacing={1}>
            {linesAt(strength)
              .map((line, index) => (
                <Stack key={index} direction={'row'} spacing={1} alignItems={'flex-start'}>
                  <TextField
                    select
                    size={'small'}
                    label={'Said by'}
                    value={line.who}
                    sx={{ minWidth: 160 }}
                    onChange={event => editLine(strength, index, { who: Number(event.target.value) })}
                  >
                    {speakers.map(actor => (
                      <MenuItem key={actor.id} value={actor.id}>
                        {actor.name}
                      </MenuItem>
                    ))}
                    {speakers.some(actor => actor.id === line.who) === false && (
                      <MenuItem value={line.who}>
                        {nameOf(line.who)}
                      </MenuItem>
                    )}
                  </TextField>
                  <TextField
                    fullWidth
                    multiline
                    size={'small'}
                    label={'Says'}
                    value={line.says}
                    onChange={event => editLine(strength, index, { says: event.target.value })}
                  />
                  <IconButton aria-label={'Remove this line'} onClick={() => removeLine(strength, index)}>
                    <Delete/>
                  </IconButton>
                </Stack>
              ))}
          </Stack>
        </Paper>
      ))}
    </Box>
  );
};

export default WeatherVoicesTab;
