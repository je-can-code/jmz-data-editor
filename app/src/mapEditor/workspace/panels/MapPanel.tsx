import React, { useEffect } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type { IDockviewPanelProps } from 'dockview-react';
import { mapDocumentKey, TILESETS_KEY } from '../../core/model/documentKeys.ts';
import type { RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { MapPanelParams } from '../../core/workspace/panels.ts';
import { documentLabel } from '../../views/documentLabels.ts';
import { useHeldMap, useWorkspace, useWorkspaceState, type HeldMap } from '../workspaceHooks.tsx';
import { MapSurface } from './MapSurface.tsx';

/**
 * The strip across the top of a map panel: the map's name and size, its tileset, and what is going on with it.
 * @param {{ mapId: number, held: HeldMap, focusEventId: number | null }} props The map and what is known about it.
 * @returns {React.JSX.Element} The strip.
 */
const MapStatus = (props: { mapId: number; held: HeldMap; focusEventId: number | null }) =>
{
  const { mapId, held, focusEventId } = props;
  const { hub } = useWorkspace().services;
  const { row, map, dirty } = held;
  const tileset = map !== null && hub.has(TILESETS_KEY)
    ? (hub.document(TILESETS_KEY).valueAt([ map.tilesetId ]) as RmmzTileset | null | undefined) ?? null
    : null;
  const size = map === null
    ? ''
    : `${map.width} by ${map.height}${tileset === null ? '' : ` · ${tileset.name}`}`;

  return (
    <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ px: 1, py: 0.5, minHeight: 32, borderBottom: 1, borderColor: 'divider' }}>
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
 * One view of one map. It holds the map for as long as the tree lists it and draws it through the renderer's
 * surface; its tab reads the map's name, marked while the map has unsaved edits. Deleting the map from the tree
 * leaves the panel saying so, and undoing the delete brings the map back into it. Any number of map panels can be
 * open, side by side, stacked, or torn out into their own windows, and every one shows the same live map.
 * @param {IDockviewPanelProps<MapPanelParams>} props The dock's panel props; the params name the map.
 * @returns {React.JSX.Element} The panel.
 */
const MapPanel = (props: IDockviewPanelProps<MapPanelParams>) =>
{
  const { api, params } = props;
  const { mapId } = params;
  const held = useHeldMap(mapId);
  const focusEventId = useWorkspaceState(state => state.eventFocus[mapId] ?? null);

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
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <MapStatus mapId={mapId} held={held} focusEventId={focusEventId}/>
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {held.map === null
          ? <MapAbsent held={held} onClose={() => api.close()}/>
          : <MapSurface document={held.map} focusEventId={focusEventId}/>}
      </Box>
    </Box>
  );
};

export { MapPanel };
