import type { WeatherLayer } from './weatherPresets.ts';

/**
 * One particle of weather, as J-Weather keeps it: a plain bag of numbers, moved in place a frame at a time. Everything
 * is in the pixels of the screen the weather falls across; a particle knows nothing of the map beneath it.
 */
type WeatherParticle = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;

  /**
   * How strongly it draws, out of 255, before any pulse.
   */
  opacity: number;

  /**
   * Where in its wander it is, in radians.
   */
  phase: number;

  /**
   * How many frames it has lived.
   */
  age: number;

  /**
   * How far through turning over it is, in radians.
   */
  flipPhase: number;

  /**
   * How far through blinking it is, in radians.
   */
  pulsePhase: number;

  /**
   * Which of its lives this is: 0 for the layer's own, 1 for what it becomes.
   */
  stage: number;

  /**
   * How many frames it lives, or 0 for one that lives until it leaves the screen.
   */
  life: number;

  /**
   * How many frames it still waits, unseen, before it starts moving.
   */
  stagger: number;

  /**
   * Whether it has finished for good, which only a layer on its way out lets happen.
   */
  done: boolean;
};

/**
 * Every independent choice a particle makes at birth, each a roll from 0 up to 1, in the order J-Weather draws them
 * (Sprite_WeatherLayer.rolls).
 */
type WeatherRolls = {
  readonly along: number;
  readonly across: number;
  readonly speedX: number;
  readonly speedY: number;
  readonly scale: number;
  readonly stagger: number;
  readonly life: number;
  readonly edge: number;
  readonly phase: number;
  readonly flip: number;
  readonly pulse: number;
  readonly tilt: number;
  readonly stretchX: number;
  readonly stretchY: number;
};

/**
 * The screen a particle crosses, in pixels.
 */
type WeatherBounds = {
  readonly width: number;
  readonly height: number;
};

/**
 * How far the player moved across the last frame, per axis.
 */
type PlayerTravel = {
  readonly x: number;
  readonly y: number;
};

/**
 * The edges a particle may enter the screen from (WeatherMotion.Edges): leading resolves to wherever the player is
 * walking, and anywhere scatters a particle over the screen instead of queueing it at an edge.
 */
const EDGES = {
  top: 'top',
  left: 'left',
  right: 'right',
  bottom: 'bottom',
  leading: 'leading',
  anywhere: 'anywhere',
} as const;

/**
 * How far beyond each edge a particle spawns and retires when its motion does not say (WeatherMotion.DefaultMargin).
 */
const DEFAULT_MARGIN = 256;

/**
 * One whole cycle of a wander, in radians (WeatherMotion.FullTurn).
 */
const FULL_TURN = Math.PI * 2;

/**
 * Points one axis of a velocity inward from the edge the particle entered by (WeatherMotion#orientedForEdge): only the
 * sign is decided, and an edge on the other axis leaves the value alone.
 * @param {number} speed The magnitude this axis was built for.
 * @param {string} edge The edge entered from.
 * @param {string} lowEdge The edge at the low end of this axis.
 * @param {string} highEdge The edge at the high end of this axis.
 * @returns {number} The velocity along the axis.
 */
const orientedForEdge = (speed: number, edge: string, lowEdge: string, highEdge: string): number =>
{
  if (edge === lowEdge)
  {
    return Math.abs(speed);
  }

  if (edge === highEdge)
  {
    return -Math.abs(speed);
  }

  return speed;
};

/**
 * How far beyond the screen a motion begins and ends (WeatherMotion#marginOf).
 * @param {{ margin?: number }} params The motion.
 * @returns {number} The margin.
 */
const marginOf = (params: { readonly margin?: number }): number =>
{
  return params.margin === undefined ? DEFAULT_MARGIN : params.margin;
};

/**
 * How far back along its travel a particle may queue before entering (WeatherMotion#entryDepthOf): none by default.
 * @param {{ entryDepth?: number }} params The motion.
 * @returns {number} The depth.
 */
const entryDepthOf = (params: { readonly entryDepth?: number }): number =>
{
  return params.entryDepth === undefined ? 0 : params.entryDepth;
};

/**
 * How far a particle wanders to either side of its heading, in pixels (WeatherMotion#swayOf): none by default.
 * @param {{ sway?: number }} params The motion.
 * @returns {number} The sway.
 */
