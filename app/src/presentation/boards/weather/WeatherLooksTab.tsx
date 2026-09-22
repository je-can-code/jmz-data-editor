import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { INTENSITIES, LAYER_KNOBS, STAGE_KNOBS } from '@core/domain/valueObjects/weather-knobs.ts';
import WeatherKnobField from '@boards/weather/WeatherKnobFields.tsx';
import type { WeatherKnobBag } from '@core/domain/valueObjects/weather-config.ts';

/**
 * Editor for the looks themselves - what each one is called, what it is made of, and how much of
 * it there is.
 *
 * A **layer** is one picture travelling one way. Anything more complicated than that is two
 * layers, which is why heavy weather stacks several. **How many** is the knob to reach for when
 * something turns out to have too much floating about after actually playing with it; it counts
 * against a default-sized window and is scaled up to the real one, so the same number looks the
 * same on any monitor.
 *
 * A look without an icon is not broken - the forecast falls back to writing its name - so this is
 * a screen that gets progressively better rather than one that has to be finished first.
 */
const WeatherLooksTab = () =>
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

  const looks = Object.keys(weatherConfig.presetIcons)
    .sort((left, right) => (weatherConfig.presetIds[ left ] ?? 0) - (weatherConfig.presetIds[ right ] ?? 0));
  const current = selected !== null && looks.includes(selected) ? selected : looks[ 0 ];

  if (current === undefined)
  {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant={'body2'} color={'text.secondary'}>
          No looks configured.
        </Typography>
      </Box>
    );
  }

  const motionNames = Object.keys(weatherConfig.motions);
  const stops = weatherConfig.presetStops[ current ] ?? {};
  const sounds = weatherConfig.presetSounds[ current ] ?? {};

  const replaceLayers = (strength: string, layers: WeatherKnobBag[]) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetStops: {
          ...previous!.presetStops,
          [ current ]: {
            ...(previous!.presetStops[ current ] ?? {}),
            [ strength ]: layers,
          },
        },
      }
    ));
  };

  const setLayerKnob = (strength: string, index: number, key: string, value: unknown) =>
  {
    const layers = (stops[ strength ] ?? []).map((layer, position) =>
    {
      if (position !== index) return layer;

      const next = { ...layer };

      if (value === undefined) delete next[ key ];
      else next[ key ] = value;

      return next;
    });

    replaceLayers(strength, layers);
  };

  const addLayer = (strength: string) =>
  {
    replaceLayers(strength, [ ...(stops[ strength ] ?? []), {
      motion: motionNames[ 0 ] ?? '',
      asset: '',
      density: 10,
      speed: 100,
      scale: 100,
      blend: 'normal',
    } ]);
  };

  const removeLayer = (strength: string, index: number) =>
  {
    replaceLayers(strength, (stops[ strength ] ?? []).filter((_layer, position) => position !== index));
  };

  const setSound = (strength: string, key: string, value: unknown) =>
  {
    setConfig(previous =>
    {
      const existing = previous!.presetSounds[ current ] ?? {};
      const sound = { ...(existing[ strength ] ?? {}) };

      if (value === undefined || value === '') delete sound[ key ];
      else sound[ key ] = value;

      const next = { ...existing };

      // a strength with nothing left to say about sound is silent again, rather than carrying an
      // empty entry the audio channel would try to play.
      if (Object.keys(sound).length === 0) delete next[ strength ];
      else next[ strength ] = sound;

      return {
        ...previous!,
        presetSounds: {
          ...previous!.presetSounds,
          [ current ]: next,
        },
      };
    });
  };

  const setIcon = (iconIndex: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetIcons: {
          ...previous!.presetIcons,
          [ current ]: iconIndex,
        },
      }
    ));
  };

  const setDescription = (description: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetDescriptions: {
          ...previous!.presetDescriptions,
          [ current ]: description,
        },
      }
    ));
  };

  // a layer whose motion turns into something else needs the second stage described, and one
  // whose motion does not would be authoring fields nothing ever reads.
  const isStaged = (layer: WeatherKnobBag): boolean =>
  {
    const motion = weatherConfig.motions[ String(layer[ 'motion' ]) ];

    return motion !== undefined && motion[ 'becomes' ] !== undefined;
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction={'row'} spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mb: 3 }}>
        {looks.map(look => (
          <Chip
            key={look}
            label={look}
            color={look === current ? 'primary' : 'default'}
            variant={weatherConfig.presetIcons[ look ] > 0 ? 'filled' : 'outlined'}
            onClick={() => setSelected(look)}
          />
        ))}
      </Stack>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Stack direction={'row'} spacing={2} alignItems={'flex-start'}>
          <IconIndexField
            value={weatherConfig.presetIcons[ current ]}
            onChange={next => setIcon(Math.max(0, Math.trunc(next)))}
          />
          <Stack sx={{ flexGrow: 1 }} spacing={1}>
            <TextField
              fullWidth
              multiline
              size={'small'}
              label={'What it is'}
              value={weatherConfig.presetDescriptions[ current ] ?? ''}
              onChange={event => setDescription(event.target.value)}
            />
            <Typography variant={'caption'} color={'text.secondary'}>
              {`Events see this as ${String(weatherConfig.presetIds[ current ] ?? 0)}.`}
            </Typography>
          </Stack>
        </Stack>
      </Paper>

      {INTENSITIES.map(strength => (
        <Paper key={strength} variant={'outlined'} sx={{ p: 2, mb: 2 }}>
          <Stack direction={'row'} alignItems={'center'} sx={{ mb: 1 }}>
            <Typography variant={'subtitle1'} sx={{
              flexGrow: 1,
              textTransform: 'capitalize',
            }}>
              {strength}
            </Typography>
            <Button size={'small'} startIcon={<Add/>} onClick={() => addLayer(strength)}>
              Add a layer
            </Button>
          </Stack>

          {(stops[ strength ] ?? []).length === 0 && (
            <Typography variant={'body2'} color={'text.disabled'} sx={{ mb: 1 }}>
              Nothing drawn at this strength.
            </Typography>
          )}

          {(stops[ strength ] ?? []).map((layer, index) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Stack direction={'row'} alignItems={'center'} sx={{ mb: 1 }}>
                <Typography variant={'caption'} color={'text.secondary'} sx={{ flexGrow: 1 }}>
                  {`Layer ${String(index + 1)}`}
                </Typography>
                <IconButton
                  size={'small'}
                  aria-label={'Remove this layer'}
                  onClick={() => removeLayer(strength, index)}
                >
                  <Delete fontSize={'small'}/>
                </IconButton>
              </Stack>
              <Stack direction={'row'} sx={{
                flexWrap: 'wrap',
                gap: 2,
              }}>
                {LAYER_KNOBS.map(knob => (
                  <WeatherKnobField
                    key={knob.key}
                    knob={knob}
                    value={layer[ knob.key ]}
                    motionNames={motionNames}
                    onChange={next => setLayerKnob(strength, index, knob.key, next)}
                  />
                ))}
                {isStaged(layer) && STAGE_KNOBS.map(knob => (
                  <WeatherKnobField
                    key={knob.key}
                    knob={knob}
                    value={layer[ knob.key ]}
                    motionNames={motionNames}
                    onChange={next => setLayerKnob(strength, index, knob.key, next)}
                  />
                ))}
              </Stack>
              <Divider sx={{ mt: 2 }}/>
            </Box>
          ))}

          <Stack direction={'row'} spacing={2} sx={{ mt: 1 }}>
            <TextField
              size={'small'}
              label={'Sound'}
              placeholder={'silent'}
              sx={{ width: 190 }}
              value={String(sounds[ strength ]?.[ 'name' ] ?? '')}
              onChange={event => setSound(strength, 'name', event.target.value)}
            />
            <TextField
              size={'small'}
              type={'number'}
              label={'Volume'}
              sx={{ width: 120 }}
              value={String(sounds[ strength ]?.[ 'volume' ] ?? '')}
              onChange={event => setSound(strength, 'volume', Number(event.target.value))}
            />
            <TextField
              size={'small'}
              type={'number'}
              label={'Pitch'}
              sx={{ width: 120 }}
              value={String(sounds[ strength ]?.[ 'pitch' ] ?? '')}
              onChange={event => setSound(strength, 'pitch', Number(event.target.value))}
            />
          </Stack>
        </Paper>
      ))}
    </Box>
  );
};

export default WeatherLooksTab;
