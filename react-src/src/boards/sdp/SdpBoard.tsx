import {
  Accordion,
  AccordionDetails,
  AccordionSummary, Button,
  Grid,
  ListItem,
  ListItemButton,
  ListItemIcon
} from "@mui/material";
import { ListAlt, Subject, ExpandMore, Save } from "@mui/icons-material";
import React, { useEffect, useReducer, useState } from "react";
import { FixedSizeList } from "react-window";

import Panel = Sdp.Panel;
import PanelReward = Sdp.PanelReward;
import PanelParameter = Sdp.PanelParameter;
import { BoardProps } from "../../../types/local/BoardProps";
import { filesystem } from "@neutralinojs/lib";
import PanelEditor from "./PanelEditor.tsx";
import LoadingButton from "@mui/lab/LoadingButton";
import { executeSave } from "../../services/DataService.ts";

const SaveStyles = {
  fontFamily: "monospace",
  position: "absolute",
  top: "15%",
  right: "1%",
};

export default function SdpBoard(boardProps: BoardProps)
{
  const [ canSave, setCanSave ] = useState<boolean>(false);
  const [ saveSnackOpen, setSaveSnackOpen ] = useState<boolean>(false);

  const [ panels, setPanels ] = useState<Panel[]>([]);

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
      const data = await filesystem.readFile(`${projectPath}/config.sdp.json`);
      const parsedPanels = JSON.parse(data) as Panel[];
      if (!ignore && parsedPanels)
      {
        // update the data list.
        setPanels(parsedPanels);

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

  const renderPanels = () =>
  {
    return <>
      {panels.map((panel, index) =>
        <PanelEditor
          key={panel.key}
          panel={panel}
          updatePanel={handleUpdatePanel}
        />
      )}
    </>
  };

  const handleSaveData = async () =>
  {
    // execute the save
    await executeSave(
      boardProps.projectPath,
      "config.sdp.json",
      panels);

    setCanSave(true);
    setSaveSnackOpen(true);
  };

  const handleUpdatePanel = (previousPanelKey: string, updatedPanel: Panel) =>
  {
    console.time('panel update');
    // rebuild the collection of panels- but update the one that was updated.
    const updatedPanels = panels.map(panel =>
    {
      return (panel.key === previousPanelKey)
        ? updatedPanel
        : panel;
    });

    setPanels(updatedPanels);
    console.timeEnd('panel update');
  };

  return <>
    <Grid container spacing={2}>
      <Grid item xs={10}>
        {/* This is over-arching save button- it will save all recipes to disk. */}
        <LoadingButton
          size={"small"}
          color={"secondary"}
          onClick={async () =>
          {
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
        {renderPanels()}
      </Grid>
    </Grid>
  </>
}