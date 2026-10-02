import { describe, expect, it } from 'vitest';
import { COLLAPSED_GROUP_HEIGHT, readCollapsedGroups, withCollapsedGroups, type CollapsedGroupState } from '../../../../src/mapEditor/core/workspace/collapse.ts';

/*
 * A collapsed group's remembered size rides along with the saved layout, beside the dock's own keys and the popout
 * keeper's origins, so a group collapsed when the layout was saved comes back collapsed and still knows the height
 * to restore on expanding. A saved layout with nothing collapsed is handed back unchanged, and anything saved by
 * hand, or by a future editor, that does not read as a remembered size is skipped rather than trusted.
 */
describe('collapse', () =>
{
  it('rides along with a saved layout and reads back the same', () =>
  {
    // Arrange.
    const collapsed = new Map<string, CollapsedGroupState>([
      [ '3', { height: 220, minimumHeight: 100, maximumHeight: Number.MAX_SAFE_INTEGER } ],
      [ '4', { height: 180, minimumHeight: 0, maximumHeight: 400 } ],
    ]);

    // Act.
    const saved = withCollapsedGroups({ grid: {}, panels: {} }, collapsed);

    // Assert.
    expect([ Object.keys(saved), Object.fromEntries(readCollapsedGroups(saved)) ])
      .toStrictEqual([
        [ 'grid', 'panels', 'collapsedGroups' ],
        {
          '3': { height: 220, minimumHeight: 100, maximumHeight: Number.MAX_SAFE_INTEGER },
          '4': { height: 180, minimumHeight: 0, maximumHeight: 400 },
        },
      ]);
  });

  it('leaves a layout with nothing collapsed as it was', () =>
  {
    // Arrange.
    const layout = { grid: {}, panels: {} };

    // Act.
    const saved = withCollapsedGroups(layout, new Map());

    // Assert.
    expect(saved)
      .toBe(layout);
  });

  it('skips saved entries that do not read as a remembered size', () =>
  {
    // Arrange: a layout saved by hand or by a future editor.
    const saved = {
      grid: {},
      panels: {},
      collapsedGroups: {
        'good': { height: 220, minimumHeight: 100, maximumHeight: 9007199254740991 },
        'no-minimum': { height: 220, maximumHeight: 400 },
        'not-an-object': 220,
      },
    };

    // Act.
    const collapsed = readCollapsedGroups(saved);

    // Assert.
    expect(Object.fromEntries(collapsed))
      .toStrictEqual({ good: { height: 220, minimumHeight: 100, maximumHeight: 9007199254740991 } });
  });

  it('keeps the strip height at the dark theme\'s own tab strip height', () =>
  {
    // Arrange: this is pinned, not derived, since it is what the dark theme itself renders at.

    // Act.

    // Assert.
    expect(COLLAPSED_GROUP_HEIGHT)
      .toBe(35);
  });
});
