import { vi } from 'vitest';
import { createDockview, type DockviewApi, type IDockviewPanel } from 'dockview-react';

/**
 * A window the dock under test opened for a torn-out panel: a stand-in holding a blank document of its own, placed and
 * sized as it was asked for, and a way to close it the way a person closing the window does.
 */
type FakePopout = {
  readonly window: Window;
  readonly bounds: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
  readonly closeByHand: () => void;
};

/**
 * A real dock standing in the page under test, its windows faked, and a way to take it all down again.
 */
type RealDock = {
  readonly api: DockviewApi;
  readonly popouts: FakePopout[];
  readonly dispose: () => void;
};

/**
 * The screen every page under test sees: 2560 by 1440, all of it usable.
 */
const SCREEN = { availLeft: 0, availTop: 0, availWidth: 2560, availHeight: 1440, width: 2560, height: 1440 };

/**
 * Reads the size and place a window was asked for out of window.open's features.
 * @param {string} features The features, such as "top=10,left=20,width=720,height=540".
 * @returns {FakePopout['bounds']} The bounds.
 */
const readFeatures = (features: string): FakePopout['bounds'] =>
{
  const pairs = new Map(features.split(',').map(pair => pair.split('=') as [ string, string ]));
  return {
    left: Number(pairs.get('left')),
    top: Number(pairs.get('top')),
    width: Number(pairs.get('width')),
    height: Number(pairs.get('height')),
  };
};

/**
 * Builds the stand-in for one window the dock opens. The dock listens for its load before filling it and for its
 * beforeunload to know it is closing, so the stand-in loads once the dock is listening and fires beforeunload when
 * closed: at once when closed by hand, and a moment later when a script closes it, as a browser does.
 * @param {string} features What the dock asked for.
 * @returns {FakePopout} The window.
 */
const openFakePopout = (features: string): FakePopout =>
{
  const bounds = readFeatures(features);
  const target = new EventTarget();
  const state = { closed: false };
  const popout = Object.assign(target, {
    document: document.implementation.createHTMLDocument('popout'),
    screen: SCREEN,
    screenX: bounds.left,
    screenY: bounds.top,
    innerWidth: bounds.width,
    innerHeight: bounds.height,
    focus: () => undefined,
    setTimeout: (callback: () => void, delay?: number) => setTimeout(callback, delay),
    clearTimeout: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
    close: () =>
    {
      if (state.closed === false)
      {
        state.closed = true;
        setTimeout(() => target.dispatchEvent(new Event('beforeunload')), 0);
      }
    },
  });
  Object.defineProperty(popout, 'closed', { get: () => state.closed });
  setTimeout(() => target.dispatchEvent(new Event('load')), 0);

  return {
    window: popout as unknown as Window,
    bounds,
    closeByHand: () =>
    {
      state.closed = true;
      target.dispatchEvent(new Event('beforeunload'));
    },
  };
};

/**
 * Readies the page under test for a real dock, giving it what the dock needs and jsdom lacks: a resize observer that
 * never reports, hit-testing that finds nothing (so a drag drops nowhere), a 2560 by 1440 screen, and a stand-in for
 * every window the dock opens.
 * @returns {{ popouts: FakePopout[], restore: () => void }} The windows opened so far, and how to put the page back.
 */
const installDockPage = (): { popouts: FakePopout[]; restore: () => void } =>
{
  const popouts: FakePopout[] = [];
  const saved = {
    resizeObserver: globalThis.ResizeObserver,
    elementsFromPoint: document.elementsFromPoint,
    elementFromPoint: document.elementFromPoint,
    screen: Object.getOwnPropertyDescriptor(window, 'screen'),
  };

  globalThis.ResizeObserver = class
  {
    observe(): void
    {
      // nothing is ever resized in a page with no layout.
    }

    unobserve(): void
    {
      // as above.
    }

    disconnect(): void
    {
      // as above.
    }
  } as unknown as typeof ResizeObserver;
  document.elementsFromPoint = () => [];
  document.elementFromPoint = () => null;
  Object.defineProperty(window, 'screen', { value: SCREEN, configurable: true });
  const open = vi.spyOn(window, 'open').mockImplementation((_url, _target, features) =>
  {
    const popout = openFakePopout(String(features));
    popouts.push(popout);
    return popout.window;
  });

  return {
    popouts,
    restore: () =>
    {
      open.mockRestore();
      globalThis.ResizeObserver = saved.resizeObserver;
      document.elementsFromPoint = saved.elementsFromPoint;
      document.elementFromPoint = saved.elementFromPoint;
      if (saved.screen === undefined)
      {
        delete (window as { screen?: Screen }).screen;
      }
      else
      {
        Object.defineProperty(window, 'screen', saved.screen);
      }
    },
  };
};

