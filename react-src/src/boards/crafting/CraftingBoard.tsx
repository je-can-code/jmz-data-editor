import React, {ChangeEvent, useEffect, useState} from 'react';
import {filesystem} from "@neutralinojs/lib";
import LoadingButton from '@mui/lab/LoadingButton';
import {
  Checkbox,
  FormControlLabel,
  Grid,
  InputAdornment,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper, Snackbar,
  TextField, Typography
} from "@mui/material";
import {Subject, ListAlt, Key, Save} from "@mui/icons-material";
import styled from "styled-components";
import {FixedSizeList, ListChildComponentProps} from 'react-window';

import Recipe = Crafting.Recipe;
import Category = Crafting.Category;
import CraftingConfiguration = Crafting.Configuration;
import {Alert} from "@mui/lab";

// ================================================================================================

const EntryText = styled(ListItemText)`
    font-family: monospace;
`;

const SaveStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "15%",
  right: "1%",
};

type CraftingBoardProps = {
  projectPath: string;
};

// ================================================================================================
/**
 * The main board that encapsulates all things related to crafting.
 */
export default function CraftingBoard(craftingBoardProps: CraftingBoardProps)
{
  const [saveSnackOpen, setSaveSnackOpen] = useState<boolean>(false);

  /**
   * The primary data list for the board.
   */
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  const [categories, setCategories] = useState<Category[]>([]);

  /**
   * The currently selected entry for the board.
   */
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  /**
   * The index of the currently selected entry in the data list.
   */
  const [selectedRecipeIndex, setSelectedRecipeIndex] = useState<number>(0);

  const [canSave, setCanSave] = useState<boolean>(false);

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    const {projectPath} = craftingBoardProps;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      // TODO: add popup warning in this method and add a reset button?

      const data = await filesystem.readFile(`${projectPath}/config.crafting.json`);
      const parsedData = JSON.parse(data) as CraftingConfiguration;
      if (!ignore && parsedData)
      {
        // update the data list.
        setRecipes(parsedData.recipes);

        // update the other data.
        setCategories(parsedData.categories);

        // enable saving.
        setCanSave(true);
      }
    };

    initializeState(projectPath)
      .catch(console.error);
    return () =>
    {
      ignore = true;
    }
  }, [craftingBoardProps.projectPath]);

  /**
   * The handling logic for clicking the entry in the data list.
   * @param _ The ignored event parameter.
   * @param index The index of the item in the list.
   */
  const handleDataListEntryClick = (_: any, index: number,) =>
  {
    setSelectedRecipeIndex(index);
    if (recipes?.length > 0)
    {
      const recipe = recipes.at(index) as Recipe;
      setSelectedRecipe(recipe);
    }
  }

  /**
   * The update logic for updating the key of the selected entry.
   * @param event The input event that triggered this update.
   */
  const updateSelectedEntryKey = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // if there is no entry, stop processing.
    if (!selectedRecipe) return;

    // update the entry.
    const updatedRecipe = {
      ...selectedRecipe,
      key: updatedValue
    };
    setSelectedRecipe(updatedRecipe);

    // rebuild the updated list of entries with the updated entry.
    const updatedRecipes = recipes.map((recipe, index) =>
    {
      if (index === selectedRecipeIndex)
      {
        return updatedRecipe;
      }

      return recipe;
    });
    setRecipes(updatedRecipes);

    // TODO: can this update be optimized in some way?
    // consider extracting recipe view to single component, and only update whole list when entries change.
  };

  /**
   * A mapping function for creating a data list entry in the list.
   */
  const renderDataListRow = (props: ListChildComponentProps) =>
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
          onClick={event => handleDataListEntryClick(event, index)}
        >
          <ListItemIcon>
            {(selectedRecipeIndex === index)
              ? <ListAlt color={"success"}/>
              : <Subject color={"secondary"}/>
            }
          </ListItemIcon>
          <EntryText
            primary={recipe.key}
            secondary={recipe.name}
            disableTypography={true}
          />
        </ListItemButton>
      </ListItem>
    </>;
  }

  const handleSaveData = async () =>
  {
    console.log('saving...');

    const {projectPath} = craftingBoardProps;

    const updatedConfiguration = {
      recipes: recipes,
      categories: categories
    } as CraftingConfiguration;

    await filesystem.writeFile(
      `${projectPath}/config.crafting.json`,
      JSON.stringify(updatedConfiguration, null, 2));

    console.log('saved!');
    setCanSave(true);
    setSaveSnackOpen(true);
  };

  const handleCloseSnack = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') {
      return;
    }

    setSaveSnackOpen(false);
  };

  return <>
    <Grid container>
      {/* This is the data list of all entries the user can modify. */}
      <Grid item xs={3}>
        <FixedSizeList
          height={720}
          width={400}
          itemSize={35}
          overscanCount={5}
          itemCount={recipes.length}
        >
          {renderDataListRow}
        </FixedSizeList>
      </Grid>

      {/* This is the form fields for modifying the selected entry. */}
      <Grid item xs={9}>
        <Paper sx={{
          height: '100%',
          width: '100%',
          padding: 2
        }} elevation={10}>
          {
            (  selectedRecipe === null)
              ? <>
          <Typography>
            Please select a recipe on the left.<br/>
            If there are no recipes, then consider making one.
          </Typography>
              </>
              : <>
          <TextField
            required
            variant={"outlined"}
            label={"Key"}
            value={selectedRecipe.key}
            onChange={updateSelectedEntryKey}
            size={"small"}
            InputProps={{ startAdornment:
              <InputAdornment position={"start"}>
                <Key/>
              </InputAdornment>
            }}
          /><br/>

          <TextField
            variant={"outlined"}
            label={"Name"}
            value={selectedRecipe.name}
            onChange={updateSelectedEntryKey}
            size={"small"}
          /><br/>

          <TextField
            variant={"outlined"}
            label={"Description"}
            value={selectedRecipe.description}
            onChange={updateSelectedEntryKey}
            size={"small"}
            multiline
            rows={4}
            sx={{
              width: 600,
            }}
          /><br/>

          <FormControlLabel
            control={
              <Checkbox
                checked={selectedRecipe.unlockedByDefault}
                onChange={updateSelectedEntryKey}
              />
            }
            label="Unlocked By Default"
            labelPlacement={"end"}
          /><br/>

          <FormControlLabel
            control={
              <Checkbox
                checked={selectedRecipe.maskedUntilCrafted}
                onChange={updateSelectedEntryKey}
              />
            }
            label="Masked Until Crafted"
            labelPlacement={"end"}
          /><br/>

          {/* This is over-arching save button- it will save all recipes to disk. */}
          <LoadingButton
            size={"small"}
            color={"secondary"}
            onClick={async () => {
              // set the save flag to false to prevent further clicking.
              setCanSave(false);
              await handleSaveData();
            }}
            loading={!canSave}
            loadingPosition={"start"}
            startIcon={<Save/>}
            variant="outlined"
            sx={SaveStyles}
          >
            <span>Save</span>
          </LoadingButton>
        </>
        }

        </Paper>
      </Grid>
      <Snackbar open={saveSnackOpen} autoHideDuration={2000} onClose={handleCloseSnack}>
        <Alert
          onClose={handleCloseSnack}
          severity="success"
          variant="filled"
          sx={{ width: '100%' }}
        >
          Your data has been saved successfully.
        </Alert>
      </Snackbar>
    </Grid>
  </>;
}