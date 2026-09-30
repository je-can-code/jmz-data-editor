import { describe, expect, it } from 'vitest';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { INITIAL_PAINT_SETTINGS, PaintState, type PaintSettings } from '../../../../src/mapEditor/core/tools/PaintState.ts';

/*
 * The window's painting settings.
 *
 * Every map view in a window paints with one tool, one brush and one layer choice, so picking a tile once serves every
 * map on screen, and each view hears every change. A layer picked on the strip also becomes the one the override key
 * paints, so after switching back to automatic layering that layer stays a held key away; until one is picked the
 * override paints layer 3. A change that changes nothing tells nobody.
 */
describe('PaintState', () =>
{
  it('starts with the pen, nothing picked, automatic layering, and layer 3 for the override', () =>
  {
    // Arrange: nothing beyond a fresh state.
    const state = new PaintState();

    // Act.
    const { settings } = state;

    // Assert.
    expect(settings)
      .toEqual({ tool: 'pen', brush: null, strip: 'auto', overrideLayer: 2 });
  });

  it('tells every listener each change, with the settings after it', () =>
  {
    // Arrange.
    const state = new PaintState();
    const heard: PaintSettings[] = [];
    state.subscribe(settings => heard.push(settings));
    const brush = singleTileBrush(10);

    // Act.
    state.setTool('fill');
    state.setBrush(brush);

    // Assert.
    expect(heard)
      .toEqual([ { ...INITIAL_PAINT_SETTINGS, tool: 'fill' }, { ...INITIAL_PAINT_SETTINGS, tool: 'fill', brush } ]);
  });

  it('makes a layer picked on the strip the override\'s layer, and keeps it after going back to automatic', () =>
  {
    // Arrange.
    const state = new PaintState();

    // Act.
    state.setStrip(0);
    state.setStrip('auto');

    // Assert.
    expect([ state.settings.strip, state.settings.overrideLayer ])
      .toEqual([ 'auto', 0 ]);
  });

  it('sets the override\'s layer on its own, leaving the strip', () =>
  {
    // Arrange.
    const state = new PaintState();

    // Act.
    state.setOverrideLayer(3);

    // Assert.
    expect([ state.settings.strip, state.settings.overrideLayer ])
      .toEqual([ 'auto', 3 ]);
  });

  it('tells nobody about a change that changes nothing, and stops telling a listener that left', () =>
  {
    // Arrange.
    const state = new PaintState();
    let heard = 0;
    const stop = state.subscribe(() =>
    {
      heard += 1;
    });

    // Act: the pen again, then a real change after the listener has gone.
    state.setTool('pen');
    stop();
    state.setTool('eraser');

    // Assert.
    expect([ heard, state.settings.tool ])
      .toEqual([ 0, 'eraser' ]);
  });
});
