import { describe, expect, it } from 'vitest';
import {
  CHOICE,
  LINE_VALUE,
  parsableCommentLines,
  type CommentTagDefinition,
  type TagLine,
} from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { LINK_MISREAD } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import {
  canFollowAgain,
  FIELD_GONE,
  fieldActions,
  followAllPlan,
  followPlan,
  noteBoxOf,
  noteTextPlan,
  pinPlan,
  SECOND_LINK,
  unlinkPlan,
  unpinPlan,
  type CopyPlan,
  type FollowableCopy,
  type ReadCopy,
} from '../../../../src/mapEditor/core/blueprints/copyActions.ts';
import { readCopy, type CopyContext, type CopyReading } from '../../../../src/mapEditor/core/blueprints/copyReading.ts';
import { cloneJson } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';
import { comment, contextOf, COPY_TAGS, copyOf, fieldOf, later, needler, needlerCommands, needlerNest, turnOf } from '../../support/copyFixtures.ts';

/*
 * A copy's panel acts on a copy through plans that touch exactly what each action is about, and every other field and
 * every other character of the note stays as it was, under the rule every note writer keeps (a note that would read
 * otherwise is refused, with why):
 *
 * - pinning a number keeps it at the value it holds whatever the blueprint does, the link keeping the pin in the place its
 *   offset held, and the copy itself changing in nothing else;
 * - unpinning keeps its value and follows by the offset that value gives, nothing at all at the blueprint's own value;
 * - following one field takes the blueprint's value now: a number back to an offset of 0, a choice, the note's own text
 *   with the link after it, a tag field through its module in the copy's own line, and a page's command list, less its
 *   tag lines, the blueprint's, the copy's tag lines it pairs keeping their own text, and whatever the link kept of a line
 *   that goes going with it;
 * - following again in everything puts the copy back as its blueprint's event, keeping its id, its place and the link's
 *   values of no shape the field model knows, and is the way back for a drifted copy too;
 * - commands naming another of the blueprint's events whose copy is not known are never followed, since the copy would
 *   name some other event of its map, and say so in the words their row says: the copy keeps its own; commands standing
 *   apart for that alone offer nothing, and leave nothing to follow again;
 * - unlinking takes the link and its line out, leaving the note's own text byte for byte;
 * - the Note box shows a copy's own text and writes what is typed there back before the link, refusing a second link,
 *   and leaving the note as it is when nothing was changed, wherever its link sits.
 *
 * A field no longer there, or no longer able to take the action, is refused rather than guessed at.
 */

/**
 * Reads a copy against the nest, which must read field by field.
 * @param {RmmzMapEvent} copy The copy.
 * @param {CopyContext} context What it is read against.
 * @returns {ReadCopy} The reading.
 */
const read = (copy: RmmzMapEvent, context: CopyContext = contextOf(needlerNest())): ReadCopy =>
{
  const reading = readCopy(copy, context);
  if (reading.kind !== 'read')
  {
    throw new Error(`the copy reads as ${reading.kind}`);
  }

  return reading;
};

/**
 * Reads a planned copy, which must have been planned.
 * @param {CopyPlan} plan The plan.
 * @returns {RmmzMapEvent} The copy.
 */
const plannedEvent = (plan: CopyPlan): RmmzMapEvent =>
{
  if (plan.ok === false)
  {
    throw new Error(`the plan was refused: ${plan.message}`);
  }

  return plan.event;
};

/**
 * Builds a copy of the needler whose sight line reads the sight given.
 * @param {number} sight The sight.
 * @param {readonly string[]} differences The values its link keeps.
 * @param {string} note The note's own text.
 * @returns {RmmzMapEvent} The copy.
 */
const sighted = (sight: number, differences: readonly string[] = [], note = ''): RmmzMapEvent =>
{
  const source = { ...needler(), note };
  source.pages[0].list[1] = later(`<sight:${sight}>`);
  return copyOf(source, differences);
};

