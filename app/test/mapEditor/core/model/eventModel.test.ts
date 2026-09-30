import { describe, expect, it } from 'vitest';
import {
  createEventPage,
  createMapEvent,
  describeEventPage,
  pageCommentText,
} from '../../../../src/mapEditor/core/model/eventModel.ts';

/*
 * The event model is RMMZ's own shape, typed, plus the few things every later package needs from it: a new
 * page and a new event exactly as MZ would make them (so an event placed here is indistinguishable in the file
 * from one placed in MZ), the grouped view the event window reads, and the comment text that plugin detectors
 * look for tags in. The grouped view must never copy: it is a lens over the stored page, and an edit made
 * through a copy would go nowhere.
 */
describe('eventModel', () =>
{
  describe('createEventPage', () =>
  {
    it('builds the page MZ builds', () =>
    {
      // Arrange: nothing; a new page has no inputs.

      // Act.
      const page = createEventPage();

      // Assert.
      expect(page)
        .toStrictEqual({
          conditions: {
            actorId: 1,
            actorValid: false,
            itemId: 1,
            itemValid: false,
            selfSwitchCh: 'A',
            selfSwitchValid: false,
            switch1Id: 1,
            switch1Valid: false,
            switch2Id: 1,
            switch2Valid: false,
            variableId: 1,
            variableValid: false,
            variableValue: 0,
          },
          directionFix: false,
          image: { tileId: 0, characterName: '', direction: 2, pattern: 0, characterIndex: 0 },
          list: [ { code: 0, indent: 0, parameters: [] } ],
          moveFrequency: 3,
          moveRoute: { list: [ { code: 0, parameters: [] } ], repeat: true, skippable: false, wait: false },
          moveSpeed: 3,
          moveType: 0,
          priorityType: 0,
          stepAnime: false,
          through: false,
          trigger: 0,
          walkAnime: true,
        });
    });

    it('builds a fresh page every time, sharing nothing', () =>
    {
      // Arrange.
      const first = createEventPage();

      // Act.
      const second = createEventPage();
      first.list.push({ code: 101, indent: 0, parameters: [] });

      // Assert.
      expect(second.list)
        .toHaveLength(1);
    });
  });

  describe('createMapEvent', () =>
  {
    it('names the event the way MZ does, padded to three digits', () =>
    {
      // Arrange: three ids either side of the padding.

      // Act.
      const names = [ createMapEvent(1, 0, 0).name, createMapEvent(12, 0, 0).name, createMapEvent(1200, 0, 0).name ];

      // Assert.
      expect(names)
        .toStrictEqual([ 'EV001', 'EV012', 'EV1200' ]);
    });

    it('places it where asked, with one page and no note', () =>
    {
      // Arrange: the position.

      // Act.
      const event = createMapEvent(5, 7, 9);

      // Assert.
      expect([ event.id, event.x, event.y, event.note, event.pages.length, Object.hasOwn(event, 'meta') ])
        .toStrictEqual([ 5, 7, 9, '', 1, false ]);
    });
  });

  describe('describeEventPage', () =>
  {
    it('groups the page for the event window without copying it', () =>
    {
      // Arrange.
      const page = { ...createEventPage(), moveType: 3, moveSpeed: 5, moveFrequency: 4, stepAnime: true, trigger: 1 };

      // Act.
      const view = describeEventPage(page);

      // Assert.
      expect([
        view.movement.type,
        view.movement.speed,
        view.movement.frequency,
        view.options.stepping,
        view.options.walking,
        view.trigger,
        view.movement.route === page.moveRoute,
        view.commands === page.list,
      ])
        .toStrictEqual([ 3, 5, 4, true, true, 1, true, true ]);
    });
  });

  describe('pageCommentText', () =>
  {
    it('collects comment lines and ignores dialogue lines beside them', () =>
    {
      // Arrange.
      const page = createEventPage();
      page.list = [
        { code: 108, indent: 0, parameters: [ '<enemyId:12>' ] },
        { code: 408, indent: 0, parameters: [ '<moveSpeed:4>' ] },
        { code: 401, indent: 0, parameters: [ 'Not a comment.' ] },
        { code: 108, indent: 0, parameters: [ '<light:3>' ] },
        { code: 0, indent: 0, parameters: [] },
      ];

      // Act.
      const text = pageCommentText(page);

      // Assert.
      expect(text)
        .toBe('<enemyId:12>\n<moveSpeed:4>\n<light:3>');
    });

    it('reads an empty line for a comment whose text is not a string', () =>
    {
      // Arrange.
      const page = createEventPage();
      page.list = [
        { code: 108, indent: 0, parameters: [ 42 ] },
        { code: 408, indent: 0, parameters: [ 'after' ] },
      ];

      // Act.
      const text = pageCommentText(page);

      // Assert.
      expect(text)
        .toBe('\nafter');
    });
  });
});
