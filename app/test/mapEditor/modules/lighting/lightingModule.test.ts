import { Container, Texture, type Renderer, type Sprite } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { LightingClock, LightingLayerDefinition, LightingStage } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import type { RmmzEventPage } from '../../../../src/mapEditor/core/model/rmmzTypes.ts';
import { isLight, LIGHT_MASK_ID, LIGHT_RINGS_ID, lightingModule, SKY_TONE_ID } from '../../../../src/mapEditor/modules/lighting/lightingModule.ts';
import { LightPictures } from '../../../../src/mapEditor/modules/lighting/lightPictures.ts';
import { timeModule } from '../../../../src/mapEditor/modules/time/timeModule.ts';
import { registerCoreEventKinds } from '../../../../src/mapEditor/services/coreEventKinds.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { command, event, page, text, transferPage } from '../../support/eventKindFixtures.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { ENGINE_PAGES } from '../../support/pageFixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/**
 * The colour of every solid fill the stand-in drawings were given, in order: one dot at each light; and the words for a
 * page each light panel was handed, in the order the panels were made.
 */
const stand = vi.hoisted(() => ({
  dots: [] as number[],
  pageWords: [] as ((page: RmmzEventPage) => readonly string[])[],
  fills: [] as { fill: number }[],
}));

// a lit piece of the dark shows through a shader, which needs a GPU to compile; a stand-in shows nothing, keeps the
// dark's fill it is shown with, and is written down as it is made, holding a real texture for its lights.
vi.mock('../../../../src/mapEditor/modules/lighting/litPiece.ts', async () =>
{
  const pixi = await import('pixi.js');

  /**
   * Stands in for a lit piece: a container for a quad, a texture of the piece's size, and the fill it shows with.
   */
  class LitPiece
  {
    readonly mesh = new pixi.Container();

    readonly texture: InstanceType<typeof pixi.RenderTexture>;

    fill: number;

    constructor(rect: { width: number; height: number }, tint: number)
    {
      this.texture = pixi.RenderTexture.create({ width: rect.width, height: rect.height });
      this.fill = tint;
      stand.fills.push(this);
    }

    destroy(): void
    {
      this.mesh.destroy();
      this.texture.destroy(true);
    }
  }

  return { LitPiece };
});

// the light panel's options are built as the module switches on; a wrapper writes down the words for a page each is
// handed, and builds them as they are.
vi.mock('../../../../src/mapEditor/modules/lighting/lightPanel.ts', async importOriginal =>
{
  const original = await importOriginal<typeof import('../../../../src/mapEditor/modules/lighting/lightPanel.ts')>();
  return {
    ...original,
    lightPanelOptions: (...args: Parameters<typeof original.lightPanelOptions>) =>
    {
      const [ , , pageWords ] = args;
      if (pageWords !== undefined)
      {
        stand.pageWords.push(pageWords);
      }

      return original.lightPanelOptions(...args);
    },
  };
});

// the rings draw through pixi's Graphics; a stand-in writes down the colour of each solid fill, which is the dot drawn
// at each light in the light's own colour, and leaves the rest of pixi as it is.
vi.mock('pixi.js', async importOriginal =>
{
  /**
   * Stands in for pixi's Graphics, keeping only the colour each light's dot is drawn in.
   */
  class Graphics
  {
    clear(): this
    {
      return this;
    }

    circle(): this
    {
      return this;
    }

    fill(style: { color: number; alpha: number }): this
    {
      if (style.alpha === 1)
      {
        stand.dots.push(style.color);
      }

      return this;
    }

    stroke(): this
    {
      return this;
    }

    destroy(): void
    {
      // nothing to let go of.
    }
  }

  return { ...await importOriginal<typeof import('pixi.js')>(), Graphics };
});

