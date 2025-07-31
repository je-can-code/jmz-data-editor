import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
import { FixedSizeList } from "react-window";
import {
  Alert,
  Button,
  Grid2, List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import {
  Addchart, DoubleArrow, KeyboardArrowRight, MonetizationOn, Timeline
} from "@mui/icons-material";

import { executeSave, loadEnemies } from "../../../services/DataService.ts";
import { MuiSnackbarSeverity, MuiSnackbarVariant } from "../../../enums/MuiSnackbar.ts";
import { BoardProps } from "../../../types/local/BoardProps";
import DatabaseFilenames from "../../../enums/DatabaseFilenames.ts";

import { ExtraDropManager } from "./ExtraDropParser.ts";
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import RPG_DropItem = Rmmz.Data.RPG_DropItem;

import EnemyBaseParameters from "./EnemyBaseParameters.tsx";
import EnemiesExtraDrops from "./EnemiesExtraDrops.tsx";
import SaveButton from "../../../components/core/SaveButton.tsx";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import { purple, yellow } from "@mui/material/colors";
import { LevelParser } from "./LevelParser.ts";
import TraitEditor from "../components/traits/TraitEditor.tsx";
import RPG_Trait = Rmmz.Data.RPG_Trait;
import ParameterGrowth from "./ParameterGrowth.tsx";
import RPG_Base = Rmmz.Base.RPG_Base;

export default function EnemiesBoard(props: BoardProps)
{
  //region state
  const [ enemies, setEnemies ] = useState<RPG_Enemy[]>([]);
  const [ selectedEnemy, setSelectedEnemy ] = useState<RPG_Enemy | null>(null)
  const [ selectedEnemyIndex, setSelectedEnemyIndex ] = useState<number>(0);

  const [ selectedEnemyDropItems, setSelectedEnemyDropItems ] = useState<RPG_DropItem[]>([]);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>("");
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  //endregion state

  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    const { projectPath } = props;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {

      const enemyData = await loadEnemies(projectPath);
      if (!ignore && enemyData)
      {
        // update the data list.
        setEnemies(enemyData);
        setSelectedEnemy(enemyData.at(1)!);
        setSelectedEnemyIndex(1);
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
  }, [ props.projectPath ]);

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
    // save the data to disk.
    await executeSave(props.projectPath, DatabaseFilenames.Enemies, enemies);

    setCanSave(true);

    handleSnack("Enemies data has been saved successfully.");
  };

  const handleEnemyListItemOnClickEvent = (index: number,) =>
  {
    setSelectedEnemyIndex(index);

    if (enemies?.length > 0)
    {
      const enemy = enemies.at(index)!;
      setSelectedEnemy(enemy);

      const extraDropItems = ExtraDropManager.read(enemy.note);
      setSelectedEnemyDropItems(extraDropItems);
    }
  };
  //endregion actions

  //region updates
  const handleEnemyNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedEnemy) return;

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      name: updatedValue
    } as RPG_Enemy;
    updateEnemy(updatedSelectedEnemy);
  };

  const handleEnemyExpOnChangeEvent = (updatedValue: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedEnemy) return;

    // update the entry.
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      exp: updatedValue
    } as RPG_Enemy;
    updateEnemy(updatedSelectedEnemy);
  };

  const handleEnemyGoldOnChangeEvent = (updatedValue: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedEnemy) return;

    // update the entry.
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      gold: updatedValue
    } as RPG_Enemy;
    updateEnemy(updatedSelectedEnemy);
  };

  const updateEnemy = useCallback(
    (updatedEnemy: RPG_Enemy) =>
    {
      setSelectedEnemy(updatedEnemy);

      const updatedEnemies = enemies.with(selectedEnemyIndex, updatedEnemy);
      setEnemies(updatedEnemies);
    },
    [ selectedEnemyIndex, enemies ]);

  const updateEnemyTraits = (updatedTraits: RPG_Trait[]) =>
  {
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      traits: updatedTraits,
    } as RPG_Enemy;
    updateEnemy(updatedSelectedEnemy);
  };

  //region extra drops
  const updateEnemyWithNewDropItems = (updatedDropItems: RPG_DropItem[]) =>
  {
    setSelectedEnemyDropItems(updatedDropItems);

    const updatedEnemyNote = ExtraDropManager.write(selectedEnemy!.note, updatedDropItems);
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      note: updatedEnemyNote,
    } as RPG_Enemy;
    setSelectedEnemy(updatedSelectedEnemy);

    const updatedEnemies = enemies.with(selectedEnemyIndex, updatedSelectedEnemy);
    setEnemies(updatedEnemies);
  };
  //endregion extra drops

  const updateEnemyLevel = (updatedLevel: number) =>
  {
    const updatedEnemyNote = LevelParser.write(selectedEnemy!.note, updatedLevel);
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      note: updatedEnemyNote,
    } as RPG_Enemy;
    setSelectedEnemy(updatedSelectedEnemy);

    const updatedEnemies = enemies.with(selectedEnemyIndex, updatedSelectedEnemy);
    setEnemies(updatedEnemies);
  }

  //region parameters
  const updateEnemyWithNewParam = (baseParamId: number, updatedValue: number) =>
  {
    const updatedEnemyParameters = selectedEnemy!.params.with(baseParamId, updatedValue);
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      params: updatedEnemyParameters
    } as RPG_Enemy;
    updateEnemy(updatedSelectedEnemy);
  };
  //endregion update parameters

  const updateEnemyWithNewNote = useCallback(
    (updatedNote: string) =>
    {
      const updatedSelectedEnemy = {
        ...selectedEnemy,
        note: updatedNote
      } as RPG_Enemy;
      updateEnemy(updatedSelectedEnemy);
    },
    [ selectedEnemy, updateEnemy ]);
  //endregion updates

  //region render
  const renderEnemyListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const enemy = enemies.at(index);

    if (!enemy) return <></>;

    if (enemy.name.startsWith('===')) return <></>;

    const enemyNameFontWeight = enemy.name.startsWith('!')
      ? 'bolder'
      : 'normal';

    const enemyNameFontStyle = enemy.name.startsWith('@')
      ? 'italic'
      : 'normal';

    const enemyNameTextShadow = enemy.name.startsWith('!') || enemy.name.startsWith('@') || enemy.name.startsWith('*')
      ? '1px 1px grey'
      : '';

    // Check if we need to display subheaders
    const showFamilyHeader = index > 0 && index % 50 === 0;
    const showGroupHeader = index > 0 && index % 10 === 0 && !showFamilyHeader;

    return (
      <ListItem
        key={index}
        style={{
          ...style,
          height: 'auto',  // Allow the item to expand for subheaders
          paddingTop: 0,
          paddingBottom: 0
        }}
      >
        <ListItemButton
          sx={{
            maxHeight: '30px',
            paddingLeft: '0px',
            marginLeft: '-14px',
          }}
          selected={selectedEnemyIndex === index}
          onClick={() => handleEnemyListItemOnClickEvent(index)}
        >
          <ListItemIcon
            sx={{ minWidth: '24px' }}
          >
            {(selectedEnemyIndex === index)
              ? <DoubleArrow color={"success"} fontSize={"small"}/>
              : <KeyboardArrowRight color={"warning"} fontSize={"small"} />}
          </ListItemIcon>
          <ListItemText
            disableTypography
            primary={`${index}: ${enemy.name}`}
            sx={{
              fontWeight: enemyNameFontWeight,
              fontStyle: enemyNameFontStyle,
              textShadow: enemyNameTextShadow
            }}/>
        </ListItemButton>
      </ListItem>
    )
  };
  //endregion render

  return <>
    <Grid2 container spacing={2}>
      <Grid2 size={2}>
        <div onContextMenu={() =>
        { /* TODO: implement context menu. */
        }} style={{ cursor: 'context-menu' }}>
          {/* @ts-ignore */}
          <FixedSizeList
            height={1030}
            width={310}
            itemSize={30}
            overscanCount={5}
            itemCount={enemies.length}
          >
            {renderEnemyListItem}
          </FixedSizeList>
        </div>
      </Grid2>

      <Grid2 size={10}>
        <Paper sx={{
          height: '100%',
          width: '100%',
          padding: 2
        }} elevation={10}>
          {(selectedEnemy === null)
            ? <>
              <Typography>
                Please select an enemy on the left.<br/>
                If there are no enemies, then consider making one.
              </Typography>
            </>
            : <>
              <Grid2 container spacing={2}>
                <Grid2 size={4}>
                  <Stack spacing={1}>
                    <TextField
                      variant={"outlined"}
                      label={"Name"}
                      value={selectedEnemy.name}
                      onChange={handleEnemyNameOnChangeEvent}
                      size={"small"}
                      sx={{ paddingBottom: 2 }}
                      fullWidth
                    />

                    <NumberInputWithLabel
                      label={"Default Level"}
                      endAdornment={<Timeline sx={{ color: yellow[600] }}/>}
                      value={LevelParser.read(selectedEnemy)}
                      onChangeEventHandler={(event) =>
                      {
                        const updatedValue = parseInt(event.target.value) ?? 0;
                        updateEnemyLevel(updatedValue);
                      }}
                    />

                    <EnemyBaseParameters
                      selectedEnemy={selectedEnemy}
                      updateEnemyWithNewParam={updateEnemyWithNewParam}
                    />
                    <br/>

                    <ParameterGrowth
                      growableNote={selectedEnemy.note}
                      growableName={selectedEnemy.name}
                      updateNote={updateEnemyWithNewNote}
                    />

                  </Stack>
                </Grid2>
                <Grid2 size={4}>
                  <Stack spacing={1}>
                    <NumberInputWithLabel
                      label={"EX"}
                      value={selectedEnemy.exp}
                      endAdornment={<Addchart sx={{ color: purple[600] }}/>}
                      onChangeEventHandler={(event) =>
                      {
                        const updatedValue = parseInt(event.target.value) ?? 0;
                        handleEnemyExpOnChangeEvent(updatedValue);
                      }}
                    />

                    <NumberInputWithLabel
                      label={"GP"}
                      value={selectedEnemy.gold}
                      endAdornment={<MonetizationOn sx={{ color: yellow[800] }}/>}
                      onChangeEventHandler={(event) =>
                      {
                        const updatedValue = parseInt(event.target.value) ?? 0;
                        handleEnemyGoldOnChangeEvent(updatedValue);
                      }}
                    />

                    <TraitEditor
                      selectedTraits={selectedEnemy.traits}
                      updateEnemyTraits={updateEnemyTraits}
                    />
                  </Stack>
                </Grid2>
                <Grid2 size={4}>
                  <Stack spacing={1}>
                    <EnemiesExtraDrops
                      projectPath={props.projectPath}
                      selectedEnemyDropItems={selectedEnemyDropItems}
                      updateEnemyWithNewDropItems={updateEnemyWithNewDropItems}
                      handleSnack={handleSnack}
                    />
                  </Stack>

                </Grid2>
              </Grid2>
            </>}
        </Paper>
      </Grid2>
    </Grid2>

    {/*region not-grid-related elements */}
    <SaveButton
      extraSaveText={"Enemy Data"}
      canSave={canSave}
      handleSave={async () =>
      {
        setCanSave(false);
        await handleSaveButtonOnClickEvent();
      }}
    />

    <Snackbar open={snackOpen} autoHideDuration={2500} onClose={(_, reason) =>
    {
      if (reason === 'clickaway') return;
      setSnackOpen(false);
    }}>
      <Alert
        onClose={() => setSnackOpen(false)}
        severity={snackSeverity}
        variant={snackVariant}
        sx={{ width: '100%' }}
      >
        {snackMessage}
      </Alert>
    </Snackbar>

    {/*endregion not-grid-related elements */}
  </>
}