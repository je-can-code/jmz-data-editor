import React, { useState, useSyncExternalStore } from 'react';
import { Box, Divider, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import Colorize from '@mui/icons-material/Colorize';
import Create from '@mui/icons-material/Create';
import CropSquare from '@mui/icons-material/CropSquare';
import FindReplace from '@mui/icons-material/FindReplace';
import FormatColorFill from '@mui/icons-material/FormatColorFill';
import HighlightAlt from '@mui/icons-material/HighlightAlt';
import LayersClear from '@mui/icons-material/LayersClear';
import PanoramaFishEye from '@mui/icons-material/PanoramaFishEye';
import Tag from '@mui/icons-material/Tag';
import WbShade from '@mui/icons-material/WbShade';
import type { LayerChoice } from '../../core/tiles/layering.ts';
import { describeBrush, MAX_REGION_ID, regionBrush, SHADOW_BRUSH, singleTileBrush } from '../../core/tools/brush.ts';
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
  { tool: 'pen', title: 'Pen: paints as you drag', icon: <Create fontSize={'small'}/> },
  { tool: 'rectangle', title: 'Rectangle: drag out a filled rectangle', icon: <CropSquare fontSize={'small'}/> },
  { tool: 'ellipse', title: 'Ellipse: drag out a filled ellipse', icon: <PanoramaFishEye fontSize={'small'}/> },
  { tool: 'fill', title: 'Fill: paints the whole area you click', icon: <FormatColorFill fontSize={'small'}/> },
  { tool: 'eraser', title: 'Eraser: clears what you drag over', icon: <LayersClear fontSize={'small'}/> },
  { tool: 'eyedropper', title: 'Eyedropper: picks tiles off the map; drag to pick several', icon: <Colorize fontSize={'small'}/> },
  { tool: 'select', title: 'Select: drag to select, then drag the selection to move it, or hold Ctrl to copy it', icon: <HighlightAlt fontSize={'small'}/> },
  { tool: 'swap', title: 'Swap: replaces the tile you click everywhere on the map', icon: <FindReplace fontSize={'small'}/> },
];

/**
 * The layer choices, as the temporary layer picker offers them.
 */
const LAYER_CHOICES: readonly { readonly choice: LayerChoice; readonly label: string }[] = [
  { choice: 'auto', label: 'Auto' },
  { choice: 0, label: '1' },
  { choice: 1, label: '2' },
  { choice: 2, label: '3' },
  { choice: 3, label: '4' },
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
 * Reads a whole number typed into a field.
 * @param {string} text The text.
 * @returns {number | null} The number, or null when the text is not a whole number.
 */
const wholeNumber = (text: string): number | null =>
{
  return /^\d+$/u.test(text.trim())
    ? Number.parseInt(text.trim(), 10)
    : null;
};

/**
 * A stand-in for the palette and the layer strip while they are built: a tile id or region id typed in becomes the
 * brush, and the layer strip's choice can be picked. The eyedropper is the other way to pick a brush meanwhile.
 * @param {{ painting: PaintState, settings: PaintSettings }} props The settings' store and the settings.
 * @returns {React.JSX.Element} The picker.
 */
const StandInPicker = (props: { painting: PaintState; settings: PaintSettings }) =>
{
  const { painting, settings } = props;
  const [ tileText, setTileText ] = useState('');
  const [ regionText, setRegionText ] = useState('1');
  const tileId = wholeNumber(tileText);
  const regionId = wholeNumber(regionText);

  // a tile id takes the brush when it is one; anything else leaves the brush as it was.
  const takeTile = () =>
  {
    if (tileId !== null && tileId < 8192)
    {
      painting.setBrush(singleTileBrush(tileId));
    }
  };

  return (
    <>
      <TextField
        size={'small'}
        label={'Tile'}
        value={tileText}
        onChange={event => setTileText(event.target.value)}
        onKeyDown={event =>
        {
          if (event.key === 'Enter')
          {
            takeTile();
          }
        }}
        onBlur={takeTile}
        slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Tile to paint with' } }}
        sx={{ width: 84 }}
      />
      <TextField
        size={'small'}
        label={'Region'}
        value={regionText}
        onChange={event => setRegionText(event.target.value)}
        slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': 'Region to paint' } }}
        sx={{ width: 72 }}
      />
      <Tooltip title={'Region pen: paints the region above'}>
        <span>
          <ToggleButton
            value={'region'}
            aria-label={'Region pen'}
            size={'small'}
            selected={settings.tool === 'pen' && settings.brush?.kind === 'regions'}
            disabled={regionId === null || regionId > MAX_REGION_ID}
            onChange={() =>
            {
              painting.setBrush(regionBrush(regionId ?? 0));
              painting.setTool('pen');
            }}
          >
            <Tag fontSize={'small'}/>
          </ToggleButton>
        </span>
      </Tooltip>
      <Tooltip title={'Shadow pen: adds or removes a shadow on each quarter of a tile you drag over'}>
        <ToggleButton
          value={'shadow'}
          aria-label={'Shadow pen'}
          size={'small'}
          selected={settings.tool === 'pen' && settings.brush?.kind === 'shadows'}
          onChange={() =>
          {
            painting.setBrush(SHADOW_BRUSH);
            painting.setTool('pen');
          }}
        >
          <WbShade fontSize={'small'}/>
        </ToggleButton>
      </Tooltip>
      <Divider flexItem orientation={'vertical'} sx={{ mx: 0.5 }}/>
      <Typography variant={'caption'} color={'text.secondary'}>
        Layer
      </Typography>
      <ToggleButtonGroup
        exclusive
        size={'small'}
        value={settings.strip}
        onChange={(_event, choice: LayerChoice | null) =>
        {
          if (choice !== null)
          {
            painting.setStrip(choice);
          }
        }}
      >
        {LAYER_CHOICES.map(({ choice, label }) => (
          <ToggleButton key={label} value={choice} sx={{ px: 1, py: 0.25 }}>
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </>
  );
};

/**
 * The painting tools for a map: one button per tool, a readout of the brush in hand, and while the palette and layer
 * strip are being built a stand-in for picking a brush and a layer. Holding Shift lays tiles exactly as picked, shapes
 * and all, and holding the space bar paints one stroke on the layer named beside the tools.
 * @param {{ painting: PaintState }} props The window's painting settings.
 * @returns {React.JSX.Element} The tool bar.
 */
const PaintToolBar = (props: { painting: PaintState }) =>
{
  const { painting } = props;
  const settings = usePaintSettings(painting);
  const held = settings.overrideLayer + 1;

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
          <ToggleButton key={tool} value={tool} aria-label={title} sx={{ px: 0.75, py: 0.25 }}>
            <Tooltip title={title} describeChild>
              <Box component={'span'} sx={{ display: 'inline-flex' }}>
                {icon}
              </Box>
            </Tooltip>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
      <Divider flexItem orientation={'vertical'} sx={{ mx: 0.5 }}/>
      <StandInPicker painting={painting} settings={settings}/>
      <Divider flexItem orientation={'vertical'} sx={{ mx: 0.5 }}/>
      <Typography variant={'caption'} color={'text.secondary'} data-testid={'paint-brush'}>
        {describeBrush(settings.brush)}
      </Typography>
      <Typography variant={'caption'} color={'text.disabled'}>
        {`Shift: exact tiles · Space: paint layer ${held}`}
      </Typography>
    </Box>
  );
};

export { PaintToolBar, usePaintSettings };
