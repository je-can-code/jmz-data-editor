import React, { useEffect, useRef } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LAYER_STRIP, WheelStepper } from '../../../core/palette/paintSelection.ts';
import { choiceOf, layerLabel } from '../../../core/palette/paletteWords.ts';
import { usePaintScope } from '../palette/paintScope.tsx';
import { usePaintSelection } from '../palette/paletteHooks.ts';

/**
 * The layer strip: automatic layering, or one of layers 1 to 4 painted exactly, with the other layers dimmed on the
 * maps. The wheel over the strip steps along it, as Shift and the wheel do over a map. It picks for the maps of its
 * paint's window (see usePaintScope).
 * @returns {React.JSX.Element} The strip.
 */
const LayerStrip = () =>
{
  const { selection } = usePaintScope();
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
        selection.stepLayer(step);
      }
    };
    strip.addEventListener('wheel', onWheel, { passive: false });
    return () => strip.removeEventListener('wheel', onWheel);
  }, [ selection ]);

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
            selection.setLayer(choiceOf(value));
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
