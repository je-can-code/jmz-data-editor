import { useState } from 'react';
import { Box, Chip, Paper, Stack, TextField, Typography } from '@mui/material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { MOTION_KNOBS } from '@core/domain/valueObjects/weather-knobs.ts';
import WeatherKnobField from '@boards/weather/WeatherKnobFields.tsx';

/** A motion's own note to the author, which is a field rather than a knob. */
const NOTE_KEY = '_comment';

/**
 * Editor for the physics each look is drawn with.
 *
 * A motion is one way of moving - falling, drifting, rising, hanging still and glittering - and
 * several looks share one. Changing a motion therefore changes every look built on it, which is
 * usually the point: the whole family of things that drift should drift the same way.
 *
 * **An empty field means the motion does not say.** That is different from zero: a motion with no
 * lifetime has particles that leave the screen rather than expire, and one with no sway travels
 * in a straight line rather than weaving by nothing.
 */
const WeatherMotionsTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();
  const [ selected, setSelected ] = useState<string | null>(null);

  if (weatherConfig === null)
  {
    return null;
  }

  const names = Object.keys(weatherConfig.motions);
  const current = selected !== null && names.includes(selected) ? selected : names[ 0 ];

  if (current === undefined)
  {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant={'body2'} color={'text.secondary'}>
          No motions configured.
        </Typography>
      </Box>
    );
  }

  const motion = weatherConfig.motions[ current ];

  const setKnob = (key: string, value: unknown) =>
  {
    setConfig(previous =>
    {
      const next = { ...previous!.motions[ current ] };

      if (value === undefined) delete next[ key ];
      else next[ key ] = value;

      return {
        ...previous!,
        motions: {
          ...previous!.motions,
          [ current ]: next,
        },
      };
    });
  };

  // how many looks would move differently if this motion changed, which is the thing worth
  // knowing before touching one.
  const usedBy = Object.keys(weatherConfig.presetStops)
    .filter(look => Object.values(weatherConfig.presetStops[ look ])
      .some(layers => layers.some(layer => layer[ 'motion' ] === current)));

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction={'row'} spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {names.map(name => (
          <Chip
            key={name}
            label={name}
            color={name === current ? 'primary' : 'default'}
            onClick={() => setSelected(name)}
          />
        ))}
      </Stack>

      <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
        {usedBy.length === 0
          ? 'Nothing is drawn with this motion.'
          : `Used by ${usedBy.join(', ')}.`}
      </Typography>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          multiline
          size={'small'}
          label={'Note to yourself'}
          value={String(motion[ NOTE_KEY ] ?? '')}
          onChange={event => setKnob(NOTE_KEY, event.target.value === '' ? undefined : event.target.value)}
        />
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2 }}>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Leave a field empty for anything this motion does not say. Hover a label for what it does.
        </Typography>

        <Stack direction={'row'} sx={{ flexWrap: 'wrap', gap: 2 }}>
          {MOTION_KNOBS.map(knob => (
            <WeatherKnobField
              key={knob.key}
              knob={knob}
              value={motion[ knob.key ]}
              motionNames={names}
              onChange={next => setKnob(knob.key, next)}
            />
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default WeatherMotionsTab;
