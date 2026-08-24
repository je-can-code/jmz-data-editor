import { describe, expect, it } from 'vitest';
import {
  BATTLER_SIDES,
  countModifiedInFamily,
  countModifiedParameters,
  DIFFICULTY_PARAMETER_FAMILIES,
  isParameterModified,
  isParameterRowModified,
  readParameter,
  totalParameterSlots,
} from '@core/domain/valueObjects/difficulty-parameters.ts';
import { hydrateLayer } from '@core/domain/valueObjects/difficulty-config.ts';
import type { DifficultyLayer } from '@core/domain/valueObjects/difficulty-config.ts';

/**
 * Everything the parameter surface decides is decided here, so the view can stay a renderer.
 *
 * The surface exists to solve a specific problem: a layer holds fifty-six parameter values and
 * typically changes fewer than ten of them, so the useful question is never "what are all the
 * values" but "which ones did this layer touch". Every function below answers some form of that,
 * and each is what drives a piece of the UI - the section badges, the change filter, the emphasis
 * on a field, and the reset control that only appears where there is something to undo.
 *
 * The families are also asserted here rather than taken on trust. They are built from
 * {@link ParameterIdMapper}, which carries Jeremy's own parameter names instead of the engine's, and
 * a family silently losing a parameter would mean a value that can never be edited and can still be
 * saved over.
 */
describe('DIFFICULTY_PARAMETER_FAMILIES', () =>
{
  it('covers the three families a layer actually stores', () =>
  {
    // Arrange - nothing; the families are a static description of the file's shape.

    // Act
    const keys = DIFFICULTY_PARAMETER_FAMILIES.map(family => family.key);

    // Assert
    expect(keys)
      .toEqual([ 'bparams', 'xparams', 'sparams' ]);
  });

  it('holds every parameter each family stores', () =>
  {
    // Arrange - the counts the engine fixes: eight core stats, ten ex, ten sp.

    // Act
    const counts = DIFFICULTY_PARAMETER_FAMILIES.map(family => family.parameters.length);

    // Assert
    expect(counts)
      .toEqual([ 8, 10, 10 ]);
  });

  it('names parameters rather than numbering them', () =>
  {
    // Arrange - a difficulty author is looking for the stat, not for index 2 of the b-params.
    const coreStats = DIFFICULTY_PARAMETER_FAMILIES[ 0 ];

    // Act
    const names = coreStats.parameters.map(parameter => parameter.name);

    // Assert
    expect(names)
      .toEqual([ 'Max Life', 'Max Magi', 'Power', 'Endurance', 'Force', 'Resist', 'Speed', 'Luck' ]);
  });

  it('addresses each parameter by its index within its own family', () =>
  {
    // Arrange - the id is what indexes the stored array, so an off-by-one here writes to the
    // wrong parameter entirely.
    const rates = DIFFICULTY_PARAMETER_FAMILIES[ 1 ];

    // Act
    const ids = rates.parameters.map(parameter => parameter.id);

    // Assert
    expect(ids)
      .toEqual([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]);
  });
});

describe('BATTLER_SIDES', () =>
{
  it('names both sides of a fight, in reading order', () =>
  {
    // Arrange - actors first, matching how a difficulty reads: what it does to you, then to them.

    // Act
    const keys = BATTLER_SIDES.map(side => side.key);

    // Assert
    expect(keys)
      .toEqual([ 'actorEffects', 'enemyEffects' ]);
  });
});

describe('isParameterModified', () =>
{
  it('reports a raised value as modified', () =>
  {
    // Arrange & Act & Assert
    expect(isParameterModified(150))
      .toBe(true);
  });

  it('reports a lowered value as modified', () =>
  {
    // Arrange & Act & Assert - the other side of the boundary, since a filter that only noticed
    // increases would hide every layer that weakens something.
    expect(isParameterModified(80))
      .toBe(true);
  });

  it('reports the unchanged value as unmodified', () =>
  {
    // Arrange & Act & Assert
    expect(isParameterModified(100))
      .toBe(false);
  });

  it('reports zero as modified', () =>
  {
    // Arrange & Act & Assert - zero is a real authored value meaning "none of it", not an absence.
    expect(isParameterModified(0))
      .toBe(true);
  });
});

