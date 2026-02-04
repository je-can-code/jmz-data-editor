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
import { APP_ROUTES } from '@platform/compositionRoot/routing.config.tsx';
import { ErrorBoundary } from '../routing/error.boundary.tsx';

const JmzTabsStyles = {
  [ `& .${tabsClasses.indicator}` ]: {
    height: '100%',
    borderRadius: '12px',
    backgroundColor: 'rgba(255, 255, 255, .1)',
  },
};

const AppLayout = () =>
{
  const [ projectPath, setProjectPath ] = useState<string>(defaultDataPath);

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
      current === r.path || current.startsWith(r.path + '/')
    )?.path ?? APP_ROUTES[ 0 ].path;
  }, [ location.pathname ]);

  return <>
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
              onChange={(
                _,
                newValue
              ) =>
              {
                navigate(`${newValue}${location.search}`);
              }}
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
  </>;
};

export default AppLayout;
