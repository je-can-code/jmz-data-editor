import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, GlobalStyles } from '@mui/material';
import {
  DockviewReact,
  themeDark,
  type DockviewApi,
  type DockviewDidDropEvent,
  type DockviewDndOverlayEvent,
  type DockviewReadyEvent,
  type GetTabContextMenuItemsParams,
  type IDockviewPanelProps,
} from 'dockview-react';
import { CHANNEL_NAMES, openBroadcastChannel } from '../../core/infrastructure/messaging/MessageChannelLike.ts';
import { MapLinkHost } from '../../core/infrastructure/shell/MapLink.ts';
import { readCollapsedGroups, withCollapsedGroups } from '../core/workspace/collapse.ts';
import type { SavedLayout } from '../core/workspace/LayoutStore.ts';
import { decodeDraggedMaps, directionForDrop, MAP_DRAG_TYPE, PANEL_COMPONENTS, SINGLE_PANEL_IDS } from '../core/workspace/panels.ts';
import { APP_WIDE_COMMANDS, appShortcutFor, type KeyTarget, type ShortcutCommand } from '../core/workspace/shortcuts.ts';
import { readOrigins, withOrigins } from '../core/workspace/tearOut.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { addDefaultPanels, POPOUT_URL, restoreLayout } from './defaultLayout.ts';
import { EventsPanel } from './panels/EventsPanel.tsx';
import { HistoryPanel } from './panels/HistoryPanel.tsx';
import { LayersPanel } from './panels/layers/LayersPanel.tsx';
import { MapPanel } from './panels/MapPanel.tsx';
import { MapPropertiesPanel } from './panels/MapPropertiesPanel.tsx';
import { MapTreePanel } from './panels/MapTreePanel.tsx';
import { PalettePanel } from './panels/palette/PalettePanel.tsx';
import { StartPanel } from './panels/PlaceholderPanels.tsx';
import { QuickSettingsPanel } from './panels/QuickSettingsPanel.tsx';
import { attachShortcutsToPopouts, withWindowScope } from './windowScope.tsx';
import { NoticeBar, WorkspaceBar } from './WorkspaceChrome.tsx';
import { WorkspaceController } from './WorkspaceController.ts';
import { WorkspaceProvider } from './workspaceHooks.tsx';
import { START_TAB_STYLES, tabMenuItems, WorkspaceTab } from './WorkspaceTab.tsx';

declare global
{
  interface Window
  {
    /**
     * The workspace's controller, handed to scripts driving the editor in development only.
     */
    __jmzWorkspace?: WorkspaceController;
  }
}

/**
 * Every kind of panel, each wrapped so its styles and portals follow it into a torn-out window.
 */
const PANELS: Record<string, React.FunctionComponent<IDockviewPanelProps>> = {
  [PANEL_COMPONENTS.map]: withWindowScope(MapPanel),
  [PANEL_COMPONENTS.mapTree]: withWindowScope(MapTreePanel),
  [PANEL_COMPONENTS.history]: withWindowScope(HistoryPanel),
  [PANEL_COMPONENTS.properties]: withWindowScope(MapPropertiesPanel),
  [PANEL_COMPONENTS.palette]: withWindowScope(PalettePanel),
  [PANEL_COMPONENTS.layers]: withWindowScope(LayersPanel),
  [PANEL_COMPONENTS.quick]: withWindowScope(QuickSettingsPanel),
  [PANEL_COMPONENTS.events]: withWindowScope(EventsPanel),
  [PANEL_COMPONENTS.start]: withWindowScope(StartPanel),
};

/**
 * Reports whether a drag carries maps from the tree.
 * @param {DragEvent | PointerEvent} event The drag.
 * @returns {boolean} True when it carries maps.
 */
const carriesMaps = (event: DragEvent | PointerEvent): boolean =>
{
  return 'dataTransfer' in event && event.dataTransfer !== null && event.dataTransfer.types.includes(MAP_DRAG_TYPE);
};

