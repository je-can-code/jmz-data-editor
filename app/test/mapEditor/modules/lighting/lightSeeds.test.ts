import { describe, expect, it } from 'vitest';
import { hashText, lightRolls, lightSeed } from '../../../../src/mapEditor/modules/lighting/lightSeeds.ts';

/*
 * J-Lighting rolls two numbers at random for each light the moment it appears: where in its cycle it starts, and its own
 * tempo. The editor rolls them from the light's map and its name instead, so they never change: drawing the map again,
 * editing an event, panning the view or opening the map another day finds every light where it was in its cycle, at the
 * tempo it had. Different lights must still land apart, the near ones too, or a wall of torches would burn in formation:
 * the next event along, the second light on the same page, and the same torch on another map each roll their own.
 *
 * Each roll runs from 0 up to 1, as Math.random's do, and a light's two rolls are unrelated to each other.
 */
describe('lightSeeds', () =>
{
  describe('lightSeed', () =>
  {
    it('names a light by its map and its name', () =>
    {
      // Arrange: the first light of event 12 on map 6.

      // Act.
      const seed = lightSeed(6, 'page:12#0');

      // Assert.
      expect(seed)
        .toBe('map:6/page:12#0');
    });
  });

  describe('hashText', () =>
  {
    it('hashes a text to the same 32-bit number every time, and to another under another salt', () =>
    {
      // Arrange: one text hashed twice under one salt, and once under another.
      const text = 'map:6/page:12#0';

      // Act.
      const hashes = [ hashText(text, 1), hashText(text, 1), hashText(text, 2) ];

      // Assert.
      expect(hashes)
        .toStrictEqual([ 3689471308, 3689471308, 1896463115 ]);
    });

    it('spreads texts differing by one character far apart', () =>
    {
      // Arrange: neighbouring events' first lights.
      const texts = [ 'map:6/page:12#0', 'map:6/page:13#0' ];

      // Act.
      const hashes = texts.map(text => hashText(text, 1));

      // Assert.
      expect(hashes)
        .toStrictEqual([ 3689471308, 1364384185 ]);
    });
  });

  describe('lightRolls', () =>
  {
    it('rolls a light the same two numbers every time', () =>
    {
      // Arrange: the first torch on map 6, rolled twice.

      // Act.
      const rolls = [ lightRolls(6, 'page:12#0'), lightRolls(6, 'page:12#0') ];

      // Assert.
      expect(rolls)
        .toStrictEqual([ { phase: 0.39530870225280523, rate: 0.3494193935766816 }, { phase: 0.39530870225280523, rate: 0.3494193935766816 } ]);
    });

    it('rolls the next event\'s light, the page\'s second light, and the same torch on another map numbers of their own', () =>
    {
      // Arrange: the near misses of the first torch on map 6.
      const lights: [ number, string ][] = [ [ 6, 'page:13#0' ], [ 6, 'page:12#1' ], [ 7, 'page:12#0' ] ];

      // Act.
      const rolls = lights.map(([ mapId, lightId ]) => lightRolls(mapId, lightId));

      // Assert: each far from the first torch's 0.40 and 0.35.
      expect(rolls)
        .toStrictEqual([
          { phase: 0.8932188409380615, rate: 0.9992545358836651 },
          { phase: 0.6807234149891883, rate: 0.6567476140335202 },
          { phase: 0.9686567552853376, rate: 0.8547567343339324 },
        ]);
    });

    it('rolls every light on a full map from 0 up to 1, the two rolls of each spread on their own', () =>
    {
      // Arrange: three lights on each of the 999 events a map can hold.
      const ids = Array.from({ length: 999 }, (_, index) => [ 0, 1, 2 ].map(ordinal => `page:${index + 1}#${ordinal}`)).flat();

      // Act.
      const rolls = ids.map(id => lightRolls(348, id));

      // Assert: all within range; and splitting both rolls at a half leaves every quarter near a quarter of the 2,997
      // lights, which a tempo following from the start would not.
      const inRange = rolls.every(({ phase, rate }) => phase >= 0 && phase < 1 && rate >= 0 && rate < 1);
      const quarters = [ 0, 0, 0, 0 ];
      rolls.forEach(({ phase, rate }) =>
      {
        quarters[(phase < 0.5 ? 0 : 2) + (rate < 0.5 ? 0 : 1)] += 1;
      });
      expect([ inRange, quarters ])
        .toStrictEqual([ true, [ 721, 810, 741, 725 ] ]);
    });
  });
});
