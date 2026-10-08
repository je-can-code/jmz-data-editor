import { Container, type WebGLRenderer } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { CommandCatalog } from '../../../../src/mapEditor/core/commands/CommandCatalog.ts';
import type { JsonValue } from '../../../../src/mapEditor/core/model/json.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { ConfigRead, OnDemandConfig } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import { PluginModuleRegistry } from '../../../../src/mapEditor/core/modules/PluginModuleRegistry.ts';
import type { SkyWeather, WeatherFrame } from '../../../../src/mapEditor/core/renderer/weatherLayer.ts';
import { MAP_WEATHER_ID, WEATHER_CONFIG_NOTICE_ID, weatherConfigNotice, weatherModule } from '../../../../src/mapEditor/modules/weather/weatherModule.ts';
import { WeatherOnDemand } from '../../../../src/mapEditor/modules/weather/weatherOnDemand.ts';
import { SHIPPED_MODULES } from '../../../../src/mapEditor/services/pluginModules.ts';
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * J-Weather's module switches on only while J-Weather is enabled in js/plugins.js, which is what offers every map view
 * its Weather switch: it then draws each map's own weather into the weather layer, from the project's
 * config.weather.json. Weather must cost a map without any nothing, so the module reads no config while it switches on:
 * it says which maps have weather from their notes and the sky alone, and the config is asked for only once something
 * needs it, a map with weather drawn or the Weather section shown. A config the module cannot draw from (unread, in the
 * server's words where it gave any, or without its motions and its presets) is said over every map view once it has
 * been read, so a map shown without its weather is never taken for one that has none, and the notice clears as soon as
 * a later read serves; a config that serves says nothing, and neither does one never read.
 *
 * The module adds a Weather section to Map Properties (its own tests hold what each setting reads and writes), handing
 * the views the config to ask for once the section shows rather than asking for it itself. J-Weather reads whether a map
 * has a sky, as J-Lighting-Time does, and the module says so, so the editor's modules together offer the map's sky in
 * Map Properties exactly once while any plugin reading it is on: in the Lighting section, worded for both, while
 * J-Lighting-Time is on, and otherwise in this one; and nowhere while neither is, J-Weather-Time on its own included,
 * since it cannot run without J-Weather.
 */
describe('weatherModule', () =>
{
  /**
   * A plugin as js/plugins.js lists it.
   * @param {string} name Its path.
   * @param {boolean} status Whether it is enabled.
   * @returns {PluginsJsEntry} The entry.
   */
  const plugin = (name: string, status = true): PluginsJsEntry => ({ name, status, description: '', parameters: {} });

  /**
   * A config the module can draw from.
   */
  const CONFIG = { motions: { fall: { edge: 'top' } }, presets: { snow: { stops: { moderate: [] } } } } as unknown as JsonValue;

  /**
   * J-Weather's config as the window holds it: unread until the test reads it in, which its listeners hear, noting how
   * often the module asked for it.
   * @returns {{ config: OnDemandConfig, asked: () => number, arrive: (read: ConfigRead) => void }} The config, how
   * often it was asked for, and the read arriving.
   */
  const heldConfig = () =>
  {
    const listeners = new Set<() => void>();
    let read: ConfigRead | undefined;
    let asked = 0;
    const config: OnDemandConfig = {
      current: () => read,
      request: () =>
      {
        asked += 1;
      },
      subscribe: listener =>
      {
        listeners.add(listener);
        return () =>
        {
          listeners.delete(listener);
        };
      },
    };
    const arrive = (next: ConfigRead) =>
    {
      read = next;
      listeners.forEach(listener => listener());
    };
    return { config, asked: () => asked, arrive };
  };

  /**
   * Switches the module on, or not, over some plugins, holding its config as given.
   * @param {PluginsJsEntry[]} plugins The project's plugins.
   * @param {OnDemandConfig} config The window's copy of J-Weather's config.
   * @returns {PluginModuleRegistry} The registry.
   */
  const activated = (plugins: PluginsJsEntry[], config: OnDemandConfig = heldConfig().config) =>
  {
    const registry = new PluginModuleRegistry(new CommandCatalog());
    registry.activate([ weatherModule ], plugins, new Map(), new Map(), () => config);
    return registry;
  };

  it('draws each map\'s weather into the weather layer while J-Weather is enabled, reading no config to switch on', () =>
  {
    // Arrange.
    const held = heldConfig();

    // Act.
    const registry = activated([ plugin('j/weather/J-Weather') ], held.config);

    // Assert: on, its weather layer added, nothing said and nothing asked of the server.
    expect([ registry.isActive('weather'), registry.weatherLayers().map(layer => [ layer.id, layer.title ]), registry.notices(), held.asked() ])
      .toStrictEqual([ true, [ [ MAP_WEATHER_ID, 'Weather' ] ], [], 0 ]);
  });

  it('stays off, drawing no weather, while J-Weather is listed but switched off, or not listed at all', () =>
  {
    // Arrange.
    const off = [ plugin('j/weather/J-Weather', false), plugin('j/lighting/J-Lighting') ];
    const absent = [ plugin('j/lighting/J-Lighting') ];

    // Act.
    const registries = [ activated(off), activated(absent) ];

    // Assert.
    expect(registries.map(registry => [ registry.isActive('weather'), registry.weatherLayers().length ]))
      .toStrictEqual([ [ false, 0 ], [ false, 0 ] ]);
  });

  it('draws on a map naming a look, and on an open-sky map under a sky, but not on one opting out, naming none, or roofed', () =>
  {
    // Arrange: the module's weather layer, and maps by their notes, each under a sky or none.
    const [ layer ] = activated([ plugin('j/weather/J-Weather') ]).weatherLayers();
    const sky: SkyWeather = { preset: 'rain', intensity: 'heavy' };
    const frameOf = (note: string, given: SkyWeather | null): WeatherFrame => ({
      document: MapDocument.fromJson('map:1', { ...buildMapJson(), note }),
      renderer: {} as WebGLRenderer,
      context: 1,
      clock: { frames: 0, animating: true },
      view: WHOLE_VIEW,
      images: null,
      sky: given,
    });
    const cases: [ string, SkyWeather | null ][] = [
      [ '<weather:snow>', null ],
      [ '', sky ],
      [ '<weather:snow>\n<noWeather>', sky ],
      [ '', null ],
      [ '<noToneChange>', sky ],
    ];

    // Act.
    const draws = cases.map(([ note, given ]) => layer.drawsOn(frameOf(note, given)));

    // Assert.
    expect(draws)
      .toStrictEqual([ true, true, false, false, false ]);
  });

  it('makes a map\'s weather for each view as one that reads the config only once it is asked to draw', () =>
  {
    // Arrange.
    const held = heldConfig();
    const [ layer ] = activated([ plugin('j/weather/J-Weather') ], held.config).weatherLayers();

    // Act.
    const drawing = layer.create({ layer: new Container(), tileSize: 48 });

    // Assert.
    expect([ drawing instanceof WeatherOnDemand, held.asked() ])
      .toStrictEqual([ true, 0 ]);
  });

  it('says over every map view why the config could not be read once it was, in the server\'s words, until a read serves', () =>
  {
    // Arrange: switched on, the config not yet read.
    const held = heldConfig();
    const registry = activated([ plugin('j/weather/J-Weather') ], held.config);
    const words = 'decoding config.weather.json: json: unknown field "forecastFonts"';
    const said: unknown[] = [ registry.notices() ];

    // Act: the server refuses the file, then the file is fixed.
    held.arrive({ content: null, problem: words });
    said.push(registry.notices());
    held.arrive({ content: CONFIG, problem: null });
    said.push(registry.notices());

    // Assert.
    expect(said)
      .toStrictEqual([
        [],
        [ {
          id: WEATHER_CONFIG_NOTICE_ID,
          title: 'No weather is drawn until data/config.weather.json is fixed.',
          detail: `It could not be read: ${words}. This clears as soon as the file is fixed.`,
        } ],
        [],
      ]);
  });

  it('adds a Weather section to Map Properties, which asks for the config only once it shows', () =>
  {
    // Arrange: switched on, the config not yet read, and a map naming a look.
    const held = heldConfig();
    const registry = activated([ plugin('j/weather/J-Weather') ], held.config);
    const map = MapDocument.fromJson('map:1', { ...buildMapJson(), note: '<weather:snow>' });

    // Act: the section works out its settings, as it does while it is merely worked out, before it shows.
    const [ section ] = registry.mapPropertiesSections();
    const labels = section.source(map).fields.map(field => field.label);

    // Assert: the section hands the views the config to ask for, and nothing has asked yet.
    expect([ section.id, section.title, labels, section.config === held.config, held.asked() ])
      .toStrictEqual([ 'weather.settings', 'Weather', [ 'Look', 'No weather', 'Sky follows the weather' ], true, 0 ]);
  });

  it('offers a map\'s sky once in Map Properties while any plugin reading it is on, and nowhere while none is', () =>
  {
    // Arrange: the editor's modules over a cave naming a look, under each set of plugins: all of them, as the game
    // ships; the weather plugins alone; J-Lighting without its time extension beside J-Weather; J-Lighting's time
    // extension without J-Weather; J-Lighting alone; and J-Weather-Time listed without the J-Weather it cannot run
    // without.
    const cave = MapDocument.fromJson('map:1', { ...buildMapJson(), note: '<noToneChange>\n<weather:fog>' });
    const time = plugin('j/time/J-TIME');
    const lighting = plugin('j/lighting/J-Lighting');
    const lightingTime = plugin('j/lighting/ext/J-Lighting-Time');
    const weather = plugin('j/weather/J-Weather');
    const weatherTime = plugin('j/weather/ext/J-Weather-Time');
    const projects = [
      [ time, lighting, lightingTime, weather, weatherTime ],
      [ time, weather, weatherTime ],
      [ lighting, weather ],
      [ time, lighting, lightingTime ],
      [ lighting ],
      [ time, lighting, plugin('j/weather/J-Weather', false), weatherTime ],
    ];

    // Act.
    const sections = projects.map(plugins =>
    {
      const registry = new PluginModuleRegistry(new CommandCatalog());
      registry.activate(SHIPPED_MODULES, plugins, new Map(), new Map(), () => heldConfig().config);
      return registry.mapPropertiesSections().map(section => [ section.title, section.source(cave).fields.map(field => field.label) ]);
    });

    // Assert.
    expect(sections)
      .toStrictEqual([
        [ [ 'Lighting', [ 'Darkness', 'Sky follows the clock and the weather' ] ], [ 'Weather', [ 'Look', 'No weather' ] ] ],
        [ [ 'Weather', [ 'Look', 'No weather', 'Sky follows the weather' ] ] ],
        [ [ 'Lighting', [ 'Darkness' ] ], [ 'Weather', [ 'Look', 'No weather', 'Sky follows the weather' ] ] ],
        [ [ 'Lighting', [ 'Darkness', 'Sky follows the clock' ] ] ],
        [ [ 'Lighting', [ 'Darkness' ] ] ],
        [ [ 'Lighting', [ 'Darkness' ] ] ],
      ]);
  });

  describe('weatherConfigNotice', () =>
  {
    it('says a config was not read when nothing said why, and one without its motions or its presets needs them', () =>
    {
      // Arrange: an unread config with no reason, one holding looks but no motions, and one that serves.
      const missing = { presets: {} } as unknown as JsonValue;

      // Act.
      const notices = [
        weatherConfigNotice({ content: null, problem: null }),
        weatherConfigNotice({ content: missing, problem: null }),
        weatherConfigNotice({ content: CONFIG, problem: null }),
      ];

      // Assert.
      expect(notices)
        .toStrictEqual([
          { id: WEATHER_CONFIG_NOTICE_ID, title: 'No weather is drawn until data/config.weather.json is fixed.', detail: 'It was not read. This clears as soon as the file is fixed.' },
          {
            id: WEATHER_CONFIG_NOTICE_ID,
            title: 'No weather is drawn until data/config.weather.json is fixed.',
            detail: 'It needs its motions and its presets, each a table by name. This clears as soon as the file is fixed.',
          },
          null,
        ]);
    });
  });
});
