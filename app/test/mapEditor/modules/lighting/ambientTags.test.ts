import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { LightingClock } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { ambientPayloadOf, mapAmbient, parseAmbient } from '../../../../src/mapEditor/modules/lighting/ambientTags.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * A map's darkness is read from its note exactly as J-Lighting reads it on arrival. The note is read line by line, the
 * first tag on a line counts and the last line holding one wins; unlike a comment, the tag may share its line with other
 * words. The tag's darkness comes first, as a number held to 0 to 100 and read as a fraction; a darkness that is no
 * number, or a list of more than two values, darkens nothing.
 *
 * What follows the darkness is the colour of the dark: a hex colour is used, and anything else falls back to the
 * project's. Writing anything there at all says the map names its colour, which is what lets a map keep its colour
 * against a source that outranks it but only knows how dark it is; a tag writing nothing there names none. A map's own
 * darkness is what the place always is, so it is the same at every hour of the window's clock.
 */

/**
 * The view's clock at 14:00, the hour Chef Adventure starts at.
 */
const AFTERNOON: LightingClock = { frames: 0, animating: true, timeOfDay: 840 };

/**
 * A map whose note is the given text.
 * @param {string} note The note.
 * @returns {MapDocument} The map.
 */
const mapNoted = (note: string): MapDocument =>
{
  return MapDocument.fromJson('map:4', { ...buildMapJson(), note });
};

describe('ambientTags', () =>
{
  describe('ambientPayloadOf', () =>
  {
    it('finds the tag on a line of its own, in any case and with one space after the colon', () =>
    {
      // Arrange.
      const notes = [ '<ambient:[60]>', '<AMBIENT: [85, #0a2a2a]>' ];

      // Act.
      const payloads = notes.map(ambientPayloadOf);

      // Assert.
      expect(payloads)
        .toStrictEqual([ '[60]', '[85, #0a2a2a]' ]);
    });

    it('finds the tag among other words on its line, as a note allows', () =>
    {
      // Arrange.
      const note = 'deep cave <ambient:[93]> past the bridge';

      // Act.
      const payload = ambientPayloadOf(note);

      // Assert.
      expect(payload)
        .toBe('[93]');
    });

    it('takes the last line holding a tag, whichever line breaks the note uses', () =>
    {
      // Arrange: three tags on lines ended three ways.
      const note = '<noToneChange>\r\n<ambient:[30]>\n<ambient:[50]>\r<ambient:[70]>\nend';

      // Act.
      const payload = ambientPayloadOf(note);

      // Assert.
      expect(payload)
        .toBe('[70]');
    });

    it('takes the first tag of a line holding two', () =>
    {
      // Arrange.
      const note = '<ambient:[30]><ambient:[70]>';

      // Act.
      const payload = ambientPayloadOf(note);

      // Assert.
      expect(payload)
        .toBe('[30]');
    });

    it('finds nothing in a note without the tag, or with something only shaped like it', () =>
    {
      // Arrange: nothing at all; no brackets; a tag sharing its start; an empty list; a darkness led by a word; two
      // spaces after the colon.
      const notes = [ '', '<ambient:60>', '<ambients:[60]>', '<ambient:[]>', '<ambient:[dark]>', '<ambient:  [60]>' ];

      // Act.
      const payloads = notes.map(ambientPayloadOf);

      // Assert.
      expect(payloads)
        .toStrictEqual([ null, null, null, null, null, null ]);
    });
  });

  describe('parseAmbient', () =>
  {
    it('reads a darkness alone as a fraction, naming no colour and carrying the project\'s', () =>
    {
      // Arrange.
      const payload = '[85]';

      // Act.
      const declared = parseAmbient(payload, '#102030', 'map');

      // Assert.
      expect(declared)
        .toStrictEqual({ darkness: 0.85, color: [ 16, 32, 48 ], declaresColor: false, source: 'map' });
    });

    it('reads a hex colour after the darkness as the dark\'s own, shorthand included', () =>
    {
      // Arrange.
      const payloads = [ '[85, #0a2a2a]', '[85,#0a2]' ];

      // Act.
      const declared = payloads.map(payload => parseAmbient(payload, '#102030', 'map'));

      // Assert.
      expect(declared)
        .toStrictEqual([
          { darkness: 0.85, color: [ 10, 42, 42 ], declaresColor: true, source: 'map' },
          { darkness: 0.85, color: [ 0, 170, 34 ], declaresColor: true, source: 'map' },
        ]);
    });

    it('falls back to the project\'s colour for one it cannot use, still naming a colour of its own', () =>
    {
      // Arrange: a hex code with a typo, a number, and a colour by name.
      const payloads = [ '[60, #0a2a2z]', '[60, 50]', '[60, teal]' ];

      // Act.
      const declared = payloads.map(payload => parseAmbient(payload, '#102030', 'map'));

      // Assert.
      expect(declared.map(each => [ each?.color, each?.declaresColor ]))
        .toStrictEqual([ [ [ 16, 32, 48 ], true ], [ [ 16, 32, 48 ], true ], [ [ 16, 32, 48 ], true ] ]);
    });

    it('holds the darkness to 0 to 100 and keeps a fraction of a percent', () =>
    {
      // Arrange.
      const payloads = [ '[150]', '[0]', '[12.5]' ];

      // Act.
      const darkness = payloads.map(payload => parseAmbient(payload, '#000000', 'map')?.darkness);

      // Assert.
      expect(darkness)
        .toStrictEqual([ 1, 0, 0.125 ]);
    });

    it('refuses a list of more than a darkness and a colour', () =>
    {
      // Arrange.
      const payload = '[85, #000000, 5]';

      // Act.
      const declared = parseAmbient(payload, '#000000', 'map');

      // Assert.
      expect(declared)
        .toBeNull();
    });

    it('refuses a darkness that is no number', () =>
    {
      // Arrange: dots alone, which the tag's shape allows but parse to no number.
      const payload = '[..]';

      // Act.
      const declared = parseAmbient(payload, '#000000', 'map');

      // Assert.
      expect(declared)
        .toBeNull();
    });
  });

  describe('mapAmbient', () =>
  {
    it('declares the darkness a map\'s note holds, under the map\'s own source', () =>
    {
      // Arrange.
      const cave = mapNoted('<noToneChange>\n<ambient:[85]>');

      // Act.
      const declared = mapAmbient('#000000')(cave, AFTERNOON);

      // Assert.
      expect(declared)
        .toStrictEqual({ darkness: 0.85, color: [ 0, 0, 0 ], declaresColor: false, source: 'map' });
    });

    it('declares the same darkness at every hour of the clock', () =>
    {
      // Arrange: a cave read at 14:00 and again at 22:00.
      const cave = mapNoted('<ambient:[60, #0a2a2a]>');
      const source = mapAmbient('#000000');

      // Act.
      const declared = [ source(cave, AFTERNOON), source(cave, { ...AFTERNOON, timeOfDay: 1320 }) ];

      // Assert.
      expect(declared)
        .toStrictEqual([
          { darkness: 0.6, color: [ 10, 42, 42 ], declaresColor: true, source: 'map' },
          { darkness: 0.6, color: [ 10, 42, 42 ], declaresColor: true, source: 'map' },
        ]);
    });

    it('declares nothing for a map whose note holds no tag', () =>
    {
      // Arrange: another plugin's tag alone.
      const field = mapNoted('<noToneChange>');

      // Act.
      const declared = mapAmbient('#000000')(field, AFTERNOON);

      // Assert.
      expect(declared)
        .toBeNull();
    });
  });
});