/*
 * A light is an event with a page whose comments give light, read by the same parser J-Lighting's tags are read with
 * everywhere in the editor (its own tests hold the rules): a reach in tiles, fractions allowed, then any of a colour,
 * an intensity and an effect, on any page (a torch that can be lit carries the tag on its lit page alone), any case.
 * The same words anywhere but a comment, a reach left out, or a map's ambient darkness make no light. The kind switches
 * on only while J-Lighting is enabled, ranks below the transfer a glowing door still is, shows the light's symbol, and
 * gives a light the quick panel a single click shows (its own tests, and the quick panel host's, hold what it does),
 * handed the words for when a page shows, J-TIME's hours among them while J-TIME's module is on.
 *
 * While J-Lighting is enabled the module also draws into the lighting layer a dark map's darkness, first, as what the
 * game itself shows (its own tests hold how), and each light's ring over it, as an aid. It reads the project's
 * config.lighting.json first, so a light naming no colour is drawn in the colour the project configures, or white for a
 * project without the file, which it then says over the map rather than leave the white to pass for the game's look; a
 * map naming a colour of the dark it cannot use takes the project's; and a light's pool runs its effect as the project
 * tunes that effect, at the view's clock, and burns at full strength while the view does not animate.
 *
 * While J-Lighting-Time is enabled too, with J-TIME, the module reads the project's config.lighting-time.json and follows
 * the clock J-TIME's own module offers with the sky: its colour cast over a map with a sky (its own tests hold the
 * curve's arithmetic), and its darkness joining the map's own in the dark, so a field darkens at night and a dark map
 * compounds both; a map tagged <noToneChange> gets neither. It never offers a clock of its own, so the map views show one.
 * Without either plugin there is no sky, and a project without J-Lighting-Time is never asked for its curve. A curve that
 * cannot be read is said over the map, the sky still.
 *
 * It adds a Lighting section to Map Properties too (its own tests hold what each setting reads and writes), which offers
 * whether the map has a sky only while J-Lighting-Time or J-Weather-Time, whose sky's weather J-Weather keeps off a map
 * with none, is enabled as well, each known by its exact name and the setting worded for those that are; J-Weather
 * alone drives no sky, so it is offered nothing for it. The section shows a colour of the dark the note names but the
 * game cannot use as the project's.
 */
