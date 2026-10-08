import type { Container, Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { WeatherFrame, WeatherLayerDefinition, WeatherStage } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import type { ChangeEffect } from '../../../../src/mapEditor/render/documentChanges.ts';
import { WeatherLayers } from '../../../../src/mapEditor/render/scene/WeatherLayers.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * What plugin modules draw into a view's weather layer: one drawing per weather layer they contribute, made once and
 * kept for as long as that weather layer is handed over again, each in a container of its own, in the order they were
 * contributed, inside the one container the view's Weather switch shows and hides. One no longer handed over is let go,
 * container and all; and every drawing can be made afresh at once, so the weather starts over as on arriving at the map.
 *
 * The drawings draw only when due, and once however many changes made them due: after a new drawing is made, after the
 * map opens, the context comes back or the sky changes, and after a change to anything but the tiles. A tile change is
 * what a brush stroke makes, many times a second, and no module's weather reads tiles, so it never makes them due. While
 * the layer is hidden they do not draw, and they catch up once it shows. In every frame they are not due, each is handed
 * the clock to move on to instead, and the frame has something new to show only when one of them moved; while the layer
 * is hidden nothing is handed the clock at all, so the weather holds where it was. A drawing that throws, drawing or
 * moving on, is reported on its own, never stops the others, and is ticked no more until it next draws. Each drawing
 * can say what it shows, for the parity check, or nothing.
 */

/**
 * A weather layer whose drawing writes down what happens to it, and the stage each drawing was made on.
 * @param {string} id The weather layer's id.
 * @param {string[]} log Where everything is written.
 * @param {boolean} moves Whether its drawing changes what it shows as the clock moves.
 * @returns {{ definition: WeatherLayerDefinition, stages: WeatherStage[] }} The weather layer and its stages.
 */
const loggedLayer = (id: `${string}.${string}`, log: string[], moves = false) =>
{
  const stages: WeatherStage[] = [];
  const definition: WeatherLayerDefinition = {
    id,
    title: id,
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
  return { definition, stages };
};

/**
 * What a frame hands the drawings: map 7, a renderer nothing here draws with, the view's first context, the view's
 * clock, a view showing the whole map, no pictures and no sky.
 * @param {number} frames The clock's frame.
 * @returns {WeatherFrame} The frame.
 */
const frame = (frames = 0): WeatherFrame => ({
  document: MapDocument.fromJson('map:7', buildMapJson()),
  renderer: {} as Renderer,
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

  it('makes a drawing for each weather layer on a container of its own, in the order they come', () =>
  {
    // Arrange.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = new WeatherLayers(48);

    // Act.
    weather.setDefinitions([ map.definition, sky.definition ]);

    // Assert: each stage's container is the layer's child in that order, at the tile size given.
    const [ mapStage ] = map.stages;
    const [ skyStage ] = sky.stages;
    expect([ log, weather.layer.children, [ mapStage.tileSize, skyStage.tileSize ], weather.count ])
      .toStrictEqual([ [ 'weather.map made', 'weather.sky made' ], [ mapStage.layer, skyStage.layer ], [ 48, 48 ], 2 ]);
  });

  it('keeps a drawing whose weather layer comes again, and lets go of one that does not, container and all', () =>
  {
    // Arrange.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ map.definition, sky.definition ]);
    const [ mapStage ] = map.stages;

    // Act.
    weather.setDefinitions([ sky.definition ]);

    // Assert.
    expect([ log, weather.layer.children, mapStage.layer.destroyed ])
      .toStrictEqual([ [ 'weather.map made', 'weather.sky made', 'weather.map let go' ], [ sky.stages[0].layer ], true ]);
  });

  it('orders the containers as the weather layers come', () =>
  {
    // Arrange.
    const map = loggedLayer('weather.map', []);
    const sky = loggedLayer('weather.sky', []);
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ map.definition, sky.definition ]);

    // Act.
    weather.setDefinitions([ sky.definition, map.definition ]);

    // Assert.
    expect(weather.layer.children)
      .toStrictEqual([ sky.stages[0].layer, map.stages[0].layer ]);
  });

  it('makes every drawing afresh when the weather starts over, in the same order, and draws them in the next frame', () =>
  {
    // Arrange: two drawings, drawn.
    const log: string[] = [];
    const map = loggedLayer('weather.map', log);
    const sky = loggedLayer('weather.sky', log);
    const weather = drawnWith([ map.definition, sky.definition ]);
    const before = log.length;

    // Act.
    weather.reset();
    const drew = weather.draw(frame());

    // Assert: both let go, both made again on new containers in order, then drawn.
    expect([ log.slice(before), drew, weather.layer.children, map.stages[0].layer.destroyed ])
      .toStrictEqual([
        [ 'weather.map let go', 'weather.map made', 'weather.sky let go', 'weather.sky made', 'weather.map drew map 7', 'weather.sky drew map 7' ],
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
    const weather = drawnWith([ loggedLayer('weather.map', []).definition ]);
    const step: ChangeEffect = { kind: 'tiles', indices: [ 4, 5 ] };

    // Act.
    weather.hear(step);

    // Assert.
    expect(weather.draw(frame()))
      .toBe(false);
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
    const weather = drawnWith([ loggedLayer('weather.map', []).definition ]);

    // Act.
    weather.markStale();

    // Assert.
    expect(weather.draw(frame()))
      .toBe(true);
  });

  it('is made due by a new drawing, and not by drawings kept as they were', () =>
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

  it('reports a drawing that throws on its own, still draws the others, and hands the failed one no clock until it draws', () =>
  {
    // Arrange: a drawing whose draws fail, before one that works.
    const log: string[] = [];
    let ticks = 0;
    const broken: WeatherLayerDefinition = {
      id: 'weather.broken',
      title: 'Broken',
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
      create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }),
    };
    const weather = drawnWith([ loggedLayer('weather.map', []).definition, silent ]);

    // Act.
    const described = weather.describe();

    // Assert.
    expect(described)
      .toStrictEqual([ { id: 'weather.map' }, null ]);
  });

  it('lets every drawing go, and the layer with them', () =>
  {
    // Arrange.
    const log: string[] = [];
    const weather = new WeatherLayers(48);
    weather.setDefinitions([ loggedLayer('weather.map', log).definition, loggedLayer('weather.sky', log).definition ]);
    const { layer } = weather;

    // Act.
    weather.destroy();

    // Assert.
    expect([ log.slice(2), weather.count, (layer as Container).destroyed ])
      .toStrictEqual([ [ 'weather.map let go', 'weather.sky let go' ], 0, true ]);
  });
});
