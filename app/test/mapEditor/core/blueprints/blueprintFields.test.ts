import { describe, expect, it } from 'vitest';
import {
  addExactly,
  clampTo,
  decimalPlaces,
  eventFields,
  LINE_VALUE,
  lineFieldName,
  listLessTags,
  MOVE_FREQUENCY,
  MOVE_SPEED,
  ownNoteOf,
  PAGE_FIELDS,
  parsableCommentLines,
  placedEventFields,
  tagFieldKey,
  tagLinesOf,
  UNDECLARED_TAG,
  type CommentTagDefinition,
  type Field,
} from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { LINK_MISREAD, withBlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { INTENSITY_FIELD, lightTagFields, RADIUS_FIELD } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page, text } from '../../support/eventKindFixtures.ts';

/*
 * A copy of a blueprint differs from it field by field, so an event is read as fields, each a number with a range or a
 * choice. An event's name is a choice, and so is its note's own text, read without the link to its blueprint; where it
 * stands is no field at all. Each page has its own: move speed (1 to 6) and move frequency (1 to 5) are numbers;
 * conditions, image, move type, move route, walking, stepping, direction fix, through, priority and trigger are choices;
 * and the command list, less every tag line, is one choice.
 *
 * Every tag line is a field of its own, wherever it sits: on a comment's first line or a later one, in one comment or
 * spread over several. A tag line is a comment line J-Base offers to plugins, one tag filling it. A line a module reads is
 * read by that module as fields, keyed by page, by the line's key and by the field's name (p1.light2.radius), or by the
 * line's key alone for a line giving one value (p1.sight), so a light's reach can be a number while the list around it is
 * a choice. Every other tag line is one choice holding the whole line, keyed by its tag between angle brackets (p1.<motion>),
 * and by its place among the page's lines of that tag when the tag repeats (p1.<motion>#2), so an enemy's id, which reads
 * like a number, is never a number field, and changing one tag line leaves every other where it was.
 *
 * The list less its tags stands each tag line as a mark naming the tag reading it and the line's key, which no comment's
 * text can pass for, so a tag line whose values differ still compares alike, and one that moved does not; and a fold MZ's
 * window drew shut counts for nothing. A module's lines must be named so a link can hold them, each once, and never by the
 * name of one of the page's own fields.
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
   * Builds a later line of a comment, which MZ writes under the comment's first.
   * @param {string} words The line's text.
   * @returns {RmmzEventCommand} The command.
   */
  const later = (words: string): RmmzEventCommand => command(408, [ words ]);

  /**
   * The names of a page's own fields, its command list among them, as each page's keys hold them.
   */
  const OWN_NAMES = [ 'speed', 'frequency', 'conditions', 'image', 'moveType', 'moveRoute', 'walking', 'stepping', 'directionFix', 'through', 'priority', 'trigger', 'commands' ];

  /**
   * Reads the fields of an event's tag lines, leaving out its name, its note, and each page's own fields and command list.
   * @param {readonly Field[]} fields The event's fields.
   * @returns {Field[]} The tag lines' fields, in order.
   */
  const tagFieldsOf = (fields: readonly Field[]): Field[] =>
  {
    return fields.filter(field => /^p\d+\./u.test(field.key) && OWN_NAMES.includes(field.key.slice(field.key.indexOf('.') + 1)) === false);
  };

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
    write: words => words,
  });

  /**
   * A stand-in module tag reading the first line of a page as one line under the key given, with the fields given, each a
   * choice.
   * @param {string} key The line's key.
   * @param {{ name: string, value: JsonValue }[]} fields The line's fields.
   * @returns {CommentTagDefinition} The tag.
   */
  const firstLine = (key: string, fields: { name: string; value: JsonValue }[]): CommentTagDefinition => ({
    id: 'test.one',
    read: () => [ { listIndex: 0, key, fields: fields.map(field => ({ ...field, kind: { kind: 'choice' } as const })) } ],
    write: words => words,
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
      const lights = [ 'light1', 'light2' ].flatMap(light => [ 'radius', 'color', 'intensity', 'effect' ].map(name => `p1.${light}.${name}`));
      expect(keys)
        .toStrictEqual([ 'name', 'note', ...OWN_NAMES.map(name => `p1.${name}`), ...lights, ...OWN_NAMES.map(name => `p2.${name}`) ]);
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

    it('reads a tag line no module reads as a choice of its own holding the whole line, however like a number it reads', () =>
    {
      // Arrange: a battler's enemy and level, which read like numbers, and a light, with only lighting's tag read.
      const battler = event(5, [ page([ comment('<enemyId:12>'), comment('<level:5>'), comment('<light:[4]>') ]) ]);

      // Act.
      const fields = eventFields(battler, [ LIGHTS ]);
      const commands = fieldAt(fields, 'p1.commands')?.value as JsonValue[];

      // Assert: the enemy and the level are choices keyed by their tags, and all three lines stand as marks in the list.
      expect(tagFieldsOf(fields).slice(0, 3))
        .toStrictEqual([
          { key: 'p1.<enemyId>', kind: { kind: 'choice' }, value: '<enemyId:12>' },
          { key: 'p1.<level>', kind: { kind: 'choice' }, value: '<level:5>' },
          { key: 'p1.light1.radius', kind: RADIUS_FIELD, value: 4 },
        ]);
      expect(commands.slice(0, 3))
        .toStrictEqual([
          { code: 108, indent: 0, parameters: [ { tag: 'core.tag', key: '<enemyId>' } ] },
          { code: 108, indent: 0, parameters: [ { tag: 'core.tag', key: '<level>' } ] },
          { code: 108, indent: 0, parameters: [ { tag: 'lighting.light', key: 'light1' } ] },
        ]);
    });

    it('reads a light as a tag line no module reads while no module reads lights', () =>
    {
      // Arrange.
      const lit = event(5, [ page([ comment('<light:[4]>') ]) ]);

      // Act.
      const fields = eventFields(lit, []);
      const [ first ] = (fieldAt(fields, 'p1.commands') as Field).value as JsonValue[];

      // Assert.
      expect([ tagFieldsOf(fields), first ])
        .toStrictEqual([
          [ { key: 'p1.<light>', kind: { kind: 'choice' }, value: '<light:[4]>' } ],
          { code: 108, indent: 0, parameters: [ { tag: 'core.tag', key: '<light>' } ] },
        ]);
    });

    it('keys a tag repeated on a page by its place among that tag\'s lines, the first by the tag alone, on every page', () =>
    {
      // Arrange: three motions around an enemy on one page, and one motion on the next.
      const floating = event(5, [
        page([ comment('<motion:[float]>'), comment('<enemyId:3>'), comment('<motion:[breathe]>'), later('<motion:[swing]>') ]),
        page([ comment('<motion:[stretch]>') ]),
      ]);

      // Act.
      const fields = tagFieldsOf(eventFields(floating, []));

      // Assert.
      expect(fields.map(field => [ field.key, field.value ]))
        .toStrictEqual([
          [ 'p1.<motion>', '<motion:[float]>' ],
          [ 'p1.<enemyId>', '<enemyId:3>' ],
          [ 'p1.<motion>#2', '<motion:[breathe]>' ],
          [ 'p1.<motion>#3', '<motion:[swing]>' ],
          [ 'p2.<motion>', '<motion:[stretch]>' ],
        ]);
    });

    it('reads the same tag fields from tags in one comment as from the same tags spread over several', () =>
    {
      // Arrange: an enemy, its sight and its motion on one comment's lines, and each in a comment of its own.
      const together = event(5, [ page([ comment('<enemyId:3>'), later('<sight:4>'), later('<motion:[float]>') ]) ]);
      const apart = event(5, [ page([ comment('<enemyId:3>'), comment('<sight:4>'), comment('<motion:[float]>') ]) ]);

      // Act.
      const [ one, several ] = [ together, apart ].map(each => tagFieldsOf(eventFields(each, [])));

      // Assert: three fields either way, the same ones.
      expect([ one.length, one ])
        .toStrictEqual([ 3, several ]);
    });

    it('reads no tag line from a line J-Base offers no plugin, which stays in the command list as written', () =>
    {
      // Arrange: a tag with words after it, one with a space before it, words alone, and a tag spoken in a message.
      const lines = [ comment('<enemyId:3> the boss'), comment(' <sight:4>'), comment('mark one'), ...text([ '<motion:[float]>' ]) ];
      const near = event(5, [ page(lines) ]);

      // Act.
      const fields = eventFields(near, []);

      // Assert.
      expect([ tagFieldsOf(fields), (fieldAt(fields, 'p1.commands') as Field).value ])
        .toStrictEqual([ [], [ ...lines, command(0) ] ]);
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
        write: words => words,
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

    it('lets a line give one value alone, and refuses one naming it beside other fields, or named like a page\'s own field', () =>
    {
      // Arrange: a line of one value; one beside a named field; one named speed, which would be known by the very key of
      // the page's move speed; and a line of named fields keyed like the page's command list.
      const one = page([ comment('<sight:4>') ]);

      // Act.
      const alone = tagLinesOf(one, [ firstLine('sight', [ { name: LINE_VALUE, value: 4 } ]) ]);
      const refused = [
        () => tagLinesOf(one, [ firstLine('sight', [ { name: LINE_VALUE, value: 4 }, { name: 'boost', value: 2 } ]) ]),
        () => tagLinesOf(one, [ firstLine('speed', [ { name: LINE_VALUE, value: 4 } ]) ]),
        () => tagLinesOf(one, [ firstLine('commands', [ { name: 'value', value: 4 } ]) ]),
      ];

      // Assert.
      expect(alone.map(line => [ line.tag.id, line.key ]))
        .toStrictEqual([ [ 'test.one', 'sight' ] ]);
      refused.forEach(read => expect(read)
        .toThrow('read a tag line as'));
    });

    it('reads every tag line the modules leave as a choice of the field model\'s own, in its place among the rest', () =>
    {
      // Arrange: a light, an enemy, and a light no light reads, reaching nothing.
      const mixed = page([ comment('<light:[4]>'), comment('<enemyId:3>'), later('<light:[0]>') ]);

      // Act.
      const lines = tagLinesOf(mixed, [ LIGHTS ]);

      // Assert: the line J-Lighting leaves is one choice like the enemy, and only the line it reads is its own.
      expect(lines.map(line => [ line.tag.id, line.key, line.listIndex, line.fields.length ]))
        .toStrictEqual([ [ 'lighting.light', 'light1', 0, 4 ], [ 'core.tag', '<enemyId>', 1, 1 ], [ 'core.tag', '<light>', 2, 1 ] ]);
    });

    it('never reads a line a module reads as a choice of its own too', () =>
    {
      // Arrange: a module reading the enemy's line, which no other reads.
      const enemy: CommentTagDefinition = {
        id: 'test.enemy',
        read: () => [ { listIndex: 0, key: 'enemyId', fields: [ { name: LINE_VALUE, kind: { kind: 'choice' }, value: 3 } ] } ],
        write: words => words,
      };

      // Act.
      const lines = tagLinesOf(page([ comment('<enemyId:3>'), comment('<sight:4>') ]), [ enemy ]);

      // Assert.
      expect(lines.map(line => [ line.tag.id, line.key ]))
        .toStrictEqual([ [ 'test.enemy', 'enemyId' ], [ 'core.tag', '<sight>' ] ]);
    });
  });

  describe('parsableCommentLines', () =>
  {
    it('finds each comment line one tag fills, on a comment\'s first line or a later one, wherever it sits', () =>
    {
      // Arrange: a tag, words, a later line's tag past a message, and the closing command.
      const lines = page([ comment('<enemyId:3>'), comment('words'), ...text([ 'Grr.' ]), comment('notes'), later('<sight: 4>') ]);

      // Act.
      const found = parsableCommentLines(lines);

      // Assert.
      expect(found)
        .toStrictEqual([ { listIndex: 0, text: '<enemyId:3>' }, { listIndex: 5, text: '<sight: 4>' } ]);
    });

    it('finds no line J-Base would not offer a plugin', () =>
    {
      // Arrange: words after a tag, a space before one, a character J-Base refuses, a tag spoken in a message, a script
      // line holding one, and a comment line holding something other than text.
      const nearMisses = page([
        comment('<enemyId:3> boss'),
        comment(' <enemyId:3>'),
        comment('<enemyId:3$>'),
        ...text([ '<enemyId:3>' ]),
        command(655, [ '<enemyId:3>' ]),
        command(108, [ 3 ]),
      ]);

      // Act.
      const found = parsableCommentLines(nearMisses);

      // Assert.
      expect(found)
        .toStrictEqual([]);
    });
  });

  describe('UNDECLARED_TAG', () =>
  {
    it('reads every tag line on a page as a choice holding the line, whatever reads it', () =>
    {
      // Arrange: a light and two motions.
      const lines = page([ comment('<light:[4]>'), comment('<motion:[float]>'), later('<motion:[breathe]>') ]);

      // Act.
      const read = UNDECLARED_TAG.read(lines);

      // Assert.
      expect(read)
        .toStrictEqual([
          { listIndex: 0, key: '<light>', fields: [ { name: LINE_VALUE, kind: { kind: 'choice' }, value: '<light:[4]>' } ] },
          { listIndex: 1, key: '<motion>', fields: [ { name: LINE_VALUE, kind: { kind: 'choice' }, value: '<motion:[float]>' } ] },
          { listIndex: 2, key: '<motion>#2', fields: [ { name: LINE_VALUE, kind: { kind: 'choice' }, value: '<motion:[breathe]>' } ] },
        ]);
    });

    it('writes another line of the same tag whole in place of the line', () =>
    {
      // Arrange: a motion, and a motion with no value at all.
      const lines = [ '<motion:[float]>', '<noRespawn>' ];

      // Act.
      const written = [
        UNDECLARED_TAG.write(lines[0], LINE_VALUE, '<motion:[swing, 15, 200]>'),
        UNDECLARED_TAG.write(lines[1], LINE_VALUE, '<noRespawn>'),
      ];

      // Assert.
      expect(written)
        .toStrictEqual([ '<motion:[swing, 15, 200]>', '<noRespawn>' ]);
    });

    it('refuses a line of another tag, words no plugin is offered, a value that is no line, and a field the line has not', () =>
    {
      // Arrange.
      const line = '<motion:[float]>';

      // Act.
      const writes = [
        () => UNDECLARED_TAG.write(line, LINE_VALUE, '<motions:[float]>'),
        () => UNDECLARED_TAG.write(line, LINE_VALUE, '<motion:[float]> again'),
        () => UNDECLARED_TAG.write(line, LINE_VALUE, 4),
        () => UNDECLARED_TAG.write(line, 'value', '<motion:[swing]>'),
      ];

      // Assert.
      writes.forEach(write => expect(write)
        .toThrow('a tag line no plugin reads can only be written as another line of the same tag'));
    });

    it('names a line by its tag said as words, and by which line of the tag it is past the first', () =>
    {
      // Arrange: the first motion line, the second, a mark holding no value, a name of several words, one with a name in
      // capitals inside it and one ending on a capital, one parted by hyphens, and one with no word in it at all.
      const keys = [ '<motion>', '<motion>#2', '<noRespawn>#12', '<timeRangePage>', '<noAIRole>', '<visOffsetU>', '<no-rng-passives>', '<>' ];

      // Act.
      const words = keys.map(key => UNDECLARED_TAG.words?.(key, LINE_VALUE));

      // Assert.
      expect(words)
        .toStrictEqual([ 'motion', 'motion (line 2)', 'no respawn (line 12)', 'time range page', 'no AI role', 'vis offset U', 'no rng passives', 'comment' ]);
    });
  });

  describe('placedEventFields', () =>
  {
    it('places each field where it sits: the name, the note, a page\'s own field, its commands, and a tag line\'s field', () =>
    {
      // Arrange: a lamp of two pages, its second page lit.
      const lamp = event(5, [ page([]), page([ comment('<light:[4, #ffbb73, 30, flicker]>') ]) ], { name: 'Lamp' });

      // Act.
      const fields = placedEventFields(lamp, 'Lit at dusk', [ LIGHTS ]);

      // Assert: a page's own field carries the page field itself, and a tag line's field the tag reading its line.
      const placeOf = (key: string) => fields.find(field => field.key === key)?.place;
      expect([ placeOf('name'), fields[1], placeOf('p2.trigger'), placeOf('p1.commands'), placeOf('p2.light1.color') ])
        .toStrictEqual([
          { kind: 'name' },
          { key: 'note', kind: { kind: 'choice' }, value: 'Lit at dusk', place: { kind: 'note' } },
          { kind: 'page', page: 1, field: PAGE_FIELDS.find(field => field.name === 'trigger') },
          { kind: 'commands', page: 0 },
          { kind: 'tag', page: 1, tag: LIGHTS, line: 'light1', field: 'color' },
        ]);
    });

    it('reads the very fields eventFields reads, each at its place', () =>
    {
      // Arrange: a lit event whose note holds its link after its own text.
      const lit = { ...event(5, [ page([ comment('<light:[4]>'), comment('<motion:[float]>') ]) ]), note: withBlueprintLink('Lit', { blueprintId: 'k3x9q2mf', eventId: 2, differences: [] }) };

      // Act.
      const placed = placedEventFields(lit, 'Lit', [ LIGHTS ]).map(({ key, kind, value }) => ({ key, kind, value }));

      // Assert.
      expect(placed)
        .toStrictEqual(eventFields(lit, [ LIGHTS ]));
    });
  });

  describe('lineFieldName', () =>
  {
    it('names a tag line\'s field by the line and the field, and the one value a line gives alone by the line', () =>
    {
      // Arrange: a light's reach, and a sight given alone.
      const fields = [ [ 'light1', 'radius' ], [ 'sight', LINE_VALUE ] ];

      // Act.
      const names = fields.map(([ line, name ]) => [ lineFieldName(line, name), tagFieldKey(1, line, name) ]);

      // Assert.
      expect(names)
        .toStrictEqual([ [ 'light1.radius', 'p2.light1.radius' ], [ 'sight', 'p2.sight' ] ]);
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
