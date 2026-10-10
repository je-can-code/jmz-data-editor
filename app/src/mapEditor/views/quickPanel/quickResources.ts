import { useEffect, useState } from 'react';
import type { MapEditorApi } from '../../core/api/MapEditorApi.ts';
import type { DatabaseNamesJson } from '../../core/commandList/databaseNames.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { MAP_INFOS_KEY } from '../../core/model/documentKeys.ts';
import type { EditorDocument } from '../../core/model/EditorDocument.ts';
import type { RmmzMapInfo } from '../../core/model/rmmzTypes.ts';
import { useProjectNames } from '../commandList/commandListResources.ts';

/**
 * What the quick panel's controls read besides the fields: the server (for pictures), the project's names (for
 * item, weapon and armor pickers), the map tree (for the map picker) and the character sheets (for the graphic
 * picker). Each is null until it arrives, and a control without it falls back to a plain input. The swatches are
 * the colours the kind offers beside its colour settings, and empty for a kind offering none.
 */
type QuickResources = {
  readonly api: MapEditorApi | null;
  readonly names: DatabaseNamesJson | null;
  readonly mapRows: readonly (RmmzMapInfo | null)[] | null;
  readonly sheets: readonly string[] | null;
  readonly swatches: readonly string[];
};

/**
 * Re-renders whenever a document changes, so a panel always shows the document as it stands: after an edit made
 * here, an undo, or another window's change.
 * @param {EditorDocument | null} document The document, or null while there is none.
 * @returns {number} Its revision, or -1 without one.
 */
const useRevision = (document: EditorDocument | null): number =>
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
 * Settles a load into state, unless the component has moved on by the time it lands; a failed load leaves the state
 * as it was, which the controls read as "not available".
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
 * Reads the project's names, asked for once per window and shared with every command list, the switch and variable
 * names kept as they stand in System.json right now.
 * @param {MapEditorApi | null} api The server, or null without one.
 * @returns {DatabaseNamesJson | null} The names, or null until they arrive.
 */
const useDatabaseNames = (api: MapEditorApi | null): DatabaseNamesJson | null =>
{
  return useProjectNames(api);
};

/**
 * Reads the map tree for the map picker: the live one the window holds when it holds it, so a map renamed a moment
 * ago reads with its new name, and otherwise the server's, read once.
 * @param {DocumentHub} hub The window's documents.
 * @param {MapEditorApi | null} api The server, or null without one.
 * @returns {readonly (RmmzMapInfo | null)[] | null} The tree's rows, or null until read.
 */
const useMapRows = (hub: DocumentHub, api: MapEditorApi | null): readonly (RmmzMapInfo | null)[] | null =>
{
  const heldTree = hub.has(MAP_INFOS_KEY);
  const [ loaded, setLoaded ] = useState<readonly (RmmzMapInfo | null)[] | null>(null);
  useEffect(() => settleWhileCurrent(heldTree || api === null ? undefined : api.loadMapInfos(), setLoaded), [ api, heldTree ]);

  return heldTree
    ? hub.document(MAP_INFOS_KEY).valueAt([]) as unknown as (RmmzMapInfo | null)[]
    : loaded;
};

/**
 * Lists the character sheets in {@code img/characters}, for the graphic picker.
 * @param {MapEditorApi | null} api The server, or null without one.
 * @returns {readonly string[] | null} The sheets, or null until listed or when the server cannot list folders.
 */
const useCharacterSheets = (api: MapEditorApi | null): readonly string[] | null =>
{
  const [ sheets, setSheets ] = useState<readonly string[] | null>(null);
  useEffect(() => settleWhileCurrent(api?.listImages?.('characters'), setSheets), [ api ]);
  return sheets;
};

export { useCharacterSheets, useDatabaseNames, useMapRows, useRevision };
export type { QuickResources };
