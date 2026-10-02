import type { JsonValue } from './json.ts';

/**
 * A sound as RMMZ stores it: a map's music and ambience, and every audio parameter of an event command.
 */
type RmmzAudio = {
  name: string;
  pan: number;
  pitch: number;
  volume: number;
};

/**
 * One random encounter row in a map's properties.
 */
type RmmzEncounter = {
  troopId: number;
  weight: number;
  regionSet: number[];
};

/**
 * One event command. The parameters stay raw JSON until a command catalog entry interprets them, so a command
 * the editor does not understand yet still saves back exactly as it arrived. {@code collapsed} is present only
 * on a branch somebody folded shut in MZ.
 */
type RmmzEventCommand = {
  code: number;
  indent: number;
  parameters: JsonValue[];
  collapsed?: boolean;
};

/**
 * One step of a move route. MZ writes three shapes: with parameters, with parameters and an indent, and with
 * an indent alone; each round-trips as it came.
 */
type RmmzMoveCommand = {
  code: number;
  parameters?: JsonValue[];
  indent?: number | null;
};

/**
 * A move route: an event page's autonomous movement, or the route a Set Movement Route command carries.
 */
type RmmzMoveRoute = {
  list: RmmzMoveCommand[];
  repeat: boolean;
  skippable: boolean;
  wait: boolean;
};

/**
 * What must hold for an event page to be the active one.
 */
type RmmzEventConditions = {
  actorId: number;
  actorValid: boolean;
  itemId: number;
  itemValid: boolean;
  selfSwitchCh: string;
  selfSwitchValid: boolean;
  switch1Id: number;
  switch1Valid: boolean;
  switch2Id: number;
  switch2Valid: boolean;
  variableId: number;
  variableValid: boolean;
  variableValue: number;
};

/**
 * An event page's graphic: a character sheet cell, or a tile when {@code tileId} is not zero.
 */
type RmmzEventImage = {
  tileId: number;
  characterName: string;
  direction: number;
  pattern: number;
  characterIndex: number;
};

/**
 * One event page, exactly as RMMZ stores it. The editor reads it in groups (conditions, image, movement,
 * options, priority, trigger and the command list); {@link describeEventPage} gives that grouped view without
 * ever changing how the page is stored.
 */
type RmmzEventPage = {
  conditions: RmmzEventConditions;
  directionFix: boolean;
  image: RmmzEventImage;
  list: RmmzEventCommand[];
  moveFrequency: number;
  moveRoute: RmmzMoveRoute;
  moveSpeed: number;
  moveType: number;
  priorityType: number;
  stepAnime: boolean;
  through: boolean;
  trigger: number;
  walkAnime: boolean;
};

/**
 * One map event. {@code meta} is the note's tags as some MZ versions persist them; it is carried verbatim and
 * only when the file had it.
 */
type RmmzMapEvent = {
  id: number;
  name: string;
  note: string;
  pages: RmmzEventPage[];
  x: number;
  y: number;
  meta?: JsonValue;
};

/**
 * Every top-level field of a map file except its tile data and its events.
 */
type RmmzMapProperties = {
  autoplayBgm: boolean;
  autoplayBgs: boolean;
  battleback1Name: string;
  battleback2Name: string;
  bgm: RmmzAudio;
  bgs: RmmzAudio;
  disableDashing: boolean;
  displayName: string;
  encounterList: RmmzEncounter[];
  encounterStep: number;
  height: number;
  note: string;
  parallaxLoopX: boolean;
  parallaxLoopY: boolean;
  parallaxName: string;
  parallaxShow: boolean;
  parallaxSx: number;
  parallaxSy: number;
  scrollType: number;
  specifyBattleback: boolean;
  tilesetId: number;
  width: number;
  meta?: JsonValue;
};

/**
 * A {@code data/Map###.json} file. {@code data} is the six layers flattened: four tile layers, then shadows,
 * then regions, each {@code width * height} long. {@code events} is sparse: the index is the event id, and
 * empty slots (index 0 always, and trailing slots too) are null.
 */
type RmmzMap = RmmzMapProperties & {
  data: number[];
  events: (RmmzMapEvent | null)[];
};

/**
 * One row of {@code data/MapInfos.json}: a map's place in the tree. {@code quick} is present only on the rows
 * MZ has written it to.
 */
type RmmzMapInfo = {
  id: number;
  expanded: boolean;
  name: string;
  order: number;
  parentId: number;
  scrollX: number;
  scrollY: number;
  quick?: boolean;
};

/**
 * One row of {@code data/CommonEvents.json}: a command list any event can call by id, or that runs by itself
 * while its switch is on ({@code trigger} 1 runs it automatically, 2 in parallel, 0 only when called).
 */
type RmmzCommonEvent = {
  id: number;
  list: RmmzEventCommand[];
  name: string;
  switchId: number;
  trigger: number;
};

/**
 * One row of {@code data/Tilesets.json}. {@code tilesetNames} holds the nine sheets in RMMZ order (A1, A2, A3,
 * A4, A5, B, C, D, E), and {@code flags} the passability and terrain bits for every tile id.
 */
type RmmzTileset = {
  id: number;
  flags: number[];
  mode: number;
  name: string;
  note: string;
  tilesetNames: string[];
};

export type {
  RmmzAudio,
  RmmzCommonEvent,
  RmmzEncounter,
  RmmzEventCommand,
  RmmzEventConditions,
  RmmzEventImage,
  RmmzEventPage,
  RmmzMap,
  RmmzMapEvent,
  RmmzMapInfo,
  RmmzMapProperties,
  RmmzMoveCommand,
  RmmzMoveRoute,
  RmmzTileset,
};
