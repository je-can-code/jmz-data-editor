import { describe, expect, it } from 'vitest';
import { PAGE_FIELDS, UNDECLARED_TAG, type CommentTagDefinition, type FieldPlace } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { readCopy } from '../../../../src/mapEditor/core/blueprints/copyReading.ts';
import {
  capitalised,
  copyTitle,
  differenceWords,
  fieldWords,
  markWords,
  offsetText,
  pageWords,
  stateWords,
  summaryWords,
  type LinkedReading,
} from '../../../../src/mapEditor/core/blueprints/copyWords.ts';
import { battlerTagFields } from '../../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { event, page } from '../../support/eventKindFixtures.ts';
import { contextOf, copyOf, needler, needlerNest, turnOf } from '../../support/copyFixtures.ts';

/*
 * A copy's panel and the steps it records speak to the author in the words they already know, never in keys or tags:
 * each field named as the event window labels it, or by its module's own words, a field whose module gives none going by
 * its name on the page; a field's standing as "Follows the blueprint", with an offset's sign, "Pinned at" a value, "Set by
 * hand", commands kept for naming other events of the blueprint, or which side alone has it; what a copy copies, by the
 * blueprint's name and the event it was made from; how far it stands apart, kind by kind, counted in fields, offsets only
 * when asked; its standing as a whole, as a sentence; and the mark where-used sets beside it, in the same words.
 */
