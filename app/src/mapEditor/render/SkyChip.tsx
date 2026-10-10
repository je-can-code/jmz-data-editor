import React, { useState, useSyncExternalStore } from 'react';
import Cloud from '@mui/icons-material/Cloud';
import { Box, Button, Chip, Popover, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { SkyCondition, SkyOffer } from '../core/modules/PluginModule.ts';
import type { SkyPick, WindowClock } from '../core/time/WindowClock.ts';

/**
 * What the sky's chip shows: the window's clock, which holds the sky picked, and the sky a module offers.
 */
type SkyChipProps = {
  readonly clock: WindowClock;
  readonly offer: SkyOffer;
};

/**
 * What the chip and its picker say while no sky is picked.
 */
const NO_SKY = 'No sky weather';

/**
 * What every outdoor map makes of the sky, said under the picker.
 */
const WHAT_MAPS_DO = 'Outdoor maps without weather of their own show the sky\'s; those with their own take its strength.';

/**
 * What the picker says of the conditions it greys out.
 */
const GREYED = 'Greyed conditions never come at this time of year.';

/**
 * Words the sky picked, by the plugin's own names for its condition and strength.
 * @param {SkyPick | null} pick The sky picked, or null for none.
 * @returns {string} The words, such as {@code rain · heavy}.
 */
const skyWords = (pick: SkyPick | null): string =>
{
  return pick === null
    ? NO_SKY
    : `${pick.condition} · ${pick.strength}`;
};

/**
 * Picks a condition, at the strength it takes from the one picked before, or its usual strength when none was.
 * @param {SkyCondition} condition The condition.
 * @param {SkyPick | null} before The sky picked before, or null for none.
 * @returns {SkyPick} The new pick.
 */
const pickCondition = (condition: SkyCondition, before: SkyPick | null): SkyPick =>
{
  return { condition: condition.name, strength: condition.strengthFor(before === null ? null : before.strength) };
};

/**
 * The window's sky in a map view's bar, beside the clock: a chip naming the condition and the strength picked, by the
 * plugin's own names, or that none is, which opens a picker of the sky's conditions and strengths. A new game's sky is
 * random, so none is picked until the author picks one. A condition the sky is never in at the clock's moment is greyed
 * out, as is a strength the condition picked is never at; picking a condition keeps the strength picked before, pulled to
 * the nearest one the condition is at. Beneath them, the picker says what the sky shows at the clock's hour and season,
 * as a clear night shows starfall, and a button picks no sky again. Picking moves the window's clock, so every map in
 * the window shows the same sky. The project's sky is read only once the picker opens, or a sky is picked.
 * @param {SkyChipProps} props The clock and the sky.
 * @returns {React.JSX.Element} The chip, with its picker while it is open.
 */
const SkyChip = (props: SkyChipProps) =>
{
  const { clock, offer } = props;
  const pick = useSyncExternalStore(clock.subscribe, clock.sky);
  const minutes = useSyncExternalStore(clock.subscribe, clock.time);
  const season = useSyncExternalStore(clock.subscribe, clock.season);

  // the picker lists the conditions once the project's sky arrives, and again whenever it is read afresh.
  useSyncExternalStore(offer.config.subscribe, offer.config.current);
  const [ anchor, setAnchor ] = useState<HTMLElement | null>(null);
  const listing = anchor === null ? null : offer.conditionsAt(minutes, season);
  const conditions = listing === null ? [] : listing.conditions;
  const picked = pick === null
    ? undefined
    : conditions.find(condition => condition.name === pick.condition);
  const reading = offer.readingAt(pick, minutes, season);

  /**
   * Opens the picker, asking for the project's sky to list its conditions.
   * @param {HTMLElement} target The chip.
   */
  const open = (target: HTMLElement) =>
  {
    offer.config.request();
    setAnchor(target);
  };

  return (
    <>
      <Chip
        color={pick === null ? 'default' : 'primary'}
        data-testid={'map-sky'}
        icon={<Cloud/>}
        label={skyWords(pick)}
        onClick={event => open(event.currentTarget)}
        size={'small'}
        title={'The weather in the sky over every map'}
        variant={pick === null ? 'outlined' : 'filled'}
      />
      <Popover
        anchorEl={anchor}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        onClose={() => setAnchor(null)}
        open={anchor !== null}
      >
        <Box sx={{ width: 340, px: 2.5, pt: 1.5, pb: 1 }}>
          <Typography variant={'subtitle2'}>
            {skyWords(pick)}
          </Typography>
          {listing !== null && listing.problem !== null && (
            <Typography variant={'caption'} component={'p'} color={'text.secondary'} sx={{ mt: 1 }}>
              {listing.problem}
            </Typography>
          )}
          {conditions.length > 0 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant={'caption'} color={'text.secondary'}>
                Condition
              </Typography>
              <Box role={'group'} aria-label={'Condition'} sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, mt: 0.25 }}>
                {conditions.map(condition => (
                  <ToggleButton
                    disabled={condition.possible === false}
                    key={condition.name}
                    onChange={() => clock.chooseSky(pickCondition(condition, pick))}
                    selected={pick !== null && pick.condition === condition.name}
                    size={'small'}
                    sx={{ textTransform: 'none', py: 0.25 }}
                    value={condition.name}
                  >
                    {condition.name}
                  </ToggleButton>
                ))}
              </Box>
              {conditions.some(condition => condition.possible === false) && (
                <Typography variant={'caption'} component={'p'} color={'text.secondary'}>
                  {GREYED}
                </Typography>
              )}
              <Typography variant={'caption'} color={'text.secondary'}>
                Strength
              </Typography>
              <ToggleButtonGroup
                aria-label={'Strength'}
                exclusive
                fullWidth
                onChange={(_event, value: string | null) =>
                {
                  // the strength already picked, clicked again, stays picked.
                  if (pick !== null && value !== null)
                  {
                    clock.chooseSky({ condition: pick.condition, strength: value });
                  }
                }}
                size={'small'}
                sx={{ mt: 0.25 }}
                value={pick === null ? null : pick.strength}
              >
                {offer.strengths.map(strength => (
                  <ToggleButton
                    disabled={picked === undefined || picked.strengths.includes(strength) === false}
                    key={strength}
                    sx={{ textTransform: 'none', py: 0.25 }}
                    value={strength}
                  >
                    {strength}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
          )}
          {(listing === null || listing.problem !== reading.words) && (
            <Typography data-testid={'map-sky-reading'} variant={'caption'} component={'p'} sx={{ mt: 1 }}>
              {reading.words}
            </Typography>
          )}
          <Typography variant={'caption'} component={'p'} color={'text.secondary'}>
            {WHAT_MAPS_DO}
          </Typography>
          {pick !== null && (
            <Button onClick={() => clock.chooseSky(null)} size={'small'} sx={{ mt: 0.5, textTransform: 'none' }}>
              {NO_SKY}
            </Button>
          )}
        </Box>
      </Popover>
    </>
  );
};

export { NO_SKY, pickCondition, SkyChip, skyWords };
