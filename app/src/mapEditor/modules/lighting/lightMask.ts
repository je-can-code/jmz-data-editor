import { Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { LightingDrawing, LightingFrame, LightingStage } from '../../core/renderer/lightingLayer.ts';
import { darkSceneOf, type DarkSetup, type MaskLight } from './darkScene.ts';
import { pictureKey } from './lightFalloff.ts';
import { LightPictures } from './lightPictures.ts';
import { chunkSignature, lightsByChunk, MASK_CHUNK_SIZE, maskChunksFor, type MaskChunk } from './maskChunks.ts';

/**
 * What the mask is worked out from, beyond the tile size its stage gives: everything that darkens the map, what a light
 * falls back to, the page an event shows its lights from, and how brightly each light burns.
 */
type MaskSetup = Omit<DarkSetup, 'tileSize'>;

/**
 * One piece of the mask in a view: where it sits, the sprite multiplying it into the map, the texture its lights were
 * cut into (none while no light reaches it, when the sprite is a plain fill of the dark), and what it was last drawn
 * from.
 */
type DrawnChunk = {
  readonly rect: MaskChunk;
  readonly sprite: Sprite;
  texture: RenderTexture | null;
  signature: string;
};

/**
 * J-Lighting's darkness in one map view, drawn as the game draws its light mask (Sprite_LightMask and
 * LightingRenderLayer): a sheet filled with the dark's colour, each light's picture added into it, so overlapping pools
 * brighten where they meet up to full light, and the result multiplied into the map and its events beneath. Where the
 * sheet is white the map is untouched, where it is black the map is gone, and a light is a bright patch in it.
 *
 * The game builds that sheet a screen at a time; the editor shows a whole map at once, so the sheet comes in pieces
 * ({@link MASK_CHUNK_SIZE}). A piece no light reaches is a plain fill and holds no texture; a piece a light reaches has
 * its lights added into a texture of its own, on the GPU. Asked to draw, the mask works the dark out again, which is
 * cheap, and redraws only the pieces whose fill or lights changed, so an edit elsewhere on the map costs a comparison and
 * a moved torch redraws the pieces around where it was and where it is. A context the graphics card gave back holds none
 * of the textures' pixels, so every lit piece is drawn again on it. A map nobody calls dark has no mask, as in the game,
 * and the mask lets go of everything it held.
 */
class LightMask implements LightingDrawing
{
  #root = new Container();

  #setup: DarkSetup;

  #pictures: LightPictures;

  #chunkSize: number;

  #chunks: DrawnChunk[] = [];

  #covered = { width: -1, height: -1 };

  #context = -1;

  /**
   * @param {LightingStage} stage Where the mask draws.
   * @param {MaskSetup} setup What the mask is worked out from.
   * @param {LightPictures} pictures Where light pictures are painted and kept; by default, a cache of its own.
   * @param {number} chunkSize How wide and tall each piece of the mask is.
   */
  constructor(stage: LightingStage, setup: MaskSetup, pictures: LightPictures = new LightPictures(), chunkSize: number = MASK_CHUNK_SIZE)
  {
    this.#setup = { ...setup, tileSize: stage.tileSize };
    this.#pictures = pictures;
    this.#chunkSize = chunkSize;
    stage.layer.addChild(this.#root);
  }

  /**
   * How many pieces of the mask hold a texture, because a light reaches them.
   * @returns {number} The count.
   */
  get litChunks(): number
  {
    return this.#chunks.filter(chunk => chunk.texture !== null).length;
  }

  draw(frame: LightingFrame): void
  {
    const scene = darkSceneOf(frame.document, this.#setup);
    if (scene === null)
    {
      this.#letGo();
      this.#pictures.keepOnly(new Set());
      return;
    }

    const { tileSize } = this.#setup;
    const width = frame.document.width * tileSize;
    const height = frame.document.height * tileSize;
    const fresh = frame.context !== this.#context;
    this.#context = frame.context;
    this.#cover(width, height);
    const byChunk = lightsByChunk(scene.lights, width, height, this.#chunkSize);
    this.#chunks.forEach((chunk, index) =>
    {
      const lights = byChunk[index];
      const signature = chunkSignature(scene.tint, lights);

      // a piece holding a texture made on a context since given back holds no pixels, however little changed.
      const emptied = fresh && chunk.texture !== null;
      if (signature === chunk.signature && emptied === false)
      {
        return;
      }

      chunk.signature = signature;
      if (lights.length === 0)
      {
        this.#fill(chunk, scene.tint);
        return;
      }

      this.#cut(chunk, lights, scene.tint, frame.renderer);
    });

    // a picture no light on the map draws any more is only memory.
    this.#pictures.keepOnly(new Set(scene.lights.map(light => pictureKey(light.radius, light.color, light.intensity))));
  }

  destroy(): void
  {
    this.#letGo();
    this.#pictures.destroy();
    this.#root.destroy();
  }

  /**
   * Cuts the mask into pieces covering the map, unless they already do: a map of another size gets pieces of its own,
   * each a plain fill until it is drawn.
   * @param {number} width The map's width, in world pixels.
   * @param {number} height The map's height, in world pixels.
   */
  #cover(width: number, height: number): void
  {
    if (this.#covered.width === width && this.#covered.height === height)
    {
      return;
    }

    this.#letGo();
    this.#covered = { width, height };
    this.#chunks = maskChunksFor(width, height, this.#chunkSize).map(rect =>
    {
      const sprite = new Sprite(Texture.WHITE);
      sprite.position.set(rect.x, rect.y);
      sprite.blendMode = 'multiply';
      this.#root.addChild(sprite);
      return { rect, sprite, texture: null, signature: '' };
    });
  }

  /**
   * Makes a piece no light reaches a plain fill of the dark, letting go of the texture it held.
   * @param {DrawnChunk} chunk The piece.
   * @param {number} tint The dark's fill, as {@code 0xRRGGBB}.
   */
  #fill(chunk: DrawnChunk, tint: number): void
  {
    // the sprite lets go of the texture before the texture goes.
    const held = chunk.texture;
    chunk.sprite.texture = Texture.WHITE;
    chunk.sprite.setSize(chunk.rect.width, chunk.rect.height);
    chunk.sprite.tint = tint;
    chunk.texture = null;
    held?.destroy(true);
  }

  /**
   * Draws a piece a light reaches as LightingRenderLayer draws its sheet: the texture filled with the dark's colour,
   * then every light reaching it added in, each picture centred on its light and burning at its strength, then shown
   * untinted.
   * @param {DrawnChunk} chunk The piece.
   * @param {readonly MaskLight[]} lights The lights reaching it, in the order the game adds them.
   * @param {number} tint The dark's fill, as {@code 0xRRGGBB}.
   * @param {Renderer} renderer The view's renderer.
   */
  #cut(chunk: DrawnChunk, lights: readonly MaskLight[], tint: number, renderer: Renderer): void
  {
    const { rect } = chunk;
    const texture = chunk.texture ?? RenderTexture.create({ width: rect.width, height: rect.height });
    chunk.texture = texture;
    const added = new Container();
    lights.forEach(light =>
    {
      const sprite = new Sprite(this.#pictures.pictureFor(light));
      sprite.anchor.set(0.5);
      sprite.position.set(light.x - rect.x, light.y - rect.y);
      sprite.blendMode = 'add';
      sprite.alpha = light.strength;
      added.addChild(sprite);
    });

    // filling by clearing to the dark's colour leaves every pixel exactly what the game's tinted white sheet leaves.
    renderer.render({ container: added, target: texture, clear: true, clearColor: tint });
    added.destroy({ children: true });
    chunk.sprite.texture = texture;
    chunk.sprite.setSize(rect.width, rect.height);
    chunk.sprite.tint = 0xffffff;
  }

  /**
   * Lets go of every piece and the textures they held.
   */
  #letGo(): void
  {
    this.#chunks.forEach(chunk =>
    {
      chunk.sprite.destroy();
      chunk.texture?.destroy(true);
    });
    this.#chunks = [];
    this.#covered = { width: -1, height: -1 };
  }
}

export { LightMask };
export type { MaskSetup };
