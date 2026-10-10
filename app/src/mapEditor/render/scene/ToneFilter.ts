import { defaultFilterVert, Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { ScreenTone } from '../../core/renderer/lightingLayer.ts';

/**
 * The engine's colour filter (ColorFilter in js/rmmz_core.js), as the spriteset's base sprite applies it with a screen
 * tone: each pixel's colour is turned into hue, saturation and lightness, its saturation drained by the tone's grey,
 * turned back, and the tone's red, green and blue added in, clamped to the screen's range. The arithmetic, its order and
 * the precision it asks for are the engine's own, line for line, so a toned map matches the game's. The hue, the blend
 * colour and the brightness the engine's filter also carries stay at rest on the base sprite (flashes and fades are the
 * spriteset's other filter, which the editor never shows), and they are kept here at those values so the arithmetic is
 * still the engine's, step for step.
 *
 * A pixel with nothing in it is left empty: the engine never meets one, since its black screen fills the base sprite,
 * but the editor's toned layers reach past the map where an event stands on its top row, and dividing by its alpha
 * would make nothing of it.
 */
const TONE_FRAGMENT = `
in vec2 vTextureCoord;

out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uHue;
uniform vec4 uColorTone;
uniform vec4 uBlendColor;
uniform float uBrightness;

vec3 rgbToHsl(vec3 rgb)
{
  float r = rgb.r;
  float g = rgb.g;
  float b = rgb.b;
  float cmin = min(r, min(g, b));
  float cmax = max(r, max(g, b));
  float h = 0.0;
  float s = 0.0;
  float l = (cmin + cmax) / 2.0;
  float delta = cmax - cmin;
  if (delta > 0.0)
  {
    if (r == cmax)
    {
      h = mod((g - b) / delta + 6.0, 6.0) / 6.0;
    }
    else if (g == cmax)
    {
      h = ((b - r) / delta + 2.0) / 6.0;
    }
    else
    {
      h = ((r - g) / delta + 4.0) / 6.0;
    }
    if (l < 1.0)
    {
      s = delta / (1.0 - abs(2.0 * l - 1.0));
    }
  }
  return vec3(h, s, l);
}

vec3 hslToRgb(vec3 hsl)
{
  float h = hsl.x;
  float s = hsl.y;
  float l = hsl.z;
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs((mod(h * 6.0, 2.0)) - 1.0));
  float m = l - c / 2.0;
  float cm = c + m;
  float xm = x + m;
  if (h < 1.0 / 6.0)
  {
    return vec3(cm, xm, m);
  }
  else if (h < 2.0 / 6.0)
  {
    return vec3(xm, cm, m);
  }
  else if (h < 3.0 / 6.0)
  {
    return vec3(m, cm, xm);
  }
  else if (h < 4.0 / 6.0)
  {
    return vec3(m, xm, cm);
  }
  else if (h < 5.0 / 6.0)
  {
    return vec3(xm, m, cm);
  }
  else
  {
    return vec3(cm, m, xm);
  }
}

void main()
{
  vec4 texel = texture(uTexture, vTextureCoord);
  float a = texel.a;
  if (a == 0.0)
  {
    finalColor = vec4(0.0);
    return;
  }
  vec3 hsl = rgbToHsl(texel.rgb);
  hsl.x = mod(hsl.x + uHue / 360.0, 1.0);
  hsl.y = hsl.y * (1.0 - uColorTone.a / 255.0);
  vec3 rgb = hslToRgb(hsl);
  float r = rgb.r;
  float g = rgb.g;
  float b = rgb.b;
  float r2 = uColorTone.r / 255.0;
  float g2 = uColorTone.g / 255.0;
  float b2 = uColorTone.b / 255.0;
  float r3 = uBlendColor.r / 255.0;
  float g3 = uBlendColor.g / 255.0;
  float b3 = uBlendColor.b / 255.0;
  float i3 = uBlendColor.a / 255.0;
  float i1 = 1.0 - i3;
  r = clamp((r / a + r2) * a, 0.0, 1.0);
  g = clamp((g / a + g2) * a, 0.0, 1.0);
  b = clamp((b / a + b2) * a, 0.0, 1.0);
  r = clamp(r * i1 + r3 * i3 * a, 0.0, 1.0);
  g = clamp(g * i1 + g3 * i3 * a, 0.0, 1.0);
  b = clamp(b * i1 + b3 * i3 * a, 0.0, 1.0);
  r = r * uBrightness / 255.0;
  g = g * uBrightness / 255.0;
  b = b * uBrightness / 255.0;
  finalColor = vec4(r, g, b, a);
}
`;

/**
 * What the engine's base filter holds at rest: no hue rotation, no blend colour, and full brightness.
 */
const AT_REST = { hue: 0, blendColor: [ 0, 0, 0, 0 ], brightness: 255 };

/**
 * The engine's screen tone, as a pixi filter: set on the container holding everything the game tones (the black behind
 * the map, the parallax, the tiles and the events), it casts a tone over all of it as the game's base sprite does, and
 * over nothing above it. It renders at the view's own resolution, so the map stays as sharp as it is drawn.
 */
class ToneFilter extends Filter
{
  #uniforms: UniformGroup<{ uColorTone: { value: Float32Array; type: 'vec4<f32>' } }>;

  /**
   * @param {ScreenTone} tone The tone to start with.
   */
  constructor(tone: ScreenTone)
  {
    const uniforms = new UniformGroup({
      uHue: { value: AT_REST.hue, type: 'f32' },
      uColorTone: { value: new Float32Array(tone), type: 'vec4<f32>' },
      uBlendColor: { value: new Float32Array(AT_REST.blendColor), type: 'vec4<f32>' },
      uBrightness: { value: AT_REST.brightness, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: TONE_FRAGMENT, name: 'screen-tone-filter' }),
      resources: { toneUniforms: uniforms },
      resolution: 'inherit',
    });
    this.#uniforms = uniforms;
  }

  /**
   * The tone cast now.
   * @returns {ScreenTone} The tone.
   */
  get tone(): ScreenTone
  {
    const [ red, green, blue, grey ] = this.#uniforms.uniforms.uColorTone;
    return [ red, green, blue, grey ];
  }

  /**
   * Casts another tone.
   * @param {ScreenTone} tone The tone.
   */
  set tone(tone: ScreenTone)
  {
    this.#uniforms.uniforms.uColorTone = new Float32Array(tone);
  }
}

export { TONE_FRAGMENT, ToneFilter };
