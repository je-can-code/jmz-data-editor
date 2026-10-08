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
import type { PluginsJsEntry } from '../../../../src/services/plugins/PluginsJsReader.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { WHOLE_VIEW } from '../../support/viewFixtures.ts';

/*
 * J-Weather's module switches on only while J-Weather is enabled in js/plugins.js, which is what offers every map view
 * its Weather switch: it then draws each map's own weather into the weather layer, from the project's
 * config.weather.json. Weather must cost a map without any nothing, so the module reads no config while it switches on:
 * it says which maps have weather from their notes and the sky alone, and the config is asked for only once a map with
 * weather is drawn. A config the module cannot draw from (unread, in the server's words where it gave any, or without
 * its motions and its presets) is said over every map view once it has been read, so a map shown without its weather is
 * never taken for one that has none, and the notice clears as soon as a later read serves; a config that serves says
 * nothing, and neither does one never read.
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