const swayOf = (params: { readonly sway?: number }): number =>
{
  return params.sway === undefined ? 0 : params.sway;
};

/**
 * How fast a particle works through its wander, in radians a frame (WeatherMotion#swayRateOf): none by default.
 * @param {{ swayRate?: number }} params The motion.
 * @returns {number} The rate.
 */
const swayRateOf = (params: { readonly swayRate?: number }): number =>
{
  return params.swayRate === undefined ? 0 : params.swayRate;
};

/**
 * How far a particle may be turned from the shared angle at birth, as a fraction of a turn (WeatherMotion#tiltOf).
 * @param {{ tilt?: number }} params The motion.
 * @returns {number} The tilt.
 */
const tiltOf = (params: { readonly tilt?: number }): number =>
{
  return params.tilt === undefined ? 0 : params.tilt;
};

/**
 * How much of its speed a particle sheds each frame, as a fraction (WeatherMotion#dragOf): none by default.
 * @param {{ drag?: number }} params The motion.
 * @returns {number} The drag.
 */
const dragOf = (params: { readonly drag?: number }): number =>
{
  return params.drag === undefined ? 0 : params.drag;
};

/**
 * How deeply a particle dims as it pulses, as a fraction of its brightness (WeatherMotion#pulseOf): steady by default.
 * @param {{ pulse?: number }} params The motion.
 * @returns {number} The depth.
 */
const pulseOf = (params: { readonly pulse?: number }): number =>
{
  return params.pulse === undefined ? 0 : params.pulse;
};

/**
 * How fast a particle works through its pulse, in radians a frame (WeatherMotion#pulseRateOf).
 * @param {{ pulseRate?: number }} params The motion.
 * @returns {number} The rate.
 */
const pulseRateOf = (params: { readonly pulseRate?: number }): number =>
{
  return params.pulseRate === undefined ? 0 : params.pulseRate;
};

/**
 * How fast a particle turns over, in radians a frame (WeatherMotion#flipOf): still by default.
 * @param {{ flip?: number }} params The motion.
 * @returns {number} The rate.
 */
const flipOf = (params: { readonly flip?: number }): number =>
{
  return params.flip === undefined ? 0 : params.flip;
};

/**
 * The angle the whole population shares, as a fraction of a turn (WeatherMotion#leanOf): upright by default.
 * @param {{ lean?: number }} params The motion.
 * @returns {number} The lean.
 */
const leanOf = (params: { readonly lean?: number }): number =>
{
  return params.lean === undefined ? 0 : params.lean;
};

/**
 * How far a particle's two axes may be scaled apart, as a fraction of its size (WeatherMotion#stretchOf).
 * @param {{ stretch?: number }} params The motion.
 * @returns {number} The stretch.
 */
const stretchOf = (params: { readonly stretch?: number }): number =>
{
  return params.stretch === undefined ? 0 : params.stretch;
};

/**
 * The strongest a particle of this layer draws, out of 255 (WeatherMotion#peakOf): full by default.
 * @param {{ peakOpacity?: number }} params The layer.
 * @returns {number} The peak.
 */
const peakOf = (params: { readonly peakOpacity?: number }): number =>
{
  return params.peakOpacity === undefined ? 255 : params.peakOpacity;
};

/**
 * How many frames a particle of this motion lives (WeatherMotion#lifeOf): none, so until it leaves, by default.
 * @param {{ life?: number }} params The motion.
 * @returns {number} The lifetime.
 */
const lifeOf = (params: { readonly life?: number }): number =>
{
  return params.life === undefined ? 0 : params.life;
};

/**
 * How many frames of life a particle may be granted on top of the base, at random (WeatherMotion#lifeJitterOf).
 * @param {{ lifeJitter?: number }} params The motion.
 * @returns {number} The jitter.
 */
const lifeJitterOf = (params: { readonly lifeJitter?: number }): number =>
{
  return params.lifeJitter === undefined ? 0 : params.lifeJitter;
};

/**
 * How much opacity a dying particle sheds each frame (WeatherMotion#fadeOutOf): none by default.
 * @param {{ fadeOut?: number }} params The motion.
 * @returns {number} The fade.
 */
