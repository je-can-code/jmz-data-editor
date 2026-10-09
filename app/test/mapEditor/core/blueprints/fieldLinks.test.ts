import { describe, expect, it } from 'vitest';
import { MOVE_SPEED, type NumberField } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { blueprintLinkOf, blueprintLinkText, withBlueprintLink, type BlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import {
  currentLink,
  fieldLinksOf,
  fieldLinkText,
  readFieldLink,
  valueByLink,
  withFieldLinks,
  withPagesMoved,
  type FieldLink,
} from '../../../../src/mapEditor/core/blueprints/fieldLinks.ts';

/*
 * A copy's numbers sit relative to its blueprint's, and an offset must outlive being held to a field's range, so what a
 * copy keeps of each number lives in its link, after the blueprint's id and its event's: FIELD+OFFSET or FIELD-OFFSET for
 * an offset, FIELD=VALUE for a pin. Keys and numbers hold only letters, digits and dots, never a comma, a bracket or an
 * angle bracket, so a link holding them reads back through the link's own reader and writer as written, and a link of two
 * values, as every link placing has written, keeps nothing: an offset of 0 on every number.
 *
 * Reading takes the last value of a key, as the engine takes the last tag of a name, and passes over a value of no shape
 * it knows. Changing a link writes over a key's first value in place, takes out any later one, adds a new key at the end,
 * and takes a key out for nothing or an offset of 0; every value it was not asked to change stays exactly as written,
 * whatever its shape. Values move with their pages when pages are added, taken away or moved.
 *
 * A link says what the copy holds: the blueprint's value moved by the offset, or the pin, held to the range. While the
 * copy holds that, the link stands, which is how a +2 copy held at the top of its range is +2 again when the blueprint
 * comes back down; a copy holding anything else was changed somewhere else, and its link is read afresh from what it
 * holds: a pin pins it, an offset becomes how far it sits from the blueprint's, and nothing when it sits right there.
 */
describe('fieldLinks', () =>
{
  /**
   * A link to event 2 of blueprint k3x9q2mf, keeping what it is given.
   * @param {readonly string[]} differences Its values after the event's id.
   * @returns {BlueprintLink} The link.
   */
  const linkKeeping = (differences: readonly string[]): BlueprintLink => ({ blueprintId: 'k3x9q2mf', eventId: 2, differences });

  /**
   * A light's reach as a field: above a hundredth, with no top.
   */
  const REACH: NumberField = { kind: 'number', min: 0.01, max: Number.POSITIVE_INFINITY };

  describe('readFieldLink', () =>
  {
    it('reads an offset up, an offset down and a pin, decimals and a pin below 0 among them', () =>
    {
      // Arrange.
      const values = [ 'p1.speed+2', 'p1.speed-1', 'p2.light1.radius+0.5', 'p1.frequency=3', 'p1.x=-2.25' ];

      // Act.
      const read = values.map(readFieldLink);

      // Assert.
      expect(read)
        .toStrictEqual([
          { key: 'p1.speed', link: { kind: 'offset', amount: 2 } },
          { key: 'p1.speed', link: { kind: 'offset', amount: -1 } },
          { key: 'p2.light1.radius', link: { kind: 'offset', amount: 0.5 } },
          { key: 'p1.frequency', link: { kind: 'pin', value: 3 } },
          { key: 'p1.x', link: { kind: 'pin', value: -2.25 } },
        ]);
    });

    it('reads nothing from a value of any other shape', () =>
    {
      // Arrange: no sign, a key led by a capital or a digit, an empty part, an exponent, two signs, a signed pin, a
      // trailing point, words after, the illustrative values item 2 kept, and nothing at all.
      const values = [
        'p1.speed2',
        'P1.speed+2',
        '1p.speed+2',
        'p1..speed+2',
        'p1.speed+1e3',
        'p1.speed+-2',
        'p1.speed=+2',
        'p1.speed+2.',
        'p1.speed+2 extra',
        'motion=wander',
        'name=Goblin chief',
        '',
      ];

      // Act.
      const read = values.map(readFieldLink);

      // Assert.
      expect(read)
        .toStrictEqual(values.map(() => null));
    });
  });

  describe('fieldLinkText', () =>
  {
    it('writes an offset with its sign and a pin after an equals sign, in full and without an exponent', () =>
    {
      // Arrange.
      const links: [ string, FieldLink ][] = [
        [ 'p1.speed', { kind: 'offset', amount: 2 } ],
        [ 'p1.speed', { kind: 'offset', amount: -1.5 } ],
        [ 'p1.light1.radius', { kind: 'pin', value: 3.5 } ],
        [ 'p1.light1.radius', { kind: 'offset', amount: 1e-7 } ],
        [ 'p1.x', { kind: 'pin', value: -2 } ],
      ];

      // Act.
      const written = links.map(([ key, link ]) => fieldLinkText(key, link));

      // Assert.
      expect(written)
        .toStrictEqual([ 'p1.speed+2', 'p1.speed-1.5', 'p1.light1.radius=3.5', 'p1.light1.radius+0.0000001', 'p1.x=-2' ]);
    });

    it('refuses a key or a number a link could not read back', () =>
    {
      // Arrange: a key holding a comma, one led by a capital, and numbers past any range.
      const links: [ string, FieldLink ][] = [
        [ 'p1,speed', { kind: 'offset', amount: 2 } ],
        [ 'P1.speed', { kind: 'offset', amount: 2 } ],
        [ 'p1.speed', { kind: 'pin', value: Number.POSITIVE_INFINITY } ],
        [ 'p1.speed', { kind: 'offset', amount: Number.NaN } ],
      ];

      // Act.
      const writes = links.map(([ key, link ]) => () => fieldLinkText(key, link));

      // Assert.
      writes.forEach(write => expect(write)
        .toThrow('a link keeps a field by a key of letters, digits and dots and a finite number'));
    });
  });

  describe('fieldLinksOf', () =>
  {
    it('reads what a link keeps of each number by its key, the last value of a key counting, and passes over the rest', () =>
    {
      // Arrange: a key written twice, and a value of no known shape between.
      const link = linkKeeping([ 'p1.speed+2', 'motion=wander', 'p1.light1.radius=3.5', 'p1.speed-1' ]);

      // Act.
      const read = fieldLinksOf(link);

      // Assert.
      expect([ ...read ])
        .toStrictEqual([
          [ 'p1.speed', { kind: 'offset', amount: -1 } ],
          [ 'p1.light1.radius', { kind: 'pin', value: 3.5 } ],
        ]);
    });

    it('reads nothing kept from an old link of two values', () =>
    {
      // Arrange: the link every placement wrote, read back from a note.
      const link = blueprintLinkOf('Guard\n<blueprint:[k3x9q2mf, 2]>') as BlueprintLink;

      // Act.
      const read = fieldLinksOf(link);

      // Assert.
      expect([ link.differences, read.size ])
        .toStrictEqual([ [], 0 ]);
    });
  });

  describe('withFieldLinks', () =>
  {
    it('writes over a key\'s first value in place, takes out any later one, and leaves every other value as written', () =>
    {
      // Arrange: speed written twice around values it was not asked to change, one written with a leading zero.
      const link = linkKeeping([ 'p1.frequency+02', 'p1.speed+1', 'motion=wander', 'p1.speed+5' ]);

      // Act.
      const changed = withFieldLinks(link, new Map([ [ 'p1.speed', { kind: 'pin', value: 4 } as FieldLink ] ]));

      // Assert.
      expect(changed)
        .toStrictEqual(linkKeeping([ 'p1.frequency+02', 'p1.speed=4', 'motion=wander' ]));
    });

    it('adds a key the link keeps nothing of at the end, in the order of the changes', () =>
    {
      // Arrange: an old two-value link.
      const link = linkKeeping([]);
      const changes = new Map<string, FieldLink | null>([
        [ 'p2.speed', { kind: 'offset', amount: -1 } ],
        [ 'p1.light1.radius', { kind: 'offset', amount: 0.5 } ],
      ]);

      // Act.
      const changed = withFieldLinks(link, changes);

      // Assert.
      expect(changed.differences)
        .toStrictEqual([ 'p2.speed-1', 'p1.light1.radius+0.5' ]);
    });

    it('takes a key out for nothing and for an offset of 0, and adds nothing for either', () =>
    {
      // Arrange: two keys kept, and two the link keeps nothing of.
      const link = linkKeeping([ 'p1.speed+2', 'p1.frequency-1' ]);
      const changes = new Map<string, FieldLink | null>([
        [ 'p1.speed', null ],
        [ 'p1.frequency', { kind: 'offset', amount: 0 } ],
        [ 'p2.speed', null ],
        [ 'p2.frequency', { kind: 'offset', amount: 0 } ],
      ]);

      // Act.
      const changed = withFieldLinks(link, changes);

      // Assert.
      expect(changed.differences)
        .toStrictEqual([]);
    });

    it('keeps a pin of 0, which is a value of the copy\'s own', () =>
    {
      // Arrange.
      const link = linkKeeping([]);

      // Act.
      const changed = withFieldLinks(link, new Map([ [ 'p1.x', { kind: 'pin', value: 0 } as FieldLink ] ]));

      // Assert.
      expect(changed.differences)
        .toStrictEqual([ 'p1.x=0' ]);
    });

    it('writes a link that reads back through the link\'s own reader and writer, holding no angle bracket in any value', () =>
    {
      // Arrange: an old link in a note of words, given an offset and a pin.
      const note = withBlueprintLink('Guard captain', linkKeeping([]));
      const changes = new Map<string, FieldLink | null>([
        [ 'p1.speed', { kind: 'offset', amount: 2 } ],
        [ 'p1.light1.radius', { kind: 'pin', value: 3.5 } ],
      ]);

      // Act.
      const link = withFieldLinks(blueprintLinkOf(note) as BlueprintLink, changes);
      const written = withBlueprintLink(note, link);
      const read = blueprintLinkOf(written) as BlueprintLink;

      // Assert.
      expect([ written, read, [ ...fieldLinksOf(read) ] ])
        .toStrictEqual([
          'Guard captain\n<blueprint:[k3x9q2mf, 2, p1.speed+2, p1.light1.radius=3.5]>',
          link,
          [ [ 'p1.speed', { kind: 'offset', amount: 2 } ], [ 'p1.light1.radius', { kind: 'pin', value: 3.5 } ] ],
        ]);
      expect(link.differences.some(value => /[<>,[\]]/u.test(value)))
        .toBe(false);
      expect(blueprintLinkText(read))
        .toBe('<blueprint:[k3x9q2mf, 2, p1.speed+2, p1.light1.radius=3.5]>');
    });
  });

  describe('withPagesMoved', () =>
  {
    it('renames each value of a page that moved, takes out each of a page that went, and keeps the rest as written', () =>
    {
      // Arrange: values on pages 1, 2 and 3, one of no page, one of no known shape, and one of a page nothing mentions.
      const link = linkKeeping([ 'p1.speed+1', 'p2.light1.radius=3', 'p3.frequency-1', 'x+1', 'p2 junk', 'p9.speed+4' ]);
      const moved = new Map<number, number | null>([ [ 0, 1 ], [ 1, null ], [ 2, 0 ] ]);

      // Act.
      const changed = withPagesMoved(link, moved);

      // Assert.
      expect(changed.differences)
        .toStrictEqual([ 'p2.speed+1', 'p1.frequency-1', 'x+1', 'p2 junk', 'p9.speed+4' ]);
    });

    it('writes each value moved to a page of two digits whole, keeping the rest of it as written', () =>
    {
      // Arrange: page 2 moving to page 12, written with a leading zero.
      const link = linkKeeping([ 'p2.speed+02' ]);

      // Act.
      const changed = withPagesMoved(link, new Map([ [ 1, 11 ] ]));

      // Assert.
      expect(changed.differences)
        .toStrictEqual([ 'p12.speed+02' ]);
    });
  });

  describe('valueByLink', () =>
  {
    it('reads the blueprint\'s value when the link keeps nothing, moved by an offset, or the pin, held to the range', () =>
    {
      // Arrange: a blueprint at speed 5.
      const links: (FieldLink | null)[] = [
        null,
        { kind: 'offset', amount: -2 },
        { kind: 'offset', amount: 2 },
        { kind: 'offset', amount: -7 },
        { kind: 'pin', value: 2 },
        { kind: 'pin', value: 9 },
      ];

      // Act.
      const values = links.map(link => valueByLink(MOVE_SPEED, 5, link));

      // Assert: past the top and past the bottom held to the ends.
      expect(values)
        .toStrictEqual([ 5, 3, 6, 1, 2, 6 ]);
    });

    it('moves a decimal reach by a decimal offset exactly, and holds a reach above nothing', () =>
    {
      // Arrange.
      const links: FieldLink[] = [ { kind: 'offset', amount: 0.1 }, { kind: 'offset', amount: -5 } ];

      // Act.
      const values = links.map(link => valueByLink(REACH, 4.35, link));

      // Assert.
      expect(values)
        .toStrictEqual([ 4.45, 0.01 ]);
    });
  });

  describe('currentLink', () =>
  {
    it('keeps an offset the copy holds, held at the top of the range or not', () =>
    {
      // Arrange: +2 over a blueprint at 3 (the copy at 5), and +2 over one at 5 (the copy held at 6).
      const held: FieldLink = { kind: 'offset', amount: 2 };

      // Act.
      const kept = [ currentLink(MOVE_SPEED, 3, 5, held), currentLink(MOVE_SPEED, 5, 6, held) ];

      // Assert.
      expect(kept)
        .toStrictEqual([ held, held ]);
    });

    it('keeps a pin the copy holds, held to the range or not', () =>
    {
      // Arrange: a pin at 2, and one at 9, which the copy holds at 6.
      const pins: FieldLink[] = [ { kind: 'pin', value: 2 }, { kind: 'pin', value: 9 } ];

      // Act.
      const kept = [ currentLink(MOVE_SPEED, 5, 2, pins[0]), currentLink(MOVE_SPEED, 5, 6, pins[1]) ];

      // Assert.
      expect(kept)
        .toStrictEqual(pins);
    });

    it('reads an offset afresh from a copy changed somewhere else, nothing when it sits on the blueprint\'s value', () =>
    {
      // Arrange: a copy kept +2 over 3 that now holds 4; one keeping nothing that holds 6; one kept +2 that holds 3.
      const cases: [ number, number, FieldLink | null ][] = [
        [ 3, 4, { kind: 'offset', amount: 2 } ],
        [ 3, 6, null ],
        [ 3, 3, { kind: 'offset', amount: 2 } ],
      ];

      // Act.
      const read = cases.map(([ blueprint, copy, held ]) => currentLink(MOVE_SPEED, blueprint, copy, held));

      // Assert.
      expect(read)
        .toStrictEqual([ { kind: 'offset', amount: 1 }, { kind: 'offset', amount: 3 }, null ]);
    });

    it('pins a copy changed somewhere else at what it now holds', () =>
    {
      // Arrange: pinned at 2, now holding 4.
      const held: FieldLink = { kind: 'pin', value: 2 };

      // Act.
      const read = currentLink(MOVE_SPEED, 5, 4, held);

      // Assert.
      expect(read)
        .toStrictEqual({ kind: 'pin', value: 4 });
    });

    it('keeps nothing for an offset of 0, written or not, and reads a decimal offset exactly', () =>
    {
      // Arrange: an offset of 0 written out, and a reach of 4.45 over 4.35.
      const zero: FieldLink = { kind: 'offset', amount: 0 };

      // Act.
      const read = [ currentLink(MOVE_SPEED, 3, 3, zero), currentLink(MOVE_SPEED, 3, 3, null), currentLink(REACH, 4.35, 4.45, null) ];

      // Assert.
      expect(read)
        .toStrictEqual([ null, null, { kind: 'offset', amount: 0.1 } ]);
    });
  });
});