describe('pinPlan', () =>
{
  it('pins a number at the value the copy holds, its link keeping the pin after the note\'s own text, and changes nothing else', () =>
  {
    // Arrange: a copy noted "Guards the gate", left one faster than the blueprint with nothing in its link.
    const source = { ...needler({ moveSpeed: 4 }), note: 'Guards the gate' };
    const copy = copyOf(source);

    // Act.
    const pinned = plannedEvent(pinPlan(copy, read(copy), 'p1.speed'));

    // Assert.
    expect(pinned)
      .toStrictEqual({ ...copy, note: 'Guards the gate\n<blueprint:[k3x9q2mf, 2, p1.speed=4]>' });
  });

  it('pins a number held at an offset in the offset\'s place in the link, every other value kept in its order', () =>
  {
    // Arrange: a sight two longer, between a value of no known shape and a speed one faster.
    const copy = { ...sighted(6, [ 'later?1', 'p1.sight+2', 'p1.speed+1' ]) };
    copy.pages[0].moveSpeed = 4;

    // Act.
    const pinned = plannedEvent(pinPlan(copy, read(copy), 'p1.sight'));

    // Assert.
    expect(pinned.note)
      .toBe('<blueprint:[k3x9q2mf, 2, later?1, p1.sight=6, p1.speed+1]>');
  });

  it('refuses a number already pinned, a choice, a field only the copy has, and a field the copy no longer has', () =>
  {
    // Arrange: a sight pinned, a second sight line of the copy's own.
    const copy = sighted(6, [ 'p1.sight=6' ]);
    copy.pages[0].list.splice(2, 0, later('<sight:9>'));
    const reading = read(copy);

    // Act.
    const refusals = [ 'p1.sight', 'p1.trigger', 'p1.sight2', 'p2.speed' ].map(key => pinPlan(copy, reading, key));

    // Assert.
    expect(refusals)
      .toStrictEqual(Array.from({ length: 4 }, () => ({ ok: false, message: FIELD_GONE })));
  });
});

describe('unpinPlan', () =>
{
  it('unpins a number to the offset its value gives, keeping the value', () =>
  {
    // Arrange: a speed pinned at 5, two above the blueprint's 3.
    const copy = copyOf(needler({ moveSpeed: 5 }), [ 'p1.speed=5' ]);

    // Act.
    const unpinned = plannedEvent(unpinPlan(copy, read(copy), 'p1.speed'));

    // Assert.
    expect([ unpinned.note, unpinned.pages[0].moveSpeed ])
      .toStrictEqual([ '<blueprint:[k3x9q2mf, 2, p1.speed+2]>', 5 ]);
  });

  it('unpins a number pinned at the blueprint\'s own value to nothing at all, leaving the pin beside it', () =>
  {
    // Arrange: the speed pinned at the blueprint's 3, and the frequency pinned at 4.
    const copy = copyOf(needler({ moveFrequency: 4 }), [ 'p1.speed=3', 'p1.frequency=4' ]);

    // Act.
    const unpinned = plannedEvent(unpinPlan(copy, read(copy), 'p1.speed'));

    // Assert.
    expect(unpinned)
      .toStrictEqual({ ...copy, note: '<blueprint:[k3x9q2mf, 2, p1.frequency=4]>' });
  });

  it('refuses a number not pinned', () =>
  {
    // Arrange: a speed at an offset.
    const copy = copyOf(needler({ moveSpeed: 4 }), [ 'p1.speed+1' ]);

    // Act.
    const refused = unpinPlan(copy, read(copy), 'p1.speed');

    // Assert.
    expect(refused)
      .toStrictEqual({ ok: false, message: FIELD_GONE });
  });
});