const fadeOutOf = (params: { readonly fadeOut?: number }): number =>
{
  return params.fadeOut === undefined ? 0 : params.fadeOut;
};

/**
 * Where in its pulse a newborn particle begins (WeatherMotion#pulsePhaseFor): nowhere for a steady one, anywhere at
 * random for one that blinks.
 * @param {WeatherLayer} params The motion.
 * @param {number} roll One roll, 0 up to 1.
 * @returns {number} The phase.
 */
const pulsePhaseFor = (params: WeatherLayer, roll: number): number =>
{
  if (pulseOf(params) === 0)
  {
    return 0;
  }

  return roll * FULL_TURN;
};

/**
 * Where in its tumble a newborn particle begins (WeatherMotion#flipPhaseFor): nowhere for one that does not turn over.
 * @param {WeatherLayer} params The motion.
 * @param {number} roll One roll, 0 up to 1.
 * @returns {number} The phase.
 */
const flipPhaseFor = (params: WeatherLayer, roll: number): number =>
{
  if (flipOf(params) === 0)
  {
    return 0;
  }

  return roll * FULL_TURN;
};

/**
 * Which way up one newborn particle faces, in radians (WeatherMotion#angleFor): the shared lean plus its own share of
 * the tilt.
 * @param {WeatherLayer} params The motion.
 * @param {number} tiltRoll The roll deciding this particle's departure from the shared angle.
 * @returns {number} The rotation.
 */
const angleFor = (params: WeatherLayer, tiltRoll: number): number =>
{
  const shared = leanOf(params);
  const departure = tiltOf(params) * tiltRoll;
  return (shared + departure) * FULL_TURN;
};

/**
 * The size of one axis of a newborn particle (WeatherMotion#stretchedSize): the layer's size and jitter decide how big,
 * and the stretch how far this axis departs from that.
 * @param {WeatherLayer} params The motion.
 * @param {WeatherRolls} rolls The particle's rolls.
 * @param {number} axisRoll The roll deciding this axis.
 * @returns {number} The axis's scale.
 */
const stretchedSize = (params: WeatherLayer, rolls: WeatherRolls, axisRoll: number): number =>
{
  const size = params.scale + (params.scaleJitter * rolls.scale);
  const stretch = stretchOf(params);
  return size * (1 + (((axisRoll * 2) - 1) * stretch));
};

/**
 * How long one particular particle gets to live (WeatherMotion#lifespanFor): an immortal motion stays immortal.
 * @param {WeatherLayer} params The motion.
 * @param {number} roll One roll, 0 up to 1.
 * @returns {number} The lifespan in frames, or 0 for one that never expires.
 */
const lifespanFor = (params: WeatherLayer, roll: number): number =>
{
  const base = lifeOf(params);
  if (base === 0)
  {
    return 0;
  }

  return base + (lifeJitterOf(params) * roll);
};

/**
 * Which edge one particle actually comes in through (WeatherMotion#entryEdgeFor): a motion travelling diagonally shares
 * its particles between its two upstream edges in proportion to the flux through each, the speed through an edge times
 * the edge's length, read from the authored speeds.
 * @param {WeatherLayer} params The motion.
 * @param {WeatherBounds} bounds The screen.
 * @param {string} edge The resolved heading edge.
 * @param {number} roll One roll, 0 up to 1, choosing between the upstream edges.
 * @returns {string} The edge it enters through.
 */
const entryEdgeFor = (params: WeatherLayer, bounds: WeatherBounds, edge: string, roll: number): string =>
{
  // a motion that appears all over the screen enters from nowhere.
  if (edge === EDGES.anywhere)
  {
    return edge;
  }

  const headingX = orientedForEdge(params.speedX, edge, EDGES.left, EDGES.right);
  const headingY = orientedForEdge(params.speedY, edge, EDGES.top, EDGES.bottom);
  const horizontal = headingX > 0 ? EDGES.left : EDGES.right;
  const vertical = headingY > 0 ? EDGES.top : EDGES.bottom;
  const horizontalFlux = Math.abs(headingX) * bounds.height;
  const verticalFlux = Math.abs(headingY) * bounds.width;

  // a motion that travels on neither axis has no upstream edge to speak of.
  if (horizontalFlux === 0 && verticalFlux === 0)
  {
    return edge;
  }

  return (roll * (horizontalFlux + verticalFlux)) < horizontalFlux
    ? horizontal
    : vertical;
};

