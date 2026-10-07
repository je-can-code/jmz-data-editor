import { describe, expect, it } from 'vitest';
import type { QuickControl, SliderControl } from '../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import type { MapPropertiesSection } from '../../../src/mapEditor/core/modules/PluginModule.ts';
import type { MapPropertyField } from '../../../src/mapEditor/core/properties/moduleProperties.ts';
import { screenToWorld } from '../../../src/mapEditor/core/renderer/camera.ts';
import type { LightingLayerDefinition } from '../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { GAME_LOOK, type OverlayPainter } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { makeAutotileId } from '../../../src/mapEditor/core/tiles/tileIds.ts';
import { fitZoom } from '../../../src/mapEditor/render/cameraControls.ts';
import {
  cameraOnPath,
  clockOnPath,
  firstSlider,
  parityLightingLayers,
  parityLook,
  ringsOverlay,
  sliderOnPath,
  timeFromQuery,
  unusedGroundKind,
  wantsSpeedHooks,
} from '../../../src/mapEditor/render/speedHooks.ts';
import { buildMapJson } from '../support/fixtures.ts';

/*
 * The speed script drives the page through hooks that exist only when the page was opened for measuring, and its
 * camera paths decide what the budgets are measured on: a pan at zoom 1, a zoom sweep between 2x and the whole map,
 * the whole map held on screen, the whole map held still while the window's clock sweeps the day, every hour of it
 * passing, and the whole map held still while the first slider a module adds to Map Properties is dragged up and down
 * the upper reaches of its track, a step a frame, as an author drags a map's darkness. If a path never reached the whole
 * map, the budget for it would pass untested. A page can be opened at an
 * hour of the day, written in the address as a 24-hour clock writes it, so a map is measured at night from its first
 * frame; anything no clock shows asks for nothing.
 *
 * The parity check holds the editor's drawing against the game's own, which it runs with no shadows, and with its light
 * mask only when the check compares a map dark; so the editor draws no shadows then, and its lighting only when asked,
 * and only what the game itself shows of it, never an aid such as a light's ring. The game copy's lights are held
 * steady, so the editor draws nothing moving, every light at full strength, and a run is the same every time.
 */