describe('readParameter', () =>
{
  it('reads the value at the requested index of the requested family', () =>
  {
    // Arrange - distinct values across families and indices, so a read of the wrong one is visible.
    const effects = {
      bparams: [ 80, 110, 100, 100, 100, 100, 100, 100 ],
      xparams: [ 100, 100, 130, 100, 100, 100, 100, 100, 100, 100 ],
      sparams: [ 100, 100, 100, 100, 100, 100, 100, 100, 100, 100 ],
      cparams: [],
    };

    // Act & Assert
    expect(readParameter(effects, 'bparams', 1))
      .toBe(110);
    expect(readParameter(effects, 'xparams', 2))
      .toBe(130);
  });

  it('treats a slot the file never wrote as unchanged', () =>
  {
    // Arrange - hydration pads the families, but a short list reaching this directly must still
    // read as "no effect" rather than as undefined.
    const effects = {
      bparams: [ 80 ],
      xparams: [],
      sparams: [],
      cparams: [],
    };

    // Act & Assert
    expect(readParameter(effects, 'bparams', 5))
      .toBe(100);
  });
});

/**
 * Builds a layer whose parameters are all unchanged, ready for a test to disturb exactly one thing.
 * @returns {DifficultyLayer}
 */
const unchangedLayer = (): DifficultyLayer =>
{
  return hydrateLayer({ key: 'a-layer' }, 0);
};

describe('countModifiedInFamily', () =>
{
  it('counts nothing when a family is untouched', () =>
  {
    // Arrange
    const layer = unchangedLayer();

    // Act & Assert
    expect(countModifiedInFamily(layer, 'bparams'))
      .toBe(0);
  });

  it('counts a change on either side of the fight', () =>
  {
    // Arrange - one change per side, so a count that read only actors would report one instead
    // of two.
    const layer = unchangedLayer();
    layer.actorEffects.bparams[ 0 ] = 80;
    layer.enemyEffects.bparams[ 2 ] = 150;

    // Act & Assert
    expect(countModifiedInFamily(layer, 'bparams'))
      .toBe(2);
  });

  it('counts only the family it was asked about', () =>
  {
    // Arrange - the near-miss: a change in a neighbouring family that must not be counted.
    const layer = unchangedLayer();
    layer.actorEffects.bparams[ 0 ] = 80;
    layer.actorEffects.xparams[ 0 ] = 120;

    // Act & Assert
    expect(countModifiedInFamily(layer, 'bparams'))
      .toBe(1);
    expect(countModifiedInFamily(layer, 'xparams'))
      .toBe(1);
  });
});

describe('countModifiedParameters', () =>
{
  it('counts nothing for a layer that changes no parameters', () =>
  {
    // Arrange - CA's default layer is exactly this, and it must read as zero rather than as
    // fifty-six unchanged values.
    const layer = unchangedLayer();

    // Act & Assert
    expect(countModifiedParameters(layer))
      .toBe(0);
  });

  it('totals changes across every family and both sides', () =>
  {
    // Arrange - one change in each family, spread across both sides.
    const layer = unchangedLayer();
    layer.actorEffects.bparams[ 0 ] = 80;
    layer.enemyEffects.xparams[ 3 ] = 50;
    layer.actorEffects.sparams[ 9 ] = 200;

    // Act & Assert
    expect(countModifiedParameters(layer))
      .toBe(3);
  });
});

describe('totalParameterSlots', () =>
{
  it('counts every editable slot across both sides', () =>
  {
    // Arrange - eight core stats plus ten rates plus ten modifiers, for each of two sides.

    // Act & Assert
    expect(totalParameterSlots())
      .toBe(56);
  });
});

describe('isParameterRowModified', () =>
{
  it('reports a row where the actor side changed', () =>
  {
    // Arrange
    const layer = unchangedLayer();
    layer.actorEffects.bparams[ 0 ] = 80;

    // Act & Assert
    expect(isParameterRowModified(layer, 'bparams', 0))
      .toBe(true);
  });

  it('reports a row where only the enemy side changed', () =>
  {
    // Arrange - the row carries both sides, so hiding it because actors are unchanged would hide
    // the comparison the row exists to make.
    const layer = unchangedLayer();
    layer.enemyEffects.bparams[ 0 ] = 150;

    // Act & Assert
    expect(isParameterRowModified(layer, 'bparams', 0))
      .toBe(true);
  });

  it('reports an untouched row as unmodified', () =>
  {
    // Arrange - the near-miss: an adjacent row that did change, so "row 0 is clean" and
    // "every row is clean" are distinguishable.
    const layer = unchangedLayer();
    layer.actorEffects.bparams[ 1 ] = 80;

    // Act & Assert
    expect(isParameterRowModified(layer, 'bparams', 0))
      .toBe(false);
    expect(isParameterRowModified(layer, 'bparams', 1))
      .toBe(true);
  });
});
