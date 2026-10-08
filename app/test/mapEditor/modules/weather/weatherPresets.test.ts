import { describe, expect, it } from 'vitest';
import type { WeatherConfigFile } from '../../../../src/mapEditor/modules/weather/weatherConfig.ts';
import { layersFor } from '../../../../src/mapEditor/modules/weather/weatherPresets.ts';

/*
 * A look is turned into the layers that draw it exactly as WeatherPresets#layersFor turns it, so every number the editor
 * moves a particle by is the number the game moves it by. A look's strength picks a rung of its ladder, each rung a list
 * of authored layers, and each layer is folded together with the motion it names: the motion's speeds, jitters and
 * rates of wander and pulse scaled by the layer's speed as a percentage, its distances, lifetimes and per-frame fades
 * left alone, the layer's size and size jitter read as percentages, its opacity as a percentage of 255, rounded, and its
 * tint from hex text past the hash; a layer saying nothing of its jitter, opacity or tint gets none, full and untinted.
 * A motion that becomes something gives the layer one successor, one stage deep: the named motion carrying the layer's
 * stage picture, size (the layer's own when it names none), jitter, opacity and tint, at the layer's speed and blend.
 *
 * A look the config does not know (names are matched exactly, case and all), a strength its ladder lacks, and a name
 * every object holds by birth draw nothing, with the reason; a layer naming a motion the config lacks draws nothing
 * either, its density zero.
 */
