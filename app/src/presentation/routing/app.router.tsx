import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRoutes } from 'react-router';
import AppLayout from '../shell/app.layout.tsx';
import { APP_ROUTES } from '@platform/compositionRoot/routing.config.tsx';

export const AppRouter = () =>
{
  return useRoutes([
    {
      path: '/',
      element: <AppLayout/>,
      children: [
        ...APP_ROUTES.map(route => (
          {
            path: route.path.replace(/^\//, ''),
            element: <route.component/>
          }
        )),
        {
          path: '*',
          index: true,
          element: <Navigate to="/" replace/>
        }
      ]
    }
  ]);
};
