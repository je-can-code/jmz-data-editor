import React, { useEffect } from 'react';
import { Box, Button, Chip, CircularProgress, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import Palette from '@mui/icons-material/Palette';
import PaletteOutlined from '@mui/icons-material/PaletteOutlined';
import type { IDockviewPanelProps } from 'dockview-react';
import { mapDocumentKey, TILESETS_KEY } from '../../core/model/documentKeys.ts';
import type { RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { WindowPaint } from '../../core/tools/WindowPaint.ts';
import type { MapPanelParams } from '../../core/workspace/panels.ts';
import { documentLabel } from '../../views/documentLabels.ts';
import { usePanelVisible, usePanelWindow } from '../windowScope.tsx';
import { useHeldMap, useWorkspace, useWorkspaceState, type HeldMap } from '../workspaceHooks.tsx';
import { LayerStrip } from './layers/LayerStrip.tsx';
import { MapSurface } from './MapSurface.tsx';
import { PaintScope } from './palette/paintScope.tsx';
import { MapPalette } from './palette/PalettePanel.tsx';

/**
 * How wide a torn-out map's own palette stands beside it, in pixels: room for the palette's eight columns of tiles, as
 * wide as the workspace's own palette starts.
 */
const PALETTE_DOCK_WIDTH = 300;

/**
 * What the toggle for a torn-out map's own palette says, by whether the palette shows.
 */
const PALETTE_TOGGLE_LABELS = { shown: 'Hide the tiles', hidden: 'Show the tiles' } as const;

/**
 * The toggle for a torn-out map's own palette: whether it shows, and how to switch it.
 */
type PaletteToggle = {
  readonly shown: boolean;
  readonly onToggle: () => void;
};

/**
 * The strip across the top of a map panel: the map's name and size, its tileset, and what is going on with it, and, in
 * a torn-out window, the toggle for the map's own palette.
 * @param {{ mapId: number, held: HeldMap, focusEventId: number | null, palette: PaletteToggle | null }} props The map,
 * what is known about it, the event picked out, and the palette's toggle, or null in the main window.
 * @returns {React.JSX.Element} The strip.
 */
const MapStatus = (props: { mapId: number; held: HeldMap; focusEventId: number | null; palette: PaletteToggle | null }) =>
{
  const { mapId, held, focusEventId, palette } = props;
  const { hub } = useWorkspace().services;
  const { row, map, dirty } = held;
  const tileset = map !== null && hub.has(TILESETS_KEY)
    ? (hub.document(TILESETS_KEY).valueAt([ map.tilesetId ]) as RmmzTileset | null | undefined) ?? null
    : null;
  const size = map === null
    ? ''
    : `${map.width} by ${map.height}${tileset === null ? '' : ` · ${tileset.name}`}`;
  const toggleLabel = palette === null ? '' : PALETTE_TOGGLE_LABELS[palette.shown ? 'shown' : 'hidden'];

  return (
    <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.5, minHeight: 32, borderBottom: 1, borderColor: 'divider' }}>
      {palette !== null && (
        <Tooltip title={toggleLabel}>
          <IconButton size={'small'} aria-label={toggleLabel} aria-pressed={palette.shown} onClick={palette.onToggle} sx={{ p: 0.25 }}>
            {palette.shown ? <Palette sx={{ fontSize: 18 }} color={'primary'}/> : <PaletteOutlined sx={{ fontSize: 18 }}/>}
          </IconButton>
        </Tooltip>
      )}
      <Typography variant={'body2'} noWrap sx={{ fontWeight: 600 }}>
        {row?.name ?? documentLabel(mapDocumentKey(mapId))}
      </Typography>
      <Typography variant={'caption'} color={'text.secondary'} noWrap>
        {size}
      </Typography>
      {dirty && <Chip size={'small'} label={'Unsaved'} color={'warning'} variant={'outlined'}/>}
      {focusEventId !== null && <Chip size={'small'} label={`Event ${focusEventId} picked`} color={'secondary'} variant={'outlined'}/>}
    </Stack>
  );
};

/**
 * What fills a map panel when there is no map to draw: a spinner while it opens, or why there is none.
 * @param {{ held: HeldMap, onClose: () => void }} props What is known, and how to close the panel.
 * @returns {React.JSX.Element} The message.
 */
