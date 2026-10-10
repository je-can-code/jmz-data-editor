/**
 * @vitest-environment jsdom
 */
import { GlParticleContainerPipe, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { ensureParticlePipe } from '../../../../src/mapEditor/modules/weather/particlePipe.ts';

/*
 * The weather draws with pixi's particle containers, and the code that defines them loads only once a map first has
 * weather, so a view made before then has no particle pipe: it is given pixi's own WebGL one, which is let go with the
 * renderer's other pipes. A view that already has one, as one made after the code loaded does, is left as it is.
 */
describe('particlePipe', () =>
{
  /**
   * A renderer's pipes, the runner that lets them go, and the collector a pipe hands what it keeps for each container,
   * as far as a new pipe reads them, writing down what is let go and what is collected.
   * @param {Record<string, unknown>} pipes The pipes it has.
   * @returns {{ renderer: WebGLRenderer, released: unknown[], collected: string[] }} The renderer, what its destroy
   * runner holds, and the kinds of thing its collector was handed.
   */
  const rendererWith = (pipes: Record<string, unknown>) =>
  {
    const released: unknown[] = [];
    const collected: string[] = [];
    const renderer = {
      renderPipes: pipes,
      runners: { destroy: { add: (item: unknown) => released.push(item) } },
      gc: { addResourceHash: (_hash: unknown, _key: string, type: string) => collected.push(type) },
    } as unknown as WebGLRenderer;
    return { renderer, released, collected };
  };

  describe('ensureParticlePipe', () =>
  {
    it('gives a renderer made before the weather\'s code loaded pixi\'s WebGL particle pipe, let go with the others', () =>
    {
      // Arrange: a renderer with a sprite pipe and no particle pipe.
      const sprite = {};
      const { renderer, released, collected } = rendererWith({ sprite });

      // Act.
      ensureParticlePipe(renderer);

      // Assert: the new pipe in place for the renderer, its containers handed to the renderer's collector, the pipe to
      // the destroy runner, and the sprite pipe untouched.
      const { particle } = renderer.renderPipes as unknown as Record<string, unknown>;
      const owned = (particle as GlParticleContainerPipe).renderer === renderer;
      expect([ particle instanceof GlParticleContainerPipe, owned, collected, released, renderer.renderPipes.sprite ])
        .toStrictEqual([ true, true, [ 'renderable' ], [ particle ], sprite ]);
    });

    it('leaves a renderer that already has a particle pipe as it is', () =>
    {
      // Arrange.
      const particle = {};
      const { renderer, released } = rendererWith({ particle });

      // Act.
      ensureParticlePipe(renderer);

      // Assert.
      expect([ renderer.renderPipes.particle, released ])
        .toStrictEqual([ particle, [] ]);
    });
  });
});
