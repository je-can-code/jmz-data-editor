/**
 * Typed view of the `bosses` block inside `data/config.jabs.json`, mirroring the schema consumed by
 * J-ABS-Boss at game runtime — see
 * `rmmz-plugins/src/plugins/abs/ext/boss/_metadata/_pluginMetadata.js`.
 *
 * Encounters share the JABS config file rather than owning one, alongside `teams` and `juice`: one
 * config file per plugin family, one top-level block per plugin. J-ABS core loads the file and each
 * extension reads its own block off it.
 *
 * The editor is forgiving on load — {@link hydrateBossEncounters} fills in whatever a partial or
 * freshly-created block left out, so the board always has a complete shape to render.
 */

/**
 * Who is permitted to drive a boss while an encounter is running.
 *
 * Shared means the encounter layers behavior on top of a boss its normal AI keeps driving, which is
 * what most fights want. Scripted means the encounter drives the boss outright for the duration of a
 * routine, and the routine is expected to suppress the normal AI itself.
 */
const AI_CONTROL_MODES = [ 'shared', 'scripted' ] as const;

type AiControlMode = typeof AI_CONTROL_MODES[number];

/**
 * The verbs a step may perform.
 *
 * This list deliberately matches what J-ABS-Boss implements rather than what a boss fight could
 * conceivably do. Offering a verb the runtime cannot honor would only let an author build a fight
 * that throws the moment it starts.
 */
const BOSS_STEP_VERBS = [
  'forceSkill',
  'addState',
  'removeState',
  'changeImage',
  'quickenRoutine',
  'spawn',
  'tint',
  'animation',
  'dialogue',
] as const;

type BossStepVerb = typeof BOSS_STEP_VERBS[number];

/**
 * One instruction inside a routine or a reaction. Every step carries every field any verb reads, and a
 * verb reads only the ones it has a use for; the rest sit at their "none".
 */
type BossStep = {
  verb: BossStepVerb;
  /** The body the step acts on, by its name, or empty for the first body: the boss. */
  participant: string;
  /** The skill a forced skill performs. */
  skill: number;
  /** The state added to or taken off the body. */
  state: number;
  /**
   * The skill, state, spawned enemy or animation name at authoring time; the plugin refuses to start when
   * this no longer matches.
   */
  expect: string;
  /** Whether the skill observes its own cast time, which is the telegraph a player reads. */
  cast: boolean;
  /** The character sheet a body changes into, by its file name. */
  image: string;
  /** The character on that sheet. */
  index: number;
  /** The routine a quickening speeds up, by its name. */
  routine: string;
  /** How many seconds a quickening takes off that routine's wait, or a tint takes to settle. */
  seconds: number;
  /** The foe a spawn puts on the map. The plugin copies it from the enemy clone map slot with this id. */
  enemyId: number;
  /** The clone map event a spawn copies its body from instead of its enemy's own slot, or 0 for the enemy's own. */
  template: number;
  /** The x coordinate of the tile a spawn puts its body on. */
  x: number;
  /** The y coordinate of the tile a spawn puts its body on. */
  y: number;
  /** The screen tone a tint settles on: red, green and blue from -255 to 255, then gray from 0 to 255. */
  tone: number[];
  /** The animation played over a body, by its id. */
  animation: number;
  /** The name shown with a body's line. */
  speaker: string;
  /** The text a body says, shown together as one message. */
  lines: string[];
};

type BossRoutine = {
  key: string;
  /** The interval between executions, in seconds. The plugin converts to frames when it loads. */
  cadence: number;
  steps: BossStep[];
};

/**
 * The moments of a fight a reaction can answer: the fight beginning, a group of bodies having fallen, or
 * bodies worn down to a percent of their health.
 */
const BOSS_REACTION_TRIGGERS = [ 'start', 'fallen', 'health' ] as const;

type BossReactionTrigger = typeof BOSS_REACTION_TRIGGERS[number];

