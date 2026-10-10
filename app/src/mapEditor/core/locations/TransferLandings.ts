import { MapEditorApiError } from '../api/MapEditorApi.ts';
import { readTransfers, type TransferSpot } from '../eventKinds/transferKind.ts';
import type { DocumentHub } from '../history/DocumentHub.ts';
import { mapDocumentKey, TILESETS_KEY, type DocumentKey } from '../model/documentKeys.ts';
import type { EditorDocument } from '../model/EditorDocument.ts';
import type { TilesetsDocument } from '../model/JsonDocument.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { PassabilityRule } from '../modules/PluginModule.ts';
import type { ActivePages } from '../pageRule/ShownPages.ts';
import { landingGroundOf, landingProblem, type LandingGround, type LandingProblem } from './landingCheck.ts';
import type { MapLocation } from './LocationPicks.ts';

/**
 * What the landings are worked out from: this window's documents, a way to look at one it does not hold, the plugins'
 * rules as they stand, and the page each event shows on a fresh save at the window's clock as it stands.
 */
type LandingSources = {
  readonly hub: Pick<DocumentHub, 'has' | 'document'>;

  /**
   * Reads a document to look at, never to hold, as lookAtDocument does; it rejects with the server's 404 for a file the
   * project lacks.
   */
  readonly look: (key: DocumentKey) => Promise<EditorDocument>;
  readonly rules: () => readonly PassabilityRule[];
  readonly pages: () => ActivePages;

  /**
   * Reports whether the window reads an event on a map as a transfer, as its kinds decide it: a transfer that a plugin's
   * kind claims first, or one on a map whose events are a plugin's patterns, is nobody's transfer.
   */
  readonly claims: (event: RmmzMapEvent, mapId: number) => boolean;
};

/**
 * What every landing is judged by at one time: the plugins' rules, and the page each event shows on a fresh save at the
 * window's clock.
 */
type LandingJudge = {
  readonly rules: readonly PassabilityRule[];
  readonly pages: ActivePages;
};

/**
 * One transfer on a map whose landing fails: the event and where it stands, the transfer, and why.
 */
type FailingLanding = {
  readonly eventId: number;
  readonly x: number;
  readonly y: number;
  readonly spot: TransferSpot;
  readonly problem: LandingProblem;
};

/**
 * A document as the landings last asked for it: on its way, read, missing from the project, or unreadable for some other
 * reason, which a refresh asks about again.
 */
type DocumentRead =
  | { readonly kind: 'reading' }
  | { readonly kind: 'read'; readonly document: EditorDocument }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed' };

/**
 * One map made ready to judge, with what it was made from, so a change to the map or the tilesets since shows.
 */
type BuiltGround = {
  readonly map: MapDocument;
  readonly mapRevision: number;
  readonly tilesets: TilesetsDocument;
  readonly tilesetsRevision: number;
  readonly ground: LandingGround;
};

/**
 * Where the transfers in one window land, judged by the landing check: for each transfer the kind reads, whether the
 * player could stand where it sends them, and why not.
 *
 * A map the window holds is judged as it stands, and heard as it changes. Any other is looked at once, never held, and
 * judged as it stood when read, unsaved edits in another window included; a later change to it on disk is not followed.
 * A map whose file the project lacks is a landing on a map that does not exist. Reading is asked for the first time a
 * landing on a map is, and whoever listens hears once it lands, so a map view draws its marks again then.
 *
 * Every judgement is kept until the map or the tilesets change, or {@link refresh} says the rules or the moment did.
 */
class TransferLandings
{
  #sources: LandingSources;

  #reads = new Map<DocumentKey, DocumentRead>();

  #grounds = new Map<number, BuiltGround>();

  #heard = new Map<DocumentKey, { readonly document: EditorDocument; readonly stop: () => void }>();

  #transfers = new WeakMap<RmmzMapEvent, readonly TransferSpot[]>();

  #listeners = new Set<() => void>();

  #revision = 0;

  #judge: LandingJudge | null = null;

