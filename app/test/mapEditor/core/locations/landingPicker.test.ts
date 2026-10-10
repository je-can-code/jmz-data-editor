import { describe, expect, it } from 'vitest';
import type { LandingGround } from '../../../../src/mapEditor/core/locations/landingCheck.ts';
import { hoverWords, pickProblem, pickReadout, refusalWords } from '../../../../src/mapEditor/core/locations/landingPicker.ts';
import type { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';

/*
 * What a location picker says, choosing where the player lands: why it refuses a tile clicked, what it holds under the
 * map (the reason for the last refusal, no tile yet, the tile picked, or the tile picked and why the player cannot
 * stand on it), and beside the pointer whether the tile under it is a landing. Picking anything else, it judges no tile,
 * so it says only what it always said.
 */

/**
 * A map judged as a landing, refusing tile 1, 1 alone, as blocked.
 */
const GROUND: LandingGround = {
  map: { mapId: 3 } as MapDocument,
  problemAt: (x, y) => (x === 1 && y === 1 ? { kind: 'blocked' } : null),
};

describe('pickProblem', () =>
{
  it('judges a tile by the map judged, and every tile as fine with nothing judged', () =>
  {
    // Arrange: nothing beyond the map judged above.

    // Act.
    const problems = [ pickProblem(GROUND, { x: 1, y: 1 }), pickProblem(GROUND, { x: 2, y: 1 }), pickProblem(null, { x: 1, y: 1 }) ];

    // Assert.
    expect(problems)
      .toStrictEqual([ { kind: 'blocked' }, null, null ]);
  });
});

describe('refusalWords', () =>
{
  it('names the tile refused and says why', () =>
  {
    // Arrange: nothing beyond the tile and the reason.

    // Act.
    const words = refusalWords({ x: 23, y: 7 }, { kind: 'off-map', width: 10, height: 15 });

    // Assert.
    expect(words)
      .toBe('The player cannot land on 23, 7. That tile is off the map, which is 10 by 15 tiles.');
  });
});

describe('pickReadout', () =>
{
  it('says why the last tile clicked was refused, above all else', () =>
  {
    // Arrange: a tile picked the player cannot stand on, and a refusal since.

    // Act.
    const said = pickReadout({ x: 22, y: 13 }, { kind: 'blocked' }, 'The player cannot land on 1, 1.');

    // Assert.
    expect(said)
      .toBe('The player cannot land on 1, 1.');
  });

  it('says no tile is picked yet, the tile picked, or the tile picked and why the player cannot stand there', () =>
  {
    // Arrange: nothing beyond the three states.

    // Act.
    const said = [ pickReadout(null, null, null), pickReadout({ x: 4, y: 2 }, null, null), pickReadout({ x: 22, y: 13 }, { kind: 'stuck' }, null) ];

    // Assert.
    expect(said)
      .toStrictEqual([
        'No tile picked on this map yet.',
        'Lands on 4, 2',
        'Lands on 22, 13, where the player cannot stand. There is no way off it: every tile around it is blocked.',
      ]);
  });
});

describe('hoverWords', () =>
{
  it('names the tile under the pointer, and says when the player cannot land there', () =>
  {
    // Arrange: nothing beyond the map judged above.

    // Act.
    const words = [ hoverWords({ x: 1, y: 1 }, GROUND), hoverWords({ x: 2, y: 1 }, GROUND), hoverWords({ x: 1, y: 1 }, null) ];

    // Assert.
    expect(words)
      .toStrictEqual([ '1, 1 · cannot land here', '2, 1', '1, 1' ]);
  });
});
