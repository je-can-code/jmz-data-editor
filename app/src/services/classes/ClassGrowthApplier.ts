import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import type { KnownParameter } from '../../mappers/ParameterIdMapper.ts';
import type { ClassGrowth } from '@services/classes/ClassGrowthCloner.ts';

/**
 * One stat's formula, as typed into its Parameter Growth row.
 */
type GrowthFormula = {
  param: KnownParameter;
  formula: string;
};

/**
 * Applies the formulas typed into the Classes board's Parameter Growth rows to a class: each becomes the
 * stat's growth-curve tag, which J-LevelMaster reads past level 99, and, for a stat with levels in the
 * class's params, is baked into levels 1-99, which is what the game reads up to there.
 *
 * Any number of formulas land as a single change, which is what lets the card apply every edited row with
 * one click. Each tag is written onto the note the previous one left, so none of them undoes another.
 */
class ClassGrowthApplier
{
  /**
   * Determines whether a stat has levels baked into a class's params. Max Tech has none: it lives only in its
   * tag, so its formula is its entire curve.
   * @param {KnownParameter} param The stat.
   * @returns {boolean}
   */
  static hasBakedLevels(param: KnownParameter): boolean
  {
    return param.key !== 'mtp';
  }

  /**
   * Builds the growth a class has once the given formulas are applied to it.
   * @param {ClassGrowth} growth The class's growth as it stands.
   * @param {GrowthFormula[]} formulas The formulas to apply, one per stat.
   * @returns {ClassGrowth} The class's note and params, with every formula in place.
   */
  static apply(growth: ClassGrowth, formulas: GrowthFormula[]): ClassGrowth
  {
    // write each formula's tag onto the note the one before it left.
    const note = formulas.reduce(
      (currentNote, { param, formula }) => GrowthParser.write(currentNote, param, formula),
      growth.note);

    // copy the params rather than sharing them, then bake each formula whose stat has levels to bake into.
    const params = growth.params.map((row) => [ ...row ]);
    formulas
      .filter(({ param }) => this.hasBakedLevels(param))
      .forEach(({ param, formula }) =>
      {
        params[ param.id ] = this.bake(formula);
      });

    return {
      note,
      params,
    };
  }

  /**
   * Evaluates a formula at every level from 1 to 99, rounded to the whole numbers the database holds. Index 0
   * stays empty, since the engine never reads a level 0.
   * @param {string} formula The formula to evaluate.
   * @returns {number[]} The value at each level, indexed by level.
   */
  static bake(formula: string): number[]
  {
    const values: number[] = [];

    // only the levels the database has room for.
    GrowthParser.generateDataPoints(formula, 99, 1)
      .filter((point) => point.level >= 1 && point.level <= 99)
      .forEach((point) =>
      {
        values[ point.level ] = Math.round(point.value);
      });

    return values;
  }
}

export type { GrowthFormula };
export { ClassGrowthApplier };
