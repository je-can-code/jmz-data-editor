import { CHANNEL_NAMES, openBroadcastChannel, type ChannelFactory } from '../../core/infrastructure/messaging/MessageChannelLike.ts';
import { pageWindowShell, type WindowShell } from '../../core/infrastructure/shell/WindowShell.ts';
import { apiDocumentStore } from '../core/api/apiDocumentStore.ts';
import { HttpMapEditorApi, type MapEditorApi } from '../core/api/MapEditorApi.ts';
import { BlueprintCopyCounter } from '../core/blueprints/blueprintCopies.ts';
import { BlueprintMapFollower, keepBlueprintMap } from '../core/blueprints/blueprintMapFollower.ts';
import { holdBlueprintMap } from '../core/blueprints/blueprintMaps.ts';
import { blueprintPropagationCheck } from '../core/blueprints/blueprintPropagation.ts';
import { BLUEPRINTS_DOCUMENT } from '../core/blueprints/blueprints.ts';
import { blueprintShapeCheck } from '../core/blueprints/blueprintShape.ts';
import { BlueprintWriter } from '../core/blueprints/blueprintWriter.ts';
import { CopyMaps } from '../core/blueprints/copyMaps.ts';
import { installCloseGuard, unsavedOnlyHere, type CloseTarget } from '../core/closeGuard.ts';
import { registerBuiltInCommands } from '../core/commands/builtin/builtInCommands.ts';
import { CommandCatalog } from '../core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../core/commands/CommandEditorRegistry.ts';
import type { PluginHeaderStore } from '../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { DocumentHub } from '../core/history/DocumentHub.ts';
import type { LocationPicks } from '../core/locations/LocationPicks.ts';
import { parseDocumentKey, projectPathForDocument, SYSTEM_KEY, type DocumentKey } from '../core/model/documentKeys.ts';
import type { EditorDocument } from '../core/model/EditorDocument.ts';
import { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { WindowPageRule } from '../core/pageRule/WindowPageRule.ts';
import { localViewStore, RememberedView, rememberedViewKey, type ViewStore } from '../core/preview/RememberedView.ts';
import { WindowPreview } from '../core/preview/WindowPreview.ts';
import { StampHistory } from '../core/stamps/StampHistory.ts';
import { WindowClock } from '../core/time/WindowClock.ts';
import { WindowPaints } from '../core/tools/WindowPaint.ts';
import { FileChangeFeed, openEventSource, type EventSourceFactory } from '../core/sync/FileChangeFeed.ts';
import { FileChangeRouter } from '../core/sync/fileChangeRouting.ts';
import { SharedFileChangeFeed, type LockManagerLike } from '../core/sync/SharedFileChangeFeed.ts';
import { SyncPeer } from '../core/sync/SyncPeer.ts';
import { SystemNamesFollower } from '../core/sync/SystemNamesFollower.ts';
import { projectNamesOf } from '../views/commandList/commandListResources.ts';
import { parseMapEditorView, type MapEditorView } from '../views/mapEditorViews.ts';
import { wireCommandEditing } from './commandEditing.ts';
import { registerCoreEventKinds } from './coreEventKinds.ts';
import { isModuleConfigFile, ModuleActivation } from './pluginModules.ts';

/**
 * Everything one map editor window runs on. Later packages reach these through the services context rather than
 * making their own, so every window has exactly one hub, one sync peer and one view of the change stream.
 */
type MapEditorServices = {
  /**
   * This window's id: it prefixes step ids and marks this window's saves.
   */
  readonly clientId: string;

  /**
   * What this window shows.
   */
  readonly view: MapEditorView;

  /**
   * The server client, or null when no server is configured.
   */
  readonly api: MapEditorApi | null;

  /**
   * This window's documents and histories.
   */
  readonly hub: DocumentHub;

  /**
   * The link to every other map editor window.
   */
  readonly sync: SyncPeer;

  /**
   * How this window opens others.
   */
  readonly shell: WindowShell;

  /**
   * Every command the editor can describe.
   */
  readonly catalog: CommandCatalog;

  /**
   * The hand-built command editors, all eight registered.
   */
  readonly commandEditors: CommandEditorRegistry;

  /**
   * The plugin headers read so far. The plugin command editor reads them, and the catalog gains an entry for every
   * command they declare, so a list redraws when they change.
   */
  readonly pluginHeaders: PluginHeaderStore;

  /**
   * The asks to pick a place on a map, such as the transfer editor's "pick on the map", which this window's location
   * picker shows and settles.
   */
  readonly locationPicks: LocationPicks;

  /**
   * The event kinds and plugin modules; the core's kinds (chests, transfers, dialogue, decor) are registered from
   * the start, and the shipped modules switch on once a started window has read which plugins are enabled.
   */
  readonly modules: PluginModuleRegistry;

  /**
   * What each window paints with, by window: the tool, the brush the palette or the eyedropper handed over, and the
   * layer strip's choice. The page's own window has its paint from the start, shared by its palette, its layer strip and
   * every map docked in it; a map torn out into a window of its own paints with that window's, and its palette there
   * picks for that window alone.
   */
  readonly paints: WindowPaints;

  /**
   * Every stamp copied in this window this session, newest first: what the Stamps panel lists, what Ctrl+V places the
   * newest of on any map in the window, torn-out ones included, and what the stamp tool's stamps are picked from.
   */
  readonly stamps: StampHistory;

  /**
   * How many copies of each blueprint stand across the project, counted from the maps' notes: the maps this window holds
   * as they stand here, the maps only other windows hold as they stand there, unsaved copies and all, and the rest as the
   * server reads them on disk, read again whenever a map's file changes. Nothing is counted until the Blueprints section
   * first asks, or an undo that would take a blueprint away does, or a blueprint opens as a map here.
   */
  readonly blueprintCopies: BlueprintCopyCounter;

  /**
   * The maps a change to a blueprint open here may reach, as their files hold them: gathered whenever a blueprint opens as
   * a map in this window, those another window holds brought in, those nobody holds read from disk. Every change to the
   * blueprint is planned against them, and reaches every copy as part of the same step (see blueprintPropagationCheck).
   */
  readonly copyMaps: CopyMaps;

  /**
   * Writes every change to a blueprint made, undone or redone here to disk, the blueprints and every map it reached in one
   * act, a moment after it is made; null in a window with no server to write through, whose changes reach no file.
   */
  readonly blueprintWriter: BlueprintWriter | null;

  /**
   * Keeps every blueprint opened as a map here in step with the blueprints when they change other than through it: a
   * version found on disk, or the author taking the version on disk over their own. A tab with nothing unwritten follows;
   * one holding changes not yet written waits for the author's choice; one whose blueprint was deleted on disk is handed to
   * whoever shows it, to close.
   */
  readonly blueprintMaps: BlueprintMapFollower;

  /**
   * The time of day the window shows, and the season: one clock for every map view in it, torn-out windows included. It
   * starts at the game's own starting time once a plugin module offering a clock switches on, and keeps the hour the
   * author picks; it stays in the season the game starts in until the author picks another, which moves the date every
   * page is judged at. Like the preview, both are remembered between sessions for this project on this machine.
   */
  readonly clock: WindowClock;

  /**
   * The rule every map view in the window picks each event's page by: the game's own, on a fresh save, at the window's
   * clock and preview, with the conditions the plugin modules add. The party a new game seats is read once the window
   * starts, and again whenever the project's System.json or Actors.json changes on disk.
   */
  readonly pages: WindowPageRule;

  /**
   * How far along the story the author asks every map in the window to show the game: the switches turned on and the
   * variables set, which the page rule judges every event's pages against in place of a fresh save's. It is never
   * written into the game's data. Like the clock, it is remembered between sessions for this project on this machine,
   * and shared live by every window.
   */
  readonly preview: WindowPreview;

  /**
   * Reads what command editing needs from the server, once per window however often it is asked: the plugin
   * headers, whose commands join the catalog, and the database names the editors' pickers offer. A window that
   * never shows a command list never asks. Never rejects.
   * @returns {Promise<void>} Settles once both have been read.
   */
  loadCommandResources(): Promise<void>;

  /**
   * Holds a document: the live copy from another window when one holds it, the file otherwise. It first gives
   * the other windows time to answer this window's hello, so a window that has just opened never mistakes
   * "nobody answered yet" for "nobody holds it" and loads a file that is missing another window's edits; a window
   * holding the document that answers ends that wait at once, so its copy is asked for straight away. A blueprint
   * opened as a map has no file: with no other window holding it, it is laid out afresh from the blueprints, which are
   * held first. A map is opened only once every change to a blueprint this window has on its way to disk has landed,
   * since one may be on its way to that very map's file, which read before it lands would open without it.
   * @param {DocumentKey} key The document.
   * @returns {Promise<EditorDocument>} The document.
   */
  openDocument(key: DocumentKey): Promise<EditorDocument>;

  /**
   * Settles a document's conflict the way the person chose: keep this window's copy, or take the other one (the
   * file on disk, or another window's copy). A blueprint's tab kept over a version of its blueprint found on disk makes
   * the blueprint what the tab shows, written like any change to the blueprints; taking the version on disk lays the tab
   * out afresh from it.
   * @param {DocumentKey} key The document.
   * @param {'mine' | 'theirs'} choice Which copy to keep.
   * @returns {boolean} True when there was a conflict to settle that way.
   */
  resolveConflict(key: DocumentKey, choice: 'mine' | 'theirs'): boolean;

  /**
   * Starts syncing, watching for changes, guarding against closing with unsaved edits, and switching on the plugin
   * modules once js/plugins.js is read, and afresh whenever a config file one of them reads changes on disk, with the
   * window's clock following the starting time a module offers, and the page rule reading what a new game starts with.
   * The switch and variable names follow System.json as it stands in whichever window renames them, and the clock and
   * the preview come back as this project last left them, kept in step with every other window from then on. Once the
   * blueprints' copies are being counted, every map changed on disk has them counted again. A blueprint opened as a map
   * has the maps its copies stand on gathered, and a map file changed on disk among them read again; the window asks
   * before closing while a change to a blueprint is still on its way to disk. When the page goes, it stops, which tells
   * the other windows at once that this one no longer holds anything.
   */
  start(): void;

  /**
   * Stops all of it.
   */
  stop(): void;
};

/**
 * What the services take from the page; tests stand in for all of it.
 */
type MapEditorEnvironment = {
  /**
   * The Go server's origin, or null when none is configured.
   */
  readonly apiBase: string | null;

  /**
   * The page's query string, which says what the window shows.
   */
  readonly search: string;

  /**
   * Makes this window's id.
   */
  readonly createClientId: () => string;

  /**
   * Opens channels to the other windows.
   */
  readonly openChannel: ChannelFactory;

  /**
   * Opens the change stream.
   */
  readonly openEventSource: EventSourceFactory;

  /**
   * The lock manager that elects the window watching the stream, or null where there is none.
   */
  readonly locks: LockManagerLike | null;

  /**
   * The window's shell.
   */
  readonly shell: WindowShell;

  /**
   * The window the close guard listens on.
   */
  readonly closeTarget: CloseTarget;

  /**
   * The fetch the API client uses.
   */
  readonly fetch?: typeof fetch;

  /**
   * Opens where a project's clock and preview are remembered between sessions, by the project's root folder. Left out,
   * nothing is remembered, and the clock and preview are this window's alone.
   */
  readonly rememberedView?: (projectRoot: string) => ViewStore;
};

/**
 * The file the switch and variable names live in, as the change stream names it.
 */
const SYSTEM_FILE = projectPathForDocument(SYSTEM_KEY);

/**
 * The files a new game's party is read from, as the change stream names them: a change to either reads it again.
 */
const NEW_GAME_FILES: ReadonlySet<string> = new Set([ SYSTEM_FILE, 'data/Actors.json' ]);

/**
 * Builds the page's own environment: the real channels, stream, locks, shell and window.
 * @param {string | null} apiBase The Go server's origin.
 * @returns {MapEditorEnvironment} The environment.
 */
const browserEnvironment = (apiBase: string | null): MapEditorEnvironment =>
{
  return {
    apiBase,
    search: window.location.search,
    createClientId: () => crypto.randomUUID(),
    openChannel: name =>
    {
      const channel = openBroadcastChannel(name);
      if (channel === null)
      {
        throw new Error('this browser has no BroadcastChannel, which the map editor needs');
      }

      return channel;
    },
    openEventSource,
    locks: navigator.locks === undefined
      ? null
      : navigator.locks as unknown as LockManagerLike,
    shell: pageWindowShell(),
    closeTarget: window,
    rememberedView: projectRoot => localViewStore(window, rememberedViewKey(projectRoot)),
  };
};

/**
 * Builds one window's services. Nothing runs until {@link MapEditorServices.start}.
 * @param {MapEditorEnvironment} environment What the page provides.
 * @returns {MapEditorServices} The services.
 */
const createMapEditorServices = (environment: MapEditorEnvironment): MapEditorServices =>
{
  const clientId = environment.createClientId();
  const api = environment.apiBase === null
    ? null
    : new HttpMapEditorApi({ apiBase: environment.apiBase, clientId, fetch: environment.fetch });
  const hub = new DocumentHub({ clientId, store: api === null ? undefined : apiDocumentStore(api) });
  const sync = new SyncPeer({ hub, channel: environment.openChannel(CHANNEL_NAMES.sync) });

  // a blueprint opened as a map keeps its size and its events whatever tool edits it, in this window and every other.
  hub.addCommitCheck(blueprintShapeCheck(hub));
  const catalog = new CommandCatalog();
  registerBuiltInCommands(catalog);
  const commandEditors = new CommandEditorRegistry();
  const commandEditing = wireCommandEditing(api, catalog, commandEditors);
  const modules = new PluginModuleRegistry(catalog);
  registerCoreEventKinds(modules);

  // the modules switch on from what the server reads, and switch on afresh when a config they read changes on disk.
  const activation = api === null
    ? null
    : new ModuleActivation(api, modules);

  // the window the close guard listens on is the page's own, the one whose paint the page starts with.
  const paints = new WindowPaints(environment.closeTarget);

  // every stamp is named after the window that copied it, so another window knows whether it holds it already.
  const stamps = new StampHistory(clientId);

  // a client that cannot read every map's notes leaves the copies uncounted, rather than counted from this window alone;
  // the maps only other windows hold are counted as those windows hold them, unsaved copies and all.
  const readNotes = api === null || api.loadEventNotes === undefined
    ? null
    : api.loadEventNotes.bind(api);
  const blueprintCopies = new BlueprintCopyCounter({ hub, readNotes, sync });
  const clock = new WindowClock();
  const pages = new WindowPageRule(modules);
  const preview = new WindowPreview();
  const remembered = new RememberedView(clock, preview);

  // the switch and variable names every list and picker shows follow System.json wherever it is being renamed.
  const names = api === null
    ? null
    : new SystemNamesFollower({ hub, sync }, projectNamesOf(api));

  /**
   * Reads what a new game starts with for the page rule. A read that fails leaves the rule as it was, seating nobody
   * before the first read lands, and is left for the next change rather than thrown.
   */
  const readNewGame = (): void =>
  {
    api?.loadNewGame()
      .then(save => pages.setSave(save))
      .catch(() => undefined);
  };

  // the change stream is shared by every window, and only exists with a server to stream from.
  const feed = api === null
    ? null
    : new SharedFileChangeFeed(
      new FileChangeFeed(api.fileChangesUrl(), environment.openEventSource),
      environment.openChannel(CHANNEL_NAMES.fileChanges),
      environment.locks,
    );

  const stops: (() => void)[] = [];

  /**
   * Stops everything start began, newest first.
   */
  const stop = () =>
  {
    stops.splice(0).reverse().forEach(each => each());
  };

  /**
   * Holds a document (see {@link MapEditorServices.openDocument}).
   * @param {DocumentKey} key The document.
   * @returns {Promise<EditorDocument>} The document.
   */
  const openDocument = async (key: DocumentKey): Promise<EditorDocument> =>
  {
    if (hub.has(key) === false)
    {
      // a change to a blueprint on its way to a map's file must land before the file is read, or the map opens without
      // it, reading as saved, and a save of it would put its copies back as they were.
      if (parseDocumentKey(key).kind === 'map')
      {
        await blueprintWriter?.whenWritten();
      }

      // another window's copy may hold unsaved edits the file lacks, so its answer is waited for first; once a window
      // holding the document has answered, there is nobody else worth waiting for.
      await sync.whenHeldOrDiscovered(key);
    }

    if (hub.has(key))
    {
      return hub.document(key);
    }

    const snapshot = sync.holders(key).length > 0
      ? await sync.requestSnapshot(key)
      : null;
    if (hub.has(key))
    {
      return hub.document(key);
    }

    if (snapshot !== null)
    {
      return hub.adoptSnapshot(snapshot);
    }

    // a blueprint opened as a map has no file of its own: nobody else holding it, it is laid out from the blueprints.
    const parsed = parseDocumentKey(key);
    if (parsed.kind === 'blueprint-map')
    {
      await openDocument(BLUEPRINTS_DOCUMENT);
      return holdBlueprintMap(hub, parsed.blueprintId);
    }

    return hub.load(key);
  };

  // every change to a blueprint reaches every copy of it in the same step, planned against the maps it may reach, and is
  // written to disk with them in one act; the check comes after the one keeping the blueprint to its shape.
  const copyMaps = new CopyMaps({
    hub,
    copies: blueprintCopies,
    holders: key => sync.holders(key),
    onHoldingChange: listener => sync.onHoldingChange(listener),
    openDocument,
    readMap: api === null ? null : mapId => api.loadMap(mapId),
    templates: modules,
  });
  hub.addCommitCheck(blueprintPropagationCheck({ hub, maps: copyMaps, tags: () => modules.commentTags() }));

  // undoing or redoing a blueprint's change leaves a copy on a map nobody has open as it stands once its file changed.
  hub.setFileFit((key, patch) => copyMaps.fileTakes(key, patch));
  const writeChanges = api === null || api.writeBlueprintChanges === undefined
    ? null
    : api.writeBlueprintChanges.bind(api);
  const blueprintWriter = writeChanges === null
    ? null
    : new BlueprintWriter({ hub, maps: copyMaps, write: writeChanges });

  // a blueprint's tab follows the blueprints when they change other than through it, so it never writes an older one back.
  const blueprintMaps = new BlueprintMapFollower(hub);

  /**
   * Brings the clock and the preview back as this project last left them on this machine, and keeps them in step with
   * every other window from then on, once the server says which project it serves. Without a server, a project, or a
   * place to remember them, they are this window's alone.
   */
  const rememberView = (): void =>
  {
    const { rememberedView } = environment;
    if (api === null || api.loadProjectRoot === undefined || rememberedView === undefined)
    {
      return;
    }

    // the answer may land after the page has gone, when there is nothing left to keep in step.
    let stopped = false;
    let detach: (() => void) | null = null;
    stops.push(() =>
    {
      stopped = true;
      detach?.();
    });
    api.loadProjectRoot()
      .then(projectRoot =>
      {
        if (stopped === false && projectRoot !== '')
        {
          detach = remembered.attach(rememberedView(projectRoot));
        }
      })
      .catch(() => undefined);
  };

  return {
    clientId,
    view: parseMapEditorView(environment.search),
    api,
    hub,
    sync,
    shell: environment.shell,
    catalog,
    commandEditors,
    pluginHeaders: commandEditing.headers,
    locationPicks: commandEditing.locationPicks,
    modules,
    paints,
    stamps,
    blueprintCopies,
    copyMaps,
    blueprintWriter,
    blueprintMaps,
    clock,
    pages,
    preview,
    loadCommandResources: commandEditing.load,
    openDocument,
    resolveConflict: (key: DocumentKey, choice: 'mine' | 'theirs') =>
    {
      const conflict = hub.conflict(key);
      if (conflict === null)
      {
        return false;
      }

      if (conflict.kind === 'window')
      {
        return sync.resolveConflict(key, choice);
      }

      // the file was removed, so there is no version on disk to take.
      if (choice === 'theirs' && conflict.content === null)
      {
        return false;
      }

      if (choice === 'theirs' && conflict.content !== null)
      {
        hub.reload(key, conflict.content);
        return true;
      }

      // a blueprint's tab kept over the version on disk makes the blueprint what it shows; one that can't be is not settled.
      const parsed = parseDocumentKey(key);
      if (parsed.kind === 'blueprint-map' && keepBlueprintMap(hub, blueprintMaps, parsed.blueprintId) === false)
      {
        return false;
      }

      hub.clearConflict(key);
      return true;
    },
    start: () =>
    {
      sync.start();
      stops.push(() => sync.stop());

      // what the palette and the layer strip pick is what the painting tools paint with, and the eyedropper's picks go
      // back to them; a torn-out map's window links its own paint the first time it is asked for.
      stops.push(paints.main.link());

      // the window's clock starts where the game does once a module offering it switches on, before any view draws the
      // sky the module brings.
      stops.push(modules.subscribe(() =>
      {
        const offer = modules.clockOffer();
        if (offer !== null)
        {
          clock.startAt(offer.startsAt);
        }
      }));

      // the plugin modules switch on once js/plugins.js says which plugins are enabled, and the page rule reads the party
      // a new game seats.
      activation?.refresh();
      readNewGame();

      // the names follow System.json from now on, and the clock and the preview come back as the project left them.
      if (names !== null)
      {
        stops.push(names.start());
      }

      rememberView();

      // a page going for good says goodbye, so no window counts it as holding anything a moment longer.
      const onPageHide = () => stop();
      environment.closeTarget.addEventListener('pagehide', onPageHide);
      stops.push(() => environment.closeTarget.removeEventListener('pagehide', onPageHide));

      if (feed !== null)
      {
        // only the window reading the stream reads what changed, and hands it to the others; each change settles on
        // its own, and a read that fails is left for the next change rather than thrown at the stream. A config a
        // module reads is read again by every window, so tuning it shows everywhere at once, and so is every config
        // when the stream comes back, since a change made while it was down was never announced; the new game too.
        const router = new FileChangeRouter(hub, sync, () => feed.isLeader);
        stops.push(
          feed.onChange(change =>
          {
            router.route(change).catch(() => undefined);
            blueprintCopies.fileChanged(change.path);
            copyMaps.fileChanged(change.path, change.client !== '' && sync.knowsClient(change.client));
            if (isModuleConfigFile(change.path))
            {
              activation?.refresh();
            }

            if (NEW_GAME_FILES.has(change.path))
            {
              readNewGame();
            }

            // a window holding no copy of System.json reads its names afresh, renamed in MZ or by a script, say.
            if (change.path === SYSTEM_FILE)
            {
              names?.refresh();
            }
          }),
          feed.onReconnect(() =>
          {
            router.recheck().catch(() => undefined);
            blueprintCopies.readAgain();
            activation?.refresh();
            readNewGame();
            names?.refresh();
          }),
        );
        feed.start();
        stops.push(() => feed.stop());
      }

      stops.push(() => blueprintCopies.stop());

      // a blueprint opened as a map here gathers the maps its copies stand on from now on, and follows the blueprints.
      copyMaps.start();
      stops.push(() => copyMaps.stop());
      blueprintMaps.start();
      stops.push(() => blueprintMaps.stop());
      if (blueprintWriter !== null)
      {
        stops.push(() => blueprintWriter.stop());
      }

      // a change to a blueprint still on its way to disk is as unsaved as an edit nobody else holds.
      stops.push(installCloseGuard(environment.closeTarget, () => unsavedOnlyHere(hub, sync).length > 0 || blueprintWriter?.hasUnwritten() === true));
    },
    stop,
  };
};

export { browserEnvironment, createMapEditorServices };
export type { MapEditorEnvironment, MapEditorServices };
