import { describe, expect, it, vi } from 'vitest';
import { channelsOf, LIT_PIECE_FRAGMENT, LIT_PIECE_VERTEX, LitPiece } from '../../../../src/mapEditor/modules/lighting/litPiece.ts';

// a lit piece compiles a shader and draws through the GPU; stand-ins write down what it is built from instead.
vi.mock('pixi.js', () =>
{
  /**
   * Stands in for pixi's GL programs: the sources it is made from.
   */
  class GlProgram
  {
    static from(options: { vertex: string; fragment: string; name: string }): { vertex: string; fragment: string; name: string }
    {
      return options;
    }
  }

  /**
   * Stands in for pixi's uniform groups: the uniforms, as given, and their types.
   */
  class UniformGroup
  {
    uniforms: Record<string, unknown>;

    types: Record<string, string>;

    constructor(structures: Record<string, { value: unknown; type: string }>)
    {
      this.uniforms = Object.fromEntries(Object.entries(structures).map(([ name, structure ]) => [ name, structure.value ]));
      this.types = Object.fromEntries(Object.entries(structures).map(([ name, structure ]) => [ name, structure.type ]));
    }
  }

  /**
   * Stands in for pixi's shaders: what each is made with, and whether it was let go.
   */
  class Shader
  {
    options: { glProgram: unknown; resources: Record<string, unknown> };

    destroyed = false;

    constructor(options: { glProgram: unknown; resources: Record<string, unknown> })
    {
      this.options = options;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  /**
   * Stands in for pixi's mesh geometries: the corners, the texture's corners and the triangles.
   */
  class MeshGeometry
  {
    options: { positions: Float32Array; uvs: Float32Array; indices: Uint32Array };

    destroyed = false;

    constructor(options: { positions: Float32Array; uvs: Float32Array; indices: Uint32Array })
    {
      this.options = options;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  /**
   * Stands in for pixi's meshes, keeping what the piece sets on its quad.
   */
  class Mesh
  {
    options: { geometry: unknown; shader: unknown };

    blendMode = 'normal';

    position = {
      x: 0,
      y: 0,
      set(x: number, y: number)
      {
        this.x = x;
        this.y = y;
      },
    };

    destroyed = false;

    constructor(options: { geometry: unknown; shader: unknown })
    {
      this.options = options;
    }

    destroy(): void
    {
      this.destroyed = true;
    }
  }

  /**
   * Stands in for pixi's render textures: the size each is made at, its source, and how it was let go.
   */
  class RenderTexture
  {
    width = 0;

    height = 0;

    source = { name: 'the texture\'s source' };

    destroyedWith: boolean | null = null;

    static create(options: { width: number; height: number }): RenderTexture
    {
      const texture = new RenderTexture();
      texture.width = options.width;
      texture.height = options.height;
      return texture;
    }

    destroy(destroySource: boolean): void
    {
      this.destroyedWith = destroySource;
    }
  }

  return { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, UniformGroup };
});

/*
 * A piece of the mask a light reaches is shown as the game's sheet would be there: the lights reaching it are added
 * into a texture of its own, the piece's size, over black; and a quad over the piece, at its corner and its size, shows
 * that texture with the dark's fill added to it, held to white, multiplied into the map. The fill is the quad's own
 * setting, as shares of full, so a deeper or lighter dark repaints the piece in place, with nothing drawn into its
 * texture again. Every piece shows through one program, which pixi keeps; letting a piece go lets go of its quad, the
 * quad's geometry and shader, and its texture with its pixels, never the program.
 */
describe('LitPiece', () =>
{
  /**
   * What the stand-in quad was made with.
   */
  type BuiltMesh = {
    options: {
      geometry: { options: { positions: Float32Array; uvs: Float32Array; indices: Uint32Array }; destroyed: boolean };
      shader: {
        options: {
          glProgram: { vertex: string; fragment: string; name: string };
          resources: { uTexture: unknown; fillUniforms: { uniforms: { uFill: Float32Array }; types: Record<string, string> } };
        };
        destroyed: boolean;
      };
    };
    blendMode: string;
    position: { x: number; y: number };
    destroyed: boolean;
  };

  /**
   * A stand-in render texture, as the piece holds it.
   */
  type BuiltTexture = { width: number; height: number; source: unknown; destroyedWith: boolean | null };

  /**
   * Reads a fill back as whole channels, as the colour it was given.
   * @param {Float32Array} fill The fill, as shares of full.
   * @returns {number[]} The channels, 0 to 255.
   */
  const wholeChannels = (fill: Float32Array): number[] => [ ...fill ].map(share => Math.round(share * 255));

  it('draws its lights into a texture of its size, shown by a quad over the piece that multiplies it in with the fill', () =>
  {
    // Arrange: the second piece of the second row, cut short at a map's edge, in a dark of 85%.

    // Act.
    const piece = new LitPiece({ x: 512, y: 512, width: 112, height: 256 }, 0x262626);

    // Assert.
    const mesh = piece.mesh as unknown as BuiltMesh;
    const texture = piece.texture as unknown as BuiltTexture;
    const { geometry, shader } = mesh.options;
    expect([ texture.width, texture.height, mesh.position.x, mesh.position.y, mesh.blendMode ])
      .toStrictEqual([ 112, 256, 512, 512, 'multiply' ]);
    expect([ [ ...geometry.options.positions ], [ ...geometry.options.uvs ], [ ...geometry.options.indices ] ])
      .toStrictEqual([ [ 0, 0, 112, 0, 112, 256, 0, 256 ], [ 0, 0, 1, 0, 1, 1, 0, 1 ], [ 0, 1, 2, 0, 2, 3 ] ]);
    expect([ shader.options.glProgram, shader.options.resources.uTexture === texture.source ])
      .toStrictEqual([ { vertex: LIT_PIECE_VERTEX, fragment: LIT_PIECE_FRAGMENT, name: 'lit-mask-piece' }, true ]);
    expect([ wholeChannels(shader.options.resources.fillUniforms.uniforms.uFill), shader.options.resources.fillUniforms.types, piece.fill ])
      .toStrictEqual([ [ 38, 38, 38 ], { uFill: 'vec3<f32>' }, 0x262626 ]);
  });

  it('repaints with another fill in place, as a deeper dark asks, each channel its own', () =>
  {
    // Arrange: a piece in an 85% dark, then a teal one.
    const piece = new LitPiece({ x: 0, y: 0, width: 512, height: 512 }, 0x262626);

    // Act.
    piece.fill = 0x0a2a3a;

    // Assert.
    const { fillUniforms } = (piece.mesh as unknown as BuiltMesh).options.shader.options.resources;
    expect([ piece.fill, wholeChannels(fillUniforms.uniforms.uFill) ])
      .toStrictEqual([ 0x0a2a3a, [ 10, 42, 58 ] ]);
  });

  it('lets go of its quad, the quad\'s geometry and shader, and its texture with its pixels', () =>
  {
    // Arrange.
    const piece = new LitPiece({ x: 0, y: 0, width: 512, height: 512 }, 0x262626);
    const mesh = piece.mesh as unknown as BuiltMesh;

    // Act.
    piece.destroy();

    // Assert.
    expect([ mesh.destroyed, mesh.options.geometry.destroyed, mesh.options.shader.destroyed, (piece.texture as unknown as BuiltTexture).destroyedWith ])
      .toStrictEqual([ true, true, true, true ]);
  });

  it('adds the fill to the lights and holds each channel to white, as the game\'s sheet holds every sum', () =>
  {
    // Arrange: the lines that make the piece show what the sheet would.
    const lines = [ 'vec3 lights = texture(uTexture, vUV).rgb;', 'finalColor = vec4(min(uFill + lights, vec3(1.0)), 1.0);' ];

    // Act.
    const carried = lines.map(line => LIT_PIECE_FRAGMENT.includes(line));

    // Assert.
    expect(carried)
      .toStrictEqual([ true, true ]);
  });

  describe('channelsOf', () =>
  {
    it('splits a colour into its red, green and blue as shares of full', () =>
    {
      // Arrange: white, black, and a colour whose channels all differ.
      const colors = [ 0xffffff, 0x000000, 0xff8001 ];

      // Act.
      const channels = colors.map(color => wholeChannels(channelsOf(color)));

      // Assert.
      expect(channels)
        .toStrictEqual([ [ 255, 255, 255 ], [ 0, 0, 0 ], [ 255, 128, 1 ] ]);
    });
  });
});
