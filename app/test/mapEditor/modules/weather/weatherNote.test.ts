import { describe, expect, it } from 'vitest';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { readMapWeather, WEATHER_MISREAD, withWeatherPreset, withWeatherSuppressed } from '../../../../src/mapEditor/modules/weather/weatherNote.ts';

/*
 * A map's weather lives in its note, among other plugins' tags and whatever else the author wrote there, and the editor
 * changes it the way an author would by hand: only the tag being changed, and only the part of it being changed.
 *
 * J-Weather reads one look: the first weather tag on a line, from the last line holding any, the name kept exactly as
 * written, since the look is found by that name, case and all. That is the one shown and the one changed: a new look is
 * written over its name alone, the tag's own case and spacing kept; a map naming none gains a tag on a line of its own at
 * the end of the note; and no look at all takes every weather tag out, cleanly, since with the one the game reads gone it
 * would read another. Any opt-out anywhere keeps the map out of weather, whatever look it names, so opting out adds one
 * on a line of its own at the end, and opting back in takes every one out. A line added or taken out brings or takes the
 * note's own line break, Windows' pair included, and a tag the game's pattern does not read as a look or an opt-out is
 * no tag of either, so it stays exactly as written.
 *
 * Every write is read back as the game reads it before it is handed on: the look and the opt-out must read exactly as
 * meant, the one the change is not about as it did, and the engine must read every other tag in the note as it did, so a
 * tag taken out or added beside a stray bracket, which would leave the game reading some other tag otherwise, is refused,
 * and so is a look whose tag the game would read as some other look, or as none.
 */
