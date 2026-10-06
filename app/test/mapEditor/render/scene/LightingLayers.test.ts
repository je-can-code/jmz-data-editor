import type { Container, Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { LightingFrame, LightingLayerDefinition, LightingStage } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import type { ChangeEffect } from '../../../../src/mapEditor/render/documentChanges.ts';
import { LightingLayers } from '../../../../src/mapEditor/render/scene/LightingLayers.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * What plugin modules draw into a view's lighting layer: one drawing per lighting layer they contribute, made once and
 * kept for as long as that lighting layer is handed over again, each in a container of its own, in the order they were
 * contributed, inside the one container the view's Lighting switch shows and hides. One no longer handed over is let
 * go, container and all.
 *
 * The drawings draw only when due, and once however many changes made them due: after a new drawing is made, after the
 * map opens or the context comes back, and after a change to anything but the tiles. A tile change is what a brush
 * stroke makes, many times a second, and nothing a module lights the map with reads tiles, so it never makes them due.
 * While the layer is hidden they do not draw, and they catch up once it shows. A drawing that throws is reported on its
 * own and never stops the others drawing.
 */

/**
 * A lighting layer whose drawing writes down what happens to it, and the stage each drawing was made on.
 * @param {string} id The lighting layer's id.
 * @param {string[]} log Where everything is written.
 * @returns {{ definition: LightingLayerDefinition, stages: LightingStage[] }} The lighting layer and its stages.
 */
const loggedLayer = (id: `${string}.${string}`, log: string[]) =>
{
  const stages: LightingStage[] = [];
  const definition: LightingLayerDefinition = {
    id,
    title: id,
    create: stage =>
    {
      stages.push(stage);
      log.push(`${id} made`);
      return {
        draw: (given: LightingFrame) => log.push(`${id} drew map ${given.document.mapId}`),
        destroy: () => log.push(`${id} let go`),
      };
    },
  };
  return { definition, stages };
};

/**
 * What a frame hands the drawings: map 7, and a renderer nothing here draws with.
 * @returns {LightingFrame} The frame.
 */
const frame = (): LightingFrame => ({ document: MapDocument.fromJson('map:7', buildMapJson()), renderer: {} as Renderer });

/**
 * A view's lighting holding the given lighting layers, drawn once so nothing is due.
 * @param {LightingLayerDefinition[]} definitions The lighting layers.
 * @returns {LightingLayers} The lighting.
 */
const drawnWith = (definitions: LightingLayerDefinition[]): LightingLayers =>
{
  const lighting = new LightingLayers(48);
  lighting.setDefinitions(definitions);
  lighting.draw(frame());
  return lighting;
};

describe('LightingLayers', () =>
{
  afterEach(() =>
  {
    vi.restoreAllMocks();
  });

  it('makes a drawing for each lighting layer on a container of its own, in the order they come', () =>
  {
    // Arrange.
    const log: string[] = [];
    const rings = loggedLayer('lighting.rings', log);
    const dark = loggedLayer('lighting.dark', log);
    const lighting = new LightingLayers(48);

    // Act.
    lighting.setDefinitions([ rings.definition, dark.definition ]);

    // Assert: each stage's container is the layer's child in that order, at the tile size given.
    const [ ringStage ] = rings.stages;
    const [ darkStage ] = dark.stages;
    expect([ log, lighting.layer.children, [ ringStage.tileSize, darkStage.tileSize ], lighting.count ])
      .toStrictEqual([ [ 'lighting.rings made', 'lighting.dark made' ], [ ringStage.layer, darkStage.layer ], [ 48, 48 ], 2 ]);
  });

  it('keeps a drawing whose lighting layer comes again, and lets go of one that does not, container and all', () =>
  {
    // Arrange.
    const log: string[] = [];
    const rings = loggedLayer('lighting.rings', log);
    const dark = loggedLayer('lighting.dark', log);
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ rings.definition, dark.definition ]);
    const [ ringStage ] = rings.stages;

    // Act.
    lighting.setDefinitions([ dark.definition ]);

    // Assert.
    expect([ log, lighting.layer.children, ringStage.layer.destroyed ])
      .toStrictEqual([ [ 'lighting.rings made', 'lighting.dark made', 'lighting.rings let go' ], [ dark.stages[0].layer ], true ]);
  });

  it('orders the containers as the lighting layers come', () =>
  {
    // Arrange.
    const log: string[] = [];
    const rings = loggedLayer('lighting.rings', log);
    const dark = loggedLayer('lighting.dark', log);
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ rings.definition, dark.definition ]);

    // Act.
    lighting.setDefinitions([ dark.definition, rings.definition ]);

    // Assert.
    expect(lighting.layer.children)
      .toStrictEqual([ dark.stages[0].layer, rings.stages[0].layer ]);
  });

  it('draws every drawing once when due, with the frame, and not again until something makes it due', () =>
  {
    // Arrange.
    const log: string[] = [];
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ loggedLayer('lighting.rings', log).definition, loggedLayer('lighting.dark', log).definition ]);

    // Act.
    const drew = [ lighting.draw(frame()), lighting.draw(frame()) ];

    // Assert.
    expect([ drew, log.slice(2) ])
      .toStrictEqual([ [ true, false ], [ 'lighting.rings drew map 7', 'lighting.dark drew map 7' ] ]);
  });

  it('is not made due by a change to the tiles alone', () =>
  {
    // Arrange: a brush step's change.
    const lighting = drawnWith([ loggedLayer('lighting.rings', []).definition ]);
    const step: ChangeEffect = { kind: 'tiles', indices: [ 4, 5 ] };

    // Act.
    lighting.hear(step);

    // Assert.
    expect(lighting.draw(frame()))
      .toBe(false);
  });

  it('is made due by a change to anything but the tiles', () =>
  {
    // Arrange: an event changed, the event list changed, the map rebuilt, and a property changed.
    const effects: ChangeEffect[] = [ { kind: 'event', id: 3 }, { kind: 'events' }, { kind: 'rebuild' }, { kind: 'overlays' } ];
    const lightings = effects.map(() => drawnWith([ loggedLayer('lighting.rings', []).definition ]));

    // Act.
    lightings.forEach((lighting, index) => lighting.hear(effects[index]));

    // Assert.
    expect(lightings.map(lighting => lighting.draw(frame())))
      .toStrictEqual([ true, true, true, true ]);
  });

  it('is made due by being told so, as for a map just opened or a context given back', () =>
  {
    // Arrange.
    const lighting = drawnWith([ loggedLayer('lighting.rings', []).definition ]);

    // Act.
    lighting.markStale();

    // Assert.
    expect(lighting.draw(frame()))
      .toBe(true);
  });

  it('is made due by a new drawing, and not by drawings kept as they were', () =>
  {
    // Arrange.
    const rings = loggedLayer('lighting.rings', []).definition;
    const kept = drawnWith([ rings ]);
    const grown = drawnWith([ rings ]);

    // Act.
    kept.setDefinitions([ rings ]);
    grown.setDefinitions([ rings, loggedLayer('lighting.dark', []).definition ]);

    // Assert.
    expect([ kept.draw(frame()), grown.draw(frame()) ])
      .toStrictEqual([ false, true ]);
  });

  it('draws nothing while the layer is hidden, and catches up once it shows', () =>
  {
    // Arrange: an edit made while the layer was hidden.
    const log: string[] = [];
    const lighting = drawnWith([ loggedLayer('lighting.rings', log).definition ]);
    lighting.layer.visible = false;
    lighting.hear({ kind: 'event', id: 1 });

    // Act.
    const hidden = lighting.draw(frame());
    lighting.layer.visible = true;
    const shown = lighting.draw(frame());

    // Assert.
    expect([ hidden, shown, log.filter(line => line.includes('drew')).length ])
      .toStrictEqual([ false, true, 2 ]);
  });

  it('has nothing to draw while no module draws there', () =>
  {
    // Arrange.
    const lighting = new LightingLayers(48);

    // Act.
    const drew = lighting.draw(frame());

    // Assert.
    expect(drew)
      .toBe(false);
  });

  it('reports a drawing that throws on its own, and still draws the others', () =>
  {
    // Arrange: a drawing that fails before one that works.
    const log: string[] = [];
    const broken: LightingLayerDefinition = {
      id: 'lighting.broken',
      title: 'Broken',
      create: () => ({
        draw: () =>
        {
          throw new Error('no light');
        },
        destroy: () => undefined,
      }),
    };
    const raised: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ broken, loggedLayer('lighting.rings', log).definition ]);

    // Act.
    const drew = lighting.draw(frame());

    // Assert: the frame still drew, the working drawing with it, and the failure waits to be raised on its own.
    expect([ drew, log, raised.length ])
      .toStrictEqual([ true, [ 'lighting.rings made', 'lighting.rings drew map 7' ], 1 ]);
    expect(() => raised[0]())
      .toThrow('no light');
  });

  it('lets every drawing go, and the layer with them', () =>
  {
    // Arrange.
    const log: string[] = [];
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ loggedLayer('lighting.rings', log).definition, loggedLayer('lighting.dark', log).definition ]);
    const { layer } = lighting;

    // Act.
    lighting.destroy();

    // Assert.
    expect([ log.slice(2), lighting.count, (layer as Container).destroyed ])
      .toStrictEqual([ [ 'lighting.rings let go', 'lighting.dark let go' ], 0, true ]);
  });
});