describe('copy words', () =>
{
  /**
   * Reads a copy of the needler against the nest.
   * @param {Parameters<typeof needler>[0]} overrides What the copy's page holds of its own.
   * @param {readonly string[]} differences What its link keeps.
   * @returns {LinkedReading} The reading.
   */
  const reading = (overrides: Parameters<typeof needler>[0] = {}, differences: readonly string[] = []): LinkedReading =>
  {
    return readCopy(copyOf(needler(overrides), differences), contextOf(needlerNest())) as LinkedReading;
  };

  describe('fieldWords', () =>
  {
    it('names the event\'s own fields, a page\'s own fields as the event window labels them, and a page\'s commands', () =>
    {
      // Arrange: the name, the note, the graphic, the movement type, and the commands.
      const image = PAGE_FIELDS.find(field => field.name === 'image') as (typeof PAGE_FIELDS)[number];
      const moveType = PAGE_FIELDS.find(field => field.name === 'moveType') as (typeof PAGE_FIELDS)[number];
      const places: FieldPlace[] = [
        { kind: 'name' },
        { kind: 'note' },
        { kind: 'page', page: 0, field: image },
        { kind: 'page', page: 1, field: moveType },
        { kind: 'commands', page: 0 },
      ];

      // Act.
      const words = places.map(fieldWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'name', 'note', 'graphic', 'movement type', 'commands' ]);
    });

    it('names a tag\'s field by its module\'s words, and by its name on the page when the module gives none', () =>
    {
      // Arrange: J-ABS's sight on a second line, a line no module reads, and a module giving no words.
      const sight = battlerTagFields(false).find(tag => tag.id === 'jabs.sight') as CommentTagDefinition;
      const wordless: CommentTagDefinition = { id: 'test.wordless', read: () => [], write: text => text };
      const places: FieldPlace[] = [
        { kind: 'tag', page: 0, tag: sight, line: 'sight2', field: '' },
        { kind: 'tag', page: 0, tag: UNDECLARED_TAG, line: '<motion>#2', field: '' },
        { kind: 'tag', page: 0, tag: wordless, line: 'glow1', field: 'radius' },
      ];

      // Act.
      const words = places.map(fieldWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'sight (line 2)', 'motion (line 2)', 'glow1.radius' ]);
    });

    it('names the page\'s movement speed and a battler\'s move speed so neither is taken for the other', () =>
    {
      // Arrange: the page's speed and frequency, and J-ABS's move speed.
      const speed = PAGE_FIELDS.find(field => field.name === 'speed') as (typeof PAGE_FIELDS)[number];
      const frequency = PAGE_FIELDS.find(field => field.name === 'frequency') as (typeof PAGE_FIELDS)[number];
      const moveSpeed = battlerTagFields(false).find(tag => tag.id === 'jabs.moveSpeed') as CommentTagDefinition;
      const places: FieldPlace[] = [
        { kind: 'page', page: 0, field: speed },
        { kind: 'page', page: 0, field: frequency },
        { kind: 'tag', page: 0, tag: moveSpeed, line: 'moveSpeed', field: '' },
      ];

      // Act.
      const words = places.map(fieldWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'movement speed', 'movement frequency', 'battler move speed' ]);
    });
  });

  describe('pageWords', () =>
  {
    it('names the page a page\'s field sits on, and no page for the event\'s own fields', () =>
    {
      // Arrange.
      const places: FieldPlace[] = [ { kind: 'commands', page: 1 }, { kind: 'name' }, { kind: 'note' } ];

      // Act.
      const words = places.map(pageWords);

      // Assert.
      expect(words)
        .toStrictEqual([ ' (page 2)', '', '' ]);
    });
  });

  describe('offsetText', () =>
  {
    it('writes an offset with its sign, a fraction in full', () =>
    {
      // Arrange: up, down, and a fraction.
      const amounts = [ 2, -1, 0.5 ];

      // Act.
      const texts = amounts.map(offsetText);

      // Assert.
      expect(texts)
        .toStrictEqual([ '+2', '-1', '+0.5' ]);
    });
  });

  describe('stateWords', () =>
  {
    it('says each standing in plain words', () =>
    {
      // Arrange: every standing a field can have.
      const states = [
        { kind: 'follows' },
        { kind: 'offset', amount: 1 },
        { kind: 'offset', amount: -2.5 },
        { kind: 'pinned', value: -3 },
        { kind: 'own' },
        { kind: 'names-group' },
        { kind: 'copy-only' },
        { kind: 'blueprint-only' },
      ] as const;

      // Act.
      const words = states.map(stateWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Follows the blueprint',
          'Follows the blueprint, +1',
          'Follows the blueprint, -2.5',
          'Pinned at -3',
          'Set by hand',
          'These commands name other events in the blueprint, so this copy keeps its own',
          'Only on this copy',
          'Not on this copy',
        ]);
    });
  });

  describe('copyTitle', () =>
  {
    it('names the blueprint and the event of it a copy was made from, and says when the blueprint is gone', () =>
    {
      // Arrange.
      const known = reading();
      const gone = readCopy(copyOf(needler()), contextOf(null)) as LinkedReading;

      // Act.
      const titles = [ known, gone ].map(copyTitle);

      // Assert.
      expect(titles)
        .toStrictEqual([ 'Copy of "Needler nest" (event 2)', 'Copy of a blueprint that is gone' ]);
    });
  });

  describe('differenceWords', () =>
  {
    it('counts each kind standing apart in fields, the first saying what is counted, offsets only when asked', () =>
    {
      // Arrange: every kind, one kind, and kinds without the first.
      const counts = [
        { own: 2, pinned: 1, offsets: 1, group: 0 },
        { own: 1, pinned: 0, offsets: 0, group: 0 },
        { own: 0, pinned: 1, offsets: 2, group: 0 },
        { own: 0, pinned: 0, offsets: 2, group: 0 },
      ];

      // Act.
      const counted = counts.map(each => [ differenceWords(each, true), differenceWords(each, false) ]);

      // Assert.
      expect(counted)
        .toStrictEqual([
          [ '2 fields set by hand, 1 pinned, 1 at an offset', '2 fields set by hand, 1 pinned' ],
          [ '1 field set by hand', '1 field set by hand' ],
          [ '1 field pinned, 2 at an offset', '1 field pinned' ],
          [ '2 fields at an offset', '' ],
        ]);
    });
  });

  describe('summaryWords', () =>
  {
    it('says a copy follows in everything, or how far it stands apart, as a sentence', () =>
    {
      // Arrange: one following, one with a trigger set by hand and a speed one faster.
      const readings = [ reading(), reading({ trigger: 2, moveSpeed: 4 }) ];

      // Act.
      const words = readings.map(summaryWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'Follows the blueprint in everything.', '1 field set by hand, 1 at an offset.' ]);
    });

    it('says after the rest that commands naming other events of the blueprint are kept, in their row\'s words', () =>
    {
      // Arrange: the nest's needler turns its event 3, whose copy here nobody knows; one copy follows in all else, and one
      // has its trigger set by hand.
      const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3 } ]);
      const readings = [ {}, { trigger: 2 } ].map(overrides => readCopy(copyOf(event(2, [ page([ turnOf(15) ], overrides) ], { name: 'Needler' })), contextOf(nest)) as LinkedReading);

      // Act.
      const words = readings.map(summaryWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          'Follows the blueprint, but its commands name other events in the blueprint, so this copy keeps its own.',
          '1 field set by hand. Its commands name other events in the blueprint, so this copy keeps its own.',
        ]);
    });

    it('says why no change reaches a drifted copy, and why a lost one has nothing to follow', () =>
    {
      // Arrange.
      const drifted = readCopy(copyOf(event(2, [ needler().pages[0], needler().pages[0] ])), contextOf(needlerNest())) as LinkedReading;
      const lost = readCopy(copyOf(needler()), contextOf(null)) as LinkedReading;

      // Act.
      const words = [ drifted, lost ].map(summaryWords);

      // Assert.
      expect(words)
        .toStrictEqual([ 'No change to the blueprint reaches it: it has 2 pages and its blueprint has 1 page.', 'Its blueprint is gone.' ]);
    });
  });

  describe('markWords', () =>
  {
    it('counts the choices set by hand and the pins, then says commands naming the group are kept, never offsets', () =>
    {
      // Arrange: counts and commands kept, commands kept alone, counts alone, and offsets alone.
      const counts = [
        { own: 1, pinned: 1, offsets: 1, group: 1 },
        { own: 0, pinned: 0, offsets: 0, group: 2 },
        { own: 2, pinned: 0, offsets: 0, group: 0 },
        { own: 0, pinned: 0, offsets: 3, group: 0 },
      ];

      // Act.
      const words = counts.map(markWords);

      // Assert.
      expect(words)
        .toStrictEqual([
          '1 field set by hand, 1 pinned; its commands name other events in the blueprint, so this copy keeps its own',
          'its commands name other events in the blueprint, so this copy keeps its own',
          '2 fields set by hand',
          '',
        ]);
    });
  });

  describe('capitalised', () =>
  {
    it('starts words with a capital, leaving the rest as they are', () =>
    {
      // Arrange.
      const words = [ 'light 1 radius', 'AI trait', '' ];

      // Act.
      const capitals = words.map(capitalised);

      // Assert.
      expect(capitals)
        .toStrictEqual([ 'Light 1 radius', 'AI trait', '' ]);
    });
  });
});
