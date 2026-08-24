import { knownBaseParams, knownExParams, knownSpParams, type KnownParameter } from '@mappers/ParameterIdMapper.ts';
import { UNCHANGED_PERCENT } from '@core/domain/valueObjects/difficulty-config.ts';
import type { DifficultyBattlerEffects, DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * Which of a layer's three fixed parameter families a value belongs to.
 */
type ParameterFamilyKey = 'bparams' | 'xparams' | 'sparams';

/**
 * Which side of a fight a parameter effect applies to.
 */
type BattlerSideKey = 'actorEffects' | 'enemyEffects';

/**
 * One family of parameters, named for what it actually governs rather than for the engine field it
 * is stored in. An author balancing a difficulty is looking for "the thing that makes enemies hit
 * harder", not for index 2 of the b-params.
 */
type ParameterFamily = {
  key: ParameterFamilyKey;
  title: string;
  subtitle: string;
  parameters: KnownParameter[];
};

/**
 * The three families in the order they read: what a battler is, then how often things land, then
 * what everything costs.
 */
const DIFFICULTY_PARAMETER_FAMILIES: ParameterFamily[] = [
  {
    key: 'bparams',
    title: 'Core Stats',
    subtitle: 'The eight stats every battler is built from.',
    parameters: knownBaseParams(),
  },
  {
    key: 'xparams',
    title: 'Rates and Chances',
    subtitle: 'How often something lands, dodges, crits, or ticks back.',
    parameters: knownExParams(),
  },
  {
    key: 'sparams',
    title: 'Damage, Costs and Rewards',
    subtitle: 'How much gets through, what it costs, and what comes back.',
    parameters: knownSpParams(),
  },
];

/**
 * Both sides of a fight, in the order they are shown side by side on a parameter row.
 */
const BATTLER_SIDES: { key: BattlerSideKey; label: string }[] = [
  {
    key: 'actorEffects',
    label: 'Actors',
  },
  {
    key: 'enemyEffects',
    label: 'Enemies',
  },
];

/**
 * Whether a parameter value actually changes anything.
 *
 * This is the question the whole parameter surface is organised around: across a real seventeen-layer
 * configuration only about an eighth of the values differ from unchanged, so the useful view is
 * almost always "which ones did this layer touch" rather than the full grid.
 * @param {number} value The authored percentage.
 * @returns {boolean} True when the value departs from unchanged.
 */
const isParameterModified = (value: number): boolean =>
{
  return value !== UNCHANGED_PERCENT;
};

/**
 * Reads one parameter out of one side of a layer.
 * @param {DifficultyBattlerEffects} effects The side to read from.
 * @param {ParameterFamilyKey} family Which family the parameter belongs to.
 * @param {number} parameterId The parameter's index within its family.
 * @returns {number} The authored percentage, defaulting to unchanged when the slot is absent.
 */
const readParameter = (
  effects: DifficultyBattlerEffects,
  family: ParameterFamilyKey,
  parameterId: number): number =>
{
  return effects[ family ][ parameterId ] ?? UNCHANGED_PERCENT;
};

/**
 * Counts how many parameters a layer changes within one family, across both sides.
 * Drives the per-section badge, which is what makes a collapsed section still say whether it holds
 * anything worth opening.
 * @param {DifficultyLayer} layer The layer being summarised.
 * @param {ParameterFamilyKey} family Which family to count within.
 * @returns {number} How many values in that family depart from unchanged.
 */
const countModifiedInFamily = (layer: DifficultyLayer, family: ParameterFamilyKey): number =>
{
  return BATTLER_SIDES.reduce((runningTotal, side) =>
  {
    const values = layer[ side.key ][ family ];

    return runningTotal + values.filter(isParameterModified).length;
  }, 0);
};

/**
 * Counts every parameter a layer changes, across every family and both sides.
 * @param {DifficultyLayer} layer The layer being summarised.
 * @returns {number} How many values depart from unchanged.
 */
const countModifiedParameters = (layer: DifficultyLayer): number =>
{
  return DIFFICULTY_PARAMETER_FAMILIES.reduce(
    (runningTotal, family) => runningTotal + countModifiedInFamily(layer, family.key),
    0);
};

/**
 * How many parameter slots a layer holds in total, across every family and both sides.
 * Pairs with {@link countModifiedParameters} to say "8 of 56" rather than a bare count.
 * @returns {number} The total number of editable parameter slots.
 */
const totalParameterSlots = (): number =>
{
  const perSide = DIFFICULTY_PARAMETER_FAMILIES.reduce(
    (runningTotal, family) => runningTotal + family.parameters.length,
    0);

  return perSide * BATTLER_SIDES.length;
};

/**
 * Whether a parameter row has anything to show while the view is filtered to changes only.
 *
 * Decided per row rather than per field, because the two sides sit on one row: hiding a row whose
 * enemy value changed but whose actor value did not would hide the comparison the row exists for.
 * @param {DifficultyLayer} layer The layer being viewed.
 * @param {ParameterFamilyKey} family Which family the row belongs to.
 * @param {number} parameterId The parameter's index within its family.
 * @returns {boolean} True when either side of the row departs from unchanged.
 */
const isParameterRowModified = (
  layer: DifficultyLayer,
  family: ParameterFamilyKey,
  parameterId: number): boolean =>
{
  return BATTLER_SIDES.some(side => isParameterModified(readParameter(layer[ side.key ], family, parameterId)));
};

export {
  DIFFICULTY_PARAMETER_FAMILIES,
  BATTLER_SIDES,
  isParameterModified,
  isParameterRowModified,
  readParameter,
  countModifiedInFamily,
  countModifiedParameters,
  totalParameterSlots,
};
export type {
  ParameterFamily,
  ParameterFamilyKey,
  BattlerSideKey,
};
