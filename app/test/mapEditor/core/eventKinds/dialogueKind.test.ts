import { describe, expect, it } from 'vitest';
import { dialogueQuickModel, isDialogue, readDialogue, speakerHint } from '../../../../src/mapEditor/core/eventKinds/dialogueKind.ts';
import { editQuickField } from '../../../../src/mapEditor/core/eventKinds/quickFields.ts';
import { mapHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import { cloneJson } from '../../../../src/mapEditor/core/model/json.ts';
import { applyEdits, command, event, eventIn, hubWith, page, text } from '../../support/eventKindFixtures.ts';

/*
 * Dialogue is an event that only ever talks: every page either says something and does nothing else, or runs
 * nothing at all, and at least one page says something. A sign, a villager with a line or two. Talk beside a
 * choice, a sound or a comment is a scene, or a plugin's event, and is left alone.
 *
 * The panel edits the text of every message, with no cap on its lines, keeping each message's face, window and
 * speaker; a message rewritten to more or fewer lines replaces its lines in place, and one undo puts it back.
 */
describe('dialogueKind', () =>
{
  describe('readDialogue', () =>
  {
    it('reads every message of an event that only talks, across its pages, past an empty one', () =>
    {
      // Arrange.
      const villager = event(1, [ page(text([ 'Hello!' ], 0, 'face_vi')), page([]), page([ ...text([ 'Again?' ]), ...text([ 'Bye.' ]) ]) ]);

      // Act.
      const messages = readDialogue(villager);

      // Assert.
      expect(messages?.map(message => [ message.pageIndex, message.index, message.model.lines ]))
        .toStrictEqual([ [ 0, 0, [ 'Hello!' ] ], [ 2, 0, [ 'Again?' ] ], [ 2, 2, [ 'Bye.' ] ] ]);
    });

    it('refuses talk beside a choice, a sound or a comment, and an event that says nothing', () =>
    {
      // Arrange.
      const events = [
        event(1, [ page([ ...text([ 'Rest?' ]), command(102, [ [ 'Yes', 'No' ], 1, 0, 2, 0 ]), command(402, [ 0, 'Yes' ]), command(0, [], 1), command(404) ]) ]),
        event(2, [ page([ command(250, [ { name: 'Bell', volume: 90, pitch: 100, pan: 0 } ]), ...text([ 'Ding.' ]) ]) ]),
        event(3, [ page([ command(108, [ '<chatter:hi>' ]), ...text([ 'Hi.' ]) ]) ]),
        event(4, [ page([]) ]),
      ];

      // Act.
      const answers = events.map(isDialogue);

      // Assert.
      expect(answers)
        .toStrictEqual([ false, false, false, false ]);
    });
  });

  describe('speakerHint', () =>
  {
    it('says the face and the name above the text, whichever are set', () =>
    {
      // Arrange.
      const model = { faceName: 'face_je', faceIndex: 3, background: 0, position: 2, speakerName: '\\N[1]', lines: [] };

      // Act.
      const hints = [ speakerHint(model), speakerHint({ ...model, faceName: '' }), speakerHint({ ...model, speakerName: '' }), speakerHint({ ...model, faceName: '', speakerName: '' }) ];

      // Assert.
      expect(hints)
        .toStrictEqual([ 'face_je 4 · \\N[1]', '\\N[1]', 'face_je 4', '' ]);
    });
  });

  describe('dialogueQuickModel', () =>
  {
    it('offers each message\'s text, named in order and filed by page when there are several', () =>
    {
      // Arrange.
      const single = event(1, [ page([ ...text([ 'North:', 'Harbor' ]), ...text([ 'South: Mines' ], 0, 'face_je') ]) ]);
      const paged = event(2, [ page(text([ 'Hello!' ])), page(text([ 'Again?' ])) ]);

      // Act.
      const fields = [ single, paged ].map(each => dialogueQuickModel(each).fields.map(field => [ field.key, field.label, field.section, field.value, field.hint ?? null ]));

      // Assert.
      expect(fields)
        .toStrictEqual([
          [ [ 'message.0', 'Message 1', '', 'North:\nHarbor', null ], [ 'message.1', 'Message 2', '', 'South: Mines', 'face_je 1' ] ],
          [ [ 'message.0', 'Message 1', 'Page 1', 'Hello!', null ], [ 'message.1', 'Message 2', 'Page 2', 'Again?', null ] ],
        ]);
    });

    it('offers nothing for an event that is not dialogue', () =>
    {
      // Arrange.
      const marker = event(1, [ page([]) ]);

      // Act.
      const model = dialogueQuickModel(marker);

      // Assert.
      expect(model)
        .toStrictEqual({ fields: [], actions: [] });
    });

    it('rewrites a message to more lines than it had, past MZ\'s four, leaving the next message where it was', () =>
    {
      // Arrange.
      const sign = event(1, [ page([ ...text([ 'North:' ]), ...text([ 'South: Mines' ]) ]) ]);
      const [ first ] = dialogueQuickModel(sign).fields;

      // Act.
      const edited = applyEdits(sign, first.write('one\ntwo\nthree\nfour\nfive'));

      // Assert.
      expect(edited.pages[0].list.map(each => [ each.code, each.parameters[0] ]))
        .toStrictEqual([ [ 101, '' ], [ 401, 'one' ], [ 401, 'two' ], [ 401, 'three' ], [ 401, 'four' ], [ 401, 'five' ], [ 101, '' ], [ 401, 'South: Mines' ], [ 0, undefined ] ]);
    });

    it('changes nothing for the text a message already says, even a single empty line', () =>
    {
      // Arrange: the game's Hunting Lord shows one empty line, which reads as an empty box.
      const lord = event(4, [ page(text([ '' ])) ]);
      const [ field ] = dialogueQuickModel(lord).fields;

      // Act.
      const edits = [ field.write(''), field.write('Hm.') ];

      // Assert.
      expect([ field.value, edits[0], edits[1].length ])
        .toStrictEqual([ '', [], 1 ]);
    });

    it('rewrites a message to fewer lines, and one undo puts it back exactly', () =>
    {
      // Arrange.
      const sign = event(2, [ page([ ...text([ 'a', 'b', 'c' ], 0, 'face_je') ]) ]);
      const { hub } = hubWith([ sign ]);

      // Act.
      const step = editQuickField(hub, 1, [ 2 ], dialogueQuickModel, { events: [], names: null }, 'message.0', 'only');
      const changed = cloneJson(eventIn(hub, 2)?.pages[0].list);
      hub.undo(mapHistoryKey(1));

      // Assert.
      expect([ step?.label, changed, eventIn(hub, 2) ])
        .toStrictEqual([
          'Change dialogue',
          [ command(101, [ 'face_je', 0, 0, 2, '' ]), command(401, [ 'only' ]), command(0) ],
          sign,
        ]);
    });
  });
});
