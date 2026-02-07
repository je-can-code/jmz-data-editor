import React, {
  ChangeEvent,
  MouseEvent,
  useRef,
  useState,
} from 'react';
import { FixedSizeList } from 'react-window';
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
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  Add,
  AddTask,
  Block,
  Category,
  Check,
  ContentCopy,
  DoubleArrow,
  Edit,
  Key,
  KeyboardArrowRight,
  Remove,
  Style,
  Visibility,
  VisibilityOff
} from '@mui/icons-material';
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from '@core/enums/MuiSnackbar.ts';

import SaveButton from '../../../components/core/SaveButton.tsx';
import KeyTextField from '../../../components/core/KeyTextField.tsx';
import { OmniObjectiveType } from '@core/enums/OmniObjectiveType.ts';
import ObjectiveLogs from './ObjectiveLogs.tsx';
import ObjectiveFulfillmentData from './ObjectiveFulfillmentData.tsx';
import OmniObjectiveFetchType from './OmniObjectiveFetchType.ts';

import Configuration = Questopedia.Configuration;
import OmniQuest = Questopedia.OmniQuest;
import OmniTag = Questopedia.OmniTag;
import OmniCategory = Questopedia.OmniCategory;
import OmniObjective = Questopedia.OmniObjective;
import OmniObjectiveLogs = Questopedia.OmniObjectiveLogs;
import IndiscriminateData = Questopedia.IndiscriminateData;
import DestinationData = Questopedia.DestinationData;
import FetchData = Questopedia.FetchData;
import SlayData = Questopedia.SlayData;
import QuestData = Questopedia.QuestData;
import OmniFulfillmentData = Questopedia.OmniFulfillmentData;

import { useQuests } from '@presentation/context/resources/quests.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import { useLocation, useNavigate } from 'react-router-dom';

