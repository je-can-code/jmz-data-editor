import { describe, expect, it } from 'vitest';
import { NO_PICKS, pairPlanOf, type PairLooks, type PairMap, type PairPicks } from '../../../../src/mapEditor/core/transferPairs/pairPlans.ts';
import { landingRefusalWords, pairReadout, placedWords } from '../../../../src/mapEditor/core/transferPairs/pairWords.ts';

/*
 * Under the two maps, placing transfers says one thing at a time, in words for an author: what to pick next, in the order
 * the picks are made (the other map, then the door or the strip, then the way out or the landing); once every pick is
 * made, what the picks place, end by end; and, while an end could not stand where it is planned, or after that the player
 * could not land where an end sends them, why, as a problem that keeps anything from being placed. A spot or a landing
 * not judged yet is no problem.
 */
describe('pairWords', () =>
{
  const OUTSIDE: PairMap = { mapId: 20, name: 'Northeast Section', size: { width: 40, height: 30 } };
  const INSIDE: PairMap = { mapId: 28, name: 'Entrance', size: { width: 35, height: 30 } };
  const LOOKS: PairLooks = { door: { characterName: '!doors', characterIndex: 0, direction: 2, pattern: 1 }, sounds: { door: 'Open1', movement: '' } };
  const NAMES: Readonly<Record<number, string>> = { 20: 'Northeast Section', 28: 'Entrance' };

  /**
   * Names a map the fixtures know.
   * @param {number} mapId The map.
   * @returns {string} Its name.
   */
  const mapName = (mapId: number): string => NAMES[mapId] ?? `Map ${mapId}`;

  /**
   * Builds picks from the empty ones.
   * @param {Partial<PairPicks>} picks The picks made.
   * @returns {PairPicks} The picks.
   */
  const picked = (picks: Partial<PairPicks>): PairPicks => ({ ...NO_PICKS, ...picks });

  /**
   * Reads what the readout says for picks, every landing judged fine.
   * @param {PairPicks} picks The picks.
   * @param {PairMap | null} far The other map.
   * @returns {string} The words.
   */
  const says = (picks: PairPicks, far: PairMap | null = INSIDE): string =>
  {
    const plan = far === null ? null : pairPlanOf(picks, OUTSIDE, far, LOOKS);
    return pairReadout(picks, far, plan, [], mapName).text;
  };

  describe('pairReadout', () =>
  {
    it('asks for each pick in turn, the other map first', () =>
    {
      // Arrange: a door pair and an edge, one pick at a time.
      const steps = [
        says(picked({ kind: 'door', door: { x: 14, y: 6 } }), null),
        says(picked({ kind: 'door' })),
        says(picked({ kind: 'door', door: { x: 14, y: 6 } })),
        says(picked({ kind: 'door', ways: 'one', door: { x: 14, y: 6 } })),
        says(picked({ kind: 'edge' })),
        says(picked({ kind: 'edge', ways: 'one', strip: { edge: 'top', start: 2, length: 3 } })),
      ];

      // Act: each is read as it stands.

      // Assert.
      expect(steps)
        .toStrictEqual([
          'Choose the map the transfer leads to.',
          'Click the door\'s tile on the left map.',
          'Click the way out on the right map: the dip in the wall the player leaves by. They arrive one tile north of it.',
          'Click where the player lands on the right map.',
          'Drag along the left map\'s edge where the player walks off it.',
          'Click where the player lands on the right map.',
        ]);
    });

    it('says what a complete pick places, end by end, and that a one-way places no way back', () =>
    {
      // Arrange: a door pair, an edge pair, and a one-way strip.
      const doors = says(picked({ kind: 'door', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } }));
      const edges = says(picked({ kind: 'edge', strip: { edge: 'bottom', start: 30, length: 3 } }));
      const oneWay = says(picked({ kind: 'edge', ways: 'one', strip: { edge: 'left', start: 4, length: 5 }, landing: { x: 33, y: 7 } }));

      // Act: each is read as it stands.

      // Assert.
      expect([ doors, edges, oneWay ])
        .toStrictEqual([
          'The door on 14, 6 takes the player to 8, 14 in Entrance; the way out on 8, 15 brings them back to 14, 7 in Northeast Section.',
          'The 3-tile strip along the bottom edge takes the player to 17, 1 in Entrance; the strip on the other edge brings them back to 31, 28 in Northeast Section.',
          'The 5-tile strip along the left edge takes the player to 33, 7 in Entrance. No way back is placed.',
        ]);
    });

    it('says why the player could not land where an end sends them, as a problem, the first such end first', () =>
    {
      // Arrange: a door pair whose way back lands on a wall, and whose way in is not judged yet.
      const picks = picked({ kind: 'door', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } });
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);

      // Act.
      const readout = pairReadout(picks, INSIDE, plan, [ null, { kind: 'blocked' } ], mapName);

      // Assert.
      expect(readout)
        .toStrictEqual({ text: 'The player can\'t land on 14, 7 in Northeast Section. The tiles there let no one through.', problem: true });
    });

    it('says why an end cannot stand where it is planned, as a problem, before any landing, and nothing for spots all clear', () =>
    {
      // Arrange: a door pair whose way out stands on another event's tile and whose way back lands on a wall, and the same
      // pair with every spot clear.
      const picks = picked({ kind: 'door', door: { x: 14, y: 6 }, exit: { x: 8, y: 15 } });
      const plan = pairPlanOf(picks, OUTSIDE, INSIDE, LOOKS);
      const taken = [ null, 'Barrel (event 4) already stands on 8, 15 in Entrance.' ];

      // Act.
      const blocked = pairReadout(picks, INSIDE, plan, [ null, { kind: 'blocked' } ], mapName, taken);
      const clear = pairReadout(picks, INSIDE, plan, [], mapName, [ null, null ]);

      // Assert.
      expect([ blocked, clear ])
        .toStrictEqual([
          { text: 'Barrel (event 4) already stands on 8, 15 in Entrance.', problem: true },
          { text: 'The door on 14, 6 takes the player to 8, 14 in Entrance; the way out on 8, 15 brings them back to 14, 7 in Northeast Section.', problem: false },
        ]);
    });
  });

  describe('placedWords', () =>
  {
    it('says what was placed, by kind and by ways', () =>
    {
      // Arrange: each kind both ways and one way.
      const all = [
        picked({ kind: 'door', ways: 'both' }),
        picked({ kind: 'edge', ways: 'both' }),
        picked({ kind: 'door', ways: 'one' }),
        picked({ kind: 'edge', ways: 'one' }),
      ];

      // Act.
      const words = all.map(placedWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'Door pair placed.', 'Edge pair placed.', 'One-way door placed.', 'One-way edge placed.' ]);
    });
  });

  describe('landingRefusalWords', () =>
  {
    it('names the tile and the map, then says why in the landing check\'s own words', () =>
    {
      // Arrange: an event in the way.
      const problem = { kind: 'occupied' as const, eventId: 4, name: 'Barrel' };

      // Act.
      const words = landingRefusalWords({ x: 8, y: 14 }, 'Entrance', problem);

      // Assert.
      expect(words)
        .toBe('The player can\'t land on 8, 14 in Entrance. Barrel (event 4) stands there, and the player cannot share its tile.');
    });
  });
});
