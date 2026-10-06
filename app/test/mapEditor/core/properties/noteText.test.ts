import { describe, expect, it } from 'vitest';
import {
  keepsOtherMeta,
  lineBreakOf,
  metaTagsOf,
  noteLines,
  noteMetaOf,
  withLineAdded,
  withSpanRemoved,
} from '../../../../src/mapEditor/core/properties/noteText.ts';

/*
 * A note is written by hand and read by two different readers, and an editor changing one tag in it owes the author
 * every other character exactly as written. The plugins read a note line by line, any run of line breaks ending a line;
 * the engine reads its metadata in one search over the whole note, so a tag may run over a line break and a stray
 * opening bracket swallows the tag after it. These helpers read a note the way each reader does, with where everything
 * sits, add a line at the end without touching anything already there, and take a tag out cleanly: a tag alone on its
 * line takes the line and one line break with it, and a tag among words takes one space with it so the words close up.
 * Since a stray bracket can swallow a tag nobody touched once a tag beside it is added or taken out, a writer can ask
 * whether every name the engine reads, other than the ones its change is about, still reads exactly as it did.
 */
describe('noteText', () =>
{
  describe('noteLines', () =>
  {
    it('cuts a note on every run of line breaks, keeping where each line sits', () =>
    {
      // Arrange: Windows' pair, a blank line, and a lone carriage return.
      const note = 'a\r\nbc\n\nd\re';

      // Act.
      const lines = noteLines(note);

      // Assert.
      expect(lines)
        .toStrictEqual([
          { text: 'a', start: 0, end: 1 },
          { text: 'bc', start: 3, end: 5 },
          { text: 'd', start: 7, end: 8 },
          { text: 'e', start: 9, end: 10 },
        ]);
    });

    it('reads a note holding no line break as one line, and one starting or ending on a break with an empty line there', () =>
    {
      // Arrange.
      const notes = [ 'plain', '\nend\n' ];

      // Act.
      const lines = notes.map(noteLines);

      // Assert: the same lines the plugins' own split gives.
      expect(lines)
        .toStrictEqual([
          [ { text: 'plain', start: 0, end: 5 } ],
          [ { text: '', start: 0, end: 0 }, { text: 'end', start: 1, end: 4 }, { text: '', start: 5, end: 5 } ],
        ]);
    });
  });

  describe('lineBreakOf', () =>
  {
    it('writes the first line break the note already holds', () =>
    {
      // Arrange.
      const notes = [ 'a\r\nb\nc', 'a\rb', 'a\nb\r\nc' ];

      // Act.
      const breaks = notes.map(lineBreakOf);

      // Assert.
      expect(breaks)
        .toStrictEqual([ '\r\n', '\r', '\n' ]);
    });

    it('writes a plain newline for a note holding none', () =>
    {
      // Arrange.
      const note = '<noToneChange>';

      // Act.
      const written = lineBreakOf(note);

      // Assert.
      expect(written)
        .toBe('\n');
    });
  });

  describe('withLineAdded', () =>
  {
    it('makes an empty note the line alone', () =>
    {
      // Arrange.
      const note = '';

      // Act.
      const added = withLineAdded(note, '<ambient:[60]>');

      // Assert.
      expect(added)
        .toBe('<ambient:[60]>');
    });

    it('adds the line after the last one, with the note\'s own line break', () =>
    {
      // Arrange: a note ending on its last tag, and one written with Windows' line breaks.
      const notes = [ '<noToneChange>', '<noWeather>\r\n<noToneChange>' ];

      // Act.
      const added = notes.map(note => withLineAdded(note, '<ambient:[60]>'));

      // Assert.
      expect(added)
        .toStrictEqual([ '<noToneChange>\n<ambient:[60]>', '<noWeather>\r\n<noToneChange>\r\n<ambient:[60]>' ]);
    });

    it('keeps the line breaks a note ends on after the new line', () =>
    {
      // Arrange.
      const notes = [ '<noToneChange>\n<weather:fog>\n', 'end\n\n' ];

      // Act.
      const added = notes.map(note => withLineAdded(note, '<ambient:[60]>'));

      // Assert.
      expect(added)
        .toStrictEqual([ '<noToneChange>\n<weather:fog>\n<ambient:[60]>\n', 'end\n<ambient:[60]>\n\n' ]);
    });

    it('puts the new line first in a note of line breaks alone, bringing its own break ahead of them', () =>
    {
      // Arrange.
      const notes = [ '\n', '\r\n\r\n' ];

      // Act.
      const added = notes.map(note => withLineAdded(note, '<ambient:[60]>'));

      // Assert.
      expect(added)
        .toStrictEqual([ '<ambient:[60]>\n\n', '<ambient:[60]>\r\n\r\n\r\n' ]);
    });

    it('gives back the note exactly as it was when the line is taken out again', () =>
    {
      // Arrange: no text at all, text alone, text ending on breaks, and breaks alone.
      const notes = [ '', 'a', 'a\r\n', 'a\n\n', '\n', '\r\n\r\n' ];

      // Act.
      const restored = notes.map(note =>
      {
        const added = withLineAdded(note, '<t>');
        const at = added.indexOf('<t>');
        return withSpanRemoved(added, at, at + 3);
      });

      // Assert.
      expect(restored)
        .toStrictEqual([ '', 'a', 'a\r\n', 'a\n\n', '\n', '\r\n\r\n' ]);
    });
  });

  describe('withSpanRemoved', () =>
  {
    /**
     * Takes the first copy of a tag out of a note.
     * @param {string} note The note.
     * @param {string} tag The tag.
     * @returns {string} The note without it.
     */
    const without = (note: string, tag: string): string =>
    {
      const start = note.indexOf(tag);
      return withSpanRemoved(note, start, start + tag.length);
    };

    it('takes a tag alone on its line out with the line and the break after it', () =>
    {
      // Arrange: a newline after the tag, and Windows' pair after it.
      const notes = [ '<t>\n<weather:fog>\n', 'a\r\n<t>\r\nb' ];

      // Act.
      const removed = notes.map(note => without(note, '<t>'));

      // Assert.
      expect(removed)
        .toStrictEqual([ '<weather:fog>\n', 'a\r\nb' ]);
    });

    it('takes a tag alone on the last line out with the break before it, whatever break that is', () =>
    {
      // Arrange.
      const notes = [ 'a\n<t>', 'a\r\n<t>', 'a\r<t>' ];

      // Act.
      const removed = notes.map(note => without(note, '<t>'));

      // Assert.
      expect(removed)
        .toStrictEqual([ 'a', 'a', 'a' ]);
    });

    it('leaves an empty note when the tag was all of it', () =>
    {
      // Arrange.
      const note = '<t>';

      // Act.
      const removed = without(note, '<t>');

      // Assert.
      expect(removed)
        .toBe('');
    });

    it('takes the spaces around a tag alone on its line with the line', () =>
    {
      // Arrange.
      const note = 'a\n  <t>\t\nb';

      // Act.
      const removed = without(note, '<t>');

      // Assert.
      expect(removed)
        .toBe('a\nb');
    });

    it('takes one space with a tag among words, so the words around it stay one space apart', () =>
    {
      // Arrange: words either side; words before it at the end of its line; words after it at the start of its line.
      const notes = [ 'deep <t> cave', 'deep <t>\nnext', 'first\n<t> cave' ];

      // Act.
      const removed = notes.map(note => without(note, '<t>'));

      // Assert.
      expect(removed)
        .toStrictEqual([ 'deep cave', 'deep\nnext', 'first\ncave' ]);
    });

    it('takes the tag alone from words it touches, space or no space', () =>
    {
      // Arrange: no space either side; a space before it with a word after; a word before it with a space after.
      const notes = [ 'a<t>b', 'a <t>b', 'a<t> b' ];

      // Act.
      const removed = notes.map(note => without(note, '<t>'));

      // Assert.
      expect(removed)
        .toStrictEqual([ 'ab', 'a b', 'a b' ]);
    });
  });

  describe('metaTagsOf', () =>
  {
    it('reads a bare tag as true and a tag with a colon as the text after it, each with where it sits', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<weather:fog>';

      // Act.
      const tags = metaTagsOf(note);

      // Assert.
      expect(tags)
        .toStrictEqual([
          { key: 'noToneChange', value: true, start: 0, end: 14 },
          { key: 'weather', value: 'fog', start: 15, end: 28 },
        ]);
    });

    it('lets a stray opening bracket swallow the tag after it, and a tag run over a line break, as the engine reads them', () =>
    {
      // Arrange.
      const notes = [ 'a < b\n<noToneChange>', '<weather:\nfog>' ];

      // Act.
      const tags = notes.map(metaTagsOf);

      // Assert.
      expect(tags)
        .toStrictEqual([
          [ { key: ' b\n', value: true, start: 2, end: 20 } ],
          [ { key: 'weather', value: '\nfog', start: 0, end: 14 } ],
        ]);
    });
  });

  describe('noteMetaOf', () =>
  {
    it('holds each value by its name, a later tag of a name replacing an earlier one', () =>
    {
      // Arrange.
      const note = '<noToneChange>\n<weather:fog>\n<noToneChange:>';

      // Act.
      const meta = noteMetaOf(note);

      // Assert.
      expect([ ...meta ])
        .toStrictEqual([ [ 'noToneChange', '' ], [ 'weather', 'fog' ] ]);
    });
  });

  describe('keepsOtherMeta', () =>
  {
    /**
     * Says a change is about the darkness tag's name, in any case.
     * @param {string} key The name.
     * @returns {boolean} True for the darkness tag's name.
     */
    const aboutAmbient = (key: string): boolean => key.toLowerCase() === 'ambient';

    it('holds when only the names the change is about read otherwise, whatever their case', () =>
    {
      // Arrange: the darkness taken off one line in capitals and put back on another, every other tag kept.
      const before = '<noWeather>\n<AMBIENT:[50]>\n<weather:fog>';
      const after = '<noWeather>\n<weather:fog>\n<ambient:[60]>';

      // Act.
      const kept = keepsOtherMeta(before, after, aboutAmbient);

      // Assert.
      expect(kept)
        .toBe(true);
    });

    it('fails when a name the change is not about reads otherwise, goes, or comes', () =>
    {
      // Arrange: another value; a tag swallowed by a stray bracket once the tag before it is out; a broken tag closed
      // by a line added after it; and a tag only named like the one the change is about, gone.
      const cases: [ string, string ][] = [
        [ '<weather:fog>\n<ambient:[50]>', '<weather:rain>' ],
        [ 'a < b <ambient:[50]> <noToneChange>', 'a < b <noToneChange>' ],
        [ '<timeBlock:', '<timeBlock:\n<ambient:[60]>' ],
        [ '<ambientSound:[50]>\n<ambient:[50]>', '<ambient:[50]>' ],
      ];

      // Act.
      const kept = cases.map(([ before, after ]) => keepsOtherMeta(before, after, aboutAmbient));

      // Assert.
      expect(kept)
        .toStrictEqual([ false, false, false, false ]);
    });
  });
});
