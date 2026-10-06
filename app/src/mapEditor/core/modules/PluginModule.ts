import type { ComponentType } from 'react';
import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { EventMarkerSymbol } from '../eventKinds/eventMarkers.ts';
import type { MapDocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { PageCondition } from '../pageRule/pageRule.ts';
import type { MapPropertiesSource } from '../properties/moduleProperties.ts';
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
 * A section a module adds to Map Properties, such as J-Lighting's darkness: settings of the map itself rather than of
 * anything on it, each change one step in the map's history like any other property's.
 */
type MapPropertiesSection = {
  /**
   * Unique, prefixed like event kinds.
   */
  readonly id: string;

  /**
   * The heading the section shows under.
   */
  readonly title: string;

  /**
   * Works out the section's settings for a map, from the map as it stands.
   */
  readonly source: MapPropertiesSource;
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
   * The project config files the module names in {@link PluginModule.configs}, and those it names in
   * {@link PluginModule.extensionConfigs} whose plugins are enabled, read before it switches on, by the name it gave;
   * null for a project without the file, or a file the server could not read.
   */
  readonly configs: ReadonlyMap<string, JsonValue | null>;

  /**
   * Why each config the module names could not be read, by the name it gave, in the server's words where it gave any:
   * the file is missing, is not JSON, or holds a field the strict read refuses. A config read as it should be has no
   * entry, so a module can say what is wrong rather than quietly falling back.
   */
  readonly configProblems: ReadonlyMap<string, string>;

  /**
   * Words when an event page shows, as an author would say it: what its own conditions wait for, then what every page
   * condition the active modules add asks of it, such as "from 18:00 to 05:00". It reads the conditions as they stand
   * when it is asked, so one a module added after this one switched on is heard too.
   * @param {RmmzEventPage} page The page.
   * @returns {readonly string[]} The words, one entry for each thing the page waits for; none for a page waiting for nothing.
   */
  readonly pageWords: (page: RmmzEventPage) => readonly string[];
};

/**
 * A clock a module offers the map views, for a plugin that gives the game a time of day: where the window's clock
 * starts, which is the game's own starting time, and what the game calls each part of the day. The map views show the
 * clock only while some module offers one, and the window has one clock, whichever module offers it, so every map in
 * it shows the same hour.
 */
type ClockOffer = {
  /**
   * The time of day the game starts at, in minutes past midnight, which the window's clock shows until the author moves
   * it.
   */
  readonly startsAt: number;

  /**
   * Names the part of the day a time falls in, as the game names it, such as Night.
   * @param {number} minutes The time of day, in minutes past midnight.
   * @returns {string} The name.
   */
  readonly partOfDay: (minutes: number) => string;
};

/**
 * A project config file a module reads only while some plugins beyond its own are enabled too, such as an extension's
 * config, which is read only while the extension is on: the name the server serves it under, and those plugins, by
 * file name.
 */
type ExtensionConfig = {
  readonly name: string;
  readonly plugins: readonly string[];
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

  /**
   * Offers the map views a clock, for as long as the module is on: the views show it, and the window's clock starts at
   * the time the offer gives. Should several modules offer one, the first to offer says where it starts and how the day
   * is named.
   * @param {ClockOffer} offer Where the clock starts, and what each part of the day is called.
   */
  clock(offer: ClockOffer): void;

  /**
   * Adds a section to Map Properties, shown for every map while the module is on.
   * @param {MapPropertiesSection} section The section.
   */
  mapProperties(section: MapPropertiesSection): void;

  /**
   * Adds a condition to the game's page rule, for as long as the module is on, as J-TIME adds its hours: every map view
   * then shows each event's page as the game would on a fresh save at the clock's time, this condition judged beside
   * the engine's own.
   * @param {PageCondition} condition How the plugin reads a page, and when what the page asks holds.
   */
  pageCondition(condition: PageCondition): void;
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
   * The project config files it reads only while further plugins are enabled beside its own, such as an extension's
   * config, read only while the extension is on. Each is read, like {@link configs}, before the module switches on and
   * handed over in its context, and a project without those plugins is never asked for it. Left out, it reads none.
   */
  readonly extensionConfigs?: readonly ExtensionConfig[];

  /**
   * Adds the module's contributions.
   * @param {ModuleContributions} contributions Where to add them.
   * @param {ModuleContext} context The enabled plugins, the configs the module reads, and why any of them could not be
   * read.
   */
  readonly register: (contributions: ModuleContributions, context: ModuleContext) => void;
};

export type {
  ClockOffer,
  EventKindDefinition,
  ExtensionConfig,
  MapPropertiesSection,
  ModuleContext,
  ModuleContributions,
  ModuleNotice,
  PaletteEntry,
  PassabilityQuery,
  PassabilityRule,
  PluginModule,
  QuickPanelProps,
};
