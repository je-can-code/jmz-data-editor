import { describe, expect, it } from 'vitest';
import {
  COLLAPSED_SIDE_WIDTH,
  readCollapsedSides,
  SIDES,
  sideForShortcut,
  sideGroupsOf,
  withCollapsedSides,
  type CollapsedSideGroupState,
  type Side,
} from '../../../../src/mapEditor/core/workspace/sideCollapse.ts';
import type { KeyPress } from '../../../../src/mapEditor/core/workspace/shortcuts.ts';

/*
 * A collapsed side's remembered sizes ride along with the saved layout, beside collapse.ts's own key and the popout
 * keeper's origins, so a side collapsed when the layout was saved comes back collapsed and still knows each group's
 * width to restore on expanding. A saved layout with neither side collapsed is handed back unchanged, and anything
 * saved by hand, or by a future editor, that does not read as a side or a remembered width is skipped rather than
 * trusted. Which groups a side holds is worked out fresh from the grid's own shape, by where its root-level columns
 * sit relative to the centre, never from a fixed list of ids, so it keeps catching everything on a side however far a
 * layout has been dragged from the default.
 */
describe('sideCollapse', () =>
{
  /**
   * A leaf node of the grid, as the dock serializes it.
   * @param {string} id The group's id.
   * @returns {object} The node.
   */
  const leaf = (id: string) => ({ type: 'leaf', data: { id } });

  /**
   * A branch node of the grid, as the dock serializes it.
   * @param {...unknown} data Its children.
   * @returns {object} The node.
   */
  const branch = (...data: unknown[]) => ({ type: 'branch', data });

  describe('sideGroupsOf', () =>
  {
    it('splits the root-level columns either side of the centre, walking into each for every leaf it holds', () =>
    {
      // Arrange: the default layout's own shape, down the left a column of two, the centre alone, down the right a column of two.
      const root = branch(branch(leaf('map-tree'), leaf('palette')), leaf('start'), branch(leaf('map-properties'), leaf('history')));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [ 'map-tree', 'palette' ], right: [ 'map-properties', 'history' ] });
    });

    it('gathers every root-level column on a side, not just the nearest one, however far a layout has been dragged', () =>
    {
      // Arrange: a stray column dragged further left than the usual one, both still left of the centre.
      const root = branch(leaf('stray'), leaf('map-tree'), leaf('start'), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [ 'stray', 'map-tree' ], right: [ 'history' ] });
    });

    it('never places the centre\'s own column in either side', () =>
    {
      // Arrange: the centre shares its column with another panel, as settleCentre's own adoption can leave it.
      const root = branch(leaf('map-tree'), branch(leaf('start'), leaf('map-301')), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert: map-301 sits beside the centre and joins neither side.
      expect(sides)
        .toStrictEqual({ left: [ 'map-tree' ], right: [ 'history' ] });
    });

    it('returns both sides empty when the centre\'s group cannot be found', () =>
    {
      // Arrange.
      const root = branch(leaf('map-tree'), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [] });
    });

    it('returns both sides empty when the root holds no columns of its own', () =>
    {
      // Arrange: a layout with nothing split yet, the root a single leaf.
      const root = leaf('start');

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [] });
    });

    it('returns both sides empty for a root that does not read as a grid node at all', () =>
    {
      // Arrange.

      // Act.
      const sides = sideGroupsOf(null, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [] });
    });

    it('skips a leaf with no id of its own, rather than letting it stand in for a real group', () =>
    {
      // Arrange: a leaf missing its id, as nothing this app writes but a future one might.
      const root = branch({ type: 'leaf', data: {} }, leaf('start'), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [ 'history' ] });
    });

    it('skips a column that does not read as a grid node at all, rather than throwing on it', () =>
    {
      // Arrange: a stray value where a column belongs, as nothing this app writes but a future one might.
      const root = branch(null, leaf('start'), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [ 'history' ] });
    });

    it('skips a leaf whose own data is not an object at all', () =>
    {
      // Arrange: a leaf node whose data is a stray string instead of the usual { id, views } shape.
      const root = branch({ type: 'leaf', data: 'oops' }, leaf('start'), leaf('history'));

      // Act.
      const sides = sideGroupsOf(root, 'start');

      // Assert.
      expect(sides)
        .toStrictEqual({ left: [], right: [ 'history' ] });
    });
  });

  describe('readCollapsedSides and withCollapsedSides', () =>
  {
    it('rides along with a saved layout and reads back the same', () =>
    {
      // Arrange.
      const collapsed = new Map<Side, Map<string, CollapsedSideGroupState>>([
        [ 'left', new Map([ [ '1', { width: 300, minimumWidth: 240, maximumWidth: Number.MAX_SAFE_INTEGER } ] ]) ],
        [ 'right', new Map([
          [ '3', { width: 360, minimumWidth: 300, maximumWidth: Number.MAX_SAFE_INTEGER } ],
          [ '4', { width: 360, minimumWidth: 240, maximumWidth: Number.MAX_SAFE_INTEGER } ],
        ]) ],
      ]);

      // Act.
      const saved = withCollapsedSides({ grid: {}, panels: {} }, collapsed);
      const read = readCollapsedSides(saved);

      // Assert.
      expect([ Object.keys(saved), Object.fromEntries([ ...read ].map(([ side, groups ]) => [ side, Object.fromEntries(groups) ])) ])
        .toStrictEqual([
          [ 'grid', 'panels', 'collapsedSides' ],
          {
            left: { '1': { width: 300, minimumWidth: 240, maximumWidth: Number.MAX_SAFE_INTEGER } },
            right: {
              '3': { width: 360, minimumWidth: 300, maximumWidth: Number.MAX_SAFE_INTEGER },
              '4': { width: 360, minimumWidth: 240, maximumWidth: Number.MAX_SAFE_INTEGER },
            },
          },
        ]);
    });

    it('leaves a layout with neither side collapsed as it was', () =>
    {
      // Arrange.
      const layout = { grid: {}, panels: {} };

      // Act.
      const saved = withCollapsedSides(layout, new Map());

      // Assert.
      expect(saved)
        .toBe(layout);
    });

    it('reads no sides from a layout that saved none', () =>
    {
      // Arrange.
      const saved = { grid: {}, panels: {} };

      // Act.
      const collapsed = readCollapsedSides(saved);

      // Assert.
      expect(collapsed.size)
        .toBe(0);
    });

    it('skips a side name it does not recognize and a group that is not a remembered width, keeping only what reads as one', () =>
    {
      // Arrange: a layout saved by hand or by a future editor.
      const saved = {
        grid: {},
        panels: {},
        collapsedSides: {
          left: {
            good: { width: 300, minimumWidth: 240, maximumWidth: 9007199254740991 },
            'no-minimum': { width: 300, maximumWidth: 400 },
            'not-an-object': 300,
          },
          top: { good: { width: 300, minimumWidth: 240, maximumWidth: 400 } },
        },
      };

      // Act.
      const collapsed = readCollapsedSides(saved);

      // Assert: top is not a side, so only left comes back.
      expect(Object.fromEntries([ ...collapsed ].map(([ side, groups ]) => [ side, Object.fromEntries(groups) ])))
        .toStrictEqual({ left: { good: { width: 300, minimumWidth: 240, maximumWidth: 9007199254740991 } } });
    });

    it('drops a side whose saved value is not an object at all', () =>
    {
      // Arrange.
      const saved = { grid: {}, panels: {}, collapsedSides: { right: 'not-an-object' } };

      // Act.
      const collapsed = readCollapsedSides(saved);

      // Assert.
      expect(collapsed.size)
        .toBe(0);
    });

    it('leaves out a side entirely once every one of its groups turns out invalid', () =>
    {
      // Arrange: a side object with nothing in it that reads as a remembered width.
      const saved = { grid: {}, panels: {}, collapsedSides: { right: { 'not-an-object': 300 } } };

      // Act.
      const collapsed = readCollapsedSides(saved);

      // Assert.
      expect(collapsed.has('right'))
        .toBe(false);
    });
  });

  describe('sideForShortcut', () =>
  {
    /**
     * A key press, every field defaulted to not held.
     * @param {Partial<KeyPress>} press What differs from the defaults.
     * @returns {KeyPress} The press.
     */
    const keyPress = (press: Partial<KeyPress>): KeyPress =>
    {
      return { key: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...press };
    };

    it('asks for the left side on a bare Ctrl+B', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'b', ctrlKey: true }));

      // Assert.
      expect(side)
        .toBe('left');
    });

    it('asks for the right side on Ctrl+Shift+B, the key arriving uppercase the way a real browser sends it', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'B', ctrlKey: true, shiftKey: true }));

      // Assert.
      expect(side)
        .toBe('right');
    });

    it('takes Cmd the same as Ctrl', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'b', metaKey: true }));

      // Assert.
      expect(side)
        .toBe('left');
    });

    it('asks for nothing when Alt is held, whatever else is', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'b', ctrlKey: true, altKey: true }));

      // Assert.
      expect(side)
        .toBeNull();
    });

    it('asks for nothing without Ctrl or Cmd', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'b', shiftKey: true }));

      // Assert.
      expect(side)
        .toBeNull();
    });

    it('asks for nothing on a key that is not B', () =>
    {
      // Arrange.

      // Act.
      const side = sideForShortcut(keyPress({ key: 'c', ctrlKey: true }));

      // Assert.
      expect(side)
        .toBeNull();
    });
  });

  it('collapses a side to nothing, not a sliver someone could drag open by accident', () =>
  {
    // Arrange: this is pinned, not derived, since the side's own button is what brings it back, never a splitter.

    // Act.

    // Assert.
    expect(COLLAPSED_SIDE_WIDTH)
      .toBe(0);
  });

  it('names both sides, left before right', () =>
  {
    // Arrange.

    // Act.

    // Assert.
    expect(SIDES)
      .toStrictEqual([ 'left', 'right' ]);
  });
});
