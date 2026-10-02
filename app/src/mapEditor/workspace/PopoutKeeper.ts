import type { DockviewApi, DockviewGroupPanel, IDockviewPanel } from 'dockview-react';
import { PANEL_COMPONENTS } from '../core/workspace/panels.ts';
import {
  originIn,
  planReturns,
  releasedOutside,
  windowAtDrop,
  windowBeside,
  type DockGroupState,
  type PanelOrigin,
  type ReturnPlace,
  type ScreenRect,
} from '../core/workspace/tearOut.ts';

/**
 * The screen as Chromium describes it, which also says where the usable area starts; the DOM's own types leave those
 * two out.
 */
type ScreenArea = Screen & {
  readonly availLeft?: number;
  readonly availTop?: number;
};

/**
 * Reads the part of the screen windows may use, as a window sees it.
 * @param {Window} host The window.
 * @returns {ScreenRect} The usable area, in CSS pixels.
 */
const screenAreaOf = (host: Window): ScreenRect =>
{
  const area = host.screen as ScreenArea;
  return { left: area.availLeft ?? 0, top: area.availTop ?? 0, width: area.availWidth, height: area.availHeight };
};

/**
 * Describes a group the way the rules for putting panels back see it.
 * @param {DockviewGroupPanel} group The group.
 * @returns {DockGroupState} Its id, whether it is in the main window, and its panels in tab order.
 */
const stateOf = (group: DockviewGroupPanel): DockGroupState =>
{
  return { id: group.id, inMainWindow: group.api.location.type === 'grid', panelIds: group.panels.map(panel => panel.id) };
};

/**
 * Options for a popout keeper.
 */
type PopoutKeeperOptions = {
  /**
   * The blank page of this app's origin that every torn-out window loads.
   */
  readonly popoutUrl: string;

  /**
   * Picks the group returning maps with no place of their own join: where the workspace opens maps, passing over any
   * group that holds nothing but panels on their way back.
   */
  readonly mapsGroup: (returning: ReadonlySet<string>) => DockviewGroupPanel | null;

  /**
   * Picks out the panels that never leave the main window, which are never torn out, by drag, button or menu. Left
   * out, any panel may be.
   */
  readonly staysDocked?: (panel: IDockviewPanel) => boolean;
};

/**
 * Tears panels out of the window they are docked in, one tab at a time, into windows of their own, and puts them back
 * where they came from.
 *
 * A tab dragged beyond its window's edge and let go there opens where it was let go, like a browser tab, and a tab's
 * button or menu opens it a little off where it sat. Tabs drag with pointer events rather than the browser's drag and
 * drop, so a drag never leaves the app: nothing is offered to the desktop or to other programs, which would otherwise
 * take a tab let go over them as text (a desktop makes a note of it). The keeper follows each tab drag's pointer to
 * where it is let go, and the dock drops nothing outside its window, so a release out there is the keeper's alone.
 * A panel the workspace keeps docked (the start panel, which holds the centre) is never torn out.
 *
 * Every panel leaving the main window is remembered with its origin: the group it left, its place among that group's
 * tabs, and the panels beside it. Closing a torn-out window brings all of its panels back that way, whatever layout
 * they were given inside it: each into the group it left, at its old place, rather than wherever the dock would drop
 * the groups a window was split into. The origins are kept with the saved layout, so a torn-out window that comes back
 * with the layout still returns its panels home.
 */
class PopoutKeeper
{
  #options: PopoutKeeperOptions;

  #api: DockviewApi | null = null;

  #origins = new Map<string, PanelOrigin>();

  #returning: Set<string> | null = null;

  /**
   * @param {PopoutKeeperOptions} options Where torn-out windows load, and where returning maps go.
   */
  constructor(options: PopoutKeeperOptions)
  {
    this.#options = options;
  }

