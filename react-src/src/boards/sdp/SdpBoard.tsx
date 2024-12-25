import React, { MouseEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FilledInput, FormControl,
  FormControlLabel,
  Grid2, InputLabel, List,
  ListItem,
  ListItemButton,
  ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, Paper, Select, Snackbar, Stack, TextField, Typography
} from "@mui/material";
import {
  Add,
  AddReaction, AutoAwesome, AutoGraph, Check, Circle, ContentCopy,
  DoubleArrow, Insights,
  KeyboardArrowRight,
  Lock,
  LockOpen, Percent, PlayCircleFilled, PlayCircleOutline,
  Psychology, Quiz, Redeem, Remove, ShowChart, SportsHandball,
  SportsKabaddi, StackedLineChart, SwitchAccessShortcut, TrendingFlat, WaterfallChart
} from "@mui/icons-material";
import { blue, green, grey, orange, purple, yellow } from "@mui/material/colors";
import { MuiSnackbarSeverity, MuiSnackbarVariant } from "../../enums/MuiSnackbar.ts";

import SaveButton from "../../components/core/SaveButton.tsx";
import KeyTextField from "../../components/core/KeyTextField.tsx";

import ConfigFilenames from "../../enums/ConfigFilenames.ts";
import { executeLoad, executeSave } from "../../services/DataService.ts";
import { BoardProps } from "../../../types/local/BoardProps";

import { fromLongParameterIdToName } from "../../services/ParameterIdMapper.ts";

import Panel = Sdp.Panel;
import PanelParameter = Sdp.PanelParameter;
import PanelReward = Sdp.PanelReward;
import Configuration = Sdp.Configuration;

