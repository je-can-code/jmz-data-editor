/**
 * @vitest-environment jsdom
 */
import type { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMapEvent } from '../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../src/mapEditor/core/model/MapDocument.ts';
import { ShownPages } from '../../../src/mapEditor/core/pageRule/ShownPages.ts';
import { GamePreview } from '../../../src/mapEditor/core/preview/GamePreview.ts';
import type { LightingLayerDefinition, LightingStage, ScreenTone } from '../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { GAME_LOOK } from '../../../src/mapEditor/core/renderer/MapRenderer.ts';
import type { WeatherLayerDefinition } from '../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { PixiMapRenderer } from '../../../src/mapEditor/render/PixiMapRenderer.ts';
import { EventLayer } from '../../../src/mapEditor/render/scene/EventLayer.ts';
import { LightingLayers } from '../../../src/mapEditor/render/scene/LightingLayers.ts';
import { WeatherLayers } from '../../../src/mapEditor/render/scene/WeatherLayers.ts';
import { buildMapJson } from '../support/fixtures.ts';

// the tone filter compiles a shader, which needs a GPU; a stand-in keeps the tone it is given and whether it was let go.
vi.mock('../../../src/mapEditor/render/scene/ToneFilter.ts', () =>
{
  /**
   * Stands in for the tone filter.
   */
  class ToneFilter
  {
    tone: ScreenTone;

    destroyed = false;

    constructor(tone: ScreenTone)
    {
      this.tone = tone;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  return { ToneFilter };
});

/*
 * Some of the pixi renderer's promises can be kept without a GPU. The selection draws over the pointer's marks, so an
 * event shows as selected while the pointer still rests on it after the click that picked it, rather than hidden under
 * the hover's outline on the very same tile. The wheel zooms about the pointer's own spot: Chromium reports a wheel turn
 * in whole pixels, up to two off the pointer at a device pixel ratio of 1.5, so zooming about the wheel's spot would
 * slide the map under a still pointer a little with every notch. A view mounted off screen makes no GPU context, which
 * is what lets a page without WebGL hold one.
 *
 * The markers of events that draw no picture sit over every event, the tiles above characters and the lighting, so
 * nothing of the game hides them, and under the dimming and the editor's other overlays; they show only while the
 * events do and the markers overlay is on, which keeps them out of anything drawn as the game would draw it.
 *
 * What the plugin modules light the map with draws inside the lighting layer, each module's drawing on a container of
 * its own, made once and let go with the renderer; the whole layer shows only while the layer visibility's lighting is
 * on, which is what the view's Lighting switch flips. Every change to the map is passed on to the lighting, tile edits
 * included, so the lighting itself decides which of them make its drawings draw again.
 *
 * Everything the game draws beneath its lighting (the black behind the map, the parallax, the tiles and the events) is
 * held in one container, as the engine's base sprite holds it, and a tone the lighting casts, such as the sky's colour
 * at the clock's hour, is cast over that container alone, never over the lighting or the editor's own overlays. It shows
 * only while the lighting does, and a tone of zeroes casts none, so a map in plain daylight is filtered by nothing. The
 * filter is made once, the first time a tone shows, takes each tone cast after, and goes with the renderer.
 */
describe('PixiMapRenderer', () =>
{
  const built: PixiMapRenderer[] = [];

  afterEach(() =>
  {
    built.splice(0).forEach(renderer => renderer.destroy());
    document.body.innerHTML = '';
  });

  it('draws the selection over the ghosts and the pointer\'s marks, under only the hover\'s words', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const { slots } = renderer;
    const world = slots.selection.parent as Container;

    // Act: the world's top four layers, bottom first.
    const top = world.children.slice(-4);

    // Assert.
    expect(top)
      .toStrictEqual([ slots.ghosts, slots.pointer, slots.selection, slots.pointerLabel ]);
  });

  it('draws the markers over the lighting and every event, under the dimming and the editor\'s other overlays', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const { slots } = renderer;
    const world = slots.markers.parent as Container;

    // Act: the three layers from the lighting up, and what the markers' slot holds.
    const at = world.children.indexOf(slots.lighting);
    const layers = world.children.slice(at, at + 3);

    // Assert: the slot holds the event layer's markers, one group.
    expect([ layers, slots.markers.children.length ])
      .toStrictEqual([ [ slots.lighting, slots.markers, slots.dim ], 1 ]);
  });

  it('shows the markers only while the events show and the markers overlay is on', () =>
  {
    // Arrange: the event layer's markers, inside their slot.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const [ markers ] = renderer.slots.markers.children;
    const shown: boolean[] = [];

    // Act: the overlay on with the events, the overlay off, then the overlay on with the events hidden.
    renderer.setOverlays({ enabled: new Set([ 'markers' ]), definitions: [] });
    shown.push(markers.visible);
    renderer.setOverlays({ enabled: new Set([ 'grid' ]), definitions: [] });
    shown.push(markers.visible);
    renderer.setOverlays({ enabled: new Set([ 'markers' ]), definitions: [] });
    renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, events: false } });
    shown.push(markers.visible);

    // Assert.
    expect(shown)
      .toStrictEqual([ true, false, false ]);
  });

  it('makes each module\'s lighting on a container of its own inside the lighting layer, and lets it go with the renderer', () =>
  {
    // Arrange: a lighting layer whose drawing notes where it was made and when it is let go.
    const renderer = new PixiMapRenderer();
    const stages: LightingStage[] = [];
    const destroyed: string[] = [];
    const rings: LightingLayerDefinition = {
      id: 'lighting.rings',
      title: 'Light rings',
      create: stage =>
      {
        stages.push(stage);
        return { draw: () => undefined, tick: () => false, destroy: () => destroyed.push('rings') };
      },
    };

    // Act.
    renderer.setLightingLayers([ rings ]);
    const children = [ ...renderer.lightingLayer.children ];
    renderer.destroy();

    // Assert.
    expect([ children, stages.map(stage => stage.tileSize), destroyed ])
      .toStrictEqual([ [ stages[0].layer ], [ 48 ], [ 'rings' ] ]);
  });

  it('shows the lighting layer only while the layer visibility\'s lighting is on', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const shown: boolean[] = [];

    // Act: the game look, then lighting off, then on again.
    shown.push(renderer.lightingLayer.visible);
    renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, lighting: false } });
    shown.push(renderer.lightingLayer.visible);
    renderer.setLayerVisibility(GAME_LOOK);
    shown.push(renderer.lightingLayer.visible);

    // Assert.
    expect(shown)
      .toStrictEqual([ true, false, true ]);
  });

  it('passes every change to its map on to the lighting, a tile edit as well as an event edit', () =>
  {
    // Arrange: a renderer holding a map, and an ear on what its lighting hears.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const map = MapDocument.fromJson('map:1', buildMapJson());
    renderer.setDocument(map);
    const hear = vi.spyOn(LightingLayers.prototype, 'hear');

    // Act: the door renamed, then a tile painted.
    map.apply(map.setPatch([ 'events', 1, 'name' ], 'Gate'));
    map.apply(map.tilesPatch([ [ 0, 99 ] ]));
    const heard = hear.mock.calls.map(([ effect ]) => effect);
    hear.mockRestore();

    // Assert.
    expect(heard)
      .toStrictEqual([ { kind: 'event', id: 1 }, { kind: 'tiles', indices: [ 0 ] } ]);
  });

  it('holds what the game draws in one container beneath the lighting, and nothing of the editor\'s in it', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const { slots } = renderer;
    const world = slots.game.parent as Container;

    // Act: the game's container's first three layers and how many it holds, and the world's first three.
    const game = [ slots.game.children.slice(0, 3), slots.game.children.length ];
    const bottom = world.children.slice(0, 3);

    // Assert: the black, the parallax and the lower tiles first, then the three event groups around the upper tiles,
    // then the weather's clip and the weather.
    expect([ game, bottom, slots.game.children.includes(slots.markers), slots.game.children.includes(slots.upperTiles) ])
      .toStrictEqual([ [ [ slots.backdrop, slots.parallax, slots.lowerTiles ], 9 ], [ slots.game, slots.lighting, slots.markers ], false, true ]);
  });

  describe('weather', () =>
  {
    /*
     * J-Weather appends its plane to the spriteset's base sprite after the tilemap, and J-Lighting slots its mask into
     * the spriteset just above the weather: so the game's weather is over every tile and character, coloured by the
     * screen's tone the base sprite carries, and under the dark. The editor holds its weather in the same place: last in
     * what the game tones, under the lighting, and clipped to the map, so none of it falls on the editor around the map.
     * The layer shows only while the layer visibility's weather is on, which is what the view's Weather switch flips, and
     * every change to the map is passed on to it, so it decides which edits make its drawings draw again.
     */

    it('draws the weather last in what the game tones, over the events above characters, and under the lighting', () =>
    {
      // Arrange.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const { slots } = renderer;
      const world = slots.game.parent as Container;

      // Act: the game's container's last two layers, how far past the upper tiles they start (the events above
      // characters sit between), and where the lighting sits.
      const { children } = slots.game;
      const top = children.slice(-2);
      const pastUpperTiles = children.indexOf(slots.weatherClip) - children.indexOf(slots.upperTiles);
      const lightingAboveGame = world.children.indexOf(slots.lighting) > world.children.indexOf(slots.game);

      // Assert: the clip rides beside the weather it masks once there is weather, after the events above characters, and
      // is never drawn itself.
      expect([ top, pastUpperTiles, lightingAboveGame, slots.weatherClip.includeInBuild, renderer.weatherLayer ])
        .toStrictEqual([ [ slots.weatherClip, slots.weather ], 2, true, false, slots.weather ]);
    });

    it('shows the weather layer only while the layer visibility\'s weather is on', () =>
    {
      // Arrange.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const shown: boolean[] = [];

      // Act: the game look, then the weather off, then on again.
      shown.push(renderer.weatherLayer.visible);
      renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, weather: false } });
      shown.push(renderer.weatherLayer.visible);
      renderer.setLayerVisibility(GAME_LOOK);
      shown.push(renderer.weatherLayer.visible);

      // Assert.
      expect(shown)
        .toStrictEqual([ true, false, true ]);
    });

    it('hands the modules\' weather layers to its weather, which makes nothing until a frame, and lets it go with the renderer', () =>
    {
      // Arrange: a weather layer that draws on every map, and an ear on what the weather is handed.
      const renderer = new PixiMapRenderer();
      const made: string[] = [];
      const rain: WeatherLayerDefinition = {
        id: 'weather.map',
        title: 'Weather',
        drawsOn: () => true,
        create: () =>
        {
          made.push('made');
          return { draw: () => undefined, tick: () => false, destroy: () => undefined };
        },
      };
      const handed = vi.spyOn(WeatherLayers.prototype, 'setDefinitions');

      // Act.
      renderer.setWeatherLayers([ rain ]);
      const { weatherLayer, slots } = renderer;
      const children = weatherLayer.children.length;
      renderer.destroy();
      const calls = handed.mock.calls.map(([ definitions ]) => definitions);
      handed.mockRestore();

      // Assert: handed over as given, nothing made without a frame, and the layer and its clip let go.
      expect([ calls, made, children, weatherLayer.destroyed, slots.weatherClip.destroyed ])
        .toStrictEqual([ [ [ rain ] ], [], 0, true, true ]);
    });

    it('passes every change to its map on to the weather, a tile edit as well as a change to the note', () =>
    {
      // Arrange: a renderer holding a map, and an ear on what its weather hears.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const map = MapDocument.fromJson('map:1', buildMapJson());
      renderer.setDocument(map);
      const hear = vi.spyOn(WeatherLayers.prototype, 'hear');

      // Act: the note rewritten, then a tile painted.
      map.apply(map.setPatch([ 'note' ], '<weather:rain>'));
      map.apply(map.tilesPatch([ [ 0, 99 ] ]));
      const heard = hear.mock.calls.map(([ effect ]) => effect);
      hear.mockRestore();

      // Assert.
      expect(heard)
        .toStrictEqual([ { kind: 'overlays' }, { kind: 'tiles', indices: [ 0 ] } ]);
    });

    it('holds what the sky is doing, none until told, and asks the weather to draw again once told', () =>
    {
      // Arrange: a renderer, and an ear on the weather being asked to draw.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const before = renderer.weatherSky;
      const stale = vi.spyOn(WeatherLayers.prototype, 'markStale');

      // Act.
      renderer.setWeatherSky({ preset: 'rain', intensity: 'heavy' });
      const calls = stale.mock.calls.length;
      stale.mockRestore();

      // Assert.
      expect([ before, renderer.weatherSky, calls ])
        .toStrictEqual([ null, { preset: 'rain', intensity: 'heavy' }, 1 ]);
    });

    it('starts the weather over when asked, and says what the weather shows, nothing while it holds no drawing', () =>
    {
      // Arrange: a renderer, and an ear on the weather being started over.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const reset = vi.spyOn(WeatherLayers.prototype, 'reset');

      // Act.
      renderer.resetWeather();
      const calls = reset.mock.calls.length;
      reset.mockRestore();

      // Assert.
      expect([ calls, renderer.weatherDescriptions() ])
        .toStrictEqual([ 1, [] ]);
    });
  });

  it('reads the sky at midnight until told the time of day, and at the time it was told after', () =>
  {
    // Arrange.
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    const before = renderer.timeOfDay;

    // Act: 22:00.
    renderer.setTimeOfDay(1320);

    // Assert.
    expect([ before, renderer.timeOfDay ])
      .toStrictEqual([ 0, 1320 ]);
  });

  describe('pages', () =>
  {
    /*
     * Each event shows the page the page rule handed over picks at the clock's time and season and the preview's
     * switches and variables. Moving the clock judges again the events whose pages ask something of it, moving its season
     * the events whose pages read the date, and changing the preview the events whose pages read what it changed; only
     * those turned to another page are drawn again, the lighting asked to draw with them, and when none turned, nothing
     * is asked of anything. A new rule draws every event and the lighting
     * again. An event that changes, or the list itself, is judged afresh. Events no page holds for show, faded, only
     * while the markers overlay is on, so a map drawn as the game draws it shows nothing of them.
     */
    afterEach(() =>
    {
      vi.restoreAllMocks();
    });

    it('draws again only the events the clock turned to another page, asking the lighting to draw, and nothing when it turned none', () =>
    {
      // Arrange: a clock move turning events 4 and 9, then one turning none.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      vi.spyOn(ShownPages.prototype, 'setTime').mockReturnValueOnce([ 4, 9 ])
        .mockReturnValueOnce([]);
      const marked = vi.spyOn(EventLayer.prototype, 'markChanged');
      const stale = vi.spyOn(LightingLayers.prototype, 'markStale');

      // Act: 18:00, then 19:00.
      renderer.setTimeOfDay(1080);
      const turning = [ marked.mock.calls.map(([ id ]) => id), stale.mock.calls.length ];
      renderer.setTimeOfDay(1140);

      // Assert.
      expect([ turning, marked.mock.calls.length, stale.mock.calls.length, renderer.timeOfDay ])
        .toStrictEqual([ [ [ 4, 9 ], 1 ], 2, 1, 1140 ]);
    });

    it('draws again only the events the season turned to another page, asking the lighting to draw, and nothing when it turned none', () =>
    {
      // Arrange: a season turning event 7, then one turning none.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      vi.spyOn(ShownPages.prototype, 'setSeason').mockReturnValueOnce([ 7 ])
        .mockReturnValueOnce([]);
      const marked = vi.spyOn(EventLayer.prototype, 'markChanged');
      const stale = vi.spyOn(LightingLayers.prototype, 'markStale');

      // Act: Summer, then Autumn.
      renderer.setSeason(1);
      const turning = [ marked.mock.calls.map(([ id ]) => id), stale.mock.calls.length ];
      renderer.setSeason(2);

      // Assert.
      expect([ turning, marked.mock.calls.length, stale.mock.calls.length ])
        .toStrictEqual([ [ [ 7 ], 1 ], 1, 1 ]);
    });

    it('judges events in the season it was last handed, the one the game starts in until then', () =>
    {
      // Arrange: a renderer as a map view makes it.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const before = renderer.season;

      // Act: Summer.
      renderer.setSeason(1);

      // Assert.
      expect([ before, renderer.season ])
        .toStrictEqual([ null, 1 ]);
    });

    it('draws again only the events the preview turned to another page, asking the lighting to draw, and nothing when it turned none', () =>
    {
      // Arrange: a preview turning events 3 and 12, then one turning none.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      vi.spyOn(ShownPages.prototype, 'setPreview').mockReturnValueOnce([ 3, 12 ])
        .mockReturnValueOnce([]);
      const marked = vi.spyOn(EventLayer.prototype, 'markChanged');
      const stale = vi.spyOn(LightingLayers.prototype, 'markStale');

      // Act: switch 147 on, then variable 74 at 99 as well.
      const on = GamePreview.FRESH.withSwitch(147, true);
      renderer.setPreview(on);
      const turning = [ marked.mock.calls.map(([ id ]) => id), stale.mock.calls.length ];
      renderer.setPreview(on.withVariable(74, 99));

      // Assert.
      expect([ turning, marked.mock.calls.length, stale.mock.calls.length ])
        .toStrictEqual([ [ [ 3, 12 ], 1 ], 2, 1 ]);
    });

    it('judges events at the preview it was last handed, a fresh save until then', () =>
    {
      // Arrange: a renderer as a map view makes it.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const before = renderer.preview;
      const on = GamePreview.FRESH.withSwitch(147, true);

      // Act: switch 147 on.
      renderer.setPreview(on);

      // Assert.
      expect([ before, renderer.preview ])
        .toStrictEqual([ GamePreview.FRESH, on ]);
    });

    it('picks every event\'s page afresh by a new page rule, drawing every event and the lighting again', () =>
    {
      // Arrange: the rule a fresh save with nobody in the party gives, with no plugin's conditions.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const rule = { save: { party: [] }, conditions: [] };
      const ruled = vi.spyOn(ShownPages.prototype, 'setRule');
      const marked = vi.spyOn(EventLayer.prototype, 'markChanged');
      const stale = vi.spyOn(LightingLayers.prototype, 'markStale');

      // Act.
      renderer.setPageRule(rule);

      // Assert.
      expect([ ruled.mock.calls, marked.mock.calls, stale.mock.calls.length ])
        .toStrictEqual([ [ [ rule ] ], [ [ null ] ], 1 ]);
    });

    it('judges an event afresh once it changes, and every event once the list itself changes', () =>
    {
      // Arrange: a renderer holding a map, watching what it forgets.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const map = MapDocument.fromJson('map:1', buildMapJson());
      renderer.setDocument(map);
      const forgot = vi.spyOn(ShownPages.prototype, 'forget');

      // Act: the door's first page given a condition, then the list grown by an event, then a tile painted.
      map.apply(map.setPatch([ 'events', 1, 'pages', 0, 'conditions', 'switch1Valid' ], true));
      map.apply(map.placeEventPatch({ ...createMapEvent(9, 1, 1) }));
      map.apply(map.tilesPatch([ [ 0, 99 ] ]));

      // Assert.
      expect(forgot.mock.calls)
        .toStrictEqual([ [ 1 ], [ null ] ]);
    });

    it('shows events no page holds for only while the markers overlay is on', () =>
    {
      // Arrange.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const shown = vi.spyOn(EventLayer.prototype, 'setFadedShown');

      // Act: the markers on, then off, as a map drawn as the game draws it has them.
      renderer.setOverlays({ enabled: new Set([ 'markers' ]), definitions: [] });
      renderer.setOverlays({ enabled: new Set(), definitions: [] });

      // Assert.
      expect(shown.mock.calls)
        .toStrictEqual([ [ true ], [ false ] ]);
    });

    it('counts the events drawn faded and the events following the clock', () =>
    {
      // Arrange: three events drawn faded, and two whose pages ask something of the clock.
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      vi.spyOn(EventLayer.prototype, 'fadedCount', 'get').mockReturnValue(3);
      vi.spyOn(ShownPages.prototype, 'followingClock', 'get').mockReturnValue(2);

      // Act.
      const { fadedEvents, eventsFollowingClock } = renderer.stats();

      // Assert.
      expect([ fadedEvents, eventsFollowingClock ])
        .toStrictEqual([ 3, 2 ]);
    });
  });

  describe('tone', () =>
  {
    /**
     * Night halfway to Moontide, and the evening's warm cast.
     */
    const NIGHT: ScreenTone = [ -32, -16, 37, 133 ];
    const EVENING: ScreenTone = [ 26, 0, -34, 22 ];

    /**
     * A renderer whose lighting holds one drawing casting nothing of its own accord, and that drawing's stage.
     * @returns {{ renderer: PixiMapRenderer, stage: LightingStage }} The renderer and the stage tones are cast through.
     */
    const rendererWithSky = () =>
    {
      const renderer = new PixiMapRenderer();
      built.push(renderer);
      const stages: LightingStage[] = [];
      renderer.setLightingLayers([ {
        id: 'lighting.sky',
        title: 'Sky',
        create: stage =>
        {
          stages.push(stage);
          return { draw: () => undefined, tick: () => false, destroy: () => stage.castTone(null) };
        },
      } ]);
      const [ stage ] = stages;
      return { renderer, stage };
    };

    /**
     * Reads the tones of the filters on what the game tones.
     * @param {PixiMapRenderer} renderer The renderer.
     * @returns {ScreenTone[]} Each filter's tone.
     */
    const tonesOn = (renderer: PixiMapRenderer): ScreenTone[] =>
    {
      const filters = (renderer.slots.game.filters ?? []) as unknown as { tone: ScreenTone }[];
      return filters.map(filter => filter.tone);
    };

    it('casts the lighting\'s tone over what the game tones while the lighting shows', () =>
    {
      // Arrange.
      const { renderer, stage } = rendererWithSky();

      // Act.
      stage.castTone(NIGHT);

      // Assert.
      expect([ tonesOn(renderer), renderer.tone, renderer.lightingLayer.filters ?? [] ])
        .toStrictEqual([ [ NIGHT ], NIGHT, [] ]);
    });

    it('casts nothing for a tone of zeroes, or for none', () =>
    {
      // Arrange: the night cast, so a filter was made.
      const { renderer, stage } = rendererWithSky();
      stage.castTone(NIGHT);
      const seen: ScreenTone[][] = [];

      // Act.
      stage.castTone([ 0, 0, 0, 0 ]);
      seen.push(tonesOn(renderer));
      stage.castTone(NIGHT);
      stage.castTone(null);
      seen.push(tonesOn(renderer));

      // Assert.
      expect(seen)
        .toStrictEqual([ [], [] ]);
    });

    it('takes the tone off with the Lighting switch, and casts it again, with the same filter, once it is back on', () =>
    {
      // Arrange: the night cast.
      const { renderer, stage } = rendererWithSky();
      stage.castTone(NIGHT);
      const [ filter ] = renderer.slots.game.filters;

      // Act.
      renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, lighting: false } });
      const off = tonesOn(renderer);
      renderer.setLayerVisibility(GAME_LOOK);

      // Assert.
      expect([ off, tonesOn(renderer), renderer.slots.game.filters[0] === filter ])
        .toStrictEqual([ [], [ NIGHT ], true ]);
    });

    it('waits for the Lighting switch before casting a tone cast while it was off', () =>
    {
      // Arrange: the Lighting switch off.
      const { renderer, stage } = rendererWithSky();
      renderer.setLayerVisibility({ ...GAME_LOOK, layers: { ...GAME_LOOK.layers, lighting: false } });

      // Act.
      stage.castTone(EVENING);
      const off = tonesOn(renderer);
      renderer.setLayerVisibility(GAME_LOOK);

      // Assert.
      expect([ off, tonesOn(renderer) ])
        .toStrictEqual([ [], [ EVENING ] ]);
    });

    it('gives the one filter each new tone cast, rather than making another', () =>
    {
      // Arrange: the evening cast.
      const { renderer, stage } = rendererWithSky();
      stage.castTone(EVENING);
      const [ filter ] = renderer.slots.game.filters;

      // Act.
      stage.castTone(NIGHT);

      // Assert.
      expect([ tonesOn(renderer), renderer.slots.game.filters.length, renderer.slots.game.filters[0] === filter ])
        .toStrictEqual([ [ NIGHT ], 1, true ]);
    });

    it('lets the filter go with the renderer', () =>
    {
      // Arrange: the night cast.
      const { renderer, stage } = rendererWithSky();
      stage.castTone(NIGHT);
      const [ filter ] = renderer.slots.game.filters as unknown as { destroyed: boolean }[];

      // Act.
      renderer.destroy();

      // Assert.
      expect(filter.destroyed)
        .toBe(true);
    });
  });

  it('zooms about the pointer\'s own spot when the wheel reports a whole-pixel spot beside it', () =>
  {
    // Arrange: a view mounted off screen at zoom 1 over a map; the pointer moved to 100.67, 50.33, and the wheel turned
    // one notch in there reports 100, 49, as Chromium cuts it at 1.5.
    const host = document.createElement('div');
    document.body.appendChild(host);
    const renderer = new PixiMapRenderer();
    built.push(renderer);
    renderer.setVisible(false);
    renderer.mount(host);
    renderer.setDocument(MapDocument.fromJson('map:1', buildMapJson()));
    renderer.setCamera({ x: 0, y: 0, zoom: 1 });
    const canvas = renderer.canvas as HTMLCanvasElement;
    const move = new MouseEvent('pointermove', { bubbles: true });
    Object.defineProperties(move, { offsetX: { value: 100.66666666666667 }, offsetY: { value: 50.333333333333336 } });
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
    Object.defineProperties(wheel, { offsetX: { value: 100 }, offsetY: { value: 49 } });

    // Act.
    canvas.dispatchEvent(move);
    canvas.dispatchEvent(wheel);

    // Assert: the world point under 100.67, 50.33 is still 100.67, 50.33 at the new zoom.
    const { x, y, zoom } = renderer.camera;
    expect([ x + 100.66666666666667 / zoom, y + 50.333333333333336 / zoom, zoom ].map(value => Number(value.toFixed(6))))
      .toStrictEqual([ 100.666667, 50.333333, 1.161834 ]);
  });
});
