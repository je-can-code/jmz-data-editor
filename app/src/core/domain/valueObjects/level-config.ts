/**
 * Typed view of `data/config.level.json` for the editor. Mirrors the strict schema enforced by
 * J-LevelMaster at game runtime — see `rmmz-plugins/src/plugins/level/core/_metadata/_pluginMetadata.js`.
 *
 * The plugin throws when this file is missing or malformed (same convention as J-ABS/J-SDP/etc). The
 * editor is more forgiving on load: {@link hydrateLevelConfig} fills in any missing scalar from the
 * plugin's own defaults so the board always has a complete shape to render, even against a partial or
 * freshly-created file.
 */

type LevelConfigRoot = {
  useScaling: boolean;
  minMultiplier: number;
  maxMultiplier: number;
  rewardMinMultiplier: number | null;
  rewardMaxMultiplier: number | null;
  growthMultiplier: number;
  invariantUpperRange: number;
  invariantLowerRange: number;
  variableActorBalancer: number;
  variableEnemyBalancer: number;
  defaultBeyondMaxLevel: number;
  trueMaxLevel: number;
  useSharedActorLevel: boolean;
  canonicalExpBasis: number;
  canonicalExpExtra: number;
  canonicalExpAccA: number;
  canonicalExpAccB: number;
};

/**
 * Matches J-LevelMaster's shipped plugin defaults (pre-migration PluginManager parameter defaults),
 * also mirrored in `ca/chef-adventure/data/config.level.json`.
 */
const LEVEL_CONFIG_DEFAULTS: LevelConfigRoot = {
  useScaling: true,
  minMultiplier: 0.10,
  maxMultiplier: 2.00,
  rewardMinMultiplier: null,
  rewardMaxMultiplier: null,
  growthMultiplier: 0.10,
  invariantUpperRange: 1,
  invariantLowerRange: 1,
  variableActorBalancer: 141,
  variableEnemyBalancer: 142,
  defaultBeyondMaxLevel: 255,
  trueMaxLevel: 1000,
  useSharedActorLevel: true,
  canonicalExpBasis: 30,
  canonicalExpExtra: 20,
  canonicalExpAccA: 30,
  canonicalExpAccB: 30,
};

function isPlainObject(value: unknown): value is Record<string, unknown>
{
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function pickNumber(source: Record<string, unknown>, key: string, fallback: number): number
{
  const raw = source[ key ];
  return (typeof raw === "number" && Number.isFinite(raw))
    ? raw
    : fallback;
}

function pickNullableNumber(source: Record<string, unknown>, key: string): number | null
{
  const raw = source[ key ];
  return (typeof raw === "number" && Number.isFinite(raw))
    ? raw
    : null;
}

function pickBoolean(source: Record<string, unknown>, key: string, fallback: boolean): boolean
{
  const raw = source[ key ];
  return (typeof raw === "boolean")
    ? raw
    : fallback;
}

/**
 * Builds a fully populated {@link LevelConfigRoot} by overlaying authored values from the raw file
 * payload on top of {@link LEVEL_CONFIG_DEFAULTS}. Used on load so the Level board always has a valid
 * shape to render, even against a missing/partial `config.level.json`.
 *
 * @param rawRoot Whatever the data loader returned (may be `null` for "file not found").
 */
function hydrateLevelConfig(rawRoot: unknown): LevelConfigRoot
{
  if (isPlainObject(rawRoot) === false)
  {
    return { ...LEVEL_CONFIG_DEFAULTS };
  }

  return {
    useScaling: pickBoolean(rawRoot, "useScaling", LEVEL_CONFIG_DEFAULTS.useScaling),
    minMultiplier: pickNumber(rawRoot, "minMultiplier", LEVEL_CONFIG_DEFAULTS.minMultiplier),
    maxMultiplier: pickNumber(rawRoot, "maxMultiplier", LEVEL_CONFIG_DEFAULTS.maxMultiplier),
    rewardMinMultiplier: pickNullableNumber(rawRoot, "rewardMinMultiplier"),
    rewardMaxMultiplier: pickNullableNumber(rawRoot, "rewardMaxMultiplier"),
    growthMultiplier: pickNumber(rawRoot, "growthMultiplier", LEVEL_CONFIG_DEFAULTS.growthMultiplier),
    invariantUpperRange: pickNumber(rawRoot, "invariantUpperRange", LEVEL_CONFIG_DEFAULTS.invariantUpperRange),
    invariantLowerRange: pickNumber(rawRoot, "invariantLowerRange", LEVEL_CONFIG_DEFAULTS.invariantLowerRange),
    variableActorBalancer: pickNumber(rawRoot, "variableActorBalancer", LEVEL_CONFIG_DEFAULTS.variableActorBalancer),
    variableEnemyBalancer: pickNumber(rawRoot, "variableEnemyBalancer", LEVEL_CONFIG_DEFAULTS.variableEnemyBalancer),
    defaultBeyondMaxLevel: pickNumber(rawRoot, "defaultBeyondMaxLevel", LEVEL_CONFIG_DEFAULTS.defaultBeyondMaxLevel),
    trueMaxLevel: pickNumber(rawRoot, "trueMaxLevel", LEVEL_CONFIG_DEFAULTS.trueMaxLevel),
    useSharedActorLevel: pickBoolean(rawRoot, "useSharedActorLevel", LEVEL_CONFIG_DEFAULTS.useSharedActorLevel),
    canonicalExpBasis: pickNumber(rawRoot, "canonicalExpBasis", LEVEL_CONFIG_DEFAULTS.canonicalExpBasis),
    canonicalExpExtra: pickNumber(rawRoot, "canonicalExpExtra", LEVEL_CONFIG_DEFAULTS.canonicalExpExtra),
    canonicalExpAccA: pickNumber(rawRoot, "canonicalExpAccA", LEVEL_CONFIG_DEFAULTS.canonicalExpAccA),
    canonicalExpAccB: pickNumber(rawRoot, "canonicalExpAccB", LEVEL_CONFIG_DEFAULTS.canonicalExpAccB),
  };
}

export { hydrateLevelConfig, LEVEL_CONFIG_DEFAULTS };
export type { LevelConfigRoot };