export default function SdpBoard(boardProps: BoardProps)
{
  //region state
  const [ panels, setPanels ] = useState<Panel[]>([]);
  const [ selectedPanel, setSelectedPanel ] = useState<Panel | null>(null);
  const [ selectedPanelIndex, setSelectedPanelIndex ] = useState<number>(0);
  const [ panelListContextMenu, setPanelListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ panelParameters, setPanelParameters ] = useState<PanelParameter[]>([]);
  const [ selectedPanelParameter, setSelectedPanelParameter ] = useState<PanelParameter>();
  const [ selectedPanelParameterIndex, setSelectedPanelParameterIndex ] = useState<number>(0);
  const [ parameterListContextMenu, setParameterListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ panelRewards, setPanelRewards ] = useState<PanelReward[]>([]);
  const [ selectedPanelReward, setSelectedPanelReward ] = useState<PanelReward>();
  const [ selectedPanelRewardIndex, setSelectedPanelRewardIndex ] = useState(0);
  const [ rewardListContextMenu, setRewardListContextMenu ] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const [ rankupCostProjectionDialog, setRankupCostProjectionDialog ] = useState<boolean>(false);

  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ snackOpen, setSnackOpen ] = useState<boolean>(false);
  const [ snackMessage, setSnackMessage ] = useState<string>("");
  const [ snackSeverity, setSnackSeverity ] = useState<MuiSnackbarSeverity>(MuiSnackbarSeverity.Info);
  const [ snackVariant, setSnackVariant ] = useState<MuiSnackbarVariant>(MuiSnackbarVariant.Filled);
  //endregion state

  //region setup
  /**
   * Initializes the board with the data from the configuration.
   */
  useEffect(() =>
  {
    let ignore = false;
    const { projectPath } = boardProps;
    if (projectPath === null || projectPath === '' || !projectPath.endsWith("/data"))
    {
      console.error(`invalid path provided: ${projectPath}`);
      return;
    }

    // a helper function for initializing the state of this component based on the configuration file.
    const initializeState = async (projectPath: string) =>
    {
      const sdpData = await executeLoad<Configuration>(projectPath, ConfigFilenames.Sdps);
      if (!ignore && sdpData)
      {
        // update the data list.
        setPanels(sdpData.sdps);

        const firstPanel = sdpData.sdps.at(1)!;
        setSelectedPanel(firstPanel);
        setSelectedPanelIndex(1);

        setPanelParameters(firstPanel.panelParameters);
        setSelectedPanelParameterIndex(0);

        //setPanelRewards(firstPanel.panelRewards);

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
  }, [ boardProps.projectPath ]);
  //endregion setup

  //region actions
  const handleSdpListItemOnClickEvent = (index: number) =>
  {
    setSelectedPanelIndex(index);

    if (panels.length > 0)
    {
      const panel = panels.at(index)!;
      setSelectedPanel(panel);

      setPanelParameters(panel.panelParameters);
      setSelectedPanelParameterIndex(0);
      setSelectedPanelParameter(panel.panelParameters.at(0)!);

      setPanelRewards(panel.panelRewards);
      setSelectedPanelRewardIndex(0);
      setSelectedPanelReward(panel.panelRewards.at(0)!);
    }
  };

  const handleSdpPanelParameterListItemOnClickEvent = (index: number) =>
  {
    setSelectedPanelParameterIndex(index);

    if (panelParameters.length > 0)
    {
      const panelParameter = panelParameters.at(index)!;
      setSelectedPanelParameter(panelParameter);
    }
  };

  const handleSdpPanelRewardListItemOnClickEvent = (index: number) =>
  {
    setSelectedPanelRewardIndex(index);

    if (panelParameters.length > 0)
    {
      const panelReward = panelRewards.at(index)!;
      setSelectedPanelReward(panelReward);
    }
  };

  const handleSaveButtonOnClickEvent = async () =>
  {
    const updatedConfiguration = {
      sdps: panels,
    } as Configuration;

    // save the data to disk.
    await executeSave(boardProps.projectPath, ConfigFilenames.Sdps, updatedConfiguration);

    setCanSave(true);

    handleSnack("Quest data has been saved successfully.");
  };

  const handleSnackClose = (_: any, reason?: string) =>
  {
    if (reason === 'clickaway') return;

    setSnackOpen(false);
  };

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
  //endregion actions

  //region updates
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

  const updatePanelParameters = (updatedPanelParameter: PanelParameter, index: number) =>
  {
    const updatedPanelParameters = panelParameters.with(index, updatedPanelParameter);
    setPanelParameters(updatedPanelParameters);

    const updatedPanel = {
      ...selectedPanel,
      panelParameters: updatedPanelParameters,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const updatePanelRewards = (updatedPanelReward: PanelReward, index: number) =>
  {
    const updatedPanelRewards = panelRewards.with(index, updatedPanelReward);
    setPanelRewards(updatedPanelRewards);

    const updatedPanel = {
      ...selectedPanel,
      panelRewards: updatedPanelRewards,
    } as Panel;

    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const updatePanel = (updatedPanel: Panel, index: number) =>
  {
    setSelectedPanel(updatedPanel);

    const updatedPanels = panels.with(index, updatedPanel);
    setPanels(updatedPanels);
  };

  const handleAddNewPanel = (index: number | null) =>
  {
    const newPanel = {
      key: `NEO-${panels.length}`,
      name: `New Panel # ${panels.length}`,
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

    const updatedPanels = (index === null)
      ? [ newPanel ]
      : panels.toSpliced(index, 0, newPanel);
    setPanels(updatedPanels);
  };

  const handleClonePanel = (index: number) =>
  {
    if (!selectedPanel) return;

    const clonedParameters = selectedPanel.panelParameters.toSpliced(0, 0);
    const clonedRewards = selectedPanel.panelRewards.toSpliced(0, 0);
    const clonedPanel = {
      ...selectedPanel,
      panelParameters: clonedParameters,
      panelRewards: clonedRewards,
    } as Panel;

    const updatedPanels = panels.toSpliced(index, 0, clonedPanel);
    setPanels(updatedPanels);
  };

  const handleDeletePanel = (index: number) =>
  {
    if (!selectedPanel) return;

    const updatedPanels = panels.toSpliced(index, 1);
    setPanels(updatedPanels);
  };

  const handleAddNewPanelParameter = (index: number | null) =>
  {
    const newParameter = {
      parameterId: 0,
      isCore: false,
      isFlat: true,
      perRank: 3,
    } as PanelParameter;

    const updatedParameters = (index === null)
      ? [ newParameter ]
      : panelParameters.toSpliced(index, 0, newParameter);
    setPanelParameters(updatedParameters);

    const updatedPanel = {
      ...selectedPanel,
      panelParameters: updatedParameters,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleClonePanelParameter = (index: number) =>
  {
    if (!selectedPanelParameter) return;

    const clonedParameter = {
      ...selectedPanelParameter,
    } as PanelParameter;

    const updatedParameters = panelParameters.toSpliced(index, 0, clonedParameter);
    setPanelParameters(updatedParameters);

    const updatedPanel = {
      ...selectedPanel,
      panelParameters: updatedParameters,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleDeletePanelParameter = (index: number) =>
  {
    if (!selectedPanelParameter) return;

    const updatedParameters = panelParameters.toSpliced(index, 1);
    setPanelParameters(updatedParameters);

    const updatedPanel = {
      ...selectedPanel,
      panelParameters: updatedParameters,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleAddNewPanelReward = (index: number | null) =>
  {
    const newReward = {
      rewardName: `REWARD # ${panelRewards.length}`,
      rankRequired: 0,
      effect: ''
    } as PanelReward;

    const updatedRewards = (index === null)
      ? [ newReward ]
      : panelRewards.toSpliced(index, 0, newReward);
    setPanelRewards(updatedRewards);

    const updatedPanel = {
      ...selectedPanel,
      panelRewards: updatedRewards,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleClonePanelReward = (index: number) =>
  {
    if (!selectedPanelReward) return;

    const clonedReward = {
      ...selectedPanelReward
    } as PanelReward;

    const updatedRewards = panelRewards.toSpliced(index, 0, clonedReward);
    setPanelRewards(updatedRewards);

    const updatedPanel = {
      ...selectedPanel,
      panelRewards: updatedRewards,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };

  const handleDeletePanelReward = (index: number) =>
  {
    if (!selectedPanelReward) return;

    const updatedRewards = panelRewards.toSpliced(index, 1);
    setPanelRewards(updatedRewards);

    const updatedPanel = {
      ...selectedPanel,
      panelRewards: updatedRewards,
    } as Panel;
    updatePanel(updatedPanel, selectedPanelIndex);
  };
  //endregion updates

  //region render
  const renderSdpListItems = () =>
  {
    return panels.map((panel, index) =>
    {
      const panelIsDivider = panel.key.endsWith('___');

      const textStyle = {
        fontFamily: 'monospace',
        fontWeight: panelIsDivider
          ? 'bold'
          : 'normal',
        color: fromRarityColorIndexToColor(panel.rarity)
      };

      return <>
        <ListSubheader
          sx={{
            fontFamily: 'monospace',
            fontWeight: 900,
          }}
        >{panelIsDivider
          ? panel.name
          : ""}</ListSubheader>
        <ListItem key={index}>
          <ListItemButton
            sx={{ maxHeight: '30px' }}
            selected={selectedPanelIndex === index}
            onClick={() => handleSdpListItemOnClickEvent(index)}
          >
            <ListItemIcon>
              {(selectedPanelIndex === index)
                ? <DoubleArrow color={"success"}/>
                : <KeyboardArrowRight color={"warning"}/>}
            </ListItemIcon>
            <ListItemText
              primary={`[${panel.key}]: ${panel.name}`}
              disableTypography
              sx={textStyle}
            />
          </ListItemButton>
        </ListItem>
      </>
    });
  };

  const renderSdpListItem = (props: ListChildComponentProps) =>
  {
    const {
      index,
      style
    } = props;

    const sdp = panels.at(index);
    if (!sdp) return <></>;

    const panelIsDivider = sdp.key.endsWith('___');

    const textStyle = {
      fontFamily: 'monospace',
      fontWeight: panelIsDivider
        ? 'bold'
        : 'normal',
      color: fromRarityColorIndexToColor(sdp.rarity)
    };

    return <>
      <ListItem key={index} style={style}>
        <ListItemButton
          sx={{ maxHeight: '30px' }}
          selected={selectedPanelIndex === index}
          onClick={() => handleSdpListItemOnClickEvent(index)}
        >
          <ListItemIcon>
            {(selectedPanelIndex === index)
              ? <DoubleArrow color={"success"}/>
              : <KeyboardArrowRight color={"warning"}/>}
          </ListItemIcon>
          <ListItemText
            primary={`[${sdp.key}]: ${sdp.name}`}
            disableTypography
            sx={textStyle}
          />
        </ListItemButton>
      </ListItem>
    </>
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
        console.warn("if modifying the rarity dropdown options, be sure to fix them here, too.");
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
        console.warn("if modifying the rarity dropdown options, be sure to fix them here, too.");
        console.warn(`${rarityColorIndex} was not an implemented option.`);
        return <Circle/>;
    }
  };

  const fromRarityColorIndexToColor = (rarityColorIndex: number) =>
  {
    switch (rarityColorIndex)
    {
      case 0:
        return grey[800];
      case 3:
        return green[800];
      case 23:
        return blue[800];
      case 31:
        return purple[800];
      case 20:
        return orange[800];
      case 25:
        return yellow[800];
      default:
        console.warn("if modifying the rarity dropdown options, be sure to fix them here, too.");
        console.warn(`${rarityColorIndex} was not an implemented option.`);
        return grey[500];
    }
  };

  const renderSdpRarities = () =>
  {
    const rarities = [ 0, 3, 23, 31, 20, 25 ];
    return rarities.map((rarityColorIndex =>
      <MenuItem
        key={rarityColorIndex}
        value={rarityColorIndex}
      >
        {fromRarityColorIndexToIcon(rarityColorIndex)} {fromRarityColorIndexToName(rarityColorIndex)}
      </MenuItem>))
  };

  const fromParameterIdToIconElement = (parameterId: number, selected: boolean) =>
  {
    if (parameterId <= 7)
    {
      return <SportsKabaddi
        sx={{
          color: selected
            ? green[800]
            : green[300]
        }}
      />;
    }
    else if (parameterId > 7 && parameterId <= 17)
    {
      return <Psychology
        sx={{
          color: selected
            ? purple[800]
            : purple[300]
        }}
      />;
    }
    else if (parameterId > 17 && parameterId <= 27)
    {
      return <AddReaction
        sx={{
          color: selected
            ? orange[800]
            : orange[300]
        }}
      />;
    }
    else
    {
      return <SportsHandball/>;
    }
  };

  const renderSdpParameterListItem = (parameter: PanelParameter, index: number) =>
  {
    const selected = (selectedPanelParameterIndex === index);
    const icon = selected
      ? <DoubleArrow color={"primary"}/>
      : <KeyboardArrowRight color={"inherit"}/>;
    const coreIcon = selected
      ? <PlayCircleFilled color={"primary"}/>
      : <PlayCircleOutline color={"inherit"}/>;
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
    </ListItem>
  };

  const mapParametersToSelectMenuItems = () =>
  {
    const parameterItems = [];
    const bParamIds = [ 0, 1, 2, 3, 4, 5, 6, 7 ];
    const exParamIds = [ 8, 9, 10, 11, 12, 13, 14, 15, 16, 17 ];
    const spParamIds = [ 18, 19, 20, 21, 22, 23, 24, 25, 26, 27 ];
    const cParamIds = [ 28, 29, 30 ];

    parameterItems.push(<ListSubheader key={0}>Base Parameters</ListSubheader>)
    bParamIds.map((parameterId, index) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader key={1}>Ex Parameters</ListSubheader>)
    exParamIds.map((parameterId, index) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 8}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader key={2}>Sp Parameters</ListSubheader>)
    spParamIds.map((parameterId, index) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 18}`}
          value={parameterId}
        >
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    parameterItems.push(<ListSubheader key={3}>Custom Parameters</ListSubheader>)
    cParamIds.map((parameterId, index) =>
    {
      parameterItems.push(
        <MenuItem
          key={`${index}-${parameterId + 28}`}
          value={parameterId}>
          {fromParameterIdToIconElement(parameterId, false)}
          {fromLongParameterIdToName(parameterId)}
        </MenuItem>
      )
    });

    return parameterItems;
  };

  const renderPanelRewardListItem = (panelReward: PanelReward, index: number) =>
  {
    let rankRequired;
    switch (panelReward.rankRequired)
    {
      case -1:
        rankRequired = "Every Rank Up";
        break;
      case 0:
        rankRequired = `Upon max (${selectedPanel!.maxRank})`;
        break;
      default:
        rankRequired = panelReward.rankRequired;
        break;
    }

    const selected = (selectedPanelRewardIndex === index);
    const icon = selected
      ? <Redeem color={"primary"}/>
      : <KeyboardArrowRight color={"inherit"}/>;
    return <>
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
    </>
  };

  const renderCostProjection = () =>
  {
    if (!selectedPanel) return <>No panel selected to project costs for.</>;

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
      const nextLevelCost = Math.ceil(baseCost + (multGrowthCost * (flatGrowthCost * rank)));

      accumulatedCost += nextLevelCost;

      const primaryText = <Typography variant={"body1"}>
        {`Rank: ${rank}`}
      </Typography>

      const secondaryText = <Typography variant={"body2"}>
        {`Next Level: ${nextLevelCost}`}<br/>
        {`Cumulative Total: ${accumulatedCost}`}
      </Typography>

      projections.push(<>
        <ListItem key={rank}>
          <ListItemText
            primary={primaryText}
            secondary={secondaryText}
            disableTypography
          />
        </ListItem>
      </>);
    }

    return projections;
  };

  const projectTotalCost = () =>
  {
    if (!selectedPanel) return 0;

    const {
      baseCost,
      multGrowthCost,
      flatGrowthCost,
      maxRank
    } = selectedPanel;
    let accumulatedCost = 0;

    for (let rank = 1; rank <= maxRank; rank++)
    {
      accumulatedCost += Math.ceil(baseCost + (multGrowthCost * (flatGrowthCost * rank)));
    }

    return accumulatedCost;
  };
  //endregion render

  return <>
    <Grid2 container spacing={2}>
      <Grid2 size={3}>
        <div
          onContextMenu={handlePanelListContextMenu}
          style={{ cursor: 'context-menu' }}
        >
          {panels.length > 0
            ? <>
              <List
                dense
                sx={{
                  maxHeight: '1030px',
                  overflow: 'auto',
                }}
              >
                {renderSdpListItems()}
              </List>
            </>
            : <>
              <Button
                fullWidth
                startIcon={<Add/>}
                onClick={() => handleAddNewPanel(null)}
                variant={"contained"}/>
            </>}
        </div>
      </Grid2>

      <Grid2 size={9}>
        <Paper
          sx={{
            height: '100%',
            width: '100%',
            padding: 2
          }}
          elevation={10}
        >
          {(selectedPanel === null)
            ? <Typography>
              Please select a panel on the left.<br/>
              If there are no panels then consider making one.
            </Typography>
            : <>
              <Grid2 container rowSpacing={2} columnSpacing={4}>
                {/* ROW 1 */}
                {/* key */}
                <Grid2 size={2}>
                  <KeyTextField
                    value={selectedPanel.key}
                    onChange={handlePanelKeyChange}
                  />
                </Grid2>

                {/* name */}
                <Grid2 size={6}>
                  <TextField
                    variant={"standard"}
                    label={"Name"}
                    value={selectedPanel.name}
                    onChange={event => handlePanelNameChange(event.target.value)}
                    size={"small"}
                    fullWidth
                  />
                </Grid2>

                {/* icon index */}
                <Grid2 size={2}>
                  <TextField
                    type={"number"}
                    label={"Icon Index"}
                    variant={"filled"}
                    value={selectedPanel.iconIndex}
                    onChange={event => handlePanelIconIndexChange(parseInt(event.target.value) ?? -1)}
                    sx={{ width: '100px' }}
                  />
                </Grid2>

                {/* unlocked by default */}
                <Grid2 size={2}>
                  <FormControlLabel
                    control={<Checkbox
                      checked={selectedPanel.unlockedByDefault}
                      checkedIcon={<LockOpen color={"success"}/>}
                      icon={<Lock color={"error"}/>}
                      onChange={event => handlePanelUnlockedByDefaultChange(event.target.checked)}
                    />}
                    label={selectedPanel.unlockedByDefault
                      ? "Unlocked By Default"
                      : "Locked by Default"}
                    labelPlacement={"end"}
                  />
                </Grid2>

                {/* ROW 2 */}
                {/* rarity */}
                <Grid2 size={3}>
                  <Select
                    value={selectedPanel.rarity}
                    onChange={event => handlePanelRarityChange(parseInt(event.target.value.toString()))}
                    autoWidth
                  >
                    {renderSdpRarities()}
                  </Select>
                </Grid2>

                {/* top flavor text */}
                <Grid2 size={9}>
                  <TextField
                    fullWidth
                    size={"small"}
                    variant={"outlined"}
                    label={"Top Flavor Text"}
                    value={selectedPanel.topFlavorText}
                    onChange={event => handlePanelTopFlavorTextChange(event.target.value)}
                  />
                </Grid2>

                {/* ROW 3 */}
                {/* description */}
                <Grid2 size={12}>
                  <TextField
                    fullWidth
                    size={"small"}
                    variant={"outlined"}
                    label={"Description"}
                    multiline
                    rows={4}
                    value={selectedPanel.description}
                    onChange={event => handlePanelDescriptionChange(event.target.value)}
                  />
                </Grid2>

                {/* ROW 4 */}
                {/* max rank */}
                <Grid2 size={1}>
                  <TextField
                    type={"number"}
                    label={"Max Rank"}
                    variant={"outlined"}
                    value={selectedPanel.maxRank}
                    onChange={event => handlePanelMaxRankChange(parseInt(event.target.value) ?? 1)}
                    sx={{ width: '80px' }}
                  />
                </Grid2>

                {/* base growth */}
                <Grid2 size={1} sx={{ mr: 5 }}>
                  <TextField
                    type={"number"}
                    label={"Base Cost"}
                    variant={"outlined"}
                    value={selectedPanel.baseCost}
                    onChange={event => handlePanelBaseCostChange(parseInt(event.target.value) ?? 0)}
                    sx={{ width: '120px' }}
                  />
                </Grid2>

                {/* flat growth */}
                <Grid2 size={1} sx={{ mr: 5 }}>
                  <TextField
                    type={"number"}
                    label={"Flat Growth"}
                    variant={"outlined"}
                    value={selectedPanel.flatGrowthCost}
                    onChange={event => handlePanelFlatGrowthCostChange(parseInt(event.target.value) ?? 0)}
                    sx={{ width: '120px' }}
                  />
                </Grid2>

                {/* growth multiplier */}
                <Grid2 size={1}>
                  <FormControl>
                    <InputLabel>
                      Multiplier
                    </InputLabel>
                    <FilledInput
                      type={"number"}
                      value={selectedPanel.multGrowthCost}
                      onChange={event => handlePanelMultGrowthCostChange(parseFloat(event.target.value) ?? 0.01)}
                      slotProps={{
                        input: {
                          min: "0.01",
                          step: "0.01"
                        }
                      }}
                      sx={{ width: '80px' }}
                    />
                  </FormControl>
                </Grid2>

                {/* cost to master projection */}
                <Grid2 size={2}>
                  <Typography variant={"body1"}>
                    Total Cost to Master:<br/> <strong>{projectTotalCost()}</strong>
                  </Typography>
                </Grid2>

                {/* cost per level projections */}
                <Grid2 size={4}>
                  <Button
                    color={"info"}
                    variant={"outlined"}
                    startIcon={<><WaterfallChart color={"secondary"}/><Quiz color={"success"}/></>}

                    onClick={() => setRankupCostProjectionDialog(true)}
                  >
                    <Typography variant={"body2"}>
                      Cost Per Level Projections
                    </Typography>
                  </Button>
                </Grid2>

                {/* SPACER */}
                <Grid2 size={1}/>

                {/* ROW 5 */}
                {/* Parameter List */}
                <Grid2 size={3}>
                  <div
                    onContextMenu={handleParameterListContextMenu}
                    style={{ cursor: 'context-menu' }}
                  >
                    <List dense>
                      {panelParameters.length > 0
                        ? panelParameters.map(renderSdpParameterListItem)
                        : <>
                          <Button
                            fullWidth
                            startIcon={<Add/>}
                            onClick={() => handleAddNewPanelParameter(null)}
                            variant={"contained"}/>
                        </>}
                    </List>
                  </div>
                </Grid2>

                {/* Selected Parameter Data */}
                <Grid2 size={3}>
                  {(!selectedPanelParameter)
                    ? <></>
                    : <>
                      <Stack spacing={8}>
                        {/* Parameter Toggles */}
                        <Stack>
                          {/* Parameter Core or Regular */}
                          <FormControlLabel
                            control={<Checkbox
                              checked={selectedPanelParameter!.isCore}
                              checkedIcon={<PlayCircleFilled color={"primary"}/>}
                              icon={<KeyboardArrowRight color={"inherit"}/>}
                              onChange={event => handleUpdatePanelParameterIsCoreChange(event.target.checked)}
                            />}
                            label={selectedPanelParameter!.isCore
                              ? "Is Core"
                              : "Is Regular"}
                            labelPlacement={"end"}
                          />

                          {/* Growth Flat or Percent */}
                          <FormControlLabel
                            control={<Checkbox
                              checked={selectedPanelParameter!.isFlat}
                              checkedIcon={<TrendingFlat color={"primary"}/>}
                              icon={<Percent color={"secondary"}/>}
                              onChange={event => handleUpdatePanelParameterIsFlatChange(event.target.checked)}
                            />}
                            label={selectedPanelParameter!.isFlat
                              ? "Flat Growth"
                              : "Percent Growth"}
                            labelPlacement={"end"}
                          />
                        </Stack>

                        {/* Per Rank Growth */}
                        <FormControl>
                          <InputLabel>
                            Per Rank
                          </InputLabel>
                          <FilledInput
                            type={"number"}
                            value={selectedPanelParameter?.perRank}
                            onChange={event => handleUpdatePanelParameterPerRankChange(parseFloat(event.target.value) ?? 0.01)}
                            slotProps={{
                              input: {
                                step: "0.1",

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
                </Grid2>

                <Grid2 size={6}>
                  <Paper
                    sx={{
                      padding: 2
                    }}
                    elevation={10}
                  >
                    <Stack spacing={2}>

                      {/* Selected Reward Data */}
                      <Typography variant={"h6"}>
                        Rank Rewards
                      </Typography>

                      <div
                        onContextMenu={handleRewardListContextMenu}
                        style={{ cursor: 'context-menu' }}
                      >
                        <List dense>
                          {panelRewards.length > 0
                            ? panelRewards.map(renderPanelRewardListItem)
                            : <>
                              <Button
                                fullWidth
                                startIcon={<Add/>}
                                onClick={() => handleAddNewPanelReward(null)}
                                variant={"contained"}/>
                            </>}
                        </List>
                      </div>

                      {(!selectedPanelReward)
                        ? <></>
                        : <>
                          <TextField
                            type={"number"}
                            label={"Rank Required"}
                            variant={"outlined"}
                            value={selectedPanelReward!.rankRequired}
                            onChange={event => handleUpdatePanelRewardRankRequired(parseInt(event.target.value) ?? 0)}
                            sx={{ width: '120px' }}
                          />
                          <TextField
                            variant={"standard"}
                            label={"Reward Name"}
                            value={selectedPanelReward!.rewardName}
                            onChange={event => handleUpdatePanelRewardName(event.target.value)}
                            size={"small"}
                            fullWidth
                          />
                          <TextField
                            fullWidth
                            size={"small"}
                            variant={"outlined"}
                            label={"Effect"}
                            multiline
                            rows={4}
                            value={selectedPanelReward!.effect}
                            onChange={event => handleUpdatePanelRewardEffect(event.target.value)}
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                fontFamily: "monospace",
                                fontSize: 14
                              },
                            }}
                          />
                        </>}


                    </Stack>
                  </Paper>
                </Grid2>
              </Grid2>
            </>
          }
        </Paper>
      </Grid2>
    </Grid2>

    {/*region not-grid-related elements */}
    <SaveButton
      extraSaveText={"Panels"}
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
      maxWidth={"md"}
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
          variant={"contained"}
          startIcon={<Check/>}
          color={"success"}
          onClick={() => setRankupCostProjectionDialog(false)}
        >
          <Typography>Done Viewing Cost Projections</Typography>
        </Button>
      </DialogActions>

    </Dialog>

    {/*endregion not-grid-related elements */}
  </>
}