/**
 * Reports whether a group holds the map tree. A map dragged over the tree's own group is being nested or reordered,
 * which the tree handles itself; the dock offering its drop target there too would leave its overlay behind once
 * the tree took the drop.
 * @param {DockviewDndOverlayEvent['group']} group The group under the drag, if any.
 * @returns {boolean} True for the tree's group.
 */
const holdsTheTree = (group: DockviewDndOverlayEvent['group']): boolean =>
{
  return group !== undefined && group.panels.some(panel => panel.id === SINGLE_PANEL_IDS.mapTree);
};

/**
 * The map editor's workspace: one window split into panels (any number of maps, the map tree, the map properties,
 * the history, the palette, the layer strip, the quick settings and the events list) that can be resized, rearranged,
 * stacked as tabs, closed, or torn out into windows of their own, still live and in sync. The layout is kept with the
 * project and comes back as it was left, torn-out windows included.
 *
 * The middle is the centre, which never closes: maps open there, in front, and once the last map in it is closed,
 * dragged off or torn out it shows the start panel, at the size it had (see CentreKeeper).
 *
 * Any tab opens alone in a window of its own: from its button or its right-click menu, a little off where it sat, or
 * dragged beyond the window's edge and let go, where it lands. Tabs drag with pointer events, never the browser's drag
 * and drop, so a dragged tab never leaves the app for the desktop to take. Closing a torn-out window puts every panel
 * in it back where it came from, as a tab in the group it left, however it was laid out inside the window; a torn-out
 * tab's button, or its menu, puts back just that one.
 *
 * Undo, redo and save listen on every window, torn-out ones included, and act on whatever has focus. A map dragged
 * from the tree into any pane opens there, and a map the data editor asks for opens with its event picked out.
 * @returns {React.JSX.Element} The workspace.
 */
