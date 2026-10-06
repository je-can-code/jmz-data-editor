import { Container, type Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { LightingClock } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import { mapAmbient } from '../../../../src/mapEditor/modules/lighting/ambientTags.ts';
import type { LightStrength } from '../../../../src/mapEditor/modules/lighting/darkScene.ts';
import { pictureKey } from '../../../../src/mapEditor/modules/lighting/lightFalloff.ts';
import { LightMask } from '../../../../src/mapEditor/modules/lighting/lightMask.ts';
import type { LightPictures } from '../../../../src/mapEditor/modules/lighting/lightPictures.ts';
import { firstLitPage } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/**
 * Every stand-in render texture made, in order, and how many stand-in sprites were made.
 */
const stand = vi.hoisted(() => ({
  textures: [] as { width: number; height: number; destroyed: boolean }[],
  sprites: 0,
}));

// the mask draws through pixi, which needs a GPU to draw anything; stand-ins write down what each piece holds and what
// each render pass was handed instead.
vi.mock('pixi.js', () =>
{
  /**
   * Stands in for pixi's containers: children in the order added, and whether it was let go.
   */
  class StandInContainer
  {
    children: unknown[] = [];

    destroyed = false;

    addChild<T>(child: T): T
    {
      this.children.push(child);
      return child;
    }

    destroy(options?: { children?: boolean }): void
    {
      this.destroyed = true;
      if (options?.children === true)
      {
        this.children.forEach(child => (child as { destroy: () => void }).destroy());
      }
    }
  }

  /**
   * Stands in for pixi's sprites, keeping what the mask sets on them.
   */
  class Sprite
  {
    texture: unknown;

    position = {
      x: 0,
      y: 0,
      set(x: number, y: number)
      {
        this.x = x;
        this.y = y;
      },
    };

    anchor = {
      x: 0,
      set(value: number)
      {
        this.x = value;
      },
    };

    blendMode = 'normal';

    alpha = 1;

    tint = 0xffffff;

    width = 0;

    height = 0;

    destroyed = false;

    constructor(texture: unknown)
    {
      this.texture = texture;
      stand.sprites += 1;
    }

    setSize(width: number, height: number): void
    {
      this.width = width;
      this.height = height;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  /**
   * Stands in for pixi's textures: the plain white one is all the mask asks of it.
   */
  class Texture
  {
    static WHITE = { white: true };
  }

  /**
   * Stands in for pixi's render textures, written down as they are made.
   */
  class RenderTexture
  {
    width = 0;

    height = 0;

    destroyed = false;

    static create(options: { width: number; height: number }): RenderTexture
    {
      const texture = new RenderTexture();
      texture.width = options.width;
      texture.height = options.height;
      stand.textures.push(texture);
      return texture;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  /**
   * Stands in for the pixi classes the rest of the lighting module names, which the mask never makes.
   */
  class Graphics
  {
  }

  /**
   * Stands in for pixi's image sources, which the mask never makes either.
   */
  class ImageSource
  {
  }

  return { Container: StandInContainer, Graphics, ImageSource, RenderTexture, Sprite, Texture };
});

/*
 * A dark map's darkness is drawn as J-Lighting draws its light mask: a sheet in the dark's fill with every light's
 * picture added into it, multiplied into the map beneath. The editor draws a whole map, so the sheet comes in pieces: a
 * piece no light reaches is a plain sprite of the fill, multiplied in, holding no texture; a piece a light reaches gets
 * a render texture of its own, cleared to the fill (which leaves every pixel what the game's tinted sheet leaves) with
 * each light reaching it added in, its picture centred on it at its strength at the view's clock, in the order the game
 * adds them; the sprite then shows that texture untinted. A map nobody calls dark has no mask, and holds nothing for one.
 *
 * Asked to draw again, the mask builds again only the pieces whose fill or lights changed: nothing at all when nothing
 * did, the pieces a moved light left and entered when one moves, every piece when the darkness changes; a piece whose
 * lights only burn at another strength is drawn again with the sprites it has. A piece the last light leaves goes back to
 * a plain fill and lets its texture go. A context the graphics card gave back holds no texture's pixels, so every lit
 * piece is drawn again on it, in the texture it already has. A map of another size gets pieces of its own, and the old
 * ones go. Pictures no light draws any more are let go after each draw, and destroying the mask lets go of everything.
 *
 * Between draws the clock moves on. Only the pieces a light whose effect runs reaches have anything to do: each works
 * out how brightly its lights burn now and is drawn again, as it stands, only when one burns otherwise than it was drawn.
 * A piece reached by steady lights alone is never touched, and a map with no dark, or no light whose effect runs, costs
 * a tick nothing, its strength never even asked.
 */

/**
 * One render pass as the stand-in renderer saw it: the texture it drew into, how it cleared it, and each picture it
 * added in, with where, how and how brightly.
 */
type Pass = {
  target: unknown;
  clear: boolean;
  clearColor: number;
  added: { picture: string; x: number; y: number; blendMode: string; anchor: number; alpha: number }[];
};

/**
 * A sprite the mask made, as the stand-in keeps it.
 */
type DrawnSprite = {
  texture: unknown;
  position: { x: number; y: number };
  blendMode: string;
  tint: number;
  width: number;
  height: number;
  destroyed: boolean;
};

/**
 * A stand-in renderer writing down every render pass, and the container each pass drew.
 * @returns {{ renderer: Renderer, passes: Pass[], containers: Container[] }} The renderer, its passes and their containers.
 */
const recordingRenderer = () =>
{
  const passes: Pass[] = [];
  const containers: Container[] = [];
  const renderer = {
    render: (options: { container: Container; target: unknown; clear: boolean; clearColor: number }) =>
    {
      containers.push(options.container);
      const added = (options.container.children as unknown as {
        texture: { key: string };
        position: { x: number; y: number };
        blendMode: string;
        anchor: { x: number };
        alpha: number;
      }[]).map(sprite => ({
        picture: sprite.texture.key,
        x: sprite.position.x,
        y: sprite.position.y,
        blendMode: sprite.blendMode,
        anchor: sprite.anchor.x,
        alpha: sprite.alpha,
      }));
      passes.push({ target: options.target, clear: options.clear, clearColor: options.clearColor, added });
    },
  };
  return { renderer: renderer as unknown as Renderer, passes, containers };
};

/**
 * A stand-in picture cache: each picture is its name, and what the mask keeps and lets go of is written down.
 * @returns {{ pictures: LightPictures, kept: string[][], destroyed: () => boolean }} The cache and what it was told.
 */
const namedPictures = () =>
{
  const kept: string[][] = [];
  let destroyed = false;
  const pictures = {
    pictureFor: (spec: { radius: number; color: string; intensity: number }) => ({ key: pictureKey(spec.radius, spec.color, spec.intensity) }),
    keepOnly: (keys: ReadonlySet<string>) => kept.push([ ...keys ]),
    destroy: () =>
    {
      destroyed = true;
    },
  };
  return { pictures: pictures as unknown as LightPictures, kept, destroyed: () => destroyed };
};

/**
 * A torch reaching one tile, standing at a cell, its pool centred at the cell's middle, 6 pixels above its foot.
 * @param {number} id The event id.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {string} effect What the torch does over time, written into its tag; by default, nothing.
 * @returns {RmmzMapEvent} The torch.
 */
const torchAt = (id: number, x: number, y: number, effect = ''): RmmzMapEvent =>
{
  const tag = effect === '' ? '<light:[1, #ffbb73, 40]>' : `<light:[1, #ffbb73, 40, ${effect}]>`;
  return { ...event(id, [ page([ command(108, [ tag ]) ]) ]), x, y };
};

/**
 * Every light at full strength, as it burns with no effect running.
 * @returns {number} 1.
 */
const steady: LightStrength = () => 1;

/**
 * A strength under which every light whose effect runs dims by a hundredth each frame of the clock, and every steady
 * light burns at full strength.
 * @param {{ effect: string }} light The light.
 * @param {LightingClock} clock The view's clock.
 * @returns {number} The strength.
 */
const dimming: LightStrength = (light, clock) => (light.effect === 'steady' ? 1 : 1 - (clock.frames / 100));

/**
 * The view's clock at a frame, animating.
 * @param {number} frames The frame.
 * @returns {LightingClock} The clock.
 */
const at = (frames: number): LightingClock => ({ frames, animating: true });

/**
 * A map of the given size, note and events.
 * @param {number} size How many tiles across and down.
 * @param {string} note The note.
 * @param {(RmmzMapEvent | null)[]} events The events, slot 0 empty.
 * @returns {MapDocument} The map.
 */
const mapOf = (size: number, note: string, events: (RmmzMapEvent | null)[]): MapDocument =>
{
  return MapDocument.fromJson('map:6', { ...buildMapJson(), width: size, height: size, data: new Array(size * size * 6).fill(0), note, events });
};

/**
 * A mask on a fresh stage, cut into pieces of 256 pixels, so a 16x16 map is 3 by 3 pieces, with what each strength it
 * is asked for, in order.
 * @param {LightStrength} strengthOf How brightly each light burns.
 * @returns {object} The mask, its stage, its pictures, a renderer writing down its passes, and the strengths asked for.
 */
const maskOnStage = (strengthOf: LightStrength = steady) =>
{
  const layer = new Container();
  const named = namedPictures();
  const asked: string[] = [];
  const counted: LightStrength = (light, clock) =>
  {
    asked.push(`${light.id} at ${clock.frames}`);
    return strengthOf(light, clock);
  };
  const setup = { sources: [ mapAmbient('#000000') ], defaults: { color: '#ffffff', intensity: 0 }, choosePage: firstLitPage, strengthOf: counted };
  const mask = new LightMask({ layer, tileSize: 48 }, setup, named.pictures, 256);
  const { renderer, passes, containers } = recordingRenderer();
  const draw = (document: MapDocument, context = 1, clock = at(0)) => mask.draw({ document, renderer, context, clock });
  const tick = (document: MapDocument, clock: LightingClock) => mask.tick({ document, renderer, context: 1, clock });
  const [ root ] = layer.children as Container[];
  const sprites = () => root.children as unknown as DrawnSprite[];
  return { mask, layer, root, sprites, passes, containers, asked, draw, tick, ...named };
};

/**
 * The name of a torch's picture: a tile's reach, warm, at 40.
 */
const TORCH = '48:#ffbb73:0.4';

describe('LightMask', () =>
{
  afterEach(() =>
  {
    stand.textures.splice(0);
    stand.sprites = 0;
  });

  it('draws on a container of its own in its stage', () =>
  {
    // Arrange: a stage.

    // Act.
    const { layer, root } = maskOnStage();

    // Assert.
    expect([ layer.children.length, root.children.length ])
      .toStrictEqual([ 1, 0 ]);
  });

  it('holds nothing for a map nobody calls dark, however many lights it holds', () =>
  {
    // Arrange.
    const { draw, sprites, passes } = maskOnStage();

    // Act.
    draw(mapOf(16, '', [ null, torchAt(1, 1, 1) ]));

    // Assert.
    expect([ sprites().length, passes.length, stand.textures.length ])
      .toStrictEqual([ 0, 0, 0 ]);
  });

  it('fills every piece of a dark map no light reaches with the dark, multiplied in, holding no texture', () =>
  {
    // Arrange: a cave 13 tiles across, 624 pixels, at 85%, without a light.
    const { draw, sprites, passes, mask } = maskOnStage();

    // Act.
    draw(mapOf(13, '<ambient:[85]>', [ null ]));

    // Assert: 3 by 3 pieces, the last of each row and column cut short at 624.
    expect(sprites().map(sprite => [ sprite.position.x, sprite.position.y, sprite.width, sprite.height, sprite.tint, sprite.blendMode ]))
      .toStrictEqual([
        [ 0, 0, 256, 256, 0x262626, 'multiply' ],
        [ 256, 0, 256, 256, 0x262626, 'multiply' ],
        [ 512, 0, 112, 256, 0x262626, 'multiply' ],
        [ 0, 256, 256, 256, 0x262626, 'multiply' ],
        [ 256, 256, 256, 256, 0x262626, 'multiply' ],
        [ 512, 256, 112, 256, 0x262626, 'multiply' ],
        [ 0, 512, 256, 112, 0x262626, 'multiply' ],
        [ 256, 512, 256, 112, 0x262626, 'multiply' ],
        [ 512, 512, 112, 112, 0x262626, 'multiply' ],
      ]);
    expect([ sprites().every(sprite => (sprite.texture as { white?: boolean }).white === true), passes.length, mask.litChunks ])
      .toStrictEqual([ true, 0, 0 ]);
  });

  it('cuts a light into the piece it reaches: cleared to the dark, its picture added in at its spot, shown untinted', () =>
  {
    // Arrange: a cave holding a torch at cell 1, 1, whose picture spans 24 to 120 across and 42 to 138 down.
    const { draw, sprites, passes, mask } = maskOnStage();

    // Act.
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]));

    // Assert: the first piece drawn into a texture of its own, the rest plain.
    const [ texture ] = stand.textures;
    expect(passes)
      .toStrictEqual([ {
        target: texture,
        clear: true,
        clearColor: 0x262626,
        added: [ { picture: TORCH, x: 72, y: 90, blendMode: 'add', anchor: 0.5, alpha: 1 } ],
      } ]);
    const [ first, second ] = sprites();
    expect([ texture.width, texture.height, first.texture === texture, first.tint, first.width, first.height, second.tint, mask.litChunks ])
      .toStrictEqual([ 256, 256, true, 0xffffff, 256, 256, 0x262626, 1 ]);
  });

  it('adds every light reaching a piece into it in one pass, in the order the game adds them', () =>
  {
    // Arrange: two torches in the first piece, event 1 at 3, 2 and event 2 nearer the corner at 1, 1; the game adds
    // them by event, whatever their places.
    const { draw, passes } = maskOnStage();

    // Act.
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 3, 2), torchAt(2, 1, 1) ]));

    // Assert.
    expect(passes.map(pass => pass.added.map(added => [ added.x, added.y ])))
      .toStrictEqual([ [ [ 168, 138 ], [ 72, 90 ] ] ]);
  });

  it('adds a light at the strength it burns at at the view\'s clock', () =>
  {
    // Arrange: a flickering torch, 30 frames in, where it burns at 0.7.
    const { draw, passes } = maskOnStage(dimming);

    // Act.
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1, 'flicker') ]), 1, at(30));

    // Assert.
    expect(passes[0].added[0].alpha)
      .toBe(0.7);
  });

  it('draws a piece again with the sprites it has when only how brightly its lights burn changed', () =>
  {
    // Arrange: a flickering torch drawn at frame 0, at full strength.
    const { draw, passes, containers } = maskOnStage(dimming);
    const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1, 'flicker') ]);
    draw(cave, 1, at(0));
    const made = stand.sprites;

    // Act: asked again 20 frames on, as an edit elsewhere on the map would ask.
    draw(cave, 1, at(20));

    // Assert: one more pass, of the same sprites into the same texture, the torch at 0.8; no sprite and no texture made.
    expect([ passes.length, containers[1] === containers[0], passes[1].target === passes[0].target, passes[1].added[0].alpha ])
      .toStrictEqual([ 2, true, true, 0.8 ]);
    expect([ stand.sprites - made, stand.textures.length ])
      .toStrictEqual([ 0, 1 ]);
  });

  it('keeps every piece as it was when asked again with nothing changed', () =>
  {
    // Arrange: a cave drawn once.
    const { draw, passes } = maskOnStage();
    const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]);
    draw(cave);

    // Act.
    draw(cave);

    // Assert.
    expect([ passes.length, stand.textures.length ])
      .toStrictEqual([ 1, 1 ]);
  });

  it('redraws only the pieces a moved light left and entered, letting go of the texture it left', () =>
  {
    // Arrange: a torch in the first piece, and one in the last.
    const { draw, sprites, passes } = maskOnStage();
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1), torchAt(2, 12, 12) ]));
    const [ , lastTexture ] = stand.textures;

    // Act: the second torch moves into the second piece.
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1), torchAt(2, 7, 1) ]));

    // Assert: one new pass, into the second piece, the torch placed from that piece's corner at 256; the last piece
    // plain again, its texture gone.
    const { 8: last } = sprites();
    expect([ passes.length, passes[2].target === stand.textures[2], passes[2].added.map(added => [ added.x, added.y ]) ])
      .toStrictEqual([ 3, true, [ [ 104, 90 ] ] ]);
    expect([ lastTexture.destroyed, (last.texture as { white?: boolean }).white, last.tint, last.width ])
      .toStrictEqual([ true, true, 0x262626, 256 ]);
  });

  it('draws every lit piece again, in the texture it has, on a context the graphics card gave back', () =>
  {
    // Arrange: a cave with a torch in the first and last pieces, drawn on the first context.
    const { draw, passes } = maskOnStage();
    const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1), torchAt(2, 12, 12) ]);
    draw(cave, 1);

    // Act: nothing changed but the context.
    draw(cave, 2);

    // Assert: both lit pieces again, into the textures they had, and no plain piece.
    expect([ passes.length, passes[2].target === passes[0].target, passes[3].target === passes[1].target, stand.textures.length ])
      .toStrictEqual([ 4, true, true, 2 ]);
  });

  it('fills every piece afresh when the darkness changes', () =>
  {
    // Arrange: a cave at 85% with a torch.
    const { draw, sprites, passes } = maskOnStage();
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]));

    // Act: the note now says 93%.
    draw(mapOf(16, '<ambient:[93]>', [ null, torchAt(1, 1, 1) ]));

    // Assert: the lit piece cleared to the new fill, and every plain one tinted with it.
    expect([ passes.map(pass => pass.clearColor), sprites().slice(1).every(sprite => sprite.tint === 0x121212) ])
      .toStrictEqual([ [ 0x262626, 0x121212 ], true ]);
  });

  it('covers a map of another size with pieces of its own, letting go of the old ones and their textures', () =>
  {
    // Arrange: a lit 16x16 cave drawn.
    const { draw, sprites } = maskOnStage();
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]));
    const old = [ ...sprites() ];

    // Act: an 8x8 cave, 384 pixels across.
    draw(mapOf(8, '<ambient:[85]>', [ null ]));

    // Assert.
    expect([ old.every(sprite => sprite.destroyed), stand.textures[0].destroyed, sprites().slice(9).map(sprite => [ sprite.width, sprite.height ]) ])
      .toStrictEqual([ true, true, [ [ 256, 256 ], [ 128, 256 ], [ 256, 128 ], [ 128, 128 ] ] ]);
  });

  it('lets go of everything once the map is no longer dark', () =>
  {
    // Arrange: a lit cave drawn.
    const { draw, sprites, mask, kept } = maskOnStage();
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]));

    // Act: the note no longer says it is dark.
    draw(mapOf(16, '', [ null, torchAt(1, 1, 1) ]));

    // Assert.
    expect([ sprites().every(sprite => sprite.destroyed), stand.textures[0].destroyed, mask.litChunks, kept[kept.length - 1] ])
      .toStrictEqual([ true, true, 0, [] ]);
  });

  it('keeps only the pictures the map\'s lights draw after each draw', () =>
  {
    // Arrange: a torch, and a lamp reaching two tiles in white.
    const lamp: RmmzMapEvent = { ...event(2, [ page([ command(108, [ '<light:[2]>' ]) ]) ]), x: 9, y: 9 };
    const { draw, kept } = maskOnStage();

    // Act.
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1), lamp ]));

    // Assert.
    expect(kept)
      .toStrictEqual([ [ TORCH, '96:#ffffff:0' ] ]);
  });

  it('lets go of everything, pictures and its container included, when destroyed', () =>
  {
    // Arrange: a lit cave drawn.
    const { draw, sprites, root, mask, destroyed, containers } = maskOnStage();
    draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1) ]));
    const drawn = [ ...sprites() ];

    // Act.
    mask.destroy();

    // Assert: the pieces, the lit piece's texture and the sprites added into it, the pictures, and the mask's container.
    const [ added ] = containers as unknown as { destroyed: boolean }[];
    expect([ drawn.every(sprite => sprite.destroyed), stand.textures[0].destroyed, added.destroyed, destroyed(), (root as unknown as { destroyed: boolean }).destroyed ])
      .toStrictEqual([ true, true, true, true, true ]);
  });

  describe('tick', () =>
  {
    it('draws again, as it stands, only a piece a light whose effect runs reaches, every light in it at its strength now', () =>
    {
      // Arrange: a flickering torch at 1, 1 and a steady lamp at 3, 2 share the first piece; a steady lamp at 12, 12 has
      // the last to itself. All drawn at frame 0.
      const { draw, tick, passes, containers, asked } = maskOnStage(dimming);
      const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1, 'flicker'), torchAt(2, 3, 2), torchAt(3, 12, 12) ]);
      draw(cave, 1, at(0));
      asked.splice(0);

      // Act.
      const moved = tick(cave, at(10));

      // Assert: one pass, into the first piece's texture with the sprites it has, the torch at 0.9 and the lamp at full;
      // the last piece's lamp never asked after.
      expect([ moved, passes.length, passes[2].target === passes[0].target, containers[2] === containers[0] ])
        .toStrictEqual([ true, 3, true, true ]);
      expect([ passes[2].added.map(added => added.alpha), asked ])
        .toStrictEqual([ [ 0.9, 1 ], [ 'page:1#0 at 10', 'page:2#0 at 10' ] ]);
    });

    it('draws nothing again on a tick where every light burns as it was drawn', () =>
    {
      // Arrange: a flickering torch drawn at frame 10.
      const { draw, tick, passes } = maskOnStage(dimming);
      const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1, 'flicker') ]);
      draw(cave, 1, at(10));

      // Act: the clock still on frame 10.
      const moved = tick(cave, at(10));

      // Assert.
      expect([ moved, passes.length ])
        .toStrictEqual([ false, 1 ]);
    });

    it('asks after no light on a tick while every light on the map is steady', () =>
    {
      // Arrange: two steady torches in the dark.
      const { draw, tick, passes, asked, mask } = maskOnStage(dimming);
      const cave = mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1), torchAt(2, 12, 12) ]);
      draw(cave, 1, at(0));
      asked.splice(0);

      // Act.
      const moved = tick(cave, at(10));

      // Assert.
      expect([ moved, passes.length, asked, mask.movingChunks ])
        .toStrictEqual([ false, 2, [], 0 ]);
    });

    it('asks after no light on a tick on a map nobody calls dark', () =>
    {
      // Arrange: a flickering torch on a map with no darkness.
      const { draw, tick, passes, asked } = maskOnStage(dimming);
      const field = mapOf(16, '', [ null, torchAt(1, 1, 1, 'flicker') ]);
      draw(field, 1, at(0));

      // Act.
      const moved = tick(field, at(10));

      // Assert.
      expect([ moved, passes.length, asked ])
        .toStrictEqual([ false, 0, [] ]);
    });

    it('asks after no light on a tick once the map is no longer dark', () =>
    {
      // Arrange: a flickering torch in a cave drawn, then the cave's darkness taken away and drawn again.
      const { draw, tick, passes, asked } = maskOnStage(dimming);
      draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 1, 1, 'flicker') ]), 1, at(0));
      const field = mapOf(16, '', [ null, torchAt(1, 1, 1, 'flicker') ]);
      draw(field, 1, at(0));
      asked.splice(0);

      // Act.
      const moved = tick(field, at(10));

      // Assert.
      expect([ moved, passes.length, asked ])
        .toStrictEqual([ false, 1, [] ]);
    });
  });

  describe('movingChunks', () =>
  {
    it('counts every piece a light whose effect runs reaches, and no piece steady lights alone reach', () =>
    {
      // Arrange: a flickering torch at 5, 5, whose picture spans the corner of the first four pieces, and a steady lamp
      // at 12, 12 in the last.
      const { draw, mask } = maskOnStage(dimming);

      // Act.
      draw(mapOf(16, '<ambient:[85]>', [ null, torchAt(1, 5, 5, 'flicker'), torchAt(2, 12, 12) ]), 1, at(0));

      // Assert.
      expect([ mask.movingChunks, mask.litChunks ])
        .toStrictEqual([ 4, 5 ]);
    });
  });
});
