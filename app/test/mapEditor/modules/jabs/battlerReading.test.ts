import { describe, expect, it } from 'vitest';
import type { RmmzEventCommand } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { jabsDefaultsOf, pageEnemyId, readBattlerPage, type BattlerReading, type EnemyRecord, type JabsDefaults } from '../../../../src/mapEditor/modules/jabs/battlerReading.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, page } from '../../support/eventKindFixtures.ts';

/*
 * The battler panel shows every value a J-ABS battler fights with as the game builds it, so an author never reads one
 * thing in the editor and meets another in the game. That reading follows J-ABS's Game_Event#parseEnemyComments and the
 * Game_Enemy readers it falls back to, value by value:
 *
 * - the page wins: its last line of a tag counts, read as J-ABS reads it there (most numbers with parseInt);
 * - otherwise the enemy's database note, read as RPGManager reads a note (the last line holding the tag anywhere, numbers
 *   with parseFloat);
 * - otherwise J-ABS's Default Enemy parameter;
 * - the AI traits a page names replace the enemy's whole set; the AI roles are the page's alone, since J-ABS asks the
 *   Game_Enemy for the enemy's roles, which only the database row keeps, so a page naming none leaves none;
 * - inanimate forces the neutral team and hides the HP bar, the name and idling, unless the page says otherwise for one
 *   of them; an enemy inanimate in its note hides them even when the page makes the battler animate;
 * - the page's passives add to the enemy's (the last passive line of its note); its level replaces the enemy's; its move
 *   speed tag replaces the page's own speed.
 *
 * Only comment lines that are one whole tag count, as J-Base offers no other to a plugin. Every rule is held against a near
 * miss: a value set one way and read the other, a line that looks like a tag but is not one.
 */
