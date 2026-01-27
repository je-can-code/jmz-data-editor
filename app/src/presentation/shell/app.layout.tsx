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
  Outlet,
  useLocation,
  useNavigate
} from 'react-router-dom';

import ProjectPathAppBar from '../../components/topbar/ProjectPathAppBar.tsx';
import { SystemService } from '@services/SystemService';
import { defaultDataPath } from '../../constants/PathConstants';
import { APP_ROUTES } from "@platform/compositionRoot/routing.config.tsx";
import { ErrorBoundary } from "../routing/error.boundary.tsx";

const JmzTabsStyles = {
  [`& .${tabsClasses.indicator}`]: {
    height: '100%',
    borderRadius: '12px',
    backgroundColor: 'rgba(255, 255, 255, .1)',
  },
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

  const activePath = useMemo(() =>
  {
    const current = location.pathname;
    return APP_ROUTES.find(r =>
      current === r.path || current.startsWith(r.path + "/")
    )?.path ?? APP_ROUTES[0].path;
  }, [ location.pathname ]);

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
      const dest = APP_ROUTES.find((b) => b.id === tab);
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

    window.addEventListener('jmz:navigate-to-tab' as any, onNavigateToTab);
    window.addEventListener('jmz:sdp-ready' as any, onSdpReady);
    return () =>
    {
      window.removeEventListener('jmz:navigate-to-tab' as any, onNavigateToTab);
      window.removeEventListener('jmz:sdp-ready' as any, onSdpReady);
    };
  }, [ navigate, pendingSdpSelectKey ]);

  // @ts-ignore
  // @ts-ignore
  return (
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top app bar */}
      <ProjectPathAppBar projectPath={projectPath} onProjectPathChange={setProjectPath}/>

      {/* Content area: left nav + routed content */}
      <Grid container sx={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {/* Side nav */}
        <Grid sx={{
          width: 80,
          height: '100%'
        }}>
          <Paper elevation={0} sx={{
            height: '100%',
            borderRadius: 0
          }}>
            <Tabs
              orientation="vertical"
              value={activePath}
              onChange={(_, newValue) => navigate(newValue)}
              sx={JmzTabsStyles}
            >
              {APP_ROUTES.map((route) => (
                <Tab
                  key={route.id}
                  value={route.path}
                  // @ts-ignore
                  icon={route.icon}
                  label={route.title}
                />
              ))}
            </Tabs>
          </Paper>
        </Grid>

        {/* Routed board content */}
        <Grid sx={{
          flex: 1,
          height: '100%',
          overflow: 'auto',
          minWidth: 0
        }}>
          <ErrorBoundary>
            <Outlet/>
          </ErrorBoundary>
        </Grid>
      </Grid>
    </Box>
  );
}
