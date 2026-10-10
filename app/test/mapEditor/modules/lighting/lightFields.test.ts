import { describe, expect, it } from 'vitest';
import type { TagLine } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { INTENSITY_FIELD, LIGHT_TAG_ID, lightTagFields, RADIUS_FIELD } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import type { LightDefaults } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * J-Lighting's light tag, read as fields a copy of a blueprint follows one by one. Every line on a page giving a light, as
 * J-Lighting reads a page's lights, is a tag line, named by its place among the page's lights (light1, light2), since a
 * page can give several. Each light's reach and intensity are numbers with the ranges J-Lighting allows: a reach above 0
 * with no top, held at the least the light's panel writes, a hundredth of a tile; an intensity of 0 to 100. Its colour and
 * its effect are choices. Each is read as the game reads it, the project's defaults filling in what the tag leaves out: a
 * colour as the one way the panel writes it, an intensity as the number written, held to 0 to 100, and an effect steady
 * when none is named. A line the game does not read as a light is no tag line at all.
 *
 * A value goes back into a copy's own line in place, through the very writers the light's panel uses, which refuse a
 * change the game would read otherwise; a field a light does not have is a mistake, and throws.
 */
describe('lightFields', () =>
{
  /**
   * The defaults the tests read with: a colour and an intensity no tag below writes, so a fallback is plain to see.
   */
  const DEFAULTS: LightDefaults = { color: '#123456', intensity: 0.25 };

  /**
   * The light tag as fields, with the test's defaults.
   */
  const LIGHTS = lightTagFields(DEFAULTS);

  /**
   * Reads every light on a page of comment lines.
   * @param {string[]} lines The comments.
   * @returns {readonly TagLine[]} The light tag lines.
   */
  const read = (lines: string[]): readonly TagLine[] => LIGHTS.read(page(lines.map(line => command(108, [ line ]))));

  /**
   * Reads the values of one light's fields, by name.
   * @param {TagLine} line The light's line.
   * @returns {Record<string, unknown>} The values.
   */
  const valuesOf = (line: TagLine): Record<string, unknown> => Object.fromEntries(line.fields.map(field => [ field.name, field.value ]));

  it('is J-Lighting\'s light tag', () =>
  {
    // Arrange: nothing beyond the tag itself.

    // Act.
    const { id } = LIGHTS;

    // Assert.
    expect([ id, LIGHT_TAG_ID ])
      .toStrictEqual([ 'lighting.light', 'lighting.light' ]);
  });

  describe('read', () =>
  {
    it('reads each light on a page as a line named by its place, where it sits in the list', () =>
    {
      // Arrange: two lights around another comment, the second on a comment's later line.
      const lit = page([ command(108, [ '<light:[4]>' ]), command(108, [ 'words' ]), command(408, [ '<light:[2]>' ]) ]);

      // Act.
      const lines = LIGHTS.read(lit);

      // Assert.
      expect(lines.map(line => [ line.key, line.listIndex ]))
        .toStrictEqual([ [ 'light1', 0 ], [ 'light2', 2 ] ]);
    });

    it('reads a light\'s reach and intensity as numbers with J-Lighting\'s ranges, and its colour and effect as choices', () =>
    {
      // Arrange.
      const [ line ] = read([ '<light:[4, #ffbb73, 30, flicker]>' ]);

      // Act.
      const { fields } = line;

      // Assert.
      expect(fields)
        .toStrictEqual([
          { name: 'radius', kind: { kind: 'number', min: 0.01, max: Number.POSITIVE_INFINITY }, value: 4 },
          { name: 'color', kind: { kind: 'choice' }, value: '#ffbb73' },
          { name: 'intensity', kind: { kind: 'number', min: 0, max: 100 }, value: 30 },
          { name: 'effect', kind: { kind: 'choice' }, value: 'flicker' },
        ]);
      expect([ RADIUS_FIELD, INTENSITY_FIELD ])
        .toStrictEqual([ fields[0].kind, fields[2].kind ]);
    });

    it('reads what a tag leaves out as the project\'s defaults, and a light naming no effect as steady', () =>
    {
      // Arrange: a reach alone.
      const [ line ] = read([ '<light:[2.5]>' ]);

      // Act.
      const values = valuesOf(line);

      // Assert.
      expect(values)
        .toStrictEqual({ radius: 2.5, color: '#123456', intensity: 25, effect: 'steady' });
    });

    it('reads a colour the one way the panel writes it, and one that is no colour as the project\'s', () =>
    {
      // Arrange: shorthand in capitals, and a typo.
      const lines = read([ '<light:[4, #FB7]>', '<light:[4, #ggg]>' ]);

      // Act.
      const colours = lines.map(line => valuesOf(line)['color']);

      // Assert.
      expect(colours)
        .toStrictEqual([ '#ffbb77', '#123456' ]);
    });

    it('reads an intensity as the number written, exactly, held to 0 to 100', () =>
    {
      // Arrange: a fraction, one past the top and one below the bottom.
      const lines = read([ '<light:[4, 37.5]>', '<light:[4, 150]>', '<light:[4, -5]>' ]);

      // Act.
      const intensities = lines.map(line => valuesOf(line)['intensity']);

      // Assert.
      expect(intensities)
        .toStrictEqual([ 37.5, 100, 0 ]);
    });

    it('reads no line the game does not read as a light', () =>
    {
      // Arrange: words after the tag, a space before it, five values, no reach, and the tag outside a comment.
      const lit = page([
        command(108, [ '<light:[4]> lamp' ]),
        command(108, [ ' <light:[4]>' ]),
        command(108, [ '<light:[4, #ffffff, 30, flicker, 2]>' ]),
        command(108, [ '<light:[0]>' ]),
        command(401, [ '<light:[4]>' ]),
      ]);

      // Act.
      const lines = LIGHTS.read(lit);

      // Assert.
      expect(lines)
        .toStrictEqual([]);
    });
  });

  describe('write', () =>
  {
    it('writes each field into the line in place, every other character kept', () =>
    {
      // Arrange: a line in capitals with a space after its colon.
      const line = '<LIGHT: [4,#FFBB73, 30,flicker]>';

      // Act.
      const written = [
        LIGHTS.write(line, 'radius', 6.5),
        LIGHTS.write(line, 'color', '#ff0000'),
        LIGHTS.write(line, 'intensity', 45),
        LIGHTS.write(line, 'effect', 'steady'),
      ];

      // Assert.
      expect(written)
        .toStrictEqual([
          '<LIGHT: [6.5,#FFBB73, 30,flicker]>',
          '<LIGHT: [4,#FF0000, 30,flicker]>',
          '<LIGHT: [4,#FFBB73, 45,flicker]>',
          '<LIGHT: [4,#FFBB73, 30]>',
        ]);
    });

    it('puts a part the tag leaves out where J-Lighting\'s own examples put it', () =>
    {
      // Arrange: a reach alone.
      const line = '<light:[4]>';

      // Act.
      const written = [ LIGHTS.write(line, 'color', '#ff0000'), LIGHTS.write(line, 'intensity', 45), LIGHTS.write(line, 'effect', 'pulse') ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<light:[4, #ff0000]>', '<light:[4, 45]>', '<light:[4, pulse]>' ]);
    });

    it('refuses a value the line has no room for, in the panel\'s words, and a field a light does not have', () =>
    {
      // Arrange: a tag of four values, one the game ignores, so no intensity fits.
      const full = '<light:[4, #ffbb73, flicker, junk]>';

      // Act.
      const writes = [ () => LIGHTS.write(full, 'intensity', 45), () => LIGHTS.write('<light:[4]>', 'hue', 3) ];

      // Assert.
      expect(writes[0])
        .toThrow('this light already has four values written, the most the game reads');
      expect(writes[1])
        .toThrow('a light has no field named hue');
    });
  });

  describe('words', () =>
  {
    it('names each field of a light by which of its page\'s lights it is and the panel\'s own label', () =>
    {
      // Arrange: the first light's reach and colour, and the second light's intensity and effect.
      const fields: [ string, string ][] = [ [ 'light1', 'radius' ], [ 'light1', 'color' ], [ 'light2', 'intensity' ], [ 'light2', 'effect' ] ];

      // Act.
      const words = fields.map(([ line, field ]) => LIGHTS.words?.(line, field));

      // Assert.
      expect(words)
        .toStrictEqual([ 'light 1 radius', 'light 1 colour', 'light 2 intensity', 'light 2 effect' ]);
    });
  });
});
