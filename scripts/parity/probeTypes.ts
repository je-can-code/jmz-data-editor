/**
 * The shapes the parity probe is given and reports back, kept apart from the probe itself so the parity rules and
 * their tests can name them without pulling in code that only runs inside the game or under bun.
 */

/**
 * One map the probe draws: where the display sits for each view, which A1 animation steps to draw, and whether to draw
 * it dark too, with J-Lighting's light mask over its tiles. A map given a time of day is drawn at that time instead: the
 * game's clock is set to it and stopped before the player arrives, so the sky is already there on arrival and every
 * event shows the page that hour gives it; its events are drawn as the game shows them then, and its tiles with the
 * screen's tone over them and the light mask, if the hour or the map darkens it, multiplied over that.
 */
type ProbeMap = {
  mapId: number;
  views: { x: number; y: number }[];
  steps: number[];
  dark: boolean;

  /**
   * The time of day to draw the map's sky at, in minutes past midnight; left out, the map is drawn without its sky.
   */
  time?: number;

  /**
   * Where the display sits for the map's weather, which the probe reads and draws instead of every other pass: what
   * J-Weather put on the screen, layer by layer, and the whole spriteset as the player sees it there. Left out, the
   * map's weather is set aside, as in every other pass.
   */
  weather?: { x: number; y: number };
};

/**
 * One number summed up across a population of particles: its least, its greatest and its mean; all three 0 for no one.
 */
type ProbeSpread = {
  min: number;
  max: number;
  mean: number;
};

/**
 * One layer of a map's weather as one side draws it: the picture and its size, what its particles become and that
 * picture's size, its blend (the engine's number in the game, pixi's name in the editor), its tint, the layer as J-Weather
 * resolved it from the config, and its population summed up the same way on both sides.
 */
type WeatherLayerProbe = {
  asset: string | null;
  becomesAsset: string | null;
  pictureSize: number[] | null;
  becomesPictureSize: number[] | null;
  blend: number | string | null;
  tint: number | null;
  layer: Record<string, unknown>;
  stats: {
    count: number;
    firstLife: number;
    secondLife: number;
    waiting: number;
    onScreen: number;
    velocityX: ProbeSpread;
    velocityY: ProbeSpread;
    scaleX: ProbeSpread;
    scaleY: ProbeSpread;
    rotation: ProbeSpread;
    life: ProbeSpread;
    opacity: ProbeSpread;
  };
};

/**
 * Where the game draws a map's weather in its sprite tree: the spriteset's children by name, the base sprite's index
 * among them and the filters it carries (its colour filter casts the screen's tone), the base sprite's children by name
 * and the weather plane's index among them, the light mask's index in the spriteset (-1 without J-Lighting), and the
 * screen's tone as the weather was read.
 */
type WeatherDepthProbe = {
  spriteset: string[];
  baseIndex: number;
  baseFilters: string[];
  base: string[];
  planeIndex: number;
  maskIndex: number;
  tone: number[];
};

/**
 * What the probe read of one map's weather: the weather J-Weather resolved for it, where its plane sits, every layer on
 * the plane, the display it was drawn at, the hour the game's clock read, and the picture of the whole spriteset.
 */
type WeatherProbe = {
  current: { preset: string; intensity: string } | null;
  depth: WeatherDepthProbe;
  layers: WeatherLayerProbe[];
  display: { x: number; y: number };
  clock: number;
  file: string;
};

/**
 * What the probe is told to do, embedded in the injected script.
 */
type ProbeConfig = {
  /** Where the pictures, the report and the ready marker go. */
  outDir: string;

  /** The maps to draw, in order. */
  maps: ProbeMap[];

  /** Ticks (a tenth of a second each) before the probe gives up. */
  tickLimit: number;
};

/**
 * One picture the probe drew: the events as the game shows them, the tiles alone, the tiles alone with the light mask
 * multiplied over them, or the tiles alone under the sky at a time of day, toned, with the light mask over them.
 */
type ProbeCapture = {
  mapId: number;
  file: string;
  display: { x: number; y: number };
  step: number;
  pass: 'events' | 'tiles' | 'dark' | 'sky';

  /**
   * The time of day a sky picture was drawn at, in minutes past midnight; absent from every other pass.
   */
  time?: number;
};

/**
 * One event as the game shows it on arrival: which page is active, and whether its sprite draws at all. The editor
 * draws each event's page as a fresh save would at the game's clock, so a page the game shows that the editor does not,
 * or a sprite drawn otherwise than its page, is what explains a difference in the events pass.
 */
type ProbeEvent = {
  id: number;
  page: number;
  visible: boolean;
  characterName: string;
  tileId: number;
  x: number;
  y: number;

  /**
   * The sprite's drawn size in pixels, scale included, for working out which cells it covers.
   */
  width: number;
  height: number;

  /**
   * Every way the game's sprite departs from a plain drawing of the page it shows: another image, facing or pattern
   * than the page's, a tone, a blend colour, an opacity or a scale, or sprites a plugin hung on it. Empty when the game
   * draws exactly the page it shows, or shows no page and so draws nothing.
   */
  departures: string[];

  /**
   * Whether each of the event's pages holds as the game judges it on arrival, by page: Game_Event#meetsConditions, every
   * plugin's condition included, as Game_Event#findProperPageIndex asks it of each page. Null for a page whose judging
   * threw, as a page waiting on a quest the game does not track makes it; empty for an event with no pages of its own.
   */
  meets: (boolean | null)[];
};

/**
 * What the probe reports when it finishes. The events are kept by map, under the map's id, or under the id and the time
 * of day for a map drawn under its sky ({@code 337@1320}), since which page an event shows can depend on the hour; and
 * under the same keys, the time of day the game's clock read as they were recorded, in minutes past midnight, or -1 for
 * a game with no clock.
 */
type ProbeReport = {
  phase: string;
  screen: { width: number; height: number };
  captures: ProbeCapture[];
  events: Record<string, ProbeEvent[]>;
  clocks: Record<string, number>;

  /**
   * The weather read on each map the probe was asked to read it on, by the map's id; and what J-Weather-Time's sky was
   * doing on the fresh save before the probe held it off, so the weather reads as J-Weather alone resolves it.
   */
  weather?: Record<string, WeatherProbe>;
  freshSky?: unknown;
  errors: string[];
  log: string[];
};

export type { ProbeCapture, ProbeConfig, ProbeEvent, ProbeMap, ProbeReport, ProbeSpread, WeatherDepthProbe, WeatherLayerProbe, WeatherProbe };
