import React from 'react';
import { Box, Divider } from '@mui/material';
import { LayerStrip } from './LayerStrip.tsx';
import { StackView } from './StackView.tsx';

/**
 * The layers panel: the layer strip on top (automatic layering, or one layer painted exactly), and beneath it the
 * stack view of the cell under the pointer on any map.
 * @returns {React.JSX.Element} The panel.
 */
const LayersPanel = () =>
{
  return (
    <Box sx={{ height: '100%', overflowY: 'auto', bgcolor: 'background.default' }} data-testid={'layers'}>
      <LayerStrip/>
      <Divider/>
      <StackView/>
    </Box>
  );
};

export { LayersPanel };
