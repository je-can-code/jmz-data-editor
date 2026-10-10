import { describe, expect, it } from 'vitest';
import { readBattlerPage, type BattlerReading, type BattlerValue, type JabsDefaults } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import {
  alertWords,
  hiddenRow,
  moveSpeedRow,
  numberRow,
  rolesRow,
  setWords,
  teamRow,
  teamWords,
  traitsRow,
} from '../../../../src/mapEditor/modules/jabs/battlerRows.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * Each row of the battler panel says which value the picked battlers fight with and where it comes from (this battler's
 * page, its enemy, J-ABS's default, the page's own speed, or being inanimate), whether the page sets it, which is when it
 * can be taken out, and, for a value the page sets, what taking it out would leave: the enemy's value, or the default
 * where the enemy sets none. With several battlers picked, a row they hold differently says so rather than showing one of
 * them. The roles row also says when the enemy's note names roles, since those never reach a battler on the map.
 */
describe('battlerRows', () =>
{
  /**
   * J-ABS's defaults as Chef Adventure sets them.
   */
  const DEFAULTS: JabsDefaults = {
    sight: 4,
    pursuit: 6,
    alertedSightBoost: 2,
    alertedPursuitBoost: 4,
    alertDuration: 300,
    canIdle: true,
    showHpBar: true,
    showName: true,
    inanimate: false,
  };

  /**
   * Reads a battler page of the given comment lines, its enemy 5 carrying the given note.
   * @param {string[]} lines The page's comment lines, after the enemy.
   * @param {string} note The enemy's note.
   * @param {number} moveSpeed The page's own speed.
   * @returns {BattlerReading} The reading.
   */
  const battler = (lines: string[], note = '', moveSpeed = 3): BattlerReading =>
  {
    const shown = page([ '<enemyId:5>', ...lines ].map(text => command(108, [ text ])), { moveSpeed });
    return readBattlerPage(shown, () => ({ id: 5, name: 'Slime', note }), DEFAULTS) as BattlerReading;
  };

  describe('numberRow', () =>
  {
    it('marks a value the page sets as this battler\'s, saying what the enemy would give in its place', () =>
    {
      // Arrange.
      const readings = [ battler([ '<sight:6>' ], '<sight:3>') ];

      // Act.
      const row = numberRow(readings.map(reading => reading.sight), DEFAULTS.sight);

      // Assert.
      expect(row)
        .toStrictEqual({ value: 6, mixed: false, from: 'event', set: true, note: 'Enemy: 3' });
    });

    it('says the default would apply where the enemy sets none, and says nothing for a value the page leaves alone', () =>
    {
      // Arrange.
      const set = [ battler([ '<sight:6>' ]) ];
      const unset = [ battler([], '<sight:3>') ];

      // Act.
      const rows = [ numberRow(set.map(reading => reading.sight), DEFAULTS.sight), numberRow(unset.map(reading => reading.sight), DEFAULTS.sight) ];

      // Assert.
      expect(rows)
        .toStrictEqual([
          { value: 6, mixed: false, from: 'event', set: true, note: 'Default: 4' },
          { value: 3, mixed: false, from: 'enemy', set: false, note: null },
        ]);
    });

    it('shows no value for battlers holding it differently, and no line where they would be left differently', () =>
    {
      // Arrange: both set their own, one over an enemy of sight 3 and one over none.
      const readings = [ battler([ '<sight:6>' ], '<sight:3>'), battler([ '<sight:6>' ]), battler([ '<sight:7>' ]) ];

      // Act.
      const rows = [
        numberRow(readings.slice(0, 2).map(reading => reading.sight), DEFAULTS.sight),
        numberRow(readings.slice(1).map(reading => reading.sight), DEFAULTS.sight),
      ];

      // Assert: the first two agree on 6 but would fall back differently; the last two differ.
      expect(rows)
        .toStrictEqual([
          { value: 6, mixed: false, from: 'event', set: true, note: null },
          { value: null, mixed: true, from: 'event', set: true, note: 'Default: 4' },
        ]);
    });

    it('marks the source mixed where some battlers set the value and some leave it to the enemy', () =>
    {
      // Arrange.
      const readings = [ battler([ '<sight:3>' ], '<sight:3>'), battler([], '<sight:3>') ];

      // Act.
      const row = numberRow(readings.map(reading => reading.sight), DEFAULTS.sight);

      // Assert.
      expect(row)
        .toStrictEqual({ value: 3, mixed: false, from: 'mixed', set: true, note: null });
    });

    it('words a value with the words given, such as an alert time in frames and seconds', () =>
    {
      // Arrange.
      const readings = [ battler([ '<alertDuration:600>' ], '<alertDuration:90>') ];

      // Act.
      const row = numberRow(readings.map(reading => reading.alertDuration), DEFAULTS.alertDuration, alertWords);

      // Assert.
      expect(row.note)
        .toBe('Enemy: 90 frames (1.5s)');
    });
  });

  describe('moveSpeedRow', () =>
  {
    it('says the page\'s own speed is what taking the tag out leaves, and nothing for a page without one', () =>
    {
      // Arrange.
      const tagged = [ battler([ '<moveSpeed:4.1>' ], '', 3) ];
      const untagged = [ battler([], '', 4) ];

      // Act.
      const rows = [ moveSpeedRow(tagged, [ 3 ]), moveSpeedRow(untagged, [ 4 ]) ];

      // Assert.
      expect(rows)
        .toStrictEqual([
          { value: 4.1, mixed: false, from: 'event', set: true, note: 'Page speed: 3' },
          { value: 4, mixed: false, from: 'page', set: false, note: null },
        ]);
    });
  });

  describe('hiddenRow', () =>
  {
    it('marks a value hidden by being inanimate, and one an enemy inanimate in its note hides under an animate page', () =>
    {
      // Arrange: an inanimate battler; an animate page over an inanimate enemy; and a page refusing to idle over an
      // ordinary one.
      const inanimate = battler([ '<jabsConfig:inanimate>' ]);
      const animate = battler([ '<jabsConfig:notInanimate>', '<jabsConfig:canIdle>' ], '<jabsConfig:inanimate>');
      const still = battler([ '<jabsConfig:noIdle>' ]);

      // Act.
      const rows = [
        hiddenRow([ inanimate.hpBar ], DEFAULTS.showHpBar, [ false ]),
        hiddenRow([ animate.hpBar ], DEFAULTS.showHpBar, [ true ]),
        hiddenRow([ animate.idle ], DEFAULTS.canIdle, [ true ]),
        hiddenRow([ still.idle ], DEFAULTS.canIdle, [ false ]),
      ];

      // Assert: the idling the page asks for would, taken out, fall back to the inanimate enemy's off, and the idling
      // the other page refuses to the default's on.
      expect(rows)
        .toStrictEqual([
          { value: false, mixed: false, from: 'inanimate', set: false, note: null },
          { value: false, mixed: false, from: 'enemy', set: false, note: null },
          { value: true, mixed: false, from: 'event', set: true, note: 'Enemy: off' },
          { value: false, mixed: false, from: 'event', set: true, note: 'Default: on' },
        ]);
    });
  });

  describe('traitsRow', () =>
  {
    it('says a page\'s traits replace the enemy\'s, naming the enemy\'s, and says nothing while the enemy\'s apply', () =>
    {
      // Arrange.
      const own = [ battler([ '<aiTrait:careful>' ], '<aiTrait:healer>\n<aiTrait:buffer>') ];
      const enemy = [ battler([], '<aiTrait:healer>') ];

      // Act.
      const rows = [ traitsRow(own), traitsRow(enemy) ];

      // Assert.
      expect(rows)
        .toStrictEqual([
          { value: [ 'careful' ], mixed: false, from: 'event', set: true, note: 'Replaces the enemy\'s: Healer, Buffer' },
          { value: [ 'healer' ], mixed: false, from: 'enemy', set: false, note: null },
        ]);
    });
  });

  describe('rolesRow', () =>
  {
    it('says the enemy\'s roles never reach its battlers while the page names none, and nothing once it names one', () =>
    {
      // Arrange.
      const unset = [ battler([], '<aiRole:guardian>') ];
      const set = [ battler([ '<aiRole:ward>' ], '<aiRole:guardian>') ];
      const neither = [ battler([]) ];

      // Act.
      const rows = [ rolesRow(unset), rolesRow(set), rolesRow(neither) ];

      // Assert.
      expect(rows)
        .toStrictEqual([
          { value: [], mixed: false, from: 'default', set: false, note: 'The enemy\'s Guardian never reaches its battlers on the map; set roles here.' },
          { value: [ 'ward' ], mixed: false, from: 'event', set: true, note: null },
          { value: [], mixed: false, from: 'default', set: false, note: null },
        ]);
    });
  });

  describe('teamRow', () =>
  {
    it('says an inanimate battler is always neutral, and falls back to the enemy\'s team for a page setting its own', () =>
    {
      // Arrange.
      const inanimate = [ battler([ '<jabsConfig:inanimate>', '<teamId:0>' ]) ];
      const own = [ battler([ '<teamId:0>' ], '<teamId:3>') ];

      // Act.
      const rows = [ teamRow(inanimate), teamRow(own) ];

      // Assert.
      expect(rows)
        .toStrictEqual([
          { value: 2, mixed: false, from: 'inanimate', set: true, note: 'Always neutral while inanimate.' },
          { value: 0, mixed: false, from: 'event', set: true, note: 'Enemy: Team 3' },
        ]);
    });
  });

  describe('words', () =>
  {
    it('names teams J-ABS knows by name and any other by number, and sets with capitals or as none', () =>
    {
      // Arrange.
      const teams = [ 0, 1, 2, 7 ];

      // Act.
      const words = [ ...teams.map(teamWords), setWords([ 'careful', 'healer' ]), setWords([]) ];

      // Assert.
      expect(words)
        .toStrictEqual([ 'Allies', 'Enemies', 'Neutral', 'Team 7', 'Careful, Healer', 'none' ]);
    });
  });

  it('reads an empty pick as nothing at all', () =>
  {
    // Arrange: no battler picked.
    const none: BattlerValue<number>[] = [];

    // Act.
    const row = numberRow(none, DEFAULTS.sight);

    // Assert.
    expect(row)
      .toStrictEqual({ value: null, mixed: false, from: 'mixed', set: false, note: null });
  });
});
