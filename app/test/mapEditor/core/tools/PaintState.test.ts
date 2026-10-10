import { describe, expect, it } from 'vitest';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { INITIAL_PAINT_SETTINGS, isPaintingTool, PAINT_TOOLS, PaintState, type PaintSettings, type StampFit } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { stampOf } from '../../support/stampFixtures.ts';

/*
 * The window's painting settings.
 *
 * Every map view in a window paints with one tool, one brush, one layer choice and one stamp, so picking a tile or a
 * stamp once serves every map on screen, and each view hears every change. A window starts with the events in hand,
 * so the left button works on events, as it does with no painting tool picked, and every other tool paints. A layer
 * picked on the strip also becomes the one the override key paints, so after switching back to automatic layering that
 * layer stays a held key away; until one is picked the override paints layer 3. Taking up a stamp makes the stamp tool
 * the tool, and putting it down goes back to whichever tool was in hand before it, however the stamp tool was taken up;
 * the stamp stays picked. A blueprint is taken up the same way, as its stamp, with which blueprint it is and its name,
 * which follows a rename; a plain stamp taken up after it is no blueprint. A brush whose stamp depends on the map it
 * lands on takes it up with its fit, which only that stamp keeps: a stamp or a blueprint taken up after it has none. A
 * change that changes nothing tells nobody.
 */
describe('PaintState', () =>
{
  it('starts with the events in hand, nothing picked, automatic layering, layer 3 for the override and no stamp', () =>
  {
    // Arrange: nothing beyond a fresh state.
    const state = new PaintState();

    // Act.
    const { settings } = state;

    // Assert.
    expect(settings)
      .toStrictEqual({ tool: 'events', brush: null, strip: 'auto', overrideLayer: 2, stamp: null, blueprint: null, fit: null });
  });

  it('takes up a stamp with the fit its brush gives, and a plain stamp or a blueprint after it with none', () =>
  {
    // Arrange: a brush's stamp and its fit, a plain stamp, and a blueprint.
    const state = new PaintState();
    const fitted = stampOf({ id: 'test:1' });
    const fit: StampFit = () => ({ stamp: fitted, words: 'Level 12 · this map\'s setting' });

    // Act.
    state.takeUpStamp(fitted, fit);
    const brushed = state.settings.fit;
    state.takeUpStamp(stampOf({ id: 'test:2' }));
    const plain = state.settings.fit;
    state.takeUpStamp(fitted, fit);
    state.takeUpBlueprint({ id: 'k3x9q2mf', name: 'Goblin', stamp: stampOf({ id: 'blueprint:k3x9q2mf' }) });

    // Assert.
    expect([ brushed, plain, state.settings.fit, state.settings.stamp?.id ])
      .toStrictEqual([ fit, null, null, 'blueprint:k3x9q2mf' ]);
  });

  it('counts every tool but the events as painting', () =>
  {
    // Arrange: every tool the bar offers.
    const tools = PAINT_TOOLS;

    // Act.
    const painting = tools.filter(isPaintingTool);

    // Assert.
    expect(painting)
      .toEqual([ 'pen', 'rectangle', 'ellipse', 'fill', 'eraser', 'eyedropper', 'select', 'swap', 'stamp' ]);
  });

  it('takes up a stamp as the tool, and puts it down back to the tool held before, keeping the stamp picked', () =>
  {
    // Arrange: the pen in hand.
    const state = new PaintState();
    state.setTool('pen');
    const stamp = stampOf();

    // Act.
    state.takeUpStamp(stamp);
    const taken = { ...state.settings };
    state.putDownStamp();

    // Assert.
    expect([ taken.tool, taken.stamp, state.settings.tool, state.settings.stamp ])
      .toEqual([ 'stamp', stamp, 'pen', stamp ]);
  });

  it('remembers the tool held before the stamp tool however it was taken up, and keeps it while stamps change', () =>
  {
    // Arrange: the select tool in hand, then the stamp tool taken up from the tool bar, then another stamp picked.
    const state = new PaintState();
    state.takeUpStamp(stampOf({ id: 'test:1' }));
    state.putDownStamp();
    state.setTool('select');
    state.setTool('stamp');
    state.takeUpStamp(stampOf({ id: 'test:2' }));

    // Act.
    state.putDownStamp();

    // Assert.
    expect([ state.settings.tool, state.settings.stamp?.id ])
      .toEqual([ 'select', 'test:2' ]);
  });

  it('takes up a blueprint\'s stamp as a blueprint, and a plain stamp after it as no blueprint', () =>
  {
    // Arrange: the pen in hand.
    const state = new PaintState({ ...INITIAL_PAINT_SETTINGS, tool: 'pen' });
    const stamp = stampOf({ id: 'blueprint:k3x9q2mf' });

    // Act.
    state.takeUpBlueprint({ id: 'k3x9q2mf', name: 'Goblin', stamp });
    const taken = { ...state.settings };
    state.takeUpStamp(stampOf({ id: 'test:2' }));

    // Assert.
    expect([ taken.tool, taken.stamp, taken.blueprint, state.settings.stamp?.id, state.settings.blueprint ])
      .toEqual([ 'stamp', stamp, { id: 'k3x9q2mf', name: 'Goblin' }, 'test:2', null ]);
  });

  it('follows the new name of the blueprint picked, and of no other, leaving the tool as it is', () =>
  {
    // Arrange: a blueprint picked, then put down to the pen, so it stays picked with another tool in hand.
    const state = new PaintState({ ...INITIAL_PAINT_SETTINGS, tool: 'pen' });
    state.takeUpBlueprint({ id: 'k3x9q2mf', name: 'Goblin', stamp: stampOf() });
    state.putDownStamp();
    let heard = 0;
    state.subscribe(() =>
    {
      heard += 1;
    });

    // Act.
    state.renameBlueprint('aa22', 'Bat');
    const afterOther = heard;
    state.renameBlueprint('k3x9q2mf', 'Goblin chief');

    // Assert.
    expect([ afterOther, heard, state.settings.blueprint, state.settings.tool ])
      .toEqual([ 0, 1, { id: 'k3x9q2mf', name: 'Goblin chief' }, 'pen' ]);
  });

  it('leaves the tool in hand alone when the stamp is put down while another tool is in hand', () =>
  {
    // Arrange: a stamp picked, then the fill taken up instead.
    const state = new PaintState();
    state.takeUpStamp(stampOf());
    state.setTool('fill');
    let heard = 0;
    state.subscribe(() =>
    {
      heard += 1;
    });

    // Act.
    state.putDownStamp();

    // Assert.
    expect([ state.settings.tool, heard ])
      .toEqual([ 'fill', 0 ]);
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

    // Act: the events again, then a real change after the listener has gone.
    state.setTool('events');
    stop();
    state.setTool('eraser');

    // Assert.
    expect([ heard, state.settings.tool ])
      .toEqual([ 0, 'eraser' ]);
  });
});
