import { describe, expect, it } from 'vitest';
import {
  ambientTagsIn,
  checkedDarkness,
  DARKNESS_MISREAD,
  darknessPercent,
  gameAmbientTagIn,
  NO_DARKNESS,
  readMapDarkness,
  withDarkColor,
  withDarkness,
} from '../../../../src/mapEditor/modules/lighting/ambientNote.ts';

/*
 * A map's darkness lives in its note, among other plugins' tags and whatever else the author wrote there, and the
 * editor changes it the way an author would by hand: only the tag being changed, and only the part of it being changed.
 *
 * The game reads one darkness tag: the first on a line, from the last line holding any. That is the one shown and the
 * one changed. A darkness is written over the darkness alone, and a colour over the colour alone, or put in after the
 * darkness when the tag names none; taking the colour off takes its separator with it. A map that is not dark gains a tag
 * on a line of its own at the end of the note. No darkness at all takes every darkness tag out, cleanly, since with the
 * one the game reads gone it would read an earlier one. A tag the game finds but cannot read leaves the map as dark as
 * the one before it, so any darkness written mends it; it never takes a colour until it does.
 *
 * Every write is read back as the game reads it before it is handed on, so the editor never writes a tag J-Lighting
 * would refuse or read as some other dark. Tags that only look like the darkness tag, such as <ambientSound:...>, and
 * every other plugin's tags are never touched.
 */

/**
 * The project's colour of the dark in these tests, for a colour the game cannot use.
 */
const DEFAULT = '#102030';

