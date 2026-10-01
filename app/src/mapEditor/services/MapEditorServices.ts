import { CHANNEL_NAMES, openBroadcastChannel, type ChannelFactory } from '../../core/infrastructure/messaging/MessageChannelLike.ts';
import { pageWindowShell, type WindowShell } from '../../core/infrastructure/shell/WindowShell.ts';
import { apiDocumentStore } from '../core/api/apiDocumentStore.ts';
import { HttpMapEditorApi, type MapEditorApi } from '../core/api/MapEditorApi.ts';
import { installCloseGuard, unsavedOnlyHere, type CloseTarget } from '../core/closeGuard.ts';
import { registerBuiltInCommands } from '../core/commands/builtin/builtInCommands.ts';
import { CommandCatalog } from '../core/commands/CommandCatalog.ts';
import { CommandEditorRegistry } from '../core/commands/CommandEditorRegistry.ts';
import type { PluginHeaderStore } from '../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { DocumentHub } from '../core/history/DocumentHub.ts';
import type { DocumentKey } from '../core/model/documentKeys.ts';
import type { EditorDocument } from '../core/model/EditorDocument.ts';
import { PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { WindowPaints } from '../core/tools/WindowPaint.ts';
import { FileChangeFeed, openEventSource, type EventSourceFactory } from '../core/sync/FileChangeFeed.ts';
import { FileChangeRouter } from '../core/sync/fileChangeRouting.ts';
import { SharedFileChangeFeed, type LockManagerLike } from '../core/sync/SharedFileChangeFeed.ts';
import { SyncPeer } from '../core/sync/SyncPeer.ts';
import { parseMapEditorView, type MapEditorView } from '../views/mapEditorViews.ts';
import { wireCommandEditing } from './commandEditing.ts';
import { registerCoreEventKinds } from './coreEventKinds.ts';
import { activatePluginModules } from './pluginModules.ts';

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
   * holding the document that answers ends that wait at once, so its copy is asked for straight away.
   * @param {DocumentKey} key The document.
   * @returns {Promise<EditorDocument>} The document.
   */
  openDocument(key: DocumentKey): Promise<EditorDocument>;

  /**
   * Settles a document's conflict the way the person chose: keep this window's copy, or take the other one (the
   * file on disk, or another window's copy).
   * @param {DocumentKey} key The document.
   * @param {'mine' | 'theirs'} choice Which copy to keep.
   * @returns {boolean} True when there was a conflict to settle that way.
   */
  resolveConflict(key: DocumentKey, choice: 'mine' | 'theirs'): boolean;

  /**
   * Starts syncing, watching for changes, guarding against closing with unsaved edits, and switching on the plugin
   * modules once js/plugins.js is read. When the page goes, it stops, which tells the other windows at once that this
   * one no longer holds anything.
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
};

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
  const catalog = new CommandCatalog();
  registerBuiltInCommands(catalog);
  const commandEditors = new CommandEditorRegistry();
  const commandEditing = wireCommandEditing(api, catalog, commandEditors);
  const modules = new PluginModuleRegistry(catalog);
  registerCoreEventKinds(modules);

  // the window the close guard listens on is the page's own, the one whose paint the page starts with.
  const paints = new WindowPaints(environment.closeTarget);

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
    modules,
    paints,
    loadCommandResources: commandEditing.load,
    openDocument: async (key: DocumentKey) =>
    {
      if (hub.has(key) === false)
      {
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

      return snapshot === null
        ? hub.load(key)
        : hub.adoptSnapshot(snapshot);
    },
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

      if (api !== null)
      {
        // the plugin modules switch on once js/plugins.js says which plugins are enabled.
        activatePluginModules(api, modules);
      }

      // a page going for good says goodbye, so no window counts it as holding anything a moment longer.
      const onPageHide = () => stop();
      environment.closeTarget.addEventListener('pagehide', onPageHide);
      stops.push(() => environment.closeTarget.removeEventListener('pagehide', onPageHide));

      if (feed !== null)
      {
        // only the window reading the stream reads what changed, and hands it to the others; each change settles on
        // its own, and a read that fails is left for the next change rather than thrown at the stream.
        const router = new FileChangeRouter(hub, sync, () => feed.isLeader);
        stops.push(
          feed.onChange(change =>
          {
            router.route(change).catch(() => undefined);
          }),
          feed.onReconnect(() =>
          {
            router.recheck().catch(() => undefined);
          }),
        );
        feed.start();
        stops.push(() => feed.stop());
      }

      stops.push(installCloseGuard(environment.closeTarget, () => unsavedOnlyHere(hub, sync).length > 0));
    },
    stop,
  };
};

export { browserEnvironment, createMapEditorServices };
export type { MapEditorEnvironment, MapEditorServices };
