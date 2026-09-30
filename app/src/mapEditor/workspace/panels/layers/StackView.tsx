import React, { useEffect } from 'react';
import { Box, Chip, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward, Brush, Close, PushPin, PushPinOutlined } from '@mui/icons-material';
import { mapHistoryKey } from '../../../core/history/historyKeys.ts';
import { mapDocumentKey, parseDocumentKey } from '../../../core/model/documentKeys.ts';
import type { MapDocument } from '../../../core/model/MapDocument.ts';
import type { RmmzTileset } from '../../../core/model/rmmzTypes.ts';
import { cellInspector, type InspectedCell } from '../../../core/palette/cellInspector.ts';
import {
  applyCellFix,
  eventTilesAt,
  planClearLayer,
  planMoveLayer,
  planPutOnLayer,
  readCellStack,
  type CellFix,
  type StackLayer,
} from '../../../core/palette/cellStack.ts';
import { describeTile } from '../../../core/palette/paletteLayout.ts';
import { cellFlagsSummary, layerChips, passageSummary, shadowSummary } from '../../../core/palette/stackWords.ts';
import type { TextureImage } from '../../../core/renderer/MapRenderer.ts';
import type { TilesetMarks } from '../../../core/tiles/tilesetMarks.ts';
import { regionHue } from '../../../render/scene/overlayAtlases.ts';
import { useDocumentRevision, useTilesets, useWorkspace } from '../../workspaceHooks.tsx';
import { useInspectedCell, usePaintSelection, useTilesetMarks, useTilesetSheets } from '../palette/paletteHooks.ts';
import { TileThumb } from '../palette/TileThumb.tsx';

/**
 * The size the stack view draws each layer's tile at, in CSS pixels.
 */
const THUMB_SIZE = 32;

/**
 * One layer of the cell: its tile, what its flags come to, and the fixes: move it up or down a layer, put the tile
 * picked on the palette there, or clear it.
 * @param {object} props The layer, its pictures and marks, the tile picked (null when none fits), and what to do.
 * @returns {React.JSX.Element} The row.
 */
const LayerRow = (props: {
  readonly layer: StackLayer;
  readonly sheets: readonly (TextureImage | null)[] | null;
  readonly marks: TilesetMarks | null;
  readonly pickedTile: number | null;
  readonly onMove: (direction: 'up' | 'down') => void;
  readonly onPut: () => void;
  readonly onClear: () => void;
}) =>
{
  const { layer, sheets, marks, pickedTile, onMove, onPut, onClear } = props;
  const faded = layer.passage === 'unread' && layer.tileId !== 0;
  const name = describeTile(layer.tileId);
  const fixes = [
    { tip: 'Move up a layer', label: `Move layer ${layer.z + 1} up`, icon: ArrowUpward, disabled: layer.z === 3, act: () => onMove('up') },
    { tip: 'Move down a layer', label: `Move layer ${layer.z + 1} down`, icon: ArrowDownward, disabled: layer.z === 0, act: () => onMove('down') },
    {
      tip: pickedTile === null ? 'Pick one tile on the palette to put it here' : `Put ${describeTile(pickedTile)} on this layer`,
      label: `Put the picked tile on layer ${layer.z + 1}`,
      icon: Brush,
      disabled: pickedTile === null,
      act: onPut,
    },
    { tip: 'Clear this layer', label: `Clear layer ${layer.z + 1}`, icon: Close, disabled: layer.tileId === 0, act: onClear },
  ];

  return (
    <Stack direction={'row'} spacing={0.75} alignItems={'center'} sx={{ px: 1, py: 0.5 }} data-testid={`stack-layer-${layer.z + 1}`}>
      <Typography variant={'caption'} color={'text.secondary'} sx={{ width: 10, textAlign: 'right', flex: 'none' }}>
        {layer.z + 1}
      </Typography>
      <TileThumb sheets={sheets} tileId={layer.tileId} size={THUMB_SIZE}/>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant={'body2'} noWrap title={name} color={layer.tileId === 0 || faded ? 'text.secondary' : 'text.primary'}>
          {name}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
          {layerChips(layer, marks).map(chip => (
            <Chip
              key={chip.label}
              size={'small'}
              label={chip.label}
              color={chip.strong ? 'primary' : 'default'}
              variant={chip.strong ? 'filled' : 'outlined'}
              sx={{ height: 18, fontSize: 11 }}
            />
          ))}
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flex: 'none' }}>
        {fixes.map(({ tip, label, icon: Icon, disabled, act }) => (
          <Tooltip key={label} title={tip}>
            <span>
              <IconButton size={'small'} aria-label={label} disabled={disabled} onClick={act} sx={{ p: 0.25 }}>
                <Icon sx={{ fontSize: 15 }}/>
              </IconButton>
            </span>
          </Tooltip>
        ))}
      </Box>
    </Stack>
  );
};

