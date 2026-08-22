/**
 * Typed view of `data/config.jabs.json` for the editor. Mirrors the strict schema enforced by J-ABS
 * and its extensions at game runtime — see `rmmz-plugins/src/plugins/abs/ext/juice/_metadata/_pluginMetadata.js`.
 *
 * The file carries one top-level block per plugin in the family: `teams` for J-ABS core, `juice` for
 * J-ABS-Juice, `bosses` for J-ABS-Boss. **Every block on disk must appear on {@link JabsConfigRoot}**,
 * because {@link hydrateJabsConfig} drops keys it does not know about and the result is what gets
 * saved back — an unmodeled block is erased from the file rather than merely ignored.
 *
 * The plugins throw when a block (or any required sub-key) is missing. The editor is more forgiving:
 * when a `config.jabs.json` lacks `juice` (or has partial sections), {@link hydrateJabsConfig} fills
 * in the gaps from {@link JUICE_DEFAULTS} so the user can still edit and re-save a complete file.
 */
import { type BossEncounter, hydrateBossEncounters } from '@core/domain/valueObjects/boss-config.ts';

type JabsTeamDefinition = {
  id: number;
  key?: string;
  name?: string;
  opposes?: number[];
};

type JuiceTargetConfig = {
  physicalSquishIntensity: number;
  magicalSquishIntensity: number;
  squishFrames: number;
  healingRecipientScale: number;
  flurryDecayPercent: number;
};

type JuiceCasterConfig = {
  dodgeSquishIntensity: number;
  dodgeSquishFrames: number;
  supportPulseIntensity: number;
  supportPulseFrames: number;
  strikeTiltRadians: number;
  strikeTiltFrames: number;
  weaponSwingPeakRadians: number;
  weaponSwingFrames: number;
  spriteVerticalOffsetPixels: number;
  unarmedStrikeSquishIntensity: number;
  unarmedStrikeSquishFrames: number;
};

type JuiceCastingConfig = {
  pulseAmplitude: number;
};

type JuiceProfile = {
  tiltMul: number;
  swingMul: number;
};

type JuiceProfilesMap = Record<string, JuiceProfile>;

type JuiceConfig = {
  target: JuiceTargetConfig;
  caster: JuiceCasterConfig;
  casting: JuiceCastingConfig;
  profiles: JuiceProfilesMap;
};

/**
 * One food group a consumable can belong to.
 *
 * The keys are the same ones the chain states carry, so this list is the vocabulary an author picks from rather than
 * a second opinion about what the groups are.
 */
type JabsFoodTypeDefinition = {
  key: string;
  name: string;
  iconIndex: number;
};

/**
 * Which game variable holds which combat statistic.
 *
 * Every value is a variableId, and every key is a metric J-ABS-Metrics records into it. The plugin
 * throws at boot when any key is missing, so this type is exhaustive on purpose - a metric added to
 * the plugin without being added here is a block the editor writes back incomplete.
 *
 * Two metrics pointed at one variable is the failure this editor exists to prevent: the game reports
 * no error, both counters simply climb into the same slot and every number downstream of them is
 * quietly wrong.
 */
type JabsMetricsConfig = {
  enemiesDefeated: number;
  destructiblesDestroyed: number;
  alliesDowned: number;
  numberOfDeaths: number;
  totalDamageDealt: number;
  highestDamageDealt: number;
  numberOfCritsDealt: number;
  biggestCritDealt: number;
  attacksEvadedByEnemies: number;
  totalDamageTaken: number;
  highestDamageTaken: number;
  numberOfCritsTaken: number;
  biggestCritTaken: number;
  numberOfParries: number;
  numberOfPreciseParries: number;
  numberOfGlancingBlows: number;
  numberOfGuardedHits: number;
  attacksEvadedByParty: number;
  damagePreventedByGuarding: number;
  mainhandSkillUsage: number;
  offhandSkillUsage: number;
  assignedSkillUsage: number;
  dodgeSkillUsage: number;
  guardActivations: number;
  toolUsage: number;
  usableItemUsage: number;
};

