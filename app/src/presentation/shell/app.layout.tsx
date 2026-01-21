import React, {
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  Box,
  Grid,
  Paper,
  Tab,
  Tabs,
  tabsClasses
} from '@mui/material';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate
} from 'react-router-dom';
import {
  AccountTree,
  Android,
  Construction,
  Hub,
  Rule,
  Storage,
} from '@mui/icons-material';

import ProjectPathAppBar from '../../components/topbar/ProjectPathAppBar.tsx';
import { SystemService } from '@services/SystemService';
import { defaultDataPath } from '../../constants/PathConstants';
import { registry } from '@platform/compositionRoot/bootstrap';

const JmzTabStyles = {
  color: 'grey',
  height: '100%',
  width: '80px',
  minWidth: '80px',
  padding: '6px',
  fontSize: '0.6rem',
};

const JmzTabsStyles = {
  [`& .${tabsClasses.indicator}`]: {
    height: '100%',
    borderRadius: '12px',
    backgroundColor: 'rgba(255, 255, 255, .1)',
  },
};

const IconMap: Record<string, React.ReactNode> = {
  enemies: <Android fontSize="small"/>, // adjust as you like
  sdp: <Rule fontSize="small"/>,
  quests: <AccountTree fontSize="small"/>,
  crafting: <Construction fontSize="small"/>,
  proficiency: <Hub fontSize="small"/>,
  database: <Storage fontSize="small"/>,
};

export default function AppLayout()
{
  const [ projectPath, setProjectPath ] = useState<string>(defaultDataPath);
  const [ pendingSdpSelectKey, setPendingSdpSelectKey ] = useState<string | null>(null);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() =>
  {
    SystemService.loadSystemData(projectPath)
      .catch(console.error);
  }, [ projectPath ]);

  // Registry-driven board list
  const boards = useMemo(() => registry.all(), []);

  // Tabs are URL-driven: active value = pathname
  const activePath = location.pathname;

  // Handle legacy navigate-to-tab events by routing instead of setting indexes
  useEffect(() =>
  {
    const onNavigateToTab = (event: Event) =>
    {
      const custom = event as CustomEvent<{ tab: string; sdpKey?: string }>;
      const {
        tab,
        sdpKey
      } = custom.detail ?? (
        {} as any
      );

      // Find a board by id matching the requested tab (e.g. 'sdp')
      const dest = boards.find((b) => b.id === tab);
      if (dest)
      {
        const search = sdpKey
          ? `?sdpKey=${encodeURIComponent(sdpKey)}`
          : '';
        navigate(`${dest.path}${search}`);
        if (sdpKey) setPendingSdpSelectKey(sdpKey);
      }
    };

    const onSdpReady = () =>
    {
      if (pendingSdpSelectKey)
      {
        setTimeout(() =>
        {
          window.dispatchEvent(
            new CustomEvent('jmz:sdp-select-by-key', { detail: { key: pendingSdpSelectKey } })
          );
        }, 0);
      }
    };

    window.addEventListener('jmz:navigateToTab' as any, onNavigateToTab);
    window.addEventListener('jmz:sdp-ready' as any, onSdpReady);
    return () =>
    {
      window.removeEventListener('jmz:navigateToTab' as any, onNavigateToTab);
      window.removeEventListener('jmz:sdp-ready' as any, onSdpReady);
    };
  }, [ boards, navigate, pendingSdpSelectKey ]);

  return (
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top app bar (unchanged) */}
      <ProjectPathAppBar projectPath={projectPath} onProjectPathChange={setProjectPath}/>

      {/* Content area: left nav + routed content */}
      <Grid container sx={{
        flex: 1,
        overflow: 'hidden'
      }}>
        {/* Side nav */}
        <Grid item>
          <Paper
            elevation={0}
            sx={{
              height: '100%',
              width: 80,
              borderRadius: 0,
              display: 'flex',
              alignItems: 'stretch'
            }}
          >
            <Tabs
              orientation="vertical"
              value={activePath}
              sx={JmzTabsStyles}
              // When a tab is clicked, React Router handles navigation via Link, so onChange is optional
            >
              {boards.map((b) => (
                <Tab
                  key={b.id}
                  value={b.path}
                  icon={b.icon ?? IconMap[b.id] ?? <Storage fontSize="small"/>}
                  label={b.title}
                  wrapped
                  sx={JmzTabStyles}
                  component={Link as any}
                  to={b.path}
                />
              ))}
            </Tabs>
          </Paper>
        </Grid>

        {/* Routed board content */}
        <Grid item xs sx={{
          height: '100%',
          overflow: 'auto'
        }}>
          <Outlet/>
        </Grid>
      </Grid>
    </Box>
  );
}
