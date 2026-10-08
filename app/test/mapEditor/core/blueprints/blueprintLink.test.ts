import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_LINK_KEY,
  blueprintLinkOf,
  blueprintLinkText,
  isBlueprintId,
  LINK_MISREAD,
  withBlueprintLink,
  withoutBlueprintLink,
  type BlueprintLink,
} from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { noteMetaOf, OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';

/*
 * A copy placed from a blueprint carries its link in its event's note, the one place in an event nothing in the game
 * reads, but on a map a plugin copies its events from, where no link is ever written. The link names the blueprint by
 * its id, which never changes, and the blueprint's event the copy was made from, and leaves room after those two for
 * whatever a copy keeps of its own, which later features write; a link holding such values reads and writes back as it
 * is. It is one tag, on one line, appended after whatever the note already says, with no angle bracket or comma in any
 * value, and reads as the engine reads a note into metadata: the last tag of its name. Writing it, or taking it out,
 * keeps every other character of the note exactly as it was, and taking it out undoes adding it byte for byte; and a
 * write that would leave the link reading otherwise, or any other tag in the note reading otherwise, is refused rather
 * than written, as every note the editor writes in place is.
 */
describe('blueprintLink', () =>
{
  /**
   * A link to event 2 of blueprint k3x9q2mf, keeping nothing of its own.
   */
  const LINK: BlueprintLink = { blueprintId: 'k3x9q2mf', eventId: 2, differences: [] };

  describe('isBlueprintId', () =>
  {
    it('takes lowercase letters and digits, and nothing else', () =>
    {
      // Arrange: an id, and near misses with a capital, a hyphen, a space and nothing at all.
      const candidates = [ 'k3x9q2mf', 'K3x9q2mf', 'k3x9-2mf', 'k3x 9', '' ];

      // Act.
      const read = candidates.map(isBlueprintId);

      // Assert.
      expect(read)
        .toStrictEqual([ true, false, false, false, false ]);
    });
  });

  describe('blueprintLinkText', () =>
  {
    it('writes the blueprint, the event and then what the copy keeps, a comma and a space between each', () =>
    {
      // Arrange.
      const links = [ LINK, { ...LINK, differences: [ 'sight+2', 'motion=wander' ] } ];

      // Act.
      const written = links.map(blueprintLinkText);

      // Assert.
      expect(written)
        .toStrictEqual([ '<blueprint:[k3x9q2mf, 2]>', '<blueprint:[k3x9q2mf, 2, sight+2, motion=wander]>' ]);
    });

    it('refuses a link a note could not read back: an id of other characters, an event that is no id, a value holding a comma or a bracket', () =>
    {
      // Arrange.
      const links = [
        { ...LINK, blueprintId: 'K3' },
        { ...LINK, eventId: 0 },
        { ...LINK, eventId: 1.5 },
        { ...LINK, differences: [ 'a,b' ] },
        { ...LINK, differences: [ 'a>' ] },
      ];

      // Act.
      const write = links.map(link => () => blueprintLinkText(link));

      // Assert.
      write.forEach(each => expect(each)
        .toThrow('a link names a blueprint by its id and an event by a positive id'));
    });
  });

  describe('blueprintLinkOf', () =>
  {
    it('reads the link a note holds, with or without the space after each comma, and the values kept after it', () =>
    {
      // Arrange.
      const notes = [ '<blueprint:[k3x9q2mf, 2]>', 'Guard captain\n<blueprint:[k3x9q2mf,2,sight+2]>' ];

      // Act.
      const links = notes.map(blueprintLinkOf);

      // Assert.
      expect(links)
        .toStrictEqual([ LINK, { ...LINK, differences: [ 'sight+2' ] } ]);
    });

    it('reads no link from a note without the tag, from the tag spelled in another case, or bare, or holding anything else', () =>
    {
      // Arrange.
      const notes = [
        '',
        '<moveSpeed:6.0>',
        '<Blueprint:[k3x9q2mf, 2]>',
        '<blueprint>',
        '<blueprint:k3x9q2mf>',
        '<blueprint:[k3x9q2mf, 0]>',
        '<blueprint:[k3x9q2mf, 02]>',
        '<blueprint:[k3x9q2mf]>',
        '<blueprint:[K3x9q2mf, 2]>',
        '<blueprint:[k3x9q2mf, 2,]>',
      ];

      // Act.
      const links = notes.map(blueprintLinkOf);

      // Assert.
      expect(links)
        .toStrictEqual(notes.map(() => null));
    });

    it('reads the last tag of its name, as the engine fills an event\'s metadata', () =>
    {
      // Arrange: a stale link before the one that counts, and a broken one after a good one.
      const notes = [ '<blueprint:[aaaa, 1]>\n<blueprint:[k3x9q2mf, 2]>', '<blueprint:[k3x9q2mf, 2]>\n<blueprint:junk>' ];

      // Act.
      const links = notes.map(blueprintLinkOf);

      // Assert.
      expect(links)
        .toStrictEqual([ LINK, null ]);
    });
  });

  describe('withBlueprintLink', () =>
  {
    it('writes the link alone into an empty note', () =>
    {
      // Arrange: nothing beyond the empty note.

      // Act.
      const written = withBlueprintLink('', LINK);

      // Assert.
      expect(written)
        .toBe('<blueprint:[k3x9q2mf, 2]>');
    });

    it('appends the link on a line of its own after the text a note already holds, with the line break the note writes', () =>
    {
      // Arrange: words; a tag over Windows' pairs ending on one; and text ending on two blank lines.
      const notes = [ 'Guard captain', '<moveSpeed:6.0>\r\nkept\r\n', 'a\n\n' ];

      // Act.
      const written = notes.map(note => withBlueprintLink(note, LINK));

      // Assert: every character the note held stays where it was.
      expect(written)
        .toStrictEqual([
          'Guard captain\n<blueprint:[k3x9q2mf, 2]>',
          '<moveSpeed:6.0>\r\nkept\r\n<blueprint:[k3x9q2mf, 2]>\r\n',
          'a\n<blueprint:[k3x9q2mf, 2]>\n\n',
        ]);
    });

    it('takes a link the note holds already out first, so a note holds one link at most', () =>
    {
      // Arrange: a link to another blueprint, and two links where one stood among words.
      const notes = [ 'a\n<blueprint:[aaaa, 1]>', 'see <blueprint:[aaaa, 1]> here\n<blueprint:[bbbb, 3]>' ];

      // Act.
      const written = notes.map(note => withBlueprintLink(note, LINK));

      // Assert.
      expect([ written, written.map(note => note.split(`<${BLUEPRINT_LINK_KEY}:`).length - 1) ])
        .toStrictEqual([ [ 'a\n<blueprint:[k3x9q2mf, 2]>', 'see here\n<blueprint:[k3x9q2mf, 2]>' ], [ 1, 1 ] ]);
    });

    it('refuses a note whose stray bracket would swallow the link', () =>
    {
      // Arrange: a tag left open with a colon, which reads everything up to the link's closing bracket as its value, and
      // one left open without, which reads it all as its name.
      const notes = [ 'odd <tag: never closed', '<x' ];

      // Act.
      const read = notes.map(note => [ ...noteMetaOf(`${note}\n<blueprint:[k3x9q2mf, 2]>`).keys() ]);
      const writes = notes.map(note => () => withBlueprintLink(note, LINK));

      // Assert: neither would hold a link at all.
      expect(read)
        .toStrictEqual([ [ 'tag' ], [ 'x\n' ] ]);
      writes.forEach(write => expect(write)
        .toThrow(LINK_MISREAD));
    });

    it('refuses a note whose other tags would read otherwise once its old link is out, though the new link reads back', () =>
    {
      // Arrange: a stray bracket right before an old link opens nothing while the link stands, and with the link gone it
      // opens a tag of its own, "w".
      const note = 'z<<blueprint:[aaaa, 1]>w> <moveSpeed:6.0>';

      // Act.
      const write = () => withBlueprintLink(note, LINK);

      // Assert.
      expect([ ...noteMetaOf(note).keys() ])
        .toStrictEqual([ 'blueprint', 'moveSpeed' ]);
      expect(write)
        .toThrow(OTHER_TAGS_MISREAD);
    });
  });

  describe('withoutBlueprintLink', () =>
  {
    it('undoes withBlueprintLink byte for byte on every shape of note', () =>
    {
      // Arrange: empty, words, a tag, Windows' pairs, a newline then a pair, trailing blank lines, and breaks alone.
      const notes = [ '', 'Guard captain', '<moveSpeed:6.0>', 'a\r\nb\r\n', 'a\nb\r\n', 'a\n\n', '\r\n' ];

      // Act.
      const back = notes.map(note => withoutBlueprintLink(withBlueprintLink(note, LINK)));

      // Assert.
      expect(back)
        .toStrictEqual(notes);
    });

    it('takes every link out, keeping every other tag reading as it did', () =>
    {
      // Arrange: two links around another tag.
      const note = '<blueprint:[aaaa, 1]>\n<moveSpeed:6.0>\n<blueprint:[k3x9q2mf, 2]>';

      // Act.
      const written = withoutBlueprintLink(note);

      // Assert.
      expect([ written, blueprintLinkOf(written) ])
        .toStrictEqual([ '<moveSpeed:6.0>', null ]);
    });

    it('hands back the very note when it holds no link', () =>
    {
      // Arrange.
      const note = 'a < b\n<moveSpeed:6.0>';

      // Act.
      const written = withoutBlueprintLink(note);

      // Assert.
      expect(written)
        .toBe(note);
    });

    it('refuses a note whose other tags would read otherwise once the link is out', () =>
    {
      // Arrange: a stray bracket right before the link opens nothing while the link stands, and with the link gone it
      // opens a tag of its own, "w".
      const note = 'z<<blueprint:[k3x9q2mf, 2]>w> <moveSpeed:6.0>';

      // Act.
      const write = () => withoutBlueprintLink(note);

      // Assert.
      expect([ ...noteMetaOf('z<w> <moveSpeed:6.0>').keys() ])
        .toStrictEqual([ 'w', 'moveSpeed' ]);
      expect(write)
        .toThrow(OTHER_TAGS_MISREAD);
    });

    it('refuses a note that would still read a link once every tag of its name is out', () =>
    {
      // Arrange: a stray bracket right before a link, which opens nothing while the link stands; with the link gone it
      // closes up with the text after into another link.
      const note = '<<blueprint:[aaaa, 1]>blueprint:[k3x9q2mf, 2]>';

      // Act.
      const write = () => withoutBlueprintLink(note);

      // Assert.
      expect([ noteMetaOf(note).get('blueprint'), noteMetaOf('<blueprint:[k3x9q2mf, 2]>').get('blueprint') ])
        .toStrictEqual([ '[aaaa, 1]', '[k3x9q2mf, 2]' ]);
      expect(write)
        .toThrow(LINK_MISREAD);
    });
  });
});
