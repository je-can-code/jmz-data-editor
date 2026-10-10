import { describe, expect, it } from 'vitest';
import { BLUEPRINT_GONE, differencesOf, NO_SUCH_EVENT, readCopy, type CopyReading } from '../../../../src/mapEditor/core/blueprints/copyReading.ts';
import { cloneJson } from '../../../../src/mapEditor/core/model/json.ts';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';
import { comment, contextOf, copyOf, fieldOf, later, needler, needlerCommands, needlerNest } from '../../support/copyFixtures.ts';

/*
 * A copy's panel shows the author what a copy of a blueprint follows, so reading a copy owes them the very standing a
 * change to the blueprint would carry into it, field by field, by the field model's own keys and tags (see
 * planCopyChange):
 *
 * - a choice follows while it holds the blueprint's value, and is set by hand otherwise;
 * - a number follows by what its link keeps: at an offset, or pinned at a value of its own, even at the blueprint's own
 *   value, and an offset holds through being clamped to the field's range;
 * - a number the copy holds otherwise than its link says, changed in MZ, say, or left behind by an undo, reads afresh as
 *   the next change would read it, an offset from the blueprint's value, or a pin moved to where the copy sits;
 * - a tag line one side has and the other has not is only on the copy, or not on it, and its page's commands are then set
 *   by hand;
 * - the blueprint's commands naming the event itself, or another of its group, read as the copy's own do.
 *
 * A copy whose blueprint is gone, or no longer has its event, is lost; one whose pages do not pair with its blueprint
 * event's, or whose note would read otherwise without its link, has drifted, in the where-used list's own words. An event
 * linked to nothing is plain. And the counts of how far a copy stands apart count choices set by hand, pins and offsets,
 * and nothing that follows.
 */