const MapAbsent = (props: { held: HeldMap; onClose: () => void }) =>
{
  const { held, onClose } = props;
  if (held.row !== null && held.failure === null)
  {
    return (
      <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={28}/>
      </Box>
    );
  }

  return (
    <Stack spacing={1} alignItems={'center'} justifyContent={'center'} sx={{ position: 'absolute', inset: 0, p: 2, color: 'text.secondary' }}>
      <Typography variant={'body1'}>
        {held.failure === null ? 'This map was deleted.' : 'This map could not be opened.'}
      </Typography>
      <Typography variant={'body2'} align={'center'}>
        {held.failure ?? 'Undo in the map tree brings it back here.'}
      </Typography>
      <Button size={'small'} onClick={onClose}>
        Close
      </Button>
    </Stack>
  );
};

/**
 * A torn-out map's own palette and layer strip, docked beside it, picking for the map's window alone: its own brush,
 * its own layer, its own tool in hand, so painting there needs nothing from the main window.
 * @param {{ mapId: number, paint: WindowPaint }} props The map whose tiles to show, and its window's paint.
 * @returns {React.JSX.Element} The palette and the strip.
 */
const MapPaletteDock = (props: { readonly mapId: number; readonly paint: WindowPaint }) =>
{
  const { mapId, paint } = props;
  return (
    <PaintScope paint={paint}>
      <Box
        data-testid={'map-palette-dock'}
        sx={{ width: PALETTE_DOCK_WIDTH, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: 1, borderColor: 'divider' }}
      >
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <MapPalette mapId={mapId}/>
        </Box>
        <Divider/>
        <LayerStrip/>
      </Box>
    </PaintScope>
  );
};

/**
 * One view of one map. It holds the map for as long as the tree lists it and draws it through the renderer's
 * surface; its tab reads the map's name, marked while the map has unsaved edits. Deleting the map from the tree
 * leaves the panel saying so, and undoing the delete brings the map back into it. Any number of map panels can be
 * open, side by side, stacked, or torn out into their own windows, and every one shows the same live map; only the
 * ones on screen hold a GPU context to draw with.
 *
 * Each window paints on its own. Docked in the main window, the map paints with what the workspace's palette and layer
 * strip pick. Torn out, it carries its own palette and layer strip beside it, picking for its window alone, so painting
 * there needs nothing from the main window; a toggle on the panel's strip hides that palette, and the layout remembers.
 * @param {IDockviewPanelProps<MapPanelParams>} props The dock's panel props; the params name the map.
 * @returns {React.JSX.Element} The panel.
 */
const MapPanel = (props: IDockviewPanelProps<MapPanelParams>) =>
{
  const { api, params } = props;
  const { mapId } = params;
  const controller = useWorkspace();
  const { paints } = controller.services;
  const held = useHeldMap(mapId);
  const focus = useWorkspaceState(state => state.eventFocus[mapId] ?? null);
  const focusEventId = focus === null ? null : focus.eventId;
  const visible = usePanelVisible(api);

  // the panel's window decides what it paints with: the page's own paint in the main window, its own anywhere else.
  const paint = paints.forWindow(usePanelWindow());
  const ownWindow = paint !== paints.main;
  const paletteShown = params.paletteHidden !== true;
  const palette = ownWindow
    ? { shown: paletteShown, onToggle: () => api.updateParameters({ paletteHidden: paletteShown ? true : undefined }) }
    : null;

  // the tab reads the map's name, marked while it has unsaved edits.
  const title = held.row === null
    ? `${documentLabel(mapDocumentKey(mapId))} (deleted)`
    : `${held.row.name}${held.dirty ? ' *' : ''}`;
  useEffect(() =>
  {
    if (api.title !== title)
    {
      api.setTitle(title);
    }
  }, [ api, title ]);

  return (
    <Box sx={{ height: '100%', display: 'flex', bgcolor: 'background.default' }}>
      {ownWindow && paletteShown && <MapPaletteDock mapId={mapId} paint={paint}/>}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <MapStatus mapId={mapId} held={held} focusEventId={focusEventId} palette={palette}/>
        <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {held.map === null
            ? <MapAbsent held={held} onClose={() => api.close()}/>
            : (
              <MapSurface
                document={held.map}
                focusEventId={focusEventId}
                focusRequest={focus === null ? 0 : focus.request}
                visible={visible}
                selection={controller.selection}
                paint={paint}
                onNotice={(text, severity) => controller.notify(text, severity)}
              />
            )}
        </Box>
      </Box>
    </Box>
  );
};

export { MapPanel, PALETTE_TOGGLE_LABELS };
