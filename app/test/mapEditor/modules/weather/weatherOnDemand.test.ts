import { Container, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { ConfigRead, OnDemandConfig } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import type { WeatherDrawing, WeatherFrame, WeatherStage } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { MapWeather } from '../../../../src/mapEditor/modules/weather/mapWeather.ts';
import { loadMapWeather, WeatherOnDemand, type WeatherDrawingMaker } from '../../../../src/mapEditor/modules/weather/weatherOnDemand.ts';
import type { WeatherConfigFile } from '../../../../src/mapEditor/modules/weather/weatherConfig.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * A map's weather in one view is made only once there is weather to draw, so that a window that never shows any never
 * reads J-Weather's config or loads the code that draws it. The first time it is asked to draw, it asks for the config
 * and loads the code, both at once and each only once; until both are in it draws nothing, moves nothing and says
 * nothing. Once both are in, in either order, it makes the real drawing from the config as read, or from none for a
 * config it cannot draw from, and the next frame draws it rather than moving it; every draw and tick after is the
 * drawing's own. A later read of the config that differs, as when it is tuned on disk, makes the drawing afresh and lets
 * the old one go, and a read that brings nothing new makes nothing. Let go by the view, it lets its drawing go and stops
 * listening, and code or a config arriving after makes nothing.
 */
describe('weatherOnDemand', () =>
{
  /**
   * A config the module can draw from, with one look.
   */
  const CONFIG = { motions: { fall: { edge: 'top' } }, presets: { snow: { stops: { moderate: [] } } } } as unknown as JsonValue;

  /**
   * A frame of map 7.
   */
  const FRAME: WeatherFrame = {
    document: MapDocument.fromJson('map:7', buildMapJson()),
    renderer: {} as WebGLRenderer,
    context: 1,
    clock: { frames: 0, animating: true },
    view: WHOLE_VIEW,
    images: null,
    sky: null,
  };

  /**
   * Lets the promises already settled run their callbacks.
   * @returns {Promise<void>} Settles once they have.
   */
  const settle = (): Promise<void> => new Promise(resolve =>
  {
    setTimeout(resolve, 0);
  });

  /**
   * J-Weather's config as the window holds it: unread until the test reads it in, which its listeners hear, noting how
   * often it was asked for.
   * @returns {{ config: OnDemandConfig, asked: () => number, listening: () => number, arrive: (read: ConfigRead) => void }}
   * The config, how often it was asked for, how many listen, and a read arriving.
   */
  const heldConfig = () =>
  {
    const listeners = new Set<() => void>();
    let read: ConfigRead | undefined;
    let asked = 0;
    const config: OnDemandConfig = {
      current: () => read,
      request: () =>
      {
        asked += 1;
      },
      subscribe: listener =>
      {
        listeners.add(listener);
        return () =>
        {
          listeners.delete(listener);
        };
      },
    };
    const arrive = (next: ConfigRead) =>
    {
      read = next;
      listeners.forEach(listener => listener());
    };
    return { config, asked: () => asked, listening: () => listeners.size, arrive };
  };

  /**
   * The code that draws, loading when the test lets it, and what it makes: drawings that write down what happens to them,
   * each numbered, with the config each was made from.
   * @param {string[]} log Where everything is written.
   * @returns {{ load: () => Promise<WeatherDrawingMaker>, loads: () => number, finish: () => void, configs: (WeatherConfigFile | null)[] }}
   * The loader, how often it was called, the code arriving, and the configs drawings were made from.
   */
  const heldCode = (log: string[]) =>
  {
    let finish: () => void = () => undefined;
    const configs: (WeatherConfigFile | null)[] = [];
    const maker: WeatherDrawingMaker = (_stage, config) =>
    {
      configs.push(config);
      const made = configs.length;
      log.push(`made ${made}`);
      const drawing: WeatherDrawing = {
        draw: () => log.push(`${made} drew`),
        tick: () =>
        {
          log.push(`${made} moved`);
          return true;
        },
        describe: () => ({ made }),
        destroy: () => log.push(`${made} let go`),
      };
      return drawing;
    };
    const loaded = new Promise<WeatherDrawingMaker>(resolve =>
    {
      finish = () => resolve(maker);
    });
    let loads = 0;
    const load = () =>
    {
      loads += 1;
      return loaded;
    };
    return { load, loads: () => loads, finish: () => finish(), configs };
  };

  /**
   * A stage nothing here draws on.
   * @returns {WeatherStage} The stage.
   */
  const stage = (): WeatherStage => ({ layer: new Container(), tileSize: 48 });

  it('asks for the config and loads the code the first time it is asked to draw, each only once', () =>
  {
    // Arrange.
    const held = heldConfig();
    const code = heldCode([]);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    const before = [ held.asked(), code.loads() ];

    // Act.
    weather.draw(FRAME);
    weather.draw(FRAME);

    // Assert: nothing asked until the first draw, then each once.
    expect([ before, held.asked(), code.loads() ])
      .toStrictEqual([ [ 0, 0 ], 1, 1 ]);
  });

  it('draws nothing, moves nothing and says nothing while the code is in but the config is not', async () =>
  {
    // Arrange: asked to draw, the code arrived, the config still unread.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    code.finish();
    await settle();

    // Act.
    const moved = weather.tick(FRAME);

    // Assert.
    expect([ moved, weather.describe(), log ])
      .toStrictEqual([ false, null, [] ]);
  });

  it('makes nothing while the config is in but the code is not', () =>
  {
    // Arrange: asked to draw, the config read, the code still loading.
    const log: string[] = [];
    const held = heldConfig();
    const weather = new WeatherOnDemand(stage(), held.config, heldCode(log).load);
    weather.draw(FRAME);

    // Act.
    held.arrive({ content: CONFIG, problem: null });

    // Assert.
    expect([ weather.tick(FRAME), log ])
      .toStrictEqual([ false, [] ]);
  });

  it('makes the drawing once the code arrives after the config, and draws it in the next frame rather than moving it', async () =>
  {
    // Arrange: asked to draw, the config read.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    held.arrive({ content: CONFIG, problem: null });

    // Act: the code arrives, then a frame.
    code.finish();
    await settle();
    const drew = weather.tick(FRAME);

    // Assert: made from the config, then drawn.
    expect([ drew, log, code.configs.map(config => config !== null) ])
      .toStrictEqual([ true, [ 'made 1', '1 drew' ], [ true ] ]);
  });

  it('makes the drawing once the config arrives after the code', async () =>
  {
    // Arrange: asked to draw, the code in.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    code.finish();
    await settle();

    // Act.
    held.arrive({ content: CONFIG, problem: null });

    // Assert.
    expect(log)
      .toStrictEqual([ 'made 1' ]);
  });

  it('hands every draw and tick after the first frame to the drawing, and says what it shows', async () =>
  {
    // Arrange: made and drawn once.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    held.arrive({ content: CONFIG, problem: null });
    code.finish();
    await settle();
    weather.tick(FRAME);

    // Act: a draw, then a tick.
    weather.draw(FRAME);
    const moved = weather.tick(FRAME);

    // Assert.
    expect([ moved, log.slice(2), weather.describe() ])
      .toStrictEqual([ true, [ '1 drew', '1 moved' ], { made: 1 } ]);
  });

  it('draws a drawing just made when asked to draw before the next frame, and moves it in the frame after', async () =>
  {
    // Arrange: made, not yet drawn.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    held.arrive({ content: CONFIG, problem: null });
    code.finish();
    await settle();

    // Act: a draw, then a tick.
    weather.draw(FRAME);
    weather.tick(FRAME);

    // Assert: drawn once, then moved rather than drawn again.
    expect(log)
      .toStrictEqual([ 'made 1', '1 drew', '1 moved' ]);
  });

  it('makes the drawing afresh from a read that differs, letting the old one go, and nothing for the same read again', async () =>
  {
    // Arrange: made from one read.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    const first: ConfigRead = { content: CONFIG, problem: null };
    held.arrive(first);
    code.finish();
    await settle();

    // Act: the same read heard again, then a new one.
    held.arrive(first);
    const afterSame = [ ...log ];
    held.arrive({ content: CONFIG, problem: null });

    // Assert.
    expect([ afterSame, log ])
      .toStrictEqual([ [ 'made 1' ], [ 'made 1', '1 let go', 'made 2' ] ]);
  });

  it('makes the drawing from no config when the config could not be read', async () =>
  {
    // Arrange.
    const held = heldConfig();
    const code = heldCode([]);
    const weather = new WeatherOnDemand(stage(), held.config, code.load);
    weather.draw(FRAME);
    code.finish();
    await settle();

    // Act.
    held.arrive({ content: null, problem: 'open data/config.weather.json: no such file or directory' });

    // Assert.
    expect(code.configs)
      .toStrictEqual([ null ]);
  });

  it('lets its drawing go and stops listening when let go, making nothing for code or a config arriving after', async () =>
  {
    // Arrange: one made, and one let go while its code was still loading.
    const log: string[] = [];
    const held = heldConfig();
    const code = heldCode(log);
    const made = new WeatherOnDemand(stage(), held.config, code.load);
    made.draw(FRAME);
    held.arrive({ content: CONFIG, problem: null });
    const lateLog: string[] = [];
    const late = heldCode(lateLog);
    const waiting = new WeatherOnDemand(stage(), held.config, late.load);
    waiting.draw(FRAME);
    code.finish();
    await settle();

    // Act: both let go, then the late code arrives and the config is read again.
    made.destroy();
    waiting.destroy();
    late.finish();
    await settle();
    held.arrive({ content: CONFIG, problem: null });

    // Assert.
    expect([ log, lateLog, held.listening(), made.describe() ])
      .toStrictEqual([ [ 'made 1', '1 let go' ], [], 0, null ]);
  });

  it('loads the editor\'s own map weather by default, made from the config given', async () =>
  {
    // Arrange.

    // Act.
    const maker = await loadMapWeather();
    const drawing = maker(stage(), null);

    // Assert.
    expect(drawing)
      .toBeInstanceOf(MapWeather);
  });
});
