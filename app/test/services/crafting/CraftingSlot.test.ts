import { describe, expect, it } from 'vitest';
import { CraftingSlot } from '@services/crafting/CraftingSlot.ts';
import CraftingComponentType from '@core/enums/CraftingComponentType.ts';

/**
 * The two readings of a crafting slot's categories, and the moves between them.
 *
 * The file, the server and the game read a slot as categorical only when its categories are non-empty; an empty list
 * names an exact row, and every one of Chef Adventure's 933 recipes stores its exact rows that way. The crafting board
 * once read any list at all as categorical, so every exact row drew as "<any ingredient>" while the game crafted
 * exactly what the ids said. The editor's own in-progress state- "any type", none picked yet- is the one place a list
 * without types means categorical, so a slot is converted on its way into the editor and back out of it.
 */
describe('CraftingSlot', () =>
{
  /**
   * Builds a stored slot naming item 46, the way the file stores an exact row.
   * @param {object} overrides Fields to replace.
   * @returns {Crafting.CraftingComponent}
   */
  const slot = (overrides: Partial<Crafting.CraftingComponent> = {}): Crafting.CraftingComponent => ({
    id: 46,
    type: CraftingComponentType.Item,
    count: 2,
    categories: [],
    ...overrides,
  });

  describe('isCategorical', () =>
  {
    it('reads a stored slot with types as categorical', () =>
    {
      // Arrange
      const stored = slot({ id: 0, categories: [ 'elemental', 'noire' ] });

      // Act
      const categorical = CraftingSlot.isCategorical(stored);

      // Assert
      expect(categorical)
        .toBe(true);
    });

    it('reads a stored slot with an empty list as naming its exact row', () =>
    {
      // Arrange- item 46, stored exactly as the file stores it.
      const stored = slot();

      // Act
      const categorical = CraftingSlot.isCategorical(stored);

      // Assert
      expect(categorical)
        .toBe(false);
    });

    it('reads a slot with no list at all as naming its exact row', () =>
    {
      // Arrange- a slot the board built before it carried a list.
      const { categories: _categories, ...listless } = slot();

      // Act
      const categorical = CraftingSlot.isCategorical(listless as Crafting.CraftingComponent);

      // Assert
      expect(categorical)
        .toBe(false);
    });
  });

  describe('isCategoricalWhileEditing', () =>
  {
    it('reads a slot being edited with a list as categorical, even before a type is picked', () =>
    {
      // Arrange- switched to "any type", nothing picked yet.
      const editing = slot({ id: 0, categories: [] });

      // Act
      const categorical = CraftingSlot.isCategoricalWhileEditing(editing);

      // Assert
      expect(categorical)
        .toBe(true);
    });

    it('reads a slot being edited with no list as naming a row', () =>
    {
      // Arrange
      const { categories: _categories, ...editing } = slot();

      // Act
      const categorical = CraftingSlot.isCategoricalWhileEditing(editing as Crafting.CraftingComponent);

      // Assert
      expect(categorical)
        .toBe(false);
    });
  });

  describe('toEditing', () =>
  {
    it('lets an exact row go of its empty list, so the editor reads it as a row', () =>
    {
      // Arrange
      const stored = slot();

      // Act
      const editing = CraftingSlot.toEditing(stored);

      // Assert- the same row and count, with no list left to read as "any type".
      expect(editing)
        .toEqual({
          id: 46,
          type: CraftingComponentType.Item,
          count: 2,
        });
      expect(CraftingSlot.isCategoricalWhileEditing(editing))
        .toBe(false);
    });

    it('brings a categorical slot across as it is', () =>
    {
      // Arrange
      const stored = slot({ id: 0, categories: [ 'elemental', 'noire' ] });

      // Act
      const editing = CraftingSlot.toEditing(stored);

      // Assert- a copy, types intact.
      expect(editing)
        .toEqual(stored);
      expect(editing)
        .not
        .toBe(stored);
    });
  });

  describe('toStored', () =>
  {
    it('gives a slot naming its row the empty list every stored slot carries', () =>
    {
      // Arrange
      const { categories: _categories, ...editing } = slot({ id: 141, type: CraftingComponentType.Weapon, count: 1 });

      // Act
      const stored = CraftingSlot.toStored(editing as Crafting.CraftingComponent);

      // Assert
      expect(stored)
        .toEqual({
          id: 141,
          type: CraftingComponentType.Weapon,
          count: 1,
          categories: [],
        });
    });

    it('keeps a categorical slot\'s types', () =>
    {
      // Arrange
      const editing = slot({ id: 0, categories: [ 'elemental' ] });

      // Act
      const stored = CraftingSlot.toStored(editing);

      // Assert
      expect(stored.categories)
        .toEqual([ 'elemental' ]);
    });
  });
});
