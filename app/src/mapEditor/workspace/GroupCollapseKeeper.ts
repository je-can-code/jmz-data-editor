import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { COLLAPSED_GROUP_HEIGHT, type CollapsedGroupState } from '../core/workspace/collapse.ts';
import { centreOf } from './CentreKeeper.ts';

/**
 * Collapses a group to just its tab bar, in place, and restores it to the height it had before: what a chevron on
 * a side panel's tab and a double click on the tab both do. Collapsing pins the group's height, top and bottom, to
 * the strip's height, so dragging a splitter cannot reopen it by accident; the room it gives up goes to whatever
 * else shares its branch, exactly as closing a panel would share it out. Expanding lifts the pin and puts the
 * group back at the height it had, never a guess: the minimum and maximum it carries are restored, too, so a
 * group that already carried its own limits (none of this workspace's panels do, but nothing here assumes that
 * stays true) comes back with them rather than with the strip's.
 *
 * Which group holds a collapsed state, and what to restore it to, is kept here by group id; a group not present in
 * it is not collapsed. The centre, the group the start panel holds, never collapses: nothing here refuses it
 * directly, since nothing ever asks to collapse it (see panels.ts's isCollapsibleKind and this class's own
 * isCollapsible), the same way CentreKeeper's own rules keep the start panel from ever leaving its group.
 */
class GroupCollapseKeeper
{
  #api: DockviewApi | null = null;

  /**
   * The size kept for each collapsed group, by group id: what the saved layout keeps alongside it (see
   * core/workspace/collapse.ts). A group's presence here is what "collapsed" means; there is no separate flag.
   */
  #collapsed = new Map<string, CollapsedGroupState>();

  /**
   * Starts keeping collapsed groups for a dock: forgetting any group that goes away before it is ever expanded.
   * @param {DockviewApi} api The dock.
   * @returns {() => void} Stops keeping them.
   */
  attach(api: DockviewApi): () => void
  {
    this.#api = api;
    const subscription = api.onDidRemoveGroup(group => this.#collapsed.delete(group.id));
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
   * The size kept for each collapsed group, by group id: what the saved layout keeps.
   * @returns {ReadonlyMap<string, CollapsedGroupState>} The sizes.
   */
  get collapsed(): ReadonlyMap<string, CollapsedGroupState>
  {
    return this.#collapsed;
  }

  /**
   * Takes on the sizes a saved layout kept, once the dock has rebuilt that layout, pinning every group they name
   * back to the collapsed strip height. A group the saved layout no longer holds is dropped.
   * @param {ReadonlyMap<string, CollapsedGroupState>} saved The saved sizes, by group id.
   */
  adopt(saved: ReadonlyMap<string, CollapsedGroupState>): void
  {
    const api = this.#api;
    if (api === null)
    {
      return;
    }

    this.#collapsed = new Map([ ...saved ].filter(([ groupId ]) => api.groups.some(group => group.id === groupId)));
    this.#collapsed.forEach((_state, groupId) =>
    {
      const group = api.groups.find(each => each.id === groupId);
      if (group !== undefined)
      {
        this.#pin(group);
      }
    });
  }

  /**
   * Reports whether a group is collapsed right now.
   * @param {DockviewGroupPanel} group The group.
   * @returns {boolean} True while it is collapsed.
   */
  isCollapsed(group: DockviewGroupPanel): boolean
  {
    return this.#collapsed.has(group.id);
  }

  /**
   * Reports whether a group may collapse at all: every group but the centre, which holds the maps open and must
   * always stay at the size it was given.
   * @param {DockviewGroupPanel} group The group.
   * @returns {boolean} True unless the group is the centre.
   */
  isCollapsible(group: DockviewGroupPanel): boolean
  {
    const api = this.#api;
    return api !== null && group.id !== centreOf(api)?.id;
  }

  /**
   * Collapses a group to its tab strip, or restores it to the height it had before collapsing: what the tab's
   * chevron and a double click on the tab both do. Refuses the centre outright, the same guarantee CentreKeeper
   * gives the start panel against tearing out, rather than counting on every caller to have checked isCollapsible
   * first.
   * @param {DockviewGroupPanel} group The group.
   */
  toggle(group: DockviewGroupPanel): void
  {
    if (this.isCollapsible(group) === false)
    {
      return;
    }

    if (this.isCollapsed(group))
    {
      this.#restore(group);
    }
    else
    {
      this.#collapse(group);
    }
  }

  /**
   * Restores a group to the height it had, if it was collapsed; otherwise leaves it alone. What choosing an open,
   * collapsed panel from the Panels menu does, bringing it fully back rather than toggling it shut.
   * @param {DockviewGroupPanel} group The group.
   */
  expand(group: DockviewGroupPanel): void
  {
    if (this.isCollapsed(group))
    {
      this.#restore(group);
    }
  }

  /**
   * Remembers a group's current height and height limits, then pins it to the collapsed strip height.
   * @param {DockviewGroupPanel} group The group.
   */
  #collapse(group: DockviewGroupPanel): void
  {
    this.#collapsed.set(group.id, { height: group.api.height, minimumHeight: group.minimumHeight, maximumHeight: group.maximumHeight });
    this.#pin(group);
  }

  /**
   * Lifts a group's pinned height limits and puts its height back, forgetting its remembered size.
   * @param {DockviewGroupPanel} group The group.
   */
  #restore(group: DockviewGroupPanel): void
  {
    const state = this.#collapsed.get(group.id);
    this.#collapsed.delete(group.id);
    if (state !== undefined)
    {
      group.api.setConstraints({ minimumHeight: state.minimumHeight, maximumHeight: state.maximumHeight });
      group.api.setSize({ height: state.height });
    }
  }

  /**
   * Pins a group's height, top and bottom, to the collapsed strip height, and sizes it there now.
   * @param {DockviewGroupPanel} group The group.
   */
  #pin(group: DockviewGroupPanel): void
  {
    group.api.setConstraints({ minimumHeight: COLLAPSED_GROUP_HEIGHT, maximumHeight: COLLAPSED_GROUP_HEIGHT });
    group.api.setSize({ height: COLLAPSED_GROUP_HEIGHT });
  }
}

export { GroupCollapseKeeper };
