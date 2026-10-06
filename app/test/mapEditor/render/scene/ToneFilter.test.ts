import { describe, expect, it, vi } from 'vitest';
import { TONE_FRAGMENT, ToneFilter } from '../../../../src/mapEditor/render/scene/ToneFilter.ts';

// the filter compiles a shader, which needs a GPU; stand-ins write down what it is built from instead.
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
   * Stands in for pixi's uniform groups: the uniforms, as given.
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
   * Stands in for pixi's filters: the options it is made with.
   */
  class Filter
  {
    options: unknown;

    constructor(options: unknown)
    {
      this.options = options;
    }
  }

  return { defaultFilterVert: 'the default filter vertex', Filter, GlProgram, UniformGroup };
});

/*
 * The screen tone is the engine's own colour filter, run over everything the game tones: built from pixi's default
 * filter vertex and the engine's fragment, at the view's own resolution so the map stays sharp, with the tone as its
 * colour tone and the hue, the blend colour and the brightness the engine's base sprite leaves at rest. Its tone reads
 * back as cast, and takes each new tone in place.
 */
describe('ToneFilter', () =>
{
  /**
   * What the stand-in filter was made with.
   */
  type Built = {
    options: {
      glProgram: { vertex: string; fragment: string; name: string };
      resources: {
        toneUniforms: {
          uniforms: { uHue: number; uColorTone: Float32Array; uBlendColor: Float32Array; uBrightness: number };
          types: Record<string, string>;
        };
      };
      resolution: string;
    };
  };

  it('is made from the engine\'s fragment at the view\'s resolution, the tone given and the rest at rest', () =>
  {
    // Arrange: night halfway to Moontide.

    // Act.
    const built = new ToneFilter([ -32, -16, 37, 133 ]) as unknown as Built;

    // Assert.
    const { glProgram, resources, resolution } = built.options;
    const { uniforms, types } = resources.toneUniforms;
    expect([ glProgram, resolution ])
      .toStrictEqual([ { vertex: 'the default filter vertex', fragment: TONE_FRAGMENT, name: 'screen-tone-filter' }, 'inherit' ]);
    expect([ uniforms.uHue, [ ...uniforms.uColorTone ], [ ...uniforms.uBlendColor ], uniforms.uBrightness, types ])
      .toStrictEqual([
        0,
        [ -32, -16, 37, 133 ],
        [ 0, 0, 0, 0 ],
        255,
        { uHue: 'f32', uColorTone: 'vec4<f32>', uBlendColor: 'vec4<f32>', uBrightness: 'f32' },
      ]);
  });

  it('reads back the tone it casts, and takes another in place', () =>
  {
    // Arrange: the evening's cast.
    const filter = new ToneFilter([ 26, 0, -34, 22 ]);
    const cast = filter.tone;

    // Act.
    filter.tone = [ -31, -17, 35, 151 ];

    // Assert.
    const { uniforms } = (filter as unknown as Built).options.resources.toneUniforms;
    expect([ cast, filter.tone, [ ...uniforms.uColorTone ] ])
      .toStrictEqual([ [ 26, 0, -34, 22 ], [ -31, -17, 35, 151 ], [ -31, -17, 35, 151 ] ]);
  });

  it('carries the engine\'s colour arithmetic, a pixel with nothing in it left empty', () =>
  {
    // Arrange: the lines that make the engine's filter what it is.
    const lines = [
      'hsl.y = hsl.y * (1.0 - uColorTone.a / 255.0);',
      'r = clamp((r / a + r2) * a, 0.0, 1.0);',
      'r = clamp(r * i1 + r3 * i3 * a, 0.0, 1.0);',
      'r = r * uBrightness / 255.0;',
      'if (a == 0.0)',
    ];

    // Act.
    const carried = lines.map(line => TONE_FRAGMENT.includes(line));

    // Assert.
    expect(carried)
      .toStrictEqual([ true, true, true, true, true ]);
  });
});
