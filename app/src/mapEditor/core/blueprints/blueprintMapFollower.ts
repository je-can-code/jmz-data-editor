import { isOutsideStep, type DocumentHub, type HubEvent } from '../history/DocumentHub.ts';
import { blueprintHistoryKey } from '../history/historyKeys.ts';
import type { HistoryStep } from '../history/HistoryStep.ts';
import { blueprintMapKey, parseDocumentKey, type DocumentKey } from '../model/documentKeys.ts';
import { jsonEquals, type JsonValue } from '../model/json.ts';
import type { Stamp } from '../stamps/stamp.ts';
import { blueprintMapContent, blueprintStampOf } from './blueprintMaps.ts';
import { modeOf } from './blueprintPropagation.ts';
import { BLUEPRINTS_DOCUMENT, blueprintIn, savedBlueprintOf, type Blueprint } from './blueprints.ts';

/**
 * What the history panel calls the step that makes a blueprint what its tab shows, when the author keeps their own
 * changes over a version found on disk.
 */
const KEEP_LABEL = 'Keep my changes';

/**
 * Lists the blueprints held as maps in a window, each with the key it is held under.
 * @param {DocumentHub} hub The window's documents.
 * @returns {{ key: DocumentKey, blueprintId: string }[]} Each blueprint's key and id.
 */
const heldBlueprintMaps = (hub: DocumentHub): { key: DocumentKey; blueprintId: string }[] =>
{
  return hub.documentKeys().flatMap(key =>
  {
    const parsed = parseDocumentKey(key);
    return parsed.kind === 'blueprint-map' ? [ { key, blueprintId: parsed.blueprintId } ] : [];
  });
};

/**
 * Reports whether a step changes the blueprints without changing any blueprint opened as a map: a version found on disk,
 * a rename, a save, a delete, or the undo or redo of one. A change made to a blueprint in its tab changes both at once.
 * @param {HistoryStep} step The step.
 * @returns {boolean} True for such a step.
 */
const changesBlueprintsAlone = (step: HistoryStep): boolean =>
{
  const documents = step.entries.map(entry => entry.document);
  return documents.includes(BLUEPRINTS_DOCUMENT) && documents.every(key => parseDocumentKey(key).kind !== 'blueprint-map');
};

/**
 * Reports whether a step changes any blueprint opened as a map.
 * @param {HistoryStep} step The step.
 * @returns {boolean} True for such a step.
 */
const changesBlueprintMap = (step: HistoryStep): boolean =>
{
  return step.entries.some(entry => parseDocumentKey(entry.document).kind === 'blueprint-map');
};

/**
 * Reads a blueprint as the blueprints hold it, or null when they no longer hold it, or hold something there no blueprint
 * can be read from, which a hand-edited file can.
 * @param {DocumentHub} hub The window's documents; the blueprints must be held.
 * @param {string} blueprintId The blueprint.
 * @returns {Blueprint | null | undefined} The blueprint; null once it is gone; undefined when it cannot be read.
 */
const readHeldBlueprint = (hub: DocumentHub, blueprintId: string): Blueprint | null | undefined =>
{
  try
  {
    return blueprintIn(hub.document(BLUEPRINTS_DOCUMENT), blueprintId);
  }
  catch
  {
    return undefined;
  }
};

/**
 * Keeps every blueprint opened as a map in this window, its tab, in step with the blueprints whenever they change other
 * than by a change made to the blueprint in its tab: a version of the blueprints' file found on disk, the author taking
 * the version on disk over their own, the undo or redo of either, or another window's copy taken over this one's. A tab
 * is laid out from what the blueprints keep, and every edit made there writes the blueprint back as the tab shows it, so
 * a tab left showing an older blueprint would put it back over the newer one with its next edit.
 *
 * - A tab showing its blueprint as the blueprints keep it is left as it is.
 * - A tab with nothing unwritten follows: it is laid out afresh from the blueprint, as a clean map takes the version of
 *   its file found on disk, and the steps that changed it before can no longer be undone, having been made on the older
 *   blueprint.
 * - A tab holding changes not yet written keeps them, and is flagged in conflict with its blueprint as the blueprints now
 *   keep it: it says so, and nothing of it is written until the author chooses, loading the version on disk, which lays
 *   the tab out afresh, or keeping their own (see {@link keepBlueprintMap}).
 * - A tab whose blueprint was deleted on disk is handed to whoever shows it, to close it and say why (see
 *   {@link onDeletedOnDisk}); one taken away by an undo here stays, shown as gone, since another undo brings it back.
 *
 * It also remembers, for each tab, the blueprint as the tab last agreed with it, which is what keeping the tab's own
 * changes builds on.
 */
