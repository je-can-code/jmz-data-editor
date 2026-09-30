import { describe, expect, it } from 'vitest';
import type { CommandCatalogEntry } from '../../../../src/mapEditor/core/commands/catalogTypes.ts';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { registerBuiltInCommands } from '../../../../src/mapEditor/core/commands/builtin/builtInCommands.ts';
import { CommandListEditor } from '../../../../src/mapEditor/core/commandList/CommandListEditor.ts';
import { writeClipboard } from '../../../../src/mapEditor/core/commandList/commandClipboard.ts';
import type { CommandBlockNode } from '../../../../src/mapEditor/core/commandList/commandTree.ts';
import { DocumentHub } from '../../../../src/mapEditor/core/history/DocumentHub.ts';
import { eventHistoryKey } from '../../../../src/mapEditor/core/history/historyKeys.ts';
import type { RmmzEventCommand, RmmzMap } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { buildMixedList, cmd } from '../../support/commandFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The command list editor is where every change to a list is decided, so the component drawing the list decides
 * nothing that reaches disk. It owes the list three things. Each operation (add, delete, move, duplicate, paste,
 * edit, an else added or removed) lands as exactly one named step in the list's history, so undo takes back
 * exactly what the author did. Each step is the smallest splice, touching only what changed. And an operation that
 * changes nothing (a drop where the commands already are, a paste of text that is not commands) records nothing.
 */
