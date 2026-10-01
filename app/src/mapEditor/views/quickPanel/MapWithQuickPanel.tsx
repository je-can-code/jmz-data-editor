import React, { useState, useSyncExternalStore } from 'react';
import { Box } from '@mui/material';
import { EventSelection } from '../../core/events/EventSelection.ts';
import { mapDocumentKey } from '../../core/model/documentKeys.ts';
import { MapView } from '../../render/MapView.tsx';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { useHubVersion } from '../../workspace/workspaceHooks.tsx';
import { QuickPanelHost } from './QuickPanelHost.tsx';

/**
 * What the page shows: the map, and the selection the map and its quick panel share.
 */
type MapWithQuickPanelProps = {
  /**
   * The map to show.
   */
  readonly mapId: number;

  /**
   * The selection the map and the panel share. Left out, they share one of their own.
   */
  readonly selection?: EventSelection;
};

/**
 * How wide the quick panel stands beside the map, in pixels.
 */
const QUICK_PANEL_WIDTH = 360;

/**
 * Reports whether the map page asks for the quick panel beside its map, with {@code &quick=1}.
 * @param {string} search The page's query string.
 * @returns {boolean} True when it asks.
 */
const wantsQuickPanel = (search: string): boolean =>
{
  return new URLSearchParams(search).get('quick') === '1';
};

/**
 * One map with its quick settings beside it, the two sharing one selection as they do in the workspace: what the map
 * page shows for {@code ?map=361&quick=1}. The speed script selects and drags events here, so every render the quick
 * panel makes for a new selection or an edit to the map lands in the same frames the map draws in, and counts against
 * the same budget.
 * @param {MapWithQuickPanelProps} props The map, and the selection to share.
 * @returns {React.JSX.Element} The map and its panel.
 */
const MapWithQuickPanel = (props: MapWithQuickPanelProps) =>
{
  const { mapId } = props;
  const { hub } = useMapEditorServices();
  const [ ownSelection ] = useState(() => new EventSelection());
  const selection = props.selection ?? ownSelection;
  const selected = useSyncExternalStore(selection.subscribe, selection.get);

  // the map joins the window's documents once the view has opened it, which the hub announces.
  useHubVersion(hub);
  const key = mapDocumentKey(mapId);
  const document = selected.mapId === mapId && hub.has(key) ? hub.map(key) : null;

  return (
    <Box sx={{ height: '100%', display: 'flex', minHeight: 0 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <MapView mapId={mapId} selection={selection}/>
      </Box>
      <Box data-testid={'map-quick-panel'} sx={{ width: QUICK_PANEL_WIDTH, flexShrink: 0, borderLeft: 1, borderColor: 'divider', overflow: 'auto' }}>
        <QuickPanelHost document={document} eventIds={document === null ? [] : selected.eventIds}/>
      </Box>
    </Box>
  );
};

export { MapWithQuickPanel, wantsQuickPanel };
export type { MapWithQuickPanelProps };
