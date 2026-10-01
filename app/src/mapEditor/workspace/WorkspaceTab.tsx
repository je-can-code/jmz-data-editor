import React, { useEffect, useRef, useState } from 'react';
import type {
  BuiltInContextMenuItem,
  DockviewPanelApi,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
  ReactContextMenuItemConfig,
} from 'dockview-react';
import type { PopoutKeeper } from './PopoutKeeper.ts';
import { useWorkspace } from './workspaceHooks.tsx';

/**
 * What a tab's window button and its menu items say: opening a panel in a window of its own, and putting a torn-out
 * one back.
 */
const TEAR_OUT_LABEL = 'Open in its own window';
const PUT_BACK_LABEL = 'Put back in the main window';

/**
 * The glyphs a tab draws, inline, in the dock's own style: a torn-out window copies the page's styles once, when it
 * opens, so a tab never leans on styles made after that.
 */
const GLYPHS = {
  openInWindow: { viewBox: '0 0 24 24', path: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z' },
  putBack: { viewBox: '0 0 24 24', path: 'M20 5.41 18.59 4 7 15.59V9H5v10h10v-2H8.41z' },
  close: { viewBox: '0 0 28 28', path: 'M2.1 27.3L0 25.2L11.55 13.65L0 2.1L2.1 0L13.65 11.55L25.2 0L27.3 2.1L15.75 13.65L27.3 25.2L25.2 27.3L13.65 15.75L2.1 27.3Z' },
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
 * A panel's tab: its title, a window button, and a close button. In the main window the window button opens that one
 * panel in a window of its own; in a torn-out window it puts the panel back where it came from in the main window.
 * Both buttons show on the tab in front and on any tab under the pointer, as the dock's close buttons do, and a middle
 * click closes the tab too.
 * @param {IDockviewPanelHeaderProps} props The dock's tab props.
 * @returns {React.JSX.Element} The tab.
 */
const WorkspaceTab = (props: IDockviewPanelHeaderProps) =>
{
  const { api, containerApi } = props;
  const controller = useWorkspace();
  const title = usePanelTitle(api);
  const tornOut = useTornOut(api);
  const middlePressed = useRef(false);
  const windowLabel = tornOut ? PUT_BACK_LABEL : TEAR_OUT_LABEL;

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
    >
      <span className={'dv-default-tab-content'}>{title}</span>
      <button type={'button'} className={'dv-default-tab-action'} aria-label={windowLabel} title={windowLabel} onPointerDown={keepTabStill} onClick={moveWindow}>
        <Glyph glyph={tornOut ? 'putBack' : 'openInWindow'}/>
      </button>
      <button type={'button'} className={'dv-default-tab-action'} aria-label={'Close tab'} title={'Close'} onPointerDown={keepTabStill} onClick={() => api.close()}>
        <Glyph glyph={'close'}/>
      </button>
    </div>
  );
};

/**
 * The menu a tab's right click opens: opening its panel in a window of its own (greyed out once it has one to
 * itself), putting a torn-out panel back in the main window, then closing it.
 * @param {PopoutKeeper} keeper The keeper.
 * @param {IDockviewPanel} panel The panel whose tab was clicked.
 * @returns {(BuiltInContextMenuItem | ReactContextMenuItemConfig)[]} The menu's items.
 */
const tabMenuItems = (keeper: PopoutKeeper, panel: IDockviewPanel): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] =>
{
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

export { PUT_BACK_LABEL, tabMenuItems, TEAR_OUT_LABEL, WorkspaceTab };
