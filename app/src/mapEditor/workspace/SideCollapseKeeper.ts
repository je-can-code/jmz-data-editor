import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { COLLAPSED_SIDE_WIDTH, sideGroupsOf, type CollapsedSideGroupState, type Side } from '../core/workspace/sideCollapse.ts';
import { centreOf } from './CentreKeeper.ts';

/**
 * Folds a whole side of the workspace away, or brings it back: what the two edge buttons in the top bar and their
 * keyboard shortcuts (see sideCollapse.ts's sideForShortcut) act through. Collapsing pins every group on that side to
 * zero width, so the room they gave up goes to the centre, exactly as closing them would share it out; expanding lifts
 * every pin and puts each group back at the width it had, never a guess, the minimum and maximum it carried included.
 *
 * Which groups a side holds is read fresh off the grid every time it is asked (see sideGroupsOf), rather than kept,
 * so a panel dragged into or out of a side between one toggle and the next is still caught correctly. What is kept,
 * once a side has actually collapsed, is only what the groups it caught need to be restored: the dock can be asked
 * about the live grid, but not about a width a group no longer has.
 *
 * The centre never collapses: nothing here refuses it directly, since sideGroupsOf can never place it in either
 * side's column to begin with, the same way GroupCollapseKeeper's own rules keep the start panel from ever leaving
 * its group.
 */
class SideCollapseKeeper
{
  #api: DockviewApi | null = null;

  /**
   * The width kept for each collapsed side's groups, by group id: what the saved layout keeps alongside it (see
   * core/workspace/sideCollapse.ts). A side's presence here is what "collapsed" means; there is no separate flag.
   */
  #collapsed = new Map<Side, Map<string, CollapsedSideGroupState>>();

  /**
   * Who to tell when a side collapses, expands, or is adopted from a saved layout: the top bar's two buttons, so
   * they redraw whichever of the two changed, however it changed.
   */
  #listeners = new Set<() => void>();

  /**
   * Starts keeping collapsed sides for a dock: forgetting any group that goes away before its side is ever expanded.
   * @param {DockviewApi} api The dock.
   * @returns {() => void} Stops keeping them.
   */
  attach(api: DockviewApi): () => void
  {
    this.#api = api;
    const subscription = api.onDidRemoveGroup(group => this.#forget(group.id));
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
   * Listens for every change to which sides are collapsed.
   * @param {() => void} listener Called after a toggle or an adopt.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * The width kept for each collapsed side's groups, by group id: what the saved layout keeps.
   * @returns {ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>} The sizes, for each side collapsed.
   */
  get collapsed(): ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>
  {
    return this.#collapsed;
  }

  /**
   * Reports whether a side is collapsed right now.
   * @param {Side} side The side.
   * @returns {boolean} True while it is collapsed.
   */
  isCollapsed(side: Side): boolean
  {
    return this.#collapsed.has(side);
  }

  /**
   * Takes on the sides a saved layout kept collapsed, once the dock has rebuilt that layout, pinning every group
   * they name back to zero width. A side whose groups the saved layout no longer holds collapses nothing.
   * @param {ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>} saved The saved sizes, by group id, for
   * each side.
   */
  adopt(saved: ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>): void
  {
    const api = this.#api;
    if (api === null)
    {
      return;
    }

    const next = new Map<Side, Map<string, CollapsedSideGroupState>>();
    saved.forEach((groups, side) =>
    {
      const kept = new Map([ ...groups ].filter(([ groupId ]) => api.groups.some(group => group.id === groupId)));
      if (kept.size > 0)
      {
        next.set(side, kept);
      }
    });

    this.#collapsed = next;
    this.#collapsed.forEach(groups => groups.forEach((_state, groupId) =>
    {
      const group = api.groups.find(each => each.id === groupId);
      if (group !== undefined)
      {
        this.#pin(group);
      }
    }));
    this.#notify();
  }

  /**
   * Collapses a side to zero width, or restores every group it caught to the width it had before collapsing: what
   * the top bar's edge buttons and their shortcuts both do.
   * @param {Side} side The side.
   */
  toggle(side: Side): void
  {
    if (this.isCollapsed(side))
    {
      this.#restore(side);
    }
    else
    {
      this.#collapse(side);
    }

    this.#notify();
  }

  /**
   * Remembers every group a side holds right now, with its width and width limits, then pins each to zero.
   * @param {Side} side The side.
   */
  #collapse(side: Side): void
  {
    const groups = this.#groupsFor(side);
    if (groups.length === 0)
    {
      return;
    }

    const state = new Map(groups.map(group => [ group.id, { width: group.api.width, minimumWidth: group.minimumWidth, maximumWidth: group.maximumWidth } ]));
    this.#collapsed.set(side, state);
    groups.forEach(group => this.#pin(group));
  }

  /**
   * Lifts the pinned width limits for every group a side's collapse caught, and puts each one's width back,
   * forgetting the side's remembered sizes. A group that closed while its side was collapsed is skipped; nothing
   * asks it for a width it no longer has. Without a dock to act on, nothing is forgotten either, rather than
   * reporting a side restored that nothing actually touched.
   * @param {Side} side The side.
   */
  #restore(side: Side): void
  {
    const api = this.#api;
    if (api === null)
    {
      return;
    }

    const state = this.#collapsed.get(side);
    this.#collapsed.delete(side);
    if (state === undefined)
    {
      return;
    }

    state.forEach((groupState, groupId) =>
    {
      const group = api.groups.find(each => each.id === groupId);
      if (group !== undefined)
      {
        group.api.setConstraints({ minimumWidth: groupState.minimumWidth, maximumWidth: groupState.maximumWidth });
        group.api.setSize({ width: groupState.width });
      }
    });
  }

  /**
   * Reads which groups a side holds right now, off the live grid.
   * @param {Side} side The side.
   * @returns {DockviewGroupPanel[]} Its groups, in on-screen order; empty while the dock has no centre.
   */
  #groupsFor(side: Side): DockviewGroupPanel[]
  {
    const api = this.#api;
    const centre = api === null ? null : centreOf(api);
    if (api === null || centre === null)
    {
      return [];
    }

    const { grid } = api.toJSON() as unknown as { grid: { root: unknown } };
    const ids = sideGroupsOf(grid.root, centre.id)[side];
    return ids
      .map(id => api.groups.find(group => group.id === id))
      .filter((group): group is DockviewGroupPanel => group !== undefined);
  }

  /**
   * Pins a group's width, left and right, to zero, and sizes it there now.
   * @param {DockviewGroupPanel} group The group.
   */
  #pin(group: DockviewGroupPanel): void
  {
    group.api.setConstraints({ minimumWidth: COLLAPSED_SIDE_WIDTH, maximumWidth: COLLAPSED_SIDE_WIDTH });
    group.api.setSize({ width: COLLAPSED_SIDE_WIDTH });
  }

  /**
   * Drops a group that has gone from whichever side's remembered sizes named it, so nothing is kept for a group the
   * dock no longer holds. A side left with nothing to restore is forgotten outright, the same as restoring it by hand.
   * @param {string} groupId The group.
   */
  #forget(groupId: string): void
  {
    this.#collapsed.forEach((groups, side) =>
    {
      if (groups.has(groupId))
      {
        groups.delete(groupId);
        if (groups.size === 0)
        {
          this.#collapsed.delete(side);
        }
      }
    });
  }

  /**
   * Tells every listener a side's collapsed state may have changed.
   */
  #notify(): void
  {
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { SideCollapseKeeper };
