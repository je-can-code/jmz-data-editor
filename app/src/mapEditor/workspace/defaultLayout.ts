import type { DockviewApi, SerializedDockview } from 'dockview-react';
import { hasRoomForCentre } from '../core/workspace/centre.ts';
import type { LayoutStore, SavedLayout } from '../core/workspace/LayoutStore.ts';
import { minimumWidthFor, PANEL_COMPONENTS, SINGLE_PANEL_IDS, withPanelMinimums } from '../core/workspace/panels.ts';
import { settleCentre } from './CentreKeeper.ts';

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
 * How much of the left column's height the map tree and the layers panel start with; the palette takes the rest,
 * since painting reaches for it most.
 */
const TREE_SHARE = 0.25;
const LAYERS_SHARE = 0.3;

/**
 * Adds one of the workspace's own panels, with the minimum width its kind keeps.
 * @param {DockviewApi} api The dock.
 * @param {Parameters<DockviewApi['addPanel']>[0]} options The panel.
 */
const addPanel = (api: DockviewApi, options: Parameters<DockviewApi['addPanel']>[0]): void =>
{
  api.addPanel({ ...options, minimumWidth: minimumWidthFor(options.component) });
};

/**
 * Lays out the workspace the first time, or after a reset: down the left, the map tree, the palette and the layers
 * panel, each in its own group so all three show at once; the start panel in the middle, holding the centre maps open
 * into (see CentreKeeper); and the map properties and quick settings on the right above the history. The side panels
 * keep their minimum widths, so however the maps crowd in, the tree, the palette and the properties stay readable.
 * @param {DockviewApi} api The dock.
 */
const addDefaultPanels = (api: DockviewApi): void =>
{
  addPanel(api, { id: SINGLE_PANEL_IDS.mapTree, component: PANEL_COMPONENTS.mapTree, title: 'Maps' });
  addPanel(api, { id: SINGLE_PANEL_IDS.palette, component: PANEL_COMPONENTS.palette, title: 'Tiles', position: { referencePanel: SINGLE_PANEL_IDS.mapTree, direction: 'below' } });
  addPanel(api, { id: SINGLE_PANEL_IDS.layers, component: PANEL_COMPONENTS.layers, title: 'Layers', position: { referencePanel: SINGLE_PANEL_IDS.palette, direction: 'below' } });
  addPanel(api, { id: SINGLE_PANEL_IDS.start, component: PANEL_COMPONENTS.start, title: 'Start', position: { direction: 'right' } });
  addPanel(api, { id: SINGLE_PANEL_IDS.properties, component: PANEL_COMPONENTS.properties, title: 'Map properties', position: { direction: 'right' } });
  addPanel(api, { id: SINGLE_PANEL_IDS.quick, component: PANEL_COMPONENTS.quick, title: 'Quick settings', position: { referencePanel: SINGLE_PANEL_IDS.properties, direction: 'within' }, inactive: true });
  addPanel(api, { id: SINGLE_PANEL_IDS.history, component: PANEL_COMPONENTS.history, title: 'History', position: { referencePanel: SINGLE_PANEL_IDS.properties, direction: 'below' } });

  api.getPanel(SINGLE_PANEL_IDS.mapTree)?.group.api.setSize({ width: SIDE_WIDTH, height: Math.round(api.height * TREE_SHARE) });
  api.getPanel(SINGLE_PANEL_IDS.layers)?.group.api.setSize({ height: Math.round(api.height * LAYERS_SHARE) });
  api.getPanel(SINGLE_PANEL_IDS.properties)?.group.api.setSize({ width: INSPECTOR_WIDTH });
  api.getPanel(SINGLE_PANEL_IDS.mapTree)?.api.setActive();
};

/**
 * Brings back the workspace as it was left, torn-out windows included, or lays it out afresh when there is no saved
 * layout or it no longer fits (a panel kind renamed since, say). A dock replaced while the saved layout was being
 * read (the page's first render builds one, then another) is left alone. Every panel comes back with the minimum width
 * its kind has now, whatever the layout was saved with. A layout saved before the centre was permanent gets one: the
 * start panel joins its roomiest group of maps, and a layout with neither the start panel nor a map in the main window
 * is laid out afresh, since it has nowhere for maps to open. The dock reads only its own keys from the saved layout;
 * whatever else the workspace keeps there is handed on once the layout is rebuilt.
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

  // a layout with nowhere for a centre is never rebuilt at all, torn-out windows and all, only to be cleared again.
  if (saved !== null && hasRoomForCentre(saved))
  {
    try
    {
      api.fromJSON(withPanelMinimums(saved) as unknown as SerializedDockview);
      if (settleCentre(api) !== 'none')
      {
        onRestored(saved);
        return 'restored';
      }
    }
    catch
    {
      // a layout the dock cannot rebuild is dropped for the default below, rather than left half built.
    }

    api.clear();
  }

  addDefaultPanels(api);
  return 'default';
};

export { addDefaultPanels, POPOUT_URL, restoreLayout };