class BlueprintMapFollower
{
  #hub: DocumentHub;

  /**
   * Everything listening for a blueprint deleted on disk while its tab was held here.
   */
  #deletedListeners = new Set<(blueprintId: string, name: string) => void>();

  /**
   * Each held tab's blueprint as the tab last agreed with it, by blueprint id, its name with it.
   */
  #agreed = new Map<string, Blueprint>();

  #unsubscribe: (() => void) | null = null;

  /**
   * @param {DocumentHub} hub The window's documents.
   */
  constructor(hub: DocumentHub)
  {
    this.#hub = hub;
  }

  /**
   * Starts following the blueprints, noting first which tabs held already agree with them.
   */
  start(): void
  {
    if (this.#unsubscribe === null)
    {
      this.#noteAgreement();
      this.#unsubscribe = this.#hub.subscribe(event => this.#heard(event));
    }
  }

  /**
   * Stops following the blueprints.
   */
  stop(): void
  {
    if (this.#unsubscribe !== null)
    {
      this.#unsubscribe();
      this.#unsubscribe = null;
    }
  }

  /**
   * Listens for a blueprint deleted on disk while its tab was held here, so whoever shows it can close the tab, let go of
   * it, and say why.
   * @param {(blueprintId: string, name: string) => void} listener Called with the blueprint's id and its last name.
   * @returns {() => void} Stops listening.
   */
  onDeletedOnDisk(listener: (blueprintId: string, name: string) => void): () => void
  {
    this.#deletedListeners.add(listener);
    return () =>
    {
      this.#deletedListeners.delete(listener);
    };
  }

  /**
   * Finds a held tab's blueprint as the tab last agreed with it.
   * @param {string} blueprintId The blueprint.
   * @returns {Blueprint | null} The blueprint, or null when no tab of it was ever seen agreeing.
   */
  agreedBlueprint(blueprintId: string): Blueprint | null
  {
    return this.#agreed.get(blueprintId) ?? null;
  }

  /**
   * Hears one event of the window's documents: the blueprints changing without any tab, which every tab follows; a tab
   * taken up, or changed with its blueprint, which agrees with it then.
   * @param {HubEvent} event The event.
   */
  #heard(event: HubEvent): void
  {
    switch (event.type)
    {
      case 'committed':
      case 'undone':
      case 'redone':
        if (changesBlueprintsAlone(event.step))
        {
          this.#follow(event.type === 'committed' && isOutsideStep(event.step));
        }
        else if (changesBlueprintMap(event.step))
        {
          this.#noteAgreement();
        }
        return;
      case 'reloaded':
        if (event.document === BLUEPRINTS_DOCUMENT)
        {
          this.#follow(true);
        }
        return;
      case 'adopted':
        if (event.document === BLUEPRINTS_DOCUMENT)
        {
          // a file read here is the disk's word; another window's copy taken over this one's is not.
          this.#follow(event.source === 'local');
        }
        else if (parseDocumentKey(event.document).kind === 'blueprint-map')
        {
          this.#noteAgreement();
        }
        return;
      default:
        return;
    }
  }

  /**
   * Notes, for every held tab showing its blueprint as the blueprints keep it, that it agrees with it.
   */
  #noteAgreement(): void
  {
    const hub = this.#hub;
    if (hub.has(BLUEPRINTS_DOCUMENT) === false)
    {
      return;
    }

    heldBlueprintMaps(hub).forEach(({ key, blueprintId }) =>
    {
      const blueprint = readHeldBlueprint(hub, blueprintId);
      if (blueprint !== null && blueprint !== undefined && this.#shows(key, blueprint.stamp))
      {
        this.#agreed.set(blueprintId, blueprint);
      }
    });
  }

  /**
   * Brings every held tab in step with its blueprint as the blueprints now keep it (see {@link BlueprintMapFollower}). The
   * window changes the blueprints this way only with no edit open (a version found on disk is taken only then, and a
   * reload, an undo, a redo or another window's copy all wait for the edit to end), so every tab can be laid out afresh
   * at once.
   * @param {boolean} fromDisk True when the change is the disk's: a version found there, or taken over the window's own.
   */
  #follow(fromDisk: boolean): void
  {
    const hub = this.#hub;
    if (hub.has(BLUEPRINTS_DOCUMENT) === false)
    {
      return;
    }

    heldBlueprintMaps(hub).forEach(({ key, blueprintId }) =>
    {
      const blueprint = readHeldBlueprint(hub, blueprintId);
      if (blueprint === undefined)
      {
        return;
      }

      if (blueprint === null)
      {
        if (fromDisk)
        {
          const name = this.#agreed.get(blueprintId)?.name ?? '';
          this.#agreed.delete(blueprintId);
          [ ...this.#deletedListeners ].forEach(listener => listener(blueprintId, name));
        }
        return;
      }

      this.#bringInStep(key, blueprint);
    });
  }

  /**
   * Brings one held tab in step with its blueprint: left as it is when it shows it, laid out afresh when it holds nothing
   * unwritten, and otherwise flagged in conflict with it, its own changes kept.
   * @param {DocumentKey} key The tab.
   * @param {Blueprint} blueprint Its blueprint as the blueprints now keep it.
   */
  #bringInStep(key: DocumentKey, blueprint: Blueprint): void
  {
    const hub = this.#hub;
    if (this.#shows(key, blueprint.stamp))
    {
      // a flag an earlier version raised no longer stands once the tab shows the blueprint again.
      if (hub.conflict(key)?.kind === 'disk')
      {
        hub.clearConflict(key);
      }

      this.#agreed.set(blueprint.id, blueprint);
      return;
    }

    const layout = blueprintMapContent(blueprint.stamp) as unknown as JsonValue;
    if (hub.isDirty(key) || hub.isConflicted(key))
    {
      hub.flagConflict(key, { kind: 'disk', content: layout });
      return;
    }

    hub.reload(key, layout);
    this.#agreed.set(blueprint.id, blueprint);
  }

  /**
   * Reports whether a held tab shows a blueprint's stamp exactly as it lays out.
   * @param {DocumentKey} key The tab.
   * @param {Stamp} stamp The stamp.
   * @returns {boolean} True when it does.
   */
  #shows(key: DocumentKey, stamp: Stamp): boolean
  {
    return jsonEquals(this.#hub.committedContent(key), blueprintMapContent(stamp) as unknown as JsonValue);
  }
}

/**
 * Keeps a tab's own changes over the version of its blueprint found on disk, as the author's choice in its conflict asks:
 * the blueprints take the blueprint as the tab shows it, built on the blueprint as the tab last agreed with it, as one
 * step in its history, written like any change to the blueprints. Its copies are left as they are; one holding what its
 * blueprint no longer predicts reads as changed by hand.
 * @param {DocumentHub} hub The window's documents; the blueprints and the tab must be held.
 * @param {BlueprintMapFollower} follower What knows the blueprint as the tab last agreed with it.
 * @param {string} blueprintId The blueprint.
 * @returns {boolean} True once the blueprints keep the blueprint as the tab shows it; false when they no longer hold it,
 * or the tab never agreed with it, so there is nothing to keep it as.
 */
const keepBlueprintMap = (hub: DocumentHub, follower: Pick<BlueprintMapFollower, 'agreedBlueprint'>, blueprintId: string): boolean =>
{
  const current = readHeldBlueprint(hub, blueprintId);
  const agreed = follower.agreedBlueprint(blueprintId);
  if (current === null || current === undefined || agreed === null)
  {
    return false;
  }

  // a tab already showing the blueprint as the blueprints keep it makes no step at all.
  const map = hub.map(blueprintMapKey(blueprintId));
  const stamp = blueprintStampOf(map, agreed.stamp, modeOf(hub, agreed.stamp.tilesetId));
  const kept = savedBlueprintOf(current.name, stamp)['stamp'];
  hub.edit(KEEP_LABEL, [ blueprintHistoryKey(blueprintId) ], tx =>
  {
    tx.set(BLUEPRINTS_DOCUMENT, [ 'data', 'blueprints', blueprintId, 'stamp' ], kept);
  });
  return true;
};

export { BlueprintMapFollower, KEEP_LABEL, keepBlueprintMap };
