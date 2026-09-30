import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import type { EditorDocument } from '../core/model/EditorDocument.ts';
import type { WorkspaceController, WorkspaceState } from './WorkspaceController.ts';

/**
 * Carries the workspace's controller to every panel, in the main window and in every torn-out one alike.
 */
const WorkspaceContext = createContext<WorkspaceController | null>(null);

/**
 * Provides the workspace's controller.
 * @param {{ controller: WorkspaceController, children: React.ReactNode }} props The controller and the tree below it.
 * @returns {React.JSX.Element} The provider.
 */
const WorkspaceProvider = (props: { controller: WorkspaceController; children: React.ReactNode }) =>
{
  const { controller, children } = props;
  return (
    <WorkspaceContext.Provider value={controller}>
      {children}
    </WorkspaceContext.Provider>
  );
};

/**
 * Reads the workspace's controller.
 * @returns {WorkspaceController} The controller.
 */
const useWorkspace = (): WorkspaceController =>
{
  const controller = useContext(WorkspaceContext);
  if (controller === null)
  {
    throw new Error('the workspace is missing; render inside WorkspaceProvider');
  }

  return controller;
};

/**
 * Reads one part of the workspace's shared state, re-rendering when it changes.
 * @param {(state: WorkspaceState) => T} select Picks the part; it must hand back the state's own values.
 * @returns {T} The part.
 */
const useWorkspaceState = <T, >(select: (state: WorkspaceState) => T): T =>
{
  const controller = useWorkspace();
  return useSyncExternalStore(controller.subscribe, () => select(controller.getState()));
};

/**
 * Counts the hub's events, so a component re-renders after every step, undo, save or conflict.
 * @param {DocumentHub} hub The hub.
 * @returns {number} A number that changes with every hub event.
 */
const useHubVersion = (hub: DocumentHub): number =>
{
  const [ version, setVersion ] = useState(0);
  useEffect(() => hub.subscribe(() => setVersion(current => current + 1)), [ hub ]);
  return version;
};

/**
 * Reads a document's revision, re-rendering when it changes.
 * @param {EditorDocument | null} document The document, or null while there is none.
 * @returns {number} Its revision, or -1 without one.
 */
const useDocumentRevision = (document: EditorDocument | null): number =>
{
  const [ , setTick ] = useState(0);
  useEffect(() =>
  {
    if (document === null)
    {
      return undefined;
    }

    return document.subscribe(() => setTick(current => current + 1));
  }, [ document ]);

  return document === null
    ? -1
    : document.revision;
};

/**
 * Holds the map tree for a panel: loads it through the tree service, and hands it back once held.
 * @returns {{ tree: EditorDocument | null, failure: string | null }} The tree, or why it could not be loaded.
 */
const useMapTreeDocument = (): { tree: EditorDocument | null; failure: string | null } =>
{
  const controller = useWorkspace();
  const [ state, setState ] = useState<{ tree: EditorDocument | null; failure: string | null }>({ tree: null, failure: null });

  useEffect(() =>
  {
    let live = true;
    if (controller.tree === null)
    {
      setState({ tree: null, failure: 'No project is open, so there are no maps to show.' });
      return undefined;
    }

    controller.tree.tree()
      .then(tree =>
      {
        if (live)
        {
          setState({ tree, failure: null });
        }
      })
      .catch((error: unknown) =>
      {
        if (live)
        {
          setState({ tree: null, failure: `The maps could not be loaded: ${error instanceof Error ? error.message : String(error)}` });
        }
      });

    return () =>
    {
      live = false;
    };
  }, [ controller ]);

  // a tree reloaded from disk is the same document object, so its revision is what changes.
  useDocumentRevision(state.tree);
  return state;
};

export { useDocumentRevision, useHubVersion, useMapTreeDocument, useWorkspace, useWorkspaceState, WorkspaceProvider };
