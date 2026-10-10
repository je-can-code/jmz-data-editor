import React from 'react';
import { NO_EVENTS } from '../../core/events/EventSelection.ts';
import { QuickPanelHost } from '../../views/quickPanel/QuickPanelHost.tsx';
import { useEventSelection, useHeldMap, useWorkspaceState } from '../workspaceHooks.tsx';

/**
 * The quick settings: the events selected on the map in view, each shown with its kind's quick panel, changed live on
 * the map as one undoable step per change. It follows the map the properties panel and the events list show, so moving
 * to another map's tab leaves behind events picked on the last one, which would otherwise read as if they were on the
 * map now in view; coming back to that map shows them again while they stay selected. Within the map in view it reads
 * the very selection the map views draw, so the panel always shows what the map highlights; an event the data editor
 * asks to see is picked out by its map, which selects it, and only then shows here.
 * @returns {React.JSX.Element} The panel.
 */
const QuickSettingsPanel = () =>
{
  const currentMapId = useWorkspaceState(state => state.currentMapId);
  const selection = useEventSelection();
  const onMapInView = currentMapId !== null && selection.mapId === currentMapId;
  const held = useHeldMap(onMapInView ? currentMapId : null);
  return <QuickPanelHost document={held.map} eventIds={onMapInView ? selection.eventIds : NO_EVENTS}/>;
};

export { QuickSettingsPanel };
