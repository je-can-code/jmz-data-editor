import React, {
  MouseEvent,
  useEffect, useMemo,
  useRef,
  useState
} from 'react';
import {
  FixedSizeList,
  ListChildComponentProps
} from 'react-window';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox, CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FilledInput,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  AddReaction,
  AutoAwesome,
  AutoGraph,
  Check,
  Circle,
  ContentCopy,
  DoubleArrow,
  Insights,
  KeyboardArrowRight,
  Lock,
  LockOpen,
  Percent,
  PlayCircleFilled,
  PlayCircleOutline,
  Psychology,
  Quiz,
  Redeem,
  Remove,
  ShowChart,
  SportsHandball,
  SportsKabaddi,
  StackedLineChart,
  SwitchAccessShortcut,
  TrendingFlat,
  WaterfallChart
} from '@mui/icons-material';
import {
  blue,
  green,
  grey,
  orange,
  purple,
  yellow
} from '@mui/material/colors';
import {
  MuiSnackbarSeverity,
  MuiSnackbarVariant
} from '@core/enums/MuiSnackbar.ts';

import SaveButton from '../../../components/core/SaveButton.tsx';
import KeyTextField from '../../../components/core/KeyTextField.tsx';
import ReloadButton from '../../../components/core/ReloadButton.tsx';

import { fromLongParameterIdToName } from '../../../mappers/ParameterIdMapper.ts';
import Panel = Sdp.StatDistributionPanel;
import PanelParameter = Sdp.SdpParameter;
import PanelReward = Sdp.SdpReward;
import { useSdps } from '@presentation/context/resources/sdps.context.tsx';
import { useUrlSelection } from '@presentation/hooks/useUrlSelection.ts';

