import type { JsonValue } from '../../core/model/json.ts';
import type { ConfigRead, OnDemandConfig } from '../../core/modules/PluginModule.ts';
import type { WeatherDrawing, WeatherFrame, WeatherStage } from '../../core/renderer/weatherLayer.ts';
import { weatherConfigFrom, type WeatherConfigFile } from './weatherConfig.ts';

/**
 * Makes a map's weather drawing on a stage, from J-Weather's config, or from none when the project's cannot be drawn
 * from.
 */
type WeatherDrawingMaker = (stage: WeatherStage, config: WeatherConfigFile | null) => WeatherDrawing;

/**
 * Loads the code that draws a map's weather, pixi's particle containers with it. It is kept out of the editor's own code
 * and loaded the first time a map has weather, so a window that never shows any never loads it, parses it, or builds
 * pixi's particle pipe for it.
 * @returns {Promise<WeatherDrawingMaker>} What makes a drawing, once the code has loaded.
 */
const loadMapWeather = (): Promise<WeatherDrawingMaker> =>
{
  return import('./mapWeather.ts')
    .then(loaded => (stage: WeatherStage, config: WeatherConfigFile | null) => new loaded.MapWeather(stage, config));
};

/**
 * A map's weather in one view, made only once there is weather to draw. The view makes it only for a map with weather,
 * and the first time it is asked to draw, it asks for J-Weather's config and loads the code that draws, both at once;
 * until both are in it draws nothing and moves nothing. Then it makes the real drawing, which draws in the next frame,
 * settled as the game settles its weather on arrival, and from then on everything is handed straight to it.
 *
 * The config is read again whenever the module configs are, as when it changes on disk, and a read that differs makes
 * the drawing afresh from it, so the weather follows the config as it is tuned, as the game's would after a restart.
 */
class WeatherOnDemand implements WeatherDrawing
{
  #stage: WeatherStage;

  #config: OnDemandConfig;

  #load: () => Promise<WeatherDrawingMaker>;

  #maker: WeatherDrawingMaker | null = null;

  #loading = false;

  #drawing: WeatherDrawing | null = null;

  /**
   * The read of the config the drawing was made from, so a read that brings nothing new remakes nothing.
   */
  #madeFrom: ConfigRead | undefined = undefined;

  /**
   * Whether the drawing was made since the view last asked it to draw, so the next frame draws it rather than moving it.
   */
  #due = false;

  #destroyed = false;

  #stopListening: () => void;

  /**
   * @param {WeatherStage} stage Where it draws.
   * @param {OnDemandConfig} config J-Weather's config, read only once there is weather to draw.
   * @param {() => Promise<WeatherDrawingMaker>} load Loads the code that draws; by default, the editor's own.
   */
  constructor(stage: WeatherStage, config: OnDemandConfig, load: () => Promise<WeatherDrawingMaker> = loadMapWeather)
  {
    this.#stage = stage;
    this.#config = config;
    this.#load = load;
    this.#stopListening = config.subscribe(() => this.#make());
  }

  draw(frame: WeatherFrame): void
  {
    if (this.#drawing === null)
    {
      this.#start();
      return;
    }

    this.#due = false;
    this.#drawing.draw(frame);
  }

  tick(frame: WeatherFrame): boolean
  {
    if (this.#drawing === null)
    {
      return false;
    }

    // a drawing just made draws in the first frame it is handed, rather than moving on from nothing.
    if (this.#due)
    {
      this.#due = false;
      this.#drawing.draw(frame);
      return true;
    }

    return this.#drawing.tick(frame);
  }

  describe(): JsonValue
  {
    const drawing = this.#drawing;
    return drawing === null || drawing.describe === undefined
      ? null
      : drawing.describe();
  }

  destroy(): void
  {
    this.#destroyed = true;
    this.#stopListening();
    this.#drawing?.destroy();
    this.#drawing = null;
  }

  /**
   * Asks for the config and loads the code that draws, the first time there is weather to draw; a later ask waits on
   * the same.
   */
  #start(): void
  {
    if (this.#loading)
    {
      return;
    }

    this.#loading = true;
    this.#config.request();
    this.#load()
      .then(maker =>
      {
        this.#maker = maker;
        this.#make();
      });
  }

  /**
   * Makes the drawing once the code has loaded and the config has been read, and afresh from each read of the config
   * that differs from the one it was made from; nothing once the view has let it go.
   */
  #make(): void
  {
    const read = this.#config.current();
    if (this.#destroyed || this.#maker === null || read === undefined || read === this.#madeFrom)
    {
      return;
    }

    this.#madeFrom = read;
    this.#drawing?.destroy();
    this.#drawing = this.#maker(this.#stage, weatherConfigFrom(read.content));
    this.#due = true;
  }
}

export { loadMapWeather, WeatherOnDemand };
export type { WeatherDrawingMaker };