/**
 * Where on the screen a particle entering from an edge begins (WeatherMotion#originOn): a full margin outside the screen
 * along its travel, queued back by its share of the entry depth, and spread across the screen plus a margin each side;
 * or, for one appearing anywhere, scattered over the screen itself.
 * @param {string} edge The edge entered from.
 * @param {WeatherBounds} bounds The screen.
 * @param {WeatherRolls} rolls Where along the edge, and how far back to queue.
 * @param {number} margin How far beyond the edge to begin.
 * @param {WeatherLayer} params The motion, for how deep its entry queue runs.
 * @returns {{ x: number, y: number }} Where it begins.
 */
const originOn = (edge: string, bounds: WeatherBounds, rolls: WeatherRolls, margin: number, params: WeatherLayer): { x: number; y: number } =>
{
  const spreadX = (rolls.along * (bounds.width + (margin * 2))) - margin;
  const spreadY = (rolls.along * (bounds.height + (margin * 2))) - margin;
  if (edge === EDGES.anywhere)
  {
    return { x: rolls.along * bounds.width, y: rolls.across * bounds.height };
  }

  // how far back along its own direction of travel this one queues up.
  const depth = rolls.across * entryDepthOf(params);
  if (edge === EDGES.top)
  {
    return { x: spreadX, y: -margin - depth };
  }

  if (edge === EDGES.bottom)
  {
    return { x: spreadX, y: bounds.height + margin + depth };
  }

  if (edge === EDGES.left)
  {
    return { x: -margin - depth, y: spreadY };
  }

  return { x: bounds.width + margin + depth, y: spreadY };
};

/**
 * Builds a particle at the moment it enters the screen (WeatherMotion#spawn): its speed jittered per axis, pointed
 * inward from the edge that decided its heading, entering through one of the motion's upstream edges, with every other
 * choice it makes at birth taken from its own roll.
 * @param {WeatherLayer} params The motion it is born from.
 * @param {WeatherBounds} bounds The screen it crosses.
 * @param {string} edge The resolved heading edge; never leading.
 * @param {WeatherRolls} rolls Its rolls.
 * @returns {WeatherParticle} The newborn particle.
 */
const spawn = (params: WeatherLayer, bounds: WeatherBounds, edge: string, rolls: WeatherRolls): WeatherParticle =>
{
  const speedX = params.speedX + (params.jitterX * rolls.speedX);
  const speedY = params.speedY + (params.jitterY * rolls.speedY);
  const velocityX = orientedForEdge(speedX, edge, EDGES.left, EDGES.right);
  const velocityY = orientedForEdge(speedY, edge, EDGES.top, EDGES.bottom);
  const entry = entryEdgeFor(params, bounds, edge, rolls.edge);
  const origin = originOn(entry, bounds, rolls, marginOf(params), params);
  return {
    x: origin.x,
    y: origin.y,
    velocityX,
    velocityY,
    rotation: angleFor(params, rolls.tilt),
    scaleX: stretchedSize(params, rolls, rolls.stretchX),
    scaleY: stretchedSize(params, rolls, rolls.stretchY),
    opacity: 0,
    phase: rolls.phase * FULL_TURN,
    age: 0,
    flipPhase: flipPhaseFor(params, rolls.flip),
    pulsePhase: pulsePhaseFor(params, rolls.pulse),
    stage: 0,
    life: lifespanFor(params, rolls.life),
    stagger: Math.floor(params.staggerFrames * rolls.stagger),
    done: false,
  };
};

/**
 * Rebuilds a particle as the thing it turns into, where the old one finished (WeatherMotion#succeed): spawned as anything
 * appearing anywhere is, then moved to where its predecessor ended, with nothing to wait for and one stage further on.
 * @param {WeatherParticle} particle The particle whose life has just ended.
 * @param {WeatherLayer} params The successor's motion.
 * @param {WeatherBounds} bounds The screen.
 * @param {WeatherRolls} rolls Fresh rolls for the thing being born.
 * @returns {WeatherParticle} The successor.
 */
