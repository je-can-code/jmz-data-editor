import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

type BoardActionsValue = {
  onSave: () => void;
  canSave: boolean;
  isSaving: boolean;
  onReload: () => void;
  canReload: boolean;
};

type BoardActionsContextShape = {
  boardActions: BoardActionsValue | null;
  setBoardActions: (actions: BoardActionsValue | null) => void;
};

const BoardActionsContext = createContext<BoardActionsContextShape>({
  boardActions: null,
  setBoardActions: () => {},
});

function BoardActionsProvider({ children }: { children: React.ReactNode })
{
  const [ boardActions, setBoardActions ] = useState<BoardActionsValue | null>(null);

  return (
    <BoardActionsContext.Provider value={{ boardActions, setBoardActions }}>
      {children}
    </BoardActionsContext.Provider>
  );
}

function useBoardActionsContext(): BoardActionsContextShape
{
  return useContext(BoardActionsContext);
}

type UseBoardActionsParams = {
  onSave: () => void;
  canSave: boolean;
  isSaving?: boolean;
  onReload: () => void;
  canReload: boolean;
};

/**
 * Registers this board's Save/Reload actions into the global AppBar.
 * Clears them automatically when the board unmounts.
 */
function useBoardActions({ onSave, canSave, isSaving = false, onReload, canReload }: UseBoardActionsParams): void
{
  const { setBoardActions } = useBoardActionsContext();

  // Keep callback refs current so context values never go stale without
  // the primitives-only effect needing to list them as deps.
  const onSaveRef = useRef(onSave);
  const onReloadRef = useRef(onReload);
  useEffect(() => { onSaveRef.current = onSave; }, [ onSave ]);
  useEffect(() => { onReloadRef.current = onReload; }, [ onReload ]);

  useEffect(() =>
  {
    setBoardActions({
      onSave: () => onSaveRef.current(),
      canSave,
      isSaving,
      onReload: () => onReloadRef.current(),
      canReload,
    });
  }, [ canSave, isSaving, canReload, setBoardActions ]);

  useEffect(() =>
  {
    return () => setBoardActions(null);
  }, [ setBoardActions ]);
}

export { BoardActionsProvider, useBoardActions, useBoardActionsContext };
export type { BoardActionsValue };
