import type { LightingDrawing, LightingFrame, LightingStage, ScreenTone } from '../../core/renderer/lightingLayer.ts';
import { sameTone } from '../../core/renderer/screenTone.ts';
import { skyToneOf } from './sky.ts';
import type { SkyCurve } from './timeTone.ts';

/**
 * The sky's colour in one map view, as J-Lighting-Time casts it over the game's screen at the hour the window's clock
 * shows: a tone over the map, its parallax and its events, the way the engine's screen tone casts it, through the stage
 * ({@link LightingStage.castTone}). A map with no sky gets none.
 *
 * It draws nothing of its own, so it costs a frame almost nothing: asked to draw, it works the tone out for the map as
 * it now stands, since an edit may have taken the map out from under the sky; handed the clock, it works the tone out
 * again only when the clock moved, and casts it only when the hour moved it, which within one hour it never does. Let
 * go, it takes its tone back.
 */
class SkyTone implements LightingDrawing
{
  #stage: LightingStage;

  #curve: SkyCurve;

  #time = -1;

  #tone: ScreenTone | null = null;

  /**
   * @param {LightingStage} stage Where the tone is cast.
   * @param {SkyCurve} curve The day and night curve.
   */
  constructor(stage: LightingStage, curve: SkyCurve)
  {
    this.#stage = stage;
    this.#curve = curve;
  }

  /**
   * The tone cast now.
   * @returns {ScreenTone | null} The tone, or null while none is cast.
   */
  get tone(): ScreenTone | null
  {
    return this.#tone;
  }

  draw(frame: LightingFrame): void
  {
    this.#time = frame.clock.timeOfDay;
    this.#cast(skyToneOf(frame.document, this.#time, this.#curve));
  }

  tick(frame: LightingFrame): boolean
  {
    // the clock is the only thing a tick can change here, and it moves only when the author moves it.
    const { timeOfDay } = frame.clock;
    if (timeOfDay === this.#time)
    {
      return false;
    }

    this.#time = timeOfDay;
    return this.#cast(skyToneOf(frame.document, timeOfDay, this.#curve));
  }

  destroy(): void
  {
    this.#tone = null;
    this.#stage.castTone(null);
  }

  /**
   * Casts a tone, unless it is the one already cast.
   * @param {ScreenTone | null} tone The tone, or null for none.
   * @returns {boolean} True when it changed what the view shows.
   */
  #cast(tone: ScreenTone | null): boolean
  {
    if (sameTone(tone, this.#tone))
    {
      return false;
    }

    this.#tone = tone;
    this.#stage.castTone(tone);
    return true;
  }
}

export { SkyTone };
