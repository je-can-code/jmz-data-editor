import { describe, expect, it } from 'vitest';
import { falloffStops, pictureKey, pictureSize } from '../../../../src/mapEditor/modules/lighting/lightFalloff.ts';

/*
 * A light's picture is J-Lighting's own (LightTextureCache): a radial gradient from the light's colour at its heart to
 * black at its rim, through one stop whose place and strength its intensity slides between a soft pool and an even
 * disc. At 0 the stop sits at 0.45 keeping 35% of the colour, so the light fades from its heart like a flame; at 1 it
 * sits at 0.97 keeping all of it, so the circle burns evenly and stops dead, short of an aliased edge. The middle colour
 * is the light's own scaled toward black and rounded per channel, as the plugin rounds it.
 *
 * The picture is as wide as twice the reach, in whole pixels, since the game's canvas drops any fraction; and it is
 * named by reach, colour and intensity alone, so two lights that look alike share one picture whatever their effects,
 * however their colours are written.
 */
describe('lightFalloff', () =>
{
  describe('falloffStops', () =>
  {
    it('fades a soft light from its heart, keeping a third of its colour not quite halfway out', () =>
    {
      // Arrange.
      const torch = '#ffbb73';

      // Act.
      const stops = falloffStops(torch, 0);

      // Assert.
      expect(stops)
        .toStrictEqual([ { offset: 0, color: '#ffbb73' }, { offset: 0.45, color: 'rgb(89,65,40)' }, { offset: 1, color: '#000000' } ]);
    });

    it('fills a hard light evenly to just short of its rim', () =>
    {
      // Arrange: the colour in capitals, as a config writes it.
      const spot = '#FFBB73';

      // Act.
      const stops = falloffStops(spot, 1);

      // Assert.
      expect(stops)
        .toStrictEqual([ { offset: 0, color: '#ffbb73' }, { offset: 0.97, color: 'rgb(255,187,115)' }, { offset: 1, color: '#000000' } ]);
    });

    it('slides the middle stop between the two by the intensity, for shorthand colours too', () =>
    {
      // Arrange: a torch at 40, and a ghost at 10.
      const lights: [ string, number ][] = [ [ '#fb7', 0.4 ], [ '#bcd9ff', 0.1 ] ];

      // Act.
      const middles = lights.map(([ color, intensity ]) => falloffStops(color, intensity)[1]);

      // Assert.
      expect(middles)
        .toStrictEqual([ { offset: 0.658, color: 'rgb(156,114,73)' }, { offset: 0.502, color: 'rgb(78,90,106)' } ]);
    });
  });

  describe('pictureSize', () =>
  {
    it('makes a picture twice the reach across, dropping any fraction of a pixel as a canvas does', () =>
    {
      // Arrange: four tiles, 1.3 tiles, and a reach too small for a pixel.
      const reaches = [ 192, 62.4, 0.3 ];

      // Act.
      const sizes = reaches.map(pictureSize);

      // Assert.
      expect(sizes)
        .toStrictEqual([ 384, 124, 0 ]);
    });
  });

  describe('pictureKey', () =>
  {
    it('names a picture by reach, colour and intensity, the colour written one way', () =>
    {
      // Arrange: one look written two ways, and near misses differing in reach, colour and intensity.
      const keys = [
        pictureKey(192, '#FFBB77', 0.4),
        pictureKey(192, '#fb7', 0.4),
        pictureKey(144, '#ffbb77', 0.4),
        pictureKey(192, '#ffbb78', 0.4),
        pictureKey(192, '#ffbb77', 0.41),
      ];

      // Act.
      const distinct = new Set(keys);

      // Assert.
      expect([ keys[0], distinct.size ])
        .toStrictEqual([ '192:#ffbb77:0.4', 4 ]);
    });
  });
});
