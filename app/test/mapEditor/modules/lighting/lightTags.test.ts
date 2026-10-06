import { describe, expect, it } from 'vitest';
import {
  firstLitPage,
  isLight,
  lightLines,
  lightsOf,
  normalizeHex,
  parseLight,
  readLightLine,
  type LightDefaults,
} from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page, text } from '../../support/eventKindFixtures.ts';

/*
 * The editor reads J-Lighting's light tags exactly as the plugin does, because a ring drawn for a tag the game ignores,
 * or missing for one it lights, sends an author hunting for a problem in the wrong place.
 *
 * A tag's list starts with the reach in tiles, fractions allowed, and a reach that is no positive number makes no
 * light; a list of more than four values makes none either. After the reach, a colour (led by a hash), an intensity
 * (any number, held to 0 to 100 and read as a fraction) and an effect (flicker, pulse or glitch, exactly) are told apart
 * by what they look like, so they come in any order; the first of each counts, a colour that is no colour falls back to
 * the default, and anything else is passed over. Values read as J-Base's JsonMapper reads them, so 90px is 90 and true
 * is a boolean.
 *
 * Only comment lines J-Base offers its plugins are read: a first line or a continuation line that is one tag filling
 * the line. Every such line holding a light gives one, so a page can give several, and each is found with where it sits
 * in the page's list and exactly what it says, so a change to a light can rewrite that line and nothing else. The page
 * whose lights an event shows is the first that gives any, named with where it sits among the event's pages, so a torch
 * lit behind a switch shows its lit page; and an event is a light exactly when some page gives light, read by the same
 * parser, so "is a light" and "shows a ring" never disagree. Colours compare as six lowercase digits.
 */

/**
 * The defaults the tests read with: a colour and an intensity no tag below writes, so a fallback is plain to see.
 */
const DEFAULTS: LightDefaults = { color: '#123456', intensity: 0.25 };

