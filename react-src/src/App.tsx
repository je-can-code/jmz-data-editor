import { useState } from "react";
import { Box, Grid2, Paper, Tab, Tabs, tabsClasses } from "@mui/material";
import { Construction, Poll, Android, Storage, AccountTree, Rule, Hub } from '@mui/icons-material';

import './styles/index.css';
import ProjectPathAppBar from "./components/topbar/ProjectPathAppBar.tsx";
import CraftingBoard from "./boards/crafting/CraftingBoard.tsx";
import SdpBoard from "./boards/sdp/SdpBoard.tsx";
import ProficiencyBoard from "./boards/proficiency/ProficiencyBoard.tsx";
import EnemiesBoard from "./boards/database/enemies/EnemiesBoard.tsx";
import QuestBoard from "./boards/quests/QuestBoard.tsx";

// ================================================================================================
const JmzTabStyles = {
  color: 'grey',
  height: '100%',
  width: '100%',
};

const JmzTabsStyles = {
  [`& .${tabsClasses.indicator}`]: {
    height: "100%",
    borderRadius: "12px",
    backgroundColor: "rgba(255, 255, 255, .1)",
  }
};

// ================================================================================================

export default function App()
{
  //region state
  const [ projectPath, setProjectPath ] = useState<string>('/media/exdrive/dev/gaming/ca/chef-adventure/data');
  const [ currentTabIndex, setCurrentTabIndex ] = useState<number>(0);
  //endregion state

  //region actions
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
        return <CraftingBoard projectPath={projectPath}/>;
      case 1:
        return <SdpBoard projectPath={projectPath}/>;
      case 2:
        return <ProficiencyBoard projectPath={projectPath}/>
      case 3:
        return <QuestBoard projectPath={projectPath}/>;
      case 4:
        return <EnemiesBoard projectPath={projectPath}/>
      default:
        return <span>no plugin tab selected.</span>;
    }
  };
  //endregion actions

  return <>
    <Box>
      <ProjectPathAppBar pathGetter={projectPath} pathSetter={handleProjectPathUpdate}/>
      <Grid2 container>
        <Grid2 size={1}>
          <Tabs
            value={currentTabIndex}
            onChange={(_, index) => setCurrentTabIndex(index)}
            sx={{ JmzTabsStyles }}
            orientation={"vertical"}
          >
            <Tab
              label={"Crafting"}
              icon={<Construction/>}
              sx={JmzTabStyles}
            />
            <Tab
              label={"SDP"}
              icon={<Hub/>}
              sx={JmzTabStyles}
            />
            <Tab
              label={"Proficiency"}
              icon={<AccountTree/>}
              sx={JmzTabStyles}
            />
            <Tab
              label={"Quests"}
              icon={<Rule/>}
              sx={JmzTabStyles}
            />
            <Tab
              label={"MZ-DB: Enemies"}
              icon={<><Storage/><Android/></>}
              sx={JmzTabStyles}
            />
          </Tabs>
        </Grid2>
        <Grid2 size={11}>
          <Paper>
            {handleCurrentTabDisplay()}
          </Paper>
        </Grid2>
      </Grid2>
    </Box>
  </>;
};