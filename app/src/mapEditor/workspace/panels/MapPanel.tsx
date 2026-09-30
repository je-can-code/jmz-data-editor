import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import type { IDockviewPanelProps } from 'dockview-react';
import { mapDocumentKey, TILESETS_KEY } from '../../core/model/documentKeys.ts';
import type { MapDocument } from '../../core/model/MapDocument.ts';
import type { RmmzMapInfo, RmmzTileset } from '../../core/model/rmmzTypes.ts';
import type { MapPanelParams } from '../../core/workspace/panels.ts';
import { documentLabel } from '../../views/documentLabels.ts';
import { useHubVersion, useMapTreeDocument, useWorkspace, useWorkspaceState } from '../workspaceHooks.tsx';
import { MapSurface } from './MapSurface.tsx';

/**
 * What a map panel knows about its map: its row in the tree, the document once held, whether it has unsaved edits,
 * and why it could not be opened, if it could not.
 */
type HeldMap = {
  readonly row: RmmzMapInfo | null;
  readonly map: MapDocument | null;
  readonly dirty: boolean;
  readonly failure: string | null;
};

/**
 * Holds a map for as long as the tree lists it. A delete lets the document go (the tree service releases it), and
 * an undo lists the map again, which holds it afresh from its restored file.
 * @param {number} mapId The map.
 * @returns {HeldMap} What the panel knows.
 */
const useHeldMap = (mapId: number): HeldMap =>
{
  const controller = useWorkspace();
  const { hub } = controller.services;
  const { tree } = useMapTreeDocument();
  const [ failure, setFailure ] = useState<string | null>(null);
  useHubVersion(hub);

  const key = mapDocumentKey(mapId);
  const found = tree?.valueAt([ mapId ]) as RmmzMapInfo | null | undefined;
  const row = found ?? null;
  const map = row !== null && hub.has(key) ? hub.map(key) : null;

  useEffect(() =>
  {
    if (row === null || map !== null)
    {
      return undefined;
    }

    let live = true;
    setFailure(null);
    controller.services.openDocument(key).catch((error: unknown) =>
    {
      if (live)
      {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });

    return () =>
    {
      live = false;
    };
  }, [ controller, key, row, map ]);

  return { row, map, dirty: map !== null && hub.isDirty(key), failure };
};

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
      <Box sx={{ flex: 1 }}/>
      <Typography variant={'caption'} color={'text.disabled'} noWrap>
        Simplified preview
      </Typography>
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
