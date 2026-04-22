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
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Typography
} from '@mui/material';
import {
  Add,
  Check,
  ContentCopy,
  DonutLarge,
  DonutSmall,
  Key,
  Lock,
  LockOpen,
  Remove,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import styled from 'styled-components';
import { FixedSizeList } from 'react-window';
import CraftingComponentList, {
  readDatabaseDescription,
  readDatabaseIconIndex,
} from './CraftingComponentList.tsx';

import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';
import CraftingComponentType from '@core/enums/CraftingComponentType.ts';
import CraftingListType from '@core/enums/CraftingListType.ts';
import { RPG_ArmorDomainModel } from '@core/domain/entities/RPG_ArmorDomainModel.ts';
import { RPG_ItemDomainModel } from '@core/domain/entities/RPG_ItemDomainModel.ts';
import { RPG_WeaponDomainModel } from '@core/domain/entities/RPG_WeaponDomainModel.ts';

import SaveButton from '../../../components/core/SaveButton.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';
import KeyTextField from '../../../components/core/KeyTextField.tsx';
import { useCrafting } from '@presentation/context/resources/crafting.context.tsx';
import { useItems } from '@presentation/context/resources/items.context.tsx';
import { useWeapons } from '@presentation/context/resources/weapons.context.tsx';
import { useArmors } from '@presentation/context/resources/armors.context.tsx';
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
    setRecipes,
    setCategories,
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
  const [ selectedRecipe, setSelectedRecipe ] = useState<Recipe | null>(null);
  const [ selectedRecipeIndex, setSelectedRecipeIndex ] = useState<number>(0);

  const [ applicableCategories, setApplicableCategories ] = useState<string[]>([]);
  const [ currentIngredients, setCurrentIngredients ] = useState<CraftingComponent[]>([]);
  const [ currentTools, setCurrentTools ] = useState<CraftingComponent[]>([]);
  const [ currentOutputs, setCurrentOutputs ] = useState<CraftingComponent[]>([]);

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

  const [ categoryDialogOpen, setCategoryDialogOpen ] = useState<boolean>(false);
  //endregion state

  const recipeDescriptionPlaceholderFromFirstOutput = useMemo(() =>
  {
    if (selectedRecipe === null)
    {
      return '';
    }

    if (selectedRecipe.description.trim().length > 0)
    {
      return '';
    }

    return readDatabaseDescription(recipeFirstOutputDatabaseRow(
      selectedRecipe,
      itemsById,
      weaponsById,
      armorsById
    ));
  }, [ selectedRecipe, itemsById, weaponsById, armorsById ]);

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
   * When the category dialog opens or the in-memory category list is replaced, clamp the index and bind the
   * form to the corresponding row. Row clicks still go through {@link handleCategoryListItemOnClickEvent};
   * this effect covers open, reload, delete, and edits that swap the array under the same index.
   */
  useEffect(() =>
  {
    if (!categoryDialogOpen || loading || categories.length === 0)
    {
      return;
    }

    const idx = Math.min(Math.max(0, selectedCategoryIndex), categories.length - 1);
    if (idx !== selectedCategoryIndex)
    {
      setSelectedCategoryIndex(idx);
    }

    setSelectedCategory(categories[ idx ]);
  }, [ categoryDialogOpen, categories, loading, selectedCategoryIndex ]);

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

  const handleRecipeCategoryKeyToggle = (value: string) =>
  {
    if (selectedRecipe === null)
    {
      return;
    }

    const currentIndex = applicableCategories.indexOf(value);
    const newChecked = [ ...applicableCategories ];

    if (currentIndex === -1)
    {
      newChecked.push(value);
    }
    else
    {
      newChecked.splice(currentIndex, 1);
    }

    const sorted = newChecked.sort();
    setApplicableCategories(sorted);
    patchSelectedRecipe({ categoryKeys: sorted });
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
      outputs: []
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
      outputs: clonedOutputs
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
   *
   * @param index Index in {@link recipes}.
   * @returns Spacer or sidebar row descriptor.
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

    const label = recipe.name.length === 0
      ? recipe.key
      : recipe.name;
    const title = recipe.name.length === 0
      ? recipe.key
      : `${recipe.key}: ${recipe.name}`;

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

  return <>
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <EditorBoardSplitLayout
        sidebarColumnWidth={craftingBoardListColumnWidth}
        sidebar={
          <Box sx={{ flex: 1, minHeight: 0 }}>
          <div onContextMenu={handleRecipeListContextMenu} style={{ cursor: 'context-menu' }}>
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
              listWrapperRef={listWrapperRef}
            />
          </div>
          </Box>
        }
      >
          {(selectedRecipe === null)
            ? <Grid container>
              <Typography>
                Please select a recipe on the left.<br/>
                If there are no recipes, then consider making one.
              </Typography>
            </Grid>

            : <>
              <Grid container rowSpacing={2} columnSpacing={4}>
                {/* Key */}
                <Grid size={4}>
                  <KeyTextField
                    value={selectedRecipe.key}
                    onChange={handleRecipeKeyOnChangeEvent}
                  />
                </Grid>

                {/* Name */}
                <Grid size={4}>
                  <TextField
                    variant={'outlined'}
                    label={'Name'}
                    value={selectedRecipe.name}
                    onChange={handleRecipeNameOnChangeEvent}
                    size={'small'}
                    fullWidth
                  />
                </Grid>

                {/* Icon */}
                <Grid size={1}>
                  <TextField
                    type={'number'}
                    label={'Icon Index'}
                    value={selectedRecipe.iconIndex ?? -1}
                    sx={{ width: '80px' }}
                    onChange={(event) => handleRecipeIconIndexOnChangeEvent(parseInt(event.target.value) ?? -1)}
                  />
                </Grid>

                {/* Initial visibility checkboxes */}
                <Grid size={3}>
                  <Stack spacing={0}>
                    <FormControlLabel
                      control={<Checkbox
                        checked={selectedRecipe.unlockedByDefault}
                        checkedIcon={<LockOpen/>}
                        icon={<Lock/>}
                        onChange={handleRecipeUnlockedByDefaultOnCheckEvent}
                      />}
                      label="Unlocked By Default"
                      labelPlacement={'end'}
                    />

                    <FormControlLabel
                      control={<Checkbox
                        checked={selectedRecipe.maskedUntilCrafted}
                        checkedIcon={<VisibilityOff/>}
                        icon={<Visibility/>}
                        onChange={handleRecipeMaskedUntilCraftedOnCheckEvent}
                      />}
                      label="Masked Until Crafted"
                      labelPlacement={'end'}
                    />
                  </Stack>
                </Grid>

                {/* Description */}
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

                {/* Category key management */}
                <Grid size={4}>
                  <Stack spacing={2}>
                    <Button
                      size={'small'}
                      fullWidth
                      variant={'outlined'}
                      color={'secondary'}
                      onClick={() => setCategoryDialogOpen(true)}
                    >
                      Modify Categories
                    </Button>
                    <Autocomplete
                      size={'small'}
                      options={[ ...categories ].sort()}
                      disableCloseOnSelect
                      groupBy={option => option.key.split('-')[ 0 ]}
                      slotProps={{
                        listbox: {
                          sx: { maxHeight: '400px' }
                        }
                      }}
                      getOptionKey={(option) => option.key}
                      getOptionLabel={(option) => option.name}
                      renderOption={(
                        props,
                        option
                      ) =>
                      {
                        const {
                          key,
                          style,
                          ...optionProps
                        } = props;

                        if (option === null || option.name === '' || option.name.startsWith('=='))
                        {
                          return <li key={key} {...optionProps} style={{ display: 'none' }}/>;
                        }

                        const mergedStyle = {
                          ...(typeof style === 'object' && style !== null && !Array.isArray(style)
                            ? style
                            : {}),
                          height: 32,
                        };

                        return (
                          <li key={key} {...optionProps} style={mergedStyle}>
                            <ListItem
                              component="div"
                              disableGutters
                              disablePadding
                              sx={{ height: 32 }}
                            >
                              <ListItemIcon sx={{ height: 32 }}>
                                <Checkbox
                                  checked={applicableCategories.includes(option.key)}
                                  onChange={() => handleRecipeCategoryKeyToggle(option.key)}/>
                                <EntryText
                                  primary={`${option.key}: ${option.name}`}
                                  disableTypography={true}
                                />
                              </ListItemIcon>
                            </ListItem>
                          </li>
                        );
                      }}
                      renderInput={(params) =>
                      {
                        return (<TextField
                          {...params}
                          size={'small'}
                          label={'Choose Categories'}
                          placeholder="Category key..."/>);
                      }}
                    />
                  </Stack>
                </Grid>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
                </Box>
              </Grid>
            </>}

      </EditorBoardSplitLayout>
    </Box>

      {/*region not-grid-related elements */}
      {/* This is over-arching save button- it will save all recipes to disk. */}
      <SaveButton
        extraSaveText={'Recipes'}
        canSave={canSave && !loading}
        handleSave={async () =>
        {
          setCanSave(false);
          await save({
            recipes,
            categories
          } as Configuration);
          handleSnack('Crafting data has been saved successfully.');
        }}
      />
      <ReloadButton
        handleReload={handleReloadButtonOnClickEvent}
        canReload={!loading}
        extraReloadText={'Crafting Data'}
      />

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
        anchorReference="anchorPosition"
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

      <Dialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        maxWidth={'lg'}
        fullWidth
      >
        <DialogTitle>
          Category Management
        </DialogTitle>
        <DialogContent>
          <Grid container rowSpacing={2} columnSpacing={2}>
            {/* list of categories */}
            <Grid size={4}>
              <div onContextMenu={handleCategoryListContextMenu} style={{ cursor: 'context-menu' }}>
                <List>
                  {categories.map((
                    category,
                    index
                  ) => renderCategoryListItem(category, index))}
                </List>
              </div>
            </Grid>

            {/* category modification */}
            <Grid size={8}>
              <Stack spacing={2}>
                {/* Key */}
                <TextField
                  required
                  variant={'outlined'}
                  label={'Key'}
                  value={selectedCategory?.key}
                  onChange={handleCategoryKeyOnChangeEvent}
                  size={'small'}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position={'start'}>
                        <Key/>
                      </InputAdornment>
                    }
                  }}
                />

                {/* Name */}
                <TextField
                  variant={'outlined'}
                  label={'Name'}
                  value={selectedCategory?.name}
                  onChange={handleCategoryNameOnChangeEvent}
                  size={'small'}
                />

                {/* Icon */}
                <TextField
                  type={'number'}
                  label={'Icon Index'}
                  value={selectedCategory?.iconIndex ?? -1}
                  sx={{ width: '80px' }}
                  onChange={(event) => handleCategoryIconIndexOnChangeEvent(parseInt(event.target.value) ?? -1)}
                />

                {/* Initial visibility checkboxes */}
                <FormControlLabel
                  control={<Checkbox
                    checked={selectedCategory?.unlockedByDefault}
                    checkedIcon={<LockOpen/>}
                    icon={<Lock/>}
                    onChange={handleCategoryUnlockedByDefaultOnCheckEvent}
                  />}
                  label="Unlocked By Default"
                  labelPlacement={'end'}
                />

                {/* Description */}
                <TextField
                  variant={'outlined'}
                  label={'Description'}
                  value={selectedCategory?.description}
                  onChange={handleCategoryDescriptionOnChangeEvent}
                  size={'small'}
                  multiline
                  fullWidth
                  rows={4}
                />
              </Stack>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button
            variant={'contained'}
            startIcon={<Check/>}
            color={'success'}
            onClick={() => setCategoryDialogOpen(false)}
          >
            <Typography>Done Modifying Categories</Typography>
          </Button>
        </DialogActions>
      </Dialog>

      <Menu
        open={categoryListContextMenu !== null}
        onClose={handleCategoryListContextMenuOnCloseEvent}
        anchorReference="anchorPosition"
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
      {/*endregion not-grid-related elements */}
  </>;
};

export default CraftingBoard;
