import React from 'react';
import { createRoot } from 'react-dom/client';
import { app, events, init, window as neuWindow } from '@neutralinojs/lib';

import App from './App';

if (import.meta.env.DEV) {
  try {
    // method 1
    const storedToken = sessionStorage.getItem('NL_TOKEN');
    if (storedToken) window.NL_TOKEN = storedToken;

    // method 2
    const authInfo = require('../../.tmp/auth_info.json');
    const { accessToken, port } = authInfo;
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
  } catch {
    console.error(
      'Auth file not found, native API calls will not work.'
    );
  }

}

init();

createRoot(document.getElementById('root')!)
  .render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

async function onWindowClose() {
  await app.exit();
}

await events.on('windowClose', onWindowClose);

await neuWindow.focus();