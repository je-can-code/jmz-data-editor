import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  FixedSizeList,
  ListChildComponentProps
} from "react-window";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Grid,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  Addchart,
  DoubleArrow,
  ExpandMore,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  MonetizationOn,
  SdCard,
  Timeline
} from "@mui/icons-material";
import { throttle } from "lodash";

import {
  executeSave,
  loadEnemies
} from "../../../services/DataService.ts";
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from "../../../enums/MuiSnackbar.ts";
import { BoardProps } from "../../../types/local/BoardProps";
import DatabaseFilenames from "../../../enums/DatabaseFilenames.ts";

import { ExtraDropManager } from "../../../services/parsers/ExtraDropParser.ts";

import EnemyBaseParameters from "./EnemyBaseParameters.tsx";
import EnemiesExtraDrops from "./EnemiesExtraDrops.tsx";
import SaveButton from "../../../components/core/SaveButton.tsx";
import NumberInputWithLabel from "../../../components/NumberInputWithLabel.tsx";
import {
  amber,
  blue,
  brown,
  cyan,
  green,
  indigo,
  orange,
  pink,
  purple,
  red,
  teal,
  yellow
} from "@mui/material/colors";
import { LevelParser } from "../../../services/parsers/LevelParser.ts";
import TraitEditor from "../components/traits/TraitEditor.tsx";
import ParameterGrowth from "./ParameterGrowth.tsx";
import { knownLongParams } from "../../../mappers/ParameterIdMapper.ts";
import { GrowthParser } from "../../../services/parsers/GrowthParser.ts";
import EnemySdpDrop from "./EnemySdpDrop.tsx";
import { SdpParser } from "../../../services/parsers/SdpParser.ts";
import ReloadButton from "../../../components/core/ReloadButton.tsx";
import { EnemyJabsAiTraits } from "./EnemyJabsAiTraits.tsx";
import { EnemyJabsBattlerData } from "./EnemyJabsBattlerData.tsx";
import RPG_Enemy = Rmmz.Implementations.RPG_Enemy;
import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import RPG_Trait = Rmmz.Data.RPG_Trait;

const EnemiesBoard = (props: BoardProps) =>
{
  //region state
  const [ enemies, setEnemies ] = useState<RPG_Enemy[]>([]);
  const [ selectedEnemy, setSelectedEnemy ] = useState<RPG_Enemy | null>(null)
  const [ selectedEnemyIndex, setSelectedEnemyIndex ] = useState<number>(0);
  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const [ currentFamilyIndex, setCurrentFamilyIndex ] = useState<number>(0);
  const [ currentGroupIndex, setCurrentGroupIndex ] = useState<number>(0);
  const listRef = useRef<FixedSizeList>(null);

  const [ selectedEnemyDropItems, setSelectedEnemyDropItems ] = useState<RPG_DropItem[]>([]);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ canReload, setCanReload ] = useState<boolean>(false);
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
      setCanReload(true);
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

// After
  const handleEnemyListItemOnClickEvent = (index: number, keepListFocus: boolean = true) =>
  {
    setSelectedEnemyIndex(index);

    if (enemies?.length > 0)
    {
      const enemy = enemies.at(index)!;
      setSelectedEnemy(enemy);

      const extraDropItems = ExtraDropManager.read(enemy.note);
      setSelectedEnemyDropItems(extraDropItems);
    }

    if (keepListFocus)
    {
      // ensure the list keeps keyboard focus for ArrowUp/Down
      setTimeout(() => listWrapperRef.current?.focus(), 0);
    }
  };

  const throttledListScroll = useCallback(
    throttle(({ scrollOffset }: {
      scrollOffset: number
    }) =>
    {
      // Calculate which family and group are currently visible based on scroll position
      const itemHeight = 30; // Same as itemSize in FixedSizeList
      const currentIndex = Math.floor(scrollOffset / itemHeight);

      const familyIndex = Math.floor(currentIndex / 50);
      const groupIndex = Math.floor(currentIndex / 10);

      setCurrentFamilyIndex(familyIndex);
      setCurrentGroupIndex(groupIndex);
    }, 250),
    []
  );

  useEffect(() =>
  {
    return () =>
    {
      throttledListScroll.cancel();
    };
  }, [ throttledListScroll ]);

  const listWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() =>
  {
    listWrapperRef.current?.focus();
  }, []);

