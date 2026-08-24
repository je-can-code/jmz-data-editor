import { Box, Slider, TextField } from '@mui/material';
import type React from 'react';
import {
  PARAMETER_SLIDER_MAX,
  PARAMETER_SLIDER_STEP,
  parameterFillBounds,
} from '@core/domain/valueObjects/difficulty-parameters.ts';

/**
 * Width of the numeric readout beside a track. Wide enough for four digits and the stepper arrows
 * without the value colliding with them.
 */
const READOUT_WIDTH = 96;

type DifficultyParameterControlProps = {
  value: number;
  onChange: (next: number) => void;
  ariaLabel: string;
  tone: string;
};

/**
 * One parameter value: a magnitude bar that grows away from unchanged, and a number beside it.
 *
 * The bar is drawn from the unchanged mark rather than from zero, which is what makes the length
 * mean "how much this was changed by" instead of "how large this value happens to be". A value that
 * changes nothing therefore draws nothing at all, so a section of untouched parameters reads as a
 * row of quiet empty tracks and the handful that were touched are the only marks on the screen.
 *
 * Colour says which side of the fight the bar belongs to, not whether the change is good. The two
 * sides stack on a shared axis, so which way a bar runs from the unchanged mark already carries
 * direction, and spending colour on that too would leave nothing to tell the tracks apart. Whether
 * more of a parameter helps is not a question this control can answer anyway - raising a damage rate
 * means taking more damage, and raising an enemy's stat is the opposite of raising yours.
 *
 * The number stays because the bar cannot be honest at both ends: authored values run down to 1
 * while the track reaches 1000, so the low end is a few pixels wide no matter how it is drawn. Drag
 * for the shape, type for the value.
 */
const DifficultyParameterControl = ({ value, onChange, ariaLabel, tone }: DifficultyParameterControlProps) =>
{
  const {
    startPercent,
    widthPercent,
  } = parameterFillBounds(value);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
        {/* the resting rail, always drawn, so an untouched parameter still reads as a control. */}
        <Box
          sx={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            bgcolor: 'action.disabledBackground',
          }}
        />

        {/* the unchanged mark: where a bar starts from, and the only fixed landmark on the rail. */}
        <Box
          sx={{
            position: 'absolute',
            left: `${String(parameterFillBounds(100).startPercent)}%`,
            width: '2px',
            height: 10,
            bgcolor: 'text.disabled',
          }}
        />

        {/* the magnitude itself, absent entirely when nothing changed. */}
        {widthPercent > 0
          ? (
            <Box
              sx={{
                position: 'absolute',
                left: `${String(startPercent)}%`,
                width: `${String(widthPercent)}%`,
                height: 4,
                borderRadius: 2,
                bgcolor: `${tone}.main`,
              }}
            />
          )
          : null}

        <Slider
          size={'small'}
          min={0}
          max={PARAMETER_SLIDER_MAX}
          step={PARAMETER_SLIDER_STEP}
          value={value}
          onChange={(_event, next) => onChange(next as number)}
          track={false}
          aria-label={ariaLabel}
          sx={{
            // the rail and fill above are the visual; the slider contributes only its thumb.
            width: '100%',
            padding: '10px 0',
            '& .MuiSlider-rail': { opacity: 0 },
            '& .MuiSlider-thumb': {
              width: 10,
              height: 10,
              color: `${tone}.main`,
            },
          }}
        />
      </Box>

      <TextField
        type={'number'}
        size={'small'}
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        aria-label={`${ariaLabel} value`}
        sx={{
          width: READOUT_WIDTH,
          '& .MuiInputBase-input': {
            fontWeight: widthPercent > 0
              ? 600
              : 400,
            color: widthPercent > 0
              ? 'text.primary'
              : 'text.disabled',
          },
        }}
        slotProps={{
          htmlInput: {
            step: PARAMETER_SLIDER_STEP,
            // a focused number input swallows the wheel to change its own value, so scrolling the
            // page with the pointer over a field silently edits it and then stops scrolling.
            onWheel: (event: React.WheelEvent<HTMLInputElement>) => event.currentTarget.blur(),
          },
        }}
      />
    </Box>
  );
};

export default DifficultyParameterControl;