type JabsConfigRoot = {
  teams: JabsTeamDefinition[];
  juice: JuiceConfig;
  bosses: BossEncounter[];
  foodTypes: JabsFoodTypeDefinition[];
  metrics: JabsMetricsConfig;
};

/**
 * Hardcoded juice defaults — identical to the seed values committed in
 * `ca/chef-adventure/data/config.jabs.json` and the documented shape in the plugin help block.
 *
 * Used both as the in-memory fallback for fields the JSON file does not author and as the source for
 * "Reset to default" affordances in the JABS config board.
 */
const JUICE_DEFAULTS: JuiceConfig = {
  target: {
    physicalSquishIntensity: 0.12,
    magicalSquishIntensity: 0.08,
    squishFrames: 10,
    healingRecipientScale: 0.65,
    flurryDecayPercent: 72,
  },
  caster: {
    dodgeSquishIntensity: 0.28,
    dodgeSquishFrames: 12,
    supportPulseIntensity: 0.06,
    supportPulseFrames: 12,
    strikeTiltRadians: 0.18,
    strikeTiltFrames: 6,
    weaponSwingPeakRadians: 0.65,
    weaponSwingFrames: 10,
    spriteVerticalOffsetPixels: 10,
    unarmedStrikeSquishIntensity: 0.14,
    unarmedStrikeSquishFrames: 9,
  },
  casting: {
    pulseAmplitude: 0.045,
  },
  profiles: {
    default: {
      tiltMul: 1,
      swingMul: 1,
    },
  },
};

/**
 * Hardcoded metric defaults — the reserved run of variables committed in
 * `ca/chef-adventure/data/config.jabs.json` and documented in the J-ABS-Metrics help block.
 *
 * Declaration order is meaningful: it is the order the metrics are presented in, grouped the way the
 * plugin groups them, so a reader of either file meets them in the same sequence.
 */
const METRICS_DEFAULTS: JabsMetricsConfig = {
  enemiesDefeated: 61,
  destructiblesDestroyed: 62,
  alliesDowned: 63,
  numberOfDeaths: 64,
  totalDamageDealt: 65,
  highestDamageDealt: 66,
  numberOfCritsDealt: 67,
  biggestCritDealt: 68,
  attacksEvadedByEnemies: 69,
  totalDamageTaken: 70,
  highestDamageTaken: 71,
  numberOfCritsTaken: 72,
  biggestCritTaken: 73,
  numberOfParries: 74,
  numberOfPreciseParries: 75,
  numberOfGlancingBlows: 76,
  numberOfGuardedHits: 77,
  attacksEvadedByParty: 78,
  damagePreventedByGuarding: 79,
  mainhandSkillUsage: 80,
  offhandSkillUsage: 81,
  assignedSkillUsage: 82,
  dodgeSkillUsage: 83,
  guardActivations: 84,
  toolUsage: 85,
  usableItemUsage: 86,
};

/**
 * Regex matching the same charset the J-ABS-Juice plugin accepts for `<jabsJuiceWeaponStyle:...>` notes
 * and `profiles.*` keys in `config.jabs.json`. Used for *soft* validation in the editor (we show a hint
 * when a key falls outside this set but never block save — the dev owns their data).
 */
const JUICE_PROFILE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Returns a fresh deep copy of {@link JUICE_DEFAULTS}. Use when seeding state from defaults so callers
 * never mutate the shared constant by accident.
 */
