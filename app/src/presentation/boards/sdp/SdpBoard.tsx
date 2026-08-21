import { MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import { resolveSdpEffectiveRankUpParts } from '../../../constants/sdpRarityCostDefaults';
import { FixedSizeList } from 'react-window';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
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
  AddReaction,
  AllInclusive,
  ArrowDownward,
  ArrowUpward,
  AutoAwesome,
  AutoGraph,
  Check,
  Circle,
  ContentCopy,
  DeleteOutline,
  EmojiEvents,
  ExpandMore,
  Insights,
  KeyboardArrowRight,
  Lock,
  LockOpen,
  Numbers,
  Percent,
  PlayCircleFilled,
  Psychology,
  Quiz,
  Remove,
  ShowChart,
  SportsHandball,
  SportsKabaddi,
  StackedLineChart,
  SwitchAccessShortcut,
  TrendingFlat,
  WaterfallChart
} from '@mui/icons-material';
import { green, orange, purple } from '@mui/material/colors';
import { alpha } from '@mui/material/styles';
import { MuiSnackbarSeverity, MuiSnackbarVariant } from '@core/enums/MuiSnackbar.ts';

import { useBoardActions } from '@presentation/context/board-actions.context.tsx';
import KeyTextField from '../../../components/core/KeyTextField.tsx';

import { knownLongParams } from '../../../mappers/ParameterIdMapper.ts';
import {
  sdpRarityToMuiColor,
  sdpRarityMenuLabel,
  SDP_RARITY_VALUES
} from '@services/sdp/sdpPanelRarity.ts';
import { useSdps } from '@presentation/context/resources/sdps.context.tsx';
import { useSkills } from '@presentation/context/resources/skills.context.tsx';
import { BoardSectionCard } from '@presentation/components/board/BoardSectionCard.tsx';
import { IconIndexField } from '@presentation/components/icons/IconIndexField.tsx';
import { SdpRewardEffectEditor } from './SdpRewardEffectEditor.tsx';
import SdpSubgroupsSection from './SdpSubgroupsSection.tsx';
import SdpFamiliesSection from './SdpFamiliesSection.tsx';
import {
  createBlankSdpPanel,
  emptyPanelMastery,
  patchPanelIdentity,
  patchPanelMastery,
  patchPanelProgression,
} from '@services/sdp/sdpPanelShape.ts';
import {
  knownSdpRegistryParameterOptions,
  sdpParameterDisplayName,
} from '@services/sdp/sdpParameterKeys.ts';
import { parseRewardEffect, rawEffectSummary } from '@services/sdp/sdpRewardEffect.ts';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';
import EditorBoardSplitLayout from '@presentation/components/board/EditorBoardSplitLayout.tsx';
import {
  VirtualizedSidebarList,
  VirtualizedSidebarListRegion,
  virtualizedSidebarColumnWidth,
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
  VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT,
} from '@presentation/components/board/VirtualizedSidebarList.tsx';
import type { VirtualizedSidebarRow } from '@presentation/components/board/VirtualizedSidebarList.tsx';
import Panel = Sdp.StatDistributionPanel;
import PanelParameter = Sdp.SdpParameter;
import PanelReward = Sdp.SdpReward;

type RankMode = 'every' | 'mastery' | 'specific';

type BoardTab = 'panels' | 'subgroups' | 'families';

const rankModeFromRequired = (rankRequired: number): RankMode =>
{
  if (rankRequired === -1) return 'every';
  if (rankRequired === 0) return 'mastery';
  return 'specific';
};

const rankLabel = (rankRequired: number, maxRank: number): string =>
{
  if (rankRequired === -1) return 'every rank';
  if (rankRequired === 0) return `on max (${maxRank})`;
  return `rank ${rankRequired}`;
};

const deriveRewardName = (raw: string): string =>
{
  const effect = parseRewardEffect(raw);
  switch (effect.type)
  {
    case 'unlock-sdp-learner':
    case 'unlock-sdp-party':
      return `Unlock SDP: \\sdp[${effect.key}]`;
    case 'gain-item':
      return effect.count > 1
        ? `Gain Item: \\item[${effect.itemId}] x${effect.count}`
        : `Gain Item: \\item[${effect.itemId}]`;
    case 'gain-weapon':
      return effect.count > 1
        ? `Gain Weapon: \\weapon[${effect.weaponId}] x${effect.count}`
        : `Gain Weapon: \\weapon[${effect.weaponId}]`;
    case 'gain-armor':
      return effect.count > 1
        ? `Gain Armor: \\armor[${effect.armorId}] x${effect.count}`
        : `Gain Armor: \\armor[${effect.armorId}]`;
    case 'learn-skill':
      return `Learn Skill: \\skill[${effect.skillId}]`;
    case 'gain-exp':        return `+${effect.amount} EXP`;
    case 'gain-gold':       return `+${effect.amount} Gold`;
    case 'gain-ap':         return `+${effect.amount} AP`;
    case 'gain-sdp-points': return `+${effect.amount} SDP Points`;
    case 'custom':
    {
      const trimmed = effect.raw.trim();
      return trimmed.length === 0 ? '(custom)' : trimmed.slice(0, 40);
    }
  }
};

const SDP_MONO_CAP_CH = 80;

const stripRmmzEscapeCodes = (text: string) =>
{
  // remove common RMMZ escape codes so we can approximate visible character counts.
  return text
    .replace(/\\C\[\d+]/g, "")
    .replace(/\\FS\[\d+]/g, "")
    .replace(/\\I\[\d+]/g, "")
    .replace(/\\\*/g, "")
    .replace(/\\_/g, "");
};

const maxVisibleLineLength = (text: string) =>
{
  const normalized = stripRmmzEscapeCodes(text);
  return Math.max(
    ...normalized
      .split("\n")
      .map(l => l.length),
    0,
  );
};

const sdpBoardListColumnWidth = virtualizedSidebarColumnWidth(
  VIRTUALIZED_SIDEBAR_DEFAULT_ICON_ROW_PX,
  VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH,
);

