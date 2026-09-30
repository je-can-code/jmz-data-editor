import { describe, expect, it } from 'vitest';
import { createMapEvent } from '../../../../src/mapEditor/core/model/eventModel.ts';
import { MapDocument } from '../../../../src/mapEditor/core/model/MapDocument.ts';
import type { PassabilityRule } from '../../../../src/mapEditor/core/modules/PluginModule.ts';
import type { Camera } from '../../../../src/mapEditor/core/renderer/camera.ts';
import { HeadlessMapRenderer } from '../../../../src/mapEditor/core/renderer/HeadlessMapRenderer.ts';
import { GAME_LOOK, NO_OVERLAY_STATE, type MapContextMenu, type OverlayState } from '../../../../src/mapEditor/core/renderer/MapRenderer.ts';
import { buildMapJson } from '../../support/fixtures.ts';

/*
 * The renderer contract the tools build on beyond drawing: P3's brush and P5's event tools hand every renderer what
 * they point at (hover, selection, ghost previews) and hear back right clicks that did not move, with the cell and
 * the event under them; panes follow the camera, whether the pointer moved it or code did; modules add passability
 * rules and ask for their overlays to redraw. The headless renderer keeps all of it without a GPU, so those tools can
 * be tested against it, and the game look it starts with draws no auto-shadows, as the game never does.
 */
describe('renderer contract', () =>
{
  /**
   * A headless renderer on the fixture map, with a second event on the first event's cell.
   * @returns {HeadlessMapRenderer} The renderer.
   */
  const buildRenderer = (): HeadlessMapRenderer =>
  {
    const json = buildMapJson();
    json.events.push(createMapEvent(5, 0, 0));
    const renderer = new HeadlessMapRenderer();
    renderer.setDocument(MapDocument.fromJson('map:1', json));
    return renderer;
  };

  it('starts in the game look without auto-shadows, pointing at nothing', () =>
  {
    // Arrange.
    const renderer = new HeadlessMapRenderer();

    // Act.
    const { visibility, overlayState } = renderer.state;

    // Assert.
    expect([ visibility.layers.shadows, visibility.animateWater, overlayState, renderer.rendererInfo() ])
      .toStrictEqual([ false, true, NO_OVERLAY_STATE, null ]);
    expect(GAME_LOOK.layers.parallax)
      .toBe(true);
  });

  it('keeps what the tools point at, the modules\' rules, and each request to redraw their overlays', () =>
  {
    // Arrange.
    const renderer = buildRenderer();
    const state: OverlayState = {
      ...NO_OVERLAY_STATE,
      hover: { x: 1, y: 1, width: 3, height: 3 },
      selectedEvents: [ 3 ],
      ghostTiles: [ { x: 0, y: 0, layer: 0, tileId: 2816 } ],
    };
    const rules: PassabilityRule[] = [ { id: 'regions.water', title: 'Water', deny: () => null } ];

    // Act.
    renderer.setOverlayState(state);
    renderer.setPassabilityRules(rules);
    renderer.refreshOverlays();
    renderer.refreshOverlays();

    // Assert.
    expect([ renderer.state.overlayState, renderer.state.passabilityRules, renderer.state.overlayRefreshes ])
      .toStrictEqual([ state, rules, 2 ]);
  });

  it('raises a right click with the cell and the newest event under it, to every listener until it stops', () =>
  {
    // Arrange.
    const renderer = buildRenderer();
    const heard: MapContextMenu[] = [];
    const stop = renderer.onContextMenu(menu => heard.push(menu));

    // Act.
    renderer.rightClick({ x: 10, y: 10 });
    renderer.rightClick({ x: 500, y: 5 });
    stop();
    renderer.rightClick({ x: 10, y: 10 });

    // Assert.
    expect(heard)
      .toStrictEqual([
        { point: { x: 10, y: 10 }, cell: { x: 0, y: 0 }, eventId: 5 },
        { point: { x: 500, y: 5 }, cell: null, eventId: null },
      ]);
  });

  it('tells camera listeners of every move until they stop listening', () =>
  {
    // Arrange.
    const renderer = buildRenderer();
    const heard: Camera[] = [];
    const stop = renderer.onCameraChange(camera => heard.push(camera));

    // Act.
    renderer.setCamera({ x: 48, y: 0, zoom: 2 });
    stop();
    renderer.setCamera({ x: 0, y: 0, zoom: 1 });

    // Assert.
    expect(heard)
      .toStrictEqual([ { x: 48, y: 0, zoom: 2 } ]);
  });
});
