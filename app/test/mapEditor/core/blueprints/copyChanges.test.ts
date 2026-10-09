import { describe, expect, it } from 'vitest';
import type { CommentTagDefinition } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import { LINK_MISREAD, withBlueprintLink, type BlueprintLink } from '../../../../src/mapEditor/core/blueprints/blueprintLink.ts';
import { planCopyChange, type CopyChange, type CopyChangeOptions } from '../../../../src/mapEditor/core/blueprints/copyChanges.ts';
import { createEventPage } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { cloneJson, type JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand, RmmzEventPage, RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { OTHER_TAGS_MISREAD } from '../../../../src/mapEditor/core/properties/noteText.ts';
import { lightTagFields } from '../../../../src/mapEditor/modules/lighting/lightFields.ts';
import { PLUGIN_DEFAULTS } from '../../../../src/mapEditor/modules/lighting/lightTags.ts';
import { command, event, page, text } from '../../support/eventKindFixtures.ts';

/*
 * A change to one of a blueprint's events reaches each copy of it field by field, and nothing else of the copy moves.
 *
 * - A field the change did not move stays exactly as the copy has it, and so does whatever its link keeps of it, even
 *   when the copy no longer holds what the link says.
 * - A number follows by its offset: the blueprint's new value, plus the copy's offset, held to the field's range. The
 *   offset is kept whole in the link however far it was held, so a +2 copy held at the top of its range is +2 again once
 *   the blueprint comes back down. A pinned number holds its value whatever the blueprint does. A copy no longer holding
 *   what its link says was changed somewhere else, and its offset or pin is read afresh from what it holds first.
 * - A choice follows when the copy still holds the blueprint's old value, and otherwise is the copy's override, and stays,
 *   until the blueprint comes round to it, when the copy is in line again and follows from there.
 * - The command list, less every tag line, is one choice. Every tag line is a field of its own, written into the copy's
 *   own line in place, whether the copy follows the blueprint's list or keeps its own, wherever the line sits: on one
 *   comment's lines or spread over several. A light's reach, colour, intensity and effect are fields, and lights pair by
 *   their place on the page. A tag no module reads, such as an enemy's id, is one choice holding the whole line, keyed by
 *   its tag and its place among that tag's lines, so it never moves by an offset, and a copy changing one tag line by hand
 *   still follows every other. A tag line the blueprint adds reaches a copy that follows its list; one it takes away goes
 *   from such a copy, with what the link kept of it.
 * - The name and the note's own text are choices, the link written after the note's text; a note whose text and link
 *   both stand is left byte for byte.
 * - A command of the blueprint's naming its own event by id names the copy, and one naming another event of its group
 *   names that event's copy when the copy's group is given.
 *
 * The structural rule: pages pair by their place. A copy with more or fewer pages than its blueprint had has drifted, and
 * so has one whose note cannot lose or take its link cleanly, or whose light cannot take a value; each is reported with
 * why, and changes nothing. A change adding pages or taking them away says how they pair: a page added goes to every
 * copy as the blueprint has it, a page taken away goes from each with what its link kept of it, and the link's values
 * move with their pages. A change saying nothing of it, or saying it wrongly, a plan asked of an event that is not a copy
 * of the changed event, or a module reading its tag wrongly, is a mistake, and throws rather than pass for drift.
 */
describe('planCopyChange', () =>
{
  /**
   * J-Lighting's light tag as fields, with the plugin's own defaults.
   */
  const OPTIONS: CopyChangeOptions = { tags: [ lightTagFields(PLUGIN_DEFAULTS) ] };

  /**
   * The link every copy below holds, before any value of its own.
   */
  const LINK: BlueprintLink = { blueprintId: 'k3x9q2mf', eventId: 5, differences: [] };

  /**
   * The goblin's light, as the blueprint holds it.
   */
  const TORCH = '<light:[4, #ffbb73, 30, flicker]>';

  /**
   * Builds a comment line.
   * @param {string} words The comment's text.
   * @returns {RmmzEventCommand} The command.
   */
  const comment = (words: string): RmmzEventCommand => command(108, [ words ]);

  /**
   * Builds a later line of a comment, which MZ writes under the comment's first.
   * @param {string} words The line's text.
   * @returns {RmmzEventCommand} The command.
   */
  const later = (words: string): RmmzEventCommand => command(408, [ words ]);

  /**
   * The blueprint's goblin, event 5: a battler of enemy 12 carrying a torch, who growls, at speed and frequency 3.
   * @param {RmmzEventCommand[]} list Its first page's commands, when a test wants others.
   * @returns {RmmzMapEvent} The event.
   */
  const goblin = (list: RmmzEventCommand[] = [ comment('<enemyId:12>'), comment(TORCH), ...text([ 'Grr.' ]) ]): RmmzMapEvent =>
  {
    return event(5, [ page(list) ], { name: 'Goblin' });
  };

  /**
   * Builds a copy of an event as placing a blueprint would: under another id, standing elsewhere, its note holding its
   * link, keeping the values given.
   * @param {RmmzMapEvent} source The event as the copy holds it, its own differences already made.
   * @param {string[]} differences The values its link keeps.
   * @returns {RmmzMapEvent} The copy, event 12.
   */
  const copyOf = (source: RmmzMapEvent, differences: string[] = []): RmmzMapEvent =>
  {
    return { ...cloneJson(source), id: 12, x: 7, y: 9, note: withBlueprintLink(source.note, { ...LINK, differences }) };
  };

  /**
   * Changes one page of an event.
   * @param {RmmzMapEvent} source The event.
   * @param {Partial<RmmzEventPage>} change What to change on the page.
   * @param {number} pageIndex The page, counted from 0.
   * @returns {RmmzMapEvent} The event changed.
   */
  const withPage = (source: RmmzMapEvent, change: Partial<RmmzEventPage>, pageIndex = 0): RmmzMapEvent =>
  {
    return { ...source, pages: source.pages.map((each, index) => (index === pageIndex ? { ...each, ...change } : each)) };
  };

  /**
   * Rewrites one comment line of an event's page.
   * @param {RmmzMapEvent} source The event.
   * @param {number} listIndex Where the line sits.
   * @param {string} words The line's new text.
   * @param {number} pageIndex The page, counted from 0.
   * @returns {RmmzMapEvent} The event changed.
   */
  const withLine = (source: RmmzMapEvent, listIndex: number, words: string, pageIndex = 0): RmmzMapEvent =>
  {
    const list = source.pages[pageIndex].list.map((each, index) => (index === listIndex ? { ...each, parameters: [ words ] } : each));
    return withPage(source, { list }, pageIndex);
  };

  /**
   * Adds commands to an event's page, before the empty command closing it.
   * @param {RmmzMapEvent} source The event.
   * @param {RmmzEventCommand[]} commands The commands.
   * @returns {RmmzMapEvent} The event changed.
   */
  const withAdded = (source: RmmzMapEvent, commands: RmmzEventCommand[]): RmmzMapEvent =>
  {
    const [ { list } ] = source.pages;
    return withPage(source, { list: [ ...list.slice(0, -1), ...commands, ...list.slice(-1) ] });
  };

  /**
   * Plans a change for a copy, with lighting's tag read.
   * @param {RmmzMapEvent} before The blueprint's event before the change.
   * @param {RmmzMapEvent} after It after the change.
   * @param {RmmzMapEvent} copy The copy.
   * @returns {CopyChange} The plan.
   */
  const plan = (before: RmmzMapEvent, after: RmmzMapEvent, copy: RmmzMapEvent): CopyChange =>
  {
    return planCopyChange({ before, after }, copy, OPTIONS);
  };

  /**
   * Reads what a copy came to, which must have changed.
   * @param {CopyChange} outcome The plan.
   * @returns {{ event: RmmzMapEvent, link: BlueprintLink }} The copy's new event and link.
   */
  const changedTo = (outcome: CopyChange): { event: RmmzMapEvent; link: BlueprintLink } =>
  {
    if (outcome.kind !== 'changes')
    {
      throw new Error(`the copy ${outcome.kind}`);
    }

    return outcome;
  };

  /**
   * Reads one line of the first page of an event.
   * @param {RmmzMapEvent} source The event.
   * @param {number} listIndex Where the line sits.
   * @returns {JsonValue} The line's text.
   */
  const lineOf = (source: RmmzMapEvent, listIndex: number): JsonValue => source.pages[0].list[listIndex].parameters[0];

  describe('what stays', () =>
  {
    it('reaches no copy with a change moving nothing but where the blueprint\'s event stands', () =>
    {
      // Arrange: a copy holding values of its own, and the blueprint's event moved.
      const before = goblin();
      const copy = copyOf(withPage(before, { moveSpeed: 5, trigger: 1 }));

      // Act.
      const outcome = plan(before, { ...before, x: 4, y: 6 }, copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('reaches no copy overriding every choice the change moved', () =>
    {
      // Arrange: the copy's own trigger and name, and the blueprint changing both.
      const before = goblin();
      const copy = copyOf({ ...withPage(before, { trigger: 1 }), name: 'Grunt' });

      // Act.
      const outcome = plan(before, { ...withPage(before, { trigger: 3 }), name: 'Goblin chief' }, copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('reaches no copy with a change to a light it does not have, its list being its own', () =>
    {
      // Arrange: a copy whose page carries no light.
      const before = goblin();
      const copy = copyOf(goblin([ comment('<enemyId:12>'), ...text([ 'Grr.' ]) ]));

      // Act.
      const outcome = plan(before, withLine(before, 1, '<light:[5, #ffbb73, 30, flicker]>'), copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('leaves a number the change did not move as the copy has it, and what its link keeps of it, stale or not', () =>
    {
      // Arrange: a copy kept 2 faster than the blueprint that holds the blueprint's speed now, changed somewhere else.
      const before = goblin();
      const copy = copyOf(before, [ 'p1.speed+2' ]);

      // Act.
      const { event: copied, link } = changedTo(plan(before, withPage(before, { trigger: 3 }), copy));

      // Assert: the trigger followed, and the speed and its link stand.
      expect([ copied.pages[0].trigger, copied.pages[0].moveSpeed, link.differences, copied.note ])
        .toStrictEqual([ 3, 3, [ 'p1.speed+2' ], copy.note ]);
    });
  });

  describe('numbers', () =>
  {
    it('follows a number by the copy\'s offset, read from what it holds, and keeps the offset in its link', () =>
    {
      // Arrange: a copy at speed 5 over a blueprint at 3, its link keeping nothing yet.
      const before = goblin();
      const copy = copyOf(withPage(before, { moveSpeed: 5 }));

      // Act.
      const { event: copied, link } = changedTo(plan(before, withPage(before, { moveSpeed: 4 }), copy));

      // Assert.
      expect([ copied.pages[0].moveSpeed, link, copied.note ])
        .toStrictEqual([ 6, { ...LINK, differences: [ 'p1.speed+2' ] }, '<blueprint:[k3x9q2mf, 5, p1.speed+2]>' ]);
    });

    it('keeps an offset whole while the copy is held at the top of the range, and moves by it again once the blueprint comes back down', () =>
    {
      // Arrange: a copy 2 faster than a blueprint at 3, which goes to 5, then down to 2.
      const at3 = goblin();
      const at5 = withPage(at3, { moveSpeed: 5 });
      const at2 = withPage(at3, { moveSpeed: 2 });
      const copy = copyOf(withPage(at3, { moveSpeed: 5 }));

      // Act.
      const held = changedTo(plan(at3, at5, copy));
      const back = changedTo(plan(at5, at2, held.event));

      // Assert: held at 6, still +2, then 4.
      expect([ held.event.pages[0].moveSpeed, held.link.differences, back.event.pages[0].moveSpeed, back.link.differences ])
        .toStrictEqual([ 6, [ 'p1.speed+2' ], 4, [ 'p1.speed+2' ] ]);
    });

    it('holds a copy at the bottom of the range, its offset kept whole, and moves by it again once the blueprint comes back up', () =>
    {
      // Arrange: a copy kept 3 slower than a blueprint at 4, which goes to 2, then up to 6.
      const at4 = withPage(goblin(), { moveSpeed: 4 });
      const at2 = withPage(at4, { moveSpeed: 2 });
      const at6 = withPage(at4, { moveSpeed: 6 });
      const copy = copyOf(withPage(at4, { moveSpeed: 1 }), [ 'p1.speed-3' ]);

      // Act.
      const held = plan(at4, at2, copy);
      const back = changedTo(plan(at2, at6, copy));

      // Assert: nothing to change at the bottom, then 3.
      expect([ held, back.event.pages[0].moveSpeed, back.link.differences ])
        .toStrictEqual([ { kind: 'stays' }, 3, [ 'p1.speed-3' ] ]);
    });

    it('writes an offset the copy is held by into its link even when the copy\'s value does not move', () =>
    {
      // Arrange: a copy at frequency 5 over a blueprint at 4, which goes to 5, then back to 3.
      const at4 = withPage(goblin(), { moveFrequency: 4 });
      const at5 = withPage(at4, { moveFrequency: 5 });
      const at3 = withPage(at4, { moveFrequency: 3 });
      const copy = copyOf(withPage(at4, { moveFrequency: 5 }));

      // Act.
      const held = changedTo(plan(at4, at5, copy));
      const back = changedTo(plan(at5, at3, held.event));

      // Assert: the page as it was but for the note, and then 4.
      expect([ held.event.pages, held.event.note, back.event.pages[0].moveFrequency ])
        .toStrictEqual([ copy.pages, '<blueprint:[k3x9q2mf, 5, p1.frequency+1]>', 4 ]);
    });

    it('holds a pinned number whatever the blueprint does, the pin held to the range', () =>
    {
      // Arrange: a copy pinned at speed 2, and one pinned past the top, held at 6; the blueprint going to 5, its
      // frequency too.
      const before = goblin();
      const after = withPage(before, { moveSpeed: 5, moveFrequency: 4 });
      const pinned = copyOf(withPage(before, { moveSpeed: 2 }), [ 'p1.speed=2' ]);
      const past = copyOf(withPage(before, { moveSpeed: 6 }), [ 'p1.speed=9' ]);

      // Act.
      const copies = [ pinned, past ].map(copy => changedTo(plan(before, after, copy)));

      // Assert: the frequencies followed, the speeds held, the pins kept as written.
      expect(copies.map(({ event: copied, link }) => [ copied.pages[0].moveSpeed, copied.pages[0].moveFrequency, link.differences ]))
        .toStrictEqual([ [ 2, 4, [ 'p1.speed=2' ] ], [ 6, 4, [ 'p1.speed=9' ] ] ]);
    });

    it('pins a copy changed somewhere else at what it now holds', () =>
    {
      // Arrange: a copy pinned at 2 that holds 4.
      const before = goblin();
      const copy = copyOf(withPage(before, { moveSpeed: 4 }), [ 'p1.speed=2' ]);

      // Act.
      const { event: copied, link } = changedTo(plan(before, withPage(before, { moveSpeed: 5 }), copy));

      // Assert.
      expect([ copied.pages[0].moveSpeed, link.differences ])
        .toStrictEqual([ 4, [ 'p1.speed=4' ] ]);
    });

    it('reads an offset afresh from a copy changed somewhere else, so a copy back on the blueprint\'s value follows it exactly', () =>
    {
      // Arrange: a copy kept 2 faster that now holds the blueprint's speed, and one kept nothing that now holds 1 more.
      const before = goblin();
      const after = withPage(before, { moveSpeed: 5 });
      const back = copyOf(before, [ 'p1.speed+2' ]);
      const faster = copyOf(withPage(before, { moveSpeed: 4 }));

      // Act.
      const copies = [ back, faster ].map(copy => changedTo(plan(before, after, copy)));

      // Assert.
      expect(copies.map(({ event: copied, link }) => [ copied.pages[0].moveSpeed, link.differences ]))
        .toStrictEqual([ [ 5, [] ], [ 6, [ 'p1.speed+1' ] ] ]);
    });

    it('follows a number held exactly on the blueprint\'s, keeping nothing in the link', () =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(before);

      // Act.
      const { event: copied, link } = changedTo(plan(before, withPage(before, { moveSpeed: 5 }), copy));

      // Assert.
      expect([ copied.pages[0].moveSpeed, link, copied.note ])
        .toStrictEqual([ 5, LINK, copy.note ]);
    });
  });

  describe('choices', () =>
  {
    /**
     * A move route no fresh page holds.
     */
    const ROUTE = { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: false, wait: false };

    /**
     * Each choice of a page: a value the blueprint changes to, and a value of the copy's own.
     */
    const CHOICES: [ string, Partial<RmmzEventPage>, Partial<RmmzEventPage> ][] = [
      [ 'conditions', { conditions: { ...createEventPage().conditions, switch1Valid: true } }, { conditions: { ...createEventPage().conditions, selfSwitchValid: true } } ],
      [ 'image', { image: { ...createEventPage().image, characterName: 'Monster' } }, { image: { ...createEventPage().image, characterName: 'Actor1' } } ],
      [ 'moveType', { moveType: 1 }, { moveType: 2 } ],
      [ 'moveRoute', { moveRoute: ROUTE }, { moveRoute: { ...ROUTE, skippable: true } } ],
      [ 'priority', { priorityType: 2 }, { priorityType: 1 } ],
      [ 'trigger', { trigger: 3 }, { trigger: 1 } ],
    ];

    it.each(CHOICES)('follows the blueprint\'s %s when the copy held the old one', (_name, change) =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(before);

      // Act.
      const { event: copied, link } = changedTo(plan(before, withPage(before, change), copy));

      // Assert: the page as the blueprint's now, and the link keeping nothing.
      expect([ copied.pages[0], link ])
        .toStrictEqual([ { ...copy.pages[0], ...change }, LINK ]);
    });

    it.each(CHOICES)('keeps the copy\'s own %s, its override', (_name, change, own) =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(withPage(before, own));

      // Act.
      const outcome = plan(before, withPage(before, change), copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it.each([
      [ 'walking', { walkAnime: false } ],
      [ 'stepping', { stepAnime: true } ],
      [ 'directionFix', { directionFix: true } ],
      [ 'through', { through: true } ],
    ] as [ string, Partial<RmmzEventPage> ][])('follows the blueprint\'s %s, a choice of two, when the copy held the old one', (_name, change) =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(before);

      // Act.
      const { event: copied } = changedTo(plan(before, withPage(before, change), copy));

      // Assert.
      expect(copied.pages[0])
        .toStrictEqual({ ...copy.pages[0], ...change });
    });

    it('brings a copy\'s choice back into line once the blueprint takes it, and follows the blueprint from there', () =>
    {
      // Arrange: a copy triggered by touch where the blueprint uses the button; the blueprint goes to touch, then autorun.
      const button = goblin();
      const touch = withPage(button, { trigger: 1 });
      const autorun = withPage(button, { trigger: 3 });
      const copy = copyOf(touch);

      // Act.
      const inLine = plan(button, touch, copy);
      const followed = changedTo(plan(touch, autorun, copy));

      // Assert.
      expect([ inLine, followed.event.pages[0].trigger ])
        .toStrictEqual([ { kind: 'stays' }, 3 ]);
    });

    it('follows the blueprint\'s name when the copy held the old one, and keeps one of its own', () =>
    {
      // Arrange.
      const before = goblin();
      const after = { ...before, name: 'Goblin chief' };
      const copies = [ copyOf(before), copyOf({ ...before, name: 'Grunt' }) ];

      // Act.
      const outcomes = copies.map(copy => plan(before, after, copy));

      // Assert.
      expect([ changedTo(outcomes[0]).event.name, outcomes[1] ])
        .toStrictEqual([ 'Goblin chief', { kind: 'stays' } ]);
    });
  });

  describe('the note', () =>
  {
    it('follows the note\'s own text when the copy held the old one, its link written after it, and keeps text of its own', () =>
    {
      // Arrange: a blueprint noting its role, a copy noting the same and a copy noting its own.
      const before = { ...goblin(), note: 'Goblin' };
      const after = { ...before, note: 'Goblin chief' };
      const copies = [ copyOf(before), copyOf({ ...before, note: 'Grunt' }) ];

      // Act.
      const outcomes = copies.map(copy => plan(before, after, copy));

      // Assert.
      expect([ changedTo(outcomes[0]).event.note, outcomes[1] ])
        .toStrictEqual([ 'Goblin chief\n<blueprint:[k3x9q2mf, 5]>', { kind: 'stays' } ]);
    });

    it('leaves the note byte for byte while neither its text nor its link changes, however it is written', () =>
    {
      // Arrange: a note of Windows' line breaks with its link in the middle, as an author typing after it in MZ leaves it.
      const before = goblin();
      const copy = { ...copyOf(before), note: 'Grunt\r\n<blueprint:[k3x9q2mf, 5]>\r\nguards the gate' };

      // Act.
      const { event: copied } = changedTo(plan(before, withPage(before, { trigger: 3 }), copy));

      // Assert.
      expect(copied.note)
        .toBe(copy.note);
    });

    it('writes the link anew through the link\'s own writer once it changes, the note\'s own text kept', () =>
    {
      // Arrange: the same note, the copy faster than the blueprint.
      const before = goblin();
      const copy = { ...copyOf(withPage(before, { moveSpeed: 4 })), note: 'Grunt\r\n<blueprint:[k3x9q2mf, 5]>\r\nguards the gate' };

      // Act.
      const { event: copied } = changedTo(plan(before, withPage(before, { moveSpeed: 5 }), copy));

      // Assert.
      expect(copied.note)
        .toBe('Grunt\r\nguards the gate\r\n<blueprint:[k3x9q2mf, 5, p1.speed+1]>');
    });
  });

  describe('the command list', () =>
  {
    it('follows the blueprint\'s new list when the copy\'s, less its tags, was its old one', () =>
    {
      // Arrange: the blueprint growls twice now.
      const before = goblin();
      const after = withAdded(before, text([ 'Grr!' ]));
      const copy = copyOf(before);

      // Act.
      const { event: copied } = changedTo(plan(before, after, copy));

      // Assert.
      expect(copied.pages[0].list)
        .toStrictEqual(after.pages[0].list);
    });

    it('keeps a list of the copy\'s own', () =>
    {
      // Arrange: the copy says something else.
      const before = goblin();
      const copy = copyOf(withLine(before, 3, 'Hmph.'));

      // Act.
      const outcome = plan(before, withAdded(before, text([ 'Grr!' ])), copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('never moves an enemy\'s id by an offset: a tag no module reads is one choice, holding the whole line', () =>
    {
      // Arrange: the blueprint turns from enemy 12 to 13 and brightens its torch; one copy fights as 12, one as 14.
      const before = goblin();
      const after = withLine(withLine(before, 0, '<enemyId:13>'), 1, '<light:[5, #ffbb73, 30, flicker]>');
      const copies = [ copyOf(before), copyOf(withLine(before, 0, '<enemyId:14>')) ];

      // Act.
      const planned = copies.map(copy => changedTo(plan(before, after, copy)).event);

      // Assert: 12 follows to 13, 14 stays 14 and never becomes 15, and both torches follow.
      expect(planned.map(copied => [ lineOf(copied, 0), lineOf(copied, 1) ]))
        .toStrictEqual([
          [ '<enemyId:13>', '<light:[5, #ffbb73, 30, flicker]>' ],
          [ '<enemyId:14>', '<light:[5, #ffbb73, 30, flicker]>' ],
        ]);
    });

    it('ignores a fold MZ drew shut when telling whether the copy\'s list was the blueprint\'s', () =>
    {
      // Arrange: the copy's growl folded shut in MZ.
      const before = goblin();
      const after = withAdded(before, text([ 'Grr!' ]));
      const folded = copyOf(before);
      folded.pages[0].list[2] = { ...folded.pages[0].list[2], collapsed: true };

      // Act.
      const { event: copied } = changedTo(plan(before, after, folded));

      // Assert.
      expect(copied.pages[0].list)
        .toStrictEqual(after.pages[0].list);
    });

    it('reads the blueprint naming its own event by id as the copy naming itself', () =>
    {
      // Arrange: a route the event sets on itself by its id, 5 in the blueprint and 12 on the copy, as placing rewired it.
      const route = { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: false, wait: true };
      const before = goblin([ command(205, [ 5, route ]) ]);
      const copy = copyOf(goblin([ command(205, [ 12, route ]) ]));

      // Act.
      const { event: copied } = changedTo(plan(before, withAdded(before, text([ 'Grr!' ])), copy));

      // Assert: the copy's list follows, still naming itself; the empty command closing it has no parameters.
      expect(copied.pages[0].list.map(each => each.parameters[0]))
        .toStrictEqual([ 12, '', 'Grr!', undefined ]);
    });

    it('keeps the list of a copy naming another of its group unless told where that one stands, and follows once told', () =>
    {
      // Arrange: routes set on the event itself and on event 6 of the blueprint, whose copy placed beside this one is 13;
      // the group as told names event 6 alone, the copy itself being always known.
      const route = { list: [ { code: 1 }, { code: 0 } ], repeat: false, skippable: false, wait: true };
      const before = goblin([ command(205, [ 5, route ]), command(205, [ 6, route ]) ]);
      const after = withAdded(before, text([ 'Grr!' ]));
      const copy = copyOf(goblin([ command(205, [ 12, route ]), command(205, [ 13, route ]) ]));

      // Act.
      const unknown = plan(before, after, copy);
      const told = changedTo(planCopyChange({ before, after }, copy, { ...OPTIONS, references: new Map([ [ 6, 13 ] ]) }));

      // Assert.
      expect([ unknown, told.event.pages[0].list.map(each => each.parameters[0]) ])
        .toStrictEqual([ { kind: 'stays' }, [ 12, 13, '', 'Grr!', undefined ] ]);
    });
  });

  describe('lights', () =>
  {
    it('follows a light\'s reach by the copy\'s offset, written into its own line in place, and keeps the offset', () =>
    {
      // Arrange: a copy's torch reaching 6, its colour in capitals, over a blueprint's reaching 4.
      const before = goblin();
      const copy = copyOf(withLine(before, 1, '<light:[6, #FFBB73, 30, flicker]>'));

      // Act.
      const { event: copied, link } = changedTo(plan(before, withLine(before, 1, '<light:[5, #ffbb73, 30, flicker]>'), copy));

      // Assert.
      expect([ lineOf(copied, 1), link.differences ])
        .toStrictEqual([ '<light:[7, #FFBB73, 30, flicker]>', [ 'p1.light1.radius+2' ] ]);
    });

    it('holds a reach above nothing, its offset kept whole, and moves by it again once the blueprint comes back up', () =>
    {
      // Arrange: a copy's torch kept 3 short of the blueprint's 4; the blueprint goes to 2, then 5.
      const at4 = goblin();
      const at2 = withLine(at4, 1, '<light:[2, #ffbb73, 30, flicker]>');
      const at5 = withLine(at4, 1, '<light:[5, #ffbb73, 30, flicker]>');
      const copy = copyOf(withLine(at4, 1, '<light:[1, #ffbb73, 30, flicker]>'), [ 'p1.light1.radius-3' ]);

      // Act.
      const held = changedTo(plan(at4, at2, copy));
      const back = changedTo(plan(at2, at5, held.event));

      // Assert.
      expect([ lineOf(held.event, 1), held.link.differences, lineOf(back.event, 1), back.link.differences ])
        .toStrictEqual([ '<light:[0.01, #ffbb73, 30, flicker]>', [ 'p1.light1.radius-3' ], '<light:[2, #ffbb73, 30, flicker]>', [ 'p1.light1.radius-3' ] ]);
    });

    it('holds an intensity at 100, its offset kept whole, and moves by it again once the blueprint comes back down', () =>
    {
      // Arrange: a copy's torch at 90 over the blueprint's 30; the blueprint goes to 60, then 20.
      const at30 = goblin();
      const at60 = withLine(at30, 1, '<light:[4, #ffbb73, 60, flicker]>');
      const at20 = withLine(at30, 1, '<light:[4, #ffbb73, 20, flicker]>');
      const copy = copyOf(withLine(at30, 1, '<light:[4, #ffbb73, 90, flicker]>'));

      // Act.
      const held = changedTo(plan(at30, at60, copy));
      const back = changedTo(plan(at60, at20, held.event));

      // Assert.
      expect([ lineOf(held.event, 1), held.link.differences, lineOf(back.event, 1) ])
        .toStrictEqual([ '<light:[4, #ffbb73, 100, flicker]>', [ 'p1.light1.intensity+60' ], '<light:[4, #ffbb73, 80, flicker]>' ]);
    });

    it('follows the blueprint\'s colour when the copy showed the old one, however written, and keeps a colour of its own', () =>
    {
      // Arrange: the blueprint's torch turning red; one copy writes the old colour in capitals, one shows green.
      const before = goblin();
      const after = withLine(before, 1, '<light:[4, #ff0000, 30, flicker]>');
      const copies = [ copyOf(withLine(before, 1, '<light:[4, #FFBB73, 30, flicker]>')), copyOf(withLine(before, 1, '<light:[4, #00ff00, 30, flicker]>')) ];

      // Act.
      const outcomes = copies.map(copy => plan(before, after, copy));

      // Assert: written in the copy's own case.
      expect([ lineOf(changedTo(outcomes[0]).event, 1), outcomes[1] ])
        .toStrictEqual([ '<light:[4, #FF0000, 30, flicker]>', { kind: 'stays' } ]);
    });

    it('follows the blueprint\'s effect to steady, taking the effect off the copy\'s line', () =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(before);

      // Act.
      const { event: copied } = changedTo(plan(before, withLine(before, 1, '<light:[4, #ffbb73, 30]>'), copy));

      // Assert.
      expect(lineOf(copied, 1))
        .toBe('<light:[4, #ffbb73, 30]>');
    });

    it('pairs a page\'s lights by their place, so a change to the second reaches the copy\'s second alone', () =>
    {
      // Arrange: a ghost with a torch and a glow, its copy's glow reaching 1 further.
      const ghost = goblin([ comment(TORCH), comment('<light:[2, #bcd9ff, 10, pulse]>') ]);
      const copy = copyOf(withLine(ghost, 1, '<light:[3, #bcd9ff, 10, pulse]>'));

      // Act.
      const { event: copied, link } = changedTo(plan(ghost, withLine(ghost, 1, '<light:[2.5, #bcd9ff, 10, pulse]>'), copy));

      // Assert.
      expect([ lineOf(copied, 0), lineOf(copied, 1), link.differences ])
        .toStrictEqual([ TORCH, '<light:[3.5, #bcd9ff, 10, pulse]>', [ 'p1.light2.radius+1' ] ]);
    });

    it('keeps the copy\'s own light line when its list follows the blueprint\'s, each changed field followed on it', () =>
    {
      // Arrange: a copy's green torch; the blueprint growls twice and its torch reaches 5.
      const before = goblin();
      const after = withAdded(withLine(before, 1, '<light:[5, #ffbb73, 30, flicker]>'), text([ 'Grr!' ]));
      const copy = copyOf(withLine(before, 1, '<light:[4, #00ff00, 30, flicker]>'));

      // Act.
      const { event: copied } = changedTo(plan(before, after, copy));

      // Assert: the blueprint's list, but for the torch, green and reaching 5.
      const expected = after.pages[0].list.map((each, index) => (index === 1 ? { ...each, parameters: [ '<light:[5, #00ff00, 30, flicker]>' ] } : each));
      expect(copied.pages[0].list)
        .toStrictEqual(expected);
    });

    it('gives a copy following the blueprint\'s list a light the blueprint adds, as the blueprint has it', () =>
    {
      // Arrange: the copy's torch reaching 6; the blueprint adds a glow.
      const before = goblin();
      const after = withAdded(before, [ comment('<light:[2, #bcd9ff]>') ]);
      const copy = copyOf(withLine(before, 1, '<light:[6, #ffbb73, 30, flicker]>'));

      // Act.
      const { event: copied, link } = changedTo(plan(before, after, copy));

      // Assert.
      expect([ lineOf(copied, 1), lineOf(copied, 4), link ])
        .toStrictEqual([ '<light:[6, #ffbb73, 30, flicker]>', '<light:[2, #bcd9ff]>', LINK ]);
    });

    it('takes a light the blueprint takes away off a copy following its list, with what its link kept of it', () =>
    {
      // Arrange: a copy's torch kept 2 further than the blueprint's, which the blueprint puts out.
      const before = goblin();
      const after = goblin([ comment('<enemyId:12>'), ...text([ 'Grr.' ]) ]);
      const copy = copyOf(withLine(before, 1, '<light:[6, #ffbb73, 30, flicker]>'), [ 'p1.light1.radius+2' ]);

      // Act.
      const { event: copied, link } = changedTo(plan(before, after, copy));

      // Assert.
      expect([ copied.pages[0].list, link, copied.note ])
        .toStrictEqual([ after.pages[0].list, LINK, '<blueprint:[k3x9q2mf, 5]>' ]);
    });

    it('keeps a light the blueprint takes away on a copy with a list of its own, and what its link kept of it', () =>
    {
      // Arrange: the same copy, saying something else.
      const before = goblin();
      const after = goblin([ comment('<enemyId:12>'), ...text([ 'Grr.' ]) ]);
      const copy = copyOf(withLine(withLine(before, 1, '<light:[6, #ffbb73, 30, flicker]>'), 3, 'Hmph.'), [ 'p1.light1.radius+2' ]);

      // Act.
      const outcome = plan(before, after, copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('reports a copy whose light cannot take a value it must follow to as drifted, in the module\'s words', () =>
    {
      // Arrange: a copy's torch writing four values, one of them nothing the game reads, so no intensity fits.
      const before = goblin();
      const copy = copyOf(withLine(before, 1, '<light:[4, #ffbb73, flicker, junk]>'));

      // Act.
      const outcome = plan(before, withLine(before, 1, '<light:[4, #ffbb73, 40, flicker]>'), copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({
          kind: 'drifted',
          reason: 'on page 1, this light already has four values written, the most the game reads; remove the one it ignores in the event window, then try again',
        });
    });
  });

  describe('tag lines no module reads', () =>
  {
    /**
     * The blueprint's battler, event 5, its tags read by no module: its enemy, then its move speed and level on the same
     * comment's later lines, then its motion in a comment of its own, before it growls.
     * @returns {RmmzMapEvent} The event.
     */
    const battler = (): RmmzMapEvent => goblin([
      comment('<enemyId:12>'),
      later('<moveSpeed:4.0>'),
      later('<level:7>'),
      comment('<motion:[stretch]>'),
      ...text([ 'Grr.' ]),
    ]);

    it('follows every other tag line of a copy whose one tag line was changed by hand, on its comment or another', () =>
    {
      // Arrange: one copy in line, and one whose move speed was raised by hand; the blueprint's level, beside the move
      // speed on one comment, goes from 7 to 9, and its motion, in another comment, changes.
      const before = battler();
      const after = withLine(withLine(before, 2, '<level:9>'), 3, '<motion:[breathe]>');
      const copies = [ copyOf(before), copyOf(withLine(before, 1, '<moveSpeed:5.0>')) ];

      // Act.
      const planned = copies.map(copy => changedTo(plan(before, after, copy)));

      // Assert: both copies take the level and the motion; the tuned one keeps its own speed, and neither link changes.
      expect(planned.map(({ event: copied, link }) => [ [ 0, 1, 2, 3 ].map(index => lineOf(copied, index)), link ]))
        .toStrictEqual([
          [ [ '<enemyId:12>', '<moveSpeed:4.0>', '<level:9>', '<motion:[breathe]>' ], LINK ],
          [ [ '<enemyId:12>', '<moveSpeed:5.0>', '<level:9>', '<motion:[breathe]>' ], LINK ],
        ]);
    });

    it('keeps a tag line the copy changed by hand when the blueprint changes it too, never moving a number in it', () =>
    {
      // Arrange: a copy at level 8 floating where the blueprint stretches; the blueprint goes to level 9 and breathes.
      const before = battler();
      const after = withLine(withLine(before, 2, '<level:9>'), 3, '<motion:[breathe]>');
      const copy = copyOf(withLine(withLine(before, 2, '<level:8>'), 3, '<motion:[float]>'));

      // Act.
      const outcome = plan(before, after, copy);

      // Assert: both are the copy's own, and its level is never moved by the blueprint's 2.
      expect(outcome)
        .toStrictEqual({ kind: 'stays' });
    });

    it('pairs a tag the page repeats by its place among that tag\'s lines, so a change to the second reaches the copy\'s second', () =>
    {
      // Arrange: two motions around the enemy; the copy's first is its own; the blueprint changes its second.
      const before = goblin([ comment('<motion:[float]>'), later('<enemyId:12>'), comment('<motion:[breathe]>') ]);
      const after = withLine(before, 2, '<motion:[stretch]>');
      const copy = copyOf(withLine(before, 0, '<motion:[swing]>'));

      // Act.
      const { event: copied } = changedTo(plan(before, after, copy));

      // Assert.
      expect([ 0, 1, 2 ].map(index => lineOf(copied, index)))
        .toStrictEqual([ '<motion:[swing]>', '<enemyId:12>', '<motion:[stretch]>' ]);
    });

    it('gives a copy following the blueprint\'s list a tag line the blueprint adds, and takes one it takes away', () =>
    {
      // Arrange: the copy's speed raised by hand; the blueprint drops its level and adds a trait after its motion.
      const before = battler();
      const listAfter = before.pages[0].list.filter((_each, index) => index !== 2);
      const after = withPage(before, { list: [ ...listAfter.slice(0, 3), later('<aiTrait:careful>'), ...listAfter.slice(3) ] });
      const copy = copyOf(withLine(before, 1, '<moveSpeed:5.0>'));

      // Act.
      const { event: copied } = changedTo(plan(before, after, copy));

      // Assert: the blueprint's list, but for the copy's own speed.
      const expected = after.pages[0].list.map((each, index) => (index === 1 ? { ...each, parameters: [ '<moveSpeed:5.0>' ] } : each));
      expect(copied.pages[0].list)
        .toStrictEqual(expected);
    });

    it('follows each tag line the blueprint changes on a copy whose list is its own, the list kept', () =>
    {
      // Arrange: a copy that says something else; the blueprint growls twice now, at level 9.
      const before = battler();
      const after = withAdded(withLine(before, 2, '<level:9>'), text([ 'Grr!' ]));
      const copy = copyOf(withLine(before, 5, 'Hmph.'));

      // Act.
      const { event: copied } = changedTo(plan(before, after, copy));

      // Assert: the copy's own list, its level followed.
      expect(copied.pages[0].list)
        .toStrictEqual(withLine(copy, 2, '<level:9>').pages[0].list);
    });
  });

  describe('pages', () =>
  {
    it('reports a copy with more or fewer pages than its blueprint had as drifted, and changes nothing', () =>
    {
      // Arrange: a copy given a second page somewhere else, and one whose page was taken away, though a blueprint never
      // has none, all three asked about a speed change.
      const before = goblin();
      const after = withPage(before, { moveSpeed: 5 });
      const longer = copyOf({ ...before, pages: [ ...before.pages, createEventPage() ] });
      const twoPaged = { ...before, pages: [ ...before.pages, createEventPage() ] };
      const shorter = copyOf(before);

      // Act.
      const outcomes = [
        plan(before, after, longer),
        plan(twoPaged, withPage(twoPaged, { moveSpeed: 5 }), shorter),
      ];

      // Assert.
      expect(outcomes)
        .toStrictEqual([
          { kind: 'drifted', reason: 'it has 2 pages and its blueprint had 1 page' },
          { kind: 'drifted', reason: 'it has 1 page and its blueprint had 2 pages' },
        ]);
    });

    it('gives every copy a page the change adds, as the blueprint has it, the copy\'s own pages planned as before', () =>
    {
      // Arrange: a copy 2 faster; the blueprint gains a second page and speeds up.
      const before = goblin();
      const added = page([ comment('<enemyId:13>') ], { trigger: 1 });
      const after = { ...withPage(before, { moveSpeed: 4 }), pages: [ withPage(before, { moveSpeed: 4 }).pages[0], added ] };
      const copy = copyOf(withPage(before, { moveSpeed: 5 }));

      // Act.
      const { event: copied, link } = changedTo(planCopyChange({ before, after, pages: [ 0, null ] }, copy, OPTIONS));

      // Assert.
      expect([ copied.pages.length, copied.pages[0].moveSpeed, copied.pages[1], link.differences ])
        .toStrictEqual([ 2, 6, added, [ 'p1.speed+2' ] ]);
    });

    it('takes a page the change takes away off every copy, with what the link kept of it, moving the rest with their pages', () =>
    {
      // Arrange: a two-paged blueprint loses its first page; the copy kept values on both.
      const twoPaged = { ...goblin(), pages: [ goblin().pages[0], page([], { trigger: 1 }) ] };
      const after = { ...twoPaged, pages: [ twoPaged.pages[1] ] };
      const copy = copyOf(withPage(withPage(twoPaged, { moveSpeed: 4 }), { moveSpeed: 5 }, 1), [ 'p1.speed+1', 'p2.speed+2' ]);

      // Act.
      const { event: copied, link } = changedTo(planCopyChange({ before: twoPaged, after, pages: [ 1 ] }, copy, OPTIONS));

      // Assert.
      expect([ copied.pages, link.differences ])
        .toStrictEqual([ [ copy.pages[1] ], [ 'p1.speed+2' ] ]);
    });

    it('plans each page the change kept against the one it continues, wherever it now sits', () =>
    {
      // Arrange: the blueprint gains a page before its first, and its first, now its second, turns to autorun.
      const before = goblin();
      const added = page([], { trigger: 1 });
      const after = { ...before, pages: [ added, { ...before.pages[0], trigger: 3 } ] };
      const copy = copyOf(withPage(before, { moveSpeed: 5 }), [ 'p1.speed+2' ]);

      // Act.
      const { event: copied, link } = changedTo(planCopyChange({ before, after, pages: [ null, 0 ] }, copy, OPTIONS));

      // Assert.
      expect([ copied.pages, link.differences ])
        .toStrictEqual([ [ added, { ...copy.pages[0], trigger: 3 } ], [ 'p2.speed+2' ] ]);
    });

    it('refuses a change adding or taking pages away without saying how they pair, or saying it wrongly', () =>
    {
      // Arrange: a page added with nothing said; pairings too short, naming a page twice, and naming no page there is.
      const before = { ...goblin(), pages: [ goblin().pages[0], page([]) ] };
      const added = { ...before, pages: [ ...before.pages, page([]) ] };
      const copy = copyOf(before);
      const pairings: (readonly (number | null)[])[] = [ [ 0, 1 ], [ 0, 0, null ], [ 0, 2, null ], [ 0, -1, null ], [ 0, 0.5, null ] ];

      // Act.
      const unsaid = () => planCopyChange({ before, after: added }, copy, OPTIONS);
      const wrong = pairings.map(pages => () => planCopyChange({ before, after: added, pages }, copy, OPTIONS));

      // Assert.
      expect(unsaid)
        .toThrow('a change that adds pages or takes them away says which page before it each page after it continues');
      wrong.forEach(each => expect(each)
        .toThrow('do not pair 2 pages before a change with 3 after it'));
    });
  });

  describe('drift and mistakes', () =>
  {
    it('reports a copy whose note would read otherwise without its link as drifted, and changes nothing', () =>
    {
      // Arrange: a stray bracket before the link, which would open a tag of its own once the link is out.
      const before = goblin();
      const copy = { ...copyOf(before), note: 'z<<blueprint:[k3x9q2mf, 5]>w> <moveSpeed:6.0>' };

      // Act.
      const outcome = plan(before, withPage(before, { trigger: 3 }), copy);

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'drifted', reason: `in its note, ${OTHER_TAGS_MISREAD}` });
    });

    it('reports a copy as drifted when the note it would follow to cannot take its link, and changes nothing', () =>
    {
      // Arrange: the blueprint's note left with a tag never closed, which would swallow the link after it.
      const before = { ...goblin(), note: 'Goblin' };
      const after = { ...before, note: 'Goblin <tag: never closed' };

      // Act.
      const outcome = plan(before, after, copyOf(before));

      // Assert.
      expect(outcome)
        .toStrictEqual({ kind: 'drifted', reason: `in its note, ${LINK_MISREAD}` });
    });

    it('lets a module\'s own mistake through loudly rather than reporting the copy as drifted', () =>
    {
      // Arrange: a module reading two lines of a page under one key.
      const twice: CommentTagDefinition = {
        id: 'test.twice',
        read: read => read.list.slice(0, 2).map((_each, listIndex) => ({ listIndex, key: 'same', fields: [] })),
        write: words => words,
      };
      const before = goblin();
      const after = withPage(before, { trigger: 3 });

      // Act.
      const planned = () => planCopyChange({ before, after }, copyOf(before), { tags: [ twice ] });

      // Assert.
      expect(planned)
        .toThrow('test.twice read a tag line as same at 1, which another reads, or which names a field no link could hold');
    });

    it('refuses an event that is no copy, a copy of another event, and a change to two events', () =>
    {
      // Arrange.
      const before = goblin();
      const after = withPage(before, { trigger: 3 });
      const plain = { ...copyOf(before), note: '' };
      const otherEvent = { ...copyOf(before), note: '<blueprint:[k3x9q2mf, 6]>' };

      // Act.
      const plans = [
        () => plan(before, after, plain),
        () => plan(before, after, otherEvent),
        () => plan(before, { ...after, id: 6 }, copyOf(before)),
      ];

      // Assert.
      plans.forEach(each => expect(each)
        .toThrow('is no copy of the blueprint\'s event 5, or the change is to another'));
    });
  });

  describe('everything else', () =>
  {
    it('keeps the copy\'s id, where it stands, every key it holds and the order of every key', () =>
    {
      // Arrange: a copy carrying the metadata some versions of MZ write, its keys in an order of their own.
      const before = goblin();
      const { id, x, y, ...rest } = copyOf(before);
      const copy = { meta: {}, ...rest, y, x, id } as RmmzMapEvent;

      // Act.
      const { event: copied } = changedTo(plan(before, withPage(before, { moveSpeed: 5, trigger: 3 }), copy));

      // Assert: byte for byte what the copy was, but for the two fields.
      const expected = { ...copy, pages: [ { ...copy.pages[0], moveSpeed: 5, trigger: 3 } ] };
      expect(JSON.stringify(copied))
        .toBe(JSON.stringify(expected));
    });

    it('leaves the copy it was handed as it was', () =>
    {
      // Arrange.
      const before = goblin();
      const copy = copyOf(withPage(before, { moveSpeed: 5 }));
      const untouched = cloneJson(copy);

      // Act.
      plan(before, withAdded(withPage(before, { moveSpeed: 4, trigger: 3 }), text([ 'Grr!' ])), copy);

      // Assert.
      expect(copy)
        .toStrictEqual(untouched);
    });
  });
});
