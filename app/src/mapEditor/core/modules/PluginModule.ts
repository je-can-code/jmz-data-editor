import type { ComponentType } from 'react';
import type { PluginsJsEntry } from '../../../services/plugins/PluginsJsReader.ts';
import type { CommandCatalogEntry } from '../commands/catalogTypes.ts';
import type { EventMarkerSymbol } from '../eventKinds/eventMarkers.ts';
import type { MapDocumentKey } from '../model/documentKeys.ts';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { RmmzEventPage, RmmzMapEvent, RmmzTileset } from '../model/rmmzTypes.ts';
import type { PageCondition } from '../pageRule/pageRule.ts';
import type { GamePreview } from '../preview/GamePreview.ts';
import type { PreviewEntry } from '../preview/previewList.ts';
import type { PreviewNouns } from '../preview/previewWords.ts';
import type { MapPropertiesSource } from '../properties/moduleProperties.ts';
import type { LightingLayerDefinition } from '../renderer/lightingLayer.ts';
import type { OverlayDefinition } from '../renderer/MapRenderer.ts';
import type { SkyWeather, WeatherLayerDefinition } from '../renderer/weatherLayer.ts';
import type { SkyPick } from '../time/WindowClock.ts';

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

  /**
   * A config the settings read that is read only once something needs it, such as J-Weather's, whose looks the weather
   * setting lists: the section asks for it as it shows, never before, and shows its settings afresh on each read of it.
   * Left out, the settings read the map alone.
   */
  readonly config?: OnDemandConfig;
};

/**
 * One plugin that reads whether a map has a sky, from the one tag saying a map has none ({@code <noToneChange>}), and
 * what the sky does to a map in it. Map Properties offers the sky setting once, however many plugins read the tag, and
 * names what each of them does.
 */
type SkyReader = {
  /**
   * Unique, prefixed like event kinds; the setting takes it as its key in the section that shows it.
   */
  readonly id: string;

  /**
   * What a map's sky follows in the plugin, as the setting's name says it: "the clock".
   */
  readonly follows: string;

  /**
   * What the sky does to a map in the plugin, as one sentence: "The hour tints and darkens this map."
   */
  readonly does: string;
};

/**
 * One read of a project config file: what it holds, or null when the server could not give it, and why not.
 */
type ConfigRead = {
  readonly content: JsonValue | null;

  /**
   * Why it could not be read, in the server's words where it gave any; null for a config read as it should be.
   */
  readonly problem: string | null;
};

/**
 * A project config file a module reads only once it needs it, rather than before it switches on, such as J-Weather's,
 * which only a map with weather needs: nothing is asked of the server until the module asks for it, and from then on it
 * is read again whenever the module configs are, as when one changes on disk. Whoever listens hears each read that
 * differs from the one before, so a module draws with the config as it stands without switching on afresh.
 */
type OnDemandConfig = {
  /**
   * The config as last read, the same read until another differs from it; undefined until it has been read once.
   * @returns {ConfigRead | undefined} The read.
   */
  readonly current: () => ConfigRead | undefined;

  /**
   * Asks for the config to be read, unless it has been asked for already; the listeners hear once it arrives.
   */
  readonly request: () => void;

  /**
   * Listens for each read of the config that differs from the one before: the first, and each after a change.
   * @param {() => void} listener Called after each such read.
   * @returns {() => void} Stops listening.
   */
  readonly subscribe: (listener: () => void) => () => void;
};

/**
 * Something a module says over every map view that can change while the module is on, such as why a config it read only
 * once a map needed it cannot be drawn from: the views show what it says now, and hear when that changes.
 */
type LiveNotice = {
  /**
   * Unique, prefixed like event kinds; any notice it gives carries it too.
   */
  readonly id: string;

  /**
   * What it says now, or null while it has nothing to say. It is asked whenever its listeners hear of a change, and
   * whenever the module switches on.
   * @returns {ModuleNotice | null} The notice, or null.
   */
  readonly current: () => ModuleNotice | null;

  /**
   * Listens for what it says changing.
   * @param {() => void} listener Called after each change.
   * @returns {() => void} Stops listening.
   */
  readonly subscribe: (listener: () => void) => () => void;
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
   * One of the config files the module names in {@link PluginModule.onDemandConfigs}, by the name it gave, which is not
   * read until the module asks for it. It is the window's one copy, kept from one switch-on to the next, so a config
   * read once is never read again just because the modules switched on afresh. Asking for a config the module does not
   * name there is a mistake in the module, and throws.
   * @param {string} name The config's name.
   * @returns {OnDemandConfig} The config.
   */
  readonly onDemandConfig: (name: string) => OnDemandConfig;

  /**
   * Words when an event page shows, as an author would say it: what its own conditions wait for, then what every page
   * condition the active modules add asks of it, such as "from 18:00 to 05:00". It reads the conditions as they stand
   * when it is asked, so one a module added after this one switched on is heard too.
   * @param {RmmzEventPage} page The page.
   * @returns {readonly string[]} The words, one entry for each thing the page waits for; none for a page waiting for nothing.
   */
  readonly pageWords: (page: RmmzEventPage) => readonly string[];

  /**
   * Every plugin the active modules say reads whether a map has a sky, in the order they said it. It reads them as they
   * stand when it is asked, so one a module said after this one switched on counts too: the sky setting shows in the
   * section of the module that said so first, and names what each of them does.
   * @returns {readonly SkyReader[]} The readers; none while no plugin that reads the tag is on.
   */
  readonly skyReaders: () => readonly SkyReader[];
};

