import { Container, Texture, TilingSprite, type TextureSource } from 'pixi.js';
import type { Camera } from '../../core/renderer/camera.ts';
import type { TextureSource as ImageSource } from '../../core/renderer/MapRenderer.ts';
import { parallaxTileOffset, type ParallaxSettings } from '../engine/parallax.ts';
import { textureSourceFor } from '../textureImages.ts';

/**
 * Draws a map's parallax behind its tiles, with the map's own loop and scroll settings: fixed to the map for a
 * {@code !} parallax, following at half speed when it loops, drifting by its scroll speed, and otherwise still behind
 * the view, exactly where the engine would show it for the same camera. It covers the map and stops at its edges.
 */
class ParallaxLayer
{
  /**
   * The container the parallax draws in.
   */
  readonly layer = new Container();

  #sprite: TilingSprite | null = null;

  #source: TextureSource | null = null;

  #settings: ParallaxSettings | null = null;

  #generation = 0;

  #onChange: () => void;

  #lastOffset = { x: Number.NaN, y: Number.NaN };

  /**
   * @param {() => void} onChange Called when a picture finishes loading, so a frame draws it.
   */
  constructor(onChange: () => void)
  {
    this.#onChange = onChange;
  }

  /**
   * Whether the parallax scrolls by itself, so every frame must redraw while it shows.
   * @returns {boolean} True for a looping parallax with a scroll speed.
   */
  get drifts(): boolean
  {
    const settings = this.#settings;
    return settings !== null && this.#sprite !== null
      && ((settings.loopX && settings.sx !== 0) || (settings.loopY && settings.sy !== 0));
  }

  /**
   * Shows a map's parallax, loading its picture.
   * @param {ParallaxSettings} settings The map's parallax settings.
   * @param {number} width The map's width in world pixels.
   * @param {number} height The map's height in world pixels.
   * @param {ImageSource | null} images Where pictures come from.
   */
  setMap(settings: ParallaxSettings, width: number, height: number, images: ImageSource | null): void
  {
    const generation = ++this.#generation;
    const unchanged = this.#settings?.name === settings.name && this.#sprite !== null;
    this.#settings = settings;
    if (unchanged)
    {
      this.#sprite?.setSize(width, height);
      return;
    }

    this.#clear();
    if (settings.name === '' || images === null)
    {
      return;
    }

    images.image('parallaxes', settings.name)
      .then(image =>
      {
        if (generation !== this.#generation || image === null)
        {
          return;
        }

        this.#source = textureSourceFor(image, 'linear');
        this.#sprite = new TilingSprite({ texture: new Texture({ source: this.#source }), width, height });
        this.layer.addChild(this.#sprite);
        this.#lastOffset = { x: Number.NaN, y: Number.NaN };
        this.#onChange();
      })
      .catch(() => undefined);
  }

  /**
   * Scrolls the picture to where the engine would show it for a camera and a moment.
   * @param {Camera} camera The camera.
   * @param {number} frames Engine frames since the map was shown, for the drift.
   * @param {number} tileSize The tile size.
   * @returns {boolean} True when the picture moved.
   */
  update(camera: Camera, frames: number, tileSize: number): boolean
  {
    const sprite = this.#sprite;
    const settings = this.#settings;
    const source = this.#source;
    if (sprite === null || settings === null || source === null)
    {
      return false;
    }

    const offset = parallaxTileOffset(settings, camera, frames, tileSize, { x: source.width, y: source.height });
    if (offset.x === this.#lastOffset.x && offset.y === this.#lastOffset.y)
    {
      return false;
    }

    this.#lastOffset = offset;
    sprite.tilePosition.set(offset.x, offset.y);
    return true;
  }

  /**
   * Lets go of the picture.
   */
  destroy(): void
  {
    this.#generation += 1;
    this.#clear();
    this.layer.destroy({ children: true });
  }

  /**
   * Removes the current picture.
   */
  #clear(): void
  {
    this.#sprite?.destroy();
    this.#sprite = null;
    this.#source?.destroy();
    this.#source = null;
  }
}

export { ParallaxLayer };