describe('weatherNote', () =>
{
  /**
   * Runs a change, and says why it was refused, if it was.
   * @param {() => string} change The change.
   * @returns {string} Why it was refused, or the note it wrote.
   */
  const outcome = (change: () => string): string =>
  {
    try
    {
      return change();
    }
    catch (error)
    {
      return (error as Error).message;
    }
  };

  describe('readMapWeather', () =>
  {
    it('reads the look the game reads, whether the note opts out, and how many looks it names', () =>
    {
      // Arrange: three looks, two of them sharing the last line, of which the game reads the first; and an opt-out
      // naming no look.
      const notes = [ '<weather:rain>\n<weather:snow> <weather:fog>', '<noToneChange>\n<noWeather>' ];

      // Act.
      const read = notes.map(readMapWeather);

      // Assert.
      expect(read)
        .toStrictEqual([ { preset: 'snow', suppressed: false, tags: 3 }, { preset: null, suppressed: true, tags: 0 } ]);
    });
  });

  describe('withWeatherPreset', () =>
  {
    it('adds a look to a note naming none on a line of its own at the end, before the line breaks it ends on', () =>
    {
      // Arrange: a note ending on a line break, and an empty one.
      const notes = [ '<noToneChange>\n', '' ];

      // Act.
      const written = notes.map(note => withWeatherPreset(note, 'rain'));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noToneChange>\n<weather:rain>\n', '<weather:rain>' ]);
    });

    it('writes a new look over the name alone, keeping the tag\'s own case and spacing and every other word of the line', () =>
    {
      // Arrange: a tag in capitals with a space after its colon, among words.
      const note = '<noToneChange>\nthe rain <WEATHER: Rain> falls';

      // Act.
      const written = withWeatherPreset(note, 'snow');

      // Assert.
      expect(written)
        .toBe('<noToneChange>\nthe rain <WEATHER: snow> falls');
    });

    it('writes over only the look the game reads, among several', () =>
    {
      // Arrange: the game reads the first on the last line naming any, snow.
      const note = '<weather:rain>\n<weather:snow> <weather:fog>';

      // Act.
      const written = withWeatherPreset(note, 'motes');

      // Assert.
      expect(written)
        .toBe('<weather:rain>\n<weather:motes> <weather:fog>');
    });

    it('tells looks apart by case, as J-Weather finds them', () =>
    {
      // Arrange: a look named in capitals, which is not the look named in small letters.
      const note = '<weather:Rain>';

      // Act.
      const written = withWeatherPreset(note, 'rain');

      // Assert.
      expect(written)
        .toBe('<weather:rain>');
    });

    it('leaves the note exactly as it is for the look the game already reads, or for none on a note naming none', () =>
    {
      // Arrange.
      const notes: [ string, string | null ][] = [ [ '<weather:rain>\n', 'rain' ], [ '<noWeather>', null ] ];

      // Act.
      const written = notes.map(([ note, preset ]) => withWeatherPreset(note, preset));

      // Assert.
      expect(written)
        .toStrictEqual([ '<weather:rain>\n', '<noWeather>' ]);
    });

    it('takes the look out with its line for none, and every other look with it, since the game would read another', () =>
    {
      // Arrange: a single look on a line of its own; and three looks, two sharing a line, before a line of words.
      const notes = [ '<noToneChange>\n<weather:rain>\n', '<weather:rain>\n<weather:snow> <weather:fog>\nwords' ];

      // Act.
      const written = notes.map(note => withWeatherPreset(note, null));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noToneChange>\n', 'words' ]);
    });

    it('keeps a note\'s Windows line breaks, adding, writing over and taking out a look with the note\'s own', () =>
    {
      // Arrange: a cave written on Windows, its look between two other lines; and one naming no look, ending on its last
      // line, and again ending on a line break.
      const named = '<noToneChange>\r\nA cave.\r\n<weather:rain>\r\n<ambient:[85]>';
      const bare = [ '<noToneChange>\r\nA cave.', '<noToneChange>\r\nA cave.\r\n' ];

      // Act.
      const written = [ withWeatherPreset(named, 'motes'), withWeatherPreset(named, null), ...bare.map(note => withWeatherPreset(note, 'motes')) ];

      // Assert.
      expect(written)
        .toStrictEqual([
          '<noToneChange>\r\nA cave.\r\n<weather:motes>\r\n<ambient:[85]>',
          '<noToneChange>\r\nA cave.\r\n<ambient:[85]>',
          '<noToneChange>\r\nA cave.\r\n<weather:motes>',
          '<noToneChange>\r\nA cave.\r\n<weather:motes>\r\n',
        ]);
    });

    it('takes a look out from among words on its line, with the one space that keeps them apart', () =>
    {
      // Arrange.
      const note = 'the rain <weather:rain> falls';

      // Act.
      const written = withWeatherPreset(note, null);

      // Assert.
      expect(written)
        .toBe('the rain falls');
    });

    it('leaves a tag the game does not read as a look as written, adding the look after it', () =>
    {
      // Arrange: two spaces after the colon, a space before it, and a space before the closing bracket, none of which
      // the game reads as naming a look.
      const note = '<weather:  rain>\n<weather :rain>\n<weather:rain >';

      // Act.
      const read = readMapWeather(note);
      const written = [ withWeatherPreset(note, 'snow'), withWeatherPreset(note, null) ];

      // Assert.
      expect([ read, written ])
        .toStrictEqual([
          { preset: null, suppressed: false, tags: 0 },
          [ '<weather:  rain>\n<weather :rain>\n<weather:rain >\n<weather:snow>', note ],
        ]);
    });

    it('keeps what the note says of opting out, whatever look it names', () =>
    {
      // Arrange: an opted-out map naming a look.
      const note = '<noWeather>\n<weather:rain>';

      // Act.
      const written = [ withWeatherPreset(note, 'snow'), withWeatherPreset(note, null) ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<noWeather>\n<weather:snow>', '<noWeather>' ]);
    });

    it('refuses a look whose tag the game would read as some other look, or as none', () =>
    {
      // Arrange: a name starting with a digit, a name with a space, and a name closing the tag early.
      const presets = [ '1rain', 'heavy rain', 'rain><noWeather' ];

      // Act.
      const refusals = presets.map(preset => outcome(() => withWeatherPreset('<weather:fog>', preset)));

      // Assert.
      expect(refusals)
        .toStrictEqual([ WEATHER_MISREAD, WEATHER_MISREAD, WEATHER_MISREAD ]);
    });

    it('refuses a look taken out when the words left behind would opt the map out', () =>
    {
      // Arrange: a look written inside an opt-out, which keeps the game from reading the opt-out.
      const note = '<no<weather:rain>Weather>';

      // Act.
      const refusal = outcome(() => withWeatherPreset(note, null));

      // Assert.
      expect(refusal)
        .toBe(WEATHER_MISREAD);
    });

    it('refuses a look added after a stray bracket that would swallow it, and one taken out from under one', () =>
    {
      // Arrange: a bracket opened and never closed at the note's end; and one whose tag runs on to swallow the look's
      // line, ahead of the tag saying the map has no sky.
      const open = 'the gate <foo:';
      const swallowing = '<foo:\n<weather:rain>\n<noToneChange>';

      // Act.
      const refusals = [ outcome(() => withWeatherPreset(open, 'rain')), outcome(() => withWeatherPreset(swallowing, null)) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ OTHER_TAGS_MISREAD, OTHER_TAGS_MISREAD ]);
    });
  });

  describe('withWeatherSuppressed', () =>
  {
    it('opts a map out with a tag on a line of its own at the end, keeping the look it names', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<weather:rain>\n';

      // Act.
      const written = withWeatherSuppressed(note, true);

      // Assert.
      expect(written)
        .toBe('<noToneChange>\n<weather:rain>\n<noWeather>\n');
    });

    it('opts a map back in by taking every opt-out out, in any case, since any one would keep it out', () =>
    {
      // Arrange: an opt-out on a line of its own, and another in capitals after words.
      const note = '<noWeather>\n<weather:rain>\nwords <NOWEATHER>';

      // Act.
      const written = withWeatherSuppressed(note, false);

      // Assert.
      expect(written)
        .toBe('<weather:rain>\nwords');
    });

    it('keeps a note\'s Windows line breaks opting out and back in, and opts an empty note out with the tag alone', () =>
    {
      // Arrange: a cave written on Windows ending on a line break, the same cave opted out, the opt-out on its last line,
      // and an empty note.
      const notes: [ string, boolean ][] = [
        [ '<noToneChange>\r\nA cave.\r\n', true ],
        [ '<noToneChange>\r\n<noWeather>\r\nA cave.', false ],
        [ 'A cave.\r\n<noWeather>', false ],
        [ '', true ],
      ];

      // Act.
      const written = notes.map(([ note, suppressed ]) => withWeatherSuppressed(note, suppressed));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noToneChange>\r\nA cave.\r\n<noWeather>\r\n', '<noToneChange>\r\nA cave.', 'A cave.', '<noWeather>' ]);
    });

    it('leaves tags only named like the opt-out as written, adding the opt-out after them', () =>
    {
      // Arrange: a space inside the name, and a written value, neither of which the game reads as opting out.
      const note = '<no Weather>\n<noWeather:true>';

      // Act.
      const read = readMapWeather(note);
      const written = [ withWeatherSuppressed(note, true), withWeatherSuppressed(note, false) ];

      // Assert.
      expect([ read.suppressed, written ])
        .toStrictEqual([ false, [ '<no Weather>\n<noWeather:true>\n<noWeather>', note ] ]);
    });

    it('leaves the note exactly as it is when the map already opts out, or in, as asked', () =>
    {
      // Arrange.
      const notes: [ string, boolean ][] = [ [ '<noWeather>', true ], [ '<weather:rain>', false ] ];

      // Act.
      const written = notes.map(([ note, suppressed ]) => withWeatherSuppressed(note, suppressed));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noWeather>', '<weather:rain>' ]);
    });

    it('refuses an opt-out added after a stray bracket that would swallow it, and one taken out from under one', () =>
    {
      // Arrange: a bracket opened and never closed at the note's end; and one whose tag runs on to swallow the opt-out's
      // line, ahead of the tag saying the map has no sky.
      const open = 'the gate <foo:';
      const swallowing = '<foo:\n<noWeather>\n<noToneChange>';

      // Act.
      const refusals = [ outcome(() => withWeatherSuppressed(open, true)), outcome(() => withWeatherSuppressed(swallowing, false)) ];

      // Assert.
      expect(refusals)
        .toStrictEqual([ OTHER_TAGS_MISREAD, OTHER_TAGS_MISREAD ]);
    });

    it('refuses opting back in when the words left behind would opt the map out again', () =>
    {
      // Arrange: an opt-out written inside another, so taking it out leaves the outer one whole.
      const note = '<no<noWeather>Weather>';

      // Act.
      const refusal = outcome(() => withWeatherSuppressed(note, false));

      // Assert.
      expect(refusal)
        .toBe(WEATHER_MISREAD);
    });

    it('refuses opting back in when taking the opt-out out would have the game read a look the note did not name', () =>
    {
      // Arrange: an opt-out written inside a weather tag, which keeps the game from reading the tag as a look.
      const note = '<weather:<noWeather>rain>';

      // Act.
      const refusal = outcome(() => withWeatherSuppressed(note, false));

      // Assert.
      expect(refusal)
        .toBe(WEATHER_MISREAD);
    });
  });
});
