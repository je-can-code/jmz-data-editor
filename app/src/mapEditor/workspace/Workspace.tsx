import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import {
  DockviewReact,
  themeDark,
  type DockviewApi,
  type DockviewDidDropEvent,
  type DockviewDndOverlayEvent,
  type DockviewReadyEvent,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelProps,
} from 'dockview-react';
import { CHANNEL_NAMES, openBroadcastChannel } from '../../core/infrastructure/messaging/MessageChannelLike.ts';
import { MapLinkHost } from '../../core/infrastructure/shell/MapLink.ts';
import type { SavedLayout } from '../core/workspace/LayoutStore.ts';
import { decodeDraggedMaps, directionForDrop, MAP_DRAG_TYPE, PANEL_COMPONENTS, SINGLE_PANEL_IDS } from '../core/workspace/panels.ts';
import { APP_WIDE_COMMANDS, appShortcutFor, type KeyTarget, type ShortcutCommand } from '../core/workspace/shortcuts.ts';
import { useMapEditorServices } from '../services/MapEditorServicesContext.tsx';
import { addDefaultPanels, POPOUT_URL, restoreLayout } from './defaultLayout.ts';
import { HistoryPanel } from './panels/HistoryPanel.tsx';
import { MapPanel } from './panels/MapPanel.tsx';
import { MapPropertiesPanel } from './panels/MapPropertiesPanel.tsx';
import { MapTreePanel } from './panels/MapTreePanel.tsx';
import { LayersPanel, PalettePanel, StartPanel } from './panels/PlaceholderPanels.tsx';
import { QuickSettingsPanel } from './panels/QuickSettingsPanel.tsx';
import { attachShortcutsToPopouts, withWindowScope } from './windowScope.tsx';
import { NoticeBar, WorkspaceBar } from './WorkspaceChrome.tsx';
import { WorkspaceController } from './WorkspaceController.ts';
import { WorkspaceProvider } from './workspaceHooks.tsx';

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
 * The smallest a torn-out window opens, in pixels, however narrow its group was docked.
 */
const POPOUT_MIN_WIDTH = 720;
const POPOUT_MIN_HEIGHT = 540;

/**
 * The button on each docked group's tab strip that tears the group out into a window of its own, opened a little
 * off where the group sat and never smaller than a comfortable size. A torn-out group goes back when its window is
 * closed.
 * @param {IDockviewHeaderActionsProps} props The group's header props.
 * @returns {React.JSX.Element | null} The button, or nothing for a group already torn out.
 */
const GroupActions = (props: IDockviewHeaderActionsProps) =>
{
  const { containerApi, group } = props;
  if (group.api.location.type === 'popout')
  {
    return null;
  }

  /**
   * Tears the group out, sized from where it sits.
   */
  const tearOut = () =>
  {
    const host = group.element.ownerDocument.defaultView ?? window;
    const bounds = group.element.getBoundingClientRect();
    const position = {
      left: Math.round(host.screenX + bounds.left + 32),
      top: Math.round(host.screenY + bounds.top + 32),
      width: Math.round(Math.max(bounds.width, POPOUT_MIN_WIDTH)),
      height: Math.round(Math.max(bounds.height, POPOUT_MIN_HEIGHT)),
    };
    containerApi.addPopoutGroup(group, { popoutUrl: POPOUT_URL, position }).catch(() => undefined);
  };

  return (
    <Tooltip title={'Open in its own window'}>
      <IconButton size={'small'} aria-label={'Open in its own window'} onClick={tearOut} sx={{ mx: 0.5, p: 0.25 }}>
        <OpenInNew sx={{ fontSize: 16 }}/>
      </IconButton>
    </Tooltip>
  );
};

/**
 * The map editor's workspace: one window split into panels (any number of maps, the map tree, the map properties,
 * the history, and the palette, layer strip and quick settings to come) that can be resized, rearranged, stacked as
 * tabs, closed, or torn out into windows of their own, still live and in sync. The layout is kept with the project
 * and comes back as it was left, torn-out windows included.
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
      if (restoring === false && isCurrent())
      {
        controller.layouts.save(api.toJSON() as unknown as SavedLayout);
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
    );

    restoreLayout(api, controller.layouts, isCurrent)
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
      <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }} data-testid={'map-editor-workspace'}>
        <WorkspaceBar onResetLayout={resetLayout}/>
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DockviewReact
            components={PANELS}
            theme={themeDark}
            popoutUrl={POPOUT_URL}
            rightHeaderActionsComponent={GroupActions}
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