/**
 * The shadow's four quarters, drawn as a tiny square: shaded quarters dark.
 * @param {{ shadow: number }} props The shadow bits.
 * @returns {React.JSX.Element} The square.
 */
const ShadowQuarters = (props: { readonly shadow: number }) =>
{
  return (
    <Box sx={{ width: 16, height: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', border: 1, borderColor: 'divider', flex: 'none' }}>
      {[ 0, 1, 2, 3 ].map(quarter => (
        <Box key={quarter} sx={{ bgcolor: (props.shadow & (1 << quarter)) !== 0 ? 'rgba(0, 0, 0, 0.75)' : 'transparent' }}/>
      ))}
    </Box>
  );
};

/**
 * Everything stacked on one cell of a held map, read as the engine reads it, with the fixes for each layer.
 * @param {{ map: MapDocument, tileset: RmmzTileset, cell: InspectedCell, held: boolean }} props The map, its tileset,
 * the cell, and whether it is held.
 * @returns {React.JSX.Element} The stack.
 */
const CellStackCard = (props: { readonly map: MapDocument; readonly tileset: RmmzTileset; readonly cell: InspectedCell; readonly held: boolean }) =>
{
  const { map, tileset, cell, held } = props;
  const controller = useWorkspace();
  const { hub } = controller.services;
  const sheets = useTilesetSheets(tileset);
  const { marks } = useTilesetMarks(tileset.id);
  const { brush } = usePaintSelection();
  useDocumentRevision(map);

  const stack = readCellStack({ width: map.width, height: map.height, cells: map.cells, flags: tileset.flags }, cell.x, cell.y, eventTilesAt(map.events, cell.x, cell.y));
  const pickedTile = brush.kind === 'tiles' && brush.width === 1 && brush.height === 1 && brush.tilesetId === tileset.id
    ? brush.cells[0]
    : null;

  /**
   * Makes a fix as one step in the map's history, and hands undo to that history.
   * @param {CellFix} fix The fix.
   */
  const apply = (fix: CellFix) =>
  {
    try
    {
      if (applyCellFix(hub, map.mapId, fix) !== null)
      {
        controller.focusHistory(mapHistoryKey(map.mapId));
      }
    }
    catch (error)
    {
      controller.notify(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const grid = { width: map.width, height: map.height, cells: map.cells };
  const flagsLine = cellFlagsSummary(stack);
  return (
    <Box data-testid={'stack-view'}>
      <Stack direction={'row'} alignItems={'center'} spacing={1} sx={{ px: 1, pt: 1 }}>
        <Typography variant={'subtitle2'} noWrap sx={{ flex: 1 }}>
          {`${controller.mapName(map.mapId)} · ${cell.x}, ${cell.y}`}
        </Typography>
        <Tooltip title={held ? 'Follow the pointer again' : 'Hold this cell here'}>
          <IconButton size={'small'} aria-label={held ? 'Follow the pointer again' : 'Hold this cell here'} onClick={() => cellInspector.setHeld(held === false)}>
            {held ? <PushPin sx={{ fontSize: 18 }}/> : <PushPinOutlined sx={{ fontSize: 18 }}/>}
          </IconButton>
        </Tooltip>
      </Stack>
      {stack.layers.map(layer => (
        <LayerRow
          key={layer.z}
          layer={layer}
          sheets={sheets}
          marks={marks}
          pickedTile={pickedTile}
          onMove={direction => apply(planMoveLayer(grid, cell.x, cell.y, layer.z, direction))}
          onPut={() => apply(planPutOnLayer(grid, cell.x, cell.y, layer.z, pickedTile as number, tileset.mode))}
          onClear={() => apply(planClearLayer(grid, cell.x, cell.y, layer.z, tileset.mode))}
        />
      ))}
      {stack.eventTiles.map(eventTile => (
        <Stack key={eventTile.eventId} direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.5 }}>
          <Typography variant={'caption'} color={'text.secondary'} sx={{ width: 12 }}/>
          <TileThumb sheets={sheets} tileId={eventTile.tileId} size={THUMB_SIZE}/>
          <Typography variant={'body2'} sx={{ flex: 1 }} noWrap>
            {`Event ${eventTile.eventId}: ${describeTile(eventTile.tileId)}`}
          </Typography>
          {eventTile.passage === 'decides' && <Chip size={'small'} label={'Decides passage'} color={'primary'} sx={{ height: 18, fontSize: 11 }}/>}
        </Stack>
      ))}
      <Divider sx={{ my: 0.5 }}/>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.25 }}>
        <ShadowQuarters shadow={stack.shadow}/>
        <Typography variant={'body2'} color={'text.secondary'}>
          {shadowSummary(stack.shadow)}
        </Typography>
      </Stack>
      <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.25 }}>
        <Box sx={{ width: 16, height: 16, flex: 'none', border: 1, borderColor: 'divider', bgcolor: stack.region === 0 ? 'transparent' : `hsl(${regionHue(stack.region)}, 85%, 45%)` }}/>
        <Typography variant={'body2'} color={'text.secondary'}>
          {stack.region === 0 ? 'No region' : `Region ${stack.region}`}
        </Typography>
      </Stack>
      <Box sx={{ px: 1, py: 0.5 }}>
        <Typography variant={'body2'}>
          {passageSummary(stack.blocked)}
        </Typography>
        {flagsLine !== '' && (
          <Typography variant={'body2'} color={'text.secondary'}>
            {flagsLine}
          </Typography>
        )}
        {held === false && (
          <Typography variant={'caption'} color={'text.secondary'} sx={{ display: 'block', mt: 0.5 }}>
            Middle-click a cell on the map to hold it here.
          </Typography>
        )}
      </Box>
    </Box>
  );
};

