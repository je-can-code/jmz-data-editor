import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import { battlerTagFields } from '../../../../src/mapEditor/modules/jabs/battlerFields.ts';
import { actionMapIdOf, isBattler, jabsModule, MAP_BATTLERS_ID } from '../../../../src/mapEditor/modules/jabs/jabsModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, hubWith, page, text, transferPage } from '../../support/eventKindFixtures.ts';

/*
 * J-ABS copies an action's event off its action map each time the action spawns, so the events there are its
 * patterns, never things placed on a map: while J-ABS is enabled, its module names that map as holding its action
 * templates, the words the author is told, and no kind claims an event on it. Which map that is comes from J-ABS's
 * Action Map Id parameter, kept as text like every RMMZ parameter;
 * a value that is not a map id names no map, so nothing is taken from any map by mistake.
 *
 * A battler is an event with a page whose comments carry J-ABS's enemy tag, read as J-ABS reads it: on any page, any
 * case, with one space allowed after the colon; the same words anywhere but a comment, or a tag J-ABS would not read,
 * make no battler. A battler outranks every core kind, so a door that also fights is a battler, and its marker shows
 * the battler's symbol.
 *
 * While J-ABS is enabled, every tag it reads off a battler's page is a field a blueprint's copies follow on its own, and
 * the battler's level is one too while J-LevelMaster, which reads it, is enabled beside it. Beside J-LevelMaster too, Map
 * Properties gains J-ABS's section holding the level a map's new battlers start at, which no map's file holds.
 */
