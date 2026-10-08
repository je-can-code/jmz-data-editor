import type { Container, Renderer } from 'pixi.js';
import type { JsonValue } from '../model/json.ts';
import type { MapDocument } from '../model/MapDocument.ts';
import type { TextureSource, WorldRect } from './MapRenderer.ts';

/**
 * What the sky is doing, as J-Weather is told it (WeatherDirector#setSky): the look an outdoor map with no weather of its
 * own shows under it, and how hard it is coming down, which an outdoor map's own look rises and falls with. Only a plugin
 * driving a sky hands one in, as J-Weather-Time does; with none, a map shows what its note says and nothing else.
 */
type SkyWeather = {
  readonly preset: string;
  readonly intensity: string;
};

/**
 * Where a module's weather draws in one map view: a container of its own inside the view's weather layer, which sits in
 * what the game tones, over the map and its events and under the lighting's dark, as the game puts J-Weather's plane in
 * the spriteset's base sprite above the tilemap and beneath J-Lighting's mask. It shows only while the view's Weather
 * switch is on, and nothing in it draws past the map's edges. Its units are world pixels: the map's top-left corner is
 * 0, 0 and a tile is {@link tileSize} across.
 */
type WeatherStage = {
  readonly layer: Container;
  readonly tileSize: number;
};

/**
 * The view's clock, as one frame reads the weather's part of it: the engine frame it is on, and whether the game look
 * moves at all.
 */
type WeatherClock = {
  /**
   * Whole engine frames, sixty a second, as the game's Graphics.frameCount counts them: the game moves its weather on by
   * one step in each. It follows the page's own clock, so it never starts over; while the view holds its animation still
   * at a moment, as the parity check holds it, it stays on that moment's frame.
   */
  readonly frames: number;

  /**
   * Whether the game look moves: false while the view's Animate switch is off, when the weather holds still where it is,
   * as the water and the lights do.
   */
  readonly animating: boolean;
};

/**
 * What a weather drawing is handed each time it is asked to draw or to move on: the map as it now stands, the view's pixi
 * renderer, which GPU context the view draws on, the view's clock, the part of the map the view shows, where the
 * project's pictures come from, and what the sky is doing.
 */
type WeatherFrame = {
  readonly document: MapDocument;
  readonly renderer: Renderer;

  /**
   * The view's GPU contexts, counted from 1: it goes up each time the graphics card gives the view its context back.
   */
  readonly context: number;

  /**
   * The view's clock as this frame reads it.
   */
  readonly clock: WeatherClock;

  /**
   * The part of the map the view shows in this frame, in world pixels; it may reach past the map's edges.
   */
  readonly view: WorldRect;

  /**
   * Where the project's pictures come from, J-Weather's img/weather among them; null until the view is given a source.
   */
  readonly images: TextureSource | null;

  /**
   * What the sky is doing, or null while nothing drives one, which is J-Weather on its own: then a map tagged with a
   * look shows it at its middle strength, and a map without one shows nothing.
   */
  readonly sky: SkyWeather | null;
};

/**
 * One module's weather in one map view, made of plain pixi display objects it adds to its stage's container. It is made
 * only once the view shows a map its weather layer draws on, and let go again once the view shows one it draws nothing
 * on, so a map without weather costs the view nothing for it.
 *
 * The view asks it to draw in the frame after it was made, after the map opened, after anything on the map but its tiles
 * changed, after the sky changed, and after the graphics card gave the view's context back; however many changes arrive
 * before that frame, it draws once. While the Weather switch is off it is not asked at all, and draws once the switch is
 * back on. What it does with each ask is its own business: it may well find the weather it shows is still the map's, and
 * keep it as it is.
 *
 * In every other frame the view shows the weather, it hands the drawing the clock instead, through {@link tick}: that is
 * where the weather falls, drifts and rises. A view behind another tab, a closed one, or one with its Weather switch off
 * hands out no ticks at all.
 */
interface WeatherDrawing
{
  /**
   * Draws for the map as it now stands, at the frame's clock.
   * @param {WeatherFrame} frame The map, the renderer and the clock.
   */
  draw(frame: WeatherFrame): void;

  /**
   * Moves on to the frame's clock, in a frame that did not ask it to draw: once a frame, on the same map it last drew. A
   * drawing nothing of which moves answers false at once.
   * @param {WeatherFrame} frame The map, the renderer and the clock.
   * @returns {boolean} True when it changed what it shows, so the frame has something new to show.
   */
  tick(frame: WeatherFrame): boolean;

  /**
   * Says what it shows as plain data, for the parity check to hold against the game's own weather; left out, a drawing
   * has nothing to say.
   * @returns {JsonValue} What it shows.
   */
  describe?(): JsonValue;

  /**
   * Lets go of everything it made, for a view closing or a module switching off.
   */
  destroy(): void;
}

/**
 * Something a plugin module draws into every map view's weather layer, such as J-Weather's look of a map: an id named
 * after its module, what the editor calls it, whether it draws anything on a map, and how to make its drawing for one
 * view.
 */
type WeatherLayerDefinition = {
  readonly id: `${string}.${string}`;
  readonly title: string;

  /**
   * Says whether it draws anything on the frame's map under the frame's sky, from the map and the sky alone, without
   * loading or making anything: a map it draws nothing on gets no drawing, no clip and no work in any frame. The view
   * asks when the map opens or is swapped, when anything on the map but its tiles changes, and when the sky changes.
   * @param {WeatherFrame} frame The map, the renderer, the clock and the sky.
   * @returns {boolean} True when it draws something there.
   */
  readonly drawsOn: (frame: WeatherFrame) => boolean;

  /**
   * Makes the drawing for one map view, the first time the view shows a map it draws on, and again for the first such
   * map after one it drew nothing on.
   * @param {WeatherStage} stage Where it draws.
   * @returns {WeatherDrawing} The drawing.
   */
  readonly create: (stage: WeatherStage) => WeatherDrawing;
};

export type { SkyWeather, WeatherClock, WeatherDrawing, WeatherFrame, WeatherLayerDefinition, WeatherStage };