describe('speedHooks', () =>
{
  describe('wantsSpeedHooks', () =>
  {
    it('installs the hooks only for a page opened with speed=1', () =>
    {
      // Arrange.
      const searches = [ '?map=102&speed=1', '?map=102', '?speed=0', '' ];

      // Act.
      const wanted = searches.map(wantsSpeedHooks);

      // Assert.
      expect(wanted)
        .toStrictEqual([ true, false, false, false ]);
    });
  });

  describe('cameraOnPath', () =>
  {
    const map = (() =>
    {
      const json = buildMapJson();
      return MapDocument.fromJson('map:1', { ...json, width: 75, height: 75, data: new Array(75 * 75 * 6).fill(0) });
    })();
    const view = { width: 2560, height: 1415 };

    it('pans at zoom 1 about the map\'s middle', () =>
    {
      // Arrange: at the start the pan sits 0.3 of a swing down from the middle.
      const seconds = 0;

      // Act.
      const camera = cameraOnPath('pan', seconds, map, view);
      const centre = screenToWorld(camera, { x: view.width / 2, y: view.height / 2 });

      // Assert.
      expect([ camera.zoom, centre ])
        .toStrictEqual([ 1, { x: 1800, y: 1800 + 3600 * 0.3 } ]);
    });

    it('sweeps the zoom from 2x all the way out to the whole map', () =>
    {
      // Arrange: the sweep is at 2x at the start and at the whole map half a period later.
      const whole = fitZoom(view, map, 48);

      // Act.
      const zooms = [ cameraOnPath('zoom', 0, map, view).zoom, cameraOnPath('zoom', Math.PI / 1.3, map, view).zoom ];

      // Assert.
      expect(zooms.map(zoom => Number(zoom.toFixed(9))))
        .toStrictEqual([ 2, Number(whole.toFixed(9)) ]);
    });

    it('holds the whole map on screen, drifting', () =>
    {
      // Arrange.
      const whole = fitZoom(view, map, 48);

      // Act.
      const cameras = [ cameraOnPath('zoomedout', 0, map, view), cameraOnPath('zoomedout', 1, map, view) ];

      // Assert: always the whole map's zoom, and not standing still.
      expect([ cameras.map(camera => camera.zoom), cameras[0].x !== cameras[1].x ])
        .toStrictEqual([ [ whole, whole ], true ]);
    });

    it('holds the whole map still, centred, while the clock sweeps', () =>
    {
      // Arrange.
      const whole = fitZoom(view, map, 48);

      // Act.
      const cameras = [ cameraOnPath('clock', 0, map, view), cameraOnPath('clock', 1, map, view) ];
      const centre = screenToWorld(cameras[0], { x: view.width / 2, y: view.height / 2 });

      // Assert.
      expect([ cameras[1], centre.x, centre.y, cameras[0].zoom ])
        .toStrictEqual([ cameras[0], 1800, 1800, whole ]);
    });

    it('holds the whole map still, centred, while a slider sweeps', () =>
    {
      // Arrange.
      const whole = fitZoom(view, map, 48);

      // Act.
      const cameras = [ cameraOnPath('slider', 0, map, view), cameraOnPath('slider', 1.5, map, view) ];
      const centre = screenToWorld(cameras[0], { x: view.width / 2, y: view.height / 2 });

      // Assert.
      expect([ cameras[1], centre.x, centre.y, cameras[0].zoom ])
        .toStrictEqual([ cameras[0], 1800, 1800, whole ]);
    });
  });

  describe('sliderOnPath', () =>
  {
    it('drags a slider from the top of its track down to 30 along it and back up, a step a frame, round and round', () =>
    {
      // Arrange: a darkness slider from 0 to 100 in whole steps, at the start, a frame in, the turn at 70 frames, the way
      // back, and a whole sweep of 140 frames and one more on; each moment halfway through its frame.
      const control: SliderControl = { kind: 'slider', min: 0, max: 100, places: 2, track: [ 0, 100 ], step: 1, unit: '%' };
      const frames = [ 0, 1, 70, 71, 139, 141 ];

      // Act.
      const values = frames.map(frame => sliderOnPath((frame + 0.5) / 60, control));

      // Assert.
      expect(values)
        .toStrictEqual([ 100, 99, 30, 31, 99, 99 ]);
    });

    it('moves a slider of coarser steps a whole step a frame, never off its steps', () =>
    {
      // Arrange: a reach in tiles from 1 to 21, a half tile a step, so its sweep spans 28 steps, down to 7.
      const control: SliderControl = { kind: 'slider', min: 1, max: 21, places: 1, track: [ 1, 21 ], step: 0.5, unit: 'tiles' };

      // Act.
      const values = [ 0, 1, 28, 29 ].map(frame => sliderOnPath((frame + 0.5) / 60, control));

      // Assert.
      expect(values)
        .toStrictEqual([ 21, 20.5, 7, 7.5 ]);
    });
  });

  describe('firstSlider', () =>
  {
    /**
     * A section offering the fields given, whatever the map.
     * @param {string} id The section's id.
     * @param {MapPropertyField[]} fields The fields.
     * @returns {MapPropertiesSection} The section.
     */
    const sectionOf = (id: string, fields: MapPropertyField[]): MapPropertiesSection =>
      ({ id, title: id, source: () => ({ note: null, fields }) });

    /**
     * A field showing a control.
     * @param {string} key The setting.
     * @param {QuickControl} control The control.
     * @returns {MapPropertyField} The field.
     */
    const fieldOf = (key: string, control: QuickControl): MapPropertyField =>
      ({ key, label: key, control, value: 0, step: key, write: () => ({}) });

    const darkness: SliderControl = { kind: 'slider', min: 0, max: 100, places: 2, track: [ 0, 100 ], step: 1, unit: '%' };
    const map = MapDocument.fromJson('map:1', buildMapJson());

    it('finds the first slider of the first section offering one, past a section and a field that offer none', () =>
    {
      // Arrange: a section with a tick box alone; then one with a colour, the darkness slider and a second slider.
      const sections = [
        sectionOf('weather.map', [ fieldOf('weather.sky', { kind: 'check' }) ]),
        sectionOf('lighting.map', [ fieldOf('lighting.color', { kind: 'color' }), fieldOf('lighting.darkness', darkness), fieldOf('lighting.other', darkness) ]),
      ];

      // Act.
      const slider = firstSlider(sections, map);

      // Assert.
      expect([ slider?.key, slider?.control, slider?.source === sections[1].source ])
        .toStrictEqual([ 'lighting.darkness', darkness, true ]);
    });

    it('finds nothing when no section offers a slider', () =>
    {
      // Arrange: a section with a tick box alone.
      const sections = [ sectionOf('weather.map', [ fieldOf('weather.sky', { kind: 'check' }) ]) ];

      // Act.
      const slider = firstSlider(sections, map);

      // Assert.
      expect(slider)
        .toBeNull();
    });
  });

  describe('clockOnPath', () =>
  {
    it('sweeps the whole day every eight seconds from midnight, three minutes a frame, round and round', () =>
    {
      // Arrange: the start, a frame in, the hour's first turn, halfway, and a whole day and a frame on.
      const seconds = [ 0, 1 / 60, 1 / 3, 4, 8 + (1 / 60) ];

      // Act.
      const times = seconds.map(clockOnPath);

      // Assert.
      expect(times)
        .toStrictEqual([ 0, 3, 60, 720, 3 ]);
    });
  });

  describe('timeFromQuery', () =>
  {
    it('reads the time of day a page is asked to show, an hour of one digit or two', () =>
    {
      // Arrange: 22:00, 2:05, and midnight.
      const searches = [ '?map=337&speed=1&time=22:00', '?time=2:05', '?time=00:00' ];

      // Act.
      const times = searches.map(timeFromQuery);

      // Assert.
      expect(times)
        .toStrictEqual([ 1320, 125, 0 ]);
    });

    it('reads nothing when no time is asked for, or one no clock shows', () =>
    {
      // Arrange: none; 24:00; a minute of 60; minutes alone; words.
      const searches = [ '?map=337&speed=1', '?time=24:00', '?time=22:60', '?time=1320', '?time=night' ];

      // Act.
      const times = searches.map(timeFromQuery);

      // Assert.
      expect(times)
        .toStrictEqual([ null, null, null, null, null ]);
    });
  });

  describe('unusedGroundKind', () =>
  {
    it('finds a ground kind the map holds on no layer, skipping the decorations', () =>
    {
      // Arrange: the first two ground kinds used, one on layer 1 and one on layer 3; kinds 18 and 19 are free.
      const data = new Array(2 * 1 * 6).fill(0);
      data[0] = makeAutotileId(16, 5);
      data[2 * 2 + 1] = makeAutotileId(17, 0);
      const map = MapDocument.fromJson('map:1', { ...buildMapJson(), width: 2, height: 1, data });

      // Act.
      const kind = unusedGroundKind(map);

      // Assert.
      expect(kind)
        .toBe(18);
    });
  });

  describe('parityLook', () =>
  {
    it('draws the game look with the events asked for, and neither shadows nor lighting', () =>
    {
      // Arrange: a parity frame with its events, and one without.

      // Act.
      const looks = [ parityLook(true), parityLook(false) ];

      // Assert.
      expect(looks.map(look => look.layers))
        .toStrictEqual([
          { ...GAME_LOOK.layers, events: true, shadows: false, lighting: false },
          { ...GAME_LOOK.layers, events: false, shadows: false, lighting: false },
        ]);
    });

    it('draws it still, every light at full strength, as the game copy holds its lights steady', () =>
    {
      // Arrange: a dark frame, the one pass that draws lights, where the game look would animate.

      // Act.
      const look = parityLook(false, true);

      // Assert.
      expect([ GAME_LOOK.animate, look.animate ])
        .toStrictEqual([ true, false ]);
    });

    it('draws the lighting too when a dark frame asks for it, and still no shadows', () =>
    {
      // Arrange: a dark frame without its events, and one saying outright it wants no lighting.

      // Act.
      const looks = [ parityLook(false, true), parityLook(false, false) ];

      // Assert.
      expect(looks.map(look => look.layers))
        .toStrictEqual([
          { ...GAME_LOOK.layers, events: false, shadows: false, lighting: true },
          { ...GAME_LOOK.layers, events: false, shadows: false, lighting: false },
        ]);
    });
  });

  describe('parityLightingLayers', () =>
  {
    it('keeps only what the game itself shows of the lighting, leaving out every aid', () =>
    {
      // Arrange: the dark, the rings, and an aid saying outright it is not shown in the game.
      const layer = (id: `${string}.${string}`, shownInGame?: boolean): LightingLayerDefinition =>
        ({ id, title: id, shownInGame, create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }) });
      const layers = [ layer('lighting.dark', true), layer('lighting.rings'), layer('lighting.notes', false) ];

      // Act.
      const kept = parityLightingLayers(layers);

      // Assert.
      expect(kept.map(each => each.id))
        .toStrictEqual([ 'lighting.dark' ]);
    });
  });

  describe('ringsOverlay', () =>
  {
    it('draws two rings about the middle of every event, as heavy as sight rings', () =>
    {
      // Arrange: a map with events at 0, 0 and 2, 1, and a painter that records the circles.
      const map = MapDocument.fromJson('map:1', { ...buildMapJson(), events: [ null, createMapEvent(1, 0, 0), null, createMapEvent(3, 2, 1) ] });
      const circles: number[][] = [];
      const painter = { circle: (x: number, y: number, radius: number) => circles.push([ x, y, radius ]) } as unknown as OverlayPainter;

      // Act.
      ringsOverlay().draw(painter, { document: map, tileSize: 48, selection: [] });

      // Assert.
      expect(circles)
        .toStrictEqual([ [ 24, 24, 192 ], [ 24, 24, 288 ], [ 120, 72, 192 ], [ 120, 72, 288 ] ]);
    });
  });
});
