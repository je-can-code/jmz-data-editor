import React, { createContext, useContext } from 'react';
import type { WindowPaint } from '../../../core/tools/WindowPaint.ts';
import { useWorkspace } from '../../workspaceHooks.tsx';

/**
 * Carries the paint a palette and a layer strip pick for, when it is not the page's own.
 */
const PaintScopeContext = createContext<WindowPaint | null>(null);

/**
 * Hands everything inside it a window's paint to pick for: what a torn-out map's own palette and layer strip are
 * wrapped in, so they choose for the map's window and not the main one.
 * @param {{ paint: WindowPaint, children: React.ReactNode }} props The paint, and what picks for it.
 * @returns {React.JSX.Element} The scope.
 */
const PaintScope = (props: { readonly paint: WindowPaint; readonly children: React.ReactNode }) =>
{
  const { paint, children } = props;
  return (
    <PaintScopeContext.Provider value={paint}>
      {children}
    </PaintScopeContext.Provider>
  );
};

/**
 * Reads the paint a palette, a layer strip or a stack view picks for: the scope's, inside a torn-out map's own palette,
 * and the page's own everywhere else, wherever the panel showing them has been torn out to, since the workspace's own
 * palette always picks for the maps of the main window.
 * @returns {WindowPaint} The paint.
 */
const usePaintScope = (): WindowPaint =>
{
  const scoped = useContext(PaintScopeContext);
  const { services } = useWorkspace();
  return scoped ?? services.paints.main;
};

export { PaintScope, usePaintScope };
