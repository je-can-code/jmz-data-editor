import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import {
  LAYER_KNOBS,
  MOTION_KNOBS,
  STAGE_KNOBS,
} from '../../../../src/core/domain/valueObjects/weather-knobs.ts';

/** Chef Adventure sits beside this repo in the workspace; see the Go unmarshal test for the same path. */
const CHEF_ADVENTURE_CONFIG = '../../ca/chef-adventure/data/config.weather.json';

/**
 * The knob catalogue owes its callers one thing: **an author must never have to open the JSON.**
 *
 * That is a promise the catalogue can break silently. It is a hand-kept list of what the plugin
 * reads, so a knob added to `WeatherMotion.js` and used in the config simply has no control - the
 * tab renders the knobs it knows about, the new one is invisible, and the only way to change it is
 * a text editor. Nothing errors and nothing looks wrong.
 *
 * So the guard is a sweep of the real file: every value in it has to be something a control
 * exists for. It runs when the sibling repo is present and skips when it is not, like the Go
 * unmarshal test it mirrors.
 */
describe('weather-knobs', () =>
{
  /** Keys beginning with this are authoring notes and get a note field rather than a knob. */
  const isNote = (key: string): boolean => key.startsWith('_comment');

  describe('the catalogue', () =>
  {
    it('names every knob without repeating one', () =>
    {
      // Arrange - a duplicate would render two fields writing the same value, and the second
      // would silently win.
      const keys = [ ...MOTION_KNOBS, ...LAYER_KNOBS, ...STAGE_KNOBS ].map(knob => knob.key);

      // Act.
      const motionKeys = MOTION_KNOBS.map(knob => knob.key);
      const layerKeys = [ ...LAYER_KNOBS, ...STAGE_KNOBS ].map(knob => knob.key);

      // Assert - within each catalogue; a name may legitimately appear in both, since a layer's
      // `motion` and a motion's own knobs are different things.
      expect(new Set(motionKeys).size)
        .toBe(motionKeys.length);
      expect(new Set(layerKeys).size)
        .toBe(layerKeys.length);
      expect(keys.length)
        .toBeGreaterThan(0);
    });

    it('gives every knob a label and an explanation', () =>
    {
      // Arrange - a knob with no help is twenty-odd bare numbers again, which is the thing the
      // catalogue exists to avoid.
      const all = [ ...MOTION_KNOBS, ...LAYER_KNOBS, ...STAGE_KNOBS ];

      // Act & Assert.
      all.forEach(knob =>
      {
        expect(knob.label.length)
          .toBeGreaterThan(0);
        expect(knob.help.length)
          .toBeGreaterThan(0);
      });
    });
  });

  describe('against the real configuration', () =>
  {
    it('has a control for every motion knob in use', () =>
    {
      // Arrange - optional, like the Go unmarshal test beside it.
      if (existsSync(CHEF_ADVENTURE_CONFIG) === false) return;

      const file = JSON.parse(readFileSync(CHEF_ADVENTURE_CONFIG, 'utf8'));
      const known = new Set(MOTION_KNOBS.map(knob => knob.key));

      // Act.
      const missing: string[] = [];
      let swept = 0;
      Object.keys(file.motions)
        .filter(name => isNote(name) === false)
        .forEach(name =>
        {
          Object.keys(file.motions[ name ])
            .filter(key => isNote(key) === false)
            .forEach(key =>
            {
              swept += 1;
              if (known.has(key) === false) missing.push(`${name}.${key}`);
            });
        });

      // Assert - the count is the proof the sweep ran, since an empty `missing` is also what a
      // sweep over nothing produces.
      expect(missing)
        .toEqual([]);
      expect(swept)
        .toBeGreaterThan(50);
    });

    it('has a control for every layer knob in use', () =>
    {
      // Arrange.
      if (existsSync(CHEF_ADVENTURE_CONFIG) === false) return;

      const file = JSON.parse(readFileSync(CHEF_ADVENTURE_CONFIG, 'utf8'));
      const known = new Set([ ...LAYER_KNOBS, ...STAGE_KNOBS ].map(knob => knob.key));

      // Act.
      const missing: string[] = [];
      let layers = 0;
      Object.keys(file.presets)
        .filter(name => isNote(name) === false)
        .forEach(name =>
        {
          const stops = file.presets[ name ].stops ?? {};
          Object.keys(stops)
            .filter(key => isNote(key) === false)
            .forEach(strength =>
            {
              (stops[ strength ] ?? []).forEach((layer: Record<string, unknown>) =>
              {
                layers += 1;
                Object.keys(layer)
                  .filter(key => isNote(key) === false)
                  .filter(key => known.has(key) === false)
                  .forEach(key => missing.push(`${name}.${strength}.${key}`));
              });
            });
        });

      // Assert - as above, the layer count proves there was something to sweep.
      expect(missing)
        .toEqual([]);
      expect(layers)
        .toBeGreaterThan(50);
    });

    it('has somewhere for every block the file carries', () =>
    {
      // Arrange - the board edits these and nothing else, so a block appearing outside the list
      // is one an author would have to reach into the JSON for.
      if (existsSync(CHEF_ADVENTURE_CONFIG) === false) return;

      const file = JSON.parse(readFileSync(CHEF_ADVENTURE_CONFIG, 'utf8'));
      const topLevel = [ 'motions', 'presets', 'presetIds', 'intensityIds', 'variables', 'sky', 'climates' ];
      const skyLevel = [
        'types', 'seasons', 'months', 'voices', 'places',
        'intensityDrift', 'settleTo', 'forecastPhases', 'visibleDays',
      ];

      // Act.
      const strayTop = Object.keys(file)
        .filter(key => isNote(key) === false)
        .filter(key => topLevel.includes(key) === false);
      const straySky = Object.keys(file.sky)
        .filter(key => isNote(key) === false)
        .filter(key => skyLevel.includes(key) === false);

      // Assert.
      expect(strayTop)
        .toEqual([]);
      expect(straySky)
        .toEqual([]);
    });

    it('has somewhere for everything a look carries', () =>
    {
      // Arrange.
      if (existsSync(CHEF_ADVENTURE_CONFIG) === false) return;

      const file = JSON.parse(readFileSync(CHEF_ADVENTURE_CONFIG, 'utf8'));
      const editable = [ 'description', 'iconIndex', 'stops', 'sounds' ];

      // Act.
      const stray: string[] = [];
      const looks = Object.keys(file.presets)
        .filter(name => isNote(name) === false);
      looks.forEach(name =>
      {
        Object.keys(file.presets[ name ])
          .filter(key => isNote(key) === false)
          .filter(key => editable.includes(key) === false)
          .forEach(key => stray.push(`${name}.${key}`));
      });

      // Assert - fifteen kinds of weather ship today; the anchor only has to prove the loop ran.
      expect(stray)
        .toEqual([]);
      expect(looks.length)
        .toBeGreaterThan(10);
    });
  });
});
