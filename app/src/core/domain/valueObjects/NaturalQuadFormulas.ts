/**
 * J-NaturalGrowth formula quadrants (tag suffixes BuffPlus, BuffRate, GrowthPlus, GrowthRate).
 */
enum NaturalGrowthQuadrant
{
  BuffPlus = 'buffPlus',
  BuffRate = 'buffRate',
  GrowthPlus = 'growthPlus',
  GrowthRate = 'growthRate',
}

/**
 * Canonical serialization / parse order. Use for defaults; editors may pass a subset in any order.
 */
const NATURAL_GROWTH_QUADRANT_ORDER: readonly NaturalGrowthQuadrant[] = [
  NaturalGrowthQuadrant.BuffPlus,
  NaturalGrowthQuadrant.BuffRate,
  NaturalGrowthQuadrant.GrowthPlus,
  NaturalGrowthQuadrant.GrowthRate,
];

type NaturalQuadFormulas = Record<NaturalGrowthQuadrant, string>;

const emptyNaturalQuadFormulas = (): NaturalQuadFormulas =>
{
  return {
    [ NaturalGrowthQuadrant.BuffPlus ]: '',
    [ NaturalGrowthQuadrant.BuffRate ]: '',
    [ NaturalGrowthQuadrant.GrowthPlus ]: '',
    [ NaturalGrowthQuadrant.GrowthRate ]: '',
  };
};

export type { NaturalQuadFormulas };
export {
  NaturalGrowthQuadrant,
  NATURAL_GROWTH_QUADRANT_ORDER,
  emptyNaturalQuadFormulas,
};
