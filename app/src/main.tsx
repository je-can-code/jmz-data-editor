import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  app,
  events,
  init,
  window as neuWindow
} from '@neutralinojs/lib';

import {
  createTheme,
  CssBaseline,
  ThemeProvider
} from "@mui/material";
import { NeutralinoJsonStore } from "./core/infrastructure/fs/neutralino/NeutralinoJsonStore.ts";
import { setJsonStore } from "./services/DataService.ts";
import { HashRouter } from 'react-router-dom';
import { AppRouter } from "./presentation/routing/app.router.tsx";
import { AppProviders } from "./presentation/shell/app.providers.tsx";

// Create a dark theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#90caf9',
    },
    secondary: {
      main: '#f48fb1',
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
});

// configure the data layer adapter once at startup.
setJsonStore(new NeutralinoJsonStore());

function tryLoadDevAuth()
{
  if (!import.meta.env.DEV)
  {
    return;
  }

  try
  {
    // Fast path: session storage from a previous successful run/HMR
    const storedToken = sessionStorage.getItem('NL_TOKEN');
    const storedPort = sessionStorage.getItem('NL_PORT');

    if (storedToken)
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (
        window as any
      ).NL_TOKEN = storedToken;
    }
    if (storedPort)
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (
        window as any
      ).NL_PORT = Number(storedPort);
    }

    // Non-blocking fetch: if your Vite server doesn’t serve .tmp, this simply no-ops.
    fetch('/.tmp/auth_info.json', { cache: 'no-store' })
      .then(async res =>
      {
        if (!res.ok) return;

        const authInfo = await res.json();
        const {
          accessToken,
          port
        } = authInfo ?? {};

        if (accessToken && port)
        {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (
            window as any
          ).NL_TOKEN = accessToken;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (
            window as any
          ).NL_PORT = port;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (
            window as any
          ).NL_ARGS = [
            'bin\\neutralino-linux_x64',
            '',
            '--load-dir-res',
            '--path=.',
            '--export-auth-info',
            '--neu-dev-extension',
            '--neu-dev-auto-reload',
            '--window-enable-inspector',
          ];

          sessionStorage.setItem('NL_TOKEN', accessToken);
          sessionStorage.setItem('NL_PORT', String(port));
        }
      })
      .catch(() =>
      {
        // Swallow network errors silently during dev
      });
  }
  catch
  {
    // Ignore unexpected issues; avoid loud dev logs
  }
}

function retryAsync<T>(fn: () => Promise<T>, attempts = 8, delayMs = 200): Promise<T | null>
{
  return new Promise(resolve =>
  {
    let tries = 0;

    const run = () =>
    {
      fn()
        .then(result => resolve(result))
        .catch(() =>
        {
          tries++;
          if (tries >= attempts)
          {
            resolve(null);
          }
          else
          {
            setTimeout(run, delayMs);
          }
        });
    };

    run();
  });
}

if (import.meta.env.DEV)
{
  tryLoadDevAuth();
}

try
{
  init();
}
catch (ex)
{
  console.warn(ex);
}

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline/>
        <HashRouter>
          <AppProviders>
            <AppRouter/>
          </AppProviders>
        </HashRouter>
      </ThemeProvider>
    </React.StrictMode>
  );

function onWindowClose()
{
  app.exit()
    .then(r => null)
    .catch(() => null);
}

retryAsync(() => events.on('windowClose', onWindowClose), 8, 200)
  .then(() => null);

retryAsync(() => neuWindow.focus(), 6, 200)
  .then(() => null);
