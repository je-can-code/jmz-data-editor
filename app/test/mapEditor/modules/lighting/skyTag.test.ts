import { describe, expect, it } from 'vitest';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { SKY_MISREAD, skyFollowsClock, withSkyFollowingClock } from '../../../../src/mapEditor/modules/lighting/skyTag.ts';

/*
 * Whether a map's sky follows the clock is read exactly as J-Lighting-Time reads it on arrival: from the map's metadata,
 * which the engine fills in one search over the whole note, under the exact name noToneChange. A value there that is
 * truthy keeps the sky still, so a bare tag does and so does any written value, even "false"; a tag with nothing after
 * its colon does not, and a name in another case, or with anything added, is another name.
 *
 * Saying a map has no sky adds the bare tag on a line of its own at the end of the note; saying it has one takes every
 * tag of that name out, cleanly, since any of them could keep it still, and leaves a tag only named like it alone. Every
 * other character of the note stays exactly as written, and a note the game would read back otherwise is refused rather
 * than written: one whose sky would read otherwise, and one where some other tag would, as when a stray bracket would
 * swallow the tag after the one taken out.
 */
describe('skyTag', () =>
{
  describe('skyFollowsClock', () =>
  {
    it('follows the clock on a map whose note says nothing of its sky, or names a tag only like the one it reads', () =>
    {
      // Arrange: nothing; other plugins' tags; the name in another case; a longer name; a space after the name.
      const notes = [ '', '<noWeather>\n<weather:fog>', '<NoToneChange>', '<noToneChanges>', '<noToneChange >' ];

      // Act.
      const follows = notes.map(skyFollowsClock);

      // Assert.
      expect(follows)
        .toStrictEqual([ true, true, true, true, true ]);
    });

    it('keeps still on a map tagged with no sky, whatever the tag goes on to say', () =>
    {
      // Arrange: the bare tag among others; a written value, which the game reads as true however it reads.
      const notes = [ '<noWeather>\n<noToneChange>\n<ambient:[85]>', '<noToneChange:false>' ];

      // Act.
      const follows = notes.map(skyFollowsClock);

      // Assert.
      expect(follows)
        .toStrictEqual([ false, false ]);
    });

    it('follows the clock when the last tag of the name holds nothing after its colon', () =>
    {
      // Arrange: a later tag of the name replaces an earlier one.
      const note = '<noToneChange>\n<noToneChange:>';

      // Act.
      const follows = skyFollowsClock(note);

      // Assert.
      expect(follows)
        .toBe(true);
    });
  });

  describe('withSkyFollowingClock', () =>
  {
    it('leaves the note exactly as it was when the sky already does as asked', () =>
    {
      // Arrange.
      const outdoors = '<weather:rain>';
      const cave = '<noToneChange>\n<ambient:[85]>';

      // Act.
      const written = [ withSkyFollowingClock(outdoors, true), withSkyFollowingClock(cave, false) ];

      // Assert.
      expect(written)
        .toStrictEqual([ outdoors, cave ]);
    });

    it('adds the tag on a line of its own at the end, every other character kept', () =>
    {
      // Arrange: an empty note, a note ending on its last tag, and one ending on a line break.
      const notes = [ '', '<weather:rain>', '<ambient:[93]>\n<weather:snow>\n' ];

      // Act.
      const written = notes.map(note => withSkyFollowingClock(note, false));

      // Assert.
      expect(written)
        .toStrictEqual([ '<noToneChange>', '<weather:rain>\n<noToneChange>', '<ambient:[93]>\n<weather:snow>\n<noToneChange>\n' ]);
    });

    it('takes the tag out with its line, leaving every other tag as written', () =>
    {
      // Arrange: the tag first, last, and in the middle.
      const notes = [ '<noToneChange>\n<weather:fog>\n', '<allowRegions:[2,3]>\n<denyRegions:[1]>\n<noToneChange>', '<noWeather>\n<noToneChange>\n<ambient:[85]>' ];

      // Act.
      const written = notes.map(note => withSkyFollowingClock(note, true));

      // Assert.
      expect(written)
        .toStrictEqual([ '<weather:fog>\n', '<allowRegions:[2,3]>\n<denyRegions:[1]>', '<noWeather>\n<ambient:[85]>' ]);
    });

    it('takes out every tag of the name, a written one included, from the last back', () =>
    {
      // Arrange: two on one line among words, and one with a written value on the next.
      const note = 'cave <noToneChange> <noToneChange>\n<noToneChange:true>\n<noWeather>';

      // Act.
      const written = withSkyFollowingClock(note, true);

      // Assert.
      expect([ written, skyFollowsClock(written) ])
        .toStrictEqual([ 'cave\n<noWeather>', true ]);
    });

    it('refuses to take the sky\'s tag out when a stray bracket would then swallow the tag after it, saying why', () =>
    {
      // Arrange: a bracket the sky's tag closes off, and time stopped on the map after it.
      const note = '<<noToneChange> <timeBlock>';

      // Act.
      const write = () => withSkyFollowingClock(note, true);

      // Assert.
      expect(write)
        .toThrow(OTHER_TAGS_MISREAD);
    });

    it('refuses to write a tag the game would not read, saying why', () =>
    {
      // Arrange: a stray opening bracket earlier in the note swallows whatever tag comes after it.
      const note = 'the gate < the wall';

      // Act.
      const write = () => withSkyFollowingClock(note, false);

      // Assert.
      expect(write)
        .toThrow(SKY_MISREAD);
    });
  });
});
