import { describe, expect, it } from 'vitest';
import { eventFields, LINE_VALUE, type CommentTagDefinition, type Field } from '../../../../src/mapEditor/core/blueprints/blueprintFields.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { ANY_LEVEL, battlerTagFields, FROM_ZERO, TYPE_TOP } from '../../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { command, event, page } from '../../support/eventKindFixtures.ts';

/*
 * Every tag J-ABS reads off a battler's page, read as fields a copy of a blueprint follows one by one, so tuning one by
 * hand never stops a copy following the rest. Each is read as J-ABS's own pattern matches it, on a comment line J-Base
 * offers to plugins, in any case but the team's, with one space allowed after the colon; a line J-ABS would not read is no
 * line of its tag, and the field model reads it as one choice holding the whole line. Each line gives one value, keyed by
 * its tag (p1.sight), and by its place among the tag's lines where a page repeats it (p1.sight2), in one comment or many.
 *
 * Numbers are numbers with the range J-ABS allows. Every one it reads from a pattern writing no minus sign (sight,
 * pursuit, the alerted boosts, the alert's length, a guardian's range, the move speed) runs from 0, and, as J-ABS sets no
 * top, up to the largest whole number a number holds exactly; those J-ABS reads with parseInt count whole numbers, so a
 * sight written 3.5 is 3, while the move speed and the alerted pursuit boost keep their fractions. A battler's level,
 * which J-LevelMaster reads off a J-ABS battler, runs below 0 too, and is read only while J-LevelMaster is on. The enemy,
 * the team and the respawn animation are ids, and choices, as are the AI's traits and role, the battler's settings and its
 * respawn.
 *
 * A value goes back into a copy's own line in place: what comes before and after it kept to the character, a line already
 * reading as the value left as its author wrote it, and a number written to as many places as the line had, or as it
 * needs. A value the line could not hold as the game reads it is refused, in words for the author.
 */
