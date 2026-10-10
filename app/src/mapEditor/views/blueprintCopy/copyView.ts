import { useEffect, useState, useSyncExternalStore } from 'react';
import { blueprintLinkOf } from '../../core/blueprints/blueprintLink.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, type Blueprint } from '../../core/blueprints/blueprints.ts';
import { BLUEPRINT_USES_DOCUMENT, readableUses, spotsOnMap, type BlueprintSpot } from '../../core/blueprints/blueprintUses.ts';
import { copyGroupOf } from '../../core/blueprints/copyPlans.ts';
import { readCopy, type CopyContext, type CopyReading } from '../../core/blueprints/copyReading.ts';
import type { DocumentHub } from '../../core/history/DocumentHub.ts';
import { mapDocumentKey } from '../../core/model/documentKeys.ts';
import type { EditorDocument } from '../../core/model/EditorDocument.ts';
import type { RmmzMapEvent } from '../../core/model/rmmzTypes.ts';
import { lookAtDocument } from '../../core/sync/lookAtDocument.ts';
import { useMapEditorServices } from '../../services/MapEditorServicesContext.tsx';
import { useHubChanges } from '../commandList/useCommandListState.ts';

/**
 * What a copy's panel can show of it: still waiting for what it is read against, with what it waits for; not to be read,
 * with why; or read, with what it was read against, which every action of the panel reads it against again.
 */
type CopyView =
  | { readonly kind: 'waiting'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly reading: CopyReading; readonly context: CopyContext };

/**
 * The blueprints as a copy's panel holds them: the document once held, or why it could not be.
 */
type HeldBlueprints = {
  readonly document: EditorDocument | null;
  readonly failure: string | null;
};

/**
 * What a copy's panel says while the window opens the blueprints.
 */
const OPENING_BLUEPRINTS = 'Opening the blueprints';

/**
 * What a copy's panel says while the project's plugins are still being read: until then a module's tags read as plain
 * comments, and a number they give would read as set by hand.
 */
const READING_PLUGINS = 'Reading the project\'s plugins';

/**
 * Holds the blueprints for a copy's panel: the window's own copy when it holds them, or else opened once, when the window
 * has a server to read them from. Holding them keeps them live here, so the panel follows every change to a blueprint,
 * made in this window or another, as it lands; the blueprints are written as they change, so holding them keeps nothing
 * unsaved.
 * @param {DocumentHub} hub The window's documents.
 * @returns {HeldBlueprints} The blueprints once held, or why they could not be.
 */
const useHeldBlueprints = (hub: DocumentHub): HeldBlueprints =>
{
  const { api, openDocument } = useMapEditorServices();
  const held = hub.has(BLUEPRINTS_DOCUMENT);
  const [ failure, setFailure ] = useState<string | null>(null);

  useEffect(() =>
  {
    if (held || api === null)
    {
      return undefined;
    }

    // an answer landing after the panel has gone lands nowhere.
    let live = true;
    openDocument(BLUEPRINTS_DOCUMENT).catch((error: unknown) =>
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
  }, [ held, api, openDocument ]);

  return { document: held ? hub.document(BLUEPRINTS_DOCUMENT) : null, failure };
};

/**
 * Finds the placements the record of where blueprints are placed holds on one map, which say which copies were placed
 * together: the window's own record as it stands, when it holds one; or else a look at it, taken once, without holding
 * it, since a window holding the record keeps its placements, and a window with no server has none to look at.
 * @param {DocumentHub} hub The window's documents.
 * @param {number} mapId The map.
 * @returns {readonly BlueprintSpot[]} The placements; none until a look lands, or when none can be had.
 */
const usePlacements = (hub: DocumentHub, mapId: number): readonly BlueprintSpot[] =>
{
  const { api, sync } = useMapEditorServices();
  const held = readableUses(hub);
  const [ looked, setLooked ] = useState<EditorDocument | null>(null);

  useEffect(() =>
  {
    if (held !== null || api === null)
    {
      return undefined;
    }

    // a record that cannot be had leaves the copies' groups unknown, as a change to a blueprint would find them then.
    let live = true;
    lookAtDocument({ hub, sync }, BLUEPRINT_USES_DOCUMENT)
      .then(document =>
      {
        if (live)
        {
          setLooked(document);
        }
      })
      .catch(() => undefined);
    return () =>
    {
      live = false;
    };
  }, [ held, api, hub, sync ]);

  const record = held ?? looked;
  try
  {
    return record === null ? [] : spotsOnMap(record, mapId);
  }
  catch
  {
    // a record that is no record of placements places nothing.
    return [];
  }
};

/**
 * Reads one blueprint out of the blueprints, as a copy's panel names it: none when the blueprints keep none of that id,
 * or keep something under it that is no blueprint, which the Blueprints section says on its own.
 * @param {EditorDocument} document The blueprints.
 * @param {string} blueprintId The blueprint's id.
 * @returns {Blueprint | null} The blueprint, or null.
 */
const blueprintOf = (document: EditorDocument, blueprintId: string): Blueprint | null =>
{
  try
  {
    return blueprintIn(document, blueprintId);
  }
  catch
  {
    return null;
  }
};

/**
 * Reads a copy against its blueprint for its panel, as the window holds both, read afresh on every change to anything
 * the window holds, in this window or another, and once the plugin modules switch on: the blueprints, held for the
 * purpose; the tags the active modules read from comments; and the copy's group, from the placements on its map. Until
 * the plugins have been read the copy waits, since a module's numbers would otherwise read as comments set by hand; a
 * plugin list that cannot be read says so.
 * @param {number} mapId The copy's map.
 * @param {RmmzMapEvent} copy The copy, as the window's map holds it.
 * @returns {CopyView} What the panel can show.
 */
const useCopyView = (mapId: number, copy: RmmzMapEvent): CopyView =>
{
  const { hub, modules } = useMapEditorServices();
  useHubChanges(hub);
  const revision = useSyncExternalStore(modules.subscribe, () => modules.revision);
  const { document: held, failure } = useHeldBlueprints(hub);
  const spots = usePlacements(hub, mapId);

  if (failure !== null)
  {
    return { kind: 'failed', message: `The blueprints could not be read: ${failure}` };
  }

  if (held === null)
  {
    return { kind: 'waiting', message: OPENING_BLUEPRINTS };
  }

  if (revision === 0)
  {
    return modules.listProblem === null
      ? { kind: 'waiting', message: READING_PLUGINS }
      : { kind: 'failed', message: `The project's plugin list can't be read (${modules.listProblem}), so what this copy follows can't be told.` };
  }

  // the copy's group is known by its blueprint's placements on its map, as a change to the blueprint knows it.
  const link = blueprintLinkOf(copy.note);
  const blueprint = link === null ? null : blueprintOf(held, link.blueprintId);
  const references = blueprint === null ? undefined : copyGroupOf(hub.map(mapDocumentKey(mapId)).events, copy, blueprint.stamp, spots);
  const context: CopyContext = {
    blueprint: blueprintId => blueprintOf(held, blueprintId),
    tags: modules.commentTags(),
    ...(references === undefined ? {} : { references }),
  };
  return { kind: 'ready', reading: readCopy(copy, context), context };
};

export { OPENING_BLUEPRINTS, READING_PLUGINS, useCopyView };
export type { CopyView };
