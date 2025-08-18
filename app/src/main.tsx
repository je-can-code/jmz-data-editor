import React from 'react';
import { createRoot } from 'react-dom/client';
import { app, events, init, window as neuWindow } from '@neutralinojs/lib';

import App from './App';
import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";

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

if (import.meta.env.DEV)
{
  try
  {
    // method 1
    const storedToken = sessionStorage.getItem('NL_TOKEN');
    if (storedToken) window.NL_TOKEN = storedToken;

    // method 2
    const authInfo = require('../../.tmp/auth_info.json');
    const {
            accessToken,
            port
          } = authInfo;
    window.NL_PORT = port;
    window.NL_TOKEN = accessToken;
    window.NL_ARGS = [
      'bin\\neutralino-linux_x64',
      '',
      '--load-dir-res',
      '--path=.',
      '--export-auth-info',
      '--neu-dev-extension',
      '--neu-dev-auto-reload',
      '--window-enable-inspector',
    ];
  }
  catch
  {
    console.error(
      'Auth file not found, native API calls will not work.'
    );
  }

}

init();

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <ThemeProvider theme={darkTheme}>
      <CssBaseline /> {/* This normalizes styles and applies the theme's background */}
      <App/>
      </ThemeProvider>
    </React.StrictMode>
  );

function onWindowClose()
{
  app.exit().then(r => null);
}

events.on('windowClose', onWindowClose).then(r => null);

neuWindow.focus().then(r => null);