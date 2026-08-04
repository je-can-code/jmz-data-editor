/**
 * Typed view of `data/config.boss.json` for the editor. Mirrors the schema consumed by J-ABS-Boss at
 * game runtime — see `rmmz-plugins/src/plugins/abs/ext/boss/_metadata/_pluginMetadata.js`.
 *
 * The plugin throws when this file is missing or malformed, the same convention every other
 * config-driven plugin follows. The editor is more forgiving on load: {@link hydrateBossConfig} fills
 * in whatever a partial or freshly-created file left out, so the board always has a complete shape to
 * render.
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
const BOSS_STEP_VERBS = [ 'forceSkill' ] as const;

type BossStepVerb = typeof BOSS_STEP_VERBS[number];

type BossStep = {
  verb: BossStepVerb;
  skill: number;
  /** The skill name at authoring time; the plugin refuses to start when this no longer matches. */
  expect: string;
  /** Whether the skill observes its own cast time, which is the telegraph a player reads. */
  cast: boolean;
};

type BossRoutine = {
  key: string;
  /** The interval between executions, in seconds. The plugin converts to frames when it loads. */
  cadence: number;
  steps: BossStep[];
};

type BossParticipant = {
  key: string;
  eventId: number;
  enemyId: number;
  /** The enemy name at authoring time; the plugin refuses to start when this no longer matches. */
  expect: string;
};

type BossEncounter = {
  key: string;
  map: number;
  participants: BossParticipant[];
  aiControl: AiControlMode;
  routines: BossRoutine[];
};

type BossConfigRoot = {
  encounters: BossEncounter[];
};

/**
 * An empty configuration, used when the file does not exist yet.
 */
const BOSS_CONFIG_DEFAULTS: BossConfigRoot = {
  encounters: [],
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

  return {
    verb,
    skill: pickNumber(source, 'skill', 0),
    expect: pickString(source, 'expect', ''),
    // a skill defaults to observing its cast time, matching the plugin: removing a telegraph is the
    // exception and has to be asked for explicitly.
    cast: pickBoolean(source, 'cast', true),
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

  return {
    key: pickString(source, 'key', ''),
    eventId: pickNumber(source, 'eventId', 0),
    enemyId: pickNumber(source, 'enemyId', 0),
    expect: pickString(source, 'expect', ''),
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
    participants: pickArray(source, 'participants')
      .map(hydrateParticipant),
    aiControl,
    routines: pickArray(source, 'routines')
      .map(hydrateRoutine),
  };
}

/**
 * Builds a fully populated {@link BossConfigRoot} from the raw file payload, so the Boss board always
 * has a valid shape to render even against a missing or partial `config.boss.json`.
 * @param {unknown} rawRoot Whatever the data loader returned; may be null for "file not found".
 * @returns {BossConfigRoot} A complete configuration.
 */
function hydrateBossConfig(rawRoot: unknown): BossConfigRoot
{
  if (isPlainObject(rawRoot) === false)
  {
    return { encounters: [] };
  }

  return {
    encounters: pickArray(rawRoot, 'encounters')
      .map(hydrateEncounter),
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
    skill: 0,
    expect: '',
    cast: true,
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
    eventId: 0,
    enemyId: 0,
    expect: '',
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
    participants: [ createBossParticipant() ],
    aiControl: 'shared',
    routines: [],
  };
}

export {
  AI_CONTROL_MODES,
  BOSS_CONFIG_DEFAULTS,
  BOSS_STEP_VERBS,
  createBossEncounter,
  createBossParticipant,
  createBossRoutine,
  createBossStep,
  hydrateBossConfig,
};
export type { AiControlMode, BossConfigRoot, BossEncounter, BossParticipant, BossRoutine, BossStep, BossStepVerb };
