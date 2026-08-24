/**
 * The shape of `data/config.difficulty.json`, and the hydration that guarantees it.
 *
 * This board edits a small slice of a large record, which makes losing the rest the failure worth
 * designing against. Every field a layer can carry is represented here and carried back out on save,
 * whether or not any control in the UI touches it — an omitted field is not "left alone", it is
 * erased the first time somebody presses save.
 */

/**
 * Parameter scaling applied to one side of a fight, as percentages where 100 means unchanged.
 * The three fixed-length groups mirror RPG Maker's own parameter families; custom parameters are
 * open-ended and stay a plain list.
 */
type DifficultyBattlerEffects = {
  bparams: number[];
  xparams: number[];
  sparams: number[];
  cparams: number[];
};

/**
 * Reward scaling applied to the party, as percentages where 100 means unchanged.
 */
type DifficultyBonusEffects = {
  exp: number;
  gold: number;
  drops: number;
  encounters: number;
  sdp: number;
};

/**
 * A weight handed to an enemy affix that was authored as unavailable, making it reachable while the
 * granting layer is enabled.
 */
type DifficultyAffixGrant = {
  stateId: number;
  weight: number;
};

/**
 * Optional affix biasing a layer applies while enabled. A layer that declares none leaves affixes
 * exactly as authored, which is why every field here is optional rather than defaulted.
 */
type DifficultyAffixEffects = {
  prefixChance?: number;
  suffixChance?: number;
  flatten?: number;
  grants?: DifficultyAffixGrant[];
};

/**
 * One difficulty layer. Any number of layers can be active at once and their effects multiply.
 */
type DifficultyLayer = {
  key: string;
  name: string;
  iconIndex: number;
  description: string;
  cost: number;
  actorEffects: DifficultyBattlerEffects;
  enemyEffects: DifficultyBattlerEffects;
  rewards: DifficultyBonusEffects;
  enabled: boolean;
  unlocked: boolean;
  hidden: boolean;
  affixEffects?: DifficultyAffixEffects;
};

/**
 * The file is a bare array of layers, with no wrapping object.
 */
type DifficultyConfigRoot = DifficultyLayer[];

/**
 * How many entries each fixed parameter family holds, so a short authored list is padded rather than
 * read as a shorter set of parameters.
 */
const BPARAM_COUNT = 8;
const XPARAM_COUNT = 10;
const SPARAM_COUNT = 10;

/**
 * The value every parameter and reward percentage means "unchanged" by.
 */
const UNCHANGED_PERCENT = 100;

/**
 * Pads a parameter list out to its family's length, filling absent entries with "unchanged".
 * @param {unknown} source The authored list, which may be short, absent, or not a list at all.
 * @param {number} length How many entries this parameter family holds.
 * @returns {number[]} A list of exactly `length` numbers.
 */
const hydrateParams = (source: unknown, length: number): number[] =>
{
  const authored = Array.isArray(source)
    ? source
    : [];

  return Array.from(
    { length },
    (_unused, index) => Number(authored[ index ] ?? UNCHANGED_PERCENT));
};

/**
 * Fills out one side's parameter scaling, padding the three fixed families and preserving whatever
 * custom parameters were authored.
 * @param {unknown} source The authored effects object.
 * @returns {DifficultyBattlerEffects} A fully populated effects object.
 */
const hydrateBattlerEffects = (source: unknown): DifficultyBattlerEffects =>
{
  const authored = (source ?? {}) as Partial<DifficultyBattlerEffects>;

  return {
    bparams: hydrateParams(authored.bparams, BPARAM_COUNT),
    xparams: hydrateParams(authored.xparams, XPARAM_COUNT),
    sparams: hydrateParams(authored.sparams, SPARAM_COUNT),
    cparams: Array.isArray(authored.cparams)
      ? authored.cparams.map(Number)
      : [],
  };
};

/**
 * Fills out the reward scaling, defaulting anything absent to "unchanged".
 * @param {unknown} source The authored rewards object.
 * @returns {DifficultyBonusEffects} A fully populated rewards object.
 */
const hydrateRewards = (source: unknown): DifficultyBonusEffects =>
{
  const authored = (source ?? {}) as Partial<DifficultyBonusEffects>;

  return {
    exp: Number(authored.exp ?? UNCHANGED_PERCENT),
    gold: Number(authored.gold ?? UNCHANGED_PERCENT),
    drops: Number(authored.drops ?? UNCHANGED_PERCENT),
    encounters: Number(authored.encounters ?? UNCHANGED_PERCENT),
    sdp: Number(authored.sdp ?? UNCHANGED_PERCENT),
  };
};

/**
 * Carries a layer's affix block through untouched, or reports its absence.
 *
 * Deliberately not defaulted the way the other sections are. "No affix block" and "an affix block
 * that changes nothing" are different statements in the file, and inventing the second where the
 * author wrote the first would add a block to all seventeen layers on the first save.
 * @param {unknown} source The authored affix effects, if the layer declared any.
 * @returns {DifficultyAffixEffects|undefined} The block as authored, or undefined when there is none.
 */
const hydrateAffixEffects = (source: unknown): DifficultyAffixEffects | undefined =>
{
  if (source === undefined || source === null)
  {
    return undefined;
  }

  const authored = source as DifficultyAffixEffects;
  const grants = Array.isArray(authored.grants)
    ? authored.grants.map(grant => (
      {
        stateId: Number(grant.stateId),
        weight: Number(grant.weight),
      }))
    : undefined;

  return {
    ...authored,
    ...(grants === undefined
      ? {}
      : { grants }),
  };
};

/**
 * Fills out one layer so every field the file can carry is present in memory.
 * @param {unknown} source One authored layer.
 * @param {number} index Its position in the file, used to name a layer that has no key.
 * @returns {DifficultyLayer} A fully populated layer.
 */
const hydrateLayer = (source: unknown, index: number): DifficultyLayer =>
{
  const authored = (source ?? {}) as Partial<DifficultyLayer>;
  const affixEffects = hydrateAffixEffects(authored.affixEffects);

  return {
    key: String(authored.key ?? `layer_${String(index)}`),
    name: String(authored.name ?? ''),
    iconIndex: Number(authored.iconIndex ?? 0),
    description: String(authored.description ?? ''),
    cost: Number(authored.cost ?? 0),
    actorEffects: hydrateBattlerEffects(authored.actorEffects),
    enemyEffects: hydrateBattlerEffects(authored.enemyEffects),
    rewards: hydrateRewards(authored.rewards),
    enabled: authored.enabled === true,
    unlocked: authored.unlocked === true,
    hidden: authored.hidden === true,
    ...(affixEffects === undefined
      ? {}
      : { affixEffects }),
  };
};

/**
 * Fills out the whole file, so the board never has to ask whether a field was authored.
 * @param {unknown} source The parsed contents of the configuration file.
 * @returns {DifficultyConfigRoot} Every layer, fully populated.
 */
const hydrateDifficultyConfig = (source: unknown): DifficultyConfigRoot =>
{
  if (!Array.isArray(source))
  {
    return [];
  }

  return source.map(hydrateLayer);
};

export {
  hydrateDifficultyConfig,
  hydrateLayer,
  hydrateBattlerEffects,
  hydrateRewards,
  hydrateAffixEffects,
  BPARAM_COUNT,
  XPARAM_COUNT,
  SPARAM_COUNT,
  UNCHANGED_PERCENT,
};
export type {
  DifficultyConfigRoot,
  DifficultyLayer,
  DifficultyBattlerEffects,
  DifficultyBonusEffects,
  DifficultyAffixEffects,
  DifficultyAffixGrant,
};