  /**
   * Starts following the dock: its tab drags, panels moving between windows, and torn-out windows closing.
   * @param {DockviewApi} api The dock.
   * @returns {() => void} Stops following.
   */
  attach(api: DockviewApi): () => void
  {
    this.#api = api;
    const subscriptions = [
      api.onWillDragPanel(event => this.#followDrag(event.panel, event.nativeEvent)),
      api.onDidMovePanel(event => this.#panelMoved(event.panel, event.from)),
      api.onDidRemovePanel(panel => this.#origins.delete(panel.id)),
      api.onDidRemovePopoutGroup(() => this.#collectReturns()),
      api.onDidOpenPopoutWindowFail(() => this.#collectReturns()),
    ];

    return () =>
    {
      subscriptions.forEach(subscription => subscription.dispose());
      if (this.#api === api)
      {
        this.#api = null;
      }
    };
  }

  /**
   * The origins of the panels torn out of the main window, by panel id: what the saved layout keeps.
   * @returns {ReadonlyMap<string, PanelOrigin>} The origins.
   */
  get origins(): ReadonlyMap<string, PanelOrigin>
  {
    return this.#origins;
  }

  /**
   * Takes on the origins a saved layout kept, once the dock has rebuilt that layout; origins of panels it no longer
   * holds are dropped.
   * @param {ReadonlyMap<string, PanelOrigin>} origins The saved origins, by panel id.
   */
  adopt(origins: ReadonlyMap<string, PanelOrigin>): void
  {
    const api = this.#api;
    this.#origins = new Map([ ...origins ].filter(([ panelId ]) => api !== null && api.getPanel(panelId) !== undefined));
  }

  /**
   * Reports whether a panel already has a window to itself: torn out, and the only panel in its window. Tearing it out
   * again would only swap one window for another.
   * @param {IDockviewPanel} panel The panel.
   * @returns {boolean} True when nothing else shares its window.
   */
  isAloneInWindow(panel: IDockviewPanel): boolean
  {
    if (this.#api === null || panel.api.location.type !== 'popout')
    {
      return false;
    }

    const host = panel.api.getWindow();
    return this.#api.panels.filter(each => each.api.getWindow() === host).length === 1;
  }

  /**
   * Opens one panel in a window of its own, leaving the rest of its group where they are.
   * @param {IDockviewPanel} panel The panel.
   * @param {ScreenRect} bounds Where the window opens, on the screen.
   * @returns {Promise<boolean>} True once the window is open; false when it could not be, or the panel has gone.
   */
  tearOut(panel: IDockviewPanel, bounds: ScreenRect): Promise<boolean>
  {
    return this.#open(panel, bounds, this.#originNow(panel));
  }

  /**
   * Opens one panel in a window of its own, a little off where it is docked: what a tab's button does.
   * @param {IDockviewPanel} panel The panel.
   * @returns {Promise<boolean>} True once the window is open.
   */
  tearOutBeside(panel: IDockviewPanel): Promise<boolean>
  {
    const host = panel.api.getWindow();
    const { group } = panel;
    const corner = group.element.getBoundingClientRect();
    const onScreen = { left: host.screenX + corner.left, top: host.screenY + corner.top, width: group.api.width, height: group.api.height };
    return this.tearOut(panel, windowBeside(onScreen, screenAreaOf(host)));
  }

  /**
   * Puts one torn-out panel back into the main window where it came from. The last panel in a window closes the window
   * instead, which brings it back just as closing the window by hand does.
   * @param {IDockviewPanel} panel The panel.
   */
  putBack(panel: IDockviewPanel): void
  {
    const api = this.#api;
    if (api === null || panel.api.location.type !== 'popout')
    {
      return;
    }

    if (this.isAloneInWindow(panel))
    {
      panel.api.getWindow().close();
      return;
    }

    this.#bringHome(api, [ panel ]);
  }

  /**
   * Puts back every remembered panel found in the main window again, along with any others just brought into it:
   * after a torn-out window closes, or when one could not be opened. A panel whose group is not on the page yet, such
   * as one waiting for a window the saved layout is reopening, is left for that window.
   * @param {ReadonlySet<string>} arrived Panels just brought into the main window, remembered or not.
   */
  returnStrays(arrived: ReadonlySet<string> = new Set()): void
  {
    const api = this.#api;
    if (api === null)
    {
      return;
    }

    const strays = api.panels.filter(panel => panel.api.location.type === 'grid'
      && panel.group.element.isConnected
      && (this.#origins.has(panel.id) || arrived.has(panel.id)));
    this.#bringHome(api, strays);
  }

  /**
   * Opens one panel in a window of its own, remembering where it came from when it leaves the main window. A panel
   * moving from one torn-out window to another keeps the origin it had.
   * @param {IDockviewPanel} panel The panel.
   * @param {ScreenRect} bounds Where the window opens.
   * @param {PanelOrigin | null} origin Where it sat in the main window, or null when it is not there.
   * @returns {Promise<boolean>} True once the window is open.
   */
  async #open(panel: IDockviewPanel, bounds: ScreenRect, origin: PanelOrigin | null): Promise<boolean>
  {
    const api = this.#api;
    if (api === null || api.getPanel(panel.id) !== panel || this.isAloneInWindow(panel) || this.#options.staysDocked?.(panel) === true)
    {
      return false;
    }

    if (origin !== null)
    {
      this.#origins.set(panel.id, origin);
    }

    const opened = await api.addPopoutGroup(panel, { popoutUrl: this.#options.popoutUrl, position: bounds });

    // a window that never opened leaves its panel docked, with nothing to come back from.
    if (opened === false && panel.api.location.type === 'grid')
    {
      this.#origins.delete(panel.id);
    }

    return opened;
  }

  /**
   * Reads where a panel sits in the main window right now.
   * @param {IDockviewPanel} panel The panel.
   * @returns {PanelOrigin | null} Its origin, or null when it is not in the main window.
   */
  #originNow(panel: IDockviewPanel): PanelOrigin | null
  {
    return panel.api.location.type === 'grid'
      ? originIn(stateOf(panel.group), panel.id)
      : null;
  }

  /**
   * Follows one tab drag to where its pointer is let go, and tears the tab out there when that is beyond the edge of
   * the window it started in. The window it started in keeps hearing the pointer until then, even outside its edges.
   * Where the panel sat is read as the drag starts, before the dock has moved anything.
   * @param {IDockviewPanel} panel The panel whose tab is dragged.
   * @param {DragEvent | PointerEvent} start The event the drag started with.
   */
  #followDrag(panel: IDockviewPanel, start: DragEvent | PointerEvent): void
  {
    // the dock drags with pointers only; a browser drag would have left the app already.
    const pointer = 'pointerId' in start ? start : null;
    if (pointer === null)
    {
      return;
    }

    const host = panel.api.getWindow();
    const docked = { width: panel.group.api.width, height: panel.group.api.height };
    const origin = this.#originNow(panel);

    /**
     * Stops following once the drag's pointer is let go or lost, and tears the tab out if it was let go outside.
     * @param {PointerEvent} event The pointer's release or loss.
     */
    const finish = (event: PointerEvent) =>
    {
      if (event.pointerId !== pointer.pointerId)
      {
        return;
      }

      host.removeEventListener('pointerup', finish, true);
      host.removeEventListener('pointercancel', finish, true);
      const outside = releasedOutside({ x: event.clientX, y: event.clientY }, { width: host.innerWidth, height: host.innerHeight });
      if (event.type !== 'pointerup' || outside === false)
      {
        return;
      }

      // the dock ends its own drag on this same release; the window opens once it has.
      const bounds = windowAtDrop({ x: event.screenX, y: event.screenY }, docked, screenAreaOf(host));
      host.setTimeout(() =>
      {
        this.#open(panel, bounds, origin ?? this.#originNow(panel)).catch(() => undefined);
      }, 0);
    };

    host.addEventListener('pointerup', finish, true);
    host.addEventListener('pointercancel', finish, true);
  }

  /**
   * Hears a panel move. While a closed window's panels are being rehomed, each is noted to be put back once the dock
   * has finished; otherwise a panel dropped into a torn-out window from the main window remembers the group it left.
   * @param {IDockviewPanel} panel The panel.
   * @param {DockviewGroupPanel} from The group it left.
   */
  #panelMoved(panel: IDockviewPanel, from: DockviewGroupPanel): void
  {
    if (this.#returning !== null)
    {
      this.#returning.add(panel.id);
      return;
    }

    if (panel.api.location.type === 'popout' && from.api.location.type === 'grid' && this.#origins.has(panel.id) === false)
    {
      this.#origins.set(panel.id, { groupId: from.id, index: null, siblings: from.panels.map(each => each.id) });
    }
  }

  /**
   * Hears a torn-out window go, or fail to open. The dock rehomes its panels in one go, reporting each as it lands,
   * wherever it chooses (a window's first group back where it was torn from, any group made inside it at the main
   * window's edge), and the keeper puts every one of them back where it came from once the dock has finished.
   */
  #collectReturns(): void
  {
    if (this.#returning !== null)
    {
      return;
    }

    this.#returning = new Set();
    queueMicrotask(() =>
    {
      const arrived = this.#returning ?? new Set<string>();
      this.#returning = null;
      this.returnStrays(arrived);
    });
  }

  /**
   * Moves panels back into the main window by the plan for returning panels, and forgets their origins.
   * @param {DockviewApi} api The dock.
   * @param {readonly IDockviewPanel[]} panels The panels coming back.
   */
  #bringHome(api: DockviewApi, panels: readonly IDockviewPanel[]): void
  {
    if (panels.length === 0)
    {
      return;
    }

    const returning = new Set(panels.map(panel => panel.id));
    const plan = planReturns(
      panels.map(panel => ({ id: panel.id, isMap: panel.api.component === PANEL_COMPONENTS.map, origin: this.#origins.get(panel.id) })),
      api.groups.map(stateOf),
      this.#options.mapsGroup(returning)?.id ?? null,
    );

    // in the order they sat, so each lands at its old place among its group's tabs.
    const rank = (panel: IDockviewPanel) => plan.get(panel.id)?.index ?? Number.MAX_SAFE_INTEGER;
    [ ...panels ]
      .sort((left, right) => rank(left) - rank(right))
      .forEach(panel =>
      {
        const place = plan.get(panel.id);
        if (place !== undefined)
        {
          this.#moveInto(api, panel, place);
        }

        this.#origins.delete(panel.id);
      });
  }

  /**
   * Moves one panel into a group as a tab, at its place among the tabs, without bringing it to the front of a group
   * already showing something.
   * @param {DockviewApi} api The dock.
   * @param {IDockviewPanel} panel The panel.
   * @param {ReturnPlace} place Where it goes.
   */
  #moveInto(api: DockviewApi, panel: IDockviewPanel, place: ReturnPlace): void
  {
    const group = api.groups.find(each => each.id === place.groupId);
    if (group === undefined)
    {
      return;
    }

    // a group torn out whole waits hidden where it was until something comes back to it.
    if (group.api.isVisible === false)
    {
      group.api.setVisible(true);
    }

    const staying = panel.group === group;
    const index = place.index === null ? undefined : Math.min(place.index, group.panels.length - (staying ? 1 : 0));

    // already in its group, as the dock returns a window's first group: only its place among the tabs can be off.
    if (staying && (index === undefined || group.panels.indexOf(panel) === index || group.panels.length < 2))
    {
      return;
    }

    panel.api.moveTo({ group, position: 'center', index, skipSetActive: true });
  }
}

export { PopoutKeeper };
export type { PopoutKeeperOptions };
