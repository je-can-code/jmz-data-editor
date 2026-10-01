import React from 'react';
import { QuickPanelHost } from '../../views/quickPanel/QuickPanelHost.tsx';
import { useEventSelection, useHeldMap } from '../workspaceHooks.tsx';

/**
 * The quick settings: the events selected in this window, on whichever map they were picked, each shown with its
 * kind's quick panel, changed live on the map as one undoable step per change. It reads the very selection the map
 * views draw, so the panel always shows what the map highlights; an event the data editor asks to see is picked out
 * by its map, which selects it, and only then shows here.
 * @returns {React.JSX.Element} The panel.
 */
const QuickSettingsPanel = () =>
{
  const { mapId, eventIds } = useEventSelection();
  const held = useHeldMap(mapId);
  return <QuickPanelHost document={held.map} eventIds={eventIds}/>;
};

export { QuickSettingsPanel };
