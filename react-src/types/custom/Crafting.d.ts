import CraftingComponentType from "./CraftingComponentType.ts";

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
    type: CraftingComponentType;
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