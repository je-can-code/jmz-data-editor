import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { CommandFieldKind } from '../../core/commands/catalogTypes.ts';
import { PluginHeaderStore, type PluginHeaderLibrary } from '../../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import type { RmmzMapInfo } from '../../core/model/rmmzTypes.ts';

/**
 * One row a picker offers: a database row's id and name.
 */
type NamedOption = {
  readonly id: number;
  readonly name: string;
};

/**
 * Lists the rows of a kind of database id (switches, variables, actors, items and the rest), for pickers. Without
 * one, ids are typed as numbers.
 */
type DatabaseNames = (kind: CommandFieldKind) => readonly NamedOption[];

/**
 * What the hand-built editors run on besides the command they edit: the server (faces, maps and plugin sources
 * come through it), the plugin headers, and the database names pickers offer.
 */
type HandBuiltEditorEnvironment = {
  /**
   * The server, or null when none is configured.
   */
  readonly api: MapEditorApi | null;

  /**
   * The plugin headers, which arrive after the editors may already be open.
   */
  readonly headers: PluginHeaderStore;

  /**
   * Database names for pickers; ids are typed as numbers without them.
   */
  readonly names?: DatabaseNames;
};

/**
 * An environment with no server, no headers and no names: every editor still opens, with plain inputs.
 */
const EMPTY_ENVIRONMENT: HandBuiltEditorEnvironment = { api: null, headers: new PluginHeaderStore() };

/**
 * Carries the environment to the editors the registration bound it to.
 */
const EditorEnvironmentContext = createContext<HandBuiltEditorEnvironment>(EMPTY_ENVIRONMENT);

/**
 * Provides the environment to the editors below it.
 * @param {{ environment: HandBuiltEditorEnvironment, children: React.ReactNode }} props The environment and the tree below it.
 * @returns {React.JSX.Element} The provider.
 */
const EditorEnvironmentProvider = (props: { environment: HandBuiltEditorEnvironment; children: React.ReactNode }) =>
{
  const { environment, children } = props;
  return (
    <EditorEnvironmentContext.Provider value={environment}>
      {children}
    </EditorEnvironmentContext.Provider>
  );
};

/**
 * Reads the environment.
 * @returns {HandBuiltEditorEnvironment} The environment.
 */
const useEditorEnvironment = (): HandBuiltEditorEnvironment =>
{
  return useContext(EditorEnvironmentContext);
};

/**
 * Reads the plugin headers, and re-renders when they arrive.
 * @returns {PluginHeaderLibrary} The headers read so far.
 */
const usePluginHeaders = (): PluginHeaderLibrary =>
{
  const { headers } = useEditorEnvironment();
  return useSyncExternalStore(
    listener => headers.subscribe(listener),
    () => headers.library(),
  );
};

/**
 * Lists a kind of database row for a picker.
 * @param {CommandFieldKind} kind The kind of id.
 * @returns {readonly NamedOption[]} The rows; empty without database names.
 */
const useDatabaseOptions = (kind: CommandFieldKind): readonly NamedOption[] =>
{
  const { names } = useEditorEnvironment();
  return names === undefined
    ? []
    : names(kind);
};

/**
 * Settles a load into state, unless the component has moved on by the time it lands. A failed load leaves the
 * state as it was, which every caller reads as "not available".
 * @param {Promise<T> | undefined} pending The load, or undefined when there is none.
 * @param {(value: T) => void} settle Stores what loaded.
 * @returns {() => void} Stops listening for it.
 */
const settleWhileCurrent = <T,>(pending: Promise<T> | undefined, settle: (value: T) => void): (() => void) =>
{
  let current = true;
  pending?.then(value =>
  {
    if (current)
    {
      settle(value);
    }
  }).catch(() => undefined);

  return () =>
  {
    current = false;
  };
};

/**
 * Lists the face sheets in {@code img/faces}.
 * @returns {readonly string[] | null} The sheets, or null until listed or when the server cannot list folders.
 */
const useFaceNames = (): readonly string[] | null =>
{
  const { api } = useEditorEnvironment();
  const [ faces, setFaces ] = useState<readonly string[] | null>(null);
  useEffect(() => settleWhileCurrent(api?.listImages?.('faces'), setFaces), [ api ]);
  return faces;
};

/**
 * Reads the map tree, for map pickers.
 * @returns {readonly (RmmzMapInfo | null)[] | null} The rows, or null until read.
 */
const useMapInfos = (): readonly (RmmzMapInfo | null)[] | null =>
{
  const { api } = useEditorEnvironment();
  const [ infos, setInfos ] = useState<readonly (RmmzMapInfo | null)[] | null>(null);
  useEffect(() => settleWhileCurrent(api?.loadMapInfos(), setInfos), [ api ]);
  return infos;
};

export {
  EditorEnvironmentProvider,
  EMPTY_ENVIRONMENT,
  useDatabaseOptions,
  useEditorEnvironment,
  useFaceNames,
  useMapInfos,
  usePluginHeaders,
};
export type { DatabaseNames, HandBuiltEditorEnvironment, NamedOption };