/**
 * Something a fight does once, the moment a thing happens in it: a boss sealing itself away as the fight
 * opens, its rocks coming faster each time a guardian falls, the seal breaking once they all have, the boss
 * flaring up each time it is worn down past a third of its health.
 */
type BossReaction = {
  key: string;
  /** The moment this reaction answers. */
  on: BossReactionTrigger;
  /**
   * The bodies, by name, that must all have fallen for a `fallen` reaction to fire, or all be worn down for a
   * `health` one. A `health` reaction naming nobody watches the boss.
   */
  participants: string[];
  /** The percent of its health a `health` reaction waits for, inclusive; 0 for every other moment. */
  below: number;
  steps: BossStep[];
};

/**
 * One body taking part in a fight. A body is an enemy and the tile it appears on, never an event on a
 * map: the plugin spawns every body from the enemy clone map when the fight starts, so the same fight
 * runs on any map shaped like its arena.
 */
type BossParticipant = {
  key: string;
  /** The foe this body is. The plugin spawns it from the enemy clone map slot carrying this same id. */
  enemyId: number;
  /** The enemy name at authoring time; the plugin refuses to start when this no longer matches. */
  expect: string;
  /** The x coordinate of the tile this body appears on when the fight starts. */
  x: number;
  /** The y coordinate of the tile this body appears on when the fight starts. */
  y: number;
  /**
   * The clone map event this body spawns from instead of its enemy's own slot, or 0 for the enemy's own:
   * the same foe dressed for this one fight, with a prefix, a role or a level of its own.
   */
  template: number;
};

type BossEncounter = {
  key: string;
  map: number;
  /**
   * The switch the plugin turns on once every body has fallen, or 0 for none. It only turns on for a fight
   * won on `map`, so a test hall staging the same fight never touches the story.
   */
  defeatSwitch: number;
  participants: BossParticipant[];
  aiControl: AiControlMode;
  routines: BossRoutine[];
  reactions: BossReaction[];
};

/**
 * The cadence a new routine starts at, in seconds. Long enough that a fresh routine does not
 * immediately spam whatever skill gets dropped into it.
 */
const DEFAULT_ROUTINE_CADENCE = 20;

/**
 * Determines whether a loaded value is a plain object rather than an array or null.
 * @param {unknown} value The value to inspect.
 * @returns {boolean} True when the value is a plain object.
 */
function isPlainObject(value: unknown): value is Record<string, unknown>
{
  return typeof value === 'object' && value !== null && Array.isArray(value) === false;
}

/**
 * Reads a string from a raw payload, falling back when it is absent or the wrong type.
 * @param {Record<string, unknown>} source The raw object to read from.
 * @param {string} key The property to read.
 * @param {string} fallback The value to use when the property is unusable.
 * @returns {string} The authored string, or the fallback.
 */
function pickString(source: Record<string, unknown>, key: string, fallback: string): string
{
  const raw = source[ key ];
  return (typeof raw === 'string')
    ? raw
    : fallback;
}

/**
 * Reads a finite number from a raw payload, falling back when it is absent or the wrong type.
 * @param {Record<string, unknown>} source The raw object to read from.
 * @param {string} key The property to read.
 * @param {number} fallback The value to use when the property is unusable.
 * @returns {number} The authored number, or the fallback.
 */
function pickNumber(source: Record<string, unknown>, key: string, fallback: number): number
{
  const raw = source[ key ];
  return (typeof raw === 'number' && Number.isFinite(raw))
    ? raw
    : fallback;
}

/**
 * Reads a boolean from a raw payload, falling back when it is absent or the wrong type.
 * @param {Record<string, unknown>} source The raw object to read from.
 * @param {string} key The property to read.
 * @param {boolean} fallback The value to use when the property is unusable.
 * @returns {boolean} The authored boolean, or the fallback.
 */
function pickBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean
{
  const raw = source[ key ];
  return (typeof raw === 'boolean')
    ? raw
    : fallback;
}

