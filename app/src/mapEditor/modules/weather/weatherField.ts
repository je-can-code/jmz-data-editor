import {
  advance,
  entryDepthOf,
  facingScaleX,
  glowFor,
  hasEscaped,
  hasExpired,
  isDrained,
  marginOf,
  resolveEdge,
  settledOpacityFor,
  spawn,
  succeed,
  type PlayerTravel,
  type WeatherBounds,
  type WeatherParticle,
} from './weatherMotion.ts';
import type { WeatherLayer } from './weatherPresets.ts';
import { rollsFrom, type Roller } from './weatherRandom.ts';

/**
 * How one particle shows in a frame, as Sprite_WeatherLayer#drawParticle puts it on its sprite: where, turned how far,
 * how wide and tall, how strongly out of 255, and which of its lives it is in, which decides its picture.
 */
type ParticleLook = {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly opacity: number;
  readonly stage: number;
};

/**
 * The screen an authored density is expressed against: RPG Maker's default window (Sprite_WeatherLayer.ReferenceArea).
 */
const REFERENCE_AREA = 816 * 624;

/**
 * The most frames any one particle is run forward for when the weather settles (Sprite_WeatherLayer.MaxSettleFrames).
 */
const MAX_SETTLE_FRAMES = 12000;

/**
 * The slowest a particle is taken to travel when working out how long its journey settles for, in pixels a frame.
 */
const SLOWEST_PACE = 0.05;

/**
 * The editor's player never walks: a map open in the editor is a player standing still, so a motion entering from the
 * leading edge enters from where it is headed, as it does around a player at rest.
 */
const STANDING_STILL: PlayerTravel = { x: 0, y: 0 };

/**
 * How many particles an authored density builds on a screen, as Sprite_WeatherLayer#particleCount works it out: a density
 * is per RPG Maker's default window, scaled by area, since coverage is areal.
 * @param {number} density The layer's density.
 * @param {WeatherBounds} bounds The screen.
 * @returns {number} The count.
 */
const particleCountFor = (density: number, bounds: WeatherBounds): number =>
{
  const area = bounds.width * bounds.height;
  return Math.round(density * (area / REFERENCE_AREA));
};

/**
 * How many frames one full round trip takes a particle, as Sprite_WeatherLayer.settleFramesFor works it out: a mortal
 * one has its own lifetime to be scattered over, and anything else the whole crossing, margins and entry queue included,
 * at its own pace, held to a ceiling.
 * @param {WeatherParticle} particle The particle being settled.
 * @param {WeatherLayer} layer The motion it was born from.
 * @param {WeatherBounds} bounds The screen it crosses.
 * @returns {number} The frames.
 */
const settleFramesFor = (particle: WeatherParticle, layer: WeatherLayer, bounds: WeatherBounds): number =>
{
  if (particle.life > 0)
  {
    return particle.life;
  }

  const pace = Math.max(Math.abs(particle.velocityX), Math.abs(particle.velocityY), SLOWEST_PACE);
  const distance = (marginOf(layer) * 2) + entryDepthOf(layer) + bounds.width + bounds.height;
  return Math.min(distance / pace, MAX_SETTLE_FRAMES);
};

/**
 * One layer of a map's weather as a population of particles, moved exactly as Sprite_WeatherLayer moves its own, with no
 * pictures of its own: what draws it reads each particle's look a frame at a time.
 *
 * The population is fixed in size for a screen and never reallocated: a particle that leaves is rebuilt at an edge with
 * fresh rolls, one that runs out of life turns into what its layer becomes, right where it ended, and what a successor
 * leaves behind is a fresh particle of the layer's own. An arrival runs every particle forward a random slice of its own
 * journey first, so the weather opens as weather that has been going a while.
 *
 * The game's screen never changes size; a map view's does, as the author zooms and pans past the map's edges. When the
 * screen this falls across resizes, every particle keeps its place on it, stretched with it, and the population grows or
 * shrinks to the count the new size takes, newcomers settled as on arrival and the surplus let go from the end, so the
 * weather stays as thick as the game's.
 */
class WeatherField
{
  #layer: WeatherLayer;

