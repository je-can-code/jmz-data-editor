import { GrowthParser } from '@services/parsers/GrowthParser.ts';
import { knownGrowthCurveParams } from '../../mappers/ParameterIdMapper.ts';

/**
 * The part of a class its Parameter Growth card edits: the growth-curve formulas in its note, and the
 * levels 1-99 each formula is baked into.
 */
type ClassGrowth = {
  note: string;
  params: number[][];
};

/**
 * Copies one class's parameter growth onto another, so an author can build a class from a base class and
 * only adjust what differs, rather than typing every formula again.
 *
 * A clone makes the class grow exactly like the source: each growth-curve formula the source carries is
 * written onto the class, each one it does not carry is removed from it, and the baked levels 1-99 are
 * copied across, so the game reads the cloned growth right away. Nothing else in the class's note is
 * touched- its aptitudes, its unslotted skills, its natural growth.
 */
class ClassGrowthCloner
{
  /**
   * Builds the growth a class has once another class's has been cloned onto it.
   * @param {ClassGrowth} target The class being cloned onto.
   * @param {ClassGrowth} source The class being cloned from.
   * @returns {ClassGrowth} The target's note and params, with the source's growth in place.
   */
  static clone(target: ClassGrowth, source: ClassGrowth): ClassGrowth
  {
    // write every growth-curve formula the source has, one stat at a time; an empty one removes the tag.
    const note = knownGrowthCurveParams()
      .reduce((currentNote, param) =>
      {
        const sourceFormula = GrowthParser.read(source.note, param);
        return GrowthParser.write(currentNote, param, sourceFormula);
      }, target.note);

    // copy the baked levels rather than sharing them, so editing one class can never edit the other.
    const params = source.params.map((row) => [ ...row ]);

    return {
      note,
      params,
    };
  }
}

export type { ClassGrowth };
export { ClassGrowthCloner };
