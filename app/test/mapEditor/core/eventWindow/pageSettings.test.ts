import { describe, expect, it } from 'vitest';
import type { EventMovementFields } from '../../../../src/mapEditor/core/eventPage/eventMovement.ts';
import { PAGE_GONE_MESSAGE, targetHistory } from '../../../../src/mapEditor/core/eventWindow/eventWindowTarget.ts';
import {
  PAGE_OPTIONS,
  readPageOptions,
  setPageImage,
  setPageMovement,
  setPageOption,
  setPagePriority,
  setPageTrigger,
} from '../../../../src/mapEditor/core/eventWindow/pageSettings.ts';
import type { RmmzEventImage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { eventWindowHub, eventWindowMap, expectedMap, heldMap, markedPage, TARGET } from '../../support/eventWindowFixtures.ts';

/*
 * A page's settings: its four options (the walking and stepping animations, direction fix and through), where it
 * draws relative to characters, what starts it, and the two groups the graphic picker and the movement settings edit,
 * its picture and its movement. Each change is one step in the event's own history and writes only the fields it
 * changes, so its nearest neighbours stay put: walking never reaches stepping, direction fix never reaches through, a
 * new facing never rewrites the sheet, and a new speed never rewrites the route. A value the game cannot run is
 * refused, changing nothing.
 *
 * The fixture's pages turn walking off and direction fix on, and give each page its own trigger and priority.
 */
describe('pageSettings', () =>
{
  /**
   * Lists the paths a step wrote, inside the page.
   * @param {ReturnType<typeof setPageImage>} outcome The step's outcome.
   * @returns {string[]} The paths after the page, joined with slashes.
   */
  const writtenPaths = (outcome: ReturnType<typeof setPageImage>): string[] =>
  {
    return outcome.ok && outcome.step !== null
      ? outcome.step.entries.map(entry => (entry.patch.kind === 'set' ? entry.patch.path.slice(4).join('/') : entry.patch.kind))
      : [];
  };

  describe('readPageOptions', () =>
  {
    it('reads the four options in the window\'s words', () =>
    {
      // Arrange.
      const page = { ...markedPage(1), stepAnime: true };

      // Act.
      const options = readPageOptions(page);

      // Assert.
      expect(options)
        .toStrictEqual({ walking: false, stepping: true, directionFix: true, through: false });
    });
  });

  describe('setPageOption', () =>
  {
    it('flips each option through its own field alone, never its neighbour\'s', () =>
    {
      // Arrange: one hub per option, each flipped from what the fixture holds.
      const flipped = PAGE_OPTIONS.map(option =>
      {
        const hub = eventWindowHub();
        const current = readPageOptions(markedPage(2))[option];
        return { hub, outcome: setPageOption(hub, TARGET, 1, option, current === false) };
      });

      // Act.
      const results = flipped.map(({ hub, outcome }) => [ outcome.ok && outcome.step?.label, writtenPaths(outcome), heldMap(hub).events[2]!.pages[1] ]);

      // Assert.
      expect(results)
        .toStrictEqual([
          [ 'Turn on walking animation (page 2)', [ 'walkAnime' ], { ...markedPage(2), walkAnime: true } ],
          [ 'Turn on stepping animation (page 2)', [ 'stepAnime' ], { ...markedPage(2), stepAnime: true } ],
          [ 'Turn off direction fix (page 2)', [ 'directionFix' ], { ...markedPage(2), directionFix: false } ],
          [ 'Turn on through (page 2)', [ 'through' ], { ...markedPage(2), through: true } ],
        ]);
    });

    it('changes nothing else on the map, and one undo takes it back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      setPageOption(hub, TARGET, 0, 'through', true);
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert.
      expect([ changed, heldMap(hub) ])
        .toStrictEqual([
          expectedMap(event =>
          {
            event.pages[0].through = true;
          }),
          eventWindowMap(),
        ]);
    });

    it('records nothing for an option already set that way, and refuses a page that has gone', () =>
    {
      // Arrange: walking is off on every fixture page.
      const hub = eventWindowHub();

      // Act.
      const outcomes = [ setPageOption(hub, TARGET, 0, 'walking', false), setPageOption(hub, TARGET, 4, 'walking', true) ];

      // Assert.
      expect([ outcomes, heldMap(hub) ])
        .toStrictEqual([ [ { ok: true, step: null, page: 0 }, { ok: false, message: PAGE_GONE_MESSAGE } ], eventWindowMap() ]);
    });
  });

  describe('setPagePriority', () =>
  {
    it('changes the priority alone, as one step that one undo takes back', () =>
    {
      // Arrange: page 1's priority is 1.
      const hub = eventWindowHub();

      // Act.
      const outcome = setPagePriority(hub, TARGET, 0, 2);
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the trigger beside it never changed.
      expect([ outcome.ok && outcome.step?.label, writtenPaths(outcome), changed, heldMap(hub) ])
        .toStrictEqual([
          'Change priority (page 1)',
          [ 'priorityType' ],
          expectedMap(event =>
          {
            event.pages[0].priorityType = 2;
          }),
          eventWindowMap(),
        ]);
    });

    it('takes below, the same as and above characters, and refuses anything else', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const outcomes = [ 0, 1, 2, 3, -1, 1.5 ].map(priority => setPagePriority(hub, TARGET, 2, priority).ok);

      // Assert.
      expect(outcomes)
        .toStrictEqual([ true, true, true, false, false, false ]);
    });
  });

  describe('setPageTrigger', () =>
  {
    it('changes the trigger alone, as one step that one undo takes back', () =>
    {
      // Arrange: page 3's trigger is 3.
      const hub = eventWindowHub();

      // Act.
      const outcome = setPageTrigger(hub, TARGET, 2, 4);
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the priority beside it never changed.
      expect([ outcome.ok && outcome.step?.label, writtenPaths(outcome), changed, heldMap(hub) ])
        .toStrictEqual([
          'Change trigger (page 3)',
          [ 'trigger' ],
          expectedMap(event =>
          {
            event.pages[2].trigger = 4;
          }),
          eventWindowMap(),
        ]);
    });

    it('takes the five ways a page starts, and refuses anything else, with a message', () =>
    {
      // Arrange.
      const hub = eventWindowHub();

      // Act.
      const accepted = [ 0, 1, 2, 3, 4 ].map(trigger => setPageTrigger(hub, TARGET, 0, trigger).ok);
      const refused = setPageTrigger(hub, TARGET, 0, 5);

      // Assert.
      expect([ accepted, refused ])
        .toStrictEqual([
          [ true, true, true, true, true ],
          { ok: false, message: 'A page starts by the action button, player touch, event touch, autorun or parallel.' },
        ]);
    });
  });

  describe('setPageImage', () =>
  {
    it('writes only the parts of the picture that changed, as one step that one undo takes back', () =>
    {
      // Arrange: page 2 shows Sheet2's third character, facing down.
      const hub = eventWindowHub();
      const image: RmmzEventImage = { ...markedPage(2).image, direction: 8, pattern: 2 };

      // Act.
      const outcome = setPageImage(hub, TARGET, 1, image);
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the sheet and the character were left as they were.
      expect([ outcome.ok && outcome.step?.label, writtenPaths(outcome), changed, heldMap(hub) ])
        .toStrictEqual([
          'Change graphic (page 2)',
          [ 'image/direction', 'image/pattern' ],
          expectedMap(event =>
          {
            event.pages[1].image = image;
          }),
          eventWindowMap(),
        ]);
    });

    it('swaps a sheet for a tile', () =>
    {
      // Arrange.
      const hub = eventWindowHub();
      const tile: RmmzEventImage = { tileId: 41, characterName: '', direction: 2, pattern: 0, characterIndex: 0 };

      // Act.
      setPageImage(hub, TARGET, 0, tile);

      // Assert.
      expect(heldMap(hub).events[2]!.pages[0].image)
        .toStrictEqual(tile);
    });

    it('refuses a picture the game cannot show, changing nothing', () =>
    {
      // Arrange: each one part past what the game shows.
      const hub = eventWindowHub();
      const { image } = markedPage(1);
      const pictures = [
        { ...image, direction: 5 },
        { ...image, pattern: 3 },
        { ...image, characterIndex: 8 },
        { ...image, tileId: -1 },
        { ...image, characterName: 7 },
      ] as unknown as RmmzEventImage[];

      // Act.
      const outcomes = pictures.map(picture => setPageImage(hub, TARGET, 0, picture));

      // Assert.
      expect([ outcomes.map(outcome => outcome.ok || outcome.message), heldMap(hub) ])
        .toStrictEqual([ pictures.map(() => 'That picture is not one a page can show.'), eventWindowMap() ]);
    });
  });

  describe('setPageMovement', () =>
  {
    /**
     * Reads a fixture page's movement in the page's own fields, as the movement settings hand it over.
     * @param {number} mark The page's mark.
     * @returns {EventMovementFields} The movement.
     */
    const movementOf = (mark: number): EventMovementFields =>
    {
      const { moveType, moveSpeed, moveFrequency, moveRoute } = markedPage(mark);
      return { moveType, moveSpeed, moveFrequency, moveRoute };
    };

    it('writes only the parts of the movement that changed, as one step that one undo takes back', () =>
    {
      // Arrange.
      const hub = eventWindowHub();
      const movement: EventMovementFields = { ...movementOf(1), moveSpeed: 5 };

      // Act.
      const outcome = setPageMovement(hub, TARGET, 0, movement);
      const changed = heldMap(hub);
      hub.undo(targetHistory(TARGET));

      // Assert: the route was left as it was.
      expect([ outcome.ok && outcome.step?.label, writtenPaths(outcome), changed, heldMap(hub) ])
        .toStrictEqual([
          'Change movement (page 1)',
          [ 'moveSpeed' ],
          expectedMap(event =>
          {
            event.pages[0].moveSpeed = 5;
          }),
          eventWindowMap(),
        ]);
    });

    it('writes a custom route and its type together', () =>
    {
      // Arrange: a route turning the event left, then right, repeating.
      const hub = eventWindowHub();
      const route = { list: [ { code: 16 }, { code: 17 }, { code: 0 } ], repeat: true, skippable: true, wait: false };
      const movement: EventMovementFields = { ...movementOf(3), moveType: 3, moveRoute: route };

      // Act.
      const outcome = setPageMovement(hub, TARGET, 2, movement);

      // Assert.
      expect([ writtenPaths(outcome), heldMap(hub).events[2]!.pages[2] ])
        .toStrictEqual([ [ 'moveType', 'moveRoute' ], { ...markedPage(3), moveType: 3, moveRoute: route } ]);
    });

    it('refuses a movement the game cannot run, changing nothing', () =>
    {
      // Arrange: each one part past what the game runs.
      const hub = eventWindowHub();
      const base = movementOf(1);
      const movements: EventMovementFields[] = [
        { ...base, moveType: 4 },
        { ...base, moveSpeed: 0 },
        { ...base, moveSpeed: 7 },
        { ...base, moveFrequency: 0 },
        { ...base, moveFrequency: 6 },
        { ...base, moveRoute: { ...base.moveRoute, list: [ { code: 16 } ] } },
      ];

      // Act.
      const outcomes = movements.map(movement => setPageMovement(hub, TARGET, 0, movement));

      // Assert.
      expect([ outcomes.map(outcome => outcome.ok || outcome.message), heldMap(hub) ])
        .toStrictEqual([ movements.map(() => 'That movement is not one a page can make.'), eventWindowMap() ]);
    });
  });
});