/**
 * Reads an array from a raw payload, yielding an empty list when it is absent or the wrong type.
 * @param {Record<string, unknown>} source The raw object to read from.
 * @param {string} key The property to read.
 * @returns {unknown[]} The authored array, or an empty one.
 */
function pickArray(source: Record<string, unknown>, key: string): unknown[]
{
  const raw = source[ key ];
  return Array.isArray(raw)
    ? raw
    : [];
}

/**
 * Builds one step from its raw payload.
 * @param {unknown} rawStep Whatever sat in the routine's step list.
 * @returns {BossStep} A complete step.
 */
function hydrateStep(rawStep: unknown): BossStep
{
  const source = isPlainObject(rawStep)
    ? rawStep
    : {};

  const authoredVerb = pickString(source, 'verb', 'forceSkill');
  const verb = BOSS_STEP_VERBS.includes(authoredVerb as BossStepVerb)
    ? authoredVerb as BossStepVerb
    : 'forceSkill';

  // every field any verb reads is filled in for every step, so switching a step's verb never leaves the
  // new verb's fields missing.
  return {
    verb,
    participant: pickString(source, 'participant', ''),
    skill: pickNumber(source, 'skill', 0),
    state: pickNumber(source, 'state', 0),
    expect: pickString(source, 'expect', ''),
    // a skill defaults to observing its cast time, matching the plugin: removing a telegraph is the
    // exception and has to be asked for explicitly.
    cast: pickBoolean(source, 'cast', true),
    image: pickString(source, 'image', ''),
    index: pickNumber(source, 'index', 0),
    routine: pickString(source, 'routine', ''),
    seconds: pickNumber(source, 'seconds', 0),
    enemyId: pickNumber(source, 'enemyId', 0),
    // a spawn that names no template of its own copies its enemy's slot.
    template: pickNumber(source, 'template', 0),
    x: pickNumber(source, 'x', 0),
    y: pickNumber(source, 'y', 0),
    // only numbers survive; anything else in a tone could never be a color.
    tone: pickArray(source, 'tone')
      .filter((channel): channel is number => typeof channel === 'number' && Number.isFinite(channel)),
    animation: pickNumber(source, 'animation', 0),
    speaker: pickString(source, 'speaker', ''),
    // only text survives; anything else in a line could never be said.
    lines: pickArray(source, 'lines')
      .filter((line): line is string => typeof line === 'string'),
  };
}

/**
 * Builds one reaction from its raw payload.
 * @param {unknown} rawReaction Whatever sat in the encounter's reaction list.
 * @returns {BossReaction} A complete reaction.
 */
function hydrateReaction(rawReaction: unknown): BossReaction
{
  const source = isPlainObject(rawReaction)
    ? rawReaction
    : {};

  const authoredTrigger = pickString(source, 'on', 'start');
  const on = BOSS_REACTION_TRIGGERS.includes(authoredTrigger as BossReactionTrigger)
    ? authoredTrigger as BossReactionTrigger
    : 'start';

  // only names survive; anything else in the list could never match a body.
  const participants = pickArray(source, 'participants')
    .filter((name): name is string => typeof name === 'string');

  return {
    key: pickString(source, 'key', ''),
    on,
    participants,
    // a reaction written before fights could answer a health percent waits on none.
    below: pickNumber(source, 'below', 0),
    steps: pickArray(source, 'steps')
      .map(hydrateStep),
  };
}

/**
 * Builds one routine from its raw payload.
 * @param {unknown} rawRoutine Whatever sat in the encounter's routine list.
 * @returns {BossRoutine} A complete routine.
 */
function hydrateRoutine(rawRoutine: unknown): BossRoutine
{
  const source = isPlainObject(rawRoutine)
    ? rawRoutine
    : {};

  return {
    key: pickString(source, 'key', ''),
    cadence: pickNumber(source, 'cadence', DEFAULT_ROUTINE_CADENCE),
    steps: pickArray(source, 'steps')
      .map(hydrateStep),
  };
}

