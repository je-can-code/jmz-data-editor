import React, {
  ChangeEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  Construction,
  ContentCopy,
  DonutLarge,
  DonutSmall,
  Key,
  Lock,
  LockOpen,
  Remove,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import CraftingComponentList, {
  readDatabaseDescription,
  readDatabaseIconIndex,
} from './CraftingComponentList.tsx';
import { IngredientTypesTab } from './IngredientTypesTab.tsx';

import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import CraftingComponentType from '@core/enums/CraftingComponentType.ts';
import CraftingListType from '@core/enums/CraftingListType.ts';
import { RPG_ArmorDomainModel } from '@core/domain/entities/RPG_ArmorDomainModel.ts';
import { RPG_ItemDomainModel } from '@core/domain/entities/RPG_ItemDomainModel.ts';
import { RPG_WeaponDomainModel } from '@core/domain/entities/RPG_WeaponDomainModel.ts';

import KeyTextField from '../../../components/core/KeyTextField.tsx';
import { BoardEmptyState } from '@presentation/components/board/BoardEmptyState.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import { useCrafting } from '@presentation/context/resources/crafting.context.tsx';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import {
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import type { VirtualizedSidebarRow } from '@presentation/components/board/VirtualizedSidebarList.tsx';
import Configuration = Crafting.Configuration;
import Recipe = Crafting.Recipe;
import Category = Crafting.Category;
import CraftingComponent = Crafting.CraftingComponent;

const EntryText = styled(ListItemText)`
  font-family: monospace;
`;

const craftingBoardListColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

/**
 * First recipe output mapped to its items/weapons/armors DB row, or {@code null}.
 */
const recipeFirstOutputDatabaseRow = (
  recipe: Recipe,
  itemsById: ReadonlyMap<number, RPG_ItemDomainModel>,
  weaponsById: ReadonlyMap<number, RPG_WeaponDomainModel>,
  armorsById: ReadonlyMap<number, RPG_ArmorDomainModel>
): RPG_ItemDomainModel | RPG_WeaponDomainModel | RPG_ArmorDomainModel | null =>
{
  const output = recipe.outputs.at(0);
  if (output === undefined)
  {
    return null;
  }

  switch (output.type)
  {
    case CraftingComponentType.Item:
      return itemsById.get(output.id) ?? null;
    case CraftingComponentType.Weapon:
      return weaponsById.get(output.id) ?? null;
    case CraftingComponentType.Armor:
      return armorsById.get(output.id) ?? null;
    default:
      return null;
  }
};

/**
 * Sidebar icon matches plugin rules: {@link Recipe.iconIndex} when not {@code -1}; when {@code -1}, first output's DB icon; else {@code 0}.
 */
const recipeListRowIconIndex = (
  recipe: Recipe,
  itemsById: ReadonlyMap<number, RPG_ItemDomainModel>,
  weaponsById: ReadonlyMap<number, RPG_WeaponDomainModel>,
  armorsById: ReadonlyMap<number, RPG_ArmorDomainModel>
): number =>
{
  const explicit = Math.trunc(recipe.iconIndex);
  if (explicit !== -1)
  {
    return explicit;
  }

  return readDatabaseIconIndex(recipeFirstOutputDatabaseRow(recipe, itemsById, weaponsById, armorsById));
};

/**
 * The main board that encapsulates all things related to crafting.
 */
const CraftingBoard = () =>
{
  const {
    recipes,
    categories,
    ingredientTypes,
    setRecipes,
    setCategories,
    setIngredientTypes,
    save,
    reload,
    loading
  } = useCrafting();

  const {
    byId: itemsById,
  } = useItems();
  const {
    byId: weaponsById,
  } = useWeapons();
  const {
    byId: armorsById,
  } = useArmors();

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  //region state
  const [ tabIndex, setTabIndex ] = useState(0);
  const [ selectedRecipe, setSelectedRecipe ] = useState<Recipe | null>(null);
  const [ selectedRecipeIndex, setSelectedRecipeIndex ] = useState<number>(0);

  const [ applicableCategories, setApplicableCategories ] = useState<string[]>([]);
  const [ currentIngredients, setCurrentIngredients ] = useState<CraftingComponent[]>([]);
  const [ currentTools, setCurrentTools ] = useState<CraftingComponent[]>([]);
  const [ currentOutputs, setCurrentOutputs ] = useState<CraftingComponent[]>([]);
  const [ currentCost, setCurrentCost ] = useState<CraftingComponent[]>([]);

  const [ selectedCategory, setSelectedCategory ] = useState<Category | null>(null);
  const [ selectedCategoryIndex, setSelectedCategoryIndex ] = useState<number>(0);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  const [ recipeListContextMenu, setRecipeListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ categoryListContextMenu, setCategoryListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  //endregion state

  const recipeFirstOutput = useMemo(
    () => selectedRecipe === null
      ? null
      : recipeFirstOutputDatabaseRow(selectedRecipe, itemsById, weaponsById, armorsById),
    [ selectedRecipe, itemsById, weaponsById, armorsById ],
  );

  const recipeNamePlaceholderFromFirstOutput = useMemo(() =>
  {
    if (selectedRecipe === null || selectedRecipe.name.trim().length > 0) return '';
    return recipeFirstOutput?.name ?? '';
  }, [ selectedRecipe, recipeFirstOutput ]);

  const recipeDescriptionPlaceholderFromFirstOutput = useMemo(() =>
  {
    if (selectedRecipe === null || selectedRecipe.description.trim().length > 0) return '';
    return readDatabaseDescription(recipeFirstOutput);
  }, [ selectedRecipe, recipeFirstOutput ]);

  //region actions
  const handleSnack = (
    message: string,
    severity: MuiSnackbarSeverity = MuiSnackbarSeverity.Info,
    variant: MuiSnackbarVariant = MuiSnackbarVariant.Filled
  ) =>
  {
    setSnackMessage(message);
    setSnackSeverity(severity);
    setSnackVariant(variant);
    setSnackOpen(true);
  };

  const handleSnackClose = (
    _: any,
    reason?: string
  ) =>
  {
    if (reason === 'clickaway')
    {
      return;
    }

    setSnackOpen(false);
  };

  const handleRecipeListItemOnClickEvent = useCallback((
    index: number
  ) =>
  {
    setSelectedRecipeIndex(index);

    if (recipes.length > 0)
    {
      const recipe = recipes.at(index) as Recipe;
      setSelectedRecipe(recipe);
      setApplicableCategories(recipe.categoryKeys);
      setCurrentIngredients(recipe.ingredients);
      setCurrentTools(recipe.tools);
      setCurrentOutputs(recipe.outputs);

      // a recipe authored before recipes could be bought carries no cost at all, which reads as
      // "not for sale" rather than as free.
      setCurrentCost(recipe.cost ?? []);
    }
  }, [ recipes ]);

  /**
   * When crafting data is ready and nothing is selected yet, open the first recipe (SDP-style).
   */
  useEffect(() =>
  {
    if (loading || recipes.length === 0 || selectedRecipe !== null)
    {
      return;
    }

    handleRecipeListItemOnClickEvent(0);
    requestAnimationFrame(() =>
    {
      listRef.current?.scrollToItem(0, 'start');
    });
  }, [ loading, recipes, selectedRecipe, handleRecipeListItemOnClickEvent ]);

  /**
   * Clamps the category selection index and syncs the form whenever categories change.
   */
  useEffect(() =>
  {
    if (loading || categories.length === 0)
    {
      return;
    }

    const idx = Math.min(Math.max(0, selectedCategoryIndex), categories.length - 1);
    if (idx !== selectedCategoryIndex)
    {
      setSelectedCategoryIndex(idx);
    }

    setSelectedCategory(categories[ idx ]);
  }, [ categories, loading, selectedCategoryIndex ]);

  const handleRecipeListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = recipeListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setRecipeListContextMenu(newContextMenuState);
  };

  const handleRecipeListContextMenuOnCloseEvent = () =>
  {
    setRecipeListContextMenu(null);
  };

  const handleCategoryListItemOnClickEvent = (index: number) =>
  {
    setSelectedCategoryIndex(index);

    if (categories.length > 0)
    {
      setSelectedCategory(categories[ index ]);
    }
  };

  const handleCategoryListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = categoryListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setCategoryListContextMenu(newContextMenuState);
  };

  const handleCategoryListContextMenuOnCloseEvent = () =>
  {
    setCategoryListContextMenu(null);
  };
  //endregion actions

  //region updates
  const applyRecipes = (updatedRecipes: Recipe[]) =>
  {
    setRecipes(updatedRecipes);
    setCanSave(true);
  };

  const applyCategories = (updatedCategories: Category[]) =>
  {
    setCategories(updatedCategories);
    setCanSave(true);
  };

  const applyIngredientTypes = (updatedTypes: Crafting.IngredientType[]) =>
  {
    setIngredientTypes(updatedTypes);
    setCanSave(true);
  };

  const patchSelectedRecipe = (patch: Partial<Recipe>) =>
  {
    if (selectedRecipe === null)
    {
      return;
    }

    const updatedRecipe = {
      ...selectedRecipe,
      ...patch,
    } as Recipe;

    setSelectedRecipe(updatedRecipe);
    applyRecipes(recipes.with(selectedRecipeIndex, updatedRecipe));
  };

  const patchSelectedCategory = (patch: Partial<Category>) =>
  {
    if (selectedCategory === null)
    {
      return;
    }

    const updatedCategory = {
      ...selectedCategory,
      ...patch,
    } as Category;

    setSelectedCategory(updatedCategory);
    applyCategories(categories.with(selectedCategoryIndex, updatedCategory));
  };

  const handleRecipeKeyOnChangeEvent = (input: string) =>
  {
    patchSelectedRecipe({ key: input });
  };

  const handleRecipeNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedRecipe({ name: event.target.value });
  };

  const handleRecipeIconIndexOnChangeEvent = (value: number) =>
  {
    const updatedValue = value < -1
      ? -1
      : value;

    patchSelectedRecipe({ iconIndex: updatedValue });
  };

  const handleRecipeDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedRecipe({ description: event.target.value });
  };

  const handleRecipeMaskedUntilCraftedOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedRecipe({ maskedUntilCrafted: event.target.checked });
  };

  const handleRecipeUnlockedByDefaultOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedRecipe({ unlockedByDefault: event.target.checked });
  };

  const handleRecipeTierOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // a blank box is untiered rather than zero-priced, and both read as 0 to the plugin.
    const parsed = Number.parseInt(event.target.value, 10);

    patchSelectedRecipe({ tier: Number.isNaN(parsed) ? 0 : parsed });
  };

  const handleCategoryKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedCategory({ key: event.target.value });
  };

  const handleCategoryNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedCategory({ name: event.target.value });
  };

  const handleCategoryIconIndexOnChangeEvent = (value: number) =>
  {
    const updatedValue = value < -1
      ? -1
      : value;

    patchSelectedCategory({ iconIndex: updatedValue });
  };

  const handleCategoryUnlockedByDefaultOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedCategory({ unlockedByDefault: event.target.checked });
  };

  const handleCategoryDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    patchSelectedCategory({ description: event.target.value });
  };

  const updateCraftingComponentList = (
    craftingComponents: CraftingComponent[],
    craftingListType: CraftingListType
  ) =>
  {
    if (selectedRecipe === null)
    {
      return;
    }

    switch (craftingListType)
    {
      case CraftingListType.Ingredients:
        setCurrentIngredients(craftingComponents);
        patchSelectedRecipe({ ingredients: craftingComponents });
        break;
      case CraftingListType.Tools:
        setCurrentTools(craftingComponents);
        patchSelectedRecipe({ tools: craftingComponents });
        break;
      case CraftingListType.Outputs:
        setCurrentOutputs(craftingComponents);
        patchSelectedRecipe({ outputs: craftingComponents });
        break;
      case CraftingListType.Cost:
        setCurrentCost(craftingComponents);
        patchSelectedRecipe({ cost: craftingComponents });
        break;
    }
  };

  const handleAddNewRecipe = (index: number) =>
  {
    const newRecipe = {
      key: 'NEW-RECIPE',
      name: '',
      description: '',
      iconIndex: -1,
      maskedUntilCrafted: true,
      unlockedByDefault: false,
      categoryKeys: [],
      ingredients: [],
      tools: [],
      outputs: [],

      // a new recipe is not for sale until somebody prices it. note that these constructors name every
      // field by hand and end in `as Recipe`, so a field forgotten here is dropped with no compile
      // error at all - a passing typecheck proves nothing about this object.
      cost: []
    } as Recipe;

    applyRecipes(recipes.toSpliced(index, 0, newRecipe));
  };

  const handleCloneRecipe = (index: number) =>
  {
    if (selectedRecipe === null)
    {
      return;
    }

    const clonedKeys = selectedRecipe.categoryKeys.toSpliced(0, 0);
    const clonedIngredients = selectedRecipe.ingredients.toSpliced(0, 0);
    const clonedTools = selectedRecipe.tools.toSpliced(0, 0);
    const clonedOutputs = selectedRecipe.outputs.toSpliced(0, 0);
    const clonedCost = (selectedRecipe.cost ?? []).toSpliced(0, 0);

    const clonedRecipe = {
      key: `${selectedRecipe.key}-COPY`,
      name: selectedRecipe.name,
      description: selectedRecipe.description,
      iconIndex: selectedRecipe.iconIndex,
      maskedUntilCrafted: selectedRecipe.maskedUntilCrafted,
      unlockedByDefault: selectedRecipe.unlockedByDefault,
      categoryKeys: clonedKeys,
      ingredients: clonedIngredients,
      tools: clonedTools,
      outputs: clonedOutputs,
      cost: clonedCost
    } as Recipe;

    applyRecipes(recipes.toSpliced(index, 0, clonedRecipe));
  };

  const handleDeleteRecipe = (index: number) =>
  {
    if (selectedRecipe === null)
    {
      return;
    }

    const nextRecipes = recipes.toSpliced(index, 1);
    applyRecipes(nextRecipes);

    if (nextRecipes.length === 0)
    {
      setSelectedRecipe(null);
      setSelectedRecipeIndex(0);
      setApplicableCategories([]);
      setCurrentIngredients([]);
      setCurrentTools([]);
      setCurrentOutputs([]);
      return;
    }

    const nextIndex = Math.min(index, nextRecipes.length - 1);
    handleRecipeListItemOnClickEvent(nextIndex);
    requestAnimationFrame(() =>
    {
      listRef.current?.scrollToItem(nextIndex, 'smart');
    });
  };

  const handleAddCategory = (index: number) =>
  {
    const newCategory = {
      key: 'NEW-CATEGORY',
      name: 'best category',
      description: 'fill in with some description about the category.',
      iconIndex: -1,
      unlockedByDefault: false,
    } as Category;

    applyCategories(categories.toSpliced(index, 0, newCategory));
  };

  const handleCloneCategory = (index: number) =>
  {
    if (selectedCategory === null)
    {
      return;
    }

    const clonedCategory = {
      key: `${selectedCategory.key}-COPY`,
      name: selectedCategory.name,
      description: selectedCategory.description,
      iconIndex: selectedCategory.iconIndex,
      unlockedByDefault: selectedCategory.unlockedByDefault,
    } as Category;

    applyCategories(categories.toSpliced(index, 0, clonedCategory));
  };

  const handleDeleteCategory = (index: number) =>
  {
    if (selectedCategory === null)
    {
      return;
    }

    const nextCategories = categories.toSpliced(index, 1);
    applyCategories(nextCategories);

    if (nextCategories.length === 0)
    {
      setSelectedCategory(null);
      setSelectedCategoryIndex(0);
      return;
    }

    const nextIndex = Math.min(index, nextCategories.length - 1);
    setSelectedCategoryIndex(nextIndex);
    setSelectedCategory(nextCategories[ nextIndex ]);
  };

  const handleReloadButtonOnClickEvent = async () =>
  {
    await reload();
    setCanSave(false);
    setSelectedRecipe(null);
    setApplicableCategories([]);
    setCurrentIngredients([]);
    setCurrentTools([]);
    setCurrentOutputs([]);
    handleSnack('Crafting data has been reloaded successfully.', MuiSnackbarSeverity.Success);
  };
  //endregion updates

  //region render
  /**
   * Virtualized recipe list row (label + first-output icon).
   */
  const getRecipeSidebarRow = useCallback((index: number): VirtualizedSidebarRow =>
  {
    const recipe = recipes.at(index);
    if (!recipe)
    {
      return {
        type: 'spacer',
      };
    }

    const outputName = recipeFirstOutputDatabaseRow(recipe, itemsById, weaponsById, armorsById)?.name ?? '';
    const displayName = recipe.name.length > 0 ? recipe.name : outputName;
    const label = displayName.length > 0 ? displayName : recipe.key;
    const title = displayName.length > 0 ? `${recipe.key}: ${displayName}` : recipe.key;

    return {
      type: 'item',
      label,
      title,
      iconIndex: recipeListRowIconIndex(recipe, itemsById, weaponsById, armorsById),
    };
  }, [ recipes, itemsById, weaponsById, armorsById ]);

  const renderCategoryListItem = (
    category: Category,
    index: number
  ) =>
  {
    return (
      <ListItem
        key={index}
        dense
        disableGutters
      >
        <ListItemButton
          onClick={() => handleCategoryListItemOnClickEvent(index)}
          selected={selectedCategoryIndex === index}
        >
          <ListItemIcon>
            {(selectedCategoryIndex === index)
              ? <DonutSmall color={'secondary'}/>
              : <DonutLarge color={'info'}/>}
          </ListItemIcon>
          <EntryText
            primary={`${category.key}: ${category.name}`}
            disableTypography/>
        </ListItemButton>
      </ListItem>
    );
  };
  //endregion render

  useBoardActions({
    onSave: async () =>
    {
      setCanSave(false);

      // every block of the configuration has to be named here. anything left out is not merely unsaved - it is
      // written away, because this replaces the file rather than patching it.
      await save({ recipes, categories, ingredientTypes } as Configuration);
      handleSnack('Crafting data has been saved successfully.');
    },
    canSave: canSave && !loading,
    onReload: handleReloadButtonOnClickEvent,
    canReload: !loading,
  });

  if (loading)
  {
    return (
      <Box sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        p: 2,
      }}>
        <Typography>Loading crafting configuration...</Typography>
      </Box>
    );
  }

  const categoryPickerOptions = [ ...categories ]
    .filter((c) => c.name !== '' && !c.name.startsWith('=='))
    .sort((a, b) => a.key.localeCompare(b.key));

  const categoryPickerValue = categoryPickerOptions.filter((c) => applicableCategories.includes(c.key));

  return <>
    <EditorBoardSplitLayout
      sidebarColumnWidth={craftingBoardListColumnWidth}
      sidebar={
        <VirtualizedSidebarList
          ref={listRef}
          itemCount={recipes.length}
          itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
          fillContainer
          listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
          labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
          selectedIndex={selectedRecipeIndex}
          getRow={getRecipeSidebarRow}
          onSelectIndex={(index) =>
          {
            handleRecipeListItemOnClickEvent(index);
          }}
          onContextMenu={handleRecipeListContextMenu}
          listWrapperRef={listWrapperRef}
          searchable
          searchLabel={'Search recipes'}
        />
      }
    >
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
          <Tab label={'Recipes'} id={'crafting-tab-0'} aria-controls={'crafting-tabpanel-0'}/>
          <Tab label={'Categories'} id={'crafting-tab-1'} aria-controls={'crafting-tabpanel-1'}/>
          <Tab label={'Ingredient Types'} id={'crafting-tab-2'} aria-controls={'crafting-tabpanel-2'}/>
        </Tabs>
      </Box>

      {tabIndex === 0 && (
        selectedRecipe === null
          ? (
            <BoardEmptyState
              icon={<Construction sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
              message={'Select a recipe from the list, or right-click the list to add one.'}
            />
          )
          : (
            <Stack spacing={2}>
              <BoardSectionCard title={'Recipe'}>
                <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                  <Grid size={3}>
                    <KeyTextField
                      value={selectedRecipe.key}
                      onChange={handleRecipeKeyOnChangeEvent}
                    />
                  </Grid>

                  <Grid size={4}>
                    <TextField
                      variant={'outlined'}
                      label={'Name'}
                      value={selectedRecipe.name}
                      onChange={handleRecipeNameOnChangeEvent}
                      size={'small'}
                      fullWidth
                      InputLabelProps={selectedRecipe.name.trim().length === 0 && recipeNamePlaceholderFromFirstOutput.length > 0
                        ? { shrink: true }
                        : undefined}
                      placeholder={selectedRecipe.name.trim().length === 0 && recipeNamePlaceholderFromFirstOutput.length > 0
                        ? recipeNamePlaceholderFromFirstOutput
                        : undefined}
                    />
                  </Grid>

                  <Grid size={2}>
                    <Stack spacing={0.5}>
                      <FormControlLabel
                        control={
                          <Switch
                            size={'small'}
                            checked={selectedRecipe.iconIndex === -1}
                            onChange={(e) => handleRecipeIconIndexOnChangeEvent(e.target.checked
                              ? -1
                              : 0)}
                          />
                        }
                        label={'Auto icon'}
                      />
                      {selectedRecipe.iconIndex !== -1 && (
                        <IconIndexField
                          value={selectedRecipe.iconIndex}
                          onChange={handleRecipeIconIndexOnChangeEvent}
                        />
                      )}
                    </Stack>
                  </Grid>

                  <Grid size={3}>
                    <Stack spacing={0}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedRecipe.unlockedByDefault}
                            checkedIcon={<LockOpen/>}
                            icon={<Lock/>}
                            onChange={handleRecipeUnlockedByDefaultOnCheckEvent}
                          />
                        }
                        label={selectedRecipe.unlockedByDefault
                          ? 'Unlocked by default'
                          : 'Locked by default'}
                      />
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={selectedRecipe.maskedUntilCrafted}
                            checkedIcon={<VisibilityOff/>}
                            icon={<Visibility/>}
                            onChange={handleRecipeMaskedUntilCraftedOnCheckEvent}
                          />
                        }
                        label={selectedRecipe.maskedUntilCrafted
                          ? 'Masked until crafted'
                          : 'Visible immediately'}
                      />
                      <TextField
                        variant={'outlined'}
                        label={'Tier'}
                        type={'number'}
                        value={selectedRecipe.tier ?? 0}
                        onChange={handleRecipeTierOnChangeEvent}
                        size={'small'}
                        helperText={(selectedRecipe.cost?.length ?? 0) > 0
                          ? 'Overridden by the cost below'
                          : 'Sets the scrap price; 0 is not for sale'}
                      />
                    </Stack>
                  </Grid>

                  <Grid size={8}>
                    <TextField
                      variant={'outlined'}
                      label={'Description'}
                      value={selectedRecipe.description}
                      onChange={handleRecipeDescriptionOnChangeEvent}
                      size={'small'}
                      multiline
                      fullWidth
                      rows={4}
                      InputLabelProps={selectedRecipe.description.trim().length === 0 && recipeDescriptionPlaceholderFromFirstOutput.length > 0
                        ? { shrink: true }
                        : undefined}
                      placeholder={selectedRecipe.description.trim().length === 0 && recipeDescriptionPlaceholderFromFirstOutput.length > 0
                        ? recipeDescriptionPlaceholderFromFirstOutput
                        : undefined}
                    />
                  </Grid>

                  <Grid size={4}>
                    <Autocomplete<Category, true>
                      multiple
                      size={'small'}
                      options={categoryPickerOptions}
                      value={categoryPickerValue}
                      onChange={(_, newValue) =>
                      {
                        const sorted = newValue.map((c) => c.key).sort();
                        setApplicableCategories(sorted);
                        patchSelectedRecipe({ categoryKeys: sorted });
                      }}
                      disableCloseOnSelect
                      groupBy={(option) => option.key.split('-')[ 0 ]}
                      getOptionKey={(option) => option.key}
                      getOptionLabel={(option) => option.name}
                      isOptionEqualToValue={(a, b) => a.key === b.key}
                      slotProps={{
                        listbox: { sx: { maxHeight: '400px' } },
                      }}
                      renderTags={(value, getTagProps) =>
                        value.map((option, index) => (
                          <Chip
                            {...getTagProps({ index })}
                            key={option.key}
                            label={option.name}
                            size={'small'}
                          />
                        ))
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size={'small'}
                          label={'Categories'}
                          placeholder={applicableCategories.length === 0
                            ? 'None assigned'
                            : ''}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </BoardSectionCard>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                  gap: 2,
                  width: '100%',
                  alignItems: 'stretch',
                }}
              >
                <CraftingComponentList
                  type={CraftingListType.Ingredients}
                  updateRecipeFunc={updateCraftingComponentList}
                  components={currentIngredients}
                  handleSnack={handleSnack}
                />
                <CraftingComponentList
                  type={CraftingListType.Tools}
                  updateRecipeFunc={updateCraftingComponentList}
                  components={currentTools}
                  handleSnack={handleSnack}
                />
                <CraftingComponentList
                  type={CraftingListType.Outputs}
                  updateRecipeFunc={updateCraftingComponentList}
                  components={currentOutputs}
                  handleSnack={handleSnack}
                />
                <CraftingComponentList
                  type={CraftingListType.Cost}
                  updateRecipeFunc={updateCraftingComponentList}
                  components={currentCost}
                  handleSnack={handleSnack}
                />
              </Box>
            </Stack>
          )
      )}

      {tabIndex === 1 && (
        <Grid container rowSpacing={2} columnSpacing={2} sx={{ height: '100%' }}>
          <Grid size={4}>
            <BoardSectionCard title={'Categories'} density={'compact'}>
              <div onContextMenu={handleCategoryListContextMenu} style={{ cursor: 'context-menu' }}>
                <List dense>
                  {categories.map((category, index) => renderCategoryListItem(category, index))}
                </List>
              </div>
            </BoardSectionCard>
          </Grid>

          <Grid size={8}>
            {selectedCategory !== null
              ? (
                <BoardSectionCard title={'Category'}>
                  <Grid container rowSpacing={2} columnSpacing={2} alignItems={'flex-start'}>
                    <Grid size={6}>
                      <TextField
                        required
                        variant={'outlined'}
                        label={'Key'}
                        value={selectedCategory.key}
                        onChange={handleCategoryKeyOnChangeEvent}
                        size={'small'}
                        fullWidth
                        slotProps={{
                          input: {
                            startAdornment: (
                              <InputAdornment position={'start'}>
                                <Key/>
                              </InputAdornment>
                            ),
                          },
                        }}
                      />
                    </Grid>

                    <Grid size={6}>
                      <TextField
                        variant={'outlined'}
                        label={'Name'}
                        value={selectedCategory.name}
                        onChange={handleCategoryNameOnChangeEvent}
                        size={'small'}
                        fullWidth
                      />
                    </Grid>

                    <Grid size={12}>
                      <Stack direction={'row'} spacing={3} alignItems={'flex-start'}>
                        <Stack spacing={0.5}>
                          <FormControlLabel
                            control={
                              <Switch
                                size={'small'}
                                checked={selectedCategory.iconIndex === -1}
                                onChange={(e) => handleCategoryIconIndexOnChangeEvent(e.target.checked
                                  ? -1
                                  : 0)}
                              />
                            }
                            label={'Auto icon'}
                          />
                          {selectedCategory.iconIndex !== -1 && (
                            <IconIndexField
                              value={selectedCategory.iconIndex}
                              onChange={handleCategoryIconIndexOnChangeEvent}
                            />
                          )}
                        </Stack>

                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={selectedCategory.unlockedByDefault}
                              checkedIcon={<LockOpen/>}
                              icon={<Lock/>}
                              onChange={handleCategoryUnlockedByDefaultOnCheckEvent}
                            />
                          }
                          label={selectedCategory.unlockedByDefault
                            ? 'Unlocked by default'
                            : 'Locked by default'}
                        />
                      </Stack>
                    </Grid>

                    <Grid size={12}>
                      <TextField
                        variant={'outlined'}
                        label={'Description'}
                        value={selectedCategory.description}
                        onChange={handleCategoryDescriptionOnChangeEvent}
                        size={'small'}
                        multiline
                        fullWidth
                        rows={4}
                      />
                    </Grid>
                  </Grid>
                </BoardSectionCard>
              )
              : (
                <BoardEmptyState
                  icon={<DonutLarge sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }}/>}
                  message={'Select a category from the list, or right-click to add one.'}
                />
              )}
          </Grid>
        </Grid>
      )}

      {tabIndex === 2 && (
        <IngredientTypesTab
          types={ingredientTypes}
          onChange={applyIngredientTypes}
        />
      )}
    </EditorBoardSplitLayout>

      <Snackbar open={snackOpen} autoHideDuration={2500} onClose={handleSnackClose}>
        <Alert
          onClose={handleSnackClose}
          severity={snackSeverity}
          variant={snackVariant}
          sx={{ width: '100%' }}
        >
          {snackMessage}
        </Alert>
      </Snackbar>

      <Menu
        open={recipeListContextMenu !== null}
        onClose={handleRecipeListContextMenuOnCloseEvent}
        anchorReference={'anchorPosition'}
        anchorPosition={recipeListContextMenu !== null
          ? {
            top: recipeListContextMenu.mouseY,
            left: recipeListContextMenu.mouseX
          }
          : undefined}
      >
        <MenuItem onClick={() =>
        {
          handleAddNewRecipe(selectedRecipeIndex);
          handleRecipeListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new above</Typography>
        </MenuItem>

        <MenuItem onClick={() =>
        {
          handleAddNewRecipe(selectedRecipeIndex + 1);
          handleRecipeListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new below</Typography>
        </MenuItem>

        <Divider/>

        <MenuItem onClick={() =>
        {
          handleCloneRecipe(selectedRecipeIndex);
          handleRecipeListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone above</Typography>
        </MenuItem>

        <MenuItem onClick={() =>
        {
          handleCloneRecipe(selectedRecipeIndex + 1);
          handleRecipeListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone below</Typography>
        </MenuItem>

        <MenuItem dense onClick={() =>
        {
          handleDeleteRecipe(selectedRecipeIndex);
          handleRecipeListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Remove/></ListItemIcon>
          <Typography>Remove Selected</Typography>
        </MenuItem>
      </Menu>

      <Menu
        open={categoryListContextMenu !== null}
        onClose={handleCategoryListContextMenuOnCloseEvent}
        anchorReference={'anchorPosition'}
        anchorPosition={categoryListContextMenu !== null
          ? {
            top: categoryListContextMenu.mouseY,
            left: categoryListContextMenu.mouseX
          }
          : undefined}
      >
        <MenuItem onClick={() =>
        {
          handleAddCategory(selectedCategoryIndex);
          handleCategoryListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new above</Typography>
        </MenuItem>

        <MenuItem onClick={() =>
        {
          handleAddCategory(selectedCategoryIndex + 1);
          handleCategoryListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Add/></ListItemIcon>
          <Typography>Add new below</Typography>
        </MenuItem>

        <Divider/>

        <MenuItem onClick={() =>
        {
          handleCloneCategory(selectedCategoryIndex);
          handleCategoryListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone above</Typography>
        </MenuItem>

        <MenuItem onClick={() =>
        {
          handleCloneCategory(selectedCategoryIndex + 1);
          handleCategoryListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><ContentCopy/></ListItemIcon>
          <Typography>Clone below</Typography>
        </MenuItem>

        <MenuItem dense onClick={() =>
        {
          handleDeleteCategory(selectedCategoryIndex);
          handleCategoryListContextMenuOnCloseEvent();
        }}>
          <ListItemIcon><Remove/></ListItemIcon>
          <Typography>Remove Selected</Typography>
        </MenuItem>
      </Menu>
  </>;
};

export default CraftingBoard;
