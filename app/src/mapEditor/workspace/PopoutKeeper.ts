import type { DockviewApi, IDockviewPanel } from 'dockview-react';
import { releasedOutside, windowAtDrop, windowBeside, type ScreenRect } from '../core/workspace/tearOut.ts';

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
 * Options for a popout keeper.
 */
type PopoutKeeperOptions = {
  /**
   * The blank page of this app's origin that every torn-out window loads.
   */
  readonly popoutUrl: string;
};

/**
 * Tears panels out of the window they are docked in, one tab at a time, into windows of their own: a tab dragged
 * beyond its window's edge and let go there opens where it was let go, like a browser tab, and a tab's button or menu
 * opens it a little off where it sat.
 *
 * Tabs drag with pointer events rather than the browser's drag and drop, so a drag never leaves the app: nothing is
 * offered to the desktop or to other programs, which would otherwise take a tab let go over them as text (a desktop
 * makes a note of it). The keeper follows each tab drag's pointer to where it is let go, and the dock drops nothing
 * outside its window, so a release out there is the keeper's alone.
 */
class PopoutKeeper
{
  #popoutUrl: string;

  #api: DockviewApi | null = null;

  /**
   * @param {PopoutKeeperOptions} options Where torn-out windows load.
   */
  constructor(options: PopoutKeeperOptions)
  {
    this.#popoutUrl = options.popoutUrl;
  }

  /**
   * Starts following the dock's tab drags.
   * @param {DockviewApi} api The dock.
   * @returns {() => void} Stops following.
   */
  attach(api: DockviewApi): () => void
  {
    this.#api = api;
    const subscription = api.onWillDragPanel(event => this.#followDrag(event.panel, event.nativeEvent));
    return () =>
    {
      subscription.dispose();
      if (this.#api === api)
      {
        this.#api = null;
      }
    };
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
    const api = this.#api;
    if (api === null || api.getPanel(panel.id) !== panel || this.isAloneInWindow(panel))
    {
      return Promise.resolve(false);
    }

    return api.addPopoutGroup(panel, { popoutUrl: this.#popoutUrl, position: bounds });
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
   * Follows one tab drag to where its pointer is let go, and tears the tab out there when that is beyond the edge of
   * the window it started in. The window it started in keeps hearing the pointer until then, even outside its edges.
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
        this.tearOut(panel, bounds).catch(() => undefined);
      }, 0);
    };

    host.addEventListener('pointerup', finish, true);
    host.addEventListener('pointercancel', finish, true);
  }
}

export { PopoutKeeper };
export type { PopoutKeeperOptions };