/**
 * Builds one participant from its raw payload.
 * @param {unknown} rawParticipant Whatever sat in the encounter's participant list.
 * @returns {BossParticipant} A complete participant.
 */
function hydrateParticipant(rawParticipant: unknown): BossParticipant
{
  const source = isPlainObject(rawParticipant)
    ? rawParticipant
    : {};

  // a body written before bodies were spawned named an event instead of a tile; that id is left behind
  // here, since no map holds the boss anymore, and the body arrives with no tile chosen yet.
  return {
    key: pickString(source, 'key', ''),
    enemyId: pickNumber(source, 'enemyId', 0),
    expect: pickString(source, 'expect', ''),
    x: pickNumber(source, 'x', 0),
    y: pickNumber(source, 'y', 0),
    // a body that names no template of its own spawns from its enemy's slot.
    template: pickNumber(source, 'template', 0),
  };
}

/**
 * Builds one encounter from its raw payload.
 * @param {unknown} rawEncounter Whatever sat in the configuration's encounter list.
 * @returns {BossEncounter} A complete encounter.
 */
function hydrateEncounter(rawEncounter: unknown): BossEncounter
{
  const source = isPlainObject(rawEncounter)
    ? rawEncounter
    : {};

  const authoredControl = pickString(source, 'aiControl', 'shared');
  const aiControl = AI_CONTROL_MODES.includes(authoredControl as AiControlMode)
    ? authoredControl as AiControlMode
    : 'shared';

  return {
    key: pickString(source, 'key', ''),
    map: pickNumber(source, 'map', 0),
    // an encounter written before fights could name a defeat switch turns none on.
    defeatSwitch: pickNumber(source, 'defeatSwitch', 0),
    participants: pickArray(source, 'participants')
      .map(hydrateParticipant),
    aiControl,
    routines: pickArray(source, 'routines')
      .map(hydrateRoutine),
    // an encounter written before fights could react to their own moments reacts to nothing.
    reactions: pickArray(source, 'reactions')
      .map(hydrateReaction),
  };
}

/**
 * Builds the full encounter list from the raw `bosses` block, so the Bosses tab always has a valid
 * shape to render even against a config file that has never held one.
 * @param {unknown} rawBosses The `bosses` block as it came off disk; may be undefined entirely.
 * @returns {BossEncounter[]} Every encounter, each one complete.
 */
function hydrateBossEncounters(rawBosses: unknown): BossEncounter[]
{
  if (Array.isArray(rawBosses) === false)
  {
    return [];
  }

  return rawBosses.map(hydrateEncounter);
}

/**
 * Points a step at a different skill, recording the name that skill carries right now.
 *
 * The recorded name is the whole point: J-ABS-Boss compares it against the live database before a
 * fight starts and refuses to run on a mismatch. That check is only worth anything if the name written
 * here came from the same row the plugin will look at, so selection and recording happen together
 * rather than being left to whoever wired up the dropdown.
 * @param {BossStep} step The step being retargeted.
 * @param {number} skillId The id of the newly chosen skill.
 * @param {string} skillName The name that skill carries in the database, or empty when unresolved.
 * @returns {BossStep} A new step aimed at the chosen skill.
 */
function withSkillSelection(step: BossStep, skillId: number, skillName: string): BossStep
{
  return {
    ...step,
    skill: skillId,
    expect: skillName,
  };
}

/**
 * Points a step at a different state, recording the name that state carries right now.
 *
 * Same contract as {@link withSkillSelection}: the id and the name it was chosen under travel together
 * so the runtime drift check has something truthful to compare against.
 * @param {BossStep} step The step being retargeted.
 * @param {number} stateId The id of the newly chosen state.
 * @param {string} stateName The name that state carries in the database, or empty when unresolved.
 * @returns {BossStep} A new step aimed at the chosen state.
 */
