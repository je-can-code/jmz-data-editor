import React, { useSyncExternalStore } from 'react';
import { Box, Divider, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import Approval from '@mui/icons-material/Approval';
import Colorize from '@mui/icons-material/Colorize';
import Create from '@mui/icons-material/Create';
import CropSquare from '@mui/icons-material/CropSquare';
import FindReplace from '@mui/icons-material/FindReplace';
import FormatColorFill from '@mui/icons-material/FormatColorFill';
import HighlightAlt from '@mui/icons-material/HighlightAlt';
import LayersClear from '@mui/icons-material/LayersClear';
import NearMe from '@mui/icons-material/NearMe';
import PanoramaFishEye from '@mui/icons-material/PanoramaFishEye';
import { stampCaption } from '../../core/stamps/stamp.ts';
import { describeBrush } from '../../core/tools/brush.ts';
import type { PaintSettings, PaintState, PaintTool } from '../../core/tools/PaintState.ts';

/**
 * One tool's button: the tool, what its tooltip says, and its picture.
 */
type ToolButton = {
  readonly tool: PaintTool;
  readonly title: string;
  readonly icon: React.ReactNode;
};

/**
 * The tools' buttons, in order.
 */
const TOOL_BUTTONS: readonly ToolButton[] = [
  { tool: 'events', title: 'Events: select, move and open the events on the map', icon: <NearMe fontSize={'small'}/> },
  { tool: 'pen', title: 'Pen: paints as you drag', icon: <Create fontSize={'small'}/> },
  { tool: 'rectangle', title: 'Rectangle: drag out a filled rectangle', icon: <CropSquare fontSize={'small'}/> },
  { tool: 'ellipse', title: 'Ellipse: drag out a filled ellipse', icon: <PanoramaFishEye fontSize={'small'}/> },
  { tool: 'fill', title: 'Fill: paints the whole area you click', icon: <FormatColorFill fontSize={'small'}/> },
  { tool: 'eraser', title: 'Eraser: clears layers 3 and 4 as you drag, or just the layer picked', icon: <LayersClear fontSize={'small'}/> },
  { tool: 'eyedropper', title: 'Eyedropper: picks tiles off the map; drag to pick several', icon: <Colorize fontSize={'small'}/> },
  { tool: 'select', title: 'Select: drag to select, then drag the selection to move it, or hold Ctrl to copy it', icon: <HighlightAlt fontSize={'small'}/> },
  { tool: 'swap', title: 'Swap: replaces the tile you click everywhere on the map', icon: <FindReplace fontSize={'small'}/> },
  { tool: 'stamp', title: 'Stamp: places the stamp picked in the Stamps panel with each click', icon: <Approval fontSize={'small'}/> },
];

/**
 * Reads the window's painting settings, re-rendering whenever they change.
 * @param {PaintState} painting The settings' store.
 * @returns {PaintSettings} The settings.
 */
const usePaintSettings = (painting: PaintState): PaintSettings =>
{
  return useSyncExternalStore(listener => painting.subscribe(() => listener()), () => painting.settings);
};

/**
 * Words what the tools hold, beside them: the stamp while the stamp is in hand, and the brush otherwise.
 * @param {PaintSettings} settings The window's painting settings.
 * @returns {string} The words.
 */
const inHandWords = (settings: PaintSettings): string =>
{
  return settings.tool === 'stamp' && settings.stamp !== null
    ? `Stamp: ${stampCaption(settings.stamp)}`
    : describeBrush(settings.brush);
};

/**
 * Words the keys that change what the tool in hand does: with the stamp, Shift and Esc; with anything else, Shift and
 * the space bar.
 * @param {PaintSettings} settings The window's painting settings.
 * @returns {string} The words.
 */
const keyHints = (settings: PaintSettings): string =>
{
  return settings.tool === 'stamp'
    ? 'Shift: exact tiles · Esc: put the stamp down'
    : `Shift: exact tiles · Space: paint layer ${settings.overrideLayer + 1}`;
};

/**
 * The painting tools for a map: one button per tool, the events first and the stamp last, and a readout of what is in
 * hand. Brushes come from the palette (tiles, regions and the shadow pen) and from the eyedropper, the layer from the
 * layer strip, and the stamp from the Stamps panel, the stamp's button waiting until one is picked there. Holding Shift
 * lays tiles exactly as picked, shapes and all, and holding the space bar paints one stroke on the layer named beside
 * the tools.
 * @param {{ painting: PaintState }} props The window's painting settings.
 * @returns {React.JSX.Element} The tool bar.
 */
const PaintToolBar = (props: { painting: PaintState }) =>
{
  const { painting } = props;
  const settings = usePaintSettings(painting);

  return (
    <Box
      data-testid={'paint-tool-bar'}
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider' }}
    >
      <ToggleButtonGroup
        exclusive
        size={'small'}
        value={settings.tool}
        onChange={(_event, tool: PaintTool | null) =>
        {
          if (tool !== null)
          {
            painting.setTool(tool);
          }
        }}
      >
        {TOOL_BUTTONS.map(({ tool, title, icon }) => (
          <ToggleButton
            key={tool}
            value={tool}
            aria-label={title}
            disabled={tool === 'stamp' && settings.stamp === null}
            sx={{ px: 0.75, py: 0.25 }}
          >
            <Tooltip title={title} describeChild>
              <Box component={'span'} sx={{ display: 'inline-flex' }}>
                {icon}
              </Box>
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Divider flexItem orientation={'vertical'} sx={{ mx: 0.5 }}/>
      <Typography variant={'caption'} color={'text.secondary'} data-testid={'paint-brush'}>
        {inHandWords(settings)}
      </Typography>
      <Typography variant={'caption'} color={'text.disabled'}>
        {keyHints(settings)}
      </Typography>
    </Box>
  );
};

export { PaintToolBar, usePaintSettings };
