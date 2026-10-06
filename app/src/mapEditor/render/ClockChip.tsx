import React, { useState, useSyncExternalStore } from 'react';
import Schedule from '@mui/icons-material/Schedule';
import { Box, Chip, Popover, Slider, Typography } from '@mui/material';
import { clockLabel, MINUTES_PER_DAY, MINUTES_PER_HOUR } from '../core/time/timeOfDay.ts';
import type { WindowClock } from '../core/time/WindowClock.ts';

/**
 * What the clock shows: the window's clock, and what the game calls each part of the day.
 */
type ClockChipProps = {
  readonly clock: WindowClock;
  readonly partOfDay: (minutes: number) => string;
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
 * Words the time of day the clock shows, with the part of the day it falls in, as the game's own clock reads.
 * @param {number} minutes The time of day, in minutes past midnight.
 * @param {(minutes: number) => string} partOfDay Names the part of the day.
 * @returns {string} The words, such as {@code 22:00 Night}.
 */
const clockWords = (minutes: number, partOfDay: (minutes: number) => string): string =>
{
  return `${clockLabel(minutes)} ${partOfDay(minutes)}`;
};

/**
 * The window's clock in a map view's bar: a chip naming the time and the part of the day, which opens a slider across
 * the whole day, a minute at a time, or an hour with Shift held. Moving it moves the clock for every map in the window,
 * so every map shows the sky at the same hour.
 * @param {ClockChipProps} props The clock, and what each part of the day is called.
 * @returns {React.JSX.Element} The chip, with its slider while it is open.
 */
const ClockChip = (props: ClockChipProps) =>
{
  const { clock, partOfDay } = props;
  const minutes = useSyncExternalStore(clock.subscribe, clock.time);
  const [ anchor, setAnchor ] = useState<HTMLElement | null>(null);
  const words = clockWords(minutes, partOfDay);
  return (
    <>
      <Chip
        data-testid={'map-clock'}
        icon={<Schedule/>}
        label={words}
        onClick={event => setAnchor(event.currentTarget)}
        size={'small'}
        title={'The time of day every map shows'}
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
          <Typography variant={'caption'} color={'text.secondary'}>
            Every map shows the sky at this hour.
          </Typography>
        </Box>
      </Popover>
    </>
  );
};

export { ClockChip, clockWords, PHASE_MARKS };
