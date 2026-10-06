import type { Container, Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { LightingFrame, LightingLayerDefinition, LightingStage, ScreenTone } from '../../../../src/mapEditor/core/renderer/lightingLayer.ts';
import type { ChangeEffect } from '../../../../src/mapEditor/render/documentChanges.ts';
import { LightingLayers } from '../../../../src/mapEditor/render/scene/LightingLayers.ts';
import { buildMapJson } from '../../support/fixtures.ts';
import { ENGINE_PAGES } from '../../support/pageFixtures.ts';

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
 *
 * In every frame they are not due, each drawing is handed the clock to move on to instead, and the frame has something
 * new to show only when one of them moved. While the layer is hidden, as with the Lighting switch off, nothing is handed
 * the clock at all. A drawing that throws, drawing or moving on, is left still, ticked no more until it next draws, so
 * its failure is raised once rather than in every frame.
 *
 * A drawing may cast a tone over what the game tones, through its stage. The view shows one tone, as the game's screen
 * does: the one cast by the drawing contributed last that casts any, passed on whenever it changes and only then, a
 * tone cast while the drawing is still being made included; a drawing let go takes its tone with it.
 */

/**
 * A lighting layer whose drawing writes down what happens to it, and the stage each drawing was made on.
 * @param {string} id The lighting layer's id.
 * @param {string[]} log Where everything is written.
 * @param {boolean} moves Whether its drawing changes what it shows as the clock moves.
 * @returns {{ definition: LightingLayerDefinition, stages: LightingStage[] }} The lighting layer and its stages.
 */
const loggedLayer = (id: `${string}.${string}`, log: string[], moves = false) =>
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
        tick: (given: LightingFrame) =>
        {
          log.push(`${id} moved on to frame ${given.clock.frames}`);
          return moves;
        },
        destroy: () => log.push(`${id} let go`),
      };
    },
  };
  return { definition, stages };
};

/**
 * What a frame hands the drawings: map 7, a renderer nothing here draws with, the view's first context, the view's
 * clock, and the pages its events show.
 * @param {number} frames The clock's frame.
 * @returns {LightingFrame} The frame.
 */
const frame = (frames = 0): LightingFrame => ({
  document: MapDocument.fromJson('map:7', buildMapJson()),
  renderer: {} as Renderer,
  context: 1,
  clock: { frames, animating: true, timeOfDay: 840 },
  pages: ENGINE_PAGES,
});

/**
 * A lighting layer whose drawing casts nothing of its own accord, handing out its stage so a test can cast through it,
 * and optionally casting a tone while it is made.
 * @param {string} id The lighting layer's id.
 * @param {ScreenTone | null} castWhileMade A tone to cast while the drawing is made, or null for none.
 * @returns {{ definition: LightingLayerDefinition, stages: LightingStage[] }} The lighting layer and its stages.
 */
const tonedLayer = (id: `${string}.${string}`, castWhileMade: ScreenTone | null = null) =>
{
  const stages: LightingStage[] = [];
  const definition: LightingLayerDefinition = {
    id,
    title: id,
    create: stage =>
    {
      stages.push(stage);
      if (castWhileMade !== null)
      {
        stage.castTone(castWhileMade);
      }

      return { draw: () => undefined, tick: () => false, destroy: () => stage.castTone(null) };
    },
  };
  return { definition, stages };
};

/**
 * Night halfway to Moontide, and the evening's warm cast.
 */
