import { readPluginEntries, type PluginsJsEntry } from '../../services/plugins/PluginsJsReader.ts';
import { MapEditorApiError, type MapEditorApi } from '../core/api/MapEditorApi.ts';
import { jsonEquals, type JsonValue } from '../core/model/json.ts';
import type { ConfigRead, OnDemandConfig, PluginModule } from '../core/modules/PluginModule.ts';
import { configNamesOf, enabledPlugins, type PluginModuleRegistry } from '../core/modules/PluginModuleRegistry.ts';
import { jabsModule } from '../modules/jabs/jabsModule.ts';
import { lightingModule } from '../modules/lighting/lightingModule.ts';
import { questModule } from '../modules/quest/questModule.ts';
import { timeModule } from '../modules/time/timeModule.ts';
import { weatherModule } from '../modules/weather/weatherModule.ts';

/**
 * Every plugin module the editor ships. Each switches on only while its plugins are enabled in js/plugins.js.
 */
const SHIPPED_MODULES: readonly PluginModule[] = [ jabsModule, lightingModule, timeModule, questModule, weatherModule ];

/**
 * What the modules' switching on reads from the server: js/plugins.js, and the config files the modules name, where the
 * client can read them.
 */
type ModuleSource = Pick<MapEditorApi, 'loadPluginList' | 'loadPluginConfig'>;

/**
 * The config files the modules read: each one's content by name, null for one that could not be read, and why each
 * of those could not.
 */
type ModuleConfigs = {
  readonly contents: Map<string, JsonValue | null>;
  readonly problems: Map<string, string>;
};

/**
 * Why no config could be read by a window whose client cannot read config files at all.
 */
const NO_CONFIG_READER = 'this window cannot read config files';

/**
 * Words why a config could not be read: the server's own words where it gave them, which name the file and what is
 * wrong with it, and otherwise the message of the error the read failed with, such as a server that never answered.
 * @param {Error} error What the read failed with.
 * @returns {string} Why.
 */
const problemOf = (error: Error): string =>
{
  return error instanceof MapEditorApiError && error.detail !== ''
    ? error.detail
    : error.message;
};

/**
 * Reads one config file. A file the server cannot give, or a client that cannot read configs at all, reads as null,
 * and why is kept, so the module can say so rather than quietly falling back. Never rejects.
 * @param {ModuleSource} api The server.
 * @param {string} name The config's name.
 * @returns {Promise<ConfigRead>} What it holds, or null and why not.
 */
const readConfig = (api: ModuleSource, name: string): Promise<ConfigRead> =>
{
  if (api.loadPluginConfig === undefined)
  {
    return Promise.resolve({ content: null, problem: NO_CONFIG_READER });
  }

  return api.loadPluginConfig(name)
    .then(content => ({ content, problem: null }))
    .catch((error: Error) => ({ content: null, problem: problemOf(error) }));
};

/**
 * Reads the config files named by the modules that are about to switch on, and only theirs, an extension's only while
 * that extension is enabled too, so a project without a plugin is never asked for that plugin's config; one a module
 * reads on demand is never read here. A file the server cannot give, or a client that cannot read configs at all, reads
 * as null, and why is kept, so the module can say so rather than quietly falling back.
 * @param {ModuleSource} api The server.
 * @param {readonly PluginModule[]} modules The modules.
 * @param {readonly PluginsJsEntry[]} plugins The project's plugins.
 * @returns {Promise<ModuleConfigs>} The configs, by name, and why any could not be read.
 */
const readModuleConfigs = async (
  api: ModuleSource,
  modules: readonly PluginModule[],
  plugins: readonly PluginsJsEntry[]): Promise<ModuleConfigs> =>
{
  const enabled = enabledPlugins(plugins);
  const names = [ ...new Set(modules
    .filter(pluginModule => pluginModule.plugins.every(name => enabled.has(name)))
    .flatMap(pluginModule => configNamesOf(pluginModule, enabled))) ];
  const reads = await Promise.all(names.map(name => readConfig(api, name)));
  return {
    contents: new Map(reads.map((each, index) => [ names[index], each.content ])),
    problems: new Map(reads.flatMap((each, index) => (each.problem === null ? [] : [ [ names[index], each.problem ] as const ]))),
  };
};

