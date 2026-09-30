import { pluginBasename, type PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalog } from '../commands/CommandCatalog.ts';
import type { RmmzMapEvent } from '../model/rmmzTypes.ts';
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
  catalogIds: string[];
};

/**
 * Starts an empty set of contributions.
 * @returns {Contributions} The empty set.
 */
const noContributions = (): Contributions => ({ kinds: [], palette: [], rules: [], overlays: [], catalogIds: [] });

/**
 * Holds the event kinds, palette entries, passability rules, overlays and command entries the editor knows: the
 * core's kinds, always, and each plugin module's contributions while its plugins are enabled.
 */
class PluginModuleRegistry
{
  #catalog: CommandCatalog;

  #coreKinds: EventKindDefinition[] = [];

  #contributions: Contributions = noContributions();

  #active: string[] = [];

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
   * @returns {ModuleActivation} Which modules are on, and what each of the others is missing.
   */
  activate(modules: readonly PluginModule[], plugins: readonly PluginsJsEntry[]): ModuleActivation
  {
    this.#deactivate();

    const enabled = new Map(plugins
      .filter(plugin => plugin.status)
      .map(plugin => [ pluginBasename(plugin.name), plugin ]));
    const inactive: { id: string; missing: string[] }[] = [];

    modules.forEach(pluginModule =>
    {
      const missing = pluginModule.plugins.filter(name => enabled.has(name) === false);
      if (missing.length > 0)
      {
        inactive.push({ id: pluginModule.id, missing });
        return;
      }

      pluginModule.register(this.#contributionsFor(pluginModule), { plugins: enabled });
      this.#active.push(pluginModule.id);
    });

    return { active: [ ...this.#active ], inactive };
  }

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
   * Finds the kind an event is: the highest-priority kind that recognises it.
   * @param {RmmzMapEvent} event The event.
   * @returns {EventKindDefinition | null} The kind, or null when none recognises it.
   */
  kindOf(event: RmmzMapEvent): EventKindDefinition | null
  {
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
      catalogEntry: entry =>
      {
        this.#catalog.register(entry);
        this.#contributions.catalogIds.push(entry.id);
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

export { PluginModuleRegistry };
export type { ModuleActivation };
