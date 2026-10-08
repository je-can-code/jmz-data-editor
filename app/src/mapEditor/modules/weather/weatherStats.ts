import type { WeatherField } from './weatherField.ts';

/**
 * The spread of one number across a population: its least, its greatest, and its mean; all three 0 for no one.
 */
type Spread = {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
};

/**
 * One layer's population summed up, the way the parity check holds it against the game's own: how many particles, in
 * which life, how many still waiting, what share is on the screen, and the spread of how fast, which way, how big, how
 * turned and how strongly the first-life particles draw, and how long they live.
 */
type LayerStats = {
  readonly count: number;
  readonly firstLife: number;
  readonly secondLife: number;
  readonly waiting: number;
  readonly onScreen: number;
  readonly velocityX: Spread;
  readonly velocityY: Spread;
  readonly scaleX: Spread;
  readonly scaleY: Spread;
  readonly rotation: Spread;
  readonly life: Spread;
  readonly opacity: Spread;
};

/**
 * Sums up the spread of some numbers.
 * @param {readonly number[]} values The numbers.
 * @returns {Spread} Their least, greatest and mean, or zeroes for none.
 */
const spreadOf = (values: readonly number[]): Spread =>
{
  if (values.length === 0)
  {
    return { min: 0, max: 0, mean: 0 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  values.forEach(value =>
  {
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  });
  return { min, max, mean: sum / values.length };
};

/**
 * Sums up one layer's population as it shows now: the spreads read the particles in their first life, which move as the
 * layer's own motion says, and the opacity reads every particle as it draws, a waiting one drawing at nothing.
 * @param {WeatherField} field The layer's population.
 * @returns {LayerStats} The summary.
 */
const layerStatsOf = (field: WeatherField): LayerStats =>
{
  const { particles, bounds } = field;
  const first = particles.filter(particle => particle.stage === 0);
  const looks = particles.map((_, index) => field.lookOf(index));
  const onScreen = particles.filter(particle => particle.x >= 0 && particle.x <= bounds.width && particle.y >= 0 && particle.y <= bounds.height);
  return {
    count: particles.length,
    firstLife: first.length,
    secondLife: particles.length - first.length,
    waiting: particles.filter(particle => particle.stagger > 0).length,
    onScreen: particles.length === 0 ? 0 : onScreen.length / particles.length,
    velocityX: spreadOf(first.map(particle => particle.velocityX)),
    velocityY: spreadOf(first.map(particle => particle.velocityY)),
    scaleX: spreadOf(looks.filter(look => look.stage === 0).map(look => look.scaleX)),
    scaleY: spreadOf(first.map(particle => particle.scaleY)),
    rotation: spreadOf(first.map(particle => particle.rotation)),
    life: spreadOf(first.map(particle => particle.life)),
    opacity: spreadOf(looks.map(look => look.opacity)),
  };
};

export { layerStatsOf, spreadOf };
export type { LayerStats, Spread };
