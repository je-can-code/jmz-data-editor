import type { DockviewApi, SerializedDockview } from 'dockview-react';
import type { LayoutStore, SavedLayout } from '../core/workspace/LayoutStore.ts';
import { PANEL_COMPONENTS, SINGLE_PANEL_IDS } from '../core/workspace/panels.ts';

/**
 * Where a torn-out panel's window loads: a blank page of this app's origin that dockview fills. Without it dockview
 * would load the app's own page into the popout and boot a second whole editor there.
 */
const POPOUT_URL = '/popout.html';

/**
 * How wide the side columns start, in pixels; the maps take the rest.
 */
const SIDE_WIDTH = 300;
const INSPECTOR_WIDTH = 360;

/**
 * Lays out the workspace the first time, or after a reset: the map tree on the left (with the palette and the layer
 * strip stacked beside it until they arrive), the start panel in the middle where maps open, and the map properties
 * and quick settings on the right above the history.
 * @param {DockviewApi} api The dock.
 */
const addDefaultPanels = (api: DockviewApi): void =>
{
  api.addPanel({ id: SINGLE_PANEL_IDS.mapTree, component: PANEL_COMPONENTS.mapTree, title: 'Maps' });
  api.addPanel({ id: SINGLE_PANEL_IDS.palette, component: PANEL_COMPONENTS.palette, title: 'Tiles', position: { referencePanel: SINGLE_PANEL_IDS.mapTree, direction: 'within' }, inactive: true });
  api.addPanel({ id: SINGLE_PANEL_IDS.layers, component: PANEL_COMPONENTS.layers, title: 'Layers', position: { referencePanel: SINGLE_PANEL_IDS.mapTree, direction: 'within' }, inactive: true });
  api.addPanel({ id: SINGLE_PANEL_IDS.start, component: PANEL_COMPONENTS.start, title: 'Start', position: { direction: 'right' } });
  api.addPanel({ id: SINGLE_PANEL_IDS.properties, component: PANEL_COMPONENTS.properties, title: 'Map properties', position: { direction: 'right' } });
  api.addPanel({ id: SINGLE_PANEL_IDS.quick, component: PANEL_COMPONENTS.quick, title: 'Quick settings', position: { referencePanel: SINGLE_PANEL_IDS.properties, direction: 'within' }, inactive: true });
  api.addPanel({ id: SINGLE_PANEL_IDS.history, component: PANEL_COMPONENTS.history, title: 'History', position: { referencePanel: SINGLE_PANEL_IDS.properties, direction: 'below' } });

  api.getPanel(SINGLE_PANEL_IDS.mapTree)?.group.api.setSize({ width: SIDE_WIDTH });
  api.getPanel(SINGLE_PANEL_IDS.properties)?.group.api.setSize({ width: INSPECTOR_WIDTH });
  api.getPanel(SINGLE_PANEL_IDS.mapTree)?.api.setActive();
};

/**
 * Brings back the workspace as it was left, torn-out windows included, or lays it out afresh when there is no saved
 * layout or it no longer fits (a panel kind renamed since, say). A dock replaced while the saved layout was being
 * read (the page's first render builds one, then another) is left alone. The dock reads only its own keys from the
 * saved layout; whatever else the workspace keeps there is handed on once the layout is rebuilt.
 * @param {DockviewApi} api The dock.
 * @param {LayoutStore} layouts Where the layout is kept.
 * @param {() => boolean} isCurrent Whether the dock is still the one on the page.
 * @param {(saved: SavedLayout) => void} onRestored Takes the saved layout once the dock has rebuilt it.
 * @returns {Promise<'restored' | 'default' | 'stale'>} Which it did.
 */
const restoreLayout = async (
  api: DockviewApi,
  layouts: LayoutStore,
  isCurrent: () => boolean,
  onRestored: (saved: SavedLayout) => void = () => undefined,
): Promise<'restored' | 'default' | 'stale'> =>
{
  const saved = await layouts.load();
  if (isCurrent() === false)
  {
    return 'stale';
  }

  if (saved !== null)
  {
    try
    {
      api.fromJSON(saved as unknown as SerializedDockview);
      onRestored(saved);
      return 'restored';
    }
    catch
    {
      // a layout the dock cannot rebuild is dropped for the default rather than left half built.
      api.clear();
    }
  }

  addDefaultPanels(api);
  return 'default';
};

export { addDefaultPanels, POPOUT_URL, restoreLayout };