describe('followPlan', () =>
{
  it('follows the blueprint\'s name, leaving the note byte for byte', () =>
  {
    // Arrange: a copy renamed, its link on the first line of its note, before its own text.
    const copy = { ...copyOf(needler()), name: 'Needler (west)', note: '<blueprint:[k3x9q2mf, 2]>\nwest gate' };

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'name', { tags: COPY_TAGS }));

    // Assert.
    expect(followed)
      .toStrictEqual({ ...copy, name: 'Needler' });
  });

  it('follows the blueprint\'s note, writing its text with the copy\'s link after it, every value kept', () =>
  {
    // Arrange: the blueprint's needler noted "Guards the gate", the copy noting "Sleeps" with a speed one faster.
    const nest = needlerNest([ { ...needler(), note: 'Guards the gate' } ]);
    const copy = copyOf({ ...needler({ moveSpeed: 4 }), note: 'Sleeps' }, [ 'p1.speed+1' ]);

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy, contextOf(nest)), 'note', { tags: COPY_TAGS }));

    // Assert.
    expect(followed)
      .toStrictEqual({ ...copy, note: 'Guards the gate\n<blueprint:[k3x9q2mf, 2, p1.speed+1]>' });
  });

  it('follows one of a page\'s numbers at an offset of 0, its link keeping nothing of it and the rest as they were', () =>
  {
    // Arrange: a speed two faster, pinned, beside a sight two longer.
    const copy = sighted(6, [ 'p1.speed=5', 'p1.sight+2' ]);
    copy.pages[0].moveSpeed = 5;

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.speed', { tags: COPY_TAGS }));

    // Assert.
    expect([ followed.pages[0].moveSpeed, followed.note, followed.pages[0].list ])
      .toStrictEqual([ 3, '<blueprint:[k3x9q2mf, 2, p1.sight+2]>', copy.pages[0].list ]);
  });

  it('follows one of a page\'s choices, leaving the note byte for byte wherever its link sits', () =>
  {
    // Arrange: a trigger set by hand, the link first in the note.
    const copy = { ...copyOf(needler({ trigger: 3 })), note: '<blueprint:[k3x9q2mf, 2, p1.sight+1]>\nwest gate' };
    copy.pages[0].list[1] = later('<sight:5>');

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.trigger', { tags: COPY_TAGS }));

    // Assert.
    expect(followed)
      .toStrictEqual({ ...copy, pages: [ { ...copy.pages[0], trigger: 0 } ] });
  });

  it('follows a tag line\'s choice through its module, in the copy\'s own line, every other character kept', () =>
  {
    // Arrange: the copy's torch green, written with its own spacing.
    const copy = copyOf(needler());
    copy.pages[0].list[2] = comment('<light: [4,#00ff00, 30,flicker]>');

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.light1.color', { tags: COPY_TAGS }));

    // Assert.
    expect([ followed.pages[0].list[2].parameters, followed.note ])
      .toStrictEqual([ [ '<light: [4,#ffbb73, 30,flicker]>' ], '<blueprint:[k3x9q2mf, 2]>' ]);
  });

  it('follows a tag line\'s number through its module, its link keeping nothing of it any more', () =>
  {
    // Arrange: a sight two longer, held in the link beside a speed one faster.
    const copy = sighted(6, [ 'p1.sight+2', 'p1.speed+1' ]);
    copy.pages[0].moveSpeed = 4;

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.sight', { tags: COPY_TAGS }));

    // Assert.
    expect([ followed.pages[0].list[1].parameters, followed.note, followed.pages[0].moveSpeed ])
      .toStrictEqual([ [ '<sight:4>' ], '<blueprint:[k3x9q2mf, 2, p1.speed+1]>', 4 ]);
  });

  it('refuses a tag value the copy\'s line cannot hold, saying why in the module\'s words', () =>
  {
    // Arrange: a module of moods that writes no mood but "calm".
    const MOOD = /^<mood:(\w+)>$/u;
    const moods: CommentTagDefinition = {
      id: 'test.mood',
      read: thePage => parsableCommentLines(thePage).flatMap(({ listIndex, text }): TagLine[] =>
      {
        const match = MOOD.exec(text);
        return match === null ? [] : [ { listIndex, key: 'mood', fields: [ { name: LINE_VALUE, kind: CHOICE, value: match[1] } ] } ];
      }),
      write: (text, _field, value) =>
      {
        if (value !== 'calm')
        {
          throw new Error(`its mood cannot be ${String(value)}`);
        }

        return text.replace(MOOD, '<mood:calm>');
      },
    };
    const context = { ...contextOf(needlerNest([ event(2, [ page([ comment('<mood:angry>') ]) ], { name: 'Needler' }) ])), tags: [ moods ] };
    const copy = copyOf(event(2, [ page([ comment('<mood:calm>') ]) ], { name: 'Needler' }));

    // Act.
    const refused = followPlan(copy, read(copy, context), 'p1.mood', { tags: [ moods ] });

    // Assert.
    expect(refused)
      .toStrictEqual({ ok: false, message: 'It can\'t follow: its mood cannot be angry.' });
  });

  it('follows a page\'s commands, keeping the copy\'s own tag lines, and drops what the link kept of a line that goes', () =>
  {
    // Arrange: the copy's sight two longer in the link, a second sight line of its own also held there, and its buzz
    // turned to a hiss.
    const [ enemy, , torch, motion ] = needlerCommands();
    const source = event(2, [ page([ enemy, later('<sight:6>'), later('<sight:8>'), torch, motion, command(101, [ '', 0, 0, 2, '' ]), command(401, [ 'Hss.' ]) ]) ], { name: 'Needler' });
    const copy = copyOf(source, [ 'p1.sight+2', 'p1.sight2+3' ]);

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.commands', { tags: COPY_TAGS }));

    // Assert: the blueprint's list, the copy's own sight line kept, and the second line gone with its value.
    expect([ followed.pages[0].list.map(each => each.parameters[0] ?? null), followed.note ])
      .toStrictEqual([
        [ '<enemyId:12>', '<sight:6>', '<light:[4, #ffbb73, 30, flicker]>', '<motion:[stretch]>', '', 'Bzz.', null ],
        '<blueprint:[k3x9q2mf, 2, p1.sight+2]>',
      ]);
  });

  it('refuses to follow commands naming another of the blueprint\'s events whose copy on this map is not known', () =>
  {
    // Arrange: the blueprint's needler turns its event 3, whose copy here nobody knows; the copy's own turn names 15.
    const turn = (eventId: number) => command(205, [ eventId, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: false } ]);
    const nest = needlerNest([ event(2, [ page([ turn(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3 } ]);
    const copy = copyOf(event(2, [ page([ turn(15) ]) ], { name: 'Needler' }));

    // Act: once with the group unknown, and once known.
    const refused = followPlan(copy, read(copy, contextOf(nest)), 'p1.commands', { tags: COPY_TAGS });
    const known = followPlan(copy, read(copy, contextOf(nest, new Map([ [ 3, 16 ] ]))), 'p1.commands', { tags: COPY_TAGS, references: new Map([ [ 3, 16 ] ]) });

    // Assert: refused in the words the commands' row says them in; known, the turn names 3's copy, 16.
    expect([ refused, plannedEvent(known).pages[0].list[0].parameters[0] ])
      .toStrictEqual([
        { ok: false, message: 'The commands can\'t follow: they name other events in the blueprint, so this copy keeps its own.' },
        16,
      ]);
  });

  it('leaves a field already following as the very copy it was', () =>
  {
    // Arrange.
    const copy = copyOf(needler());

    // Act.
    const followed = plannedEvent(followPlan(copy, read(copy), 'p1.trigger', { tags: COPY_TAGS }));

    // Assert.
    expect(followed)
      .toBe(copy);
  });

  it('refuses a field only one side has, and a field the copy no longer has', () =>
  {
    // Arrange: the copy's torch taken away.
    const copy = copyOf(needler());
    copy.pages[0].list.splice(2, 1);
    const reading = read(copy);

    // Act.
    const refusals = [ 'p1.light1.radius', 'p2.trigger' ].map(key => followPlan(copy, reading, key, { tags: COPY_TAGS }));

    // Assert.
    expect(refusals)
      .toStrictEqual([ { ok: false, message: FIELD_GONE }, { ok: false, message: FIELD_GONE } ]);
  });
});

describe('followAllPlan', () =>
{
  it('puts the copy back as its blueprint\'s event, keeping its id, its place and the link\'s unknown values', () =>
  {
    // Arrange: a copy renamed, sped up and pinned, its torch green, noting "Sleeps", its link holding a value of no shape
    // the field model knows.
    const source = { ...needler({ moveSpeed: 5 }), name: 'Needler (west)', note: 'Sleeps' };
    source.pages[0].list[2] = comment('<light:[4, #00ff00, 30, flicker]>');
    const copy = copyOf(source, [ 'p1.speed=5', 'later?1' ]);

    // Act.
    const followed = plannedEvent(followAllPlan(copy, read(copy), undefined));

    // Assert.
    expect(followed)
      .toStrictEqual({ ...needler(), id: 12, x: 7, y: 9, note: '<blueprint:[k3x9q2mf, 2, later?1]>' });
  });

  it('brings a copy drifted by a page more back to its blueprint\'s one page', () =>
  {
    // Arrange.
    const copy = copyOf(event(2, [ needler().pages[0], needler({ trigger: 4 }).pages[0] ], { name: 'Needler' }));
    const reading = readCopy(copy, contextOf(needlerNest())) as FollowableCopy;

    // Act.
    const followed = plannedEvent(followAllPlan(copy, reading, undefined));

    // Assert.
    expect([ reading.kind, followed ])
      .toStrictEqual([ 'drifted', { ...needler(), id: 12, x: 7, y: 9, note: copy.note } ]);
  });

  it('refuses when the blueprint\'s commands name another of its events whose copy on this map is not known', () =>
  {
    // Arrange: a copy read field by field, and one drifted by a page more.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3 } ]);
    const copies = [ copyOf(needler()), copyOf(event(2, [ needler().pages[0], needler().pages[0] ], { name: 'Needler' })) ];

    // Act.
    const refusals = copies.map(copy => followAllPlan(copy, readCopy(copy, contextOf(nest)) as FollowableCopy, undefined));

    // Assert: in the words the commands' row says them in, the copy read field by field told what it can still do.
    expect(refusals)
      .toStrictEqual([
        { ok: false, message: 'It can\'t follow in everything: its commands name other events in the blueprint, so this copy keeps its own. Follow its other fields one by one.' },
        { ok: false, message: 'It can\'t follow: its commands name other events in the blueprint, so this copy keeps its own.' },
      ]);
  });
});

describe('unlinkPlan', () =>
{
  it('takes the link out of the note with its line, the note\'s own text byte for byte, and changes nothing else', () =>
  {
    // Arrange: a note of two lines in Windows' breaks, its link after them.
    const copy = sighted(6, [ 'p1.sight+2' ], 'first\r\nsecond');

    // Act.
    const unlinked = plannedEvent(unlinkPlan(copy));

    // Assert.
    expect(unlinked)
      .toStrictEqual({ ...copy, note: 'first\r\nsecond' });
  });

  it('refuses a note that would read otherwise without its link, saying why', () =>
  {
    // Arrange.
    const copy = { ...copyOf(needler()), note: 'z<<blueprint:[k3x9q2mf, 2]>w> <moveSpeed:6.0>' };

    // Act.
    const refused = unlinkPlan(copy);

    // Assert.
    expect(refused)
      .toStrictEqual({ ok: false, message: `It can't be unlinked: ${OTHER_TAGS_MISREAD}.` });
  });
});

describe('noteBoxOf', () =>
{
  it('shows a copy\'s own text, keeping its link out of the box', () =>
  {
    // Arrange.
    const copy = sighted(6, [ 'p1.sight+2' ], 'Guards the gate');

    // Act.
    const box = noteBoxOf(copy);

    // Assert.
    expect(box)
      .toStrictEqual({ text: 'Guards the gate', keepsLink: true });
  });

  it('shows the whole note of an event linked to nothing, and of a copy whose note would read otherwise without its link', () =>
  {
    // Arrange.
    const plain = { ...needler(), note: 'Guards the gate' };
    const tangled = { ...copyOf(needler()), note: 'z<<blueprint:[k3x9q2mf, 2]>w> <moveSpeed:6.0>' };

    // Act.
    const boxes = [ plain, tangled ].map(noteBoxOf);

    // Assert.
    expect(boxes)
      .toStrictEqual([ { text: 'Guards the gate', keepsLink: false }, { text: tangled.note, keepsLink: false } ]);
  });
});

describe('noteTextPlan', () =>
{
  it('writes a copy\'s text before its link, kept exactly, values and all', () =>
  {
    // Arrange.
    const copy = sighted(6, [ 'p1.sight+2' ], 'Guards the gate');

    // Act.
    const written = plannedEvent(noteTextPlan(copy, 'Guards the west gate\nat night'));

    // Assert.
    expect(written)
      .toStrictEqual({ ...copy, note: 'Guards the west gate\nat night\n<blueprint:[k3x9q2mf, 2, p1.sight+2]>' });
  });

  it('leaves a copy\'s note as the very note it was when the text is its own text, wherever its link sits', () =>
  {
    // Arrange: the link before the note's own text.
    const copy = { ...copyOf(needler()), note: '<blueprint:[k3x9q2mf, 2]>\nwest gate' };

    // Act.
    const written = plannedEvent(noteTextPlan(copy, 'west gate'));

    // Assert.
    expect(written)
      .toBe(copy);
  });

  it('refuses text holding a link of its own for a copy, and text the link after it would be swallowed by', () =>
  {
    // Arrange.
    const copy = copyOf(needler());

    // Act.
    const refusals = [ 'west gate\n<blueprint:[aa22, 1]>', 'Goblin <tag: never closed' ].map(text => noteTextPlan(copy, text));

    // Assert.
    expect(refusals)
      .toStrictEqual([ { ok: false, message: SECOND_LINK }, { ok: false, message: `The note can't be written: ${LINK_MISREAD}.` } ]);
  });

  it('writes the text whole as the note of an event linked to nothing, or of a copy whose note does not read cleanly', () =>
  {
    // Arrange.
    const plain = needler();
    const tangled = { ...copyOf(needler()), note: 'z<<blueprint:[k3x9q2mf, 2]>w>' };

    // Act.
    const written = [ plain, tangled ].map(each => plannedEvent(noteTextPlan(each, 'z<blueprint:[k3x9q2mf, 2]>')).note);

    // Assert.
    expect(written)
      .toStrictEqual([ 'z<blueprint:[k3x9q2mf, 2]>', 'z<blueprint:[k3x9q2mf, 2]>' ]);
  });
});

describe('fieldActions', () =>
{
  it('offers pinning a number, unpinning a pinned one, and following anything that stands apart, and nothing else', () =>
  {
    // Arrange: a speed at an offset, a sight pinned, a frequency following, a trigger set by hand, a priority following,
    // and a second sight line of the copy's own.
    const copy = sighted(6, [ 'p1.speed+1', 'p1.sight=6' ]);
    copy.pages[0].moveSpeed = 4;
    copy.pages[0].trigger = 2;
    copy.pages[0].list.splice(2, 0, later('<sight:9>'));
    const reading = read(copy);

    // Act.
    const offered = [ 'p1.speed', 'p1.sight', 'p1.frequency', 'p1.trigger', 'p1.priority', 'p1.sight2' ].map(key => fieldActions(fieldOf(reading, key)));

    // Assert.
    expect(offered)
      .toStrictEqual([ [ 'pin', 'follow' ], [ 'unpin', 'follow' ], [ 'pin' ], [ 'follow' ], [], [] ]);
  });

  it('offers nothing on commands kept for naming other events of the blueprint, and following on ones set by hand', () =>
  {
    // Arrange: the nest's needler turns its event 3, whose copy here nobody knows; one copy as placed, one saying more.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3 } ]);
    const placed = copyOf(event(2, [ page([ turnOf(15) ]) ], { name: 'Needler' }));
    const talking = copyOf(event(2, [ page([ turnOf(15), command(101, [ '', 0, 0, 2, '' ]), command(401, [ 'Bzz.' ]) ]) ], { name: 'Needler' }));

    // Act.
    const offered = [ placed, talking ].map(copy => fieldActions(fieldOf(read(copy, contextOf(nest)), 'p1.commands')));

    // Assert.
    expect(offered)
      .toStrictEqual([ [], [ 'follow' ] ]);
  });
});

describe('canFollowAgain', () =>
{
  it('says a copy following in everything has nothing to follow, and one with a field apart, or drifted, has', () =>
  {
    // Arrange.
    const readings: CopyReading[] = [
      readCopy(copyOf(needler()), contextOf(needlerNest())),
      readCopy(copyOf(needler({ moveSpeed: 4 })), contextOf(needlerNest())),
      readCopy(copyOf(event(2, [ needler().pages[0], needler().pages[0] ])), contextOf(needlerNest())),
      readCopy(copyOf(needler()), contextOf(null)),
    ];

    // Act.
    const answers = readings.map(reading => (reading.kind === 'plain' ? null : canFollowAgain(reading)));

    // Assert: the last is lost, its blueprint gone.
    expect(answers)
      .toStrictEqual([ false, true, true, false ]);
  });

  it('says a copy standing apart only in commands kept for naming the group has nothing to follow, and one more has', () =>
  {
    // Arrange: the nest's needler turns its event 3, whose copy here nobody knows; one copy as placed, one a trigger apart.
    const nest = needlerNest([ event(2, [ page([ turnOf(3) ]) ], { name: 'Needler' }), { ...needler(), id: 3 } ]);
    const readings = [ {}, { trigger: 2 } ].map(overrides => readCopy(copyOf(event(2, [ page([ turnOf(15) ], overrides) ], { name: 'Needler' })), contextOf(nest)));

    // Act.
    const answers = readings.map(reading => (reading.kind === 'plain' ? null : canFollowAgain(reading)));

    // Assert.
    expect(answers)
      .toStrictEqual([ false, true ]);
  });
});

describe('every plan', () =>
{
  it('writes nothing into the copy it plans on', () =>
  {
    // Arrange.
    const copy = copyOf(needler({ moveSpeed: 5 }), [ 'p1.speed=5' ]);
    const before = cloneJson(copy);

    // Act.
    [ pinPlan(copy, read(copy), 'p1.frequency'), unpinPlan(copy, read(copy), 'p1.speed'), followAllPlan(copy, read(copy), undefined) ].forEach(plannedEvent);

    // Assert.
    expect(copy)
      .toStrictEqual(before);
  });
});
