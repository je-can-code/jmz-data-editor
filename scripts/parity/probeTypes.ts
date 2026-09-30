/**
 * The shapes the parity probe is given and reports back, kept apart from the probe itself so the parity rules and
 * their tests can name them without pulling in code that only runs inside the game or under bun.
 */

/**
 * One map the probe draws: where the display sits for each view, and which A1 animation steps to draw.
 */
type ProbeMap = {
  mapId: number;
  views: { x: number; y: number }[];
  steps: number[];
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
 * One picture the probe drew.
 */
type ProbeCapture = {
  mapId: number;
  file: string;
  display: { x: number; y: number };
  step: number;
  pass: 'events' | 'tiles';
};

/**
 * One event as the game shows it on arrival: which page is active, and whether its sprite draws at all. The editor
 * draws every event's first page, so these are what explain a difference in the events pass.
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
   * Every way the game's sprite departs from a plain drawing of the event's first page, as the editor draws it:
   * another page, another image, facing or pattern, a tone, a blend colour, an opacity or a scale, or sprites a plugin
   * hung on it. Empty when the game draws exactly the first page.
   */
  departures: string[];
};

/**
 * What the probe reports when it finishes.
 */
type ProbeReport = {
  phase: string;
  screen: { width: number; height: number };
  captures: ProbeCapture[];
  events: Record<number, ProbeEvent[]>;
  errors: string[];
  log: string[];
};

export type { ProbeCapture, ProbeConfig, ProbeEvent, ProbeMap, ProbeReport };
