import React, {useState} from "react";
import {Box, Paper, Tab, Tabs, tabsClasses} from "@mui/material";
import {Construction, Poll, Adjust} from '@mui/icons-material';

import './styles/index.css';
import ProjectPathAppBar from "./components/topbar/ProjectPathAppBar.tsx";
import CraftingBoard from "./boards/crafting/CraftingBoard.tsx";
import SdpBoard from "./boards/sdp/SdpBoard.tsx";
import ProficiencyBoard from "./boards/proficiency/ProficiencyBoard.tsx";

// ================================================================================================
const JmzTabStyles = {
  color: 'grey',
};

// ================================================================================================

export default function App()
{
  const [projectPath, setProjectPath] = useState<string>('/media/exdrive/dev/gaming/ca/chef-adventure/data');

  const [currentTabIndex, setCurrentTabIndex] = useState<number>(0);

  const handleProjectPathUpdate = async (newProjectPath: string) =>
  {
    if (newProjectPath !== '' && newProjectPath.endsWith("/data"))
    {
      // update the project path globally.
      setProjectPath(newProjectPath);
      console.log(`path set to: ${newProjectPath}`);
    }
    else
    {
      // cancelled or otherwise invalid.
      console.log('path not updated.');
    }
  };

  const handleCurrentTabDisplay = () =>
  {
    switch (currentTabIndex)
    {
      case 0:
        return <CraftingBoard projectPath={projectPath} />;
      case 1:
        return <SdpBoard projectPath={projectPath} />;
      case 2:
        return <ProficiencyBoard projectPath={projectPath} />
      default:
        return <span>no plugin tab selected.</span>;
    }
  };

  const handleTabChange = (_: any, index: number) =>
  {
    setCurrentTabIndex(index);
  };

  return (
    <>
      <Box maxHeight={1000}>
        <Box>
          <ProjectPathAppBar pathGetter={projectPath} pathSetter={handleProjectPathUpdate} />
          <Tabs value={currentTabIndex} onChange={handleTabChange}
            sx={{
              [`& .${tabsClasses.indicator}`]: {
                height: "100%",
                borderRadius: "12px",
                backgroundColor: "rgba(255, 255, 255, .1)",
              },
            }}
          >
            <Tab label={"Crafting"} icon={<Construction />} sx={JmzTabStyles} />
            <Tab label={"SDP"} icon={<Poll />} sx={JmzTabStyles} />
            <Tab label={"Proficiencies"} icon={<Adjust />} sx={JmzTabStyles} />
          </Tabs>
        </Box>
        <Paper>
          {handleCurrentTabDisplay()}
        </Paper>
      </Box>
    </>
  );
};