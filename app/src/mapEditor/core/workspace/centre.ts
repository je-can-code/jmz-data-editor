import { isJsonObject, type JsonObject } from '../model/json.ts';
import { PANEL_COMPONENTS, SINGLE_PANEL_IDS } from './panels.ts';

/**
 * The centre of the workspace is the group holding the start panel. The start panel never leaves it, so the group can
 * never empty, and an empty group is the only kind the dock takes away: the centre stays put, at its size, whatever is
 * closed, dragged off or torn out of it. Maps open there. While anything else shares the group the start panel stays
 * behind it with its tab hidden; once nothing else is left it shows, saying how to open a map.
 */

/**
 * One group of the dock, as the rules for the centre see it.
 */
type CentreCandidate = {
  readonly id: string;

  /**
   * Whether the group sits in the main window's grid, rather than in a torn-out window or floating over the grid.
   */
  readonly inMainWindow: boolean;

  /**
   * The group's panels, by id, in tab order.
   */
  readonly panelIds: readonly string[];

  /**
   * How many of those panels show a map.
   */
  readonly maps: number;

  /**
   * The group's area on screen, in square pixels.
   */
  readonly area: number;
};

/**
 * Which group a layout's centre is once it is laid out: the one already holding the start panel, the one the start
 * panel is to join, or none, when the layout has nowhere a centre could be and is to be laid out afresh.
 */
type CentreChoice =
  | { readonly kind: 'kept'; readonly groupId: string }
  | { readonly kind: 'adopted'; readonly groupId: string }
  | { readonly kind: 'none' };

/**
 * What a drag carries, as the dock describes it: the group it started in, and the panel, or null for a whole group.
 */
type DraggedItem = {
  readonly groupId: string;
  readonly panelId: string | null;
};

/**
 * Reports whether a panel is the start panel, the one that holds the centre.
 * @param {string} panelId The panel's id.
 * @returns {boolean} True for the start panel.
 */
const isStartPanel = (panelId: string): boolean =>
{
  return panelId === SINGLE_PANEL_IDS.start;
};

/**
 * Reports whether the start panel's tab hides: whenever anything else shares its group, since the start panel only
 * stands in for the maps that are not there.
 * @param {readonly string[]} panelIds The group's panels, by id.
 * @returns {boolean} True while the group holds anything but the start panel.
 */
const isStartTabHidden = (panelIds: readonly string[]): boolean =>
{
  return panelIds.some(panelId => isStartPanel(panelId) === false);
};

/**
 * Works out which panel the centre should bring forward: when the start panel is in front while other panels share
 * its group (a map put back from a closed window comes home behind it), the last of them in tab order, so the group
 * never shows the start panel, whose tab is hidden, in place of a map it holds.
 * @param {readonly string[]} panelIds The centre's panels, by id, in tab order.
 * @param {string | null} activeId The panel in front, or null for none.
 * @returns {string | null} The panel to bring forward, or null when nothing needs to move.
 */
const panelToBringForward = (panelIds: readonly string[], activeId: string | null): string | null =>
{
  if (activeId === null || isStartPanel(activeId) === false)
  {
    return null;
  }

  const others = panelIds.filter(panelId => isStartPanel(panelId) === false);
  return others[others.length - 1] ?? null;
};

/**
 * Picks a laid-out layout's centre:
 * - the main window's group holding the start panel, kept as it is;
 * - otherwise, as in a layout saved before the centre was permanent, the main window's group showing maps that takes
 *   the most room, which the start panel joins;
 * - otherwise none: with no start panel and no maps in the main window there is nowhere a centre could be.
 * @param {readonly CentreCandidate[]} groups Every group of the dock, wherever it is.
 * @returns {CentreChoice} The centre.
 */
const chooseCentre = (groups: readonly CentreCandidate[]): CentreChoice =>
{
  const home = groups.filter(group => group.inMainWindow);
  const holding = home.find(group => group.panelIds.some(isStartPanel));
  if (holding !== undefined)
  {
    return { kind: 'kept', groupId: holding.id };
  }

  const roomiest = home
    .filter(group => group.maps > 0)
    .reduce<CentreCandidate | null>((best, group) => (best === null || group.area > best.area ? group : best), null);
  return roomiest === null
    ? { kind: 'none' }
    : { kind: 'adopted', groupId: roomiest.id };
};

/**
 * Lists the panels shown in a saved layout's main window, by id: the groups of its grid, leaving out torn-out windows
 * and floating groups, which the layout keeps elsewhere.
 * @param {unknown} node A node of the saved grid: a group, or a row or column of them.
 * @returns {string[]} The panels in it.
 */
const panelsInGrid = (node: unknown): string[] =>
{
  if (isJsonObject(node) === false)
  {
    return [];
  }

  // a row or column holds its nodes in a list; a group holds its panels' ids as its views.
  const { data } = node;
  if (Array.isArray(data))
  {
    return data.flatMap(panelsInGrid);
  }

  const views = isJsonObject(data) ? data['views'] : undefined;
  return Array.isArray(views)
    ? views.filter((view): view is string => typeof view === 'string')
    : [];
};

/**
 * Reports whether a saved layout has somewhere a centre can be once it is rebuilt: the start panel, or any map, in its
 * main window. A layout saved before the centre was permanent, once its last map was closed, has neither, and maps
 * would open there only beside the map tree, so it is better laid out afresh than rebuilt.
 * @param {JsonObject} saved The saved layout, as the dock serialized it.
 * @returns {boolean} True when the main window shows the start panel or a map.
 */
const hasRoomForCentre = (saved: JsonObject): boolean =>
{
  const { grid, panels } = saved;
  const shown = isJsonObject(grid) ? panelsInGrid(grid['root']) : [];
  return shown.some(panelId =>
  {
    const state = isJsonObject(panels) ? panels[panelId] : undefined;
    return isStartPanel(panelId) || (isJsonObject(state) && state['contentComponent'] === PANEL_COMPONENTS.map);
  });
};

/**
 * Reports whether a drop must be refused because it would take the start panel out of the centre, or the centre
 * itself: the start panel's tab dragged anywhere, or the centre dragged whole into another group or to another place.
 * Everything else, maps dragged out of the centre and anything dragged into it included, is the dock's to do.
 * @param {DraggedItem | undefined} dragged What the drag carries, or undefined when it carries nothing of the dock's.
 * @param {string | null} centreId The centre's group, or null while there is none.
 * @returns {boolean} True when the drop must not happen.
 */
const refusesDrop = (dragged: DraggedItem | undefined, centreId: string | null): boolean =>
{
  if (dragged === undefined)
  {
    return false;
  }

  if (dragged.panelId !== null)
  {
    return isStartPanel(dragged.panelId);
  }

  return dragged.groupId === centreId;
};

export { chooseCentre, hasRoomForCentre, isStartPanel, isStartTabHidden, panelToBringForward, refusesDrop };
export type { CentreCandidate, CentreChoice, DraggedItem };
