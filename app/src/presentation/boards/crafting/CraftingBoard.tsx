import React, {
  ChangeEvent,
  MouseEvent,
  useEffect,
  useState
} from 'react';
import {
  Alert,
  Autocomplete,
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
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  Add,
  Check,
  ContentCopy,
  DonutLarge,
  DonutSmall,
  Key,
  ListAlt,
  Lock,
  LockOpen,
  Remove,
  Subject,
  Visibility,
  VisibilityOff
} from "@mui/icons-material";
import styled from "styled-components";
import { FixedSizeList } from 'react-window';
import CraftingComponentList from "./CraftingComponentList.tsx";

import {
  executeLoad,
  executeSave
} from "@services/DataService.ts";

import ConfigFilenames from "@core/enums/ConfigFilenames.ts";
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from "@core/enums/MuiSnackbar.ts";
import CraftingListType from "@core/enums/CraftingListType.ts";

import Crafting from "@types/custom/Crafting";
import SaveButton from "../../../components/core/SaveButton.tsx";
import KeyTextField from "../../../components/core/KeyTextField.tsx";
import Configuration = Crafting.Configuration;
import Recipe = Crafting.Recipe;
import Category = Crafting.Category;
import CraftingConfiguration = Crafting.Configuration;
import CraftingComponent = Crafting.CraftingComponent;
import { useProjectPath } from "../../context/project-path.context.tsx";

// ================================================================================================
const EntryText = styled(ListItemText)`
    font-family: monospace;
`;

// ================================================================================================
/**
 * The main board that encapsulates all things related to crafting.
 */
