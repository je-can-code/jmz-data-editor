import React, { useEffect, useRef } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LAYER_STRIP, paintSelection, WheelStepper } from '../../../core/palette/paintSelection.ts';
import { choiceOf, layerLabel } from '../../../core/palette/paletteWords.ts';
import { usePaintSelection } from '../palette/paletteHooks.ts';

/**
 * The layer strip: automatic layering, or one of layers 1 to 4 painted exactly, with the other layers dimmed on the
 * maps. The wheel over the strip steps along it, as Shift and the wheel do over a map.
 * @returns {React.JSX.Element} The strip.
 */
const LayerStrip = () =>
{
  const { layer } = usePaintSelection();
  const stripRef = useRef<HTMLDivElement | null>(null);

  // the wheel steps the strip instead of scrolling the panel, so it listens where it can stop the scroll.
  useEffect(() =>
  {
    const strip = stripRef.current;
    if (strip === null)
    {
      return undefined;
    }

    const stepper = new WheelStepper();
    const onWheel = (event: WheelEvent) =>
    {
      event.preventDefault();
      const step = stepper.step(event.deltaY, event.deltaX, event.deltaMode);
      if (step !== 0)
      {
        paintSelection.stepLayer(step);
      }
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <Box sx={{ px: 1, pt: 1, pb: 0.5 }} data-testid={'layer-strip'}>
      <ToggleButtonGroup
        ref={stripRef}
        exclusive
        fullWidth
        size={'small'}
        value={String(layer)}
        onChange={(_event, value: string | null) =>
        {
          if (value !== null)
          {
            paintSelection.setLayer(choiceOf(value));
          }
        }}
      >
        {LAYER_STRIP.map(choice => (
          <ToggleButton key={String(choice)} value={String(choice)} sx={{ py: 0.25 }}>
            {layerLabel(choice)}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
        Auto lays each tile where it belongs; 1 to 4 paint only that layer, the rest dimmed. Shift and the wheel over a map
        step through these.
      </Typography>
    </Box>
  );
};

export { LayerStrip };
