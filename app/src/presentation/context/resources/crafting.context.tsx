import ConfigFilenames from '@core/enums/ConfigFilenames.ts';
import { createCompositeConfigContext } from '@presentation/context/resources/factories/composite-config.factory.tsx';

/**
 * Provide the base context for Crafting configuration.
 */
export const {
  Provider: CraftingProvider,
  useHook: useCraftingInternal,
} = createCompositeConfigContext<Crafting.Configuration>(
  ConfigFilenames.Crafting,
  'Crafting'
);

/**
 * Domain-friendly wrapper for Crafting configuration.
 * Exposes recipes, categories, and their respective setters.
 */
export function useCrafting()
{
  const {
    config,
    setConfig,
    save,
    reload,
    loading,
  } = useCraftingInternal();

  const recipes = config?.recipes ?? [];
  const categories = config?.categories ?? [];
  const ingredientTypes = config?.ingredientTypes ?? [];

  const setRecipes = (updated: Crafting.Recipe[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      recipes: updated,
    });
  };

  const setCategories = (updated: Crafting.Category[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      categories: updated,
    });
  };

  /**
   * Replaces the authored ingredient type vocabulary.
   * @param {Crafting.IngredientType[]} updated The full list of types, in display order.
   */
  const setIngredientTypes = (updated: Crafting.IngredientType[]) =>
  {
    if (!config)
    {
      return;
    }

    setConfig({
      ...config,
      ingredientTypes: updated,
    });
  };

  return {
    // data
    recipes,
    categories,
    ingredientTypes,

    // setters
    setRecipes,
    setCategories,
    setIngredientTypes,

    // base controls
    save,
    reload,
    loading,

    // raw config access
    config,
    setConfig,
  } as const;
}
