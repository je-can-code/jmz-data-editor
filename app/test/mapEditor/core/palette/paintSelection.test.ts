import { describe, expect, it } from 'vitest';
import {
  EMPTY_BRUSH,
  LAYER_STRIP,
  PaintSelection,
  sameBrush,
  shadowBrush,
  stepLayerChoice,
  WheelStepper,
  type PaintSelectionState,
  type PaletteBrush,
} from '../../../../src/mapEditor/core/palette/paintSelection.ts';

/*
 * The paint selection: the palette's and the layer strip's one output.
 *
 * The painting tools read the brush and the layer from here and subscribe to changes, so the contract is exactly what
 * a listener sees: every real change replaces the state and tells every listener once, and a change that changes
 * nothing (the same brush chosen again, the layer already chosen) tells no one, so a tool never redraws a ghost for
 * nothing. The layer is the layering service's own choice ('auto', or tile layers 0 to 3), and Shift with the wheel
 * steps along the strip one notch at a time, stopping at its ends.
 */
const brushOf = (ids: number[], width = ids.length, height = 1, tilesetId = 12): PaletteBrush =>
{
  return { kind: 'tiles', tilesetId, width, height, ids };
};

describe('EMPTY_BRUSH', () =>
{
  it('has no cells, so it paints nothing', () =>
  {
    // Arrange: nothing to set up; this is what the palette hands out before a choice.

    // Act.
    const { width, height, ids } = EMPTY_BRUSH;

    // Assert.
    expect([ width, height, ids ])
      .toStrictEqual([ 0, 0, [] ]);
  });
});

describe('shadowBrush', () =>
{
  it('is one cell shadowing all four quarters, on the tileset on show', () =>
  {
    // Arrange.

    // Act.
    const brush = shadowBrush(12);

    // Assert.
    expect(brush)
      .toStrictEqual({ kind: 'shadows', tilesetId: 12, width: 1, height: 1, ids: [ 15 ] });
  });
});

describe('sameBrush', () =>
{
  it('matches two brushes built apart that paint the same', () =>
  {
    // Arrange.
    const left = brushOf([ 1, 2 ]);
    const right = brushOf([ 1, 2 ]);

    // Act.
    const same = sameBrush(left, right);

    // Assert.
    expect(same)
      .toBe(true);
  });

  it('tells apart brushes differing only in one id, the tileset, the kind, or the shape of the same ids', () =>
  {
    // Arrange.
    const base = brushOf([ 1, 2 ]);
    const others: PaletteBrush[] = [
      brushOf([ 1, 3 ]),
      brushOf([ 1, 2 ], 2, 1, 13),
      { ...base, kind: 'regions' },
      brushOf([ 1, 2 ], 1, 2),
    ];

    // Act.
    const matches = others.map(other => sameBrush(base, other));

    // Assert.
    expect(matches)
      .toStrictEqual([ false, false, false, false ]);
  });
});

describe('stepLayerChoice', () =>
{
  it('steps along the strip from automatic towards layer 4', () =>
  {
    // Arrange.

    // Act.
    const steps = [ stepLayerChoice('auto', 1), stepLayerChoice(0, 2), stepLayerChoice(2, -1), stepLayerChoice(0, -1) ];

    // Assert.
    expect(steps)
      .toStrictEqual([ 0, 2, 1, 'auto' ]);
  });

  it('stops at either end instead of wrapping round', () =>
  {
    // Arrange.

    // Act.
    const steps = [ stepLayerChoice(3, 1), stepLayerChoice('auto', -1), stepLayerChoice(1, 9) ];

    // Assert.
    expect(steps)
      .toStrictEqual([ 3, 'auto', 3 ]);
  });

  it('takes a part of a step as no step', () =>
  {
    // Arrange.

    // Act.
    const step = stepLayerChoice(1, 0.9);

    // Assert.
    expect(step)
      .toBe(1);
  });

  it('lists the strip as automatic, then layers 1 to 4', () =>
  {
    // Arrange: nothing to set up.

    // Act.
    const strip = [ ...LAYER_STRIP ];

    // Assert.
    expect(strip)
      .toStrictEqual([ 'auto', 0, 1, 2, 3 ]);
  });
});

