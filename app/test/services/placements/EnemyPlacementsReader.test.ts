import { describe, expect, it, vi } from 'vitest';
import {
  type EnemyPlacement,
  enemyPlacementsUrl,
  parseEnemyPlacements,
  readEnemyPlacements,
} from '@services/placements/EnemyPlacementsReader.ts';

/**
 * The reader is the Enemies board's only way to learn where an enemy stands on the maps, and the server's answer
 * is untyped JSON until it passes through here. It owes the board three things. A well-formed answer comes back as
 * exactly the placements the server listed. Anything off the contract, an answer about another enemy included, is
 * refused out loud rather than drawn as a list with holes in it. And every failure carries the most useful message
 * there is: the server's own when it gave one, otherwise the status and whatever text came back.
 */
describe('EnemyPlacementsReader', () =>
{
  /**
   * A placement as the server sends one.
   */
  const slime: EnemyPlacement = {
    mapId: 2,
    mapName: 'Cave',
    eventId: 1,
    eventName: 'Slime',
    x: 3,
    y: 4,
    pageIndexes: [ 0 ],
    pageCount: 1,
  };

  /**
   * A second placement, on another page and map.
   */
  const ambush: EnemyPlacement = {
    mapId: 5,
    mapName: '',
    eventId: 7,
    eventName: 'Ambush',
    x: 10,
    y: 12,
    pageIndexes: [ 1, 2 ],
    pageCount: 3,
  };

  /**
   * Stands in for fetch, answering every request with one response.
   * @param {string} body The response's text.
   * @param {number} status The response's status.
   * @returns A fetch stand-in that records what it was asked for.
   */
  const fetcherAnswering = (body: string, status: number) =>
  {
    return vi.fn(async (_url: string) => new Response(body, { status }));
  };

  describe('enemyPlacementsUrl', () =>
  {
    it('addresses the enemy\'s placements on the server', () =>
    {
      // Arrange- nothing to set up; the address is built from the two values alone.

      // Act
      const url = enemyPlacementsUrl('http://127.0.0.1:8080', 42);

      // Assert
      expect(url)
        .toBe('http://127.0.0.1:8080/api/enemies/42/placements');
    });
  });

  describe('parseEnemyPlacements', () =>
  {
    it('reads every placement the server listed, in its order', () =>
    {
      // Arrange
      const data = { enemyId: 5, placements: [ slime, ambush ] };

      // Act
      const placements = parseEnemyPlacements(data, 5);

      // Assert
      expect(placements)
        .toEqual([ slime, ambush ]);
    });

    it('reads an enemy placed nowhere as an empty list', () =>
    {
      // Arrange
      const data = { enemyId: 5, placements: [] };

      // Act
      const placements = parseEnemyPlacements(data, 5);

      // Assert
      expect(placements)
        .toEqual([]);
    });

    it('refuses an answer about another enemy', () =>
    {
      // Arrange- a well-formed answer, but for enemy 6.
      const data = { enemyId: 6, placements: [ slime ] };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('The placements of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses an answer with no list of placements', () =>
    {
      // Arrange
      const data = { enemyId: 5, placements: null };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('The placements of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses an answer that is not an object', () =>
    {
      // Arrange- the list alone, without the enemy it answers about.
      const data = [ slime ];

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('The placements of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses the whole answer over one malformed placement among good ones', () =>
    {
      // Arrange- the ambush's position arrives as text.
      const data = { enemyId: 5, placements: [ slime, { ...ambush, x: '10' } ] };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('A placement of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses a placement naming no page', () =>
    {
      // Arrange
      const data = { enemyId: 5, placements: [ { ...slime, pageIndexes: [] } ] };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('A placement of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses a placement whose map name is missing', () =>
    {
      // Arrange
      const { mapName: _mapName, ...unnamed } = slime;
      const data = { enemyId: 5, placements: [ unnamed ] };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('A placement of enemy 5 came back in a shape this editor does not know.');
    });

    it('refuses a placement that is not an object', () =>
    {
      // Arrange
      const data = { enemyId: 5, placements: [ null ] };

      // Act
      const parse = () => parseEnemyPlacements(data, 5);

      // Assert
      expect(parse)
        .toThrow('A placement of enemy 5 came back in a shape this editor does not know.');
    });
  });

  describe('readEnemyPlacements', () =>
  {
    it('asks the server at the enemy\'s address and hands back its placements', async () =>
    {
      // Arrange
      const fetcher = fetcherAnswering(JSON.stringify({ path: '/game', data: { enemyId: 5, placements: [ slime ] } }), 200);

      // Act
      const placements = await readEnemyPlacements(5, 'http://127.0.0.1:8080', fetcher);

      // Assert
      expect(fetcher)
        .toHaveBeenCalledWith('http://127.0.0.1:8080/api/enemies/5/placements');
      expect(placements)
        .toEqual([ slime ]);
    });

    it('reports the server\'s own message when a map cannot be read', async () =>
    {
      // Arrange
      const envelope = { path: '/game', error: 'decoding /game/data/Map002.json: json: unknown field "sparkle"' };
      const fetcher = fetcherAnswering(JSON.stringify(envelope), 500);

      // Act
      const reading = readEnemyPlacements(5, 'http://127.0.0.1:8080', fetcher);

      // Assert
      await expect(reading)
        .rejects
        .toThrow('decoding /game/data/Map002.json: json: unknown field "sparkle"');
    });

    it('reports an error the server sent alongside a success', async () =>
    {
      // Arrange
      const fetcher = fetcherAnswering(JSON.stringify({ path: '/game', error: 'something went wrong' }), 200);

      // Act
      const reading = readEnemyPlacements(5, 'http://127.0.0.1:8080', fetcher);

      // Assert
      await expect(reading)
        .rejects
        .toThrow('something went wrong');
    });

    it('reports the status when a failed answer carries no message', async () =>
    {
      // Arrange
      const fetcher = fetcherAnswering(JSON.stringify({ path: '/game' }), 500);

      // Act
      const reading = readEnemyPlacements(5, 'http://127.0.0.1:8080', fetcher);

      // Assert
      await expect(reading)
        .rejects
        .toThrow('HTTP 500 for GET http://127.0.0.1:8080/api/enemies/5/placements');
    });

    it('reports the status and text of a refusal that is not JSON', async () =>
    {
      // Arrange- how the server refuses an id that is not an enemy's.
      const fetcher = fetcherAnswering('enemyId must be an integer of at least 1\n', 400);

      // Act
      const reading = readEnemyPlacements(5, 'http://127.0.0.1:8080', fetcher);

      // Assert
      await expect(reading)
        .rejects
        .toThrow('HTTP 400 for GET http://127.0.0.1:8080/api/enemies/5/placements: enemyId must be an integer of at least 1');
    });

    it('asks through the browser\'s fetch unless told otherwise', async () =>
    {
      // Arrange
      const browserFetch = fetcherAnswering(JSON.stringify({ path: '/game', data: { enemyId: 5, placements: [] } }), 200);
      vi.stubGlobal('fetch', browserFetch);

      try
      {
        // Act
        const placements = await readEnemyPlacements(5, 'http://127.0.0.1:8080');

        // Assert
        expect(browserFetch)
          .toHaveBeenCalledWith('http://127.0.0.1:8080/api/enemies/5/placements');
        expect(placements)
          .toEqual([]);
      }
      finally
      {
        vi.unstubAllGlobals();
      }
    });

    it('asks nothing when there is no server to ask', async () =>
    {
      // Arrange
      const fetcher = fetcherAnswering('', 200);

      // Act
      const reading = readEnemyPlacements(5, null, fetcher);

      // Assert
      await expect(reading)
        .rejects
        .toThrow('The editor has no server to ask where enemies are placed.');
      expect(fetcher)
        .not
        .toHaveBeenCalled();
    });
  });
});
