import { describe, expect, it, vi } from 'vitest';
import { Container, Matrix, TextureSource, UniformGroup } from 'pixi.js';
import { Tilemap, TilemapPipe } from '../../../../../src/mapEditor/render/vendor/pixi-tilemap/index.ts';

/*
 * The editor vendors @pixi/tilemap 5.0.2 to fix two defects spike S6 found, and these tests hold the fixes.
 *
 * An edit after the first render must reach the screen: tile(), clear() and setTileset() tell the render group the
 * tilemap changed (5.0.2 set a flag the group never sees, and the flag left standing silenced every later edit), and
 * checkValid() answers whether validity changed, which is what the group asks (5.0.2 answered the inverse, so an
 * empty tilemap's first tile never drew and every ordinary edit forced a full rebuild).
 *
 * A tilemap inside a moved or zoomed render group must be placed once: execute() appends the tilemap's
 * groupTransform to the group's world transform, where 5.0.2 appended its worldTransform, which already holds it.
 *
 * And the chunks lean on one more behaviour: refilling a tilemap after clear() re-uploads its vertices even when the
 * new fill has as many tiles as the old one.
 */

/**
 * Makes a tilemap with one texture, inside a render group, as it would sit after its first build: the build is what
 * lowers didViewUpdate, so a later change has to raise it again and tell the group.
 * @returns {{ tilemap: Tilemap, group: Container, heard: ReturnType<typeof vi.fn> }} The tilemap, its group and a
 * spy on the group hearing about changes.
 */
const builtTilemap = () =>
{
  const group = new Container({ isRenderGroup: true });
  const tilemap = new Tilemap([ new TextureSource({ width: 96, height: 96 }) ]);
  group.addChild(tilemap);
  tilemap.didViewUpdate = false;
  const renderGroup = group.renderGroup as unknown as { onChildViewUpdate: (child: unknown) => void };
  const heard = vi.fn();
  renderGroup.onChildViewUpdate = heard;
  return { tilemap, group, heard };
};

/**
 * The tile options every test tile uses.
 */
const TILE = { u: 0, v: 0, tileWidth: 48, tileHeight: 48 };

/**
 * Builds a tilemap pipe over a stand-in renderer and adaptor, recording what the adaptor is asked to draw.
 * @param {Matrix} projection The projection the global uniforms hold.
 * @param {Matrix} world The render group's world transform the global uniforms hold.
 * @returns {{ pipe: TilemapPipe, uniforms: { u_proj_trans: Matrix }, draws: unknown[] }} The pipe, its uniforms and
 * every tilemap drawn.
 */