function cloneJuiceDefaults(): JuiceConfig
{
  const profiles: JuiceProfilesMap = {};
  for (const [ k, v ] of Object.entries(JUICE_DEFAULTS.profiles))
  {
    profiles[ k ] = { ...v };
  }

  return {
    target: { ...JUICE_DEFAULTS.target },
    caster: { ...JUICE_DEFAULTS.caster },
    casting: { ...JUICE_DEFAULTS.casting },
    profiles,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown>
{
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function pickNumber(source: unknown, key: string, fallback: number): number
{
  if (isPlainObject(source) === false)
  {
    return fallback;
  }

  const raw = source[ key ];

  if (typeof raw === "number" && Number.isFinite(raw))
  {
    return raw;
  }

  if (typeof raw === "string")
  {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed))
    {
      return parsed;
    }
  }

  return fallback;
}

/**
 * Builds a fully populated {@link JuiceConfig} by overlaying authored values from the raw file payload
 * on top of {@link JUICE_DEFAULTS}. Used by the JABS context on load so the editor always has a valid
 * shape to render, even when `config.jabs.json` does not yet author the `juice` block.
 *
 * Unknown / partial profile rows fall back to `{ tiltMul: 1, swingMul: 1 }` so the row is still
 * editable. The `default` profile is always guaranteed to exist in the result.
 *
 * @param rawJuice The `juice` slot from a parsed `config.jabs.json` (any shape; may be undefined).
 */
function hydrateJuiceConfig(rawJuice: unknown): JuiceConfig
{
  const defaults = cloneJuiceDefaults();

  if (isPlainObject(rawJuice) === false)
  {
    return defaults;
  }

  // `rawJuice` is narrowed to Record<string, unknown> at this point; bracket access keeps tsconfig
  // strict index-signature checks happy (noPropertyAccessFromIndexSignature).
  const rawTarget = rawJuice[ "target" ];
  const rawCaster = rawJuice[ "caster" ];
  const rawCasting = rawJuice[ "casting" ];
  const rawProfiles = rawJuice[ "profiles" ];

  const target: JuiceTargetConfig = {
    physicalSquishIntensity: pickNumber(rawTarget, "physicalSquishIntensity", defaults.target.physicalSquishIntensity),
    magicalSquishIntensity: pickNumber(rawTarget, "magicalSquishIntensity", defaults.target.magicalSquishIntensity),
    squishFrames: pickNumber(rawTarget, "squishFrames", defaults.target.squishFrames),
    healingRecipientScale: pickNumber(rawTarget, "healingRecipientScale", defaults.target.healingRecipientScale),
    flurryDecayPercent: pickNumber(rawTarget, "flurryDecayPercent", defaults.target.flurryDecayPercent),
  };

  const caster: JuiceCasterConfig = {
    dodgeSquishIntensity: pickNumber(rawCaster, "dodgeSquishIntensity", defaults.caster.dodgeSquishIntensity),
    dodgeSquishFrames: pickNumber(rawCaster, "dodgeSquishFrames", defaults.caster.dodgeSquishFrames),
    supportPulseIntensity: pickNumber(rawCaster, "supportPulseIntensity", defaults.caster.supportPulseIntensity),
    supportPulseFrames: pickNumber(rawCaster, "supportPulseFrames", defaults.caster.supportPulseFrames),
    strikeTiltRadians: pickNumber(rawCaster, "strikeTiltRadians", defaults.caster.strikeTiltRadians),
    strikeTiltFrames: pickNumber(rawCaster, "strikeTiltFrames", defaults.caster.strikeTiltFrames),
    weaponSwingPeakRadians: pickNumber(rawCaster, "weaponSwingPeakRadians", defaults.caster.weaponSwingPeakRadians),
    weaponSwingFrames: pickNumber(rawCaster, "weaponSwingFrames", defaults.caster.weaponSwingFrames),
    spriteVerticalOffsetPixels: pickNumber(rawCaster, "spriteVerticalOffsetPixels", defaults.caster.spriteVerticalOffsetPixels),
    unarmedStrikeSquishIntensity: pickNumber(rawCaster, "unarmedStrikeSquishIntensity", defaults.caster.unarmedStrikeSquishIntensity),
    unarmedStrikeSquishFrames: pickNumber(rawCaster, "unarmedStrikeSquishFrames", defaults.caster.unarmedStrikeSquishFrames),
  };

  const casting: JuiceCastingConfig = {
    pulseAmplitude: pickNumber(rawCasting, "pulseAmplitude", defaults.casting.pulseAmplitude),
  };

  const profiles: JuiceProfilesMap = {};

  if (isPlainObject(rawProfiles))
  {
    for (const [ key, rawRow ] of Object.entries(rawProfiles))
    {
      profiles[ key ] = {
        tiltMul: pickNumber(rawRow, "tiltMul", 1),
        swingMul: pickNumber(rawRow, "swingMul", 1),
      };
    }
  }

  if (Object.prototype.hasOwnProperty.call(profiles, "default") === false)
  {
    profiles[ "default" ] = { ...defaults.profiles[ "default" ]! };
  }

  return {
    target,
    caster,
    casting,
    profiles,
  };
}

/**
 * Normalizes the `metrics` block, filling any key the file does not author from
 * {@link METRICS_DEFAULTS}.
 *
 * A partial block is filled rather than rejected because the plugin's metric list grows over time,
 * and a file written before a metric existed is a normal thing to open- not a broken one. The
 * filled-in value is the plugin's own documented default, which is at least a real variable in the
 * reserved run rather than a zero that would silently point the metric at variable 0.
 *
 * @param rawMetrics Whatever sat under the `metrics` key, if anything.
 */
function hydrateMetricsConfig(rawMetrics: unknown): JabsMetricsConfig
{
  const record = isPlainObject(rawMetrics)
    ? rawMetrics
    : null;

  // start from the defaults so every key is present, then let the file override the ones it names.
  const hydrated = { ...METRICS_DEFAULTS };

  if (record === null)
  {
    return hydrated;
  }

  (Object.keys(METRICS_DEFAULTS) as (keyof JabsMetricsConfig)[]).forEach(key =>
  {
    const value = record[ key ];

    // a key present but holding something other than a number is a corrupt entry, and honoring it
    // would put a string where the game will do arithmetic.
    if (Number.isFinite(value) === false)
    {
      return;
    }

    hydrated[ key ] = value as number;
  });

  return hydrated;
}

/**
 * Normalizes a freshly loaded `config.jabs.json` payload into the editor's strongly-typed
 * {@link JabsConfigRoot} shape. Missing fields are filled from {@link JUICE_DEFAULTS}, teams are coerced
 * to an array, and unrelated extra keys on the raw root are dropped so the saved file stays clean.
 *
 * @param rawRoot Whatever the data loader returned (may be `null` for "file not found").
 */
function hydrateJabsConfig(rawRoot: unknown): JabsConfigRoot
{
  // narrowed by isPlainObject; bracket access keeps the tsconfig index-signature rule satisfied.
  const rootRecord = isPlainObject(rawRoot)
    ? rawRoot
    : null;

  const teams = rootRecord !== null && Array.isArray(rootRecord[ "teams" ])
    ? (rootRecord[ "teams" ] as JabsTeamDefinition[])
    : [];

  const juice = hydrateJuiceConfig(rootRecord === null
    ? undefined
    : rootRecord[ "juice" ]);

  const bosses = hydrateBossEncounters(rootRecord === null
    ? undefined
    : rootRecord[ "bosses" ]);

  // anything omitted here is not merely unread - it is written away the next time the board saves, because the save
  // replaces the file with whatever this returned.
  const foodTypes = rootRecord !== null && Array.isArray(rootRecord[ "foodTypes" ])
    ? (rootRecord[ "foodTypes" ] as JabsFoodTypeDefinition[])
    : [];

  const metrics = hydrateMetricsConfig(rootRecord === null
    ? undefined
    : rootRecord[ "metrics" ]);

  return {
    teams,
    juice,
    bosses,
    foodTypes,
    metrics,
  };
}

export {
  cloneJuiceDefaults,
  hydrateJabsConfig,
  hydrateJuiceConfig,
  hydrateMetricsConfig,
  JUICE_DEFAULTS,
  JUICE_PROFILE_KEY_PATTERN,
  METRICS_DEFAULTS,
};
export type {
  JabsConfigRoot,
  JabsFoodTypeDefinition,
  JabsMetricsConfig,
  JabsTeamDefinition,
  JuiceCasterConfig,
  JuiceCastingConfig,
  JuiceConfig,
  JuiceProfile,
  JuiceProfilesMap,
  JuiceTargetConfig,
};