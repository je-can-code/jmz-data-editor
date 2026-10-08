import { describe, expect, it } from 'vitest';
import type { SkyReader } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { SKY_MISREAD, skyFollowsClock, skySettingFor, withSkyFollowingClock } from '../../../../src/mapEditor/modules/lighting/skyTag.ts';

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
 *
 * Map Properties offers the sky setting once, however many plugins read the tag: in the section of the plugin the
 * active modules said first reads it, never in another's, and nowhere while none does. It is named for what the sky
 * follows in each of those plugins, listed as a sentence lists things, says under it what the sky does in each, and
 * reads and writes the one tag above, whichever section shows it.
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

    it('keeps still on a map tagged with no sky, wherever the tag sits and whatever it goes on to say', () =>
    {
      // Arrange: the bare tag among others; a written value, which the game reads as true however it reads; the tag on a
      // line shared with other words, which the engine's one search over the note finds all the same.
      const notes = [ '<noWeather>\n<noToneChange>\n<ambient:[85]>', '<noToneChange:false>', 'a cave <noToneChange> below' ];

      // Act.
      const follows = notes.map(skyFollowsClock);

      // Assert.
      expect(follows)
        .toStrictEqual([ false, false, false ]);
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

    it('leaves tags only named like the sky\'s as written when taking the sky\'s out', () =>
    {
      // Arrange: the name in another case, the tag itself, and a longer name.
      const note = '<NoToneChange>\n<noToneChange>\n<noToneChanges>';

      // Act.
      const written = withSkyFollowingClock(note, true);

      // Assert.
      expect(written)
        .toBe('<NoToneChange>\n<noToneChanges>');
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

  describe('skySettingFor', () =>
  {
    /**
     * A plugin reading the sky for the hour's tint.
     */
    const CLOCK: SkyReader = { id: 'lighting.sky', follows: 'the clock', does: 'The hour tints and darkens this map.' };

    /**
     * A plugin reading the sky for its weather.
     */
    const WEATHER: SkyReader = { id: 'weather.sky', follows: 'the weather', does: 'The sky\'s weather reaches this map.' };

    /**
     * A third plugin reading the sky.
     */
    const TIDES: SkyReader = { id: 'tides.sky', follows: 'the tides', does: 'The tide floods this map.' };

    it('offers nothing while no plugin reads the sky, nor to a section whose plugin reads it after another', () =>
    {
      // Arrange: no readers; and the weather's section while the clock reads the sky first.
      const asked: [ SkyReader, readonly SkyReader[] ][] = [ [ CLOCK, [] ], [ WEATHER, [ CLOCK, WEATHER ] ] ];

      // Act.
      const settings = asked.map(([ host, readers ]) => skySettingFor('<noToneChange>', host, readers));

      // Assert.
      expect(settings)
        .toStrictEqual([ [], [] ]);
    });

    it('offers the first reader\'s section one setting, keyed by its reading, named for what the sky follows in each plugin', () =>
    {
      // Arrange: the clock's section with the clock alone, with the weather after it, and with the tides after both.
      const readerLists: readonly SkyReader[][] = [ [ CLOCK ], [ CLOCK, WEATHER ], [ CLOCK, WEATHER, TIDES ] ];

      // Act.
      const settings = readerLists.map(readers => skySettingFor('<noToneChange>', CLOCK, readers));

      // Assert.
      expect(settings.map(fields => fields.map(field => [ field.key, field.label, field.hint, field.value, field.step, field.control ])))
        .toStrictEqual([
          [ [
            'lighting.sky',
            'Sky follows the clock',
            'The hour tints and darkens this map. Untick it for interiors and caves, which have no sky.',
            false,
            'Change sky',
            { kind: 'check' },
          ] ],
          [ [
            'lighting.sky',
            'Sky follows the clock and the weather',
            'The hour tints and darkens this map. The sky\'s weather reaches this map. Untick it for interiors and caves, which have no sky.',
            false,
            'Change sky',
            { kind: 'check' },
          ] ],
          [ [
            'lighting.sky',
            'Sky follows the clock, the weather and the tides',
            'The hour tints and darkens this map. The sky\'s weather reaches this map. The tide floods this map. Untick it for '
              + 'interiors and caves, which have no sky.',
            false,
            'Change sky',
            { kind: 'check' },
          ] ],
        ]);
    });

    it('reads the sky from the note and writes the one tag in place, whichever section shows it', () =>
    {
      // Arrange: an outdoor map with weather, in the weather's section while the weather alone reads the sky.
      const [ setting ] = skySettingFor('<weather:rain>\n', WEATHER, [ WEATHER ]);

      // Act.
      const written = setting.write(false);

      // Assert.
      expect([ setting.key, setting.value, written ])
        .toStrictEqual([ 'weather.sky', true, { note: '<weather:rain>\n<noToneChange>\n' } ]);
    });
  });
});
