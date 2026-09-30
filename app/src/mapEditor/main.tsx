import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { getJmzHttpApiBase } from '../constants/jmzHttpApiBase.ts';
import { appTheme } from '../presentation/theme/appTheme.ts';
import { MapEditorApp } from './MapEditorApp.tsx';
import { browserEnvironment, createMapEditorServices } from './services/MapEditorServices.ts';
import { MapEditorServicesProvider } from './services/MapEditorServicesContext.tsx';
import { titleFor } from './views/mapEditorViews.ts';

// build this window's services first: the shell handshake and the sync channel should be live before anything renders.
const services = createMapEditorServices(browserEnvironment(getJmzHttpApiBase()));
services.start();
document.title = titleFor(services.view);

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <ThemeProvider theme={appTheme}>
        <CssBaseline/>
        <MapEditorServicesProvider services={services}>
          <MapEditorApp/>
        </MapEditorServicesProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