const succeed = (particle: WeatherParticle, params: WeatherLayer, bounds: WeatherBounds, rolls: WeatherRolls): WeatherParticle =>
{
  const born = spawn(params, bounds, EDGES.anywhere, rolls);
  born.x = particle.x;
  born.y = particle.y;
  born.stagger = 0;
  born.stage = particle.stage + 1;
  return born;
};

/**
 * Reports whether every particle of a population has finished for good (WeatherMotion#isDrained).
 * @param {readonly WeatherParticle[]} particles The population.
 * @returns {boolean} True when all of them have.
 */
const isDrained = (particles: readonly WeatherParticle[]): boolean =>
{
  return particles.every(particle => particle.done);
};

/**
 * How brightly a particle is drawn now, its pulse taken into account (WeatherMotion#glowFor): a cosine walked from nought
 * to one and back dims it by up to its pulse's depth.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherLayer} params The motion it lives by.
 * @returns {number} The opacity to draw it at, out of 255.
 */
const glowFor = (particle: WeatherParticle, params: WeatherLayer): number =>
{
  const depth = pulseOf(params);
  if (depth === 0)
  {
    return particle.opacity;
  }

  const dip = (1 - Math.cos(particle.pulsePhase)) / 2;
  return particle.opacity * (1 - (depth * dip));
};

/**
 * How wide a particle is drawn now, accounting for how far it has turned over (WeatherMotion#facingScaleX): a negative
 * width draws it mirrored, as the back of a petal.
 * @param {WeatherParticle} particle The particle.
 * @returns {number} The horizontal scale.
 */
const facingScaleX = (particle: WeatherParticle): number =>
{
  return particle.scaleX * Math.cos(particle.flipPhase);
};

/**
 * Reports whether a particle is close enough to the end of its life to be on its way out (WeatherMotion#isDying): there
 * is just time left to fade from where it is.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherLayer} params The motion it lives by.
 * @returns {boolean} True when it should fade.
 */
const isDying = (particle: WeatherParticle, params: WeatherLayer): boolean =>
{
  const { life } = particle;
  if (life === 0)
  {
    return false;
  }

  const fadeOut = fadeOutOf(params);
  if (fadeOut === 0)
  {
    return false;
  }

  const remaining = life - particle.age;
  return (remaining * fadeOut) <= particle.opacity;
};

/**
 * How brightly a particle should draw once the weather has been running a while (WeatherMotion#settledOpacityFor): a
 * mortal one keeps what its own life gave it, and anything else is at its peak.
 * @param {WeatherParticle} particle The particle being settled.
 * @param {WeatherLayer} params The motion it lives by.
 * @returns {number} The opacity.
 */
const settledOpacityFor = (particle: WeatherParticle, params: WeatherLayer): number =>
{
  if (particle.life > 0)
  {
    return particle.opacity;
  }

  return peakOf(params);
};

/**
 * Reports whether a particle has lived out its lifetime (WeatherMotion#hasExpired); an immortal one never does.
 * @param {WeatherParticle} particle The particle.
 * @returns {boolean} True when its life is over.
 */
const hasExpired = (particle: WeatherParticle): boolean =>
{
  if (particle.life === 0)
  {
    return false;
  }

  return particle.age >= particle.life;
};

/**
 * Nudges a particle sideways along its wander (WeatherMotion#applySway): across its heading, never along it, by the
 * difference between two points on the sine, so a sway is the furthest it ever strays.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherLayer} params The motion it lives by.
 */
const applySway = (particle: WeatherParticle, params: WeatherLayer): void =>
{
  const sway = swayOf(params);
  if (sway === 0)
  {
    return;
  }

  const before = Math.sin(particle.phase);
  particle.phase += swayRateOf(params);
  const offset = sway * (Math.sin(particle.phase) - before);
  if (Math.abs(params.speedX) >= Math.abs(params.speedY))
  {
    particle.y += offset;
    return;
  }

  particle.x += offset;
};

/**
 * The edge the player is walking toward (WeatherMotion#travelEdgeFor): the axis committed to more strongly wins, and
 * standing still gives none.
 * @param {PlayerTravel} travel How far the player moved this frame.
 * @returns {string} The edge, or an empty string while standing still.
 */
