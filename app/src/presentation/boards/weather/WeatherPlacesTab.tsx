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

  if (weatherConfig === null)
  {
    return null;
  }

  const { climates } = weatherConfig;
  const { places } = weatherConfig.sky;
  const conditions = Object.keys(weatherConfig.sky.types);

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
              What a place with this climate does under each kind of sky.
            </Typography>

            <Table size={'small'}>
              <TableHead>
                <TableRow>
                  <TableCell>when the sky is</TableCell>
                  <TableCell>this place is</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conditions.map(condition => (
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