// And in handleSearchChange, call with keepListFocus = false
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    const term = event.target.value.toLowerCase();
    setSearchTerm(term);

    if (term.trim() === '') return;

    const foundIndex = enemies.findIndex(enemy =>
    {
      if (enemy === null) return false;
      if (enemy.name.length === 0) return false;
      return enemy.name.toLowerCase()
        .includes(term)
    });

    if (foundIndex !== -1)
    {
      listRef.current?.scrollToItem(foundIndex, 'start');

      // Do not steal focus from the TextField while typing
      handleEnemyListItemOnClickEvent(foundIndex, false);
    }
  };

  const findNextMatchIndex = (startIndex: number, term: string, direction: 1 | -1) =>
  {
    const query = term.trim()
      .toLowerCase();
    if (query === '') return -1;

    const length = enemies.length;
    if (length === 0) return -1;

    for (let step = 1; step < length; step++)
    {
      const idx = (startIndex + (direction * step) + length) % length;
      const enemy = enemies[idx];
      if (!enemy) continue;
      if (!enemy.name || enemy.name.length === 0) continue;
      if (enemy.name.startsWith('===')) continue;

      if (enemy.name.toLowerCase()
        .includes(query))
      {
        return idx;
      }
    }

    return -1;
  };

  const handleSearchNextClick = () =>
  {
    const query = searchTerm.trim();
    if (query === '') return;

    const start = selectedEnemyIndex ?? 0;
    const nextIndex = findNextMatchIndex(start, query, 1);
    if (nextIndex !== -1)
    {
      listRef.current?.scrollToItem(nextIndex, 'start');
      handleEnemyListItemOnClickEvent(nextIndex);
    }
  };

  const handleSearchPrevClick = () =>
  {
    const query = searchTerm.trim();
    if (query === '') return;

    const start = selectedEnemyIndex ?? 0;
    const prevIndex = findNextMatchIndex(start, query, -1);
    if (prevIndex !== -1)
    {
      listRef.current?.scrollToItem(prevIndex, 'start');
      handleEnemyListItemOnClickEvent(prevIndex);
    }
  };

  const handleReloadButtonOnClickEvent = async () =>
  {
    try
    {
      // Load fresh enemy data from disk
      const enemyData = await loadEnemies(props.projectPath);

      // Update the state with the fresh data
      setEnemies(enemyData);

      // If there was a selected enemy, try to find and select it again by index
      if (selectedEnemyIndex > 0 && selectedEnemyIndex < enemyData.length)
      {
        setSelectedEnemy(enemyData[selectedEnemyIndex]);
      }
      else
      {
        // Default to the first real enemy if the previous selection is no longer valid
        setSelectedEnemy(enemyData.at(1)!);
        setSelectedEnemyIndex(1);
      }

      // Show success message
      handleSnack("Enemy data has been reloaded successfully.", MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      console.error("Failed to reload enemy data:", error);
      handleSnack("Failed to reload enemy data.", MuiSnackbarSeverity.Error);
    }
    finally
    {
      setCanReload(true);
    }
  };

  const isValidEnemy = (enemy?: RPG_Enemy | null) =>
  {
    if (!enemy) return false;
    if (!enemy.name || enemy.name.length === 0) return false;
    if (enemy.name.startsWith('===')) return false;
    return true;
  };

  const findNextValidIndex = (startIndex: number, direction: 1 | -1) =>
  {
    const length = enemies.length;
    if (length === 0) return startIndex;

    for (let step = 1; step < length; step++)
    {
      const idx = (startIndex + (direction * step) + length) % length;
      if (isValidEnemy(enemies[idx]))
      {
        return idx;
      }
    }

    return startIndex;
  };

  const handleIterateNext = () =>
  {
    const start = selectedEnemyIndex ?? 0;
    const nextIndex = findNextValidIndex(start, 1);

    if (nextIndex !== start)
    {
      listRef.current?.scrollToItem(nextIndex, 'start');
      handleEnemyListItemOnClickEvent(nextIndex);
    }
  };

  const handleIteratePrev = () =>
  {
    const start = selectedEnemyIndex ?? 0;
    const prevIndex = findNextValidIndex(start, -1);

    if (prevIndex !== start)
    {
      listRef.current?.scrollToItem(prevIndex, 'start');
      handleEnemyListItemOnClickEvent(prevIndex);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) =>
  {
    if (event.key === 'ArrowDown')
    {
      event.preventDefault();
      handleIterateNext();
    }
    else if (event.key === 'ArrowUp')
    {
      event.preventDefault();
      handleIteratePrev();
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

  const updateEnemyNote = (updatedEnemyNote: string) =>
  {
    const updatedSelectedEnemy = {
      ...selectedEnemy,
      note: updatedEnemyNote,
    } as RPG_Enemy;
    setSelectedEnemy(updatedSelectedEnemy);

    const updatedEnemies = enemies.with(selectedEnemyIndex, updatedSelectedEnemy);
    setEnemies(updatedEnemies);
  };

  const updateEnemyWithNewDropItems = (updatedDropItems: RPG_DropItem[]) =>
  {
    setSelectedEnemyDropItems(updatedDropItems);

    const updatedEnemyNote = ExtraDropManager.write(selectedEnemy!.note, updatedDropItems);
    updateEnemyNote(updatedEnemyNote);
  };

  const updateEnemyLevel = (updatedLevel: number) =>
  {
    const updatedEnemyNote = LevelParser.write(selectedEnemy!.note, updatedLevel);
    updateEnemyNote(updatedEnemyNote);
  }

  const updateEnemySdpPoints = (updatedSdpPoints: number) =>
  {
    const updatedEnemyNote = SdpParser.writePoints(selectedEnemy!.note, updatedSdpPoints);
    updateEnemyNote(updatedEnemyNote);
  };

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

    // Get background colors based on family and subgroup
    const familyColor = getFamilyColor(index);
    const subgroupColor = getSubgroupColor(index);

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
            backgroundColor: familyColor,
            position: 'relative',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: subgroupColor,
              pointerEvents: 'none'
            },
            '&.Mui-selected': {
              backgroundColor: `${familyColor} !important`,
              '&::after': {
                backgroundColor: `${subgroupColor} !important`,
                opacity: 0.8
              }
            }
          }}
          selected={selectedEnemyIndex === index}
          onMouseDown={(e) =>
          {
            // keep keyboard focus on the wrapper
            e.preventDefault();
          }}
          tabIndex={-1}
          onClick={() => handleEnemyListItemOnClickEvent(index)}
        >
          <ListItemIcon
            sx={{ minWidth: '24px' }}
          >
            {(selectedEnemyIndex === index)
              ? <DoubleArrow color={"success"} fontSize={"small"}/>
              : <KeyboardArrowRight color={"warning"} fontSize={"small"}/>}
          </ListItemIcon>
          <ListItemText
            disableTypography
            primary={`${index}: ${enemy.name}`}
            sx={{
              fontSize: 16,
              fontWeight: enemyNameFontWeight,
              fontStyle: enemyNameFontStyle,
              textShadow: enemyNameTextShadow,
              fontFamily: 'monospace',
            }}/>
        </ListItemButton>
      </ListItem>
    )
  };
  //endregion render

  //region color mappings
  const getFamilyColor = (index: number) =>
  {
    // Adjust index to account for the placeholder at index 0
    const adjustedIndex = Math.max(0, index - 1);

    // Calculate the family index based on the adjusted index
    const familyIndex = Math.floor(adjustedIndex / 50);

    // Return a color based on the family index
    switch (familyIndex)
    {
      case 0:
        return blue[800];     // Changed from blue[100]
      case 1:
        return purple[800];   // Changed from purple[100]
      case 2:
        return green[800];    // Changed from green[100]
      case 3:
        return red[800];      // Changed from red[100]
      case 4:
        return teal[800];     // Changed from teal[100]
      case 5:
        return indigo[800];   // Changed from indigo[100]
      case 6:
        return pink[800];     // Changed from pink[100]
      case 7:
        return cyan[800];     // Changed from cyan[100]
      case 8:
        return amber[800];    // Changed from amber[100]
      case 9:
        return orange[800];   // Changed from orange[100]
      case 10:
        return yellow[800];   // Changed from yellow[100]
      case 11:
        return brown[800];    // Changed from brown[100]
      default:
        return blue[800];     // Default color (changed from blue[100])
    }
  };

  const getSubgroupColor = (index: number) =>
  {
    // Adjust index to account for the placeholder at index 0
    const adjustedIndex = Math.max(0, index - 1);

    // Calculate the subgroup index within the family
    const subgroupIndex = Math.floor((adjustedIndex % 50) / 10);

    // Return a slightly darker shade for the subgroup
    switch (subgroupIndex)
    {
      case 0:
        return 'rgba(255, 255, 255, 0)'; // Transparent for first subgroup
      case 1:
        return 'rgba(0, 0, 0, 0.05)';    // Very light shade
      case 2:
        return 'rgba(0, 0, 0, 0.1)';     // Light shade
      case 3:
        return 'rgba(0, 0, 0, 0.15)';    // Medium shade
      case 4:
        return 'rgba(0, 0, 0, 0.2)';     // Darker shade
      default:
        return 'rgba(0, 0, 0, 0)';      // Default transparent
    }
  };
  //endregion color mappings

  const totalEnemyCount = () =>
  {
    let totalEnemyCount = 0;
    enemies.forEach(enemy =>
    {
      if (enemy === null) return;

      if (enemy.name.startsWith('===')) return;

      totalEnemyCount++;
    })

    console.log(totalEnemyCount);
  };

  // totalEnemyCount();

  return <>
    <Grid container spacing={2}>
      <Grid size={2}>
        <Stack direction={"row"} spacing={1} alignItems={"center"} sx={{ marginTop: 1 }}>
          <Tooltip title={"Previous match"}>
    <span>
      <IconButton
        size={"small"}
        onClick={handleSearchPrevClick}
        disabled={searchTerm.trim() === ''}
      >
        <KeyboardArrowLeft/>
      </IconButton>
    </span>
          </Tooltip>

          <TextField
            variant="outlined"
            label="Search Enemy"
            value={searchTerm}
            onChange={handleSearchChange}
            size="small"
            fullWidth
            slotProps={{
              input: {
                endAdornment: searchTerm
                  ? (
                    <Tooltip title="Clear search">
                      <Box
                        component="span"
                        sx={{ cursor: 'pointer' }}
                        onClick={() => setSearchTerm('')}
                      >
                        ✕
                      </Box>
                    </Tooltip>
                  )
                  : null
              }
            }}
          />

          <Tooltip title={"Next match"}>
    <span>
      <IconButton
        size={"small"}
        onClick={handleSearchNextClick}
        disabled={searchTerm.trim() === ''}
      >
        <KeyboardArrowRight/>
      </IconButton>
    </span>
          </Tooltip>
        </Stack>
        <div
          ref={listWrapperRef}
          tabIndex={0}
          role={"listbox"}
          onKeyDown={handleListKeyDown}
          onContextMenu={() =>
          {
            // TODO: implement context menu.
          }}
          style={{
            cursor: 'context-menu',
            outline: 'none'
          }}
        >
          {/* @ts-ignore */}
          <FixedSizeList
            ref={listRef}
            height={960}
            width={310}
            itemSize={30}
            overscanCount={5}
            itemCount={enemies.length}
            onScroll={throttledListScroll}
          >
            {renderEnemyListItem}
          </FixedSizeList>
        </div>
      </Grid>

      <Grid size={10}>
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
              <Grid container spacing={2}>
                <Grid size={4}>
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

                    {/* rewards */}
                    <Grid container spacing={1}>
                      {/* Experience */}
                      <Grid size={6}>
                        <NumberInputWithLabel
                          label={"Exp"}
                          value={selectedEnemy.exp}
                          endAdornment={<Addchart sx={{ color: purple[600] }}/>}
                          onChangeEventHandler={(event) =>
                          {
                            const updatedValue = parseInt(event.target.value) ?? 0;
                            handleEnemyExpOnChangeEvent(updatedValue);
                          }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          height: '30px',
                        }}>
                          {(() =>
                          {
                            const expParam = knownLongParams()
                              .find(param => param.key === 'exp');
                            const formula = expParam
                              ? GrowthParser.read(selectedEnemy.note, expParam)
                              : '';
                            return formula
                              ? (
                                <Box sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  width: '100%'
                                }}>
                                  <Tooltip title={formula}>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                        display: 'inline-block',
                                        color: 'text.secondary'
                                      }}
                                    >
                                      {formula}
                                    </Typography>
                                  </Tooltip>
                                </Box>
                              )
                              : null;
                          })()}
                        </Box>
                      </Grid>

                      {/* Gold */}
                      <Grid size={6}>
                        <NumberInputWithLabel
                          label={"Gold"}
                          value={selectedEnemy.gold}
                          endAdornment={<MonetizationOn sx={{ color: yellow[800] }}/>}
                          onChangeEventHandler={(event) =>
                          {
                            const updatedValue = parseInt(event.target.value) ?? 0;
                            handleEnemyGoldOnChangeEvent(updatedValue);
                          }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          height: '30px',
                        }}>
                          {(() =>
                          {
                            const goldParam = knownLongParams()
                              .find(param => param.key === 'gold');
                            const formula = goldParam
                              ? GrowthParser.read(selectedEnemy.note, goldParam)
                              : '';
                            return formula
                              ? (
                                <Box sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  width: '100%'
                                }}>
                                  <Tooltip title={formula}>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                        display: 'inline-block',
                                        color: 'text.secondary'
                                      }}
                                    >
                                      {formula}
                                    </Typography>
                                  </Tooltip>
                                </Box>
                              )
                              : null;
                          })()}
                        </Box>
                      </Grid>

                      {/* SDPs */}
                      <Grid size={6}>
                        <NumberInputWithLabel
                          label={"SDPs"}
                          endAdornment={<SdCard sx={{ color: purple[100] }}/>}
                          value={SdpParser.readPoints(selectedEnemy.note) ?? 0}
                          onChangeEventHandler={(event) =>
                          {
                            const updatedValue = parseInt(event.target.value) ?? 0;
                            updateEnemySdpPoints(updatedValue);
                          }}
                        />
                      </Grid>
                      <Grid size={6}>
                        <Box sx={{
                          display: 'flex',
                          alignItems: 'center',
                          height: '30px',
                        }}>
                          {(() =>
                          {
                            const sdpParam = knownLongParams()
                              .find(param => param.key === 'sdp');
                            const formula = sdpParam
                              ? GrowthParser.read(selectedEnemy.note, sdpParam)
                              : '';
                            return formula
                              ? (
                                <Box sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  width: '100%'
                                }}>
                                  <Tooltip title={formula}>
                                    <Typography
                                      variant="caption"
                                      sx={{
                                        fontFamily: "'Consolas', 'Monaco', 'Courier New', monospace",
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        width: '100%',
                                        display: 'inline-block',
                                        color: 'text.secondary'
                                      }}
                                    >
                                      {formula}
                                    </Typography>
                                  </Tooltip>
                                </Box>
                              )
                              : null;
                          })()}
                        </Box>
                      </Grid>
                    </Grid>

                    <EnemyBaseParameters
                      selectedEnemy={selectedEnemy}
                      updateEnemyWithNewParam={updateEnemyWithNewParam}
                    />
                    <br/>

                    <ParameterGrowth
                      growableNote={selectedEnemy.note}
                      growableName={selectedEnemy.name}
                      updateNote={updateEnemyNote}
                      otherSubjects={enemies}
                    />

                    <EnemyJabsAiTraits
                      note={selectedEnemy.note}
                      updateNote={updateEnemyNote}
                    />

                  </Stack>
                </Grid>
                <Grid size={4}>
                  <Stack spacing={1}>
                    <Accordion>
                      <AccordionSummary
                        expandIcon={<ExpandMore/>}
                      >
                        <Typography>
                          Traits
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <TraitEditor
                          selectedTraits={selectedEnemy.traits}
                          updateEnemyTraits={updateEnemyTraits}
                        />
                      </AccordionDetails>
                    </Accordion>

                    <EnemyJabsBattlerData
                      note={selectedEnemy.note}
                      updateNote={updateEnemyNote}
                    />

                    {/*<EnemyJabsConfigs*/}
                    {/*  note={selectedEnemy.note}*/}
                    {/*  updateNote={updateEnemyNote}*/}
                    {/*/>*/}
                  </Stack>
                </Grid>
                <Grid size={4}>
                  <Stack spacing={1}>
                    <EnemySdpDrop
                      note={selectedEnemy.note}
                      updateNote={updateEnemyNote}
                      projectPath={props.projectPath}
                    />
                    <EnemiesExtraDrops
                      projectPath={props.projectPath}
                      selectedEnemyDropItems={selectedEnemyDropItems}
                      updateEnemyWithNewDropItems={updateEnemyWithNewDropItems}
                      handleSnack={handleSnack}
                    />
                  </Stack>

                </Grid>
              </Grid>
            </>}
        </Paper>
      </Grid>
    </Grid>

    {/*region not-grid-related elements */}
    <Box sx={{
      display: 'flex',
      gap: 2
    }}>
      <SaveButton
        extraSaveText={"Enemy Data"}
        canSave={canSave}
        handleSave={async () =>
        {
          setCanSave(false);
          await handleSaveButtonOnClickEvent();
        }}
      />

      {/* Reload Button */}
      <ReloadButton
        handleReload={async () =>
        {
          setCanReload(false);
          await handleReloadButtonOnClickEvent();
        }}
        canReload={true}
        extraReloadText={"Enemy Data"}
      />
    </Box>

    <Snackbar
      open={snackOpen}
      autoHideDuration={2500}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center'
      }}
      onClose={(_, reason) =>
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

export default EnemiesBoard;