describe('readCopy', () =>
{
  /**
   * Reads the standing of every field of a reading, by key.
   * @param {CopyReading} reading The reading.
   * @returns {[ string, string ][]} Each field's key and standing.
   */
  const standings = (reading: CopyReading): [ string, string ][] =>
  {
    return reading.kind === 'read'
      ? reading.fields.map(field => [ field.key, field.state.kind ])
      : [];
  };

  it('reads an event linked to no blueprint as plain, whether its note holds other tags or nothing', () =>
  {
    // Arrange: one event with an empty note, one whose note holds a tag of another name.
    const plain = needler();
    const tagged = { ...needler(), note: '<moveSpeed:6.0>' };

    // Act.
    const readings = [ plain, tagged ].map(each => readCopy(each, contextOf(needlerNest())));

    // Assert.
    expect(readings)
      .toStrictEqual([ { kind: 'plain' }, { kind: 'plain' } ]);
  });

  it('reads a copy whose blueprint the window no longer keeps as lost, saying so', () =>
  {
    // Arrange: the window keeps another blueprint, by another id.
    const copy = copyOf(needler());
    const other = { ...needlerNest(), id: 'zz99zz99' };

    // Act.
    const reading = readCopy(copy, contextOf(other));

    // Assert.
    expect(reading)
      .toStrictEqual({ kind: 'lost', link: { blueprintId: 'k3x9q2mf', eventId: 2, differences: [] }, blueprint: null, reason: BLUEPRINT_GONE });
  });

  it('reads a copy of an event its blueprint no longer has as lost, keeping the blueprint to name it by', () =>
  {
    // Arrange: the blueprint keeps its event 3, beside where its event 2 was.
    const nest = needlerNest([ { ...needler(), id: 3 } ]);

    // Act.
    const reading = readCopy(copyOf(needler()), contextOf(nest));

    // Assert.
    expect([ reading.kind, reading.kind === 'lost' ? [ reading.blueprint?.name, reading.reason ] : null ])
      .toStrictEqual([ 'lost', [ 'Needler nest', NO_SUCH_EVENT ] ]);
  });

  it('reads a copy with more pages than its blueprint\'s event as drifted, in the where-used list\'s words', () =>
  {
    // Arrange.
    const copy = copyOf(event(2, [ needler().pages[0], needler().pages[0] ], { name: 'Needler' }));

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert.
    expect([ reading.kind, reading.kind === 'drifted' ? reading.reason : null ])
      .toStrictEqual([ 'drifted', 'it has 2 pages and its blueprint has 1 page' ]);
  });

  it('reads a copy whose note would read otherwise without its link as drifted, saying why', () =>
  {
    // Arrange: a stray bracket before the link, which would open a tag of its own once the link is out.
    const copy = { ...copyOf(needler()), note: 'z<<blueprint:[k3x9q2mf, 2]>w> <moveSpeed:6.0>' };

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert.
    expect([ reading.kind, reading.kind === 'drifted' ? reading.reason : null ])
      .toStrictEqual([ 'drifted', `in its note, ${OTHER_TAGS_MISREAD}` ]);
  });

  it('reads every field of a copy placed as the blueprint has it as following, in the field model\'s order', () =>
  {
    // Arrange: nothing beyond the copy as placed.

    // Act.
    const reading = readCopy(copyOf(needler()), contextOf(needlerNest()));

    // Assert: the event's own fields, the page's own, its commands, then each tag line's fields where the line sits.
    expect(standings(reading))
      .toStrictEqual([
        [ 'name', 'follows' ],
        [ 'note', 'follows' ],
        [ 'p1.speed', 'follows' ],
        [ 'p1.frequency', 'follows' ],
        [ 'p1.conditions', 'follows' ],
        [ 'p1.image', 'follows' ],
        [ 'p1.moveType', 'follows' ],
        [ 'p1.moveRoute', 'follows' ],
        [ 'p1.walking', 'follows' ],
        [ 'p1.stepping', 'follows' ],
        [ 'p1.directionFix', 'follows' ],
        [ 'p1.through', 'follows' ],
        [ 'p1.priority', 'follows' ],
        [ 'p1.trigger', 'follows' ],
        [ 'p1.commands', 'follows' ],
        [ 'p1.enemyId', 'follows' ],
        [ 'p1.sight', 'follows' ],
        [ 'p1.light1.radius', 'follows' ],
        [ 'p1.light1.color', 'follows' ],
        [ 'p1.light1.intensity', 'follows' ],
        [ 'p1.light1.effect', 'follows' ],
        [ 'p1.<motion>', 'follows' ],
      ]);
  });

  it('reads a choice the copy holds otherwise as set by hand, and the one beside it still matching as following', () =>
  {
    // Arrange: the copy renamed and given another trigger, its priority left as the blueprint's.
    const copy = { ...copyOf(needler({ trigger: 3 })), name: 'Needler (west)' };

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert.
    expect([ 'name', 'p1.trigger', 'p1.priority' ].map(key => [ fieldOf(reading, key).state, fieldOf(reading, key).copy, fieldOf(reading, key).blueprint ]))
      .toStrictEqual([
        [ { kind: 'own' }, 'Needler (west)', 'Needler' ],
        [ { kind: 'own' }, 3, 0 ],
        [ { kind: 'follows' }, 0, 0 ],
      ]);
  });

  it('reads a number its link offsets as following by that offset, up or down, and one it keeps nothing of as following', () =>
  {
    // Arrange: the copy's speed one faster and its sight two shorter, each held in its link; its frequency the blueprint's.
    const source = needler({ moveSpeed: 4 });
    source.pages[0].list[1] = later('<sight:2>');
    const copy = copyOf(source, [ 'p1.speed+1', 'p1.sight-2' ]);

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert.
    expect([ 'p1.speed', 'p1.sight', 'p1.frequency' ].map(key => fieldOf(reading, key).state))
      .toStrictEqual([ { kind: 'offset', amount: 1 }, { kind: 'offset', amount: -2 }, { kind: 'follows' } ]);
  });

  it('reads a number the copy holds otherwise than its link says afresh, as the next change to the blueprint would', () =>
  {
    // Arrange: a speed left one above the blueprint's with nothing in the link, as an undo leaves one, and a sight pinned
    // at 6 in the link that the copy holds at 7, changed in MZ.
    const source = needler({ moveSpeed: 4 });
    source.pages[0].list[1] = later('<sight:7>');
    const copy = copyOf(source, [ 'p1.sight=6' ]);

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert: the speed's offset and the sight's pin both move to where the copy sits.
    expect([ fieldOf(reading, 'p1.speed').state, fieldOf(reading, 'p1.sight').state ])
      .toStrictEqual([ { kind: 'offset', amount: 1 }, { kind: 'pinned', value: 7 } ]);
  });

  it('keeps an offset the field\'s range held the copy at, and reads a pin at the blueprint\'s own value as pinned', () =>
  {
    // Arrange: the blueprint at the top speed and the copy held there two above it; the copy's frequency pinned at the
    // blueprint's 3; its sight at the blueprint's 4 with nothing kept.
    const nest = needlerNest([ needler({ moveSpeed: 6 }) ]);
    const copy = copyOf(needler({ moveSpeed: 6 }), [ 'p1.speed+2', 'p1.frequency=3' ]);

    // Act.
    const reading = readCopy(copy, contextOf(nest));

    // Assert.
    expect([ 'p1.speed', 'p1.frequency', 'p1.sight' ].map(key => fieldOf(reading, key).state))
      .toStrictEqual([ { kind: 'offset', amount: 2 }, { kind: 'pinned', value: 3 }, { kind: 'follows' } ]);
  });

  it('reads a tag line only the copy has, and one only the blueprint has, apart, with the page\'s commands set by hand', () =>
  {
    // Arrange: the copy given a second sight line, and its torch taken away.
    const [ enemy, sight, , motion, ...rest ] = needlerCommands();
    const copy = copyOf(event(2, [ page([ enemy, sight, later('<sight:6>'), motion, ...rest ]) ], { name: 'Needler' }));

    // Act.
    const reading = readCopy(copy, contextOf(needlerNest()));

    // Assert: the second sight line is the copy's alone, the torch's fields the blueprint's alone, and the first sight
    // line, which both have, still follows.
    expect([
      ...[ 'p1.sight2', 'p1.light1.radius', 'p1.light1.effect', 'p1.sight' ].map(key => [ fieldOf(reading, key).state.kind, fieldOf(reading, key).copy, fieldOf(reading, key).blueprint ]),
      fieldOf(reading, 'p1.commands').state.kind,
    ])
      .toStrictEqual([
        [ 'copy-only', 6, undefined ],
        [ 'blueprint-only', undefined, 4 ],
        [ 'blueprint-only', undefined, 'flicker' ],
        [ 'follows', 4, 4 ],
        'own',
      ]);
  });

  it('reads the blueprint\'s commands naming its own event, or another of its group, as the copy\'s own name them', () =>
  {
    // Arrange: the blueprint's event 2 turns itself and its event 3 to face down; the copy, 12, was placed with 3's copy,
    // 15, and its commands were rewired so.
    const turn = (eventId: number) => command(205, [ eventId, { list: [ { code: 0, parameters: [] } ], repeat: false, skippable: false, wait: false } ]);
    const made = event(2, [ page([ turn(2), turn(3) ]) ], { name: 'Needler' });
    const nest = needlerNest([ made, { ...needler(), id: 3 } ]);
    const copy = copyOf(event(2, [ page([ turn(12), turn(15) ]) ], { name: 'Needler' }));

    // Act: once with the group known, and once without.
    const known = readCopy(copy, contextOf(nest, new Map([ [ 3, 15 ] ])));
    const unknown = readCopy(copy, contextOf(nest));

    // Assert: unknown, the command naming 3's copy reads as the copy's own choice, as a change to the blueprint reads it.
    expect([ fieldOf(known, 'p1.commands').state, fieldOf(unknown, 'p1.commands').state ])
      .toStrictEqual([ { kind: 'follows' }, { kind: 'own' } ]);
  });

  it('reads the note\'s own text, outside the link, against the blueprint\'s note', () =>
  {
    // Arrange: the blueprint's needler noted "Guards the gate", one copy noting the same and one noting otherwise.
    const nest = needlerNest([ { ...needler(), note: 'Guards the gate' } ]);
    const same = copyOf({ ...needler(), note: 'Guards the gate' });
    const otherwise = copyOf({ ...needler(), note: 'Sleeps' });

    // Act.
    const readings = [ same, otherwise ].map(copy => readCopy(copy, contextOf(nest)));

    // Assert.
    expect(readings.map(reading => [ fieldOf(reading, 'note').state.kind, fieldOf(reading, 'note').copy ]))
      .toStrictEqual([ [ 'follows', 'Guards the gate' ], [ 'own', 'Sleeps' ] ]);
  });

  it('reads nothing into the copy it was handed', () =>
  {
    // Arrange.
    const copy = copyOf(needler({ moveSpeed: 5 }), [ 'p1.speed=5' ]);
    const before = cloneJson(copy);

    // Act.
    readCopy(copy, contextOf(needlerNest()));

    // Assert.
    expect(copy)
      .toStrictEqual(before);
  });
});

