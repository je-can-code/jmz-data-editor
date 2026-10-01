import type { DockviewApi, DockviewGroupPanel } from 'dockview-react';
import { chooseCentre, isStartPanel, panelToBringForward, refusesDrop, type CentreCandidate } from '../core/workspace/centre.ts';
import { PANEL_COMPONENTS, SINGLE_PANEL_IDS } from '../core/workspace/panels.ts';

/**
 * Describes a group the way the rules for the centre see it.
 * @param {DockviewGroupPanel} group The group.
 * @returns {CentreCandidate} Its id, where it is, its panels, how many show maps, and the room it takes.
 */
const candidateOf = (group: DockviewGroupPanel): CentreCandidate =>
{
  return {
    id: group.id,
    inMainWindow: group.api.location.type === 'grid',
    panelIds: group.panels.map(panel => panel.id),
    maps: group.panels.filter(panel => panel.api.component === PANEL_COMPONENTS.map).length,
    area: group.api.width * group.api.height,
  };
};

/**
 * Finds a dock's centre: the main window's group holding the start panel.
 * @param {DockviewApi} api The dock.
 * @returns {DockviewGroupPanel | null} The centre, or null while the dock has none.
 */
const centreOf = (api: DockviewApi): DockviewGroupPanel | null =>
{
  const start = api.getPanel(SINGLE_PANEL_IDS.start);
  return start === undefined || start.api.location.type !== 'grid'
    ? null
    : start.group;
};

/**
 * Settles a layout just rebuilt from a saved one: keeps its centre, or, for a layout saved before the centre was
 * permanent, gives the start panel to the main window's group showing maps that takes the most room, behind its maps.
 * A start panel left anywhere else, a torn-out window say, is brought home to it.
 * @param {DockviewApi} api The dock, laid out.
 * @returns {'kept' | 'adopted' | 'none'} Which it did; none when the layout has nowhere a centre could be, and wants
 * laying out afresh.
 */
const settleCentre = (api: DockviewApi): 'kept' | 'adopted' | 'none' =>
{
  const choice = chooseCentre(api.groups.map(candidateOf));
  if (choice.kind !== 'adopted')
  {
    return choice.kind;
  }

  const group = api.groups.find(each => each.id === choice.groupId) as DockviewGroupPanel;
  const stray = api.getPanel(SINGLE_PANEL_IDS.start);
  if (stray !== undefined)
  {
    stray.api.moveTo({ group, position: 'center', index: 0, skipSetActive: true });
    return 'adopted';
  }

  api.addPanel({
    id: SINGLE_PANEL_IDS.start,
    component: PANEL_COMPONENTS.start,
    title: 'Start',
    position: { referenceGroup: group, direction: 'within', index: 0 },
    inactive: true,
  });
  return 'adopted';
};

/**
 * Keeps the centre of the workspace, the group maps open into, for as long as the workspace lives (see core/workspace/
 * centre.ts for the rules). The start panel holds it: the dock only ever takes away a group left empty, and the start
 * panel never leaves, so closing, dragging off or tearing out the last map leaves the centre where it was, at its
 * size, showing the start panel. Neighbours never spread into the space, and the next map opens there, large.
 *
 * Nothing the person does can move the start panel: its tab offers no close, no window and no menu, and takes no drag
 * (see WorkspaceTab), the tear-out keeper never tears it out, and this keeper refuses any drop that would carry the
 * start panel, or the centre whole, somewhere else. While other panels share the centre, the start panel stays behind
 * them, out of the tab strip's overflow list as well as out of sight.
 */
class CentreKeeper
{
  /**
   * The centre whose tab strip has been told to leave the start panel out of its overflow list.
   */
  #listedFor: DockviewGroupPanel | null = null;

  /**
   * Starts keeping the dock's centre: refusing drops that would take the start panel or the centre away, and keeping
   * the start panel behind whatever else is in the centre after every change.
   * @param {DockviewApi} api The dock.
   * @returns {() => void} Stops keeping it.
   */
  attach(api: DockviewApi): () => void
  {
    const subscriptions = [
      api.onWillDrop(event =>
      {
        if (refusesDrop(event.getData(), centreOf(api)?.id ?? null))
        {
          event.preventDefault();
        }
      }),
      api.onDidLayoutChange(() => this.#keepStartBehind(api)),
    ];

    return () =>
    {
      subscriptions.forEach(subscription => subscription.dispose());
      this.#listedFor = null;
    };
  }

  /**
   * Keeps the start panel behind anything else in the centre, and out of the centre's overflow list, which would
   * otherwise list its hidden tab whenever the maps' tabs overflow the strip.
   * @param {DockviewApi} api The dock.
   */
  #keepStartBehind(api: DockviewApi): void
  {
    const group = centreOf(api);
    if (group === null)
    {
      return;
    }

    if (this.#listedFor !== group)
    {
      this.#listedFor = group;
      group.header.setOverflowExclude(isStartPanel);
    }

    const forward = panelToBringForward(group.panels.map(panel => panel.id), group.activePanel?.id ?? null);
    if (forward !== null)
    {
      group.panels.find(panel => panel.id === forward)?.api.setActive();
    }
  }
}

export { CentreKeeper, centreOf, settleCentre };
