import { describe, expect, it } from 'vitest';
import { hasMetaFlag, noteMetaOf } from '../../../../src/mapEditor/core/model/noteMeta.ts';

/*
 * A note's tags are read exactly as the engine fills an object's meta when its file loads (DataManager.extractMetadata):
 * every tag by its name as written, case and all; a bare tag holds true, a tag with a colon holds the text after it,
 * which may be empty; the whole note is read at once, so a tag may share its line with other words; and a name written
 * twice keeps its last value. A plugin testing Boolean(meta[name]) reads a tag as on when it is bare or holds any text
 * at all, even false, and as off when it holds nothing or is not there.
 */
describe('noteMeta', () =>
{
  describe('noteMetaOf', () =>
  {
    it('reads every tag by its name: bare ones as true, ones with a colon as the text after it', () =>
    {
      // Arrange: a bare tag, one with a value, one with an empty value, and one sharing its line with words.
      const note = '<noToneChange>\n<ambient:[85, #0a2a2a]>\n<empty:>\nthe cave <zoom: 2> below';

      // Act.
      const meta = noteMetaOf(note);

      // Assert.
      expect([ ...meta ])
        .toStrictEqual([ [ 'noToneChange', true ], [ 'ambient', '[85, #0a2a2a]' ], [ 'empty', '' ], [ 'zoom', ' 2' ] ]);
    });

    it('keeps the last value of a name written twice, and names in their own case', () =>
    {
      // Arrange.
      const note = '<level:3><Level:4><level:5>';

      // Act.
      const meta = noteMetaOf(note);

      // Assert.
      expect([ ...meta ])
        .toStrictEqual([ [ 'level', '5' ], [ 'Level', '4' ] ]);
    });

    it('reads nothing from a note without tags', () =>
    {
      // Arrange: words and a lone bracket.
      const note = 'a quiet field < with nothing in it';

      // Act.
      const meta = noteMetaOf(note);

      // Assert.
      expect(meta.size)
        .toBe(0);
    });
  });

  describe('hasMetaFlag', () =>
  {
    it('reads a bare tag, or one holding any text, as on', () =>
    {
      // Arrange.
      const notes = [ '<noToneChange>', '<noToneChange:false>', '<noToneChange:0>' ];

      // Act.
      const flags = notes.map(note => hasMetaFlag(note, 'noToneChange'));

      // Assert.
      expect(flags)
        .toStrictEqual([ true, true, true ]);
    });

    it('reads a tag holding nothing, another case of its name, or no tag, as off', () =>
    {
      // Arrange.
      const notes = [ '<noToneChange:>', '<NoToneChange>', '' ];

      // Act.
      const flags = notes.map(note => hasMetaFlag(note, 'noToneChange'));

      // Assert.
      expect(flags)
        .toStrictEqual([ false, false, false ]);
    });
  });
});
