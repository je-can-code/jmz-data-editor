declare namespace Crafting
{
  interface Configuration
  {
    recipes: Recipe[];
    categories: Category[];
    ingredientTypes?: IngredientType[];
  }

  interface Recipe
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;
    unlockedByDefault: boolean;
    maskedUntilCrafted: boolean;
    categoryKeys: string[];
    tools: CraftingComponent[];
    ingredients: CraftingComponent[];
    outputs: CraftingComponent[];

    // what a shop charges to teach this recipe, paid once. optional to match the omitempty on the Go
    // struct, and because a recipe with no cost is not free - it is simply not for sale.
    cost?: CraftingComponent[];

    // how far up its family this recipe sits, which the plugin turns into a scrap price through a
    // table of its own. cost still wins where it is set, so the tier is the rule and the cost is the
    // exception. zero, or absent, means untiered.
    tier?: number;
  }

  interface CraftingComponent
  {
    id: number;
    // Inline import type – this does NOT make the file a module
    type: import('../../core/enums/CraftingComponentType.ts').CraftingComponentType;
    count: number;
    /**
     * Ingredient slots only. When present, the slot is satisfied by anything in the player's inventory carrying
     * every one of these types, rather than by the one row named in {@link id}.
     */
    categories?: string[];
  }

  /**
   * One authored ingredient classification, such as "protein" or "flank".
   *
   * These are a flat vocabulary rather than a hierarchy. An entry carries whatever set of them its author decides,
   * and a recipe slot is satisfied by anything carrying every type it asks for - so a narrower slot matches fewer
   * things, which is the whole difference between a common dish and a signature one.
   */
  interface IngredientType
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;
  }

  interface Category
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;
    unlockedByDefault: boolean;
  }
}