const QuestBoard = () =>
{
  const navigate = useNavigate(); // Get navigate from its own hook
  const location = useLocation(); // Get location object for path information
  const {
    quests,
    tags,
    categories,
    setQuests,
    setTags,
    setCategories,
    save,
    loading,
  } = useQuests();

  //region state
  const listRef = useRef<FixedSizeList>(null);

  const [ selectedQuest, setSelectedQuest ] = useState<OmniQuest | null>(null);
  const [ selectedQuestIndex, setSelectedQuestIndex ] = useState<number>(0);
  const [ questListContextMenu, setQuestListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ objectives, setObjectives ] = useState<OmniObjective[]>([]);
  const [ selectedObjective, setSelectedObjective ] = useState<OmniObjective | null>(null);
  const [ selectedObjectiveIndex, setSelectedObjectiveIndex ] = useState<number>(0);
  const [ objectiveListContextMenu, setObjectiveListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ selectedCategory, setSelectedCategory ] = useState<OmniCategory | null>(null);
  const [ selectedCategoryIndex, setSelectedCategoryIndex ] = useState<number>(0);
  const [ categoryDialogOpen, setCategoryDialogOpen ] = useState<boolean>(false);
  const [ categoryListContextMenu, setCategoryListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ applicableTags, setApplicableTags ] = useState<string[]>([]);
  const [ selectedTag, setSelectedTag ] = useState<OmniTag | null>(null);
  const [ selectedTagIndex, setSelectedTagIndex ] = useState<number>(0);
  const [ tagDialogOpen, setTagDialogOpen ] = useState<boolean>(false);
  const [ tagListContextMenu, setTagListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);

  //endregion state

  //region actions
  const handleQuestListItemOnClickEvent = (index: number) =>
  {
    setSelectedQuestIndex(index);

    if (quests.length > 0)
    {
      const quest = quests.at(index)!;
      setSelectedQuest(quest);
      setApplicableTags(quest.tagKeys);

      const questObjectives = quest.objectives;
      setObjectives(questObjectives);
      setSelectedObjective(questObjectives.at(0)!);
      setSelectedObjectiveIndex(0);

      updateUrl(quest);
    }
  };

  const handleObjectiveListItemOnClickEvent = (index: number) =>
  {
    setSelectedObjectiveIndex(index);

    if (objectives.length > 0)
    {
      const objective = objectives.at(index)!;
      setSelectedObjective(objective);
    }
  };

  const handleCategoryDialogListItemOnClickEvent = (index: number) =>
  {
    setSelectedCategoryIndex(index);
    if (categories.length > 0)
    {
      const category = categories.at(index)!;
      setSelectedCategory(category);
    }
  };

  const handleTagDialogListItemOnClickEvent = (index: number) =>
  {
    setSelectedTagIndex(index);
    if (tags.length > 0)
    {
      const tag = tags.at(index)!;
      setSelectedTag(tag);
    }
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

  const handleQuestListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = questListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setQuestListContextMenu(newContextMenuState);
  };

  const handleObjectiveListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = objectiveListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setObjectiveListContextMenu(newContextMenuState);
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

  const handleTagListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = tagListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setTagListContextMenu(newContextMenuState);
  };
  //endregion actions

  //region updates
  const handleQuestKeyOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      key: input
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestNameOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      name: input
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestRecommendedLevelOnChangeEvent = (input: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    const updatedRecommendedLevel = input < 0
      ? 0
      : input;

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      recommendedLevel: updatedRecommendedLevel
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestUnknownHintOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      unknownHint: input
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestOverviewOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      overview: input
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestCategoryOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedQuest)
    {
      return;
    }

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      categoryKey: input
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleQuestTagToggle = (value: string) =>
  {
    const currentIndex = applicableTags.indexOf(value);
    const newChecked = [ ...applicableTags ];

    if (currentIndex === -1)
    {
      newChecked.push(value);
    }
    else
    {
      newChecked.splice(currentIndex, 1);
    }

    setApplicableTags(newChecked.sort());

    const updatedQuest = {
      ...selectedQuest,
      tagKeys: newChecked
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleObjectiveTypeOnChangeEvent = (input: string) =>
  {
    // if there is no entry, stop processing.
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective,
      type: input
    } as OmniObjective;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveHiddenByDefaultOnChangeEvent = (newState: boolean) =>
  {
    // if there is no entry, stop processing.
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective,
      hiddenByDefault: newState
    } as OmniObjective;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveIsOptionalOnChangeEvent = (newState: boolean) =>
  {
    // if there is no entry, stop processing.
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective,
      isOptional: newState
    } as OmniObjective;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveDescriptionOnChangeEvent = (input: string) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective,
      description: input
    } as OmniObjective;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveLogsOnChangeEvent = (updatedObjectiveLogs: OmniObjectiveLogs) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective,
      logs: updatedObjectiveLogs
    } as OmniObjective;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveFulfillmentIndiscriminateOnChangeEvent = (updatedData: IndiscriminateData) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective
    } as OmniObjective;
    updatedObjective.fulfillment.indiscriminate = updatedData;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveFulfillmentDestinationOnChangeEvent = (updatedData: DestinationData) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective
    } as OmniObjective;
    updatedObjective.fulfillment.destination = updatedData;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveFulfillmentFetchOnChangeEvent = (updatedData: FetchData) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective
    } as OmniObjective;
    updatedObjective.fulfillment.fetch = updatedData;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveFulfillmentSlayOnChangeEvent = (updatedData: SlayData) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective
    } as OmniObjective;
    updatedObjective.fulfillment.slay = updatedData;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleObjectiveFulfillmentQuestOnChangeEvent = (updatedData: QuestData) =>
  {
    if (!selectedObjective)
    {
      return;
    }

    const updatedObjective = {
      ...selectedObjective
    } as OmniObjective;
    updatedObjective.fulfillment.quest = updatedData;

    updateObjective(updatedObjective, selectedObjectiveIndex);
  };

  const handleCategoryKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory)
    {
      return;
    }

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      key: updatedValue
    } as OmniCategory;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory)
    {
      return;
    }

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      name: updatedValue
    } as OmniCategory;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleCategoryIconIndexOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedCategory)
    {
      return;
    }

    const updatedValue = value < -1
      ? -1
      : value;

    // update the entry.
    const updatedCategory = {
      ...selectedCategory,
      iconIndex: updatedValue
    } as OmniCategory;
    setSelectedCategory(updatedCategory);

    // rebuild the updated list of entries with the updated entry.
    const updatedCategories = categories.with(selectedCategoryIndex, updatedCategory);
    setCategories(updatedCategories);
  };

  const handleTagKeyOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedTag)
    {
      return;
    }

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedTag = {
      ...selectedTag,
      key: updatedValue
    } as OmniTag;
    setSelectedTag(updatedTag);

    // rebuild the updated list of entries with the updated entry.
    const updatedTags = tags.with(selectedTagIndex, updatedTag);
    setTags(updatedTags);
  };

  const handleTagNameOnChangeEvent = (event: ChangeEvent<HTMLInputElement>) =>
  {
    // if there is no entry, stop processing.
    if (!selectedTag)
    {
      return;
    }

    // grab the updated value from the input.
    const updatedValue = event.target.value;

    // update the entry.
    const updatedTag = {
      ...selectedTag,
      name: updatedValue
    } as OmniTag;
    setSelectedTag(updatedTag);

    // rebuild the updated list of entries with the updated entry.
    const updatedTags = tags.with(selectedTagIndex, updatedTag);
    setTags(updatedTags);
  };

  const handleTagIconIndexOnChangeEvent = (value: number) =>
  {
    // if there is no entry, stop processing.
    if (!selectedTag)
    {
      return;
    }

    const updatedValue = value < -1
      ? -1
      : value;

    // update the entry.
    const updatedTag = {
      ...selectedTag,
      iconIndex: updatedValue
    } as OmniTag;
    setSelectedTag(updatedTag);

    // rebuild the updated list of entries with the updated entry.
    const updatedTags = tags.with(selectedTagIndex, updatedTag);
    setTags(updatedTags);
  };

  const updateObjective = (
    updatedObjective: OmniObjective,
    objectiveIndex: number
  ) =>
  {
    setSelectedObjective(updatedObjective);

    const updatedObjectives = objectives.with(objectiveIndex, updatedObjective);
    setObjectives(updatedObjectives);

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      objectives: updatedObjectives,
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const updateQuest = (
    updatedQuest: OmniQuest,
    questIndex: number
  ) =>
  {
    setSelectedQuest(updatedQuest);

    const updatedQuests = quests.with(questIndex, updatedQuest);
    setQuests(updatedQuests);
  };

  const buildNewObjective = (id: number): OmniObjective =>
  {
    const newFulfillmentData = {
      indiscriminate: {
        hint: '',
      } as IndiscriminateData,
      destination: {
        mapId: -1,
        x1: -1,
        x2: -1,
        y1: -1,
        y2: -1,
      } as DestinationData,
      fetch: {
        id: -1,
        type: OmniObjectiveFetchType.Unset,
        amount: -1
      } as FetchData,
      slay: {
        id: -1,
        amount: -1
      } as SlayData,
      quest: {
        keys: []
      } as QuestData,
    } as OmniFulfillmentData;
    const newLogs = {
      inactive: '',
      active: '',
      completed: '',
      failed: '',
      missed: ''
    } as OmniObjectiveLogs;
    return {
      id: id,
      type: OmniObjectiveType.Indiscriminate,
      description: 'Do the needful.',
      logs: newLogs,
      fulfillment: newFulfillmentData,
      hiddenByDefault: true,
      isOptional: false,
    } as OmniObjective;
  };

  const buildNewQuest = (): OmniQuest =>
  {
    const newObjective = buildNewObjective(0);
    return {
      key: 'neo-9999',
      name: 'The New Quest!',
      overview: 'Its a new quest to do new things.',
      tagKeys: [],
      categoryKey: categories.at(0)?.key ?? '',
      recommendedLevel: 0,
      unknownHint: '',
      objectives: [ newObjective ],
    } as OmniQuest;
  };

  const handleAddNewQuest = (index: number) =>
  {
    if (!selectedQuest)
    {
      return;
    }

    const newQuest = buildNewQuest();

    const updatedQuests = quests.toSpliced(index, 0, newQuest);
    setQuests(updatedQuests);
  };

  const handleCloneQuest = (index: number) =>
  {
    if (!selectedQuest)
    {
      return;
    }

    const clonedObjectives = selectedQuest.objectives.toSpliced(0, 0);
    const newQuest = {
      ...selectedQuest,
      objectives: clonedObjectives,
    } as OmniQuest;

    const updatedQuests = quests.toSpliced(index, 0, newQuest);
    setQuests(updatedQuests);
  };

  const handleDeleteQuest = (index: number) =>
  {
    if (!selectedQuest)
    {
      return;
    }

    const updatedQuests = quests.toSpliced(index, 1);
    setQuests(updatedQuests);
  };

  const handleAddNewObjective = (index: number) =>
  {
    if (!selectedQuest || !selectedObjective)
    {
      return;
    }

    const targetId = selectedObjectiveIndex === index
      // if "add new above"
      ? selectedObjective.id
      // if "add new below"
      : selectedObjective.id + 1;

    const newObjective = buildNewObjective(targetId);

    const updatedObjectives = objectives.toSpliced(index, 0, newObjective);
    setObjectives(updatedObjectives);

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      objectives: updatedObjectives,
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleCloneObjective = (index: number) =>
  {
    if (!selectedQuest || !selectedObjective)
    {
      return;
    }

    const targetId = selectedObjectiveIndex === index
      // if "add new above"
      ? selectedObjective.id
      // if "add new below"
      : selectedObjective.id + 1;

    const clonedObjective = {
      ...selectedObjective,
      description: `${selectedObjective.description} (COPY)`,
      id: targetId
    } as OmniObjective;

    const updatedObjectives = objectives.toSpliced(index, 0, clonedObjective);
    setObjectives(updatedObjectives);

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      objectives: updatedObjectives,
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleDeleteObjective = (index: number) =>
  {
    if (!selectedQuest || !selectedObjective)
    {
      return;
    }

    if (objectives.length <= 1)
    {
      handleSnack('Cannot delete last objective, consider modifying it instead.', MuiSnackbarSeverity.Error);
      return;
    }

    const updatedObjectives = objectives.toSpliced(index, 1);
    setObjectives(updatedObjectives);

    // update the entry.
    const updatedQuest = {
      ...selectedQuest,
      objectives: updatedObjectives,
    } as OmniQuest;
    updateQuest(updatedQuest, selectedQuestIndex);
  };

  const handleAddNewCategory = (index: number) =>
  {
    if (!selectedCategory)
    {
      return;
    }

    const newCategory = {
      key: `new-category-${categories.length}`,
      name: 'NEW',
      iconIndex: -1,
    } as OmniCategory;

    const updatedCategories = categories.toSpliced(index, 0, newCategory);
    setCategories(updatedCategories);
  };

  const handleCloneCategory = (index: number) =>
  {
    if (!selectedCategory)
    {
      return;
    }

    const clonedCategory = {
      key: `${selectedCategory.key}-COPY`,
      name: selectedCategory.name,
      iconIndex: selectedCategory.iconIndex,
    } as OmniCategory;

    const updatedCategories = categories.toSpliced(index, 0, clonedCategory);
    setCategories(updatedCategories);
  };

  const handleDeleteCategory = (index: number) =>
  {
    if (!selectedCategory)
    {
      return;
    }

    if (categories.length === 1)
    {
      const errorMessage = `Cannot delete last category; consider modifying it instead.`;
      handleSnack(errorMessage, MuiSnackbarSeverity.Error);
      return;
    }

    const affectedQuests = quests.filter(quest => quest.categoryKey === selectedCategory.key);
    if (affectedQuests.length > 0)
    {
      const errorMessage = `${affectedQuests.length} quests had this category applied.`;
      handleSnack(errorMessage, MuiSnackbarSeverity.Warning);
    }

    const updatedCategories = categories.toSpliced(index, 1);
    setCategories(updatedCategories);
  };

  const handleAddNewTag = (index: number) =>
  {
    if (!selectedTag)
    {
      return;
    }

    const newTag = {
      key: `new-tag-${tags.length}`,
      name: 'NEW',
      iconIndex: -1,
    } as OmniTag;

    const updatedTags = tags.toSpliced(index, 0, newTag);
    setTags(updatedTags);
  };

  const handleCloneTag = (index: number) =>
  {
    if (!selectedTag)
    {
      return;
    }

    const clonedTag = {
      key: `${selectedTag.key}-COPY`,
      name: selectedTag.name,
      iconIndex: selectedTag.iconIndex,
    } as OmniTag;

    const updatedTags = tags.toSpliced(index, 0, clonedTag);
    setTags(updatedTags);
  };

  const handleDeleteTag = (index: number) =>
  {
    if (!selectedTag)
    {
      return;
    }

    const affectedQuests = quests.filter(quest => quest.tagKeys.includes(selectedTag.key));
    if (affectedQuests.length > 0)
    {
      const errorMessage = `${affectedQuests.length} quests had this tag applied.`;
      handleSnack(errorMessage, MuiSnackbarSeverity.Warning);
    }

    const updatedTags = tags.toSpliced(index, 1);
    setTags(updatedTags);
  };

  //endregion updates

  //region render
  const renderQuestListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const omniQuest = quests.at(index);

    if (!omniQuest)
    {
      return <></>;
    }

    return <>
      <ListItem key={index} style={style}>
        <ListItemButton
          sx={{ maxHeight: '30px' }}
          selected={selectedQuestIndex === index}
          onClick={() => handleQuestListItemOnClickEvent(index)}
        >
          <ListItemIcon>
            {(selectedQuestIndex === index)
              ? <DoubleArrow color={'success'}/>
              : <KeyboardArrowRight color={'warning'}/>}
          </ListItemIcon>
          <ListItemText
            primary={`[${omniQuest.key}]: ${omniQuest.name}`}
            disableTypography
            sx={{ fontFamily: 'monospace' }}
          />
        </ListItemButton>
      </ListItem>
    </>;
  };

  const renderCategoryListItem = (
    category: OmniCategory,
    index: number
  ) =>
  {
    return <MenuItem
      key={`${category.key}-${index}`}
      value={category.key}
    >
      {`[${category.key}]: ${category.name}`}
    </MenuItem>;
  };

  const renderCategoryDialogListItem = (
    category: OmniCategory,
    index: number
  ) =>
  {
    const isSelected = selectedCategoryIndex === index;
    const icon = isSelected
      ? <DoubleArrow color={'success'}/>
      : <KeyboardArrowRight color={'warning'}/>;

    return <ListItem key={`${category.key}-${index}`}>
      <ListItemButton
        selected={isSelected}
        onClick={() => handleCategoryDialogListItemOnClickEvent(index)}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText
          primary={category.name}
          secondary={category.key}
        />
      </ListItemButton>
    </ListItem>;
  };

  const renderTagListItem = (
    tag: OmniTag,
    index: number
  ) =>
  {
    const isSelected = selectedTagIndex === index;
    const icon = isSelected
      ? <DoubleArrow color={'success'}/>
      : <KeyboardArrowRight color={'warning'}/>;

    return <ListItem key={`${tag.key}-${index}`}>
      <ListItemButton
        selected={isSelected}
        onClick={() => handleTagDialogListItemOnClickEvent(index)}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText
          primary={tag.name}
          secondary={tag.key}
        />
      </ListItemButton>
    </ListItem>;
  };

  const renderObjectiveListItem = (
    objective: OmniObjective,
    index: number
  ) =>
  {
    const icon = (selectedObjectiveIndex === index)
      ? <DoubleArrow color={'success'}/>
      : <KeyboardArrowRight color={'warning'}/>;

    return <ListItem key={`${objective.id}-${objective.description}-${index}`}>
      <ListItemButton
        selected={selectedObjectiveIndex === index}
        onClick={() => handleObjectiveListItemOnClickEvent(index)}
      >
        <ListItemIcon>{icon}</ListItemIcon>
        <ListItemText
          primary={index}
          sx={{ fontFamily: 'monospace' }}
          disableTypography
        />
      </ListItemButton>
    </ListItem>;
  };

  const renderObjectiveType = (
    objectiveTypeKey: string,
    index: number
  ) =>
  {
    return <MenuItem
      key={`${objectiveTypeKey}-${index}`}
      value={objectiveTypeKey}
    >
      {objectiveTypeKey}
    </MenuItem>;
  };
  //endregion render

  const { updateUrl } = useUrlSelection(
    'questKey',
    quests,
    (q) => q.key,
    selectedQuestIndex,
    (index) => handleQuestListItemOnClickEvent(index),
    (index) => listRef.current?.scrollToItem(index, 'smart')
  );

  if (loading)
  {
    return <Typography>Loading quests configuration…</Typography>;
  }

  return <>
    <Grid container spacing={2}>
      <Grid size={4}>
        <div
          onContextMenu={handleQuestListContextMenu}
          style={{ cursor: 'context-menu' }}
        >
          {/* @ts-ignore */}
          <FixedSizeList
            ref={listRef}
            height={1030}
            itemSize={30}
            overscanCount={5}
            itemCount={quests.length}
          >
            {renderQuestListItem}
          </FixedSizeList>
        </div>
      </Grid>

      <Grid size={8}>
        <Paper
          sx={{
            height: '100%',
            width: '100%',
            padding: 2
          }}
          elevation={10}
        >
          {(selectedQuest === null)
            ? <Typography>
              Please select a quest on the left.<br/>
              If there are no quests, then consider making one.
            </Typography>
            : <>
              <Grid container rowSpacing={3} columnSpacing={4}>
                {/* ROW 1 */}
                {/* key */}
                <Grid size={2}>
                  <KeyTextField
                    value={selectedQuest.key}
                    onChange={handleQuestKeyOnChangeEvent}
                  />
                </Grid>

                {/* name */}
                <Grid size={6}>
                  <TextField
                    variant={'filled'}
                    label={'Name'}
                    value={selectedQuest.name}
                    onChange={event => handleQuestNameOnChangeEvent(event.target.value)}
                    size={'small'}
                    fullWidth
                  />
                </Grid>

                {/* category */}
                <Grid size={3}>
                  <FormControl fullWidth>
                    <InputLabel>Quest Category</InputLabel>
                    <Select
                      value={selectedQuest.categoryKey}
                      label="Quest Category"
                      onChange={event => handleQuestCategoryOnChangeEvent(event.target.value)}
                    >
                      {categories.map((
                        category,
                        index
                      ) => renderCategoryListItem(category, index))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* category editor */}
                <Grid size={1}>
                  <IconButton
                    color={'success'}
                    onClick={() =>
                    {
                      const firstCategory = categories.at(0)!;
                      setSelectedCategory(firstCategory);
                      setSelectedCategoryIndex(0);
                      setCategoryDialogOpen(true);
                    }}
                  >
                    <Edit/>
                    <Category/>
                  </IconButton>
                </Grid>

                {/* ROW 2 */}
                {/* recommended level */}
                <Grid size={2}>
                  <TextField
                    type={'number'}
                    label={'Level'}
                    variant={'outlined'}
                    value={selectedQuest.recommendedLevel ?? -1}
                    onChange={(event) => handleQuestRecommendedLevelOnChangeEvent(parseInt(event.target.value) ?? -1)}
                    sx={{ width: '80px' }}
                  />
                </Grid>

                {/* horizontal spacer */}
                <Grid size={6}></Grid>

                {/* tags */}
                <Grid size={3}>
                  <Autocomplete
                    size={'small'}
                    options={[ ...tags ]}
                    disableCloseOnSelect
                    slotProps={{
                      listbox: {
                        sx: { maxHeight: '170px' }
                      }
                    }}
                    getOptionKey={(option) => option?.key ?? 'no-key'}
                    getOptionLabel={(option) => option?.name ?? ''}
                    renderOption={(
                      props,
                      option,
                      { index }
                    ) =>
                    {
                      if (option === null || option.name === '' || option.name.startsWith('=='))
                      {
                        return <li {...props} style={{ display: 'none' }}/>;
                      }

                      return (
                        <li {...props} key={props.key ?? option.key} style={{ height: 32 }}>
                          <ListItem disableGutters disablePadding sx={{ height: 32 }}>
                            <ListItemIcon sx={{ height: 32 }}>
                              <Checkbox
                                checked={applicableTags.includes(option.key)}
                                onChange={() => handleQuestTagToggle(option.key)}/>
                              <ListItemText
                                primary={`${option.key}: ${option.name}`}
                                disableTypography
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
                        label={'Choose Applicable Tags'}
                        placeholder="Tags..."/>);
                    }}
                  />
                </Grid>

                {/* tag editor */}
                <Grid size={1}>
                  <IconButton
                    color={'secondary'}
                    onClick={() =>
                    {
                      const firstTag = tags.at(0)!;
                      setSelectedTag(firstTag);
                      setSelectedTagIndex(0);
                      setTagDialogOpen(true);
                    }}
                  >
                    <Edit/>
                    <Style/>
                  </IconButton>
                </Grid>

                {/* ROW 3 */}
                {/* unknown hint */}
                <Grid size={12}>
                  <TextField
                    variant={'standard'}
                    label={'Unknown Hint'}
                    value={selectedQuest.unknownHint}
                    onChange={event => handleQuestUnknownHintOnChangeEvent(event.target.value)}
                    size={'small'}
                    fullWidth
                  />
                </Grid>

                {/* ROW 4 */}
                {/* description */}
                <Grid size={12}>
                  <TextField
                    variant={'outlined'}
                    label={'Overview'}
                    value={selectedQuest.overview}
                    onChange={event => handleQuestOverviewOnChangeEvent(event.target.value)}
                    size={'small'}
                    multiline
                    fullWidth
                    rows={8}
                  />
                </Grid>

                {/* ROW 5 */}
                {/* objective id list */}
                <Grid size={2}>
                  <div
                    onContextMenu={handleObjectiveListContextMenu}
                    style={{ cursor: 'context-menu' }}
                  >
                    <List dense>
                      {objectives.map(renderObjectiveListItem)}
                    </List>
                  </div>
                </Grid>

                {/* selected objective data */}
                <Grid size={10}>
                  <Grid container spacing={2}>
                    {/* objective type */}
                    <Grid size={4}>
                      <FormControl fullWidth>
                        <InputLabel>Objective Type</InputLabel>
                        <Select
                          value={selectedObjective?.type ?? OmniObjectiveType.Indiscriminate}
                          label="Objective Type"
                          onChange={event => handleObjectiveTypeOnChangeEvent(event.target.value)}
                        >
                          {Object.keys(OmniObjectiveType)
                            .map(renderObjectiveType)}
                        </Select>
                      </FormControl>
                    </Grid>

                    {/* objective toggles */}
                    <Grid size={8}>
                      <FormControlLabel
                        control={<Checkbox
                          checked={selectedObjective?.hiddenByDefault}
                          checkedIcon={<VisibilityOff color={'error'}/>}
                          icon={<Visibility color={'primary'}/>}
                          onChange={event => handleObjectiveHiddenByDefaultOnChangeEvent(event.target.checked)}
                        />}
                        label={selectedObjective?.hiddenByDefault
                          ? 'Hidden By Default'
                          : 'Visible by Default'}
                        labelPlacement={'end'}
                      />

                      <FormControlLabel
                        control={<Checkbox
                          checked={selectedObjective?.isOptional}
                          checkedIcon={<AddTask color={'success'}/>}
                          icon={<Block color={'error'}/>}
                          onChange={event => handleObjectiveIsOptionalOnChangeEvent(event.target.checked)}
                        />}
                        label={selectedObjective?.isOptional
                          ? 'Is Optional'
                          : 'Is Required'}
                        labelPlacement={'end'}
                      />
                    </Grid>

                    <Grid size={12}>
                      <TextField
                        variant={'filled'}
                        label={'Description'}
                        size={'small'}
                        fullWidth
                        value={selectedObjective?.description}
                        onChange={event => handleObjectiveDescriptionOnChangeEvent(event.target.value)}
                      />
                    </Grid>

                    {/* objective logs */}
                    <Grid size={12}>
                      <ObjectiveLogs
                        logs={selectedObjective?.logs}
                        updateObjectiveLogsFunc={handleObjectiveLogsOnChangeEvent}
                      />
                    </Grid>
                  </Grid>
                </Grid>

                {/* selected objective fulfillment */}
                <Grid size={10}>
                  <ObjectiveFulfillmentData
                    fulfillmentData={selectedObjective?.fulfillment}
                    fulfillmentType={selectedObjective?.type}
                    updateIndiscriminateFunc={handleObjectiveFulfillmentIndiscriminateOnChangeEvent}
                    updateDestinationFunc={handleObjectiveFulfillmentDestinationOnChangeEvent}
                    updateFetchFunc={handleObjectiveFulfillmentFetchOnChangeEvent}
                    updateSlayFunc={handleObjectiveFulfillmentSlayOnChangeEvent}
                    updateQuestFunc={handleObjectiveFulfillmentQuestOnChangeEvent}
                  />
                </Grid>

              </Grid>
            </>}
        </Paper>
      </Grid>
    </Grid>

    {/*region not-grid-related elements */}
    <SaveButton
      extraSaveText={'Quests'}
      canSave={!loading}
      handleSave={async () =>
      {
        await save({
          quests,
          tags,
          categories,
        } as Configuration);
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
      open={questListContextMenu !== null}
      onClose={() => setQuestListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={questListContextMenu !== null
        ? {
          top: questListContextMenu.mouseY,
          left: questListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewQuest(selectedQuestIndex + 1);
        setQuestListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneQuest(selectedQuestIndex + 1);
        setQuestListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeleteQuest(selectedQuestIndex);
        setQuestListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    <Menu
      open={objectiveListContextMenu !== null}
      onClose={() => setObjectiveListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={objectiveListContextMenu !== null
        ? {
          top: objectiveListContextMenu.mouseY,
          left: objectiveListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewObjective(selectedObjectiveIndex);
        setObjectiveListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewObjective(selectedObjectiveIndex + 1);
        setObjectiveListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneObjective(selectedObjectiveIndex);
        setObjectiveListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneObjective(selectedObjectiveIndex + 1);
        setObjectiveListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeleteObjective(selectedObjectiveIndex);
        setObjectiveListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    <Dialog
      open={categoryDialogOpen}
      onClose={() => setCategoryDialogOpen(false)}
      maxWidth={'md'}
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
                ) => renderCategoryDialogListItem(category, index))}
              </List>
            </div>
          </Grid>

          {/* category modification */}
          <Grid size={8}>
            <Stack spacing={4}>
              {/* Key */}
              <Tooltip title={'Modifying the key will require updating quests associated with this category.'}>
                <TextField
                  required
                  variant={'filled'}
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
              </Tooltip>


              {/* Name */}
              <TextField
                variant={'filled'}
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
                sx={{ width: '100px' }}
                onChange={(event) => handleCategoryIconIndexOnChangeEvent(parseInt(event.target.value) ?? -1)}
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
      onClose={() => setCategoryListContextMenu(null)}
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
        handleAddNewCategory(selectedCategoryIndex);
        setCategoryListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewCategory(selectedCategoryIndex + 1);
        setCategoryListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneCategory(selectedCategoryIndex);
        setCategoryListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneCategory(selectedCategoryIndex + 1);
        setCategoryListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeleteCategory(selectedCategoryIndex);
        setCategoryListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    <Dialog
      open={tagDialogOpen}
      onClose={() => setTagDialogOpen(false)}
      maxWidth={'md'}
      fullWidth
    >
      <DialogTitle>
        Tag Management
      </DialogTitle>
      <DialogContent>
        <Grid container rowSpacing={2} columnSpacing={2}>
          {/* list of tags */}
          <Grid size={4}>
            <div onContextMenu={handleTagListContextMenu} style={{ cursor: 'context-menu' }}>
              <List>
                {tags.map((
                  tag,
                  index
                ) => renderTagListItem(tag, index))}
              </List>
            </div>
          </Grid>

          {/* tag modification */}
          <Grid size={8}>
            <Stack spacing={4}>
              {/* Key */}
              <Tooltip title={'Modifying the key will require updating quests associated with this category.'}>
                <TextField
                  required
                  variant={'filled'}
                  label={'Key'}
                  value={selectedTag?.key}
                  onChange={handleTagKeyOnChangeEvent}
                  size={'small'}
                  slotProps={{
                    input: {
                      startAdornment: <InputAdornment position={'start'}>
                        <Key/>
                      </InputAdornment>
                    }
                  }}
                />
              </Tooltip>

              {/* Name */}
              <TextField
                variant={'filled'}
                label={'Name'}
                value={selectedTag?.name}
                onChange={handleTagNameOnChangeEvent}
                size={'small'}
              />

              {/* Icon */}
              <TextField
                type={'number'}
                label={'Icon Index'}
                value={selectedTag?.iconIndex ?? -1}
                sx={{ width: '100px' }}
                onChange={(event) => handleTagIconIndexOnChangeEvent(parseInt(event.target.value) ?? -1)}
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
          onClick={() => setTagDialogOpen(false)}
        >
          <Typography>Done Modifying Tags</Typography>
        </Button>
      </DialogActions>
    </Dialog>

    <Menu
      open={tagListContextMenu !== null}
      onClose={() => setTagListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={tagListContextMenu !== null
        ? {
          top: tagListContextMenu.mouseY,
          left: tagListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewTag(selectedTagIndex);
        setTagListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewTag(selectedTagIndex + 1);
        setTagListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleCloneTag(selectedTagIndex);
        setTagListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleCloneTag(selectedTagIndex + 1);
        setTagListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeleteTag(selectedTagIndex);
        setTagListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    {/*endregion not-grid-related elements */}
  </>;
};

export default QuestBoard;
