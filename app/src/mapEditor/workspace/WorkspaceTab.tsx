import React, { useEffect, useRef, useState } from 'react';
import type {
  BuiltInContextMenuItem,
  DockviewPanelApi,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
  ReactContextMenuItemConfig,
} from 'dockview-react';
import { isStartPanel, isStartTabHidden } from '../core/workspace/centre.ts';
import { isCollapsibleKind } from '../core/workspace/panels.ts';
import type { GroupCollapseKeeper } from './GroupCollapseKeeper.ts';
import type { PopoutKeeper } from './PopoutKeeper.ts';
import { useWorkspace } from './workspaceHooks.tsx';

/**
 * What a tab's window button and its menu items say: opening a panel in a window of its own, and putting a torn-out
 * one back.
 */
const TEAR_OUT_LABEL = 'Open in its own window';
const PUT_BACK_LABEL = 'Put back in the main window';

/**
 * What a side panel's tab offers through its chevron, and through a double click on the tab itself: collapsing its
 * group to just its tab bar, and restoring it.
 */
const COLLAPSE_LABEL = 'Collapse';
const EXPAND_LABEL = 'Expand';

/**
 * The classes the start panel's tab carries: always, so it can take the whole of the dock's tab, and while it hides,
 * so the dock's tab around it takes no room. The workspace's styles act on them (see START_TAB_STYLES).
 */
const START_TAB_CLASS = 'jmz-start-tab';
const HIDDEN_START_TAB_CLASS = 'jmz-start-tab-hidden';

/**
 * The styles the start panel's tab needs from the dock's tab around it, which only the page's styles can reach: none of
 * the dock's padding, so every press on the tab lands on the start tab itself and stops there, and no room at all while
 * it hides, the divider beside it hiding too.
 */
const START_TAB_STYLES = {
  [`.dv-tab:has(.${START_TAB_CLASS})`]: { padding: 0 },
  [`.${START_TAB_CLASS}`]: { padding: '0.25rem 0.5rem', boxSizing: 'border-box' },
  [`.dv-tab:has(.${HIDDEN_START_TAB_CLASS})`]: { display: 'none' },
  [`.dv-tab:has(.${HIDDEN_START_TAB_CLASS}) + .dv-tab::before`]: { display: 'none' },
} as const;

/**
 * The glyphs a tab draws, inline, in the dock's own style: a torn-out window copies the page's styles once, when it
 * opens, so a tab never leans on styles made after that.
 */
