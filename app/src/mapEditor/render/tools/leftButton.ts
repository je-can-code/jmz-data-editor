import { isPaintingTool, type PaintState } from '../../core/tools/PaintState.ts';

/**
 * What can be stood down while the painting tools own the left button: the map's event tools.
 */
type StandDown = {
  setEnabled(enabled: boolean): void;
};

/**
 * Hands a map view's left button to whichever tools the tool in hand belongs to: the event tools while the events are
 * in hand, and the painting tools (which stand down by themselves) with any other tool. The event tools hear only when
 * that changes, never for a new brush or layer.
 * @param {PaintState} painting The window's painting settings.
 * @param {StandDown} events The view's event tools.
 * @returns {() => void} Stops following.
 */
const followToolInHand = (painting: PaintState, events: StandDown): (() => void) =>
{
  let enabled: boolean | null = null;
  const follow = () =>
  {
    // the event tools answer the left button exactly while no painting tool is in hand.
    const next = isPaintingTool(painting.settings.tool) === false;
    if (next !== enabled)
    {
      enabled = next;
      events.setEnabled(next);
    }
  };

  follow();
  return painting.subscribe(follow);
};

export { followToolInHand };
export type { StandDown };
