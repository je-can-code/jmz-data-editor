/**
 * How a crafting slot says what it asks for: one exact database row, or anything carrying a set of ingredient types.
 *
 * Stored, the rule is the one the file, the server and the game all read: a slot is categorical exactly when its
 * categories are non-empty, and an empty list is how a slot names its exact row. Every slot Chef Adventure ships
 * carries the list, empty or not.
 *
 * The slot editor needs one state the stored rule has no room for: a slot switched to "any type" before any type is
 * picked. So while a slot is being edited, having a categories list at all is what makes it categorical, and a slot
 * moves between the two readings on its way into and out of the editor.
 */
class CraftingSlot
{
  /**
   * Determines whether a stored slot is satisfied by anything carrying its ingredient types, rather than by one exact
   * row.
   * @param {Crafting.CraftingComponent} slot The slot as the file stores it.
   * @returns {boolean} True when it names types to match, false when it names a row.
   */
  static isCategorical(slot: Crafting.CraftingComponent): boolean
  {
    // an empty list is how a stored slot names its exact row.
    return (slot.categories ?? []).length > 0;
  }

  /**
   * Determines whether a slot being edited is a categorical one: one carrying a categories list at all, even before
   * any type in it is picked.
   * @param {Crafting.CraftingComponent} slot The slot as the editor holds it.
   * @returns {boolean} True when it is being authored as a categorical slot.
   */
  static isCategoricalWhileEditing(slot: Crafting.CraftingComponent): boolean
  {
    return slot.categories !== undefined;
  }

  /**
   * A stored slot as the editor holds it. A slot naming its exact row lets go of its empty categories list, which
   * would otherwise read as "any type, none picked yet"; a categorical slot comes across as it is.
   * @param {Crafting.CraftingComponent} slot The slot as the file stores it.
   * @returns {Crafting.CraftingComponent} The slot as the editor holds it.
   */
  static toEditing(slot: Crafting.CraftingComponent): Crafting.CraftingComponent
  {
    // a categorical slot reads the same either way.
    if (CraftingSlot.isCategorical(slot))
    {
      return { ...slot };
    }

    // an exact row carries no list while it is edited.
    const { categories: _categories, ...exactRow } = slot;

    return exactRow as Crafting.CraftingComponent;
  }

  /**
   * A slot from the editor as the file stores it. A slot naming its exact row carries an empty categories list, like
   * every other slot in the file, rather than none at all- which the server would write out as null.
   * @param {Crafting.CraftingComponent} slot The slot as the editor holds it.
   * @returns {Crafting.CraftingComponent} The slot as the file stores it.
   */
  static toStored(slot: Crafting.CraftingComponent): Crafting.CraftingComponent
  {
    return {
      ...slot,
      categories: slot.categories ?? [],
    };
  }
}

export { CraftingSlot };
