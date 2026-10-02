import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import createCache, { type EmotionCache } from '@emotion/cache';
import { CacheProvider, __unsafe_useEmotionCache as useAmbientEmotionCache } from '@emotion/react';
import { createTheme, ThemeProvider, useTheme, type Theme } from '@mui/material';
import type { DockviewApi, IDockviewPanelProps } from 'dockview-react';

// A panel torn out into its own window needs three things the main window gets for free, because dockview moves
// the panel's DOM into the popout's document but keeps it in the main window's React tree:
//
// 1. Emotion keeps writing styles into the main document, and dockview copied the popout's stylesheets once, when
//    it opened. A class MUI makes afterwards (a first-time component, a focus or open state) would have no rules in
//    the popout, so each popout gets a cache that writes into its own head.
// 2. MUI's portals (menus, popovers, tooltips, dialogs) default to the main document's body, so in a popout they
//    are pointed at the popout's body instead.
// 3. Keys pressed in a popout never reach listeners on the main window, so every popout window gets the app's
//    shortcut listener too (see attachShortcutsToPopouts).
//
// Anything that draws should also schedule its frames on the panel's own window, since a hidden main window stops
// delivering animation frames; usePanelWindow says which window that is.

/**
 * One emotion cache per popout window, dropped with the window.
 */
const cachesByWindow = new WeakMap<Window, EmotionCache>();

/**
 * Counts caches made, for their keys.
 */
let cacheCount = 0;

/**
 * Builds an emotion key from a counter; keys may hold only lowercase letters and hyphens.
 * @param {number} count The counter.
 * @returns {string} A key such as pop-a, pop-b, pop-ba.
 */
const keyFor = (count: number): string =>
{
  let letters = '';
  let rest = count;
  do
  {
    letters = String.fromCharCode(97 + (rest % 26)) + letters;
    rest = Math.floor(rest / 26);
  }
  while (rest > 0);

  return `pop-${letters}`;
};

/**
 * Finds or makes the emotion cache that writes into one popout window's head.
 * @param {Window} popout The popout window.
 * @returns {EmotionCache} Its cache.
 */
const cacheForPopout = (popout: Window): EmotionCache =>
{
  const existing = cachesByWindow.get(popout);
  if (existing !== undefined)
  {
    return existing;
  }

  const cache = createCache({ key: keyFor(cacheCount), container: popout.document.head });
  cacheCount += 1;
  cachesByWindow.set(popout, cache);
  return cache;
};

/**
 * Carries the window a panel lives in to everything inside it.
 */
const PanelWindowContext = createContext<Window>(window);

/**
 * Reads the window the surrounding panel lives in right now: schedule frames and listeners on it.
 * @returns {Window} The panel's window.
 */
const usePanelWindow = (): Window =>
{
  return useContext(PanelWindowContext);
};

/**
 * Follows a panel's window as it is torn out and put back.
 * @param {IDockviewPanelProps['api']} api The panel's dockview api.
 * @returns {Window} The window hosting the panel.
 */
const useTrackedWindow = (api: IDockviewPanelProps['api']): Window =>
{
  const [ current, setCurrent ] = useState<Window>(() => api.getWindow());

  useEffect(() =>
  {
    // a location change fires once a popout window is wired up, and again when the panel comes back.
    const subscription = api.onDidLocationChange(() => setCurrent(api.getWindow()));
    return () => subscription.dispose();
  }, [ api ]);

  return current;
};

/**
 * Follows whether a panel is on screen: false while it is a tab behind another in its group, or its group is hidden.
 * Anything holding something scarce for as long as it shows, such as a map view's GPU context, lets it go meanwhile.
 * @param {IDockviewPanelProps['api']} api The panel's dockview api.
 * @returns {boolean} True while the panel shows.
 */
const usePanelVisible = (api: IDockviewPanelProps['api']): boolean =>
{
  const [ visible, setVisible ] = useState<boolean>(() => api.isVisible);

  useEffect(() =>
  {
    // read again as the listener starts, in case the panel moved between rendering and now.
    setVisible(api.isVisible);
    const subscription = api.onDidVisibilityChange(event => setVisible(event.isVisible));
    return () => subscription.dispose();
  }, [ api ]);

  return visible;
};

/**
 * Points MUI's portals at a popout's body; the main window keeps the theme untouched.
 * @param {Theme} outer The app's theme.
 * @param {Window} host The panel's window.
 * @returns {Theme} The theme for the panel.
 */
const themeForWindow = (outer: Theme, host: Window): Theme =>
{
  if (host === window)
  {
    return outer;
  }

  const container = host.document.body;
  return createTheme(outer, {
    components: {
      MuiModal: { defaultProps: { container } },
      MuiPopover: { defaultProps: { container } },
      MuiPopper: { defaultProps: { container } },
    },
  });
};

/**
 * Wraps a panel so its styles, portals and frame scheduling follow the window it is shown in. The providers keep
 * the same shape in every window, so tearing a panel out never remounts what is inside it.
 * @param {React.ComponentType<IDockviewPanelProps>} Component The panel.
 * @returns {React.FunctionComponent<IDockviewPanelProps>} The scoped panel.
 */
const withWindowScope = (Component: React.ComponentType<IDockviewPanelProps>): React.FunctionComponent<IDockviewPanelProps> =>
{
  const Scoped = (props: IDockviewPanelProps) =>
  {
    const host = useTrackedWindow(props.api);
    const ambientCache = useAmbientEmotionCache();
    const outerTheme = useTheme();

    // the main window keeps the ambient cache; a popout gets one writing into its own head.
    const cache = host === window ? ambientCache : cacheForPopout(host);
    const theme = useMemo(() => themeForWindow(outerTheme, host), [ outerTheme, host ]);

    return (
      <PanelWindowContext.Provider value={host}>
        <CacheProvider value={cache}>
          <ThemeProvider theme={theme}>
            <Component {...props}/>
          </ThemeProvider>
        </CacheProvider>
      </PanelWindowContext.Provider>
    );
  };

  Scoped.displayName = `WindowScope(${Component.displayName ?? Component.name})`;
  return Scoped;
};

/**
 * Listens for the app's shortcuts on every popout window as it opens, and on any already open, since the main
 * window never hears a key pressed in another window.
 * @param {DockviewApi} api The dockview api.
 * @param {(event: KeyboardEvent) => void} handler The listener the main window uses.
 * @returns {() => void} Stops listening everywhere.
 */
const attachShortcutsToPopouts = (api: DockviewApi, handler: (event: KeyboardEvent) => void): (() => void) =>
{
  // the removal event fires after the window has gone, so remember which window each popout group opened.
  const attached = new Map<string, Window>();
  const attach = (popout: { group: { id: string }; window: Window }) =>
  {
    popout.window.addEventListener('keydown', handler);
    attached.set(popout.group.id, popout.window);
  };

  api.getPopouts().forEach(attach);
  const added = api.onDidAddPopoutGroup(attach);
  const removed = api.onDidRemovePopoutGroup(popout =>
  {
    attached.get(popout.group.id)?.removeEventListener('keydown', handler);
    attached.delete(popout.group.id);
  });

  return () =>
  {
    added.dispose();
    removed.dispose();
    attached.forEach(popout => popout.removeEventListener('keydown', handler));
    attached.clear();
  };
};

export { attachShortcutsToPopouts, usePanelVisible, usePanelWindow, withWindowScope };