describe('CommandListEditor', () =>
{
  /**
   * The path to event 1's first page's list in the fixture map.
   */
  const PATH = [ 'events', 1, 'pages', 0, 'list' ] as const;

  /**
   * A hub holding a map whose event 1 runs a list (the mixed list unless another is given), and an editor on it.
   * @param {RmmzEventCommand[]} list The list event 1 runs.
   * @returns {{ hub: DocumentHub, editor: CommandListEditor, catalog: CommandCatalog }} The pieces.
   */
  const build = (list: RmmzEventCommand[] = buildMixedList()) =>
  {
    const map: RmmzMap = buildMapJson();
    (map.events[1] as NonNullable<RmmzMap['events'][number]>).pages[0].list = list;
    const hub = new DocumentHub({ clientId: 'window-a' });
    hub.adopt('map:1', map as never);
    const catalog = new CommandCatalog();
    registerBuiltInCommands(catalog);
    const editor = new CommandListEditor(hub, catalog, { documentKey: 'map:1', path: PATH, histories: [ eventHistoryKey(1, 1) ] });
    return { hub, editor, catalog };
  };

  /**
   * Describes commands compactly: code and indent.
   * @param {readonly RmmzEventCommand[]} commands The commands.
   * @returns {string[]} Such as "111@0".
   */
  const describeList = (commands: readonly RmmzEventCommand[]): string[] => commands.map(command => `${command.code}@${command.indent}`);

  /**
   * Lists the step names of the event's history.
   * @param {DocumentHub} hub The hub.
   * @returns {string[]} The names, oldest first.
   */
  const historyLabels = (hub: DocumentHub): string[] => hub.history(eventHistoryKey(1, 1)).rows.map(row => row.label);

  describe('reading', () =>
  {
    it('reads the live list out of its document', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const commands = editor.commands();

      // Assert.
      expect(commands)
        .toStrictEqual(buildMixedList());
    });

    it('refuses a path that holds no list', () =>
    {
      // Arrange.
      const { hub, catalog } = build();
      const editor = new CommandListEditor(hub, catalog, { documentKey: 'map:1', path: [ 'events', 1, 'name' ], histories: [ eventHistoryKey(1, 1) ] });

      // Act.
      const read = () => editor.commands();

      // Assert.
      expect(read)
        .toThrow('map:1 has no command list at events/1/name');
    });

    it('keeps its tree until the document changes', () =>
    {
      // Arrange.
      const { hub, editor } = build();
      const first = editor.tree();

      // Act.
      const again = editor.tree();
      hub.edit('Rename', [ eventHistoryKey(1, 1) ], tx => tx.set('map:1', [ 'events', 1, 'name' ], 'Gate'));
      const after = editor.tree();

      // Assert.
      expect([ again === first, after === first ])
        .toStrictEqual([ true, false ]);
    });

    it('finds units by their first command only', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const found = [ editor.nodeAt(0)?.kind, editor.nodeAt(3)?.kind, editor.nodeAt(1), editor.nodeAt(5), editor.nodeAt(22), editor.nodeAt(99) ];

      // Assert: a continuation line, a body's end and the list's end start no unit.
      expect(found)
        .toStrictEqual([ 'line', 'block', null, null, null, null ]);
    });

    it('hands out a row\'s command with its lines, and a block head alone', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const drafts = [ editor.draftAt(0), editor.draftAt(3), editor.draftAt(99) ];

      // Assert.
      expect(drafts.map(draft => [ draft.command?.code, draft.continuation.length ]))
        .toStrictEqual([ [ 101, 2 ], [ 111, 0 ], [ undefined, 0 ] ]);
    });

    it('resolves a command\'s entry', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const ids = [ editor.entryAt(0).id, editor.entryAt(14).id ];

      // Assert.
      expect(ids)
        .toStrictEqual([ 'core:101', 'core:402' ]);
    });
  });

  describe('insertNew', () =>
  {
    it('adds a fresh command at a place as one step, and says where it went', () =>
    {
      // Arrange.
      const { hub, editor, catalog } = build();
      const branch = editor.nodeAt(3) as CommandBlockNode;
      const point = { body: branch.segments[0].body!, position: 1 };

      // Act.
      const { step, index } = editor.insertNew(catalog.entry('core:230') as CommandCatalogEntry, point);

      // Assert.
      expect([ step?.label, index, editor.commands()[5], historyLabels(hub) ])
        .toStrictEqual([ 'Add Wait', 5, cmd(230, 1, [ 60 ]), [ 'Add Wait' ] ]);
    });

    it('adds a whole block, closer and all', () =>
    {
      // Arrange.
      const { editor, catalog } = build();

      // Act.
      editor.insertNew(catalog.entry('core:112') as CommandCatalogEntry, { body: editor.tree().root, position: 0 });

      // Assert.
      expect(describeList(editor.commands().slice(0, 4)))
        .toStrictEqual([ '112@0', '0@1', '413@0', '101@0' ]);
    });
  });

  describe('remove, move and duplicate', () =>
  {
    it('deletes units as one step that undo takes back exactly, saying where the first one was', () =>
    {
      // Arrange.
      const { hub, editor } = build();
      const nodes = [ editor.nodeAt(13)!, editor.nodeAt(3)! ];

      // Act.
      const { step, index } = editor.remove(nodes);
      const afterDelete = describeList(editor.commands());
      hub.undo(eventHistoryKey(1, 1));

      // Assert.
      expect([ step?.label, index, afterDelete, editor.commands() ])
        .toStrictEqual([ 'Delete 2 commands', 3, [ '101@0', '401@0', '401@0', '0@0' ], buildMixedList() ]);
    });

    it('moves a unit as one step, says where it landed, and records nothing when it lands where it was', () =>
    {
      // Arrange.
      const { hub, editor } = build();
      const text = editor.nodeAt(0)!;

      // Act.
      const nowhere = editor.move([ text ], { body: editor.tree().root, position: 1 });
      const moved = editor.move([ text ], { body: editor.tree().root, position: 3 });

      // Assert: Show Text's three commands now sit just before the list's end.
      expect([ nowhere.step, moved.step?.label, moved.index, describeList(editor.commands()).slice(-4), historyLabels(hub) ])
        .toStrictEqual([ null, 'Move command', 19, [ '101@0', '401@0', '401@0', '0@0' ], [ 'Move command' ] ]);
    });

    it('duplicates units right after the last of them, saying where the copies start', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const { step, index } = editor.duplicate([ editor.nodeAt(0)! ]);

      // Assert.
      expect([ step?.label, index, describeList(editor.commands().slice(0, 7)) ])
        .toStrictEqual([ 'Duplicate command', 3, [ '101@0', '401@0', '401@0', '101@0', '401@0', '401@0', '111@0' ] ]);
    });

    it('reports nothing done when there is nothing to delete or duplicate', () =>
    {
      // Arrange.
      const { hub, editor } = build();

      // Act.
      const outcomes = [ editor.remove([]), editor.duplicate([]) ];

      // Assert.
      expect([ outcomes, historyLabels(hub) ])
        .toStrictEqual([ [ { step: null, index: 0 }, { step: null, index: 0 } ], [] ]);
    });
  });

  describe('unitsFrom', () =>
  {
    it('finds units following one another in a body, fewer when the body ends, none off a unit\'s start', () =>
    {
      // Arrange.
      const { editor } = build();

      // Act.
      const found = [ editor.unitsFrom(0, 2), editor.unitsFrom(13, 5), editor.unitsFrom(1, 1) ].map(nodes => nodes.map(node => node.start));

      // Assert.
      expect(found)
        .toStrictEqual([ [ 0, 3 ], [ 13 ], [] ]);
    });
  });

  describe('copy and paste', () =>
  {
    it('copies units as clipboard text and pastes them back, at the place\'s indent', () =>
    {
      // Arrange.
      const { hub, editor } = build();
      const text = editor.copy([ editor.nodeAt(0)! ]);
      const branch = editor.nodeAt(3) as CommandBlockNode;

      // Act.
      const pasted = editor.paste({ body: branch.segments[0].body!, position: 0 }, text);

      // Assert.
      expect([ pasted.ok && pasted.step?.label, pasted.ok && pasted.index, pasted.ok && pasted.count, describeList(editor.commands().slice(3, 8)), historyLabels(hub) ])
        .toStrictEqual([ 'Paste command', 4, 1, [ '111@0', '101@1', '401@1', '401@1', '250@1' ], [ 'Paste command' ] ]);
    });

    it('names a paste by the units it holds, not its lines', () =>
    {
      // Arrange: two units, one of them a block of three commands.
      const { editor } = build();
      const text = writeClipboard([ cmd(230, 0, [ 5 ]), cmd(112, 0), cmd(0, 1), cmd(413, 0) ]);

      // Act.
      const pasted = editor.paste({ body: editor.tree().root, position: 0 }, text);

      // Assert.
      expect(pasted.ok && pasted.step?.label)
        .toBe('Paste 2 commands');
    });

    it('pastes nothing, and records nothing, from text that is not commands', () =>
    {
      // Arrange.
      const { hub, editor } = build();

      // Act.
      const pasted = editor.paste({ body: editor.tree().root, position: 0 }, 'just words');

      // Assert.
      expect([ pasted, historyLabels(hub), editor.commands() ])
        .toStrictEqual([ { ok: false, reason: 'not-commands' }, [], buildMixedList() ]);
    });
  });

  describe('edit', () =>
  {
    it('replaces a command and its lines as one step, keeping the row\'s indent', () =>
    {
      // Arrange: an editor hands back Show Text with one line and the wrong indent.
      const { hub, editor } = build();
      const draft = { command: cmd(101, 5, [ 'Actor1', 1, 0, 2, 'Harold' ]), continuation: [ cmd(401, 5, [ 'Bye.' ]) ] };

      // Act.
      const step = editor.edit(0, draft);

      // Assert.
      expect([ step?.label, editor.commands().slice(0, 3), historyLabels(hub) ])
        .toStrictEqual([
          'Edit Show Text',
          [ cmd(101, 0, [ 'Actor1', 1, 0, 2, 'Harold' ]), cmd(401, 0, [ 'Bye.' ]), cmd(111, 0, [ 0, 1, 0 ]) ],
          [ 'Edit Show Text' ],
        ]);
    });

    it('brings a Show Choices\' branches in line in the same step', () =>
    {
      // Arrange: a third choice added to the opener.
      const { hub, editor } = build();
      const draft = { command: cmd(102, 0, [ [ 'Yes', 'No', 'Maybe' ], -2, 0, 2, 0 ]), continuation: [] };

      // Act.
      editor.edit(13, draft);
      const edited = describeList(editor.commands().slice(13));
      hub.undo(eventHistoryKey(1, 1));

      // Assert.
      expect([ edited, editor.commands() ])
        .toStrictEqual([
          [ '102@0', '402@0', '230@1', '0@1', '402@0', '0@1', '402@0', '0@1', '403@0', '0@1', '404@0', '0@0' ],
          buildMixedList(),
        ]);
    });

    it('records nothing when the edit changes nothing', () =>
    {
      // Arrange.
      const { hub, editor } = build();

      // Act.
      const step = editor.edit(0, editor.draftAt(0));

      // Assert.
      expect([ step, historyLabels(hub) ])
        .toStrictEqual([ null, [] ]);
    });
  });

  describe('blockSpanAt and editBlock', () =>
  {
    it('spans a merged run of Show Choices from either of its openers, and stops at anything between', () =>
    {
      // Arrange: two Show Choices back to back, a wait, then a third on its own.
      const { editor } = build([
        cmd(102, 0, [ [ 'A' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'A' ]), cmd(0, 1), cmd(404, 0),
        cmd(102, 0, [ [ 'B' ], -1, -1, 2, 0 ]), cmd(402, 0, [ 0, 'B' ]), cmd(0, 1), cmd(404, 0),
        cmd(230, 0, [ 5 ]),
        cmd(102, 0, [ [ 'C' ], -1, 0, 2, 0 ]), cmd(402, 0, [ 0, 'C' ]), cmd(0, 1), cmd(404, 0),
        cmd(0, 0),
      ]);

      // Act.
      const spans = [ editor.blockSpanAt(0), editor.blockSpanAt(4), editor.blockSpanAt(9) ];

      // Assert.
      expect(spans)
        .toStrictEqual([ { start: 0, end: 8 }, { start: 0, end: 8 }, { start: 9, end: 13 } ]);
    });

    it('gives no span to a branch row, a line, a block no editor reshapes, or past the end', () =>
    {
      // Arrange: the mixed list's else (6), a choice (14), its show text (0) and the loop in the else (7).
      const { editor } = build();

      // Act.
      const spans = [ 6, 14, 0, 7, 99 ].map(index => editor.blockSpanAt(index));

      // Assert.
      expect(spans)
        .toStrictEqual([ null, null, null, null, null ]);
    });

    it('hands out a block\'s span and replaces the block with an edited one as one step, at its own indent', () =>
    {
      // Arrange: a block editor hands back the branch without its else, at the wrong indent.
      const { hub, editor } = build();
      const span = editor.blockSpanAt(3)!;
      const edited = [ cmd(111, 4, [ 0, 2, 0 ]), cmd(250, 5, [ { name: 'Heal1', volume: 90, pitch: 100, pan: 0 } ]), cmd(0, 5), cmd(412, 4) ];

      // Act.
      const step = editor.editBlock(span, edited);

      // Assert.
      expect([ span, step?.label, describeList(editor.commands().slice(3, 8)), historyLabels(hub) ])
        .toStrictEqual([
          { start: 3, end: 13 },
          'Edit Conditional Branch',
          [ '111@0', '250@1', '0@1', '412@0', '102@0' ],
          [ 'Edit Conditional Branch' ],
        ]);
    });

    it('records nothing when the block comes back the same, and refuses a block with no opener', () =>
    {
      // Arrange.
      const { hub, editor } = build();
      const span = editor.blockSpanAt(13)!;

      // Act.
      const step = editor.editBlock(span, editor.commands().slice(span.start, span.end));
      const empty = () => editor.editBlock(span, []);

      // Assert.
      expect([ step, historyLabels(hub) ])
        .toStrictEqual([ null, [] ]);
      expect(empty)
        .toThrow('a block needs its opener');
    });
  });

  describe('setElse', () =>
  {
    it('removes and restores an else, each as a named step', () =>
    {
      // Arrange.
      const { hub, editor } = build();

      // Act.
      editor.setElse(editor.nodeAt(3) as CommandBlockNode, false);
      editor.setElse(editor.nodeAt(3) as CommandBlockNode, true);

      // Assert.
      expect([ historyLabels(hub), describeList(editor.commands().slice(3, 9)) ])
        .toStrictEqual([ [ 'Remove else branch', 'Add else branch' ], [ '111@0', '250@1', '0@1', '411@0', '0@1', '412@0' ] ]);
    });
  });
});