  /**
   * @param {LandingSources} sources What the landings are worked out from.
   */
  constructor(sources: LandingSources)
  {
    this.#sources = sources;
  }

  /**
   * Counts the changes to what the landings say, for React's {@code useSyncExternalStore}.
   * @returns {number} The count.
   */
  get revision(): number
  {
    return this.#revision;
  }

  /**
   * What every landing is judged by now, read from the sources the first time it is asked for after a refresh, and the
   * same object until the next, so whatever judges a map of its own, such as a location picker, can tell when to judge it
   * again without hearing every map being read.
   * @returns {LandingJudge} The rules and the pages.
   */
  get judge(): LandingJudge
  {
    this.#judge ??= { rules: this.#sources.rules(), pages: this.#sources.pages() };
    return this.#judge;
  }

  /**
   * Listens for what the landings say changing: a map read, a map held here changed, or a refresh.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Makes a map handed over whole ready to judge, such as the one a location picker shows.
   * @param {MapDocument} map The map.
   * @param {RmmzTileset} tileset Its tileset.
   * @param {LandingJudge} judge What to judge it by; what every landing is judged by now, unless handed over.
   * @returns {LandingGround} The map, ready to judge.
   */
  groundFor(map: MapDocument, tileset: RmmzTileset, judge: LandingJudge = this.judge): LandingGround
  {
    return landingGroundOf(map, tileset, judge.rules, judge.pages);
  }

  /**
   * Judges where something lands, asking for its map to be read when it has not been.
   * @param {MapLocation} location Where it lands.
   * @returns {LandingProblem | null | undefined} Why the player cannot land there, null when they can, or undefined while
   * its map is being read or could not be.
   */
  problemOf(location: MapLocation): LandingProblem | null | undefined
  {
    const ground = this.#groundOf(location.mapId);
    return ground === undefined
      ? undefined
      : landingProblem(ground, location);
  }

  /**
   * Lists the transfers on a map whose landings fail, as the transfer kind reads each event, in event and page order.
   * Landings on maps still being read are left out until they land.
   * @param {MapDocument} map The map they leave from.
   * @returns {FailingLanding[]} The transfers.
   */
  failingOn(map: MapDocument): FailingLanding[]
  {
    return map.eventIds().flatMap(eventId =>
    {
      const event = map.event(eventId) as RmmzMapEvent;
      return this.transfersOf(event, map.mapId).flatMap(spot =>
      {
        const { mapId, x, y } = spot.model;
        const problem = this.problemOf({ mapId, x, y });
        return problem === undefined || problem === null
          ? []
          : [ { eventId, x: event.x, y: event.y, spot, problem } ];
      });
    });
  }

  /**
   * Reads an event's transfers as the transfer kind does, once for as long as the event stays as it is, and only while
   * the window reads the event as a transfer at all.
   * @param {RmmzMapEvent} event The event.
   * @param {number} mapId The map it is on.
   * @returns {readonly TransferSpot[]} Its transfers; none for an event that is not a transfer.
   */
  transfersOf(event: RmmzMapEvent, mapId: number): readonly TransferSpot[]
  {
    let spots = this.#transfers.get(event);
    if (spots === undefined)
    {
      spots = this.#sources.claims(event, mapId) ? readTransfers(event) ?? [] : [];
      this.#transfers.set(event, spots);
    }

    return spots;
  }

  /**
   * Judges every landing afresh from now on, as when the plugins' rules, their kinds or the moment change, keeping the
   * maps read, and asking again about any that could not be read.
   */
  refresh(): void
  {
    this.#judge = null;
    this.#grounds.clear();
    this.#transfers = new WeakMap();
    [ ...this.#reads ].forEach(([ key, read ]) =>
    {
      if (read.kind === 'failed')
      {
        this.#reads.delete(key);
      }
    });
    this.#notify();
  }

  /**
   * Stops hearing the documents held here.
   */
  stop(): void
  {
    this.#heard.forEach(heard => heard.stop());
    this.#heard.clear();
  }

