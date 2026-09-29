/**
 * The shape of `data/config.difficulty.json`, and the hydration that guarantees it.
 *
 * This board edits a small slice of a large record, which makes losing the rest the failure worth
 * designing against. Every field a layer can carry is represented here and carried back out on save,
 * whether or not any control in the UI touches it — an omitted field is not "left alone", it is
 * erased the first time somebody presses save.
 */

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
 * One difficulty layer. Any number of layers can be enabled at once; each names the state every actor
 * carries and the state every enemy carries while it is.
 */
type DifficultyLayer = {
  key: string;
  name: string;
  iconIndex: number;
  description: string;
  cost: number;
  actorStateId: number;
  enemyStateId: number;
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
 * The state id meaning a layer grants that side of every fight nothing.
 */
const NO_STATE = 0;

/**
 * Carries a layer's affix block through untouched, or reports its absence.
 *
 * Deliberately not defaulted the way the other sections are. "No affix block" and "an affix block
 * that changes nothing" are different statements in the file, and inventing the second where the
 * author wrote the first would add a block to every layer on the first save.
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
    actorStateId: Number(authored.actorStateId ?? NO_STATE),
    enemyStateId: Number(authored.enemyStateId ?? NO_STATE),
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
  hydrateAffixEffects,
  NO_STATE,
};
export type {
  DifficultyConfigRoot,
  DifficultyLayer,
  DifficultyAffixEffects,
  DifficultyAffixGrant,
};