  #bounds: WeatherBounds;

  #roll: Roller;

  #particles: WeatherParticle[] = [];

  #retired = false;

  /**
   * Builds the population for a screen, settled as on arrival or left at the edges to stagger in.
   * @param {WeatherLayer} layer What the layer draws and how it moves.
   * @param {WeatherBounds} bounds The screen it falls across.
   * @param {Roller} roll Where its rolls come from.
   * @param {boolean} isArrival Whether to settle it, as the game does when the player arrives.
   */
  constructor(layer: WeatherLayer, bounds: WeatherBounds, roll: Roller, isArrival: boolean)
  {
    this.#layer = layer;
    this.#bounds = bounds;
    this.#roll = roll;
    this.#grow(particleCountFor(layer.density, bounds), isArrival);
  }

  /**
   * What the layer draws and how it moves.
   * @returns {WeatherLayer} The layer.
   */
  get layer(): WeatherLayer
  {
    return this.#layer;
  }

  /**
   * The screen the weather falls across.
   * @returns {WeatherBounds} The bounds.
   */
  get bounds(): WeatherBounds
  {
    return this.#bounds;
  }

  /**
   * The particles, in the order their pictures draw.
   * @returns {readonly WeatherParticle[]} The population.
   */
  get particles(): readonly WeatherParticle[]
  {
    return this.#particles;
  }

  /**
   * Whether the layer is on its way out, replacing nothing that finishes.
   * @returns {boolean} True once retired.
   */
  get retired(): boolean
  {
    return this.#retired;
  }

  /**
   * Stops replacing the particles that finish, so the layer empties at its own pace (Sprite_WeatherLayer#retire); what is
   * alive carries on to its own end, turning into what it becomes on the way.
   */
  retire(): void
  {
    this.#retired = true;
  }

  /**
   * Reports whether the layer has finished emptying (Sprite_WeatherLayer#isDrained).
   * @returns {boolean} True once every particle is done for good.
   */
  isDrained(): boolean
  {
    return isDrained(this.#particles);
  }

  /**
   * The motion one particle lives by now (Sprite_WeatherLayer#paramsFor): the layer's own for a first life, and what the
   * layer becomes for a second.
   * @param {number} index The particle.
   * @returns {WeatherLayer} Its motion.
   */
  paramsFor(index: number): WeatherLayer
  {
    const particle = this.#particles[index];
    if (particle.stage === 0)
    {
      return this.#layer;
    }

    return this.#layer.becomes as WeatherLayer;
  }

  /**
   * How one particle shows now (Sprite_WeatherLayer#drawParticle): turned over by its flip, and unseen while it waits out
   * its stagger.
   * @param {number} index The particle.
   * @returns {ParticleLook} Its look.
   */
  lookOf(index: number): ParticleLook
  {
    const particle = this.#particles[index];
    return {
      x: particle.x,
      y: particle.y,
      rotation: particle.rotation,
      scaleX: facingScaleX(particle),
      scaleY: particle.scaleY,
      opacity: particle.stagger > 0 ? 0 : glowFor(particle, this.paramsFor(index)),
      stage: particle.stage,
    };
  }

  /**
   * Moves every particle on by one frame, rebuilding those that finish (Sprite_WeatherLayer#updateParticles); a particle
   * done for good is left where it is.
   */
  step(): void
  {
    const bounds = this.#bounds;
    this.#particles.forEach((particle, index) =>
    {
      if (particle.done)
      {
        return;
      }

      const params = this.paramsFor(index);
      advance(particle, params);
      if (hasEscaped(particle, bounds, params) || hasExpired(particle))
      {
        this.#reseat(index);
      }
    });
  }

  /**
   * Moves the weather onto a screen of another size: every particle keeps its place on it, stretched with it, and the
   * population grows or shrinks to the count the new size takes, newcomers settled as on arrival and the surplus let go
   * from the end, so it thins evenly. A screen of the same size changes nothing.
   * @param {WeatherBounds} bounds The new screen.
   */
  resize(bounds: WeatherBounds): void
  {
    const previous = this.#bounds;
    if (previous.width === bounds.width && previous.height === bounds.height)
    {
      return;
    }

    // every particle stays where it was on the screen, as a fraction of it.
    const across = bounds.width / previous.width;
    const down = bounds.height / previous.height;
    this.#particles.forEach(particle =>
    {
      particle.x *= across;
      particle.y *= down;
    });
    this.#bounds = bounds;