  /**
   * Makes a map ready to judge, from the map and the tilesets as they stand, keeping it until either changes.
   * @param {number} mapId The map.
   * @returns {LandingGround | null | undefined} The map, null when the project has no such map, or undefined while it or
   * the tilesets are read, or when either could not be, or the map's tileset is missing.
   */
  #groundOf(mapId: number): LandingGround | null | undefined
  {
    const map = this.#documentOf(mapDocumentKey(mapId)) as MapDocument | null | undefined;
    const tilesets = this.#documentOf(TILESETS_KEY) as TilesetsDocument | null | undefined;
    if (map === null)
    {
      return null;
    }

    // a project without its tilesets, or a map on a tileset the project lacks, cannot be judged; nor can a map on its way.
    if (map === undefined || tilesets === null || tilesets === undefined)
    {
      return undefined;
    }

    const tileset = tilesets.tileset(map.tilesetId);
    if (tileset === null)
    {
      return undefined;
    }

    const built = this.#grounds.get(mapId);
    if (built !== undefined
      && built.map === map
      && built.mapRevision === map.revision
      && built.tilesets === tilesets
      && built.tilesetsRevision === tilesets.revision)
    {
      return built.ground;
    }

    const ground = this.groundFor(map, tileset);
    this.#grounds.set(mapId, { map, mapRevision: map.revision, tilesets, tilesetsRevision: tilesets.revision, ground });
    return ground;
  }

  /**
   * Finds a document as it stands: the one this window holds, heard as it changes, or the one looked at, asking for a
   * look the first time.
   * @param {DocumentKey} key The document.
   * @returns {EditorDocument | null | undefined} The document, null when the project lacks its file, or undefined while
   * it is read or could not be.
   */
  #documentOf(key: DocumentKey): EditorDocument | null | undefined
  {
    if (this.#sources.hub.has(key))
    {
      const held = this.#sources.hub.document(key);
      this.#hear(key, held);
      return held;
    }

    // a document no longer held here is read afresh, as it now stands elsewhere.
    this.#forgetHeard(key);
    const read = this.#reads.get(key);
    if (read === undefined)
    {
      this.#read(key);
      return undefined;
    }

    switch (read.kind)
    {
      case 'read':
        return read.document;
      case 'missing':
        return null;
      default:
        return undefined;
    }
  }

  /**
   * Looks at a document, keeping what comes back, and tells whoever listens once it lands.
   * @param {DocumentKey} key The document.
   */
  #read(key: DocumentKey): void
  {
    this.#reads.set(key, { kind: 'reading' });
    this.#sources.look(key)
      .then(document =>
      {
        this.#reads.set(key, { kind: 'read', document });
      })
      .catch((error: unknown) =>
      {
        // the server's 404 is a file the project lacks; anything else is asked about again at the next refresh.
        const missing = error instanceof MapEditorApiError && error.status === 404;
        this.#reads.set(key, missing ? { kind: 'missing' } : { kind: 'failed' });
      })
      .finally(() => this.#notify());
  }

  /**
   * Hears a document this window holds, so the landings on it are judged again as it changes, once for each document.
   * @param {DocumentKey} key The document.
   * @param {EditorDocument} document The document held.
   */
  #hear(key: DocumentKey, document: EditorDocument): void
  {
    const heard = this.#heard.get(key);
    if (heard !== undefined && heard.document === document)
    {
      return;
    }

    heard?.stop();
    this.#heard.set(key, { document, stop: document.subscribe(() => this.#notify()) });
  }

  /**
   * Stops hearing a document no longer held here.
   * @param {DocumentKey} key The document.
   */
  #forgetHeard(key: DocumentKey): void
  {
    const heard = this.#heard.get(key);
    if (heard !== undefined)
    {
      heard.stop();
      this.#heard.delete(key);
    }
  }

  /**
   * Tells every listener the landings changed.
   */
  #notify(): void
  {
    this.#revision += 1;
    [ ...this.#listeners ].forEach(listener => listener());
  }
}

export { TransferLandings };
export type { FailingLanding, LandingJudge, LandingSources };
