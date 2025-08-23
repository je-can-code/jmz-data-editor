import {
  useEffect,
  useState
} from "react";
import {
  Box,
  Grid,
  Paper,
  Tab,
  Tabs,
  tabsClasses
} from "@mui/material";
import {
  AccountTree,
  Android,
  Construction,
  Hub,
  Rule,
  Storage
} from '@mui/icons-material';

import './styles/index.css';
import ProjectPathAppBar from "./components/topbar/ProjectPathAppBar.tsx";
import CraftingBoard from "./boards/crafting/CraftingBoard.tsx";
import SdpBoard from "./boards/sdp/SdpBoard.tsx";
import ProficiencyBoard from "./boards/proficiency/ProficiencyBoard.tsx";
import EnemiesBoard from "./boards/database/enemies/EnemiesBoard.tsx";
import QuestBoard from "./boards/quests/QuestBoard.tsx";
import { SystemService } from "./services/SystemService.ts";

// ================================================================================================
const JmzTabStyles = {
  color: 'grey',
  height: '100%',
  width: "80px",
  minWidth: "80px",
  padding: '6px',
  fontSize: '0.6rem'
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

  const [ pendingSdpSelectKey, setPendingSdpSelectKey ] = useState<string | null>(null);
  //endregion state

  useEffect(() =>
  {
    SystemService.loadSystemData(projectPath)
      .catch(console.error);

  }, [ projectPath ]);

  useEffect(() =>
  {
    const onNavigateToTab = (event: Event) =>
    {
      const custom = event as CustomEvent<{
        tab: string;
        sdpKey?: string
      }>;
      const {
        tab,
        sdpKey
      } = custom.detail ?? {} as any;

      if (tab === 'sdp')
      {
        setCurrentTabIndex(1);

        if (sdpKey && sdpKey.length > 0)
        {
          setPendingSdpSelectKey(sdpKey);

          // First attempt (works when the board is already warm)
          setTimeout(() =>
          {
            window.dispatchEvent(new CustomEvent('jmz:sdp-select-by-key', {
              detail: { key: sdpKey }
            }));
          }, 0);
        }
      }
    };

    const onSdpReady = () =>
    {
      if (pendingSdpSelectKey)
      {
        // Re-emit once SdpBoard says its data is ready
        setTimeout(() =>
        {
          window.dispatchEvent(new CustomEvent('jmz:sdp-select-by-key', {
            detail: { key: pendingSdpSelectKey }
          }));
        }, 0);
      }
    };

    const onSdpSelected = (event: Event) =>
    {
      const custom = event as CustomEvent<{
        key: string
      }>;
      const key = custom.detail?.key ?? '';
      if (key && pendingSdpSelectKey === key)
      {
        setPendingSdpSelectKey(null);
      }
    };

    window.addEventListener('jmz:navigate-to-tab' as any, onNavigateToTab as EventListener);
    window.addEventListener('jmz:sdp-ready' as any, onSdpReady as EventListener);
    window.addEventListener('jmz:sdp-selected' as any, onSdpSelected as EventListener);
    return () =>
    {
      window.removeEventListener('jmz:navigate-to-tab' as any, onNavigateToTab as EventListener);
      window.removeEventListener('jmz:sdp-ready' as any, onSdpReady as EventListener);
      window.removeEventListener('jmz:sdp-selected' as any, onSdpSelected as EventListener);
    };
  }, [ pendingSdpSelectKey ]);

  useEffect(() =>
  {
    if (currentTabIndex === 1 && pendingSdpSelectKey)
    {
      setTimeout(() =>
      {
        window.dispatchEvent(new CustomEvent('jmz:sdp-select-by-key', {
          detail: { key: pendingSdpSelectKey }
        }));
      }, 0);
    }
  }, [ currentTabIndex, pendingSdpSelectKey ]);

  //region actions
  const handleProjectPathUpdate = async (newProjectPath: string) =>
  {
    if (newProjectPath !== '' && newProjectPath.endsWith("/data"))
    {
      // update the project path globally.
      setProjectPath(newProjectPath);
      console.log(`path set to: ${newProjectPath}`);
      await SystemService.loadSystemData(newProjectPath);
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
      <Grid container>
        <Grid size={0.5}>
          <Tabs
            value={currentTabIndex}
            onChange={(_, index) =>
            {
              switch (index)
              {
                case 0:
                  console.log('CRAFTING TAB SELECTED.');
                  break;
                case 1:
                  console.log('SDP TAB SELECTED.');
                  break;
                case 2:
                  console.log('PROFICIENCY TAB SELECTED.');
                  break;
                case 3:
                  console.log('QUESTS TAB SELECTED.');
                  break;
                case 4:
                  console.log('MZ-DB: ENEMIES TAB SELECTED.');
                  break;
                default:
                  console.log('no plugin tab selected.');
                  break;
              }
              setCurrentTabIndex(index);
            }}
            sx={JmzTabsStyles}
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
              label={"Enemies"}
              icon={<span><Storage/><Android/></span>}
              sx={JmzTabStyles}
            />
          </Tabs>
        </Grid>
        <Grid size={11.5}>
          <Paper>
            {handleCurrentTabDisplay()}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  </>;
};