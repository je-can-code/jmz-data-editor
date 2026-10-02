import { describe, expect, it } from 'vitest';
import { singleTileBrush } from '../../../../src/mapEditor/core/tools/brush.ts';
import { PaintState } from '../../../../src/mapEditor/core/tools/PaintState.ts';
import { followToolInHand } from '../../../../src/mapEditor/render/tools/leftButton.ts';

/*
 * Who owns a map view's left button.
 *
 * The event tools and the painting tools both answer the left button, so exactly one of them may at a time, or a click
 * would select an event and paint a tile at once. The tool in hand decides: the event tools answer while the events are
 * in hand, and stand down for every painting tool. They hear only when that changes, since standing down drops any drag
 * they hold, and a new brush or layer must never do that.
 */
describe('followToolInHand', () =>
{
  /**
   * Builds the event tools' stand-in, recording every call.
   * @returns {{ setEnabled: (enabled: boolean) => void, calls: boolean[] }} The stand-in and its calls.
   */
  const recordingTools = () =>
  {
    const calls: boolean[] = [];
    return { setEnabled: (enabled: boolean) => calls.push(enabled), calls };
  };

  it('hands the left button to the event tools with the events in hand, and takes it back for a painting tool', () =>
  {
    // Arrange: a window starting with the events in hand.
    const painting = new PaintState();
    const tools = recordingTools();

    // Act: followed, then the pen, then the events again.
    followToolInHand(painting, tools);
    painting.setTool('pen');
    painting.setTool('events');

    // Assert.
    expect(tools.calls)
      .toEqual([ true, false, true ]);
  });

  it('tells the event tools nothing for a new brush, a new layer or another painting tool', () =>
  {
    // Arrange: the pen in hand.
    const painting = new PaintState();
    painting.setTool('pen');
    const tools = recordingTools();
    followToolInHand(painting, tools);

    // Act.
    painting.setBrush(singleTileBrush(10));
    painting.setStrip(2);
    painting.setTool('fill');

    // Assert: only the first word, standing them down.
    expect(tools.calls)
      .toEqual([ false ]);
  });

  it('stops following once let go', () =>
  {
    // Arrange.
    const painting = new PaintState();
    const tools = recordingTools();
    const stop = followToolInHand(painting, tools);

    // Act.
    stop();
    painting.setTool('pen');

    // Assert.
    expect(tools.calls)
      .toEqual([ true ]);
  });
});
