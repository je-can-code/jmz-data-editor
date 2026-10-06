import type { ComponentType } from 'react';
import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { EventMarkerSymbol } from '../eventKinds/eventMarkers.ts';
import type { MapDocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { LightingLayerDefinition } from '../renderer/lightingLayer.ts';
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

  /**
   * The symbol an event of this kind shows on the map when its page draws no picture, so it never goes unseen. Left
   * out, such an event shows its trigger's symbol, as an event no kind claims does.
   */
  readonly marker?: EventMarkerSymbol;
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

  /**
   * The project config files the module names in {@link PluginModule.configs}, read before it switches on, by the name
   * it gave; null for a project without the file, or a file the server could not read.
   */
  readonly configs: ReadonlyMap<string, JsonValue | null>;

  /**
   * Why each config the module names could not be read, by the name it gave, in the server's words where it gave any:
   * the file is missing, is not JSON, or holds a field the strict read refuses. A config read as it should be has no
   * entry, so a module can say what is wrong rather than quietly falling back.
   */
  readonly configProblems: ReadonlyMap<string, string>;
};

/**
 * Something a module says over every map view for as long as it is on, such as why what it draws differs from what the
 * game will show: what is wrong and what it means, in one line, then the reason and what to do about it.
 */
type ModuleNotice = {
  /**
   * Unique, prefixed like event kinds.
   */
  readonly id: string;

  readonly title: string;

  readonly detail: string;
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
   * Draws into every map view's lighting layer, which the view's Lighting switch shows and hides as one, and which
   * the switch is offered for only while some module draws there.
   * @param {LightingLayerDefinition} layer What the module draws there.
   */
  lightingLayer(layer: LightingLayerDefinition): void;

  /**
   * Names a map the plugin copies events from while the game runs, such as J-ABS's action map. Its events are
   * patterns for the plugin rather than things placed on a map, so no kind claims them, and none is offered what a
   * placed event is, such as becoming a chest.
   * @param {number} mapId The map.
   */
  templateMap(mapId: number): void;

  /**
   * Says something over every map view for as long as the module is on, such as a config it could not read and what
   * it draws differently because of it. Nothing dismisses it but the cause going away.
   * @param {ModuleNotice} notice What to say.
   */
  notice(notice: ModuleNotice): void;
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
   * The project config files it reads, by the name the server serves each under ({@code lighting} for
   * {@code data/config.lighting.json}). Each is read before the module switches on and handed over in its context.
   * Left out, it reads none.
   */
  readonly configs?: readonly string[];

  /**
   * Adds the module's contributions.
   * @param {ModuleContributions} contributions Where to add them.
   * @param {ModuleContext} context The enabled plugins, the configs the module reads, and why any of them could not be
   * read.
   */
  readonly register: (contributions: ModuleContributions, context: ModuleContext) => void;
};

export type {
  EventKindDefinition,
  ModuleContext,
  ModuleContributions,
  ModuleNotice,
  PaletteEntry,
  PassabilityQuery,
  PassabilityRule,
  PluginModule,
  QuickPanelProps,
};
