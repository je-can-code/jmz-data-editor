import { describe, expect, it } from 'vitest';
import { NO_PICKS, pairPlanOf, partnerOf, type PairLooks, type PairMap, type PairPicks } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';

/*
 * What the author's picks place. A door both ways is the door outside and the way out inside, each sending the player to
 * the other's side: in to one tile north of the way out, facing up, and out to one tile below the door, facing down. An
 * edge both ways is a strip on each map, on opposite edges, each landing one tile in from the other at its middle, facing
 * the way the player walked; the other strip stays centred on its edge until the author moves it. One way places only
 * the first end, sending the player to the tile picked. Every end is named by the map it leads to, and the first end
 * always stands on the map the transfer leaves from, so the step lives in that map's history first. Until every pick a
 * kind needs is made there is no plan, and a pick another kind needs never stands in for it.
 */
describe('pairPlans', () =>
{
  const OUTSIDE: PairMap = { mapId: 20, name: 'Northeast Section', size: { width: 40, height: 30 } };
  const INSIDE: PairMap = { mapId: 28, name: 'Entrance', size: { width: 35, height: 30 } };
  const LOOKS: PairLooks = { door: { characterName: '!doors', characterIndex: 0, direction: 2, pattern: 1 }, sounds: { door: 'Open1', movement: '' } };

  /**
   * Builds picks from the empty ones.
   * @param {Partial<PairPicks>} picks The picks made.
   * @returns {PairPicks} The picks.
   */
  const picked = (picks: Partial<PairPicks>): PairPicks => ({ ...NO_PICKS, ...picks });

  describe('pairPlanOf', () =>
  {
    it('plans a door outside and its way out inside, each sending the player to the other\'s side', () =>
    {
      // Arrange.
      const picks = picked({ kind: 'door', ways: 'both', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } });

      // Act.
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Assert: the door first, on the map it leaves from.
      const events = plan?.ends.map((end, index) => end.eventFor(10 + index));
      expect([ plan?.label, plan?.ends.map(end => [ end.mapId, end.area, end.destination ]), events?.map(event => [ event.id, event.name, event.x, event.y, event.pages[0].priorityType ]) ])
        .toStrictEqual([
          'Place door pair',
          [
            [ 20, { x: 14, y: 6, width: 1, height: 1 }, { mapId: 28, x: 8, y: 14, facing: 8 } ],
            [ 28, { x: 8, y: 15, width: 1, height: 1 }, { mapId: 20, x: 14, y: 7, facing: 2 } ],
          ],
          [ [ 10, 'Transfer (Entrance)', 14, 6, 1 ], [ 11, 'Transfer (Northeast Section)', 8, 15, 0 ] ],
        ]);
    });

    it('plans a door alone, sending the player to the tile picked, facing up', () =>
    {
      // Arrange: an exit picked before the author switched to one way, which a one-way door never uses.
      const picks = picked({ kind: 'door', ways: 'one', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 }, landing: { x: 3, y: 4 } });

      // Act.
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Assert.
      expect([ plan?.label, plan?.ends.map(end => [ end.mapId, end.destination ]), plan?.ends[0].eventFor(5).pages[0].image.characterName ])
        .toStrictEqual([ 'Place one-way door', [ [ 20, { mapId: 28, x: 3, y: 4, facing: 8 } ] ], '!doors' ]);
    });

    it('plans a strip on each map, the other centred on the opposite edge, each landing one in from the other', () =>
    {
      // Arrange: three tiles along the outside map's bottom edge.
      const picks = picked({ kind: 'edge', ways: 'both', strip: { edge: 'bottom', start: 30, length: 3 } });

      // Act.
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Assert: the inside map is 35 wide, so its strip starts at 16.
      expect([ plan?.label, plan?.ends.map(end => [ end.mapId, end.area, end.destination ]) ])
        .toStrictEqual([
          'Place edge pair',
          [
            [ 20, { x: 30, y: 29, width: 3, height: 1 }, { mapId: 28, x: 17, y: 1, facing: 2 } ],
            [ 28, { x: 16, y: 0, width: 3, height: 1 }, { mapId: 20, x: 31, y: 28, facing: 8 } ],
          ],
        ]);
    });

    it('plans the other strip where the author moved it', () =>
    {
      // Arrange: the inside strip moved to start at 2.
      const picks = picked({ kind: 'edge', ways: 'both', strip: { edge: 'bottom', start: 30, length: 3 }, partner: { edge: 'top', start: 2, length: 3 } });

      // Act.
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Assert.
      expect(plan?.ends.map(end => [ end.area, end.destination ]))
        .toStrictEqual([
          [ { x: 30, y: 29, width: 3, height: 1 }, { mapId: 28, x: 3, y: 1, facing: 2 } ],
          [ { x: 2, y: 0, width: 3, height: 1 }, { mapId: 20, x: 31, y: 28, facing: 8 } ],
        ]);
    });

    it('plans a strip alone, sending the player to the tile picked, facing the way they walked off', () =>
    {
      // Arrange: a strip down the left side.
      const picks = picked({ kind: 'edge', ways: 'one', strip: { edge: 'left', start: 4, length: 5 }, landing: { x: 33, y: 7 } });

      // Act.
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Assert.
      expect([ plan?.label, plan?.ends.map(end => [ end.mapId, end.area, end.destination ]) ])
        .toStrictEqual([ 'Place one-way edge', [ [ 20, { x: 0, y: 4, width: 1, height: 5 }, { mapId: 28, x: 33, y: 7, facing: 4 } ] ] ]);
    });

    it('plans nothing while a pick the kind needs is missing, whatever the other kind has picked', () =>
    {
      // Arrange: each kind and way short of one pick, the other kind's picks made.
      const strip = { edge: 'bottom' as const, start: 30, length: 3 };
      const short = [
        picked({ kind: 'door', ways: 'both', exit: { x: 8, y: 15 }, strip }),
        picked({ kind: 'door', ways: 'both', door: { x: 14, y: 6 }, landing: { x: 3, y: 4 } }),
        picked({ kind: 'door', ways: 'one', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } }),
        picked({ kind: 'edge', ways: 'both', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } }),
        picked({ kind: 'edge', ways: 'one', strip }),
      ];

      // Act.
      const plans = short.map(picks => pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS));

      // Assert.
      expect(plans)
        .toStrictEqual([ null, null, null, null, null ]);
    });
  });

  describe('partnerOf', () =>
  {
    it('finds the strip moved to, the centred one before it is moved, and none before the first strip', () =>
    {
      // Arrange.
      const strip = { edge: 'right' as const, start: 4, length: 3 };
      const moved = { edge: 'left' as const, start: 9, length: 3 };

      // Act.
      const partners = [
        partnerOf(picked({ kind: 'edge', strip, partner: moved }), INSIDE.size),
        partnerOf(picked({ kind: 'edge', strip }), INSIDE.size),
        partnerOf(picked({ kind: 'edge' }), INSIDE.size),
      ];

      // Assert.
      expect(partners)
        .toStrictEqual([ moved, { edge: 'left', start: 13, length: 3 }, null ]);
    });
  });
});
