import { describe, expect, it } from 'vitest';
import type { EnemyPlacement } from '@services/placements/EnemyPlacementsReader.ts';
import {
  describeEvent,
  describePages,
  describePosition,
  groupPlacementsByMap,
  summarizePlacements,
} from '@services/placements/EnemyPlacementsList.ts';

/**
 * The Enemies board draws an enemy's placements straight from what this module hands it, so everything an author
 * reads there is decided here. It owes the board a list that reads the same way every time, maps in id order and
 * events in id order under each, whatever order the placements arrived in; a heading for every map, the map tree's
 * name when there is one; and words that say where the enemy stands, including which pages make an event the
 * enemy whenever that is not simply its only page, since an event on another page is not that enemy at all.
 */
describe('EnemyPlacementsList', () =>
{
  /**
   * Builds a placement standing on a map, on its one page unless told otherwise.
   * @param {Partial<EnemyPlacement>} fields What sets this placement apart.
   * @returns {EnemyPlacement} The placement.
   */
  const placementOf = (fields: Partial<EnemyPlacement>): EnemyPlacement => (
    {
      mapId: 1,
      mapName: 'Meadow',
      eventId: 1,
      eventName: 'Slime',
      x: 0,
      y: 0,
      pageIndexes: [ 0 ],
      pageCount: 1,
      ...fields,
    }
  );

  describe('groupPlacementsByMap', () =>
  {
    it('lists maps in id order and the events under each in id order, whatever order they came in', () =>
    {
      // Arrange- two maps interleaved, each backwards.
      const caveBat = placementOf({ mapId: 9, mapName: 'Cave', eventId: 8 });
      const meadowBat = placementOf({ mapId: 2, eventId: 5 });
      const caveSlime = placementOf({ mapId: 9, mapName: 'Cave', eventId: 3 });
      const meadowSlime = placementOf({ mapId: 2, eventId: 1 });

      // Act
      const groups = groupPlacementsByMap([ caveBat, meadowBat, caveSlime, meadowSlime ]);

      // Assert
      expect(groups.map(group => group.placements))
        .toEqual([ [ meadowSlime, meadowBat ], [ caveSlime, caveBat ] ]);
    });

    it('heads each map with its name from the map tree, and its number and count beside it', () =>
    {
      // Arrange
      const placements = [
        placementOf({ mapId: 2, mapName: 'Meadow', eventId: 1 }),
        placementOf({ mapId: 2, mapName: 'Meadow', eventId: 4 }),
        placementOf({ mapId: 9, mapName: 'Cave', eventId: 3 }),
      ];

      // Act
      const groups = groupPlacementsByMap(placements);

      // Assert
      expect(groups.map(({ mapId, title, caption }) => ({ mapId, title, caption })))
        .toEqual([
          { mapId: 2, title: 'Meadow', caption: 'Map 2, 2 events' },
          { mapId: 9, title: 'Cave', caption: 'Map 9, 1 event' },
        ]);
    });

    it('heads a map the tree has no name for by its number', () =>
    {
      // Arrange
      const placements = [ placementOf({ mapId: 17, mapName: '' }) ];

      // Act
      const [ group ] = groupPlacementsByMap(placements);

      // Assert
      expect(group.title)
        .toBe('Map 17');
    });

    it('leaves the list it was given in its own order', () =>
    {
      // Arrange
      const later = placementOf({ mapId: 9 });
      const earlier = placementOf({ mapId: 2 });
      const placements = [ later, earlier ];

      // Act
      groupPlacementsByMap(placements);

      // Assert
      expect(placements)
        .toEqual([ later, earlier ]);
    });

    it('groups nothing into no maps', () =>
    {
      // Arrange- an enemy placed nowhere.
      const placements: EnemyPlacement[] = [];

      // Act
      const groups = groupPlacementsByMap(placements);

      // Assert
      expect(groups)
        .toEqual([]);
    });
  });

  describe('summarizePlacements', () =>
  {
    it('says an enemy no event stands as is placed nowhere', () =>
    {
      // Arrange
      const groups = groupPlacementsByMap([]);

      // Act
      const summary = summarizePlacements(groups);

      // Assert
      expect(summary)
        .toBe('Not placed on any map.');
    });

    it('says an enemy placed once is placed once', () =>
    {
      // Arrange
      const groups = groupPlacementsByMap([ placementOf({}) ]);

      // Act
      const summary = summarizePlacements(groups);

      // Assert
      expect(summary)
        .toBe('Placed once.');
    });

    it('says when every placement is on the same map', () =>
    {
      // Arrange
      const groups = groupPlacementsByMap([ placementOf({ eventId: 1 }), placementOf({ eventId: 2 }), placementOf({ eventId: 3 }) ]);

      // Act
      const summary = summarizePlacements(groups);

      // Assert
      expect(summary)
        .toBe('Placed 3 times, all on one map.');
    });

    it('counts the placements and the maps they are spread across', () =>
    {
      // Arrange
      const groups = groupPlacementsByMap([
        placementOf({ mapId: 1, eventId: 1 }),
        placementOf({ mapId: 1, eventId: 2 }),
        placementOf({ mapId: 4, eventId: 1 }),
      ]);

      // Act
      const summary = summarizePlacements(groups);

      // Assert
      expect(summary)
        .toBe('Placed 3 times across 2 maps.');
    });
  });

  describe('describeEvent', () =>
  {
    it('names an event by its id and then its name', () =>
    {
      // Arrange
      const placement = placementOf({ eventId: 12, eventName: 'Slime' });

      // Act
      const description = describeEvent(placement);

      // Assert
      expect(description)
        .toBe('Event 12: Slime');
    });
  });

  describe('describePosition', () =>
  {
    it('names the tile an event starts on', () =>
    {
      // Arrange
      const placement = placementOf({ x: 10, y: 12 });

      // Act
      const description = describePosition(placement);

      // Assert
      expect(description)
        .toBe('(10, 12)');
    });
  });

  describe('describePages', () =>
  {
    it('says nothing about an event whose only page makes it the enemy', () =>
    {
      // Arrange
      const placement = placementOf({ pageIndexes: [ 0 ], pageCount: 1 });

      // Act
      const description = describePages(placement);

      // Assert
      expect(description)
        .toBe('');
    });

    it('says when every one of several pages makes the event the enemy', () =>
    {
      // Arrange
      const placement = placementOf({ pageIndexes: [ 0, 1 ], pageCount: 2 });

      // Act
      const description = describePages(placement);

      // Assert
      expect(description)
        .toBe('All 2 pages');
    });

    it('names the one page making the event the enemy, counted from 1', () =>
    {
      // Arrange- a battler that only appears once its second page's conditions hold.
      const placement = placementOf({ pageIndexes: [ 1 ], pageCount: 2 });

      // Act
      const description = describePages(placement);

      // Assert
      expect(description)
        .toBe('Page 2 of 2');
    });

    it('names two pages as a pair', () =>
    {
      // Arrange
      const placement = placementOf({ pageIndexes: [ 0, 2 ], pageCount: 3 });

      // Act
      const description = describePages(placement);

      // Assert
      expect(description)
        .toBe('Pages 1 and 3 of 3');
    });

    it('names three or more pages as a list', () =>
    {
      // Arrange
      const placement = placementOf({ pageIndexes: [ 0, 1, 3 ], pageCount: 5 });

      // Act
      const description = describePages(placement);

      // Assert
      expect(description)
        .toBe('Pages 1, 2 and 4 of 5');
    });
  });
});
