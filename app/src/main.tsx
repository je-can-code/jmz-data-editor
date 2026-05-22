import React from 'react';
import { createRoot } from 'react-dom/client';

import { CssBaseline, ThemeProvider } from '@mui/material';
import { getJmzHttpApiBase } from './constants/jmzHttpApiBase.ts';
import { HttpJsonStore } from './core/infrastructure/fs/http/HttpJsonStore.ts';
import { setJsonStore } from './services/DataService.ts';
import { BackendGate } from '@presentation/shell/BackendGate.tsx';
import { appTheme } from '@presentation/theme/appTheme.ts';

// Configure the data layer adapter once at startup.
const httpApiBase = getJmzHttpApiBase();
if (httpApiBase !== null)
{
  setJsonStore(new HttpJsonStore(httpApiBase));
}

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <ThemeProvider theme={appTheme}>
        <CssBaseline/>
        <BackendGate apiBase={httpApiBase}/>
      </ThemeProvider>
    </React.StrictMode>
  );
