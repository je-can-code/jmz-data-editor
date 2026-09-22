import { useState } from 'react';
import {
  Box,
  Chip,
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
import { Delete } from '@mui/icons-material';
import { useWeatherConfig } from '@presentation/context/resources/weather.context.tsx';
import WeatherConditionsPanel from '@boards/weather/WeatherConditionsPanel.tsx';

/** The months of the year, in the order the calendar runs them. */
const MONTHS = [
  { id: '3', label: 'Mar', season: 'spring' },
  { id: '4', label: 'Apr', season: 'spring' },
  { id: '5', label: 'May', season: 'spring' },
  { id: '6', label: 'Jun', season: 'summer' },
  { id: '7', label: 'Jul', season: 'summer' },
  { id: '8', label: 'Aug', season: 'summer' },
  { id: '9', label: 'Sep', season: 'autumn' },
  { id: '10', label: 'Oct', season: 'autumn' },
  { id: '11', label: 'Nov', season: 'autumn' },
  { id: '12', label: 'Dec', season: 'winter' },
  { id: '1', label: 'Jan', season: 'winter' },
  { id: '2', label: 'Feb', season: 'winter' },
];

/**
 * Editor for the sky itself: what each season permits, how it moves between conditions, and what
 * each month leans toward.
 *
 * **A season says what is possible; a month says what is likely.** The transition grid is where a
 * season's character lives - a row is where the sky is now, a column is where it might go next,
 * and the numbers are relative to each other rather than to a hundred. The month grid multiplies
 * those weights for one month only, which is what makes sakura a fortnight in April rather than a
 * whole spring, and zero is a legitimate value meaning "not this month".
 *
 * Seasons do not sit on calendar quarters: winter is December, January and February, so the
 * months run March-first here rather than January-first.
 */
const WeatherSkyTab = () =>
{
  const {
    weatherConfig,
    setConfig,
  } = useWeatherConfig();
  const [ season, setSeason ] = useState<string>('spring');

  if (weatherConfig === null)
  {
    return null;
  }

  const { sky } = weatherConfig;
  const seasonNames = Object.keys(sky.seasons);
  const current = sky.seasons[ season ];
  const allowed = current ? current.allowed : [];

  const setWeight = (from: string, to: string, weight: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          seasons: {
            ...previous!.sky.seasons,
            [ season ]: {
              ...previous!.sky.seasons[ season ],
              transitions: {
                ...previous!.sky.seasons[ season ].transitions,
                [ from ]: {
                  ...previous!.sky.seasons[ season ].transitions[ from ],
                  [ to ]: weight,
                },
              },
            },
          },
        },
      }
    ));
  };

  /**
   * Lets a season have a condition it did not have before.
   *
   * The grid has to grow with it, in both directions. A permitted condition with no row of its own
   * is a dead end the sky can arrive at and never leave, and a row that never names it means
   * nothing can arrive there in the first place - the plugin reports both as faults on load. So a
   * new condition arrives wired to everything at an even weight, which is a starting point to tune
   * rather than an opinion about what the season should be.
   */
  const addCondition = (type: string) =>
  {
    setConfig(previous =>
    {
      const block = previous!.sky.seasons[ season ];
      const allowedNow = [ ...block.allowed, type ];
      const transitions: Record<string, Record<string, number>> = {};

      // every existing row gains a way into the new condition.
      Object.keys(block.transitions)
        .forEach(from =>
        {
          transitions[ from ] = {
            ...block.transitions[ from ],
            [ type ]: 1,
          };
        });

      // and the new condition gains a row reaching everything, itself included, so that it can
      // both persist and move on.
      const row: Record<string, number> = {};
      allowedNow.forEach(target => { row[ target ] = 1; });
      transitions[ type ] = row;

      return {
        ...previous!,
        sky: {
          ...previous!.sky,
          seasons: {
            ...previous!.sky.seasons,
            [ season ]: {
              ...block,
              allowed: allowedNow,
              transitions,
            },
          },
        },
      };
    });
  };

  /**
   * Takes a condition away from a season entirely.
   *
   * Its row goes and so does every reference to it, because a weight pointing at something the
   * season forbids is filtered out at runtime and reported as a fault - it would read as a badly
   * tuned graph rather than as a leftover.
   */
  const removeCondition = (type: string) =>
  {
    setConfig(previous =>
    {
      const block = previous!.sky.seasons[ season ];
      const transitions: Record<string, Record<string, number>> = {};

      Object.keys(block.transitions)
        .filter(from => from !== type)
        .forEach(from =>
        {
          const row = { ...block.transitions[ from ] };
          delete row[ type ];
          transitions[ from ] = row;
        });

      return {
        ...previous!,
        sky: {
          ...previous!.sky,
          seasons: {
            ...previous!.sky.seasons,
            [ season ]: {
              ...block,
              allowed: block.allowed.filter(entry => entry !== type),
              transitions,
            },
          },
        },
      };
    });
  };

  const setLean = (month: string, type: string, multiplier: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          months: {
            ...previous!.sky.months,
            [ month ]: {
              ...(previous!.sky.months[ month ] ?? {}),
              [ type ]: multiplier,
            },
          },
        },
      }
    ));
  };

  const setKnob = (key: 'settleTo' | 'forecastPhases' | 'visibleDays', value: string | number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          [ key ]: value,
        },
      }
    ));
  };

  const setDrift = (key: 'hold' | 'up' | 'down', value: number) =>
  {
    setConfig(previous => (
      {
        ...previous!,
        sky: {
          ...previous!.sky,
          intensityDrift: {
            ...previous!.sky.intensityDrift,
            [ key ]: value,
          },
        },
      }
    ));
  };

  const monthsOfSeason = MONTHS.filter(month => month.season === season);
  const addable = Object.keys(sky.types)
    .filter(type => allowed.includes(type) === false);

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction={'row'} spacing={1} sx={{ mb: 3 }}>
        {seasonNames.map(name => (
          <Chip
            key={name}
            label={name}
            color={name === season ? 'primary' : 'default'}
            sx={{ textTransform: 'capitalize' }}
            onClick={() => setSeason(name)}
          />
        ))}
      </Stack>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          What this season can be
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Each condition below, as this season draws it. A condition missing from a season simply
          never happens there, which is why it never snows in summer.
        </Typography>

        <Stack spacing={2}>
          {allowed.map(condition => (
            <Paper key={condition} variant={'outlined'} sx={{ p: 2 }}>
              <Stack direction={'row'} alignItems={'center'} justifyContent={'space-between'}>
                <Typography variant={'subtitle2'} gutterBottom sx={{ textTransform: 'capitalize' }}>
                  {condition}
                </Typography>
                <IconButton
                  size={'small'}
                  aria-label={`Stop ${season} having ${condition}`}
                  onClick={() => removeCondition(condition)}
                >
                  <Delete fontSize={'small'}/>
                </IconButton>
              </Stack>
              <WeatherConditionsPanel condition={condition}/>
            </Paper>
          ))}
        </Stack>

        {addable.length > 0 && (
          <TextField
            select
            size={'small'}
            label={'Let this season also have'}
            sx={{ mt: 2, minWidth: 260 }}
            value={''}
            helperText={'Arrives wired evenly to everything; tune it in the grid below.'}
            onChange={event => addCondition(event.target.value)}
          >
            {addable.map(type => (
              <MenuItem key={type} value={type}>
                {type}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          How the sky moves
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          A row is where the sky is now; a column is where it goes next. The numbers are weights
          against each other, so they need not add up to anything.
        </Typography>

        <Table size={'small'}>
          <TableHead>
            <TableRow>
              <TableCell>from \ to</TableCell>
              {allowed.map(to => (
                <TableCell key={to} align={'center'}>
                  {to}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {allowed.map(from => (
              <TableRow key={from}>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {from}
                </TableCell>
                {allowed.map(to => (
                  <TableCell key={to} align={'center'}>
                    <TextField
                      size={'small'}
                      type={'number'}
                      sx={{ width: 78 }}
                      value={current.transitions[ from ]?.[ to ] ?? ''}
                      placeholder={'-'}
                      onChange={event => setWeight(from, to, Number(event.target.value))}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2, mb: 3 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          What each month leans toward
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          A multiplier on how much this season wants each condition, for one month only. One
          leaves it alone, four makes it four times as likely, and zero means not this month.
        </Typography>

        <Table size={'small'}>
          <TableHead>
            <TableRow>
              <TableCell>month</TableCell>
              {allowed.map(type => (
                <TableCell key={type} align={'center'}>
                  {type}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {monthsOfSeason.map(month => (
              <TableRow key={month.id}>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {month.label}
                </TableCell>
                {allowed.map(type => (
                  <TableCell key={type} align={'center'}>
                    <TextField
                      size={'small'}
                      type={'number'}
                      sx={{ width: 78 }}
                      value={sky.months[ month.id ]?.[ type ] ?? ''}
                      placeholder={'1'}
                      onChange={event => setLean(month.id, type, Number(event.target.value))}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper variant={'outlined'} sx={{ p: 2 }}>
        <Typography variant={'subtitle1'} gutterBottom>
          Strength and the forecast
        </Typography>
        <Typography variant={'body2'} color={'text.secondary'} sx={{ mb: 2 }}>
          Strength moves one rung at a time. These three are how often it holds where it is,
          climbs, or eases off - weights against each other, like the grid above.
        </Typography>

        <Stack direction={'row'} spacing={2} sx={{ mb: 3 }}>
          <TextField
            size={'small'}
            type={'number'}
            label={'Holds'}
            value={sky.intensityDrift.hold}
            onChange={event => setDrift('hold', Number(event.target.value))}
          />
          <TextField
            size={'small'}
            type={'number'}
            label={'Climbs'}
            value={sky.intensityDrift.up}
            onChange={event => setDrift('up', Number(event.target.value))}
          />
          <TextField
            size={'small'}
            type={'number'}
            label={'Eases off'}
            value={sky.intensityDrift.down}
            onChange={event => setDrift('down', Number(event.target.value))}
          />
        </Stack>

        <Stack direction={'row'} spacing={2}>
          <TextField
            select
            size={'small'}
            label={'Seasons hand over on'}
            sx={{ minWidth: 200 }}
            value={sky.settleTo}
            helperText={'Where the last day of a season steers to.'}
            onChange={event => setKnob('settleTo', event.target.value)}
          >
            {Object.keys(sky.types)
              .map(type => (
                <MenuItem key={type} value={type}>
                  {type}
                </MenuItem>
              ))}
          </TextField>
          <TextField
            size={'small'}
            type={'number'}
            label={'Phases rolled ahead'}
            value={sky.forecastPhases}
            helperText={'2160 is a full year.'}
            onChange={event => setKnob('forecastPhases', Number(event.target.value))}
          />
          <TextField
            size={'small'}
            type={'number'}
            label={'Days the forecast shows'}
            value={sky.visibleDays}
            onChange={event => setKnob('visibleDays', Number(event.target.value))}
          />
        </Stack>
      </Paper>
    </Box>
  );
};

export default WeatherSkyTab;