const NIGHT: ScreenTone = [ -32, -16, 37, 133 ];
const EVENING: ScreenTone = [ 26, 0, -34, 22 ];

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
    const drew = [ lighting.draw(frame()), lighting.draw(frame(1)) ];

    // Assert: drawn in the first frame, and only moved on in the second.
    expect([ drew, log.slice(2) ])
      .toStrictEqual([
        [ true, false ],
        [ 'lighting.rings drew map 7', 'lighting.dark drew map 7', 'lighting.rings moved on to frame 1', 'lighting.dark moved on to frame 1' ],
      ]);
  });

  it('hands every drawing the clock between draws, and has something new to show when any of them moved', () =>
  {
    // Arrange: a still drawing before one that moves with time, both drawn.
    const log: string[] = [];
    const lighting = drawnWith([ loggedLayer('lighting.rings', log).definition, loggedLayer('lighting.dark', log, true).definition ]);

    // Act.
    const moved = lighting.draw(frame(5));

    // Assert.
    expect([ moved, log.slice(-2) ])
      .toStrictEqual([ true, [ 'lighting.rings moved on to frame 5', 'lighting.dark moved on to frame 5' ] ]);
  });

  it('hands out no clock while the layer is hidden, as with the Lighting switch off', () =>
  {
    // Arrange: a drawing that moves with time, drawn, then the layer hidden.
    const log: string[] = [];
    const lighting = drawnWith([ loggedLayer('lighting.dark', log, true).definition ]);
    const before = log.length;
    lighting.layer.visible = false;

    // Act.
    const moved = [ lighting.draw(frame(1)), lighting.draw(frame(2)) ];

    // Assert.
    expect([ moved, log.length - before ])
      .toStrictEqual([ [ false, false ], 0 ]);
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
        tick: () => false,
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

  it('leaves a drawing that failed to draw still, handing it no clock until it draws again', () =>
  {
    // Arrange: a drawing whose first draw fails and whose next works, its ticks written down.
    const log: string[] = [];
    let draws = 0;
    const flaky: LightingLayerDefinition = {
      id: 'lighting.flaky',
      title: 'Flaky',
      create: () => ({
        draw: () =>
        {
          draws += 1;
          if (draws === 1)
          {
            throw new Error('not yet');
          }
        },
        tick: given =>
        {
          log.push(`moved on to frame ${given.clock.frames}`);
          return false;
        },
        destroy: () => undefined,
      }),
    };
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined);
    const lighting = new LightingLayers(48);
    lighting.setDefinitions([ flaky ]);

    // Act: the failed draw, a frame after it, the draw that works, and a frame after that.
    lighting.draw(frame(0));
    lighting.draw(frame(1));
    lighting.markStale();
    lighting.draw(frame(2));
    lighting.draw(frame(3));

    // Assert.
    expect(log)
      .toStrictEqual([ 'moved on to frame 3' ]);
  });

  it('raises a drawing\'s failure to move on once, leaves it still until it next draws, and still moves the others', () =>
  {
    // Arrange: a drawing whose ticks fail, beside one that moves; both drawn.
    const log: string[] = [];
    let attempts = 0;
    const stuck: LightingLayerDefinition = {
      id: 'lighting.stuck',
      title: 'Stuck',
      create: () => ({
        draw: () => log.push('stuck drew'),
        tick: () =>
        {
          attempts += 1;
          throw new Error('cannot move');
        },
        destroy: () => undefined,
      }),
    };
    const raised: (() => void)[] = [];
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(callback => raised.push(callback));
    const lighting = drawnWith([ stuck, loggedLayer('lighting.dark', log, true).definition ]);

    // Act: two frames, a draw, and a frame after it.
    const moved = [ lighting.draw(frame(1)), lighting.draw(frame(2)) ];
    lighting.markStale();
    lighting.draw(frame(3));
    lighting.draw(frame(4));

    // Assert: tried in the first frame and again only once it drew; each failure raised once; the other moved on in
    // every frame.
    expect([ moved, attempts, raised.length, log.filter(line => line.includes('moved on')) ])
      .toStrictEqual([
        [ true, true ],
        2,
        2,
        [ 'lighting.dark moved on to frame 1', 'lighting.dark moved on to frame 2', 'lighting.dark moved on to frame 4' ],
      ]);
    expect(() => raised[0]())
      .toThrow('cannot move');
  });

  describe('tone', () =>
  {
    it('passes on the tone a drawing casts, and none once it casts none', () =>
    {
      // Arrange: one drawing, and a listener writing down every tone passed on.
      const passed: (ScreenTone | null)[] = [];
      const sky = tonedLayer('lighting.sky');
      const lighting = new LightingLayers(48, tone => passed.push(tone));
      lighting.setDefinitions([ sky.definition ]);
      const [ stage ] = sky.stages;

      // Act.
      stage.castTone(NIGHT);
      const cast = lighting.tone;
      stage.castTone(null);

      // Assert.
      expect([ passed, cast, lighting.tone ])
        .toStrictEqual([ [ NIGHT, null ], NIGHT, null ]);
    });

    it('passes on the tone of the drawing contributed last that casts one', () =>
    {
      // Arrange: two drawings, the second contributed last, and a third after them casting nothing.
      const passed: (ScreenTone | null)[] = [];
      const first = tonedLayer('lighting.first');
      const second = tonedLayer('lighting.second');
      const lighting = new LightingLayers(48, tone => passed.push(tone));
      lighting.setDefinitions([ first.definition, second.definition, tonedLayer('lighting.quiet').definition ]);

      // Act: the second casts, then the first casts over nothing it outranks, then the second lets go.
      second.stages[0].castTone(EVENING);
      first.stages[0].castTone(NIGHT);
      second.stages[0].castTone(null);

      // Assert: the evening holds while the second casts it; the night only once the second casts none.
      expect(passed)
        .toStrictEqual([ EVENING, NIGHT ]);
    });

    it('passes nothing on when a drawing casts the tone already cast', () =>
    {
      // Arrange: the night cast.
      const passed: (ScreenTone | null)[] = [];
      const sky = tonedLayer('lighting.sky');
      const lighting = new LightingLayers(48, tone => passed.push(tone));
      lighting.setDefinitions([ sky.definition ]);
      sky.stages[0].castTone(NIGHT);

      // Act: the same night again, as a new array.
      sky.stages[0].castTone([ -32, -16, 37, 133 ]);

      // Assert.
      expect(passed)
        .toStrictEqual([ NIGHT ]);
    });

    it('passes on a tone a drawing cast while it was made, once it is in place', () =>
    {
      // Arrange: a drawing casting the night as it is made.
      const passed: (ScreenTone | null)[] = [];
      const lighting = new LightingLayers(48, tone => passed.push(tone));

      // Act.
      lighting.setDefinitions([ tonedLayer('lighting.sky', NIGHT).definition ]);

      // Assert.
      expect([ passed, lighting.tone ])
        .toStrictEqual([ [ NIGHT ], NIGHT ]);
    });

    it('keeps the tone a drawing casts with nobody listening', () =>
    {
      // Arrange: lighting made with nobody to tell.
      const sky = tonedLayer('lighting.sky');
      const lighting = new LightingLayers(48);
      lighting.setDefinitions([ sky.definition ]);

      // Act.
      sky.stages[0].castTone(EVENING);

      // Assert.
      expect(lighting.tone)
        .toStrictEqual(EVENING);
    });

    it('takes a drawing\'s tone back when it is let go', () =>
    {
      // Arrange: the night cast by a drawing.
      const passed: (ScreenTone | null)[] = [];
      const sky = tonedLayer('lighting.sky', NIGHT);
      const lighting = new LightingLayers(48, tone => passed.push(tone));
      lighting.setDefinitions([ sky.definition ]);

      // Act: the module stops contributing it.
      lighting.setDefinitions([]);

      // Assert.
      expect([ passed, lighting.tone ])
        .toStrictEqual([ [ NIGHT, null ], null ]);
    });
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
