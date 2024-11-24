import React, { ChangeEvent, useEffect, useState } from 'react';
import LoadingButton from '@mui/lab/LoadingButton';
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Grid2,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import {
  Add,
  BusinessCenter,
  Clear,
  Key,
  ListAlt,
  LocalDining,
  Lock,
  LockOpen,
  QuestionMark,
  Save,
  Shield,
  Subject,
  Sync,
  Visibility,
  VisibilityOff
} from "@mui/icons-material";
import styled from "styled-components";
import { FixedSizeList } from 'react-window';

import { BoardProps } from "../../../types/local/BoardProps";

import { executeLoad, executeSave, loadArmors, loadItems, loadWeapons } from "../../services/DataService.ts";

import ConfigFilenames from "../../../types/custom/ConfigFilenames.ts";

import { Crafting } from "../../../types/custom/Crafting";
import CraftingComponentType from "../../../types/custom/CraftingComponentType.ts";
import { brown, } from "@mui/material/colors";
import { MuiSnackbarSeverity, MuiSnackbarVariant } from "../../../types/external/MuiSnackbar.ts";
import RPG_Item = Rmmz.Implementations.RPG_Item;
import RPG_Weapon = Rmmz.Implementations.RPG_Weapon;
import RPG_Armor = Rmmz.Implementations.RPG_Armor;
import Configuration = Crafting.Configuration;
import Recipe = Crafting.Recipe;
import Category = Crafting.Category;
import CraftingConfiguration = Crafting.Configuration;
import CraftingComponent = Crafting.CraftingComponent;

// ================================================================================================
const EntryText = styled(ListItemText)`
    font-family: monospace;
`;

const SaveStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "8%",
  right: "1%",
};

// ================================================================================================
/**
 * The main board that encapsulates all things related to crafting.
 */
