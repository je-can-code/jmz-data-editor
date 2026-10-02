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
 * Holds the centre of the workspace, where maps open, and never leaves it: it waits behind the maps while any are open
 * there, and shows, saying how to open one, whenever none is.
 * @returns {React.JSX.Element} The panel.
 */
const StartPanel = () => <Placeholder line={'Double-click a map in the tree, or drag it here, to open it.'}/>;

export { StartPanel };
