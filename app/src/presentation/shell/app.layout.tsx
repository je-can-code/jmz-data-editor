import React, { useMemo, useState } from 'react';
import {
  Box,
  Collapse,
  Grid,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Paper,
} from '@mui/material';
import { ExpandLess, ExpandMore } from '@mui/icons-material';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import ProjectPathAppBar from '../../components/topbar/ProjectPathAppBar.tsx';
import { APP_ROUTES } from '@platform/compositionRoot/routing.config.tsx';
import { BOARD_GROUPS, type BoardGroup } from '@platform/registry/board.interfaces.ts';
import { ErrorBoundary } from '../routing/error.boundary.tsx';
import GlobalBottomBar from '../../components/bottombar/bottom-bar.global.tsx';

/**
 * Width of the navigation rail. Wide enough for a label beside its icon, which is what lets the rail
 * carry section headers without the entries becoming ambiguous.
 */
const NAV_WIDTH = 210;

const AppLayout = () =>
{
  const location = useLocation();
  const navigate = useNavigate();

  // sections start open; collapsing is for getting the half you are not using out of the way, not a
  // state anyone should have to restore on every launch.
  const [ collapsedGroups, setCollapsedGroups ] = useState<BoardGroup[]>([]);

  const activePath = useMemo(() =>
  {
    const current = location.pathname;
    return APP_ROUTES.find(r =>
      current === r.path || current.startsWith(r.path + '/')
    )?.path ?? APP_ROUTES[ 0 ].path;
  }, [ location.pathname ]);

  // a board with no group is pinned above every section; that is how the index stays on top.
  const ungroupedBoards = useMemo(
    () => APP_ROUTES.filter(route => route.group === undefined),
    []
  );

  const toggleGroup = (group: BoardGroup) =>
  {
    setCollapsedGroups(previous => (previous.includes(group)
      ? previous.filter(entry => entry !== group)
      : [ ...previous, group ]));
  };

  const goToBoard = (path: string) =>
  {
    navigate(`${path}${location.search}`);
  };

  const renderBoardItem = (route: typeof APP_ROUTES[number], inset: boolean) => (
    <ListItemButton
      key={route.id}
      selected={route.path === activePath}
      onClick={() => goToBoard(route.path)}
      sx={{
        borderRadius: '8px',
        mx: 0.5,
        pl: inset
          ? 2
          : 1.5,
      }}
    >
      <ListItemIcon sx={{ minWidth: 34 }}>
        {route.icon}
      </ListItemIcon>
      <ListItemText
        primary={route.title}
        slotProps={{ primary: { variant: 'body2', noWrap: true } }}
      />
    </ListItemButton>
  );

  return <>
    <Box sx={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Top app bar */}
      <ProjectPathAppBar/>

      {/* Content area: left nav + routed content */}
      <Grid container sx={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
      }}>
        {/* Side nav */}
        <Grid sx={{
          width: NAV_WIDTH,
          flexShrink: 0,
          height: '100%'
        }}>
          <Paper elevation={0} sx={{
            height: '100%',
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* the rail scrolls on its own. Without this, a rail taller than the window simply loses
                its last entries off the bottom with nothing to indicate they exist. */}
            <List dense sx={{ flex: 1, overflowY: 'auto', py: 0.5 }}>
              {ungroupedBoards.map(route => renderBoardItem(route, false))}

              {BOARD_GROUPS.map(group =>
              {
                const boards = APP_ROUTES.filter(route => route.group === group);
                if (boards.length === 0)
                {
                  return null;
                }

                const isCollapsed = collapsedGroups.includes(group);

                return (
                  <Box key={group}>
                    <ListSubheader
                      onClick={() => toggleGroup(group)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        userSelect: 'none',
                        bgcolor: 'transparent',
                        lineHeight: '32px',
                        fontSize: '0.7rem',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {group}
                      {isCollapsed
                        ? <ExpandMore fontSize={'small'}/>
                        : <ExpandLess fontSize={'small'}/>}
                    </ListSubheader>

                    <Collapse in={isCollapsed === false} timeout={'auto'} unmountOnExit>
                      {boards.map(route => renderBoardItem(route, true))}
                    </Collapse>
                  </Box>
                );
              })}
            </List>
          </Paper>
        </Grid>

        {/* Routed board content: boards own internal scroll (sidebar + main split). */}
        <Grid sx={{
          flex: 1,
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <ErrorBoundary>
            <Box sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              <Outlet/>
            </Box>
          </ErrorBoundary>
        </Grid>
      </Grid>

      {/* Bottom Bar */}
      <GlobalBottomBar/>
    </Box>
  </>;
};

export default AppLayout;