describe('ambientNote', () =>
{
  describe('darknessPercent', () =>
  {
    it('shows a darkness out of 100 to two places, so a fraction floating off its hundredths reads as meant', () =>
    {
      // Arrange: 0.3 times 100 floats a little above 30.
      const darkness = [ 0.3, 0.12345, 1 ];

      // Act.
      const percents = darkness.map(darknessPercent);

      // Assert.
      expect(percents)
        .toStrictEqual([ 30, 12.35, 100 ]);
    });
  });

  describe('ambientTagsIn', () =>
  {
    it('finds every darkness tag, in any case and several to a line, each value with where it sits, and passes over lookalikes', () =>
    {
      // Arrange.
      const note = '<ambientSound:[50]>\n<AMBIENT: [85,#0A2]> <ambient:[30]>\n<ambients:[60]>';

      // Act.
      const tags = ambientTagsIn(note);

      // Assert.
      expect(tags)
        .toStrictEqual([
          {
            start: 20,
            end: 40,
            list: '[85,#0A2]',
            values: [ { text: '85', start: 31, end: 33, separator: '' }, { text: '#0A2', start: 34, end: 38, separator: ',' } ],
          },
          { start: 41, end: 55, list: '[30]', values: [ { text: '30', start: 51, end: 53, separator: '' } ] },
        ]);
    });
  });

  describe('gameAmbientTagIn', () =>
  {
    it('finds the first tag of the last line holding any, the one the game reads', () =>
    {
      // Arrange.
      const note = '<ambient:[10]>\n<ambient:[20]> <ambient:[30]>\n<weather:fog>';

      // Act.
      const tag = gameAmbientTagIn(note);

      // Assert.
      expect(tag?.list)
        .toBe('[20]');
    });

    it('finds none in a note holding only lookalikes', () =>
    {
      // Arrange.
      const note = '<ambientSound:[50]>\n<ambient:60>\n<ambient:[dark]>';

      // Act.
      const tag = gameAmbientTagIn(note);

      // Assert.
      expect(tag)
        .toBeNull();
    });
  });

  describe('readMapDarkness', () =>
  {
    it('reads a map with no darkness tag as not dark, naming no colour, its dark plain black', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<ambientSound:[50]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect(darkness)
        .toStrictEqual({ percent: 0, readable: true, colorText: '', color: '#000000', tags: 0 });
    });

    it('reads a darkness naming no colour as plain black', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<ambient:[85]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect(darkness)
        .toStrictEqual({ percent: 85, readable: true, colorText: '', color: '#000000', tags: 1 });
    });

    it('reads a colour the tag names as written, shown as six lowercase digits', () =>
    {
      // Arrange.
      const note = '<ambient:[85, #0A2]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect(darkness)
        .toStrictEqual({ percent: 85, readable: true, colorText: '#0A2', color: '#00aa22', tags: 1 });
    });

    it('shows the project\'s colour for one the game cannot use', () =>
    {
      // Arrange.
      const note = '<ambient:[60, teal]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect(darkness)
        .toStrictEqual({ percent: 60, readable: true, colorText: 'teal', color: '#102030', tags: 1 });
    });

    it('holds the darkness to 0 to 100, to two places', () =>
    {
      // Arrange.
      const notes = [ '<ambient:[150]>', '<ambient:[85.004]>', '<ambient:[12.5]>' ];

      // Act.
      const percents = notes.map(note => readMapDarkness(note, DEFAULT).percent);

      // Assert.
      expect(percents)
        .toStrictEqual([ 100, 85, 12.5 ]);
    });

    it('reads a tag the game finds but cannot read as unreadable, and not dark', () =>
    {
      // Arrange: too many values.
      const note = '<ambient:[50, #0a2a2a, 5]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect(darkness)
        .toStrictEqual({ percent: 0, readable: false, colorText: '', color: '#000000', tags: 1 });
    });

    it('counts every darkness tag, and shows the one the game reads', () =>
    {
      // Arrange.
      const note = '<ambient:[30]>\n<ambient:[70]> <ambient:[90]>';

      // Act.
      const darkness = readMapDarkness(note, DEFAULT);

      // Assert.
      expect([ darkness.percent, darkness.tags ])
        .toStrictEqual([ 70, 3 ]);
    });
  });

  describe('withDarkness', () =>
  {
    it('refuses a darkness outside 0 to 100, or no number at all', () =>
    {
      // Arrange.
      const percents = [ -1, 100.5, Number.NaN ];

      // Act.
      const failures = percents.map(percent =>
      {
        try
        {
          withDarkness('', percent, DEFAULT);
          return '';
        }
        catch (error)
        {
          return (error as Error).message;
        }
      });

      // Assert.
      expect(failures)
        .toStrictEqual([
          'a darkness runs from 0 to 100, not -1',
          'a darkness runs from 0 to 100, not 100.5',
          'a darkness runs from 0 to 100, not NaN',
        ]);
    });

    it('leaves a map that is not dark as it is when given no darkness', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<ambientSound:[50]>\n';

      // Act.
      const written = withDarkness(note, 0, DEFAULT);

      // Assert.
      expect(written)
        .toBe(note);
    });

    it('leaves the note as it is when the game already reads that darkness from it', () =>
    {
      // Arrange: written plainly, past the top of the scale, and with more places than the settings show.
      const cases: [ string, number ][] = [ [ '<ambient:[85]>', 85 ], [ '<ambient:[150]>', 100 ], [ '<ambient:[85.004]>', 85 ] ];

      // Act.
      const written = cases.map(([ note, percent ]) => withDarkness(note, percent, DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<ambient:[85]>', '<ambient:[150]>', '<ambient:[85.004]>' ]);
    });

    it('gives a map that is not dark a tag on a line of its own at the end, every other character kept', () =>
    {
      // Arrange: an empty note; lookalikes and other tags; a note ending on a line break; a note of a line break alone.
      const notes = [ '', '<ambientSound:[50]>\n<light:[5]>', '<noToneChange>\n<weather:fog>\n', '\n' ];

      // Act.
      const written = notes.map(note => withDarkness(note, 60, DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([
          '<ambient:[60]>',
          '<ambientSound:[50]>\n<light:[5]>\n<ambient:[60]>',
          '<noToneChange>\n<weather:fog>\n<ambient:[60]>\n',
          '<ambient:[60]>\n',
        ]);
    });

    it('writes over the darkness alone, keeping the tag\'s case, spacing, colour and the words around it', () =>
    {
      // Arrange.
      const notes = [ '<noWeather>\n<AMBIENT: [85,#0A2A2A]>\n<noToneChange>', 'deep cave <ambient:[93]> past the bridge' ];

      // Act.
      const written = notes.map(note => withDarkness(note, 60, DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noWeather>\n<AMBIENT: [60,#0A2A2A]>\n<noToneChange>', 'deep cave <ambient:[60]> past the bridge' ]);
    });

    it('writes over the tag the game reads when the note holds several, leaving the others as they are', () =>
    {
      // Arrange.
      const note = '<ambient:[30]>\n<ambient:[70]> <ambient:[90]>';

      // Act.
      const written = withDarkness(note, 60, DEFAULT);

      // Assert.
      expect(written)
        .toBe('<ambient:[30]>\n<ambient:[60]> <ambient:[90]>');
    });

    it('takes a darkness to two places, and one that rounds to nothing as no darkness', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<ambient:[85]>';

      // Act.
      const written = [ withDarkness(note, 12.345, DEFAULT), withDarkness(note, 0.004, DEFAULT) ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<noToneChange>\n<ambient:[12.35]>', '<noToneChange>' ]);
    });

    it('takes every darkness tag out for no darkness, each cleanly, and leaves lookalikes and other tags as written', () =>
    {
      // Arrange.
      const note = '<noWeather>\n<ambient:[30]>\n<noToneChange>\n<ambient:[70]> <ambient:[90]>\n<ambientSound:[50]>';

      // Act.
      const written = withDarkness(note, 0, DEFAULT);

      // Assert.
      expect(written)
        .toBe('<noWeather>\n<noToneChange>\n<ambientSound:[50]>');
    });

    it('mends a tag the game cannot read, keeping its darkness and colour places', () =>
    {
      // Arrange: too many values; a darkness that is no number; too many values, to be taken out.
      const notes = [ '<ambient:[50, #0a2a2a, 5]>', '<ambient:[..]>', '<noToneChange>\n<ambient:[50, a, b]>' ];

      // Act.
      const written = [ withDarkness(notes[0], 60, DEFAULT), withDarkness(notes[1], 60, DEFAULT), withDarkness(notes[2], 0, DEFAULT) ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<ambient:[60, #0a2a2a]>', '<ambient:[60]>', '<noToneChange>' ]);
    });

    it('refuses a note that would still read as dark once its tags are out, saying why', () =>
    {
      // Arrange: taking the one tag out joins what is left around it into another.
      const note = '<ambient:<ambient:[50]>[30]>';

      // Act.
      const write = () => withDarkness(note, 0, DEFAULT);

      // Assert.
      expect(write)
        .toThrow(DARKNESS_MISREAD);
    });
  });

  describe('withDarkColor', () =>
  {
    it('refuses a colour that is not one', () =>
    {
      // Arrange.
      const colors = [ 'teal', '#12345' ];

      // Act.
      const failures = colors.map(color =>
      {
        try
        {
          withDarkColor('<ambient:[85]>', color, DEFAULT);
          return '';
        }
        catch (error)
        {
          return (error as Error).message;
        }
      });

      // Assert.
      expect(failures)
        .toStrictEqual([
          'teal is not a colour; the game takes only a hex colour such as #0a2a2a',
          '#12345 is not a colour; the game takes only a hex colour such as #0a2a2a',
        ]);
    });

    it('refuses a colour for a map that is not dark, or whose darkness the game cannot read', () =>
    {
      // Arrange.
      const notes = [ '<noToneChange>', '<ambient:[50, #0a2a2a, 5]>' ];

      // Act.
      const writes = notes.map(note => () => withDarkColor(note, '#0a2a2a', DEFAULT));

      // Assert.
      expect(writes[0])
        .toThrow(NO_DARKNESS);
      expect(writes[1])
        .toThrow(NO_DARKNESS);
    });

    it('puts a colour in after the darkness when the tag names none', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<ambient:[85]>\n<ambientSound:[50]>';

      // Act.
      const written = withDarkColor(note, '#0a2a2a', DEFAULT);

      // Assert.
      expect(written)
        .toBe('<noToneChange>\n<ambient:[85, #0a2a2a]>\n<ambientSound:[50]>');
    });

    it('writes over the colour the tag names, in capitals for one written in capitals', () =>
    {
      // Arrange: a colour written in capitals, and one the game cannot use.
      const notes = [ '<AMBIENT: [85,#0A2A2A]>', '<ambient:[60, teal]>' ];

      // Act.
      const written = notes.map(note => withDarkColor(note, '#aabbcc', DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<AMBIENT: [85,#AABBCC]>', '<ambient:[60, #aabbcc]>' ]);
    });

    it('leaves the note as it is for the colour the dark already shows, shorthand or the project\'s alike', () =>
    {
      // Arrange: shorthand for the colour asked for, and a colour the game cannot use, which shows the project's.
      const cases: [ string, string ][] = [ [ '<ambient:[85, #0A2]>', '#00aa22' ], [ '<ambient:[60, teal]>', DEFAULT ] ];

      // Act.
      const written = cases.map(([ note, color ]) => withDarkColor(note, color, DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<ambient:[85, #0A2]>', '<ambient:[60, teal]>' ]);
    });

    it('takes the colour off with its separator for no colour, so the dark goes back to plain black', () =>
    {
      // Arrange.
      const notes = [ '<ambient:[85, #0a2a2a]>\n<weather:snow>', '<AMBIENT: [85,#0A2A2A]>' ];

      // Act.
      const written = notes.map(note => withDarkColor(note, '', DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<ambient:[85]>\n<weather:snow>', '<AMBIENT: [85]>' ]);
    });

    it('leaves a tag naming no colour as it is for no colour', () =>
    {
      // Arrange.
      const note = '<ambient:[85]>';

      // Act.
      const written = withDarkColor(note, '', DEFAULT);

      // Assert.
      expect(written)
        .toBe(note);
    });

    it('never touches the darkness, however it is written', () =>
    {
      // Arrange: past the top of the scale, and to more places than the settings show.
      const notes = [ '<ambient:[150]>', '<ambient:[85.004]>' ];

      // Act.
      const written = notes.map(note => withDarkColor(note, '#0a2a2a', DEFAULT));

      // Assert.
      expect(written)
        .toStrictEqual([ '<ambient:[150, #0a2a2a]>', '<ambient:[85.004, #0a2a2a]>' ]);
    });
  });

  describe('checkedDarkness', () =>
  {
    it('hands on a note that reads back as meant, saying what was meant of the colour or not', () =>
    {
      // Arrange.
      const cases = [
        { note: '<ambient:[60, #0a2a2a]>', meant: { darkness: 0.6, declaresColor: true, color: [ 10, 42, 42 ] } },
        { note: '<ambient:[60]>', meant: { darkness: 0.6 } },
        { note: '<weather:fog>', meant: null },
      ];

      // Act.
      const handed = cases.map(({ note, meant }) => checkedDarkness(note, meant, DEFAULT));

      // Assert.
      expect(handed)
        .toStrictEqual([ '<ambient:[60, #0a2a2a]>', '<ambient:[60]>', '<weather:fog>' ]);
    });

    it('refuses a note reading as no darkness, another darkness, a colour named or not as meant, or another colour', () =>
    {
      // Arrange.
      const cases = [
        { note: '<weather:fog>', meant: { darkness: 0.6 } },
        { note: '<ambient:[61]>', meant: { darkness: 0.6 } },
        { note: '<ambient:[60, #0a2a2a]>', meant: { darkness: 0.6, declaresColor: false } },
        { note: '<ambient:[60, #0a2a2b]>', meant: { darkness: 0.6, declaresColor: true, color: [ 10, 42, 42 ] } },
        { note: '<ambient:[60]>', meant: null },
      ];

      // Act.
      const failures = cases.map(({ note, meant }) =>
      {
        try
        {
          checkedDarkness(note, meant, DEFAULT);
          return '';
        }
        catch (error)
        {
          return (error as Error).message;
        }
      });

      // Assert.
      expect(failures)
        .toStrictEqual([ DARKNESS_MISREAD, DARKNESS_MISREAD, DARKNESS_MISREAD, DARKNESS_MISREAD, DARKNESS_MISREAD ]);
    });
  });
});
