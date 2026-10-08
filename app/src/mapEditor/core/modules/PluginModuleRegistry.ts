import { pluginBasename, type PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import type { JsonValue } from '../model/json.ts';
import type { RmmzEventPage, RmmzMapEvent } from '../model/rmmzTypes.ts';
import { pageWordsOf, type PageCondition } from '../pageRule/pageRule.ts';
import type { LightingLayerDefinition } from '../renderer/lightingLayer.ts';
import type { OverlayDefinition } from '../renderer/MapRenderer.ts';
import type { WeatherLayerDefinition } from '../renderer/weatherLayer.ts';
import type {
  ClockOffer,
  EventKindDefinition,
  LiveNotice,
  MapPropertiesSection,
  ModuleContributions,
  ModuleNotice,
  OnDemandConfig,
  PaletteEntry,
  PassabilityRule,
  PluginModule,
  PreviewKindDefinition,
  SkyOffer,
  SkyReader,
} from './PluginModule.ts';

/**
 * The prefix every core kind carries.
 */
const CORE_PREFIX = 'core.';

/**
 * Which modules switched on, and why the others did not.
 */
type ModuleActivation = {
  readonly active: readonly string[];
  readonly inactive: readonly { readonly id: string; readonly missing: readonly string[] }[];
};

/**
 * Everything the active modules contributed.
 */
type Contributions = {
  kinds: EventKindDefinition[];
  palette: PaletteEntry[];
  rules: PassabilityRule[];
  overlays: OverlayDefinition[];
  lighting: LightingLayerDefinition[];
  weather: WeatherLayerDefinition[];
  catalogIds: string[];

  /**
   * The maps whose events a plugin copies while the game runs, each with the title of the module that named it.
   */
  templateMaps: { readonly mapId: number; readonly owner: string }[];

  /**
   * Everything the modules say, in the order they said it: a fixed notice as one that never changes.
   */
  notices: LiveNotice[];
  clocks: ClockOffer[];
  skies: SkyOffer[];
  mapProperties: MapPropertiesSection[];
  skyReaders: SkyReader[];
  pageConditions: PageCondition[];
  previewKinds: PreviewKindDefinition[];
};

/**
 * Starts an empty set of contributions.
 * @returns {Contributions} The empty set.
 */
const noContributions = (): Contributions => ({
  kinds: [],
  palette: [],
  rules: [],
  overlays: [],
  lighting: [],
  weather: [],
  catalogIds: [],
  templateMaps: [],
  notices: [],
  clocks: [],
  skies: [],
  mapProperties: [],
  skyReaders: [],
  pageConditions: [],
  previewKinds: [],
});

/**
 * Holds a fixed notice as one that never changes, so everything the modules say is heard the same way.
 * @param {ModuleNotice} notice What to say.
 * @returns {LiveNotice} The notice, never changing.
 */
const fixedNotice = (notice: ModuleNotice): LiveNotice => ({
  id: notice.id,
  current: () => notice,
  subscribe: () => () => undefined,
});

/**
 * Where the modules' on-demand configs come from for a registry handed no source for them, as in a window with no
 * server to read from: each stays unread whatever is asked of it, so a module drawing from one draws nothing.
 * @returns {OnDemandConfig} A config that is never read.
 */
const unreadOnDemand = (): OnDemandConfig => ({
  current: () => undefined,
  request: () => undefined,
  subscribe: () => () => undefined,
});

/**
 * Reports whether two lists of notices say the same things, in the same order.
 * @param {readonly ModuleNotice[]} left One list.
 * @param {readonly ModuleNotice[]} right The other.
 * @returns {boolean} True when they say the same.
 */
const sameNotices = (left: readonly ModuleNotice[], right: readonly ModuleNotice[]): boolean =>
{
  return left.length === right.length && left.every((notice, index) =>
  {
    const other = right[index];
    return notice.id === other.id && notice.title === other.title && notice.detail === other.detail;
  });
};

/**
 * Reads which plugins js/plugins.js enables, by file name: {@code J-ABS} for {@code j/abs/J-ABS}.
 * @param {readonly PluginsJsEntry[]} plugins The project's plugins.
 * @returns {Map<string, PluginsJsEntry>} The enabled ones, by file name.
 */
const enabledPlugins = (plugins: readonly PluginsJsEntry[]): Map<string, PluginsJsEntry> =>
{
  return new Map(plugins
    .filter(plugin => plugin.status)
    .map(plugin => [ pluginBasename(plugin.name), plugin ]));
};

/**
 * Lists the config files a module reads with some plugins enabled: every one of its own, and each of its extensions'
 * whose plugins are all enabled too, so a project without an extension is never asked for that extension's config.
 * @param {PluginModule} pluginModule The module.
 * @param {ReadonlyMap<string, PluginsJsEntry>} enabled The enabled plugins, by file name.
 * @returns {string[]} The configs' names, its own first.
 */
const configNamesOf = (pluginModule: PluginModule, enabled: ReadonlyMap<string, PluginsJsEntry>): string[] =>
{
  const extensions = (pluginModule.extensionConfigs ?? [])
    .filter(config => config.plugins.every(name => enabled.has(name)))
    .map(config => config.name);
  return [ ...(pluginModule.configs ?? []), ...extensions ];
};

/**
 * Holds the event kinds, palette entries, passability rules, overlays, lighting layers, weather layers and command
 * entries the editor knows, the maps whose events are a plugin's patterns, what the modules say over every map view, the
 * clock and the sky they offer, the sections they add to Map Properties and the plugins they say read a map's sky, the
 * conditions they add to the game's page rule and the kinds of state they let the preview set: the core's kinds, always,
 * and each plugin module's contributions while its plugins are enabled.
 */
class PluginModuleRegistry
{
  #catalog: CommandCatalog;

  #coreKinds: EventKindDefinition[] = [];

  #contributions: Contributions = noContributions();

  #active: string[] = [];

  #revision = 0;

  #listeners = new Set<() => void>();

  /**
   * What the modules say now, as last heard; asked of them only when they switch on and when one of them changes.
   */
  #shownNotices: readonly ModuleNotice[] = [];

  #noticesRevision = 0;

  #noticeListeners = new Set<() => void>();

  /**
   * Stops listening to what the active modules say, for their switching off.
   */
  #noticeStops: (() => void)[] = [];

  /**
   * @param {CommandCatalog} catalog The catalog module command entries join.
   */
  constructor(catalog: CommandCatalog)
  {
    this.#catalog = catalog;
  }

  /**
   * Adds one of the core's own kinds, which are on in every project.
   * @param {EventKindDefinition} kind The kind; its id starts with {@code core.}.
   */
  registerCoreKind(kind: EventKindDefinition): void
  {
    if (kind.id.startsWith(CORE_PREFIX) === false)
    {
      throw new Error(`a core kind's id starts with "${CORE_PREFIX}", not ${kind.id}`);
    }

    if (this.#coreKinds.some(existing => existing.id === kind.id))
    {
      throw new Error(`${kind.id} is already registered`);
    }

    this.#coreKinds.push(kind);
  }

  /**
   * Switches on every module whose plugins are all enabled, replacing whatever an earlier activation added.
   * @param {readonly PluginModule[]} modules The modules the editor ships.
   * @param {readonly PluginsJsEntry[]} plugins The project's plugins, from {@code js/plugins.js}.
   * @param {ReadonlyMap<string, JsonValue | null>} configs The config files the modules read, by name, as read
   * beforehand; a module naming one missing here gets null for it. Left out, none were read.
   * @param {ReadonlyMap<string, string>} problems Why each config that could not be read could not, by name. Left out,
   * none were read, so none failed.
   * @param {(name: string) => OnDemandConfig} onDemand The window's copy of each config a module reads on demand, by
   * name. Left out, every one stays unread.
   * @returns {ModuleActivation} Which modules are on, and what each of the others is missing.
   */
  activate(
    modules: readonly PluginModule[],
    plugins: readonly PluginsJsEntry[],
    configs: ReadonlyMap<string, JsonValue | null> = new Map(),
    problems: ReadonlyMap<string, string> = new Map(),
    onDemand: (name: string) => OnDemandConfig = unreadOnDemand): ModuleActivation
  {
    this.#deactivate();

    const enabled = enabledPlugins(plugins);
    const inactive: { id: string; missing: string[] }[] = [];

    modules.forEach(pluginModule =>
    {
      const missing = pluginModule.plugins.filter(name => enabled.has(name) === false);
      if (missing.length > 0)
      {
        inactive.push({ id: pluginModule.id, missing });
        return;
      }

      // each module is handed the configs it named, and only those, with why any of them could not be read.
      const names = configNamesOf(pluginModule, enabled);
      const own = new Map(names.map(name => [ name, configs.get(name) ?? null ]));
      const ownProblems = new Map(names.flatMap(name =>
      {
        const problem = problems.get(name);
        return problem === undefined ? [] : [ [ name, problem ] as const ];
      }));
      // a page's words read the conditions as they stand when asked, so those added by modules after this one count, and
      // the sky's readers are read the same way.
      const pageWords = (page: RmmzEventPage) => pageWordsOf(page, this.#contributions.pageConditions);
      const skyReaders = (): readonly SkyReader[] => this.#contributions.skyReaders;
      const onDemandConfig = (name: string): OnDemandConfig =>
      {
        if ((pluginModule.onDemandConfigs ?? []).includes(name) === false)
        {
          throw new Error(`${pluginModule.id} asked for the config ${name}, which it does not name among those it reads on demand`);
        }

        return onDemand(name);
      };
      pluginModule.register(this.#contributionsFor(pluginModule), {
        plugins: enabled,
        configs: own,
        configProblems: ownProblems,
        onDemandConfig,
        pageWords,
        skyReaders,
      });
      this.#active.push(pluginModule.id);
    });

    // what the modules say is heard now, and again whenever any of it changes.
    this.#noticeStops = this.#contributions.notices.map(notice => notice.subscribe(() => this.#hearNotices()));
    this.#shownNotices = this.#currentNotices();

    // whatever shows kinds read before this activation may read differently now, and the notices may say otherwise.
    this.#revision += 1;
    this.#noticesRevision += 1;
    this.#listeners.forEach(listener => listener());
    this.#noticeListeners.forEach(listener => listener());
    return { active: [ ...this.#active ], inactive };
  }

  /**
   * Counts the activations so far, so a view can tell that what the modules contribute may have changed.
   * @returns {number} The count.
   */
  get revision(): number
  {
    return this.#revision;
  }

  /**
   * Listens for activations, as a view showing event kinds does: modules switch on once js/plugins.js has been
   * read, which can be after the view first drew.
   * @param {() => void} listener Called after each activation.
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
   * Reports whether a module is on.
   * @param {string} moduleId The module.
   * @returns {boolean} True while active.
   */
  isActive(moduleId: string): boolean
  {
    return this.#active.includes(moduleId);
  }

  /**
   * Lists every event kind, highest priority first.
   * @returns {EventKindDefinition[]} The kinds.
   */
  eventKinds(): EventKindDefinition[]
  {
    return [ ...this.#coreKinds, ...this.#contributions.kinds ].sort((left, right) => right.priority - left.priority);
  }

  /**
   * Finds the kind an event is: the highest-priority kind that recognises it, and none at all on a map an active
   * module copies its events from, since those events are the plugin's patterns rather than things on a map.
   * @param {RmmzMapEvent} event The event.
   * @param {number} mapId The map it is on.
   * @returns {EventKindDefinition | null} The kind, or null when none recognises it or its map holds patterns.
   */
  kindOf(event: RmmzMapEvent, mapId: number): EventKindDefinition | null
  {
    if (this.templateMapOwner(mapId) !== null)
    {
      return null;
    }

    return this.eventKinds().find(kind => kind.detect(event)) ?? null;
  }

  /**
   * Finds the plugin that copies a map's events while the game runs, such as J-ABS, whose actions are copied from the
   * events on its action map: those events are the plugin's patterns rather than things placed on a map, and the plugin
   * reads their notes, so no copy of a blueprint is ever placed there.
   * @param {number} mapId The map.
   * @returns {string | null} The title of the active module that named the map, or null when no active module did.
   */
  templateMapOwner(mapId: number): string | null
  {
    return this.#contributions.templateMaps.find(entry => entry.mapId === mapId)?.owner ?? null;
  }

  /**
   * Lists what the active modules offer to place.
   * @returns {readonly PaletteEntry[]} The entries.
   */
  paletteEntries(): readonly PaletteEntry[]
  {
    return this.#contributions.palette;
  }

  /**
   * Lists the active modules' passability rules.
   * @returns {readonly PassabilityRule[]} The rules.
   */
  passabilityRules(): readonly PassabilityRule[]
  {
    return this.#contributions.rules;
  }

  /**
   * Lists every overlay the active modules and kinds draw.
   * @returns {OverlayDefinition[]} The overlays.
   */
  overlays(): OverlayDefinition[]
  {
    const fromKinds = this.eventKinds().flatMap(kind => kind.overlays ?? []);
    return [ ...this.#contributions.overlays, ...fromKinds ];
  }

  /**
   * Lists what the active modules draw into the lighting layer, in the order they added it; empty while no module
   * draws there, which is when no map view offers its Lighting switch.
   * @returns {readonly LightingLayerDefinition[]} The lighting layers.
   */
  lightingLayers(): readonly LightingLayerDefinition[]
  {
    return this.#contributions.lighting;
  }

  /**
   * Lists what the active modules draw into the weather layer, in the order they added it; empty while no module draws
   * there, which is when no map view offers its Weather switch.
   * @returns {readonly WeatherLayerDefinition[]} The weather layers.
   */
  weatherLayers(): readonly WeatherLayerDefinition[]
  {
    return this.#contributions.weather;
  }

  /**
   * Lists what the active modules say over every map view, in the order they said it, as last heard; empty while none
   * has anything to say.
   * @returns {readonly ModuleNotice[]} The notices.
   */
  notices(): readonly ModuleNotice[]
  {
    return this.#shownNotices;
  }

  /**
   * Counts the times what the modules say may have changed: each activation, and each change a module's notice made to
   * what is said, so a view showing the notices can tell it has something new to show.
   * @returns {number} The count.
   */
  get noticesRevision(): number
  {
    return this.#noticesRevision;
  }

  /**
   * Listens for what the modules say changing, as a view showing the notices does: once for each activation, and once
   * for each change a module's notice makes to what is said while it is on.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  subscribeNotices = (listener: () => void): (() => void) =>
  {
    this.#noticeListeners.add(listener);
    return () =>
    {
      this.#noticeListeners.delete(listener);
    };
  };

  /**
   * Finds the clock the active modules offer the map views: the first one offered, or none while no module offers one,
   * which is when no map view shows a clock.
   * @returns {ClockOffer | null} The offer, or null.
   */
  clockOffer(): ClockOffer | null
  {
    const [ first ] = this.#contributions.clocks;
    return first ?? null;
  }

  /**
   * Finds the sky the active modules offer the map views: the first one offered, or none while no module offers one,
   * which is when no map view shows a sky's picker, and every map's sky shows nothing.
   * @returns {SkyOffer | null} The offer, or null.
   */
  skyOffer(): SkyOffer | null
  {
    const [ first ] = this.#contributions.skies;
    return first ?? null;
  }

  /**
   * Lists the sections the active modules add to Map Properties, in the order they added them; empty while none adds
   * any.
   * @returns {readonly MapPropertiesSection[]} The sections.
   */
  mapPropertiesSections(): readonly MapPropertiesSection[]
  {
    return this.#contributions.mapProperties;
  }

  /**
   * Lists the conditions the active modules add to the game's page rule, in the order they added them; empty while none
   * adds one, when every map shows each event's page by the engine's own conditions alone.
   * @returns {readonly PageCondition[]} The conditions.
   */
  pageConditions(): readonly PageCondition[]
  {
    return this.#contributions.pageConditions;
  }

  /**
   * Lists the kinds of state the active modules let the preview set beside the switches and variables, in the order they
   * added them; empty while none adds one, when the Switches & Variables window lists those two alone.
   * @returns {readonly PreviewKindDefinition[]} The kinds.
   */
  previewKinds(): readonly PreviewKindDefinition[]
  {
    return this.#contributions.previewKinds;
  }

  /**
   * Builds the contribution sink one module registers through, which holds it to its own id prefix.
   * @param {PluginModule} pluginModule The module.
   * @returns {ModuleContributions} The sink.
   */
  #contributionsFor(pluginModule: PluginModule): ModuleContributions
  {
    const prefix = `${pluginModule.id}.`;
    const requirePrefix = (id: string, what: string) =>
    {
      if (id.startsWith(prefix) === false)
      {
        throw new Error(`${pluginModule.id} can only add ${what} whose id starts with "${prefix}", not ${id}`);
      }
    };

    return {
      eventKind: kind =>
      {
        requirePrefix(kind.id, 'event kinds');
        this.#contributions.kinds.push(kind);
      },
      paletteEntry: entry =>
      {
        requirePrefix(entry.id, 'palette entries');
        this.#contributions.palette.push(entry);
      },
      passabilityRule: rule =>
      {
        requirePrefix(rule.id, 'passability rules');
        this.#contributions.rules.push(rule);
      },
      overlay: overlay =>
      {
        requirePrefix(overlay.id, 'overlays');
        this.#contributions.overlays.push(overlay);
      },
      lightingLayer: layer =>
      {
        requirePrefix(layer.id, 'lighting layers');
        this.#contributions.lighting.push(layer);
      },
      weatherLayer: layer =>
      {
        requirePrefix(layer.id, 'weather layers');
        this.#contributions.weather.push(layer);
      },
      catalogEntry: entry =>
      {
        this.#catalog.register(entry);
        this.#contributions.catalogIds.push(entry.id);
      },
      templateMap: mapId =>
      {
        this.#contributions.templateMaps.push({ mapId, owner: pluginModule.title });
      },
      notice: notice =>
      {
        requirePrefix(notice.id, 'notices');
        this.#contributions.notices.push(fixedNotice(notice));
      },
      liveNotice: notice =>
      {
        requirePrefix(notice.id, 'notices');
        this.#contributions.notices.push(notice);
      },
      clock: offer =>
      {
        this.#contributions.clocks.push(offer);
      },
      sky: offer =>
      {
        this.#contributions.skies.push(offer);
      },
      mapProperties: section =>
      {
        requirePrefix(section.id, 'map properties sections');
        this.#contributions.mapProperties.push(section);
      },
      skyReader: reader =>
      {
        requirePrefix(reader.id, 'sky readers');
        this.#contributions.skyReaders.push(reader);
      },
      pageCondition: condition =>
      {
        requirePrefix(condition.id, 'page conditions');
        this.#contributions.pageConditions.push(condition);
      },
      previewKind: kind =>
      {
        requirePrefix(kind.id, 'preview kinds');
        this.#contributions.previewKinds.push(kind);
      },
    };
  }

  /**
   * Asks every active module's notices what they say now.
   * @returns {ModuleNotice[]} What is said, in the order the modules said it.
   */
  #currentNotices(): ModuleNotice[]
  {
    return this.#contributions.notices.flatMap(notice =>
    {
      const said = notice.current();
      return said === null ? [] : [ said ];
    });
  }

  /**
   * Hears a module's notice change, and tells the views only when what is said, all told, is no longer what they show.
   */
  #hearNotices(): void
  {
    const said = this.#currentNotices();
    if (sameNotices(said, this.#shownNotices))
    {
      return;
    }

    this.#shownNotices = said;
    this.#noticesRevision += 1;
    this.#noticeListeners.forEach(listener => listener());
  }

  /**
   * Takes back everything the modules contributed, and stops listening to what they say.
   */
  #deactivate(): void
  {
    this.#noticeStops.forEach(stop => stop());
    this.#noticeStops = [];
    this.#contributions.catalogIds.forEach(id => this.#catalog.unregister(id));
    this.#contributions = noContributions();
    this.#active = [];
  }
}

export { configNamesOf, enabledPlugins, PluginModuleRegistry };
export type { ModuleActivation };
