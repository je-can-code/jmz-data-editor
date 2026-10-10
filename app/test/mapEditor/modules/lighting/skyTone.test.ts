import { Container, type Renderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { LightingFrame, ScreenTone } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { SkyTone } from '../../../../src/mapEditor/modules/lighting/skyTone.ts';
import type { SkyCurve } from '../../../../src/mapEditor/modules/lighting/timeTone.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { ENGINE_PAGES } from '../../support/pageFixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * The sky's colour in one map view: asked to draw, it works the tone out for the map as it now stands at the clock's
 * hour and casts it through the stage, but only when it differs from what it cast before, so the view's tone is never
 * set again for nothing. Handed the clock, it does nothing at all unless the clock moved, and casts only when the hour
 * moved the tone: within one hour, or across hours tinting alike, nothing is cast and the frame has nothing new to show.
 * A map taken out from under the sky by an edit casts none at its next draw. Let go, it takes its tone back.
 */

/**
 * A curve whose phases tint alike from Morning through Afternoon, and otherwise as Chef Adventure's does.
 */
const CURVE: SkyCurve = {
  tones: [
    [ -30, -18, 34, 170 ],
    [ 30, 6, -12, 40 ],
    [ 12, 8, -4, 0 ],
    [ 12, 8, -4, 0 ],
    [ 26, 0, -34, 22 ],
    [ -34, -14, 40, 95 ],
    [ -30, -18, 34, 170 ],
  ],
  darkness: [ 0.72, 0.3, 0, 0, 0.08, 0.55, 0.72 ],
};

/**
 * The sky in a view, on a stage writing down every tone cast.
 * @returns {{ sky: SkyTone, cast: (ScreenTone | null)[] }} The sky, and what it cast.
 */
const skyOnStage = () =>
{
  const cast: (ScreenTone | null)[] = [];
  const sky = new SkyTone({ layer: new Container(), tileSize: 48, castTone: tone => cast.push(tone) }, CURVE);
  return { sky, cast };
};

/**
 * A frame on a map with the given note, at a time of day.
 * @param {string} note The map's note.
 * @param {number} timeOfDay The time of day, in minutes past midnight.
 * @returns {LightingFrame} The frame.
 */
const frameOn = (note: string, timeOfDay: number): LightingFrame => ({
  document: MapDocument.fromJson('map:3', { ...buildMapJson(), note }),
  renderer: {} as Renderer,
  context: 1,
  clock: { frames: 0, animating: true, timeOfDay },
  pages: ENGINE_PAGES,
  view: WHOLE_VIEW,
});

describe('SkyTone', () =>
{
  it('casts the tone at the clock\'s hour when it draws over a map with a sky', () =>
  {
    // Arrange.
    const { sky, cast } = skyOnStage();

    // Act.
    sky.draw(frameOn('', 1320));

    // Assert.
    expect([ cast, sky.tone ])
      .toStrictEqual([ [ [ -32, -16, 37, 133 ] ], [ -32, -16, 37, 133 ] ]);
  });

  it('casts nothing when it draws over a map with no sky, and nothing again when drawn again unchanged', () =>
  {
    // Arrange.
    const { sky, cast } = skyOnStage();

    // Act: a cave, drawn twice.
    sky.draw(frameOn('<noToneChange>', 1320));
    sky.draw(frameOn('<noToneChange>', 1320));

    // Assert.
    expect([ cast, sky.tone ])
      .toStrictEqual([ [], null ]);
  });

  it('takes its tone back at the next draw once an edit takes the map out from under the sky', () =>
  {
    // Arrange: a field drawn at 22:00.
    const { sky, cast } = skyOnStage();
    sky.draw(frameOn('', 1320));

    // Act: the note now says the map has no sky.
    sky.draw(frameOn('<noToneChange>', 1320));

    // Assert.
    expect(cast)
      .toStrictEqual([ [ -32, -16, 37, 133 ], null ]);
  });

  it('does nothing on a tick where the clock did not move', () =>
  {
    // Arrange: a field drawn at 22:00.
    const { sky, cast } = skyOnStage();
    sky.draw(frameOn('', 1320));

    // Act.
    const moved = sky.tick(frameOn('', 1320));

    // Assert.
    expect([ moved, cast.length ])
      .toStrictEqual([ false, 1 ]);
  });

  it('casts nothing on a tick where the clock moved within the hour, or to an hour tinting alike', () =>
  {
    // Arrange: a field drawn at 8:00, Morning's first hour.
    const { sky, cast } = skyOnStage();
    sky.draw(frameOn('', 480));

    // Act: 8:45, then noon, whose Afternoon tints as Morning's first hour does.
    const moved = [ sky.tick(frameOn('', 525)), sky.tick(frameOn('', 720)) ];

    // Assert.
    expect([ moved, cast ])
      .toStrictEqual([ [ false, false ], [ [ 12, 8, -4, 0 ] ] ]);
  });

  it('casts the new hour\'s tone on a tick where the clock moved to an hour tinting otherwise', () =>
  {
    // Arrange: a field drawn at 22:00.
    const { sky, cast } = skyOnStage();
    sky.draw(frameOn('', 1320));

    // Act: 23:00.
    const moved = sky.tick(frameOn('', 1380));

    // Assert.
    expect([ moved, cast ])
      .toStrictEqual([ true, [ [ -32, -16, 37, 133 ], [ -31, -17, 35, 151 ] ] ]);
  });

  it('takes its tone back when it is let go', () =>
  {
    // Arrange: a field drawn at 22:00.
    const { sky, cast } = skyOnStage();
    sky.draw(frameOn('', 1320));

    // Act.
    sky.destroy();

    // Assert.
    expect([ cast, sky.tone ])
      .toStrictEqual([ [ [ -32, -16, 37, 133 ], null ], null ]);
  });
});
