import { describe, expect, it, vi } from 'vitest';
import { probeBackend } from '@presentation/shell/backendHealth.ts';

/*
 * The backend gate opens the editor only on an API that answered its health check as itself, and the answer it opens
 * on carries the project root that API serves. The editor starts on that root and shows it in the bar, so the bar
 * always names the folder being edited, never one remembered from an earlier session. An API serving no project keeps
 * the gate shut and says so, and anything but the health route's own answer reads as no API at all.
 */

/**
 * The bundled editor's own origin, which serves the API and the pages alike.
 */
const API_BASE = 'http://127.0.0.1:47390';

/**
 * What the health route answers for an API serving a project.
 */
const HEALTHY = { ok: true, projectRoot: '/games/test-project', projectRootOk: true };

/**
 * Stands in for fetch, answering every request with one response.
 * @param {string} body The response's text.
 * @param {number} status The response's status.
 * @returns A fetch stand-in that records what it was asked for.
 */
const fetcherAnswering = (body: string, status: number = 200) =>
{
  return vi.fn(async (_url: string) => new Response(body, { status }));
};

describe('backendHealth', () =>
{
  describe('probeBackend', () =>
  {
    it('opens on the root the API serves', async () =>
    {
      // Arrange
      const fetcher = fetcherAnswering(JSON.stringify({ path: '/api/health', data: HEALTHY }));

      // Act
      const state = await probeBackend(API_BASE, fetcher);

      // Assert
      expect(fetcher)
        .toHaveBeenCalledWith('http://127.0.0.1:47390/api/health');
      expect(state)
        .toEqual({ type: 'ready', apiBase: API_BASE, projectRoot: '/games/test-project' });
    });

    it('stays shut on an API serving no project, which leaves the root out', async () =>
    {
      // Arrange- how the API answers with JMZ_PROJECT_ROOT unset.
      const unset = { path: '/api/health', data: { ok: true, projectRootOk: false } };
      const fetcher = fetcherAnswering(JSON.stringify(unset));

      // Act
      const state = await probeBackend(API_BASE, fetcher);

      // Assert
      expect(state)
        .toEqual({ type: 'missing-project-root', apiBase: API_BASE });
    });

    it('reads anything but the health route\'s own answer as no API at all', async () =>
    {
      // Arrange- a refusal, an error in the envelope, an answer that is not ok, one with no data, a page that is
      // not JSON, and no answer at all.
      const fetchers = [
        fetcherAnswering(JSON.stringify({ path: '/api/health', data: HEALTHY }), 403),
        fetcherAnswering(JSON.stringify({ path: '/api/health', error: 'something went wrong', data: HEALTHY })),
        fetcherAnswering(JSON.stringify({ path: '/api/health', data: { ...HEALTHY, ok: false } })),
        fetcherAnswering(JSON.stringify({ path: '/api/health' })),
        fetcherAnswering('<!doctype html><title>Something else</title>'),
        vi.fn(async (_url: string): Promise<Response> =>
        {
          throw new TypeError('Failed to fetch');
        }),
      ];

      // Act
      const states = await Promise.all(fetchers.map(fetcher => probeBackend(API_BASE, fetcher)));

      // Assert
      expect(states.map(state => state.type))
        .toEqual([ 'unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable' ]);
    });

    it('asks through the browser\'s fetch unless told otherwise', async () =>
    {
      // Arrange
      const browserFetch = fetcherAnswering(JSON.stringify({ path: '/api/health', data: HEALTHY }));
      vi.stubGlobal('fetch', browserFetch);

      try
      {
        // Act
        const state = await probeBackend(API_BASE);

        // Assert
        expect(browserFetch)
          .toHaveBeenCalledWith('http://127.0.0.1:47390/api/health');
        expect(state)
          .toEqual({ type: 'ready', apiBase: API_BASE, projectRoot: '/games/test-project' });
      }
      finally
      {
        vi.unstubAllGlobals();
      }
    });
  });
});
