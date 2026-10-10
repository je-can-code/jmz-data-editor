import { GlParticleContainerPipe, type WebGLRenderer } from 'pixi.js';

/**
 * Makes sure a renderer can draw pixi's particle containers, which the weather draws with.
 *
 * Pixi gives a renderer its pipes when the renderer is made, one for each kind of thing registered by then, and its
 * particle pipe is registered by the code that defines particle containers, which loads only the first time a map has
 * weather, so that a map without weather never pays for building it. A view made before then has no particle pipe; it
 * is given pixi's own WebGL one now, just as pixi would have given it, and let go with the renderer's other pipes. A view
 * made after the code loaded was given one by pixi and is left alone.
 * @param {WebGLRenderer} renderer The view's renderer.
 */
const ensureParticlePipe = (renderer: WebGLRenderer): void =>
{
  // pixi's types promise every renderer this pipe, which holds only for a renderer made after it was registered.
  const pipes = renderer.renderPipes as Partial<WebGLRenderer['renderPipes']>;
  if (pipes.particle !== undefined)
  {
    return;
  }

  const pipe = new GlParticleContainerPipe(renderer);
  pipes.particle = pipe;
  renderer.runners.destroy.add(pipe);
};

export { ensureParticlePipe };