const buildPipe = (projection: Matrix, world: Matrix) =>
{
  const draws: unknown[] = [];
  const pipeUniforms = new UniformGroup({
    u_proj_trans: { value: new Matrix(), type: 'mat3x3<f32>' },
    u_anim_frame: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  const adaptor = {
    pipe_uniforms: pipeUniforms,
    init: () => undefined,
    destroy: () => undefined,
    execute: (_pipe: unknown, tilemap: unknown) => draws.push(tilemap),
  };
  const renderer = { globalUniforms: { _activeUniforms: [ { uniforms: { uProjectionMatrix: projection, uWorldTransformMatrix: world } } ] } };
  const pipe = new TilemapPipe(renderer as never, adaptor as never);
  return { pipe, uniforms: pipeUniforms.uniforms as { u_proj_trans: Matrix }, draws };
};

describe('pixi-tilemap fixes', () =>
{
  describe('Tilemap#checkValid', () =>
  {
    it('answers whether validity changed, for each of the four transitions', () =>
    {
      // Arrange.
      const tilemap = new Tilemap([ new TextureSource({ width: 96, height: 96 }) ]);

      // Act: empty to empty, empty to one tile, one tile to two, two tiles to empty.
      const answers: boolean[] = [];
      answers.push(tilemap.checkValid());
      tilemap.tile(0, 0, 0, TILE);
      answers.push(tilemap.checkValid());
      tilemap.tile(0, 48, 0, TILE);
      answers.push(tilemap.checkValid());
      tilemap.clear();
      answers.push(tilemap.checkValid());

      // Assert: only the first tile and the clearing change validity, so only they ask for a rebuild.
      expect([ answers, tilemap.is_valid ])
        .toStrictEqual([ [ false, true, false, true ], false ]);
    });
  });

  describe('Tilemap change notices', () =>
  {
    it('tells the render group about an edit made after the first build, once until the group catches up', () =>
    {
      // Arrange.
      const { tilemap, heard } = builtTilemap();

      // Act: two edits before the group catches up, then the group catches up and a third edit arrives.
      tilemap.tile(0, 0, 0, TILE);
      tilemap.tile(0, 48, 0, TILE);
      const beforeCatchUp = heard.mock.calls.length;
      tilemap.didViewUpdate = false;
      tilemap.tile(0, 96, 0, TILE);

      // Assert.
      expect([ beforeCatchUp, heard.mock.calls.length, heard.mock.calls.every(([ child ]) => child === tilemap) ])
        .toStrictEqual([ 1, 2, true ]);
    });

    it('tells the render group when a tilemap is cleared or given a new tileset, with no tile added', () =>
    {
      // Arrange.
      const cleared = builtTilemap();
      const retextured = builtTilemap();

      // Act.
      cleared.tilemap.clear();
      retextured.tilemap.setTileset([ new TextureSource({ width: 48, height: 48 }) ]);

      // Assert.
      expect([ cleared.heard.mock.calls.length, retextured.heard.mock.calls.length ])
        .toStrictEqual([ 1, 1 ]);
    });
  });

  describe('TilemapPipe#execute', () =>
  {
    it('places a tilemap in a moved and zoomed render group once, by its group transform', () =>
    {
      // Arrange: a render group zoomed to a half and moved by (100, 50), holding a tilemap at (48, 96) inside it.
      const projection = new Matrix(0.001, 0, 0, -0.002, -1, 1);
      const groupWorld = new Matrix(0.5, 0, 0, 0.5, 100, 50);
      const { tilemap, group } = builtTilemap();
      tilemap.tile(0, 0, 0, TILE);
      tilemap.relativeGroupTransform.copyFrom(new Matrix(1, 0, 0, 1, 48, 96));
      group.renderGroup?.worldTransform.copyFrom(groupWorld);
      const { pipe, uniforms, draws } = buildPipe(projection, groupWorld);

      // Act.
      pipe.execute({ renderPipeId: 'tilemap', tilemap } as never);

      // Assert: projection x group world x group transform; the doubled placement would differ.
      const once = projection.clone().append(groupWorld).append(tilemap.groupTransform);
      const twice = projection.clone().append(groupWorld).append(tilemap.worldTransform);
      const matrix = uniforms.u_proj_trans;
      expect([ [ matrix.a, matrix.d, matrix.tx, matrix.ty ], [ once.a, once.d, once.tx, once.ty ], twice.equals(once), draws.length ])
        .toStrictEqual([ [ once.a, once.d, once.tx, once.ty ], [ 0.0005, -0.001, -0.876, 0.804 ], false, 1 ]);
    });
  });

  describe('Tilemap#updateBuffer', () =>
  {
    it('uploads a refill after clear() even when it holds as many tiles as before', () =>
    {
      // Arrange: one tile at x 0, uploaded.
      const { pipe } = buildPipe(new Matrix(), new Matrix());
      const tilemap = new Tilemap([ new TextureSource({ width: 96, height: 96 }) ]);
      tilemap.tile(0, 0, 0, TILE);
      tilemap.updateBuffer(pipe);
      const [ firstX ] = tilemap.vb.getBuffer('aVertexPosition').data as Float32Array;

      // Act: cleared and refilled with one tile at x 96.
      tilemap.clear();
      tilemap.tile(0, 96, 0, TILE);
      tilemap.updateBuffer(pipe);
      const [ refilledX ] = tilemap.vb.getBuffer('aVertexPosition').data as Float32Array;

      // Assert.
      expect([ firstX, refilledX ])
        .toStrictEqual([ 0, 96 ]);
    });
  });
});
