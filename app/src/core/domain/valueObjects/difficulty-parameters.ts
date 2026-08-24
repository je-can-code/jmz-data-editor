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
 * Both sides of a fight, in the order their tracks stack on a parameter row.
 *
 * Each carries its own palette tone, because on a stacked row colour is what says which side a bar
 * belongs to. Direction needs no colour there - the tracks share an axis, so which way a bar runs
 * from the unchanged mark already says whether the value went up or down.
 */
const BATTLER_SIDES: { key: BattlerSideKey; label: string; tone: string }[] = [
  {
    key: 'actorEffects',
    label: 'Actors',
    tone: 'info',
  },
  {
    key: 'enemyEffects',
    label: 'Enemies',
    tone: 'error',
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
 * The top of the magnitude track.
 *
 * A thousand rather than the five hundred the live configuration currently tops out at, so a layer
 * can reach for something more extreme than anything authored so far without the control becoming
 * the reason it cannot. The cost is that unchanged sits a tenth of the way along rather than a
 * fifth, which leaves reductions working in a narrower band than increases - the number beside each
 * track is what makes that band precise.
 */
const PARAMETER_SLIDER_MAX = 1000;

/**
 * How far a drag moves a parameter.
 *
 * Five rather than one because every authored value in the live configuration is a multiple of ten
 * except a deliberate 1, and a step fine enough to land on that would make dragging to 120 an
 * exercise. The number field is what reaches an odd value.
 */
const PARAMETER_SLIDER_STEP = 5;

/**
 * Where a value sits along the track, as a percentage of its width.
 * @param {number} value The parameter percentage.
 * @returns {number} A position between 0 and 100.
 */
const parameterTrackPercent = (value: number): number =>
{
  const clamped = Math.min(Math.max(value, 0), PARAMETER_SLIDER_MAX);

  return (clamped / PARAMETER_SLIDER_MAX) * 100;
};

/**
 * Where a value's magnitude bar starts and how wide it runs.
 *
 * Measured from the unchanged mark rather than from zero, so the width means "how far this was moved"
 * instead of "how large this is". An unchanged value produces no width at all, which is what lets a
 * section of untouched parameters disappear into empty rails.
 * @param {number} value The parameter percentage.
 * @returns {{startPercent: number, widthPercent: number}} The bar's bounds along the track.
 */
const parameterFillBounds = (value: number): { startPercent: number; widthPercent: number } =>
{
  const anchor = parameterTrackPercent(UNCHANGED_PERCENT);
  const position = parameterTrackPercent(value);

  return {
    startPercent: Math.min(anchor, position),
    widthPercent: Math.abs(position - anchor),
  };
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
  PARAMETER_SLIDER_MAX,
  PARAMETER_SLIDER_STEP,
  isParameterModified,
  isParameterRowModified,
  parameterTrackPercent,
  parameterFillBounds,
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
