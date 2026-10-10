import { describe, expect, it } from 'vitest';
import type { LightDefaults } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import {
  intensityPercent,
  lightTagParts,
  withColor,
  withEffect,
  withIntensity,
  withRadius,
} from '../../../../src/mapEditor/modules/lighting/lightTagWriter.ts';

/*
 * The light panel changes a light by rewriting its tag in place, so whoever wrote the tag still finds it as they wrote
 * it: only the value being changed moves, and the tag's name, its case, the space after its colon, the order of its
 * values, the separator before each one and every other character of the line stay exactly as they were.
 *
 * The value changed is the one the game reads: the first value led by a hash for the colour (a usable colour or not),
 * the first finite number for the intensity, the first effect named for the effect. A part the tag leaves out goes in
 * where J-Lighting's own examples put it (a colour after the reach, an intensity after the colour, an effect at the
 * end), with the separator the tag already writes there; a steady light names no effect, so steady takes every effect
 * off, each with the separator before it. A value the light already shows changes nothing: a colour in another case or
 * length, an intensity the game holds to 100, or the default a light falls back to.
 *
 * Every line written is read back as the game reads it, and one that would give some other light, or none at all (a
 * fifth value, a reach the tag cannot hold, an intensity past 100), is refused with the reason rather than written.
 */

/**
 * The defaults the tests read with: a colour and an intensity no tag below writes, so a fallback is plain to see.
 */
const DEFAULTS: LightDefaults = { color: '#123456', intensity: 0.25 };