describe('battlerReading', () =>
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
   * One comment line.
   * @param {string} text The line.
   * @param {number} code 108 for a comment's first line, 408 for a later one.
   * @returns {RmmzEventCommand} The command.
   */
  const line = (text: string, code = 108): RmmzEventCommand => command(code, [ text ]);

  /**
   * Reads a battler page of the given comment lines, its enemy carrying the given note.
   * @param {string[]} lines The page's comment lines.
   * @param {string} note The note of enemy 5, which the page names unless it names another.
   * @param {Partial<JabsDefaults>} defaults Defaults to change.
   * @returns {BattlerReading} The reading.
   */
  const read = (lines: string[], note = '', defaults: Partial<JabsDefaults> = {}): BattlerReading =>
  {
    const enemies: Record<number, EnemyRecord> = { 5: { id: 5, name: 'Slime', note } };
    return readBattlerPage(page(lines.map(text => line(text))), enemyId => enemies[enemyId] ?? null, { ...DEFAULTS, ...defaults }) as BattlerReading;
  };

  describe('jabsDefaultsOf', () =>
  {
    it('reads J-ABS\'s Default Enemy parameters as J-ABS does, numbers with Number and switches true only when written true', () =>
    {
      // Arrange.
      const plugin: PluginsJsEntry = {
        name: 'j/abs/J-ABS',
        status: true,
        description: '',
        parameters: {
          defaultEnemySightRange: '5',
          defaultEnemyPursuitRange: '9',
          defaultEnemyAlertedSightBoost: '1',
          defaultEnemyAlertedPursuitBoost: '2.5',
          defaultEnemyAlertDuration: '120',
          defaultEnemyCanIdle: 'false',
          defaultEnemyShowHpBar: 'TRUE',
          defaultEnemyShowBattlerName: 'true',
          defaultEnemyIsInanimate: 'true',
        },
      };

      // Act.
      const defaults = jabsDefaultsOf(plugin);

      // Assert: TRUE in capitals is not true to J-ABS.
      expect(defaults)
        .toStrictEqual({ sight: 5, pursuit: 9, alertedSightBoost: 1, alertedPursuitBoost: 2.5, alertDuration: 120, canIdle: false, showHpBar: false, showName: true, inanimate: true });
    });

    it('falls back to the plugin header\'s defaults for parameters js/plugins.js does not hold, and for no J-ABS at all', () =>
    {
      // Arrange: one parameter set, the rest missing.
      const plugin: PluginsJsEntry = { name: 'j/abs/J-ABS', status: true, description: '', parameters: { defaultEnemySightRange: '7' } };

      // Act.
      const partial = jabsDefaultsOf(plugin);
      const none = jabsDefaultsOf(undefined);

      // Assert.
      expect([ partial, none ])
        .toStrictEqual([
          { ...DEFAULTS, sight: 7 },
          DEFAULTS,
        ]);
    });
  });

  describe('pageEnemyId', () =>
  {
    it('reads the enemy of the last enemy line J-Base offers, and none from a line that is not one whole tag', () =>
    {
      // Arrange: two enemy lines, the second winning; a page whose only enemy line carries words after the tag; one in a
      // Show Text; one in any case with the one space allowed.
      const pages = [
        page([ line('<enemyId:5>'), line('<enemyId:7>', 408) ]),
        page([ line('<enemyId:5> the slime') ]),
        page([ command(401, [ '<enemyId:5>' ]) ]),
        page([ line('<ENEMYID: 12>') ]),
        page([ line('<enemyId:  12>') ]),
      ];

      // Act.
      const enemies = pages.map(pageEnemyId);

      // Assert: two spaces is no tag J-ABS reads.
      expect(enemies)
        .toStrictEqual([ 7, null, null, 12, null ]);
    });
  });

  describe('readBattlerPage', () =>
  {
    it('reads no battler from a page naming no enemy', () =>
    {
      // Arrange.
      const plain = page([ line('<sight:5>') ]);

      // Act.
      const reading = readBattlerPage(plain, () => null, DEFAULTS);

      // Assert.
      expect(reading)
        .toBeNull();
    });

    it('takes the page\'s value over the enemy\'s, value by value, and the enemy\'s over the default', () =>
    {
      // Arrange: the page sets sight; the enemy sets sight and pursuit; nobody sets the alert values.
      const lines = [ '<enemyId:5>', '<sight:7>' ];

      // Act.
      const { sight, pursuit, alertDuration } = read(lines, '<sight:3>\n<pursuit:9>');

      // Assert.
      expect([ sight, pursuit, alertDuration ])
        .toStrictEqual([
          { event: 7, enemy: 3, value: 7, from: 'event' },
          { event: null, enemy: 9, value: 9, from: 'enemy' },
          { event: null, enemy: null, value: 300, from: 'default' },
        ]);
    });

    it('reads the page\'s whole numbers with parseInt and the note\'s with parseFloat, as J-ABS reads each', () =>
    {
      // Arrange: a sight with a fraction on the page and on the note, and an alerted pursuit, read whole by neither.
      const lines = [ '<enemyId:5>', '<sight:3.5>', '<alertedPursuitBoost:2.5>' ];

      // Act.
      const page1 = read(lines);
      const note = read([ '<enemyId:5>' ], '<sight:4.5>');

      // Assert.
      expect([ page1.sight.value, page1.alertedPursuitBoost.value, note.sight.value ])
        .toStrictEqual([ 3, 2.5, 4.5 ]);
    });

    it('lets the page\'s last line of a tag win, and a note\'s last line', () =>
    {
      // Arrange.
      const reading = read([ '<enemyId:5>', '<pursuit:2>', '<pursuit:8>' ], '<pursuit:1>\n<pursuit:11>');

      // Act.
      const { pursuit } = reading;

      // Assert.
      expect(pursuit)
        .toStrictEqual({ event: 8, enemy: 11, value: 8, from: 'event' });
    });

    it('reads a note\'s tag anywhere on its line, but a page\'s only from a line that is one whole tag', () =>
    {
      // Arrange: words after the tag on the page and on the note.
      const reading = read([ '<enemyId:5>', '<sight:9> for the cave' ], 'sees far: <sight:8> tiles');

      // Act.
      const { sight } = reading;

      // Assert.
      expect(sight)
        .toStrictEqual({ event: null, enemy: 8, value: 8, from: 'enemy' });
    });

    it('replaces the enemy\'s AI traits whole with the page\'s, and keeps them while the page names none', () =>
    {
      // Arrange: the page names one trait; another page names only the older leader role, which is no trait.
      const named = read([ '<enemyId:5>', '<aiTrait:careful>' ], '<aiTrait:healer>\n<aiTrait:buffer>');
      const roleOnly = read([ '<enemyId:5>', '<aiTrait:leader>' ], '<aiTrait:healer>\n<aiTrait:buffer>');

      // Act.
      const traits = [ named.aiTraits, roleOnly.aiTraits ];

      // Assert.
      expect(traits)
        .toStrictEqual([
          { event: [ 'careful' ], enemy: [ 'healer', 'buffer' ], value: [ 'careful' ], from: 'event' },
          { event: null, enemy: [ 'healer', 'buffer' ], value: [ 'healer', 'buffer' ], from: 'enemy' },
        ]);
    });

    it('takes the page\'s AI roles, the older leader and follower traits among them, and none at all while it names none', () =>
    {
      // Arrange: the page names a role both ways; another names none while the enemy's note names two.
      const named = read([ '<enemyId:5>', '<aiRole:guardian>', '<aiTrait:follower>' ], '<aiRole:solo>');
      const unnamed = read([ '<enemyId:5>' ], '<aiRole:solo>\n<aiTrait:leader>');

      // Act.
      const roles = [ named.aiRoles, unnamed.aiRoles ];

      // Assert: the enemy's roles are read, and never handed on.
      expect(roles)
        .toStrictEqual([
          { event: [ 'follower', 'guardian' ], enemy: [ 'solo' ], value: [ 'follower', 'guardian' ], from: 'event' },
          { event: null, enemy: [ 'leader', 'solo' ], value: [], from: 'default' },
        ]);
    });

    it('makes an inanimate battler neutral, hiding its HP bar, name and idling, but for what its page says of them', () =>
    {
      // Arrange: inanimate on the page, which also asks for its HP bar, on an enemy of team 3.
      const reading = read([ '<enemyId:5>', '<jabsConfig:inanimate>', '<jabsConfig:showHpBar>' ], '<teamId:3>');

      // Act.
      const { inanimate, team, idle, hpBar, name } = reading;

      // Assert.
      expect([ inanimate.value, team, idle.from, idle.value, hpBar.from, hpBar.value, name.value ])
        .toStrictEqual([ true, { event: null, enemy: 3, value: 2, from: 'inanimate' }, 'inanimate', false, 'event', true, false ]);
    });

    it('keeps an enemy inanimate in its note from idling or showing its HP bar and name, even under a page making it animate', () =>
    {
      // Arrange: the note says inanimate; the page says not.
      const reading = read([ '<enemyId:5>', '<jabsConfig:notInanimate>' ], '<jabsConfig:inanimate>');

      // Act.
      const { inanimate, team, idle, hpBar } = reading;

      // Assert: animate and on the enemies' team, but still without idling or an HP bar, as the enemy's readers say.
      expect([ inanimate.value, team.value, idle.value, idle.from, hpBar.value ])
        .toStrictEqual([ false, 1, false, 'enemy', false ]);
    });

    it('lets a note\'s on-word beat its off-word, wherever each sits, and a page\'s later line beat its earlier', () =>
    {
      // Arrange: the note names both; the page names both, the off-word last.
      const reading = read([ '<enemyId:5>', '<jabsConfig:canIdle>', '<jabsConfig:noIdle>' ], '<jabsConfig:showName>\n<jabsConfig:noName>');

      // Act.
      const { idle, name } = reading;

      // Assert.
      expect([ idle.event, name.enemy, name.value ])
        .toStrictEqual([ false, true, true ]);
    });

    it('reads a team written only as J-ABS writes it, and takes a note\'s team of 0 as none, as J-ABS does', () =>
    {
      // Arrange: a page team in capitals, which J-ABS's pattern does not read, and a note team of 0.
      const shouted = read([ '<enemyId:5>', '<TEAMID:3>' ]);
      const zero = read([ '<enemyId:5>' ], '<teamId:0>');
      const allies = read([ '<enemyId:5>', '<teamId:0>' ]);

      // Act.
      const teams = [ shouted.team, zero.team, allies.team ];

      // Assert: only the page's 0 holds.
      expect(teams)
        .toStrictEqual([
          { event: null, enemy: null, value: 1, from: 'default' },
          { event: null, enemy: null, value: 1, from: 'default' },
          { event: 0, enemy: null, value: 0, from: 'event' },
        ]);
    });

    it('adds the page\'s passives, every line of them, to the last passive line of the enemy\'s note', () =>
    {
      // Arrange.
      const reading = read([ '<enemyId:5>', '<passive:[371]>', '<passive:[ 12, 13]>' ], '<passive:[1]>\n<passive:[2, 3]>');

      // Act.
      const { passives } = reading;

      // Assert.
      expect(passives)
        .toStrictEqual({ event: [ 371, 12, 13 ], enemy: [ 2, 3 ], value: [ 2, 3, 371, 12, 13 ] });
    });

    it('takes the page\'s level over the enemy\'s in any of its three spellings, and no level from one parseInt cannot read', () =>
    {
      // Arrange.
      const spelled = [ '<level:30>', '<lv:31>', '<LVL:32>', '<level:-+5>' ].map(tag => read([ '<enemyId:5>', tag ], '<level:6>').level);

      // Act.
      const levels = spelled.map(level => [ level.value, level.from ]);

      // Assert.
      expect(levels)
        .toStrictEqual([ [ 30, 'event' ], [ 31, 'event' ], [ 32, 'event' ], [ 6, 'enemy' ] ]);
    });

    it('takes the move speed tag over the page\'s own speed, which the database never sets', () =>
    {
      // Arrange: a page of speed 4, with and without a tag; the note sets a speed J-ABS never reads there.
      const tagged = readBattlerPage(page([ line('<enemyId:5>'), line('<moveSpeed:3.7>') ], { moveSpeed: 4 }), () => ({ id: 5, name: 'Slime', note: '<moveSpeed:6>' }), DEFAULTS);
      const plain = readBattlerPage(page([ line('<enemyId:5>') ], { moveSpeed: 4 }), () => ({ id: 5, name: 'Slime', note: '<moveSpeed:6>' }), DEFAULTS);

      // Act.
      const speeds = [ tagged?.moveSpeed, plain?.moveSpeed ];

      // Assert.
      expect(speeds)
        .toStrictEqual([
          { event: 3.7, enemy: null, value: 3.7, from: 'event' },
          { event: null, enemy: null, value: 4, from: 'page' },
        ]);
    });

    it('reads a battler whose enemy the database lacks, with every value from the page or the defaults', () =>
    {
      // Arrange.
      const reading = readBattlerPage(page([ line('<enemyId:99>'), line('<sight:2>') ]), () => null, DEFAULTS) as BattlerReading;

      // Act.
      const { enemy, sight, pursuit } = reading;

      // Assert.
      expect([ reading.enemyId, enemy, sight.value, pursuit ])
        .toStrictEqual([ 99, null, 2, { event: null, enemy: null, value: 6, from: 'default' } ]);
    });
  });
});
