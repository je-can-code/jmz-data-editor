import React, { useState, useSyncExternalStore } from 'react';
import Schedule from '@mui/icons-material/Schedule';
import { Box, Chip, Popover, Slider, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { SeasonOffer } from '../core/modules/PluginModule.ts';
import { clockLabel, MINUTES_PER_DAY, MINUTES_PER_HOUR } from '../core/time/timeOfDay.ts';
import type { WindowClock } from '../core/time/WindowClock.ts';

/**
 * What the clock shows: the window's clock, what the game calls each part of the day, and the seasons its calendar runs
 * through, when it has any.
 */
type ClockChipProps = {
  readonly clock: WindowClock;
  readonly partOfDay: (minutes: number) => string;
  readonly seasons?: SeasonOffer;
};

/**
 * How far the slider moves with Shift held, or with Page Up and Page Down: an hour.
 */
const HOUR_STEP = MINUTES_PER_HOUR;

/**
 * The marks along the slider: every four hours, where each part of the day begins, named by the time.
 */
const PHASE_MARKS = [ 0, 4, 8, 12, 16, 20 ].map(hour => ({ value: hour * MINUTES_PER_HOUR, label: clockLabel(hour * MINUTES_PER_HOUR) }));

/**
 * Words the time of day the clock shows, with the part of the day it falls in, as the game's own clock reads, and the
 * season after it when the clock has one.
 * @param {number} minutes The time of day, in minutes past midnight.
 * @param {(minutes: number) => string} partOfDay Names the part of the day.
 * @param {string | undefined} season The season's name, or undefined for a clock without seasons.
 * @returns {string} The words, such as {@code 22:00 Night} or {@code 22:00 Night · Winter}.
 */
const clockWords = (minutes: number, partOfDay: (minutes: number) => string, season?: string): string =>
{
  const time = `${clockLabel(minutes)} ${partOfDay(minutes)}`;
  return season === undefined
    ? time
    : `${time} · ${season}`;
};

/**
 * Finds the season the clock shows: the one the author picked, or the one the game starts in until then. A picked season
 * the calendar has no name for, as one remembered from a game that numbered more, shows as the one the game starts in.
 * @param {number | null} picked The season the author picked, or null for none.
 * @param {SeasonOffer} seasons The calendar's seasons.
 * @returns {number} The season shown.
 */
const shownSeason = (picked: number | null, seasons: SeasonOffer): number =>
{
  return picked !== null && picked < seasons.names.length
    ? picked
    : seasons.startsIn;
};

/**
 * Words the date the clock's season moves every map to, saying so when it is the day a new game starts, which it is in
 * the season the game starts in.
 * @param {number} season The season shown.
 * @param {SeasonOffer} seasons The calendar's seasons.
 * @returns {string} The words, such as {@code June 16, 2027.}
 */
const dateCaption = (season: number, seasons: SeasonOffer): string =>
{
  const date = seasons.dateWords(season);
  return season === seasons.startsIn
    ? `${date}, the day a new game starts.`
    : `${date}.`;
};

/**
 * The window's clock in a map view's bar: a chip naming the time, the part of the day and, for a game whose calendar has
 * them, the season, which opens a slider across the whole day, a minute at a time or an hour with Shift held, and a
 * button for each season, naming the date the season brings. Moving either moves the clock for every map in the window,
 * so every map shows the sky, and each event's page, at the same hour on the same date.
 * @param {ClockChipProps} props The clock, what each part of the day is called, and the seasons, if any.
 * @returns {React.JSX.Element} The chip, with its slider and seasons while it is open.
 */
const ClockChip = (props: ClockChipProps) =>
{
  const { clock, partOfDay, seasons } = props;
  const minutes = useSyncExternalStore(clock.subscribe, clock.time);
  const picked = useSyncExternalStore(clock.subscribe, clock.season);
  const [ anchor, setAnchor ] = useState<HTMLElement | null>(null);
  const season = seasons === undefined ? null : shownSeason(picked, seasons);
  const words = clockWords(minutes, partOfDay, season === null ? undefined : seasons?.names[season]);
  return (
    <>
      <Chip
        data-testid={'map-clock'}
        icon={<Schedule/>}
        label={words}
        onClick={event => setAnchor(event.currentTarget)}
        size={'small'}
        title={seasons === undefined ? 'The time of day every map shows' : 'The time of day and season every map shows'}
        variant={'outlined'}
      />
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        onClose={() => setAnchor(null)}
        open={anchor !== null}
      >
        <Box sx={{ width: 340, px: 2.5, pt: 1.5, pb: 1 }}>
          <Typography variant={'subtitle2'}>
            {words}
          </Typography>
          <Slider
            aria-label={'Time of day'}
            marks={PHASE_MARKS}
            max={MINUTES_PER_DAY - 1}
            min={0}
            onChange={(_event, value) => clock.set(value as number)}
            shiftStep={HOUR_STEP}
            size={'small'}
            step={1}
            value={minutes}
            valueLabelDisplay={'auto'}
            valueLabelFormat={clockLabel}
          />
          {seasons !== undefined && season !== null && (
            <Box sx={{ mt: 0.5, mb: 1 }}>
              <ToggleButtonGroup
                aria-label={'Season'}
                exclusive
                fullWidth
                onChange={(_event, value: number | null) =>
                {
                  // the season already shown, clicked again, stays shown.
                  if (value !== null)
                  {
                    clock.chooseSeason(value);
                  }
                }}
                size={'small'}
                value={season}
              >
                {seasons.names.map((name, index) => (
                  <ToggleButton key={name} sx={{ textTransform: 'none', py: 0.25 }} value={index}>
                    {name}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
              <Typography data-testid={'map-clock-date'} variant={'caption'} component={'p'} color={'text.secondary'} sx={{ mt: 0.5 }}>
                {dateCaption(season, seasons)}
              </Typography>
            </Box>
          )}
          <Typography variant={'caption'} color={'text.secondary'}>
            {seasons === undefined
              ? 'Every map shows this hour, each event as a new game would show it.'
              : 'Every map shows this hour and date, each event as a new game would show it then.'}
          </Typography>
        </Box>
      </Popover>
    </>
  );
};

export { ClockChip, clockWords, dateCaption, PHASE_MARKS, shownSeason };
