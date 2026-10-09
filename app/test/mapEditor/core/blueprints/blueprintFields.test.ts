import { describe, expect, it } from 'vitest';
import {
  addExactly,
  clampTo,
  decimalPlaces,
  eventFields,
  listLessTags,
  MOVE_FREQUENCY,
  MOVE_SPEED,
  ownNoteOf,
  tagLinesOf,
  type CommentTagDefinition,
  type Field,
} from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { LINK_MISREAD, withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { INTENSITY_FIELD, lightTagFields, RADIUS_FIELD } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * A copy of a blueprint differs from it field by field, so an event is read as fields, each a number with a range or a
 * choice. An event's name is a choice, and so is its note's own text, read without the link to its blueprint; where it
 * stands is no field at all. Each page has its own: move speed (1 to 6) and move frequency (1 to 5) are numbers;
 * conditions, image, move type, move route, walking, stepping, direction fix, through, priority and trigger are choices;
 * and the command list, less every tag a module reads from its comments, is one choice. Each such tag is read by its
 * module as fields of their own, keyed by page, by the line's key and by the field's name (p1.light2.radius), so a light's
 * reach can be a number while the list around it is a choice. A tag no module reads stays inside the command list, so an
 * enemy's id, which reads like a number, is never a number field.
 *
 * The list less its tags stands each tag line as a mark naming the tag and the line's key, which no comment's text can
 * pass for, so a light whose values differ still compares alike, and one that moved does not; and a fold MZ's window drew
 * shut counts for nothing. A module's lines must be named so a link can hold them, each once.
 *
 * Offsets are worked out as the decimals the numbers are written as, so moving 4.35 by 0.1 gives 4.45 and never a binary
 * fraction no author wrote, and a number is held to its field's range, both ends allowed.
 */
describe('blueprintFields', () =>
{
  /**
   * J-Lighting's tag as fields, with the plugin's own defaults.
   */
  const LIGHTS = lightTagFields(PLUGIN_DEFAULTS);

  /**
   * Builds a comment line.
   * @param {string} words The comment's text.
   * @returns {ReturnType<typeof command>} The command.
   */
  const comment = (words: string) => command(108, [ words ]);

  /**
   * A stand-in module tag reading every comment line saying "mark NAME" as a line keyed NAME, with one choice field.
   * @param {string} id The tag's id.
   * @returns {CommentTagDefinition} The tag.
   */
  const marking = (id: string): CommentTagDefinition => ({
    id,
    read: (read: RmmzEventPage) => read.list.flatMap((each, listIndex) =>
    {
      const [ words ] = each.parameters;
      const match = typeof words === 'string' ? /^mark (\S+)$/u.exec(words) : null;
      return match === null ? [] : [ { listIndex, key: match[1], fields: [ { name: 'value', kind: { kind: 'choice' } as const, value: words } ] } ];
    }),
    write: text => text,
  });

  /**
   * Finds a field by its key.
   * @param {readonly Field[]} fields The fields.
   * @param {string} key The key.
   * @returns {Field | undefined} The field.
   */
  const fieldAt = (fields: readonly Field[], key: string): Field | undefined => fields.find(field => field.key === key);

  describe('eventFields', () =>
  {
    it('reads the name, the note\'s own text, then each page\'s own fields, its command list, and each of its module tags\' fields', () =>
    {
      // Arrange: a two-page event, its first page lit twice.
      const lit = event(5, [
        page([ comment('<light:[4, #ffbb73, 30, flicker]>'), comment('<light:[2]>') ]),
        page([]),
      ], { name: 'Lamp' });

      // Act.
      const keys = eventFields(lit, [ LIGHTS ]).map(field => field.key);

      // Assert.
      const own = [ 'speed', 'frequency', 'conditions', 'image', 'moveType', 'moveRoute', 'walking', 'stepping', 'directionFix', 'through', 'priority', 'trigger', 'commands' ];
      const lights = [ 'light1', 'light2' ].flatMap(light => [ 'radius', 'color', 'intensity', 'effect' ].map(name => `p1.${light}.${name}`));
      expect(keys)
        .toStrictEqual([ 'name', 'note', ...own.map(name => `p1.${name}`), ...lights, ...own.map(name => `p2.${name}`) ]);
    });

    it('reads move speed and frequency as numbers with MZ\'s ranges, and every other field as a choice', () =>
    {
      // Arrange.
      const plain = event(5, [ page([], { moveSpeed: 4, moveFrequency: 5, trigger: 2 }) ]);

      // Act.
      const fields = eventFields(plain, []);

      // Assert: the two numbers, and a near miss among the choices that holds a number too.
      expect([ fieldAt(fields, 'p1.speed'), fieldAt(fields, 'p1.frequency'), fieldAt(fields, 'p1.trigger') ])
        .toStrictEqual([
          { key: 'p1.speed', kind: { kind: 'number', min: 1, max: 6 }, value: 4 },
          { key: 'p1.frequency', kind: { kind: 'number', min: 1, max: 5 }, value: 5 },
          { key: 'p1.trigger', kind: { kind: 'choice' }, value: 2 },
        ]);
      expect(fields.filter(field => field.kind.kind === 'number').map(field => field.key))
        .toStrictEqual([ 'p1.speed', 'p1.frequency' ]);
    });

    it('reads each choice of a page from where MZ stores it', () =>
    {
      // Arrange: every choice set to a value a fresh page never holds.
      const route = { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: true, wait: true };
      const set = page([], {
        conditions: { ...page([]).conditions, switch1Valid: true, switch1Id: 7 },
        image: { tileId: 0, characterName: 'Actor1', direction: 4, pattern: 1, characterIndex: 3 },
        moveType: 3,
        moveRoute: route,
        walkAnime: false,
        stepAnime: true,
        directionFix: true,
        through: true,
        priorityType: 2,
        trigger: 4,
      });

      // Act.
      const fields = eventFields(event(5, [ set ]), []);

      // Assert.
      const choices = [ 'conditions', 'image', 'moveType', 'moveRoute', 'walking', 'stepping', 'directionFix', 'through', 'priority', 'trigger' ];
      expect(choices.map(name => fieldAt(fields, `p1.${name}`)?.value))
        .toStrictEqual([ set.conditions, set.image, 3, route, false, true, true, true, 2, 4 ] as JsonValue[]);
    });

    it('reads the note without the link to its blueprint, and a note holding no link as it is', () =>
    {
      // Arrange: a copy's note holding words and its link, and a plain note.
      const linked = event(5, [ page([]) ], { note: withBlueprintLink('Guard captain', { blueprintId: 'k3x9q2mf', eventId: 5, differences: [ 'p1.speed+2' ] }) });
      const plain = event(5, [ page([]) ], { note: 'Guard captain' });

      // Act.
      const notes = [ linked, plain ].map(each => fieldAt(eventFields(each, []), 'note')?.value);

      // Assert.
      expect([ linked.note, notes ])
        .toStrictEqual([ 'Guard captain\n<blueprint:[k3x9q2mf, 5, p1.speed+2]>', [ 'Guard captain', 'Guard captain' ] ]);
    });

    it('refuses a note that would read otherwise without its link, saying why', () =>
    {
      // Arrange: a stray bracket before the link closes up with the text after it into another link once the link is out.
      const tangled = event(5, [ page([]) ], { note: '<<blueprint:[aaaa, 1]>blueprint:[k3x9q2mf, 2]>' });

      // Act.
      const read = () => eventFields(tangled, []);

      // Assert.
      expect(read)
        .toThrow(LINK_MISREAD);
    });

    it('reads a light\'s reach and intensity as numbers with J-Lighting\'s ranges, and its colour and effect as choices', () =>
    {
      // Arrange: a light naming every part, its colour in shorthand capitals.
      const lit = event(5, [ page([ comment('<light:[2.5, #FB7, 37.5, pulse]>') ]) ]);

      // Act.
      const fields = eventFields(lit, [ LIGHTS ]).filter(field => field.key.startsWith('p1.light1.'));

      // Assert.
      expect(fields)
        .toStrictEqual([
          { key: 'p1.light1.radius', kind: RADIUS_FIELD, value: 2.5 },
          { key: 'p1.light1.color', kind: { kind: 'choice' }, value: '#ffbb77' },
          { key: 'p1.light1.intensity', kind: INTENSITY_FIELD, value: 37.5 },
          { key: 'p1.light1.effect', kind: { kind: 'choice' }, value: 'pulse' },
        ]);
    });

    it('reads no field from a tag no module reads, which stays inside the command list as written', () =>
    {
      // Arrange: a battler's enemy and level, which read like numbers, and a light, with only lighting's tag read.
      const battler = event(5, [ page([ comment('<enemyId:12>'), comment('<level:5>'), comment('<light:[4]>') ]) ]);

      // Act.
      const fields = eventFields(battler, [ LIGHTS ]);
      const commands = fieldAt(fields, 'p1.commands')?.value as JsonValue[];

      // Assert: the light's fields are the only tag fields, and the enemy and level stay text in the list.
      expect(fields.filter(field => field.key.split('.').length === 3).map(field => field.key))
        .toStrictEqual([ 'p1.light1.radius', 'p1.light1.color', 'p1.light1.intensity', 'p1.light1.effect' ]);
      expect(commands.slice(0, 3))
        .toStrictEqual([
          { code: 108, indent: 0, parameters: [ '<enemyId:12>' ] },
          { code: 108, indent: 0, parameters: [ '<level:5>' ] },
          { code: 108, indent: 0, parameters: [ { tag: 'lighting.light', key: 'light1' } ] },
        ]);
    });

    it('reads every tag as part of the command list when no module reads tags at all', () =>
    {
      // Arrange.
      const lit = event(5, [ page([ comment('<light:[4]>') ]) ]);

      // Act.
      const fields = eventFields(lit, []);
      const [ first ] = (fieldAt(fields, 'p1.commands') as Field).value as JsonValue[];

      // Assert.
      expect([ fields.length, first ])
        .toStrictEqual([ 15, { code: 108, indent: 0, parameters: [ '<light:[4]>' ] } ]);
    });
  });

  describe('tagLinesOf', () =>
  {
    it('reads every module\'s lines on a page, each with the tag reading it, in the order the lines sit', () =>
    {
      // Arrange: a mark between two lights.
      const mixed = page([ comment('<light:[4]>'), comment('mark one'), comment('<light:[2]>') ]);

      // Act.
      const lines = tagLinesOf(mixed, [ LIGHTS, marking('test.mark') ]);

      // Assert.
      expect(lines.map(line => [ line.tag.id, line.key, line.listIndex ]))
        .toStrictEqual([ [ 'lighting.light', 'light1', 0 ], [ 'test.mark', 'one', 1 ], [ 'lighting.light', 'light2', 2 ] ]);
    });

    it('refuses a module naming a line or a field no link could hold, two lines alike, or one line twice', () =>
    {
      // Arrange: a key with a dot, a capital, two lines both named one, and two modules reading one line.
      const pages = [
        page([ comment('mark one.two') ]),
        page([ comment('mark One') ]),
        page([ comment('mark one'), comment('mark one') ]),
      ];
      const twice = page([ comment('mark one') ]);
      const badField: CommentTagDefinition = {
        id: 'test.field',
        read: () => [ { listIndex: 0, key: 'line', fields: [ { name: 'has-dash', kind: { kind: 'choice' }, value: 0 } ] } ],
        write: text => text,
      };

      // Act.
      const reads = [
        ...pages.map(each => () => tagLinesOf(each, [ marking('test.mark') ])),
        () => tagLinesOf(twice, [ marking('test.mark'), { ...marking('test.other'), read: () => [ { listIndex: 0, key: 'other', fields: [] } ] } ]),
        () => tagLinesOf(twice, [ badField ]),
      ];

      // Assert: and a module naming its lines and fields as it should reads fine.
      reads.forEach(read => expect(read)
        .toThrow('read a tag line as'));
      expect(tagLinesOf(twice, [ marking('test.mark') ]).length)
        .toBe(1);
    });
  });

  describe('listLessTags', () =>
  {
    /**
     * Reads a page's list less its tags, with lighting's tag read.
     * @param {RmmzEventPage} read The page.
     * @returns {JsonValue[]} The list less its tags.
     */
    const less = (read: RmmzEventPage): JsonValue[] => listLessTags(read.list, tagLinesOf(read, [ LIGHTS ]));

    it('compares two lists alike when only what their lights say differs', () =>
    {
      // Arrange: the same light at another reach, colour, intensity and effect.
      const lists = [ page([ comment('<light:[4, #ffbb73, 30, flicker]>') ]), page([ comment('<light:[6, #00ff00, 90]>') ]) ];

      // Act.
      const [ left, right ] = lists.map(less);

      // Assert.
      expect(left)
        .toStrictEqual(right);
    });

    it('compares two lists unlike when a light moved, or a comment beside it changed', () =>
    {
      // Arrange: a light then a line, the line then the light, and the light then another line.
      const lists = [
        page([ comment('<light:[4]>'), comment('words') ]),
        page([ comment('words'), comment('<light:[4]>') ]),
        page([ comment('<light:[4]>'), comment('other words') ]),
      ];

      // Act.
      const [ first, moved, reworded ] = lists.map(less);

      // Assert.
      expect(first)
        .not.toStrictEqual(moved);
      expect(first)
        .not.toStrictEqual(reworded);
    });

    it('never takes a comment for a mark, whatever its text', () =>
    {
      // Arrange: a light, and a comment whose text spells out what its mark names.
      const lists = [ page([ comment('<light:[4]>') ]), page([ comment('lighting.light#light1') ]) ];

      // Act.
      const [ lit, worded ] = lists.map(less);

      // Assert.
      expect(lit)
        .not.toStrictEqual(worded);
    });

    it('leaves out a fold MZ drew shut, and nothing else', () =>
    {
      // Arrange: a branch folded shut, and the same branch open.
      const folded = page([ { ...command(111, [ 0, 1, 0 ]), collapsed: true }, command(412) ]);
      const open = page([ command(111, [ 0, 1, 0 ]), command(412) ]);

      // Act.
      const [ shut, opened ] = [ folded, open ].map(less);

      // Assert.
      expect(shut)
        .toStrictEqual(opened);
      expect(shut[0])
        .toStrictEqual({ code: 111, indent: 0, parameters: [ 0, 1, 0 ] });
    });
  });

  describe('ownNoteOf', () =>
  {
    it('takes the link out of a copy\'s note byte for byte, and hands back a note without one as it is', () =>
    {
      // Arrange: Windows' line breaks around words.
      const note = 'Guard\r\ncaptain';
      const copy = event(5, [ page([]) ], { note: withBlueprintLink(note, { blueprintId: 'k3x9q2mf', eventId: 5, differences: [] }) });

      // Act.
      const read = [ ownNoteOf(copy), ownNoteOf(event(5, [ page([]) ], { note })) ];

      // Assert.
      expect(read)
        .toStrictEqual([ note, note ]);
    });
  });

  describe('decimalPlaces', () =>
  {
    it('counts the digits after the point, written out in full', () =>
    {
      // Arrange: a whole number, a half, a quarter, a ten millionth and a number past the point where it is written with
      // an exponent going up.
      const numbers = [ 4, 2.5, 0.25, 1e-7, 1.5e21 ];

      // Act.
      const places = numbers.map(decimalPlaces);

      // Assert.
      expect(places)
        .toStrictEqual([ 0, 1, 2, 7, 0 ]);
    });
  });

  describe('addExactly', () =>
  {
    it('adds as the decimals are written, where binary fractions drift', () =>
    {
      // Arrange: sums that drift in floating point, a sum taking away, and whole numbers.
      const sums = [ [ 0.1, 0.2 ], [ 4.35, 0.1 ], [ 4, -1.5 ], [ 2.675, 0.01 ], [ 3, 2 ] ];

      // Act.
      const added = sums.map(([ left, right ]) => addExactly(left, right));

      // Assert: and the plain sums show the drift this avoids.
      expect(added)
        .toStrictEqual([ 0.3, 4.45, 2.5, 2.685, 5 ]);
      expect([ 0.1 + 0.2, 4.35 + 0.1, 2.675 + 0.01 ])
        .toStrictEqual([ 0.30000000000000004, 4.449999999999999, 2.6849999999999996 ]);
    });
  });

  describe('clampTo', () =>
  {
    it('holds a number to a range, both ends allowed', () =>
    {
      // Arrange: below, at the bottom, inside, at the top, and above the move speed's range.
      const numbers = [ 0, 1, 3.5, 6, 9 ];

      // Act.
      const held = numbers.map(value => clampTo(MOVE_SPEED, value));

      // Assert: and the frequency's top is its own.
      expect([ held, clampTo(MOVE_FREQUENCY, 6) ])
        .toStrictEqual([ [ 1, 1, 3.5, 6, 6 ], 5 ]);
    });
  });
});