describe('lightingModule', () =>
{
  beforeEach(() =>
  {
    stand.dots.splice(0);
  });

  /**
   * J-Lighting's config as the server serves it: every field there, the effects tuned as Chef Adventure ships them.
   * @param {string} color The colour of a light naming none.
   * @param {string} ambient The colour of a dark naming none.
   * @returns {JsonValue} The config.
   */
  const served = (color: string, ambient = '#000000'): JsonValue =>
  {
    const effects = {
      flicker: { depth: 0.2, period: 40, chance: 0, variance: 0.18 },
      pulse: { depth: 0.45, period: 165, chance: 0, variance: 0.22 },
      glitch: { depth: 0.85, period: 55, chance: 0.28, variance: 0.12 },
    };
    return { light: { radius: 5, color, intensity: 0, effects }, ambient: { color: ambient } } as unknown as JsonValue;
  };

  /**
   * The view's clock at frame 0, animating, at 14:00.
   */
  const START: LightingClock = { frames: 0, animating: true, timeOfDay: 840 };

  /**
   * A stage for one drawing: a container, the tile size, and a tone cast nowhere.
   * @param {Container} layer The container.
   * @returns {LightingStage} The stage.
   */
  const stageOn = (layer: Container): LightingStage => ({ layer, tileSize: 48, castTone: () => undefined });

  /**
   * J-Lighting as js/plugins.js lists it.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const lighting = (status: boolean): PluginsJsEntry => ({ name: 'j/lighting/J-Lighting', status, description: '', parameters: {} });

  /**
   * A window's registry with the core's kinds, and J-Lighting's module activated over the given plugin.
   * @param {PluginsJsEntry} plugin J-Lighting.
   * @param {ReadonlyMap<string, JsonValue | null>} configs The configs read before activating.
   * @returns {PluginModuleRegistry} The registry.
   */
  const registryWith = (plugin: PluginsJsEntry, configs: ReadonlyMap<string, JsonValue | null> = new Map()): PluginModuleRegistry =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registerCoreEventKinds(registry);
    registry.activate([ lightingModule ], [ plugin ], configs);
    return registry;
  };

  /**
   * Draws a map holding one light that names no colour, with the registry's light rings, and reads the colour its ring
   * is drawn in.
   * @param {PluginModuleRegistry} registry The registry.
   * @returns {number[]} The colour of the dot drawn at every light.
   */
  const ringColoursFrom = (registry: PluginModuleRegistry): number[] =>
  {
    const json = buildMapJson();
    json.events = [ null, { ...event(1, [ page([ command(108, [ '<light:[2]>' ]) ]) ]), x: 0, y: 0 } ];
    const rings = registry.lightingLayers().find(layer => layer.id === LIGHT_RINGS_ID) as LightingLayerDefinition;
    const drawing = rings.create(stageOn({ addChild: () => undefined } as unknown as Container));
    drawing.draw({ document: MapDocument.fromJson('map:1', json), renderer: {} as Renderer, context: 1, clock: START, pages: ENGINE_PAGES, view: WHOLE_VIEW });
    return stand.dots;
  };

  describe('lightingModule', () =>
  {
    it('claims a light with the light\'s symbol while J-Lighting is enabled, and nothing while it is not', () =>
    {
      // Arrange: a lamp, a comment and nothing more.
      const lamp = event(4, [ page([ command(108, [ '<light:[5]>' ]) ]) ]);

      // Act.
      const enabled = registryWith(lighting(true));
      const disabled = registryWith(lighting(false));

      // Assert.
      expect([ enabled.isActive('lighting'), enabled.kindOf(lamp, 3)?.id, enabled.kindOf(lamp, 3)?.marker, disabled.kindOf(lamp, 3) ])
        .toStrictEqual([ true, 'lighting.light', 'light', null ]);
    });

    it('gives a light the quick panel a single click shows, named after the kind', () =>
    {
      // Arrange: a lamp.
      const lamp = event(4, [ page([ command(108, [ '<light:[5]>' ]) ]) ]);

      // Act.
      const panel = registryWith(lighting(true)).kindOf(lamp, 3)?.quickPanel;

      // Assert.
      expect(panel?.displayName)
        .toBe('QuickPanel(lighting.light)');
    });

    it('leaves a glowing door the transfer it is', () =>
    {
      // Arrange: a door whose transfer page also gives light, which a transfer page allows.
      const door = event(7, [ transferPage([ 0, 5, 3, 4, 2, 0 ], [ command(108, [ '<light:[2, #ffbb73]>' ]) ]) ]);

      // Act.
      const kind = registryWith(lighting(true)).kindOf(door, 3);

      // Assert.
      expect(kind?.id)
        .toBe('core.transfer');
    });

    it('draws the dark and the light rings into the lighting layer while J-Lighting is enabled, and nothing there while it is not', () =>
    {
      // Arrange: the module over J-Lighting on, and over J-Lighting off.

      // Act.
      const layers = [ registryWith(lighting(true)), registryWith(lighting(false)) ].map(registry => registry.lightingLayers().map(layer => layer.id));

      // Assert.
      expect(layers)
        .toStrictEqual([ [ 'lighting.dark', 'lighting.rings' ], [] ]);
    });

    it('draws the dark first, as what the game itself shows, and the rings over it as an aid', () =>
    {
      // Arrange.
      const registry = registryWith(lighting(true));

      // Act.
      const layers = registry.lightingLayers().map(layer => [ layer.id, layer.shownInGame === true ]);

      // Assert.
      expect(layers)
        .toStrictEqual([ [ 'lighting.dark', true ], [ 'lighting.rings', false ] ]);
    });

    it('fills a dark map from its note, in the project\'s colour of the dark where the note names one it cannot use', () =>
    {
      // Arrange: a project whose dark falls back to slate, and a cave at 85% naming a colour with a typo.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', served('#ffffff', '#102030') ] ]));
      const dark = registry.lightingLayers().find(layer => layer.id === LIGHT_MASK_ID) as LightingLayerDefinition;
      const layer = new Container();
      const drawing = dark.create(stageOn(layer));
      const json = { ...buildMapJson(), note: '<ambient:[85, #10203g]>' };

      // Act.
      drawing.draw({ document: MapDocument.fromJson('map:1', json), renderer: {} as Renderer, context: 1, clock: START, pages: ENGINE_PAGES, view: WHOLE_VIEW });

      // Assert: one piece, a plain fill of 85% slate.
      const [ root ] = layer.children;
      expect(root.children.map(piece => (piece as Sprite).tint))
        .toStrictEqual([ 0x34414f ]);
      drawing.destroy();
    });

    it('runs a light\'s effect in the dark as the project tunes it, at the view\'s clock, and holds it at full strength while the view does not animate', () =>
    {
      // Arrange: map 6, a cave at 85% holding event 12's flickering torch, drawn at frame 100 by a renderer writing down
      // how strongly each light is added in; every picture is plain white, as no canvas paints here.
      const pictureFor = vi.spyOn(LightPictures.prototype, 'pictureFor').mockReturnValue(Texture.WHITE);
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', served('#ffffff') ] ]));
      const dark = registry.lightingLayers().find(layer => layer.id === LIGHT_MASK_ID) as LightingLayerDefinition;
      const drawing = dark.create(stageOn(new Container()));
      const json = { ...buildMapJson(), note: '<ambient:[85]>', events: [ null, { ...event(12, [ page([ command(108, [ '<light:[4, #ffbb73, 40, flicker]>' ]) ]) ]), x: 1, y: 1 } ] };
      const document = MapDocument.fromJson('map:6', json);
      const added: number[][] = [];
      const renderer = { render: (options: { container: Container }) => added.push(options.container.children.map(sprite => sprite.alpha)) } as unknown as Renderer;
      drawing.draw({ document, renderer, context: 1, clock: { ...START, frames: 100 }, pages: ENGINE_PAGES, view: WHOLE_VIEW });

      // Act: the next frame, then the same frame with Animate off.
      const moved = [ drawing.tick({ document, renderer, context: 1, clock: { ...START, frames: 101 }, pages: ENGINE_PAGES, view: WHOLE_VIEW }) ];
      moved.push(drawing.tick({ document, renderer, context: 1, clock: { ...START, frames: 101, animating: false }, pages: ENGINE_PAGES, view: WHOLE_VIEW }));
      drawing.destroy();
      pictureFor.mockRestore();

      // Assert: the torch at the shipped flicker's strengths for map 6's event 12 at frames 100 and 101, then full.
      expect([ added, moved ])
        .toStrictEqual([ [ [ 0.9115909902530034 ], [ 0.9360984519453811 ], [ 1 ] ], [ true, true ] ]);
    });

    it('keeps a light where it was in its cycle through an edit to its tag, a move, and a view drawing it afresh', () =>
    {
      // Arrange: map 6's cave holding event 12's flickering torch, drawn at frame 100, where it burns at 0.91; then its
      // reach and its place changed, as the quick panel and a drag change them, and a second view's drawing made, as a
      // map opened again makes one.
      const pictureFor = vi.spyOn(LightPictures.prototype, 'pictureFor').mockReturnValue(Texture.WHITE);
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', served('#ffffff') ] ]));
      const dark = registry.lightingLayers().find(layer => layer.id === LIGHT_MASK_ID) as LightingLayerDefinition;
      const drawing = dark.create(stageOn(new Container()));
      const json = { ...buildMapJson(), note: '<ambient:[85]>', events: [ null, { ...event(12, [ page([ command(108, [ '<light:[4, #ffbb73, 40, flicker]>' ]) ]) ]), x: 1, y: 1 } ] };
      const document = MapDocument.fromJson('map:6', json);
      const added: number[][] = [];
      const renderer = { render: (options: { container: Container }) => added.push(options.container.children.map(sprite => sprite.alpha)) } as unknown as Renderer;
      const atFrame100 = { document, renderer, context: 1, clock: { ...START, frames: 100 }, pages: ENGINE_PAGES, view: WHOLE_VIEW };
      drawing.draw(atFrame100);
      document.apply(document.setPatch([ 'events', 1, 'pages', 0, 'list', 0, 'parameters', 0 ], '<light:[5, #ffbb73, 40, flicker]>'));
      document.apply(document.setPatch([ 'events', 1, 'x' ], 2));
      const afresh = dark.create(stageOn(new Container()));

      // Act.
      drawing.draw(atFrame100);
      afresh.draw(atFrame100);
      drawing.destroy();
      afresh.destroy();
      pictureFor.mockRestore();

      // Assert: the torch added in at the strength it had before, after the edits and in the new view alike.
      expect(added)
        .toStrictEqual([ [ 0.9115909902530034 ], [ 0.9115909902530034 ], [ 0.9115909902530034 ] ]);
    });

    it('hands the light panel the words for when a page shows, J-TIME\'s hours among them while its module is on', () =>
    {
      // Arrange: J-Lighting's module and J-TIME's switched on together, and a time-torch's lit page, lit from 18:00 to
      // 05:00 while switch 4 is on.
      const time: PluginsJsEntry = { name: 'j/time/J-TIME', status: true, description: '', parameters: {} };
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate([ lightingModule, timeModule ], [ lighting(true), time ]);
      const litPage = page([ command(108, [ '<light:[4]>' ]), command(108, [ '<hourRangePage:18-5>' ]) ]);
      litPage.conditions = { ...litPage.conditions, switch1Valid: true, switch1Id: 4 };

      // Act.
      const words = stand.pageWords.at(-1)?.(litPage);

      // Assert.
      expect(words)
        .toStrictEqual([ 'while switch 4 is on', 'from 18:00 to 05:00' ]);
    });

    it('names the project\'s lighting config as the one config it reads', () =>
    {
      // Arrange: the module as the editor ships it.

      // Act.
      const { configs } = lightingModule;

      // Assert.
      expect(configs)
        .toStrictEqual([ 'lighting' ]);
    });

    it('draws a light naming no colour in the colour the project configures', () =>
    {
      // Arrange: a project whose lights are red unless their tags say otherwise.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', served('#ff0000') ] ]));

      // Act.
      const colours = ringColoursFrom(registry);

      // Assert.
      expect(colours)
        .toStrictEqual([ 0xff0000 ]);
    });

    it('draws a light naming no colour in white for a project without the config', () =>
    {
      // Arrange: the config could not be read.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', null ] ]));

      // Act.
      const colours = ringColoursFrom(registry);

      // Assert.
      expect(colours)
        .toStrictEqual([ 0xffffff ]);
    });

    it('says over the map why its lights draw in white when the config could not be read', () =>
    {
      // Arrange: the file is missing.
      const registry = new PluginModuleRegistry(new CommandCatalog());
      const problems = new Map([ [ 'lighting', 'open /game/data/config.lighting.json: no such file or directory' ] ]);

      // Act.
      registry.activate([ lightingModule ], [ lighting(true) ], new Map([ [ 'lighting', null ] ]), problems);

      // Assert.
      expect(registry.notices().map(notice => [ notice.id, notice.detail ]))
        .toStrictEqual([ [
          'lighting.config',
          'It could not be read: open /game/data/config.lighting.json: no such file or directory. This clears as soon as the file is fixed.',
        ] ]);
    });

    it('says nothing over the map when the config serves', () =>
    {
      // Arrange.
      const config = served('#ff0000');

      // Act.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', config ] ]));

      // Assert.
      expect(registry.notices())
        .toStrictEqual([]);
    });

    it('adds a Lighting section to Map Properties, offering the sky while J-Lighting-Time or J-Weather-Time is enabled too, worded for those that are', () =>
    {
      // Arrange: a cave at 85%, and the plugins beside J-Lighting as js/plugins.js lists them: J-Lighting-Time alone;
      // J-Weather-Time alone, with J-Weather beneath it; both; and both time extensions off, with J-Weather alone on,
      // which drives no sky of its own.
      const cave = MapDocument.fromJson('map:1', { ...buildMapJson(), note: '<noToneChange>\n<ambient:[85]>' });
      const plugin = (name: string, status: boolean): PluginsJsEntry => ({ name, status, description: '', parameters: {} });
      const lightingTime = plugin('j/lighting/ext/J-Lighting-Time', true);
      const weather = plugin('j/weather/J-Weather', true);
      const weatherTime = plugin('j/weather/ext/J-Weather-Time', true);
      const projects = [
        [ lightingTime ],
        [ weather, weatherTime ],
        [ lightingTime, weather, weatherTime ],
        [ plugin('j/lighting/ext/J-Lighting-Time', false), weather, plugin('j/weather/ext/J-Weather-Time', false) ],
      ];
      const registries = projects.map(plugins =>
      {
        const registry = new PluginModuleRegistry(new CommandCatalog());
        registry.activate([ lightingModule ], [ lighting(true), ...plugins ]);
        return registry;
      });

      // Act.
      const sections = registries.map(registry => registry.mapPropertiesSections().map(section => [
        section.id,
        section.title,
        section.source(cave).fields.map(field => field.label),
      ]));

      // Assert.
      expect([ sections, registryWith(lighting(false)).mapPropertiesSections() ])
        .toStrictEqual([
          [
            [ [ 'lighting.map', 'Lighting', [ 'Darkness', 'Colour of the dark', 'Sky follows the clock' ] ] ],
            [ [ 'lighting.map', 'Lighting', [ 'Darkness', 'Colour of the dark', 'Sky follows the weather' ] ] ],
            [ [ 'lighting.map', 'Lighting', [ 'Darkness', 'Colour of the dark', 'Sky follows the clock and the weather' ] ] ],
            [ [ 'lighting.map', 'Lighting', [ 'Darkness', 'Colour of the dark' ] ] ],
          ],
          [],
        ]);
    });

    it('shows a colour of the dark the note names but the game cannot use as the project\'s', () =>
    {
      // Arrange: a project whose dark falls back to slate, and a cave naming a colour with a typo.
      const registry = registryWith(lighting(true), new Map([ [ 'lighting', served('#ffffff', '#102030') ] ]));
      const cave = MapDocument.fromJson('map:1', { ...buildMapJson(), note: '<ambient:[85, #10203g]>' });
      const [ section ] = registry.mapPropertiesSections();

      // Act.
      const [ , color ] = section.source(cave).fields;

      // Assert.
      expect([ color.value, color.hint ])
        .toStrictEqual([ '#102030', '#10203g is not a colour, so the project\'s default shows.' ]);
    });
  });

  describe('lightingModule, with J-Lighting-Time', () =>
  {
    /**
     * J-Lighting-Time's curve as Chef Adventure ships it.
     */
    const CURVE = {
      phases: {
        Moontide: { tone: [ -30, -18, 34, 170 ], darkness: 0.72 },
        Dawn: { tone: [ 30, 6, -12, 40 ], darkness: 0.3 },
        Morning: { tone: [ 0, 0, 0, 0 ], darkness: 0 },
        Afternoon: { tone: [ 12, 8, -4, 0 ], darkness: 0 },
        Evening: { tone: [ 26, 0, -34, 22 ], darkness: 0.08 },
        Night: { tone: [ -34, -14, 40, 95 ], darkness: 0.55 },
      },
      sequence: [ 'Moontide', 'Dawn', 'Morning', 'Afternoon', 'Evening', 'Night', 'Moontide' ],
    } as unknown as JsonValue;

    /**
     * J-Lighting-Time as js/plugins.js lists it.
     * @param {boolean} status Whether it is enabled.
     * @returns {PluginsJsEntry} The entry.
     */
    const lightingTime = (status: boolean): PluginsJsEntry => ({ name: 'j/lighting/ext/J-Lighting-Time', status, description: '', parameters: {} });

    /**
     * J-TIME as js/plugins.js lists it, starting a new game at 14:00, as Chef Adventure does.
     * @param {boolean} status Whether it is enabled.
     * @returns {PluginsJsEntry} The entry.
     */
    const time = (status: boolean): PluginsJsEntry => ({
      name: 'j/time/J-TIME',
      status,
      description: '',
      parameters: { useRealTime: 'false', startingHour: '14', startingMinute: '0' },
    });

    /**
     * A window's registry with the core's kinds, and J-Lighting's module activated over the given plugins.
     * @param {PluginsJsEntry[]} plugins The project's plugins.
     * @param {ReadonlyMap<string, JsonValue | null>} configs The configs read before activating.
     * @param {ReadonlyMap<string, string>} problems Why any could not be read.
     * @returns {PluginModuleRegistry} The registry.
     */
    const registryOver = (
      plugins: PluginsJsEntry[],
      configs: ReadonlyMap<string, JsonValue | null> = new Map([ [ 'lighting', served('#ffffff') ], [ 'lighting-time', CURVE ] ]),
      problems: ReadonlyMap<string, string> = new Map()): PluginModuleRegistry =>
    {
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registerCoreEventKinds(registry);
      registry.activate([ lightingModule ], plugins, configs, problems);
      return registry;
    };

    /**
     * Every plugin the sky needs, enabled.
     */
    const SKY = () => [ lighting(true), lightingTime(true), time(true) ];

    /**
     * A 10x10 map with a note, and a torch reaching two tiles at 1, 1.
     * @param {string} note The note.
     * @returns {MapDocument} The map.
     */
    const litMap = (note: string): MapDocument =>
    {
      const torch = { ...event(1, [ page([ command(108, [ '<light:[2]>' ]) ]) ]), x: 1, y: 1 };
      return MapDocument.fromJson('map:6', { ...buildMapJson(), width: 10, height: 10, data: new Array(10 * 10 * 6).fill(0), note, events: [ null, torch ] });
    };

    it('casts the sky\'s colour first, then draws the dark and the rings, while J-Lighting-Time and J-TIME are enabled too', () =>
    {
      // Arrange: every plugin the sky needs.

      // Act.
      const layers = registryOver(SKY()).lightingLayers().map(layer => [ layer.id, layer.shownInGame === true ]);

      // Assert.
      expect(layers)
        .toStrictEqual([ [ SKY_TONE_ID, true ], [ 'lighting.dark', true ], [ 'lighting.rings', false ] ]);
    });

    it('offers no clock of its own, even casting the sky, since J-TIME\'s module offers the one clock', () =>
    {
      // Arrange.
      const registry = registryOver(SKY());

      // Act.
      const offer = registry.clockOffer();

      // Assert.
      expect([ offer, registry.lightingLayers().map(layer => layer.id) ])
        .toStrictEqual([ null, [ SKY_TONE_ID, 'lighting.dark', 'lighting.rings' ] ]);
    });

    it('casts no sky without J-Lighting-Time, or with J-TIME disabled', () =>
    {
      // Arrange: J-TIME without the extension; the extension with J-TIME off.
      const projects = [ [ lighting(true), time(true) ], [ lighting(true), lightingTime(true), time(false) ] ];

      // Act.
      const registries = projects.map(plugins => registryOver(plugins));

      // Assert.
      expect(registries.map(registry => registry.lightingLayers().map(layer => layer.id)))
        .toStrictEqual([ [ 'lighting.dark', 'lighting.rings' ], [ 'lighting.dark', 'lighting.rings' ] ]);
    });

    it('names the curve as a config it reads only while J-Lighting-Time and J-TIME are enabled', () =>
    {
      // Arrange: the module as the editor ships it.

      // Act.
      const { extensionConfigs } = lightingModule;

      // Assert.
      expect(extensionConfigs)
        .toStrictEqual([ { name: 'lighting-time', plugins: [ 'J-Lighting-Time', 'J-TIME' ] } ]);
    });

    it('darkens a field at 22:00 with its torch cut through, compounds a dark map\'s own, and leaves a map with no sky its own', () =>
    {
      // Arrange: a field with no darkness of its own, a cave at 85% under the sky, and the same cave tagged to have none;
      // every picture is plain white, as no canvas paints here.
      const pictureFor = vi.spyOn(LightPictures.prototype, 'pictureFor').mockReturnValue(Texture.WHITE);
      const dark = registryOver(SKY()).lightingLayers().find(layer => layer.id === LIGHT_MASK_ID) as LightingLayerDefinition;
      const maps = [ litMap(''), litMap('<ambient:[85]>'), litMap('<noToneChange>\n<ambient:[85]>') ];
      const shown: number[][] = [];

      // Act: each drawn at 22:00, writing down the fill each lit piece made for it shows with, and what its lights are
      // drawn over.
      maps.forEach(document =>
      {
        const cleared: number[] = [];
        const renderer = { render: (options: { clearColor: number }) => cleared.push(options.clearColor) } as unknown as Renderer;
        const drawing = dark.create(stageOn(new Container()));
        stand.fills.splice(0);
        drawing.draw({ document, renderer, context: 1, clock: { ...START, timeOfDay: 1320 }, pages: ENGINE_PAGES, view: WHOLE_VIEW });
        shown.push([ ...stand.fills.map(piece => piece.fill), ...cleared ]);
        drawing.destroy();
      });
      pictureFor.mockRestore();

      // Assert: 63.5% dark over the field, 94.5% over the cave, and the tagged cave's own 85%, the torch's light drawn
      // over black each time.
      expect(shown)
        .toStrictEqual([ [ 0x5d5d5d, 0x000000 ], [ 0x0e0e0e, 0x000000 ], [ 0x262626, 0x000000 ] ]);
    });

    it('casts the curve\'s tone at the clock\'s hour over a map with a sky, and none over a map tagged to have none', () =>
    {
      // Arrange: the sky's drawing for a field and for a tagged cave, each writing down every tone it casts.
      const sky = registryOver(SKY()).lightingLayers().find(layer => layer.id === SKY_TONE_ID) as LightingLayerDefinition;
      const cast: (readonly number[] | null)[][] = [];

      // Act: each drawn at 22:00.
      [ litMap(''), litMap('<noToneChange>') ].forEach(document =>
      {
        const tones: (readonly number[] | null)[] = [];
        const drawing = sky.create({ layer: new Container(), tileSize: 48, castTone: tone => tones.push(tone) });
        drawing.draw({ document, renderer: {} as Renderer, context: 1, clock: { ...START, timeOfDay: 1320 }, pages: ENGINE_PAGES, view: WHOLE_VIEW });
        cast.push(tones);
      });

      // Assert: Night halfway to Moontide over the field; nothing over the cave.
      expect(cast)
        .toStrictEqual([ [ [ -32, -16, 37, 133 ] ], [] ]);
    });

    it('says over the map why the sky stays put when the curve could not be read', () =>
    {
      // Arrange: the curve's file is missing.
      const configs = new Map<string, JsonValue | null>([ [ 'lighting', served('#ffffff') ], [ 'lighting-time', null ] ]);
      const problems = new Map([ [ 'lighting-time', 'open /game/data/config.lighting-time.json: no such file or directory' ] ]);

      // Act.
      const registry = registryOver(SKY(), configs, problems);

      // Assert.
      expect([ registry.notices().map(notice => notice.id), registry.lightingLayers().map(layer => layer.id) ])
        .toStrictEqual([ [ 'lighting.time-config' ], [ 'lighting.dark', 'lighting.rings' ] ]);
    });
  });

  describe('isLight', () =>
  {
    it('reads the light tag in a comment on any page, with its options in any order and one space where allowed', () =>
    {
      // Arrange: a reach alone; colour and effect; spaced, with a fractional reach; on a lit second page alone; in
      // capitals on a comment's second line.
      const lights = [
        event(1, [ page([ command(108, [ '<light:[5]>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[6, #ffbb73, flicker]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light: [4.5, #ffdca8, 90, flicker]>' ]) ]) ]),
        event(4, [ page([]), page([ command(108, [ '<light:[3,pulse]>' ]) ]) ]),
        event(5, [ page([ command(108, [ '<hourRangePage:[18, 6]>' ]), command(408, [ '<LIGHT:[2]>' ]) ]) ]),
      ];

      // Act.
      const read = lights.map(isLight);

      // Assert.
      expect(read)
        .toStrictEqual([ true, true, true, true, true ]);
    });

    it('makes no light of a tag J-Lighting would not read, a map\'s darkness, or the tag anywhere but a comment', () =>
    {
      // Arrange: no brackets; no reach; a reach of nothing; a tag sharing its start; words after the tag; ambient
      // darkness; spoken in a message.
      const nearMisses = [
        event(1, [ page([ command(108, [ '<light:5>' ]) ]) ]),
        event(2, [ page([ command(108, [ '<light:[]>' ]) ]) ]),
        event(3, [ page([ command(108, [ '<light:[0]>' ]) ]) ]),
        event(4, [ page([ command(108, [ '<lights:[5]>' ]) ]) ]),
        event(5, [ page([ command(108, [ '<light:[5]> on the wall' ]) ]) ]),
        event(6, [ page([ command(108, [ '<ambient:[60]>' ]) ]) ]),
        event(7, [ page(text([ '<light:[5]>' ])) ]),
      ];

      // Act.
      const read = nearMisses.map(isLight);

      // Assert.
      expect(read)
        .toStrictEqual([ false, false, false, false, false, false, false ]);
    });
  });
});
