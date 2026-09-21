import { Box, Stack, TextField, Typography } from '@mui/material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';

/**
 * Editor for how each look is labelled and pictured in the forecast.
 *
 * A look without an icon is not broken - the forecast falls back to writing its name - so this is
 * a screen that gets progressively better rather than one that has to be finished before anything
 * works. Several of these can honestly share a drawing: clear, scorcher and frigid are one sun in
 * three moods, and starfall and fireflies are both a night sky with things in it.
 *
 * The number beside each name is what events branch on, and it is shown rather than edited here:
 * renumbering a look silently changes the meaning of every conditional already written against it.
 */
const WeatherLooksTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();

  if (weatherConfig === null)
  {
    return null;
  }

  const looks = Object.keys(weatherConfig.presetIcons)
    .sort((left, right) =>
    {
      const leftId = weatherConfig.presetIds[ left ] ?? 0;
      const rightId = weatherConfig.presetIds[ right ] ?? 0;

      return leftId - rightId;
    });

  const setIcon = (look: string, iconIndex: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetIcons: {
          ...previous!.presetIcons,
          [ look ]: iconIndex,
        },
      }
    ));
  };

  const setDescription = (look: string, description: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        presetDescriptions: {
          ...previous!.presetDescriptions,
          [ look ]: description,
        },
      }
    ));
  };

  const undrawn = looks.filter(look => weatherConfig.presetIcons[ look ] === 0).length;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
        {undrawn === 0
          ? 'Every look has a picture.'
          : `${String(undrawn)} of ${String(looks.length)} looks still write their name instead of a picture.`}
      </Typography>

      <Stack spacing={2}>
        {looks.map(look => (
          <Stack key={look} direction={'row'} spacing={2} alignItems={'center'}>
            <IconIndexField
              value={weatherConfig.presetIcons[ look ]}
              onChange={next => setIcon(look, Math.max(0, Math.trunc(next)))}
            />
            <Box sx={{ minWidth: 140 }}>
              <Typography variant={'subtitle1'}>
                {look}
              </Typography>
              <Typography variant={'caption'} color={'text.secondary'}>
                {`reported as ${String(weatherConfig.presetIds[ look ] ?? 0)}`}
              </Typography>
            </Box>
            <TextField
              fullWidth
              multiline
              size={'small'}
              label={'What it is'}
              value={weatherConfig.presetDescriptions[ look ] ?? ''}
              onChange={event => setDescription(look, event.target.value)}
            />
          </Stack>
        ))}
      </Stack>
    </Box>
  );
};

export default WeatherLooksTab;
