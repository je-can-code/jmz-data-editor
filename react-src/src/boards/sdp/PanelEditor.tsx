import React, { ChangeEvent, useState, useRef } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  FormControlLabel,
  List, ListItem, ListItemButton, ListItemText,
  Switch,
  TextField, Typography
} from "@mui/material";
import { ExpandMore, SportsKabaddi, Psychology, AddReaction, SportsHandball } from "@mui/icons-material";
import { debounce } from 'lodash';
import { SdpPanelEditorProps } from "../../../types/local/BoardProps";
import Panel = Sdp.Panel;
import PanelParameter = Sdp.PanelParameter;
import PanelReward = Sdp.PanelReward;
import { fromLongParameterIdToName } from "../../services/ParameterIdMapper.ts";
import ParameterEditor from "./ParameterEditor.tsx";

export default function PanelEditor(props: SdpPanelEditorProps)
{
  /**
   * The function for updating a panel wholistically.
   */
  const updatePanel = props.updatePanel;

  const [ panelName, setPanelName ] = useState<string>(props.panel.name);
  const [ panelKey, setPanelKey ] = useState<string>(props.panel.key);
  const [ panelIconIndex, setPanelIconIndex ] = useState<number>(props.panel.iconIndex);
  const [ panelUnlockedByDefault, setPanelUnlockedByDefault ] = useState<boolean>(props.panel.unlockedByDefault);
  const [ panelDescription, setPanelDescription ] = useState<string>(props.panel.description);
  const [ panelTopFlavorText, setPanelTopFlavorText ] = useState<string>(props.panel.topFlavorText);
  const [ panelMaxRank, setPanelMaxRank ] = useState<number>(props.panel.maxRank);

  const [ panelBaseCost, setPanelBaseCost ] = useState<number>(props.panel.baseCost);
  const [ panelFlatGrowthCost, setPanelFlatGrowthCost ] = useState<number>(props.panel.flatGrowthCost);
  const [ panelMultGrowthCost, setPanelMultGrowthCost ] = useState<number>(props.panel.multGrowthCost);

  const [ panelParameters, setPanelParameters ] = useState<PanelParameter[]>(props.panel.panelParameters);
  const [ selectedPanelParameterIndex, setSelectedPanelParameterIndex ] = useState<number>(0);
  const [ panelRewards, setPanelRewards ] = useState<PanelReward[]>(props.panel.panelRewards);

  const [ panelRarity, setPanelRarity ] = useState<number>(props.panel.rarity);

  const debouncedUpdatePanel = useRef(debounce(() =>
    {
      // derive the panel with the new name from the entry.
      const updatedPanel = {
        name: panelName,
        key: panelKey,
        iconIndex: panelIconIndex,
        unlockedByDefault: panelUnlockedByDefault,
        description: panelDescription,
        topFlavorText: panelTopFlavorText,
        maxRank: panelMaxRank,
        baseCost: panelBaseCost,
        flatGrowthCost: panelFlatGrowthCost,
        multGrowthCost: panelMultGrowthCost,
        panelParameters: panelParameters,
        panelRewards: panelRewards,
        rarity: panelRarity,
      } as Panel;

      // update collection panel.
      updatePanel(props.panel.key, updatedPanel);
    }, 1000)
  ).current;

  const handlePanelNameChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelName(event.target.value);
    debouncedUpdatePanel();
  };

  const handlePanelKeyChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelKey(event.target.value);
    debouncedUpdatePanel();
  };

  const handlePanelIconIndexChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelIconIndex(parseInt(event.target.value) ?? -1);
    debouncedUpdatePanel();
  };

  const handlePanelUnlockedByDefaultChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelUnlockedByDefault(event.target.checked);
    debouncedUpdatePanel();
  };

  const handlePanelDescriptionChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelDescription(event.target.value);
    debouncedUpdatePanel();
  };

  const handlePanelTopFlavorTextChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelTopFlavorText(event.target.value);
    debouncedUpdatePanel();
  };

  const handlePanelMaxRankChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelMaxRank(parseInt(event.target.value) ?? -1);
    debouncedUpdatePanel();
  };

  const handlePanelFlatGrowthCostChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelFlatGrowthCost(parseInt(event.target.value) ?? -1);
    debouncedUpdatePanel();
  };

  const handlePanelMultGrowthCostChange = (event: ChangeEvent<HTMLInputElement>) =>
  {
    setPanelMultGrowthCost(parseInt(event.target.value) ?? -1);
    debouncedUpdatePanel();
  };

  const fromParameterIdToIconElement = (parameterId: number) =>
  {
    if (parameterId <= 7)
    {
      return <SportsKabaddi/>;
    }
    else if (parameterId > 7 && parameterId <= 17)
    {
      return <Psychology/>;
    }
    else if (parameterId > 17 && parameterId <= 27)
    {
      return <AddReaction/>;
    }
    else
    {
      return <SportsHandball/>;
    }
  };

  const handleSelectedPanelParameterIndexChange = (index: number) =>
  {
    setSelectedPanelParameterIndex(index);
    console.log(`changed parameter index to ${index}`);
  };

  const handleUpdateParameter = (updatedParameter: PanelParameter) =>
  {
    console.time('parameter update');
    const updatedParameters = panelParameters.map((parameter, index) =>
    {
      return (selectedPanelParameterIndex === index)
        ? updatedParameter
        : parameter;
    });

    setPanelParameters(updatedParameters);
    debouncedUpdatePanel();
    console.timeEnd('parameter update');
  };

  return (props.panel === undefined)
    ? <></>
    : <>
      <Accordion>
        <AccordionSummary
          expandIcon={<ExpandMore/>}
          aria-controls="panel1-content"
        >
          <Typography variant={"h6"}>
            {panelName}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <TextField
            required
            variant={"outlined"}
            label={"Name"}
            value={panelName}
            onChange={handlePanelNameChange}
            size={"small"}
          />
          <TextField
            required
            variant={"outlined"}
            label={"Key"}
            value={panelKey}
            onChange={handlePanelKeyChange}
            size={"small"}
          />
          <TextField
            required
            variant={"outlined"}
            label={"Icon Index"}
            type={"number"}
            value={panelIconIndex}
            onChange={handlePanelIconIndexChange}
            size={"small"}
          />
          <FormControlLabel
            control={
              <Switch
                checked={panelUnlockedByDefault}
                onChange={handlePanelUnlockedByDefaultChange}
                inputProps={{ 'aria-label': 'controlled' }}
              />
            }
            label="Unlocked By Default"/>
          <br/><br/>
          <TextField
            required
            variant={"outlined"}
            label={"Max Rank"}
            type={"number"}
            value={panelMaxRank}
            onChange={handlePanelMaxRankChange}
            size={"small"}
          />
          <TextField
            required
            variant={"outlined"}
            label={"Flat Growth Cost"}
            type={"number"}
            value={panelFlatGrowthCost}
            onChange={handlePanelFlatGrowthCostChange}
            size={"small"}
          />
          <TextField
            required
            variant={"outlined"}
            label={"Mult Growth Cost"}
            type={"number"}
            value={panelMultGrowthCost}
            onChange={handlePanelMultGrowthCostChange}
            size={"small"}
          />
          <br/><br/>
          <TextField
            required
            variant={"outlined"}
            label={"Top Flavor Text"}
            value={panelTopFlavorText}
            fullWidth={true}
            onChange={handlePanelTopFlavorTextChange}
            size={"small"}
          />
          <br/><br/>
          <TextField
            required
            variant={"outlined"}
            label={"Description"}
            value={panelDescription}
            multiline
            rows={3}
            fullWidth={true}
            onChange={handlePanelDescriptionChange}
          />
          <List dense={true} sx={{
            width: '30%',
            maxWidth: 250,
            float: 'left',
            display: 'inline'
          }}>
            {panelParameters.map((panelParameter, index) => (
              <ListItem
                key={`${panelKey}-${panelParameter.parameterId}-${index}`}
              >
                <ListItemButton
                  selected={selectedPanelParameterIndex === index}
                  onClick={event => handleSelectedPanelParameterIndexChange(index)}
                >
                  {fromParameterIdToIconElement(panelParameter.parameterId)}
                  <ListItemText primary={fromLongParameterIdToName(panelParameter.parameterId)}/>
                </ListItemButton>
              </ListItem>))}
          </List>
          <ParameterEditor
            parameter={
              (panelParameters.length > 0)
                ? panelParameters.at(selectedPanelParameterIndex)!
                : null}
            updateParameter={handleUpdateParameter}
            parameterIdToIconElement={fromParameterIdToIconElement}
          />
        </AccordionDetails>
      </Accordion>
    </>
}