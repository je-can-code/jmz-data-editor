import { pluginBasename, type PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import type { JsonValue } from '../model/json.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
import type { LightingLayerDefinition } from '../renderer/lightingLayer.ts';
import type { OverlayDefinition } from '../renderer/MapRenderer.ts';
import type {
  EventKindDefinition,
  ModuleContributions,
  PaletteEntry,
  PassabilityRule,
  PluginModule,
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
  catalogIds: string[];
  templateMaps: number[];
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
  catalogIds: [],
  templateMaps: [],
});

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
 * Holds the event kinds, palette entries, passability rules, overlays, lighting layers and command entries the editor
 * knows, and the maps whose events are a plugin's patterns: the core's kinds, always, and each plugin module's
 * contributions while its plugins are enabled.
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
   * @returns {ModuleActivation} Which modules are on, and what each of the others is missing.
   */
  activate(
    modules: readonly PluginModule[],
    plugins: readonly PluginsJsEntry[],
    configs: ReadonlyMap<string, JsonValue | null> = new Map()): ModuleActivation
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

      // each module is handed the configs it named, and only those.
      const own = new Map((pluginModule.configs ?? []).map(name => [ name, configs.get(name) ?? null ]));
      pluginModule.register(this.#contributionsFor(pluginModule), { plugins: enabled, configs: own });
      this.#active.push(pluginModule.id);
    });

    // whatever shows kinds read before this activation may read differently now.
    this.#revision += 1;
    this.#listeners.forEach(listener => listener());
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
    if (this.#contributions.templateMaps.includes(mapId))
    {
      return null;
    }

    return this.eventKinds().find(kind => kind.detect(event)) ?? null;
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
      catalogEntry: entry =>
      {
        this.#catalog.register(entry);
        this.#contributions.catalogIds.push(entry.id);
      },
      templateMap: mapId =>
      {
        this.#contributions.templateMaps.push(mapId);
      },
    };
  }

  /**
   * Takes back everything the modules contributed.
   */
  #deactivate(): void
  {
    this.#contributions.catalogIds.forEach(id => this.#catalog.unregister(id));
    this.#contributions = noContributions();
    this.#active = [];
  }
}

export { enabledPlugins, PluginModuleRegistry };
export type { ModuleActivation };