const GLYPHS = {
  openInWindow: { viewBox: '0 0 24 24', path: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z' },
  putBack: { viewBox: '0 0 24 24', path: 'M20 5.41 18.59 4 7 15.59V9H5v10h10v-2H8.41z' },
  close: { viewBox: '0 0 28 28', path: 'M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z' },
  collapse: { viewBox: '0 0 24 24', path: 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z' },
  expand: { viewBox: '0 0 24 24', path: 'M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z' },
} as const;

/**
 * Draws one of a tab's glyphs.
 * @param {{ glyph: keyof typeof GLYPHS }} props Which glyph.
 * @returns {React.JSX.Element} The glyph.
 */
const Glyph = (props: { glyph: keyof typeof GLYPHS }) =>
{
  const { viewBox, path } = GLYPHS[props.glyph];
  return (
    <svg className={'dv-svg'} width={11} height={11} viewBox={viewBox} aria-hidden={'true'} focusable={'false'}>
      <path d={path}/>
    </svg>
  );
};

/**
 * Keeps a press on one of a tab's buttons from picking the tab first; the dock leaves a tab be when a press on it has
 * been handled.
 * @param {React.PointerEvent} event The press.
 */
const keepTabStill = (event: React.PointerEvent) =>
{
  event.preventDefault();
};

/**
 * Keeps a double click on one of a tab's buttons from also reaching the tab itself, which collapses its group on a
 * double click of its own; a double click on, say, the close button should only close the tab.
 * @param {React.MouseEvent} event The double click.
 */
const stopDoubleClick = (event: React.MouseEvent) =>
{
  event.stopPropagation();
};

/**
 * Follows a panel's title.
 * @param {DockviewPanelApi} api The panel's api.
 * @returns {string} The title.
 */
const usePanelTitle = (api: DockviewPanelApi): string =>
{
  const [ title, setTitle ] = useState(api.title ?? '');

  useEffect(() =>
  {
    // read again as the listener starts, in case the title changed between rendering and now.
    setTitle(api.title ?? '');
    const subscription = api.onDidTitleChange(event => setTitle(event.title));
    return () => subscription.dispose();
  }, [ api ]);

  return title;
};

/**
 * Follows whether a tab's panel is torn out, which decides what its window button does.
 * @param {DockviewPanelApi} api The panel's api.
 * @returns {boolean} True while the panel is in a torn-out window.
 */
const useTornOut = (api: DockviewPanelApi): boolean =>
{
  const [ tornOut, setTornOut ] = useState(() => api.location.type === 'popout');

  useEffect(() =>
  {
    const update = () => setTornOut(api.location.type === 'popout');
    update();
    const subscription = api.onDidLocationChange(update);
    return () => subscription.dispose();
  }, [ api ]);

  return tornOut;
};

/**
 * Follows whether a tab's panel sits in a group that collapses (a side panel's, never a map's or the start panel's,
 * and never the centre's) and whether that group is collapsed right now, however the panels in it change or it
 * collapses and expands. Toggling it is what the tab's chevron and a double click on the tab both do.
 * @param {DockviewPanelApi} api The tab's panel's api.
 * @param {GroupCollapseKeeper} collapses The keeper.
 * @returns {{ collapsible: boolean, collapsed: boolean, toggle: () => void }} Whether the tab offers to collapse
 * its group, whether it has, and how to flip it.
 */
const useGroupCollapse = (api: DockviewPanelApi, collapses: GroupCollapseKeeper) =>
{
  const [ collapsed, setCollapsed ] = useState(() => collapses.isCollapsed(api.group));

  useEffect(() =>
  {
    let watching: { dispose: () => void } | null = null;

    // read afresh on every change, and follow the group's own dimension changes, which is what collapsing is.
    const update = () => setCollapsed(collapses.isCollapsed(api.group));
    const watchGroup = () =>
    {
      watching?.dispose();
      update();
      watching = api.group.api.onDidDimensionsChange(update);
    };

    watchGroup();
    const moved = api.onDidGroupChange(watchGroup);
    return () =>
    {
      moved.dispose();
      watching?.dispose();
    };
  }, [ api, collapses ]);

  return {
    collapsible: isCollapsibleKind(api.component) && collapses.isCollapsible(api.group),
    collapsed,
    toggle: () => collapses.toggle(api.group),
  };
};

/**
 * Follows which panels share a tab's group, by id, in tab order, as panels come and go and should the tab's panel
 * move to another group.
 * @param {DockviewPanelApi} api The tab's panel's api.
 * @returns {readonly string[]} The group's panels.
 */
const useGroupPanelIds = (api: DockviewPanelApi): readonly string[] =>
{
  const [ panelIds, setPanelIds ] = useState<readonly string[]>(() => api.group.panels.map(panel => panel.id));

  useEffect(() =>
  {
    let watching: { dispose: () => void }[] = [];

    // read afresh on every change, keeping the same list while the panels are the same, so nothing renders for nothing.
    const update = () => setPanelIds(current =>
    {
      const next = api.group.panels.map(panel => panel.id);
      return next.join('\n') === current.join('\n') ? current : next;
    });

    // the group's own add and remove events, which fire while panels are dragged between groups as well.
    const watchGroup = () =>
    {
      watching.forEach(each => each.dispose());
      update();
      watching = [ api.group.model.onDidAddPanel(update), api.group.model.onDidRemovePanel(update) ];
    };

    watchGroup();
    const moved = api.onDidGroupChange(watchGroup);
    return () =>
    {
      moved.dispose();
      watching.forEach(each => each.dispose());
    };
  }, [ api ]);

  return panelIds;
};

/**
 * Stops a press, a right click or a drag on the start panel's tab right there: the dock never drags it, floats it,
 * opens a menu for it or picks it, and the page shows no menu of its own.
 * @param {React.SyntheticEvent} event The press.
 */
const stopAtStartTab = (event: React.SyntheticEvent) =>
{
  event.preventDefault();
  event.stopPropagation();
};

/**
 * The start panel's tab: its title alone, with no window button, no close button and no menu, since the start panel
 * holds the centre and never leaves it, and presses on it stop there, so the dock never drags or floats it. It hides
 * whenever anything else shares the centre, so the strip shows just the maps, and shows again once the last of them is
 * gone, the start panel with it.
 * @param {IDockviewPanelHeaderProps} props The dock's tab props.
 * @returns {React.JSX.Element} The tab.
 */
const StartTab = (props: IDockviewPanelHeaderProps) =>
{
  const { api } = props;
  const title = usePanelTitle(api);
  const hidden = isStartTabHidden(useGroupPanelIds(api));

  return (
    <div
      className={hidden ? `dv-default-tab ${START_TAB_CLASS} ${HIDDEN_START_TAB_CLASS}` : `dv-default-tab ${START_TAB_CLASS}`}
      data-testid={'start-tab'}
      data-hidden={hidden}
      onPointerDown={stopAtStartTab}
      onContextMenu={stopAtStartTab}
    >
      <span className={'dv-default-tab-content'}>{title}</span>
    </div>
  );
};

/**
 * A panel's tab: its title, a chevron on a side panel's tab, a window button, and a close button. The chevron
 * collapses its group to just its tab bar, or restores it, the same as a double click anywhere on the tab; in the
 * main window the window button opens that one panel in a window of its own, and in a torn-out window it puts the
 * panel back where it came from. Every button shows on the tab in front and on any tab under the pointer, as the
 * dock's close button does, and a middle click closes the tab too.
 * @param {IDockviewPanelHeaderProps} props The dock's tab props.
 * @returns {React.JSX.Element} The tab.
 */
const PanelTab = (props: IDockviewPanelHeaderProps) =>
{
  const { api, containerApi } = props;
  const controller = useWorkspace();
  const title = usePanelTitle(api);
  const tornOut = useTornOut(api);
  const { collapsible, collapsed, toggle } = useGroupCollapse(api, controller.collapses);
  const middlePressed = useRef(false);
  const windowLabel = tornOut ? PUT_BACK_LABEL : TEAR_OUT_LABEL;
  const collapseLabel = collapsed ? EXPAND_LABEL : COLLAPSE_LABEL;

  /**
   * Opens this tab's panel in a window of its own, or puts it back from one.
   */
  const moveWindow = () =>
  {
    const panel = containerApi.getPanel(api.id);
    if (panel === undefined)
    {
      return;
    }

    if (tornOut)
    {
      controller.popouts.putBack(panel);
      return;
    }

    controller.popouts.tearOutBeside(panel).catch(() => undefined);
  };

  return (
    <div
      className={'dv-default-tab'}
      data-testid={'workspace-tab'}
      onPointerDown={event =>
      {
        middlePressed.current = event.button === 1;
      }}
      onPointerUp={event =>
      {
        if (middlePressed.current && event.button === 1)
        {
          middlePressed.current = false;
          api.close();
        }
      }}
      onPointerLeave={() =>
      {
        middlePressed.current = false;
      }}
      onDoubleClick={collapsible ? toggle : undefined}
    >
      <span className={'dv-default-tab-content'}>{title}</span>
      {collapsible && (
        <button
          type={'button'}
          className={'dv-default-tab-action'}
          aria-label={collapseLabel}
          title={collapseLabel}
          onPointerDown={keepTabStill}
          onDoubleClick={stopDoubleClick}
          onClick={toggle}
        >
          <Glyph glyph={collapsed ? 'expand' : 'collapse'}/>
        </button>
      )}
      <button
        type={'button'}
        className={'dv-default-tab-action'}
        aria-label={windowLabel}
        title={windowLabel}
        onPointerDown={keepTabStill}
        onDoubleClick={stopDoubleClick}
        onClick={moveWindow}
      >
        <Glyph glyph={tornOut ? 'putBack' : 'openInWindow'}/>
      </button>
      <button
        type={'button'}
        className={'dv-default-tab-action'}
        aria-label={'Close tab'}
        title={'Close'}
        onPointerDown={keepTabStill}
        onDoubleClick={stopDoubleClick}
        onClick={() => api.close()}
      >
        <Glyph glyph={'close'}/>
      </button>
    </div>
  );
};

/**
 * Any panel's tab: the start panel's own, or the tab every other panel has.
 * @param {IDockviewPanelHeaderProps} props The dock's tab props.
 * @returns {React.JSX.Element} The tab.
 */
const WorkspaceTab = (props: IDockviewPanelHeaderProps) =>
{
  return isStartPanel(props.api.id)
    ? <StartTab {...props}/>
    : <PanelTab {...props}/>;
};

/**
 * The menu a tab's right click opens: opening its panel in a window of its own (greyed out once it has one to
 * itself), putting a torn-out panel back in the main window, then closing it. The start panel, which never leaves the
 * centre, has no menu.
 * @param {PopoutKeeper} keeper The keeper.
 * @param {IDockviewPanel} panel The panel whose tab was clicked.
 * @returns {(BuiltInContextMenuItem | ReactContextMenuItemConfig)[]} The menu's items, none for no menu.
 */
const tabMenuItems = (keeper: PopoutKeeper, panel: IDockviewPanel): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] =>
{
  if (isStartPanel(panel.id))
  {
    return [];
  }

  const tearOut: ReactContextMenuItemConfig = {
    label: TEAR_OUT_LABEL,
    disabled: keeper.isAloneInWindow(panel),
    action: () =>
    {
      keeper.tearOutBeside(panel).catch(() => undefined);
    },
  };
  const putBack: ReactContextMenuItemConfig = { label: PUT_BACK_LABEL, action: () => keeper.putBack(panel) };
  return panel.api.location.type === 'popout'
    ? [ tearOut, putBack, 'separator', 'close' ]
    : [ tearOut, 'separator', 'close' ];
};

export { PUT_BACK_LABEL, START_TAB_STYLES, tabMenuItems, TEAR_OUT_LABEL, WorkspaceTab };
