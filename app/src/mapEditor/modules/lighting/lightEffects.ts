import type { LightStrength } from './darkScene.ts';
import type { EffectTunings } from './lightingConfig.ts';
import { phaseFrom, rateFrom, strengthFor } from './lightingEasing.ts';
import { lightRolls } from './lightSeeds.ts';
import type { LightEffect } from './lightTags.ts';

/**
 * Reports whether a light's effect moves it with time: every effect but steady does.
 * @param {LightEffect} effect The light's effect.
 * @returns {boolean} True for flicker, pulse and glitch.
 */
const isAnimated = (effect: LightEffect): boolean =>
{
  return effect !== 'steady';
};

/**
 * How brightly each light burns as J-Lighting animates it (LightingRenderLayer#strengthOf): a light whose effect runs
 * burns at the strength LightingEasing#strengthFor gives at the clock's frame, from its own start in its cycle and its
 * own tempo within the effect's variance, tuned as the project tunes that effect. The game rolls those two at random
 * the moment a light appears; here they are rolled from the light's map and its name, so a light keeps them for good.
 * A steady light burns at full strength, and so does every light while the view does not animate, as each would with
 * no effect running.
 * @param {EffectTunings} tunings How each effect runs in the project.
 * @returns {LightStrength} The strength of each light.
 */
const effectStrength = (tunings: EffectTunings): LightStrength =>
{
  return (light, clock) =>
  {
    const { effect } = light;
    if (effect === 'steady' || clock.animating === false)
    {
      return 1;
    }

    const tuning = tunings[effect];
    const rolls = lightRolls(light.mapId, light.id);
    return strengthFor(effect, clock.frames, phaseFrom(rolls.phase), tuning, rateFrom(rolls.rate, tuning.variance));
  };
};

export { effectStrength, isAnimated };