/**
 * The stack view: whatever the pointer is over on any map, or the cell held with a middle click, layer by layer from
 * the top, with which tile decides passage and what the cell counts as, and the fixes for each layer.
 * @returns {React.JSX.Element} The view.
 */
const StackView = () =>
{
  const controller = useWorkspace();
  const { hub } = controller.services;
  const { cell, held } = useInspectedCell();
  const tilesets = useTilesets();

  // a map the window lets go of takes its cell with it.
  useEffect(() => hub.subscribe(event =>
  {
    if (event.type === 'released')
    {
      const parsed = parseDocumentKey(event.document);
      if (parsed.kind === 'map')
      {
        cellInspector.forgetMap(parsed.mapId);
      }
    }
  }), [ hub ]);

  const key = cell === null ? null : mapDocumentKey(cell.mapId);
  const map = key !== null && hub.has(key) ? hub.map(key) : null;
  const tileset = map === null ? null : tilesets[map.tilesetId] ?? null;
  const onMap = cell !== null && map !== null && cell.x < map.width && cell.y < map.height;
  if (cell === null || map === null || tileset === null || onMap === false)
  {
    return (
      <Box sx={{ p: 2, color: 'text.secondary' }}>
        <Typography variant={'body2'}>
          Point at a map to see everything stacked on a cell. Middle-click a cell to hold it here.
        </Typography>
      </Box>
    );
  }

  return <CellStackCard map={map} tileset={tileset} cell={cell} held={held}/>;
};

export { StackView };