const travelEdgeFor = (travel: PlayerTravel): string =>
{
  if (Math.abs(travel.x) > Math.abs(travel.y))
  {
    return travel.x > 0 ? EDGES.right : EDGES.left;
  }

  if (travel.y !== 0)
  {
    return travel.y > 0 ? EDGES.bottom : EDGES.top;
  }

  return '';
};

/**
 * The edge a motion draws from when nobody is moving (WeatherMotion#restingEdgeFor): the side it travels away from.
 * @param {WeatherLayer} params The motion.
 * @returns {string} The edge.
 */
const restingEdgeFor = (params: WeatherLayer): string =>
{
  if (Math.abs(params.speedX) > Math.abs(params.speedY))
  {
    return params.speedX > 0 ? EDGES.left : EDGES.right;
  }

  return params.speedY >= 0 ? EDGES.top : EDGES.bottom;
};

/**
 * Resolves which edge a particle enters from this spawn (WeatherMotion#resolveEdge): a fixed edge is always itself, and
 * leading is the edge the player walks toward, or the motion's own resting edge while they stand still.
 * @param {WeatherLayer} params The motion.
 * @param {PlayerTravel} travel How far the player moved this frame.
 * @returns {string} The edge; never leading.
 */
const resolveEdge = (params: WeatherLayer, travel: PlayerTravel): string =>
{
  if (params.edge !== EDGES.leading)
  {
    return params.edge;
  }

  const preferred = travelEdgeFor(travel);
  return preferred === ''
    ? restingEdgeFor(params)
    : preferred;
};

/**
 * Moves a particle on by one frame, in place (WeatherMotion#advance): a particle still waiting out its stagger only
 * waits; anything else ages, travels, sheds its drag, spins, turns over, pulses, grows and wanders, then fades out if it
 * is dying or in toward its peak if not.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherLayer} params The motion it lives by.
 */
const advance = (particle: WeatherParticle, params: WeatherLayer): void =>
{
  if (particle.stagger > 0)
  {
    particle.stagger -= 1;
    return;
  }

  particle.age += 1;
  particle.x += particle.velocityX;
  particle.y += particle.velocityY;

  // whatever it is spending, it has less of it than it did a frame ago.
  const remaining = 1 - dragOf(params);
  particle.velocityX *= remaining;
  particle.velocityY *= remaining;
  particle.rotation += params.roll;
  particle.flipPhase += flipOf(params);
  particle.pulsePhase += pulseRateOf(params);
  particle.scaleX += params.growth;
  particle.scaleY += params.growth;
  applySway(particle, params);
  if (isDying(particle, params))
  {
    particle.opacity = Math.max(particle.opacity - fadeOutOf(params), 0);
    return;
  }

  particle.opacity = Math.min(particle.opacity + params.fadeIn, peakOf(params));
};

/**
 * Reports whether a particle has left the screen (WeatherMotion#hasEscaped): past the margin it spawned outside of, and
 * past its motion's entry queue too, which counts as still arriving.
 * @param {WeatherParticle} particle The particle.
 * @param {WeatherBounds} bounds The screen.
 * @param {WeatherLayer} params The motion it lives by.
 * @returns {boolean} True when it has gone.
 */
const hasEscaped = (particle: WeatherParticle, bounds: WeatherBounds, params: WeatherLayer): boolean =>
{
  const margin = marginOf(params) + entryDepthOf(params);
  if (particle.x < -margin || particle.x > bounds.width + margin || particle.y < -margin)
  {
    return true;
  }

  return particle.y > bounds.height + margin;
};

export {
  advance,
  angleFor,
  applySway,
  DEFAULT_MARGIN,
  dragOf,
  EDGES,
  entryDepthOf,
  entryEdgeFor,
  facingScaleX,
  flipOf,
  FULL_TURN,
  glowFor,
  hasEscaped,
  hasExpired,
  isDrained,
  isDying,
  lifespanFor,
  marginOf,
  orientedForEdge,
  originOn,
  peakOf,
  pulseRateOf,
  resolveEdge,
  restingEdgeFor,
  settledOpacityFor,
  spawn,
  stretchedSize,
  succeed,
  swayOf,
  swayRateOf,
  travelEdgeFor,
};
export type { PlayerTravel, WeatherBounds, WeatherParticle, WeatherRolls };