export default function CraftingBoard()
{
  const { projectPath } = useProjectPath();

  //region state
  const [ recipes, setRecipes ] = useState<Recipe[]>([]);
  const [ selectedRecipe, setSelectedRecipe ] = useState<Recipe | null>(null);
  const [ selectedRecipeIndex, setSelectedRecipeIndex ] = useState<number>(0);

  const [ applicableCategories, setApplicableCategories ] = useState<string[]>([]);
  const [ currentIngredients, setCurrentIngredients ] = useState<CraftingComponent[]>([]);
  const [ currentTools, setCurrentTools ] = useState<CraftingComponent[]>([]);
  const [ currentOutputs, setCurrentOutputs ] = useState<CraftingComponent[]>([]);

  const [ categories, setCategories ] = useState<Category[]>([]);
  const [ selectedCategory, setSelectedCategory ] = useState<Category | null>(null);
  const [ selectedCategoryIndex, setSelectedCategoryIndex ] = useState<number>(0);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>("");
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

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    if (!projectPath || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      const craftingData = await executeLoad<Configuration>(projectPath, ConfigFilenames.Crafting);
      if (!ignore && craftingData)
      {
        // update the data list.
        setRecipes(craftingData.recipes);

        // update the other data.
        setCategories(craftingData.categories);
      }

      // enable saving.
      setCanSave(true);
    };

    initializeState(projectPath)
      .catch(console.error);
    return () =>
    {
      ignore = true;
    }
  }, [ projectPath ]);

  //region actions
  const handleSnack = (
    message: string,
    severity: MuiSnackbarSeverity = MuiSnackbarSeverity.Info,
    variant: MuiSnackbarVariant = MuiSnackbarVariant.Filled) =>
  {
    setSnackMessage(message);
    setSnackSeverity(severity);
    setSnackVariant(variant);
    setSnackOpen(true);
  };

  const handleSaveButtonOnClickEvent = async () =>
  {
    // reconstruct the data shape to be saved.
    const updatedConfiguration = {
      recipes: recipes,
      categories: categories
    } as CraftingConfiguration;

    // save the data to disk.
    await executeSave(projectPath, ConfigFilenames.Crafting, updatedConfiguration);

    setCanSave(true);

    handleSnack("Crafting data has been saved successfully.");
  };

  const handleSnackClose = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') return;

    setSnackOpen(false);
  };

  const handleRecipeListItemOnClickEvent = (index: number,) =>
  {
    setSelectedRecipeIndex(index);

    if (recipes?.length > 0)
    {
      const recipe = recipes.at(index) as Recipe;
      setSelectedRecipe(recipe);
      setApplicableCategories(recipe.categoryKeys);
      setCurrentIngredients(recipe.ingredients);
      setCurrentTools(recipe.tools);
      setCurrentOutputs(recipe.outputs);
    }
  };

  const handlRecipeListContextMenu = (event: MouseEvent) =>
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

  const handleCategoryListItemOnClickEven = (index: number) =>
  {
    setSelectedCategoryIndex(index);

    if (categories.length > 0)
    {
      const category = categories[index];
      setSelectedCategory(category);
      // TODO: update the inputs.
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
  const handleRecipeKeyOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      key: input
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      name: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeIconIndexOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    const updatedValue = value < -1
      ? -1
      : value;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      iconIndex: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      description: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeMaskedUntilCraftedOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // grab the updated value from the input.
    const updatedValue = event.target.checked;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      maskedUntilCrafted: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeUnlockedByDefaultOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // grab the updated value from the input.
    const updatedValue = event.target.checked;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      unlockedByDefault: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeCategoryKeyToggle = (value: string) =>
  {
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

    setApplicableCategories(newChecked.sort());

    const updatedRecipe = {
      ...selectedRecipe,
      categoryKeys: newChecked
    } as Recipe;
    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleCategoryKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      key: updatedValue
    } as Category;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      name: updatedValue
    } as Category;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryIconIndexOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory) return;

    const updatedValue = value < -1
      ? -1
      : value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      iconIndex: updatedValue
    } as Category;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryUnlockedByDefaultOnCheckEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory) return;

    // grab the updated value from the input.
    const updatedValue = event.target.checked;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      unlockedByDefault: updatedValue
    } as Category;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryDescriptionOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      description: updatedValue
    } as Category;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const updateCraftingComponentList = (craftingComponents: CraftingComponent[], craftingListType: CraftingListType) =>
  {
    const updatedRecipe = {
      ...selectedRecipe,
    } as Recipe;

    switch (craftingListType)
    {
      case CraftingListType.Ingredients:
        updatedRecipe.ingredients = craftingComponents;
        setCurrentIngredients(craftingComponents);
        break;
      case CraftingListType.Tools:
        updatedRecipe.tools = craftingComponents;
        setCurrentTools(craftingComponents);
        break;
      case CraftingListType.Outputs:
        updatedRecipe.outputs = craftingComponents;
        setCurrentOutputs(craftingComponents);
        break;
    }

    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleAddNewRecipe = (index: number) =>
  {
    const newRecipe = {
      key: "NEW-RECIPE",
      name: "",
      description: "",
      iconIndex: -1,
      maskedUntilCrafted: true,
      unlockedByDefault: false,
      categoryKeys: [],
      ingredients: [],
      tools: [],
      outputs: []
    } as Recipe;

    const updatedRecipes = recipes.toSpliced(index, 0, newRecipe);
    setRecipes(updatedRecipes);
  };

  const handleCloneRecipe = (index: number) =>
  {
    if (selectedRecipe === null) return;

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

    const updatedRecipes = recipes.toSpliced(index, 0, clonedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleDeleteRecipe = (index: number) =>
  {
    if (selectedRecipe === null) return;

    const updatedRecipes = recipes.toSpliced(index, 1);
    setRecipes(updatedRecipes);
  };

  const handleAddCategory = (index: number) =>
  {
    const newCategory = {
      key: "NEW-CATEGORY",
      name: "best category",
      description: "fill in with some description about the category.",
      iconIndex: -1,
      unlockedByDefault: false,
    } as Category;

    const updatedCategories = categories.toSpliced(index, 0, newCategory);
    setCategories(updatedCategories);
  };

  const handleCloneCategory = (index: number) =>
  {
    if (selectedCategory === null) return;

    const clonedCategory = {
      key: `${selectedCategory.key}-COPY`,
      name: selectedCategory.name,
      description: selectedCategory.description,
      iconIndex: selectedCategory.iconIndex,
      unlockedByDefault: selectedCategory.unlockedByDefault,
    } as Category;

    const updatedCategories = categories.toSpliced(index, 0, clonedCategory);
    setCategories(updatedCategories);
  };

  const handleDeleteCategory = (index: number) =>
  {
    if (selectedCategory === null) return;

    const updatedCategories = categories.toSpliced(index, 1);
    setCategories(updatedCategories);
  };
  //endregion updates

  //region render
  const renderRecipeListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const recipe = recipes.at(index);

    if (!recipe) return <></>;

    return (
      <ListItem key={index} style={style}>
        <ListItemButton
          focusRipple={false}
          selected={selectedRecipeIndex === index}
          onClick={() => handleRecipeListItemOnClickEvent(index)}
        >
          <ListItemIcon>
            {(selectedRecipeIndex === index)
              ? <ListAlt color={"success"}/>
              : <Subject color={"secondary"}/>}
          </ListItemIcon>
          <EntryText
            primary={recipe.name.length === 0
              ? recipe.key
              : recipe.name}
            disableTypography={true}
          />
        </ListItemButton>
      </ListItem>
    );
  };

  const renderCategoryListItem = (category: Category, index: number) =>
  {
    return (
      <ListItem
        key={index}
        dense
        disableGutters
      >
        <ListItemButton
          onClick={() => handleCategoryListItemOnClickEven(index)}
          selected={selectedCategoryIndex === index}
        >
          <ListItemIcon>
            {(selectedCategoryIndex === index)
              ? <DonutSmall color={"secondary"}/>
              : <DonutLarge color={"info"}/>}
          </ListItemIcon>
          <EntryText
            primary={`${category.key}: ${category.name}`}
            disableTypography/>

        </ListItemButton>
      </ListItem>
    )
  };
  //endregion render

  return <>
    <Grid container spacing={2}>
      {/* This is the data list of all entries the user can modify. */}
      <Grid size={3}>
        <div onContextMenu={handlRecipeListContextMenu} style={{ cursor: 'context-menu' }}>
          {/* @ts-ignore */}
          <FixedSizeList
            height={1030}
            itemSize={30}
            overscanCount={5}
            itemCount={recipes.length}
          >
            {renderRecipeListItem}
          </FixedSizeList>
        </div>
      </Grid>

      {/* This is the form fields for modifying the selected entry. */}
      <Grid size={9}>
        <Paper sx={{
          height: '100%',
          width: '100%',
          padding: 2
        }} elevation={10}>
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
                    variant={"outlined"}
                    label={"Name"}
                    value={selectedRecipe.name}
                    onChange={handleRecipeNameOnChangeEvent}
                    size={"small"}
                    fullWidth
                  />
                </Grid>

                {/* Icon */}
                <Grid size={1}>
                  <TextField
                    type={"number"}
                    label={"Icon Index"}
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
                      labelPlacement={"end"}
                    />

                    <FormControlLabel
                      control={<Checkbox
                        checked={selectedRecipe.maskedUntilCrafted}
                        checkedIcon={<VisibilityOff/>}
                        icon={<Visibility/>}
                        onChange={handleRecipeMaskedUntilCraftedOnCheckEvent}
                      />}
                      label="Masked Until Crafted"
                      labelPlacement={"end"}
                    />
                  </Stack>
                </Grid>

                {/* Description */}
                <Grid size={8}>
                  <TextField
                    variant={"outlined"}
                    label={"Description"}
                    value={selectedRecipe.description}
                    onChange={handleRecipeDescriptionOnChangeEvent}
                    size={"small"}
                    multiline
                    fullWidth
                    rows={4}
                  />
                </Grid>

                {/* Category key management */}
                <Grid size={4}>
                  <Stack spacing={2}>
                    <Button
                      size={"small"}
                      fullWidth
                      variant={"outlined"}
                      color={"secondary"}
                      onClick={() => setCategoryDialogOpen(true)}
                    >
                      Modify Categories
                    </Button>
                    <Autocomplete
                      size={"small"}
                      options={[ ...categories ].sort()}
                      disableCloseOnSelect
                      groupBy={option => option.key.split("-")[0]}
                      slotProps={{
                        listbox: {
                          sx: { maxHeight: '400px' }
                        }
                      }}
                      getOptionKey={(option) => option.key}
                      getOptionLabel={(option) => option.name}
                      renderOption={(props, option) =>
                      {
                        if (option === null || option.name === "" || option.name.startsWith("=="))
                        {
                          return <li {...props} style={{ display: 'none' }}/>;
                        }

                        return (
                          <li {...props} key={props.key} style={{ height: 32 }}>
                            <ListItem disableGutters disablePadding sx={{ height: 32 }}>
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
                          size={"small"}
                          label={"Choose Categories"}
                          placeholder="Category key..."/>)
                      }}
                    />
                  </Stack>
                </Grid>

                {/* Ingredients management */}
                <Grid size={4}>
                  <CraftingComponentList
                    projectPath={projectPath}
                    type={CraftingListType.Ingredients}
                    updateRecipeFunc={updateCraftingComponentList}
                    components={currentIngredients}
                    handleSnack={handleSnack}
                  />
                </Grid>

                {/* Tools management */}
                <Grid size={4}>
                  <CraftingComponentList
                    projectPath={projectPath}
                    type={CraftingListType.Tools}
                    updateRecipeFunc={updateCraftingComponentList}
                    components={currentTools}
                    handleSnack={handleSnack}
                  />
                </Grid>

                {/* Outputs management */}
                <Grid size={4}>
                  <CraftingComponentList
                    projectPath={projectPath}
                    type={CraftingListType.Outputs}
                    updateRecipeFunc={updateCraftingComponentList}
                    components={currentOutputs}
                    handleSnack={handleSnack}
                  />
                </Grid>
              </Grid>
            </>}

        </Paper>
      </Grid>

      {/*region not-grid-related elements */}
      {/* This is over-arching save button- it will save all recipes to disk. */}
      <SaveButton
        extraSaveText={"Recipes"}
        canSave={canSave}
        handleSave={async () =>
        {
          setCanSave(false);
          await handleSaveButtonOnClickEvent();
        }}
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
        maxWidth={"lg"}
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
                  {categories.map((category, index) => renderCategoryListItem(category, index))}
                </List>
              </div>
            </Grid>

            {/* category modification */}
            <Grid size={8}>
              <Stack spacing={2}>
                {/* Key */}
                <TextField
                  required
                  variant={"outlined"}
                  label={"Key"}
                  value={selectedCategory?.key}
                  onChange={handleCategoryKeyOnChangeEvent}
                  size={"small"}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position={"start"}>
                        <Key/>
                      </InputAdornment>
                    }
                  }}
                />

                {/* Name */}
                <TextField
                  variant={"outlined"}
                  label={"Name"}
                  value={selectedCategory?.name}
                  onChange={handleCategoryNameOnChangeEvent}
                  size={"small"}
                />

                {/* Icon */}
                <TextField
                  type={"number"}
                  label={"Icon Index"}
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
                  labelPlacement={"end"}
                />

                {/* Description */}
                <TextField
                  variant={"outlined"}
                  label={"Description"}
                  value={selectedCategory?.description}
                  onChange={handleCategoryDescriptionOnChangeEvent}
                  size={"small"}
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
            variant={"contained"}
            startIcon={<Check/>}
            color={"success"}
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
    </Grid>
  </>;
}
