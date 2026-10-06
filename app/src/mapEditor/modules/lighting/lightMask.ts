import { Container, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import type { LightingDrawing, LightingFrame, LightingStage } from '../../core/renderer/lightingLayer.ts';
import { darkSceneOf, type DarkSetup, type MaskLight } from './darkScene.ts';
import { isAnimated } from './lightEffects.ts';
import { pictureKey } from './lightFalloff.ts';
import { LightPictures } from './lightPictures.ts';
import { chunkSignature, lightsByChunk, MASK_CHUNK_SIZE, maskChunksFor, sameStrengths, type MaskChunk } from './maskChunks.ts';

/**
 * What the mask is worked out from, beyond the tile size its stage gives: everything that darkens the map, what a light
 * falls back to, the page an event shows its lights from, and how brightly each light burns.
 */
type MaskSetup = Omit<DarkSetup, 'tileSize'>;

/**
 * One piece of the mask in a view: where it sits, and the sprite multiplying it into the map. While a light reaches it,
 * it holds the texture its lights are cut into and the sprites added into that texture, one per light's picture in the
 * order the game adds them, kept so a light that only burns brighter or dimmer is drawn again without building anything;
 * while none does, it holds neither and the sprite is a plain fill of the dark. It remembers the lights reaching it,
 * what it was built from, and the strengths it was last drawn at.
 */
type DrawnChunk = {
  readonly rect: MaskChunk;
  readonly sprite: Sprite;
  texture: RenderTexture | null;
  added: Container | null;
  lights: readonly MaskLight[];
  signature: string;
  strengths: readonly number[];
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
 * cheap, and builds again only the pieces whose fill or lights changed, so an edit elsewhere on the map costs a comparison
 * and a moved torch rebuilds the pieces around where it was and where it is; a piece whose lights only burn brighter or
 * dimmer is drawn again as it stands. A context the graphics card gave back holds none of the textures' pixels, so every
 * lit piece is drawn again on it. A map nobody calls dark has no mask, as in the game, and the mask lets go of everything
 * it held.
 *
 * Lights whose effect runs move with the view's clock between draws. Each tick works out how brightly every light in the
 * pieces such a light reaches burns now, and draws again only the pieces where one burns differently than it was drawn;
 * a piece reached by steady lights alone is never touched, and a map with no moving light, or no dark, costs a tick
 * nothing at all.
 */
class LightMask implements LightingDrawing
{
  #root = new Container();

  #setup: DarkSetup;

  #pictures: LightPictures;

  #chunkSize: number;

  #chunks: DrawnChunk[] = [];

  #moving: DrawnChunk[] = [];

  #tint = 0;

  #covered = { width: -1, height: -1 };

  #context = -1;

  /**
   * @param {LightingStage} stage Where the mask draws.
   * @param {MaskSetup} setup What the mask is worked out from.
   * @param {LightPictures} pictures Where light pictures are painted and kept; by default, a cache of its own.
   * @param {number} chunkSize How wide and tall each piece of the mask is.
   */
  constructor(
    stage: LightingStage,
    setup: MaskSetup,
    pictures: LightPictures = new LightPictures(),
    chunkSize: number = MASK_CHUNK_SIZE)
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

  /**
   * How many pieces of the mask a light whose effect runs reaches: the only pieces a tick may draw again.
   * @returns {number} The count.
   */
  get movingChunks(): number
  {
    return this.#moving.length;
  }

  draw(frame: LightingFrame): void
  {
    const scene = darkSceneOf(frame.document, this.#setup, frame.clock);
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
    this.#tint = scene.tint;
    this.#cover(width, height);
    const byChunk = lightsByChunk(scene.lights, width, height, this.#chunkSize);
    this.#chunks.forEach((chunk, index) => this.#settle(chunk, byChunk[index], fresh, frame.renderer));

    // only the pieces a light whose effect runs reaches have anything to do as the clock moves.
    this.#moving = this.#chunks.filter(chunk => chunk.lights.some(light => isAnimated(light.effect)));

    // a picture no light on the map draws any more is only memory.
    this.#pictures.keepOnly(new Set(scene.lights.map(light => pictureKey(light.radius, light.color, light.intensity))));
  }

  tick(frame: LightingFrame): boolean
  {
    const { strengthOf } = this.#setup;
    const { mapId } = frame.document;
    let redrew = false;
    this.#moving.forEach(chunk =>
    {
      const strengths = chunk.lights.map(light => strengthOf({ mapId, id: light.id, effect: light.effect }, frame.clock));
      if (sameStrengths(chunk.strengths, strengths))
      {
        return;
      }

      this.#burn(chunk, strengths, frame.renderer);
      redrew = true;
    });

    return redrew;
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
      return { rect, sprite, texture: null, added: null, lights: [], signature: '', strengths: [] };
    });
  }

  /**
   * Brings one piece up to date with the lights reaching it: built again when its fill or its lights' places or pictures
   * changed, or its texture lost its pixels with a context given back; drawn again as it stands when only how brightly
   * they burn changed; and left alone otherwise.
   * @param {DrawnChunk} chunk The piece.
   * @param {readonly MaskLight[]} lights The lights reaching it, in the order the game adds them.
   * @param {boolean} fresh Whether the context is new since the mask last drew.
   * @param {Renderer} renderer The view's renderer.
   */
  #settle(chunk: DrawnChunk, lights: readonly MaskLight[], fresh: boolean, renderer: Renderer): void
  {
    const signature = chunkSignature(this.#tint, lights);
    const strengths = lights.map(light => light.strength);
    chunk.lights = lights;

    // a piece holding a texture made on a context since given back holds no pixels, however little changed.
    const emptied = fresh && chunk.texture !== null;
    if (signature === chunk.signature && emptied === false)
    {
      // the same pictures in the same places, so at most how brightly they burn has moved.
      if (sameStrengths(chunk.strengths, strengths) === false)
      {
        this.#burn(chunk, strengths, renderer);
      }

      return;
    }

    chunk.signature = signature;
    if (lights.length === 0)
    {
      this.#fill(chunk);
      return;
    }

    this.#cut(chunk, strengths, renderer);
  }

  /**
   * Makes a piece no light reaches a plain fill of the dark, letting go of the texture and the sprites it held.
   * @param {DrawnChunk} chunk The piece.
   */
  #fill(chunk: DrawnChunk): void
  {
    // the sprite lets go of the texture before the texture goes.
    const { texture, added } = chunk;
    chunk.sprite.texture = Texture.WHITE;
    chunk.sprite.setSize(chunk.rect.width, chunk.rect.height);
    chunk.sprite.tint = this.#tint;
    chunk.texture = null;
    chunk.added = null;
    chunk.strengths = [];
    texture?.destroy(true);
    added?.destroy({ children: true });
  }

  /**
   * Builds a piece a light reaches as LightingRenderLayer builds its sheet: a sprite of each light's picture, centred on
   * it and added in, in the order the game adds them, in a container the piece keeps, and the texture they are drawn into
   * shown untinted; then draws it.
   * @param {DrawnChunk} chunk The piece, holding the lights reaching it.
   * @param {readonly number[]} strengths How brightly each burns.
   * @param {Renderer} renderer The view's renderer.
   */
  #cut(chunk: DrawnChunk, strengths: readonly number[], renderer: Renderer): void
  {
    const { rect } = chunk;
    chunk.added?.destroy({ children: true });
    const added = new Container();
    chunk.lights.forEach(light =>
    {
      const sprite = new Sprite(this.#pictures.pictureFor(light));
      sprite.anchor.set(0.5);
      sprite.position.set(light.x - rect.x, light.y - rect.y);
      sprite.blendMode = 'add';
      added.addChild(sprite);
    });

    const texture = chunk.texture ?? RenderTexture.create({ width: rect.width, height: rect.height });
    chunk.added = added;
    chunk.texture = texture;
    chunk.sprite.texture = texture;
    chunk.sprite.setSize(rect.width, rect.height);
    chunk.sprite.tint = 0xffffff;
    this.#burn(chunk, strengths, renderer);
  }

  /**
   * Draws a built piece as LightingRenderLayer draws its sheet every frame: its texture filled with the dark's colour,
   * then each light's picture added in at how brightly it burns.
   * @param {DrawnChunk} chunk The piece, built.
   * @param {readonly number[]} strengths How brightly each of its lights burns, in their order.
   * @param {Renderer} renderer The view's renderer.
   */
  #burn(chunk: DrawnChunk, strengths: readonly number[], renderer: Renderer): void
  {
    // a piece is drawn only once its lights are cut into it, so it holds both their sprites and their texture.
    const added = chunk.added as Container;
    added.children.forEach((sprite, index) =>
    {
      sprite.alpha = strengths[index];
    });
    chunk.strengths = strengths;

    // filling by clearing to the dark's colour leaves every pixel exactly what the game's tinted white sheet leaves.
    renderer.render({ container: added, target: chunk.texture as RenderTexture, clear: true, clearColor: this.#tint });
  }

  /**
   * Lets go of every piece and the textures and sprites they held.
   */
  #letGo(): void
  {
    this.#chunks.forEach(chunk =>
    {
      chunk.sprite.destroy();
      chunk.texture?.destroy(true);
      chunk.added?.destroy({ children: true });
    });
    this.#chunks = [];
    this.#moving = [];
    this.#covered = { width: -1, height: -1 };
  }
}

export { LightMask };
export type { MaskSetup };
