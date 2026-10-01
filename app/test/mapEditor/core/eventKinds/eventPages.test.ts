import { describe, expect, it } from 'vitest';
import {
  endsList,
  hasGraphic,
  isEmptyPage,
  readFlatUnits,
  readTextPage,
} from '../../../../src/mapEditor/core/eventKinds/eventPages.ts';
import { chestRoute, command, page, text } from '../../support/eventKindFixtures.ts';

/*
 * Every kind reads an event's pages through these, so they carry the rules every kind leans on. An empty page runs
 * nothing, not even a comment, because comments are how plugins tag events. A flat page keeps everything at the top
 * level: a branch or a choice holds commands deeper down, which run only sometimes, and a page holding one reads as
 * null so no kind ever mistakes a conditional transfer for a transfer. Continuation lines travel with the command
 * they carry on, and a list MZ would never write (a stray line, a missing or early end) is refused rather than read
 * as something it is not. A text page talks and does nothing else.
 */
describe('eventPages', () =>
{
  describe('isEmptyPage', () =>
  {
    it('calls a page with only its closing command empty, and one with a comment not', () =>
    {
      // Arrange.
      const empty = page([]);
      const commented = page([ command(108, [ '<enemyId:3>' ]) ]);

      // Act.
      const answers = [ isEmptyPage(empty), isEmptyPage(commented) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, false ]);
    });
  });

  describe('hasGraphic', () =>
  {
    it('sees a character or a tile, and nothing in an empty picture', () =>
    {
      // Arrange.
      const blank = page([]).image;

      // Act.
      const answers = [
        hasGraphic({ ...blank, characterName: '!Door1' }),
        hasGraphic({ ...blank, tileId: 423 }),
        hasGraphic(blank),
      ];

      // Assert.
      expect(answers)
        .toStrictEqual([ true, true, false ]);
    });
  });

  describe('endsList', () =>
  {
    it('wants the closing command last and at the top level', () =>
    {
      // Arrange: a list closed properly, one closed inside a block, and one with nothing at all.
      const lists = [ [ command(0) ], [ command(0, [], 1) ], [] ];

      // Act.
      const answers = lists.map(endsList);

      // Assert.
      expect(answers)
        .toStrictEqual([ true, false, false ]);
    });
  });

  describe('readFlatUnits', () =>
  {
    it('keeps each command with the lines that carry it on', () =>
    {
      // Arrange.
      const { list } = page([ ...text([ 'one', 'two' ]), ...chestRoute(), command(123, [ 'A', 0 ]) ]);

      // Act.
      const units = readFlatUnits(list);

      // Assert: Show Text with its 2 lines, the route with its 5 steps, then the switch.
      expect(units?.map(unit => [ unit.index, unit.command.code, unit.lines.length ]))
        .toStrictEqual([ [ 0, 101, 2 ], [ 3, 205, 5 ], [ 9, 123, 0 ] ]);
    });

    it('reads a page holding nothing as no units', () =>
    {
      // Arrange.
      const { list } = page([]);

      // Act.
      const units = readFlatUnits(list);

      // Assert.
      expect(units)
        .toStrictEqual([]);
    });

    it('refuses a page holding a block, whose inside runs only sometimes', () =>
    {
      // Arrange: a transfer inside a conditional branch.
      const { list } = page([ command(111, [ 0, 1, 0 ]), command(201, [ 0, 5, 3, 4, 2, 0 ], 1), command(0, [], 1), command(412) ]);

      // Act.
      const units = readFlatUnits(list);

      // Assert.
      expect(units)
        .toBeNull();
    });

    it('refuses a continuation line with no command before it, and an early end', () =>
    {
      // Arrange.
      const stray = page([ command(401, [ 'orphan' ]) ]).list;
      const early = [ command(250, [ {} ]), command(0), command(250, [ {} ]), command(0) ];

      // Act.
      const answers = [ readFlatUnits(stray), readFlatUnits(early) ];

      // Assert.
      expect(answers)
        .toStrictEqual([ null, null ]);
    });

    it('refuses a list that does not close with the empty command', () =>
    {
      // Arrange.
      const unclosed = [ command(250, [ {} ]) ];

      // Act.
      const units = readFlatUnits(unclosed);

      // Assert.
      expect(units)
        .toBeNull();
    });
  });

  describe('readTextPage', () =>
  {
    it('reads every message of a page that only talks', () =>
    {
      // Arrange.
      const talk = page([ ...text([ 'Hello.' ], 0, 'face_je'), ...text([ 'Line one', 'Line two' ]) ]);

      // Act.
      const messages = readTextPage(talk);

      // Assert.
      expect(messages?.map(message => [ message.index, message.model.faceName, message.model.lines ]))
        .toStrictEqual([ [ 0, 'face_je', [ 'Hello.' ] ], [ 2, '', [ 'Line one', 'Line two' ] ] ]);
    });

    it('refuses a page that does anything besides talk, or says nothing', () =>
    {
      // Arrange: talk beside a comment, talk beside a sound, and an empty page.
      const pages = [
        page([ ...text([ 'Hi.' ]), command(108, [ '<light:3>' ]) ]),
        page([ command(250, [ { name: 'Bell', volume: 90, pitch: 100, pan: 0 } ]), ...text([ 'Hi.' ]) ]),
        page([]),
      ];

      // Act.
      const answers = pages.map(readTextPage);

      // Assert.
      expect(answers)
        .toStrictEqual([ null, null, null ]);
    });

    it('refuses a Show Text shaped in a way MZ never writes', () =>
    {
      // Arrange: a text line holding a number instead of text.
      const odd = page([ command(101, [ '', 0, 0, 2, '' ]), command(401, [ 7 ]) ]);

      // Act.
      const messages = readTextPage(odd);

      // Assert.
      expect(messages)
        .toBeNull();
    });
  });
});
