import type { KeyPress } from './shortcuts.ts';
import { isJsonObject, type JsonObject } from '../model/json.ts';

/**
 * Collapsing a whole side folds every panel down the left, or down the right, of the centre away at once: what a
 * browser's own side panels do when minimized, and what Workspace's two edge buttons and their shortcuts act
 * through. It sits beside collapse.ts, which folds one group to its tab bar, rather than inside it: that one pins a
 * group's height, this one pins every group of a side's width, and the two compose freely, since a group individually
 * collapsed to its tab bar keeps that height exactly as it was while its side folds and unfolds around it.
 *
 * Which groups count as a side is read fresh off the grid every time, by where its root-level columns sit relative to
 * the centre (see sideGroupsOf): a freshly laid-out workspace keeps exactly one column either side (see
 * defaultLayout.ts), and a layout dragged into more columns keeps every one of them, so a side's toggle always
 * catches the whole thing, however far it has been rearranged from the default. The centre's own column is never
 * collected into either side, so it can never fold, the same guarantee CentreKeeper gives the start panel against
 * being torn out.
 */

/**
 * Which side of the centre a column of panels sits on.
 */
type Side = 'left' | 'right';

/**
 * Both sides, in the order a reader expects them.
 */
const SIDES: readonly Side[] = [ 'left', 'right' ];

/**
 * How wide a side pins to once collapsed: gone outright, since its own button and shortcut bring it back, not a
 * splitter someone could drag by accident the way a sliver would invite.
 */
const COLLAPSED_SIDE_WIDTH = 0;

/**
 * What a collapsed side remembers for one of its groups, so it can be put back exactly the way it was: the width it
 * had, and the width limits it had, before collapsing pinned both to zero. Kept per group, not once for the whole
 * side, because a side can hold more than one root-level column (see sideGroupsOf), whose groups need not share a
 * limit even though they shared a width at the moment they collapsed.
 */
type CollapsedSideGroupState = {
  readonly width: number;
  readonly minimumWidth: number;
  readonly maximumWidth: number;
};

/**
 * The key a saved layout keeps collapsed sides' remembered sizes under, beside collapse.ts's own key and the popout
 * keeper's origins. The dock reads only the keys it knows, so this one rides along untouched.
 */
const SIDE_COLLAPSED_KEY = 'collapsedSides';

/**
 * Reports whether a string names one of the two sides, narrowing it for a saved layout's untyped keys.
 * @param {string} value The key.
 * @returns {boolean} True for "left" or "right".
 */
const isSide = (value: string): value is Side =>
{
  return value === 'left' || value === 'right';
};

/**
 * Collects every leaf group's id beneath a node of the main window's grid, depth first: the node itself if it is a
 * leaf, or everything beneath it if it is a row or column. Mirrors centre.ts's panelsInGrid, which walks the same
 * shape for panel ids rather than the group holding them.
 * @param {unknown} node A node of the grid: a group, or a row or column of them.
 * @returns {string[]} The leaf group ids beneath it, in on-screen order.
 */
const leafGroupIds = (node: unknown): string[] =>
{
  if (isJsonObject(node) === false)
  {
    return [];
  }

  const { data } = node;
  if (Array.isArray(data))
  {
    return data.flatMap(leafGroupIds);
  }

  const id = isJsonObject(data) ? data['id'] : undefined;
  return typeof id === 'string' ? [ id ] : [];
};

/**
 * Splits the main window's root-level columns into the ones left of the centre and the ones right of it, by every
 * leaf group id each one holds.
 * @param {unknown} root The grid's root node, as the dock serializes it.
 * @param {string} centreGroupId The centre's group id; which root-level column holds it decides where the split
 * falls.
 * @returns {Readonly<Record<Side, readonly string[]>>} The leaf group ids on each side, in on-screen order; both
 * empty when the root holds no columns of its own or the centre's column cannot be found.
 */
const sideGroupsOf = (root: unknown, centreGroupId: string): Readonly<Record<Side, readonly string[]>> =>
{
  const none: Readonly<Record<Side, readonly string[]>> = { left: [], right: [] };
  if (isJsonObject(root) === false || Array.isArray(root['data']) === false)
  {
    return none;
  }

  const columns = root['data'] as unknown[];
  const centreIndex = columns.findIndex(column => leafGroupIds(column).includes(centreGroupId));
  return centreIndex === -1
    ? none
    : {
      left: columns.slice(0, centreIndex).flatMap(leafGroupIds),
      right: columns.slice(centreIndex + 1).flatMap(leafGroupIds),
    };
};

