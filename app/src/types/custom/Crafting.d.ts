declare namespace Crafting
{
  interface Configuration
  {
    recipes: Recipe[];
    categories: Category[];
    ingredientTypes: IngredientType[];
    professions: Profession[];
  }

  /**
   * A family of categories that share a currency and a price ladder.
   *
   * A profession answers the two questions a category cannot: which scrap buys its recipes, and what a
   * tier costs. {@link tierPrices} is indexed by tier with the lowest first, so its length is the
   * profession's depth - cooking declares four, survival declares ten, and neither needs to know the
   * other exists. A tier past the end of the table has no price, and a profession with no prices at all
   * is simply not for sale, which is correct for one whose recipes are placed by hand in the world.
   */
  interface Profession
  {
    key: string;
    name: string;
    iconIndex: number;
    description: string;

    // the item spent to learn any recipe in this profession, or 0 when nothing here is bought at all.
    scrapItemId: number;

    // how much scrap each tier costs, the first entry being tier 1.
    tierPrices: number[];
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

    // what a shop charges to teach this recipe, paid once. an empty cost takes whatever the recipe's
    // profession charges for its tier; naming one here opts out of that entirely.
    cost: CraftingComponent[];

    // how far up its family this recipe sits, which the plugin turns into a scrap price through a
    // table of its own. cost still wins where it is set, so the tier is the rule and the cost is the
    // exception. zero means untiered.
    tier: number;
  }

  interface CraftingComponent
  {
    id: number;
    // Inline import type – this does NOT make the file a module
    type: import('../../core/enums/CraftingComponentType.ts').CraftingComponentType;
    count: number;
    /**
     * Ingredient slots only. When non-empty, the slot is satisfied by anything in the player's inventory carrying
     * every one of these types, rather than by the one row named in {@link id}.
     */
    categories: string[];
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

    /**
     * Names the {@link Profession} this category belongs to, which decides the scrap its recipes are
     * bought with and the price ladder their tiers read from. An empty key means this category joins no
     * profession, so nothing in it is for sale.
     */
    professionKey: string;
  }
}
