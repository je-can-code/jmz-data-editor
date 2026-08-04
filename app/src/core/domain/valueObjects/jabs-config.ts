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

type JabsConfigRoot = {
  teams: JabsTeamDefinition[];
  juice: JuiceConfig;
  bosses: BossEncounter[];
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

  return {
    teams,
    juice,
    bosses,
  };
}

export {
  cloneJuiceDefaults,
  hydrateJabsConfig,
  hydrateJuiceConfig,
  JUICE_DEFAULTS,
  JUICE_PROFILE_KEY_PATTERN,
};
export type {
  JabsConfigRoot,
  JabsTeamDefinition,
  JuiceCasterConfig,
  JuiceCastingConfig,
  JuiceConfig,
  JuiceProfile,
  JuiceProfilesMap,
  JuiceTargetConfig,
};