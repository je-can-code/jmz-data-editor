import type { MapEditorApi } from '../core/api/MapEditorApi.ts';
import type { CommandCatalog } from '../core/commands/CommandCatalog.ts';
import type { CommandEditorRegistry } from '../core/commands/CommandEditorRegistry.ts';
import { loadPluginHeaders, type PluginHeaders } from '../core/commands/pluginHeaders/loadPluginHeaders.ts';
import { pluginHeaderEntries } from '../core/commands/pluginHeaders/pluginHeaderEntries.ts';
import { PluginHeaderStore } from '../core/commands/pluginHeaders/PluginHeaderLibrary.ts';
import { namedRows, type DatabaseNamesJson } from '../core/commandList/databaseNames.ts';
import type { HandBuiltEditorEnvironment } from '../views/commandEditors/editorEnvironment.tsx';
import { registerHandBuiltEditors } from '../views/commandEditors/registerHandBuiltEditors.tsx';
import { commandListResourcesOf } from '../views/commandList/commandListResources.ts';

/**
 * Command editing as one window wires it: the plugin headers every editor and the catalog share, and how to read
 * them.
 */
type CommandEditing = {
  /**
   * The plugin headers read so far. The plugin command editor reads them, and the catalog holds an entry for every
   * command they declare; both come from this one store, so they never disagree about which plugins exist.
   */
  readonly headers: PluginHeaderStore;

  /**
   * What the hand-built editors were bound to: the server, the headers above, and the database names once read.
   */
  readonly environment: HandBuiltEditorEnvironment;

  /**
   * Reads the plugin headers and the database names from the server, once however often it is asked. Never
   * rejects: without a server, or when the server cannot answer, plugin commands keep their raw form and ids
   * stay numbers.
   * @returns {Promise<void>} Settles once both have been read.
   */
  load(): Promise<void>;
};

/**
 * Wires the two halves of command editing together for one window: the eight hand-built editors join the
 * registry, bound to the server, the plugin headers and the database names, and the commands the plugin headers
 * declare join the catalog under their {@code Plugin:} names.
 *
 * Nothing is read until {@link CommandEditing.load}, so a window that never shows a command list never fetches a
 * plugin's source. When it does, the names are in place and the catalog holds the plugin entries before the
 * header store tells anyone, so whatever redraws on the headers arriving finds everything else there too.
 * @param {MapEditorApi | null} api The server, or null when the window has none.
 * @param {CommandCatalog} catalog The window's catalog.
 * @param {CommandEditorRegistry} registry The window's hand-built editor registry.
 * @returns {CommandEditing} The shared headers, and how to read them.
 */
const wireCommandEditing = (api: MapEditorApi | null, catalog: CommandCatalog, registry: CommandEditorRegistry): CommandEditing =>
{
  const headers = new PluginHeaderStore();
  let databaseNames: DatabaseNamesJson | null = null;
  const environment: HandBuiltEditorEnvironment = { api, headers, names: kind => namedRows(databaseNames, kind) };
  registerHandBuiltEditors(registry, environment);

  /**
   * Reads the headers and names, then hands them out: names first, catalog entries next, the headers last.
   * @param {MapEditorApi} server The server.
   * @returns {Promise<void>} Settles once both are in place.
   */
  const read = async (server: MapEditorApi): Promise<void> =>
  {
    // a project whose headers cannot be read still edits every command, plugin commands as their raw parameters.
    const [ { headers: loadedHeaders, entries }, names ] = await Promise.all([
      loadPluginHeaders(server).catch((): PluginHeaders => ({ headers: [], entries: [] })),
      commandListResourcesOf(server).names,
    ]);
    databaseNames = names;

    // an entry some module already registered for the same command keeps its place.
    pluginHeaderEntries(loadedHeaders)
      .filter(entry => catalog.entry(entry.id) === null)
      .forEach(entry => catalog.register(entry));
    headers.set(loadedHeaders, entries);
  };

  let reading: Promise<void> | null = null;
  return {
    headers,
    environment,
    load: () =>
    {
      if (api === null)
      {
        return Promise.resolve();
      }

      reading ??= read(api);
      return reading;
    },
  };
};

export { wireCommandEditing };
export type { CommandEditing };
