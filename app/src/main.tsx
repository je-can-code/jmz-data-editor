import React from 'react';
import { createRoot } from 'react-dom/client';

import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { getJmzHttpApiBase } from './constants/jmzHttpApiBase.ts';
import { HttpJsonStore } from './core/infrastructure/fs/http/HttpJsonStore.ts';
import { setJsonStore } from './services/DataService.ts';
import { BackendGate } from '@presentation/shell/BackendGate.tsx';

// Configure the data layer adapter once at startup.
const httpApiBase = getJmzHttpApiBase();
if (httpApiBase !== null)
{
  setJsonStore(new HttpJsonStore(httpApiBase));
}

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

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline/>
        <BackendGate apiBase={httpApiBase}/>
      </ThemeProvider>
    </React.StrictMode>
  );
