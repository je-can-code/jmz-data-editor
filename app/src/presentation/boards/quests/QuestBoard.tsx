import { ChangeEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import type { FixedSizeList } from 'react-window';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  AddTask,
  ArrowDownward,
  ArrowUpward,
  Block,
  Category,
  ContentCopy,
  DeleteOutline,
  Edit,
  ExpandMore,
  Key,
  Style,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';

import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import KeyTextField from '../../../components/core/KeyTextField.tsx';
import { OmniObjectiveType } from '@core/enums/OmniObjectiveType.ts';
import ObjectiveLogs from './ObjectiveLogs.tsx';
import ObjectiveFulfillmentData from './ObjectiveFulfillmentData.tsx';
import OmniObjectiveFetchType from './OmniObjectiveFetchType.ts';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';

import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import { useQuests } from '@presentation/context/resources/quests.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import {
  VirtualizedSidebarList,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import type { VirtualizedSidebarRow } from '@presentation/components/board/VirtualizedSidebarList.tsx';
import Configuration = Questopedia.Configuration;
import OmniQuest = Questopedia.OmniQuest;
import OmniTag = Questopedia.OmniTag;
import OmniCategory = Questopedia.OmniCategory;
import OmniObjective = Questopedia.OmniObjective;
import IndiscriminateData = Questopedia.IndiscriminateData;
import DestinationData = Questopedia.DestinationData;
import FetchData = Questopedia.FetchData;
import SlayData = Questopedia.SlayData;
import QuestData = Questopedia.QuestData;

const QuestBoard = () =>
{
  const {
    quests,
    tags,
    categories,
    setQuests,
    setTags,
    setCategories,
    save,
    reload,
    loading,
  } = useQuests();

  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const [ tabIndex, setTabIndex ] = useState(0);

  const [ selectedQuest, setSelectedQuest ] = useState<OmniQuest | null>(null);
  const [ selectedQuestIndex, setSelectedQuestIndex ] = useState<number>(0);
  const [ questListContextMenu, setQuestListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ objectives, setObjectives ] = useState<OmniObjective[]>([]);
  const [ expandedObjectiveIdx, setExpandedObjectiveIdx ] = useState<number | null>(0);

  const [ selectedCategory, setSelectedCategory ] = useState<OmniCategory | null>(null);
  const [ selectedCategoryIndex, setSelectedCategoryIndex ] = useState<number>(0);

  const [ applicableTags, setApplicableTags ] = useState<string[]>([]);
  const [ selectedTag, setSelectedTag ] = useState<OmniTag | null>(null);
  const [ selectedTagIndex, setSelectedTagIndex ] = useState<number>(0);

  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  const handleSnackClose = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') return;
    setSnackOpen(false);
  };

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

  const handleReloadButtonOnClickEvent = async () =>
  {
    try
    {
      setSelectedQuest(null);
      setObjectives([]);
      await reload();
      handleSnack('Quests data has been reloaded successfully.', MuiSnackbarSeverity.Success);
    }
    catch (error)
    {
      const message = error instanceof Error ? error.message : 'Unknown error.';
      handleSnack(`Failed to reload quests data: ${message}`, MuiSnackbarSeverity.Error);
    }
  };

  const handleQuestListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();
    setQuestListContextMenu(prev =>
      prev === null
        ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6 }
        : null
    );
  };

  const updateQuest = (updatedQuest: OmniQuest, questIndex: number) =>
  {
    setSelectedQuest(updatedQuest);
    setQuests(quests.with(questIndex, updatedQuest));
  };

  const updateObjective = (updatedObjective: OmniObjective, objectiveIndex: number) =>
  {
    if (!selectedQuest) return;
    const updatedObjectives = objectives.with(objectiveIndex, updatedObjective);
    setObjectives(updatedObjectives);
    updateQuest({ ...selectedQuest, objectives: updatedObjectives } as OmniQuest, selectedQuestIndex);
  };

  const patchObjective = (idx: number, patch: Partial<OmniObjective>) =>
  {
    updateObjective({ ...objectives[idx], ...patch }, idx);
  };

  const handleQuestListItemOnClickEvent = (index: number) =>
  {
    setSelectedQuestIndex(index);
    if (quests.length > 0)
    {
      const quest = quests.at(index)!;
      setSelectedQuest(quest);
      setApplicableTags(quest.tagKeys);
      setObjectives(quest.objectives);
      setExpandedObjectiveIdx(quest.objectives.length > 0 ? 0 : null);
      updateUrl(quest);
    }
  };

  const patchQuest = (patch: Partial<OmniQuest>) =>
  {
    if (!selectedQuest) return;
    updateQuest({ ...selectedQuest, ...patch } as OmniQuest, selectedQuestIndex);
  };

  const handleTagsChange = (newTagObjects: OmniTag[]) =>
  {
    const sorted = newTagObjects.map(t => t.key).sort();
    setApplicableTags(sorted);
    patchQuest({ tagKeys: sorted });
  };

  const buildNewObjective = (id: number): OmniObjective =>
  {
    return {
      id,
      type: OmniObjectiveType.Indiscriminate,
      description: 'Do the needful.',
      logs: { inactive: '', active: '', completed: '', failed: '', missed: '' },
      fulfillment: {
        indiscriminate: { hint: '' } as IndiscriminateData,
        destination: { mapId: -1, x1: -1, x2: -1, y1: -1, y2: -1 } as DestinationData,
        fetch: { id: -1, type: OmniObjectiveFetchType.Unset, amount: -1 } as FetchData,
        slay: { id: -1, amount: -1 } as SlayData,
        quest: { keys: [] } as QuestData,
      },
      hiddenByDefault: true,
      isOptional: false,
    } as OmniObjective;
  };

  const buildNewQuest = (): OmniQuest =>
  {
    return {
      key: 'neo-9999',
      name: 'The New Quest!',
      overview: 'Its a new quest to do new things.',
      tagKeys: [],
      categoryKey: categories.at(0)?.key ?? '',
      recommendedLevel: 0,
      unknownHint: '',
      objectives: [ buildNewObjective(0) ],
    } as OmniQuest;
  };

  const handleAddNewQuest = (index: number) =>
  {
    setQuests(quests.toSpliced(index, 0, buildNewQuest()));
  };

  const handleCloneQuest = (index: number) =>
  {
    if (!selectedQuest) return;
    const newQuest = {
      ...selectedQuest,
      objectives: selectedQuest.objectives.toSpliced(0, 0),
    } as OmniQuest;
    setQuests(quests.toSpliced(index, 0, newQuest));
  };

  const handleDeleteQuest = (index: number) =>
  {
    setQuests(quests.toSpliced(index, 1));
  };

  const handleAddNewObjective = (insertAt: number, newId: number) =>
  {
    if (!selectedQuest) return;
    const newObjective = buildNewObjective(newId);
    const updatedObjectives = objectives.toSpliced(insertAt, 0, newObjective);
    const renumbered = updatedObjectives.map((obj, i) => ({ ...obj, id: i }));
    setObjectives(renumbered);
    updateQuest({ ...selectedQuest, objectives: renumbered } as OmniQuest, selectedQuestIndex);
    setExpandedObjectiveIdx(insertAt);
  };

  const handleCloneObjective = (idx: number) =>
  {
    if (!selectedQuest) return;
    const original = objectives[idx];
    const cloned = {
      ...original,
      description: `${original.description} (COPY)`,
    } as OmniObjective;
    const updatedObjectives = objectives.toSpliced(idx + 1, 0, cloned);
    const renumbered = updatedObjectives.map((obj, i) => ({ ...obj, id: i }));
    setObjectives(renumbered);
    updateQuest({ ...selectedQuest, objectives: renumbered } as OmniQuest, selectedQuestIndex);
    setExpandedObjectiveIdx(idx + 1);
  };

  const handleDeleteObjective = (idx: number) =>
  {
    if (!selectedQuest) return;
    if (objectives.length <= 1)
    {
      handleSnack('Cannot delete last objective, consider modifying it instead.', MuiSnackbarSeverity.Error);
      return;
    }
    const updatedObjectives = objectives.toSpliced(idx, 1);
    const renumbered = updatedObjectives.map((obj, i) => ({ ...obj, id: i }));
    setObjectives(renumbered);
    updateQuest({ ...selectedQuest, objectives: renumbered } as OmniQuest, selectedQuestIndex);
    if (expandedObjectiveIdx !== null && expandedObjectiveIdx >= renumbered.length)
    {
      setExpandedObjectiveIdx(Math.max(0, renumbered.length - 1));
    }
  };

  const handleMoveObjectiveUp = (idx: number) =>
  {
    if (!selectedQuest || idx === 0) return;
    const updated = [...objectives];
    [ updated[idx - 1], updated[idx] ] = [ updated[idx], updated[idx - 1] ];
    const renumbered = updated.map((obj, i) => ({ ...obj, id: i }));
    setObjectives(renumbered);
    updateQuest({ ...selectedQuest, objectives: renumbered } as OmniQuest, selectedQuestIndex);
    setExpandedObjectiveIdx(idx - 1);
  };

  const handleMoveObjectiveDown = (idx: number) =>
  {
    if (!selectedQuest || idx >= objectives.length - 1) return;
    const updated = [...objectives];
    [ updated[idx], updated[idx + 1] ] = [ updated[idx + 1], updated[idx] ];
    const renumbered = updated.map((obj, i) => ({ ...obj, id: i }));
    setObjectives(renumbered);
    updateQuest({ ...selectedQuest, objectives: renumbered } as OmniQuest, selectedQuestIndex);
    setExpandedObjectiveIdx(idx + 1);
  };

  const handleCategoryListItemOnClickEvent = (index: number) =>
  {
    setSelectedCategoryIndex(index);
    if (categories.length > 0) setSelectedCategory(categories.at(index)!);
  };

  const handleCategoryKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedCategory) return;
    const updated = { ...selectedCategory, key: event.target.value } as OmniCategory;
    setSelectedCategory(updated);
    setCategories(categories.with(selectedCategoryIndex, updated));
  };

  const handleCategoryNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedCategory) return;
    const updated = { ...selectedCategory, name: event.target.value } as OmniCategory;
    setSelectedCategory(updated);
    setCategories(categories.with(selectedCategoryIndex, updated));
  };

  const handleCategoryIconIndexOnChangeEvent = (value: number) =>
  {
    if (!selectedCategory) return;
    const updated = { ...selectedCategory, iconIndex: value < -1 ? -1 : value } as OmniCategory;
    setSelectedCategory(updated);
    setCategories(categories.with(selectedCategoryIndex, updated));
  };

  const handleAddNewCategory = () =>
  {
    const newCategory = {
      key: `new-category-${categories.length}`,
      name: 'NEW',
      iconIndex: -1,
    } as OmniCategory;
    const updatedCategories = categories.toSpliced(selectedCategoryIndex, 0, newCategory);
    setCategories(updatedCategories);
  };

  const handleCloneCategory = (index: number) =>
  {
    if (!selectedCategory) return;
    const cloned = {
      key: `${selectedCategory.key}-COPY`,
      name: selectedCategory.name,
      iconIndex: selectedCategory.iconIndex,
    } as OmniCategory;
    setCategories(categories.toSpliced(index + 1, 0, cloned));
  };

  const handleDeleteCategory = (index: number) =>
  {
    if (categories.length === 1)
    {
      handleSnack('Cannot delete last category; consider modifying it instead.', MuiSnackbarSeverity.Error);
      return;
    }
    const affectedQuests = quests.filter(quest => quest.categoryKey === categories[index].key);
    if (affectedQuests.length > 0)
    {
      handleSnack(`${affectedQuests.length} quests had this category applied.`, MuiSnackbarSeverity.Warning);
    }
    const updatedCategories = categories.toSpliced(index, 1);
    setCategories(updatedCategories);
    const nextIdx = Math.min(selectedCategoryIndex, updatedCategories.length - 1);
    setSelectedCategoryIndex(nextIdx);
    setSelectedCategory(updatedCategories.at(nextIdx) ?? null);
  };

  const handleTagListItemOnClickEvent = (index: number) =>
  {
    setSelectedTagIndex(index);
    if (tags.length > 0) setSelectedTag(tags.at(index)!);
  };

  const handleTagKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedTag) return;
    const updated = { ...selectedTag, key: event.target.value } as OmniTag;
    setSelectedTag(updated);
    setTags(tags.with(selectedTagIndex, updated));
  };

  const handleTagNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    if (!selectedTag) return;
    const updated = { ...selectedTag, name: event.target.value } as OmniTag;
    setSelectedTag(updated);
    setTags(tags.with(selectedTagIndex, updated));
  };

  const handleTagIconIndexOnChangeEvent = (value: number) =>
  {
    if (!selectedTag) return;
    const updated = { ...selectedTag, iconIndex: value < -1 ? -1 : value } as OmniTag;
    setSelectedTag(updated);
    setTags(tags.with(selectedTagIndex, updated));
  };

  const handleAddNewTag = () =>
  {
    const newTag = { key: `new-tag-${tags.length}`, name: 'NEW', iconIndex: -1 } as OmniTag;
    setTags(tags.toSpliced(selectedTagIndex, 0, newTag));
  };

  const handleCloneTag = (index: number) =>
  {
    if (!selectedTag) return;
    const cloned = {
      key: `${selectedTag.key}-COPY`,
      name: selectedTag.name,
      iconIndex: selectedTag.iconIndex,
    } as OmniTag;
    setTags(tags.toSpliced(index + 1, 0, cloned));
  };

  const handleDeleteTag = (index: number) =>
  {
    const affectedQuests = quests.filter(quest => quest.tagKeys.includes(tags[index].key));
    if (affectedQuests.length > 0)
    {
      handleSnack(`${affectedQuests.length} quests had this tag applied.`, MuiSnackbarSeverity.Warning);
    }
    const updatedTags = tags.toSpliced(index, 1);
    setTags(updatedTags);
    const nextIdx = Math.min(selectedTagIndex, updatedTags.length - 1);
    setSelectedTagIndex(nextIdx);
    setSelectedTag(updatedTags.at(nextIdx) ?? null);
  };

  const QUEST_LABEL_MIN_CH = 40;
  const questBoardListColumnWidth = virtualizedSidebarColumnWidth(
    VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
    QUEST_LABEL_MIN_CH,
  );

  const getQuestSidebarRow = (index: number): VirtualizedSidebarRow =>
  {
    const omniQuest = quests.at(index);
    if (!omniQuest) return { type: 'spacer' };
    const label = `[${omniQuest.key}]: ${omniQuest.name}`;
    const categoryIconIndex = categories.find(c => c.key === omniQuest.categoryKey)?.iconIndex;
    return {
      type: 'item',
      label,
      title: label,
      iconIndex: categoryIconIndex,
      labelSx: { fontFamily: 'monospace' },
    };
  };

  const selectedTagObjects = tags.filter(t => applicableTags.includes(t.key));

  const { updateUrl } = useUrlSelection(
    'questKey',
    quests,
    (q) => q.key,
    (index) => handleQuestListItemOnClickEvent(index),
    (index) => listRef.current?.scrollToItem(index, 'smart')
  );

  useEffect(() =>
  {
    if (quests.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('questKey')) return;
    if (selectedQuest === null) handleQuestListItemOnClickEvent(0);
  }, [ quests ]);

  useEffect(() =>
  {
    if (categories.length > 0 && selectedCategory === null)
    {
      setSelectedCategory(categories[0]);
      setSelectedCategoryIndex(0);
    }
  }, [ categories ]);

  useEffect(() =>
  {
    if (tags.length > 0 && selectedTag === null)
    {
      setSelectedTag(tags[0]);
      setSelectedTagIndex(0);
    }
  }, [ tags ]);

  useBoardActions({
    onSave: async () =>
    {
      await save({ quests, tags, categories } as Configuration);
    },
    canSave: !loading,
    onReload: handleReloadButtonOnClickEvent,
    canReload: !loading,
  });

  if (loading)
  {
    return (
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2 }}>
        <Typography>Loading quests configuration…</Typography>
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
        sidebarColumnWidth={questBoardListColumnWidth}
        sidebar={
          <VirtualizedSidebarList
            ref={listRef}
            itemCount={quests.length}
            itemSize={30}
            fillContainer
            listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
            labelMinCh={QUEST_LABEL_MIN_CH}
            selectedIndex={selectedQuestIndex}
            getRow={getQuestSidebarRow}
            onSelectIndex={(index) => handleQuestListItemOnClickEvent(index)}
            onContextMenu={handleQuestListContextMenu}
            listWrapperRef={listWrapperRef}
          />
        }
      >
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)}>
            <Tab label={'Quest'} id={'quest-tab-0'} aria-controls={'quest-tabpanel-0'}/>
            <Tab label={'Categories'} id={'quest-tab-1'} aria-controls={'quest-tabpanel-1'}/>
            <Tab label={'Tags'} id={'quest-tab-2'} aria-controls={'quest-tabpanel-2'}/>
          </Tabs>
        </Box>

        {tabIndex === 0 && (
          selectedQuest === null
            ? <Typography>
                Please select a quest on the left.<br/>
                If there are no quests, then consider making one.
              </Typography>
            : <Stack spacing={2}>

                {/* Quest Identity */}
                <BoardSectionCard title={'Quest'}>
                  <Stack spacing={1.5}>
                    <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'}>
                      <Box sx={{ width: 180, flexShrink: 0 }}>
                        <KeyTextField
                          value={selectedQuest.key}
                          onChange={(input) => patchQuest({ key: input })}
                        />
                      </Box>
                      <TextField
                        variant={'outlined'}
                        label={'Name'}
                        value={selectedQuest.name}
                        onChange={event => patchQuest({ name: event.target.value })}
                        size={'small'}
                        fullWidth
                      />
                    </Stack>
                    <TextField
                      variant={'outlined'}
                      label={'Unknown Hint'}
                      value={selectedQuest.unknownHint}
                      onChange={event => patchQuest({ unknownHint: event.target.value })}
                      size={'small'}
                      fullWidth
                    />
                    <TextField
                      variant={'outlined'}
                      label={'Overview'}
                      value={selectedQuest.overview}
                      onChange={event => patchQuest({ overview: event.target.value })}
                      size={'small'}
                      multiline
                      fullWidth
                      rows={6}
                    />
                  </Stack>
                </BoardSectionCard>

                {/* Classification */}
                <BoardSectionCard title={'Classification'}>
                  <Stack spacing={1.5}>
                    <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'} flexWrap={'wrap'} useFlexGap>
                      <FormControl size={'small'} sx={{ minWidth: 200 }}>
                        <InputLabel>Category</InputLabel>
                        <Select
                          value={selectedQuest.categoryKey}
                          label={'Category'}
                          onChange={event => patchQuest({ categoryKey: event.target.value })}
                        >
                          {categories.map((category, index) => (
                            <MenuItem key={`${category.key}-${index}`} value={category.key}>
                              {`[${category.key}]: ${category.name}`}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        type={'number'}
                        label={'Rec. Level'}
                        variant={'outlined'}
                        size={'small'}
                        value={selectedQuest.recommendedLevel ?? 0}
                        onChange={event => patchQuest({ recommendedLevel: Math.max(0, parseInt(event.target.value) || 0) })}
                        sx={{ width: 110 }}
                      />
                      <Tooltip title={'Manage categories'}>
                        <IconButton
                          size={'small'}
                          color={'success'}
                          onClick={() => setTabIndex(1)}
                        >
                          <Edit fontSize={'small'}/>
                          <Category fontSize={'small'}/>
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    <Stack direction={'row'} spacing={1.5} alignItems={'flex-start'}>
                      <Autocomplete<OmniTag, true>
                        multiple
                        size={'small'}
                        fullWidth
                        options={tags.filter(t => t.name !== '' && !t.name.startsWith('=='))}
                        getOptionKey={(option) => option.key}
                        getOptionLabel={(option) => `${option.key}: ${option.name}`}
                        isOptionEqualToValue={(a, b) => a.key === b.key}
                        value={selectedTagObjects}
                        onChange={(_, newValue) => handleTagsChange(newValue)}
                        disableCloseOnSelect
                        slotProps={{ chip: { size: 'small' } }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size={'small'}
                            label={'Tags'}
                            placeholder={applicableTags.length === 0 ? 'None assigned' : ''}
                          />
                        )}
                      />
                      <Tooltip title={'Manage tags'}>
                        <IconButton
                          size={'small'}
                          color={'secondary'}
                          onClick={() => setTabIndex(2)}
                        >
                          <Edit fontSize={'small'}/>
                          <Style fontSize={'small'}/>
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </BoardSectionCard>

                {/* Objectives */}
                <BoardSectionCard
                  title={'Objectives'}
                  actions={
                    <Tooltip title={'Add objective'}>
                      <IconButton
                        size={'small'}
                        color={'success'}
                        onClick={() => handleAddNewObjective(objectives.length, objectives.length)}
                      >
                        <Add/>
                      </IconButton>
                    </Tooltip>
                  }
                >
                  <Stack spacing={0}>
                    {objectives.map((objective, idx) =>
                    {
                      const isExpanded = expandedObjectiveIdx === idx;

                      return (
                        <Accordion
                          key={idx}
                          expanded={isExpanded}
                          onChange={() => setExpandedObjectiveIdx(isExpanded ? null : idx)}
                          disableGutters
                          elevation={0}
                          sx={{
                            border: '1px solid',
                            borderColor: 'divider',
                            '&:not(:first-of-type)': { borderTop: 0 },
                            '&::before': { display: 'none' },
                          }}
                        >
                          <AccordionSummary
                            expandIcon={<ExpandMore/>}
                            sx={{ minHeight: 44 }}
                          >
                            <Stack
                              direction={'row'}
                              spacing={0.75}
                              alignItems={'center'}
                              sx={{ flex: 1, minWidth: 0, mr: 1 }}
                            >
                              <Typography
                                variant={'body2'}
                                color={'text.secondary'}
                                sx={{ fontFamily: 'monospace', flexShrink: 0 }}
                              >
                                #{idx}
                              </Typography>
                              <Typography variant={'body2'} noWrap sx={{ flex: 1, minWidth: 0 }}>
                                {objective.description}
                              </Typography>
                              <Chip
                                label={objective.type}
                                size={'small'}
                                variant={'outlined'}
                                sx={{ flexShrink: 0 }}
                              />
                              <Tooltip title={'Move up'}>
                                <span>
                                  <IconButton
                                    size={'small'}
                                    disabled={idx === 0}
                                    onClick={e =>
                                    {
                                      e.stopPropagation();
                                      handleMoveObjectiveUp(idx);
                                    }}
                                  >
                                    <ArrowUpward fontSize={'small'}/>
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={'Move down'}>
                                <span>
                                  <IconButton
                                    size={'small'}
                                    disabled={idx === objectives.length - 1}
                                    onClick={e =>
                                    {
                                      e.stopPropagation();
                                      handleMoveObjectiveDown(idx);
                                    }}
                                  >
                                    <ArrowDownward fontSize={'small'}/>
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={'Clone objective'}>
                                <IconButton
                                  size={'small'}
                                  onClick={e =>
                                  {
                                    e.stopPropagation();
                                    handleCloneObjective(idx);
                                  }}
                                >
                                  <ContentCopy fontSize={'small'}/>
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={'Delete objective'}>
                                <IconButton
                                  size={'small'}
                                  color={'error'}
                                  onClick={e =>
                                  {
                                    e.stopPropagation();
                                    handleDeleteObjective(idx);
                                  }}
                                >
                                  <DeleteOutline fontSize={'small'}/>
                                </IconButton>
                              </Tooltip>
                            </Stack>
                          </AccordionSummary>

                          <AccordionDetails sx={{ pt: 1.5, pb: 2, px: 2 }}>
                            <Stack spacing={2}>
                              <Stack direction={'row'} spacing={2} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                                <FormControl size={'small'} sx={{ minWidth: 160 }}>
                                  <InputLabel>Objective Type</InputLabel>
                                  <Select
                                    value={objective.type}
                                    label={'Objective Type'}
                                    onChange={event =>
                                      patchObjective(idx, { type: event.target.value as OmniObjectiveType })
                                    }
                                  >
                                    {Object.keys(OmniObjectiveType).map(k => (
                                      <MenuItem key={k} value={k}>{k}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>

                                <ToggleButtonGroup
                                  exclusive
                                  size={'small'}
                                  value={objective.hiddenByDefault ? 'hidden' : 'visible'}
                                  onChange={(_, val) =>
                                  {
                                    if (val !== null) patchObjective(idx, { hiddenByDefault: val === 'hidden' });
                                  }}
                                >
                                  <ToggleButton value={'visible'} color={'success'}>
                                    <Visibility fontSize={'small'}/>
                                    <Typography variant={'caption'} sx={{ ml: 0.5 }}>Visible</Typography>
                                  </ToggleButton>
                                  <ToggleButton value={'hidden'} color={'error'}>
                                    <VisibilityOff fontSize={'small'}/>
                                    <Typography variant={'caption'} sx={{ ml: 0.5 }}>Hidden</Typography>
                                  </ToggleButton>
                                </ToggleButtonGroup>

                                <ToggleButtonGroup
                                  exclusive
                                  size={'small'}
                                  value={objective.isOptional ? 'optional' : 'required'}
                                  onChange={(_, val) =>
                                  {
                                    if (val !== null) patchObjective(idx, { isOptional: val === 'optional' });
                                  }}
                                >
                                  <ToggleButton value={'required'} color={'warning'}>
                                    <Block fontSize={'small'}/>
                                    <Typography variant={'caption'} sx={{ ml: 0.5 }}>Required</Typography>
                                  </ToggleButton>
                                  <ToggleButton value={'optional'} color={'success'}>
                                    <AddTask fontSize={'small'}/>
                                    <Typography variant={'caption'} sx={{ ml: 0.5 }}>Optional</Typography>
                                  </ToggleButton>
                                </ToggleButtonGroup>
                              </Stack>

                              <TextField
                                variant={'outlined'}
                                label={'Description'}
                                size={'small'}
                                fullWidth
                                value={objective.description}
                                onChange={event => patchObjective(idx, { description: event.target.value })}
                              />

                              <BoardSectionCard title={'State Logs'} collapsible defaultExpanded={false} density={'compact'}>
                                <ObjectiveLogs
                                  logs={objective.logs}
                                  updateObjectiveLogsFunc={(updatedLogs) => patchObjective(idx, { logs: updatedLogs })}
                                />
                              </BoardSectionCard>

                              <BoardSectionCard title={'Fulfillment Data'} density={'compact'}>
                                <ObjectiveFulfillmentData
                                  fulfillmentData={objective.fulfillment}
                                  fulfillmentType={objective.type}
                                  updateIndiscriminateFunc={(data) =>
                                    patchObjective(idx, { fulfillment: { ...objective.fulfillment, indiscriminate: data } })
                                  }
                                  updateDestinationFunc={(data) =>
                                    patchObjective(idx, { fulfillment: { ...objective.fulfillment, destination: data } })
                                  }
                                  updateFetchFunc={(data) =>
                                    patchObjective(idx, { fulfillment: { ...objective.fulfillment, fetch: data } })
                                  }
                                  updateSlayFunc={(data) =>
                                    patchObjective(idx, { fulfillment: { ...objective.fulfillment, slay: data } })
                                  }
                                  updateQuestFunc={(data) =>
                                    patchObjective(idx, { fulfillment: { ...objective.fulfillment, quest: data } })
                                  }
                                />
                              </BoardSectionCard>
                            </Stack>
                          </AccordionDetails>
                        </Accordion>
                      );
                    })}
                  </Stack>
                </BoardSectionCard>

              </Stack>
        )}

        {tabIndex === 1 && (
          <Stack direction={'row'} spacing={2} sx={{ height: '100%' }}>
            <Box sx={{ width: 280, flexShrink: 0 }}>
              <BoardSectionCard
                title={'Categories'}
                density={'compact'}
                actions={
                  <Tooltip title={'Add category'}>
                    <IconButton size={'small'} color={'success'} onClick={handleAddNewCategory}>
                      <Add fontSize={'small'}/>
                    </IconButton>
                  </Tooltip>
                }
              >
                <List dense disablePadding>
                  {categories.map((category, index) => (
                    <ListItem
                      key={`${category.key}-${index}`}
                      disablePadding
                      secondaryAction={
                        <Stack direction={'row'} spacing={0}>
                          <Tooltip title={'Clone'}>
                            <IconButton size={'small'} onClick={() => handleCloneCategory(index)}>
                              <ContentCopy fontSize={'small'}/>
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={'Delete'}>
                            <IconButton size={'small'} color={'error'} onClick={() => handleDeleteCategory(index)}>
                              <DeleteOutline fontSize={'small'}/>
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      }
                    >
                      <ListItemButton
                        selected={selectedCategoryIndex === index}
                        onClick={() => handleCategoryListItemOnClickEvent(index)}
                        sx={{ pr: 8 }}
                      >
                        <ListItemText primary={category.name} secondary={category.key}/>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </BoardSectionCard>
            </Box>

            {selectedCategory !== null && (
              <Stack spacing={2} sx={{ flex: 1 }}>
                <BoardSectionCard title={'Category'}>
                  <Stack spacing={2}>
                    <Tooltip title={'Modifying the key will require updating quests associated with this category.'}>
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
                            startAdornment: <InputAdornment position={'start'}><Key/></InputAdornment>
                          }
                        }}
                      />
                    </Tooltip>
                    <TextField
                      variant={'outlined'}
                      label={'Name'}
                      value={selectedCategory.name}
                      onChange={handleCategoryNameOnChangeEvent}
                      size={'small'}
                      fullWidth
                    />
                    <IconIndexField
                      value={selectedCategory.iconIndex ?? 0}
                      onChange={handleCategoryIconIndexOnChangeEvent}
                    />
                  </Stack>
                </BoardSectionCard>
              </Stack>
            )}
          </Stack>
        )}

        {tabIndex === 2 && (
          <Stack direction={'row'} spacing={2} sx={{ height: '100%' }}>
            <Box sx={{ width: 280, flexShrink: 0 }}>
              <BoardSectionCard
                title={'Tags'}
                density={'compact'}
                actions={
                  <Tooltip title={'Add tag'}>
                    <IconButton size={'small'} color={'success'} onClick={handleAddNewTag}>
                      <Add fontSize={'small'}/>
                    </IconButton>
                  </Tooltip>
                }
              >
                <List dense disablePadding>
                  {tags.map((tag, index) => (
                    <ListItem
                      key={`${tag.key}-${index}`}
                      disablePadding
                      secondaryAction={
                        <Stack direction={'row'} spacing={0}>
                          <Tooltip title={'Clone'}>
                            <IconButton size={'small'} onClick={() => handleCloneTag(index)}>
                              <ContentCopy fontSize={'small'}/>
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={'Delete'}>
                            <IconButton size={'small'} color={'error'} onClick={() => handleDeleteTag(index)}>
                              <DeleteOutline fontSize={'small'}/>
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      }
                    >
                      <ListItemButton
                        selected={selectedTagIndex === index}
                        onClick={() => handleTagListItemOnClickEvent(index)}
                        sx={{ pr: 8 }}
                      >
                        <ListItemText primary={tag.name} secondary={tag.key}/>
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </BoardSectionCard>
            </Box>

            {selectedTag !== null && (
              <Stack spacing={2} sx={{ flex: 1 }}>
                <BoardSectionCard title={'Tag'}>
                  <Stack spacing={2}>
                    <Tooltip title={'Modifying the key will require updating quests associated with this tag.'}>
                      <TextField
                        required
                        variant={'outlined'}
                        label={'Key'}
                        value={selectedTag.key}
                        onChange={handleTagKeyOnChangeEvent}
                        size={'small'}
                        fullWidth
                        slotProps={{
                          input: {
                            startAdornment: <InputAdornment position={'start'}><Key/></InputAdornment>
                          }
                        }}
                      />
                    </Tooltip>
                    <TextField
                      variant={'outlined'}
                      label={'Name'}
                      value={selectedTag.name}
                      onChange={handleTagNameOnChangeEvent}
                      size={'small'}
                      fullWidth
                    />
                    <IconIndexField
                      value={selectedTag.iconIndex ?? 0}
                      onChange={handleTagIconIndexOnChangeEvent}
                    />
                  </Stack>
                </BoardSectionCard>
              </Stack>
            )}
          </Stack>
        )}
      </EditorBoardSplitLayout>
    </Box>

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
      open={questListContextMenu !== null}
      onClose={() => setQuestListContextMenu(null)}
      anchorReference={'anchorPosition'}
      anchorPosition={questListContextMenu !== null
        ? { top: questListContextMenu.mouseY, left: questListContextMenu.mouseX }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <Add sx={{ mr: 1 }}/>
        <Typography>Add new above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleAddNewQuest(selectedQuestIndex + 1);
        setQuestListContextMenu(null);
      }}>
        <Add sx={{ mr: 1 }}/>
        <Typography>Add new below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem onClick={() =>
      {
        handleCloneQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <ContentCopy sx={{ mr: 1 }}/>
        <Typography>Clone above</Typography>
      </MenuItem>
      <MenuItem onClick={() =>
      {
        handleCloneQuest(selectedQuestIndex + 1);
        setQuestListContextMenu(null);
      }}>
        <ContentCopy sx={{ mr: 1 }}/>
        <Typography>Clone below</Typography>
      </MenuItem>
      <Divider/>
      <MenuItem onClick={() =>
      {
        handleDeleteQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <DeleteOutline sx={{ mr: 1 }}/>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>
  </>;
};

export default QuestBoard;
