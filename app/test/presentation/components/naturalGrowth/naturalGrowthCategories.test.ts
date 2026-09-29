import { describe, expect, it } from 'vitest';
import { knownLongParams } from '@mappers/ParameterIdMapper.ts';
import { NATURAL_GROWTH_UI_CATEGORIES } from '@presentation/components/naturalGrowth/naturalGrowthCategories.ts';

/**
 * The cards the natural growth panel lays its parameters out in.
 *
 * The contract is that every parameter the panel's parser reads and rewrites has exactly one row in the panel.
 * A parameter missing from every card still keeps its tags through a save, so nothing reports a problem, and
 * its growth simply cannot be seen or tuned from the editor. That is how a class's Shield Amplification growth
 * went unnoticed through a whole balancing pass.
 */
describe('NATURAL_GROWTH_UI_CATEGORIES', () =>
{
  it('lists every parameter the parser manages in exactly one card', () =>
  {
    // Arrange
    const knownIds = knownLongParams()
      .map(param => param.longParamId)
      .sort((left, right) => left - right);

    // Act
    const listedIds = NATURAL_GROWTH_UI_CATEGORIES
      .flatMap(category => category.longIds)
      .sort((left, right) => left - right);

    // Assert- the same ids, the same number of times: none missing, none listed twice.
    expect(listedIds)
      .toEqual(knownIds);
  });

  it('gives the shield stats a card of their own', () =>
  {
    // Arrange
    // Act
    const shield = NATURAL_GROWTH_UI_CATEGORIES.find(category => category.title === 'Shield');

    // Assert- Shield Amplification and Shield Effectiveness.
    expect(shield?.longIds)
      .toEqual([ 38, 39 ]);
  });
});
