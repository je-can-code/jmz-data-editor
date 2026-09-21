import { useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';

/** The three strengths a climate can answer with. */
const STRENGTHS = [ 'light', 'moderate', 'heavy' ];

/**
 * Editor for the places that answer the weather differently, and the ones the developer forecast
 * reports on.
 *
 * A **climate** is how one kind of place responds to the sky rather than following it. The Forest
 * of Dreams is the reason it exists: it is at its foggiest when the sky is at its *clearest*,
 * which is a statement about somewhere in particular and nothing the sky itself can express. A
 * climate reads either the sky's condition or its strength, never both.
 *
 * A **destination** is a name and a map id. What the weather does there comes from that map's own
 * note, so nothing about it is restated here - retag the map and this follows. These only ever
 * appear on the developer forecast; the player's forecast is about Raevula and says nothing about
 * places they may not have found.
 */
const WeatherPlacesTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();

  // which question each climate has been switched to. A climate that has been emptied still has
  // to stay on the table the author chose, and the data cannot say which that is once it is
  // empty - so the choice is held here until something is typed into it.
  const [ keying, rememberKeying ] = useState<Record<string, 'byType' | 'byIntensity'>>({});

  if (weatherConfig === null)
  {
    return null;
  }

  const { climates } = weatherConfig;
  const { places } = weatherConfig.sky;
  const conditions = Object.keys(weatherConfig.sky.types);

  /**
   * Which question a climate is answering: what it was switched to, or failing that what the
   * file already says. An authored `byIntensity` table is the only evidence in the data, since a
   * climate with neither is keyed by condition by convention.
   */
  const keyedBy = (climate: string): 'byType' | 'byIntensity' =>
  {
    const remembered = keying[ climate ];

    if (remembered !== undefined) return remembered;

    return Object.keys(climates[ climate ].byIntensity).length > 0 ? 'byIntensity' : 'byType';
  };

  const setByType = (climate: string, condition: string, strength: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        climates: {
          ...previous!.climates,
          [ climate ]: {
            ...previous!.climates[ climate ],
            byType: {
              ...previous!.climates[ climate ].byType,
              [ condition ]: strength,
            },
          },
        },
      }
    ));
  };

  /**
   * Sets one row of the strength-keyed table, for a climate that answers how hard it is coming
   * down rather than what it is doing.
   */
  const setByIntensity = (climate: string, strength: string, becomes: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        climates: {
          ...previous!.climates,
          [ climate ]: {
            ...previous!.climates[ climate ],
            byIntensity: {
              ...previous!.climates[ climate ].byIntensity,
              [ strength ]: becomes,
            },
          },
        },
      }
    ));
  };

  /**
   * Switches which question a climate answers, emptying the table it is no longer using.
   *
   * **A climate keys on one or the other, never both** - the plugin reports a climate declaring
   * both as a fault rather than picking one, so the two tables cannot be allowed to coexist. The
   * discarded table is not kept in the background either: an author who switched away and saved
   * would otherwise be carrying invisible entries that come back the moment they switch return.
   */
  const setKeying = (climate: string, answers: 'byType' | 'byIntensity') =>
  {
    rememberKeying(previous => (
      {
        ...previous,
        [ climate ]: answers,
      }
    ));

    setConfig(previous => (
      {
        ...previous!,
        climates: {
          ...previous!.climates,
          [ climate ]: {
            ...previous!.climates[ climate ],
            byType: answers === 'byType' ? previous!.climates[ climate ].byType : {},
            byIntensity: answers === 'byIntensity' ? previous!.climates[ climate ].byIntensity : {},
          },
        },
      }
    ));
  };

  const setFallback = (climate: string, strength: string) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        climates: {
          ...previous!.climates,
          [ climate ]: {
            ...previous!.climates[ climate ],
            fallback: strength,
          },
        },
      }
    ));
  };

  const setPlace = (index: number, patch: { name?: string; mapId?: number; }) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          places: previous!.sky.places.map((place, position) => (position === index ? {
            ...place,
            ...patch,
          } : place)),
        },
      }
    ));
  };

  const addPlace = () =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          places: [ ...previous!.sky.places, {
            name: '',
            mapId: 1,
          } ],
        },
      }
    ));
  };

  const removePlace = (index: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          places: previous!.sky.places.filter((_place, position) => position !== index),
        },
      }
    ));
  };

  return (
    <Box sx={{ p: 2 }}>
      {Object.keys(climates)
        .map(name => (
          <Paper key={name} variant={'outlined'} sx={{ p: 2, mb: 3 }}>
            <Typography variant={'subtitle1'} gutterBottom sx={{ textTransform: 'capitalize' }}>
              {name}
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
              What a place with this climate does under each kind of sky. A climate answers one
              question or the other, so choosing here empties the table it stops using.
            </Typography>

            <TextField
              select
              size={'small'}
              label={'Answers'}
              sx={{ mb: 2, minWidth: 260 }}
              value={keyedBy(name)}
              onChange={event => setKeying(name, event.target.value as 'byType' | 'byIntensity')}
            >
              <MenuItem value={'byType'}>
                what the sky is doing
              </MenuItem>
              <MenuItem value={'byIntensity'}>
                how hard it is coming down
              </MenuItem>
            </TextField>

            <Table size={'small'}>
              <TableHead>
                <TableRow>
                  <TableCell>when the sky is</TableCell>
                  <TableCell>this place is</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {keyedBy(name) === 'byIntensity'
                  ? STRENGTHS.map(strength => (
                    <TableRow key={strength}>
                      <TableCell>
                        {strength}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size={'small'}
                          sx={{ minWidth: 160 }}
                          value={climates[ name ].byIntensity[ strength ] ?? ''}
                          onChange={event => setByIntensity(name, strength, event.target.value)}
                        >
                          <MenuItem value={''}>
                            (follows the sky)
                          </MenuItem>
                          {STRENGTHS.map(entry => (
                            <MenuItem key={entry} value={entry}>
                              {entry}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))
                  : conditions.map(condition => (
                    <TableRow key={condition}>
                      <TableCell>
                        {condition}
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          size={'small'}
                          sx={{ minWidth: 160 }}
                          value={climates[ name ].byType[ condition ] ?? ''}
                          onChange={event => setByType(name, condition, event.target.value)}
                        >
                          <MenuItem value={''}>
                            (follows the sky)
                          </MenuItem>
                          {STRENGTHS.map(strength => (
                            <MenuItem key={strength} value={strength}>
                              {strength}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow>
                  <TableCell sx={{ fontStyle: 'italic' }}>
                    anything else
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size={'small'}
                      sx={{ minWidth: 160 }}
                      value={climates[ name ].fallback}
                      onChange={event => setFallback(name, event.target.value)}
                    >
                      <MenuItem value={''}>
                        (follows the sky)
                      </MenuItem>
                      {STRENGTHS.map(strength => (
                        <MenuItem key={strength} value={strength}>
                          {strength}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Paper>
        ))}

      <Paper variant={'outlined'} sx={{ p: 2 }}>
        <Stack direction={'row'} alignItems={'center'} sx={{ mb: 1 }}>
          <Typography variant={'subtitle1'} sx={{ flexGrow: 1 }}>
            Destinations
          </Typography>
          <Button size={'small'} startIcon={<Add/>} onClick={addPlace}>
            Add a place
          </Button>
        </Stack>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Shown on the developer forecast only. The weather comes from each map's own note, so
          there is nothing to set here beyond which map it is.
        </Typography>

        <Stack spacing={1}>
          {places.map((place, index) => (
            <Stack key={index} direction={'row'} spacing={1} alignItems={'center'}>
              <TextField
                size={'small'}
                label={'Called'}
                value={place.name}
                sx={{ flexGrow: 1 }}
                onChange={event => setPlace(index, { name: event.target.value })}
              />
              <TextField
                size={'small'}
                type={'number'}
                label={'Map'}
                sx={{ width: 110 }}
                value={place.mapId}
                onChange={event => setPlace(index, { mapId: Number(event.target.value) })}
              />
              <IconButton aria-label={'Remove this place'} onClick={() => removePlace(index)}>
                <Delete/>
              </IconButton>
            </Stack>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
};

export default WeatherPlacesTab;