const Workspace = () =>
{
  const services = useMapEditorServices();
  const [ controller ] = useState(() => new WorkspaceController(services));
  const teardown = useRef<(() => void)[]>([]);

  const onShortcut = useCallback((event: KeyboardEvent) =>
  {
    if (event.defaultPrevented)
    {
      return;
    }

    const command = appShortcutFor(event, event.target as unknown as KeyTarget);
    if (command === null || APP_WIDE_COMMANDS.has(command) === false)
    {
      return;
    }

    event.preventDefault();
    const actions: Partial<Record<ShortcutCommand, () => Promise<void>>> = {
      undo: () => controller.undo(),
      redo: () => controller.redo(),
      save: () => controller.saveAll(),
    };
    actions[command]?.().catch(() => undefined);
  }, [ controller ]);

  // a tab's right-click menu; held steady, since the dock takes every new menu builder as a change to its options.
  const tabMenu = useCallback((params: GetTabContextMenuItemsParams) => tabMenuItems(controller.popouts, params.panel), [ controller ]);

  // the main window hears its own keys; every torn-out window gets the same listener once the dock is ready.
  useEffect(() =>
  {
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, [ onShortcut ]);

  // a layout still waiting to be written is written as the page goes.
  useEffect(() =>
  {
    const flush = () =>
    {
      controller.layouts.flush().catch(() => undefined);
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [ controller ]);

  useEffect(() =>
  {
    if (import.meta.env.DEV)
    {
      window.__jmzWorkspace = controller;
    }

    const stops = teardown.current;
    return () =>
    {
      stops.splice(0).reverse().forEach(stop => stop());
    };
  }, [ controller ]);

  /**
   * Wires the dock once it exists: focus tracking, layout keeping, drops from the tree, shortcuts in torn-out
   * windows, then the saved layout, then the data editor's requests.
   * @param {DockviewReadyEvent} event The dock's ready event.
   */
  const onReady = (event: DockviewReadyEvent) =>
  {
    const { api } = event;
    controller.attach(api);

    // the first render builds a dock and replaces it at once; only the one still on the page carries on.
    const isCurrent = () => controller.dockview === api;
    let restoring = true;
    const keepLayout = () =>
    {
      // torn-out panels' origins and collapsed groups' sizes both ride along, so a restart brings them back too.
      if (restoring === false && isCurrent())
      {
        const layout = api.toJSON() as unknown as SavedLayout;
        const withTornOut = withOrigins(layout, controller.popouts.origins);
        controller.layouts.save(withCollapsedGroups(withTornOut, controller.collapses.collapsed));
      }
    };

    const subscriptions = [
      api.onDidActivePanelChange(change => controller.panelActivated(change.panel)),
      api.onDidLayoutChange(keepLayout),
      api.onUnhandledDragOver(drag =>
      {
        if (carriesMaps(drag.nativeEvent) && holdsTheTree(drag.group) === false)
        {
          drag.accept();
        }
      }),
    ];
    teardown.current.push(
      () => subscriptions.forEach(subscription => subscription.dispose()),
      attachShortcutsToPopouts(api, onShortcut),
      controller.centre.attach(api),
      controller.popouts.attach(api),
      controller.collapses.attach(api),
    );

    restoreLayout(api, controller.layouts, isCurrent, saved =>
    {
      controller.popouts.adopt(readOrigins(saved));
      controller.collapses.adopt(readCollapsedGroups(saved));
    })
      .catch(() =>
      {
        if (isCurrent())
        {
          addDefaultPanels(api);
        }
      })
      .finally(() =>
      {
        if (isCurrent())
        {
          restoring = false;
          controller.panelActivated(api.activePanel);
          startMapLink(api);
        }
      });
  };

  /**
   * Starts answering the data editor's requests to show a map at one of its events.
   * @param {DockviewApi} api The dock, once laid out.
   */
  const startMapLink = (api: DockviewApi) =>
  {
    const channel = openBroadcastChannel(CHANNEL_NAMES.shell);
    if (channel === null)
    {
      return;
    }

    const host = new MapLinkHost(channel, (mapId, eventId) =>
    {
      controller.openMap(mapId, { focusEventId: eventId })?.api.setActive();
    });
    host.start();
    teardown.current.push(() =>
    {
      host.stop();
      channel.close();
    });
    controller.panelActivated(api.activePanel);
  };

  /**
   * Opens maps dropped from the tree where they landed: the first splits the group or stacks in it as the drop
   * says, and the rest join it.
   * @param {DockviewDidDropEvent} drop The drop.
   */
  const onDidDrop = (drop: DockviewDidDropEvent) =>
  {
    const native = drop.nativeEvent;
    const data = 'dataTransfer' in native && native.dataTransfer !== null
      ? native.dataTransfer.getData(MAP_DRAG_TYPE)
      : '';
    const [ first, ...rest ] = decodeDraggedMaps(data);
    if (first === undefined)
    {
      return;
    }

    const opened = controller.openMap(first, { newView: true, at: { group: drop.group, direction: directionForDrop(drop.position) } });
    rest.forEach(mapId => controller.openMap(mapId, { newView: true, at: { group: opened?.group, direction: 'within' } }));
  };

  /**
   * Lays the workspace out afresh, dropping every torn-out window back in.
   */
  const resetLayout = () =>
  {
    const api = controller.dockview;
    if (api !== null)
    {
      api.clear();
      addDefaultPanels(api);
    }
  };

  return (
    <WorkspaceProvider controller={controller}>
      <GlobalStyles styles={START_TAB_STYLES}/>
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }} data-testid={'map-editor-workspace'}>
        <WorkspaceBar onResetLayout={resetLayout}/>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DockviewReact
            components={PANELS}
            theme={themeDark}
            dndStrategy={'pointer'}
            popoutUrl={POPOUT_URL}
            defaultTabComponent={WorkspaceTab}
            getTabContextMenuItems={tabMenu}
            onReady={onReady}
            onDidDrop={onDidDrop}
          />
        </Box>
        <NoticeBar/>
      </Box>
    </WorkspaceProvider>
  );
};

export { Workspace };
