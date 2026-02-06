declare namespace Crafting
{
  interface Configuration
  {
    recipes: Recipe[];
    categories: Category[];
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
  }

  interface CraftingComponent
  {
    id: number;
    // Inline import type – this does NOT make the file a module
    type: import('../../core/enums/CraftingComponentType.ts').CraftingComponentType;
    count: number;
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
