import React from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { HashRouter } from 'react-router-dom';
import { AppRouter } from '@presentation/routing/app.router.tsx';
import { AppProviders } from '@presentation/shell/app.providers.tsx';
import { type BackendState, probeBackend } from '@presentation/shell/backendHealth.ts';

type BackendGateProps = {
  /**
   * The API's origin, whose health check the gate asks.
   */
  apiBase: string;
};

/**
 * Holds the editor back until the API answers its health check ready, then starts it on the project the API serves:
 * nothing loads before there is an API to load from, and nothing loads from any folder but the one the API reads and
 * writes. Until then it says where things stand in the editor's place: still asking, no answer, or an API serving no
 * project.
 * @param {BackendGateProps} props The API's origin.
 * @returns {React.JSX.Element} The editor once the API is ready, and otherwise the screen saying why it is not.
 */
const BackendGate = (props: BackendGateProps) =>
{
  const { apiBase } = props;

  const [ state, setState ] = React.useState<BackendState>({ type: 'checking' });

  React.useEffect(() =>
  {
    let cancelled = false;

    // An effect body cannot be async, so the probe is started and not awaited.
    probeBackend(apiBase)
      .then(next =>
      {
        if (cancelled === false)
        {
          setState(next);
        }
      });

    return () =>
    {
      cancelled = true;
    };
  }, [ apiBase ]);

  // the editor starts on the API's own root, so the bar shows the folder actually being edited.
  if (state.type === 'ready')
  {
    return (
      <HashRouter>
        <AppProviders projectRoot={state.projectRoot}>
          <AppRouter/>
        </AppProviders>
      </HashRouter>
    );
  }

  const content = (() =>
  {
    switch (state.type)
    {
      case 'checking':
        return (
          <>
            <CircularProgress/>
            <Typography variant={'h6'}>Checking backend…</Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              Looking for `GET /api/health`.
            </Typography>
          </>
        );
      case 'missing-project-root':
        return (
          <>
            <Typography variant={'h5'}>Backend is up, but project root is missing</Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              Set `JMZ_PROJECT_ROOT` for the Go server and restart it.
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              API base: {state.apiBase}
            </Typography>
          </>
        );
      case 'unreachable':
        return (
          <>
            <Typography variant={'h5'}>Backend not reachable</Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              Start the Go server and try again.
            </Typography>
            <Typography variant={'body2'} color={'text.secondary'}>
              API base: {state.apiBase}
            </Typography>
          </>
        );
    }
  })();

  return (
    <Box sx={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 2,
      p: 2,
      textAlign: 'center',
    }}>
      {content}
    </Box>
  );
};

export { BackendGate };
