import React, { useMemo } from 'react';
import { QuickPanelHost } from '../../views/quickPanel/QuickPanelHost.tsx';
import { useHeldMap, useWorkspaceState } from '../workspaceHooks.tsx';

/**
 * The events the quick settings show, on the map in focus: the event picked out on it, such as the one the data
 * editor asked to see, which is the selection the workspace holds for a map.
 * @param {number | null} mapId The map in focus, or null.
 * @returns {readonly number[]} The events; none when nothing is picked.
 */
const usePickedEvents = (mapId: number | null): readonly number[] =>
{
  const picked = useWorkspaceState(state => (mapId === null ? null : state.eventFocus[mapId] ?? null));
  return useMemo(() => (picked === null ? [] : [ picked ]), [ picked ]);
};

/**
 * The quick settings: the selected events of the map in focus, each shown with its kind's quick panel, changed live
 * on the map as one undoable step per change.
 * @returns {React.JSX.Element} The panel.
 */
const QuickSettingsPanel = () =>
{
  const mapId = useWorkspaceState(state => state.currentMapId);
  const held = useHeldMap(mapId);
  const eventIds = usePickedEvents(mapId);
  return <QuickPanelHost document={held.map} eventIds={eventIds}/>;
};

export { QuickSettingsPanel };