const SdpBoard = () =>
{
  const {
    sdps,
    setData: setSdps,
    loading,
    save,
    reload
  } = useSdps();

  //region state
  const listRef = useRef<FixedSizeList>(null);

  const [ selectedPanel, setSelectedPanel ] = useState<Panel | null>(null);
  const [ selectedPanelIndex, setSelectedPanelIndex ] = useState<number>(0);
  const [ panelListContextMenu, setPanelListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);
  const [ searchTerm, setSearchTerm ] = useState<string>('');

  const [ selectedPanelParameter, setSelectedPanelParameter ] = useState<PanelParameter | null>(null);
  const [ selectedPanelParameterIndex, setSelectedPanelParameterIndex ] = useState<number>(0);
  const [ parameterListContextMenu, setParameterListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ canSave, setCanSave ] = useState<boolean>(false);

  const [ selectedPanelReward, setSelectedPanelReward ] = useState<PanelReward | null>(null);
  const [ selectedPanelRewardIndex, setSelectedPanelRewardIndex ] = useState<number>(0);
  const [ rewardListContextMenu, setRewardListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ rankupCostProjectionDialog, setRankupCostProjectionDialog ] = useState<boolean>(false);

  const [ cloneFromDialogOpen, setCloneFromDialogOpen ] = useState<boolean>(false);
  const [ cloneFromInsertIndex, setCloneFromInsertIndex ] = useState<number | null>(null);
  const [ cloneFromSelectedPanel, setCloneFromSelectedPanel ] = useState<Panel | null>(null);

  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>('');
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);
  //endregion state

  //region setup
  /**
   * Initializes the board selection when data is loaded.
   */
  useEffect(() =>
  {
    if (sdps.length > 0 && !selectedPanel)
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

    // Automatically select the first parameter of the panel.
    const firstParam = panel?.panelParameters?.at(0) ?? null;
    setSelectedPanelParameter(firstParam);
    setSelectedPanelParameterIndex(0);

    // Automatically select the first reward of the panel.
    const firstReward = panel?.panelRewards?.at(0) ?? null;
    setSelectedPanelReward(firstReward);
    setSelectedPanelRewardIndex(0);
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
    selectedPanelIndex,
    handleSdpListItemOnClickEvent,
    (index) => scrollListToIndex(index, 'smart')
  );

  const handleSdpPanelParameterListItemOnClickEvent = (index: number) =>
  {
    setSelectedPanelParameterIndex(index);
    setSelectedPanelParameter(selectedPanel?.panelParameters.at(index) ?? null);
  };

  const handleSdpPanelRewardListItemOnClickEvent = (index: number) =>
  {
    setSelectedPanelRewardIndex(index);
    setSelectedPanelReward(selectedPanel?.panelRewards.at(index) ?? null);
  };

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

  const handleParameterListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = parameterListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setParameterListContextMenu(newContextMenuState);
  };

  const handleRewardListContextMenu = (event: MouseEvent) =>
  {
    event.preventDefault();

    const newContextMenuState = rewardListContextMenu === null
      ? {
        mouseX: event.clientX + 2,
        mouseY: event.clientY - 6,
      }
      : null;

    setRewardListContextMenu(newContextMenuState);
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
        panel.name ?? ''
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

  const handlePanelKeyChange = (input: string) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      key: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelNameChange = (input: string) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      name: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelIconIndexChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      iconIndex: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelUnlockedByDefaultChange = (input: boolean) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      unlockedByDefault: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelRarityChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      rarity: input,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelMaxRankChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      maxRank: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelBaseCostChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      baseCost: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelFlatGrowthCostChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      flatGrowthCost: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelMultGrowthCostChange = (input: number) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      multGrowthCost: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelTopFlavorTextChange = (input: string) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      topFlavorText: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handlePanelDescriptionChange = (input: string) =>
  {
    const updatedPanel = {
      ...selectedPanel,
      description: input,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleUpdatePanelParameterIdChange = (input: number) =>
  {
    const updatedPanelParameter = {
      ...selectedPanelParameter,
      parameterId: input,
    } as PanelParameter;
    setSelectedPanelParameter(updatedPanelParameter);

    updatePanelParameters(updatedPanelParameter, selectedPanelParameterIndex);
  };

  const handleUpdatePanelParameterPerRankChange = (input: number) =>
  {
    const updatedPanelParameter = {
      ...selectedPanelParameter,
      perRank: input,
    } as PanelParameter;
    setSelectedPanelParameter(updatedPanelParameter);

    updatePanelParameters(updatedPanelParameter, selectedPanelParameterIndex);
  };

  const handleUpdatePanelParameterIsCoreChange = (input: boolean) =>
  {
    const updatedPanelParameter = {
      ...selectedPanelParameter,
      isCore: input,
    } as PanelParameter;
    setSelectedPanelParameter(updatedPanelParameter);

    updatePanelParameters(updatedPanelParameter, selectedPanelParameterIndex);
  };

  const handleUpdatePanelParameterIsFlatChange = (input: boolean) =>
  {
    const updatedPanelParameter = {
      ...selectedPanelParameter,
      isFlat: input,
    } as PanelParameter;
    setSelectedPanelParameter(updatedPanelParameter);

    updatePanelParameters(updatedPanelParameter, selectedPanelParameterIndex);
  };

  const handleUpdatePanelRewardRankRequired = (input: number) =>
  {
    const updatedPanelReward = {
      ...selectedPanelReward,
      rankRequired: input,
    } as PanelReward;
    setSelectedPanelReward(updatedPanelReward);

    updatePanelRewards(updatedPanelReward, selectedPanelRewardIndex);
  };

  const handleUpdatePanelRewardName = (input: string) =>
  {
    const updatedPanelReward = {
      ...selectedPanelReward,
      rewardName: input,
    } as PanelReward;
    setSelectedPanelReward(updatedPanelReward);

    updatePanelRewards(updatedPanelReward, selectedPanelRewardIndex);
  };

  const handleUpdatePanelRewardEffect = (input: string) =>
  {
    const updatedPanelReward = {
      ...selectedPanelReward,
      effect: input,
    } as PanelReward;
    setSelectedPanelReward(updatedPanelReward);

    updatePanelRewards(updatedPanelReward, selectedPanelRewardIndex);
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
    setSelectedPanelParameter(updatedParam);

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
    setSelectedPanelReward(updatedReward);

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
    const newPanel = {
      key: `NEO-${sdps.length}`,
      name: `New Panel # ${sdps.length}`,
      iconIndex: -1,
      unlockedByDefault: false,
      description: 'The best panel ever, hands down. You only need to acquire it somehow!',
      topFlavorText: 'Get this panel, you will not regret it.',
      maxRank: 10,
      baseCost: 100,
      flatGrowthCost: 50,
      multGrowthCost: 1.20,
      panelParameters: [],
      panelRewards: [],
      rarity: 0,
    } as Panel;

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
      parameterId: 0,
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

  /**
   * Clones an existing parameter within the selected panel.
   * @param {number} index The index of the parameter to clone.
   */
  const handleClonePanelParameter = (index: number) =>
  {
    if (!selectedPanel || !selectedPanelParameter)
    {
      return;
    }

    const clonedParameter = {
      ...selectedPanelParameter,
    } as PanelParameter;

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

  /**
   * Clones an existing reward within the selected panel.
   * @param {number} index The index of the reward to clone.
   */
  const handleClonePanelReward = (index: number) =>
  {
    if (!selectedPanel || !selectedPanelReward)
    {
      return;
    }

    const clonedReward = {
      ...selectedPanelReward
    } as PanelReward;

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
  const isHeaderRow = (index: number) =>
  {
    const sdp = sdps.at(index);
    if (!sdp)
    {
      return false;
    }
    return sdp.key.endsWith('___');
  };

  const renderSdpListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const sdp = sdps.at(index);
    if (!sdp)
    {
      return <></>;
    }

    const isHeader = isHeaderRow(index);

    const textStyle = {
      fontFamily: 'monospace',
      fontWeight: isHeader
        ? 'bold'
        : 'normal',
      color: fromRarityColorIndexToColor(sdp.rarity)
    } as const;

    // Determine if a divider should appear below this row (i.e., next row is a header)
    const next = sdps.at(index + 1);
    const isNextHeader = isHeaderRow(index + 1) ?? false;
    const nextHeaderColor = isNextHeader
      ? fromRarityColorIndexToColor(next!.rarity)
      : undefined;

    return <>
      <ListItem key={sdp.key} style={style}>
        <ListItemButton
          sx={{
            maxHeight: '30px',
            position: 'relative',
            // Option A: thick border line
            ...(
              isNextHeader && {
                borderBottom: `4px solid ${nextHeaderColor}`,
                // keep the border visible under selection styles
                '&.Mui-selected': {
                  borderBottom: `3px solid ${nextHeaderColor}`,
                }
              }
            ),
          }}
          selected={selectedPanelIndex === index}
          onClick={() => handleSdpListItemOnClickEvent(index)}
        >
          <ListItemIcon>
            {(
              selectedPanelIndex === index
            )
              ? <DoubleArrow color={'success'}/>
              : <KeyboardArrowRight color={'warning'}/>}
          </ListItemIcon>
          <ListItemText
            primary={`[${sdp.key}]: ${sdp.name}`}
            disableTypography
            sx={textStyle}
          />
        </ListItemButton>
      </ListItem>
    </>;
  };

  const fromRarityColorIndexToName = (rarityColorIndex: number) =>
  {
    switch (rarityColorIndex)
    {
      case 0:
        return 'Common (Tier 1)';
      case 3:
        return 'Magical (Tier 2)';
      case 23:
        return 'Rare (Tier 3)';
      case 31:
        return 'Epic (Tier 4)';
      case 20:
        return 'Legendary (Tier 5)';
      case 25:
        return 'Godlike (Tier 6)';
      default:
        console.warn('if modifying the rarity dropdown options, be sure to fix them here, too.');
        console.warn(`${rarityColorIndex} was not an implemented option.`);
        return 'UNKNOWN';
    }
  };

  const fromRarityColorIndexToIcon = (rarityColorIndex: number) =>
  {
    const styles = {
      color: fromRarityColorIndexToColor(rarityColorIndex)
    };
    switch (rarityColorIndex)
    {
      case 0:
        return <ShowChart sx={styles}/>;
      case 3:
        return <StackedLineChart sx={styles}/>;
      case 23:
        return <Insights sx={styles}/>;
      case 31:
        return <AutoGraph sx={styles}/>;
      case 20:
        return <SwitchAccessShortcut sx={styles}/>;
      case 25:
        return <AutoAwesome sx={styles}/>;
      default:
        console.warn('if modifying the rarity dropdown options, be sure to fix them here, too.');
        console.warn(`${rarityColorIndex} was not an implemented option.`);
        return <Circle/>;
    }
  };

  const fromRarityColorIndexToColor = (rarityColorIndex: number) =>
  {
    switch (rarityColorIndex)
    {
      case 0:
        return grey[ 600 ];
      case 3:
        return green[ 600 ];
      case 23:
        return blue[ 600 ];
      case 31:
        return purple[ 500 ];
      case 20:
        return orange[ 600 ];
      case 25:
        return yellow[ 600 ];
      default:
        console.warn('if modifying the rarity dropdown options, be sure to fix them here, too.');
        console.warn(`${rarityColorIndex} was not an implemented option.`);
        return grey[ 100 ];
    }
  };

  const renderSdpRarities = () =>
  {
    const rarities = [ 0, 3, 23, 31, 20, 25 ];
    return rarities.map((
      rarityColorIndex =>
        <MenuItem
          key={rarityColorIndex}
          value={rarityColorIndex}
        >
          {fromRarityColorIndexToIcon(rarityColorIndex)} {fromRarityColorIndexToName(rarityColorIndex)}
        </MenuItem>
    ));
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

  const renderSdpParameterListItem = (
    parameter: PanelParameter,
    index: number
  ) =>
  {
    const selected = (
      selectedPanelParameterIndex === index
    );
    const icon = selected
      ? <DoubleArrow color={'primary'}/>
      : <KeyboardArrowRight color={'inherit'}/>;
    const coreIcon = selected
      ? <PlayCircleFilled color={'primary'}/>
      : <PlayCircleOutline color={'inherit'}/>;
    const parameterIcon = fromParameterIdToIconElement(parameter.parameterId, selected);

    const isPositive = parameter.perRank > 0;
    const percent = parameter.isFlat === false
      ? '%'
      : '';
    const amountPerRank = `${isPositive
      ? '+'
      : ''} ${parameter.perRank}${percent} / rank`;

    const totalBonus = `${isPositive
      ? '+'
      : ''}${parameter.perRank * selectedPanel!.maxRank}${percent}`;

    return <ListItem key={`${selectedPanelParameter?.parameterId}-${index}`}>
      <ListItemButton
        selected={selectedPanelParameterIndex === index}
        onClick={() => handleSdpPanelParameterListItemOnClickEvent(index)}
      >
        <ListItemIcon>{parameter.isCore
          ? coreIcon
          : icon}
          {parameterIcon}</ListItemIcon>
        <ListItemText
          primary={`${fromLongParameterIdToName(parameter.parameterId)} (${totalBonus})`}
          secondary={amountPerRank}
          sx={{ height: '28px' }}
        />
      </ListItemButton>
    </ListItem>;
  };

  const mapParametersToSelectMenuItems = () =>
  {
    const parameterItems = [];
    const bParamIds = [ 0, 1, 2, 3, 4, 5, 6, 7 ];
    const exParamIds = [ 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 ];
    const spParamIds = [ 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 ];
    const cParamIds = [ 28, 29, 30 ];

    parameterItems.push(<ListSubheader key={0}>Base Parameters</ListSubheader>);
    bParamIds.map((
      parameterId,
      index
    ) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={1}>Ex Parameters</ListSubheader>);
    exParamIds.map((
      parameterId,
      index
    ) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 8}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={2}>Sp Parameters</ListSubheader>);
    spParamIds.map((
      parameterId,
      index
    ) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 18}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      );
    });

    parameterItems.push(<ListSubheader key={3}>Custom Parameters</ListSubheader>);
    cParamIds.map((
      parameterId,
      index
    ) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 28}`}
          value={parameterId}>
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      );
    });

    return parameterItems;
  };

  const renderPanelRewardListItem = (
    panelReward: PanelReward,
    index: number
  ) =>
  {
    let rankRequired;
    switch (panelReward.rankRequired)
    {
      case -1:
        rankRequired = 'Every Rank Up';
        break;
      case 0:
        rankRequired = `Upon max (${selectedPanel!.maxRank})`;
        break;
      default:
        rankRequired = panelReward.rankRequired;
        break;
    }

    const selected = (
      selectedPanelRewardIndex === index
    );
    const icon = selected
      ? <Redeem color={'primary'}/>
      : <KeyboardArrowRight color={'inherit'}/>;
    return (
      <ListItem
        key={`${index}-${panelReward.rewardName}`}
      >
        <ListItemButton
          selected={selected}
          onClick={() => handleSdpPanelRewardListItemOnClickEvent(index)}
        >
          <ListItemIcon>{icon}</ListItemIcon>
          <ListItemText
            primary={panelReward.rewardName}
            secondary={`Rank Rewarded: ${rankRequired}`}
          />
        </ListItemButton>
      </ListItem>
    );
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
      maxRank
    } = selectedPanel;
    let accumulatedCost = 0;

    for (let rank = 1; rank <= maxRank; rank++)
    {
      const nextLevelCost = Math.ceil(baseCost + (
        multGrowthCost * (
          flatGrowthCost * rank
        )
      ));

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
      maxRank
    } = selectedPanel;
    let accumulatedCost = 0;

    for (let rank = 1; rank <= maxRank; rank++)
    {
      accumulatedCost += Math.ceil(baseCost + (
        multGrowthCost * (
          flatGrowthCost * rank
        )
      ));
    }

    return accumulatedCost;
  };
  //endregion render

  if (loading)
  {
    return <Typography>Loading SDP configuration...</Typography>;
  }

  return <>
    <Grid container spacing={2}>
      <Grid size={3}>
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
        <div
          onContextMenu={handlePanelListContextMenu}
          style={{ cursor: 'context-menu' }}
        >
          {sdps.length > 0
            ? <>
              {/* @ts-ignore */}
              <FixedSizeList
                ref={listRef}
                height={960}
                width={'100%'}
                itemSize={30}
                overscanCount={5}
                itemCount={sdps.length}
              >
                {renderSdpListItem}
              </FixedSizeList>
            </>
            : <>
              <Button
                fullWidth
                startIcon={<Add/>}
                onClick={() => handleAddNewPanel(null)}
                variant={'contained'}/>
            </>}
        </div>
      </Grid>

      <Grid size={9}>
        <Paper
          sx={{
            height: '100%',
            width: '100%',
            padding: 2
          }}
          elevation={10}
        >
          {(
            selectedPanel === null
          )
            ? <Typography>
              Please select a panel on the left.<br/>
              If there are no sdps then consider making one.
            </Typography>
            : <>
              <Grid container rowSpacing={2} columnSpacing={4}>
                {/* ROW 1 */}
                {/* key */}
                <Grid size={2}>
                  <KeyTextField
                    value={selectedPanel.key}
                    onChange={handlePanelKeyChange}
                  />
                </Grid>

                {/* name */}
                <Grid size={6}>
                  <TextField
                    variant={'standard'}
                    label={'Name'}
                    value={selectedPanel.name}
                    onChange={event => handlePanelNameChange(event.target.value)}
                    size={'small'}
                    fullWidth
                  />
                </Grid>

                {/* icon index */}
                <Grid size={2}>
                  <TextField
                    type={'number'}
                    label={'Icon Index'}
                    variant={'filled'}
                    value={selectedPanel.iconIndex}
                    onChange={event => handlePanelIconIndexChange(parseInt(event.target.value) ?? -1)}
                    sx={{ width: '100px' }}
                  />
                </Grid>

                {/* unlocked by default */}
                <Grid size={2}>
                  <FormControlLabel
                    control={<Checkbox
                      checked={selectedPanel.unlockedByDefault}
                      checkedIcon={<LockOpen color={'success'}/>}
                      icon={<Lock color={'error'}/>}
                      onChange={event => handlePanelUnlockedByDefaultChange(event.target.checked)}
                    />}
                    label={selectedPanel.unlockedByDefault
                      ? 'Unlocked By Default'
                      : 'Locked by Default'}
                    labelPlacement={'end'}
                  />
                </Grid>

                {/* ROW 2 */}
                {/* rarity */}
                <Grid size={3}>
                  <Select
                    value={selectedPanel.rarity}
                    onChange={event => handlePanelRarityChange(parseInt(event.target.value.toString()))}
                    autoWidth
                  >
                    {renderSdpRarities()}
                  </Select>
                </Grid>

                {/* top flavor text */}
                <Grid size={9}>
                  <TextField
                    fullWidth
                    size={'small'}
                    variant={'outlined'}
                    label={'Top Flavor Text'}
                    value={selectedPanel.topFlavorText}
                    onChange={event => handlePanelTopFlavorTextChange(event.target.value)}
                  />
                </Grid>

                {/* ROW 3 */}
                {/* description */}
                <Grid size={12}>
                  <TextField
                    fullWidth
                    size={'small'}
                    variant={'outlined'}
                    label={'Description'}
                    multiline
                    rows={4}
                    value={selectedPanel.description}
                    onChange={event => handlePanelDescriptionChange(event.target.value)}
                  />
                </Grid>

                {/* ROW 4 */}
                {/* max rank */}
                <Grid size={1}>
                  <TextField
                    type={'number'}
                    label={'Max Rank'}
                    variant={'outlined'}
                    value={selectedPanel.maxRank}
                    onChange={event => handlePanelMaxRankChange(parseInt(event.target.value) ?? 1)}
                    sx={{ width: '80px' }}
                  />
                </Grid>

                {/* base growth */}
                <Grid size={1} sx={{ mr: 5 }}>
                  <TextField
                    type={'number'}
                    label={'Base Cost'}
                    variant={'outlined'}
                    value={selectedPanel.baseCost}
                    onChange={event => handlePanelBaseCostChange(parseInt(event.target.value) ?? 0)}
                    sx={{ width: '120px' }}
                  />
                </Grid>

                {/* flat growth */}
                <Grid size={1} sx={{ mr: 5 }}>
                  <TextField
                    type={'number'}
                    label={'Flat Growth'}
                    variant={'outlined'}
                    value={selectedPanel.flatGrowthCost}
                    onChange={event => handlePanelFlatGrowthCostChange(parseInt(event.target.value) ?? 0)}
                    sx={{ width: '120px' }}
                  />
                </Grid>

                {/* growth multiplier */}
                <Grid size={1}>
                  <FormControl>
                    <InputLabel>
                      Multiplier
                    </InputLabel>
                    <FilledInput
                      type={'number'}
                      value={selectedPanel.multGrowthCost}
                      onChange={event => handlePanelMultGrowthCostChange(parseFloat(event.target.value) ?? 0.01)}
                      slotProps={{
                        input: {
                          min: '0.01',
                          step: '0.01'
                        }
                      }}
                      sx={{ width: '80px' }}
                    />
                  </FormControl>
                </Grid>

                {/* cost to master projection */}
                <Grid size={2}>
                  <Typography variant={'body1'}>
                    Total Cost to Master:<br/> <strong>{projectTotalCost()}</strong>
                  </Typography>
                </Grid>

                {/* cost per level projections */}
                <Grid size={4}>
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

                {/* SPACER */}
                <Grid size={1}/>

                {/* ROW 5 */}
                {/* Parameter List */}
                {/* Parameter List */}
                <Grid size={3}>
                  <div
                    onContextMenu={handleParameterListContextMenu}
                    style={{ cursor: 'context-menu' }}
                  >
                    <List dense>
                      {(selectedPanel?.panelParameters?.length ?? 0) > 0
                        ? selectedPanel!.panelParameters.map(renderSdpParameterListItem)
                        : <>
                          <Button
                            fullWidth
                            startIcon={<Add/>}
                            onClick={() => handleAddNewPanelParameter(null)}
                            variant={'contained'}/>
                        </>}
                    </List>
                  </div>
                </Grid>

                {/* Selected Parameter Data */}
                <Grid size={3}>
                  {(
                    !selectedPanelParameter
                  )
                    ? <></>
                    : <>
                      <Stack spacing={8}>
                        {/* Parameter Toggles */}
                        <Stack>
                          {/* Parameter Core or Regular */}
                          <FormControlLabel
                            control={<Checkbox
                              checked={selectedPanelParameter!.isCore}
                              checkedIcon={<PlayCircleFilled color={'primary'}/>}
                              icon={<KeyboardArrowRight color={'inherit'}/>}
                              onChange={event => handleUpdatePanelParameterIsCoreChange(event.target.checked)}
                            />}
                            label={selectedPanelParameter!.isCore
                              ? 'Is Core'
                              : 'Is Regular'}
                            labelPlacement={'end'}
                          />

                          {/* Growth Flat or Percent */}
                          <FormControlLabel
                            control={<Checkbox
                              checked={selectedPanelParameter!.isFlat}
                              checkedIcon={<TrendingFlat color={'primary'}/>}
                              icon={<Percent color={'secondary'}/>}
                              onChange={event => handleUpdatePanelParameterIsFlatChange(event.target.checked)}
                            />}
                            label={selectedPanelParameter!.isFlat
                              ? 'Flat Growth'
                              : 'Percent Growth'}
                            labelPlacement={'end'}
                          />
                        </Stack>

                        {/* Per Rank Growth */}
                        <FormControl>
                          <InputLabel>
                            Per Rank
                          </InputLabel>
                          <FilledInput
                            type={'number'}
                            value={selectedPanelParameter?.perRank}
                            onChange={event => handleUpdatePanelParameterPerRankChange(parseFloat(event.target.value)
                              ?? 0.01)}
                            slotProps={{
                              input: {
                                step: '0.1',

                              }
                            }}
                            sx={{ width: '80px' }}
                          />
                        </FormControl>

                        {/* Parameter Type */}
                        <Select
                          label="Parameter Type"
                          value={selectedPanelParameter!.parameterId}
                          onChange={event => handleUpdatePanelParameterIdChange(parseInt(event.target.value.toString()))}
                          autoWidth
                        >
                          {mapParametersToSelectMenuItems()}
                        </Select>
                      </Stack>
                    </>}
                </Grid>

                <Grid size={6}>
                  <Paper
                    sx={{
                      padding: 2
                    }}
                    elevation={10}
                  >
                    <Stack spacing={2}>

                      {/* Selected Reward Data */}
                      <Typography variant={'h6'}>
                        Rank Rewards
                      </Typography>

                      <div
                        onContextMenu={handleRewardListContextMenu}
                        style={{ cursor: 'context-menu' }}
                      >
                        <List dense>
                          {(selectedPanel?.panelRewards?.length ?? 0) > 0
                            ? selectedPanel!.panelRewards.map(renderPanelRewardListItem)
                            : <>
                              <Button
                                fullWidth
                                startIcon={<Add/>}
                                onClick={() => handleAddNewPanelReward(null)}
                                variant={'contained'}/>
                            </>}
                        </List>
                      </div>

                      {(
                        !selectedPanelReward
                      )
                        ? <></>
                        : <>
                          <TextField
                            type={'number'}
                            label={'Rank Required'}
                            variant={'outlined'}
                            value={selectedPanelReward!.rankRequired}
                            onChange={event => handleUpdatePanelRewardRankRequired(parseInt(event.target.value) ?? 0)}
                            sx={{ width: '120px' }}
                          />
                          <TextField
                            variant={'standard'}
                            label={'Reward Name'}
                            value={selectedPanelReward!.rewardName}
                            onChange={event => handleUpdatePanelRewardName(event.target.value)}
                            size={'small'}
                            fullWidth
                          />
                          <TextField
                            fullWidth
                            size={'small'}
                            variant={'outlined'}
                            label={'Effect'}
                            multiline
                            rows={4}
                            value={selectedPanelReward!.effect}
                            onChange={event => handleUpdatePanelRewardEffect(event.target.value)}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                fontFamily: 'monospace',
                                fontSize: 14
                              },
                            }}
                          />
                        </>}


                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </>
          }
        </Paper>
      </Grid>
    </Grid>

    {/*region not-grid-related elements */}
    <SaveButton
      extraSaveText={'sdps'}
      canSave={canSave && !loading}
      handleSave={async () =>
      {
        setCanSave(false);
        await save(sdps);
        handleSnack('SDP data has been saved successfully.', MuiSnackbarSeverity.Success);
      }}
    />
    <ReloadButton
      handleReload={handleReloadButtonOnClickEvent}
      canReload={!loading}
      extraReloadText={'SDP Data'}
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

    <Menu
      open={parameterListContextMenu !== null}
      onClose={() => setParameterListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={parameterListContextMenu !== null
        ? {
          top: parameterListContextMenu.mouseY,
          left: parameterListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewPanelParameter(selectedPanelParameterIndex);
        setParameterListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewPanelParameter(selectedPanelParameterIndex + 1);
        setParameterListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleClonePanelParameter(selectedPanelParameterIndex);
        setParameterListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleClonePanelParameter(selectedPanelParameterIndex + 1);
        setParameterListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeletePanelParameter(selectedPanelParameterIndex);
        setParameterListContextMenu(null);
      }}>
        <ListItemIcon><Remove/></ListItemIcon>
        <Typography>Remove selected</Typography>
      </MenuItem>
    </Menu>

    <Menu
      open={rewardListContextMenu !== null}
      onClose={() => setRewardListContextMenu(null)}
      anchorReference="anchorPosition"
      anchorPosition={rewardListContextMenu !== null
        ? {
          top: rewardListContextMenu.mouseY,
          left: rewardListContextMenu.mouseX
        }
        : undefined}
    >
      <MenuItem onClick={() =>
      {
        handleAddNewPanelReward(selectedPanelParameterIndex);
        setRewardListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleAddNewPanelReward(selectedPanelParameterIndex + 1);
        setRewardListContextMenu(null);
      }}>
        <ListItemIcon><Add/></ListItemIcon>
        <Typography>Add new below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleClonePanelReward(selectedPanelParameterIndex);
        setRewardListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone above</Typography>
      </MenuItem>

      <MenuItem onClick={() =>
      {
        handleClonePanelReward(selectedPanelParameterIndex + 1);
        setRewardListContextMenu(null);
      }}>
        <ListItemIcon><ContentCopy/></ListItemIcon>
        <Typography>Clone below</Typography>
      </MenuItem>

      <Divider/>

      <MenuItem onClick={() =>
      {
        handleDeletePanelReward(selectedPanelParameterIndex);
        setRewardListContextMenu(null);
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
            getOptionLabel={(option) => option?.name ?? ''}
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
              {`Selected: ${cloneFromSelectedPanel.key} — ${cloneFromSelectedPanel.name}`}
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