export default function CraftingBoard(craftingBoardProps: BoardProps)
{
  const [ recipes, setRecipes ] = useState<Recipe[]>([]);
  const [ selectedRecipe, setSelectedRecipe ] = useState<Recipe | null>(null);
  const [ selectedRecipeIndex, setSelectedRecipeIndex ] = useState<number>(0);

  const [ currentIngredients, setCurrentIngredients ] = useState<CraftingComponent[]>([]);
  const [ selectedIngredient, setSelectedIngredient ] = useState<CraftingComponent | null>(null);
  const [ selectedIngredientType, setSelectedIngredientType ] = useState<CraftingComponentType | null>(null);
  const [ selectedIngredientIndex, setSelectedIngredientIndex ] = useState<number>(0);
  const [ pendingIngredient, setPendingIngredient ] = useState<CraftingComponent | null>(null);

  const [ currentTools, setCurrentTools ] = useState<CraftingComponent[]>([]);
  const [ selectedTool, setSelectedTool ] = useState<CraftingComponent | null>(null);
  const [ selectedToolType, setSelectedToolType ] = useState<CraftingComponentType | null>(null);
  const [ selectedToolIndex, setSelectedToolIndex ] = useState<number>(0);
  const [ pendingTool, setPendingTool ] = useState<CraftingComponent | null>(null);

  const [ currentOutputs, setCurrentOutputs ] = useState<CraftingComponent[]>([]);
  const [ selectedOutput, setSelectedOutput ] = useState<CraftingComponent | null>(null);
  const [ selectedOutputType, setSelectedOutputType ] = useState<CraftingComponentType | null>(null);
  const [ selectedOutputIndex, setSelectedOutputIndex ] = useState<number>(0);
  const [ pendingOutput, setPendingOutput ] = useState<CraftingComponent | null>(null);

  const [ categories, setCategories ] = useState<Category[]>([]);

  const [ items, setItems ] = useState<RPG_Item[]>([]);
  const [ weapons, setWeapons ] = useState<RPG_Weapon[]>([]);
  const [ armors, setArmors ] = useState<RPG_Armor[]>([]);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>("");
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    const { projectPath } = craftingBoardProps;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      // TODO: add popup warning in this method and add a reset button?

      const craftingData = await executeLoad<Configuration>(projectPath, ConfigFilenames.Crafting);
      if (!ignore && craftingData)
      {
        // update the data list.
        setRecipes(craftingData.recipes);

        // update the other data.
        setCategories(craftingData.categories);
      }

      const itemData = await loadItems(projectPath);
      if (!ignore && itemData)
      {
        setItems(itemData);
      }

      const weaponData = await loadWeapons(projectPath);
      if (!ignore && weaponData)
      {
        setWeapons(weaponData);
      }

      const armorData = await loadArmors(projectPath);
      if (!ignore && armorData)
      {
        setArmors(armorData);
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
  }, [ craftingBoardProps.projectPath ]);

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
    await executeSave(craftingBoardProps.projectPath, ConfigFilenames.Crafting, updatedConfiguration);

    setCanSave(true);

    handleSnack("Crafting data has been saved successfully.");
  };

  const handleSnackClose = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') return;

    setSnackOpen(false);
  };

  const handleRecipeListItemOnClickEvent = (_: any, index: number,) =>
  {
    setSelectedRecipeIndex(index);

    if (recipes?.length > 0)
    {
      const recipe = recipes.at(index) as Recipe;
      setSelectedRecipe(recipe);
      setCurrentIngredients(recipe.ingredients);
      setCurrentTools(recipe.tools);
      setCurrentOutputs(recipe.outputs);

      // TODO: setup tools and output.

      setSelectedIngredient(null);
      setSelectedIngredientType(null);
      setSelectedIngredientIndex(0);
      setPendingIngredient(null);

      setSelectedTool(null);
      setSelectedToolType(null);
      setSelectedToolIndex(0);
      setPendingTool(null);

      setSelectedOutput(null);
      setSelectedOutputType(null);
      setSelectedOutputIndex(0);
      setPendingOutput(null);
    }
  };

  const handleRecipeIngredientListItemOnClickEvent = (_: any, index: number) =>
  {
    setSelectedIngredientIndex(index);
    setSelectedIngredient(null);
    setPendingIngredient(null);

    if (currentIngredients?.length > 0)
    {
      const thisIngredient = currentIngredients[index];
      setSelectedIngredient(thisIngredient);
      setSelectedIngredientType(thisIngredient.type);
      setPendingIngredient(thisIngredient);
    }
  };

  const handleRecipeToolListItemOnClickEvent = (_: any, index: number) =>
  {
    setSelectedToolIndex(0);
    setSelectedTool(null);
    setPendingTool(null);

    if (currentTools?.length > 0)
    {
      const thisTool = currentTools[index];
      setSelectedTool(thisTool);
      setSelectedToolType(thisTool.type);
      setSelectedToolIndex(index);
      setPendingTool(thisTool);
    }
  };

  const handleRecipeOutputListItemOnClickEvent = (_: any, index: number) =>
  {
    setSelectedOutputIndex(0);
    setSelectedOutput(null);
    setPendingOutput(null);

    if (currentOutputs?.length > 0)
    {
      const thisComponent = currentOutputs[index];
      setSelectedOutput(thisComponent);
      setSelectedOutputType(thisComponent.type);
      setSelectedOutputIndex(index);
      setPendingOutput(thisComponent);
    }
  };
  //endregion actions

  //region updates
  const handleRecipeKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      key: updatedValue
    };
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

  //region ingredients
  const handlePendingIngredientCountOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!pendingIngredient) return;

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedPendingIngredient = {
      ...pendingIngredient,
      count: updatedValue
    } as CraftingComponent;
    setPendingIngredient(updatedPendingIngredient);
  };

  const handleRelevantIngredientDropdownOnClickEvent = (newComponent: RPG_Item | RPG_Weapon | RPG_Armor) =>
  {
    let ingredientType = CraftingComponentType.Item;
    switch (newComponent.kind)
    {
      case 1:
        ingredientType = CraftingComponentType.Item;
        break;
      case 2:
        ingredientType = CraftingComponentType.Weapon;
        break;
      case 3:
        ingredientType = CraftingComponentType.Armor;
        break;
    }
    const updatedSelectedIngredient = {
      ...pendingIngredient,
      id: newComponent.id,
      type: ingredientType
    } as CraftingComponent;

    setPendingTool(updatedSelectedIngredient);
  };

  const handleRecipeIngredientTypeOnChangeEvent = (_: any, newValue: CraftingComponentType) =>
  {
    setSelectedIngredientType(newValue);
  };

  const handleOverrideSelectedWithPendingIngredientOnClickEvent = () =>
  {
    if (!pendingIngredient || !selectedIngredient) return;

    const updatedSelectedIngredient = {
      type: pendingIngredient.type,
      id: pendingIngredient.id,
      count: pendingIngredient.count
    } as CraftingComponent;

    setSelectedIngredient(updatedSelectedIngredient);

    const updatedCurrentIngredients = currentIngredients.with(selectedIngredientIndex, updatedSelectedIngredient);
    setCurrentIngredients(updatedCurrentIngredients);

    const updatedRecipe = {
      ...selectedRecipe,
      ingredients: updatedCurrentIngredients
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleDeleteTargetIngredient = (targetIndex: number) =>
  {
    if (currentIngredients.length === 1)
    {
      handleSnack("Final ingredient cannot be removed. Consider updating it instead.", MuiSnackbarSeverity.Warning);
      return;
    }

    const updatedCurrentIngredients = currentIngredients.toSpliced(targetIndex, 1);
    setCurrentIngredients(updatedCurrentIngredients);

    const updatedRecipe = {
      ...selectedRecipe,
      ingredients: updatedCurrentIngredients
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);

    handleSnack("Ingredient has been removed.", MuiSnackbarSeverity.Success);
  };
  //endregion ingredients

  //region tools
  const handlePendingToolCountOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!pendingTool) return;

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedPendingTool = {
      ...pendingTool,
      count: updatedValue
    } as CraftingComponent;
    setPendingTool(updatedPendingTool);
  };

  const handleOverrideSelectedWithPendingToolOnClickEvent = () =>
  {
    if (!pendingTool || !selectedTool) return;

    const updatedSelectedTool = {
      type: pendingTool.type,
      id: pendingTool.id,
      count: pendingTool.count
    } as CraftingComponent;

    setSelectedTool(updatedSelectedTool);

    const updatedCurrentTools = currentTools.with(selectedToolIndex, updatedSelectedTool);
    setCurrentTools(updatedCurrentTools);

    const updatedRecipe = {
      ...selectedRecipe,
      tools: updatedCurrentTools
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRelevantToolDropdownOnClickEvent = (newComponent: RPG_Item | RPG_Weapon | RPG_Armor) =>
  {
    let toolType = CraftingComponentType.Item;
    switch (newComponent.kind)
    {
      case 1:
        toolType = CraftingComponentType.Item;
        break;
      case 2:
        toolType = CraftingComponentType.Weapon;
        break;
      case 3:
        toolType = CraftingComponentType.Armor;
        break;
    }
    const updatedSelectedTool = {
      ...pendingTool,
      id: newComponent.id,
      type: toolType
    } as CraftingComponent;

    setPendingTool(updatedSelectedTool);
  };

  const handleRecipeToolTypeOnChangeEvent = (_: any, newValue: CraftingComponentType) =>
  {
    setSelectedToolType(newValue);
  };

  const handleDeleteTargetTool = (targetIndex: number) =>
  {
    const updatedCurrentTools = currentTools.toSpliced(targetIndex, 1);
    setCurrentTools(updatedCurrentTools);

    const updatedRecipe = {
      ...selectedRecipe,
      tools: updatedCurrentTools
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);

    handleSnack("Tool has been removed.", MuiSnackbarSeverity.Success);
  };
  //endregion tools

  //region outputs
  const handlePendingOutputCountOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!pendingOutput) return;

    const updatedValue = value < 1
      ? 1
      : value;

    const updatedComponent = {
      ...pendingOutput,
      count: updatedValue
    } as CraftingComponent;
    setPendingOutput(updatedComponent);
  };

  const handleRelevantOutputDropdownOnClickEvent = (newComponent: RPG_Item | RPG_Weapon | RPG_Armor) =>
  {
    let componentType = CraftingComponentType.Item;
    switch (newComponent.kind)
    {
      case 1:
        componentType = CraftingComponentType.Item;
        break;
      case 2:
        componentType = CraftingComponentType.Weapon;
        break;
      case 3:
        componentType = CraftingComponentType.Armor;
        break;
    }
    const updatedComponent = {
      ...pendingTool,
      id: newComponent.id,
      type: componentType
    } as CraftingComponent;

    setPendingOutput(updatedComponent);
  };

  const handleOverrideSelectedWithPendingOutputOnClickEvent = () =>
  {
    if (!pendingOutput || !selectedOutput) return;

    const updatedSelectedComponent = {
      type: pendingOutput.type,
      id: pendingOutput.id,
      count: pendingOutput.count
    } as CraftingComponent;

    setSelectedOutput(updatedSelectedComponent);

    const updatedCurrentComponents = currentOutputs.with(selectedOutputIndex, updatedSelectedComponent);
    setCurrentOutputs(updatedCurrentComponents);

    const updatedRecipe = {
      ...selectedRecipe,
      outputs: updatedCurrentComponents
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);
  };

  const handleRecipeOutputTypeOnChangeEvent = (_: any, newValue: CraftingComponentType) =>
  {
    setSelectedOutputType(newValue);
  };

  const handleDeleteTargetOutput = (targetIndex: number) =>
  {
    const updatedCurrentComponents = currentOutputs.toSpliced(targetIndex, 1);
    setCurrentOutputs(updatedCurrentComponents);

    const updatedRecipe = {
      ...selectedRecipe,
      outputs: updatedCurrentComponents
    } as Recipe;
    setSelectedRecipe(updatedRecipe);

    const updatedRecipes = recipes.with(selectedRecipeIndex, updatedRecipe);
    setRecipes(updatedRecipes);

    handleSnack("Output has been removed.", MuiSnackbarSeverity.Success);
  };
  //endregion outputs

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

    return <>
      <ListItem key={index} style={style}>
        <ListItemButton
          focusRipple={false}
          selected={selectedRecipeIndex === index}
          onClick={event => handleRecipeListItemOnClickEvent(event, index)}
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
    </>;
  };

  const renderRecipeIngredient = (craftingComponent: CraftingComponent, index: number) =>
  {
    if (!craftingComponent) return <></>;

    const ingredient = currentIngredients.at(index);
    if (!ingredient) return <></>;

    let ingredientData = null;
    let icon = <QuestionMark/>;
    switch (ingredient.type)
    {
      case CraftingComponentType.Item:
        ingredientData = items.at(ingredient.id);
        icon = <BusinessCenter color={"success"}/>
        break;
      case CraftingComponentType.Weapon:
        ingredientData = weapons.at(ingredient.id);
        icon = <LocalDining color={"error"}/>
        break;
      case CraftingComponentType.Armor:
        ingredientData = armors.at(ingredient.id);
        icon = <Shield color={"info"}/>
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${ingredient.type}`)
    }

    return <>
      <ListItem
        key={`${index}-${ingredient.type}-${ingredient.id}`}
        disableGutters
        secondaryAction={<>
          <IconButton
            edge="end"
            onClick={() => handleDeleteTargetIngredient(index)}>
            <Clear/>
          </IconButton>
        </>}
      >
        <ListItemButton
          selected={selectedIngredientIndex === index}
          onClick={event => handleRecipeIngredientListItemOnClickEvent(event, index)}
        >
          <ListItemIcon sx={{ minWidth: '30px' }}>
            {icon}
          </ListItemIcon>
          <EntryText
            primary={`${ingredient.id}: ${ingredientData?.name} (${ingredient.count})`}
            disableTypography
            sx={{ width: '100%' }}
          />
        </ListItemButton>
      </ListItem>
    </>
  };

  const renderRelevantRecipeIngredientDropdown = () =>
  {
    switch (selectedIngredientType)
    {
      case CraftingComponentType.Item:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...items ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, otherOption) => option.id === otherOption.id}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={props.key}></React.Fragment>;
              }

              return (<ListItem
                key={props.key}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantIngredientDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={"small"}
                label={"Items"}
                placeholder="Item name..."
              />
            }}
          />
        </>;
      case CraftingComponentType.Weapon:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...weapons ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantIngredientDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Weapons"}
                placeholder="Weapon name..."/>)
            }}
          />
        </>;
      case CraftingComponentType.Armor:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...armors ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantIngredientDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Armors"}
                placeholder="Armor name..."/>)
            }}
          />
        </>;
    }
  };

  const renderSelectedIngredientChip = () =>
  {
    if (!selectedIngredient) return <></>;
    if (selectedIngredientIndex < 0) return <></>;

    return buildComponentChip(selectedIngredient);
  };

  const renderPendingIngredientChip = () =>
  {
    if (!pendingIngredient) return <></>;

    return <>
      <Grid2 container spacing={2}>
        <Grid2 size={6}>
          {buildComponentChip(pendingIngredient)}
        </Grid2>
        <Grid2 size={4}>
          <TextField
            type={"number"}
            label={"Count"}
            value={pendingIngredient.count}
            sx={{ width: '80px' }}
            onChange={(event) => handlePendingIngredientCountOnChangeEvent(parseInt(event.target.value) ?? 1)}
          />
        </Grid2>
        <Grid2 size={2}>
          <IconButton
            color={"secondary"}
            onClick={() => handleOverrideSelectedWithPendingIngredientOnClickEvent()}
          >
            <Sync/>
          </IconButton>
        </Grid2>
      </Grid2>
    </>;
  };

  const renderRelevantRecipeToolDropdown = () =>
  {
    const renderOption = (props: any, option: any) =>
    {
      if (option === null || option.name === "" || option.name.startsWith("=="))
      {
        return <React.Fragment
          key={props.key}></React.Fragment>;
      }

      return (<ListItem
        key={props.key}
        sx={{ height: 32 }}
      >
        <ListItemButton
          sx={{ height: 32 }}
          onClick={() => handleRelevantToolDropdownOnClickEvent(option)}
        >
          <EntryText
            primary={`${option.id}: ${option.name}`}
            disableTypography={true}
          />
        </ListItemButton>
      </ListItem>);
    };
    switch (selectedToolType)
    {
      case CraftingComponentType.Item:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...items ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, otherOption) => option.id === otherOption.id}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={props.key}></React.Fragment>;
              }

              return (<ListItem
                key={props.key}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantToolDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={"small"}
                label={"Items"}
                placeholder="Item name..."
              />
            }}
          />
        </>;
      case CraftingComponentType.Weapon:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...weapons ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantToolDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Weapons"}
                placeholder="Weapon name..."/>)
            }}
          />
        </>;
      case CraftingComponentType.Armor:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...armors ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantToolDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Armors"}
                placeholder="Armor name..."/>)
            }}
          />
        </>;
    }
  };

  const renderRecipeTool = (craftingComponent: CraftingComponent, index: number) =>
  {
    if (!craftingComponent) return <></>;

    const tool = currentTools.at(index);
    if (!tool) return <></>;

    let ingredientData = null;
    let icon = <QuestionMark/>;
    switch (tool.type)
    {
      case CraftingComponentType.Item:
        ingredientData = items.at(tool.id);
        icon = <BusinessCenter color={"success"}/>
        break;
      case CraftingComponentType.Weapon:
        ingredientData = weapons.at(tool.id);
        icon = <LocalDining color={"error"}/>
        break;
      case CraftingComponentType.Armor:
        ingredientData = armors.at(tool.id);
        icon = <Shield color={"info"}/>
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${tool.type}`)
    }

    return <>
      <ListItem
        disableGutters
        key={`${index}-${tool.type}-${tool.id}`}
        secondaryAction={<>
          <IconButton
            edge="end"
            onClick={() => handleDeleteTargetTool(index)}>
            <Clear/>
          </IconButton>
        </>}
      >
        <ListItemButton
          selected={selectedIngredientIndex === index}
          onClick={event => handleRecipeToolListItemOnClickEvent(event, index)}
        >
          <ListItemIcon sx={{ minWidth: '30px' }}>
            {icon}
          </ListItemIcon>
          <EntryText
            primary={`${tool.id}: ${ingredientData?.name} (${tool.count})`}
            disableTypography
            sx={{ width: '100%' }}
          />
        </ListItemButton>
      </ListItem>
    </>
  };

  const renderSelectedToolChip = () =>
  {
    if (!selectedTool) return <></>;
    if (selectedToolIndex < 0) return <></>;

    return buildComponentChip(selectedTool);
  };

  const renderPendingToolChip = () =>
  {
    if (!pendingTool) return <></>;

    return <>
      <Grid2 container spacing={2}>
        <Grid2 size={6}>
          {buildComponentChip(pendingTool)}
        </Grid2>
        <Grid2 size={4}>
          <TextField
            type={"number"}
            label={"Count"}
            value={pendingTool.count}
            sx={{ width: '80px' }}
            onChange={(event) => handlePendingToolCountOnChangeEvent(parseInt(event.target.value) ?? 1)}
          />
        </Grid2>
        <Grid2 size={2}>
          <IconButton
            color={"secondary"}
            onClick={() => handleOverrideSelectedWithPendingToolOnClickEvent()}
          >
            <Sync/>
          </IconButton>
        </Grid2>
      </Grid2>
    </>;
  };

  const renderRecipeOutput = (craftingComponent: CraftingComponent, index: number) =>
  {
    if (!craftingComponent) return <></>;

    const output = currentOutputs.at(index);
    if (!output) return <></>;

    let data = null;
    let icon = <QuestionMark/>;
    switch (output.type)
    {
      case CraftingComponentType.Item:
        data = items.at(output.id);
        icon = <BusinessCenter color={"success"}/>
        break;
      case CraftingComponentType.Weapon:
        data = weapons.at(output.id);
        icon = <LocalDining color={"error"}/>
        break;
      case CraftingComponentType.Armor:
        data = armors.at(output.id);
        icon = <Shield color={"info"}/>
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${output.type}`)
    }

    return <>
      <ListItem
        disableGutters
        key={`${index}-${output.type}-${output.id}`}
        secondaryAction={<>
          <IconButton
            edge="end"
            onClick={() => handleDeleteTargetOutput(index)}>
            <Clear/>
          </IconButton>
        </>}
      >
        <ListItemButton
          selected={selectedIngredientIndex === index}
          onClick={event => handleRecipeOutputListItemOnClickEvent(event, index)}
        >
          <ListItemIcon sx={{ minWidth: '30px' }}>
            {icon}
          </ListItemIcon>
          <EntryText
            primary={`${output.id}: ${data?.name} (${output.count})`}
            disableTypography
            sx={{ width: '100%' }}
          />
        </ListItemButton>
      </ListItem>
    </>
  };

  const renderRelevantRecipeOutputDropdown = () =>
  {
    const renderOption = (props: any, option: any) =>
    {
      if (option === null || option.name === "" || option.name.startsWith("=="))
      {
        return <React.Fragment
          key={props.key}></React.Fragment>;
      }

      return (<ListItem
        key={props.key}
        sx={{ height: 32 }}
      >
        <ListItemButton
          sx={{ height: 32 }}
          onClick={() => handleRelevantToolDropdownOnClickEvent(option)}
        >
          <EntryText
            primary={`${option.id}: ${option.name}`}
            disableTypography={true}
          />
        </ListItemButton>
      </ListItem>);
    };
    switch (selectedOutputType)
    {
      case CraftingComponentType.Item:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...items ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            isOptionEqualToValue={(option, otherOption) => option.id === otherOption.id}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={props.key}></React.Fragment>;
              }

              return (<ListItem
                key={props.key}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantOutputDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={"small"}
                label={"Items"}
                placeholder="Item name..."
              />
            }}
          />
        </>;
      case CraftingComponentType.Weapon:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...weapons ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantOutputDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Weapons"}
                placeholder="Weapon name..."/>)
            }}
          />
        </>;
      case CraftingComponentType.Armor:
        return <>
          <Autocomplete
            size={"small"}
            options={[ ...armors ].sort((a, b) =>
            {
              if (a === null || b === null) return (a as any) - (b as any);
              return a.id - b.id;
            })}
            ListboxProps={{ sx: { maxHeight: '170px' } }}
            getOptionKey={(option) => option?.id ?? "no-key"}
            getOptionLabel={(option) => option?.name ?? ""}
            renderOption={(props, option, { index }) =>
            {
              if (option === null || option.name === "" || option.name.startsWith("=="))
              {
                return <React.Fragment
                  key={index}></React.Fragment>;
              }

              return (<ListItem
                key={`${option.id}-${option.name}`}
                sx={{ height: 32 }}
              >
                <ListItemButton
                  sx={{ height: 32 }}
                  onClick={() => handleRelevantOutputDropdownOnClickEvent(option)}
                >
                  <EntryText
                    primary={`${option.id}: ${option.name}`}
                    disableTypography={true}
                  />
                </ListItemButton>
              </ListItem>);
            }}
            renderInput={(params) =>
            {
              return (<TextField
                {...params}
                size={"small"}
                label={"Armors"}
                placeholder="Armor name..."/>)
            }}
          />
        </>;
    }
  };

  const renderSelectedOutputChip = () =>
  {
    if (!selectedOutput) return <></>;
    if (selectedOutputIndex < 0) return <></>;

    return buildComponentChip(selectedOutput);
  };

  const renderPendingOutputChip = () =>
  {
    if (!pendingOutput) return <></>;

    return <>
      <Grid2 container spacing={2}>
        <Grid2 size={6}>
          {buildComponentChip(pendingOutput)}
        </Grid2>
        <Grid2 size={4}>
          <TextField
            type={"number"}
            label={"Count"}
            value={pendingOutput.count}
            sx={{ width: '80px' }}
            onChange={(event) => handlePendingOutputCountOnChangeEvent(parseInt(event.target.value) ?? 1)}
          />
        </Grid2>
        <Grid2 size={2}>
          <IconButton
            color={"secondary"}
            onClick={() => handleOverrideSelectedWithPendingOutputOnClickEvent()}
          >
            <Sync/>
          </IconButton>
        </Grid2>
      </Grid2>
    </>;
  };

  const buildComponentChip = (craftingComponent: CraftingComponent) =>
  {
    let ingredientData = null;
    let color: ("primary" | "success" | "error" | "info") = "primary";
    let icon = <QuestionMark/>;
    switch (craftingComponent.type)
    {
      case CraftingComponentType.Item:
        ingredientData = items[craftingComponent.id];
        color = "success";
        icon = <BusinessCenter color={"success"}/>;
        break;
      case CraftingComponentType.Weapon:
        ingredientData = weapons[craftingComponent.id];
        color = "error";
        icon = <LocalDining color={"error"}/>;
        break;
      case CraftingComponentType.Armor:
        ingredientData = armors[craftingComponent.id];
        color = "info";
        icon = <Shield color={"info"}/>;
        break;
      // TODO: implement gold cost as ingredient.
      default:
        throw new Error(`unknown ingredient type detected: ${craftingComponent.type}`)
    }

    return <>
      <Chip
        icon={icon}
        label={`${ingredientData.name} (${craftingComponent.count})`}
        variant={"filled"}
        color={color}
      />
    </>
  };
  //endregion render

  return <>
    <Grid2 container spacing={2}>
      {/* This is the data list of all entries the user can modify. */}
      <Grid2 size={3}>
        <div>
          <FixedSizeList
            height={720}
            width={400}
            itemSize={35}
            overscanCount={5}
            itemCount={recipes.length}
          >
            {renderRecipeListItem}
          </FixedSizeList>
        </div>
      </Grid2>

      {/* This is the form fields for modifying the selected entry. */}
      <Grid2 size={9}>
        <Paper sx={{
          height: '100%',
          width: '100%',
          padding: 2
        }} elevation={10}>
          {(selectedRecipe === null)
            ? <Grid2 container>
              <Typography>
                Please select a recipe on the left.<br/>
                If there are no recipes, then consider making one.
              </Typography>
            </Grid2>

            : <Grid2 container rowSpacing={2} columnSpacing={4}>
              <Grid2 size={4}>
                <TextField
                  required
                  variant={"outlined"}
                  label={"Key"}
                  value={selectedRecipe.key}
                  onChange={handleRecipeKeyOnChangeEvent}
                  size={"small"}
                  fullWidth
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position={"start"}>
                        <Key/>
                      </InputAdornment>
                    }
                  }}
                />
              </Grid2>

              <Grid2 size={4}>
                <TextField
                  variant={"outlined"}
                  label={"Name"}
                  value={selectedRecipe.name}
                  onChange={handleRecipeNameOnChangeEvent}
                  size={"small"}
                  fullWidth
                />
              </Grid2>

              <Grid2 size={4}>
                <TextField
                  type={"number"}
                  label={"Icon Index"}
                  value={selectedRecipe.iconIndex ?? -1}
                  sx={{ width: '100px' }}
                  onChange={(event) => handleRecipeIconIndexOnChangeEvent(parseInt(event.target.value) ?? -1)}
                />
              </Grid2>

              <Grid2 size={8}>
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
              </Grid2>

              <Grid2 size={4}>
                <Stack spacing={2}>
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
              </Grid2>

              {/* Ingredients management */}
              <Grid2 size={4}>
                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    color={"primary"}
                    value={selectedIngredientType}
                    defaultValue={CraftingComponentType.Item}
                    onChange={handleRecipeIngredientTypeOnChangeEvent}
                    fullWidth
                  >
                    <ToggleButton
                      selected={selectedIngredientType === CraftingComponentType.Item}
                      value={CraftingComponentType.Item}>
                      <BusinessCenter sx={{ color: brown[500] }}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedIngredientType === CraftingComponentType.Weapon}
                      value={CraftingComponentType.Weapon}>
                      <LocalDining color={"error"}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedIngredientType === CraftingComponentType.Armor}
                      value={CraftingComponentType.Armor}>
                      <Shield color={"info"}/>
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {renderRelevantRecipeIngredientDropdown()}

                  {renderPendingIngredientChip()}

                  {renderSelectedIngredientChip()}
                  <List dense>
                    <ListSubheader sx={{
                      height: '30px',
                      fontWeight: 'bold'
                    }}>
                      Ingredients
                    </ListSubheader>
                    {currentIngredients.map((ingredient, index) => renderRecipeIngredient(ingredient, index))}
                  </List>
                </Stack>
              </Grid2>

              {/* Tools management */}
              <Grid2 size={4}>
                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    color={"primary"}
                    value={selectedToolType}
                    defaultValue={CraftingComponentType.Item}
                    onChange={handleRecipeToolTypeOnChangeEvent}
                    fullWidth
                  >
                    <ToggleButton
                      selected={selectedToolType === CraftingComponentType.Item}
                      value={CraftingComponentType.Item}>
                      <BusinessCenter sx={{ color: brown[500] }}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedToolType === CraftingComponentType.Weapon}
                      value={CraftingComponentType.Weapon}>
                      <LocalDining color={"error"}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedToolType === CraftingComponentType.Armor}
                      value={CraftingComponentType.Armor}>
                      <Shield color={"info"}/>
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {renderRelevantRecipeToolDropdown()}

                  {renderPendingToolChip()}

                  {renderSelectedToolChip()}

                  <List dense>
                    <ListSubheader sx={{
                      height: '30px',
                      fontWeight: 'bold'
                    }}>
                      Tools
                    </ListSubheader>
                    {currentTools.length > 0
                      ? currentTools.map((ingredient, index) => renderRecipeTool(ingredient, index))
                      : <Button
                        fullWidth
                        startIcon={<Add/>}
                        onClick={() => handleSnack(
                          "TODO: implement adding something from nothing.",
                          MuiSnackbarSeverity.Warning)}
                        variant={"contained"}>Add a Tool</Button>
                    }
                  </List>
                </Stack>
              </Grid2>

              <Grid2 size={4}>
                <Stack spacing={1}>
                  <ToggleButtonGroup
                    exclusive
                    color={"primary"}
                    value={selectedOutputType}
                    defaultValue={CraftingComponentType.Item}
                    onChange={handleRecipeOutputTypeOnChangeEvent}
                    fullWidth
                  >
                    <ToggleButton
                      selected={selectedOutputType === CraftingComponentType.Item}
                      value={CraftingComponentType.Item}>
                      <BusinessCenter sx={{ color: brown[500] }}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedOutputType === CraftingComponentType.Weapon}
                      value={CraftingComponentType.Weapon}>
                      <LocalDining color={"error"}/>
                    </ToggleButton>
                    <ToggleButton
                      selected={selectedOutputType === CraftingComponentType.Armor}
                      value={CraftingComponentType.Armor}>
                      <Shield color={"info"}/>
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {renderRelevantRecipeOutputDropdown()}

                  {renderPendingOutputChip()}

                  {renderSelectedOutputChip()}

                  <List dense>
                    <ListSubheader sx={{
                      height: '30px',
                      fontWeight: 'bold'
                    }}>
                      Outputs
                    </ListSubheader>
                    {currentOutputs.length > 0
                      ? currentOutputs.map((component, index) => renderRecipeOutput(component, index))
                      : <Button
                        fullWidth
                        startIcon={<Add/>}
                        onClick={() => handleSnack(
                          "TODO: implement adding something from nothing.",
                          MuiSnackbarSeverity.Warning)}
                        variant={"contained"}>Add an Output</Button>
                    }
                  </List>
                </Stack>
              </Grid2>
            </Grid2>}

        </Paper>
      </Grid2>

      {/*region not-grid-related elements */}
      {/* This is over-arching save button- it will save all recipes to disk. */}
      <LoadingButton
        size={"small"}
        color={"secondary"}
        onClick={async () =>
        {
          // set the save flag to false to prevent further clicking.
          setCanSave(false);
          await handleSaveButtonOnClickEvent();
        }}
        loading={!canSave}
        loadingPosition={"start"}
        startIcon={<Save/>}
        variant="contained"
        sx={SaveStyles}
      >
        <span>Save</span>
      </LoadingButton>
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
      {/*endregion not-grid-related elements */}
    </Grid2>
  </>;
}