/**
 * Stands a real dock up in the page under test, dragging with pointers as the workspace's does, with plain elements for
 * panel content and every window it opens faked (see installDockPage).
 * @returns {RealDock} The dock and the windows it opens.
 */
const createRealDock = (): RealDock =>
{
  const page = installDockPage();
  const element = document.createElement('div');
  document.body.appendChild(element);
  const api = createDockview(element, {
    createComponent: () => ({ element: document.createElement('div'), init: () => undefined }),
    dndStrategy: 'pointer',
    popoutUrl: '/popout.html',
  });
  api.layout(1600, 900);

  return {
    api,
    popouts: page.popouts,
    dispose: () =>
    {
      api.dispose();
      element.remove();
      page.restore();
    },
  };
};

/**
 * Lets the page's timers and promises run: a window loading, the dock filling it, a deferred step.
 * @param {number} rounds How many turns of the timer queue to allow.
 * @returns {Promise<void>} Settles once they have run.
 */
const settle = async (rounds = 4): Promise<void> =>
{
  for (let round = 0; round < rounds; round++)
  {
    await new Promise<void>(resolve =>
    {
      setTimeout(resolve, 0);
    });
  }
};

/**
 * Lists each group's panels in order, the main window's first: how a test reads where everything ended up.
 * @param {DockviewApi} api The dock.
 * @returns {string[]} One entry per group, such as "grid:a+c" or "popout:b".
 */
const describeGroups = (api: DockviewApi): string[] =>
{
  return api.groups
    .filter(group => group.panels.length > 0 && group.api.isVisible)
    .map(group => `${group.api.location.type}:${group.panels.map(panel => panel.id).join('+')}`)
    .sort((left, right) => Number(right.startsWith('grid')) - Number(left.startsWith('grid')));
};

/**
 * One node of the main window's grid as the dock serializes it: a group, or a row or column of them.
 */
type GridNode = { type: 'leaf'; data: { views: string[] }; visible?: boolean } | { type: 'branch'; data: GridNode[] };

/**
 * Lists the main window's groups in the order they sit on screen, left to right and top to bottom, skipping any the
 * dock keeps hidden: where things are, which is what a person looking at the window sees.
 * @param {DockviewApi} api The dock.
 * @returns {string[]} One entry per group, its panels joined, such as "tree" then "a+b".
 */
const describeGrid = (api: DockviewApi): string[] =>
{
  const walk = (node: GridNode): string[] =>
  {
    if (node.type === 'branch')
    {
      return node.data.flatMap(walk);
    }

    return node.visible === false || node.data.views.length === 0 ? [] : [ node.data.views.join('+') ];
  };

  const { grid } = api.toJSON() as unknown as { grid: { root: GridNode } };
  return walk(grid.root);
};

/**
 * Drags a panel's tab with the pointer, the way the dock hears a mouse: pressed on the tab, moved past the dock's
 * threshold, then carried to where it is let go.
 * @param {IDockviewPanel} panel The panel whose tab is dragged.
 * @param {{ x: number, y: number }} to Where the pointer is let go, from the page's top left corner (also its screen spot).
 */
const dragTab = (panel: IDockviewPanel, to: { x: number; y: number }): void =>
{
  const tab = panel.group.element.querySelector(`[data-tab-panel-id="${panel.id}"]`) as HTMLElement;
  const pointer = { pointerId: 7, pointerType: 'mouse', button: 0, bubbles: true };
  tab.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: 20, clientY: 10, screenX: 20, screenY: 10 }));
  window.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: 40, clientY: 10, screenX: 40, screenY: 10 }));
  window.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: to.x, clientY: to.y, screenX: to.x, screenY: to.y }));
  window.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: to.x, clientY: to.y, screenX: to.x, screenY: to.y }));
};

export { createRealDock, describeGrid, describeGroups, dragTab, installDockPage, SCREEN, settle };
export type { FakePopout, RealDock };