/**
 * Reports whether two reads of a config found the same: the same content, and the same reason for none.
 * @param {ConfigRead} left One read.
 * @param {ConfigRead | undefined} right The other, or undefined for none yet.
 * @returns {boolean} True when they found the same.
 */
const sameRead = (left: ConfigRead, right: ConfigRead | undefined): boolean =>
{
  return right !== undefined && left.problem === right.problem && jsonEquals(left.content, right.content);
};

/**
 * The window's one copy of a config some module reads on demand: unread until a module asks for it, then read, and read
 * again each time the modules' configs are, its listeners hearing each read that differs from the one before. A read
 * begun after another is the one that counts, whichever answers first.
 */
class OnDemandConfigCopy implements OnDemandConfig
{
  #api: ModuleSource;

  #name: string;

  #read: ConfigRead | undefined = undefined;

  #asked = false;

  #reads = 0;

  #listeners = new Set<() => void>();

  /**
   * @param {ModuleSource} api The server.
   * @param {string} name The config's name.
   */
  constructor(api: ModuleSource, name: string)
  {
    this.#api = api;
    this.#name = name;
  }

  current = (): ConfigRead | undefined =>
  {
    return this.#read;
  };

  request = (): void =>
  {
    if (this.#asked)
    {
      return;
    }

    // the read itself never fails, a config the server cannot give reading as null with why; a listener that throws is
    // a fault in its module, left to surface rather than caught here.
    this.#asked = true;
    this.reread();
  };

  subscribe = (listener: () => void): (() => void) =>
  {
    this.#listeners.add(listener);
    return () =>
    {
      this.#listeners.delete(listener);
    };
  };

  /**
   * Reads the config again, if a module ever asked for it, and tells the listeners when it differs from the last read.
   * @returns {Promise<void>} Settles once read, at once for a config nobody asked for.
   */
  reread(): Promise<void>
  {
    if (this.#asked === false)
    {
      return Promise.resolve();
    }

    this.#reads += 1;
    const read = this.#reads;
    return readConfig(this.#api, this.#name)
      .then(answer =>
      {
        // an answer to a read begun before a later one is old news, and the same as the last read is no news.
        if (read !== this.#reads || sameRead(answer, this.#read))
        {
          return;
        }

        this.#read = answer;
        this.#listeners.forEach(listener => listener());
      });
  }
}

/**
 * What one switching on was built from: js/plugins.js as read, and the configs read for it.
 */
type ModuleInputs = {
  readonly list: string;
  readonly configs: ModuleConfigs;
};

/**
 * Where a project's config files sit, as the server's config routes read them: {@code data/config.lighting.json} holds
 * the config named {@code lighting}.
 */
const CONFIG_FILE = /^data\/config\.([a-z0-9-]+)\.json$/u;

/**
 * Reports whether two reads found the project the same: the same plugin list, the same configs, and the same reasons
 * for any config that could not be read. The same list enables the same modules, which name the same configs, so the
 * two reads hold the same names and compare name by name; a config read in one and not the other differs in content.
 * @param {ModuleInputs} left One read.
 * @param {ModuleInputs} right The other.
 * @returns {boolean} True when switching the modules on from either would make the same modules.
 */
const sameInputs = (left: ModuleInputs, right: ModuleInputs): boolean =>
{
  return left.list === right.list
    && [ ...left.configs.contents ].every(([ name, content ]) => jsonEquals(content, right.configs.contents.get(name)))
    && [ ...left.configs.problems ].every(([ name, problem ]) => problem === right.configs.problems.get(name));
};

/**
 * Reports whether a changed file is a config one of the modules reads, an extension's or one read on demand included,
 * so the modules should read their configs again.
 * @param {string} path The file, relative to the project root, as the change stream names it.
 * @param {readonly PluginModule[]} modules The modules; by default, the ones the editor ships.
 * @returns {boolean} True for a config some module names.
 */
const isModuleConfigFile = (path: string, modules: readonly PluginModule[] = SHIPPED_MODULES): boolean =>
{
  const match = CONFIG_FILE.exec(path);
  if (match === null)
  {
    return false;
  }

  const [ , name ] = match;
  return modules.some(pluginModule =>
  {
    const extensions = (pluginModule.extensionConfigs ?? []).map(config => config.name);
    return [ ...(pluginModule.configs ?? []), ...extensions, ...(pluginModule.onDemandConfigs ?? []) ].includes(name);
  });
};

/**
 * Keeps one window's plugin modules switched on as the project stands. Each refresh reads js/plugins.js, then the config
 * files of the modules it enables, and switches those modules on, unless what it read is exactly what they were last
 * switched on from, so asking again when nothing changed costs two reads and nothing more. Reads never overlap: asks
 * that come while a read is running are answered by one more read after it, however many came. A refresh never
 * rejects: a list that cannot be read leaves the modules as they were, which before the first read is the core's kinds
 * on their own, as in a project without those plugins.
 *
 * A config a module reads on demand is never read by a refresh until the module has asked for it. The window keeps one
 * copy of each, from one switch-on to the next, and once asked for it is read again at the end of every refresh, its
 * listeners hearing a change without the modules switching on afresh, so a map with weather follows its config as it is
 * tuned on disk while every other map in the window carries on undisturbed.
 */
class ModuleActivation
{
  #api: ModuleSource;

  #registry: PluginModuleRegistry;

  #applied: ModuleInputs | null = null;

  #queue: Promise<void> = Promise.resolve();

  #waiting = false;

  #onDemand = new Map<string, OnDemandConfigCopy>();

  /**
   * @param {ModuleSource} api The server.
   * @param {PluginModuleRegistry} registry The window's registry.
   */
  constructor(api: ModuleSource, registry: PluginModuleRegistry)
  {
    this.#api = api;
    this.#registry = registry;
  }

  /**
   * Reads the project again and switches the modules on afresh if anything they are built from changed.
   * @returns {Promise<void>} Settles once a read that started after this ask has finished.
   */
  refresh(): Promise<void>
  {
    // a read queued but not yet begun will see whatever this ask is about.
    if (this.#waiting)
    {
      return this.#queue;
    }

    this.#waiting = true;
    this.#queue = this.#queue.then(() =>
    {
      this.#waiting = false;
      return this.#read();
    });
    return this.#queue;
  }

  /**
   * Reads the plugin list and the configs, and switches the modules on when either differs from what they were last
   * switched on from; then reads again every config a module has asked for on demand.
   * @returns {Promise<void>} Settles once done, or once the list has proved unreadable.
   */
  #read(): Promise<void>
  {
    return this.#api.loadPluginList()
      .then(async list =>
      {
        const plugins = readPluginEntries(list);
        const read: ModuleInputs = { list, configs: await readModuleConfigs(this.#api, SHIPPED_MODULES, plugins) };
        if (this.#applied === null || sameInputs(this.#applied, read) === false)
        {
          this.#applied = read;
          this.#registry.activate(SHIPPED_MODULES, plugins, read.configs.contents, read.configs.problems, name => this.#onDemandCopy(name));
        }

        // only a module that is on reads its on-demand configs, as only those switching on read their others.
        const wanted = new Set(SHIPPED_MODULES
          .filter(pluginModule => this.#registry.isActive(pluginModule.id))
          .flatMap(pluginModule => pluginModule.onDemandConfigs ?? []));
        const copies = [ ...this.#onDemand ].filter(([ name ]) => wanted.has(name));
        await Promise.all(copies.map(([ , copy ]) => copy.reread()));
      })
      .catch(() => undefined);
  }

  /**
   * Finds the window's copy of a config read on demand, making it, unread, the first time any module names it.
   * @param {string} name The config's name.
   * @returns {OnDemandConfigCopy} The copy.
   */
  #onDemandCopy(name: string): OnDemandConfigCopy
  {
    const known = this.#onDemand.get(name);
    if (known !== undefined)
    {
      return known;
    }

    const copy = new OnDemandConfigCopy(this.#api, name);
    this.#onDemand.set(name, copy);
    return copy;
  }
}

/**
 * Reads js/plugins.js, then the config files of the modules it switches on, and switches those modules on. Never
 * rejects: a list that cannot be read leaves the core's kinds on their own, as in a project without those plugins.
 * @param {ModuleSource} api The server.
 * @param {PluginModuleRegistry} registry The window's registry.
 * @returns {Promise<void>} Settles once the modules are on, or once the list has proved unreadable.
 */
const activatePluginModules = (api: ModuleSource, registry: PluginModuleRegistry): Promise<void> =>
{
  return new ModuleActivation(api, registry).refresh();
};

export { activatePluginModules, isModuleConfigFile, ModuleActivation, readModuleConfigs, SHIPPED_MODULES };
export type { ModuleConfigs, ModuleSource };