describe('lightTagWriter', () =>
{
  describe('intensityPercent', () =>
  {
    it('shows a fraction out of 100, to two places, even where it floats off its hundredths', () =>
    {
      // Arrange: 0.3 times 100 is 30.000000000000004 in floating point.
      const fractions = [ 0.3, 0.125, 1 ];

      // Act.
      const percents = fractions.map(intensityPercent);

      // Assert.
      expect(percents)
        .toStrictEqual([ 30, 12.5, 100 ]);
    });
  });

  describe('lightTagParts', () =>
  {
    it('finds each value where the line writes it, with the separator written before it', () =>
    {
      // Arrange: capitals, a space after the colon, and both separators.
      const line = '<LIGHT: [4.5,#FFBB73, 30,flicker]>';

      // Act.
      const { values } = lightTagParts(line);

      // Assert.
      expect(values)
        .toStrictEqual([
          { text: '4.5', start: 9, end: 12, separator: '' },
          { text: '#FFBB73', start: 13, end: 20, separator: ',' },
          { text: '30', start: 22, end: 24, separator: ', ' },
          { text: 'flicker', start: 25, end: 32, separator: ',' },
        ]);
    });

    it('takes the first value of each kind after the reach as that part, past the near misses before it', () =>
    {
      // Arrange: a capitalised effect, a boolean and Infinity come before the first real effect and number, and a
      // colour that is no colour comes before a good one.
      const line = '<light:[5, Flicker, true, Infinity, 40px, #ggg, #fff, pulse, glitch]>';

      // Act.
      const { color, intensity, effect } = lightTagParts(line);

      // Assert.
      expect([ color, intensity, effect ])
        .toStrictEqual([ 5, 4, 7 ]);
    });

    it('finds no part a tag leaves out', () =>
    {
      // Arrange: a reach alone.
      const line = '<light:[5]>';

      // Act.
      const { color, intensity, effect } = lightTagParts(line);

      // Assert.
      expect([ color, intensity, effect ])
        .toStrictEqual([ -1, -1, -1 ]);
    });
  });

  describe('withRadius', () =>
  {
    it('writes the new reach over the old, leaving every other character as it was', () =>
    {
      // Arrange.
      const line = '<LIGHT: [4,#FFBB73, 30,flicker]>';

      // Act.
      const written = withRadius(line, 5.5, DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<LIGHT: [5.5,#FFBB73, 30,flicker]>');
    });

    it('changes nothing for the reach the light already has, however the tag writes it', () =>
    {
      // Arrange.
      const line = '<light:[4.0, #fff]>';

      // Act.
      const written = withRadius(line, 4, DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4.0, #fff]>');
    });

    it('refuses a reach the tag cannot hold rather than write a light the game reads otherwise', () =>
    {
      // Arrange: a tenth of a millionth writes itself as 1e-7, which the tag's reach of digits and dots cannot hold.
      const line = '<light:[4]>';

      // Act.
      const write = () => withRadius(line, 0.0000001, DEFAULTS);

      // Assert.
      expect(write)
        .toThrow('the game would not read that light back as written');
    });

    it('refuses a line that gives no light', () =>
    {
      // Arrange: a reach of nothing.
      const line = '<light:[0]>';

      // Act.
      const write = () => withRadius(line, 3, DEFAULTS);

      // Assert.
      expect(write)
        .toThrow('"<light:[0]>" gives no light');
    });
  });

  describe('withColor', () =>
  {
    it('writes over the colour the game reads, even one that is no colour, leaving a later one alone', () =>
    {
      // Arrange: the game reads #ggg, falls back from it, and never looks at #fff.
      const line = '<light:[4, #ggg, 30, #fff]>';

      // Act.
      const written = withColor(line, '#aabbcc', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #aabbcc, 30, #fff]>');
    });

    it('writes a new colour in capitals over one written in capitals', () =>
    {
      // Arrange.
      const line = '<light:[4, #FFBB73]>';

      // Act.
      const written = withColor(line, '#aabbcc', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #AABBCC]>');
    });

    it('puts a colour in after the reach, with the separator the tag writes there', () =>
    {
      // Arrange.
      const line = '<light:[4,30,flicker]>';

      // Act.
      const written = withColor(line, '#aabbcc', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4,#aabbcc,30,flicker]>');
    });

    it('puts a colour after a lone reach with a comma and a space', () =>
    {
      // Arrange.
      const line = '<light:[4]>';

      // Act.
      const written = withColor(line, '#aabbcc', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #aabbcc]>');
    });

    it('changes nothing for the colour the light already shows, written in another case or at another length', () =>
    {
      // Arrange: #FB7 is #ffbb77.
      const line = '<light:[4, #FB7]>';

      // Act.
      const written = withColor(line, '#ffbb77', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #FB7]>');
    });

    it('changes nothing for the default colour of a light that names none', () =>
    {
      // Arrange.
      const line = '<light:[4]>';

      // Act.
      const written = withColor(line, '#123456', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4]>');
    });

    it('refuses a colour when the tag already holds the four values the game reads', () =>
    {
      // Arrange: four values and no colour, one of them a word the game ignores.
      const line = '<light:[4, 30, flicker, torch]>';

      // Act.
      const write = () => withColor(line, '#aabbcc', DEFAULTS);

      // Assert.
      expect(write)
        .toThrow('this light already has four values written, the most the game reads; remove the one it ignores in the event window, then try again');
    });

    it('refuses what is no colour', () =>
    {
      // Arrange.
      const line = '<light:[4, #fff]>';

      // Act.
      const write = () => withColor(line, 'red', DEFAULTS);

      // Assert.
      expect(write)
        .toThrow('the game would not read that light back as written');
    });
  });

  describe('withIntensity', () =>
  {
    it('writes over the number the game reads as the intensity, letters after it and all', () =>
    {
      // Arrange: J-Base reads 90px as 90.
      const line = '<light:[4, #fff, 90px, flicker]>';

      // Act.
      const written = withIntensity(line, 40, DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #fff, 40, flicker]>');
    });

    it('puts an intensity in after the colour, ahead of the effect', () =>
    {
      // Arrange.
      const line = '<light:[4, #ffbb73, flicker]>';

      // Act.
      const written = withIntensity(line, 30, DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, #ffbb73, 30, flicker]>');
    });

    it('puts an intensity in after the reach when the tag names no colour', () =>
    {
      // Arrange.
      const line = '<light:[4,pulse]>';

      // Act.
      const written = withIntensity(line, 30, DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4,30,pulse]>');
    });

    it('changes nothing for the intensity the light already has, held to 100 or fallen back to', () =>
    {
      // Arrange: the game holds 150 to 100, and a light naming none has the default's 25.
      const lines = [ '<light:[4, 150]>', '<light:[4]>' ];

      // Act.
      const written = [ withIntensity(lines[0], 100, DEFAULTS), withIntensity(lines[1], 25, DEFAULTS) ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<light:[4, 150]>', '<light:[4]>' ]);
    });

    it('refuses an intensity past 100, which the game would read as 100', () =>
    {
      // Arrange.
      const line = '<light:[4, 30]>';

      // Act.
      const write = () => withIntensity(line, 150, DEFAULTS);

      // Assert.
      expect(write)
        .toThrow('the game would not read that light back as written');
    });
  });

  describe('withEffect', () =>
  {
    it('writes over the effect the game reads, leaving a second one named after it', () =>
    {
      // Arrange: the game reads glitch, the first named.
      const line = '<light:[4, glitch, #fff, flicker]>';

      // Act.
      const written = withEffect(line, 'pulse', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, pulse, #fff, flicker]>');
    });

    it('puts an effect in at the end, with the separator before the last value', () =>
    {
      // Arrange.
      const line = '<light:[4,#fff, 30]>';

      // Act.
      const written = withEffect(line, 'flicker', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4,#fff, 30, flicker]>');
    });

    it('takes every effect named off for a steady light, each with the separator before it', () =>
    {
      // Arrange: two effects named, so leaving the second would have the game read it instead.
      const line = '<light:[4, flicker,#fff,pulse]>';

      // Act.
      const written = withEffect(line, 'steady', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4,#fff]>');
    });

    it('changes nothing for the effect the light already has', () =>
    {
      // Arrange.
      const line = '<light:[4, flicker]>';

      // Act.
      const written = withEffect(line, 'flicker', DEFAULTS);

      // Assert.
      expect(written)
        .toBe('<light:[4, flicker]>');
    });
  });
});
