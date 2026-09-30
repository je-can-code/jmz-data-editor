import React, { useEffect, useRef, useState } from 'react';
import type {
  BuiltInContextMenuItem,
  DockviewApi,
  DockviewPanelApi,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
  ReactContextMenuItemConfig,
} from 'dockview-react';
import type { PopoutKeeper } from './PopoutKeeper.ts';
import { useWorkspace } from './workspaceHooks.tsx';

/**
 * What a tab's window button and its menu item say.
 */
const TEAR_OUT_LABEL = 'Open in its own window';

/**
 * The glyphs a tab draws, inline, in the dock's own style: a torn-out window copies the page's styles once, when it
 * opens, so a tab never leans on styles made after that.
 */
const GLYPHS = {
  openInWindow: { viewBox: '0 0 24 24', path: 'M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3z' },
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
 * Reports whether a tab's panel can be torn out: anywhere but a window it already has to itself.
 * @param {PopoutKeeper} keeper The keeper.
 * @param {DockviewApi} dock The dock.
 * @param {string} panelId The panel.
 * @returns {boolean} True when tearing it out would give it a window of its own.
 */
const canTearOut = (keeper: PopoutKeeper, dock: DockviewApi, panelId: string): boolean =>
{
  const panel = dock.getPanel(panelId);
  return panel !== undefined && keeper.isAloneInWindow(panel) === false;
};

/**
 * Follows whether a tab's panel can be torn out. Any layout change can decide it, since a window gaining or losing a
 * panel changes the answer for every tab in it.
 * @param {PopoutKeeper} keeper The keeper.
 * @param {IDockviewPanelHeaderProps} props The tab's props.
 * @returns {boolean} True while it can be torn out.
 */
const useCanTearOut = (keeper: PopoutKeeper, props: IDockviewPanelHeaderProps): boolean =>
{
  const { api, containerApi } = props;
  const [ can, setCan ] = useState(() => canTearOut(keeper, containerApi, api.id));

  useEffect(() =>
  {
    const update = () => setCan(canTearOut(keeper, containerApi, api.id));
    update();
    const subscriptions = [ containerApi.onDidLayoutChange(update), api.onDidLocationChange(update) ];
    return () => subscriptions.forEach(subscription => subscription.dispose());
  }, [ keeper, api, containerApi ]);

  return can;
};

/**
 * A panel's tab: its title, a button opening that one panel in a window of its own, and one closing it. Both buttons
 * show on the tab in front and on any tab under the pointer, as the dock's close buttons do, and a middle click closes
 * the tab too. A panel that already has a window to itself has no window button.
 * @param {IDockviewPanelHeaderProps} props The dock's tab props.
 * @returns {React.JSX.Element} The tab.
 */
const WorkspaceTab = (props: IDockviewPanelHeaderProps) =>
{
  const { api, containerApi } = props;
  const controller = useWorkspace();
  const title = usePanelTitle(api);
  const tearable = useCanTearOut(controller.popouts, props);
  const middlePressed = useRef(false);

  /**
   * Opens this tab's panel in a window of its own.
   */
  const tearOut = () =>
  {
    const panel = containerApi.getPanel(api.id);
    if (panel !== undefined)
    {
      controller.popouts.tearOutBeside(panel).catch(() => undefined);
    }
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
      {tearable && (
        <button type={'button'} className={'dv-default-tab-action'} aria-label={TEAR_OUT_LABEL} title={TEAR_OUT_LABEL} onPointerDown={keepTabStill} onClick={tearOut}>
          <Glyph glyph={'openInWindow'}/>
        </button>
      )}
      <button type={'button'} className={'dv-default-tab-action'} aria-label={'Close tab'} title={'Close'} onPointerDown={keepTabStill} onClick={() => api.close()}>
        <Glyph glyph={'close'}/>
      </button>
    </div>
  );
};

/**
 * The menu a tab's right click opens: opening its panel in a window of its own (greyed out once it has one to
 * itself), then closing it.
 * @param {PopoutKeeper} keeper The keeper.
 * @param {IDockviewPanel} panel The panel whose tab was clicked.
 * @returns {(BuiltInContextMenuItem | ReactContextMenuItemConfig)[]} The menu's items.
 */
const tabMenuItems = (keeper: PopoutKeeper, panel: IDockviewPanel): (BuiltInContextMenuItem | ReactContextMenuItemConfig)[] =>
{
  return [
    {
      label: TEAR_OUT_LABEL,
      disabled: keeper.isAloneInWindow(panel),
      action: () =>
      {
        keeper.tearOutBeside(panel).catch(() => undefined);
      },
    },
    'separator',
    'close',
  ];
};

export { tabMenuItems, TEAR_OUT_LABEL, WorkspaceTab };
