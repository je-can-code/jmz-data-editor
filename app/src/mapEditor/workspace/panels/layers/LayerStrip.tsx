import React, { useEffect, useRef } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LAYER_STRIP, paintSelection, WheelStepper } from '../../../core/palette/paintSelection.ts';
import type { LayerChoice } from '../../../core/tiles/layering.ts';
import type { TileLayerIndex } from '../../../core/tiles/tileGrid.ts';
import { usePaintSelection } from '../palette/paletteHooks.ts';

/**
 * Names a layer choice on its button: automatic layering, or the layer as people count them, 1 to 4.
 * @param {LayerChoice} choice The choice.
 * @returns {string} The label.
 */
const layerLabel = (choice: LayerChoice): string =>
{
  return choice === 'auto'
    ? 'Auto'
    : String(choice + 1);
};

/**
 * Reads a button's value back into a layer choice.
 * @param {string} value The value: "auto", or a tile layer 0 to 3.
 * @returns {LayerChoice} The choice.
 */
const choiceOf = (value: string): LayerChoice =>
{
  return value === 'auto'
    ? 'auto'
    : Number.parseInt(value, 10) as TileLayerIndex;
};

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

export { choiceOf, LayerStrip, layerLabel };
