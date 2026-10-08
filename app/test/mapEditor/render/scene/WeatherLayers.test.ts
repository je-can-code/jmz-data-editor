import type { Container, WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { WeatherFrame, WeatherLayerDefinition, WeatherStage } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import type { ChangeEffect } from '../../../../src/mapEditor/render/documentChanges.ts';
import { WeatherLayers } from '../../../../src/mapEditor/render/scene/WeatherLayers.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * What plugin modules draw into a view's weather layer: one drawing per weather layer they contribute that draws on the
 * map shown, each in a container of its own, in the order they were contributed, inside the one container the view's
 * Weather switch shows and hides, clipped to the map's rectangle.
 *
 * Weather must cost a map that has none nothing, since every map the author opens pays for whatever is done here. So a
 * drawing is made only once its module says the weather layer draws on the map, never for a map it draws nothing on, and
 * let go again once the map shown no longer has its weather; the layer holding no drawing is left out of every frame,
 * clip and all, and asks for no frame at all; and the clip is drawn only once there is weather to clip, and again only
 * for a map of another size. Which weather layers draw is asked only when due, never every frame, and every drawing can
 * be let go at once, so the weather starts over as on arriving at the map.
 *
 * The drawings draw only when due, and once however many changes made them due: after the map opens, the context comes
 * back or the sky changes, after a weather layer is handed over without a drawing, and after a change to anything but
 * the tiles. A tile change is what a brush stroke makes, many times a second, and no module's weather reads tiles, so it
 * never makes them due. While the layer is hidden they do not draw, and they catch up once it shows. In every frame they
 * are not due, each is handed the clock to move on to instead, and the frame has something new to show only when one of
 * them moved; while the layer is hidden nothing is handed the clock at all, so the weather holds where it was. A module
 * that throws, answering or drawing or moving on, is reported on its own and never stops the others; a drawing that
 * throws is ticked no more until it next draws. Each drawing can say what it shows, for the parity check, or nothing.
 */

/**
 * A weather layer whose drawing writes down what happens to it, the stage each drawing was made on, and whether it
 * draws on the map, which a test may change.
 * @param {string} id The weather layer's id.
 * @param {string[]} log Where everything is written.
 * @param {boolean} moves Whether its drawing changes what it shows as the clock moves.
 * @returns {{ definition: WeatherLayerDefinition, stages: WeatherStage[], weather: { draws: boolean, asked: number } }}
 * The weather layer, its stages, and whether it draws on the map with how often it was asked.
 */
const loggedLayer = (id: `${string}.${string}`, log: string[], moves = false) =>
{
  const stages: WeatherStage[] = [];
  const weather = { draws: true, asked: 0 };
  const definition: WeatherLayerDefinition = {
    id,
    title: id,
    drawsOn: () =>
    {
      weather.asked += 1;
      return weather.draws;
    },
    create: stage =>
    {
      stages.push(stage);
      log.push(`${id} made`);
      return {
        draw: (given: WeatherFrame) => log.push(`${id} drew map ${given.document.mapId}`),
        tick: (given: WeatherFrame) =>
        {
          log.push(`${id} moved on to frame ${given.clock.frames}`);
          return moves;
        },
        describe: () => ({ id }),
        destroy: () => log.push(`${id} let go`),
      };
    },
  };
  return { definition, stages, weather };
};

/**
 * What a frame hands the drawings: map 7, three tiles by two unless another is given, a renderer nothing here draws
 * with, the view's first context, the view's clock, a view showing the whole map, no pictures and no sky.
 * @param {number} frames The clock's frame.
 * @param {MapDocument} document The map.
 * @returns {WeatherFrame} The frame.
 */
const frame = (frames = 0, document = MapDocument.fromJson('map:7', buildMapJson())): WeatherFrame => ({
  document,
  renderer: {} as WebGLRenderer,
  context: 1,
  clock: { frames, animating: true },
  view: WHOLE_VIEW,
  images: null,
  sky: null,
});

/**
 * A view's weather holding the given weather layers, drawn once so nothing is due.
 * @param {WeatherLayerDefinition[]} definitions The weather layers.
 * @returns {WeatherLayers} The weather.
 */
const drawnWith = (definitions: WeatherLayerDefinition[]): WeatherLayers =>
{
  const weather = new WeatherLayers(48);
  weather.setDefinitions(definitions);
  weather.draw(frame());
  return weather;
};

describe('WeatherLayers', () =>
{
  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('makes no drawing for a weather layer handed over until a frame, and none in it for one drawing nothing on the map', () =>
  {
    // Arrange: a weather layer that draws nothing on the map.
    const log: string[] = [];
    const dry = loggedLayer('weather.map', log);
    dry.weather.draws = false;
    const weather = new WeatherLayers(48);

    // Act: handed over, then a frame.
    weather.setDefinitions([ dry.definition ]);
    const madeBeforeFrame = log.length;
    const drew = weather.draw(frame());

    // Assert: asked once, nothing made, nothing new to show, and the layer left out of the frames.
    expect([ madeBeforeFrame, dry.weather.asked, log, drew, weather.count, weather.layer.renderable ])
      .toStrictEqual([ 0, 1, [], false, 0, false ]);
  });

  it('makes a drawing for each weather layer drawing on the map, on a container of its own, in the order they come', () =>
  {
    // Arrange.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ map.definition, sky.definition ]);

    // Act.
    const drew = weather.draw(frame());

    // Assert: each stage's container is the layer's child in that order, at the tile size given, and the layer drawn.
    const [ mapStage ] = map.stages;
    const [ skyStage ] = sky.stages;
    expect([ drew, log, weather.layer.children, [ mapStage.tileSize, skyStage.tileSize ], weather.count, weather.layer.renderable ])
      .toStrictEqual([
        true,
        [ 'weather.map made', 'weather.sky made', 'weather.map drew map 7', 'weather.sky drew map 7' ],
        [ mapStage.layer, skyStage.layer ],
        [ 48, 48 ],
        2,
        true,
      ]);
  });

  it('asks which weather layers draw on the map only when due, never in a frame between', () =>
  {
    // Arrange: one weather layer drawing on the map, drawn.
    const map = loggedLayer('weather.map', []);
    const weather = drawnWith([ map.definition ]);

    // Act: two frames between draws.
    weather.draw(frame(1));
    weather.draw(frame(2));

    // Assert: asked only for the first frame.
    expect(map.weather.asked)
      .toBe(1);
  });

  it('lets a drawing go once the map no longer has its weather, and leaves the layer out of the frames', () =>
  {
    // Arrange: a drawing made, then its weather gone from the map, as when the tag is taken out of the note.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const weather = drawnWith([ map.definition ]);
    const [ stage ] = map.stages;
    map.weather.draws = false;
    weather.hear({ kind: 'overlays' });

    // Act.
    const drew = weather.draw(frame(1));

    // Assert: let go, container and all, with something new to show, as the weather left the view.
    expect([ drew, log.slice(2), stage.layer.destroyed, weather.count, weather.layer.renderable ])
      .toStrictEqual([ true, [ 'weather.map let go' ], true, 0, false ]);
  });

  it('keeps a drawing whose weather layer comes again, and lets go of one that does not, container and all', () =>
  {
    // Arrange: two drawings, made.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = drawnWith([ map.definition, sky.definition ]);
    const [ mapStage ] = map.stages;

    // Act.
    const lessShown = weather.setDefinitions([ sky.definition ]);

    // Assert: told the view shows less, the map's drawing let go and the sky's kept.
    expect([ lessShown, log.slice(4), weather.layer.children, mapStage.layer.destroyed ])
      .toStrictEqual([ true, [ 'weather.map let go' ], [ sky.stages[0].layer ], true ]);
  });

  it('says nothing went when every drawing is kept', () =>
  {
    // Arrange.
    const map = loggedLayer('weather.map', []);
    const weather = drawnWith([ map.definition ]);

    // Act.
    const lessShown = weather.setDefinitions([ map.definition ]);

    // Assert.
    expect([ lessShown, weather.count ])
      .toStrictEqual([ false, 1 ]);
  });

  it('orders the containers as the weather layers come', () =>
  {
    // Arrange.
    const map = loggedLayer('weather.map', []);
    const sky = loggedLayer('weather.sky', []);
    const weather = drawnWith([ map.definition, sky.definition ]);

    // Act.
    weather.setDefinitions([ sky.definition, map.definition ]);

    // Assert.
    expect(weather.layer.children)
      .toStrictEqual([ sky.stages[0].layer, map.stages[0].layer ]);
  });

  it('lets every drawing go when the weather starts over, and makes those drawing on the map afresh in the next frame', () =>
  {
    // Arrange: two drawings, drawn.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = drawnWith([ map.definition, sky.definition ]);
    const before = log.length;

    // Act.
    weather.reset();
    const countAfterReset = weather.count;
    const drew = weather.draw(frame());

    // Assert: both let go at once, both made again on new containers in order, then drawn.
    expect([ countAfterReset, log.slice(before), drew, weather.layer.children, map.stages[0].layer.destroyed ])
      .toStrictEqual([
        0,
        [ 'weather.map let go', 'weather.sky let go', 'weather.map made', 'weather.sky made', 'weather.map drew map 7', 'weather.sky drew map 7' ],
        true,
        [ map.stages[1].layer, sky.stages[1].layer ],
        true,
      ]);
  });

  it('draws every drawing once when due, with the frame, and not again until something makes it due', () =>
  {
    // Arrange.
    const log: string[] = [];
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ loggedLayer('weather.map', log).definition ]);

    // Act.
    const drew = [ weather.draw(frame()), weather.draw(frame(1)) ];

    // Assert: drawn in the first frame, and only moved on in the second.
    expect([ drew, log.slice(1) ])
      .toStrictEqual([ [ true, false ], [ 'weather.map drew map 7', 'weather.map moved on to frame 1' ] ]);
  });

  it('hands every drawing the clock between draws, and has something new to show when any of them moved', () =>
  {
    // Arrange: a still drawing before one that moves with time, both drawn.
    const log: string[] = [];
    const weather = drawnWith([ loggedLayer('weather.sky', log).definition, loggedLayer('weather.map', log, true).definition ]);

    // Act.
    const moved = weather.draw(frame(5));

    // Assert.
    expect([ moved, log.slice(-2) ])
      .toStrictEqual([ true, [ 'weather.sky moved on to frame 5', 'weather.map moved on to frame 5' ] ]);
  });

  it('hands out no clock while the layer is hidden, as with the Weather switch off', () =>
  {
    // Arrange: a drawing that moves with time, drawn, then the layer hidden.
    const log: string[] = [];
    const weather = drawnWith([ loggedLayer('weather.map', log, true).definition ]);
    const before = log.length;
    weather.layer.visible = false;

    // Act.
    const moved = [ weather.draw(frame(1)), weather.draw(frame(2)) ];

    // Assert.
    expect([ moved, log.length - before ])
      .toStrictEqual([ [ false, false ], 0 ]);
  });

  it('is not made due by a change to the tiles alone', () =>
  {
    // Arrange: a brush step's change.
    const map = loggedLayer('weather.map', []);
    const weather = drawnWith([ map.definition ]);
    const step: ChangeEffect = { kind: 'tiles', indices: [ 4, 5 ] };

    // Act.
    weather.hear(step);
    const drew = weather.draw(frame());

    // Assert: nothing drawn, and the map not asked about again.
    expect([ drew, map.weather.asked ])
      .toStrictEqual([ false, 1 ]);
  });

  it('is made due by a change to anything but the tiles', () =>
  {
    // Arrange: an event changed, the event list changed, the map rebuilt, and a property such as the note changed.
    const effects: ChangeEffect[] = [ { kind: 'event', id: 3 }, { kind: 'events' }, { kind: 'rebuild' }, { kind: 'overlays' } ];
    const layers = effects.map(() => drawnWith([ loggedLayer('weather.map', []).definition ]));

    // Act.
    layers.forEach((weather, index) => weather.hear(effects[index]));

    // Assert.
    expect(layers.map(weather => weather.draw(frame())))
      .toStrictEqual([ true, true, true, true ]);
  });

  it('is made due by being told so, as for a map just opened, a context given back or a sky changed', () =>
  {
    // Arrange.
    const map = loggedLayer('weather.map', []);
    const weather = drawnWith([ map.definition ]);

    // Act.
    weather.markStale();
    const drew = weather.draw(frame());

    // Assert: drawn, the map asked about again.
    expect([ drew, map.weather.asked ])
      .toStrictEqual([ true, 2 ]);
  });

  it('is made due by a weather layer handed over without a drawing, and not by drawings kept as they were', () =>
  {
    // Arrange.
    const map = loggedLayer('weather.map', []).definition;
    const kept = drawnWith([ map ]);
    const grown = drawnWith([ map ]);

    // Act.
    kept.setDefinitions([ map ]);
    grown.setDefinitions([ map, loggedLayer('weather.sky', []).definition ]);

    // Assert.
    expect([ kept.draw(frame()), grown.draw(frame()) ])
      .toStrictEqual([ false, true ]);
  });

  it('draws nothing while the layer is hidden, and catches up once it shows', () =>
  {
    // Arrange: an edit made while the layer was hidden.
    const log: string[] = [];
    const weather = drawnWith([ loggedLayer('weather.map', log).definition ]);
    weather.layer.visible = false;
    weather.hear({ kind: 'overlays' });

    // Act.
    const hidden = weather.draw(frame());
    weather.layer.visible = true;
    const shown = weather.draw(frame());

    // Assert.
    expect([ hidden, shown, log.filter(line => line.includes('drew')).length ])
      .toStrictEqual([ false, true, 2 ]);
  });

  it('has nothing to draw while no module draws there', () =>
  {
    // Arrange.
    const weather = new WeatherLayers(48);

    // Act.
    const drew = weather.draw(frame());

    // Assert.
    expect(drew)
      .toBe(false);
  });

  it('wants the frame while it is due or holds a drawing, and not once it has found the map has no weather', () =>
  {
    // Arrange: a layer with nothing yet asked, one asked of a map without weather, one holding a drawing, and one hidden.
    const fresh = new WeatherLayers(48);
    const dry = loggedLayer('weather.map', []);
    dry.weather.draws = false;
    const without = drawnWith([ dry.definition ]);
    const holding = drawnWith([ loggedLayer('weather.map', []).definition ]);
    const hidden = drawnWith([ loggedLayer('weather.map', []).definition ]);

    // Act.
    hidden.layer.visible = false;

    // Assert.
    expect([ fresh.needsFrame, without.needsFrame, holding.needsFrame, hidden.needsFrame ])
      .toStrictEqual([ true, false, true, false ]);
  });

  it('clips the weather to the map\'s rectangle only once there is weather, the clip drawn again only for a map of another size', () =>
  {
    // Arrange: a weather layer, and a map five tiles by four beside the three by two every frame shows by default.
    const weather = new WeatherLayers(48);
    const clears = vi.spyOn(weather.clip, 'clear');
    weather.setDefinitions([ loggedLayer('weather.map', []).definition ]);
    const bigger = MapDocument.fromJson('map:8', { ...buildMapJson(), width: 5, height: 4, data: Array.from({ length: 5 * 4 * 6 }, () => 0) });
    const emptyBefore = weather.clip.getLocalBounds().width;

    // Act: a frame, the same map again, then the bigger map, reading the clip's size after the first and the last.
    const sizeOf = () =>
    {
      const { width, height } = weather.clip.getLocalBounds();
      return [ width, height ];
    };
    weather.draw(frame());
    const small = sizeOf();
    weather.markStale();
    weather.draw(frame());
    weather.markStale();
    weather.draw(frame(0, bigger));
    const big = sizeOf();

    // Assert: nothing to clip before, then the map's rectangle in world pixels, drawn once per size, and the layer
    // clipped by it all along.
    expect([ emptyBefore, small, big, clears.mock.calls.length, weather.layer.mask ])
      .toStrictEqual([ 0, [ 144, 96 ], [ 240, 192 ], 2, weather.clip ]);
  });

  it('reports a module whose answer throws on its own, makes no drawing for it, and still draws the others', () =>
  {
    // Arrange: a weather layer that cannot say whether it draws, before one that works.
    const log: string[] = [];
    const confused: WeatherLayerDefinition = {
      id: 'weather.confused',
      title: 'Confused',
      drawsOn: () =>
      {
        throw new Error('no idea');
      },
      create: () =>
      {
        log.push('confused made');
        return { draw: () => undefined, tick: () => false, destroy: () => undefined };
      },
    };
    const raised: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ confused, loggedLayer('weather.map', log).definition ]);

    // Act.
    const drew = weather.draw(frame());

    // Assert.
    expect([ drew, log, raised.length ])
      .toStrictEqual([ true, [ 'weather.map made', 'weather.map drew map 7' ], 1 ]);
    expect(() => raised[0]())
      .toThrow('no idea');
  });

  it('reports a drawing that throws on its own, still draws the others, and hands the failed one no clock until it draws', () =>
  {
    // Arrange: a drawing whose draws fail, before one that works.
    const log: string[] = [];
    let ticks = 0;
    const broken: WeatherLayerDefinition = {
      id: 'weather.broken',
      title: 'Broken',
      drawsOn: () => true,
      create: () => ({
        draw: () =>
        {
          throw new Error('no weather');
        },
        tick: () =>
        {
          ticks += 1;
          return false;
        },
        destroy: () => undefined,
      }),
    };
    const raised: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ broken, loggedLayer('weather.map', log).definition ]);

    // Act: the failed draw, then a frame after it.
    const drew = weather.draw(frame());
    weather.draw(frame(1));

    // Assert: the frame still drew, the working drawing with it and on after it, the broken one never ticked.
    expect([ drew, log, ticks, raised.length ])
      .toStrictEqual([ true, [ 'weather.map made', 'weather.map drew map 7', 'weather.map moved on to frame 1' ], 0, 1 ]);
    expect(() => raised[0]())
      .toThrow('no weather');
  });

  it('raises a drawing\'s failure to move on once, and leaves it still until it next draws', () =>
  {
    // Arrange: a drawing whose ticks fail, drawn.
    let attempts = 0;
    const stuck: WeatherLayerDefinition = {
      id: 'weather.stuck',
      title: 'Stuck',
      drawsOn: () => true,
      create: () => ({
        draw: () => undefined,
        tick: () =>
        {
          attempts += 1;
          throw new Error('cannot move');
        },
        destroy: () => undefined,
      }),
    };
    const raised: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
    const weather = drawnWith([ stuck ]);

    // Act: two frames, a draw, and a frame after it.
    weather.draw(frame(1));
    weather.draw(frame(2));
    weather.markStale();
    weather.draw(frame(3));
    weather.draw(frame(4));

    // Assert: tried in the first frame and again only once it drew.
    expect([ attempts, raised.length ])
      .toStrictEqual([ 2, 2 ]);
  });

  it('says what every drawing shows, in order, and nothing for one with nothing to say', () =>
  {
    // Arrange: a drawing that describes itself, and one that does not.
    const silent: WeatherLayerDefinition = {
      id: 'weather.silent',
      title: 'Silent',
      drawsOn: () => true,
      create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }),
    };
    const weather = drawnWith([ loggedLayer('weather.map', []).definition, silent ]);

    // Act.
    const described = weather.describe();

    // Assert.
    expect(described)
      .toStrictEqual([ { id: 'weather.map' }, null ]);
  });

  it('lets every drawing go, and the layer and its clip with them', () =>
  {
    // Arrange.
    const log: string[] = [];
    const weather = drawnWith([ loggedLayer('weather.map', log).definition, loggedLayer('weather.sky', log).definition ]);
    const { layer, clip } = weather;

    // Act.
    weather.destroy();

    // Assert.
    expect([ log.slice(4), weather.count, (layer as Container).destroyed, clip.destroyed ])
      .toStrictEqual([ [ 'weather.map let go', 'weather.sky let go' ], 0, true, true ]);
  });
});
