import { GlProgram, Mesh, MeshGeometry, RenderTexture, Shader, UniformGroup } from 'pixi.js';
import type { MaskChunk } from './maskChunks.ts';

/**
 * Places a lit piece's corners where the stage puts them, as pixi's own meshes are placed: the piece's own transform,
 * then the world's, then the view's projection.
 */
const LIT_PIECE_VERTEX = `
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main()
{
  mat3 modelViewProjection = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((modelViewProjection * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

/**
 * Shows a lit piece as J-Lighting's sheet would be at that spot: the dark's fill with the lights added to it, each
 * channel held to white, as the sheet's own texture holds every sum it is drawn with. The lights are added into the
 * piece's texture over black, so the fill is added here instead, as the piece shows; adding it after the lights or
 * before them gives the very same sheet, since the fill is a whole step of the texture's own and only white holds either
 * sum back.
 */
const LIT_PIECE_FRAGMENT = `
in vec2 vUV;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uFill;

void main()
{
  vec3 lights = texture(uTexture, vUV).rgb;
  finalColor = vec4(min(uFill + lights, vec3(1.0)), 1.0);
}
`;

/**
 * Splits a colour into its red, green and blue, each as a share of full, as a shader reads a colour.
 * @param {number} color The colour, as {@code 0xRRGGBB}.
 * @returns {Float32Array} The three shares.
 */
const channelsOf = (color: number): Float32Array =>
{
  return new Float32Array([ ((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255 ]);
};

/**
 * One piece of a dark map's mask that a light reaches, as a view shows it: a texture of its own that the lights
 * reaching it are added into, over black, and a quad showing that texture over the piece with the dark's fill added to
 * it, multiplied into the map beneath, as the game multiplies its sheet. The fill is the piece's own setting rather
 * than part of its texture, so a deeper or lighter dark is repainted at once, with nothing drawn into the texture again;
 * only the lights changing, or how brightly they burn, draws it again.
 */
class LitPiece
{
  /**
   * The quad showing the piece, sized to it, which the mask places at the piece's corner.
   */
  readonly mesh: Mesh<MeshGeometry, Shader>;

  /**
   * The texture the lights reaching the piece are added into.
   */
  readonly texture: RenderTexture;

  #geometry: MeshGeometry;

  #shader: Shader;

  #fill: UniformGroup<{ uFill: { value: Float32Array; type: 'vec3<f32>' } }>;

  #tint: number;

  /**
   * @param {MaskChunk} rect The piece, in world pixels.
   * @param {number} tint The dark's fill to show with, as {@code 0xRRGGBB}.
   */
  constructor(rect: MaskChunk, tint: number)
  {
    const { width, height } = rect;
    this.texture = RenderTexture.create({ width, height });
    this.#tint = tint;
    this.#fill = new UniformGroup({ uFill: { value: channelsOf(tint), type: 'vec3<f32>' } });
    this.#geometry = new MeshGeometry({
      positions: new Float32Array([ 0, 0, width, 0, width, height, 0, height ]),
      uvs: new Float32Array([ 0, 0, 1, 0, 1, 1, 0, 1 ]),
      indices: new Uint32Array([ 0, 1, 2, 0, 2, 3 ]),
    });

    // the program is pixi's to keep: one made from the same source is the same program, shared by every piece.
    const glProgram = GlProgram.from({ vertex: LIT_PIECE_VERTEX, fragment: LIT_PIECE_FRAGMENT, name: 'lit-mask-piece' });
    this.#shader = new Shader({ glProgram, resources: { uTexture: this.texture.source, fillUniforms: this.#fill } });
    this.mesh = new Mesh({ geometry: this.#geometry, shader: this.#shader });
    this.mesh.blendMode = 'multiply';
    this.mesh.position.set(rect.x, rect.y);
  }

  /**
   * The dark's fill the piece shows with.
   * @returns {number} The fill, as {@code 0xRRGGBB}.
   */
  get fill(): number
  {
    return this.#tint;
  }

  /**
   * Repaints the piece with another fill, as a deeper or lighter dark asks, drawing nothing into its texture.
   * @param {number} tint The fill, as {@code 0xRRGGBB}.
   */
  set fill(tint: number)
  {
    this.#tint = tint;
    this.#fill.uniforms.uFill = channelsOf(tint);
  }

  /**
   * Lets go of the quad, its geometry and its shader, and the texture, leaving the program every piece shares.
   */
  destroy(): void
  {
    // the quad lets go of its geometry and shader without destroying them, so they go after it.
    this.mesh.destroy();
    this.#geometry.destroy();
    this.#shader.destroy();
    this.texture.destroy(true);
  }
}

export { channelsOf, LIT_PIECE_FRAGMENT, LIT_PIECE_VERTEX, LitPiece };
