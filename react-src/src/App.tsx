import React, {useState} from "react";
import {Box, Paper, Tab, Tabs, tabsClasses} from "@mui/material";
import {Construction, SimCard} from '@mui/icons-material';

import './styles/index.css';
import ProjectPathAppBar from "./topbar/ProjectPathAppBar.tsx";
import CraftingBoard from "./boards/crafting/CraftingBoard.tsx";

// ================================================================================================
const JmzTabStyles = {
  color: 'grey',
};

// ================================================================================================

export default function App()
{
  const [projectPath, setProjectPath] = useState<string>('');

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
            <Tab label={"crafting"} icon={<Construction />} sx={JmzTabStyles} />
            <Tab label={"SDP"} icon={<SimCard />}/>
          </Tabs>
        </Box>
        <Paper>
          {handleCurrentTabDisplay()}
        </Paper>
      </Box>
    </>
  );
};