import { describe, expect, it } from 'vitest';
import { suppressesWeather, weatherDeclarationOf, weatherPresetOf } from '../../../../src/mapEditor/modules/weather/weatherTags.ts';

/*
 * A map's weather is read from its note exactly as J-Weather reads it on arrival, or the editor would show rain on a map
 * the game leaves dry, or nothing where the game rains. The look comes from J.WEATHER.RegExp.Weather through
 * RPGManager#getStringFromNoteByRegex: line by line, the first tag on a line, and the last line holding one wins; the
 * name follows the colon after at most one space, starts with a letter, goes on in letters, digits, underscores and
 * hyphens, and closes the tag at once; the tag's case does not matter, but the name is kept exactly as written, since
 * the look is then found by that name. The opt-out is J.WEATHER.RegExp.NoWeather through
 * RPGManager#checkForBooleanFromNoteByRegex: the bare tag, any case, on any line. Whether the sky can be seen is read
 * from the same metadata J-Lighting-Time keeps a cave from the clock's tint with. Every near miss below is a tag the
 * plugin rejects, so the editor must reject it too.
 */
describe('weatherTags', () =>
{
  describe('weatherPresetOf', () =>
  {
    it('reads the look a tag names, at most one space after the colon, whatever the tag\'s case, keeping the name as written', () =>
    {
      // Arrange: the plain tag, one space, the tag in capitals, and a name using every character a name may.
      const notes = [ '<weather:rain>', '<weather: rain>', '<WEATHER:Rain>', '<weather:snow-2_b9>' ];

      // Act.
      const presets = notes.map(weatherPresetOf);

      // Assert.
      expect(presets)
        .toStrictEqual([ 'rain', 'rain', 'Rain', 'snow-2_b9' ]);
    });

    it('rejects every near miss the plugin rejects', () =>
    {
      // Arrange: two spaces, a space before the close, a name starting with a digit, an underscore or a hyphen, no name,
      // a second colon, a stray character, no colon at all, the word misspelled, and nothing at all.
      const notes = [
        '<weather:  rain>',
        '<weather:rain >',
        '<weather:1rain>',
        '<weather:_comment_faces>',
        '<weather:-rain>',
        '<weather:>',
        '<weather:rain:heavy>',
        '<weather:rain!>',
        '<weather rain>',
        '<weathers:rain>',
        '',
      ];

      // Act.
      const presets = notes.map(weatherPresetOf);

      // Assert.
      expect(presets)
        .toStrictEqual(notes.map(() => null));
    });

    it('finds the tag anywhere on a line, takes the first on a line, and the last line holding one', () =>
    {
      // Arrange: a tag among words, two on one line, two on separate lines, and two lines apart with windows breaks.
      const notes = [
        'Rainy here. <weather:rain> Yes.',
        '<weather:rain><weather:snow>',
        '<weather:rain>\n<weather:snow>',
        '<weather:fog>\r\n<noToneChange>\r\n<weather:motes>',
      ];

      // Act.
      const presets = notes.map(weatherPresetOf);

      // Assert.
      expect(presets)
        .toStrictEqual([ 'rain', 'rain', 'snow', 'motes' ]);
    });
  });

  describe('suppressesWeather', () =>
  {
    it('reads the opt-out on any line, in any case', () =>
    {
      // Arrange: the tag, lowercase, capitals, among words on a later line.
      const notes = [ '<noWeather>', '<noweather>', '<NOWEATHER>', '<weather:rain>\nCovered market. <noWeather> Dry.' ];

      // Act.
      const suppressed = notes.map(suppressesWeather);

      // Assert.
      expect(suppressed)
        .toStrictEqual([ true, true, true, true ]);
    });

    it('rejects a tag with anything inside it besides its name, and a note without one', () =>
    {
      // Arrange: a space before the close, a space inside the name, a value, the word alone, and an empty note.
      const notes = [ '<noWeather >', '<no Weather>', '<noWeather:true>', 'noWeather', '' ];

      // Act.
      const suppressed = notes.map(suppressesWeather);

      // Assert.
      expect(suppressed)
        .toStrictEqual([ false, false, false, false, false ]);
    });
  });

  describe('weatherDeclarationOf', () =>
  {
    it('reads the opt-out, the look and the sky together, as the plugin reads them on arrival', () =>
    {
      // Arrange: a cave naming motes, an outdoor map naming rain and opting out, and a note saying nothing.
      const notes = [ '<noToneChange>\n<weather:motes>\n', '<weather:rain>\n<noWeather>', '' ];

      // Act.
      const declarations = notes.map(weatherDeclarationOf);

      // Assert.
      expect(declarations)
        .toStrictEqual([
          { suppressed: false, preset: 'motes', hasSky: false },
          { suppressed: true, preset: 'rain', hasSky: true },
          { suppressed: false, preset: null, hasSky: true },
        ]);
    });

    it('sees the sky past a sky tag written with nothing after its colon, which the engine reads as empty', () =>
    {
      // Arrange: the tag with an empty value, and the tag misspelled in its case, which the engine reads as another key.
      const notes = [ '<noToneChange:>\n<weather:rain>', '<NoToneChange>\n<weather:rain>' ];

      // Act.
      const skies = notes.map(note => weatherDeclarationOf(note).hasSky);

      // Assert.
      expect(skies)
        .toStrictEqual([ true, true ]);
    });
  });
});