describe('jabsModule', () =>
{
  /**
   * J-ABS as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @param {Record<string, string>} parameters Its parameters.
   * @returns {PluginsJsEntry} The entry.
   */
  const jabs = (status: boolean, parameters: Record<string, string>): PluginsJsEntry => ({ name: 'j/abs/J-ABS', status, description: '', parameters });

  /**
   * A window's registry with the core's kinds, and J-ABS's module activated over the given plugin and any others.
   * @param {PluginsJsEntry} plugin J-ABS.
   * @param {PluginsJsEntry[]} others The project's other plugins.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryWith = (plugin: PluginsJsEntry, others: PluginsJsEntry[] = []): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    registry.activate([ jabsModule ], [ plugin, ...others ]);
    return registry;
  };

  /**
   * J-LevelMaster as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const levelMaster = (status: boolean): PluginsJsEntry => ({ name: 'j/level/J-LevelMaster', status, description: '', parameters: {} });

  describe('actionMapIdOf', () =>
  {
    it('reads the action map from its parameter, and no map from a value that is not a map id', () =>
    {
      // Arrange.
      const values: Record<string, string>[] = [ { actionMapId: '2' }, { actionMapId: '115' }, { actionMapId: '' }, { actionMapId: '0' }, { actionMapId: '2.5' }, { actionMapId: 'two' }, {} ];

      // Act.
      const mapIds = values.map(parameters => actionMapIdOf(jabs(true, parameters)));

      // Assert.
      expect(mapIds)
        .toStrictEqual([ 2, 115, null, null, null, null, null ]);
    });
  });

  describe('jabsModule', () =>
  {
    it('leaves every event on the action map unclaimed while J-ABS is enabled, and claims the same event elsewhere', () =>
    {
      // Arrange: a sword swing's pattern, which runs nothing and so reads as decor anywhere else.
      const swing = event(32, [ page([]) ]);

      // Act.
      const enabled = registryWith(jabs(true, { actionMapId: '2' }));
      const disabled = registryWith(jabs(false, { actionMapId: '2' }));

      // Assert.
      expect([ enabled.isActive('jabs'), enabled.kindOf(swing, 2), enabled.kindOf(swing, 3)?.id, disabled.kindOf(swing, 2)?.id ])
        .toStrictEqual([ true, null, 'core.decor', 'core.decor' ]);
    });

    it('says the action map holds J-ABS\'s action templates, in the words an author is told', () =>
    {
      // Arrange: nothing beyond J-ABS enabled with its action map on map 2.

      // Act.
      const registry = registryWith(jabs(true, { actionMapId: '2' }));

      // Assert.
      expect([ registry.templateMapOf(2), registry.templateMapOf(3) ])
        .toStrictEqual([ { owner: 'J-ABS', holds: 'action templates' }, null ]);
    });

    it('takes no map from an action map parameter that names none', () =>
    {
      // Arrange.
      const swing = event(32, [ page([]) ]);

      // Act.
      const registry = registryWith(jabs(true, { actionMapId: '0' }));

      // Assert: the module is on, and every map still claims the event.
      expect([ registry.isActive('jabs'), registry.kindOf(swing, 0)?.id, registry.kindOf(swing, 2)?.id ])
        .toStrictEqual([ true, 'core.decor', 'core.decor' ]);
    });

    it('reads a battler\'s tags as fields while J-ABS is enabled, its level only beside an enabled J-LevelMaster', () =>
    {
      // Arrange: J-ABS alone, beside J-LevelMaster on and off, and off itself beside J-LevelMaster on.
      const plugins: [ PluginsJsEntry, PluginsJsEntry[] ][] = [
        [ jabs(true, { actionMapId: '2' }), [] ],
        [ jabs(true, { actionMapId: '2' }), [ levelMaster(true) ] ],
        [ jabs(true, { actionMapId: '2' }), [ levelMaster(false) ] ],
        [ jabs(false, { actionMapId: '2' }), [ levelMaster(true) ] ],
      ];

      // Act.
      const read = plugins.map(([ plugin, others ]) => registryWith(plugin, others).commentTags().map(tag => tag.id));

      // Assert: the same tags as J-ABS's own fields, the level among them only beside J-LevelMaster, and none with J-ABS off.
      const own = battlerTagFields(false).map(tag => tag.id);
      expect([ own.length, read ])
        .toStrictEqual([ 15, [ own, [ ...own, 'jabs.level' ], own, [] ] ]);
    });

    it('offers the level new battlers start at in Map Properties only beside an enabled J-LevelMaster, reading nothing off the map', () =>
    {
      // Arrange: J-ABS beside J-LevelMaster on, off, and missing; and J-ABS off itself beside it.
      const plugins: [ PluginsJsEntry, PluginsJsEntry[] ][] = [
        [ jabs(true, { actionMapId: '2' }), [ levelMaster(true) ] ],
        [ jabs(true, { actionMapId: '2' }), [ levelMaster(false) ] ],
        [ jabs(true, { actionMapId: '2' }), [] ],
        [ jabs(false, { actionMapId: '2' }), [ levelMaster(true) ] ],
      ];

      // Act.
      const sections = plugins.map(([ plugin, others ]) => registryWith(plugin, others).mapPropertiesSections());

      // Assert: the one section draws its setting itself, since the map's own file never holds it.
      const [ [ offered ] ] = sections;
      const map = hubWith([]).hub.map('map:1');
      expect([ sections.map(each => each.map(section => [ section.id, section.title ])), offered.body !== undefined, offered.source(map) ])
        .toStrictEqual([ [ [ [ MAP_BATTLERS_ID, 'Battlers' ] ], [], [], [] ], true, { note: null, fields: [] } ]);
    });

    it('claims a battler over the transfer its page also is, with the battler\'s symbol, and leaves it with J-ABS off', () =>
    {
      // Arrange: a door whose transfer page also names an enemy in a comment, which a transfer page allows.
      const door = event(7, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '<enemyId:12>' ]) ]) ]);

      // Act.
      const enabled = registryWith(jabs(true, { actionMapId: '2' })).kindOf(door, 3);
      const disabled = registryWith(jabs(false, { actionMapId: '2' })).kindOf(door, 3);

      // Assert.
      expect([ enabled?.id, enabled?.marker, disabled?.id ])
        .toStrictEqual([ 'jabs.battler', 'battler', 'core.transfer' ]);
    });
  });

  describe('isBattler', () =>
  {
    it('reads the enemy tag in a comment on any page, in any case, with one space after the colon', () =>
    {
      // Arrange: on the first page; on a later page alone, behind a page with nothing; spaced; in capitals; on a comment's
      // second line.
      const battlers = [
        event(1, [ page([ command(108, [ '<motion:[breathe]>' ]), command(108, [ '<enemyId:12>' ]) ]) ]),
        event(2, [ page([]), page([ command(108, [ '<enemyId:3>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<enemyId: 7>' ]) ]) ]),
        event(4, [ page([ command(108, [ '<ENEMYID:5>' ]) ]) ]),
        event(5, [ page([ command(108, [ '<sight:4>' ]), command(408, [ '<enemyId:9>' ]) ]) ]),
      ];

      // Act.
      const read = battlers.map(isBattler);

      // Assert.
      expect(read)
        .toStrictEqual([ true, true, true, true, true ]);
    });

    it('makes no battler of a tag J-ABS would not read, or of the tag anywhere but a comment', () =>
    {
      // Arrange: no number; two spaces; another tag sharing its start; spoken in a message; with no pages at all.
      const nearMisses = [
        event(1, [ page([ command(108, [ '<enemyId:>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<enemyId:  7>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<enemyIds:3>' ]) ]) ]),
        event(4, [ page(text([ '<enemyId:12>' ])) ]),
        event(5, []),
      ];

      // Act.
      const read = nearMisses.map(isBattler);

      // Assert.
      expect(read)
        .toStrictEqual([ false, false, false, false, false ]);
    });
  });
});