function withStateSelection(step: BossStep, stateId: number, stateName: string): BossStep
{
  return {
    ...step,
    state: stateId,
    expect: stateName,
  };
}

/**
 * Points a participant at a different enemy, recording the name that enemy carries right now.
 *
 * Same contract as {@link withSkillSelection}: the id and the name it was chosen under travel together
 * so the runtime drift check has something truthful to compare against.
 * @param {BossParticipant} participant The participant being retargeted.
 * @param {number} enemyId The id of the newly chosen enemy.
 * @param {string} enemyName The name that enemy carries in the database, or empty when unresolved.
 * @returns {BossParticipant} A new participant aimed at the chosen enemy.
 */
function withEnemySelection(participant: BossParticipant, enemyId: number, enemyName: string): BossParticipant
{
  return {
    ...participant,
    enemyId,
    expect: enemyName,
  };
}

/**
 * Points a spawn at a different enemy, recording the name that enemy carries right now.
 *
 * Same contract as {@link withSkillSelection}: the id and the name it was chosen under travel together
 * so the runtime drift check has something truthful to compare against.
 * @param {BossStep} step The step being retargeted.
 * @param {number} enemyId The id of the newly chosen enemy.
 * @param {string} enemyName The name that enemy carries in the database, or empty when unresolved.
 * @returns {BossStep} A new step spawning the chosen enemy.
 */
function withSpawnSelection(step: BossStep, enemyId: number, enemyName: string): BossStep
{
  return {
    ...step,
    enemyId,
    expect: enemyName,
  };
}

/**
 * Builds a blank step for an author to fill in.
 * @returns {BossStep} A new step.
 */
function createBossStep(): BossStep
{
  return {
    verb: 'forceSkill',
    participant: '',
    skill: 0,
    state: 0,
    expect: '',
    cast: true,
    image: '',
    index: 0,
    routine: '',
    seconds: 0,
    enemyId: 0,
    template: 0,
    x: 0,
    y: 0,
    tone: [],
    animation: 0,
    speaker: '',
    lines: [],
  };
}

/**
 * Builds a blank reaction to the fight beginning, holding one empty step.
 * @returns {BossReaction} A new reaction.
 */
function createBossReaction(): BossReaction
{
  return {
    key: '',
    on: 'start',
    participants: [],
    below: 0,
    steps: [ createBossStep() ],
  };
}

/**
 * Builds a blank routine holding one empty step.
 * @returns {BossRoutine} A new routine.
 */
function createBossRoutine(): BossRoutine
{
  return {
    key: '',
    cadence: DEFAULT_ROUTINE_CADENCE,
    steps: [ createBossStep() ],
  };
}

/**
 * Builds a blank participant for an author to fill in.
 * @returns {BossParticipant} A new participant.
 */
function createBossParticipant(): BossParticipant
{
  return {
    key: '',
    enemyId: 0,
    expect: '',
    x: 0,
    y: 0,
    template: 0,
  };
}

/**
 * Builds a blank encounter holding one empty participant.
 * @returns {BossEncounter} A new encounter.
 */
function createBossEncounter(): BossEncounter
{
  return {
    key: '',
    map: 0,
    defeatSwitch: 0,
    participants: [ createBossParticipant() ],
    aiControl: 'shared',
    routines: [],
    reactions: [],
  };
}

export {
  AI_CONTROL_MODES,
  BOSS_REACTION_TRIGGERS,
  BOSS_STEP_VERBS,
  createBossEncounter,
  createBossParticipant,
  createBossReaction,
  createBossRoutine,
  createBossStep,
  hydrateBossEncounters,
  withEnemySelection,
  withSkillSelection,
  withSpawnSelection,
  withStateSelection,
};
export type {
  AiControlMode,
  BossEncounter,
  BossParticipant,
  BossReaction,
  BossReactionTrigger,
  BossRoutine,
  BossStep,
  BossStepVerb,
};
