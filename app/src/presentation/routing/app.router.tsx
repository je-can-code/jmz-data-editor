import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { registry } from '@platform/compositionRoot/bootstrap';
import { LazyWrap } from './lazywrap.tsx';
import AppLayout from '../shell/app.layout.tsx';

export function AppRouter() {
  const boards = registry.all();
  const firstPath = boards[0]?.path ?? '/';

  return (
    <Routes>
      {/* Parent layout route */}
      <Route element={<AppLayout />}>
        {boards.map(b => (
          <Route
            key={b.id}
            path={b.path}
            element={<LazyWrap loader={b.lazyComponent} />}
          />
        ))}
        {/* default route inside the layout */}
        <Route path="*" element={<Navigate to={firstPath} replace />} />
      </Route>
    </Routes>
  );
}