describe('WheelStepper', () =>
{
  it('steps once per notch, however many pixels the browser calls a notch', () =>
  {
    // Arrange.
    const stepper = new WheelStepper();

    // Act: a 100-pixel notch down, a 120-pixel notch up, then three lines down (48 pixels).
    const steps = [ stepper.step(100, 0, 0), stepper.step(-120, 0, 0), stepper.step(3, 0, 1) ];

    // Assert.
    expect(steps)
      .toStrictEqual([ 1, -1, 1 ]);
  });

  it('gathers a touchpad\'s small movements into one step', () =>
  {
    // Arrange.
    const stepper = new WheelStepper();

    // Act: four ten-pixel movements.
    const steps = [ 10, 10, 10, 10 ].map(delta => stepper.step(delta, 0, 0));

    // Assert.
    expect(steps)
      .toStrictEqual([ 0, 0, 0, 1 ]);
  });

  it('starts afresh when the wheel turns back the other way', () =>
  {
    // Arrange.
    const stepper = new WheelStepper();

    // Act: thirty pixels down, then thirty up, then thirty up again.
    const steps = [ stepper.step(30, 0, 0), stepper.step(-30, 0, 0), stepper.step(-30, 0, 0) ];

    // Assert: turning back drops the thirty gathered downwards, and the two movements up then add up to a step.
    expect(steps)
      .toStrictEqual([ 0, 0, -1 ]);
  });

  it('reads sideways movement when there is no vertical movement, as Shift makes some browsers send', () =>
  {
    // Arrange.
    const stepper = new WheelStepper();

    // Act.
    const step = stepper.step(0, 100, 0);

    // Assert.
    expect(step)
      .toBe(1);
  });

  it('keeps what it gathered through an event with no movement', () =>
  {
    // Arrange.
    const stepper = new WheelStepper();

    // Act: thirty pixels, nothing, then ten more.
    const steps = [ stepper.step(30, 0, 0), stepper.step(0, 0, 0), stepper.step(10, 0, 0) ];

    // Assert.
    expect(steps)
      .toStrictEqual([ 0, 0, 1 ]);
  });
});

describe('PaintSelection', () =>
{
  /**
   * A selection with a listener recording every state it hears.
   * @returns {{ selection: PaintSelection, heard: PaintSelectionState[], stop: () => void }} The selection, what it
   * told the listener, and how to stop listening.
   */
  const listening = () =>
  {
    const selection = new PaintSelection();
    const heard: PaintSelectionState[] = [];
    const stop = selection.subscribe(state => heard.push(state));
    return { selection, heard, stop };
  };

  it('starts with the empty brush and automatic layering', () =>
  {
    // Arrange.
    const selection = new PaintSelection();

    // Act.
    const state = selection.getState();

    // Assert.
    expect([ state.brush, state.layer, selection.brush, selection.layer ])
      .toStrictEqual([ EMPTY_BRUSH, 'auto', EMPTY_BRUSH, 'auto' ]);
  });

  it('tells every listener about a new brush, with a new state', () =>
  {
    // Arrange.
    const { selection, heard } = listening();
    const before = selection.getState();
    const brush = brushOf([ 2048 ]);

    // Act.
    selection.setBrush(brush);

    // Assert.
    expect([ heard.length, heard[0].brush, heard[0].layer, selection.getState() === before ])
      .toStrictEqual([ 1, brush, 'auto', false ]);
  });

  it('tells no one when the brush chosen paints what the current one paints', () =>
  {
    // Arrange: the same brush, built twice.
    const { selection, heard } = listening();
    selection.setBrush(brushOf([ 2048, 2049 ]));

    // Act.
    selection.setBrush(brushOf([ 2048, 2049 ]));

    // Assert: only the first choice was heard.
    expect(heard.length)
      .toBe(1);
  });

  it('tells every listener about a new layer, keeping the brush', () =>
  {
    // Arrange.
    const { selection, heard } = listening();
    const brush = brushOf([ 5 ]);
    selection.setBrush(brush);

    // Act.
    selection.setLayer(2);

    // Assert.
    expect([ heard.length, heard[1].layer, heard[1].brush, selection.layer ])
      .toStrictEqual([ 2, 2, brush, 2 ]);
  });

  it('tells no one when the layer chosen is the one already chosen', () =>
  {
    // Arrange.
    const { selection, heard } = listening();

    // Act.
    selection.setLayer('auto');

    // Assert.
    expect(heard)
      .toStrictEqual([]);
  });

  it('steps the layer along the strip, telling listeners only when it moves', () =>
  {
    // Arrange: on layer 4 already.
    const { selection, heard } = listening();
    selection.setLayer(3);

    // Act: one step past the end, then two back.
    selection.stepLayer(1);
    selection.stepLayer(-2);

    // Assert.
    expect(heard.map(state => state.layer))
      .toStrictEqual([ 3, 1 ]);
  });

  it('stops telling a listener once it stops listening', () =>
  {
    // Arrange.
    const { selection, heard, stop } = listening();

    // Act.
    stop();
    selection.setLayer(1);

    // Assert: the change happened, unheard.
    expect([ heard, selection.layer ])
      .toStrictEqual([ [], 1 ]);
  });
});
