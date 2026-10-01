import type { ComponentType } from 'react';
import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { MapDocumentKey } from '../model/documentKeys.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { OverlayDefinition } from '../renderer/MapRenderer.ts';

/**
 * What a quick panel is handed: the map and the selected events, all of one kind.
 */
type QuickPanelProps = {
  readonly documentKey: MapDocumentKey;
  readonly eventIds: readonly number[];
};

/**
 * One kind of event the editor recognises on the map, such as a chest, a door or a J-ABS battler: how to spot
 * it, the slim panel a single click shows for it, and the overlays it draws.
 */
type EventKindDefinition = {
  /**
   * Unique: {@code core.chest} for the core's kinds, {@code module.kind} for a module's ({@code jabs.battler}).
   */
  readonly id: string;

  /**
   * What the editor calls it.
   */
  readonly title: string;

  /**
   * Which kind wins when several recognise one event; higher first. A battler is also a comment-only event, so
   * the battler kind outranks the generic kinds.
   */
  readonly priority: number;

  /**
   * Recognises an event of this kind.
   * @param {RmmzMapEvent} event The event.
   * @returns {boolean} True when it is one.
   */
  readonly detect: (event: RmmzMapEvent) => boolean;

  /**
   * The quick panel a single click shows.
   */
  readonly quickPanel?: ComponentType<QuickPanelProps>;

  /**
   * The overlays the kind draws on the map.
   */
  readonly overlays?: readonly OverlayDefinition[];
};

/**
 * Something the palette offers to place, such as a battler or a light.
 */
type PaletteEntry = {
  /**
   * Unique, prefixed like event kinds.
   */
  readonly id: string;

  /**
   * What the palette calls it.
   */
  readonly title: string;

  /**
   * The event kind it creates.
   */
  readonly kind: string;

  /**
   * Builds the event to place.
   * @param {number} id The event id it will take.
   * @param {number} x The column.
   * @param {number} y The row.
   * @returns {RmmzMapEvent} The event.
   */
  readonly createEvent: (id: number, x: number, y: number) => RmmzMapEvent;
};

/**
 * What a passability rule is asked: whether a character may step from a tile in a direction.
 */
type PassabilityQuery = {
  readonly document: MapDocument;
  readonly tileset: RmmzTileset;
  readonly x: number;
  readonly y: number;
  readonly direction: 2 | 4 | 6 | 8;
};

/**
 * A rule that forbids steps the engine's own passability allows, such as J-RegionEffects' terrain and region
 * deny rules. The passability overlay and the landing check for transfers both apply every active rule.
 */
type PassabilityRule = {
  /**
   * Unique, prefixed like event kinds.
   */
  readonly id: string;

  /**
   * What the editor calls it.
   */
  readonly title: string;

  /**
   * Judges one step.
   * @param {PassabilityQuery} query The step.
   * @returns {string | null} Why it is forbidden, in the author's words, or null when this rule allows it.
   */
  readonly deny: (query: PassabilityQuery) => string | null;
};

/**
 * What a module receives when it switches on.
 */
type ModuleContext = {
  /**
   * The enabled plugins, by file name ({@code J-ABS}), with their parameters.
   */
  readonly plugins: ReadonlyMap<string, PluginsJsEntry>;
};

/**
 * Where a module adds what it knows. Every id it adds must start with its own id and a dot, so a module can
 * never claim or replace one of the core's kinds.
 */
type ModuleContributions = {
  eventKind(kind: EventKindDefinition): void;
  paletteEntry(entry: PaletteEntry): void;
  passabilityRule(rule: PassabilityRule): void;
  overlay(overlay: OverlayDefinition): void;
  catalogEntry(entry: CommandCatalogEntry): void;

  /**
   * Names a map the plugin copies events from while the game runs, such as J-ABS's action map. Its events are
   * patterns for the plugin rather than things placed on a map, so no kind claims them, and none is offered what a
   * placed event is, such as becoming a chest.
   * @param {number} mapId The map.
   */
  templateMap(mapId: number): void;
};

/**
 * One plugin's awareness, packaged: the editor works on any MZ project, and each module teaches it what one
 * plugin does with events, switching on only when that plugin is enabled in {@code js/plugins.js}. The core's
 * own kinds (chests, transfers, decor, dialogue) are never modules.
 */
type PluginModule = {
  /**
   * Unique, lowercase: {@code jabs}, {@code lighting}.
   */
  readonly id: string;

  /**
   * What the editor calls it.
   */
  readonly title: string;

  /**
   * The plugins it needs, by file name; it switches on only when every one is enabled.
   */
  readonly plugins: readonly string[];

  /**
   * Adds the module's contributions.
   * @param {ModuleContributions} contributions Where to add them.
   * @param {ModuleContext} context The enabled plugins.
   */
  readonly register: (contributions: ModuleContributions, context: ModuleContext) => void;
};

export type {
  EventKindDefinition,
  ModuleContext,
  ModuleContributions,
  PaletteEntry,
  PassabilityQuery,
  PassabilityRule,
  PluginModule,
  QuickPanelProps,
};
