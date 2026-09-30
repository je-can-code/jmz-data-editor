import React from 'react';
import { Box, Typography } from '@mui/material';

/**
 * A panel whose tools are still to come, saying plainly what will live there.
 * @param {{ line: string }} props The line to show.
 * @returns {React.JSX.Element} The panel.
 */
const Placeholder = (props: { line: string }) =>
{
  const { line } = props;
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2, color: 'text.secondary', bgcolor: 'background.default' }}>
      <Typography variant={'body2'} align={'center'}>
        {line}
      </Typography>
    </Box>
  );
};

/**
 * Where the tileset palette goes: the tiles to paint with, sheet by sheet.
 * @returns {React.JSX.Element} The panel.
 */
const PalettePanel = () => <Placeholder line={'The tiles to paint with will appear here.'}/>;

/**
 * Where the layer strip goes: automatic layering, or one layer at a time.
 * @returns {React.JSX.Element} The panel.
 */
const LayersPanel = () => <Placeholder line={'The layers to paint on will appear here.'}/>;

/**
 * Where the quick settings go: a picked event's settings, changed live on the map.
 * @returns {React.JSX.Element} The panel.
 */
const QuickSettingsPanel = () => <Placeholder line={'Pick an event on a map to change its settings here.'}/>;

/**
 * Holds the middle of the workspace until the first map opens there, when it closes itself.
 * @returns {React.JSX.Element} The panel.
 */
const StartPanel = () => <Placeholder line={'Double-click a map in the tree, or drag it here, to open it.'}/>;

export { LayersPanel, PalettePanel, QuickSettingsPanel, StartPanel };