/**
 * Reads one saved group's remembered width, refusing anything that does not read as one.
 * @param {unknown} value The saved value.
 * @returns {CollapsedSideGroupState | null} The state, or null.
 */
const readCollapsedSideGroup = (value: unknown): CollapsedSideGroupState | null =>
{
  if (isJsonObject(value) === false)
  {
    return null;
  }

  const { width, minimumWidth, maximumWidth } = value;
  if (typeof width !== 'number' || typeof minimumWidth !== 'number' || typeof maximumWidth !== 'number')
  {
    return null;
  }

  return { width, minimumWidth, maximumWidth };
};

/**
 * Reads the sizes a saved layout kept for its collapsed sides, skipping any side or entry that does not read as one.
 * @param {JsonObject} saved The saved layout.
 * @returns {Map<Side, Map<string, CollapsedSideGroupState>>} The sizes, by group id, for each side collapsed.
 */
const readCollapsedSides = (saved: JsonObject): Map<Side, Map<string, CollapsedSideGroupState>> =>
{
  const kept = saved[SIDE_COLLAPSED_KEY];
  const collapsed = new Map<Side, Map<string, CollapsedSideGroupState>>();
  if (isJsonObject(kept) === false)
  {
    return collapsed;
  }

  Object.entries(kept).forEach(([ side, groups ]) =>
  {
    if (isSide(side) === false || isJsonObject(groups) === false)
    {
      return;
    }

    const states = new Map<string, CollapsedSideGroupState>();
    Object.entries(groups).forEach(([ groupId, value ]) =>
    {
      const state = readCollapsedSideGroup(value);
      if (state !== null)
      {
        states.set(groupId, state);
      }
    });

    if (states.size > 0)
    {
      collapsed.set(side, states);
    }
  });

  return collapsed;
};

/**
 * Adds collapsed sides' remembered sizes to a layout about to be saved, so a side collapsed when the layout was
 * saved comes back collapsed, still remembering each of its groups' widths to restore on expanding.
 * @param {JsonObject} layout The layout, as the dock serializes it.
 * @param {ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>} collapsed The sizes, by group id, for each
 * side collapsed.
 * @returns {JsonObject} The layout with its collapsed sides, or unchanged when neither side is collapsed.
 */
const withCollapsedSides = (layout: JsonObject, collapsed: ReadonlyMap<Side, ReadonlyMap<string, CollapsedSideGroupState>>): JsonObject =>
{
  if (collapsed.size === 0)
  {
    return layout;
  }

  const kept: JsonObject = {};
  collapsed.forEach((groups, side) =>
  {
    const states: JsonObject = {};
    groups.forEach((state, groupId) =>
    {
      states[groupId] = { width: state.width, minimumWidth: state.minimumWidth, maximumWidth: state.maximumWidth };
    });
    kept[side] = states;
  });
  return { ...layout, [SIDE_COLLAPSED_KEY]: kept };
};

/**
 * Works out which side, if any, a key press asks to collapse or restore: Ctrl+B the left, Ctrl+Shift+B the right,
 * chosen because this editor's own shortcuts (see shortcuts.ts) and its map-local ones (see eventKeys.ts) claim
 * neither. Held with Alt, or without Ctrl (or Cmd), asks nothing; the caller still owns checking for a text field,
 * since what counts as one is shortcuts.ts's to say.
 * @param {KeyPress} press The key press.
 * @returns {Side | null} The side, or null when the press is not this shortcut.
 */
const sideForShortcut = (press: KeyPress): Side | null =>
{
  if (press.altKey || (press.ctrlKey || press.metaKey) === false || press.key.toLowerCase() !== 'b')
  {
    return null;
  }

  return press.shiftKey ? 'right' : 'left';
};

export { COLLAPSED_SIDE_WIDTH, SIDE_COLLAPSED_KEY, SIDES, readCollapsedSides, sideForShortcut, sideGroupsOf, withCollapsedSides };
export type { CollapsedSideGroupState, Side };