describe('battlerFields', () =>
{
  /**
   * J-ABS's tags and the battler's level, as fields.
   */
  const TAGS = battlerTagFields(true);

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
   * Reads the fields of the tag lines on a battler's one page, each a comment of its own, by key.
   * @param {string[]} lines The page's comments.
   * @param {readonly CommentTagDefinition[]} tags The tags read.
   * @returns {[string, Field['kind'], JsonValue][]} Each tag field's key, kind and value, in order.
   */
  const fieldsOf = (lines: string[], tags: readonly CommentTagDefinition[] = TAGS): [ string, Field['kind'], JsonValue ][] =>
  {
    return eventFields(event(5, [ page(lines.map(comment)) ]), tags)
      .filter(field => /^p1\.(?!(?:speed|frequency|conditions|image|moveType|moveRoute|walking|stepping|directionFix|through|priority|trigger|commands)$)/u.test(field.key))
      .map(field => [ field.key, field.kind, field.value ]);
  };

  /**
   * Finds one of the tags by its name.
   * @param {string} name The tag, such as sight.
   * @returns {CommentTagDefinition} The tag, as fields.
   */
  const tagNamed = (name: string): CommentTagDefinition => TAGS.find(tag => tag.id === `jabs.${name}`) as CommentTagDefinition;

  /**
   * Reads the one value a line of one of the tags gives.
   * @param {string} name The tag.
   * @param {string} line The line.
   * @returns {JsonValue | undefined} The value, or undefined when the tag reads no line there.
   */
  const valueOf = (name: string, line: string): JsonValue | undefined => tagNamed(name).read(page([ comment(line) ]))[0]?.fields[0].value;

  /**
   * Writes a value into a line of one of the tags.
   * @param {string} name The tag.
   * @param {string} line The line.
   * @param {JsonValue} value The value.
   * @returns {string} The line written.
   */
  const write = (name: string, line: string, value: JsonValue): string => tagNamed(name).write(line, LINE_VALUE, value);

  /**
   * Each number tag, a line of it, and the least and the greatest value its range allows.
   */
  const NUMBERS: [ string, string, number, number ][] = [
    [ 'sight', '<sight:4>', 0, TYPE_TOP ],
    [ 'pursuit', '<pursuit:8>', 0, TYPE_TOP ],
    [ 'alertedSightBoost', '<alertedSightBoost:2>', 0, TYPE_TOP ],
    [ 'alertedPursuitBoost', '<alertedPursuitBoost:2.5>', 0, TYPE_TOP ],
    [ 'alertDuration', '<alertDuration:240>', 0, TYPE_TOP ],
    [ 'guardRange', '<guardRange:6>', 0, TYPE_TOP ],
    [ 'moveSpeed', '<moveSpeed:4.0>', 0, TYPE_TOP ],
    [ 'level', '<level:7>', -TYPE_TOP, TYPE_TOP ],
  ];

  describe('battlerTagFields', () =>
  {
    it('reads J-ABS\'s own tags, and the battler\'s level beside them only while J-LevelMaster is on', () =>
    {
      // Arrange: nothing beyond whether J-LevelMaster is on.

      // Act.
      const [ withLevels, withoutLevels ] = [ true, false ].map(levels => battlerTagFields(levels).map(tag => tag.id));

      // Assert.
      const own = [
        'jabs.enemyId',
        'jabs.teamId',
        'jabs.respawnAnimation',
        'jabs.aiTrait',
        'jabs.aiRole',
        'jabs.jabsConfig',
        'jabs.sight',
        'jabs.pursuit',
        'jabs.alertedSightBoost',
        'jabs.guardRange',
        'jabs.alertedPursuitBoost',
        'jabs.moveSpeed',
        'jabs.alertDuration',
        'jabs.respawn',
        'jabs.noRespawn',
      ];
      expect([ withLevels, withoutLevels ])
        .toStrictEqual([ [ ...own, 'jabs.level' ], own ]);
    });
  });

  describe('reading', () =>
  {
    it('reads each number as J-ABS reads it, keyed by its tag alone: whole numbers by parseInt, fractions by parseFloat', () =>
    {
      // Arrange: a sight and a guard range written with fractions J-ABS drops, and an alert written with a leading zero.
      const lines = [
        '<sight:3.5>',
        '<pursuit:8>',
        '<alertedSightBoost:2>',
        '<alertedPursuitBoost:2.5>',
        '<alertDuration:0240>',
        '<guardRange:6.9>',
        '<moveSpeed:3.75>',
      ];

      // Act.
      const fields = fieldsOf(lines);

      // Assert.
      expect(fields)
        .toStrictEqual([
          [ 'p1.sight', FROM_ZERO, 3 ],
          [ 'p1.pursuit', FROM_ZERO, 8 ],
          [ 'p1.alertedSightBoost', FROM_ZERO, 2 ],
          [ 'p1.alertedPursuitBoost', FROM_ZERO, 2.5 ],
          [ 'p1.alertDuration', FROM_ZERO, 240 ],
          [ 'p1.guardRange', FROM_ZERO, 6 ],
          [ 'p1.moveSpeed', FROM_ZERO, 3.75 ],
        ]);
    });

    it('reads each choice as J-ABS reads it: an id as its number, a word as J-ABS writes it, in any case and spacing', () =>
    {
      // Arrange: the enemy in capitals and spaced, the team, the respawn animation, a trait, a role and a setting
      // written otherwise than J-ABS writes them, two respawns spaced differently, and the mark that ends respawning.
      const lines = [
        '<ENEMYID: 12>',
        '<teamId:2>',
        '<respawnAnimation:120>',
        '<aiTrait:Careful>',
        '<aiRole: guardian>',
        '<jabsConfig:nohpBar>',
        '<respawn:[seconds, 90]>',
        '<respawn:[next-season,winter]>',
        '<noRespawn>',
      ];

      // Act.
      const fields = fieldsOf(lines);

      // Assert.
      const choice = { kind: 'choice' };
      expect(fields)
        .toStrictEqual([
          [ 'p1.enemyId', choice, 12 ],
          [ 'p1.teamId', choice, 2 ],
          [ 'p1.respawnAnimation', choice, 120 ],
          [ 'p1.aiTrait', choice, 'careful' ],
          [ 'p1.aiRole', choice, 'guardian' ],
          [ 'p1.jabsConfig', choice, 'noHpBar' ],
          [ 'p1.respawn', choice, [ 'seconds', 90 ] ],
          [ 'p1.respawn2', choice, [ 'next-season', 'winter' ] ],
          [ 'p1.noRespawn', choice, true ],
        ]);
    });

    it('reads each half of a respawn as J-Base\'s JsonMapper reads it: a number, true or false in any case, or a word', () =>
    {
      // Arrange: a wait written with a leading zero, a season in capitals, and halves that read as true and false.
      const lines = [ '<respawn:[seconds, 090]>', '<respawn:[next-season, Winter]>', '<respawn:[seconds, TRUE]>', '<respawn:[False,5]>' ];

      // Act.
      const values = lines.map(line => valueOf('respawn', line));

      // Assert.
      expect(values)
        .toStrictEqual([ [ 'seconds', 90 ], [ 'next-season', 'Winter' ], [ 'seconds', true ], [ false, 5 ] ]);
    });

    it('reads a battler\'s level under each of its three names, signed or not, while J-LevelMaster is on, and no level while it is off', () =>
    {
      // Arrange.
      const lines = [ '<lv:5>', '<lvl:-2>', '<LEVEL:+7>' ];

      // Act.
      const on = fieldsOf(lines);
      const off = fieldsOf(lines, battlerTagFields(false));

      // Assert: with J-LevelMaster off, each line is a choice holding itself.
      expect([ on, off.map(([ key, kind ]) => [ key, kind ]) ])
        .toStrictEqual([
          [ [ 'p1.level', ANY_LEVEL, 5 ], [ 'p1.level2', ANY_LEVEL, -2 ], [ 'p1.level3', ANY_LEVEL, 7 ] ],
          [ [ 'p1.<lv>', { kind: 'choice' } ], [ 'p1.<lvl>', { kind: 'choice' } ], [ 'p1.<LEVEL>', { kind: 'choice' } ] ],
        ]);
    });

    it('keys a tag a page repeats by its place among the tag\'s lines, in one comment or over several', () =>
    {
      // Arrange: two traits around the enemy, the enemy on the first trait's comment, the second trait a comment of its
      // own, and a page writing the same on one comment.
      const apart = page([ comment('<aiTrait:careful>'), later('<enemyId:3>'), comment('<aiTrait:healer>') ]);
      const together = page([ comment('<aiTrait:careful>'), later('<enemyId:3>'), later('<aiTrait:healer>') ]);

      // Act.
      const keys = [ apart, together ].map(each => eventFields(event(5, [ each ]), TAGS).slice(-3).map(field => [ field.key, field.value ]));

      // Assert.
      const expected = [ [ 'p1.aiTrait', 'careful' ], [ 'p1.enemyId', 3 ], [ 'p1.aiTrait2', 'healer' ] ];
      expect(keys)
        .toStrictEqual([ expected, expected ]);
    });

    it('leaves every line J-ABS would not read to the field model, as one choice holding the whole line', () =>
    {
      // Arrange: a leading zero, a sign, two spaces, a team in capitals its pattern refuses, a trait J-ABS does not know, a
      // level parseInt reads as no number, and a speed with nothing after its point.
      const lines = [ '<sight:03>', '<sight:-1>', '<sight:  3>', '<TeamId:2>', '<aiTrait:smart>', '<lvl:-+3>', '<moveSpeed:4.>' ];

      // Act.
      const fields = fieldsOf(lines);

      // Assert.
      expect(fields.map(([ key, kind, value ]) => [ key, kind.kind, value ]))
        .toStrictEqual([
          [ 'p1.<sight>', 'choice', '<sight:03>' ],
          [ 'p1.<sight>#2', 'choice', '<sight:-1>' ],
          [ 'p1.<sight>#3', 'choice', '<sight:  3>' ],
          [ 'p1.<TeamId>', 'choice', '<TeamId:2>' ],
          [ 'p1.<aiTrait>', 'choice', '<aiTrait:smart>' ],
          [ 'p1.<lvl>', 'choice', '<lvl:-+3>' ],
          [ 'p1.<moveSpeed>', 'choice', '<moveSpeed:4.>' ],
        ]);
    });
  });

  describe('ranges', () =>
  {
    it('holds every number J-ABS reads to 0 at the least, and a level below 0 too, each up to the top a number has', () =>
    {
      // Arrange: nothing beyond the ranges themselves.

      // Act.
      const ranges = [ FROM_ZERO, ANY_LEVEL ];

      // Assert: the top is the largest whole number a number holds exactly.
      expect([ ranges, TYPE_TOP ])
        .toStrictEqual([
          [ { kind: 'number', min: 0, max: 9007199254740991 }, { kind: 'number', min: -9007199254740991, max: 9007199254740991 } ],
          9007199254740991,
        ]);
    });

    it.each(NUMBERS)('writes the %s at both ends of its range, and reads each back as written', (name, line, least, most) =>
    {
      // Arrange: done by the table.

      // Act.
      const written = [ least, most ].map(value => write(name, line, value));

      // Assert.
      expect(written.map(each => valueOf(name, each)))
        .toStrictEqual([ least, most ]);
    });

    it('writes the ends of each range in the digits the game reads', () =>
    {
      // Arrange: a sight, a move speed written to a place, and a level.
      const lines: [ string, string, number ][] = [
        [ 'sight', '<sight:4>', 0 ],
        [ 'sight', '<sight:4>', TYPE_TOP ],
        [ 'moveSpeed', '<moveSpeed:4.0>', 0 ],
        [ 'moveSpeed', '<moveSpeed:4.0>', TYPE_TOP ],
        [ 'level', '<level:7>', -TYPE_TOP ],
      ];

      // Act.
      const written = lines.map(([ name, line, value ]) => write(name, line, value));

      // Assert.
      expect(written)
        .toStrictEqual([ '<sight:0>', '<sight:9007199254740991>', '<moveSpeed:0.0>', '<moveSpeed:9007199254740991.0>', '<level:-9007199254740991>' ]);
    });
  });

  describe('writing', () =>
  {
    it('writes a value in place, keeping what comes before and after it to the character', () =>
    {
      // Arrange: a sight in capitals and spaced, a role spaced, two respawns spaced and not, a level written with its
      // plus, and a team.
      const writes: [ string, string, JsonValue ][] = [
        [ 'sight', '<SIGHT: 3>', 5 ],
        [ 'aiRole', '<aiRole: guardian>', 'ward' ],
        [ 'respawn', '<respawn:[seconds, 90]>', [ 'next-time-of-day', 'morning' ] ],
        [ 'respawn', '<respawn:[seconds,90]>', [ 'game-minutes', 5 ] ],
        [ 'level', '<lvl:+5>', 6 ],
        [ 'teamId', '<teamId: 1>', 2 ],
      ];

      // Act.
      const written = writes.map(([ name, line, value ]) => write(name, line, value));

      // Assert.
      expect(written)
        .toStrictEqual([
          '<SIGHT: 5>',
          '<aiRole: ward>',
          '<respawn:[next-time-of-day, morning]>',
          '<respawn:[game-minutes,5]>',
          '<lvl:6>',
          '<teamId: 2>',
        ]);
    });

    it('writes a number to as many places as the line wrote, or as the number needs, whichever is more', () =>
    {
      // Arrange: a speed written to a place, taking a whole number and two places; a whole speed taking a half; a sight
      // written to a place, which J-ABS reads whole.
      const writes: [ string, string, number ][] = [
        [ 'moveSpeed', '<moveSpeed:4.0>', 5 ],
        [ 'moveSpeed', '<moveSpeed:4.0>', 4.25 ],
        [ 'moveSpeed', '<moveSpeed:4>', 4.5 ],
        [ 'sight', '<sight:3.0>', 4 ],
      ];

      // Act.
      const written = writes.map(([ name, line, value ]) => write(name, line, value));

      // Assert.
      expect(written)
        .toStrictEqual([ '<moveSpeed:5.0>', '<moveSpeed:4.25>', '<moveSpeed:4.5>', '<sight:4.0>' ]);
    });

    it('leaves a line already reading as the value exactly as its author wrote it', () =>
    {
      // Arrange: a speed written to a place, a sight whose fraction J-ABS drops, a trait in capitals, the mark that ends
      // respawning, and a respawn written without its space.
      const writes: [ string, string, JsonValue ][] = [
        [ 'moveSpeed', '<moveSpeed:4.0>', 4 ],
        [ 'sight', '<sight:3.5>', 3 ],
        [ 'aiTrait', '<aiTrait:CAREFUL>', 'careful' ],
        [ 'noRespawn', '<noRespawn>', true ],
        [ 'respawn', '<respawn:[seconds,090]>', [ 'seconds', 90 ] ],
      ];

      // Act.
      const written = writes.map(([ name, line, value ]) => write(name, line, value));

      // Assert.
      expect(written)
        .toStrictEqual(writes.map(([ , line ]) => line));
    });

    it('refuses a value the line could not hold as the game reads it, saying why for the author', () =>
    {
      // Arrange: a fraction where J-ABS reads whole numbers, a number below 0 where no sign can be written, words where a
      // number goes, a trait J-ABS does not know, an enemy that is no id, the end of respawning taken back, a respawn of one
      // half and one of no halves at all, and a fractional level.
      const writes: [ string, string, JsonValue ][] = [
        [ 'sight', '<sight:4>', 4.5 ],
        [ 'sight', '<sight:4>', -1 ],
        [ 'moveSpeed', '<moveSpeed:4.0>', 'fast' ],
        [ 'aiTrait', '<aiTrait:careful>', 'smart' ],
        [ 'enemyId', '<enemyId:12>', 12.5 ],
        [ 'noRespawn', '<noRespawn>', false ],
        [ 'respawn', '<respawn:[seconds, 90]>', [ 'seconds' ] ],
        [ 'respawn', '<respawn:[seconds, 90]>', 'seconds' ],
        [ 'level', '<level:7>', 2.5 ],
      ];

      // Act.
      const refusals = writes.map(([ name, line, value ]) => () => write(name, line, value));

      // Assert.
      const words = [ 'sight', 'sight', 'battler move speed', 'AI trait', 'enemy', 'no respawn mark', 'respawn', 'respawn', 'level' ];
      refusals.forEach((refusal, index) => expect(refusal)
        .toThrow(`its ${words[index]} cannot be ${JSON.stringify(writes[index][2])} as the game reads it`));
    });

    it('refuses a line of another tag, and a field a battler\'s line has not', () =>
    {
      // Arrange: a pursuit handed to the sight's writer, and a sight asked for a light's reach.
      const sight = tagNamed('sight');

      // Act.
      const writes = [
        () => sight.write('<pursuit:4>', LINE_VALUE, 5),
        () => sight.write('<sight:4>', 'radius', 5),
      ];

      // Assert: each is a mistake, never the copy's own.
      writes.forEach(each => expect(each)
        .toThrow('a battler\'s sight line gives one value'));
    });
  });

  describe('words', () =>
  {
    it('names each line by what its tag is to an author, and a later line of the tag by which line it is', () =>
    {
      // Arrange: a page's first sight, its third, its move speed, its AI trait and its level.
      const named: [ string, string ][] = [ [ 'sight', 'sight' ], [ 'sight', 'sight3' ], [ 'moveSpeed', 'moveSpeed' ], [ 'aiTrait', 'aiTrait' ], [ 'level', 'level2' ] ];

      // Act.
      const words = named.map(([ name, line ]) => tagNamed(name).words?.(line, LINE_VALUE));

      // Assert: the move speed is the battler's, never to be taken for the page's movement speed.
      expect(words)
        .toStrictEqual([ 'sight', 'sight (line 3)', 'battler move speed', 'AI trait', 'level (line 2)' ]);
    });
  });
});
