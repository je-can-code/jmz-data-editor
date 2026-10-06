import { describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { pluginCommandEntry } from '../../../../src/mapEditor/core/commands/pluginCommands.ts';
import { createMapEvent, pageCommentText } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { EventKindDefinition, ModuleContext, PluginModule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { enabledPlugins, PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * The core editor works on any MZ project; each plugin's awareness is its own module, switched on only when that
 * plugin is enabled in js/plugins.js. The registry owes the editor exactly that: a module whose plugin is off (or
 * missing, or only a near namesake like J-ABS-Metrics) contributes nothing, a module that is on contributes its
 * kinds, palette entries, passability rules, overlays, lighting layers and command entries, a module can never claim
 * a core kind, and the core's own kinds are on in every project. When several kinds recognise one event, the higher
 * priority wins, since a battler is also a comment-only event. A map an active module copies its events from, such as
 * J-ABS's action map, holds the plugin's patterns, so no kind claims an event there. Every activation is announced,
 * since modules switch on after the views that show kinds have drawn.
 *
 * A module naming project config files gets each one as it was read before switching on, and null for one that was
 * not, and never another module's.
 */
describe('PluginModuleRegistry', () =>
{
  /**
   * A plugin as js/plugins.js lists it.
   * @param {string} name The path-like name.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: { actionMapId: '2' } });

  /**
   * An event whose first page carries a comment.
   * @param {string} comment The comment text.
   * @returns {RmmzMapEvent} The event.
   */
  const commentedEvent = (comment: string): RmmzMapEvent =>
  {
    const event = createMapEvent(4, 1, 1);
    event.pages[0].list.unshift({ code: 108, indent: 0, parameters: [ comment ] });
    return event;
  };

  /**
   * The core's catch-all decor kind.
   * @returns {EventKindDefinition} The kind.
   */
  const decor = (): EventKindDefinition => ({ id: 'core.decor', title: 'Decor', priority: 0, detect: () => true });

  /**
   * A J-ABS stand-in module contributing one of everything.
   * @returns {PluginModule} The module.
   */
  const jabs = (): PluginModule => ({
    id: 'jabs',
    title: 'J-ABS',
    plugins: [ 'J-ABS' ],
    register: (contributions, context) =>
    {
      contributions.eventKind({
        id: 'jabs.battler',
        title: 'Battler',
        priority: 10,
        detect: event => pageCommentText(event.pages[0]).includes('<enemyId:'),
        overlays: [ { id: 'jabs.sight', title: 'Sight', defaultOn: true, draw: () => undefined } ],
      });
      contributions.paletteEntry({ id: 'jabs.battler', title: 'Battler', kind: 'jabs.battler', createEvent: createMapEvent });
      contributions.passabilityRule({ id: 'jabs.blocked', title: 'Blocked', deny: () => null });
      contributions.overlay({ id: 'jabs.pursuit', title: `Pursuit (${context.plugins.get('J-ABS')?.parameters['actionMapId']})`, defaultOn: false, draw: () => undefined });
      contributions.lightingLayer({ id: 'jabs.glow', title: 'Glow', create: () => ({ draw: () => undefined, destroy: () => undefined }) });
      contributions.catalogEntry(pluginCommandEntry({ plugin: 'J-ABS', command: 'spawn', args: [] }));
    },
  });

  it('switches a module on when its plugin is enabled, with everything it contributes', () =>
  {
    // Arrange.
    const catalog = new CommandCatalog();
    const registry = new PluginModuleRegistry(catalog);
    registry.registerCoreKind(decor());

    // Act.
    const activation = registry.activate([ jabs() ], [ plugin('j/base/J-Base', true), plugin('j/abs/J-ABS', true) ]);

    // Assert.
    expect([
      activation,
      registry.isActive('jabs'),
      registry.eventKinds().map(kind => kind.id),
      registry.paletteEntries().map(entry => entry.id),
      registry.passabilityRules().map(rule => rule.id),
      registry.overlays().map(overlay => overlay.id),
      registry.overlays()[0].title,
      registry.lightingLayers().map(layer => layer.id),
      catalog.entry('plugin:J-ABS:spawn')?.name,
    ])
      .toStrictEqual([
        { active: [ 'jabs' ], inactive: [] },
        true,
        [ 'jabs.battler', 'core.decor' ],
        [ 'jabs.battler' ],
        [ 'jabs.blocked' ],
        [ 'jabs.pursuit', 'jabs.sight' ],
        'Pursuit (2)',
        [ 'jabs.glow' ],
        'Plugin: spawn',
      ]);
  });

  it('leaves a module off when its plugin is disabled, missing, or only a near namesake', () =>
  {
    // Arrange: J-ABS-Metrics is on, but J-ABS itself is off.
    const catalog = new CommandCatalog();
    const register = vi.fn();
    const registry = new PluginModuleRegistry(catalog);
    const needsTwo: PluginModule = { id: 'lighting', title: 'Lighting', plugins: [ 'J-Lighting', 'J-Lighting-Time' ], register };

    // Act.
    const activation = registry.activate([ jabs(), needsTwo ], [
      plugin('j/abs/J-ABS', false),
      plugin('j/abs/ext/J-ABS-Metrics', true),
      plugin('j/lighting/J-Lighting', true),
    ]);

    // Assert.
    expect([ activation, register.mock.calls.length, registry.eventKinds(), catalog.entries() ])
      .toStrictEqual([
        { active: [], inactive: [ { id: 'jabs', missing: [ 'J-ABS' ] }, { id: 'lighting', missing: [ 'J-Lighting-Time' ] } ] },
        0,
        [],
        [],
      ]);
  });

  it('takes a module\'s contributions back when a later activation finds its plugin off', () =>
  {
    // Arrange.
    const catalog = new CommandCatalog();
    const registry = new PluginModuleRegistry(catalog);
    registry.registerCoreKind(decor());
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', true) ]);

    // Act.
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', false) ]);

    // Assert.
    expect([
      registry.isActive('jabs'),
      registry.eventKinds().map(kind => kind.id),
      registry.overlays(),
      registry.lightingLayers(),
      catalog.entry('plugin:J-ABS:spawn'),
    ])
      .toStrictEqual([ false, [ 'core.decor' ], [], [], null ]);
  });

  it('hands a module each config it names as it was read, null for one that was not, and no other module\'s', () =>
  {
    // Arrange: a module naming its own config and one never read, beside another module's config.
    const register = vi.fn();
    const lighting: PluginModule = { id: 'lighting', title: 'Lighting', plugins: [ 'J-Lighting' ], configs: [ 'lighting', 'lighting-time' ], register };
    const read = new Map<string, JsonValue | null>([ [ 'lighting', { light: { color: '#ffbb73' } } ], [ 'jabs', { teams: [] } ] ]);
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ lighting ], [ plugin('j/lighting/J-Lighting', true) ], read);

    // Assert.
    const [ [ , context ] ] = register.mock.calls as [ unknown, ModuleContext ][];
    expect([ ...context.configs ])
      .toStrictEqual([ [ 'lighting', { light: { color: '#ffbb73' } } ], [ 'lighting-time', null ] ]);
  });

  it('hands a module naming no configs none, whatever was read', () =>
  {
    // Arrange.
    const register = vi.fn();
    const plain: PluginModule = { id: 'jabs', title: 'J-ABS', plugins: [ 'J-ABS' ], register };
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ plain ], [ plugin('j/abs/J-ABS', true) ], new Map([ [ 'jabs', { teams: [] } ] ]));

    // Assert.
    const [ [ , context ] ] = register.mock.calls as [ unknown, ModuleContext ][];
    expect(context.configs.size)
      .toBe(0);
  });

  it('gives an event the highest-priority kind that recognises it', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.registerCoreKind(decor());
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', true) ]);

    // Act.
    const kinds = [ registry.kindOf(commentedEvent('<enemyId:12>'), 1)?.id, registry.kindOf(commentedEvent('<light:3>'), 1)?.id ];

    // Assert.
    expect(kinds)
      .toStrictEqual([ 'jabs.battler', 'core.decor' ]);
  });

  it('recognises nothing when no kind claims an event', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    const kind = registry.kindOf(createMapEvent(1, 0, 0), 1);

    // Assert.
    expect(kind)
      .toBeNull();
  });

  it('claims nothing on a map an active module copies its events from, every other map as before, until it switches off', () =>
  {
    // Arrange: a module naming map 2 as its patterns, over the core's catch-all decor.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.registerCoreKind(decor());
    const patterns: PluginModule = { id: 'jabs', title: 'J-ABS', plugins: [ 'J-ABS' ], register: add => add.templateMap(2) };
    const lamp = createMapEvent(4, 1, 1);

    // Act.
    registry.activate([ patterns ], [ plugin('j/abs/J-ABS', true) ]);
    const whileOn = [ registry.kindOf(lamp, 2), registry.kindOf(lamp, 3)?.id ];
    registry.activate([ patterns ], [ plugin('j/abs/J-ABS', false) ]);
    const onceOff = registry.kindOf(lamp, 2)?.id;

    // Assert.
    expect([ whileOn, onceOff ])
      .toStrictEqual([ [ null, 'core.decor' ], 'core.decor' ]);
  });

  it('tells whoever listens after each activation, and stops once they stop listening', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    const listener = vi.fn();
    const stop = registry.subscribe(listener);

    // Act.
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', true) ]);
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', false) ]);
    const heard = listener.mock.calls.length;
    stop();
    registry.activate([ jabs() ], [ plugin('j/abs/J-ABS', true) ]);

    // Assert.
    expect([ heard, listener.mock.calls.length, registry.revision ])
      .toStrictEqual([ 2, 2, 3 ]);
  });

  it('refuses a module adding anything outside its own name', () =>
  {
    // Arrange: one module per kind of contribution, each straying into the core's names.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    const strays: PluginModule[] = [
      { id: 'a', title: 'A', plugins: [], register: add => add.eventKind({ ...decor(), id: 'core.chest' }) },
      { id: 'b', title: 'B', plugins: [], register: add => add.paletteEntry({ id: 'chest', title: 'x', kind: 'x', createEvent: createMapEvent }) },
      { id: 'c', title: 'C', plugins: [], register: add => add.passabilityRule({ id: 'core.x', title: 'x', deny: () => null }) },
      { id: 'd', title: 'D', plugins: [], register: add => add.overlay({ id: 'grid.x', title: 'x', defaultOn: false, draw: () => undefined }) },
      { id: 'e', title: 'E', plugins: [], register: add => add.lightingLayer({ id: 'core.x', title: 'x', create: () => ({ draw: () => undefined, destroy: () => undefined }) }) },
    ];

    // Act.
    const failures = strays.map(stray => () => registry.activate([ stray ], []));

    // Assert.
    expect(failures[0])
      .toThrow('a can only add event kinds whose id starts with "a.", not core.chest');
    expect(failures[1])
      .toThrow('b can only add palette entries whose id starts with "b.", not chest');
    expect(failures[2])
      .toThrow('c can only add passability rules whose id starts with "c.", not core.x');
    expect(failures[3])
      .toThrow('d can only add overlays whose id starts with "d.", not grid.x');
    expect(failures[4])
      .toThrow('e can only add lighting layers whose id starts with "e.", not core.x');
  });

  describe('enabledPlugins', () =>
  {
    it('reads the enabled plugins by file name, leaving out the disabled', () =>
    {
      // Arrange: two enabled in folders, one disabled beside them.
      const plugins = [ plugin('j/base/J-Base', true), plugin('j/abs/J-ABS', false), plugin('j/lighting/J-Lighting', true) ];

      // Act.
      const enabled = enabledPlugins(plugins);

      // Assert.
      expect([ ...enabled.keys() ])
        .toStrictEqual([ 'J-Base', 'J-Lighting' ]);
    });
  });

  it('refuses a core kind that is not named as one, or registered twice', () =>
  {
    // Arrange.
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.registerCoreKind(decor());

    // Act.
    const attempts = [ () => registry.registerCoreKind({ ...decor(), id: 'chest' }), () => registry.registerCoreKind(decor()) ];

    // Assert.
    expect(attempts[0])
      .toThrow('a core kind\'s id starts with "core.", not chest');
    expect(attempts[1])
      .toThrow('core.decor is already registered');
  });
});