describe('differencesOf', () =>
{
  it('counts the choices set by hand, the pins and the offsets, and nothing that follows or only one side has', () =>
  {
    // Arrange: two choices set by hand (the trigger and the motion), a pinned speed, a sight one offset, a second sight
    // line of the copy's own, and the torch taken away.
    const [ enemy, , , , ...rest ] = needlerCommands();
    const source = event(2, [ page([ enemy, later('<sight:5>'), later('<sight:9>'), comment('<motion:[float]>'), ...rest ], { moveSpeed: 5, trigger: 2 }) ], { name: 'Needler' });
    const reading = readCopy(copyOf(source, [ 'p1.speed=5' ]), contextOf(needlerNest()));

    // Act.
    const differences = reading.kind === 'read' ? differencesOf(reading.fields) : null;

    // Assert: the commands are set by hand too, since a tag line came and one went.
    expect(differences)
      .toStrictEqual({ own: 3, pinned: 1, offsets: 1 });
  });

  it('counts nothing for a copy that follows in everything', () =>
  {
    // Arrange.
    const reading = readCopy(copyOf(needler()), contextOf(needlerNest()));

    // Act.
    const differences = reading.kind === 'read' ? differencesOf(reading.fields) : null;

    // Assert.
    expect(differences)
      .toStrictEqual({ own: 0, pinned: 0, offsets: 0 });
  });
});