const SdpBoard = () =>
{
  const {
    sdps,
    subgroups,
    families,
    setSdps,
    setSubgroups,
    setFamilies,
    loading,
    save,
    reload,
    config,
  } = useSdps();

  const { skills, byId: skillsById } = useSkills();

  const subgroupKeySet = useMemo(
    () => new Set(subgroups.map(subgroup => subgroup.key)),
    [ subgroups ]
  );


  //region state
  const listRef = useRef<FixedSizeList>(null);
  const listWrapperRef = useRef<HTMLDivElement>(null);

  const [ selectedPanel, setSelectedPanel ] = useState<Panel | null>(null);
  const [ selectedPanelIndex, setSelectedPanelIndex ] = useState<number>(0);
  const [ panelListContextMenu, setPanelListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ boardTab, setBoardTab ] = useState<BoardTab>('panels');
  const [ selectedSubgroupIndex, setSelectedSubgroupIndex ] = useState<number>(0);
  const [ selectedFamilyIndex, setSelectedFamilyIndex ] = useState<number>(0);


  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ manualAutoNameOff, setManualAutoNameOff ] = useState<Set<number>>(new Set());

  const [ rankupCostProjectionDialog, setRankupCostProjectionDialog ] = useState<boolean>(false);

  const [ cloneFromDialogOpen, setCloneFromDialogOpen ] = useState<boolean>(false);
  const [ cloneFromInsertIndex, setCloneFromInsertIndex ] = useState<number | null>(null);
  const [ cloneFromSelectedPanel, setCloneFromSelectedPanel ] = useState<Panel | null>(null);

  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);
  //endregion state

  const selectedMasterySubgroupKey = selectedPanel?.mastery.subgroupKey ?? '';
  const masterySubgroupKeyIsOrphan = selectedMasterySubgroupKey !== ''
    && subgroupKeySet.has(selectedMasterySubgroupKey) === false;
  const selectedMasterySubgroup = selectedMasterySubgroupKey === ''
    ? null
    : subgroups.find(subgroup => subgroup.key === selectedMasterySubgroupKey) ?? null;
  const selectedPanelFamily = selectedMasterySubgroupKey === ''
    ? null
    : families.find(family => family.subgroupKeys.includes(selectedMasterySubgroupKey)) ?? null;

  // the derived family field reads blank when no subgroup is chosen, and flags a subgroup that belongs to no family.
  let selectedPanelFamilyDisplay = '';
  if (selectedPanelFamily !== null)
  {
    selectedPanelFamilyDisplay = selectedPanelFamily.name
      ? `[${selectedPanelFamily.key}] ${selectedPanelFamily.name}`
      : selectedPanelFamily.key;
  }
  else if (selectedMasterySubgroupKey !== '')
  {
    selectedPanelFamilyDisplay = 'Unknown';
  }
  const masteryIsBlank = selectedPanel === null
    || (
      selectedPanel.mastery.subgroupKey === ''
      && selectedPanel.mastery.subgroupTier === 0
      && selectedPanel.mastery.masterySkillId === 0
    );

  //region setup
  /**
   * Initializes the board selection when data is loaded.
   */
  useEffect(() =>
  {
    const params = new URLSearchParams(window.location.search);
    if (sdps.length > 0 && !selectedPanel && !params.get('sdpKey'))
    {
      const firstPanel = sdps.at(0)!;
      syncSelectionWithPanel(firstPanel, 0);
    }
  }, [ sdps, selectedPanel ]);

  useEffect(() =>
  {
    if (sdps.length === 0 || selectedPanelIndex < 0)
    {
      return;
    }

    scrollListToIndex(selectedPanelIndex, 'smart');
  }, [ selectedPanelIndex, sdps.length ]);

  useEffect(() =>
  {
    setManualAutoNameOff(new Set());
  }, [ selectedPanel?.key ]);

  /**
   * Syncs the entire board state when a new panel is selected.
   * @param {Panel | null} panel The panel to select.
   * @param {number} index The index of the panel in the master list.
   */
  const syncSelectionWithPanel = (
    panel: Panel | null,
    index: number
  ) =>
  {
    setSelectedPanelIndex(index);
    setSelectedPanel(panel);
  };
  //endregion setup

  //region actions
  const handleSdpListItemOnClickEvent = (index: number) =>
  {
    const panel = sdps.at(index) ?? null;
    syncSelectionWithPanel(panel, index);
    if (panel)
    {
      updateUrl(panel);
    }
  };

  const { updateUrl } = useUrlSelection(
    'sdpKey',
    sdps,
    (p) => p.key,
    handleSdpListItemOnClickEvent,
    (index) => scrollListToIndex(index, 'smart')
  );

  const handleReloadButtonOnClickEvent = async () =>
  {
    await reload();
    handleSnack('SDP data has been reloaded successfully.', MuiSnackbarSeverity.Success);
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

  const handlePanelListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = panelListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setPanelListContextMenu(newContextMenuState);
  };

  const openCloneFromDialog = (insertIndex: number) =>
  {
    setCloneFromInsertIndex(insertIndex);
    setCloneFromSelectedPanel(null);
    setCloneFromDialogOpen(true);
  };

  const handleConfirmCloneFrom = () =>
  {
    if (cloneFromSelectedPanel === null)
    {
      return setCloneFromDialogOpen(false);
    }
    if (cloneFromInsertIndex === null)
    {
      return setCloneFromDialogOpen(false);
    }

    const clonedParameters = cloneFromSelectedPanel.panelParameters.toSpliced(0, 0);
    const clonedRewards = cloneFromSelectedPanel.panelRewards.toSpliced(0, 0);

    const clonedPanel = {
      ...cloneFromSelectedPanel,
      panelParameters: clonedParameters,
      panelRewards: clonedRewards,
    } as Panel;

    const updatedsdps = sdps.toSpliced(cloneFromInsertIndex, 0, clonedPanel);
    setSdps(updatedsdps);

    setCloneFromDialogOpen(false);
  };

  const handleSearchChange = (term: string) =>
  {
    setSearchTerm(term);

    if (term.trim() === '')
    {
      return;
    }

    // find the first non-header panel whose key or name matches
    const foundIndex = sdps.findIndex(panel =>
    {
      if (!panel)
      {
        return false;
      }

      const keyMatches = panel.key.toLowerCase()
        .includes(term.toLowerCase());
      const nameMatches = (
        panel.identity.name ?? ''
      )
        .toLowerCase()
        .includes(term.toLowerCase());

      return keyMatches || nameMatches;
    });

    if (foundIndex !== -1)
    {
      // scroll and select the item
      listRef.current?.scrollToItem(foundIndex, 'start');
      handleSdpListItemOnClickEvent(foundIndex);
    }
  };

  const scrollListToIndex = (
    index: number,
    align: 'auto' | 'smart' | 'center' | 'end' | 'start' = 'start'
  ) =>
  {
    const list = listRef.current;
    if (!list)
    {
      return;
    }

    // Try immediately (works when list is already laid out)
    try
    {
      list.scrollToItem(index, align);
    }
    catch
    {
      // ignore
    }

    // Try again on the next frame (after layout commit)
    requestAnimationFrame(() =>
    {
      listRef.current?.scrollToItem(index, align);
    });

    // Final fallback after microtasks
    setTimeout(() =>
    {
      listRef.current?.scrollToItem(index, align);
    }, 0);
  };
  //endregion actions

  //region validators
  const topFlavorMaxLine = selectedPanel
    ? maxVisibleLineLength(selectedPanel.identity.topFlavorText)
    : 0;
  const topFlavorTooLong = topFlavorMaxLine > SDP_MONO_CAP_CH;

  const descriptionMaxLine = selectedPanel
    ? maxVisibleLineLength(selectedPanel.identity.description)
    : 0;
  const descriptionTooLong = descriptionMaxLine > SDP_MONO_CAP_CH;
  //endregion validators

  //region updates
  /**
   * Centralized helper to apply updated panels to the context and enable saving.
   * @param {Panel[]} updatedPanels The updated list of SDP panels.
   */
  const applyPanels = (updatedPanels: Panel[]) =>
  {
    setSdps(updatedPanels);
    setCanSave(true);
  };

  const applySubgroups = (updatedSubgroups: Sdp.PanelSubgroup[]) =>
  {
    setSubgroups(updatedSubgroups);
    setCanSave(true);
  };

  const applyFamilies = (updatedFamilies: Sdp.PanelFamily[]) =>
  {
    setFamilies(updatedFamilies);
    setCanSave(true);
  };

  const handlePanelKeyChange = (input: string) =>
  {
    updatePanel({
      ...selectedPanel!,
      key: input,
    }, selectedPanelIndex);
  };

  const handlePanelNameChange = (input: string) =>
  {
    updatePanel(
      patchPanelIdentity(selectedPanel!, { name: input }),
      selectedPanelIndex
    );
  };

  const handlePanelIconIndexChange = (input: number) =>
  {
    updatePanel(
      patchPanelIdentity(selectedPanel!, { iconIndex: input }),
      selectedPanelIndex
    );
  };

  const handlePanelUnlockedByDefaultChange = (input: boolean) =>
  {
    updatePanel(
      patchPanelIdentity(selectedPanel!, { unlockedByDefault: input }),
      selectedPanelIndex
    );
  };

  const handlePanelRarityChange = (input: number) =>
  {
    updatePanel(
      patchPanelProgression(selectedPanel!, { rarity: input }),
      selectedPanelIndex
    );
  };

  const handlePanelMaxRankChange = (input: number) =>
  {
    updatePanel(
      patchPanelProgression(selectedPanel!, { maxRank: input }),
      selectedPanelIndex
    );
  };

  const handlePanelBaseCostChange = (input: number) =>
  {
    updatePanel(
      patchPanelProgression(selectedPanel!, { baseCost: input }),
      selectedPanelIndex
    );
  };

  const handlePanelFlatGrowthCostChange = (input: number) =>
  {
    updatePanel(
      patchPanelProgression(selectedPanel!, { flatGrowthCost: input }),
      selectedPanelIndex
    );
  };

  const handlePanelMultGrowthCostChange = (input: number) =>
  {
    updatePanel(
      patchPanelProgression(selectedPanel!, { multGrowthCost: input }),
      selectedPanelIndex
    );
  };

  const handlePanelTopFlavorTextChange = (input: string) =>
  {
    updatePanel(
      patchPanelIdentity(selectedPanel!, { topFlavorText: input }),
      selectedPanelIndex
    );
  };

  const handlePanelDescriptionChange = (input: string) =>
  {
    updatePanel(
      patchPanelIdentity(selectedPanel!, { description: input }),
      selectedPanelIndex
    );
  };

  const handlePanelMasterySubgroupKeyChange = (input: string) =>
  {
    updatePanel(
      patchPanelMastery(selectedPanel!, { subgroupKey: input }),
      selectedPanelIndex
    );
  };

  const handlePanelMasterySubgroupTierChange = (input: number) =>
  {
    updatePanel(
      patchPanelMastery(selectedPanel!, { subgroupTier: input }),
      selectedPanelIndex
    );
  };

  const handlePanelMasterySkillIdChange = (input: number) =>
  {
    updatePanel(
      patchPanelMastery(selectedPanel!, { masterySkillId: input }),
      selectedPanelIndex
    );
  };

  const handleClearPanelMastery = () =>
  {
    if (!selectedPanel)
    {
      return;
    }

    updatePanel(
      patchPanelMastery(selectedPanel, emptyPanelMastery()),
      selectedPanelIndex
    );
  };

  /**
   * Updates a specific parameter within the currently selected panel.
   * @param {PanelParameter} updatedParam The updated parameter data.
   * @param {number} index The index of the parameter in the panel's list.
   */
  const updatePanelParameters = (
    updatedParam: PanelParameter,
    index: number
  ) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const updatedParams = selectedPanel.panelParameters.with(index, updatedParam);

    updatePanel({
      ...selectedPanel,
      panelParameters: updatedParams,
    }, selectedPanelIndex);
  };

  /**
   * Updates a specific reward within the currently selected panel.
   * @param {PanelReward} updatedReward The updated reward data.
   * @param {number} index The index of the reward in the panel's list.
   */
  const updatePanelRewards = (
    updatedReward: PanelReward,
    index: number
  ) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const updatedRewards = selectedPanel.panelRewards.with(index, updatedReward);

    updatePanel({
      ...selectedPanel,
      panelRewards: updatedRewards,
    }, selectedPanelIndex);
  };

  /**
   * Updates the global SDP list and syncs local selection.
   * @param {Panel} updatedPanel The updated panel data.
   * @param {number} index The index of the panel in the master list.
   */
  const updatePanel = (
    updatedPanel: Panel,
    index: number
  ) =>
  {
    setSelectedPanel(updatedPanel);
    applyPanels(sdps.with(index, updatedPanel));
  };

  const handleAddNewPanel = (index: number | null) =>
  {
    const newPanel = createBlankSdpPanel(
      `NEO-${sdps.length}`,
      `New Panel # ${sdps.length}`
    );

    const updatedsdps = (index === null)
      ? [ newPanel ]
      : sdps.toSpliced(index, 0, newPanel);

    applyPanels(updatedsdps);
  };

  const handleClonePanel = (index: number) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const clonedParameters = selectedPanel.panelParameters.toSpliced(0, 0);
    const clonedRewards = selectedPanel.panelRewards.toSpliced(0, 0);
    const clonedPanel = {
      ...selectedPanel,
      panelParameters: clonedParameters,
      panelRewards: clonedRewards,
    } as Panel;

    const updatedsdps = sdps.toSpliced(index, 0, clonedPanel);
    applyPanels(updatedsdps);
  };

  const handleDeletePanel = (index: number) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const updatedsdps = sdps.toSpliced(index, 1);
    applyPanels(updatedsdps);
  };

  /**
   * Adds a new parameter to the currently selected panel.
   * @param {number | null} index The index to insert at, or null to start a new list.
   */
  const handleAddNewPanelParameter = (index: number | null) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const newParameter = {
      parameterKey: 'mhp',
      isCore: false,
      isFlat: true,
      perRank: 3,
    } as PanelParameter;

    const updatedParameters = (index === null)
      ? [ newParameter ]
      : selectedPanel.panelParameters.toSpliced(index, 0, newParameter);

    updatePanel({
      ...selectedPanel,
      panelParameters: updatedParameters,
    }, selectedPanelIndex);
  };

  const handleMoveParameter = (
    fromIdx: number,
    toIdx: number
  ) =>
  {
    if (!selectedPanel) return;
    if (toIdx < 0 || toIdx >= selectedPanel.panelParameters.length) return;
    const params = [...selectedPanel.panelParameters];
    const [moved] = params.splice(fromIdx, 1);
    params.splice(toIdx, 0, moved);
    updatePanel({ ...selectedPanel, panelParameters: params }, selectedPanelIndex);
  };

  /**
   * Clones an existing parameter within the selected panel.
   * @param {number} index The index to insert the clone at.
   * @param {PanelParameter} parameter The parameter to clone.
   */
  const handleClonePanelParameter = (
    index: number,
    parameter: PanelParameter
  ) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const clonedParameter = { ...parameter } as PanelParameter;

    const updatedParameters = selectedPanel.panelParameters.toSpliced(index, 0, clonedParameter);

    updatePanel({
      ...selectedPanel,
      panelParameters: updatedParameters,
    }, selectedPanelIndex);
  };

  /**
   * Deletes a parameter from the selected panel.
   * @param {number} index The index of the parameter to remove.
   */
  const handleDeletePanelParameter = (index: number) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const updatedParameters = selectedPanel.panelParameters.toSpliced(index, 1);

    updatePanel({
      ...selectedPanel,
      panelParameters: updatedParameters,
    }, selectedPanelIndex);
  };

  /**
   * Adds a new reward to the currently selected panel.
   * @param {number | null} index The index to insert at, or null to start a new list.
   */
  const handleAddNewPanelReward = (index: number | null) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const newReward = {
      rewardName: `REWARD # ${selectedPanel.panelRewards.length}`,
      rankRequired: 0,
      effect: ''
    } as PanelReward;

    const updatedRewards = (index === null)
      ? [ newReward ]
      : selectedPanel.panelRewards.toSpliced(index, 0, newReward);

    updatePanel({
      ...selectedPanel,
      panelRewards: updatedRewards,
    }, selectedPanelIndex);
  };

  const handleMoveReward = (
    fromIdx: number,
    toIdx: number
  ) =>
  {
    if (!selectedPanel) return;
    if (toIdx < 0 || toIdx >= selectedPanel.panelRewards.length) return;
    const rewards = [...selectedPanel.panelRewards];
    const [moved] = rewards.splice(fromIdx, 1);
    rewards.splice(toIdx, 0, moved);
    updatePanel({ ...selectedPanel, panelRewards: rewards }, selectedPanelIndex);
  };

  /**
   * Clones an existing reward within the selected panel.
   * @param {number} index The index to insert the clone at.
   * @param {PanelReward} reward The reward to clone.
   */
  const handleClonePanelReward = (
    index: number,
    reward: PanelReward
  ) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const clonedReward = { ...reward } as PanelReward;

    const updatedRewards = selectedPanel.panelRewards.toSpliced(index, 0, clonedReward);

    updatePanel({
      ...selectedPanel,
      panelRewards: updatedRewards,
    }, selectedPanelIndex);
  };

  /**
   * Deletes a reward from the selected panel.
   * @param {number} index The index of the reward to remove.
   */
  const handleDeletePanelReward = (index: number) =>
  {
    if (!selectedPanel)
    {
      return;
    }

    const updatedRewards = selectedPanel.panelRewards.toSpliced(index, 1);

    updatePanel({
      ...selectedPanel,
      panelRewards: updatedRewards,
    }, selectedPanelIndex);
  };
  //endregion updates


  //region render
  /**
   * Icons parallel **sdpRarityMenuLabel** ordering (Common..Godlike).
   *
   * @param rarityIndex `rarity` **0–5** from JSON.
   */
  const sdpRarityIcon = (rarityIndex: number) =>
  {
    const styles = {
      color: sdpRarityToMuiColor(rarityIndex)
    };
    switch (rarityIndex)
    {
      case 0:
        return <ShowChart sx={styles}/>;
      case 1:
        return <StackedLineChart sx={styles}/>;
      case 2:
        return <Insights sx={styles}/>;
      case 3:
        return <AutoGraph sx={styles}/>;
      case 4:
        return <SwitchAccessShortcut sx={styles}/>;
      case 5:
        return <AutoAwesome sx={styles}/>;
      default:
        console.warn(`sdpRarityIcon: unknown rarity index [ ${rarityIndex} ].`);
        return <Circle/>;
    }
  };

  /**
   * Row model for the virtualized SDP panel list (rarity-colored labels, {@link Panel.iconIndex} sprite, section borders).
   *
   * @param index Index in {@link sdps}.
   * @returns Spacer or sidebar row descriptor.
   */
  const getSdpSidebarRow = (index: number): VirtualizedSidebarRow =>
  {
    const sdp = sdps.at(index);
    if (!sdp)
    {
      return {
        type: 'spacer',
      };
    }

    const isHeader = sdp.key.endsWith('___');
    const next = sdps.at(index + 1);
    const isNextHeader = next !== undefined && next.key.endsWith('___');
    const nextHeaderColor = isNextHeader
      ? sdpRarityToMuiColor(next.progression.rarity)
      : undefined;

    const labelSx = {
      fontWeight: isHeader
        ? 'bold'
        : 'normal',
      color: sdpRarityToMuiColor(sdp.progression.rarity),
    };

    const listItemButtonSx = (
      isNextHeader && nextHeaderColor !== undefined
    )
      ? {
        borderBottom: `4px solid ${nextHeaderColor}`,
        '&.Mui-selected': {
          borderBottom: `3px solid ${nextHeaderColor}`,
        },
        position: 'relative' as const,
      }
      : {
        position: 'relative' as const,
      };

    return {
      type: 'item',
      label: `[${sdp.key}]: ${sdp.identity.name}`,
      title: `[${sdp.key}]: ${sdp.identity.name}`,
      iconIndex: sdp.identity.iconIndex,
      labelSx,
      listItemButtonSx,
    };
  };

  const renderSdpRarities = () =>
  {
    return SDP_RARITY_VALUES.map(rarityIndex =>
      <MenuItem
        key={rarityIndex}
        value={rarityIndex}
      >
        {sdpRarityIcon(rarityIndex)} {sdpRarityMenuLabel(rarityIndex)}
      </MenuItem>
    );
  };

  const fromParameterIdToIconElement = (
    parameterId: number,
    selected: boolean
  ) =>
  {
    if (parameterId <= 7)
    {
      return <SportsKabaddi
        sx={{
          color: selected
            ? green[ 800 ]
            : green[ 300 ]
        }}
      />;
    }
    else if (parameterId > 7 && parameterId <= 17)
    {
      return <Psychology
        sx={{
          color: selected
            ? purple[ 800 ]
            : purple[ 300 ]
        }}
      />;
    }
    else if (parameterId > 17 && parameterId <= 27)
    {
      return <AddReaction
        sx={{
          color: selected
            ? orange[ 800 ]
            : orange[ 300 ]
        }}
      />;
    }
    else
    {
      return <SportsHandball/>;
    }
  };

  const fromParameterKeyToIconElement = (
    parameterKey: string,
    selected: boolean
  ) =>
  {
    const known = knownLongParams().find(param => param.key === parameterKey);
    const longParamId = known?.longParamId ?? 0;
    return fromParameterIdToIconElement(longParamId, selected);
  };

  const fromParameterKeyToName = (parameterKey: string): string =>
  {
    const known = knownLongParams().find(param => param.key === parameterKey);
    if (known)
    {
      return known.name;
    }

    return sdpParameterDisplayName(parameterKey);
  };

  const mapParametersToSelectMenuItems = () =>
  {
    const parameterItems = [];
    const baseKeys = knownLongParams().filter(param => param.longParamId <= 7);
    const exKeys = knownLongParams().filter(param => param.longParamId >= 8 && param.longParamId <= 17);
    const spKeys = knownLongParams().filter(param => param.longParamId >= 18 && param.longParamId <= 27);
    const customKeys = knownLongParams().filter(param => param.longParamId >= 28 && param.longParamId <= 30);
    const registryKeys = knownSdpRegistryParameterOptions();

    parameterItems.push(<ListSubheader key={0}>Base Parameters</ListSubheader>);
    baseKeys.forEach(param =>
    {
      parameterItems.push(
        <MenuItem
          key={`base-${param.key}`}
          value={param.key}
        >
          {fromParameterKeyToIconElement(param.key, false)}
          {param.name}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={1}>Ex Parameters</ListSubheader>);
    exKeys.forEach(param =>
    {
      parameterItems.push(
        <MenuItem
          key={`ex-${param.key}`}
          value={param.key}
        >
          {fromParameterKeyToIconElement(param.key, false)}
          {param.name}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={2}>Sp Parameters</ListSubheader>);
    spKeys.forEach(param =>
    {
      parameterItems.push(
        <MenuItem
          key={`sp-${param.key}`}
          value={param.key}
        >
          {fromParameterKeyToIconElement(param.key, false)}
          {param.name}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={3}>Custom Parameters</ListSubheader>);
    customKeys.forEach(param =>
    {
      parameterItems.push(
        <MenuItem
          key={`custom-${param.key}`}
          value={param.key}
        >
          {fromParameterKeyToIconElement(param.key, false)}
          {param.name}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={4}>Registry Parameters</ListSubheader>);
    registryKeys.forEach(param =>
    {
      parameterItems.push(
        <MenuItem
          key={`registry-${param.key}`}
          value={param.key}
        >
          {fromParameterKeyToIconElement(param.key, false)}
          {param.name}
        </MenuItem>
      );
    });

    return parameterItems;
  };

  const renderCostProjection = () =>
  {
    if (!selectedPanel)
    {
      return <>No panel selected to project costs for.</>;
    }

    const projections = [];

    const {
      baseCost,
      multGrowthCost,
      flatGrowthCost,
      maxRank,
      rarity
    } = selectedPanel.progression;
    const parts = resolveSdpEffectiveRankUpParts(rarity, baseCost, flatGrowthCost, multGrowthCost);
    let accumulatedCost = 0;

    for (let rank = 1; rank <= maxRank; rank++)
    {
      // Match J-SDP v3 rankUpCost: rarity defaults + panel offsets, then base + floor(flat * mult^rank).
      const growth = Math.floor(parts.flatGrowthCost * (parts.multGrowthCost ** rank));
      const nextLevelCost = parts.baseCost + growth;

      accumulatedCost += nextLevelCost;

      const primaryText = <Typography variant={'body1'}>
        {`Rank: ${rank}`}
      </Typography>;

      const secondaryText = <Typography variant={'body2'}>
        {`Next Level: ${nextLevelCost}`}<br/>
        {`Cumulative Total: ${accumulatedCost}`}
      </Typography>;

      projections.push(
        <ListItem key={rank}>
          <ListItemText
            primary={primaryText}
            secondary={secondaryText}
            disableTypography
          />
        </ListItem>);
    }

    return projections;
  };

  const projectTotalCost = () =>
  {
    if (!selectedPanel)
    {
      return 0;
    }

    const {
      baseCost,
      multGrowthCost,
      flatGrowthCost,
      maxRank,
      rarity
    } = selectedPanel.progression;
    const parts = resolveSdpEffectiveRankUpParts(rarity, baseCost, flatGrowthCost, multGrowthCost);
    let accumulatedCost = 0;

    for (let rank = 1; rank <= maxRank; rank++)
    {
      const growth = Math.floor(parts.flatGrowthCost * (parts.multGrowthCost ** rank));
      accumulatedCost += parts.baseCost + growth;
    }

    return accumulatedCost;
  };
  //endregion render

  useBoardActions({
    onSave: async () =>
    {
      if (!config)
      {
        return;
      }

      setCanSave(false);
      const resolvedSdps = sdps.map(panel => ({
        ...panel,
        panelRewards: panel.panelRewards.map(reward =>
          reward.rewardName === ''
            ? { ...reward, rewardName: deriveRewardName(reward.effect) }
            : reward
        ),
      }));
      await save({
        ...config,
        sdps: resolvedSdps,
        subgroups,
        families,
      });
      handleSnack('SDP data has been saved successfully.', MuiSnackbarSeverity.Success);
    },
    canSave: canSave && !loading,
    onReload: handleReloadButtonOnClickEvent,
    canReload: !loading,
  });

  /**
   * One parameter row on the panel: what it boosts, whether it is the panel's core stat, whether the
   * boost is flat or a percentage, and how much of it each rank buys.
   *
   * @param parameter The parameter being drawn.
   * @param idx Its position in the panel, which the reorder and delete actions address it by.
   */
  const renderPanelParameterRow = (
    parameter: Sdp.SdpParameter,
    idx: number
  ) =>
  {
    if (selectedPanel === null)
    {
      return <></>;
    }

    const isPositive = parameter.perRank > 0;
    const pct = parameter.isFlat
      ? ''
      : '%';
    const sign = isPositive
      ? '+'
      : '';
    const perRankText = `${sign}${parameter.perRank}${pct} / rank`;
    const totalText = `${sign}${parameter.perRank * selectedPanel.progression.maxRank}${pct} total`;

    return (
      <Accordion
        key={idx}
        disableGutters
        sx={{
          border: '1px solid',
          borderColor: parameter.isCore
            ? 'warning.dark'
            : 'divider',
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary expandIcon={<ExpandMore/>}>
          <Stack
            direction={'row'}
            alignItems={'center'}
            justifyContent={'space-between'}
            sx={{ flex: 1, mr: 1 }}
          >
            <Stack direction={'row'} alignItems={'center'} spacing={1}>
              {fromParameterKeyToIconElement(parameter.parameterKey, parameter.isCore)}
              <Stack>
                <Stack direction={'row'} alignItems={'center'} spacing={0.5}>
                  <Typography variant={'body2'}>
                    {fromParameterKeyToName(parameter.parameterKey)}
                  </Typography>
                  {parameter.isCore && (
                    <PlayCircleFilled sx={{ fontSize: 14, color: 'warning.main' }}/>
                  )}
                </Stack>
                <Typography variant={'caption'} color={'text.secondary'}>
                  {perRankText} — {totalText}
                </Typography>
              </Stack>
            </Stack>
            <Stack direction={'row'} spacing={0.5}>
              <IconButton
                size={'small'}
                disabled={idx === 0}
                onClick={e =>
                {
                  e.stopPropagation();
                  handleMoveParameter(idx, idx - 1);
                }}
              >
                <ArrowUpward fontSize={'small'}/>
              </IconButton>
              <IconButton
                size={'small'}
                disabled={idx === selectedPanel.panelParameters.length - 1}
                onClick={e =>
                {
                  e.stopPropagation();
                  handleMoveParameter(idx, idx + 1);
                }}
              >
                <ArrowDownward fontSize={'small'}/>
              </IconButton>
              <IconButton
                size={'small'}
                onClick={e =>
                {
                  e.stopPropagation();
                  handleClonePanelParameter(idx + 1, parameter);
                }}
              >
                <ContentCopy fontSize={'small'}/>
              </IconButton>
              <IconButton
                size={'small'}
                onClick={e =>
                {
                  e.stopPropagation();
                  handleDeletePanelParameter(idx);
                }}
              >
                <DeleteOutline fontSize={'small'}/>
              </IconButton>
            </Stack>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.5}>
            <FormControl size={'small'} fullWidth>
              <InputLabel id={`sdp-param-type-label-${idx}`}>Parameter Type</InputLabel>
              <Select
                labelId={`sdp-param-type-label-${idx}`}
                label={'Parameter Type'}
                value={parameter.parameterKey}
                onChange={event => updatePanelParameters(
                  { ...parameter, parameterKey: event.target.value.toString() },
                  idx
                )}
              >
                {mapParametersToSelectMenuItems()}
              </Select>
            </FormControl>
            <Stack direction={'row'} spacing={1.5} flexWrap={'wrap'} useFlexGap>
              <ToggleButtonGroup
                exclusive
                size={'small'}
                value={parameter.isCore
                  ? 'core'
                  : 'standard'}
                onChange={(_e, val: string | null) =>
                {
                  if (!val) return;
                  updatePanelParameters({ ...parameter, isCore: val === 'core' }, idx);
                }}
              >
                <ToggleButton
                  value={'standard'}
                  sx={(theme) => ({
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.info.main, 0.16),
                      borderColor: theme.palette.info.main,
                      color: theme.palette.info.main,
                      '&:hover': { backgroundColor: alpha(theme.palette.info.main, 0.24) },
                    },
                  })}
                >
                  <KeyboardArrowRight fontSize={'small'} sx={{ mr: 0.75 }}/>
                  Standard
                </ToggleButton>
                <ToggleButton
                  value={'core'}
                  sx={(theme) => ({
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.warning.main, 0.16),
                      borderColor: theme.palette.warning.main,
                      color: theme.palette.warning.main,
                      '&:hover': { backgroundColor: alpha(theme.palette.warning.main, 0.24) },
                    },
                  })}
                >
                  <PlayCircleFilled fontSize={'small'} sx={{ mr: 0.75 }}/>
                  Core
                </ToggleButton>
              </ToggleButtonGroup>
              <ToggleButtonGroup
                exclusive
                size={'small'}
                value={parameter.isFlat
                  ? 'flat'
                  : 'percent'}
                onChange={(_e, val: string | null) =>
                {
                  if (!val) return;
                  updatePanelParameters({ ...parameter, isFlat: val === 'flat' }, idx);
                }}
              >
                <ToggleButton
                  value={'flat'}
                  sx={(theme) => ({
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.success.main, 0.16),
                      borderColor: theme.palette.success.main,
                      color: theme.palette.success.main,
                      '&:hover': { backgroundColor: alpha(theme.palette.success.main, 0.24) },
                    },
                  })}
                >
                  <TrendingFlat fontSize={'small'} sx={{ mr: 0.75 }}/>
                  Flat
                </ToggleButton>
                <ToggleButton
                  value={'percent'}
                  sx={(theme) => ({
                    '&.Mui-selected': {
                      backgroundColor: alpha(theme.palette.secondary.main, 0.16),
                      borderColor: theme.palette.secondary.main,
                      color: theme.palette.secondary.main,
                      '&:hover': { backgroundColor: alpha(theme.palette.secondary.main, 0.24) },
                    },
                  })}
                >
                  <Percent fontSize={'small'} sx={{ mr: 0.75 }}/>
                  % Growth
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
            <TextField
              type={'number'}
              label={'Per Rank'}
              variant={'outlined'}
              size={'small'}
              value={parameter.perRank}
              onChange={event => updatePanelParameters(
                { ...parameter, perRank: parseFloat(event.target.value) || 0.01 },
                idx
              )}
              slotProps={{ htmlInput: { step: '0.1' } }}
              sx={{ width: '120px' }}
            />
          </Stack>
        </AccordionDetails>
      </Accordion>
    );
  };

  /**
   * The panel list and its search box. With no panels loaded at all the list is replaced by the button
   * that creates the first one, since an empty virtualized list gives an author nothing to act on.
   */
  const renderPanelSidebar = () =>
  {
    return (
      <>
        {/* Search bar for SDPs */}
        <TextField
          variant={'outlined'}
          label={'Search SDP'}
          value={searchTerm}
          onChange={(event) => handleSearchChange(event.target.value)}
          size={'small'}
          fullWidth
          sx={{
            marginTop: 1,
            marginBottom: 1
          }}
          slotProps={{
            input: {
              endAdornment: searchTerm
                ? (
                  <Tooltip title={'Clear search'}>
                    <Box
                      component={'span'}
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
        <VirtualizedSidebarListRegion onContextMenu={handlePanelListContextMenu}>
          {sdps.length > 0
            ? (
              <VirtualizedSidebarList
                ref={listRef}
                itemCount={sdps.length}
                itemSize={VIRTUALIZED_SIDEBAR_DEFAULT_ITEM_SIZE}
                fillContainer
                listHeight={VIRTUALIZED_SIDEBAR_DEFAULT_LIST_HEIGHT}
                labelMinCh={VIRTUALIZED_SIDEBAR_DEFAULT_LABEL_MIN_CH}
                selectedIndex={selectedPanelIndex}
                getRow={getSdpSidebarRow}
                onSelectIndex={(index) =>
                {
                  handleSdpListItemOnClickEvent(index);
                }}
                listWrapperRef={listWrapperRef}
              />
            )
            : (
              <Button
                fullWidth
                startIcon={<Add/>}
                onClick={() => handleAddNewPanel(null)}
                variant={'contained'}
              />
            )}
        </VirtualizedSidebarListRegion>
      </>
    );
  };

  /**
   * The panel's own identity: what it is called, what it looks like, and the two blocks of flavor text
   * the game renders in a fixed-width font. Both text fields warn when a line outruns that width,
   * because the game clips rather than wraps.
   */
  const renderPanelIdentitySection = () =>
  {
    if (selectedPanel === null)
    {
      return <></>;
    }

    const { identity } = selectedPanel;

    return (
      <BoardSectionCard title={'Identity'}>
        <Grid container spacing={1.5} alignItems={'center'}>
          <Grid size={3}>
            <KeyTextField
              value={selectedPanel.key}
              onChange={handlePanelKeyChange}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              variant={'outlined'}
              label={'Name'}
              value={identity.name}
              onChange={event => handlePanelNameChange(event.target.value)}
              size={'small'}
              fullWidth
            />
          </Grid>
          <Grid size={3}>
            <FormControlLabel
              control={
                <Switch
                  size={'small'}
                  checked={identity.unlockedByDefault}
                  onChange={event => handlePanelUnlockedByDefaultChange(event.target.checked)}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {identity.unlockedByDefault
                    ? <LockOpen color={'success'} fontSize={'small'}/>
                    : <Lock color={'error'} fontSize={'small'}/>}
                  <Typography variant={'body2'}>
                    {identity.unlockedByDefault
                      ? 'Unlocked'
                      : 'Locked'}
                  </Typography>
                </Box>
              }
            />
          </Grid>
          <Grid size={5}>
            <IconIndexField
              value={identity.iconIndex}
              onChange={handlePanelIconIndexChange}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              size={'small'}
              variant={'outlined'}
              label={'Top Flavor Text'}
              value={identity.topFlavorText}
              onChange={event => handlePanelTopFlavorTextChange(event.target.value)}
              error={topFlavorTooLong}
              helperText={topFlavorTooLong
                ? `Longest line ~${topFlavorMaxLine} chars (cap ~${SDP_MONO_CAP_CH} @ fontSize 24).`
                : undefined}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              size={'small'}
              variant={'outlined'}
              label={'Description'}
              multiline
              rows={4}
              value={identity.description}
              onChange={event => handlePanelDescriptionChange(event.target.value)}
              error={descriptionTooLong}
              helperText={descriptionTooLong
                ? `Longest line ~${descriptionMaxLine} chars (cap ~${SDP_MONO_CAP_CH} @ fontSize 24).`
                : undefined}
            />
          </Grid>
        </Grid>
      </BoardSectionCard>
    );
  };

  if (loading)
  {
    return (
      <Box sx={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        p: 2,
      }}>
        <Typography>Loading SDP configuration...</Typography>
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
      <Tabs
        value={boardTab}
        onChange={(_, value: BoardTab) => setBoardTab(value)}
        sx={{ px: 2, pt: 1, flexShrink: 0 }}
      >
        <Tab label={'Panels'} value={'panels'}/>
        <Tab label={'Subgroups'} value={'subgroups'}/>
        <Tab label={'Families'} value={'families'}/>
      </Tabs>
      {/* one block per tab; BoardTab has exactly these three values, so exactly one renders. */}
      {boardTab === 'subgroups' && (
        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          p: 2,
        }}>
          <SdpSubgroupsSection
            subgroups={subgroups}
            selectedIndex={selectedSubgroupIndex}
            onSelectIndex={setSelectedSubgroupIndex}
            onChange={applySubgroups}
          />
        </Box>
      )}
      {boardTab === 'families' && (
        <Box sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          p: 2,
        }}>
          <SdpFamiliesSection
            families={families}
            subgroups={subgroups}
            selectedIndex={selectedFamilyIndex}
            onSelectIndex={setSelectedFamilyIndex}
            onChange={applyFamilies}
          />
        </Box>
      )}
      {boardTab === 'panels' && (
      <EditorBoardSplitLayout
        sidebarColumnWidth={sdpBoardListColumnWidth}
        sidebar={renderPanelSidebar()}
      >
          {(
            selectedPanel === null
          )
            ? <Typography>
              Please select a panel on the left.<br/>
              If there are no sdps then consider making one.
            </Typography>
            : <>
              <Grid container columnSpacing={2}>
                {/* Left column: Identity + Parameters */}
                <Grid size={6}>
                  <Stack spacing={2}>
                    {renderPanelIdentitySection()}

                    <BoardSectionCard title={'Parameters'}>
                      <Stack spacing={1}>
                        <Button
                          fullWidth
                          startIcon={<Add/>}
                          variant={'outlined'}
                          onClick={() => handleAddNewPanelParameter(0)}
                        >
                          Add Parameter
                        </Button>
                        {selectedPanel.panelParameters.map(renderPanelParameterRow)}
                      </Stack>
                    </BoardSectionCard>
                  </Stack>
                </Grid>

                {/* Right column: Rank-Up Cost + Rank Rewards */}
                <Grid size={6}>
                  <Stack spacing={2}>
                    <BoardSectionCard title={'Progression'}>
                      <Grid container spacing={1.5} alignItems={'center'}>
                        <Grid size={4}>
                          <FormControl size={'small'} fullWidth>
                            <InputLabel id={'sdp-rarity-label'}>Rarity</InputLabel>
                            <Select
                              labelId={'sdp-rarity-label'}
                              label={'Rarity'}
                              value={selectedPanel.progression.rarity}
                              onChange={event => handlePanelRarityChange(parseInt(event.target.value.toString()))}
                            >
                              {renderSdpRarities()}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            type={'number'}
                            label={'Max Rank'}
                            variant={'outlined'}
                            size={'small'}
                            fullWidth
                            value={selectedPanel.progression.maxRank}
                            onChange={event => handlePanelMaxRankChange(parseInt(event.target.value) ?? 1)}
                          />
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            type={'number'}
                            label={'Base offset'}
                            variant={'outlined'}
                            size={'small'}
                            fullWidth
                            value={selectedPanel.progression.baseCost}
                            onChange={event => handlePanelBaseCostChange(parseInt(event.target.value) ?? 0)}
                          />
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            type={'number'}
                            label={'Flat offset'}
                            variant={'outlined'}
                            size={'small'}
                            fullWidth
                            value={selectedPanel.progression.flatGrowthCost}
                            onChange={event => handlePanelFlatGrowthCostChange(parseInt(event.target.value) ?? 0)}
                          />
                        </Grid>
                        <Grid size={4}>
                          <TextField
                            type={'number'}
                            label={'Mult scale'}
                            variant={'outlined'}
                            size={'small'}
                            fullWidth
                            value={selectedPanel.progression.multGrowthCost}
                            onChange={event => handlePanelMultGrowthCostChange(parseFloat(event.target.value) ?? 0.01)}
                            slotProps={{ htmlInput: { min: '0.01', step: '0.01' } }}
                          />
                        </Grid>
                        <Grid size={6}>
                          <Typography variant={'body1'}>
                            Total Cost to Master:<br/> <strong>{projectTotalCost()}</strong>
                          </Typography>
                        </Grid>
                        <Grid size={6}>
                          <Button
                            color={'info'}
                            variant={'outlined'}
                            startIcon={<span><WaterfallChart color={'secondary'}/><Quiz color={'success'}/></span>}
                            onClick={() => setRankupCostProjectionDialog(true)}
                          >
                            <Typography variant={'body2'}>
                              Cost Per Level Projections
                            </Typography>
                          </Button>
                        </Grid>
                      </Grid>
                    </BoardSectionCard>

                    <BoardSectionCard
                      title={'Mastery'}
                      actions={
                        <Button
                          size={'small'}
                          variant={'outlined'}
                          disabled={masteryIsBlank}
                          onClick={handleClearPanelMastery}
                        >
                          Clear
                        </Button>
                      }
                    >
                      <Stack
                        direction={'row'}
                        spacing={1.5}
                        alignItems={'flex-start'}
                        useFlexGap
                        flexWrap={'wrap'}
                      >
                        <Box sx={{ flex: '2 1 220px', minWidth: 0 }}>
                          <Autocomplete
                            size={'small'}
                            fullWidth
                            disabled={subgroups.length === 0}
                            options={subgroups}
                            getOptionLabel={(subgroup) =>
                              subgroup.name
                                ? `[${subgroup.key}] ${subgroup.name}`
                                : subgroup.key}
                            isOptionEqualToValue={(left, right) => left.key === right.key}
                            value={selectedMasterySubgroup}
                            onChange={(_, subgroup) =>
                            {
                              handlePanelMasterySubgroupKeyChange(subgroup?.key ?? '');
                            }}
                            renderInput={(params) =>
                              <TextField
                                {...params}
                                fullWidth
                                label={'Subgroup'}
                                error={masterySubgroupKeyIsOrphan}
                                helperText={
                                  masterySubgroupKeyIsOrphan
                                    ? `Unknown subgroup [${selectedMasterySubgroupKey}].`
                                    : undefined
                                }
                              />}
                          />
                        </Box>
                        <Box sx={{ flex: '2 1 220px', minWidth: 0 }}>
                          <TextField
                            fullWidth
                            size={'small'}
                            label={'Family (derived)'}
                            value={selectedPanelFamilyDisplay}
                            slotProps={{ input: { readOnly: true } }}
                            helperText={'Set on the Families tab via subgroup membership.'}
                          />
                        </Box>
                        <Box sx={{ flex: '0 0 88px' }}>
                          <TextField
                            type={'number'}
                            label={'Tier'}
                            variant={'outlined'}
                            size={'small'}
                            fullWidth
                            value={selectedPanel.mastery.subgroupTier}
                            onChange={event => handlePanelMasterySubgroupTierChange(
                              Math.max(0, parseInt(event.target.value, 10) || 0)
                            )}
                            slotProps={{ htmlInput: { min: '0', step: '1' } }}
                          />
                        </Box>
                        <Box sx={{ flex: '2 1 220px', minWidth: 0 }}>
                          <Autocomplete
                            size={'small'}
                            fullWidth
                            options={skills}
                            getOptionLabel={(skill) => `${skill.id}: ${skill.name}`}
                            value={skillsById.get(selectedPanel.mastery.masterySkillId) ?? null}
                            onChange={(_, skill) =>
                            {
                              handlePanelMasterySkillIdChange(skill?.id ?? 0);
                            }}
                            renderInput={(params) =>
                              <TextField
                                {...params}
                                fullWidth
                                label={'Mastery Skill'}
                              />}
                          />
                        </Box>
                      </Stack>
                    </BoardSectionCard>

                    <BoardSectionCard title={'Rank Rewards'}>
                      <Stack spacing={1}>
                        <Button
                          fullWidth
                          startIcon={<Add/>}
                          variant={'outlined'}
                          onClick={() => handleAddNewPanelReward(0)}
                        >
                          Add Reward
                        </Button>
                        {selectedPanel.panelRewards.map((reward, idx) =>
                        {
                          const rewardRankLabel = rankLabel(reward.rankRequired, selectedPanel.progression.maxRank);
                          const derivedName = deriveRewardName(reward.effect);
                          const isAutoName = !manualAutoNameOff.has(idx)
                            && (reward.rewardName === '' || reward.rewardName === derivedName);
                          return (
                            <Accordion
                              key={idx}
                              disableGutters
                              sx={{
                                border: '1px solid',
                                borderColor: 'divider',
                                '&:before': { display: 'none' },
                              }}
                            >
                              <AccordionSummary expandIcon={<ExpandMore/>}>
                                <Stack
                                  direction={'row'}
                                  alignItems={'center'}
                                  justifyContent={'space-between'}
                                  sx={{ flex: 1, mr: 1 }}
                                >
                                  <Stack>
                                    <Typography variant={'body2'}>
                                      {isAutoName ? derivedName : reward.rewardName}
                                    </Typography>
                                    <Typography variant={'caption'} color={'text.secondary'}>
                                      {rewardRankLabel} — {rawEffectSummary(reward.effect)}
                                    </Typography>
                                  </Stack>
                                  <Stack direction={'row'} spacing={0.5}>
                                    <IconButton
                                      size={'small'}
                                      disabled={idx === 0}
                                      onClick={e =>
                                      {
                                        e.stopPropagation();
                                        handleMoveReward(idx, idx - 1);
                                      }}
                                    >
                                      <ArrowUpward fontSize={'small'}/>
                                    </IconButton>
                                    <IconButton
                                      size={'small'}
                                      disabled={idx === selectedPanel.panelRewards.length - 1}
                                      onClick={e =>
                                      {
                                        e.stopPropagation();
                                        handleMoveReward(idx, idx + 1);
                                      }}
                                    >
                                      <ArrowDownward fontSize={'small'}/>
                                    </IconButton>
                                    <IconButton
                                      size={'small'}
                                      onClick={e =>
                                      {
                                        e.stopPropagation();
                                        handleClonePanelReward(idx + 1, reward);
                                      }}
                                    >
                                      <ContentCopy fontSize={'small'}/>
                                    </IconButton>
                                    <IconButton
                                      size={'small'}
                                      onClick={e =>
                                      {
                                        e.stopPropagation();
                                        handleDeletePanelReward(idx);
                                      }}
                                    >
                                      <DeleteOutline fontSize={'small'}/>
                                    </IconButton>
                                  </Stack>
                                </Stack>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Stack spacing={1.5}>
                                  <Stack direction={'row'} spacing={1.5} alignItems={'center'} flexWrap={'wrap'} useFlexGap>
                                    <ToggleButtonGroup
                                      exclusive
                                      size={'small'}
                                      value={rankModeFromRequired(reward.rankRequired)}
                                      onChange={(_e, mode: string | null) =>
                                      {
                                        if (!mode) return;
                                        if (mode === 'every') updatePanelRewards({ ...reward, rankRequired: -1 }, idx);
                                        else if (mode === 'mastery') updatePanelRewards({ ...reward, rankRequired: 0 }, idx);
                                        else updatePanelRewards({ ...reward, rankRequired: reward.rankRequired >= 1 ? reward.rankRequired : 1 }, idx);
                                      }}
                                    >
                                      <ToggleButton
                                        value={'every'}
                                        sx={(theme) => ({
                                          '&.Mui-selected': {
                                            backgroundColor: alpha(theme.palette.info.main, 0.16),
                                            borderColor: theme.palette.info.main,
                                            color: theme.palette.info.main,
                                            '&:hover': { backgroundColor: alpha(theme.palette.info.main, 0.24) },
                                          },
                                        })}
                                      >
                                        <AllInclusive fontSize={'small'} sx={{ mr: 0.75 }}/>
                                        Every Rank
                                      </ToggleButton>
                                      <ToggleButton
                                        value={'mastery'}
                                        sx={(theme) => ({
                                          '&.Mui-selected': {
                                            backgroundColor: alpha(theme.palette.warning.main, 0.16),
                                            borderColor: theme.palette.warning.main,
                                            color: theme.palette.warning.main,
                                            '&:hover': { backgroundColor: alpha(theme.palette.warning.main, 0.24) },
                                          },
                                        })}
                                      >
                                        <EmojiEvents fontSize={'small'} sx={{ mr: 0.75 }}/>
                                        Upon Mastery
                                      </ToggleButton>
                                      <ToggleButton
                                        value={'specific'}
                                        sx={(theme) => ({
                                          '&.Mui-selected': {
                                            backgroundColor: alpha(theme.palette.secondary.main, 0.16),
                                            borderColor: theme.palette.secondary.main,
                                            color: theme.palette.secondary.main,
                                            '&:hover': { backgroundColor: alpha(theme.palette.secondary.main, 0.24) },
                                          },
                                        })}
                                      >
                                        <Numbers fontSize={'small'} sx={{ mr: 0.75 }}/>
                                        Specific Rank
                                      </ToggleButton>
                                    </ToggleButtonGroup>
                                    {reward.rankRequired >= 1 && (
                                      <TextField
                                        type={'number'}
                                        label={'Rank #'}
                                        variant={'outlined'}
                                        size={'small'}
                                        value={reward.rankRequired}
                                        onChange={event => updatePanelRewards(
                                          { ...reward, rankRequired: Math.max(1, parseInt(event.target.value, 10) || 1) },
                                          idx
                                        )}
                                        slotProps={{ htmlInput: { min: '1', step: '1' } }}
                                        sx={{ width: 100 }}
                                      />
                                    )}
                                  </Stack>
                                  <Stack direction={'row'} spacing={1} alignItems={'center'}>
                                    <TextField
                                      label={'Reward Name'}
                                      variant={'outlined'}
                                      size={'small'}
                                      sx={{ flex: 1 }}
                                      disabled={isAutoName}
                                      value={isAutoName ? derivedName : reward.rewardName}
                                      onChange={event => updatePanelRewards(
                                        { ...reward, rewardName: event.target.value },
                                        idx
                                      )}
                                    />
                                    <FormControlLabel
                                      control={
                                        <Switch
                                          size={'small'}
                                          checked={isAutoName}
                                          onChange={e =>
                                          {
                                            if (e.target.checked)
                                            {
                                              setManualAutoNameOff(prev =>
                                              {
                                                const next = new Set(prev);
                                                next.delete(idx);
                                                return next;
                                              });
                                              if (reward.rewardName !== '' && reward.rewardName !== derivedName)
                                              {
                                                updatePanelRewards({ ...reward, rewardName: '' }, idx);
                                              }
                                            }
                                            else
                                            {
                                              setManualAutoNameOff(prev => new Set([...prev, idx]));
                                            }
                                          }}
                                        />
                                      }
                                      label={'Auto'}
                                    />
                                  </Stack>
                                  <SdpRewardEffectEditor
                                    value={reward.effect}
                                    onChange={next => updatePanelRewards({ ...reward, effect: next }, idx)}
                                  />
                                </Stack>
                              </AccordionDetails>
                            </Accordion>
                          );
                        })}
                      </Stack>
                    </BoardSectionCard>
                  </Stack>
                </Grid>
              </Grid>
            </>
          }
      </EditorBoardSplitLayout>
        )}
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
      open={panelListContextMenu !== null}
      onClose={() => setPanelListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={panelListContextMenu !== null
        ? {
          top: panelListContextMenu.mouseY,
          left: panelListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewPanel(selectedPanelIndex);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewPanel(selectedPanelIndex + 1);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleClonePanel(selectedPanelIndex);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleClonePanel(selectedPanelIndex + 1);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        openCloneFromDialog(selectedPanelIndex);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above from...</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        openCloneFromDialog(selectedPanelIndex + 1);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below from...</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeletePanel(selectedPanelIndex);
        setPanelListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    <Dialog
      open={rankupCostProjectionDialog}
      onClose={() => setRankupCostProjectionDialog(false)}
      maxWidth={'md'}
    >
      <DialogTitle>
        Rank-Up Cost Projection
      </DialogTitle>
      <DialogContent
        sx={{
          maxHeight: 400
        }}
      >
        <List>
          {renderCostProjection()}
        </List>
      </DialogContent>
      <DialogActions>
        <Button
          variant={'contained'}
          startIcon={<Check/>}
          color={'success'}
          onClick={() => setRankupCostProjectionDialog(false)}
        >
          <Typography>Done Viewing Cost Projections</Typography>
        </Button>
      </DialogActions>

    </Dialog>

    <Dialog
      open={cloneFromDialogOpen}
      onClose={() => setCloneFromDialogOpen(false)}
      maxWidth={'sm'}
      fullWidth
    >
      <DialogTitle>
        Clone Panel From
      </DialogTitle>
      <DialogContent
        sx={{
          pt: 2
        }}
      >
        <Stack spacing={2}>
          <Autocomplete
            size={'small'}
            options={sdps}
            getOptionKey={(option) => option?.key ?? 'no-key'}
            getOptionLabel={(option) => option?.identity?.name ?? ''}
            isOptionEqualToValue={(
              a,
              b
            ) => a.key === b.key}
            value={cloneFromSelectedPanel}
            onChange={(
              _,
              value
            ) => setCloneFromSelectedPanel(value)}
            slotProps={{
              listbox: {
                sx: { maxHeight: '300px' }
              }
            }}
            renderInput={(params) =>
            {
              return <TextField
                {...params}
                size={'small'}
                label={'sdps'}
                placeholder="Search panel name..."
                helperText={'Pick the panel to clone and insert at the chosen position.'}
              />;
            }}
          />

          {cloneFromSelectedPanel &&
            <Typography variant={'body2'}>
              {`Selected: ${cloneFromSelectedPanel.key} — ${cloneFromSelectedPanel.identity.name}`}
            </Typography>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          variant={'outlined'}
          onClick={() => setCloneFromDialogOpen(false)}
        >
          <Typography>Cancel</Typography>
        </Button>
        <Button
          variant={'contained'}
          disabled={!cloneFromSelectedPanel}
          onClick={handleConfirmCloneFrom}
          startIcon={<Check/>}
          color={'success'}
        >
          <Typography>Clone</Typography>
        </Button>
      </DialogActions>
    </Dialog>

    {/*endregion not-grid-related elements */}
  </>;
};

export default SdpBoard;