describe('lightTags', () =>
{
  describe('parseLight', () =>
  {
    it('reads a reach alone, with the defaults and a steady light', () =>
    {
      // Arrange.
      const payload = '[5]';

      // Act.
      const light = parseLight(payload, DEFAULTS);

      // Assert.
      expect(light)
        .toStrictEqual({ radius: 5, color: '#123456', intensity: 0.25, effect: 'steady' });
    });

    it('tells the colour, the intensity and the effect apart by what they look like, in any order', () =>
    {
      // Arrange: the same light written two ways round.
      const payloads = [ '[6, #ffbb73, 30, flicker]', '[6,flicker,30,#ffbb73]' ];

      // Act.
      const lights = payloads.map(payload => parseLight(payload, DEFAULTS));

      // Assert.
      expect(lights)
        .toStrictEqual([
          { radius: 6, color: '#ffbb73', intensity: 0.3, effect: 'flicker' },
          { radius: 6, color: '#ffbb73', intensity: 0.3, effect: 'flicker' },
        ]);
    });

    it('reads a fractional reach, as parseFloat reads one, dots before and after included', () =>
    {
      // Arrange.
      const payloads = [ '[2.5]', '[.5]', '[5.]', '[1.2.3]' ];

      // Act.
      const reaches = payloads.map(payload => parseLight(payload, DEFAULTS)?.radius);

      // Assert.
      expect(reaches)
        .toStrictEqual([ 2.5, 0.5, 5, 1.2 ]);
    });

    it('refuses a list of more than four values whole, beside a list of four', () =>
    {
      // Arrange.
      const payloads = [ '[5, #fff, 50, flicker, pulse]', '[5, #fff, 50, flicker]' ];

      // Act.
      const lights = payloads.map(payload => parseLight(payload, DEFAULTS));

      // Assert.
      expect(lights)
        .toStrictEqual([ null, { radius: 5, color: '#fff', intensity: 0.5, effect: 'flicker' } ]);
    });

    it('refuses a reach of zero, beside the smallest reach that lights', () =>
    {
      // Arrange.
      const payloads = [ '[0]', '[0.0]', '[0.1]' ];

      // Act.
      const reaches = payloads.map(payload => parseLight(payload, DEFAULTS)?.radius ?? null);

      // Assert.
      expect(reaches)
        .toStrictEqual([ null, null, 0.1 ]);
    });

    it('refuses a reach that is no number at all', () =>
    {
      // Arrange: dots alone parse to nothing.
      const payload = '[...]';

      // Act.
      const light = parseLight(payload, DEFAULTS);

      // Assert.
      expect(light)
        .toBeNull();
    });

    it('keeps a colour of three or six digits as written, in either case', () =>
    {
      // Arrange.
      const payloads = [ '[5, #FB7]', '[5, #ffbb73]' ];

      // Act.
      const colors = payloads.map(payload => parseLight(payload, DEFAULTS)?.color);

      // Assert.
      expect(colors)
        .toStrictEqual([ '#FB7', '#ffbb73' ]);
    });

    it('falls back to the default colour when its first colour is no colour, even with a good one after it', () =>
    {
      // Arrange: four digits, and a bad first colour before a good one.
      const payloads = [ '[5, #ffff]', '[5, #ggg, #fff]' ];

      // Act.
      const colors = payloads.map(payload => parseLight(payload, DEFAULTS)?.color);

      // Assert.
      expect(colors)
        .toStrictEqual([ '#123456', '#123456' ]);
    });

    it('reads the first number as the intensity, held to 0 to 100', () =>
    {
      // Arrange: half, a second number after it, past the top, and below the bottom.
      const payloads = [ '[5, 50]', '[5, 50, 80]', '[5, 150]', '[5, -20]' ];

      // Act.
      const intensities = payloads.map(payload => parseLight(payload, DEFAULTS)?.intensity);

      // Assert.
      expect(intensities)
        .toStrictEqual([ 0.5, 0.5, 1, 0 ]);
    });

    it('reads a number written with letters after it as that number, and letters before a number as a word', () =>
    {
      // Arrange.
      const payloads = [ '[5, 90px]', '[5, px90]' ];

      // Act.
      const intensities = payloads.map(payload => parseLight(payload, DEFAULTS)?.intensity);

      // Assert.
      expect(intensities)
        .toStrictEqual([ 0.9, 0.25 ]);
    });

    it('passes over Infinity as an intensity, for the finite number after it', () =>
    {
      // Arrange.
      const payload = '[5, Infinity, 30]';

      // Act.
      const light = parseLight(payload, DEFAULTS);

      // Assert.
      expect(light?.intensity)
        .toBe(0.3);
    });

    it('reads the first effect named, and only the exact lowercase word', () =>
    {
      // Arrange.
      const payloads = [ '[5, pulse, flicker]', '[5, glitch]', '[5, Flicker]' ];

      // Act.
      const effects = payloads.map(payload => parseLight(payload, DEFAULTS)?.effect);

      // Assert.
      expect(effects)
        .toStrictEqual([ 'pulse', 'glitch', 'steady' ]);
    });

    it('passes over true, false and words that are none of the three', () =>
    {
      // Arrange: neither true nor false is a number, so the intensity is the 40 after them.
      const payload = '[5, TRUE, false, nope]';
      const withNumber = '[5, true, 40]';

      // Act.
      const lights = [ parseLight(payload, DEFAULTS), parseLight(withNumber, DEFAULTS) ];

      // Assert.
      expect(lights)
        .toStrictEqual([
          { radius: 5, color: '#123456', intensity: 0.25, effect: 'steady' },
          { radius: 5, color: '#123456', intensity: 0.4, effect: 'steady' },
        ]);
    });
  });

  describe('lightsOf', () =>
  {
    it('reads every light on a page, first lines and continuation lines alike, in order', () =>
    {
      // Arrange: a ghost giving two lights around other plugins' tags.
      const ghost = page([
        command(108, [ '<hourRangePage:18-5>' ]),
        command(408, [ '<light:[4, #ffbb73, 30, flicker]>' ]),
        command(108, [ '<enemyId:101>' ]),
        command(408, [ '<light:[2, #bcd9ff, 10, pulse]>' ]),
      ]);

      // Act.
      const lights = lightsOf(ghost, DEFAULTS);

      // Assert.
      expect(lights)
        .toStrictEqual([
          { radius: 4, color: '#ffbb73', intensity: 0.3, effect: 'flicker' },
          { radius: 2, color: '#bcd9ff', intensity: 0.1, effect: 'pulse' },
        ]);
    });

    it('reads the tag in any case with one space after the colon and each comma, and not with two', () =>
    {
      // Arrange.
      const pages = [
        page([ command(108, [ '<LIGHT: [3, #fff]>' ]) ]),
        page([ command(108, [ '<light:  [3]>' ]) ]),
        page([ command(108, [ '<light:[3,  #fff]>' ]) ]),
      ];

      // Act.
      const counts = pages.map(each => lightsOf(each, DEFAULTS).length);

      // Assert.
      expect(counts)
        .toStrictEqual([ 1, 0, 0 ]);
    });

    it('reads nothing from a comment line that is more than the one tag', () =>
    {
      // Arrange: words after the tag, a space before it, and a second tag after it, beside the tag alone.
      const pages = [
        page([ command(108, [ '<light:[5]> torch' ]) ]),
        page([ command(108, [ ' <light:[5]>' ]) ]),
        page([ command(108, [ '<light:[5]><light:[3]>' ]) ]),
        page([ command(108, [ '<light:[5]>' ]) ]),
      ];

      // Act.
      const counts = pages.map(each => lightsOf(each, DEFAULTS).length);

      // Assert.
      expect(counts)
        .toStrictEqual([ 0, 0, 0, 1 ]);
    });

    it('reads nothing from a tag that gives no light, or from the tag\'s near namesakes', () =>
    {
      // Arrange: no reach, no brackets, empty brackets, a longer name, and a map's darkness.
      const tags = [ '<light:[0]>', '<light:5>', '<light:[]>', '<lights:[5]>', '<ambient:[60]>' ];

      // Act.
      const counts = tags.map(tag => lightsOf(page([ command(108, [ tag ]) ]), DEFAULTS).length);

      // Assert.
      expect(counts)
        .toStrictEqual([ 0, 0, 0, 0, 0 ]);
    });

    it('reads nothing from the tag anywhere but a comment line holding text', () =>
    {
      // Arrange: spoken in a message, and a comment line holding something other than text.
      const pages = [ page(text([ '<light:[5]>' ])), page([ command(108, [ 5 ]) ]) ];

      // Act.
      const counts = pages.map(each => lightsOf(each, DEFAULTS).length);

      // Assert.
      expect(counts)
        .toStrictEqual([ 0, 0 ]);
    });
  });

  describe('readLightLine', () =>
  {
    it('reads the light a line gives when the line is the light tag alone', () =>
    {
      // Arrange.
      const line = '<light:[3, #ffbb73, flicker]>';

      // Act.
      const light = readLightLine(line, DEFAULTS);

      // Assert.
      expect(light)
        .toStrictEqual({ radius: 3, color: '#ffbb73', intensity: 0.25, effect: 'flicker' });
    });

    it('reads nothing from a line J-Base would not offer, holding more than the one tag', () =>
    {
      // Arrange: a word after the tag.
      const line = '<light:[3]> lamp';

      // Act.
      const light = readLightLine(line, DEFAULTS);

      // Assert.
      expect(light)
        .toBeNull();
    });

    it('reads nothing from a line offered whole that holds some other tag', () =>
    {
      // Arrange: a battler's tag, offered to every plugin, read by none here.
      const line = '<enemyId:3>';

      // Act.
      const light = readLightLine(line, DEFAULTS);

      // Assert.
      expect(light)
        .toBeNull();
    });
  });

  describe('lightLines', () =>
  {
    it('finds each line giving a light with where it sits and what it says, past the near misses around it', () =>
    {
      // Arrange: a namesake tag, a light on a continuation line, a battler's tag, a tag giving no light, a light with a
      // word after it, and a light in capitals.
      const shrine = page([
        command(108, [ '<lights:[5]>' ]),
        command(408, [ '<light:[4, #ffbb73]>' ]),
        command(108, [ '<enemyId:3>' ]),
        command(108, [ '<light:[0]>' ]),
        command(108, [ '<light:[2]> lamp' ]),
        command(408, [ '<LIGHT: [3,pulse]>' ]),
      ]);

      // Act.
      const lines = lightLines(shrine, DEFAULTS);

      // Assert.
      expect(lines)
        .toStrictEqual([
          { listIndex: 1, text: '<light:[4, #ffbb73]>', light: { radius: 4, color: '#ffbb73', intensity: 0.25, effect: 'steady' } },
          { listIndex: 5, text: '<LIGHT: [3,pulse]>', light: { radius: 3, color: '#123456', intensity: 0.25, effect: 'pulse' } },
        ]);
    });
  });

  describe('normalizeHex', () =>
  {
    it('doubles each digit of a shorthand colour, in lowercase', () =>
    {
      // Arrange.
      const hex = '#FB7';

      // Act.
      const normalized = normalizeHex(hex);

      // Assert.
      expect(normalized)
        .toBe('#ffbb77');
    });

    it('lowers the case of a colour of six digits and keeps them', () =>
    {
      // Arrange.
      const hex = '#FFBB73';

      // Act.
      const normalized = normalizeHex(hex);

      // Assert.
      expect(normalized)
        .toBe('#ffbb73');
    });
  });

  describe('firstLitPage', () =>
  {
    it('picks the first page that gives light, past a cold first page', () =>
    {
      // Arrange: a torch, cold on page 1 and lit on page 2 behind a self switch.
      const cold = page([]);
      const lit = page([ command(108, [ '<light:[4, #ffbb73, flicker]>' ]) ]);
      const torch = event(7, [ cold, lit ]);

      // Act.
      const chosen = firstLitPage(torch, DEFAULTS);

      // Assert.
      expect([ chosen?.page === lit, chosen?.pageIndex, chosen?.lights ])
        .toStrictEqual([ true, 1, [ { radius: 4, color: '#ffbb73', intensity: 0.25, effect: 'flicker' } ] ]);
    });

    it('passes over a page whose only light tag gives no light', () =>
    {
      // Arrange.
      const dark = page([ command(108, [ '<light:[0]>' ]) ]);
      const lit = page([ command(108, [ '<light:[3]>' ]) ]);

      // Act.
      const chosen = firstLitPage(event(7, [ dark, lit ]), DEFAULTS);

      // Assert.
      expect(chosen?.page === lit)
        .toBe(true);
    });

    it('finds no page on an event that gives no light', () =>
    {
      // Arrange.
      const sign = event(7, [ page(text([ 'A sign.' ])) ]);

      // Act.
      const chosen = firstLitPage(sign, DEFAULTS);

      // Assert.
      expect(chosen)
        .toBeNull();
    });
  });

  describe('isLight', () =>
  {
    it('calls an event a light exactly when one of its pages gives light', () =>
    {
      // Arrange: a lamp lit on its second page, and a near miss whose tag gives no light.
      const lamp = event(1, [ page([]), page([ command(108, [ '<light:[2]>' ]) ]) ]);
      const unlit = event(2, [ page([ command(108, [ '<light:[0]>' ]) ]) ]);

      // Act.
      const read = [ isLight(lamp), isLight(unlit) ];

      // Assert.
      expect(read)
        .toStrictEqual([ true, false ]);
    });
  });
});
