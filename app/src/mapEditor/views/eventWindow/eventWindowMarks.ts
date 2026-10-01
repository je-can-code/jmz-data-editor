import { useEffect } from 'react';

/**
 * The marks an event window leaves on the page's performance timeline, for timing how long it takes to open: when its
 * map arrived (from another window's live copy, or the file), and the first frame showing the event. Each is measured
 * from the moment the window began loading, so the second is the window's whole open time as the page knows it.
 */
const EVENT_WINDOW_MARKS = {
  document: 'jmz-event-window-document',
  ready: 'jmz-event-window-ready',
} as const;

/**
 * Leaves a mark once per page, however often the moment comes round.
 * @param {string} name The mark.
 */
const markOnce = (name: string): void =>
{
  if (performance.getEntriesByName(name, 'mark').length === 0)
  {
    performance.mark(name);
  }
};

/**
 * Marks the first frame that shows the event, once it is ready to show: the frame after the event first renders, which
 * is when the author first sees it.
 * @param {boolean} ready Whether the event is on screen.
 */
const useReadyMark = (ready: boolean): void =>
{
  useEffect(() =>
  {
    if (ready === false)
    {
      return undefined;
    }

    const frame = requestAnimationFrame(() => markOnce(EVENT_WINDOW_MARKS.ready));
    return () => cancelAnimationFrame(frame);
  }, [ ready ]);
};

export { EVENT_WINDOW_MARKS, markOnce, useReadyMark };
