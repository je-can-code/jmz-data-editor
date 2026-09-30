import { describe, expect, it } from 'vitest';
import {
  choosePluginCommand,
  parsePluginCommand,
  pluginArgDefault,
  pluginCommandLines,
  setPluginArg,
  writePluginCommand,
} from '../../../../../src/mapEditor/core/commands/editors/pluginCommand.ts';
import type { PluginCommandSchema } from '../../../../../src/mapEditor/core/commands/pluginHeaders/pluginHeader.ts';
import type { RmmzEventCommand } from '../../../../../src/mapEditor/core/model/rmmzTypes.ts';

/*
 * A plugin command stores the plugin, the command, the command's name when written, and an object of
 * arguments, each kept as text; MZ follows it with display lines, one per argument, which nothing but the event
 * list reads. The editor owes the game: arguments it does not know (a header that changed since) survive every
 * edit where they were; the display lines stay exactly as they were while nothing changed, since some commands
 * were written by tools that left them out and MZ's own cut varies; and they are rebuilt the way MZ builds them
 * as soon as anything does change.
 */
describe('plugin command', () =>
{
  /**
   * J-Log's "Add DiaLog", as its header declares it.
   * @returns {PluginCommandSchema} The command.
   */
  const addDiaLog = (): PluginCommandSchema => ({
    plugin: 'j/log/J-Log',
    command: 'addDiaLog',
    text: 'Add DiaLog',
    args: [
      { name: 'lines', type: 'multiline_string', text: 'Message', default: 'Hello World!' },
      { name: 'faceName', type: 'file', text: 'Face Filename', default: '' },
      { name: 'faceIndex', type: 'number', text: 'Face Index', default: '-1', min: -1, max: 7 },
    ],
  });

  /**
   * Builds a plugin command.
   * @param {unknown[]} parameters Its parameters.
   * @returns {RmmzEventCommand} The command.
   */
  const pluginCommand = (parameters: unknown[]): RmmzEventCommand => ({ code: 357, indent: 1, parameters: parameters as never });

  /**
   * Builds a display line.
   * @param {string} text The line.
   * @returns {RmmzEventCommand} The line.
   */
  const line = (text: string): RmmzEventCommand => ({ code: 657, indent: 1, parameters: [ text ] });

  /**
   * A real "Add DiaLog" from the game, with the display lines MZ wrote for it.
   */
  const stored = pluginCommand([ 'j/log/J-Log', 'addDiaLog', 'Add DiaLog', {
    lines: 'Oh god, we\'re back here again.\nDebugging more busted ass features?\nReally?',
    faceName: 'img/faces/face_je',
    faceIndex: '0',
  } ]);
  const storedLines = [
    line('Message = Oh god, we\'re back here again. Debugging more bus…'),
    line('Face Filename = img/faces/face_je'),
    line('Face Index = 0'),
  ];

  describe('parsePluginCommand', () =>
  {
    it('reads the plugin, the command, its name and its arguments', () =>
    {
      // Arrange: the stored command above.

      // Act.
      const model = parsePluginCommand(stored, storedLines);

      // Assert.
      expect(model)
        .toStrictEqual({
          plugin: 'j/log/J-Log',
          command: 'addDiaLog',
          text: 'Add DiaLog',
          args: { lines: 'Oh god, we\'re back here again.\nDebugging more busted ass features?\nReally?', faceName: 'img/faces/face_je', faceIndex: '0' },
        });
    });

    it('refuses a command MZ never writes, or display lines that are not single lines of text', () =>
    {
      // Arrange: each differs from a valid command in one way.
      const shapes = [
        pluginCommand([ 'j/log/J-Log', 'addDiaLog', 'Add DiaLog' ]),
        pluginCommand([ 'j/log/J-Log', 'addDiaLog', 'Add DiaLog', [] ]),
        pluginCommand([ 'j/log/J-Log', 7, 'Add DiaLog', {} ]),
        pluginCommand([ null, 'addDiaLog', 'Add DiaLog', {} ]),
        pluginCommand([ 'j/log/J-Log', 'addDiaLog', 3, {} ]),
        { ...pluginCommand([ 'j/log/J-Log', 'addDiaLog', 'Add DiaLog', {} ]), code: 356 },
      ];

      // Act.
      const models = [ ...shapes.map(shape => parsePluginCommand(shape, [])), parsePluginCommand(stored, [ { code: 401, indent: 1, parameters: [ 'x' ] } ]) ];

      // Assert.
      expect(models)
        .toStrictEqual([ ...shapes.map(() => null), null ]);
    });
  });

  describe('pluginCommandLines', () =>
  {
    it('rebuilds exactly the lines MZ wrote: header order and names, one line, cut at MZ\'s length', () =>
    {
      // Arrange.
      const model = parsePluginCommand(stored, storedLines);

      // Act.
      const lines = pluginCommandLines(model as never, addDiaLog(), 1);

      // Assert.
      expect(lines)
        .toStrictEqual(storedLines);
    });

    it('lists arguments the header does not know after the ones it does, and nothing for arguments not stored', () =>
    {
      // Arrange: faceName is missing and an old argument lingers.
      const model = { plugin: 'j/log/J-Log', command: 'addDiaLog', text: 'Add DiaLog', args: { mood: 'grumpy', faceIndex: '2', lines: 'Hi' } };

      // Act.
      const lines = pluginCommandLines(model, addDiaLog(), 0).map(each => each.parameters[0]);

      // Assert.
      expect(lines)
        .toStrictEqual([ 'Message = Hi', 'Face Index = 2', 'mood = grumpy' ]);
    });

    it('lists every argument under its own name, in stored order, without a header', () =>
    {
      // Arrange: a command whose plugin no longer declares it, with a value a tool stored unencoded.
      const model = { plugin: 'j/jafting/J-JAFTING', command: 'Unlock Category', text: 'Unlock new category', args: { categoryKeys: '["COOK_ERO"]', count: 3, extra: { a: 1 } } };

      // Act.
      const lines = pluginCommandLines(model, null, 0).map(each => each.parameters[0]);

      // Assert.
      expect(lines)
        .toStrictEqual([ 'categoryKeys = ["COOK_ERO"]', 'count = 3', 'extra = {"a":1}' ]);
    });

    it('keeps a line of exactly MZ\'s length whole, and cuts one character past it', () =>
    {
      // Arrange: lines of 59 and 60 characters.
      const model = (value: string) => ({ plugin: 'P', command: 'c', text: 'c', args: { k: value } });

      // Act.
      const lines = [ 'x'.repeat(55), 'x'.repeat(56) ].map(value => pluginCommandLines(model(value), null, 0)[0].parameters[0] as string);

      // Assert.
      expect(lines.map(each => [ each.length, each.endsWith('…') ]))
        .toStrictEqual([ [ 59, false ], [ 60, true ] ]);
    });
  });

  describe('writePluginCommand', () =>
  {
    it('keeps the display lines exactly as they were while nothing changed, even lines MZ never wrote', () =>
    {
      // Arrange: a command a tool wrote with no display lines at all.
      const bare = pluginCommand([ 'j/abs/ext/J-ABS-Juice', 'removeOverlay', 'Remove Overlay', { target: 'Player', targetId: '1' } ]);
      const model = parsePluginCommand(bare, []);

      // Act.
      const written = writePluginCommand(bare, [], model as never, null);

      // Assert.
      expect(written)
        .toStrictEqual({ command: bare, continuation: [] });
    });

    it('rebuilds the display lines once an argument changes, keeping every argument where it was', () =>
    {
      // Arrange.
      const model = setPluginArg(parsePluginCommand(stored, storedLines) as never, 'faceIndex', '5');

      // Act.
      const written = writePluginCommand(stored, storedLines, model, addDiaLog());

      // Assert.
      expect([ Object.keys(written.command.parameters[3] as object), written.continuation.map(each => each.parameters[0]) ])
        .toStrictEqual([
          [ 'lines', 'faceName', 'faceIndex' ],
          [ 'Message = Oh god, we\'re back here again. Debugging more bus…', 'Face Filename = img/faces/face_je', 'Face Index = 5' ],
        ]);
    });
  });

  describe('setPluginArg', () =>
  {
    it('changes an argument in place and adds a new one at the end', () =>
    {
      // Arrange.
      const model = { plugin: 'P', command: 'c', text: 'c', args: { a: '1', b: '2' } };

      // Act.
      const changed = setPluginArg(setPluginArg(model, 'a', '9'), 'c', '3');

      // Assert.
      expect(Object.entries(changed.args))
        .toStrictEqual([ [ 'a', '9' ], [ 'b', '2' ], [ 'c', '3' ] ]);
    });
  });

  describe('choosePluginCommand and pluginArgDefault', () =>
  {
    it('point the command at another one, with every argument at its header default and empty without one', () =>
    {
      // Arrange: the header's first argument loses its default.
      const schema = { ...addDiaLog(), args: [ { name: 'lines', type: 'multiline_string' }, ...addDiaLog().args.slice(1) ] };
      const model = { plugin: 'j/omni/ext/J-OMNI-Quests', command: 'progress-quest', text: 'Progress Quest', args: { key: 'main-001' } };

      // Act.
      const chosen = choosePluginCommand(model, schema);

      // Assert.
      expect(chosen)
        .toStrictEqual({ plugin: 'j/log/J-Log', command: 'addDiaLog', text: 'Add DiaLog', args: { lines: '', faceName: '', faceIndex: '-1' } });
    });

    it('name a command with no text by its own name, and leave a command already pointing there alone', () =>
    {
      // Arrange.
      const untitled: PluginCommandSchema = { plugin: 'P', command: 'go', args: [] };
      const model = { plugin: 'P', command: 'go', text: 'Go!', args: { stale: 'x' } };

      // Act.
      const results = [ choosePluginCommand({ ...model, command: 'stop' }, untitled), choosePluginCommand(model, untitled) ];

      // Assert.
      expect(results)
        .toStrictEqual([ { plugin: 'P', command: 'go', text: 'go', args: {} }, model ]);
      expect(pluginArgDefault({ name: 'x', type: 'string', default: 'y' }))
        .toBe('y');
    });
  });
});
