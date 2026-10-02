import { isJsonObject, type JsonObject } from '../model/json.ts';

/**
 * How tall a collapsed group's tab strip is, in pixels: the dark theme's own tab strip height
 * (--dv-tabs-and-actions-container-height), which is also dockview's own built-in default size for a collapsed
 * edge group. Collapsing a group pins its height to exactly this, top and bottom, so only its tab bar shows and
 * nothing beneath it; expanding lifts both limits back to what they were and puts the height back too.
 */
const COLLAPSED_GROUP_HEIGHT = 35;

/**
 * What a collapsed group remembers, so it can be put back exactly the way it was: the height it had, and the
 * height limits it had, before collapsing pinned both to the strip's height. Restoring the limits as well as the
 * height, rather than assuming a default, keeps a group that already carried its own limits honest; none of this
 * workspace's panels do, but nothing here needs to assume that stays true.
 */
type CollapsedGroupState = {
  readonly height: number;
  readonly minimumHeight: number;
  readonly maximumHeight: number;
};

/**
 * The key a saved layout keeps collapsed groups' remembered sizes under, beside the dock's own keys and the
 * popout keeper's origins (see tearOut.ts's TORN_OUT_KEY). The dock reads only the keys it knows, so this one
 * rides along untouched.
 */
const COLLAPSED_KEY = 'collapsedGroups';

/**
 * Reads one saved group's remembered size, refusing anything that does not read as one.
 * @param {unknown} value The saved value.
 * @returns {CollapsedGroupState | null} The state, or null.
 */
const readCollapsedGroup = (value: unknown): CollapsedGroupState | null =>
{
  if (isJsonObject(value) === false)
  {
    return null;
  }

  const { height, minimumHeight, maximumHeight } = value;
  if (typeof height !== 'number' || typeof minimumHeight !== 'number' || typeof maximumHeight !== 'number')
  {
    return null;
  }

  return { height, minimumHeight, maximumHeight };
};

/**
 * Reads the sizes a saved layout kept for its collapsed groups, skipping any entry that does not read as one.
 * @param {JsonObject} saved The saved layout.
 * @returns {Map<string, CollapsedGroupState>} The sizes, by group id.
 */
const readCollapsedGroups = (saved: JsonObject): Map<string, CollapsedGroupState> =>
{
  const kept = saved[COLLAPSED_KEY];
  const collapsed = new Map<string, CollapsedGroupState>();
  if (isJsonObject(kept))
  {
    Object.entries(kept).forEach(([ groupId, value ]) =>
    {
      const state = readCollapsedGroup(value);
      if (state !== null)
      {
        collapsed.set(groupId, state);
      }
    });
  }

  return collapsed;
};

/**
 * Adds collapsed groups' remembered sizes to a layout about to be saved, so a group collapsed when the layout was
 * saved comes back collapsed, still remembering the size to restore on expanding.
 * @param {JsonObject} layout The layout, as the dock serializes it.
 * @param {ReadonlyMap<string, CollapsedGroupState>} collapsed The sizes, by group id.
 * @returns {JsonObject} The layout with its collapsed sizes, or unchanged when there are none.
 */
const withCollapsedGroups = (layout: JsonObject, collapsed: ReadonlyMap<string, CollapsedGroupState>): JsonObject =>
{
  if (collapsed.size === 0)
  {
    return layout;
  }

  const kept: JsonObject = {};
  collapsed.forEach((state, groupId) =>
  {
    kept[groupId] = { height: state.height, minimumHeight: state.minimumHeight, maximumHeight: state.maximumHeight };
  });
  return { ...layout, [COLLAPSED_KEY]: kept };
};

export { COLLAPSED_GROUP_HEIGHT, COLLAPSED_KEY, readCollapsedGroups, withCollapsedGroups };
export type { CollapsedGroupState };
