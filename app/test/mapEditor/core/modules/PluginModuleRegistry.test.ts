import { describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import { pluginCommandEntry } from '../../../../src/mapEditor/core/commands/pluginCommands.ts';
import { createMapEvent, pageCommentText } from '../../../../src/mapEditor/core/model/eventModel.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import type { EventKindDefinition, ModuleContext, PluginModule, PreviewKindDefinition } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { configNamesOf, enabledPlugins, PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { RmmzMapEvent } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';

/*
 * The core editor works on any MZ project; each plugin's awareness is its own module, switched on only when that
 * plugin is enabled in js/plugins.js. The registry owes the editor exactly that: a module whose plugin is off (or
 * missing, or only a near namesake like J-ABS-Metrics) contributes nothing, a module that is on contributes its
 * kinds, palette entries, passability rules, overlays, lighting layers, weather layers, command entries, notices and Map
 * Properties sections, a module can never claim a core kind, and the core's own kinds are on in every project. When several kinds recognise one event, the
 * higher priority wins, since a battler is also a comment-only event. A map an active module copies its events from,
 * such as J-ABS's action map, holds the plugin's patterns, so no kind claims an event there. Every activation is
 * announced, since modules switch on after the views that show kinds have drawn.
 *
 * A module naming project config files gets each one as it was read before switching on, and null for one that was
 * not, with why it could not be read, and never another module's. An extension's config, which a module reads only while
 * the plugins the extension needs are enabled too, is handed over only then, after the module's own.
 *
 * A module may offer the map views a clock; the first one offered among the active modules is the window's, and none is
 * offered once the modules offering it switch off.
 *
 * A module may add conditions to the game's page rule, as J-TIME adds its hours, kept while it is on and taken back
 * when it switches off. Every module is handed words for a page, read from the page's own conditions and from every
 * page condition the active modules add, a module switching on after it included.
 *
 * A module may let the preview set a kind of state of its own, as J-OMNI-Quests lets it set where each quest stands,
 * named under its own id like everything else it adds, so it can never take over the switches, the variables or another
 * module's kind; listed while it is on, in the order the modules added them, and taken back when it switches off.
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
   * A kind of preview state a module adds under its own id, listing nothing.
   * @param {string} moduleId The module.
   * @returns {PreviewKindDefinition} The kind.
   */
  const previewKind = (moduleId: string): PreviewKindDefinition => ({
    id: `${moduleId}.states`,
    title: moduleId,
    nouns: { one: moduleId, many: `${moduleId}s`, state: 'set' },
    searchHint: 'Find one',
    noMatch: 'None.',
    entries: () => [],
    choose: () => undefined,
  });

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
      contributions.lightingLayer({ id: 'jabs.glow', title: 'Glow', create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }) });
      contributions.weatherLayer({ id: 'jabs.dust', title: 'Dust', drawsOn: () => true, create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }) });
      contributions.catalogEntry(pluginCommandEntry({ plugin: 'J-ABS', command: 'spawn', args: [] }));
      contributions.notice({ id: 'jabs.config', title: 'Battlers fight as their database says.', detail: 'Their config was not read.' });
      contributions.mapProperties({ id: 'jabs.map', title: 'Battles', source: () => ({ note: null, fields: [] }) });
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
      registry.weatherLayers().map(layer => layer.id),
      catalog.entry('plugin:J-ABS:spawn')?.name,
      registry.notices().map(notice => notice.id),
      registry.mapPropertiesSections().map(section => section.id),
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
        [ 'jabs.dust' ],
        'Plugin: spawn',
        [ 'jabs.config' ],
        [ 'jabs.map' ],
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
      registry.weatherLayers(),
      catalog.entry('plugin:J-ABS:spawn'),
      registry.notices(),
      registry.mapPropertiesSections(),
    ])
      .toStrictEqual([ false, [ 'core.decor' ], [], [], [], null, [], [] ]);
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

  it('hands a module why each config it names could not be read, and no other module\'s problems', () =>
  {
    // Arrange: its own second config is missing, and so is another module's.
    const register = vi.fn();
    const lighting: PluginModule = { id: 'lighting', title: 'Lighting', plugins: [ 'J-Lighting' ], configs: [ 'lighting', 'lighting-time' ], register };
    const read = new Map<string, JsonValue | null>([ [ 'lighting', {} ], [ 'lighting-time', null ], [ 'jabs', null ] ]);
    const problems = new Map([ [ 'lighting-time', 'the file is missing' ], [ 'jabs', 'the file is not JSON' ] ]);
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ lighting ], [ plugin('j/lighting/J-Lighting', true) ], read, problems);

    // Assert.
    const [ [ , context ] ] = register.mock.calls as [ unknown, ModuleContext ][];
    expect([ ...context.configProblems ])
      .toStrictEqual([ [ 'lighting-time', 'the file is missing' ] ]);
  });

  it('hands a module naming no configs none, whatever was read', () =>
  {
    // Arrange.
    const register = vi.fn();
    const plain: PluginModule = { id: 'jabs', title: 'J-ABS', plugins: [ 'J-ABS' ], register };
    const registry = new PluginModuleRegistry(new CommandCatalog());

    // Act.
    registry.activate([ plain ], [ plugin('j/abs/J-ABS', true) ], new Map([ [ 'jabs', null ] ]), new Map([ [ 'jabs', 'the file is missing' ] ]));

    // Assert.
    const [ [ , context ] ] = register.mock.calls as [ unknown, ModuleContext ][];
    expect([ context.configs.size, context.configProblems.size ])
      .toStrictEqual([ 0, 0 ]);
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
      {
        id: 'e',
        title: 'E',
        plugins: [],
        register: add => add.lightingLayer({ id: 'core.x', title: 'x', create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }) }),
      },
      { id: 'f', title: 'F', plugins: [], register: add => add.notice({ id: 'core.x', title: 'x', detail: 'x' }) },
      { id: 'g', title: 'G', plugins: [], register: add => add.mapProperties({ id: 'core.x', title: 'x', source: () => ({ note: null, fields: [] }) }) },
      { id: 'h', title: 'H', plugins: [], register: add => add.pageCondition({ id: 'core.x', read: () => null }) },
      { id: 'i', title: 'I', plugins: [], register: add => add.previewKind({ ...previewKind('quest'), id: 'quest.states' }) },
      {
        id: 'j',
        title: 'J',
        plugins: [],
        register: add => add.weatherLayer({ id: 'core.x', title: 'x', drawsOn: () => true, create: () => ({ draw: () => undefined, tick: () => false, destroy: () => undefined }) }),
      },
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
    expect(failures[5])
      .toThrow('f can only add notices whose id starts with "f.", not core.x');
    expect(failures[6])
      .toThrow('g can only add map properties sections whose id starts with "g.", not core.x');
    expect(failures[7])
      .toThrow('h can only add page conditions whose id starts with "h.", not core.x');
    expect(failures[8])
      .toThrow('i can only add preview kinds whose id starts with "i.", not quest.states');
    expect(failures[9])
      .toThrow('j can only add weather layers whose id starts with "j.", not core.x');
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

  describe('clockOffer', () =>
  {
    /**
     * A module offering a clock starting at a time, once its plugin is on.
     * @param {string} id The module.
     * @param {string} pluginName The plugin it needs.
     * @param {number} startsAt Where its clock starts.
     * @returns {PluginModule} The module.
     */
    const clockModule = (id: string, pluginName: string, startsAt: number): PluginModule => ({
      id,
      title: id,
      plugins: [ pluginName ],
      register: contributions => contributions.clock({ startsAt, partOfDay: () => id }),
    });

    it('offers the clock of the first module offering one, and none while no module does', () =>
    {
      // Arrange: two modules offering clocks, the first starting at 14:00, and a registry where neither is on.
      const lighting = clockModule('lighting', 'J-Lighting', 840);
      const time = clockModule('time', 'J-TIME', 540);
      const both = new PluginModuleRegistry(new CommandCatalog());
      const neither = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      both.activate([ lighting, time ], [ plugin('j/lighting/J-Lighting', true), plugin('j/time/J-TIME', true) ]);
      neither.activate([ lighting, time ], [ plugin('j/lighting/J-Lighting', false) ]);

      // Assert.
      expect([ both.clockOffer()?.startsAt, both.clockOffer()?.partOfDay(0), neither.clockOffer() ])
        .toStrictEqual([ 840, 'lighting', null ]);
    });

    it('takes the clock back once the module offering it switches off', () =>
    {
      // Arrange: the module on.
      const lighting = clockModule('lighting', 'J-Lighting', 840);
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate([ lighting ], [ plugin('j/lighting/J-Lighting', true) ]);

      // Act.
      registry.activate([ lighting ], [ plugin('j/lighting/J-Lighting', false) ]);

      // Assert.
      expect(registry.clockOffer())
        .toBeNull();
    });
  });

  describe('pageConditions', () =>
  {
    /**
     * A module adding a page condition that asks a page for the words of its first comment, once its plugin is on, and
     * keeping what it is handed.
     * @param {string} id The module.
     * @param {string} pluginName The plugin it needs.
     * @param {{ context?: ModuleContext }} kept Where it keeps the context it is handed.
     * @returns {PluginModule} The module.
     */
    const gatingModule = (id: string, pluginName: string, kept: { context?: ModuleContext } = {}): PluginModule => ({
      id,
      title: id,
      plugins: [ pluginName ],
      register: (contributions, context) =>
      {
        kept.context = context;
        contributions.pageCondition({
          id: `${id}.pages`,
          read: page => ({ followsClock: true, holds: () => true, words: [ `${id} reads ${String(page.list[0].parameters[0])}` ] }),
        });
      },
    });

    it('lists the page conditions of the active modules in the order they added them, and none while they are off', () =>
    {
      // Arrange: two modules gating pages, and a registry where neither is on.
      const modules = [ gatingModule('time', 'J-TIME'), gatingModule('weather', 'J-Weather-Time') ];
      const both = new PluginModuleRegistry(new CommandCatalog());
      const neither = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      both.activate(modules, [ plugin('j/time/J-TIME', true), plugin('j/weather/ext/J-Weather-Time', true) ]);
      neither.activate(modules, [ plugin('j/time/J-TIME', false) ]);

      // Assert.
      expect([ both.pageConditions().map(condition => condition.id), neither.pageConditions() ])
        .toStrictEqual([ [ 'time.pages', 'weather.pages' ], [] ]);
    });

    it('takes a module\'s page conditions back once it switches off', () =>
    {
      // Arrange: the module on.
      const time = gatingModule('time', 'J-TIME');
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate([ time ], [ plugin('j/time/J-TIME', true) ]);

      // Act.
      registry.activate([ time ], [ plugin('j/time/J-TIME', false) ]);

      // Assert.
      expect(registry.pageConditions())
        .toStrictEqual([]);
    });

    it('hands a module words for a page from a page\'s own conditions and every page condition, those added after it included', () =>
    {
      // Arrange: a module switching on first, keeping its context, then one gating pages; a page waiting for switch 4.
      const kept: { context?: ModuleContext } = {};
      const lighting: PluginModule = {
        id: 'lighting',
        title: 'Lighting',
        plugins: [ 'J-Lighting' ],
        register: (_add, context) =>
        {
          kept.context = context;
        },
      };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate([ lighting, gatingModule('time', 'J-TIME') ], [ plugin('j/lighting/J-Lighting', true), plugin('j/time/J-TIME', true) ]);
      const [ page ] = commentedEvent('<hourRangePage:18-5>').pages;
      page.conditions = { ...page.conditions, switch1Valid: true, switch1Id: 4 };

      // Act.
      const words = kept.context?.pageWords(page);

      // Assert.
      expect(words)
        .toStrictEqual([ 'while switch 4 is on', 'time reads <hourRangePage:18-5>' ]);
    });
  });

  describe('previewKinds', () =>
  {
    /**
     * A module letting the preview set a kind of its own, once its plugin is on.
     * @param {string} id The module.
     * @param {string} pluginName The plugin it needs.
     * @returns {PluginModule} The module.
     */
    const previewing = (id: string, pluginName: string): PluginModule => ({
      id,
      title: id,
      plugins: [ pluginName ],
      register: contributions => contributions.previewKind(previewKind(id)),
    });

    it('lists the preview kinds of the active modules in the order they added them, and none while they are off', () =>
    {
      // Arrange: two modules adding kinds, and a registry where neither is on.
      const modules = [ previewing('quest', 'J-OMNI-Quests'), previewing('weather', 'J-Weather') ];
      const both = new PluginModuleRegistry(new CommandCatalog());
      const neither = new PluginModuleRegistry(new CommandCatalog());

      // Act.
      both.activate(modules, [ plugin('j/omni/ext/J-OMNI-Quests', true), plugin('j/weather/J-Weather', true) ]);
      neither.activate(modules, [ plugin('j/omni/ext/J-OMNI-Quests', false) ]);

      // Assert.
      expect([ both.previewKinds().map(kind => kind.id), neither.previewKinds() ])
        .toStrictEqual([ [ 'quest.states', 'weather.states' ], [] ]);
    });

    it('takes a module\'s preview kind back once it switches off', () =>
    {
      // Arrange: the module on.
      const quest = previewing('quest', 'J-OMNI-Quests');
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate([ quest ], [ plugin('j/omni/ext/J-OMNI-Quests', true) ]);
      const listed = registry.previewKinds().length;

      // Act.
      registry.activate([ quest ], [ plugin('j/omni/ext/J-OMNI-Quests', false) ]);

      // Assert.
      expect([ listed, registry.previewKinds() ])
        .toStrictEqual([ 1, [] ]);
    });
  });

  describe('extension configs', () =>
  {
    /**
     * A lighting module reading its own config always, and its time extension's only with J-Lighting-Time and J-TIME on.
     * @param {(context: ModuleContext) => void} register What it does with what it is handed.
     * @returns {PluginModule} The module.
     */
    const lightingWithTime = (register: (context: ModuleContext) => void): PluginModule => ({
      id: 'lighting',
      title: 'Lighting',
      plugins: [ 'J-Lighting' ],
      configs: [ 'lighting' ],
      extensionConfigs: [ { name: 'lighting-time', plugins: [ 'J-Lighting-Time', 'J-TIME' ] } ],
      register: (_contributions, context) => register(context),
    });

    it('hands a module an extension\'s config only while every plugin the extension needs is enabled', () =>
    {
      // Arrange: both configs read, and the extension with J-TIME on and with it off.
      const read = new Map<string, JsonValue | null>([ [ 'lighting', {} ], [ 'lighting-time', { sequence: [] } ] ]);
      const handed: string[][] = [];
      const lighting = lightingWithTime(context => handed.push([ ...context.configs.keys() ]));
      const extension = plugin('j/lighting/ext/J-Lighting-Time', true);

      // Act.
      new PluginModuleRegistry(new CommandCatalog()).activate([ lighting ], [ plugin('j/lighting/J-Lighting', true), extension, plugin('j/time/J-TIME', true) ], read);
      new PluginModuleRegistry(new CommandCatalog()).activate([ lighting ], [ plugin('j/lighting/J-Lighting', true), extension, plugin('j/time/J-TIME', false) ], read);

      // Assert.
      expect(handed)
        .toStrictEqual([ [ 'lighting', 'lighting-time' ], [ 'lighting' ] ]);
    });

    it('names a module\'s own configs first, then each extension\'s whose plugins are on', () =>
    {
      // Arrange: J-Lighting-Time and J-TIME both on, and then the extension off.
      const lighting = lightingWithTime(() => undefined);
      const on = enabledPlugins([ plugin('j/lighting/ext/J-Lighting-Time', true), plugin('j/time/J-TIME', true) ]);
      const off = enabledPlugins([ plugin('j/lighting/ext/J-Lighting-Time', false), plugin('j/time/J-TIME', true) ]);

      // Act.
      const names = [ configNamesOf(lighting, on), configNamesOf(lighting, off) ];

      // Assert.
      expect(names)
        .toStrictEqual([ [ 'lighting', 'lighting-time' ], [ 'lighting' ] ]);
    });

    it('names no config for a module naming none', () =>
    {
      // Arrange.
      const plain: PluginModule = { id: 'jabs', title: 'J-ABS', plugins: [ 'J-ABS' ], register: () => undefined };

      // Act.
      const names = configNamesOf(plain, enabledPlugins([ plugin('j/abs/J-ABS', true) ]));

      // Assert.
      expect(names)
        .toStrictEqual([]);
    });
  });
});