describe('weatherPresets', () =>
{
  /**
   * Builds a config shaped like Chef Adventure's: rain that lands and leaves a ripple, shafts of light with a tint and an
   * opacity, a fog with a size jitter, and a layer naming a motion nobody wrote.
   * @returns {WeatherConfigFile} The config.
   */
  const config = (): WeatherConfigFile => ({
    motions: {
      raindrop: { edge: 'top', speedX: 0, speedY: 4, jitterX: 0, jitterY: 3, becomes: 'ripple', life: 30, lifeJitter: 132, fadeIn: 25, fadeOut: 40, roll: 0, growth: 0, staggerFrames: 120 },
      ripple: { edge: 'anywhere', speedX: 0, speedY: 0, jitterX: 0, jitterY: 0, becomes: 'raindrop', life: 26, fadeIn: 60, fadeOut: 12, roll: 0, growth: 0.011, staggerFrames: 0 },
      ray: { edge: 'anywhere', speedX: 0.12, speedY: 0.05, jitterX: 0.1, jitterY: 0.04, lean: 0.16, tilt: 0.02, stretch: 0.3, life: 600, fadeIn: 0.5, fadeOut: 0.5, roll: 0, growth: 0, staggerFrames: 300 },
      crawl: { edge: 'leading', speedX: 1.2, speedY: 0, jitterX: 1.1, jitterY: 0.15, sway: 26, swayRate: 0.028, pulse: 0.85, pulseRate: 0.055, roll: 0, growth: 0, fadeIn: 4, staggerFrames: 60, margin: 280, entryDepth: 700 },
    },
    presets: {
      rain: {
        stops: {
          moderate: [ { motion: 'raindrop', asset: 'Rain_01A', density: 450, speed: 170, scale: 100, blend: 'normal', becomesAsset: 'Particles', becomesScale: 9, becomesScaleJitter: 5, becomesOpacity: 34 } ],
          heavy: [ { motion: 'raindrop', asset: 'Rain_01A', density: 250, speed: 200, scale: 100, blend: 'normal' } ],
        },
      },
      clear: { stops: { light: [ { motion: 'ray', asset: 'SunLight_03A', density: 2, speed: 100, scale: 130, scaleJitter: 90, opacity: 26, tint: '#fff6d6', blend: 'additive' } ] } },
      fog: { stops: { moderate: [ { motion: 'crawl', asset: 'Cloud_05A', density: 44, speed: 30, scale: 140, scaleJitter: 90, blend: 'normal' } ] } },
      lost: { stops: { moderate: [ { motion: 'whirl', asset: 'Leaf_04A', density: 30, speed: 100, scale: 100, blend: 'multiply' } ] } },
    },
  });

  describe('layersFor', () =>
  {
    it('folds a layer into its motion, scaling the motion\'s speeds by the layer\'s, and reads its size as a percentage', () =>
    {
      // Arrange.
      const weather = config();

      // Act.
      const { layers, problem } = layersFor(weather, 'rain', 'moderate');
      const [ rain ] = layers;

      // Assert: speeds times 1.7, distances and lifetimes as written, full and untinted, a successor attached.
      expect([ problem, layers.length, { ...rain, becomes: rain.becomes === null ? null : 'a successor' } ])
        .toStrictEqual([ null, 1, {
          edge: 'top',
          speedX: 0,
          speedY: 6.8,
          jitterX: 0,
          jitterY: 5.1,
          roll: 0,
          growth: 0,
          fadeIn: 25,
          staggerFrames: 120,
          margin: undefined,
          entryDepth: undefined,
          sway: undefined,
          swayRate: 0,
          life: 30,
          lifeJitter: 132,
          fadeOut: 40,
          drag: undefined,
          tilt: undefined,
          stretch: undefined,
          lean: undefined,
          flip: undefined,
          pulse: undefined,
          pulseRate: 0,
          scale: 1,
          scaleJitter: 0,
          peakOpacity: 255,
          tint: 0xffffff,
          asset: 'Rain_01A',
          density: 450,
          blend: 'normal',
          becomes: 'a successor',
        } ]);
    });

    it('gives a motion that becomes something one successor, carrying the layer\'s stage picture, size and strength', () =>
    {
      // Arrange.
      const weather = config();

      // Act.
      const [ rain ] = layersFor(weather, 'rain', 'moderate').layers;
      const ripple = rain.becomes;

      // Assert: the ripple's motion at the layer's speed, its own picture, size, jitter and opacity, and nothing after it,
      // though the ripple's motion names one.
      expect([ ripple?.edge, ripple?.growth, ripple?.life, ripple?.asset, ripple?.scale, ripple?.scaleJitter, ripple?.peakOpacity, ripple?.blend, ripple?.density, ripple?.becomes ])
        .toStrictEqual([ 'anywhere', 0.011, 26, 'Particles', 0.09, 0.05, 87, 'normal', 450, null ]);
    });

    it('sizes a successor as its layer when the layer names no stage size, untinted, full, and with no picture', () =>
    {
      // Arrange: heavy rain's second layer names nothing for its stage but the motion it becomes, as Chef Adventure's
      // does, so its drops land as ripples the game draws with its empty picture.
      const weather = config();

      // Act.
      const [ rain ] = layersFor(weather, 'rain', 'heavy').layers;

      // Assert.
      expect([ rain.becomes?.scale, rain.becomes?.scaleJitter, rain.becomes?.peakOpacity, rain.becomes?.tint, rain.becomes?.asset ])
        .toStrictEqual([ 1, 0, 255, 0xffffff, undefined ]);
    });

    it('reads a layer\'s opacity as a share of 255, its tint from hex, and its size jitter as a percentage', () =>
    {
      // Arrange.
      const weather = config();

      // Act.
      const [ ray ] = layersFor(weather, 'clear', 'light').layers;

      // Assert: 26% is 66 of 255, rounded.
      expect([ ray.peakOpacity, ray.tint, ray.scale, ray.scaleJitter, ray.lean, ray.tilt, ray.stretch, ray.blend, ray.becomes ])
        .toStrictEqual([ 66, 0xfff6d6, 1.3, 0.9, 0.16, 0.02, 0.3, 'additive', null ]);
    });

    it('scales a motion\'s rates of wander and pulse with the layer\'s speed, and leaves its distances as they are', () =>
    {
      // Arrange: a fog at 30% of its motion's pace.
      const weather = config();

      // Act.
      const [ fog ] = layersFor(weather, 'fog', 'moderate').layers;

      // Assert.
      expect([ fog.speedX, fog.jitterX, fog.sway, fog.swayRate, fog.pulse, fog.pulseRate, fog.margin, fog.entryDepth ])
        .toStrictEqual([ 0.36, 0.33, 26, 0.0084, 0.85, 0.0165, 280, 700 ]);
    });

    it('draws nothing for a look the config does not know, matched exactly, nor for a name every object holds', () =>
    {
      // Arrange: a capital the config does not use, a misspelling, and the name of an object's own constructor.
      const weather = config();
      const names = [ 'Rain', 'rian', 'constructor' ];

      // Act.
      const found = names.map(name => layersFor(weather, name, 'moderate'));

      // Assert.
      expect(found)
        .toStrictEqual([
          { layers: [], problem: 'no weather preset named Rain' },
          { layers: [], problem: 'no weather preset named rian' },
          { layers: [], problem: 'no weather preset named constructor' },
        ]);
    });

    it('draws nothing for a strength a look\'s ladder has no rung for', () =>
    {
      // Arrange: rain has no light rung here.
      const weather = config();

      // Act.
      const found = layersFor(weather, 'rain', 'light');

      // Assert.
      expect(found)
        .toStrictEqual({ layers: [], problem: 'preset rain has no intensity light' });
    });

    it('turns a layer naming a motion nobody wrote into one that draws nothing, keeping its picture and blend', () =>
    {
      // Arrange.
      const weather = config();

      // Act.
      const [ lost ] = layersFor(weather, 'lost', 'moderate').layers;

      // Assert.
      expect([ lost.density, lost.asset, lost.blend, lost.becomes, lost.speedY ])
        .toStrictEqual([ 0, 'Leaf_04A', 'multiply', null, 0 ]);
    });
  });

});