/**
 * The seasons a clock's calendar runs through, for a plugin whose date decides one, as J-TIME's month does. The window's
 * clock holds the season the author picks beside its time of day, numbered as the offer numbers them, and the module
 * reads it as moving the date: the map views name the season on the clock and offer a picker for it, and the module's
 * page conditions judge every page at the date the season gives.
 */
type SeasonOffer = {
  /**
   * What the game calls each season, by the number the clock holds for it, in the order the picker lists them.
   */
  readonly names: readonly string[];

  /**
   * The season the game starts in, which the clock shows until the author picks one.
   */
  readonly startsIn: number;

  /**
   * Words the date a season moves the clock to, as an author would say it, such as "June 16, 2027".
   * @param {number} season The season.
   * @returns {string} The date.
   */
  readonly dateWords: (season: number) => string;
};

/**
 * A clock a module offers the map views, for a plugin that gives the game a time of day: where the window's clock
 * starts, which is the game's own starting time, what the game calls each part of the day, and the seasons its calendar
 * runs through, if it has any. The map views show the clock only while some module offers one, and the window has one
 * clock, whichever module offers it, so every map in it shows the same hour and the same season.
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

  /**
   * The seasons the game's calendar runs through. Left out, the clock has none: it names no season and offers no picker.
   */
  readonly seasons?: SeasonOffer;
};

/**
 * One condition the sky can be in, as the sky's picker lists it at a moment of the window's clock: its name, as the
 * plugin names it, the strengths it is ever at, whether the sky can be in it at that moment at all, and the strength it
 * takes when picked.
 */
type SkyCondition = {
  readonly name: string;

  /**
   * The strengths the condition is ever at, as the plugin names them, weakest first.
   */
  readonly strengths: readonly string[];

  /**
   * Whether the sky can be in the condition at the moment, as it never snows in a summer that does not allow snow.
   */
  readonly possible: boolean;

  /**
   * The strength the condition takes when picked: the nearest it is ever at to the one wanted, or its usual one when none
   * is.
   * @param {string | null} wanted The strength wanted, such as the one picked before, or null for none.
   * @returns {string} The strength.
   */
  readonly strengthFor: (wanted: string | null) => string;
};

/**
 * The conditions the sky's picker lists at a moment of the window's clock, in the order the config lists them, or none,
 * and why not, in the author's words, while the config is read or when it holds no sky.
 */
type SkyListing = {
  readonly conditions: readonly SkyCondition[];

  /**
   * Why no conditions are listed, such as "Reading the project's sky…", or null once they are.
   */
  readonly problem: string | null;
};

/**
 * What the sky is doing at a moment of the window's clock, for the sky the author picked: the weather J-Weather is told,
 * or null when the sky shows nothing then, and what that comes to, in the author's words, such as "Shows as starfall
 * (moderate) at this hour and season."
 */
type SkyReading = {
  readonly weather: SkyWeather | null;
  readonly words: string;
};

/**
 * A sky a module offers the map views, for a plugin that drives one, as J-Weather-Time does: the weather in the sky over
 * every outdoor map, following the window's clock. The author picks its condition and strength on the clock, since a new
 * game's sky is random, and the module works out what the sky looks like at each moment the clock shows. Its config is
 * read only once something needs it: a sky picked, or the picker opened.
 */
