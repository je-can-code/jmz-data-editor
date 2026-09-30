import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { DocumentHub } from '../core/history/DocumentHub.ts';
import { MAP_INFOS_KEY, mapDocumentKey, TILESETS_KEY } from '../core/model/documentKeys.ts';
import type { EditorDocument } from '../core/model/EditorDocument.ts';
import type { MapDocument } from '../core/model/MapDocument.ts';
import type { RmmzMapInfo, RmmzTileset } from '../core/model/rmmzTypes.ts';
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
 * Counts the times the map tree's file settles: saved here or in another window, or reloaded from disk. The tree
 * lists a map only once the map's file is written, so each settle is a fresh chance for a map that could not be
 * opened.
 * @param {DocumentHub} hub The hub.
 * @returns {number} A number that changes whenever the tree's file settles.
 */
const useTreeSettles = (hub: DocumentHub): number =>
{
  const [ settles, setSettles ] = useState(0);
  useEffect(() => hub.subscribe(event =>
  {
    if ((event.type === 'saved' || event.type === 'reloaded') && event.document === MAP_INFOS_KEY)
    {
      setSettles(current => current + 1);
    }
  }), [ hub ]);

  return settles;
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

/**
 * What a panel knows about a map it shows: its row in the tree, the document once held, whether it has unsaved
 * edits, and why it could not be opened, if it could not.
 */
type HeldMap = {
  readonly row: RmmzMapInfo | null;
  readonly map: MapDocument | null;
  readonly dirty: boolean;
  readonly failure: string | null;
};

/**
 * Holds a map for as long as the tree lists it. A delete lets the document go (the tree service releases it), and
 * an undo lists the map again, which holds it afresh from its restored file. A map that could not be opened is not
 * given up on: it is tried again whenever its row comes back or the tree's file settles, so a panel recovers the
 * moment its map appears.
 * @param {number | null} mapId The map, or null for none.
 * @returns {HeldMap} What the panel knows.
 */
const useHeldMap = (mapId: number | null): HeldMap =>
{
  const controller = useWorkspace();
  const { hub } = controller.services;
  const { tree } = useMapTreeDocument();
  const [ failure, setFailure ] = useState<string | null>(null);
  const treeSettles = useTreeSettles(hub);
  useHubVersion(hub);

  const key = mapId === null ? null : mapDocumentKey(mapId);
  const found = key === null ? null : tree?.valueAt([ mapId as number ]) as RmmzMapInfo | null | undefined;
  const row = found ?? null;
  const map = key !== null && row !== null && hub.has(key) ? hub.map(key) : null;

  // a settle of the tree's file only matters here while the map is listed but not held, which is when it retries.
  useEffect(() =>
  {
    setFailure(null);
    if (key === null || row === null || map !== null)
    {
      return undefined;
    }

    let live = true;
    controller.services.openDocument(key).catch((error: unknown) =>
    {
      if (live)
      {
        setFailure(error instanceof Error ? error.message : String(error));
      }
    });

    return () =>
    {
      live = false;
    };
  }, [ controller, key, row, map, treeSettles ]);

  return { row, map, dirty: key !== null && map !== null && hub.isDirty(key), failure };
};

/**
 * Holds the tilesets for a panel, loading them the first time.
 * @returns {readonly (RmmzTileset | null)[]} The tilesets by id, or none while they load.
 */
const useTilesets = (): readonly (RmmzTileset | null)[] =>
{
  const controller = useWorkspace();
  const { hub } = controller.services;
  useHubVersion(hub);

  useEffect(() =>
  {
    if (controller.services.api !== null && hub.has(TILESETS_KEY) === false)
    {
      controller.services.openDocument(TILESETS_KEY).catch(() => undefined);
    }
  }, [ controller, hub ]);

  // the live rows, read in place: each tileset carries thousands of flags, far too many to copy per render.
  return hub.has(TILESETS_KEY)
    ? hub.document(TILESETS_KEY).valueAt([]) as unknown as (RmmzTileset | null)[]
    : [];
};

export {
  useDocumentRevision,
  useHeldMap,
  useHubVersion,
  useMapTreeDocument,
  useTilesets,
  useWorkspace,
  useWorkspaceState,
  WorkspaceProvider,
};
export type { HeldMap };
