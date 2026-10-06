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
  errors: string[];
  log: string[];
};

export type { ProbeCapture, ProbeConfig, ProbeEvent, ProbeMap, ProbeReport };
