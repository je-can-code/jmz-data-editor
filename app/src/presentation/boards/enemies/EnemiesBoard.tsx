import React, { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import {
  Alert,
  Box,
  Grid,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Addchart,
  AutoAwesome,
  DoubleArrow,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  MonetizationOn,
  SdCard,
  ShowChart,
  Timeline
} from '@mui/icons-material';
import { throttle } from 'lodash';

import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';

import { ExtraDropManager } from '@services/parsers/ExtraDropParser.ts';

import EnemyBaseParameters from './EnemyBaseParameters.tsx';
import EnemiesExtraDrops from './EnemiesExtraDrops.tsx';
import SaveButton from '../../../components/core/SaveButton.tsx';
import NumberInputWithLabel from '../../../components/core/NumberInputWithLabel.tsx';
import { amber, blue, brown, cyan, green, indigo, orange, pink, purple, red, teal, yellow } from '@mui/material/colors';
import TraitEditor from '../../components/traits/TraitEditor.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import ParameterGrowth from './ParameterGrowth.tsx';
import { knownLongParams } from '../../../mappers/ParameterIdMapper.ts';
import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import EnemySdpDrop from './EnemySdpDrop.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';
import { EnemyJabsAiTraits } from './EnemyJabsAiTraits.tsx';
import { EnemyJabsBattlerRoles } from './EnemyJabsBattlerRoles.tsx';
import { EnemyJabsBattlerData } from './EnemyJabsBattlerData.tsx';
import EnemyJabsTeam from './EnemyJabsTeam.tsx';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import { useElementClientRect } from '@presentation/hooks/useElementClientRect.ts';
import { useEnemies } from '@presentation/context/resources/enemies.context.tsx';
import { RPG_EnemyDomainModel } from '@core/domain/entities/RPG_EnemyDomainModel.ts';
import { EnemyJabsConfigs } from '@boards/enemies/EnemyJabsConfigs.tsx';
import { EnemyPassiveAbs } from '@boards/enemies/EnemyPassiveAbs.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import RPG_DropItem = Rmmz.Data.RPG_DropItem;
import RPG_Trait = Rmmz.Data.RPG_Trait;

const EnemiesBoard = () =>
{
  //region state
  const {
    data: enemies,
    setData: setEnemies,
    loading,
    save,
    reload
  } = useEnemies();
  const [ selectedEnemy, setSelectedEnemy ] = useState<RPG_EnemyDomainModel | null>(null);
  const [ selectedEnemyIndex, setSelectedEnemyIndex ] = useState<number>(0);
  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const [ currentFamilyIndex, setCurrentFamilyIndex ] = useState<number>(0);
  const [ currentGroupIndex, setCurrentGroupIndex ] = useState<number>(0);
  const listRef = useRef<FixedSizeList>(null);
  const listViewportRef = useRef<HTMLDivElement>(null);
  const listViewportSize = useElementClientRect(listViewportRef);

  const [ selectedEnemyDropItems, setSelectedEnemyDropItems ] = useState<RPG_DropItem[]>([]);

  const [ enemyTab, setEnemyTab ] = useState(0);

  const [ isSaving, setIsSaving ] = useState<boolean>(false);
  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  //endregion state

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

  const handleSaveButtonOnClickEvent = async () =>
  {
    // save the data to disk.
    await save(enemies);

    handleSnack('Enemies data has been saved successfully.');
  };

  const handleEnemyListItemOnClickEvent = (
    index: number,
    keepListFocus: boolean = true
  ) =>
  {
    setSelectedEnemyIndex(index);

    if (enemies?.length > 0)
    {
      const enemy = enemies.at(index)!;
      setSelectedEnemy(enemy);
      updateUrl(enemy);

      const extraDropItems = ExtraDropManager.read(enemy.note);
      setSelectedEnemyDropItems(extraDropItems);
    }

    if (keepListFocus)
    {
      // ensure the list keeps keyboard focus for ArrowUp/Down
      setTimeout(() => listWrapperRef.current?.focus(), 0);
    }
  };

  const { updateUrl } = useUrlSelection(
    'enemyId',
    enemies,
    (e) => e.id,
    (index) => handleEnemyListItemOnClickEvent(index, false),
    (index) => listRef.current?.scrollToItem(index, 'smart')
  );

  const updateUrlRef = useRef(updateUrl);
  updateUrlRef.current = updateUrl;

  /**
   * Rebinds {@code selectedEnemy} when {@code enemies} is replaced (reload / project switch) so the detail pane matches disk.
   */
  useEffect(() =>
  {
    if (!enemies || enemies.length === 0)
    {
      setSelectedEnemy(null);
      setSelectedEnemyDropItems([]);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (!selectedEnemy && params.get('enemyId')) return;

    const idx = Math.min(Math.max(0, selectedEnemyIndex), enemies.length - 1);
    let next: RPG_EnemyDomainModel = enemies[idx];
    const priorId = selectedEnemy?.id;
    if (typeof priorId === 'number' && priorId >= 1)
    {
      const found = enemies.find((e) => e.id === priorId);
      if (found !== undefined)
      {
        next = found;
      }
    }

    if (next !== selectedEnemy)
    {
      setSelectedEnemy(next);
      setSelectedEnemyDropItems(ExtraDropManager.read(next.note));
      updateUrlRef.current(next);
    }
  }, [ enemies, selectedEnemyIndex, selectedEnemy ]);

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

    if (term.trim() === '')
    {
      return;
    }

    const foundIndex = enemies.findIndex(enemy =>
    {
      if (enemy === null)
      {
        return false;
      }
      if (enemy.name.length === 0)
      {
        return false;
      }
      return enemy.name.toLowerCase()
        .includes(term);
    });

    if (foundIndex !== -1)
    {
      listRef.current?.scrollToItem(foundIndex, 'start');

      // Do not steal focus from the TextField while typing
      handleEnemyListItemOnClickEvent(foundIndex, false);
    }
  };

  const findNextMatchIndex = (
    startIndex: number,
    term: string,
    direction: 1 | -1
  ) =>
  {
    const query = term.trim()
      .toLowerCase();
    if (query === '')
    {
      return -1;
    }

    const { length } = enemies;
    if (length === 0)
    {
      return -1;
    }

    for (let step = 1; step < length; step++)
    {
      const idx = (
        startIndex + (
          direction * step
        ) + length
      ) % length;
      const enemy = enemies[ idx ];
      if (!enemy)
      {
        continue;
      }
      if (!enemy.name || enemy.name.length === 0)
      {
        continue;
      }
      if (enemy.name.startsWith('==='))
      {
        continue;
      }

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
    if (query === '')
    {
      return;
    }

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
    if (query === '')
    {
      return;
    }

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
      await reload(); // Use the context's reload which handles mapping
      handleSnack('Enemy data has been reloaded successfully.', MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      console.error('Failed to reload enemy data:', error);
      handleSnack('Failed to reload enemy data.', MuiSnackbarSeverity.Error);
    }
  };

  const isValidEnemy = (enemy?: RPG_EnemyDomainModel | null) =>
  {
    if (!enemy)
    {
      return false;
    }
    if (!enemy.name || enemy.name.length === 0)
    {
      return false;
    }
    if (enemy.name.startsWith('==='))
    {
      return false;
    }
    return true;
  };

  const findNextValidIndex = (
    startIndex: number,
    direction: 1 | -1
  ) =>
  {
    const { length } = enemies;
    if (length === 0)
    {
      return startIndex;
    }

    for (let step = 1; step < length; step++)
    {
      const idx = (
        startIndex + (
          direction * step
        ) + length
      ) % length;
      if (isValidEnemy(enemies[ idx ]))
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
    if (!selectedEnemy)
    {
      return;
    }

    // update the entry.
    selectedEnemy!.name = event.target.value;
    updateEnemy(selectedEnemy!);
  };

  const handleEnemyExpOnChangeEvent = (updatedValue: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedEnemy)
    {
      return;
    }

    // update the entry.
    selectedEnemy!.exp = updatedValue;
    updateEnemy(selectedEnemy!);
  };

  const handleEnemyGoldOnChangeEvent = (updatedValue: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedEnemy)
    {
      return;
    }

    // update the entry.
    selectedEnemy!.gold = updatedValue;
    updateEnemy(selectedEnemy!);
  };

  const updateEnemy = useCallback(
    (updatedEnemy: RPG_EnemyDomainModel) =>
    {
      const clonedEnemy = Object.assign(
        Object.create(Object.getPrototypeOf(updatedEnemy)),
        updatedEnemy
      );

      setSelectedEnemy(clonedEnemy);
      setCanSave(true);

      setEnemies((prevEnemies) =>
      {
        if (!prevEnemies || selectedEnemyIndex < 0)
        {
          return prevEnemies;
        }
        return prevEnemies.with(selectedEnemyIndex, clonedEnemy);
      });
    },
    [ selectedEnemyIndex, setEnemies ]
  );

  const updateEnemyTraits = (updatedTraits: RPG_Trait[]) =>
  {
    selectedEnemy!.traits = updatedTraits;
    updateEnemy(selectedEnemy!);
  };

  const updateEnemyNote = (updatedEnemyNote: string) =>
  {
    selectedEnemy!.note = updatedEnemyNote;
    updateEnemy(selectedEnemy!);
  };

  const updateEnemyLevel = (updatedLevel: number) =>
  {
    selectedEnemy!.level = updatedLevel;
    updateEnemy(selectedEnemy!);
  };

  //region parameters
  const updateEnemyWithNewParam = (
    baseParamId: number,
    updatedValue: number
  ) =>
  {
    selectedEnemy!.params = selectedEnemy!.params.with(baseParamId, updatedValue);
    updateEnemy(selectedEnemy!);
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

    if (!enemy)
    {
      return <></>;
    }

    if (enemy.name.startsWith('==='))
    {
      return <></>;
    }

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
            {(
              selectedEnemyIndex === index
            )
              ? <DoubleArrow color={'success'} fontSize={'small'}/>
              : <KeyboardArrowRight color={'warning'} fontSize={'small'}/>}
          </ListItemIcon>
          <ListItemText
            disableTypography
            primary={`${enemy.id}: ${enemy.name}`}
            sx={{
              fontSize: 16,
              fontWeight: enemyNameFontWeight,
              fontStyle: enemyNameFontStyle,
              textShadow: enemyNameTextShadow,
              fontFamily: 'monospace',
            }}/>
        </ListItemButton>
      </ListItem>
    );
  };
  //endregion render

  //region color mappings
  const getFamilyColor = (index: number) =>
  {
    // Calculate the family index based on the adjusted index
    const familyIndex = Math.floor(index / 50);

    // Return a color based on the family index
    switch (familyIndex)
    {
      case 0:
        return blue[ 800 ];     // Changed from blue[100]
      case 1:
        return purple[ 800 ];   // Changed from purple[100]
      case 2:
        return green[ 800 ];    // Changed from green[100]
      case 3:
        return red[ 800 ];      // Changed from red[100]
      case 4:
        return teal[ 800 ];     // Changed from teal[100]
      case 5:
        return indigo[ 800 ];   // Changed from indigo[100]
      case 6:
        return pink[ 800 ];     // Changed from pink[100]
      case 7:
        return cyan[ 800 ];     // Changed from cyan[100]
      case 8:
        return amber[ 800 ];    // Changed from amber[100]
      case 9:
        return orange[ 800 ];   // Changed from orange[100]
      case 10:
        return yellow[ 800 ];   // Changed from yellow[100]
      case 11:
        return brown[ 800 ];    // Changed from brown[100]
      default:
        return blue[ 800 ];     // Default color (changed from blue[100])
    }
  };

  const getSubgroupColor = (index: number) =>
  {
    // Calculate the subgroup index within the family
    const subgroupIndex = Math.floor((
      index % 50
    ) / 10);

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

  const listPixelHeight = listViewportSize.height > 0
    ? listViewportSize.height
    : 600;
  const listPixelWidth = listViewportSize.width > 0
    ? listViewportSize.width
    : 310;

  return <>
    <Box sx={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <EditorBoardSplitLayout
        sidebarColumnWidth={'320px'}
        sidebar={
          <>
        <Stack direction={'row'} spacing={1} alignItems={'center'} sx={{ marginTop: 1 }}>
          <Tooltip title={'Previous match'}>
    <span>
      <IconButton
        size={'small'}
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

          <Tooltip title={'Next match'}>
    <span>
      <IconButton
        size={'small'}
        onClick={handleSearchNextClick}
        disabled={searchTerm.trim() === ''}
      >
        <KeyboardArrowRight/>
      </IconButton>
    </span>
          </Tooltip>
        </Stack>
        <Box
          ref={listViewportRef}
          sx={{
            flex: 1,
            minHeight: 0,
          }}
        >
        <div
          ref={listWrapperRef}
          tabIndex={0}
          role={'listbox'}
          onKeyDown={handleListKeyDown}
          onContextMenu={() =>
          {
            // TODO: implement context menu.
          }}
          style={{
            cursor: 'context-menu',
            outline: 'none',
            height: '100%',
          }}
        >
          {/* @ts-ignore */}
          <FixedSizeList
            ref={listRef}
            height={listPixelHeight}
            width={listPixelWidth}
            itemSize={30}
            overscanCount={5}
            itemCount={enemies.length}
            onScroll={throttledListScroll}
          >
            {renderEnemyListItem}
          </FixedSizeList>
        </div>
        </Box>
          </>
        }
      >
          {(
            selectedEnemy === null
          )
            ? <>
              <Typography>
                Please select an enemy on the left.<br/>
                If there are no enemies, then consider making one.
              </Typography>
            </>
            : <>
              <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 1 }}>
                <Tabs value={enemyTab} onChange={(_, v) => setEnemyTab(v)}>
                  <Tab label={'Base'} id={'enemy-tab-0'} aria-controls={'enemy-tabpanel-0'}/>
                  <Tab label={'JABS'} id={'enemy-tab-1'} aria-controls={'enemy-tabpanel-1'}/>
                </Tabs>
              </Box>

              {enemyTab === 0 && (
                <Grid container spacing={2} alignItems={'flex-start'}>
                  <Grid size={5}>
                    <Stack spacing={1}>
                      <BoardSectionCard title={'Identity'}>
                        <Grid container spacing={1.5} alignItems={'center'}>
                          <Grid size={9}>
                            <TextField
                              variant={'outlined'}
                              label={'Name'}
                              value={selectedEnemy.name}
                              onChange={handleEnemyNameOnChangeEvent}
                              size={'small'}
                              fullWidth
                            />
                          </Grid>
                          <Grid size={3}>
                            <NumberInputWithLabel
                              label={'Default Level'}
                              endAdornment={<Timeline sx={{ color: yellow[ 600 ] }}/>}
                              variant={'outlined'}
                              size={'small'}
                              fullWidth
                              value={selectedEnemy.level}
                              onChangeEventHandler={(event) =>
                              {
                                const updatedValue = parseInt(event.target.value) ?? 0;
                                updateEnemyLevel(updatedValue);
                              }}
                            />
                          </Grid>
                        </Grid>
                      </BoardSectionCard>

                      <BoardSectionCard title={'Rewards'}>
                        <Grid container spacing={1} alignItems={'center'}>
                          {[
                            {
                              label: 'Exp',
                              icon: <Addchart sx={{ color: purple[ 600 ] }}/>,
                              value: selectedEnemy.exp,
                              onChange: (v: number) => handleEnemyExpOnChangeEvent(v),
                              formula: (() =>
                              {
                                const p = knownLongParams().find(p => p.key === 'exp');
                                return p ? GrowthParser.read(selectedEnemy.note, p) : '';
                              })(),
                            },
                            {
                              label: 'Gold',
                              icon: <MonetizationOn sx={{ color: yellow[ 800 ] }}/>,
                              value: selectedEnemy.gold,
                              onChange: (v: number) => handleEnemyGoldOnChangeEvent(v),
                              formula: selectedEnemy.growths.get(32) ?? '',
                            },
                            {
                              label: 'SDPs',
                              icon: <SdCard sx={{ color: purple[ 100 ] }}/>,
                              value: selectedEnemy.sdpPoints,
                              onChange: (v: number) =>
                              {
                                selectedEnemy.sdpPoints = v;
                                updateEnemy(selectedEnemy);
                              },
                              formula: selectedEnemy.growths.get(33) ?? '',
                            },
                            {
                              label: 'AP',
                              icon: <AutoAwesome sx={{ color: cyan[ 600 ] }}/>,
                              value: selectedEnemy.apReward,
                              onChange: (v: number) =>
                              {
                                selectedEnemy.apReward = v;
                                updateEnemy(selectedEnemy);
                              },
                              formula: '',
                            },
                          ].map(({ label, icon, value, onChange, formula }) => (
                            <>
                              <Grid size={4} key={label}>
                                <NumberInputWithLabel
                                  label={label}
                                  endAdornment={icon}
                                  variant={'outlined'}
                                  size={'small'}
                                  fullWidth
                                  value={value}
                                  onChangeEventHandler={(e) => onChange(parseInt(e.target.value) ?? 0)}
                                />
                              </Grid>
                              <Grid size={8} key={`${label}-formula`}>
                                {formula && (
                                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <ShowChart sx={{ color: 'text.secondary', mr: 0.5, fontSize: '0.875rem', flexShrink: 0 }}/>
                                    <Tooltip title={formula}>
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          fontFamily: '\'Consolas\', \'Monaco\', \'Courier New\', monospace',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          display: 'inline-block',
                                          color: 'text.secondary',
                                        }}
                                      >
                                        {formula}
                                      </Typography>
                                    </Tooltip>
                                  </Box>
                                )}
                              </Grid>
                            </>
                          ))}
                        </Grid>
                      </BoardSectionCard>

                      <EnemyBaseParameters
                        selectedEnemy={selectedEnemy}
                        updateEnemyWithNewParam={updateEnemyWithNewParam}
                        updateEnemy={updateEnemy}
                      />
                      <br/>

                      <ParameterGrowth
                        selectedEnemy={selectedEnemy}
                        growableName={selectedEnemy.name}
                        updateEnemy={updateEnemy}
                        otherSubjects={enemies}
                        suggestedLevel={selectedEnemy.level}
                      />
                    </Stack>
                  </Grid>
                  <Grid size={7}>
                    <Stack spacing={1}>
                      <BoardSectionCard
                        title={'Traits'}
                        subtitle={selectedEnemy.traits.length === 0
                          ? 'No traits on this enemy.'
                          : `${selectedEnemy.traits.length} trait${selectedEnemy.traits.length === 1 ? '' : 's'}`}
                        collapsible
                        defaultExpanded={false}
                      >
                        <TraitEditor
                          selectedTraits={selectedEnemy.traits}
                          updateEnemyTraits={updateEnemyTraits}
                        />
                      </BoardSectionCard>
                      <EnemySdpDrop
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                      <EnemiesExtraDrops
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                        handleSnack={handleSnack}
                      />
                    </Stack>
                  </Grid>
                </Grid>
              )}

              {enemyTab === 1 && (
                <Grid container spacing={2} alignItems={'flex-start'}>
                  <Grid size={6}>
                    <Stack spacing={1}>
                      <EnemyJabsAiTraits
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                      <EnemyJabsBattlerRoles
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                      <EnemyJabsBattlerData
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                      <EnemyJabsTeam
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                    </Stack>
                  </Grid>
                  <Grid size={6}>
                    <Stack spacing={1}>
                      <EnemyJabsConfigs
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                      <EnemyPassiveAbs
                        selectedEnemy={selectedEnemy}
                        updateEnemy={updateEnemy}
                      />
                    </Stack>
                  </Grid>
                </Grid>
              )}
            </>}
      </EditorBoardSplitLayout>
    </Box>

    {/*region not-grid-related elements */}
    <Box sx={{
      display: 'flex',
      gap: 2
    }}>
      <SaveButton
        extraSaveText={'Enemy Data'}
        canSave={canSave}
        isSaving={isSaving}
        handleSave={async () =>
        {
          setIsSaving(true);
          try
          {
            await handleSaveButtonOnClickEvent();
            setCanSave(false);
          }
          finally
          {
            setIsSaving(false);
          }
        }}
      />

      {/* Reload Button */}
      <ReloadButton
        handleReload={async () =>
        {
          await handleReloadButtonOnClickEvent();
        }}
        canReload={!loading}
        extraReloadText={'Enemy Data'}
      />
    </Box>

    <Snackbar
      open={snackOpen}
      autoHideDuration={2500}
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'center'
      }}
      onClose={(
        _,
        reason
      ) =>
      {
        if (reason === 'clickaway')
        {
          return;
        }
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
  </>;
};

export default EnemiesBoard;