type SkyOffer = {
  /**
   * The config the sky is read from, read only once something needs it.
   */
  readonly config: OnDemandConfig;

  /**
   * Every strength the sky is ever at, weakest first, as the plugin names them, for the picker to list.
   */
  readonly strengths: readonly string[];

  /**
   * Lists the conditions the sky can be in, at a moment of the window's clock, in the order the config lists them.
   * @param {number} minutes The clock's time of day, in minutes past midnight.
   * @param {number | null} season The clock's season, or null for the season the game starts in.
   * @returns {SkyListing} The conditions, or none and why not.
   */
  readonly conditionsAt: (minutes: number, season: number | null) => SkyListing;

  /**
   * Works out what the sky is doing at a moment of the window's clock, for the sky the author picked.
   * @param {SkyPick | null} pick The sky picked, or null for none.
   * @param {number} minutes The clock's time of day, in minutes past midnight.
   * @param {number | null} season The clock's season, or null for the season the game starts in.
   * @returns {SkyReading} What the sky is doing.
   */
  readonly readingAt: (pick: SkyPick | null, minutes: number, season: number | null) => SkyReading;
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
 * A kind of state a module lets the preview set beside the switches and variables, such as where each quest stands: how
 * far along the story the author asks every map to show it. The window's preview keeps it, remembers it between
 * sessions, shares it live with every window, counts it in the chip beside the clock and clears it with the rest,
 * without ever reading it; what it means is the module's alone. The module lists it in the Switches & Variables window,
 * and its page conditions judge pages against it, naming what they read by {@link previewKey} with this kind's id.
 */
type PreviewKindDefinition = {
  /**
   * Unique, prefixed like event kinds, which the preview keeps everything of the kind under: {@code quest.states}.
   */
  readonly id: `${string}.${string}`;

  /**
   * The heading its list shows under in the Switches & Variables window, such as "Quests".
   */
  readonly title: string;

  /**
   * What one thing of the kind is called, several, and what one set is, so the chip says "1 quest set".
   */
  readonly nouns: PreviewNouns;

  /**
   * What the list's search box asks for, such as "Find a quest by name or key".
   */
  readonly searchHint: string;

  /**
   * What the list says when its search finds nothing, such as "No quest has that name or key."
   */
  readonly noMatch: string;

  /**
   * Lists every thing of the kind the author can set, each with its choices as the preview stands.
   * @param {GamePreview} preview The window's preview.
   * @returns {readonly PreviewEntry[]} The things, in the order the list shows them.
   */
  readonly entries: (preview: GamePreview) => readonly PreviewEntry[];

  /**
   * Works out what one thing is set to once one of its choices changes, from the preview as it stands at that moment.
   * @param {GamePreview} preview The window's preview.
   * @param {string} key The thing's key within the kind.
   * @param {string} choice The choice that changed, by its id.
   * @param {string} option The value of the option picked.
   * @returns {JsonValue | undefined} The thing's new value, or undefined once it is back as a fresh save holds it.
   */
  readonly choose: (preview: GamePreview, key: string, choice: string, option: string) => JsonValue | undefined;
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
   * Draws into every map view's weather layer, which sits where the game draws its weather, toned with the map and under
   * the lighting's dark, and which the view's Weather switch shows and hides as one; the switch is offered only while
   * some module draws there.
   * @param {WeatherLayerDefinition} layer What the module draws there.
   */
  weatherLayer(layer: WeatherLayerDefinition): void;

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
   * Says something over every map view whenever the module has something to say, which can change while it is on, such
   * as a config read only once a map needed it, which turned out to be one it cannot draw from.
   * @param {LiveNotice} notice What it says, as it stands.
   */
  liveNotice(notice: LiveNotice): void;

  /**
   * Offers the map views a clock, for as long as the module is on: the views show it, and the window's clock starts at
   * the time the offer gives. Should several modules offer one, the first to offer says where it starts, how the day is
   * named and which seasons it has.
   * @param {ClockOffer} offer Where the clock starts, what each part of the day is called, and the seasons, if any.
   */
  clock(offer: ClockOffer): void;

  /**
   * Offers the map views a sky, for as long as the module is on: the views show its picker beside the clock, and hand
   * their renderers the weather it works out at the clock's moment for the sky picked. Should several modules offer one,
   * the first to offer is the sky.
   * @param {SkyOffer} offer The sky.
   */
  sky(offer: SkyOffer): void;

  /**
   * Adds a section to Map Properties, shown for every map while the module is on.
   * @param {MapPropertiesSection} section The section.
   */
  mapProperties(section: MapPropertiesSection): void;

  /**
   * Says the module's plugin reads whether a map has a sky, for as long as the module is on, and what the sky does to a
   * map in it. However many modules say so, Map Properties offers the sky setting once, in the section of the first to
   * say so, which every active module hears through {@link ModuleContext.skyReaders}.
   * @param {SkyReader} reader The plugin's reading.
   */
  skyReader(reader: SkyReader): void;

  /**
   * Adds a condition to the game's page rule, for as long as the module is on, as J-TIME adds its hours: every map view
   * then shows each event's page as the game would on a fresh save at the clock's time, this condition judged beside
   * the engine's own.
   * @param {PageCondition} condition How the plugin reads a page, and when what the page asks holds.
   */
  pageCondition(condition: PageCondition): void;

  /**
   * Lets the preview set a kind of state of the module's own, for as long as the module is on: listed in the Switches &
   * Variables window beside the switches and variables, and named in the chip beside every map's clock.
   * @param {PreviewKindDefinition} kind The kind.
   */
  previewKind(kind: PreviewKindDefinition): void;
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
   * The project config files it reads only once it needs them, by the name the server serves each under, rather than
   * before it switches on: one a map without the plugin's work never needs, so opening such a map never waits on it or
   * reads it at all. Each is read the first time the module asks through {@link ModuleContext.onDemandConfig}, and again
   * whenever the module configs are read after that. Left out, it reads none.
   */
  readonly onDemandConfigs?: readonly string[];

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
  ConfigRead,
  EventKindDefinition,
  ExtensionConfig,
  LiveNotice,
  MapPropertiesSection,
  ModuleContext,
  ModuleContributions,
  ModuleNotice,
  OnDemandConfig,
  PaletteEntry,
  PassabilityQuery,
  PassabilityRule,
  PluginModule,
  PreviewKindDefinition,
  QuickPanelProps,
  SeasonOffer,
  SkyCondition,
  SkyListing,
  SkyOffer,
  SkyReader,
  SkyReading,
};
