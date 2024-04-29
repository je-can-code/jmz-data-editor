declare namespace Crafting
{
  interface Configuration
  {
    recipes: Recipe[];
    categories: Category[];
  }

  interface Recipe
  {
    name: string;
    key: string;
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
    type: 'i' | 'w' | 'a';
    count: number;
  }

  interface Category
  {
    name: string;
    key: string;
    iconIndex: number;
    description: string;
    unlockedByDefault: boolean;
  }
}