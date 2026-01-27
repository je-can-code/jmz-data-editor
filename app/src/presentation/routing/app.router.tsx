import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRoutes } from "react-router";
import AppLayout from '../shell/app.layout.tsx';
import { APP_ROUTES } from "@platform/compositionRoot/routing.config.tsx";

export const AppRouter = () =>
{
  return useRoutes([
    {
      // The parent route anchors the layout at the root
      path: "/",
      element: <AppLayout/>,
      children: [
        ...APP_ROUTES.map(route => (
          {
            path: route.path.replace(/^\//, ''),
            element: <route.component/>
          }
        )),
        {
          index: true,
          element: <Navigate to="/enemies" replace/>
        },
        {
          path: "*",
          element: <Navigate to="/enemies" replace/>
        }
      ]
    }
  ]);
};