    const wanted = particleCountFor(this.#layer.density, bounds);
    if (wanted < this.#particles.length)
    {
      this.#particles.length = wanted;
      return;
    }

    this.#grow(wanted - this.#particles.length, true);
  }

  /**
   * Adds particles to the end of the population, settled as on arrival or left to stagger in from the edges
   * (Sprite_WeatherLayer#createParticles).
   * @param {number} count How many.
   * @param {boolean} isArrival Whether to settle them.
   */
  #grow(count: number, isArrival: boolean): void
  {
    const first = this.#particles.length;
    for (let made = 0; made < count; made++)
    {
      this.#particles.push(this.#buildParticle());
    }

    // a change of weather lets its newcomers stagger in; an arrival finds weather that has been going.
    if (isArrival === false)
    {
      return;
    }

    for (let index = first; index < this.#particles.length; index++)
    {
      this.#settle(index);
    }
  }

  /**
   * Runs one particle forward by a random slice of its own journey (Sprite_WeatherLayer#settle), rebuilding it whenever it
   * finishes on the way, then leaves it fully faded in, as a population that has been going a while is, and waiting for
   * nothing.
   * @param {number} index The particle.
   */
  #settle(index: number): void
  {
    const bounds = this.#bounds;
    const frames = Math.floor(this.#roll() * settleFramesFor(this.#particles[index], this.#layer, bounds));
    for (let frame = 0; frame < frames; frame++)
    {
      // read afresh every step, since a particle that finishes is replaced outright.
      const living = this.#particles[index];
      const params = this.paramsFor(index);
      advance(living, params);
      if (hasEscaped(living, bounds, params) || hasExpired(living))
      {
        this.#reseat(index);
      }
    }

    const settled = this.#particles[index];
    settled.opacity = settledOpacityFor(settled, this.paramsFor(index));
    settled.stagger = 0;
  }

  /**
   * Builds one particle entering from the layer's own edge, resolved for a player standing still
   * (Sprite_WeatherLayer#buildParticle).
   * @returns {WeatherParticle} The newborn particle.
   */
  #buildParticle(): WeatherParticle
  {
    const entry = resolveEdge(this.#layer, STANDING_STILL);
    return spawn(this.#layer, this.#bounds, entry, rollsFrom(this.#roll));
  }

  /**
   * Rebuilds a particle whose turn has ended (Sprite_WeatherLayer#reseatParticle): one that ran out of its first life
   * turns into what its layer becomes, where it ended; one in a retiring layer is done for good; anything else starts
   * again at an edge with fresh rolls, already on screen, so it waits for nothing.
   * @param {number} index The particle.
   */
  #reseat(index: number): void
  {
    const particle = this.#particles[index];
    const successor = this.#successorFor(particle);
    if (successor !== null)
    {
      this.#particles[index] = succeed(particle, successor, this.#bounds, rollsFrom(this.#roll));
      return;
    }

    // a retiring layer replaces nothing, which is the whole of how it empties.
    if (this.#retired)
    {
      particle.done = true;
      return;
    }

    const replacement = this.#buildParticle();
    replacement.stagger = 0;
    this.#particles[index] = replacement;
  }

  /**
   * What a particle turns into when its turn ends (Sprite_WeatherLayer#successorFor): only a first life that ran out of
   * life leaves anything behind, and only when the layer becomes something.
   * @param {WeatherParticle} particle The particle.
   * @returns {WeatherLayer | null} The successor's motion, or null when the particle simply starts again.
   */
  #successorFor(particle: WeatherParticle): WeatherLayer | null
  {
    if (particle.stage > 0 || hasExpired(particle) === false)
    {
      return null;
    }

    return this.#layer.becomes;
  }
}

export { MAX_SETTLE_FRAMES, particleCountFor, REFERENCE_AREA, settleFramesFor, WeatherField };
export type { ParticleLook };
